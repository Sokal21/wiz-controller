import { createSocket } from 'dgram';
import { SerialPort } from 'serialport';
import { networkInterfaces } from 'os';
import { CommandType, AnyCommand, DiscoverResponsePayload } from './commands';

export class ArduinoServer {
  private udpServer: ReturnType<typeof createSocket>;
  private serialPort: SerialPort | null = null;
  private localIp: string = '';
  private ackReceived: boolean = false;
  private ackTimeout: NodeJS.Timeout | null = null;
  private isWaitingForAck: boolean = false;
  private commandQueue: Array<{ command: any; rinfo: { address: string; port: number }; timestamp: number }> = [];
  private isProcessingQueue: boolean = false;
  private readonly COMMAND_EXPIRY_MS = 2; // Commands expire after 2ms

  // Arduino constants
  private readonly LED_COUNT = 300; // Total LEDs (2 strips of 150 each)
  private readonly BYTES_PER_LED = 3; // RGB values per LED
  private readonly ACK_BYTE = 0xaa; // Acknowledge byte from Arduino
  private readonly ACK_TIMEOUT_MS = 5000; // 5 seconds timeout for ACK

  constructor(private udpPort: number = 41234, private serialPath: string = '/dev/ttyUSB0', private baudRate: number = 115200) {
    this.udpServer = createSocket('udp4');
    this.setupUdpServer();
    this.findLocalIp();
  }

  private findLocalIp(): void {
    const nets = networkInterfaces();
    const possibleIps: string[] = [];

    // Log all available network interfaces for debugging
    console.log('Available network interfaces:');
    for (const [name, interfaces] of Object.entries(nets)) {
      // Skip loopback interface
      if (name === 'lo') continue;

      console.log(`Interface ${name}:`);
      if (interfaces) {
        interfaces.forEach((net) => {
          console.log(`  - ${net.family} ${net.address} (internal: ${net.internal})`);
          if (net.family === 'IPv4' && !net.internal) {
            possibleIps.push(net.address);
          }
        });
      }
    }

    // Try to find a suitable IP address
    if (possibleIps.length > 0) {
      // Prefer addresses starting with 192.168 or 10.
      const preferredIp = possibleIps.find((ip) => ip.startsWith('192.168.') || ip.startsWith('10.'));
      this.localIp = preferredIp || possibleIps[0];
      console.log(`Selected IP address: ${this.localIp}`);
    } else {
      throw new Error('No suitable non-loopback IP address found. Please check your network connection.');
    }
  }

  private setupUdpServer(): void {
    this.udpServer.on('error', (err: Error) => {
      console.error('UDP Server error:', err);
    });

    this.udpServer.on('message', (msg: Buffer, rinfo: { address: string; port: number }) => {
      console.log(`Received message from ${rinfo.address}:${rinfo.port}: ${msg}`);

      try {
        // Try to parse as a command
        const command = JSON.parse(msg.toString()) as AnyCommand;

        switch (command.type) {
          case CommandType.DISCOVER:
            this.handleDiscoverCommand(rinfo);
            break;
          case CommandType.SET_LIGHTS:
            this.queueSetLightsCommand(command, rinfo);
            break;
          default:
            console.warn(`Unknown command type: ${command.type}`);
        }
      } catch (error) {
        // If not a valid JSON command, check if it's a simple "getip" message
        if (msg.toString().toLowerCase() === 'getip') {
          this.sendIpResponse(rinfo);
        } else {
          console.error('Error parsing command:', error);
        }
      }
    });
  }

  private handleDiscoverCommand(rinfo: { address: string; port: number }): void {
    console.log('Received discovery command');
    this.sendIpResponse(rinfo);
  }

  private sendIpResponse(rinfo: { address: string; port: number }): void {
    const response: DiscoverResponsePayload = {
      ip: this.localIp,
      deviceType: 'Arduino LED Controller',
      firmwareVersion: '1.0.0',
    };

    const responseCommand = {
      type: CommandType.DISCOVER_RESPONSE,
      payload: response,
    };

    const responseBuffer = Buffer.from(JSON.stringify(responseCommand));
    this.udpServer.send(responseBuffer, rinfo.port, rinfo.address, (err: Error | null | undefined) => {
      if (err) {
        console.error('Error sending IP response:', err);
      } else {
        console.log(`Sent discovery response to ${rinfo.address}:${rinfo.port}`);
      }
    });
  }

  private queueSetLightsCommand(command: any, rinfo: { address: string; port: number }): void {
    console.log('Queueing set lights command');

    // Add command to queue with timestamp
    this.commandQueue.push({
      command,
      rinfo,
      timestamp: Date.now(),
    });
    console.log(`Command queue length: ${this.commandQueue.length}`);

    // If not already processing queue, start processing
    if (!this.isProcessingQueue) {
      this.processNextCommand();
    }
  }

