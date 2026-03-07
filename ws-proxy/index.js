/**
 * NeoNetrek WebSocket-to-TCP Proxy
 *
 * Bridges browser WebSocket connections to Netrek C server TCP ports.
 * Supports multiple game instances via /ws/:instanceId routing.
 * Serves the per-server portal at / and the web client at /play/.
 *
 * Architecture:
 *   Browser <--WebSocket /ws/:id--> this proxy <--TCP :port--> netrekd instance
 *
 * Data is sent as raw binary ArrayBuffers over WebSocket,
 * and forwarded as-is to the TCP socket (and vice versa).
 */

const net = require('net');
const http = require('http');
const fs = require('fs');
const express = require('express');
const { WebSocketServer } = require('ws');
const path = require('path');

const NETREK_HOST = process.env.NETREK_HOST || '127.0.0.1';
const NETREK_PORT = parseInt(process.env.NETREK_PORT || '2592', 10);
const WS_PORT = parseInt(process.env.WS_PORT || process.env.PORT || '3000', 10);
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, '..', 'web-client', 'dist');
const PORTAL_DIR = process.env.PORTAL_DIR || path.join(__dirname, '..', 'portal');
const CONFIG_FILE = process.env.NEONETREK_CONFIG || '/opt/config.json';

// ---- Load instances configuration from config.json ----
let instances = [];
const instanceMap = new Map(); // id → { port, ... }
// Track per-instance connection counts
const instanceConnections = new Map(); // id → Set<ws>

try {
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  instances = config.instances || [];
  for (const inst of instances) {
    instanceMap.set(inst.id, inst);
    instanceConnections.set(inst.id, new Set());
  }
  console.log(`[proxy] Loaded ${instances.length} instance(s) from ${CONFIG_FILE}`);
} catch (err) {
  console.log(`[proxy] No config.json found, using single-instance mode (port ${NETREK_PORT})`);
}

const app = express();

// Health check endpoint for container orchestrators
// CORS allowed so other NeoNetrek portals can show server status
app.get('/health', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  const totalConnections = Array.from(instanceConnections.values())
    .reduce((sum, set) => sum + set.size, 0);
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    connections: totalConnections || (wss ? wss.clients.size : 0),
    netrek: { host: NETREK_HOST, port: NETREK_PORT },
  });
});

// Instances API — returns instance list with live player counts
app.get('/api/instances', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.json(instances.map(inst => ({
    ...inst,
    connections: instanceConnections.has(inst.id) ? instanceConnections.get(inst.id).size : 0,
    status: 'online',
  })));
});

// Leaderboard API — per-instance player stats
// Uses ?instance=<id> query param, defaults to first instance
app.get('/api/leaderboard', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  const instanceId = req.query.instance || (instances[0] && instances[0].id) || 'default';
  const inst = instanceMap.get(instanceId);
  if (!inst && instances.length > 0) {
    return res.status(404).json({ error: 'Unknown instance' });
  }

  // Player DB is a flat binary file at LOCALSTATEDIR/players
  const playerFile = path.join('/opt/netrek/var', instanceId, 'players');
  try {
    const data = fs.readFileSync(playerFile);
    const players = parsePlayerDB(data);
    res.json(players);
  } catch (err) {
    // No player file yet — nobody has played
    res.json([]);
  }
});

// ---- Netrek player database binary parser ----
// struct statentry { char name[16]; char password[16]; struct stats { ... } }
//
// Build config: LTD_STATS + LTD_PER_RACE + _64BIT + linux (packed structs)
// sizeof(struct ltd_stats) = 324 bytes (packed)
// LTD_NUM_RACES = 5, LTD_NUM_SHIPS = 8
// sizeof(struct stats) = 5*8*324 + 4 + 4 + 96 + 4 = 13068
// sizeof(struct statentry) = 16 + 16 + 13068 = 13100

const LTD_STATS_SIZE = 324;       // sizeof(packed struct ltd_stats)
const LTD_NUM_RACES = 5;
const LTD_NUM_SHIPS = 8;
const LTD_SB = 6;                 // ship index to skip when summing
const NAME_LEN = 16;
const EXPECTED_RECORD_SIZE = 13100;

