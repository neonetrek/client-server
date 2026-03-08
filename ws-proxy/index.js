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
 *
 * Realm auth: CP_LOGIN packets are intercepted; the real password is validated
 * against the Realm Controller (bcrypt), then replaced with a proxy secret
 * before forwarding to the C game server.
 */

const net = require('net');
const http = require('http');
const fs = require('fs');
const express = require('express');
const { WebSocketServer } = require('ws');
const path = require('path');
const auth = require('./auth');
const {
  buildSPWarning, buildSPLoginReject, rewritePassword,
  extractString, isCPLogin, isGuestLogin, isQueryLogin,
} = require('./packet-helpers');

const NETREK_HOST = process.env.NETREK_HOST || '127.0.0.1';
const NETREK_PORT = parseInt(process.env.NETREK_PORT || '2592', 10);
const WS_PORT = parseInt(process.env.WS_PORT || process.env.PORT || '3000', 10);
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, '..', 'web-client', 'dist');
const PORTAL_DIR = process.env.PORTAL_DIR || path.join(__dirname, '..', 'portal');
const CONFIG_FILE = process.env.NEONETREK_CONFIG || '/opt/config.json';

// ---- Load instances configuration from config.json ----
let instances = [];
let realmConfig = null;
let serverName = 'Unknown';
const instanceMap = new Map(); // id → { port, ... }
// Track per-instance connection counts
const instanceConnections = new Map(); // id → Set<ws>

try {
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  instances = config.instances || [];
  realmConfig = config.realm || null;
  serverName = (config.server && config.server.name) || 'Unknown';
  for (const inst of instances) {
    instanceMap.set(inst.id, inst);
    instanceConnections.set(inst.id, new Set());
  }
  console.log(`[proxy] Loaded ${instances.length} instance(s) from ${CONFIG_FILE}`);
} catch (err) {
  console.log(`[proxy] No config.json found, using single-instance mode (port ${NETREK_PORT})`);
}

// ---- Initialize Realm Auth ----
auth.init(realmConfig);

const app = express();

// ---- Realm auth API routes (must be before catch-all static routes) ----
auth.setupRoutes(app);

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

// Leaderboard API — per-instance player stats (kept for portal)
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
      kills: killsTotal,
      deaths: deathsTotal,
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

// ---- Stats sync worker ----

const STATS_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const GUEST_ROBOT_PATTERN = /^(guest|robot|clone-|borg)/i;

function startStatsSync() {
  if (!realmConfig) return;

  setInterval(async () => {
    for (const inst of instances) {
      const playerFile = path.join('/opt/netrek/var', inst.id, 'players');
      try {
        const data = fs.readFileSync(playerFile);
        const players = parsePlayerDB(data);

        // Filter out guests and robots
        const realPlayers = players
          .filter(p => !GUEST_ROBOT_PATTERN.test(p.name))
          .map(p => ({
            ...p,
            server: serverName,
            instance: inst.id,
          }));

        if (realPlayers.length === 0) continue;

        const result = await auth.syncStats(realPlayers);
        if (result && result.ok) {
          console.log(`[stats] Synced ${result.synced} player(s) from instance '${inst.id}'`);
        }
      } catch (err) {
        // No player file or sync failed — skip silently
        if (err.code !== 'ENOENT') {
          console.error(`[stats] Sync error for '${inst.id}':`, err.message);
        }
      }
    }
  }, STATS_SYNC_INTERVAL_MS);

  console.log(`[stats] Stats sync worker started (every ${STATS_SYNC_INTERVAL_MS / 1000}s)`);
}

// ---- Session lock: prevent same account on multiple instances ----
const activeSessions = new Map(); // playerName (lowercase) → { instanceId, ws }

// ---- Rank-on-login: write global best rank into instance .players file ----
function writeRankToPlayerDB(instanceId, name, rank) {
  const playerFile = path.join('/opt/netrek/var', instanceId, 'players');
  let fd;
  try {
    fd = fs.openSync(playerFile, 'r+');
  } catch (err) {
    // File doesn't exist yet — C server will create it on first join
    return;
  }

  try {
    const stat = fs.fstatSync(fd);
    const fileSize = stat.size;
    if (fileSize < EXPECTED_RECORD_SIZE) return;

    const nameBuf = Buffer.alloc(NAME_LEN);
    for (let offset = 0; offset + EXPECTED_RECORD_SIZE <= fileSize; offset += EXPECTED_RECORD_SIZE) {
      // Read the name field (first 16 bytes)
      fs.readSync(fd, nameBuf, 0, NAME_LEN, offset);
      const recordName = nameBuf.toString('ascii').replace(/\0.*/, '');
      if (recordName.toLowerCase() !== name.toLowerCase()) continue;

      // Found matching record — read current rank
      const rankBuf = Buffer.alloc(4);
      fs.readSync(fd, rankBuf, 0, 4, offset + RANK_OFFSET);
      const currentRank = rankBuf.readInt32LE(0);

      if (currentRank >= rank) return; // already at or above this rank

      // Write the new rank
      const newRankBuf = Buffer.alloc(4);
      newRankBuf.writeInt32LE(rank, 0);
      fs.writeSync(fd, newRankBuf, 0, 4, offset + RANK_OFFSET);
      console.log(`[rank] Wrote rank ${rank} for '${name}' on instance '${instanceId}' (was ${currentRank})`);
      return;
    }
    // Player not found in file — will be created by C server on first join
  } finally {
    fs.closeSync(fd);
  }
}

