import { useCallback, useContext } from 'react';
import { SocketContext } from '../providers/SocketProvider';

const hexToRgb = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
};

export const useChangeBulbColor = () => {
  const { socket } = useContext(SocketContext);

  const changeBulbColor = useCallback(
    (bulbId: string, hexColor: string) => {
      const { r, g, b } = hexToRgb(hexColor);
      const state = !(r === 0 && g === 0 && b === 0);

      socket?.emit('sendMessage', {
        bulbId,
        message: {
          r,
          g,
          b,
          state,
        },
      });
    },
    [socket]
  );

  return {
    changeBulbColor,
  };
};
