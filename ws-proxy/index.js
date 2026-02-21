/**
 * NeoNetrek WebSocket-to-TCP Proxy
 *
 * Bridges browser WebSocket connections to the Netrek C server's TCP port.
 * Also serves the static web client files.
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

// Express app serves the web client
const app = express();

// Health check endpoint for container orchestrators
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    connections: wss ? wss.clients.size : 0,
    netrek: { host: NETREK_HOST, port: NETREK_PORT },
  });
});

app.use(express.static(STATIC_DIR));
// SPA fallback (exclude /health and /ws)
app.get('*', (req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
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
      ws.send(data);
    }
  });

  // Forward WebSocket data from browser → server (as binary)
  ws.on('message', (data) => {
    if (Buffer.isBuffer(data)) {
      tcp.write(data);
    } else if (data instanceof ArrayBuffer) {
      tcp.write(Buffer.from(data));
    } else {
      // String or other - convert
      tcp.write(Buffer.from(data));
    }
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
  console.log(`[proxy] Static files: ${STATIC_DIR}`);
  console.log(`[proxy] Proxying WebSocket /ws → ${NETREK_HOST}:${NETREK_PORT}`);
});
