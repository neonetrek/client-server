# Bots & Multi-Instance Server

## Background

### Netrek Bot History

Netrek has a rich bot tradition dating to the early 1990s. Server-side robots (HunterKillers, Terminators, Guardians, practice "Hosers") are built into the C server. Client-side "borg" clients (Pig Borg, Beef Borg, etc.) were modified clients — generally considered cheating. All classic bot AI uses hierarchical state machines with rule-based decisions, not ML. The hardest problem is strategic awareness (when to bomb vs escort vs ogg), not individual tactics.

### Existing Bot Infrastructure

The C server submodule (`server/netrek-server/`) ships complete bot infrastructure:

| Bot | Location | Role | Compiled by default? |
|-----|----------|------|----------------------|
| robotd | `robotd/` (44 C files) | Advanced autonomous AI | Yes |
| robotII | `robots/robotII.c` + `rmove.c` | General-purpose practice bot | Yes |
| puck | `robots/puck.c` + `puckmove.c` | Fleet tactics / hockey | Yes |
| mars | `robots/mars.c` + `marsmove.c` | Dogfighter | Yes |
| newbie | `robots/newbie.c` | Newbie server manager ("Merlin") | Needs `-DNEWBIESERVER` |
| basep | `robots/basep.c` | Base practice manager ("Smack") | Needs `-DBASEPRACTICE` |
| pret | `robots/pret.c` | Pre-tournament entertainment | Needs `-DPRETSERVER` |
| inl | `robots/inl.c` | INL tournament manager | Needs `-DINL` |

The server daemon dynamically spawns bots based on the `sysdef` config. Currently all robot modes are disabled (`PRET=0`, `NEWBIE=0`, etc.) in `docs/sample_sysdef.in`.

### robotd AI Architecture

The advanced bot (`robotd/`) uses a state machine:

- `S_ENGAGE` — Dogfighting
- `S_ASSAULT` — Bombing/planet-taking
- `S_DEFENSE` — Defensive positioning and dodging
- `S_RECHARGE` — Resource recovery at safe planets
- `S_DISENGAGE` — Tactical retreat
- `S_ESCORT` — Support a carrier
- `S_OGG` — Hunt an army carrier

The `decide()` function evaluates: fuel/damage levels, army counts, enemy proximity, team composition, player skill rating. It prioritizes survival over aggression.

### Current Architecture (Single Instance)

```
Browser → :3000/ws (WebSocket) → ws-proxy → :2592/tcp → netrekd (one C server)
Browser → :3000/    (Portal, shows this one server)
Browser → :3000/play/ (Web client, auto-connects to /ws)
```

One deployment = one C server = one game instance. The portal shows info for that single server. The web client auto-connects to the same host's `/ws`.

---

## Plan

### Phase 1 — Enable C Server Bots (Config Only)

Enable the existing practice bots so players have opponents immediately.

1. Create a custom `sysdef` file with practice bots enabled:
   ```
   PRET=1               # Pre-tournament entertainment (maintains 4v4)
   ROBOTHOST=127.0.0.1
   IS_ROBOT_BY_HOST=1
   ```
2. Update `Dockerfile` stage 1 to pass `-DPRETSERVER=True` to the configure/make
3. Add `COPY sysdef /opt/netrek/etc/sysdef` to the Dockerfile (after server install)
4. Rebuild and verify bots auto-join when a human connects

**Files changed:**
- `Dockerfile` — add compile flag, copy sysdef
- `sysdef` (new) — custom server config with `PRET=1`

### Phase 2 — Multi-Instance Server

Allow a single deployment to host multiple independent game instances (e.g. "Pickup", "Practice with Bots", "Dogfight Arena") that players choose from the portal.

#### 2a. `config.json` — Single Source of Truth

`config.json` is the one file deployers edit to control server branding and which game modes to offer. It lives at `/opt/config.json` in the container. The entrypoint reads it and dynamically generates supervisord configs + per-instance var dirs. The portal and ws-proxy also read it for branding and routing.

Each netrekd instance uses **~200 MB** of memory. Deployers choose how many instances to run based on their container's memory budget.

