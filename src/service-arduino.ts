import dgram from 'dgram';
import { Controller, State, Store } from "./bridge";
import { useNetworkInterface } from './networking';
import { CommandType, DiscoverCommand, DiscoverResponseCommand, AnyCommand, SetLightsCommand, SetLightsPayload } from './commands';

export class ArduinoService implements Controller {
  private debug = console.log;
  private socket: dgram.Socket;
  private discoveryInterval: NodeJS.Timeout | null = null;
  private readonly PORT = 41234;

  constructor(private store: Store) {
    this.socket = dgram.createSocket('udp4');

    this.socket.on('error', (error) => {
      this.debug(`Socket error: ${error.message}`);
    });

    this.socket.on('listening', () => {
      this.debug(`Socket listening on port ${this.PORT}`);
    });

    this.socket.on('message', (msg, rinfo) => {
      try {
        const command = JSON.parse(msg.toString()) as AnyCommand;
        this.handleCommand(command, rinfo.address);
      } catch (error) {
        this.debug('Error parsing message:', error);
      }
    });
  }

  private handleCommand(command: AnyCommand, senderIp: string): void {
    switch (command.type) {
      case CommandType.DISCOVER_RESPONSE:
        this.handleDiscoverResponse(command, senderIp);
        break;
      default:
        this.debug('Unknown command type:', command.type);
    }
  }

  private handleDiscoverResponse(command: DiscoverResponseCommand, senderIp: string): void {
    const { ip, deviceType, firmwareVersion } = command.payload;
    this.debug('Discovered device:', { ip, deviceType, firmwareVersion });
    
    // Store the discovered device
    this.store.set(ip, {
      id: ip,
      name: `Arduino-${deviceType || 'Unknown'}`,
      type: 'arduino'
    });
  }

  async start(): Promise<void> {
    this.socket.bind(this.PORT, () => {
      this.socket.setBroadcast(true);
    });

    // Start periodic discovery every 5 seconds
    this.discoveryInterval = setInterval(() => {
      this.sendDiscoveryMessage();
    }, 5000);

    this.debug('ArduinoService started');
  }

  private sendDiscoveryMessage(): void {
    try {
      const { broadcastAddress } = useNetworkInterface();
      const command: DiscoverCommand = {
        type: CommandType.DISCOVER,
        payload: {}
      };
      
      const message = Buffer.from(JSON.stringify(command));

      this.debug('Sending discovery message to:', broadcastAddress);
      this.socket.send(message, this.PORT, broadcastAddress, (error) => {
        if (error) {
          this.debug('Error sending discovery message:', error);
        }
      });
    } catch (error) {
      this.debug('Error in discovery:', error);
    }
  }

  changeLightState(bulbId: string, state: State): void {
    try {
      const bulb = this.store.get(bulbId);
      if (!bulb) {
        this.debug('Bulb not found:', bulbId);
        return;
      }
      // Create array of 300 identical RGB values
      const lights: SetLightsPayload['lights'] = Array.from({ length: 300 }, () => ({
        r: state.r,
        g: state.g,
        b: state.b
      }));

      const command: SetLightsCommand = {
        type: CommandType.SET_LIGHTS,
        payload: {
          lights
        }
      };

      const message = Buffer.from(JSON.stringify(command));
      
      this.debug('Sending light state change to:', bulbId);
      this.socket.send(message, this.PORT, bulb.id, (error) => {
        if (error) {
          this.debug('Error sending light state change:', error);
        }
      });

    } catch (error) {
      this.debug('Error in changeLightState:', error);
    }
  }
}