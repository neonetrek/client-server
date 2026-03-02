/**
 * Unit tests for InputHandler (input.ts)
 *
 * Covers: login flow state machine, outfit selection, speed keys,
 * toggle commands, phase guards, chat mode, mouse input, and resetLoginState.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InputHandler } from '../input';
import { createGameState, GameState } from '../state';
import {
  PFSHIELD, PFCLOAK, PFORBIT, PFREPAIR, PFBOMB, PFTRACT, PFPRESS,
  FED, ROM, KLI, ORI,
  SCOUT, DESTROYER, CRUISER, BATTLESHIP, ASSAULT, SGALAXY,
  MALL, MTEAM, MINDIV,
  PALIVE,
} from '../constants';

// ============================================================
// Mock NetrekConnection
// ============================================================

function createMockNet() {
  return {
    sendLogin: vi.fn(),
    sendOutfit: vi.fn(),
    sendSpeed: vi.fn(),
    sendDirection: vi.fn(),
    sendTorp: vi.fn(),
    sendPhaser: vi.fn(),
    sendShield: vi.fn(),
    sendCloak: vi.fn(),
    sendRepair: vi.fn(),
    sendOrbit: vi.fn(),
    sendBomb: vi.fn(),
    sendBeam: vi.fn(),
    sendDetTorps: vi.fn(),
    sendDetMyTorp: vi.fn(),
    sendTractor: vi.fn(),
    sendRepress: vi.fn(),
    sendPlasma: vi.fn(),
    sendMessage: vi.fn(),
    sendWar: vi.fn(),
    sendPlanlock: vi.fn(),
    sendPlaylock: vi.fn(),
    sendUpdates: vi.fn(),
    sendQuit: vi.fn(),
    sendBye: vi.fn(),
    quitAndReconnect: vi.fn(),
    audio: {
      toggleMute: vi.fn().mockReturnValue(true),
    },
  } as any;
}

// ============================================================
// Mock Renderer
// ============================================================

function createMockRenderer() {
  return {
    canvasSize: 500,
    canvasWidth: 800,
    canvasHeight: 500,
    isGalacticView: false,
    toggleView: vi.fn(),
  } as any;
}

// ============================================================
// Event helpers
// ============================================================

function keyEvent(key: string, opts: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    preventDefault: vi.fn(),
    ...opts,
  } as any;
}

function mouseEvent(button: number, clientX: number, clientY: number): MouseEvent {
  return {
    button,
    clientX,
    clientY,
    preventDefault: vi.fn(),
  } as any;
}

// ============================================================
// Mock LoginFormController
// ============================================================

function createMockLoginForm() {
  return {
    show: vi.fn(),
    hide: vi.fn(),
    reset: vi.fn(),
    clearPassword: vi.fn(),
    isVisible: false,
  };
}

// ============================================================
// Test setup
// ============================================================

let state: GameState;
let net: ReturnType<typeof createMockNet>;
let renderer: ReturnType<typeof createMockRenderer>;
let mockLoginForm: ReturnType<typeof createMockLoginForm>;
let handler: InputHandler;

/** Access private onKeyDown */
function keyDown(key: string, opts: Partial<KeyboardEvent> = {}) {
  const e = keyEvent(key, opts);
  (handler as any).onKeyDown(e);
  return e;
}

/** Access private onMouseDown with mock canvas */
function mouseDown(button: number, mx: number, my: number) {
  const e = mouseEvent(button, mx, my);
  const canvas = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 500 }),
  };
  (handler as any).onMouseDown(e, canvas);
  return e;
}