**Schema:**
```json
{
  "server": {
    "name": "My NeoNetrek Server",
    "tagline": "A community Netrek server",
    "location": "Ashburn, US",
    "admin": "YourName",
    "contact": "you@example.com",
    "motd": "Welcome aboard, pilot!",
    "rules": ["Be respectful", "Team play encouraged", "Have fun!"]
  },
  "instances": [
    {
      "id": "pickup",
      "name": "Standard Pickup",
      "description": "Classic Bronco team play — no bots, real players only",
      "port": 2592,
      "features": ["bronco", "pickup"],
      "sysdef": {
        "PRET": 0, "NEWBIE": 0, "DOGFIGHT": 0,
        "FPS": 50, "DEFUPS": 25, "MAXUPS": 50,
        "RESETGALAXY": 1, "SELF_RESET": 1
      }
    },
    {
      "id": "bots",
      "name": "Practice with Bots",
      "description": "Easy practice bots to learn the game",
      "port": 2593,
      "features": ["bots", "practice", "beginner"],
      "sysdef": {
        "PRET": 1, "PRET_GUEST": 1, "PRET_PLANETS": 3,
        "PRET_SAVE_GALAXY": 1, "PRET_GALAXY_LIFETIME": 600,
        "PRET_SAVE_ARMIES": 1,
        "FPS": 50, "DEFUPS": 25, "MAXUPS": 50,
        "RESETGALAXY": 1, "SELF_RESET": 1
      }
    }
  ]
}
```

**`server` fields** (portal branding):
- `name` — Server name shown in the portal header
- `tagline` — Subtitle shown under the server name
- `location` — Geographic location displayed on the portal
- `admin` — Admin name for contact info
- `contact` — Contact email or URL
- `motd` — Message of the day shown to players
- `rules` — Array of rules displayed on the portal

**`instances[]` fields** (game mode definitions):
- `id` — URL-safe identifier, used in `/ws/<id>` and `?server=<id>`
- `name` — Display name on the portal card
- `description` — One-line description shown under the name
- `port` — Internal TCP port for this netrekd (must be unique per instance)
- `features` — Tags shown as badges on the portal card
- `sysdef` — Inline sysdef key/value pairs (written to `/opt/netrek/etc/sysdef-<id>` at startup)

#### Per-Instance State Isolation

The C server uses two environment variables to locate its files:
- `LOCALSTATEDIR` — where state lives (players, scores, global, logs, etc.)
- `SYSCONFDIR` — where config lives (sysdef, motd, etc.)

These are read at startup in `ntserv/getpath.c`. By setting `LOCALSTATEDIR` per instance, each netrekd writes to its own directory — no file conflicts.

State files per instance:
| File | Description |
|------|-------------|
| `players` | Player accounts and lifetime stats (binary flat file) |
| `players.index` | GDBM index for player lookups |
| `scores` | Player rankings |
| `global` | Shared memory file (game state) |
| `conquer` | Conquest records |
| `logs/` | Server log files |

**Dynamic supervisord generation**: The entrypoint reads `config.json` and writes a supervisord config per instance, each with its own `LOCALSTATEDIR`. No static supervisord.conf edits needed.

```bash
# entrypoint.sh (simplified)
for instance in $(jq -r '.instances[] | @base64' /opt/config.json); do
  id=$(echo $instance | base64 -d | jq -r '.id')
  port=$(echo $instance | base64 -d | jq -r '.port')

  # Create per-instance state directory
  mkdir -p /opt/netrek/var/$id/logs

  # Generate supervisord program section
  # LOCALSTATEDIR gives each instance its own player DB, scores, logs
  # SYSCONFDIR points to the shared config dir (sysdef is selected by -f flag)
  cat >> /etc/supervisor/conf.d/instances.conf <<EOF
[program:netrekd-$id]
command=/opt/netrek/lib/daemon
environment=LOCALSTATEDIR="/opt/netrek/var/%(program_name)s",SYSCONFDIR="/opt/netrek/etc"
directory=/opt/netrek/var/$id
autorestart=true
EOF
done
```

This means on a volume mounted at `/opt/netrek/var`, the layout is:
```
/opt/netrek/var/
  pickup/
    players           # pickup game player DB
    players.index
    scores
    global
    logs/
  bots/
    players           # bots game player DB (separate)
    players.index
    scores
    global
    logs/
```

