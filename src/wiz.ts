import { useNetworkInterface } from './networking';
import { CommandArg, WithAddress } from './utils';
import { assertUnreachable, validateNonEmptyObject, validateNumber, validateObjectKey } from './validations';

/**
 * Wiz bulb state
 */
export interface BulbState {
  state?: boolean; // on | off
  r?: number;
  b?: number;
  g?: number;
  sceneId?: number; // wiz preset id
  dimming?: number;
  temp?: number; // temperature
  speed?: number; // animation speed
  c?: number; // unknown purpose
  w?: number; // unknown purpose
}

export interface WizBulbCommands {
  BulbTurnOn(arg: WithAddress): void;
  BulbTurnOff(arg: WithAddress): void;
  BulbSync(arg: WithAddress): void;
  BulbSetColor(arg: WithAddress<{ color: null }>): void;
  BulbSetTemperature(arg: WithAddress<{ temperature: number }>): void;
  BulbSetDimming(arg: WithAddress<{ dimming: number }>): void;
  BulbSetScene(arg: WithAddress<{ scene: number }>): void;
  BulbSetSpeed(arg: WithAddress<{ speed: number }>): void;
  BulbGetState: (arg: WithAddress) => BulbState;
}

export enum MESSAGE_METHOD {
  REGISTRATION = 'registration',
  SYNC_PILOT = 'syncPilot',
  SET_PILOT = 'setPilot',
  GET_PILOT = 'getPilot',
}

export interface RegistrationRequest {
  params: {
    register: boolean;
    phoneIp: string;
    phoneMac: string;
  };
  method: string;
  id: number;
}

export interface RegistrationResponse {
  method: MESSAGE_METHOD.REGISTRATION;
  result: {
    id: number;
    success: boolean;
  };
}

export interface BulbInfo extends BulbState {
  mac: string; // mac address
  rssi?: number; // signal ?
}

/**
 * This is the actual state we get from the
 * wiz bulbs.
 */
export interface SyncPilotParams extends BulbInfo {
  state: boolean;
}

/**
 * Received after subscribing our controller into the
 * local network
 */
export interface SyncPilotMessage {
  method: MESSAGE_METHOD.SYNC_PILOT;
  env: string; // unknown purpose
  params: SyncPilotParams;
}

type SetPilotParams = BulbInfo & { src?: string };

interface SetPilotMessage {
  method: MESSAGE_METHOD.SET_PILOT;
  id: number;
  params: SetPilotParams;
}

export function createRegistrationMessage (ipAddress: string, macAddress: string): Buffer {
  const registrationMessage: RegistrationRequest = {
    method: MESSAGE_METHOD.REGISTRATION,
    params: {
      register: true,
      phoneIp: ipAddress,
      phoneMac: formatMACAddress(macAddress),
    },
    id: generateRandomId(),
  };

  return JSONToBuffer(registrationMessage);
}

enum WizCommands {
  BulbTurnOn = 'BulbTurnOn',
  BulbTurnOff = 'BulbTurnOff',
  BulbSetColor = 'BulbSetColor',
  BulbSetTemperature = 'BulbSetTemperature',
  BulbSetDimming = 'BulbSetDimming',
  BulbSetScene = 'BulbSetScene',
  BulbSetSpeed = 'BulbSetSpeed',
}

type SupportedCommand = keyof Omit<WizCommands, 'BulbGetState' | 'BulbSync'>;

export function createMessage<Command extends SupportedCommand> (mac: string, event: WizCommands, payload: unknown): Buffer {
  const newState: BulbState = parsePayload(event, payload);

  const message: SetPilotMessage = {
    method: MESSAGE_METHOD.SET_PILOT,
    id: generateRandomId(),
    params: {
      src: 'udp',
      mac,
      ...newState,
    },
  };

  return JSONToBuffer(message);
}

export function isCommandSupported (command: string): command is WizCommands {
  const supportedCommands = [
    'BulbTurnOn',
    'BulbTurnOff',
    'BulbSetColor',
    'BulbSetTemperature',
    'BulbSetDimming',
    'BulbSetScene',
    'BulbSetSpeed',
  ];

  return supportedCommands.indexOf(command) !== -1;
}

