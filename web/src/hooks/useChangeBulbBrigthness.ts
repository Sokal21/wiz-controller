import { useCallback, useContext } from 'react';
import { SocketContext } from '../providers/SocketProvider';

export const useChangeBulbBrightness = () => {
  const { socket } = useContext(SocketContext);

  const changeBulbBrightness = useCallback(
    (bulbId: string, brightness: number) => {
      socket?.emit('sendMessage', {
        bulbId,
        message: {
          dimming: brightness,
        },
      });
    },
    [socket]
  );

  return {
    changeBulbBrightness,
  };
};