describe('InputHandler', () => {
  beforeEach(() => {
    state = createGameState();
    net = createMockNet();
    renderer = createMockRenderer();
    mockLoginForm = createMockLoginForm();
    handler = new InputHandler(net, state, renderer);
    handler.loginForm = mockLoginForm as any;
    state.connected = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================
  // 1. Login flow
  // ============================================================
  describe('Login flow', () => {
    beforeEach(() => {
      state.phase = 'login';
    });

    it('starts in waiting state', () => {
      expect((handler as any).loginState).toBe('waiting');
    });

    it('Enter transitions waiting → formActive and shows form', () => {
      keyDown('Enter');
      expect((handler as any).loginState).toBe('formActive');
      expect(mockLoginForm.show).toHaveBeenCalled();
    });

    it('non-Enter keys are ignored in waiting state', () => {
      keyDown('a');
      expect((handler as any).loginState).toBe('waiting');
      expect(mockLoginForm.show).not.toHaveBeenCalled();
    });

    it('keys are ignored when login form is visible', () => {
      mockLoginForm.isVisible = true;
      keyDown('a');
      // onKeyDown returns early, so nothing happens
      expect(net.sendSpeed).not.toHaveBeenCalled();
    });

    it('retry on rejection: Enter in done state re-shows form', () => {
      // Get to done state
      handler.setLoginDone();
      // phase stays login (server rejected)
      keyDown('Enter');
      expect((handler as any).loginState).toBe('formActive');
      expect(mockLoginForm.clearPassword).toHaveBeenCalled();
      expect(mockLoginForm.show).toHaveBeenCalled();
    });

    it('delegates to outfit when done and phase=outfit', () => {
      handler.setLoginDone();
      state.phase = 'outfit';
      state.teamMask = FED;
      keyDown('f');
      expect(state.myTeam).toBe(FED);
    });

    it('ignores input when not connected', () => {
      state.connected = false;
      keyDown('Enter');
      expect((handler as any).loginState).toBe('waiting');
    });

    it('setLoginDone sets state to done', () => {
      handler.setLoginDone();
      expect((handler as any).loginState).toBe('done');
    });
  });

  // ============================================================
  // 2. Outfit selection
  // ============================================================
  describe('Outfit selection', () => {
    beforeEach(() => {
      state.phase = 'outfit';
      state.teamMask = FED | ROM | KLI | ORI;
    });

    it('f selects Federation', () => {
      keyDown('f');
      expect(state.myTeam).toBe(FED);
    });

    it('r selects Romulan', () => {
      keyDown('r');
      expect(state.myTeam).toBe(ROM);
    });

    it('K selects Klingon (uppercase)', () => {
      keyDown('K');
      expect(state.myTeam).toBe(KLI);
    });

    it('O selects Orion (uppercase)', () => {
      keyDown('O');
      expect(state.myTeam).toBe(ORI);
    });

    it('rejects team not in teamMask', () => {
      state.teamMask = FED; // only fed allowed
      keyDown('r');
      expect(state.myTeam).toBe(0); // not changed
      expect(state.warningText).toContain('not available');
    });

    it('ship key sends outfit after team chosen', () => {
      keyDown('f'); // select team
      keyDown('c'); // cruiser
      expect(net.sendOutfit).toHaveBeenCalledWith(FED, CRUISER);
    });

    it('ship key shows prompt when no team selected', () => {
      keyDown('c'); // no team yet
      expect(net.sendOutfit).not.toHaveBeenCalled();
      expect(state.warningText).toContain('team');
    });

    it('works in dead phase too', () => {
      state.phase = 'dead';
      keyDown('r');
      expect(state.myTeam).toBe(ROM);
    });
  });

  // ============================================================
  // 3. Speed keys
  // ============================================================
  describe('Speed keys', () => {
    beforeEach(() => {
      state.phase = 'alive';
      state.myNumber = 0;
      state.players[0].status = 2; // PALIVE
    });

    it('digits 0-9 set speed', () => {
      for (let i = 0; i <= 9; i++) {
        // Ensure current speed differs so the dedup guard doesn't skip
        state.players[0].speed = i === 0 ? 5 : 0;
        net.sendSpeed.mockClear();
        keyDown(String(i));
        expect(net.sendSpeed).toHaveBeenCalledWith(i);
      }
    });

    it('! sends speed 10', () => {
      keyDown('!');
      expect(net.sendSpeed).toHaveBeenCalledWith(10);
    });

    it('@ sends speed 11', () => {
      keyDown('@');
      expect(net.sendSpeed).toHaveBeenCalledWith(11);
    });

    it('# sends speed 12', () => {
      keyDown('#');
      expect(net.sendSpeed).toHaveBeenCalledWith(12);
    });

    it('speed keys call preventDefault', () => {
      const e = keyDown('5');
      expect(e.preventDefault).toHaveBeenCalled();
    });
  });

  // ============================================================
  // 4. Toggle commands
  // ============================================================
  describe('Toggle commands', () => {
    beforeEach(() => {
      state.phase = 'alive';
      state.myNumber = 0;
      state.players[0].flags = 0;
      state.players[0].team = FED;
    });

    it('s toggles shields on', () => {
      keyDown('s');
      expect(net.sendShield).toHaveBeenCalledWith(true);
    });

    it('s toggles shields off when already on', () => {
      state.players[0].flags = PFSHIELD;
      keyDown('s');
      expect(net.sendShield).toHaveBeenCalledWith(false);
    });

    it('f toggles cloak on', () => {
      keyDown('f');
      expect(net.sendCloak).toHaveBeenCalledWith(true);
    });

    it('f toggles cloak off when already cloaked', () => {
      state.players[0].flags = PFCLOAK;
      keyDown('f');
      expect(net.sendCloak).toHaveBeenCalledWith(false);
    });

    it('g toggles repair on', () => {
      keyDown('g');
      expect(net.sendRepair).toHaveBeenCalledWith(true);
    });

    it('g toggles repair off when repairing', () => {
      state.players[0].flags = PFREPAIR;
      keyDown('g');
      expect(net.sendRepair).toHaveBeenCalledWith(false);
    });

    it('c toggles orbit on', () => {
      keyDown('c');
      expect(net.sendOrbit).toHaveBeenCalledWith(true);
    });

    it('c toggles orbit off when orbiting', () => {
      state.players[0].flags = PFORBIT;
      keyDown('c');
      expect(net.sendOrbit).toHaveBeenCalledWith(false);
    });

    it('b toggles bomb on', () => {
      keyDown('b');
      expect(net.sendBomb).toHaveBeenCalledWith(true);
    });

    it('b toggles bomb off when bombing', () => {
      state.players[0].flags = PFBOMB;
      keyDown('b');
      expect(net.sendBomb).toHaveBeenCalledWith(false);
    });

    it('z beams up', () => {
      keyDown('z');
      expect(net.sendBeam).toHaveBeenCalledWith(true);
    });

    it('x beams down', () => {
      keyDown('x');
      expect(net.sendBeam).toHaveBeenCalledWith(false);
    });

    it('d dets enemy torps', () => {
      keyDown('d');
      expect(net.sendDetTorps).toHaveBeenCalled();
    });

    it('t/T fires plasma', () => {
      state.players[0].dir = 64;
      keyDown('t');
      expect(net.sendPlasma).toHaveBeenCalledWith(64);
    });

    it('w key sends torpedo', () => {
      keyDown('w');
      expect(net.sendTorp).toHaveBeenCalled();
    });

    it('q activates tractor beam on nearest target', () => {
      state.players[0].flags = 0;
      state.players[0].x = 5000;
      state.players[0].y = 5000;
      // Place a nearby alive enemy as target
      state.players[1].status = PALIVE;
      state.players[1].x = 5500;
      state.players[1].y = 5000;
      state.players[1].number = 1;
      keyDown('q');
      expect(net.sendTractor).toHaveBeenCalledWith(true, 1);
    });

    it('q releases tractor beam when already locked', () => {
      state.players[0].flags = PFTRACT;
      keyDown('q');
      expect(net.sendTractor).toHaveBeenCalledWith(false, 0);
    });

    it('r activates repressor on nearest target', () => {
      state.players[0].flags = 0;
      state.players[0].x = 5000;
      state.players[0].y = 5000;
      // Place a nearby alive enemy as target
      state.players[1].status = PALIVE;
      state.players[1].x = 5500;
      state.players[1].y = 5000;
      state.players[1].number = 1;
      keyDown('r');
      expect(net.sendRepress).toHaveBeenCalledWith(true, 1);
    });

    it('r releases repressor when already pressing', () => {
      state.players[0].flags = PFPRESS;
      keyDown('r');
      expect(net.sendRepress).toHaveBeenCalledWith(false, 0);
    });

    it('W declares war on all enemies', () => {
      state.players[0].team = FED;
      keyDown('W');
      expect(net.sendWar).toHaveBeenCalledWith(ROM | KLI | ORI);
    });

    it('M toggles mute', () => {
      keyDown('M');
      expect(net.audio.toggleMute).toHaveBeenCalled();
      expect(state.warningText).toContain('Sound');
    });

    it('Q with shift twice sends quit (double-press confirmation)', () => {
      keyDown('Q', { shiftKey: true });
      expect(net.quitAndReconnect).not.toHaveBeenCalled();
      keyDown('Q', { shiftKey: true });
      expect(net.quitAndReconnect).toHaveBeenCalled();
    });

    it('Q without shift does not quit', () => {
      keyDown('Q', { shiftKey: false });
      keyDown('Q', { shiftKey: false });
      expect(net.quitAndReconnect).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 5. Phase guards
  // ============================================================
  describe('Phase guards', () => {
    it('gameplay keys ignored in login phase', () => {
      state.phase = 'login';
      keyDown('5');
      expect(net.sendSpeed).not.toHaveBeenCalled();
    });

    it('gameplay keys ignored in outfit phase', () => {
      state.phase = 'outfit';
      state.teamMask = 0;
      keyDown('5');
      expect(net.sendSpeed).not.toHaveBeenCalled();
    });

    it('no crash when myNumber=-1 and alive', () => {
      state.phase = 'alive';
      state.myNumber = -1;
      // handleGameplayInput checks me = state.players[myNumber]
      // players[-1] is undefined, should early-return
      expect(() => keyDown('s')).not.toThrow();
    });
  });

  // ============================================================
  // 6. Chat mode
  // ============================================================
  describe('Chat mode', () => {
    beforeEach(() => {
      state.phase = 'alive';
      state.myNumber = 0;
      state.players[0].flags = 0;
    });

    it('; enters all-chat mode', () => {
      keyDown(';');
      expect(handler.isChatting).toBe(true);
      expect(handler.chatTargetLabel).toBe('ALL');
    });

    it('Enter enters team-chat mode', () => {
      keyDown('Enter');
      expect(handler.isChatting).toBe(true);
      expect(handler.chatTargetLabel).toBe('TEAM');
    });

    it('typing accumulates in chat buffer', () => {
      keyDown(';');
      keyDown('H');
      keyDown('i');
      expect(handler.chatText).toBe('Hi');
    });

    it('backspace removes last char in chat', () => {
      keyDown(';');
      keyDown('H');
      keyDown('i');
      keyDown('Backspace');
      expect(handler.chatText).toBe('H');
    });

    it('79-char limit on chat', () => {
      keyDown(';');
      for (let i = 0; i < 85; i++) keyDown('a');
      expect(handler.chatText.length).toBe(79);
    });

    it('Enter sends message with correct group flag (all)', () => {
      keyDown(';'); // enter all-chat
      keyDown('H');
      keyDown('i');
      keyDown('Enter'); // send
      expect(net.sendMessage).toHaveBeenCalledWith(0, MALL, 'Hi');
      expect(handler.isChatting).toBe(false);
    });

    it('Enter sends message with correct group flag (team)', () => {
      keyDown('Enter'); // enter team-chat
      keyDown('G');
      keyDown('o');
      keyDown('Enter'); // send
      expect(net.sendMessage).toHaveBeenCalledWith(0, MTEAM, 'Go');
    });

    it('empty message is not sent', () => {
      keyDown(';');
      keyDown('Enter'); // send with empty buffer
      expect(net.sendMessage).not.toHaveBeenCalled();
    });

    it('Escape cancels chat', () => {
      keyDown(';');
      keyDown('H');
      keyDown('Escape');
      expect(handler.isChatting).toBe(false);
      expect(handler.chatText).toBe('');
    });

    it('chat exits after send', () => {
      keyDown(';');
      keyDown('x');
      keyDown('Enter');
      expect(handler.isChatting).toBe(false);
    });

    it('chat intercepts all keys', () => {
      keyDown(';');
      keyDown('5'); // would normally send speed
      expect(net.sendSpeed).not.toHaveBeenCalled();
      expect(handler.chatText).toBe('5');
    });

    it('chat mode prevents default on all keys', () => {
      keyDown(';');
      const e = keyDown('a');
      expect(e.preventDefault).toHaveBeenCalled();
    });
  });

  // ============================================================
  // 7. Mouse input
  // ============================================================
  describe('Mouse input', () => {
    beforeEach(() => {
      state.phase = 'alive';
      state.myNumber = 0;
    });

    // Canvas is 800x500 (center at 400, 250)
    it('left click sends direction', () => {
      mouseDown(0, 400, 0); // top center → north
      expect(net.sendDirection).toHaveBeenCalled();
    });

    it('middle click sends phaser', () => {
      mouseDown(1, 400, 0);
      expect(net.sendPhaser).toHaveBeenCalled();
    });

    it('e key sends phaser', () => {
      keyDown('e');
      expect(net.sendPhaser).toHaveBeenCalled();
    });

    it('right click sends torpedo', () => {
      mouseDown(2, 400, 0);
      expect(net.sendTorp).toHaveBeenCalled();
    });

    it('north direction is ~0', () => {
      mouseDown(0, 400, 0); // straight up from center
      const dir = net.sendDirection.mock.calls[0][0];
      // Netrek dir: 0=north, wraps around 256
      // Straight up from center: angle = -PI/2, dir = 0
      expect(dir).toBeLessThan(10); // approximately 0
    });

    it('east direction is ~64', () => {
      mouseDown(0, 800, 250); // right edge from center
      const dir = net.sendDirection.mock.calls[0][0];
      expect(Math.abs(dir - 64)).toBeLessThan(10);
    });

    it('mouse ignored in non-alive phase', () => {
      state.phase = 'outfit';
      mouseDown(0, 250, 0);
      expect(net.sendDirection).not.toHaveBeenCalled();
    });

    it('mouse ignored during chat', () => {
      keyDown(';'); // enter chat
      mouseDown(0, 250, 0);
      expect(net.sendDirection).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 8. resetLoginState
  // ============================================================
  describe('resetLoginState', () => {
    it('resets all login and chat state', () => {
      // Get to formActive state
      state.phase = 'login';
      keyDown('Enter'); // waiting → formActive

      handler.resetLoginState();
      expect((handler as any).loginState).toBe('waiting');
      expect(handler.isChatting).toBe(false);
      expect(handler.chatText).toBe('');
      expect(mockLoginForm.reset).toHaveBeenCalled();
      expect(mockLoginForm.hide).toHaveBeenCalled();
    });
  });
});
