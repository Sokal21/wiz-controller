package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net"
	"strings"
	"sync"
	"time"

	"go.bug.st/serial" // go get go.bug.st/serial
)

// CommandType represents the type of command
type CommandType string

const (
	// Command types
	Pulse            CommandType = "PULSE"
	Discover         CommandType = "DISCOVER"
	DiscoverResponse CommandType = "DISCOVER_RESPONSE"

	// Configuration Constants
	udpPort             = 41234
	defaultSerialPath   = "/dev/ttyUSB0" // Adjust for your OS
	baudRate            = 115200
	ledCount            = 300
	bytesPerLED         = 3
	stripLength         = 150
	middlePixelStrip1   = 74   // Index (0-149)
	middlePixelStrip2   = 74   // Index (0-149) relative to strip 2 start (absolute: 150 + 74 = 224)
	pulseWidth          = 3    // <<< Width of the pulse (use odd numbers for best symmetry)
	animationFrameRate  = 1000 // Target FPS for CALCULATING frames
	animationIntervalMs = 1000 / animationFrameRate
	ackByte             = byte(0xaa)
	ackTimeoutMs        = int64(250) // ACK timeout for each frame sent

	// Buffer Sizes
	udpBufferSize    = 65535
	serialBufferSize = 128
)

// --- Struct Definitions ---

type Command struct {
	Type    CommandType     `json:"type"`
	Payload json.RawMessage `json:"payload"`
}
type PulsePayload struct {
	R                int     `json:"r"`
	G                int     `json:"g"`
	B                int     `json:"b"`
	PropagationSpeed float64 `json:"propagationSpeed"` // Pixels per millisecond
}
type DiscoverResponsePayload struct {
	IP              string `json:"ip"`
	DeviceType      string `json:"deviceType"`
	FirmwareVersion string `json:"firmwareVersion"`
}
type ActivePulse struct {
	StartTime        time.Time
	ColorR           byte
	ColorG           byte
	ColorB           byte
	PropagationSpeed float64
	ID               int // Simple ID for logging
}

var pulseCounter int // Simple counter for pulse IDs

// ArduinoServer holds the server state
type ArduinoServer struct {
	udpServer  *net.UDPConn
	serialPort serial.Port
	localIP    string
	// --- State Buffers & Animation ---
	ledBuffer       []byte // Represents the *last successfully ACKNOWLEDGED* LED state sent
	desiredLedState []byte // State calculated by animation loop, target for next send
	activePulses    []*ActivePulse
	animationMutex  sync.Mutex // Protects activePulses, desiredLedState
	// --- //
	wg           sync.WaitGroup
	shutdownChan chan struct{}
	// --- ACK Channel ---
	ackChannel chan struct{} // Buffered channel for ACK synchronization
	// --- Configuration ---
	ledCount          int
	bytesPerLED       int
	stripLength       int
	middlePixelStrip1 int
	middlePixelStrip2 int
	animationInterval time.Duration
	ackByte           byte
	ackTimeoutMs      int64
	pulseWidth        int
}

// --- Server Initialization ---