// ---- Password sync: ensure C server .players file has the proxy secret ----
const PASSWORD_OFFSET = 16; // password field starts at byte 16 (after name[16])
const PASSWORD_LEN = 16;

function writePasswordToPlayerDB(instanceId, name, secret) {
  const playerFile = path.join('/opt/netrek/var', instanceId, 'players');
  let fd;
  try {
    fd = fs.openSync(playerFile, 'r+');
  } catch (err) {
    return; // File doesn't exist yet
  }

  try {
    const stat = fs.fstatSync(fd);
    const fileSize = stat.size;
    if (fileSize < EXPECTED_RECORD_SIZE) return;

    const nameBuf = Buffer.alloc(NAME_LEN);
    for (let offset = 0; offset + EXPECTED_RECORD_SIZE <= fileSize; offset += EXPECTED_RECORD_SIZE) {
      fs.readSync(fd, nameBuf, 0, NAME_LEN, offset);
      const recordName = nameBuf.toString('ascii').replace(/\0.*/, '');
      if (recordName.toLowerCase() !== name.toLowerCase()) continue;

      // Read current password
      const pwBuf = Buffer.alloc(PASSWORD_LEN);
      fs.readSync(fd, pwBuf, 0, PASSWORD_LEN, offset + PASSWORD_OFFSET);
      const currentPw = pwBuf.toString('ascii').replace(/\0.*/, '');

      if (currentPw === secret) return; // already correct

      // Write proxy secret as password
      const newPwBuf = Buffer.alloc(PASSWORD_LEN);
      newPwBuf.write(secret.substring(0, 15), 0, 'ascii');
      fs.writeSync(fd, newPwBuf, 0, PASSWORD_LEN, offset + PASSWORD_OFFSET);
      console.log(`[auth] Updated password in .players for '${name}' on instance '${instanceId}'`);
      return;
    }
  } finally {
    fs.closeSync(fd);
  }
}

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
  ws.on('message', async (data) => {
    let buf;
    if (Buffer.isBuffer(data)) {
      buf = data;
    } else if (data instanceof ArrayBuffer) {
      buf = Buffer.from(data);
    } else {
      buf = Buffer.from(data);
    }
    console.log(`[proxy:${label}] C→S ${buf.length}B type=${buf[0]}`);

    // ---- CP_LOGIN interception ----
    if (realmConfig && isCPLogin(buf)) {
      // Query mode (stats query) — forward unmodified
      if (isQueryLogin(buf)) {
        tcp.write(buf);
        return;
      }

      // Guest bypass — forward unmodified
      if (isGuestLogin(buf)) {
        tcp.write(buf);
        return;
      }

      const name = extractString(buf, 4, 16);
      const password = extractString(buf, 20, 16);

      console.log(`[proxy:${label}] CP_LOGIN intercepted for '${name}'`);

      // Validate against realm controller
      const result = await auth.validate(name, password);

      if (!result.ok) {
        // If controller is unreachable, allow guest fallback
        if (result.unreachable) {
          console.log(`[proxy:${label}] Controller unreachable, allowing guest fallback for '${name}'`);
          tcp.write(buf);
          return;
        }

        // Send rejection to client
        const reason = result.error || 'Login failed';
        console.log(`[proxy:${label}] Login rejected for '${name}': ${reason}`);
        ws.send(buildSPWarning(reason));
        ws.send(buildSPLoginReject());
        return;
      }

      // Session lock — prevent same account on multiple instances
      const nameKey = name.toLowerCase();
      const existing = activeSessions.get(nameKey);
      if (existing && existing.ws !== ws && existing.ws.readyState === existing.ws.OPEN) {
        if (existing.instanceId !== instanceId) {
          const existingInst = instanceMap.get(existing.instanceId);
          const existingName = existingInst ? existingInst.name : existing.instanceId;
          const msg = `Already playing on ${existingName}`;
          console.log(`[proxy:${label}] Session lock: '${name}' rejected — ${msg}`);
          ws.send(buildSPWarning(msg));
          ws.send(buildSPLoginReject());
          return;
        }
      }

      // Track session
      activeSessions.set(nameKey, { instanceId, ws });
      ws._playerName = nameKey;

      // Rank-on-login — write global best rank into instance .players file
      try {
        const bestRank = await auth.getBestRank(name);
        if (bestRank > 0 && instanceId) {
          writeRankToPlayerDB(instanceId, name, bestRank);
        }
      } catch (err) {
        console.error(`[rank] Error fetching best rank for '${name}':`, err.message);
      }

      // Ensure .players file has the proxy secret as password (fixes stale passwords)
      if (instanceId) {
        writePasswordToPlayerDB(instanceId, name, realmConfig.proxySecret);
      }

      // Valid — rewrite password with proxy secret and forward
      console.log(`[proxy:${label}] Login validated for '${name}', rewriting password`);
      rewritePassword(buf, realmConfig.proxySecret);
      tcp.write(buf);
      return;
    }

    // Default: forward unmodified
    tcp.write(buf);
  });

  // Clean up on close
  function cleanup() {
    if (instanceId && instanceConnections.has(instanceId)) {
      instanceConnections.get(instanceId).delete(ws);
    }
    // Remove session lock if this ws owns it
    if (ws._playerName) {
      const session = activeSessions.get(ws._playerName);
      if (session && session.ws === ws) {
        activeSessions.delete(ws._playerName);
      }
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

// Start stats sync worker
startStatsSync();