function parsePayload (event: WizCommands, params: unknown): BulbState {
  switch (event) {
    case WizCommands.BulbTurnOn:
      return {
        state: true,
      };

    case WizCommands.BulbTurnOff:
      return {
        state: false,
      };

    case WizCommands.BulbSetColor: {
      validateNonEmptyObject(params);
      validateObjectKey(params, 'color');

      const { color } = params;

      return {
        state: true,
        // r: color.r,
        // g: color.g,
        // b: color.b,
      };
    }

    case WizCommands.BulbSetDimming: {
      validateNonEmptyObject(params);
      validateObjectKey(params, 'dimming');
      const { dimming } = params;

      validateNumber(dimming);
      return {
        dimming,
      };
    }
    case WizCommands.BulbSetTemperature: {
      validateNonEmptyObject(params);
      validateObjectKey(params, 'temperature');

      const { temperature } = params;

      validateNumber(temperature);
      return {
        temp: temperature,
      };
    }

    case WizCommands.BulbSetScene: {
      validateNonEmptyObject(params);
      validateObjectKey(params, 'scene');

      const { scene } = params;

      validateNumber(scene);
      return {
        sceneId: scene,
      };
    }

    case WizCommands.BulbSetSpeed: {
      validateNonEmptyObject(params);
      validateObjectKey(params, 'speed');

      const { speed } = params;

      validateNumber(speed);
      return {
        speed,
      };
    }

    default:
      assertUnreachable('No message for this event', event);
  }
}

export function createSyncMessage (): Buffer {
  const { ipAddress, macAddress } = useNetworkInterface();

  return createRegistrationMessage(ipAddress, macAddress);
}

export function JSONToBuffer (message: any): Buffer {
  return Buffer.from(JSON.stringify(message));
}

export function bufferToJSON (msg: Buffer): any {
  return JSON.parse(msg.toString());
}

export function formatMACAddress (rawMac: string): string {
  return rawMac.replace(/:/gi, '').toUpperCase();
}

export function isRegistrationResponse (message: any): message is RegistrationResponse {
  const payload = bufferToJSON(message as Buffer);

  return payload?.method === MESSAGE_METHOD.REGISTRATION;
}

export function isSyncMessage (message: any): message is SyncPilotMessage {
  const payload = bufferToJSON(message as Buffer);
  return payload?.method === MESSAGE_METHOD.SYNC_PILOT;
}

export function isComuniClientACK (event: string): boolean {
  const regex = new RegExp('^ACK_');
  return regex.test(event);
}

export function generateRandomId (): number {
  return Math.round((Math.random() * 100) / 10);
}

interface LightEffect {
  id: number;
  name: string;
}

export const lightEffects: Array<LightEffect> = [
  {
    id: 0,
    name: 'none',
  },
  {
    id: 1,
    name: 'Ocean',
  },
  {
    id: 2,
    name: 'Romance',
  },
  {
    id: 3,
    name: 'Sunset',
  },
  {
    id: 4,
    name: 'Party',
  },
  {
    id: 5,
    name: 'Fireplace',
  },
  {
    id: 6,
    name: 'Cozy',
  },
  {
    id: 7,
    name: 'Forest',
  },
  {
    id: 8,
    name: 'Pastel Colors',
  },
  {
    id: 9,
    name: 'Wake-up',
  },
  {
    id: 10,
    name: 'Bedtime',
  },
  {
    id: 11,
    name: 'Warm White',
  },
  {
    id: 12,
    name: 'Daylight',
  },
  {
    id: 13,
    name: 'Cool White',
  },
  {
    id: 14,
    name: 'Night Light',
  },
  {
    id: 15,
    name: 'Focus',
  },
  {
    id: 16,
    name: 'Relax',
  },
  {
    id: 17,
    name: 'True Colors',
  },
  {
    id: 18,
    name: 'TV Time',
  },
  {
    id: 19,
    name: 'Plant Growth',
  },
  {
    id: 20,
    name: 'Spring',
  },
  {
    id: 21,
    name: 'Summer',
  },
  {
    id: 22,
    name: 'Fall',
  },
  {
    id: 23,
    name: 'Deep Dive',
  },
  {
    id: 24,
    name: 'Jungle',
  },
  {
    id: 25,
    name: 'Mojito',
  },
  {
    id: 26,
    name: 'Club',
  },
  {
    id: 27,
    name: 'Christmas',
  },
  {
    id: 28,
    name: 'Halloween',
  },
  {
    id: 29,
    name: 'Candlelight',
  },
  {
    id: 30,
    name: 'Golden White',
  },
  {
    id: 31,
    name: 'Pulse',
  },
  {
    id: 32,
    name: 'Steampunk',
  },
];

/**
 * 
 * 
method     - method will be "syncPilot" for heartbeat packets
id         - packet sequence number.  Far as I can tell, any integer will work
mac        - The MAC address of the bulb
rssi       - The bulb's WiFi signal strength
src        - The "source" of a command, "udp" or "hb" <purpose unknown>
mqttCd     - boolean <purpose unknown>
state      - boolean on/off state of the bulb
sceneId    - integer identifier for lighting preset
play       - boolean <purpose unknown>
speed      - animation speed for dynamic presets
r          - (0-255) red channel
g          - (0-255) green channel
b          - (0-255) blue channel
c          - (0-255) cool white channel? <not yet tested>
w          - (0-266) warm white channel? <not yet tested>
temp       - color temperature
dimming    - (0-100) brightness channel 
schdPsetId - preset schedule?   <not tested>
fwVersion  - firmware version number
 */