func NewArduinoServer(port int, serialPath string, baud int) (*ArduinoServer, error) {
	if middlePixelStrip1 < 0 || middlePixelStrip1 >= stripLength {
		return nil, fmt.Errorf("invalid middlePixelStrip1")
	}
	if middlePixelStrip2 < 0 || middlePixelStrip2 >= stripLength {
		return nil, fmt.Errorf("invalid middlePixelStrip2")
	}
	if pulseWidth <= 0 {
		return nil, fmt.Errorf("pulseWidth must be positive")
	}

	server := &ArduinoServer{
		ledBuffer:         make([]byte, ledCount*bytesPerLED),
		desiredLedState:   make([]byte, ledCount*bytesPerLED),
		activePulses:      make([]*ActivePulse, 0, 10),
		shutdownChan:      make(chan struct{}),
		ackChannel:        make(chan struct{}, 1), // Buffered channel for ACK synchronization
		ledCount:          ledCount,
		bytesPerLED:       bytesPerLED,
		stripLength:       stripLength,
		middlePixelStrip1: middlePixelStrip1,
		middlePixelStrip2: middlePixelStrip2,
		pulseWidth:        pulseWidth,
		animationInterval: time.Duration(animationIntervalMs) * time.Millisecond,
		ackByte:           ackByte,
		ackTimeoutMs:      ackTimeoutMs,
	}

	localIP, err := findLocalIP()
	if err != nil {
		return nil, fmt.Errorf("failed find local IP: %v", err)
	}
	server.localIP = localIP
	log.Printf("Using local IP: %s", server.localIP)
	log.Printf("Strip 1 Mid: %d, Strip 2 Mid Rel: %d (Abs: %d), PulseWidth: %d", server.middlePixelStrip1, server.middlePixelStrip2, server.stripLength+server.middlePixelStrip2, server.pulseWidth)

	addr := &net.UDPAddr{Port: port, IP: net.ParseIP("0.0.0.0")}
	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		return nil, fmt.Errorf("UDP listen error: %v", err)
	}
	server.udpServer = conn
	log.Printf("UDP Server listening on port %d", port)

	mode := &serial.Mode{BaudRate: baud, Parity: serial.NoParity, DataBits: 8, StopBits: serial.OneStopBit}
	log.Printf("Connecting serial %s @ %d baud", serialPath, baud)
	portHandle, err := serial.Open(serialPath, mode)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("serial open error: %v", err)
	}
	server.serialPort = portHandle
	log.Printf("Connected to Arduino on %s", serialPath)

	time.Sleep(1 * time.Second)
	// Initial clear state will be sent by the sender loop if needed

	return server, nil
}

// findLocalIP finds a suitable local IP address
func findLocalIP() (string, error) {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "", err
	}
	var fallbackIP string
	preferredPrefixes := []string{"192.168.", "10.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31."}
	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ip := ipnet.IP.To4(); ip != nil {
				ipStr := ip.String()
				if fallbackIP == "" {
					fallbackIP = ipStr
				}
				for _, prefix := range preferredPrefixes {
					if bytes.HasPrefix([]byte(ipStr), []byte(prefix)) {
						return ipStr, nil
					}
				}
			}
		}
	}
	if fallbackIP != "" {
		return fallbackIP, nil
	}
	return "", fmt.Errorf("no suitable non-loopback IPv4 address found")
}

// Start launches the server's background goroutines
func (s *ArduinoServer) Start() {
	log.Println("Starting server routines...")
	s.wg.Add(4) // UDP Listener, Serial Listener, Animation Calc Loop, Serial Sender Loop
	go s.handleUDPMessages()
	go s.handleSerialData()
	go s.runAnimationCalculatorLoop()
	go s.runSerialSenderLoop()
	log.Println("Server routines started.")
}

// --- Network and Serial Handlers ---

