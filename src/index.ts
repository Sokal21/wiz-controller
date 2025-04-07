import { Store, WizService } from "./service";
import { SocketIOServer } from "./server";

const init = async () => {
  const store = new Store();
  const wizService = new WizService(store);
  const socketServer = new SocketIOServer(wizService);
  const port = 3000;

  try {
    await wizService.start();
    socketServer.start(port);
  } catch (error) {
    console.log(error);
    wizService.stop();
    socketServer.stop();
  }
};

init();