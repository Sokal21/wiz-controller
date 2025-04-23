import { WizService } from "./service-wiz";
import { SocketIOServer } from "./server";
import { MagicHomeService } from "./service-mh";
import { Bridge } from "./bridge";
import { ArduinoService } from "./service-arduino";
const init = async () => {

  const bridge = new Bridge();
  const wizService = new WizService(bridge.getStore());
  const mhService = new MagicHomeService(bridge.getStore());
  const arduinoService = new ArduinoService(bridge.getStore());
  const socketServer = new SocketIOServer(bridge);
  const port = 3000;

  try {
    await wizService.start();
    await mhService.start();
    await arduinoService.start();
    bridge.setController("wiz",wizService);
    bridge.setController("mh",mhService);
    bridge.setController("arduino",arduinoService);

    socketServer.start(port);
  } catch (error) {
    console.log(error);
    wizService.stop();
    socketServer.stop();
  }
};

init();