// handleUDPMessages listens for UDP packets, parses commands, adds pulses
func (s *ArduinoServer) handleUDPMessages() {
	defer s.wg.Done()
	buffer := make([]byte, udpBufferSize)
	log.Println("UDP message handler started.")
	for {
		select {
		case <-s.shutdownChan:
			log.Println("UDP listener shutting down.")
			return
		default:
		}

		s.udpServer.SetReadDeadline(time.Now().Add(1 * time.Second))
		n, remoteAddr, err := s.udpServer.ReadFromUDP(buffer)
		if err != nil {
			if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
				continue
			}
			if opErr, ok := err.(*net.OpError); ok && strings.Contains(opErr.Err.Error(), "use of closed network connection") {
				log.Println("UDP listener closed.")
				return
			}
			log.Printf("Error reading UDP: %v", err)
			continue
		}

		message := buffer[:n]
		var command Command
		if err := json.Unmarshal(message, &command); err != nil {
			log.Printf("Error parsing JSON from %s: %v (data: %s)", remoteAddr, err, limitString(string(message), 100))
			continue
		}

		switch command.Type {
		case Discover:
			s.sendIPResponse(remoteAddr)
		case Pulse:
			var pulseCmd PulsePayload
			if err := json.Unmarshal(command.Payload, &pulseCmd); err != nil {
				log.Printf("Error parsing PULSE payload: %v", err)
				continue
			}
			if pulseCmd.PropagationSpeed <= 0 {
				log.Printf("Invalid propagation speed: %f", pulseCmd.PropagationSpeed)
				continue
			}

			pulseCounter++ // Increment global pulse counter
			newPulse := &ActivePulse{
				ID:               pulseCounter, // Assign unique ID
				StartTime:        time.Now(),
				ColorR:           byte(max(0, min(255, pulseCmd.R))),
				ColorG:           byte(max(0, min(255, pulseCmd.G))),
				ColorB:           byte(max(0, min(255, pulseCmd.B))),
				PropagationSpeed: pulseCmd.PropagationSpeed,
			}
			log.Printf("Creating new pulse ID %d with speed %.2f px/ms", newPulse.ID, newPulse.PropagationSpeed)

			s.animationMutex.Lock()
			s.activePulses = append(s.activePulses, newPulse)
			activeCount := len(s.activePulses)
			s.animationMutex.Unlock()
			log.Printf("Added new pulse ID %d. Total active: %d", newPulse.ID, activeCount)

		default:
			log.Printf("Unknown command type received: %s", command.Type)
		}
	}
}

// handleSerialData reads data from serial, specifically looking for ACK bytes
func (s *ArduinoServer) handleSerialData() {
	defer s.wg.Done()
	buffer := make([]byte, serialBufferSize)
	log.Println("Serial data handler started (ACK mode).")
	for {
		select {
		case <-s.shutdownChan:
			log.Println("Serial listener shutting down.")
			return
		default:
		}

		n, err := s.serialPort.Read(buffer)
		if err != nil {
			if strings.Contains(err.Error(), "serial port closed") || strings.Contains(err.Error(), "file already closed") || strings.Contains(err.Error(), "invalid argument") || err.Error() == "EOF" {
				log.Println("Serial port closed/EOF.")
				return
			}
			// log.Printf("Error reading serial: %v", err); // Reduce noise
			time.Sleep(100 * time.Millisecond)
			continue
		}

		if n > 0 {
			data := buffer[:n]
			for _, b := range data {
				if b == s.ackByte {
					select {
					case s.ackChannel <- struct{}{}:
					default:
					}
					break // Process one ACK per read batch
				}
			}
		}
	}
}

// --- Animation Calculation Goroutine (Corrected Logic) ---

