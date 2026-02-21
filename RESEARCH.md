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

### Ship Types

Each ship type has unique attributes (speed, turning, hull, shields, fuel, weapons):

| Ship | Role | Characteristics |
|------|------|----------------|
| **Scout (SC)** | Reconnaissance | Fastest, weakest hull, good for hit-and-run |
| **Destroyer (DD)** | Light combat | Fast, light weapons |
| **Cruiser (CA)** | General purpose | Balanced stats, most common |
| **Battleship (BB)** | Heavy combat | Slow but extremely powerful, point defense |
| **Assault Ship (AS)** | Planet assault | Carries many armies, relatively fragile |
| **Starbase (SB)** | Defense platform | Stationary or near-stationary, very powerful |
| **Galaxy (GA)** | Heavy cruiser | Good all-around with extra fuel |

### Weapons

- **Phasers**: Instant-hit beam weapons, damage falls off with distance
- **Photon Torpedoes**: Projectiles that travel in a direction with "torp wobble" (random directional deviation each tick) — up to 8 in flight simultaneously
- **Plasma Torpedoes**: Slower, more powerful tracking projectiles (limited availability)
- **Tractor/Pressor Beams**: Pull or push other ships
- **Mines**: Dropped torpedoes (stationary)

### Cloaking

Ships can **cloak** to become invisible to enemies. While cloaked:
- Cannot fire weapons (phasers/torpedoes)
- CAN bomb planets, beam armies, and repair
- Fuel consumption increases
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

#### Packet Types

Packets are categorized as:
- **`SP_*` (Server Packets)**: Server → Client updates
  - `SP_PLAYER`: Player ship position, direction, speed
  - `SP_TORP`: Torpedo position
  - `SP_PLANET`: Planet ownership, armies, flags
  - `SP_YOU`: Your own ship's detailed state
  - `SP_PHASER`: Phaser firing events
  - etc.
- **`CP_*` (Client Packets)**: Client → Server inputs
  - `CP_SPEED`: Set speed
  - `CP_DIRECTION`: Set heading
  - `CP_PHASER`: Fire phaser at coordinates
  - `CP_TORP`: Fire torpedo in direction
  - `CP_BOMB`: Toggle bombing
  - etc.

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

## Proposed Architecture

### Recommended: Hybrid Host-Authority with P2P DataChannels

```
                    ┌─────────────────┐
                    │   Trystero       │
                    │  (Signaling via  │
                    │  BitTorrent/     │
                    │  Nostr/MQTT)     │
                    └────────┬────────┘
                             │ SDP Exchange
                    ┌────────▼────────┐
              ┌────→│   Host Peer     │←────┐
              │     │  (Authoritative │     │
              │     │   Simulation)   │     │
              │     └─┬───┬───┬───┬──┘     │
              │       │   │   │   │        │
    WebRTC    │       │   │   │   │        │   WebRTC
  DataChannel │       │   │   │   │        │ DataChannel
              │       │   │   │   │        │
         ┌────▼──┐ ┌──▼─┐ │ ┌▼──┐ ┌──────▼┐
         │Peer 2 │ │P 3 │ │ │P 5│ │Peer 16│
         └───────┘ └────┘ │ └───┘ └───────┘
                       ┌───▼─┐
                       │P  4 │
                       └─────┘
```

### Why Host-Authority (Star Topology)?

1. **Simplest correct implementation** — one peer runs the authoritative simulation
2. **Mirrors original Netrek architecture** — game logic largely unchanged
3. **No consensus needed** for game state
4. **Anti-cheat**: Host validates all inputs (just like original server)
5. **Bandwidth efficient**: Host broadcasts state; peers send only inputs
6. **15 connections** (host to each peer) vs. 120 for full mesh

### Architecture Layers

```
┌─────────────────────────────────────────────┐
│                  UI Layer                    │
│         HTML5 Canvas / WebGL rendering       │
│         Keyboard/mouse/gamepad input         │
├─────────────────────────────────────────────┤
│              Game Logic Layer                │
│    Ship physics, torpedo simulation,         │
│    phaser calculations, army management,     │
│    planet capture logic                      │
├─────────────────────────────────────────────┤
│            Network Abstraction               │
│    Reliable channel (events/chat)            │
│    Unreliable channel (positions/state)      │
├─────────────────────────────────────────────┤
│              P2P Transport                   │
│         WebRTC DataChannels                  │
│    Trystero (serverless signaling)           │
│    STUN/TURN (NAT traversal)                │
└─────────────────────────────────────────────┘
```

