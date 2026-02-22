/**
 * NeoNetrek - Main Entry Point
 *
 * Initializes the game: connects to server, sets up rendering loop,
 * and handles input. 4-panel layout: tactical + galactic side-by-side,
 * status bar, player list, and message panel.
 */

import { createGameState } from './state';
import { NetrekConnection } from './net';
import { Renderer } from './renderer';
import { InputHandler } from './input';
import { REDRAW_RATE } from './constants';

// Create game state
const state = createGameState();

// Get DOM elements
const tacCanvas = document.getElementById('tactical') as HTMLCanvasElement;
const galCanvas = document.getElementById('galactic') as HTMLCanvasElement;
const statusEl = document.getElementById('status')!;
const statusBarEl = document.getElementById('status-bar')!;
const playerListEl = document.getElementById('player-list')!;
const messagePanelEl = document.getElementById('message-panel')!;

// Create renderer with all panel elements
const renderer = new Renderer(tacCanvas, galCanvas, state, statusBarEl, playerListEl, messagePanelEl);

// State update callback - triggers re-render
let needsRender = true;
function onStateUpdate() {
  needsRender = true;
  updateStatus();
}

// Create network connection
const net = new NetrekConnection(state, onStateUpdate);

// Create input handler
const input = new InputHandler(net, state, renderer);
input.setup(tacCanvas);

// Reset input state on reconnect so login flow works again
net.setReconnectCallback(() => input.resetLoginState());

// Connect to server via WebSocket proxy
// Read instance from URL params (e.g. ?server=bots), default to legacy /ws
const params = new URLSearchParams(window.location.search);
const instanceId = params.get('server');
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsPath = instanceId ? `/ws/${instanceId}` : '/ws';
const wsUrl = `${protocol}//${window.location.host}${wsPath}`;
statusEl.textContent = `Connecting to ${wsUrl}...`;
net.connect(wsUrl);

// Layout sizing: two square canvases side-by-side filling top portion
function resizeLayout() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Each canvas is a square; two side-by-side must fit in viewport width
  // and take ~60% of viewport height
  const canvasSize = Math.min(Math.floor(vw / 2), Math.floor(vh * 0.6));
  renderer.resizeCanvases(canvasSize);
  needsRender = true;
}

resizeLayout();
window.addEventListener('resize', resizeLayout);

// Render loop
function gameLoop() {
  if (needsRender) {
    renderer.helpVisible = input.isHelpVisible;
    renderer.render();
    needsRender = false;
  }
  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

// Also force re-render at REDRAW_RATE for animations
setInterval(() => {
  needsRender = true;
}, REDRAW_RATE);

let lastStatusText = '';
function updateStatus() {
  const parts: string[] = [];

  if (!state.connected) {
    parts.push('DISCONNECTED');
  } else {
    parts.push('CONNECTED');
  }

  if (state.myNumber >= 0) {
    parts.push(`Player #${state.myNumber}`);
  }

  parts.push(`Phase: ${state.phase}`);

  if (state.queuePos >= 0) {
    parts.push(`Queue: ${state.queuePos}`);
  }

  const text = parts.join(' | ');
  if (text !== lastStatusText) {
    statusEl.textContent = text;
    lastStatusText = text;
  }
}

// Prevent context menu on galactic canvas (tactical handled in input.ts)
galCanvas.addEventListener('contextmenu', e => e.preventDefault());