Each instance has fully independent state. Players who play on both instances have separate accounts/stats on each.

#### 2b. ws-proxy Multi-Instance Support

Currently the proxy has one WebSocket endpoint (`/ws`) pointing to one C server. Change to support per-instance endpoints.

**Route scheme**: `/ws/:instanceId`

```
/ws/pickup   → TCP :2592
/ws/bots     → TCP :2593
/ws/dogfight → TCP :2594
```

**Changes to `ws-proxy/index.js`:**
- Load `config.json` at startup
- Build a map of `instanceId → port`
- On WebSocket upgrade, parse the path to get the instance ID
- Connect TCP to the corresponding port
- Add `/api/instances` endpoint returning instance list with live player counts
- Update `/health` to report per-instance status

```js
// New: per-instance health
app.get('/api/instances', (req, res) => {
  res.json(instances.map(inst => ({
    ...inst,
    connections: countConnectionsForPort(inst.port),
    status: 'online'
  })));
});
```

#### 2c. Portal Server Picker

Replace the current single-server hero with an instance selection UI. Players see all available game modes on this deployment and pick one to join.

**Portal index.html changes:**
- Add a new "Game Modes" section between the hero and server info
- Each instance rendered as a card with: name, description, player count, features, "Play" button
- "Play" button links to `/play/?server=<instanceId>`
- Hero stats become aggregate (total players across all instances)

**New portal section:**
```
+--------------------------------------------------+
|              NEONETREK SERVER                     |
|    "Choose your battlefield, pilot."             |
|    [12 Players Online]  [3 Game Modes]           |
+--------------------------------------------------+
|                                                  |
|  ┌─────────────┐ ┌─────────────┐ ┌────────────┐ |
|  │ Pickup Game │ │ Practice    │ │ Dogfight   │ |
|  │             │ │ with Bots   │ │ Arena      │ |
|  │ 8 players   │ │ 4 players   │ │ 0 players  │ |
|  │ [bronco]    │ │ [bots]      │ │ [dogfight] │ |
|  │             │ │ [practice]  │ │ [fast]     │ |
|  │ [Play Now]  │ │ [Play Now]  │ │ [Play Now] │ |
|  └─────────────┘ └─────────────┘ └────────────┘ |
+--------------------------------------------------+
```

**Portal JS changes (`portal.js`):**
- Fetch `/api/instances` instead of just `/health`
- Render instance cards dynamically
- Poll every 30s for updated player counts
- "Play Now" links include `?server=instanceId`

#### 2d. Web Client Server Selection

The web client needs to connect to the right instance based on URL parameters.