### Tech Stack Recommendation

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Signaling** | Trystero (Nostr or BitTorrent strategy) | Truly serverless, no backend needed |
| **P2P Transport** | WebRTC DataChannels (via Trystero) | Low-latency, unreliable + reliable modes |
| **Game State** | TypedArrays / binary protocol | Efficient, matches original Netrek style |
| **Rendering** | HTML5 Canvas 2D | Simple, performant for 2D, well-supported |
| **Game Loop** | requestAnimationFrame + fixed timestep | Smooth rendering with deterministic simulation |
| **UI Framework** | Vanilla JS or lightweight (Preact) | Minimal overhead |
| **Build** | Vite | Fast dev server, modern bundling |

### Game Flow

1. **Create Game**: Host peer creates a "room" via Trystero (generates shareable room ID)
2. **Join Game**: Other peers join using room ID (could be a URL like `neonetrek.github.io/#room=abc123`)
3. **Lobby**: Players pick teams and ships
4. **Play**: Host runs simulation, broadcasts state; peers send inputs
5. **Host Migration** (optional): If host disconnects, peer with lowest latency takes over using last known state snapshot

### Data Budget (per update, ~10 Hz)

| Data | Size (bytes) | Notes |
|------|-------------|-------|
| 16 player positions/states | ~640 | 40 bytes each (x, y, dir, speed, shield, hull, fuel, flags) |
| 40 planet states | ~320 | 8 bytes each (owner, armies, flags) |
| Active torpedoes (~50 max) | ~400 | 8 bytes each (x, y, dir, status) |
| Active phasers (~8 max) | ~80 | 10 bytes each |
| **Total per update** | **~1.5 KB** | |
| **At 10 Hz** | **~15 KB/s** | Very manageable for modern connections |

---

## Open Questions & Challenges

### Must Solve

1. **Host migration**: What happens when the host disconnects mid-game?
2. **TURN fallback**: Who pays for TURN servers? Can we use free public ones?
3. **Torp wobble**: Use deterministic seeded PRNG? Or send full torp state each tick?
4. **Latency compensation**: How much client-side prediction for non-host peers?

### Nice to Solve

5. **Spectator mode**: How do observers connect?
6. **Reconnection**: Can a disconnected player rejoin?
7. **Cross-browser determinism**: Floating point consistency for lockstep (if we go that route)
8. **Mobile support**: Touch controls for phones/tablets
9. **Bot players**: Can we add AI players to fill empty slots?
10. **Persistent stats**: Where to store player rankings without a server? (Could use Nostr, IPFS, or a lightweight leaderboard service)

### Design Decisions Needed

11. **Faithful recreation vs. reimagining?** Keep original mechanics exactly, or modernize?
12. **Ship balance**: Use original Netrek values or rebalance for casual play?
13. **Map size**: Original 40 planets, or smaller for quick games?
14. **Team count**: Support 4 teams like original, or simplify to 2?
15. **Minimum viable game**: What's the smallest playable version? (2 players, 2 teams, basic combat?)

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
- [Trystero with Three.js tutorial](https://medium.com/@pablobandinopla/effortless-serverless-multiplayer-in-three-js-with-trystero-f025f31150c6)

### Game Networking Architecture
- [P2P vs Client-Server for multiplayer games - Hathora](https://blog.hathora.dev/peer-to-peer-vs-client-server-architecture/)
- [Client-Server Game Architecture - Gabriel Gambetta](https://www.gabrielgambetta.com/client-server-game-architecture.html)
- [Beginner's Guide to Game Networking](https://pvigier.github.io/2019/09/08/beginner-guide-game-networking.html)
- [Open-Source Framework Using WebRTC for Online Multiplayer Gaming (ACM 2023)](https://dl.acm.org/doi/10.1145/3631085.3631238)

### Netrek Protocol & Networking
- [Netrek Protocol Details - fadden.com](https://fadden.com/gaming/netrek.html)
- [Netrek Server Types](http://www.us.netrek.org/server_types.html)
- [Vanilla Netrek Server](https://vanilla.netrek.org/)
