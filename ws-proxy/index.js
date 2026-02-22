/**
 * NeoNetrek WebSocket-to-TCP Proxy
 *
 * Bridges browser WebSocket connections to the Netrek C server's TCP port.
 * Serves the per-server portal at / and the web client at /play/.
 *
 * Architecture:
 *   Browser <--WebSocket--> this proxy <--TCP--> netrekd (C server)
 *
 * Data is sent as raw binary ArrayBuffers over WebSocket,
 * and forwarded as-is to the TCP socket (and vice versa).
 */

const net = require('net');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const path = require('path');

const NETREK_HOST = process.env.NETREK_HOST || '127.0.0.1';
const NETREK_PORT = parseInt(process.env.NETREK_PORT || '2592', 10);
const WS_PORT = parseInt(process.env.WS_PORT || '3000', 10);
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, '..', 'web-client', 'dist');
const PORTAL_DIR = process.env.PORTAL_DIR || path.join(__dirname, '..', 'portal');

const app = express();

// Health check endpoint for container orchestrators
// CORS allowed so other NeoNetrek portals can show server status
app.get('/health', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    connections: wss ? wss.clients.size : 0,
    netrek: { host: NETREK_HOST, port: NETREK_PORT },
  });
});

// Leaderboard API (placeholder - will read from player DB)
app.get('/api/leaderboard', (req, res) => {
  // TODO: Read from GDBM player database at /opt/netrek/var/players
  // For now, return empty array indicating no data
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
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('[proxy] Browser connected');

  // Open TCP connection to the Netrek server
  const tcp = net.connect(NETREK_PORT, NETREK_HOST, () => {
    console.log('[proxy] Connected to netrekd');
  });

  // Forward TCP data from server → browser (as binary)
  tcp.on('data', (data) => {
    if (ws.readyState === ws.OPEN) {
      console.log(`[proxy] S→C ${data.length}B first_type=${data[0]}`);
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
    console.log(`[proxy] C→S ${buf.length}B type=${buf[0]} hex=${buf.toString('hex').substring(0, 32)}`);
    tcp.write(buf);
  });

  // Clean up on close
  ws.on('close', () => {
    console.log('[proxy] Browser disconnected');
    tcp.end();
  });

  ws.on('error', (err) => {
    console.error('[proxy] WebSocket error:', err.message);
    tcp.end();
  });

  tcp.on('end', () => {
    console.log('[proxy] Netrek server closed connection');
    ws.close();
  });

  tcp.on('close', () => {
    ws.close();
  });

  tcp.on('error', (err) => {
    console.error('[proxy] TCP error:', err.message);
    ws.close(1011, 'Server connection error');
  });
});

server.listen(WS_PORT, '0.0.0.0', () => {
  console.log(`[proxy] NeoNetrek listening on port ${WS_PORT}`);
  console.log(`[proxy] Portal: ${PORTAL_DIR} → /`);
  console.log(`[proxy] Client: ${STATIC_DIR} → /play/`);
  console.log(`[proxy] Proxying WebSocket /ws → ${NETREK_HOST}:${NETREK_PORT}`);
});
