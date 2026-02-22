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
const INSTANCES_FILE = process.env.NETREK_INSTANCES || '/opt/instances.json';

// ---- Load instances configuration ----
let instances = [];
const instanceMap = new Map(); // id → { port, ... }
// Track per-instance connection counts
const instanceConnections = new Map(); // id → Set<ws>

try {
  const raw = fs.readFileSync(INSTANCES_FILE, 'utf8');
  instances = JSON.parse(raw);
  for (const inst of instances) {
    instanceMap.set(inst.id, inst);
    instanceConnections.set(inst.id, new Set());
  }
  console.log(`[proxy] Loaded ${instances.length} instance(s) from ${INSTANCES_FILE}`);
} catch (err) {
  console.log(`[proxy] No instances.json found, using single-instance mode (port ${NETREK_PORT})`);
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

// Leaderboard API (placeholder - will read from player DB)
app.get('/api/leaderboard', (req, res) => {
  // TODO: Read from GDBM player database at /opt/netrek/var/players
  res.json([]);
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
