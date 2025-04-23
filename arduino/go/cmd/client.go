package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"go.bug.st/serial"
)

const (
	baudRate      = 115200 // Must match Arduino's baudRate
	dataBlockSize = 64
	ackByte       = 0xAA // Acknowledge byte from Arduino
	LED_COUNT     = 300
	BYTES_PER_LED = 3
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: go run full_strip_writer_debug.go <serial_port>")
		return
	}
	portName := os.Args[1]

	mode := &serial.Mode{
		BaudRate: baudRate,
		Parity:   serial.NoParity,
		DataBits: 8,
		StopBits: serial.OneStopBit,
	}

	port, err := serial.Open(portName, mode)
	if err != nil {
		fmt.Println("Error opening serial port:", err)
		return
	}
	defer port.Close()

	fmt.Printf("Interactive LED control for %s at %d bps (debug output)\n", portName, baudRate)
	fmt.Println("Commands:")
	fmt.Println("  fill <r> <g> <b> - Fill the entire strip with a color (0-255 for each)")
	fmt.Println("  exit             - Exit the program")

	reader := bufio.NewReader(os.Stdin)
	leds := make([]byte, LED_COUNT*BYTES_PER_LED)
	ackChan := make(chan bool)

	// Goroutine to continuously read and print serial data as string
	go func() {
		readBuffer := make([]byte, 128) // Increase buffer size for potential strings
		for {
			n, err := port.Read(readBuffer)
			if err != nil {
				fmt.Println("Error reading serial data:", err)
				return
			}
			if n > 0 {
				receivedBytes := readBuffer[:n]
				if utf8.Valid(receivedBytes) {
					fmt.Printf("Received string: %s\n", string(receivedBytes))
				} else {
					fmt.Printf("Received raw: 0x%X (%d)\n", receivedBytes, receivedBytes)
				}
				for _, b := range receivedBytes {
					if b == ackByte {
						fmt.Println("ACK received by reader goroutine.")
						ackChan <- true
					}
				}
			}
		}
	}()

	for {
		fmt.Print("> ")
		input, _ := reader.ReadString('\n')
		input = strings.TrimSpace(input)
		parts := strings.Split(input, " ")

		if len(parts) > 0 {
			switch parts[0] {
			case "fill":
				if len(parts) == 4 {
					r, errR := strconv.Atoi(parts[1])
					g, errG := strconv.Atoi(parts[2])
					b, errB := strconv.Atoi(parts[3])
					if errR == nil && errG == nil && errB == nil &&
						r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255 {
						fmt.Printf("Filling strip with R:%d G:%d B:%d\n", r, g, b)
						for i := 0; i < LED_COUNT; i++ {
							leds[i*BYTES_PER_LED] = byte(r)
							leds[i*BYTES_PER_LED+1] = byte(g)
							leds[i*BYTES_PER_LED+2] = byte(b)
						}
						sendStripData(port, leds, ackChan)

					} else {
						fmt.Println("Invalid color values. Use 0-255 for R, G, B.")
					}
				} else {
					fmt.Println("Usage: fill <r> <g> <b>")
				}
			case "test":
				if len(parts) != 3 {
					fmt.Println("Usage: test <interval_ms> <duration_seconds>")
					continue
				}
				interval, err := strconv.Atoi(parts[1])
				duration, err2 := strconv.Atoi(parts[2])
				if err != nil || err2 != nil {
					fmt.Println("Invalid parameters. Use numbers for interval and duration.")
					continue
				}

				startTime := time.Now()
				colors := [][]byte{
					{255, 0, 0}, // Red
					{0, 255, 0}, // Green
					{0, 0, 255}, // Blue
				}
				colorIndex := 0

				for time.Since(startTime).Seconds() < float64(duration) {
					// Fill the LED buffer with current color
					for i := 0; i < LED_COUNT; i++ {
						leds[i*BYTES_PER_LED] = colors[colorIndex][0]
						leds[i*BYTES_PER_LED+1] = colors[colorIndex][1]
						leds[i*BYTES_PER_LED+2] = colors[colorIndex][2]
					}
					sendStripData(port, leds, ackChan)

					// Move to next color
					colorIndex = (colorIndex + 1) % len(colors)

					// Wait for specified interval
					time.Sleep(time.Duration(interval) * time.Millisecond)
				}
			case "fade":
				if len(parts) != 9 {
					fmt.Println("Usage: fade <start_r> <start_g> <start_b> <end_r> <end_g> <end_b> <duration> <step_duration>")
					continue
				}
				startR, _ := strconv.Atoi(parts[1])
				startG, _ := strconv.Atoi(parts[2])
				startB, _ := strconv.Atoi(parts[3])
				endR, _ := strconv.Atoi(parts[4])
				endG, _ := strconv.Atoi(parts[5])
				endB, _ := strconv.Atoi(parts[6])
				duration, _ := strconv.Atoi(parts[7])
				step, _ := strconv.Atoi(parts[8])
				if duration <= 0 {
					fmt.Println("Duration must be greater than 0.")
					continue
				}
				if startR < 0 || startR > 255 || startG < 0 || startG > 255 || startB < 0 || startB > 255 ||
					endR < 0 || endR > 255 || endG < 0 || endG > 255 || endB < 0 || endB > 255 {
					fmt.Println("Invalid color values. Use 0-255 for start and end colors.")
					continue
				}
				steps := duration // Number of steps in the fade
				stepDuration := time.Duration(step) * time.Millisecond

				for step := 0; step <= steps; step++ {
					// Calculate current color values using linear interpolation
					currentR := startR + (endR-startR)*step/steps
					currentG := startG + (endG-startG)*step/steps
					currentB := startB + (endB-startB)*step/steps

					// Update all LEDs with current color
					for i := 0; i < LED_COUNT; i++ {
						leds[i*BYTES_PER_LED] = byte(currentR)
						leds[i*BYTES_PER_LED+1] = byte(currentG)
						leds[i*BYTES_PER_LED+2] = byte(currentB)
					}

					sendStripData(port, leds, ackChan)
					time.Sleep(stepDuration)
				}
			case "first_half":
				// Turn on first 150 LEDs with white color
				for i := 0; i < LED_COUNT; i++ {
					if i < 150 {
						leds[i*BYTES_PER_LED] = 255   // R
						leds[i*BYTES_PER_LED+1] = 255 // G
						leds[i*BYTES_PER_LED+2] = 255 // B
					} else {
						leds[i*BYTES_PER_LED] = 0   // R
						leds[i*BYTES_PER_LED+1] = 0 // G
						leds[i*BYTES_PER_LED+2] = 0 // B
					}
				}
				sendStripData(port, leds, ackChan)
			case "exit":
				fmt.Println("Exiting.")
				return
			default:
				fmt.Println("Unknown command.")
			}
		}
	}
}

func sendStripData(port serial.Port, leds []byte, ackChan <-chan bool) {
	totalBytesSent := 0
	startTime := time.Now()
	numBytesToSend := LED_COUNT * BYTES_PER_LED

	_, err := port.Write(leds) // Send all LED data at once
	if err != nil {
		fmt.Println("Error writing to serial port:", err)
		return
	}
	totalBytesSent = numBytesToSend
	elapsed := time.Since(startTime)
	throughput := float64(totalBytesSent) / elapsed.Seconds()
	fmt.Printf("Sent full strip data (%d bytes) in %s. Waiting for ACK...\n", numBytesToSend, elapsed)

	// Wait for the single ACK after sending all data
	ackReceived := <-ackChan
	if ackReceived {
		fmt.Println("ACK received after sending all data.")
	} else {
		fmt.Println("Timeout or error waiting for ACK after sending all data.")
	}
	fmt.Printf("Throughput: %.2f bytes/sec\n", throughput)
}
