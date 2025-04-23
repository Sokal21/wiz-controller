package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"sync"
	"time"

	"go.bug.st/serial"
)

// CommandType represents the type of command
type CommandType string

const (
	// Command types
	SetLights        CommandType = "SET_LIGHTS"
	Discover         CommandType = "DISCOVER"
	DiscoverResponse CommandType = "DISCOVER_RESPONSE"
)

// Command represents a generic command
type Command struct {
	Type    CommandType     `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// SetLightsPayload represents the payload for SET_LIGHTS command
type SetLightsPayload struct {
	Lights []Light `json:"lights"`
}

// Light represents an RGB light
type Light struct {
	R int `json:"r,omitempty"`
	G int `json:"g,omitempty"`
	B int `json:"b,omitempty"`
}

// DiscoverResponsePayload represents the payload for DISCOVER_RESPONSE command
type DiscoverResponsePayload struct {
	IP              string `json:"ip"`
	DeviceType      string `json:"deviceType"`
	FirmwareVersion string `json:"firmwareVersion"`
}

// QueuedCommand represents a command in the queue
type QueuedCommand struct {
	Command   Command
	Rinfo     *net.UDPAddr
	Timestamp time.Time
}

// ArduinoServer represents the server that communicates with Arduino
type ArduinoServer struct {
	udpServer         *net.UDPConn
	serialPort        serial.Port
	localIP           string
	ackReceived       bool
	ackTimeout        *time.Timer
	isWaitingForAck   bool
	commandQueue      []QueuedCommand
	isProcessingQueue bool
	commandExpiryMs   int64
	ledCount          int
	bytesPerLED       int
	ackByte           byte
	ackTimeoutMs      int64
	mu                sync.Mutex
}

// NewArduinoServer creates a new ArduinoServer
func NewArduinoServer(udpPort int, serialPath string, baudRate int) (*ArduinoServer, error) {
	server := &ArduinoServer{
		commandQueue:    make([]QueuedCommand, 0),
		commandExpiryMs: 2,    // Commands expire after 2ms
		ledCount:        300,  // Total LEDs (2 strips of 150 each)
		bytesPerLED:     3,    // RGB values per LED
		ackByte:         0xaa, // Acknowledge byte from Arduino
		ackTimeoutMs:    5000, // 5 seconds timeout for ACK
	}

	// Find local IP
	localIP, err := findLocalIP()
	if err != nil {
		return nil, fmt.Errorf("failed to find local IP: %v", err)
	}
	server.localIP = localIP

	// Setup UDP server
	addr := &net.UDPAddr{
		Port: udpPort,
		IP:   net.ParseIP("0.0.0.0"),
	}
	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		return nil, fmt.Errorf("failed to start UDP server: %v", err)
	}
	server.udpServer = conn

	// Connect to serial port
	mode := &serial.Mode{
		BaudRate: baudRate,
		Parity:   serial.NoParity,
		DataBits: 8,
		StopBits: serial.OneStopBit,
	}
	port, err := serial.Open(serialPath, mode)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to open serial port: %v", err)
	}
	server.serialPort = port

	return server, nil
}

// findLocalIP finds a suitable local IP address
func findLocalIP() (string, error) {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "", err
	}

	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				ip := ipnet.IP.String()
				// Prefer addresses starting with 192.168 or 10.
				if len(ip) >= 7 && (ip[:7] == "192.168" || ip[:2] == "10.") {
					return ip, nil
				}
			}
		}
	}

	// If no preferred IP found, return the first non-loopback IPv4
	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				return ipnet.IP.String(), nil
			}
		}
	}

	return "", fmt.Errorf("no suitable non-loopback IP address found")
}

// Start starts the server
func (s *ArduinoServer) Start() {
	log.Printf("UDP Server listening on port %d", s.udpServer.LocalAddr().(*net.UDPAddr).Port)
	log.Printf("Connected to Arduino on %s", s.serialPort)
	log.Printf("Server IP: %s", s.localIP)

	// Start handling UDP messages
	go s.handleUDPMessages()

	// Start handling serial data
	go s.handleSerialData()
}

// handleUDPMessages handles incoming UDP messages
func (s *ArduinoServer) handleUDPMessages() {
	buffer := make([]byte, 4096)
	for {
		n, remoteAddr, err := s.udpServer.ReadFromUDP(buffer)
		if err != nil {
			log.Printf("Error reading UDP: %v", err)
			continue
		}

		message := buffer[:n]
		log.Printf("Received message from %s: %s", remoteAddr, string(message))

		// Check if it's a simple "getip" message
		if string(message) == "getip" {
			s.sendIPResponse(remoteAddr)
			continue
		}

		// Try to parse as a command
		var command Command
		if err := json.Unmarshal(message, &command); err != nil {
			log.Printf("Error parsing command: %v", err)
			continue
		}

		switch command.Type {
		case Discover:
			s.handleDiscoverCommand(remoteAddr)
		case SetLights:
			s.queueSetLightsCommand(command, remoteAddr)
		default:
			log.Printf("Unknown command type: %s", command.Type)
		}
	}
}

// handleSerialData handles incoming serial data
func (s *ArduinoServer) handleSerialData() {
	buffer := make([]byte, 128)
	for {
		n, err := s.serialPort.Read(buffer)
		if err != nil {
			log.Printf("Error reading serial: %v", err)
			continue
		}

		data := buffer[:n]
		log.Printf("Received serial data: %v", data)

		// Check for ACK
		for _, b := range data {
			if b == s.ackByte {
				s.mu.Lock()
				s.ackReceived = true
				s.isWaitingForAck = false
				log.Println("Received ACK from Arduino")

				// Clean up
				if s.ackTimeout != nil {
					s.ackTimeout.Stop()
					s.ackTimeout = nil
				}

				// Remove the command from queue and process next command
				if len(s.commandQueue) > 0 {
					s.commandQueue = s.commandQueue[1:]
				}
				s.isProcessingQueue = false
				s.mu.Unlock()

				// Process next command
				go s.processNextCommand()
			}
		}
	}
}

// handleDiscoverCommand handles the DISCOVER command
func (s *ArduinoServer) handleDiscoverCommand(remoteAddr *net.UDPAddr) {
	log.Println("Received discovery command")
	s.sendIPResponse(remoteAddr)
}

// sendIPResponse sends the IP response
func (s *ArduinoServer) sendIPResponse(remoteAddr *net.UDPAddr) {
	response := Command{
		Type: DiscoverResponse,
		Payload: json.RawMessage(fmt.Sprintf(`{
			"ip": "%s",
			"deviceType": "Arduino LED Controller",
			"firmwareVersion": "1.0.0"
		}`, s.localIP)),
	}

	responseBytes, err := json.Marshal(response)
	if err != nil {
		log.Printf("Error marshaling response: %v", err)
		return
	}

	_, err = s.udpServer.WriteToUDP(responseBytes, remoteAddr)
	if err != nil {
		log.Printf("Error sending IP response: %v", err)
	} else {
		log.Printf("Sent discovery response to %s", remoteAddr)
	}
}

// queueSetLightsCommand queues a SET_LIGHTS command
func (s *ArduinoServer) queueSetLightsCommand(command Command, remoteAddr *net.UDPAddr) {
	log.Println("Queueing set lights command")

	s.mu.Lock()
	// Add command to queue with timestamp
	s.commandQueue = append(s.commandQueue, QueuedCommand{
		Command:   command,
		Rinfo:     remoteAddr,
		Timestamp: time.Now(),
	})
	log.Printf("Command queue length: %d", len(s.commandQueue))

	// If not already processing queue, start processing
	if !s.isProcessingQueue {
		s.mu.Unlock()
		s.processNextCommand()
	} else {
		s.mu.Unlock()
	}
}

// processNextCommand processes the next command in the queue
func (s *ArduinoServer) processNextCommand() {
	s.mu.Lock()
	// If queue is empty or already processing, return
	if len(s.commandQueue) == 0 || s.isProcessingQueue {
		s.mu.Unlock()
		return
	}

	// Check for expired commands and remove them
	now := time.Now()
	var validCommands []QueuedCommand
	for _, item := range s.commandQueue {
		age := now.Sub(item.Timestamp).Milliseconds()
		if age > s.commandExpiryMs {
			log.Printf("Removing expired command (age: %dms)", age)
			continue
		}
		validCommands = append(validCommands, item)
	}
	s.commandQueue = validCommands

	// If queue is now empty after removing expired commands, return
	if len(s.commandQueue) == 0 {
		s.isProcessingQueue = false
		s.mu.Unlock()
		return
	}

	s.isProcessingQueue = true
	command := s.commandQueue[0].Command
	rinfo := s.commandQueue[0].Rinfo
	s.mu.Unlock()

	// Process the command
	s.handleSetLightsCommand(command, rinfo)
}

// handleSetLightsCommand handles the SET_LIGHTS command
func (s *ArduinoServer) handleSetLightsCommand(command Command, remoteAddr *net.UDPAddr) {
	log.Println("Processing set lights command")

	// Parse the payload
	var payload SetLightsPayload
	if err := json.Unmarshal(command.Payload, &payload); err != nil {
		log.Printf("Error parsing SET_LIGHTS payload: %v", err)
		s.mu.Lock()
		if len(s.commandQueue) > 0 {
			s.commandQueue = s.commandQueue[1:]
		}
		s.isProcessingQueue = false
		s.mu.Unlock()
		s.processNextCommand()
		return
	}

	// Create a buffer for all LED data
	ledBuffer := make([]byte, s.ledCount*s.bytesPerLED)

	// Fill the buffer with RGB values from the command
	lights := payload.Lights
	for i := 0; i < s.ledCount; i++ {
		lightIndex := i % len(lights) // Reuse lights if there are fewer than LED_COUNT
		light := lights[lightIndex]

		// Set RGB values (default to 0 if not provided)
		ledBuffer[i*s.bytesPerLED] = byte(light.R)
		ledBuffer[i*s.bytesPerLED+1] = byte(light.G)
		ledBuffer[i*s.bytesPerLED+2] = byte(light.B)
	}

	s.mu.Lock()
	// Set up ACK handling
	s.ackReceived = false
	s.isWaitingForAck = true

	// Set up timeout for ACK
	if s.ackTimeout != nil {
		s.ackTimeout.Stop()
	}
	s.ackTimeout = time.AfterFunc(time.Duration(s.ackTimeoutMs)*time.Millisecond, func() {
		s.mu.Lock()
		if !s.ackReceived {
			log.Println("ACK timeout - no response from Arduino")
			s.isWaitingForAck = false
			if len(s.commandQueue) > 0 {
				s.commandQueue = s.commandQueue[1:]
			}
			s.isProcessingQueue = false
			s.mu.Unlock()
			s.processNextCommand()
		} else {
			s.mu.Unlock()
		}
	})
	s.mu.Unlock()

	// Send the LED data to Arduino
	log.Printf("Sending %d bytes of LED data to Arduino", len(ledBuffer))
	_, err := s.serialPort.Write(ledBuffer)
	if err != nil {
		log.Printf("Error writing to serial port: %v", err)
		s.mu.Lock()
		s.isWaitingForAck = false
		if len(s.commandQueue) > 0 {
			s.commandQueue = s.commandQueue[1:]
		}
		s.isProcessingQueue = false
		s.mu.Unlock()
		s.processNextCommand()
	} else {
		log.Printf("Sent %d bytes of LED data to Arduino", len(ledBuffer))
	}
}

// Close closes the server
func (s *ArduinoServer) Close() {
	if s.serialPort != nil {
		s.serialPort.Close()
	}
	if s.udpServer != nil {
		s.udpServer.Close()
	}
	log.Println("Disconnected from Arduino and closed UDP server")
}

func main() {
	// Default values
	udpPort := 41234
	serialPath := "/dev/ttyUSB0"
	baudRate := 115200

	// Create the server
	server, err := NewArduinoServer(udpPort, serialPath, baudRate)
	if err != nil {
		log.Fatalf("Failed to create server: %v", err)
	}
	defer server.Close()

	// Start the server
	server.Start()

	// Keep the main thread alive
	select {}
}