**Changes to `web-client/src/main.ts`:**
```ts
// Read instance from URL params, default to first available
const params = new URLSearchParams(window.location.search);
const instanceId = params.get('server') || 'pickup';
const wsUrl = `${protocol}//${window.location.host}/ws/${instanceId}`;
```

That's it — the client already connects to a WebSocket URL. Just make the URL include the instance ID.

**Files changed (client-server base image):**
- `Dockerfile` — enable all robot compile flags, add `jq` to runtime
- `entrypoint.sh` — read `config.json`, generate sysdef files + supervisord configs, create per-instance var dirs
- `ws-proxy/index.js` — multi-instance routing (`/ws/:id`), `/api/instances` endpoint
- `portal/index.html` — instance picker card section
- `portal/js/portal.js` — fetch `/api/instances`, render cards, poll player counts
- `web-client/src/main.ts` — read `?server=` URL param for WebSocket target

### ~~Phase 3 — TypeScript Bot Framework~~ (Rejected)

Client-side bots are not needed. The C server's robotd is a battle-tested, sophisticated bot system with 35 files of proven AI logic (dogfighting, dodging, ogging, assault, escort). Reimplementing this in TypeScript would duplicate effort for an inferior result — the server-side bots have direct access to game state without network latency, and their AI has been refined over decades of Netrek history. Use the existing C bots via `PRET=1` in config.json instead.

### Phase 3 — Polish & Integration

1. **Player list indicator**: Show `[R]` next to robot players in the web client player list (check `PFROBOT` flag)
2. **Instance status on portal**: Live player count badges, color-coded (green = active game, yellow = waiting, gray = empty)

---

## Summary of All Files

### Phase 1 (Bot Config)
| File | Change |
|------|--------|
| `Dockerfile` | Add `-DPRETSERVER=True`, copy sysdef |
| `sysdef` (new) | `PRET=1`, `ROBOTHOST=127.0.0.1` |

### Phase 2 (Multi-Instance)
| File | Change |
|------|--------|
| `Dockerfile` | Enable all robot compile flags, add `jq` to runtime |
| `entrypoint.sh` | Read `config.json`, generate sysdef files + supervisord configs per instance |
| `ws-proxy/index.js` | `/ws/:id` routing, `/api/instances` endpoint |
| `portal/index.html` | Instance picker cards section |
| `portal/js/portal.js` | Fetch `/api/instances`, render cards, poll counts |
| `web-client/src/main.ts` | Read `?server=` URL param for WS target |
| Deploy repos: `config.json` | Unified server branding + instance definitions with inline sysdef |

### ~~Phase 3 (TypeScript Bots)~~ — Rejected
Client-side bots not needed; use C server robotd via `PRET=1` instead.

## Deployment: Fly.io & Railway

Both deploy repos use a thin overlay pattern: `FROM ghcr.io/neonetrek/client-server:main` plus a single `config.json` COPY. Deployers control server branding and which instances run by editing `config.json` — the portal dynamically reflects whatever is configured.

### How It Works

1. Deployer adds `config.json` to their deploy repo (defines branding + game modes)
2. On container start, `entrypoint.sh` reads `config.json`, generates sysdef files from inline settings, and generates supervisord configs
3. The ws-proxy reads `config.json` and routes `/ws/<id>` to the right port
4. The portal fetches `/api/instances` and renders cards for each running instance

The base image ships with:
- All robot compile flags enabled (`-DPRETSERVER`, `-DDOGFIGHT`, etc.)
- The multi-instance-aware ws-proxy and portal
- A default `config.json` with a single pickup instance (backward compatible)

### Memory Budget

Each netrekd instance uses **~200 MB** of memory. Deployers choose how many instances to run based on their plan:

| Platform | Plan | Memory | Instances |
|----------|------|--------|-----------|
| Fly.io | `shared-cpu-1x` | 256 MB | 1 |
| Fly.io | `shared-cpu-2x` | 512 MB | 2 |
| Fly.io | `performance-1x` | 2 GB | 4+ |
| Railway | Starter | 512 MB | 2 |
| Railway | Pro | 8 GB | Many |

### Fly.io (`deploy-fly/`)

```
deploy-fly/
  Dockerfile        → FROM base + COPY config.json
  fly.toml          → App name, region, memory, volume, ports
  config.json       → Server branding + instance definitions (single file)
```

**Dockerfile:**
```dockerfile
FROM ghcr.io/neonetrek/client-server:main

COPY config.json /opt/config.json
```

**fly.toml:**
```toml
app = "my-neonetrek"
primary_region = "iad"

[build]

[env]
  WS_PORT = "3000"

[mounts]
  source = "netrek_data"
  destination = "/opt/netrek/var"

# HTTP: portal + WebSocket proxy (routes to all instances internally)
[[services]]
  protocol = "tcp"
  internal_port = 3000

  [[services.ports]]
    port = 80
    handlers = ["http"]

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

# TCP: native Netrek clients reach the first instance
[[services]]
  protocol = "tcp"
  internal_port = 2592

  [[services.ports]]
    port = 2592
```

Additional C server instances (2593, 2594) are internal-only — browsers reach them through the ws-proxy on port 3000. Native Netrek clients can only reach the first instance on 2592 unless the operator adds more `[[services]]` blocks.

**Scaling up**: To add a second instance, the deployer adds an entry to the `instances` array in `config.json` and bumps the Fly machine to `shared-cpu-2x`:
```bash
fly scale vm shared-cpu-2x
fly deploy
```

### Railway (`deploy-railway/`)

```
deploy-railway/
  Dockerfile        → FROM base + COPY config.json
  config.json       → Server branding + instance definitions (single file)
```

**Dockerfile:**
```dockerfile
FROM ghcr.io/neonetrek/client-server:main

