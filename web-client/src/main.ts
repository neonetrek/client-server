/**
 * NeoNetrek - Main Entry Point
 *
 * Initializes the game: connects to server, sets up rendering loop,
 * and handles input.
 */

import { createGameState } from './state';
import { NetrekConnection } from './net';
import { Renderer } from './renderer';
import { InputHandler } from './input';
import { REDRAW_RATE } from './constants';

// Create game state
const state = createGameState();

// Get canvas elements
const tacCanvas = document.getElementById('tactical') as HTMLCanvasElement;
const galCanvas = document.getElementById('galactic') as HTMLCanvasElement;
const statusEl = document.getElementById('status')!;

// Create renderer
const renderer = new Renderer(tacCanvas, galCanvas, state);

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
const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
statusEl.textContent = `Connecting to ${wsUrl}...`;
net.connect(wsUrl);

// Render loop
function gameLoop() {
  if (needsRender) {
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

// Handle window resize
window.addEventListener('resize', () => {
  const dpr = window.devicePixelRatio || 1;
  const size = Math.min(window.innerWidth, window.innerHeight - 120);

  for (const canvas of [tacCanvas, galCanvas]) {
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
  }

  const tacCtx = tacCanvas.getContext('2d')!;
  const galCtx = galCanvas.getContext('2d')!;
  tacCtx.scale(dpr, dpr);
  galCtx.scale(dpr, dpr);
  // Restore fonts after canvas resize resets context state
  tacCtx.font = '11px monospace';
  galCtx.font = '10px monospace';

  renderer.updateSize(size);
  needsRender = true;
});

// Prevent context menu on galactic canvas (tactical handled in input.ts)
galCanvas.addEventListener('contextmenu', e => e.preventDefault());
