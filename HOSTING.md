# Hosting a NeoNetrek Server

Deploy your own NeoNetrek server using a pre-built Docker image — no C compiler or build toolchain required.

## Quick Start

Choose your platform:

| Platform | Repo | What you do |
|----------|------|-------------|
| **Fly.io** | [neonetrek/deploy-fly](https://github.com/neonetrek/deploy-fly) | Fork → edit `config.js` + `fly.toml` → `fly deploy` |
| **Railway** | [neonetrek/deploy-railway](https://github.com/neonetrek/deploy-railway) | Fork → connect in Railway dashboard → deploy |

Both repos contain a thin Dockerfile that layers your `config.js` on top of the published image at `ghcr.io/neonetrek/client-server:main`. No compilation, no cloning the full source.

## What Gets Deployed

A single Docker container runs three processes managed by supervisord:

- **netrekd** — the C Netrek game server (TCP port 2592)
- **WebSocket proxy** — bridges browser connections to netrekd (port 3000)
- **Portal + web client** — static files served by the proxy

Players connect to port 3000 via their browser. Native Netrek clients can connect directly on port 2592.

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
