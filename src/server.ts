import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { Bridge, State } from './bridge';

export class SocketIOServer {
  private io: SocketServer;
  private httpServer: ReturnType<typeof createServer>;

  constructor(private bridge: Bridge) {
    this.httpServer = createServer();
    this.io = new SocketServer(this.httpServer, {
      cors: {
        origin: "*", // In production, configure this to your specific origins
        methods: ["GET", "POST"]
      }
    });

    this.setupSocketHandlers();
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: any) => {
      console.log('Client connected');

    // Handle incoming commands
    //   socket.on('command', (payload: CommandPayload) => {
    //     try {
    //       if (!payload.bulbId || !payload.command) {
    //         socket.emit('response', { error: 'Invalid payload format' });
    //         return;
    //       }

    //       const bulb = this.wizService.store.get(payload.bulbId);
          
    //       if (!bulb) {
    //         socket.emit('response', { error: 'Bulb not found' });
    //         return;
    //       }

    //       if (!isCommandSupported(payload.command)) {
    //         socket.emit('response', { error: 'Unsupported command' });
    //         return;
    //       }

    //       const message = createMessage(
    //         payload.bulbId,
    //         payload.command as WizCommands,
    //         payload.params || {}
    //       );

    //       bulb.emmiter(message);
          
    //       socket.emit('response', { success: true });
    //     } catch (error) {
    //       console.error('Error processing command:', error);
    //       socket.emit('response', { error: 'Failed to process command' });
    //     }
    //   });

      // Get available bulbs
      socket.on('getBulbs', () => {
        const bulbs = this.bridge.getBulbs();
        socket.emit('bulbs', bulbs);
      });

      socket.on('sendMessage', (payload: { bulbId: string, message: State}) => {
        this.bridge.changeLightState(payload.bulbId, payload.message);
      });
      

      socket.on('disconnect', () => {
        console.log('Client disconnected');
      });
    });
  }

  public start(port: number = 3000): void {
    this.httpServer.listen(port, () => {
      console.log(`Socket.IO server listening on port ${port}`);
    });
  }

  public stop(): void {
    this.httpServer.close();
  }
}


