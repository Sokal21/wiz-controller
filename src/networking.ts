import OS from 'os';

interface NetworkInfo {
  ipAddress: string;
  macAddress: string;
  broadcastAddress: string;
  netmask: string;
}

/**
 * Calculates the broadcast address for a given IP address and netmask
 * @param ipAddress - The IP address in dotted decimal notation
 * @param netmask - The netmask in dotted decimal notation
 * @returns The broadcast address in dotted decimal notation
 * @throws Error if the IP address or netmask is invalid
 */
const calculateBroadcast = (ipAddress: string, netmask: string): string => {
  const ipOctets = ipAddress.split('.').map(Number);
  const maskOctets = netmask.split('.').map(Number);

  if (ipOctets.length !== 4 || maskOctets.length !== 4) {
    throw new Error('Invalid IP address or netmask format');
  }

  if (ipOctets.some(octet => isNaN(octet) || octet < 0 || octet > 255) ||
      maskOctets.some(octet => isNaN(octet) || octet < 0 || octet > 255)) {
    throw new Error('Invalid IP address or netmask values');
  }

  // Calculate broadcast address by ORing the IP with the inverse of the netmask
  const broadcastOctets = ipOctets.map((octet, i) => {
    const maskOctet = maskOctets[i];
    return (octet | (~maskOctet & 0xFF)) & 0xFF;
  });

  return broadcastOctets.join('.');
};

/**
 * Retrieves network interface information for the first non-loopback interface
 * @returns NetworkInfo object containing IP address, MAC address, broadcast address, and netmask
 * @throws Error if no suitable network interface is found
 */
export const useNetworkInterface = (): NetworkInfo => {
  const interfaces = OS.networkInterfaces();
  
  // Find the first non-loopback interface with IPv4
  const interfaceEntry = Object.entries(interfaces).find(([name, addrs]) => {
    return name !== 'lo' && addrs?.some(addr => addr.family === 'IPv4');
  });

  if (!interfaceEntry) {
    throw new Error('No suitable network interface found');
  }

  const [interfaceName, addresses] = interfaceEntry;
  const preferredInterface = addresses?.find(addr => addr.family === 'IPv4');

  if (!preferredInterface) {
    throw new Error(`No IPv4 address found for interface ${interfaceName}`);
  }

  const { address, mac, netmask } = preferredInterface;

  if (!address || !mac || !netmask) {
    throw new Error(`Missing required network information for interface ${interfaceName}`);
  }

  try {
    const broadcastAddress = calculateBroadcast(address, netmask);
    
    return {
      ipAddress: address,
      macAddress: mac,
      broadcastAddress,
      netmask,
    };
  } catch (error) {
    throw new Error(`Failed to calculate broadcast address: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};
