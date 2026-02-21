# NeoNetrek: P2P Web-Based Netrek Research

## Table of Contents

1. [What is Netrek?](#what-is-netrek)
2. [Game Mechanics](#game-mechanics)
3. [Original Architecture](#original-architecture)
4. [Existing Web Clients](#existing-web-clients)
5. [P2P Web Gaming Technologies](#p2p-web-gaming-technologies)
6. [Feasibility Analysis](#feasibility-analysis)
7. [Proposed Architecture](#proposed-architecture)
8. [Open Questions & Challenges](#open-questions--challenges)
9. [Sources](#sources)

---

## What is Netrek?

Netrek is a multi-player battle simulation game with a Star Trek theme, originally created in 1988 at UC Berkeley. Players captain starships to engage enemy vessels, bomb armies, and invade planets to expand their team's space empire.

### Historical Significance

- **Third Internet game ever created** (after MUDs and another predecessor)
- **First Internet team game**
- **Oldest Internet game still actively played** (as of 2022)
- **Pioneered many technologies** including mixed TCP/UDP networking (possibly first game to use both), persistent player accounts with ranks, and RSA-based anti-cheat
- **Peak popularity: 1992-1995**
- Cited as **prior art in patent disputes**
- Recognized as one of the oldest games in what is now the **MOBA genre**
- Described by WIRED in 1993 as "the first online sports game"
- Often described as "probably the first video game which can accurately be described as a sport" — more in common with basketball than arcade games

### Lineage

```
Spacewar! (1962) → Empire (PLATO, 1973) → trek82 (1982) → trek83 → Xtrek (1986, X Window)
    → Xtrek II (1988, client-server protocol) → Netrek (1988-present)
```

Key evolution: Xtrek II (1988) moved from using X as a transport to having its **own client-server protocol**, which was the key innovation enabling cross-platform play.

---

## Game Mechanics

### Core Gameplay

- **2D top-down space combat** on a galaxy map containing **40 planets**
- **Up to 16 players** divided into teams
- Combines **tactical combat** (real-time dogfighting) with **strategic goals** (territory control)
- Ultimate goal: **genocide** the enemy race by capturing all their planets

### Teams (4 factions)

1. **Federation** (Fed)
2. **Romulans** (Rom)
3. **Klingons** (Kli)
4. **Orions** (Ori)

Each team has **10 planets**, with the first being the home planet. Typical games are 2-team (Federation vs. Romulans being most common).

When each active team has at least **4 players**, the server enters **Tournament Mode (T-Mode)**, which enables planet bombing and capture. Below 4v4, only combat is possible.

### Ship Types

Each ship type has unique attributes (speed, turning, hull, shields, fuel, weapons):

| Ship | Role | Characteristics |
|------|------|----------------|
| **Scout (SC)** | Reconnaissance | Fastest, weakest hull, good for hit-and-run |
| **Destroyer (DD)** | Light combat | Fast, light weapons |
| **Cruiser (CA)** | General purpose | Balanced stats, most common |
| **Battleship (BB)** | Heavy combat | Slow but extremely powerful, point defense |
| **Assault Ship (AS)** | Planet assault | Carries many armies, relatively fragile |
| **Starbase (SB)** | Defense platform | Near-stationary, very powerful phasers/tractors, one per team, requires Commander rank, 20-min rebuild timer, has **Transwarp** (allies warp to it at warp 60) |
| **Galaxy (GA)** | Heavy cruiser | Enhanced cruiser (faster, better shields), only in some variants |

### Weapons

- **Phasers**: Instant-hit beam weapons, damage falls off with distance
- **Photon Torpedoes**: Projectiles that travel in a direction with "torp wobble" (random directional deviation each tick) — up to 8 in flight simultaneously
- **Plasma Torpedoes**: Slower, more powerful tracking projectiles (limited availability)
- **Tractor/Pressor Beams**: Pull or push other ships
- **Mines**: Dropped torpedoes (stationary)

### Defensive Systems & Resources

- **Shields**: Toggle on/off, consume fuel, absorb damage. Once shields are down, hull takes damage. Hull damage reduces max speed.
- **Fuel**: All systems consume fuel (weapons, shields, cloaking, engines). Regenerates over time, faster when orbiting a fuel planet. Running out of fuel is catastrophic.
- **Repair**: Ships repair hull/shields over time, faster when orbiting a repair planet or starbase. Repair is faster with shields down.

### Cloaking

Ships can **cloak** to become invisible to enemies. While cloaked:
- Cannot fire weapons (phasers/torpedoes)
- CAN bomb planets, beam armies, and repair
- Fuel consumption increases significantly
- **Uncloaking takes 0.7 seconds** (cannot fire until fully uncloaked)
- Creates tactical stealth gameplay for army runs

### Strategic Layer: Armies & Planet Capture

1. A player earns **kills** by destroying enemy ships or bombing enemy armies
2. Kill count determines how many **armies** a ship can carry (typically 1 army per 1-2 kills)
3. Player **picks up armies** from friendly planets and **drops them on enemy planets** to capture
4. Kill count **resets to zero** on death — making high-kill players prime targets
5. **"Ogging"**: Kamikaze attacks specifically targeting players carrying armies

### Game Variants

- **Bronco**: The standard/classic format (most prevalent)
- **Hockey Netrek**: Players use tractor beams to manipulate a puck
- **Paradise Netrek**: Larger maps, more planets, transwarp, additional ship types
- **Chaos/Dogfight**: Free-for-all combat modes
- **INL (International Netrek League)**: Organized competitive play with drafts and seasons

---

## Original Architecture

### Client-Server Model

Netrek uses a strict **authoritative server model**:

```
┌──────────┐     TCP/UDP      ┌──────────────┐
│ Client 1 │ ←──────────────→ │              │
├──────────┤                  │   Netrek     │
│ Client 2 │ ←──────────────→ │   Server     │
├──────────┤                  │  (Vanilla)   │
│   ...    │ ←──────────────→ │              │
├──────────┤                  │ Shared Memory│
│Client 16 │ ←──────────────→ │  Game State  │
└──────────┘                  └──────────────┘
```

### Server Architecture (Vanilla Server)

The server uses a **multi-process architecture**:

- **`daemonII`**: Global simulation daemon — handles planet updates, army generation, and game-wide events
- **`ntserv`** (one per player): Per-player process for individual player interactions
- **Shared memory**: Contains the authoritative game state, shared across all processes

Key data structures (from `struct.h`):
```c
struct memory {
    struct player  players[MAXPLAYER];           // Up to 16 players
    struct torp    torps[MAXPLAYER * MAXTORP];   // Torpedoes in flight
    struct planet  planets[MAXPLANETS];          // 40 planets
    struct phaser  phasers[MAXPLAYER];           // Phaser state per player
    // ... plus plasma torps, team data, etc.
};
```

### Server Tick Rate

- Original server: **10 updates per second** (10 fps)
- Later upgraded to **50 fps** in 2007 for INL (International Netrek League) mode
- Default port: **2592**
- TCP buffer: 16,738 bytes; UDP buffer: 1,024 bytes

### Network Protocol

Netrek pioneered a **dual TCP/UDP protocol**:

- **TCP**: Used for **critical/reliable** messages (death notifications, team changes, chat)
- **UDP**: Used for **ephemeral/position** data (ship positions, torpedo positions, planet status)

Rationale: If a position update is lost, the next one supersedes it. TCP's guaranteed delivery would cause **head-of-line blocking** — delaying fresh updates while waiting for stale retransmissions.

#### Packet Format

- Every packet starts with a **1-byte type identifier**
- Fixed-size packets (most types) or variable-length (size in byte 3)
- Multi-byte integers in **network byte order** (big-endian)
- Packets aligned to **4-byte boundaries**
- Sequence numbers for UDP packet ordering

#### Connection Lifecycle

1. **Connect**: Client establishes TCP connection, sends `CP_SOCKET`
2. **MOTD**: Server sends `SP_MOTD` (message of the day) and `SP_QUEUE` (queue position)
3. **Login**: Client sends `CP_LOGIN` with credentials; server responds with `SP_LOGIN`
4. **Outfit**: Server sends `SP_MASK` (available teams); client sends `CP_OUTFIT` (team/ship selection)
5. **Play**: Real-time exchange of game state packets
6. **Quit**: Client sends `CP_QUIT` (self-destruct), then `CP_BYE` to disconnect

#### Packet Types

**Server → Client (SP_*):**
```
SP_MESSAGE      (1)  -- Chat messages
SP_PLAYER_INFO  (2)  -- Player metadata
SP_KILLS        (3)  -- Kill counts
SP_PLAYER       (4)  -- Player position (x, y, direction, speed)
SP_TORP_INFO    (5)  -- Torpedo status
SP_TORP         (6)  -- Torpedo position
SP_PHASER       (7)  -- Phaser fire
SP_PLASMA_INFO  (8)  -- Plasma torpedo status
SP_YOU         (12)  -- Current player's detailed state
SP_PLANET      (15)  -- Planet data (owner, armies, flags)
SP_FLAGS       (18)  -- Player flags
SP_PING        (46)  -- Latency measurement
SP_FEATURE     (60)  -- Feature negotiation
SP_LTD         (62)  -- Long-term stats
```

**Client → Server (CP_*):**
```
CP_SPEED        (2)  -- Set ship speed
CP_DIRECTION    (3)  -- Set heading
CP_PHASER       (4)  -- Fire phaser
CP_TORP         (6)  -- Fire torpedo
CP_LOGIN        (8)  -- Authentication
CP_OUTFIT       (9)  -- Ship/team selection
CP_WAR         (10)  -- Declare war
CP_SHIELD      (12)  -- Toggle shields
CP_CLOAK       (19)  -- Toggle cloaking
CP_BYE         (29)  -- Disconnect
```

**Example struct (player position):**
```c
struct player_spacket {
    char type;          // SP_PLAYER (4)
    char pnum;          // Player number
    unsigned char dir;  // Direction (0-255)
    char speed;         // Speed
    LONG x, y;          // Galactic coordinates
};
```

#### Bandwidth Optimizations

- **Short packets**: Compressed format (`SP_S_PLAYER`, `SP_S_TORP`) for reduced bandwidth
- **Visibility culling**: Players only receive full data for entities in their tactical view
- **Cloaking levels**: 5 granularity levels from `UPDT_ALL` (full data) to `UPDT_LEAST` (bogus position)
- **UDP modes**: SIMPLE, FAT (batched updates), DOUBLE (semi-critical channel)

#### Direction Encoding

Directions use a **single byte (0-255)** for 360-degree rotation, giving ~1.4 degree resolution. This compact encoding is part of why the protocol is so bandwidth-efficient.

#### Short Packets (1993)

Added by Heiko Wengler at TU Dortmund — reduced network traffic by **40-75%** through more efficient encoding, enabling competitive play over low-bandwidth connections.

### Anti-Cheat: RSA Verification

Since Netrek is open-source, anyone could create "borg" clients with auto-aim. The RSA system requires clients to have compiled-in RSA keys that servers verify, ensuring only approved clients can connect. This is notable as one of the earliest anti-cheat systems in multiplayer gaming.

### Torpedo Wobble: A Key Design Detail

Torpedoes have random directional changes each server tick ("wobble"). This creates challenges for P2P:
- Can't simply send "torp fired at direction X" and simulate locally
- If an update is missed, client and server torp positions diverge
- Sending random seeds would enable prediction bots
- Must balance network efficiency vs. simulation accuracy

---

## Netrek GitHub Organization

The [Netrek GitHub org](https://github.com/netrek) contains **13 repositories**, overwhelmingly written in C:

| Repository | Language | Description | Commits | Last Active |
|-----------|----------|-------------|---------|-------------|
| **netrek-server** | C (95.8%) | Vanilla server implementation | 1,410 | Oct 2022 |
| **netrek-client-cow** | C/X11 | Primary Unix/Linux client | Most active | Jun 2024 |
| **netrek-server-paradise** | C | Paradise variant server | 78 | Legacy |
| **Netrek-SwiftUI** | Swift (81.9%) | macOS/iPadOS native client | - | Mar 2022 |
| **JavaNetrek** | Java (100%) | Pure Java desktop client | - | Legacy |
| **gytha** | Python (66.6%) | Python + pygame client | - | Legacy |
| **netrek-metaserver** | C | Server discovery service | - | Legacy |
| **NetrekXP** | C | Windows client | - | Legacy |
| **BRMH** | C | Early client | - | Legacy |

**Primary maintainer**: James Cameron (`quozl`) — sole/primary maintainer across most repositories.

**Overall status**: Legacy project with low but steady maintenance. Core infrastructure kept compilable and functional. Highest fork counts: netrek-server (18 forks), netrek-client-cow (13 forks).

---

## Existing Web Clients

### html5-netrek (by Andrew Sillers)

**Repository**: [github.com/apsillers/html5-netrek](https://github.com/apsillers/html5-netrek)

**Architecture**:
```
Browser (HTML5 Canvas) ←→ Socket.io ←→ Node.js Proxy ←→ TCP ←→ Netrek Server
```

- **Rendering**: Cake.js (scene-graph canvas library) with art assets from the COW client
- **Networking**: Socket.io for browser↔proxy, raw TCP proxy↔server
- **Protocol**: jspack library for binary data packing/unpacking (Python-like)
- **Key modules**: `net.js` (connection), `packets.js` (protocol), `world.js` (game state), `ship.js`, `torp.js`, `phaser.js`
- **License**: GPLv3

**Limitations**: Requires a Node.js proxy because browsers cannot make raw TCP connections. The proxy is essentially a WebSocket-to-TCP bridge.

**Developer discussion** on the netrek-dev mailing list identified **WebRTC** as the way to go for a lossy data channel in the browser, and noted the original binary protocol has "hidden behaviours that are surprising."

### Gytha (Python/Pygame Client)

A more modern Python-based client in the Netrek GitHub org, but not browser-based.

### Other Clients

- **Netrek XP**: Windows client (C/Win32)
- **netrek-client-cow**: The classic C/X11 Unix client
- **Netrek-SwiftUI**: Modern iOS/macOS client attempt

---

## P2P Web Gaming Technologies

### WebRTC DataChannels

WebRTC DataChannels are the key technology enabling browser-to-browser P2P gaming:

**Advantages over WebSockets:**
- **Direct P2P** — no server relay needed after connection established
- **UDP-like mode** — unreliable, unordered delivery (perfect for game state updates)
- **Reliable mode** — TCP-like guaranteed delivery (for chat, critical events)
- **Low latency** — no server hop
- **End-to-end encrypted** (DTLS)

**Configuration options (per channel)**:
```javascript
// Unreliable channel for game state (like Netrek's UDP)
const gameState = pc.createDataChannel("gameState", {
    ordered: false,
    maxRetransmits: 0
});

// Reliable channel for critical events (like Netrek's TCP)
const events = pc.createDataChannel("events", {
    ordered: true
});
```

This maps perfectly to Netrek's dual TCP/UDP approach.

### Signaling: The "Server" You Still Need

WebRTC requires an initial signaling exchange to establish connections. Options:

| Method | Server Required? | Latency | Notes |
|--------|-----------------|---------|-------|
| **WebSocket server** | Yes (minimal) | Low | Traditional, most reliable |
| **Trystero (BitTorrent)** | No dedicated server | Medium | Uses BitTorrent DHT for signaling |
| **Trystero (Nostr)** | No dedicated server | Medium | Uses Nostr relays |
| **Trystero (MQTT)** | No dedicated server | Medium | Uses public MQTT brokers |
| **Firebase/Supabase** | Managed service | Low | Free tier available |
| **Manual exchange** | No | High | Copy-paste SDP (impractical) |
| **QR codes (QWBP)** | No | N/A | Jan 2025: QWBP protocol compresses SDP from 2,500→55 bytes |
| **P2PT** | No dedicated server | Medium | WebTorrent tracker-based signaling |

**Trystero** is the most promising for truly serverless operation — it can use BitTorrent trackers, Nostr relays, or MQTT brokers for signaling, all without running your own server.

### NAT Traversal (STUN/TURN)

- **STUN servers**: Free, widely available (Google operates public ones). Enables ~80-85% of connections.
- **TURN servers**: Required for ~15-20% of users behind symmetric NATs. Acts as a relay, adding latency. **This is the biggest barrier to truly serverless P2P** — someone needs to run/pay for TURN infrastructure.
- **ICE**: The protocol that orchestrates STUN/TURN negotiation automatically.

### P2P Game Architecture Patterns

#### 1. Lockstep Deterministic Simulation
```
All peers: Execute same inputs at same tick → Same game state
```
- Used by classic RTS games (StarCraft, Age of Empires)
- Requires **deterministic simulation** (same inputs → same output on all machines)
- Only sends **inputs**, not state — very bandwidth efficient
- **Latency = slowest peer** (everyone waits for all inputs)
- JavaScript floating point is IEEE 754 compliant, but **Math.sin/cos differ across browsers** — would need fixed-point math

#### 2. Rollback Netcode (GGPO-style)
```
Predict locally → Receive remote input → Rollback if wrong → Resimulate
```
- Used by fighting games (GGPO, Rollback Netcode)
- Great for 1v1 or small player counts
- Requires ability to snapshot and restore game state
- **Scales poorly** with player count (rollback cost grows exponentially)
- Excellent for responsive feel

#### 3. State Synchronization with Authority
```
Host peer: Runs authoritative simulation, broadcasts state
Other peers: Receive state, render, send inputs to host
```
- One peer acts as the "server" (host)
- Simplest to implement correctly
- **Host has zero latency advantage** and more CPU load
- If host disconnects, game ends (or must migrate)
- Most similar to original Netrek architecture

#### 4. Distributed Authority
```
Each peer: Authoritative over own ship/torps, receives others' state
```
- Each player is authoritative over their own entities
- No single point of failure
- **Vulnerable to cheating** (players can lie about their state)
- Conflict resolution needed for shared state (planet captures)

### P2P Libraries for the Browser

| Library | Signaling | Stars | Notes |
|---------|-----------|-------|-------|
| **[Trystero](https://github.com/dmotz/trystero)** | BitTorrent/Nostr/MQTT/Firebase | ~4k | Truly serverless, multiple backends |
| **[PeerJS](https://peerjs.com/)** | PeerServer (hosted/self-hosted) | ~12k | Mature, well-documented |
| **[simple-peer](https://github.com/feross/simple-peer)** | BYO | ~7k | Low-level WebRTC wrapper |
| **[P2PT](https://github.com/nicfreeman1209/p2pt)** | WebTorrent trackers | - | Minimal, focused WebTorrent signaling |
| **[NetplayJS](https://github.com/nicfreeman1209/netplayjs)** | BYO | - | Rollback netcode for browser games (2-4 players) |

### Scalability: Can P2P Mesh Support 16 Players?

In a full mesh topology, each peer connects to every other:

| Players | Connections per peer | Total connections |
|---------|---------------------|-------------------|
| 2 | 1 | 1 |
| 4 | 3 | 6 |
| 8 | 7 | 28 |
| 16 | 15 | 120 |

**16 players = 120 peer connections total, 15 per peer.**

This is at the edge of feasibility:
- **Bandwidth**: Each peer sends state to 15 others. At ~100 bytes/update, 10 updates/sec = ~15 KB/s upload per peer — manageable.
- **CPU**: 15 WebRTC connections consume resources, but modern browsers handle this.
- **Connection reliability**: More connections = more failure points. Community reports suggest Trystero struggles with "too many PeerConnections" in some browsers.

**Bandwidth estimate (star topology)**: Host sending ~2 KB state at 20 Hz to 15 clients = ~600 KB/s upload — manageable but meaningful.

**Recommendation**: A **star topology** (one peer as relay/host) or **partial mesh** would be more reliable for 16 players than a full mesh. Full mesh is reliable up to ~10 peers; beyond that, use host-authority.

---

## Feasibility Analysis

### Can Netrek work as a P2P web game? **Yes, with caveats.**

### What works well for P2P:

1. **Game tick rate is modest**: Original Netrek runs at relatively low update rates — P2P can handle this
2. **Small game state**: 16 players + 40 planets + active torpedoes/phasers = small data footprint
3. **WebRTC DataChannels mirror Netrek's dual protocol**: Unreliable channels for positions, reliable for events
4. **Limited "need to know"**: Players only need to see what's in sensor range, reducing broadcast data
5. **Turn-based strategic elements**: Planet captures, army generation aren't latency-critical

### Key Challenges:

| Challenge | Severity | Mitigation |
|-----------|----------|------------|
| **No authoritative server** (cheating) | High | Consensus-based validation, trust-but-verify |
| **TURN server for NAT traversal** | Medium | Use free TURN services or accept ~15% can't connect |
| **Host migration** (if using star topology) | Medium | State snapshots, automatic failover |
| **Torpedo wobble determinism** | Medium | Use seeded PRNG, share seeds |
| **16-player mesh scalability** | Medium | Star topology or SFU for larger games |
| **Signaling without a server** | Low | Trystero (BitTorrent/Nostr) solves this |
| **Game state conflicts** | Medium | CRDTs or host-authority for shared state |

### Anti-Cheat Without a Server

This is the hardest problem. Options:
1. **Host-authoritative**: One peer runs canonical simulation (recommended — mirrors original architecture)
2. **Majority consensus**: Multiple peers validate actions; majority rules (expensive with 16 players)
3. **Watchdog peers**: Designated validators verify suspicious actions
4. **Cryptographic commitments**: Players commit to inputs before revealing
5. **Replay verification**: Record and verify suspicious actions post-game
6. **Accept some cheating**: For casual play, the social cost of cheating may be sufficient deterrence

### Emerging: CRDTs for Game State

A March 2025 research paper demonstrated **delta state CRDTs with dynamic strategy switching** for eventual consistency in multiplayer games without coordination. This could be relevant for shared state like planet ownership, but is likely overkill for NeoNetrek's scope.

---

## Revised Approach: Dockerized Server + Modern Web Client

After analyzing the existing codebases, the P2P approach was abandoned in favor of a more practical architecture: **Docker-wrap the battle-tested C server** and **build a new web client from scratch**.

### Why Not P2P?

The P2P research above remains valuable context, but practical concerns favor a server:
- Anti-cheat is trivially solved with an authoritative server
- NAT traversal / TURN infrastructure is still needed for P2P (not truly serverless)
- The C server already has 30+ years of balanced game logic — reimplementing it is months of work
- Docker makes server deployment nearly as easy as "one-click"

### Why Not Rewrite the Server?

The existing C server was analyzed in depth:
- **Compiles cleanly** on modern Linux (Ubuntu 24.04, GCC 13.3) with zero source changes
- **Minimal runtime dependencies**: just `libc`, `libm`, `libgdbm`, `libcrypt`
- **~100,000 lines of C** with ~4,600 lines of game simulation in `daemon.c` alone
- Decades of combat balance, edge-case handling, and protocol refinement
- **Rewrite estimate: 3-6 months.** Docker wrapping: **1-2 days.**

### Why Rewrite the Web Client?

The existing [html5-netrek](https://github.com/apsillers/html5-netrek) was analyzed:
- **~4,300 lines** of ES5 JavaScript (2012 era), abandoned since 2020
- Rendering coupled to **Cake.js** (dead library from 2007, 9,400 lines, no npm package)
- **Socket.io 0.9** (2014) with 5 known security vulnerabilities
- No modules, no build system, no tests, globals everywhere
- Multiple bugs found (undefined `CP_FEATURE`, missing `CP_REPRESS` code, typos)
- **Verdict: rewrite from scratch**, but extract protocol definitions as a spec

**What's salvageable from html5-netrek:**
- `packets.js` — Protocol format strings (the most valuable artifact)
- `constants.js` — Ship stats, flag bits, team IDs
- `data/img/` — Ship sprites and planet art (from COW client)

---

## Proposed Architecture

### Docker Container: C Server + WebSocket Proxy + Web UI

```
┌─────────────────────────────────────────────────────┐
│                 Docker Container                     │
│                                                      │
│  ┌──────────┐     ┌──────────────┐     ┌──────────┐ │
│  │  Netrek   │◄───►│  WS-to-TCP   │◄───►│  Web UI  │ │
│  │  Server   │TCP  │    Proxy     │ WS  │ (static) │ │
│  │ (C, port  │     │  (Node.js)   │     │          │ │
│  │  2592)    │     │              │     │          │ │
│  └──────────┘     └──────────────┘     └──────────┘ │
│       ▲                  ▲                   ▲       │
│       │                  │                   │       │
└───────┼──────────────────┼───────────────────┼───────┘
        │                  │                   │
   Port 2592          Port 3000           Port 8080
   (legacy TCP       (WebSocket          (HTTP / Web UI)
    clients)          for browser)
```

### How It Works

1. **Netrek C server** runs as-is inside the container, listening on TCP port 2592
2. **WebSocket proxy** (lightweight Node.js/Bun process) bridges browser WebSocket connections to the C server's TCP protocol
3. **Static web server** serves the modern HTML5 client
4. **Single container** exposes all three ports (or just port 8080 for WebSocket-only mode)

### Server Architecture (Inside the Container)

The C server uses a multi-process architecture with SysV shared memory:

```
netrekd (newstartd)          -- connection listener, binds port 2592
    ├── fork() → ntserv      -- per-player process (up to 32)
    ├── fork() → ntserv      -- another player
    └── ...

daemon                       -- game simulation (fixed-rate loop)
    ├── fork() → basep       -- base practice robot
    ├── fork() → newbie      -- newbie helper robot
    └── ...

Shared memory (~454 KB)      -- ALL game state
    ├── players[32]           -- 4,760 bytes each
    ├── torps[32 × 9]        -- torpedoes in flight
    ├── planets[40]           -- planet state
    ├── phasers[32]           -- phaser state
    ├── teams[5]              -- team data
    ├── shipvals[NUM_TYPES]   -- ship type definitions
    └── messages[]            -- chat buffer
```

SysV shared memory and semaphores work fine in Docker containers (namespace-isolated).

### Web Client Architecture (New Build)

```
┌─────────────────────────────────────────────┐
│                  UI Layer                    │
│        HTML5 Canvas 2D rendering             │
│        Keyboard/mouse/touch input            │
├─────────────────────────────────────────────┤
│              Game State Layer                │
│    Local state mirror, interpolation,        │
│    HUD, player list, chat                    │
├─────────────────────────────────────────────┤
│            Protocol Layer                    │
│    Binary packet encode/decode               │
│    (ported from packets.js format strings)   │
├─────────────────────────────────────────────┤
│            WebSocket Transport               │
│    Connects to WS proxy on port 3000         │
│    Binary frames (ArrayBuffer)               │
└─────────────────────────────────────────────┘
```

### Tech Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **Game server** | Existing C server (Vanilla Netrek) | 30+ years of battle-tested logic |
| **WS proxy** | Node.js / Bun (~50 lines) | Bridge WebSocket ↔ TCP |
| **Web client** | TypeScript + Canvas 2D | Modern, type-safe, no framework overhead |
| **Build** | Vite | Fast dev, modern bundling |
| **Container** | Docker multi-stage | Debian slim, minimal footprint |
| **Process manager** | supervisord or s6 | Manage multiple processes in one container |

### Deployment Options

| Platform | Ports | One-Click | Notes |
|----------|-------|-----------|-------|
| **Docker Compose** | All (2592, 3000, 8080) | `docker compose up` | Local dev + self-hosted |
| **Fly.io** | All (TCP + HTTP) | `fly launch` | Best for production, ~$5/mo |
| **Railway** | WS + HTTP (random TCP port) | Deploy button | Best DX, free tier |
| **Render** | HTTP only | GitHub connect | WebSocket-only mode |
| **Any VPS** | All | `docker run` | Full control |

### WebSocket-Only Mode

If the deployment platform doesn't support raw TCP (Railway random ports, Render), the container can run in **WebSocket-only mode**:
- Web client connects directly via WebSocket
- No legacy TCP port exposed
- Deployable on every platform
- Trade-off: legacy C/X11 Netrek clients can't connect directly

### Dockerfile (Approximate)

```dockerfile
FROM debian:bookworm-slim AS builder
RUN apt-get update && apt-get install -y \
    build-essential autoconf automake libtool libgdbm-dev
COPY netrek-server/ /src
WORKDIR /src
RUN sh autogen.sh && ./configure --prefix=/opt/netrek && make && make install

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y \
    libgdbm6 libcrypt1 nodejs npm supervisor && \
    rm -rf /var/lib/apt/lists/*
COPY --from=builder /opt/netrek /opt/netrek
COPY ws-proxy/ /opt/ws-proxy
COPY web-client/dist/ /opt/web-client
COPY supervisord.conf /etc/supervisor/conf.d/
EXPOSE 2592 3000 8080
CMD ["supervisord", "-n"]
```

---

## Implementation Plan

### Phase 1: Dockerized C Server (MVP)
1. Write Dockerfile for the Netrek vanilla server
2. Write a minimal WebSocket-to-TCP proxy (~50 lines)
3. Verify legacy clients can connect to the containerized server
4. Add docker-compose.yml for local dev
5. **Deliverable: Anyone can run a Netrek server with `docker compose up`**

### Phase 2: Modern Web Client
1. Extract protocol spec from html5-netrek's packets.js/constants.js
2. Build TypeScript protocol layer (binary packet encode/decode via DataView)
3. Build Canvas 2D renderer (tactical view + galactic map)
4. Implement core gameplay: movement, torpedoes, phasers, shields
5. Implement outfitting screen (team/ship selection)
6. Add HUD (fuel, hull, shields, speed, army count)
7. Add chat (team/all/individual messages)
8. **Deliverable: Playable web client connecting to the Docker server**

### Phase 3: Polish & Deploy
1. Add one-click deploy button for Railway
2. Add fly.toml for Fly.io deployment
3. Mobile/touch controls
4. Sound effects
5. Tutorial/onboarding for new players
6. **Deliverable: One-click deployable Netrek with web UI**

### Phase 4: Optional Enhancements
- Bot players for single-player practice
- Spectator mode
- Game recording/replay
- Leaderboard/stats persistence
- Custom themes/skins

---

## Open Questions

1. **Process manager**: supervisord vs. s6-overlay vs. custom shell script for managing multiple processes in Docker?
2. **WebSocket proxy protocol**: Pass raw Netrek binary packets over WS frames, or define a new JSON protocol? (Raw binary is simpler and preserves compatibility)
3. **Client rendering**: Canvas 2D vs. PixiJS vs. raw WebGL? (Canvas 2D is simplest for 2D)
4. **Legacy client support**: Is backward compatibility with COW/NetrekXP clients a goal?
5. **Mobile**: How important is mobile/touch support in Phase 2 vs. Phase 3?

---

## Sources

### Netrek History & Gameplay
- [Netrek - Wikipedia](https://en.wikipedia.org/wiki/Netrek)
- [Netrek Nexus (Official Site)](https://www.netrek.org/)
- [The History of Netrek - fadden.com](https://fadden.com/gaming/netrek-history.html)
- [Netrek Newbie Manual](https://www.netrek.org/beginner/newbie.php)
- [Netrek Game Design](https://www.netrek.org/developer/design.html)
- [Netrek FAQ](https://www.netrek.org/about/netrekFAQ.html)

### Netrek Source Code
- [Netrek GitHub Organization](https://github.com/netrek)
- [Netrek Server (Vanilla)](https://github.com/quozl/netrek-server)
- [Netrek Client COW (C/X11)](https://github.com/quozl/netrek-client-cow)
- [HTML5 Netrek Client](https://github.com/apsillers/html5-netrek)
- [Netrek - quozl combined repo](https://github.com/quozl/netrek)

### P2P Web Technologies
- [WebRTC Data Channels - MDN](https://developer.mozilla.org/en-US/docs/Games/Techniques/WebRTC_data_channels)
- [Peer-to-peer gaming with WebRTC DataChannel](https://webrtchacks.com/datachannel-multiplayer-game/)
- [WebRTC Protocol in 2025 - VideoSDK](https://www.videosdk.live/developer-hub/webrtc/webrtc-protocol)
- [WebRTC vs. WebSockets for multiplayer games - Rune](https://developers.rune.ai/blog/webrtc-vs-websockets-for-multiplayer-games)
- [WebRTC - Web Game Dev](https://www.webgamedev.com/backend/webrtc)
- [WebRTC for P2P multiplayer - GameDev.net](https://www.gamedev.net/forums/topic/661245-webrtc-for-peer-to-peer-multiplayer/5182194/)

### P2P Libraries
- [Trystero - Serverless WebRTC matchmaking](https://github.com/dmotz/trystero)
- [PeerJS](https://peerjs.com/)
- [P2PT - WebTorrent tracker signaling](https://github.com/subins2000/p2pt)
- [NetplayJS - Rollback netcode for browser games](https://github.com/rameshvarun/netplayjs)
- [Telegraph - GGPO-style rollback for browser](https://github.com/thomasboyt/telegraph)
- [Geckos.io - Server-authoritative WebRTC](https://geckos.io)
- [fast-rtc-swarm - Full-mesh WebRTC swarm](https://github.com/mattkrick/fast-rtc-swarm)
- [Trystero with Three.js tutorial](https://medium.com/@pablobandinopla/effortless-serverless-multiplayer-in-three-js-with-trystero-f025f31150c6)

### Serverless Signaling & NAT Traversal
- [QWBP: Breaking the QR Limit for Serverless WebRTC](https://magarcia.io/air-gapped-webrtc-breaking-the-qr-limit/)
- [serverless-webrtc-qrcode](https://github.com/dcerisano/serverless-webrtc-qrcode)
- [Coturn - Open-source TURN server](https://github.com/coturn/coturn)
- [WebRTC NAT Traversal Guide](https://webrtc.link/en/articles/stun-turn-servers-webrtc-nat-traversal/)

### Game Networking Architecture
- [P2P vs Client-Server for multiplayer games - Hathora](https://blog.hathora.dev/peer-to-peer-vs-client-server-architecture/)
- [Client-Server Game Architecture - Gabriel Gambetta](https://www.gabrielgambetta.com/client-server-game-architecture.html)
- [Beginner's Guide to Game Networking](https://pvigier.github.io/2019/09/08/beginner-guide-game-networking.html)
- [Open-Source Framework Using WebRTC for Online Multiplayer Gaming (ACM 2023)](https://dl.acm.org/doi/10.1145/3631085.3631238)
- [SnapNet: Netcode Architectures Part 1 - Lockstep](https://www.snapnet.dev/blog/netcode-architectures-part-1-lockstep/)
- [SnapNet: Netcode Architectures Part 2 - Rollback](https://www.snapnet.dev/blog/netcode-architectures-part-2-rollback/)
- [RACS: Referee Anti-Cheat Scheme for P2P Gaming](https://www.researchgate.net/publication/228890272_RACS_a_referee_anti-cheat_scheme_for_P2P_gaming)
- [CRDT-Based Game State Synchronization in P2P VR (arXiv, March 2025)](https://arxiv.org/abs/2503.17826)
- [Game Networking Resources (curated list)](https://github.com/miwarnec/Game-Networking-Resources)

### Netrek Protocol & Networking
- [Netrek Protocol Details - fadden.com](https://fadden.com/gaming/netrek.html)
- [Netrek Server Types](http://www.us.netrek.org/server_types.html)
- [Vanilla Netrek Server](https://vanilla.netrek.org/)
