import path from 'path';
import { config, HardwareDriver } from './config';
import { ArduinoDriver } from './drivers/arduino';
import type { Driver } from './drivers/driver';
import { MagicHomeDriver } from './drivers/magic-home';
import { WizDriver } from './drivers/wiz';
import { FixtureRegistry } from './registry';
import { SceneStore } from './scenes/store';
import { LightServer } from './server';

function createDriver(name: HardwareDriver, registry: FixtureRegistry): Driver {
  switch (name) {
    case 'wiz':
      return new WizDriver(registry);
    case 'magic-home':
      return new MagicHomeDriver(registry, config.magicHomeColorOrder);
    case 'arduino':
      return new ArduinoDriver(registry, config.arduinoLedCount);
  }
}

async function main(): Promise<void> {
  const registry = new FixtureRegistry();
  const store = new SceneStore(path.join(config.dataDir, 'scenes.json'), { beatSourceUrl: config.beatSourceUrl });

  // A driver that cannot start (port taken, no network) must not keep the rest from running.
  const drivers: Driver[] = [];
  for (const name of config.drivers) {
    const driver = createDriver(name, registry);
    try {
      await driver.start();
      drivers.push(driver);
      console.log(`[${name}] driver started`);
    } catch (error) {
      console.error(`[${name}] driver failed to start, continuing without it: ${(error as Error).message}`);
      await driver.stop();
    }
  }
  if (drivers.length === 0) console.log('No hardware drivers running: simulated lamps only');

  const server = new LightServer({ registry, drivers, store });
  registry.start();
  await server.start(config.port);
  console.log(`Listening on port ${config.port}`);

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    registry.stop();
    store.flush();
    await server.stop();
    await Promise.all(drivers.map((driver) => driver.stop()));
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
