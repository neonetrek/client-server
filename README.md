# NeoNetrek

A modernized, easily-deployable [Netrek](https://en.wikipedia.org/wiki/Netrek) — the classic multiplayer space combat game from 1988. Play in your browser, deploy with one command.

## What is Netrek?

Netrek is a 16-player team space combat game. Four teams (Federation, Romulan, Klingon, Orion) battle for control of 40 planets across a galactic map. It was one of the first internet team games ever created and is recognized by the Guinness Book of World Records as such.

## Architecture

```
┌─────────────────────────────────────────┐
│           Docker Container              │
│                                         │
│  ┌─────────┐    ┌──────────┐            │
│  │ netrekd  │◄──►│ WS Proxy │◄──► Browser
│  │ (C srv)  │TCP │ (Node.js)│ WS        │
│  │ :2592    │    │ :3000    │            │
│  └─────────┘    └──────────┘            │
│                  │ serves │              │
│                  ▼        │              │
│           ┌────────────┐  │              │
│           │ Web Client │  │              │
│           │ (static)   │  │              │
│           └────────────┘  │              │
└─────────────────────────────────────────┘
```

- **netrekd**: The original C Netrek server (via git submodule)
- **WS Proxy**: Node.js WebSocket-to-TCP bridge + static file server
- **Web Client**: Modern TypeScript + Canvas 2D client
- **supervisord**: Process manager keeping both services alive

## Quick Start

### Docker (recommended)

```bash
docker compose up --build
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

### Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app)

1. Fork this repo
2. Connect to Railway
3. Deploy — Railway detects the Dockerfile automatically
4. Set port to `3000`

### Deploy to Fly.io

```bash
fly launch
fly deploy
```

### Local Development

```bash
# Install web client dependencies
cd web-client && npm install && cd ..

# Install proxy dependencies
cd ws-proxy && npm install && cd ..

# Dev mode (web client with hot reload, proxy to local server)
cd web-client && npm run dev
```

For local dev, you'll need a Netrek server running on localhost:2592. The Vite dev server proxies `/ws` to localhost:3000.

## How to Play

### Controls

**Mouse:**
- **Left click**: Set course (fly toward cursor)
- **Right click**: Fire torpedo
- **Middle click**: Fire phaser

**Keyboard:**
- `0-9`: Set speed (0=stop, 9=fast)
- `s`: Toggle shields
- `c`: Toggle cloak
- `R`: Repair
- `o`: Orbit planet
- `b`: Bomb planet
- `z`: Beam up armies
- `x`: Beam down armies
- `d`: Detonate enemy torpedoes
- `Tab`: Toggle tactical/galactic view
- `Shift+Q`: Quit

### Game Flow

1. **Connect**: Open the web client
2. **Login**: Press Enter, type name/password (or Enter for guest)
3. **Team Select**: Press `f` (Fed), `r` (Rom), `k` (Kli), or `o` (Ori)
4. **Ship Select**: Press `s` (Scout), `d` (Destroyer), `c` (Cruiser), `b` (Battleship), `a` (Assault)
5. **Play**: Navigate, fight, capture planets!

### Objective

Conquer all enemy planets by:
1. Bombing enemy armies on planets
2. Picking up friendly armies from your planets
3. Dropping armies on enemy planets to take them

## Ship Types

| Ship | Speed | Shields | Hull | Fuel | Armies | Role |
|------|-------|---------|------|------|--------|------|
| Scout | 12 | 75 | 75 | 5000 | 2 | Very fast, very weak |
| Destroyer | 10 | 85 | 85 | 7000 | 5 | Fast but weak |
| Cruiser | 9 | 100 | 100 | 10000 | 10 | General purpose |
| Battleship | 8 | 130 | 130 | 14000 | 6 | Slow but strong |
| Assault | 8 | 80 | 200 | 6000 | 20 | Bombs planets well |
| Starbase | 2 | 500 | 600 | 60000 | 25 | Point defense |

## Project Structure

```
neonetrek/
├── Dockerfile           # Multi-stage build
├── docker-compose.yml   # Local dev orchestration
├── supervisord.conf     # Process manager config
├── entrypoint.sh        # Container startup
├── server/
│   └── netrek-server/   # Git submodule: C Netrek server
├── ws-proxy/
│   ├── package.json
│   └── index.js         # WebSocket↔TCP proxy + static server
└── web-client/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.ts      # Entry point
        ├── constants.ts  # Game constants & enums
        ├── protocol.ts   # Binary packet encode/decode
        ├── state.ts      # Game state management
        ├── net.ts        # WebSocket network layer
        ├── renderer.ts   # Canvas 2D rendering
        └── input.ts      # Keyboard & mouse handling
```

## License

- **Web client & proxy**: MIT
- **Netrek server**: GPL v2 (see server/netrek-server/COPYING)
- Protocol constants derived from the HTML5 Netrek client (GPL v3)
