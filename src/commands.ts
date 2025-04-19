export enum CommandType {
  SET_LIGHTS = 'SET_LIGHTS',
  DISCOVER = 'DISCOVER',
  DISCOVER_RESPONSE = 'DISCOVER_RESPONSE'
}

export interface Command<T extends CommandType, P> {
  type: T;
  payload: P;
}

export interface SetLightsPayload {
  line: 'TOP' | 'BOTTOM';
  lights: [
    {
      r?: number;
      g?: number;
      b?: number;
    }
  ];
}

export interface DiscoverPayload {
  // Empty payload for discovery command
}

export interface DiscoverResponsePayload {
  ip: string;
  // Add any other device information that might be useful
  deviceType?: string;
  firmwareVersion?: string;
}

export type SetLightsCommand = Command<CommandType.SET_LIGHTS, SetLightsPayload>;
export type DiscoverCommand = Command<CommandType.DISCOVER, DiscoverPayload>;
export type DiscoverResponseCommand = Command<CommandType.DISCOVER_RESPONSE, DiscoverResponsePayload>;

export type AnyCommand = SetLightsCommand | DiscoverCommand | DiscoverResponseCommand;