COPY config.json /opt/config.json
```

**Railway settings:**
- Expose port **3000** (HTTP + WebSocket) — only port needed for web players
- Optionally expose port **2592** (TCP) for native clients
- Volume mount: `/opt/netrek/var` (1 GB)

Railway's single-service model works well since all instances share one container and the ws-proxy routes internally.

### Backward Compatibility

Deployers who don't add `config.json` get the same single-instance behavior as today:
- The ws-proxy falls back to `NETREK_HOST:NETREK_PORT` (env vars)
- The portal shows the single-server hero (no instance picker)
- `/ws` connects to the default server

Deployers who add `config.json` with one instance get a single game mode with no picker. Multiple instances activate the instance picker cards on the portal.

### Example Configurations

**Single instance, bots only (beginner server):**
```json
{
  "server": {
    "name": "Practice Server",
    "tagline": "Learn to play Netrek",
    "location": "US East",
    "admin": "YourName",
    "contact": "you@example.com",
    "motd": "Welcome, cadet!",
    "rules": ["Have fun!", "Ask questions in chat"]
  },
  "instances": [
    {
      "id": "practice",
      "name": "Practice with Bots",
      "description": "Play against bots, learn the game",
      "port": 2592,
      "features": ["bots", "practice", "beginner-friendly"],
      "sysdef": { "PRET": 1, "PRET_GUEST": 1, "FPS": 50 }
    }
  ]
}
```
Needs ~200 MB. Portal shows one "Play Now" button, no picker.

**Two instances, pickup + bots:**
```json
{
  "server": {
    "name": "My NeoNetrek Server",
    "tagline": "A community Netrek server",
    "location": "US East",
    "admin": "YourName",
    "contact": "you@example.com",
    "motd": "Welcome aboard, pilot!",
    "rules": ["Be respectful", "Team play encouraged", "Have fun!"]
  },
  "instances": [
    {
      "id": "pickup",
      "name": "Standard Pickup",
      "description": "Classic Bronco team play — no bots",
      "port": 2592,
      "features": ["bronco", "pickup"],
      "sysdef": { "PRET": 0, "NEWBIE": 0, "FPS": 50 }
    },
    {
      "id": "bots",
      "name": "Practice with Bots",
      "description": "4v4 with robot opponents",
      "port": 2593,
      "features": ["bots", "practice"],
      "sysdef": { "PRET": 1, "PRET_GUEST": 1, "FPS": 50 }
    }
  ]
}
```
Needs ~400 MB. Portal shows two cards with player counts and separate "Play" buttons.

**Three instances, full experience:**
```json
{
  "server": {
    "name": "NeoNetrek Central",
    "tagline": "Every game mode, one server",
    "location": "US East",
    "admin": "YourName",
    "contact": "you@example.com",
    "motd": "Welcome aboard!",
    "rules": ["Be respectful", "Team play encouraged", "Have fun!"]
  },
  "instances": [
    {
      "id": "pickup",
      "name": "Standard Pickup",
      "description": "Classic Bronco team play",
      "port": 2592,
      "features": ["bronco", "pickup"],
      "sysdef": { "PRET": 0, "NEWBIE": 0, "FPS": 50 }
    },
    {
      "id": "bots",
      "name": "Practice with Bots",
      "description": "4v4 with robot opponents",
      "port": 2593,
      "features": ["bots", "practice"],
      "sysdef": { "PRET": 1, "PRET_GUEST": 1, "FPS": 50 }
    },
    {
      "id": "dogfight",
      "name": "Dogfight Arena",
      "description": "1v1 and small team dogfighting",
      "port": 2594,
      "features": ["dogfight", "fast"],
      "sysdef": { "DOGFIGHT": 1, "CONTESTSIZE": 2, "FPS": 50 }
    }
  ]
}
```
Needs ~600 MB. Portal shows three cards.

---

## References

- [Vanilla Netrek Server](https://github.com/quozl/netrek-server) — C server with robotd + robots
- [Netrek Game Design](https://www.netrek.org/developer/design.html) — Official design docs
- [MIT Netrek Collective](https://vismod.media.mit.edu/vismod/demos/netrek/robots.html) — Bot team coordination research
- [History of Netrek](https://fadden.com/gaming/netrek-history.html) — Borg wars timeline
- [CMU Netrek Archive](https://www.cs.cmu.edu/~hde/netrek/) — Historical bot source code
