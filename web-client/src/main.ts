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
import { LoginFormController } from './login-form';
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

// Forward-declared so onStateUpdate can reference it (initialized after net)
let loginForm: LoginFormController;

// State update callback - triggers re-render
let needsRender = true;
function onStateUpdate() {
  needsRender = true;
  // Hide login form when game transitions past login phase
  if (loginForm) {
    if (state.phase !== 'login') {
      loginForm.hide();
    }
    renderer.loginFormVisible = loginForm.isVisible;
  }
  updateStatus();
}

// Create network connection
const net = new NetrekConnection(state, onStateUpdate);

// Wire audio engine to renderer for engine hum
renderer.setAudio(net.audio);

// Create input handler
const input = new InputHandler(net, state, renderer);
input.setup(tacCanvas);

// Create login form controller and wire to input handler
loginForm = new LoginFormController(net, state, () => input.setLoginDone());
input.loginForm = loginForm;

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

// Layout sizing: tactical is wide (full panel width), galactic is square
function resizeLayout() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Height for both canvases: ~60% of viewport (same as before)
  const canvasHeight = Math.min(Math.floor(vw / 2), Math.floor(vh * 0.6));
  // Galactic stays square at that height
  const galSize = canvasHeight;
  // Tactical fills remaining width
  const tacWidth = Math.floor(vw - galSize - 2);
  renderer.resizeCanvases(tacWidth, canvasHeight, galSize);
  needsRender = true;
}

resizeLayout();
window.addEventListener('resize', resizeLayout);

// FPS counter (enabled with ?fps query param)
const showFps = params.has('fps');
let fpsEl: HTMLDivElement | null = null;
let fpsFrames = 0;
let fpsLastTime = performance.now();

if (showFps) {
  fpsEl = document.createElement('div');
  fpsEl.style.cssText = 'position:fixed;top:4px;right:4px;font:11px monospace;color:#0f0;background:rgba(0,0,0,0.6);padding:2px 6px;z-index:9999;pointer-events:none;';
  fpsEl.textContent = '-- fps';
  document.body.appendChild(fpsEl);
}

// Render loop
function gameLoop() {
  if (needsRender) {
    renderer.helpVisible = input.isHelpVisible;
    renderer.render();
    needsRender = false;
  }

  if (showFps) {
    fpsFrames++;
    const now = performance.now();
    const elapsed = now - fpsLastTime;
    if (elapsed >= 1000) {
      fpsEl!.textContent = `${Math.round(fpsFrames * 1000 / elapsed)} fps`;
      fpsFrames = 0;
      fpsLastTime = now;
    }
  }

  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

// Also force re-render at REDRAW_RATE for animations and continuous input
setInterval(() => {
  input.tickHeldKeys();
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
