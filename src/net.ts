import os from 'os';

export interface NetworkInterface {
  name: string;
  address: string;
  mac: string;
  netmask: string;
  broadcast: string;
}

export function broadcastAddress(address: string, netmask: string): string {
  const ip = address.split('.').map(Number);
  const mask = netmask.split('.').map(Number);
  const valid = (octets: number[]) => octets.length === 4 && octets.every((o) => Number.isInteger(o) && o >= 0 && o <= 255);

  if (!valid(ip) || !valid(mask)) {
    throw new Error(`Invalid IPv4 address or netmask: ${address} / ${netmask}`);
  }

  return ip.map((octet, i) => (octet | (~mask[i] & 0xff)) & 0xff).join('.');
}

/** Every external IPv4 interface, so discovery reaches the LAN whichever adapter it hangs from. */
export function listInterfaces(): NetworkInterface[] {
  const result: NetworkInterface[] = [];

  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const addr of addresses ?? []) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      result.push({
        name,
        address: addr.address,
        mac: addr.mac,
        netmask: addr.netmask,
        broadcast: broadcastAddress(addr.address, addr.netmask),
      });
    }
  }

  return result;
}
