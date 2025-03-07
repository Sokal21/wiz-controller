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
  BulbState,
  createRegistrationMessage,
  isRegistrationResponse,
  isSyncMessage,
  RegistrationResponse,
  SyncPilotMessage,
} from './wiz';

type Emmiter = (command: Buffer) => void;

interface Actor {
  id: string;
  name: string;
  state: BulbState;
  emmiter: Emmiter;
}

class Store {
  data: Map<string, Actor>;

  constructor () {
    this.data = new Map<string, Actor>();
  }

  has (key: string): boolean {
    return this.data.has(key);
  }

  get (key: string): Actor | undefined {
    return this.data.get(key);
  }

  set (key: string, value: Actor): void {
    this.data.set(key, value);
  }

  delete (key: string): boolean {
    return this.data.delete(key);
  }

  clear (): void {
    this.data.clear();
  }
}

const CONNECTION_TIMEOUT = 300_000;
const PORT_IN = 38900;
const PORT_OUT = 38899;

export class WizService {
  private inSocket: dgram.Socket;
  private outSocket: dgram.Socket;
  private portIn: number = PORT_IN;
  private portOut: number = PORT_OUT;
  private debug = console.log;

  isRegistered: boolean;

  constructor (private store: Store) {
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

  async start (): Promise<void> {
    this.listen();
    await this.register();
  }

  stop (): void {
    this.isRegistered = false;
    this.inSocket.unref();
    this.outSocket.unref();
  }

  private async register (): Promise<void> {
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
      const { ipAddress, macAddress, broadcastAddress } = useNetworkInterface();

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

        const registrationMessage = createRegistrationMessage(ipAddress, macAddress);

        this.debug(`trying to register thru ${broadcastAddress}`);

        this.outSocket.send(registrationMessage, this.portOut, broadcastAddress, callback);

        return;
      };

      // service registration
      registerService();
    });
  }

  private listen (): void {
    this.inSocket.on('message', (msg, info) => {
      this.debug({ info });

      const id = info.address;

      if (isSyncMessage(msg)) {
        const payload = bufferToJSON(msg) as SyncPilotMessage;

        if (!this.store.has(id)) {
          // emitter works over the service udp socket
          const commandEmmiter: Emmiter = (command: Buffer) => {
            this.outSocket.send(command, this.portOut, id);
          };

          const { state, r, g, b, dimming, temp, sceneId, speed } = payload.params;

          const newActor: Actor = {
            id,
            name: info.address,
            emmiter: commandEmmiter,
            state: {
              state,
              r,
              g,
              b,
              sceneId,
              temp,
              dimming,
              speed,
            },
          };

          this.store.set(id, newActor);

          this.debug(`New actor named ${newActor.name} (id: ${newActor.id})`);
        }
      }
    });

    return;
  }
}

const init = async () => {
  const store = new Store();
  const wizService = new WizService(store);

  try {
    await wizService.start();
  } catch (error) {
    console.log(error);
    wizService.stop();
  }
};

init();
