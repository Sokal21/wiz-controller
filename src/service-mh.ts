/**
 * READ
 * https://community.hubitat.com/t/release-philips-wiz-color-light-driver-v1-01/31818/90
 *
 * Discovery:
 * We need to subscribe our controller to the wiz bulbs
 *
 */
import { Discovery, Control } from 'magic-home';
import { Controller, State, Store } from './bridge';

export class MagicHomeService implements Controller {
  private debug = console.log;
  private controllers: Record<string, Control> = {};
  private discoveryInterval: NodeJS.Timeout | null = null;

  constructor(private store: Store) {}

  async start(): Promise<void> {
    // Perform initial discovery
    await this.performDiscovery();
    
    // Start periodic discovery every 5 seconds
    this.discoveryInterval = setInterval(async () => {
      try {
        await this.performDiscovery();
      } catch (error) {
        this.debug('Error during periodic discovery:', error);
      }
    }, 5000);
  }

  private async performDiscovery(): Promise<void> {
    try {
      const discovery = new Discovery();
      const bulbs = await discovery.scan(1000);
      this.debug('Discovered bulbs:', bulbs);
      
      bulbs.forEach((bulb) => {
        // Skip if light already exists
        if (this.controllers[bulb.address]) {
          return;
        }

        this.store.set(bulb.address, {
          id: bulb.address,
          name: bulb.id,
          type: 'mh',
        });

        this.controllers[bulb.address] = new Control(bulb.address, {
          wait_for_reply: false,
          ack: {
            power: false,
            color: false,
            pattern: false,
            custom_pattern: false,
          },
        });
      });
    } catch (error) {
      this.debug('Discovery error:', error);
      throw error; // Re-throw to handle in the interval
    }
  }

  changeLightState(bulbId: string, state: State): void {
    if (state.dimming) {
      this.controllers[bulbId]?.setColorWithBrightness(state.g || 0, state.r || 0, state.b || 0, state.dimming);
    } else {
      this.controllers[bulbId]?.setColor(state.g || 0, state.r || 0, state.b || 0);
    }
  }

  stop(): void {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }
  }
}
