# Hosting a NeoNetrek Server

Deploy your own NeoNetrek server using a pre-built Docker image — no C compiler or build toolchain required.

## Quick Start

Choose your platform:

| Platform | Repo | What you do |
|----------|------|-------------|
| **Fly.io** | [neonetrek/deploy-fly](https://github.com/neonetrek/deploy-fly) | Fork → edit `config.json` + `fly.toml` → `fly deploy` |
| **Railway** | [neonetrek/deploy-railway](https://github.com/neonetrek/deploy-railway) | Fork → connect in Railway dashboard → deploy |

Both repos contain a thin Dockerfile that layers your `config.json` on top of the published image at `ghcr.io/neonetrek/client-server:main`. No compilation, no cloning the full source.

## What Gets Deployed

A single Docker container runs three processes managed by supervisord:

- **netrekd** — the C Netrek game server (TCP port 2592)
- **WebSocket proxy** — bridges browser connections to netrekd (port 3000)
- **Portal + web client** — static files served by the proxy

Players connect to port 3000 via their browser.

## Get Listed in the Server Directory

Every NeoNetrek portal fetches the community server list from `https://neonetrek.com/servers.json` at runtime. To add your server:

1. **Deploy** your server and confirm it is reachable at `/health`.

2. **Open a PR** to [neonetrek/neonetrek.github.io](https://github.com/neonetrek/neonetrek.github.io) adding your entry to `servers.json`:

   ```json
   {
     "name": "US East Bronco",
     "url": "https://neonetrek-nyc.fly.dev",
     "location": "New York, US",
     "description": "East coast server, low latency for NA players.",
     "admin": "YourName",
     "established": "2025",
     "features": ["Low latency NA", "Clue games Saturdays"]
   }
   ```

3. Once merged, your server appears on **all** portals automatically — no rebuild needed.

### Field reference

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Short display name |
| `url` | Yes | Public HTTPS URL of your portal |
| `location` | Yes | City/region, Country |
| `description` | Yes | One-line summary |
| `history` | No | Background story or server lore (shown via "More info" toggle) |
| `admin` | No | Server operator display name |
| `established` | No | Year or date launched |
| `features` | No | Array of short tags describing the server |

### Guidelines

- Your server must respond to `/health` at the listed URL.
- Keep descriptions concise and accurate.
- Do not list servers that are temporary or test-only.

## Server Configuration

Everything is configured through a single `config.json` file. The entrypoint generates all runtime files (portal config, sysdef, motd, supervisord configs) from it at container startup.

### `config.json`

Deploy repos override this file. Here's the full schema:

```json
{
  "server": {
    "name": "My NeoNetrek Server",
    "tagline": "A community Netrek server",
    "location": "Ashburn, US",
    "admin": "YourName",
    "contact": "you@example.com",
    "motd": "Welcome aboard, pilot!",
    "rules": [
      "Be respectful to other players",
      "No automated bots without permission",
      "Team play is encouraged",
      "Have fun!"
    ]
  },
  "instances": [
    {
      "id": "pickup",
      "name": "Standard Pickup",
      "description": "Classic Bronco team play",
      "port": 2592,
      "features": ["bronco", "pickup"],
      "sysdef": {
        "PRET": 0,
        "NEWBIE": 0,
        "DOGFIGHT": 0,
        "FPS": 50,
        "DEFUPS": 25,
        "MAXUPS": 50,
        "RESETGALAXY": 1,
        "SELF_RESET": 1
      }
    }
  ]
}
```

#### `server` fields

| Field | Description |
|-------|-------------|
| `name` | Display name in the portal header |
| `tagline` | Subtitle below the name |
| `location` | City/region shown in connection info |
| `admin` | Your name or handle |
| `contact` | Email or URL |
| `motd` | Message of the day (shown in portal and in-game) |
| `rules` | Array of rule strings |

#### `instances` fields

Each instance runs a separate netrekd process on its own port.

| Field | Description |
|-------|-------------|
| `id` | Short identifier (used in URLs: `/play/?server=pickup`) |
| `name` | Display name in the instance picker |
| `description` | One-line description |
| `port` | TCP port for netrekd (browsers reach it via ws-proxy) |
| `features` | Array of tags shown in the portal |
| `sysdef` | Game rules as key-value pairs (see below) |

#### `sysdef` keys

Common game rule settings for each instance:

| Key | Description |
|-----|-------------|
| `PRET` | Pre-T mode: bots fill empty team slots (0 = off, 1 = on) |
| `PRET_GUEST` | Allow guest logins without a password |
| `PRET_PLANETS` | Planets lead needed to win in pre-T |
| `PRET_SAVE_GALAXY` | Preserve galaxy across T-mode transitions |
| `PRET_GALAXY_LIFETIME` | Galaxy lifetime in seconds |
| `PRET_SAVE_ARMIES` | Preserve armies across transitions |
| `NEWBIE` | Newbie server mode (simplified rules) |
| `DOGFIGHT` | Dogfight mode (small teams, no planets) |
| `FPS` | Server frames per second |
| `DEFUPS` | Default updates per second to clients |
| `MAXUPS` | Maximum updates per second |
| `RESETGALAXY` | Reset galaxy on daemon restart |
| `SELF_RESET` | Galaxy resets when all players leave |

### Other server files

These files are read by the game server at runtime. They can be overridden by adding them to your deploy repo and copying them in your Dockerfile.

| File | Description |
|------|-------------|
| `time` | 7×24 character grid controlling play schedule (O=open, X=closed, C=clue) |
| `features` | Protocol feature flags (defaults work for the web client) |
| `banned` | One banned IP per line |
| `bypass` | One bypass IP per line |
| `nocount` | IPs that don't count toward T-mode |

### Overriding in Deploy Repos

```dockerfile
FROM ghcr.io/neonetrek/client-server:main
COPY config.json /opt/config.json
COPY time /opt/netrek/etc/time
```

## Docker Image Tags

| Tag | When published | Use case |
|-----|----------------|----------|
| `:main` | Every push to main | Rolling dev builds (deploy repo default) |
| `:sha-abc1234` | Every push to main | Pin to exact commit |
| `:v1.0.0` / `:v1.0` / `:v1` | GitHub release | Semver stability |
| `:latest` | GitHub release | Latest formal release |

## Local Development

For working on the server source code itself (not just deploying):

```bash
# Build and run everything locally
docker compose up --build

# Then open http://localhost:3000
```

Or for frontend-only development:

```bash
cd web-client && npm install && npm run dev
```

The Vite dev server proxies `/ws` to `localhost:3000`, so you need either the Docker container or a local netrekd + ws-proxy running.

## Architecture Reference

```
Browser --> :3000/play/ (web client)
        --> :3000/ws    (WebSocket proxy --> netrekd:2592)
        --> :3000/      (portal)
        --> :3000/health (health check JSON)
```

All three processes (netrekd, newstartd, ws-proxy) are managed by supervisord inside the container. See `supervisord.conf` for details.
