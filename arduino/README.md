# LED Controller System

This system consists of an Arduino controller for WS2812B LED strips and a Go client to send commands to it.

## Project Structure

- `firmware/` - Contains the Arduino code
- `go/` - Contains the Go client code

## Hardware Requirements

- Arduino board (tested with Arduino Uno)
- WS2812B LED strip (300 LEDs)
- Power supply for the LED strip
- USB cable to connect Arduino to computer

## Software Requirements

- Arduino IDE with FastLED library installed
- Go 1.20 or later
- Serial port access on your computer

## Setup

1. Connect the LED strip to the Arduino:

   - Connect the LED strip's data pin to Arduino pin 6
   - Connect the LED strip's power and ground to an appropriate power supply
   - Connect the Arduino's ground to the LED strip's ground

2. Upload the Arduino code:

   - Open `firmware/main.c` in Arduino IDE
   - Install the FastLED library if not already installed
   - Upload the code to your Arduino

3. Set up the Go client:
   - Navigate to the `go` directory
   - Run `go mod tidy` to download dependencies
   - Update the `portName` constant in `client.go` to match your Arduino's serial port

## Usage

### Running the Go Client

```bash
cd arduino/go
go run client.go
```

The client will:

1. Send 3 random full strip updates
2. Start a long-running white strobe effect
3. After 2 seconds, interrupt with a blue wave effect
4. After 2 seconds, interrupt with a red strobe effect
5. After 2 seconds, interrupt with a full strip update
6. Continue sending random full strip updates

### Interrupting Effects

The system now supports interrupting running effects with new commands. When a new command is received while an effect is running:

1. The current effect is immediately stopped
2. The LEDs are cleared
3. The new command is processed

This allows for responsive control of the LED strip, even during long-running effects.

### Command Protocol

The system now supports multiple command types:

#### Full Strip Update (CMD_FULL_STRIP = 0x01)

- Format: `[0x01, r1, g1, b1, r2, g2, b2, ...]` (900 bytes total for 300 LEDs)
- Updates the entire LED strip with the specified colors

#### Strobe Effect (CMD_STROBE = 0x02)

- Format: `[0x02, r, g, b, duration, iterations]` (5 bytes total)
- Creates a strobe effect with the specified color
- `duration`: Time in milliseconds for each on/off cycle
- `iterations`: Number of on/off cycles to perform

#### Wave Effect (CMD_WAVE = 0x03)

- Format: `[0x03, r, g, b, speed, iterations]` (5 bytes total)
- Creates a wave effect that emanates from the middle of the strip
- `speed`: Time in milliseconds between wave updates
- `iterations`: Number of wave cycles to perform

## Extending with New Commands

To add new command types:

1. Define a new command constant in both `firmware/main.c` and `go/client.go`
2. Add a new case in the `switch` statement in `main.c`
3. Create a new function in `client.go` to send the command

## Troubleshooting

- If the LEDs don't respond, check the `COLOR_ORDER` constant in both files to ensure it matches your LED strip
- If you get serial port errors, verify the port name and ensure you have the necessary permissions
- For performance issues, try adjusting the baud rate or reducing the number of LEDs