func (s *ArduinoServer) runAnimationCalculatorLoop() {
	defer s.wg.Done()
	log.Println("Animation calculator loop started.")
	ticker := time.NewTicker(s.animationInterval)
	defer ticker.Stop()

	// Buffer used for calculating the combined frame
	combinedFrameBuffer := make([]byte, s.ledCount*s.bytesPerLED)
	pulseWidthRadius := int(math.Floor(float64(s.pulseWidth-1) / 2.0)) // Pixels +/- from the calculated edge

	for {
		select {
		case <-s.shutdownChan:
			log.Println("Animation calculator loop shutting down.")
			return
		case <-ticker.C:
			s.animationMutex.Lock() // Lock for reading activePulses and writing desiredLedState

			now := time.Now()
			// Reset buffer for this frame (additive blending starts from black)
			for i := range combinedFrameBuffer {
				combinedFrameBuffer[i] = 0
			}
			nextActivePulses := make([]*ActivePulse, 0, len(s.activePulses))

			// --- Calculate state for all active pulses ---
			for _, pulse := range s.activePulses {
				// Calculate elapsed time in milliseconds
				elapsedMs := float64(now.Sub(pulse.StartTime).Milliseconds())
				// Calculate distance in pixels based on propagation speed (pixels per millisecond)
				distance := elapsedMs * pulse.PropagationSpeed

				log.Printf("Pulse ID %d: elapsed=%.2f ms, speed=%.2f px/ms, distance=%.2f px",
					pulse.ID, elapsedMs, pulse.PropagationSpeed, distance)

				// --- Strip 1 Calculation ---
				center1 := float64(s.middlePixelStrip1)
				// Calculate the precise edges expanding outwards
				leftEdgePos1 := center1 - distance
				rightEdgePos1 := center1 + distance

				// Determine the pixel range illuminated by the pulse width on the left side
				leftPulseStart1 := max(0, int(math.Round(leftEdgePos1))-pulseWidthRadius)
				leftPulseEnd1 := min(s.stripLength, int(math.Round(leftEdgePos1))+pulseWidthRadius+1) // Range end is exclusive

				// Determine the pixel range illuminated by the pulse width on the right side
				rightPulseStart1 := max(0, int(math.Round(rightEdgePos1))-pulseWidthRadius)
				rightPulseEnd1 := min(s.stripLength, int(math.Round(rightEdgePos1))+pulseWidthRadius+1)

				strip1StillActive := false
				// Apply color to affected pixels on strip 1
				for i := leftPulseStart1; i < rightPulseEnd1; i++ { // Iterate potential bounding box
					// Check if pixel `i` falls within the width of the left or right edge
					isLeftPulsePixel := i >= leftPulseStart1 && i < leftPulseEnd1
					isRightPulsePixel := i >= rightPulseStart1 && i < rightPulseEnd1

					if isLeftPulsePixel || isRightPulsePixel {
						strip1StillActive = true // Mark as active if any pixel is lit
						offset := i * s.bytesPerLED
						combinedFrameBuffer[offset] = addColors(combinedFrameBuffer[offset], pulse.ColorR)
						combinedFrameBuffer[offset+1] = addColors(combinedFrameBuffer[offset+1], pulse.ColorG)
						combinedFrameBuffer[offset+2] = addColors(combinedFrameBuffer[offset+2], pulse.ColorB)
					}
				}

				// --- Strip 2 Calculation ---
				center2 := float64(s.middlePixelStrip2) // Relative center
				leftEdgePos2 := center2 - distance
				rightEdgePos2 := center2 + distance

				leftPulseStartRel2 := max(0, int(math.Round(leftEdgePos2))-pulseWidthRadius)
				leftPulseEndRel2 := min(s.stripLength, int(math.Round(leftEdgePos2))+pulseWidthRadius+1)
				rightPulseStartRel2 := max(0, int(math.Round(rightEdgePos2))-pulseWidthRadius)
				rightPulseEndRel2 := min(s.stripLength, int(math.Round(rightEdgePos2))+pulseWidthRadius+1)

				strip2StillActive := false
				// Apply color to affected pixels on strip 2
				for iRel := leftPulseStartRel2; iRel < rightPulseEndRel2; iRel++ { // Iterate potential bounding box (relative)
					isLeftPulsePixel := iRel >= leftPulseStartRel2 && iRel < leftPulseEndRel2
					isRightPulsePixel := iRel >= rightPulseStartRel2 && iRel < rightPulseEndRel2

					if isLeftPulsePixel || isRightPulsePixel {
						strip2StillActive = true                         // Mark as active if any pixel is lit
						offset := (iRel + s.stripLength) * s.bytesPerLED // Absolute index
						combinedFrameBuffer[offset] = addColors(combinedFrameBuffer[offset], pulse.ColorR)
						combinedFrameBuffer[offset+1] = addColors(combinedFrameBuffer[offset+1], pulse.ColorG)
						combinedFrameBuffer[offset+2] = addColors(combinedFrameBuffer[offset+2], pulse.ColorB)
					}
				}

				// --- Check if pulse should be removed ---
				// Remove if the pulse is no longer visibly contributing to *either* strip
				if strip1StillActive || strip2StillActive {
					nextActivePulses = append(nextActivePulses, pulse)
				} else {
					log.Printf("Pulse ID %d finished and removed.", pulse.ID) // Log removal
				}
			} // --- End iterating through active pulses ---

			// Update active pulses list
			s.activePulses = nextActivePulses

			// Update desiredLedState which will be picked up by the sender
			copy(s.desiredLedState, combinedFrameBuffer)

			s.animationMutex.Unlock() // Unlock after calculations and state update
		} // End select case ticker.C
	} // End for loop
}

