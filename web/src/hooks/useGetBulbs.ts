import { useCallback, useContext, useEffect, useState } from "react";
import { SocketContext } from "../providers/SocketProvider";

export interface Bulb {
    id: string;
    ip: string;
    status: string;
  }

export const useGetBulbs = () => {
  const { socket, addEventHandler, removeEventHandler } = useContext(SocketContext);
  const [bulbs, setBulbs] = useState<Bulb[]>([]);

  const setBulbsCallback = useCallback((bulbs: Bulb[]) => {
        setBulbs(bulbs)
  }, [setBulbs])

  useEffect(() => {
    if(socket) {
        socket.emit('getBulbs')

        addEventHandler('bulbs', setBulbsCallback)
    }

    return () => {
        removeEventHandler('bulbs', setBulbsCallback)
    }    
  }, [addEventHandler, removeEventHandler, setBulbsCallback, socket])

  return {
    bulbs
  };
};
