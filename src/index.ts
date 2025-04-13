import { WizService } from "./service-wiz";
import { SocketIOServer } from "./server";
import { MagicHomeService } from "./service-mh";
import { Bridge } from "./bridge";
const init = async () => {

  const bridge = new Bridge();
  const wizService = new WizService(bridge.getStore());
  const mhService = new MagicHomeService(bridge.getStore());
  const socketServer = new SocketIOServer(bridge);
  const port = 3000;

  try {
    await wizService.start();
    await mhService.start();

    bridge.setController("wiz",wizService);
    bridge.setController("mh",mhService);

    socketServer.start(port);
  } catch (error) {
    console.log(error);
    wizService.stop();
    socketServer.stop();
  }
};

init();