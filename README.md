# wiz-controller

Light show controller for the lamps on your local network: WiZ bulbs, Magic Home strips and an Arduino LED strip.
You lay the lamps out in a 3D map of the room, build looks out of effects, and play them live with the keyboard,
a tap or a beat detector. Lamps can be simulated, so everything works with nothing plugged in.

## Running it

```sh
yarn install && yarn --cwd web install
yarn dev        # server on :3000, web on :5173
yarn dev:sim    # same, without touching any hardware
```

Open http://localhost:5173. The web app talks to port 3000 of whatever host served the page, so it also works from
a phone on the same network; set `VITE_SERVER_URL` to point it somewhere else.

Other commands: `yarn test`, `yarn typecheck`, and in `web/`: `yarn lint`, `yarn build`.

### Server settings

| Variable | Default | |
|---|---|---|
| `PORT` | `3000` | Socket.IO port |
| `DRIVERS` | `wiz,magic-home,arduino` | Hardware to talk to. `none` runs simulated lamps only |
| `DATA_DIR` | `data` | Where `scenes.json` is saved |
| `BEAT_WS_URL` | | Beat detector to use until one is set in the UI |
| `MH_COLOR_ORDER` | `grb` | Channel order of the Magic Home strips (`rgb` or `grb`) |
| `ARDUINO_LED_COUNT` | `300` | LEDs on the Arduino strip |

## How it works

```
web (React + three.js)  ⇄  Socket.IO  ⇄  server
                                          ├─ SceneStore   scenes, saved to data/scenes.json
                                          ├─ Engine       renders every lamp's color 30 times a second
                                          ├─ Registry     devices found on the network, online or not
                                          └─ Drivers      wiz · magic-home · arduino
```

- A **scene** is a room: its size, the lamps in it with their position, its looks and its pad colors.
  A lamp is either a detected device or a simulated one. A real lamp that is offline keeps showing in the map.
- A **look** is a stack of effect layers. Each layer runs one effect on all the lamps or on some of them, and
  later layers paint over earlier ones. Effects that travel (wave, rainbow, ripple, chase) use the lamp positions.
- The **engine** runs on the server, so a look keeps playing with the browser closed. For each lamp it takes, from
  top to bottom: a pad flash, the playing look, the manual color. It never touches a lamp none of those reach.
- **Beats** come from the Tap button (or Space), the browser microphone, or an external WebSocket that sends
  `{"type":"beat"}`.

`shared/protocol.ts` holds the types both sides speak. Effects live in `src/engine/effects.ts`: adding one there
is enough for it to show up in the editor with its controls.

## Keyboard

| Key | |
|---|---|
| `1`–`9` | Play or stop a look |
| `Q W E / A S D / Z X C` | Flash a pad color on the selected lamps, or on all of them |
| `Space` | Tap the beat |
| `Esc` | Clear the selection |