// Offsets within packed struct ltd_stats
const LTD_OFF_KILLS_TOTAL  = 0;   // kills.total (uint32)
const LTD_OFF_DEATHS_TOTAL = 48;  // deaths.total (uint32)
const LTD_OFF_PLANETS_TAKEN = 80; // planets.taken (uint32)
const LTD_OFF_BOMB_ARMIES  = 100; // bomb.armies (uint32)
const LTD_OFF_OGGED_ARMIES = 112; // ogged.armies (uint32)
const LTD_OFF_TICKS_TOTAL  = 196; // ticks.total (uint32)

// Offset of st_rank within statentry: name[16] + password[16] + ltd[5*8*324] + lastlogin(4) + flags(4) + keymap(96)
const RANK_OFFSET = 32 + (LTD_NUM_RACES * LTD_NUM_SHIPS * LTD_STATS_SIZE) + 4 + 4 + 96;

function parsePlayerDB(buf) {
  if (buf.length < 32) return [];

  const RECORD_SIZE = detectRecordSize(buf);
  if (!RECORD_SIZE) return [];

  const players = [];
  for (let offset = 0; offset + RECORD_SIZE <= buf.length; offset += RECORD_SIZE) {
    const name = buf.toString('ascii', offset, offset + NAME_LEN).replace(/\0.*/, '');
    if (!name || name.length === 0) continue;

    // Sum LTD stats across all races and non-SB ships
    let killsTotal = 0, deathsTotal = 0, planetsTaken = 0;
    let bombArmies = 0, oggedArmies = 0, ticksTotal = 0;

    const statsBase = offset + 32; // after name[16] + password[16]

    for (let r = 0; r < LTD_NUM_RACES; r++) {
      for (let s = 1; s < LTD_NUM_SHIPS; s++) {
        if (s === LTD_SB) continue;
        const ltdBase = statsBase + (r * LTD_NUM_SHIPS + s) * LTD_STATS_SIZE;
        if (ltdBase + LTD_STATS_SIZE > offset + RECORD_SIZE) break;

        killsTotal   += buf.readUInt32LE(ltdBase + LTD_OFF_KILLS_TOTAL);
        deathsTotal  += buf.readUInt32LE(ltdBase + LTD_OFF_DEATHS_TOTAL);
        planetsTaken += buf.readUInt32LE(ltdBase + LTD_OFF_PLANETS_TAKEN);
        bombArmies   += buf.readUInt32LE(ltdBase + LTD_OFF_BOMB_ARMIES);
        oggedArmies  += buf.readUInt32LE(ltdBase + LTD_OFF_OGGED_ARMIES);
        ticksTotal   += buf.readUInt32LE(ltdBase + LTD_OFF_TICKS_TOTAL);
      }
    }

    // Read rank from known offset (only if record is large enough)
    let rank = 0;
    const rankPos = offset + RANK_OFFSET;
    if (rankPos + 4 <= offset + RECORD_SIZE) {
      rank = buf.readInt32LE(rankPos);
      if (rank < 0 || rank > 8) rank = 0; // sanity clamp
    }

    const hours = Math.round((ticksTotal / 36000) * 10) / 10; // 10 ticks/sec, 1 decimal
    const bombing = bombArmies + 5 * oggedArmies; // matches ltd_armies_bombed()

    players.push({
      name,
      rank,
      hours,
      offense: killsTotal,
      bombing,
      planets: planetsTaken,
      total: killsTotal + bombing + planetsTaken,
    });
  }
  return players;
}

