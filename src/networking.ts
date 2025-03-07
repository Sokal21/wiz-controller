import OS from 'os';
import { NetworkInterfaceInfo } from 'os';

interface NetworkInfo {
  ipAddress: string;
  macAddress: string;
  broadcastAddress: string;
  netmask: string;
}

export const useNetworkInterface = (): NetworkInfo => {
  // ignore loopback
  const nInterfaces = Object.entries(OS.networkInterfaces()).find(([key]) => key !== 'lo');

  if (!Array.isArray(nInterfaces)) {
    throw new Error('Interface not found');
  }

  const preferredInterface = nInterfaces[1]?.find(i => i.family === 'IPv4');
  const { address, mac, netmask } = preferredInterface as NetworkInterfaceInfo;
  const broadcastAddress = calculateBroadcast(address, netmask);

  return {
    ipAddress: address,
    macAddress: mac,
    broadcastAddress,
    netmask,
  };
};
const calculateBroadcast = (ipAddress: string, netmask: string): string => {
  // super basic broadcast address calculation
  const ip = ipAddress.split('.');

  if (netmask === '255.255.255.0') {
    ip.splice(ip.length - 1, 1, '255');
    return ip.join('.');
  } else if (netmask === '255.0.0.0') {
    return '192.168.100.255';
    // ip.splice(1, 3, '255', '255', '255');
    // return ip.join('.');
  }

  throw new Error('Could not calculate broadcast address');
};