  private processNextCommand(): void {
    // If queue is empty or already processing, return
    if (this.commandQueue.length === 0 || this.isProcessingQueue) {
      return;
    }

    // Check for expired commands and remove them
    const now = Date.now();
    this.commandQueue = this.commandQueue.filter((item) => {
      const age = now - item.timestamp;
      if (age > this.COMMAND_EXPIRY_MS) {
        console.log(`Removing expired command (age: ${age}ms)`);
        return false;
      }
      return true;
    });

    // If queue is now empty after removing expired commands, return
    if (this.commandQueue.length === 0) {
      this.isProcessingQueue = false;
      return;
    }

    this.isProcessingQueue = true;
    const { command, rinfo } = this.commandQueue[0];

    // Process the command
    this.handleSetLightsCommand(command, rinfo);
  }

  private handleSetLightsCommand(command: any, rinfo: { address: string; port: number }): void {
    console.log('Processing set lights command');

    if (!this.serialPort?.isOpen) {
      console.warn('Serial port is not open, cannot send LED data');
      this.commandQueue.shift(); // Remove the command from queue
      this.isProcessingQueue = false;
      this.processNextCommand(); // Try to process next command
      return;
    }

    try {
      // Create a buffer for all LED data
      const ledBuffer = Buffer.alloc(this.LED_COUNT * this.BYTES_PER_LED);

      // Fill the buffer with RGB values from the command
      const lights = command.payload.lights;
      for (let i = 0; i < this.LED_COUNT; i++) {
        const lightIndex = i % lights.length; // Reuse lights if there are fewer than LED_COUNT
        const light = lights[lightIndex];

        // Set RGB values (default to 0 if not provided)
        ledBuffer[i * this.BYTES_PER_LED] = light.r || 0;
        ledBuffer[i * this.BYTES_PER_LED + 1] = light.g || 0;
        ledBuffer[i * this.BYTES_PER_LED + 2] = light.b || 0;
      }

      // Set up ACK handling
      this.ackReceived = false;
      this.isWaitingForAck = true;

      // Set up timeout for ACK
      if (this.ackTimeout) {
        clearTimeout(this.ackTimeout);
      }

      this.ackTimeout = setTimeout(() => {
        if (!this.ackReceived) {
          console.warn('ACK timeout - no response from Arduino');
          this.isWaitingForAck = false;
          this.commandQueue.shift(); // Remove the command from queue
          this.isProcessingQueue = false;
          this.processNextCommand(); // Try to process next command
        }
      }, this.ACK_TIMEOUT_MS);

      // Send the LED data to Arduino
      console.log('Buffer', ledBuffer);
      this.serialPort.write(ledBuffer, (err: Error | null | undefined) => {
        if (err) {
          console.error('Error writing to serial port:', err);
          this.isWaitingForAck = false;
          this.commandQueue.shift(); // Remove the command from queue
          this.isProcessingQueue = false;
          this.processNextCommand(); // Try to process next command
        } else {
          console.log(`Sent ${ledBuffer.length} bytes of LED data to Arduino`);
        }
      });

      // Set up listener for ACK from Arduino
      const dataListener = (data: Buffer) => {
        if (data.includes(this.ACK_BYTE)) {
          this.ackReceived = true;
          this.isWaitingForAck = false;
          console.log('Received ACK from Arduino');

          // Clean up
          if (this.ackTimeout) {
            clearTimeout(this.ackTimeout);
            this.ackTimeout = null;
          }

          // Remove this listener after receiving ACK
          this.serialPort?.removeListener('data', dataListener);

          // Remove the command from queue and process next command
          this.commandQueue.shift();
          this.isProcessingQueue = false;
          this.processNextCommand();
        }
      };

      this.serialPort.on('data', dataListener);
    } catch (error) {
      console.error('Error processing set lights command:', error);
      this.isWaitingForAck = false;
      this.commandQueue.shift(); // Remove the command from queue
      this.isProcessingQueue = false;
      this.processNextCommand(); // Try to process next command
    }
  }

  public async connect(): Promise<void> {
    try {
      // Connect to serial port
      this.serialPort = new SerialPort({
        path: this.serialPath,
        baudRate: this.baudRate,
      });

      // Handle serial port errors
      this.serialPort.on('error', (err: Error) => {
        console.error('Serial port error:', err);
        this.isWaitingForAck = false;
        this.isProcessingQueue = false;
        // Clear the queue on serial port error
        this.commandQueue = [];
      });

      // Start UDP server with broadcast enabled
      this.udpServer.bind(this.udpPort, () => {
        // Enable broadcast after binding
        this.udpServer.setBroadcast(true);
        console.log(`UDP Server listening on port ${this.udpPort}`);
        console.log(`Connected to Arduino on ${this.serialPath}`);
        console.log(`Server IP: ${this.localIp}`);
      });
    } catch (error) {
      console.error('Failed to connect:', error);
      throw error;
    }
  }

  public disconnect(): void {
    if (this.serialPort?.isOpen) {
      this.serialPort.close();
    }
    this.udpServer.close();
    console.log('Disconnected from Arduino and closed UDP server');
  }

  public sendToArduino(data: string): void {
    if (this.serialPort?.isOpen) {
      this.serialPort.write(data, (err: Error | null | undefined) => {
        if (err) {
          console.error('Error writing to serial port:', err);
        }
      });
    } else {
      console.warn('Serial port is not open');
    }
  }
}

const server = new ArduinoServer();
server.connect();
