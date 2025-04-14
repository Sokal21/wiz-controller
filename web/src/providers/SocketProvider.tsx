import React, { ReactNode, useEffect, useCallback } from "react";
import { createVoidContext } from "../utils/voidContext";
import { io, Socket } from "socket.io-client";

const socket = io('http://192.168.100.87:3000')

interface SocketContext {
  socket: Socket | null;
  addEventHandler: (event: string, handler: (...args: any[]) => void) => void;
  removeEventHandler: (event: string, handler: (...args: any[]) => void) => void;
}

interface EventHandler {
  event: string;
  handler: (...args: any[]) => void;
}

socket.on('connect', () => {
  console.log('Connected to server')
})

export const SocketContext = React.createContext<SocketContext>(
  createVoidContext("Socket-context"),
);

export type Props = {
  children: ReactNode;
};

const SocketProvider = (props: Props) => {
  const { children } = props;
  const [eventHandlers, setEventHandlers] = React.useState<EventHandler[]>([]);

  const addEventHandler = useCallback((event: string, handler: (...args: any[]) => void) => {
    setEventHandlers(prev => [...prev, { event, handler }]);
    socket.on(event, handler);
  }, []);

  const removeEventHandler = useCallback((event: string, handler: (...args: any[]) => void) => {
    setEventHandlers(prev => prev.filter(eh => eh.event !== event || eh.handler !== handler));
    socket.off(event, handler);
  }, []);

  useEffect(() => {
    return () => {
      // Cleanup all event handlers when component unmounts
      eventHandlers.forEach(({ event, handler }) => {
        socket.off(event, handler);
      });
    };
  }, [eventHandlers]);

  return (
    <SocketContext.Provider value={{ socket, addEventHandler, removeEventHandler }}>
      {children}
    </SocketContext.Provider>
  );
};

export default SocketProvider;