function detectRecordSize(buf) {
  const firstName = buf.toString('ascii', 0, NAME_LEN).replace(/\0.*/, '');
  if (!firstName) return 0;

  // Check expected size first
  if (buf.length >= EXPECTED_RECORD_SIZE) {
    const candidate = buf.toString('ascii', EXPECTED_RECORD_SIZE, EXPECTED_RECORD_SIZE + NAME_LEN).replace(/\0.*/, '');
    if (candidate.length >= 2 && /^[a-zA-Z0-9_\-\.]+$/.test(candidate)) {
      if (buf.length % EXPECTED_RECORD_SIZE === 0) return EXPECTED_RECORD_SIZE;
    }
    // Single player — check if file is exactly one record
    if (buf.length === EXPECTED_RECORD_SIZE) return EXPECTED_RECORD_SIZE;
  }

  // Fallback: scan for the second name
  for (let size = 256; size < buf.length && size < 65536; size++) {
    if (size + NAME_LEN > buf.length) break;
    const candidate = buf.toString('ascii', size, size + NAME_LEN).replace(/\0.*/, '');
    if (candidate.length >= 2 && /^[a-zA-Z0-9_\-\.]+$/.test(candidate)) {
      if (buf.length % size < 32) return size;
    }
  }

  // Last resort: single player with expected size
  if (buf.length >= EXPECTED_RECORD_SIZE) return EXPECTED_RECORD_SIZE;
  return 0;
}

// ---- Global leaderboard: aggregate from all NeoNetrek servers ----
const SERVERS_JSON_URL = 'https://neonetrek.com/servers.json';
const SERVERS_REFRESH_MS = 30 * 60 * 1000; // 30 minutes
const LEADERBOARD_CACHE_MS = 5 * 60 * 1000; // 5 minutes

let knownServers = [];
let leaderboardCache = null; // { updated, players, timestamp }

async function fetchServersList() {
  try {
    const res = await fetch(SERVERS_JSON_URL);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) knownServers = data;
      console.log(`[proxy] Refreshed servers list: ${knownServers.length} server(s)`);
    }
  } catch (err) {
    console.log(`[proxy] Failed to fetch servers.json: ${err.message}`);
  }
}

// Initial fetch + periodic refresh
fetchServersList();
setInterval(fetchServersList, SERVERS_REFRESH_MS);

