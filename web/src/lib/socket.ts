import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../shared/protocol';

const url = import.meta.env.VITE_SERVER_URL ?? `${location.protocol}//${location.hostname}:3000`;

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(url);
