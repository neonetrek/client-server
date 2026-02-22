# Hosting a NeoNetrek Server

This guide covers how to deploy your own NeoNetrek server and get it listed in the community server directory.

## What Gets Deployed

A single Docker container runs three processes managed by supervisord:

- **netrekd** - the C Netrek game server (TCP port 2592)
- **WebSocket proxy** - bridges browser connections to netrekd (port 3000)
- **Portal + web client** - static files served by the proxy

Players connect to port 3000 via their browser. Native Netrek clients can connect directly on port 2592.

## Prerequisites

- A fork of this repository: `https://github.com/neonetrek/client-server`
- A [Railway](https://railway.app) or [Fly.io](https://fly.io) account (both have free tiers)

## Deploy to Railway

1. **Fork** this repo on GitHub.

2. **Sign in** to [Railway](https://railway.app) and create a new project.

3. **Connect your fork**: Choose "Deploy from GitHub repo" and select your fork.

4. **Configure the service**:
   - Railway auto-detects the Dockerfile.
   - Under **Settings > Networking**, expose port `3000` and generate a public domain.
   - Optionally expose port `2592` (TCP) for native Netrek clients.

5. **Set environment variables** (optional, defaults are fine):
   ```
   NETREK_PORT=2592
   WS_PORT=3000
   ```

6. **Deploy** - Railway builds and starts the container.

7. **Verify** - visit your Railway domain. You should see the server portal. Click "Play Now" to launch the game.

### Railway tips

- The Dockerfile build takes a few minutes on the first deploy (compiling the C server). Subsequent deploys are faster due to layer caching.
- Railway supports custom domains under project Settings.
- Use Railway's health check feature pointed at `/health` for monitoring.

## Deploy to Fly.io

1. **Fork** this repo and clone it locally.

2. **Install** the [Fly CLI](https://fly.io/docs/flyctl/install/).

3. **Authenticate**:
   ```bash
   fly auth login
   ```

4. **Launch** a new app:
   ```bash
   fly launch
   ```
   When prompted:
   - Choose a name for your app (e.g. `neonetrek-nyc`).
   - Pick a region close to your players.
   - Say **no** to databases/Redis.
   - The existing `fly.toml` will be detected - you can use it as a starting point.

5. **Edit `fly.toml`** to match your app name:
   ```toml
   app = "neonetrek-nyc"          # your chosen app name
   primary_region = "ewr"          # your chosen region
   ```
   The rest of the config (services, health checks, concurrency) can stay as-is.

6. **Deploy**:
   ```bash
   fly deploy
   ```

7. **Verify** - visit `https://<your-app>.fly.dev`. You should see the portal.

### Fly.io tips

- The `fly.toml` in this repo exposes both HTTP (port 3000 mapped to 80/443) and raw TCP (port 2592) services.
- Scale to a larger VM if you expect many concurrent players: `fly scale vm shared-cpu-2x`.
- Monitor your app with `fly logs` and `fly status`.
- Fly supports custom domains via `fly certs add your.domain.com`.

## Customize Your Portal

Edit `portal/config.js` in your fork to set your server's identity:

```javascript
window.NEONETREK_PORTAL = {
  serverName: "US East Bronco",
  serverTagline: "Beginner friendly, all welcome",
  serverHost: "netrek.example.com:2592",
  wsProxy: "wss://netrek.example.com/ws",
  serverLocation: "New York, US",
  adminName: "YourName",
  adminContact: "admin@example.com",
  motd: "<p>Welcome! New players get a warm-up period.</p>",
  rules: [
    "Be respectful to other players",
    "No automated bots without permission",
    "Team play is encouraged",
    "Have fun!",
  ],
};
```

These values appear on your server's portal page.

## Get Listed in the Server Directory

Every NeoNetrek portal shows a Community Servers section populated from `portal/servers.js`. To add your server:

1. **Deploy** your server using one of the methods above and confirm it is reachable.

2. **Edit `portal/servers.js`** in your fork. Add an entry to the `NEONETREK_SERVERS` array:

   ```javascript
   {
     name: "US East Bronco",
     url: "https://neonetrek-nyc.fly.dev",
     location: "New York, US",
     description: "East coast server, low latency for NA players.",
     history: "Started by a group of Netrek veterans from the old bronco days.",
     admin: "YourName",
     established: "2025",
     features: ["Low latency NA", "Clue games Saturdays"],
   },
   ```

   **Field reference:**

   | Field | Required | Description |
   |-------|----------|-------------|
   | `name` | Yes | Short display name |
   | `url` | Yes | Public HTTPS URL of your portal |
   | `location` | Yes | City/region, Country |
   | `description` | Yes | One-line summary |
   | `history` | No | Background story, lore, or server history (shown via "More info" toggle) |
   | `admin` | No | Server operator display name |
   | `established` | No | Year or date launched |
   | `features` | No | Array of short tags describing the server |

3. **Open a pull request** against this repo (`neonetrek/client-server`). Title it something like: `Add [ServerName] to community server directory`.

4. Once merged, the server list updates for all portals on their next deploy.

### Guidelines for server listings

- Your server must be running the code from this repo (or a fork of it).
- The URL must be publicly reachable and respond to `/health`.
- Keep descriptions concise and accurate.
- Do not list servers that are temporary or test-only.

## Local Development

For testing before deploying:

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