// --- Serial Sending Goroutine ---

func (s *ArduinoServer) runSerialSenderLoop() {
	defer s.wg.Done()
	log.Println("Serial sender loop started.")

	frameToSend := make([]byte, s.ledCount*s.bytesPerLED) // Local buffer for sending

	for {
		select {
		case <-s.shutdownChan:
			log.Println("Serial sender loop shutting down.")
			return
		default:
			// --- Check if ACK allows sending ---
			select {
			case <-s.ackChannel:
				// ACK received, proceed with sending
			case <-time.After(time.Duration(s.ackTimeoutMs) * time.Millisecond):
				log.Printf("ACK timeout for frame after %d ms.", s.ackTimeoutMs)
			}

			// --- Get the current frame to send ---
			s.animationMutex.Lock()
			copy(frameToSend, s.desiredLedState)
			s.animationMutex.Unlock()
			log.Printf("Sending frame to serial.")
			log.Println(frameToSend)

			// --- Send Frame ---
			n, err := s.serialPort.Write(frameToSend)
			log.Printf("Frame sent to serial (%d bytes).", n)
			if err != nil {
				log.Printf("ERR writing frame (%d bytes): %v.", n, err)
				time.Sleep(100 * time.Millisecond) // Pause after error
			}

			// Small sleep to maintain frame rate
			time.Sleep(s.animationInterval / 2)

		} // End select
	} // End for loop
}

// --- Utility and Main ---

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
func addColors(c1, c2 byte) byte {
	if c1 == c2 {
		return c1
	}
	val := int(c1) + int(c2)
	if val > 255 {
		return 255
	}
	return byte(val)
}
func limitString(s string, length int) string {
	if len(s) <= length {
		return s
	}
	if length < 0 {
		length = 0
	}
	return s[:length] + "..."
}

func (s *ArduinoServer) sendIPResponse(remoteAddr *net.UDPAddr) {
	if remoteAddr == nil {
		log.Println("Warn: No remote addr for discovery.")
		return
	}
	s.animationMutex.Lock()
	ip := s.localIP
	s.animationMutex.Unlock()
	payload := DiscoverResponsePayload{IP: ip, DeviceType: "Arduino LED Controller Go", FirmwareVersion: "2.3.2-pulse-refine2"} // Version bump
	payloadBytes, _ := json.Marshal(payload)
	response := Command{Type: DiscoverResponse, Payload: json.RawMessage(payloadBytes)}
	responseBytes, _ := json.Marshal(response)
	_, err := s.udpServer.WriteToUDP(responseBytes, remoteAddr)
	if err != nil {
		log.Printf("Error sending discovery to %s: %v", remoteAddr, err)
	}
}

func (s *ArduinoServer) Close() error {
	log.Println("Initiating server shutdown...")
	close(s.shutdownChan)
	var firstErr error
	if s.udpServer != nil {
		if err := s.udpServer.Close(); err != nil {
			log.Printf("Error closing UDP: %v", err)
			firstErr = err
		}
	}
	if s.serialPort != nil {
		if err := s.serialPort.Close(); err != nil {
			log.Printf("Error closing serial: %v", err)
			if firstErr == nil {
				firstErr = err
			}
		}
	}
	log.Println("Waiting for routines...")
	s.wg.Wait()
	log.Println("Server resources closed.")
	return firstErr
}

func main() {
	log.Println("Starting Arduino LED Controller (Decoupled Pulse Mode V4)...")
	serialPortPath := defaultSerialPath
	server, err := NewArduinoServer(udpPort, serialPortPath, baudRate)
	if err != nil {
		log.Fatalf("Failed to create server: %v", err)
	}
	defer func() {
		if err := server.Close(); err != nil {
			log.Printf("Error during server close: %v", err)
		}
	}()
	server.Start()
	log.Println("Server started successfully. Running...")
	select {}
}
