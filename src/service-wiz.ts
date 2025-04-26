/**
 * READ
 * https://community.hubitat.com/t/release-philips-wiz-color-light-driver-v1-01/31818/90
 *
 * Discovery:
 * We need to subscribe our controller to the wiz bulbs
 *
 */

import dgram from 'dgram';
import { useNetworkInterface } from './networking';
import {
  bufferToJSON,
  createMessage,
  createRegistrationMessage,
  isRegistrationResponse,
  isSyncMessage,
  RegistrationResponse,
  SyncPilotMessage,
  WizCommands,
} from './wiz';
import { Actor, Controller, State, Store } from './bridge';

type Emmiter = (command: Buffer) => void;

const CONNECTION_TIMEOUT = 300_000;
const PORT_IN = 38900;
const PORT_OUT = 38899;

export class WizService implements Controller {
  private inSocket: dgram.Socket;
  private outSocket: dgram.Socket;
  private portIn: number = PORT_IN;
  private portOut: number = PORT_OUT;
  private debug = console.log;

  isRegistered: boolean;

  constructor(private store: Store) {
    this.inSocket = dgram.createSocket({ type: 'udp4' });
    this.outSocket = dgram.createSocket({ type: 'udp4' });

    this.isRegistered = false;

    const onError = (port: number) => (error: Error) => {
      this.debug(`Error in port ${port}: ${error.message}`);
    };

    const onListening = (port: number) => () => {
      this.debug(`Listening port ${port} `);
    };

    this.inSocket.on('listening', onListening(this.portIn));
    this.outSocket.on('listening', onListening(this.portOut));

    this.inSocket.on('error', onError(this.portIn));
    this.outSocket.on('error', onError(this.portOut));
  }

  async start(): Promise<void> {
    this.listen();
    await this.register();
  }

  changeLightState(bulbId: string, state: State): void {
    const message = createMessage(bulbId, WizCommands.BulbGeneric, state);
    this.outSocket.send(message, this.portOut, bulbId);
  }

  stop(): void {
    this.isRegistered = false;
    this.inSocket.unref();
    this.outSocket.unref();
  }

  public sendGenericMessage(bulbId: string, params: {
    state?: boolean;
    speed?: number;
    dimming?: number;
    temp?: number;
    sceneId?: number;
    r?: number;
    g?: number;
    b?: number;
  }): void {
    const bulb = this.store.get(bulbId);
    if (!bulb) {
      return
    }

    const message = createMessage(bulbId, WizCommands.BulbGeneric, params);
    this.outSocket.send(message, this.portOut, bulbId);
  }

  private sendDiscoveryMessage(): void {
    const { ipAddress, macAddress, broadcastAddress } = useNetworkInterface();

    const registrationMessage = createRegistrationMessage(ipAddress, macAddress);

    this.debug(`trying to register thru ${broadcastAddress}`);

    this.outSocket.send(registrationMessage, this.portOut, broadcastAddress);
  }


  private async register(): Promise<void> {
    if (this.isRegistered) {
      this.debug('Service already registered');
      return;
    }

    this.inSocket.bind(this.portIn, () => {
      this.inSocket.setBroadcast(true);
    });

    this.outSocket.bind(this.portOut, () => {
      this.outSocket.setBroadcast(true);
    });

    return new Promise<void>((resolve, reject) => {
      const callback = (error: Error | null) => {
        if (error !== null) {
          this.stop();

          reject(error);
        }
      };

      const cancelTimeout = setTimeout(() => {
        reject(new Error('Timeout'));
      }, CONNECTION_TIMEOUT);

      const registerService = () => {
        this.inSocket.once('message', (msg: Buffer) => {
          this.debug({ msg });

          // Already registered
          if (isSyncMessage(msg)) {
            clearTimeout(cancelTimeout);

            return resolve();
          }

          if (isRegistrationResponse(msg)) {
            clearTimeout(cancelTimeout);

            const payload = bufferToJSON(msg) as RegistrationResponse;
            if (payload.result.success) {
              this.debug('Registration successful ', payload);

              this.isRegistered = true;
              return resolve();
            }

            // Re-registration in case it fails
            registerService();
          }
        });

        this.sendDiscoveryMessage()

        setInterval(() => {
          this.sendDiscoveryMessage();
        }, 5000);
        return;
      };

      // service registration
      registerService();
    });
  }

  private listen(): void {
    this.inSocket.on('message', (msg, info) => {
      this.debug({ info, msg: msg.toString() });

      const id = info.address;

      if (isSyncMessage(msg)) {
        const payload = bufferToJSON(msg) as SyncPilotMessage;

        if (!this.store.has(id)) {
          const { state, r, g, b, dimming, temp, sceneId, speed } = payload.params;

          const newActor: Actor = {
            id,
            name: info.address,
            type: 'wiz',
          };

          this.store.set(id, newActor);

          this.debug(`New actor named ${newActor.name} (id: ${newActor.id})`);
        }
      }
    });

    return;
  }
}