async function fetchServerLeaderboard(server) {
  const baseUrl = (server.url || '').replace(/\/+$/, '');
  if (!baseUrl) return [];

  const results = [];
  try {
    // Fetch instances list
    const instRes = await fetch(`${baseUrl}/api/instances`, { signal: AbortSignal.timeout(8000) });
    if (!instRes.ok) throw new Error('instances failed');
    const instancesList = await instRes.json();

    // Fetch leaderboard for each instance
    const fetches = instancesList.map(async (inst) => {
      try {
        const lbRes = await fetch(
          `${baseUrl}/api/leaderboard?instance=${encodeURIComponent(inst.id)}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!lbRes.ok) return [];
        const players = await lbRes.json();
        return (Array.isArray(players) ? players : []).map(p => ({
          ...p,
          server: server.name || 'Unknown',
          instance: inst.id || 'default',
        }));
      } catch { return []; }
    });

    const instanceResults = await Promise.allSettled(fetches);
    for (const r of instanceResults) {
      if (r.status === 'fulfilled') results.push(...r.value);
    }
  } catch {
    // Server unreachable — skip
  }
  return results;
}

async function buildGlobalLeaderboard() {
  // Fetch from all servers in parallel
  const serverFetches = knownServers.map(s => fetchServerLeaderboard(s));
  const results = await Promise.allSettled(serverFetches);

  let allPlayers = [];
  for (const r of results) {
    if (r.status === 'fulfilled') allPlayers.push(...r.value);
  }

  // Deduplicate: same name + server + instance → keep one (first occurrence)
  const seen = new Set();
  allPlayers = allPlayers.filter(p => {
    const key = `${p.name}\0${p.server}\0${p.instance}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by rank desc, then by total desc
  allPlayers.sort((a, b) => b.rank - a.rank || b.total - a.total);

  return {
    updated: new Date().toISOString(),
    players: allPlayers,
  };
}

app.get('/api/global-leaderboard', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'public, max-age=300');

  // Return cached if fresh
  if (leaderboardCache && Date.now() - leaderboardCache.timestamp < LEADERBOARD_CACHE_MS) {
    return res.json(leaderboardCache.data);
  }

  try {
    const data = await buildGlobalLeaderboard();
    leaderboardCache = { data, timestamp: Date.now() };
    res.json(data);
  } catch (err) {
    console.error('[proxy] Global leaderboard error:', err.message);
    // Return stale cache if available
    if (leaderboardCache) return res.json(leaderboardCache.data);
    res.status(503).json({ error: 'Service temporarily unavailable' });
  }
});

// Web client served at /play/
app.use('/play', express.static(STATIC_DIR));
app.get('/play/*', (req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

// Server portal served at /
app.use(express.static(PORTAL_DIR));
app.get('*', (req, res) => {
  res.sendFile(path.join(PORTAL_DIR, 'index.html'));
});

const server = http.createServer(app);

// WebSocket server — handle upgrade manually for path-based routing
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Parse /ws/:instanceId or /ws (legacy single-instance)
  let targetPort = NETREK_PORT;
  let instanceId = null;

  if (pathname === '/ws') {
    // Legacy single-instance mode — use default port
    if (instances.length === 1) {
      instanceId = instances[0].id;
      targetPort = instances[0].port;
    }
  } else if (pathname.startsWith('/ws/')) {
    instanceId = pathname.slice(4); // strip "/ws/"
    const inst = instanceMap.get(instanceId);
    if (inst) {
      targetPort = inst.port;
    } else {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
  } else {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    ws._instanceId = instanceId;
    ws._targetPort = targetPort;
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  const instanceId = ws._instanceId;
  const targetPort = ws._targetPort;
  const label = instanceId || 'default';

  console.log(`[proxy] Browser connected to instance '${label}' (port ${targetPort})`);

  // Track connection
  if (instanceId && instanceConnections.has(instanceId)) {
    instanceConnections.get(instanceId).add(ws);
  }

  // Open TCP connection to the Netrek server instance
  const tcp = net.connect(targetPort, NETREK_HOST, () => {
    console.log(`[proxy] Connected to netrekd '${label}' on port ${targetPort}`);
  });

  // Forward TCP data from server → browser (as binary)
  tcp.on('data', (data) => {
    if (ws.readyState === ws.OPEN) {
      if (data[0] === 19) {
        console.log(`[proxy:${label}] S→C MASK mask=0x${data[1].toString(16)} (${data.length}B)`);
      } else if (data[0] === 20) {
        console.log(`[proxy:${label}] S→C PSTATUS pnum=${data[1]} status=${data[2]} (${data.length}B)`);
      }
      ws.send(data);
    }
  });

  // Forward WebSocket data from browser → server (as binary)
  ws.on('message', (data) => {
    let buf;
    if (Buffer.isBuffer(data)) {
      buf = data;
    } else if (data instanceof ArrayBuffer) {
      buf = Buffer.from(data);
    } else {
      buf = Buffer.from(data);
    }
    console.log(`[proxy:${label}] C→S ${buf.length}B type=${buf[0]}`);
    tcp.write(buf);
  });

  // Clean up on close
  function cleanup() {
    if (instanceId && instanceConnections.has(instanceId)) {
      instanceConnections.get(instanceId).delete(ws);
    }
  }

  ws.on('close', () => {
    console.log(`[proxy:${label}] Browser disconnected`);
    cleanup();
    tcp.end();
  });

  ws.on('error', (err) => {
    console.error(`[proxy:${label}] WebSocket error:`, err.message);
    cleanup();
    tcp.end();
  });

  tcp.on('end', () => {
    console.log(`[proxy:${label}] Netrek server closed connection`);
    ws.close();
  });

  tcp.on('close', () => {
    ws.close();
  });

  tcp.on('error', (err) => {
    console.error(`[proxy:${label}] TCP error:`, err.message);
    ws.close(1011, 'Server connection error');
  });
});

server.listen(WS_PORT, '0.0.0.0', () => {
  console.log(`[proxy] NeoNetrek listening on port ${WS_PORT}`);
  console.log(`[proxy] Portal: ${PORTAL_DIR} → /`);
  console.log(`[proxy] Client: ${STATIC_DIR} → /play/`);
  if (instances.length > 0) {
    for (const inst of instances) {
      console.log(`[proxy] Instance '${inst.id}': /ws/${inst.id} → ${NETREK_HOST}:${inst.port}`);
    }
  } else {
    console.log(`[proxy] Single-instance: /ws → ${NETREK_HOST}:${NETREK_PORT}`);
  }
});
