package main

import (
	"bytes" // Added for bytes.Equal
	"encoding/json"
	"fmt"
	"log"
	"net"
	"sync"
	"time"

	"go.bug.st/serial" // Make sure you have this dependency: go get go.bug.st/serial
)

// CommandType represents the type of command
type CommandType string

const (
	// Command types
	SetLights        CommandType = "SET_LIGHTS"
	Discover         CommandType = "DISCOVER"
	DiscoverResponse CommandType = "DISCOVER_RESPONSE"

	// Configuration Constants
	udpPort           = 41234
	defaultSerialPath = "/dev/ttyUSB0" // Adjusted common path, change if needed
	baudRate          = 115200
	ledCount          = 300        // Fixed number of LEDs as per requirement
	bytesPerLED       = 3          // RGB
	commandExpiryMs   = int64(2)   // Commands expire after 50ms (Adjust as needed)
	ackTimeoutMs      = int64(100) // 1 second timeout for ACK (Adjust as needed)
	ackByte           = byte(0xaa) // Acknowledge byte from Arduino
)

// Command represents a generic command
type Command struct {
	Type    CommandType     `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// SetLightsPayload represents the payload for SET_LIGHTS command
// Assumes Lights will always contain exactly ledCount (300) items
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
	ledBuffer         []byte     // *** OPTIMIZATION: Reusable buffer for LED data ***
	mu                sync.Mutex // Protects shared state below
	// Constants stored in struct for convenience
	commandExpiryMs int64
	ledCount        int
	bytesPerLED     int
	ackByte         byte
	ackTimeoutMs    int64
}

// NewArduinoServer creates a new ArduinoServer
func NewArduinoServer(port int, serialPath string, baud int) (*ArduinoServer, error) {
	server := &ArduinoServer{
		commandQueue:    make([]QueuedCommand, 0, 20), // Pre-allocate queue capacity
		commandExpiryMs: commandExpiryMs,
		ledCount:        ledCount,
		bytesPerLED:     bytesPerLED,
		ackByte:         ackByte,
		ackTimeoutMs:    ackTimeoutMs,
		// *** OPTIMIZATION: Allocate buffer once ***
		ledBuffer: make([]byte, ledCount*bytesPerLED),
	}

	// Find local IP
	localIP, err := findLocalIP()
	if err != nil {
		return nil, fmt.Errorf("failed to find local IP: %v", err)
	}
	server.localIP = localIP
	log.Printf("Using local IP: %s", server.localIP)

	// Setup UDP server
	addr := &net.UDPAddr{
		Port: port,
		IP:   net.ParseIP("0.0.0.0"),
	}
	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		return nil, fmt.Errorf("failed to start UDP server on port %d: %v", port, err)
	}
	server.udpServer = conn
	log.Printf("UDP Server listening on port %d", port)

	// Connect to serial port
	mode := &serial.Mode{
		BaudRate: baud,
		Parity:   serial.NoParity,
		DataBits: 8,
		StopBits: serial.OneStopBit,
	}
	log.Printf("Attempting to connect to serial port %s at %d baud", serialPath, baud)
	portHandle, err := serial.Open(serialPath, mode)
	if err != nil {
		conn.Close() // Close UDP socket if serial fails
		return nil, fmt.Errorf("failed to open serial port %s: %v", serialPath, err)
	}
	server.serialPort = portHandle
	log.Printf("Connected to Arduino on %s", serialPath)

	// Recommended: Short delay and initial flush after opening serial
	time.Sleep(2 * time.Second)
	err = server.serialPort.ResetInputBuffer()
	if err != nil {
		log.Printf("Warning: Failed to reset serial input buffer: %v", err)
	}
	err = server.serialPort.ResetOutputBuffer()
	if err != nil {
		log.Printf("Warning: Failed to reset serial output buffer: %v", err)
	}

	return server, nil
}

// findLocalIP finds a suitable local IP address (preferring common private ranges)
func findLocalIP() (string, error) {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "", err
	}

	var fallbackIP string
	preferredPrefixes := []string{"192.168.", "10.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31."} // Added more 172 ranges

	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ip := ipnet.IP.To4(); ip != nil {
				ipStr := ip.String()
				// Store the first non-loopback IPv4 as a fallback
				if fallbackIP == "" {
					fallbackIP = ipStr
				}
				// Check for preferred private prefixes
				for _, prefix := range preferredPrefixes {
					if bytes.HasPrefix([]byte(ipStr), []byte(prefix)) {
						return ipStr, nil // Return preferred IP immediately
					}
				}
			}
		}
	}

	if fallbackIP != "" {
		return fallbackIP, nil // Return the first non-loopback if no preferred found
	}

	return "", fmt.Errorf("no suitable non-loopback IPv4 address found")
}

// Start starts the server's listeners
func (s *ArduinoServer) Start() {
	log.Println("Starting server routines...")
	go s.handleUDPMessages()
	go s.handleSerialData()
	// Optional: Start a ticker to periodically check queue health or trigger processing
	// go s.monitorQueue() // Example
}

// handleUDPMessages handles incoming UDP messages in a loop
func (s *ArduinoServer) handleUDPMessages() {
	// Reuse buffer for UDP reads
	buffer := make([]byte, 4096)

	for {
		n, remoteAddr, err := s.udpServer.ReadFromUDP(buffer)
		if err != nil {
			// Check if the error is due to the connection being closed
			if opErr, ok := err.(*net.OpError); ok && opErr.Err.Error() == "use of closed network connection" {
				log.Println("UDP listener closed, exiting handleUDPMessages.")
				return // Exit goroutine if connection is closed
			}
			log.Printf("Error reading UDP: %v", err)
			continue
		}

		message := buffer[:n] // Slice to actual received data length
		// log.Printf("Received %d bytes from %s", n, remoteAddr) // Verbose logging

		// Try to parse as a structured command
		var command Command
		// Use bytes.NewReader for potentially better performance with json decoder
		// jsonDecoder := json.NewDecoder(bytes.NewReader(message))
		// if err := jsonDecoder.Decode(&command); err != nil {
		if err := json.Unmarshal(message, &command); err != nil {
			log.Printf("Error parsing JSON command from %s: %v (data: %s)", remoteAddr, err, string(message))
			continue
		}

		// log.Printf("Received command: %s from %s", command.Type, remoteAddr) // Less verbose log
		switch command.Type {
		case Discover:
			s.handleDiscoverCommand(remoteAddr)
		case SetLights:
			s.queueSetLightsCommand(command, remoteAddr)
		default:
			log.Printf("Unknown command type received: %s from %s", command.Type, remoteAddr)
		}
	}
}

// handleSerialData handles incoming serial data, primarily looking for ACKs
func (s *ArduinoServer) handleSerialData() {
	buffer := make([]byte, 128) // Reuse buffer for serial reads
	for {
		n, err := s.serialPort.Read(buffer)
		if err != nil {
			// Check if the error is due to the port being closed (e.g., during shutdown)
			// Error messages might vary across OS/drivers, "file already closed" or "invalid argument" are common
			if err.Error() == "serial port closed" || err.Error() == "file already closed" || err.Error() == "invalid argument" {
				log.Println("Serial port closed, exiting handleSerialData.")
				return // Exit goroutine
			}
			log.Printf("Error reading serial: %v", err)
			// Optional: Add delay before retrying after error
			time.Sleep(500 * time.Millisecond)
			continue
		}

		if n > 0 {
			data := buffer[:n]
			// log.Printf("Received serial data: %v", data) // Verbose

			// Check for ACK byte within received data
			ackFoundInBatch := false
			for _, b := range data {
				if b == s.ackByte {
					s.mu.Lock()
					// Only process ACK if we are actively waiting for one
					if s.isWaitingForAck {
						//log.Println("Received ACK from Arduino")
						s.ackReceived = true // Mark received
						// *** REFACTOR: Use helper to cleanup state and queue ***
						s.finishCurrentCommandAndProcessNext_locked()
						ackFoundInBatch = true // Mark that we need to trigger next processing
						s.mu.Unlock()
						break // Assume one ACK is sufficient per command sent
					} else {
						// log.Printf("Received unexpected ACK byte 0x%x", b)
						s.mu.Unlock() // Release lock if not waiting
					}
				}
			}

			// If ACK was processed, trigger check for the next command *after* releasing lock
			if ackFoundInBatch {
				go s.processNextCommand()
			}
		}
	}
}

// handleDiscoverCommand handles the DISCOVER command
func (s *ArduinoServer) handleDiscoverCommand(remoteAddr *net.UDPAddr) {
	// log.Println("Received discovery command")
	s.sendIPResponse(remoteAddr)
}

// sendIPResponse sends the discovery response back to the client
func (s *ArduinoServer) sendIPResponse(remoteAddr *net.UDPAddr) {
	payload := DiscoverResponsePayload{
		IP:              s.localIP,
		DeviceType:      "Arduino LED Controller Go",
		FirmwareVersion: "1.1.0-opt", // Indicate optimized version
	}
	// Marshal payload first
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		log.Printf("Error marshaling discovery payload: %v", err)
		return
	}

	// Wrap in generic Command structure
	response := Command{
		Type:    DiscoverResponse,
		Payload: json.RawMessage(payloadBytes), // Assign marshaled payload
	}

	// Marshal the final command
	responseBytes, err := json.Marshal(response)
	if err != nil {
		log.Printf("Error marshaling discovery response command: %v", err)
		return
	}

	// Send response back to the original sender
	_, err = s.udpServer.WriteToUDP(responseBytes, remoteAddr)
	if err != nil {
		log.Printf("Error sending discovery response to %s: %v", remoteAddr, err)
	} else {
		// log.Printf("Sent discovery response to %s", remoteAddr)
	}
}

// queueSetLightsCommand adds a SET_LIGHTS command to the processing queue
func (s *ArduinoServer) queueSetLightsCommand(command Command, remoteAddr *net.UDPAddr) {
	// log.Println("Queueing set lights command")

	s.mu.Lock()
	s.commandQueue = append(s.commandQueue, QueuedCommand{
		Command:   command,
		Timestamp: time.Now(),
	})
	shouldStartProcessing := !s.isProcessingQueue && !s.isWaitingForAck
	s.mu.Unlock()

	// log.Printf("Command queue length: %d", queueLen)

	// If nothing is currently being processed or waiting for ACK, start processing
	if shouldStartProcessing {
		go s.processNextCommand()
	}
}

// processNextCommand checks the queue and processes the next valid command
func (s *ArduinoServer) processNextCommand() {
	s.mu.Lock()

	// If queue is empty, or we are already sending/waiting for ACK, do nothing
	if len(s.commandQueue) == 0 || s.isProcessingQueue || s.isWaitingForAck {
		s.mu.Unlock()
		return
	}

	// *** OPTIMIZATION: Efficiently check for and remove expired commands ***
	now := time.Now()
	firstValidIndex := 0
	for i, item := range s.commandQueue {
		age := now.Sub(item.Timestamp).Milliseconds()
		if age <= s.commandExpiryMs {
			// Found the first non-expired command
			break
		}
		// Command is expired
		// log.Printf("Removing expired command (age: %dms)", age)
		firstValidIndex = i + 1
	}

	// Reslice the queue to remove expired commands from the front
	if firstValidIndex > 0 {
		if firstValidIndex >= len(s.commandQueue) {
			// All commands expired
			s.commandQueue = s.commandQueue[:0] // Clear queue efficiently
		} else {
			// Slice includes elements from firstValidIndex onwards
			s.commandQueue = s.commandQueue[firstValidIndex:]
		}
	}
	// *** End Optimization ***

	// If queue is now empty after removing expired items, stop
	if len(s.commandQueue) == 0 {
		s.isProcessingQueue = false // Ensure state is correct
		s.mu.Unlock()
		return
	}

	// Mark as processing *before* unlocking, grab command details
	s.isProcessingQueue = true
	commandToProcess := s.commandQueue[0]
	s.mu.Unlock() // Release lock *before* potentially long-running handler

	// Process the command (contains serial write and ACK logic)
	s.handleSetLightsCommand(commandToProcess.Command)
}

// handleSetLightsCommand processes the SET_LIGHTS command, sends data, handles ACK
func (s *ArduinoServer) handleSetLightsCommand(command Command) {
	// log.Println("Processing set lights command")

	var payload SetLightsPayload
	if err := json.Unmarshal(command.Payload, &payload); err != nil {
		log.Printf("Error parsing SET_LIGHTS payload: %v", err)
		s.cleanupAndProcessNext() // Use public wrapper to clean up this failed command
		return
	}

	// --- Sanity check based on requirement ---
	if len(payload.Lights) != s.ledCount {
		log.Printf("Error: Expected %d lights in payload, but got %d. Dropping command.", s.ledCount, len(payload.Lights))
		s.cleanupAndProcessNext() // Clean up this invalid command
		return
	}
	// --- End Sanity Check ---

	// --- OPTIMIZATION: Use pre-allocated buffer ---
	// ledBuffer := s.ledBuffer[:s.ledCount*s.bytesPerLED] // Reslice to correct length (already correct size)
	ledBuffer := s.ledBuffer // Can use directly if always full size

	// Fill the buffer - assumes payload.Lights is exactly s.ledCount long
	for i := 0; i < s.ledCount; i++ {
		light := payload.Lights[i] // Direct access safe due to check above
		offset := i * s.bytesPerLED
		ledBuffer[offset] = byte(light.R)
		ledBuffer[offset+1] = byte(light.G)
		ledBuffer[offset+2] = byte(light.B)
	}
	// --- End Optimization ---

	// --- REFACTOR: Setup ACK Wait ---
	s.mu.Lock()
	if !s.setupAckWait_locked() {
		// This indicates a logical error - we shouldn't be here if already waiting.
		s.mu.Unlock()
		log.Println("CRITICAL ERROR: Attempted to process command while already waiting for ACK. Check logic.")
		// Don't trigger next command processing here, as the state is inconsistent.
		// Might need a more robust recovery mechanism or just let the existing wait timeout.
		return
	}
	s.mu.Unlock() // Unlock *after* successfully setting up wait state

	// --- Send data to Arduino ---
	// log.Printf("Sending %d bytes of LED data to Arduino", len(ledBuffer))
	_, err := s.serialPort.Write(ledBuffer)
	if err != nil {
		log.Printf("Error writing to serial port: %v", err)
		s.mu.Lock()
		// Failed to write, so cancel the ACK wait we just set up
		s.cancelAckWait_locked()
		// Clean up the state as if the command failed
		s.finishCurrentCommandAndProcessNext_locked()
		s.mu.Unlock()
		// Trigger processing for the *next* command
		go s.processNextCommand()
	} else {
		// log.Printf("Sent %d bytes of LED data to Arduino, waiting for ACK...", len(ledBuffer))
		// ACK wait is running, do nothing here, handled by handleSerialData or handleAckTimeout
	}
}

// --- Refactored Helper Functions ---

// setupAckWait_locked prepares the state for waiting for an ACK.
// MUST be called with the mutex held. Returns true on success.
func (s *ArduinoServer) setupAckWait_locked() bool {
	if s.isWaitingForAck {
		return false // Should not happen if called correctly
	}
	s.ackReceived = false
	s.isWaitingForAck = true

	// Stop previous timer just in case (should be nil if logic is correct)
	if s.ackTimeout != nil {
		s.ackTimeout.Stop()
	}
	// Start new timeout timer
	s.ackTimeout = time.AfterFunc(time.Duration(s.ackTimeoutMs)*time.Millisecond, s.handleAckTimeout)
	return true
}

// handleAckTimeout is called by the time.AfterFunc timer when ACK times out.
func (s *ArduinoServer) handleAckTimeout() {
	s.mu.Lock()
	// Only act if we were still waiting for ACK and haven't received it
	if s.isWaitingForAck && !s.ackReceived {
		log.Println("ACK timeout - no response from Arduino")
		// Clean up state and remove the command that timed out
		s.finishCurrentCommandAndProcessNext_locked()
		s.mu.Unlock()
		// Trigger check for next command *after* releasing lock
		go s.processNextCommand()
	} else {
		// Timeout is irrelevant now (ACK received or state changed)
		s.mu.Unlock()
	}
}

// cancelAckWait_locked stops the ACK timer and resets waiting state.
// Useful if the serial write fails before ACK could arrive.
// MUST be called with the mutex held.
func (s *ArduinoServer) cancelAckWait_locked() {
	if s.ackTimeout != nil {
		s.ackTimeout.Stop()
		s.ackTimeout = nil
	}
	s.isWaitingForAck = false
	s.ackReceived = false
}

// finishCurrentCommandAndProcessNext_locked cleans up state after a command finishes
// (either successfully via ACK, or via timeout/error).
// It removes the command from the queue and resets processing flags.
// MUST be called with the mutex held.
func (s *ArduinoServer) finishCurrentCommandAndProcessNext_locked() {
	// Stop timer if it's still running
	s.cancelAckWait_locked() // Combines timer stop and flag reset

	// Remove the command that just finished from the front of the queue
	if len(s.commandQueue) > 0 {
		s.commandQueue = s.commandQueue[1:]
	}
	// Mark that we are no longer processing this command
	s.isProcessingQueue = false
}

// cleanupAndProcessNext is a public wrapper used when a command fails
// *before* ACK waiting begins (e.g., parse error, invalid payload).
// Acquires lock, cleans up, releases lock, triggers next processing.
func (s *ArduinoServer) cleanupAndProcessNext() {
	s.mu.Lock()
	// We weren't waiting for ACK yet, just need to remove the command and reset processing flag
	if len(s.commandQueue) > 0 {
		s.commandQueue = s.commandQueue[1:]
	}
	s.isProcessingQueue = false
	s.mu.Unlock()
	// Trigger check for next command
	go s.processNextCommand()
}

// Close cleans up resources
func (s *ArduinoServer) Close() error {
	log.Println("Closing server resources...")
	var firstErr error
	if s.udpServer != nil {
		log.Println("Closing UDP socket...")
		err := s.udpServer.Close()
		if err != nil {
			log.Printf("Error closing UDP socket: %v", err)
			firstErr = err
		}
	}
	if s.serialPort != nil {
		log.Println("Closing serial port...")
		err := s.serialPort.Close()
		if err != nil {
			log.Printf("Error closing serial port: %v", err)
			if firstErr == nil {
				firstErr = err
			}
		}
	}
	// Stop any pending ACK timer
	s.mu.Lock()
	if s.ackTimeout != nil {
		s.ackTimeout.Stop()
	}
	s.mu.Unlock()
	log.Println("Server resources closed.")
	return firstErr
}

// --- Main Function ---
func main() {
	log.Println("Starting Arduino LED Controller...")

	// Use constants defined at the top
	serialPortPath := defaultSerialPath
	// TODO: Consider command-line flags for serial port if needed
	// e.g., flag.StringVar(&serialPortPath, "serial", defaultSerialPath, "Path to Arduino serial port")
	// flag.Parse()

	// Create the server instance
	server, err := NewArduinoServer(udpPort, serialPortPath, baudRate)
	if err != nil {
		log.Fatalf("Failed to create server: %v", err)
	}

	// Defer closing resources
	defer func() {
		if err := server.Close(); err != nil {
			log.Printf("Error during server close: %v", err)
		}
	}()

	// Start the server's listening goroutines
	server.Start()

	log.Println("Server started successfully. Running until interrupted (Ctrl+C)...")
	// Keep the main thread alive indefinitely
	// Could replace with signal handling for graceful shutdown
	select {}
}
