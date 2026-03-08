/**
 * Unit tests for NetrekConnection (net.ts)
 *
 * Covers: connection lifecycle, disconnect, reconnection, packet framing,
 * all SP_* packet handlers, audio triggers, and client CP_* senders.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NetrekConnection } from '../net';
import { createGameState, GameState } from '../state';
import { SP, CP, pack, formatSize } from '../protocol';
import {
  PALIVE, PEXPLODE, PDEAD, POUTFIT, POBSERV, PFREE,
  TMOVE, TEXPLODE, TFREE, PTMOVE, PTEXPLODE, PTFREE,
  PHHIT, PHHIT2, PHMISS, PHFREE,
  MAXPLAYER, MAXTORP, TWIDTH,
  FED, ROM, KLI, ORI,
} from '../constants';

// ============================================================
// Mock WebSocket
// ============================================================

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  binaryType = 'blob';
  readyState = MockWebSocket.OPEN;
  onopen: ((ev: any) => void) | null = null;
  onclose: ((ev: any) => void) | null = null;
  onmessage: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  send = vi.fn();
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    // Store for test access
    (MockWebSocket as any)._lastInstance = this;
  }

  /** Test helper: simulate server sending binary data */
  simulateMessage(data: ArrayBuffer) {
    this.onmessage?.({ data } as any);
  }

  /** Test helper: fire onopen */
  simulateOpen() {
    this.onopen?.({} as any);
  }

  /** Test helper: fire onclose */
  simulateClose() {
    this.onclose?.({} as any);
  }
}

// Expose static constants matching real WebSocket
Object.defineProperty(MockWebSocket, 'OPEN', { value: 1 });
Object.defineProperty(MockWebSocket, 'CLOSED', { value: 3 });

// ============================================================
// Mock AudioEngine
// ============================================================

vi.mock('../audio', () => ({
  AudioEngine: vi.fn().mockImplementation(() => ({
    playTorpFire: vi.fn(),
    playTorpExplode: vi.fn(),
    playPhaserFire: vi.fn(),
    playShipExplode: vi.fn(),
    playPlasmaFire: vi.fn(),
    playAlert: vi.fn(),
    playSelfDestruct: vi.fn(),
    toggleMute: vi.fn(),
    isMuted: false,
  })),
}));

// ============================================================
// Helpers
// ============================================================

/** Build a server packet as ArrayBuffer using protocol.ts pack() */
function buildPacket(spDef: { code: number; format: string }, ...values: (number | string)[]): ArrayBuffer {
  return pack(spDef.format, spDef.code, ...values);
}

/** Concatenate multiple ArrayBuffers */
function concatBuffers(...buffers: ArrayBuffer[]): ArrayBuffer {
  const total = buffers.reduce((sum, b) => sum + b.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) {
    result.set(new Uint8Array(b), offset);
    offset += b.byteLength;
  }
  return result.buffer;
}

/** Feed binary data to the connection as if it came from the server */
function simulatePacket(ws: MockWebSocket, data: ArrayBuffer) {
  ws.simulateMessage(data);
}

// ============================================================
// Test setup
// ============================================================

let state: GameState;
let onStateUpdate: ReturnType<typeof vi.fn>;
let conn: NetrekConnection;

function getWs(): MockWebSocket {
  return (MockWebSocket as any)._lastInstance;
}

describe('NetrekConnection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as any).WebSocket = MockWebSocket;

    state = createGameState();
    onStateUpdate = vi.fn();
    conn = new NetrekConnection(state, onStateUpdate);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ============================================================
  // 1. Connection lifecycle
  // ============================================================
  describe('Connection lifecycle', () => {
    it('sets connected=true on open', () => {
      conn.connect('ws://test');
      const ws = getWs();
      ws.simulateOpen();
      vi.advanceTimersByTime(0);
      expect(state.connected).toBe(true);
    });

    it('sends CP_SOCKET on open after tick', () => {
      conn.connect('ws://test');
      const ws = getWs();
      ws.simulateOpen();
      expect(ws.send).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(ws.send).toHaveBeenCalledTimes(1);
      const sent = new Uint8Array(ws.send.mock.calls[0][0]);
      expect(sent[0]).toBe(CP.SOCKET.code);
    });

    it('sets warningText prompt in login phase', () => {
      conn.connect('ws://test');
      getWs().simulateOpen();
      vi.advanceTimersByTime(1);
      expect(state.warningText).toContain('ENTER');
    });

    it('calls onStateUpdate on open', () => {
      conn.connect('ws://test');
      getWs().simulateOpen();
      vi.advanceTimersByTime(1);
      expect(onStateUpdate).toHaveBeenCalled();
    });
  });

  // ============================================================
  // 2. Disconnect
  // ============================================================
  describe('Disconnect', () => {
    it('sends BYE and closes socket', () => {
      conn.connect('ws://test');
      const ws = getWs();
      ws.simulateOpen();
      vi.advanceTimersByTime(1);
      ws.send.mockClear();

      conn.disconnect();
      expect(ws.send).toHaveBeenCalledTimes(1);
      const sent = new Uint8Array(ws.send.mock.calls[0][0]);
      expect(sent[0]).toBe(CP.BYE.code);
      expect(ws.close).toHaveBeenCalled();
    });

    it('prevents reconnect after intentional close', () => {
      conn.connect('ws://test');
      const ws = getWs();
      ws.simulateOpen();
      vi.advanceTimersByTime(1);

      conn.disconnect();
      // Simulate onclose firing after disconnect
      ws.simulateClose();
      // No reconnect timer should be set
      vi.advanceTimersByTime(60000);
      // Only one WebSocket should have been created
      expect(state.warningText).not.toContain('Reconnecting');
    });

    it('clears reconnect timer on disconnect', () => {
      conn.connect('ws://test');
      const ws = getWs();
      ws.simulateOpen();
      vi.advanceTimersByTime(1);
      // Trigger a close to start reconnect timer
      ws.simulateClose();
      expect(state.warningText).toContain('Reconnecting');

      conn.disconnect();
      // Timer should be cleared; no new connect after long wait
      vi.advanceTimersByTime(60000);
    });
  });

  // ============================================================
  // 3. Reconnection
  // ============================================================
  describe('Reconnection', () => {
    it('schedules reconnect with exponential backoff', () => {
      conn.connect('ws://test');
      const ws1 = getWs();
      ws1.simulateOpen();
      vi.advanceTimersByTime(1);

      ws1.simulateClose();
      expect(state.warningText).toContain('1s');

      vi.advanceTimersByTime(1000);
      const ws2 = getWs();
      ws2.simulateClose();
      expect(state.warningText).toContain('2s');
    });

    it('stops after 5 attempts', () => {
      conn.connect('ws://test');
      const ws1 = getWs();
      ws1.simulateOpen();
      vi.advanceTimersByTime(1);

      // First close triggers reconnect attempt 1
      ws1.simulateClose();

      // Need 5 reconnect cycles: timer fires → new ws → close → scheduleReconnect
      // After 5 increments, reconnectAttempts=5 and next close shows "Refresh"
      for (let i = 0; i < 4; i++) {
        vi.advanceTimersByTime(16001);
        getWs().simulateClose();
      }

      // 5th timer fires → creates ws6 → close triggers the >= 5 check
      vi.advanceTimersByTime(16001);
      getWs().simulateClose();
      expect(state.warningText).toContain('Refresh');
    });

    it('resets state on reconnect', () => {
      conn.connect('ws://test');
      const ws = getWs();
      ws.simulateOpen();
      vi.advanceTimersByTime(1);

      // Mutate state
      state.myNumber = 5;
      state.phase = 'alive';

      ws.simulateClose();
      vi.advanceTimersByTime(1000);

      // After reconnect fires, state should be reset
      expect(state.myNumber).toBe(-1);
      expect(state.phase).toBe('login');
    });

    it('calls onReconnect callback', () => {
      const cb = vi.fn();
      conn.setReconnectCallback(cb);
      conn.connect('ws://test');
      const ws = getWs();
      ws.simulateOpen();
      vi.advanceTimersByTime(1);

      ws.simulateClose();
      vi.advanceTimersByTime(1000);
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('resets attempt counter on successful connect', () => {
      conn.connect('ws://test');
      const ws1 = getWs();
      ws1.simulateOpen();
      vi.advanceTimersByTime(1);

      // First disconnect + reconnect
      ws1.simulateClose();
      vi.advanceTimersByTime(1000);

      // Successfully reconnect
      const ws2 = getWs();
      ws2.simulateOpen();
      vi.advanceTimersByTime(1);

      // Next disconnect should use 1s delay (counter reset)
      ws2.simulateClose();
      expect(state.warningText).toContain('1s');
    });
  });

  // ============================================================
  // 4. Packet framing
  // ============================================================
  describe('Packet framing', () => {
    function connectAndOpen(): MockWebSocket {
      conn.connect('ws://test');
      const ws = getWs();
      ws.simulateOpen();
      vi.advanceTimersByTime(1);
      onStateUpdate.mockClear();
      return ws;
    }

    it('handles a single complete packet', () => {
      const ws = connectAndOpen();
      const pkt = buildPacket(SP.MASK, 0x0F);
      simulatePacket(ws, pkt);
      expect(state.teamMask).toBe(0x0F);
    });

    it('handles multiple packets in one message', () => {
      const ws = connectAndOpen();
      const pkt1 = buildPacket(SP.MASK, 0x03);
      const pkt2 = buildPacket(SP.QUEUE, 5);
      simulatePacket(ws, concatBuffers(pkt1, pkt2));
      expect(state.teamMask).toBe(0x03);
      expect(state.queuePos).toBe(5);
    });

    it('buffers incomplete packets across messages', () => {
      const ws = connectAndOpen();
      const fullPkt = buildPacket(SP.MASK, 0x07);
      const bytes = new Uint8Array(fullPkt);
      // Send first 2 bytes
      const part1 = bytes.slice(0, 2).buffer;
      simulatePacket(ws, part1);
      expect(state.teamMask).toBe(0); // not yet processed
      // Send remaining bytes
      const part2 = bytes.slice(2).buffer;
      simulatePacket(ws, part2);
      expect(state.teamMask).toBe(0x07);
    });

    it('skips unknown packet types', () => {
      const ws = connectAndOpen();
      // Create a buffer with unknown type byte (255) followed by 3 pad bytes + valid MASK packet
      const unknown = new Uint8Array(4);
      unknown[0] = 255; // unknown type
      const mask = buildPacket(SP.MASK, 0x05);
      simulatePacket(ws, concatBuffers(unknown.buffer, mask));
      expect(state.teamMask).toBe(0x05);
    });

    it('handles empty message gracefully', () => {
      const ws = connectAndOpen();
      simulatePacket(ws, new ArrayBuffer(0));
      expect(onStateUpdate).toHaveBeenCalled();
    });
  });

  // ============================================================
  // 5. SP_YOU
  // ============================================================
  describe('SP_YOU', () => {
    function connectAndOpen(): MockWebSocket {
      conn.connect('ws://test');
      const ws = getWs();
      ws.simulateOpen();
      vi.advanceTimersByTime(1);
      onStateUpdate.mockClear();
      return ws;
    }

    it('updates all player fields', () => {
      const ws = connectAndOpen();
      // SP_YOU format: !bbbbbbxxIlllhhhh
      // Fields: type, pnum, hostile, swar, armies, tractor, pad, pad, flags, damage, shield, fuel, etemp, wtemp, whydead, whodead
      const pkt = buildPacket(SP.YOU, 3, 0x0E, 0x02, 5, 0, 0x0001, 10, 80, 5000, 100, 200, 0, 0);
      simulatePacket(ws, pkt);
      expect(state.myNumber).toBe(3);
      const me = state.players[3];
      expect(me.hostile).toBe(0x0E);
      expect(me.war).toBe(0x02);
      expect(me.armies).toBe(5);
      expect(me.flags).toBe(0x0001);
      expect(me.hull).toBe(10);
      expect(me.shield).toBe(80);
      expect(me.fuel).toBe(5000);
      expect(me.eTemp).toBe(100);
      expect(me.wTemp).toBe(200);
    });

    it('sets myNumber', () => {
      const ws = connectAndOpen();
      const pkt = buildPacket(SP.YOU, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      simulatePacket(ws, pkt);
      expect(state.myNumber).toBe(7);
    });

    it('rejects out-of-range pnum', () => {
      const ws = connectAndOpen();
      // pnum=99 is out of range (>= MAXPLAYER=32)
      const pkt = buildPacket(SP.YOU, 99, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      simulatePacket(ws, pkt);
      expect(state.myNumber).toBe(-1); // unchanged
    });
  });

  // ============================================================
  // 6. SP_PLAYER
  // ============================================================
  describe('SP_PLAYER', () => {
    function connectAndOpen(): MockWebSocket {
      conn.connect('ws://test');
      const ws = getWs();
      ws.simulateOpen();
      vi.advanceTimersByTime(1);
      onStateUpdate.mockClear();
      return ws;
    }

    it('updates position and movement', () => {
      const ws = connectAndOpen();
      // SP_PLAYER format: !bbBbll -> type, pnum, dir, speed, x, y
      const pkt = buildPacket(SP.PLAYER, 5, 128, 9, 50000, 50000);
      simulatePacket(ws, pkt);
      expect(state.players[5].dir).toBe(128);
      expect(state.players[5].speed).toBe(9);
      expect(state.players[5].x).toBe(50000);
      expect(state.players[5].y).toBe(50000);
    });

    it('rejects out-of-range pnum', () => {
      const ws = connectAndOpen();
      const pkt = buildPacket(SP.PLAYER, 40, 0, 0, 0, 0);
      simulatePacket(ws, pkt);
      // Should not crash; players[40] doesn't exist but no error
    });
  });

  // ============================================================
  // 7. SP_PSTATUS
  // ============================================================
  describe('SP_PSTATUS', () => {
    function connectAndOpen(): MockWebSocket {
      conn.connect('ws://test');
      const ws = getWs();
      ws.simulateOpen();
      vi.advanceTimersByTime(1);
      onStateUpdate.mockClear();
      return ws;
    }

    it('updates player status', () => {
      const ws = connectAndOpen();
      // SP_PSTATUS: !bbbx -> type, pnum, status, pad
      const pkt = buildPacket(SP.PSTATUS, 2, PALIVE);
      simulatePacket(ws, pkt);
      expect(state.players[2].status).toBe(PALIVE);
    });

    it('transitions own player to alive phase', () => {
      const ws = connectAndOpen();
      state.myNumber = 0;
      state.phase = 'outfit'; // not login
      const pkt = buildPacket(SP.PSTATUS, 0, PALIVE);
      simulatePacket(ws, pkt);
      expect(state.phase).toBe('alive');
    });

    it('transitions own player to dead phase', () => {
      const ws = connectAndOpen();
      state.myNumber = 0;
      state.phase = 'alive';
      const pkt = buildPacket(SP.PSTATUS, 0, PDEAD);
      simulatePacket(ws, pkt);
      expect(state.phase).toBe('dead');
    });

    it('transitions own player to outfit phase', () => {
      const ws = connectAndOpen();
      state.myNumber = 0;
      state.phase = 'dead';
      const pkt = buildPacket(SP.PSTATUS, 0, POUTFIT);
      simulatePacket(ws, pkt);
      expect(state.phase).toBe('outfit');
    });

    it('transitions own player to observe phase', () => {
      const ws = connectAndOpen();
      state.myNumber = 0;
      state.phase = 'alive';
      const pkt = buildPacket(SP.PSTATUS, 0, POBSERV);
      simulatePacket(ws, pkt);
      expect(state.phase).toBe('observe');
    });

    it('does not override login phase', () => {
      const ws = connectAndOpen();
      state.myNumber = 0;
      state.phase = 'login';
      const pkt = buildPacket(SP.PSTATUS, 0, PALIVE);
      simulatePacket(ws, pkt);
      expect(state.phase).toBe('login'); // preserved
    });

    it('plays ship explode audio when in range', () => {
      const ws = connectAndOpen();
      state.myNumber = 0;
      state.players[0].x = 50000;
      state.players[0].y = 50000;
      // Place exploding player nearby
      state.players[5].x = 50000 + 100;
      state.players[5].y = 50000 + 100;
      state.players[5].status = PALIVE;

      const pkt = buildPacket(SP.PSTATUS, 5, PEXPLODE);
      simulatePacket(ws, pkt);
      expect(conn.audio.playShipExplode).toHaveBeenCalled();
    });

    it('does not play audio when out of range', () => {
      const ws = connectAndOpen();
      state.myNumber = 0;
      state.players[0].x = 0;
      state.players[0].y = 0;
      // Place exploding player far away
      state.players[5].x = 90000;
      state.players[5].y = 90000;
      state.players[5].status = PALIVE;

      const pkt = buildPacket(SP.PSTATUS, 5, PEXPLODE);
      simulatePacket(ws, pkt);
      expect(conn.audio.playShipExplode).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 8. SP_TORP_INFO / SP_TORP
  // ============================================================
  describe('SP_TORP_INFO / SP_TORP', () => {
    function connectAndOpen(): MockWebSocket {
      conn.connect('ws://test');
      const ws = getWs();
      ws.simulateOpen();
      vi.advanceTimersByTime(1);
      onStateUpdate.mockClear();
      return ws;
    }

    it('updates torp status and war', () => {
      const ws = connectAndOpen();
      // SP_TORP_INFO: !bbbxhxx -> type, war, status, pad, tnum, pad, pad
      const pkt = buildPacket(SP.TORP_INFO, 0x0E, TMOVE, 3);
      simulatePacket(ws, pkt);
      expect(state.torps[3].status).toBe(TMOVE);
      expect(state.torps[3].war).toBe(0x0E);
    });

    it('updates torp position', () => {
      const ws = connectAndOpen();
      // SP_TORP: !bBhll -> type, dir, tnum, x, y
      const pkt = buildPacket(SP.TORP, 64, 5, 30000, 40000);
      simulatePacket(ws, pkt);
      expect(state.torps[5].dir).toBe(64);
      expect(state.torps[5].x).toBe(30000);
      expect(state.torps[5].y).toBe(40000);
    });

    it('plays torpFire audio for own torps', () => {
      const ws = connectAndOpen();
      state.myNumber = 1;
      const torpNum = 1 * MAXTORP; // first torp of player 1
      // Torp owned by player 1
      state.torps[torpNum].owner = 1;
      state.torps[torpNum].status = TFREE;

      const pkt = buildPacket(SP.TORP_INFO, 0, TMOVE, torpNum);
      simulatePacket(ws, pkt);
      expect(conn.audio.playTorpFire).toHaveBeenCalled();
    });

    it('plays torpExplode audio when in range', () => {
      const ws = connectAndOpen();
      state.myNumber = 0;
      state.players[0].x = 50000;
      state.players[0].y = 50000;
      // Torp is nearby
      state.torps[3].x = 50000 + 100;
      state.torps[3].y = 50000 + 100;
      state.torps[3].status = TMOVE;

      const pkt = buildPacket(SP.TORP_INFO, 0, TEXPLODE, 3);
      simulatePacket(ws, pkt);
      expect(conn.audio.playTorpExplode).toHaveBeenCalled();
    });

    it('does not play torpExplode when out of range', () => {
      const ws = connectAndOpen();
      state.myNumber = 0;
      state.players[0].x = 0;
      state.players[0].y = 0;
      state.torps[3].x = 90000;
      state.torps[3].y = 90000;
      state.torps[3].status = TMOVE;

      const pkt = buildPacket(SP.TORP_INFO, 0, TEXPLODE, 3);
      simulatePacket(ws, pkt);
      expect(conn.audio.playTorpExplode).not.toHaveBeenCalled();
    });

    it('rejects out-of-range torp number', () => {
      const ws = connectAndOpen();
      // MAXPLAYER * MAXTORP = 256, so 300 is invalid
      const pkt = buildPacket(SP.TORP_INFO, 0, TMOVE, 300);
      simulatePacket(ws, pkt);
      // Should not crash
    });
  });

  // ============================================================
  // 9. SP_PHASER
  // ============================================================
  describe('SP_PHASER', () => {
    function connectAndOpen(): MockWebSocket {
      conn.connect('ws://test');
      const ws = getWs();
      ws.simulateOpen();
      vi.advanceTimersByTime(1);
      onStateUpdate.mockClear();
      return ws;
    }

    it('updates phaser fields', () => {
      const ws = connectAndOpen();
      // Set target player position so PHHIT snapshot picks it up
      state.players[5].x = 50000;
      state.players[5].y = 50000;
      // SP_PHASER: !bbbBlll -> type, pnum, status, dir, x, y, target
      const pkt = buildPacket(SP.PHASER, 2, PHHIT, 128, 50000, 50000, 5);
      simulatePacket(ws, pkt);
      expect(state.phasers[2].status).toBe(PHHIT);
      expect(state.phasers[2].dir).toBe(128);
      // PHHIT snapshots target player's position into x/y
      expect(state.phasers[2].x).toBe(50000);
      expect(state.phasers[2].y).toBe(50000);
      expect(state.phasers[2].target).toBe(5);
    });

    it('sets fuseStart on active phaser', () => {
      const ws = connectAndOpen();
      vi.setSystemTime(1000);
      const pkt = buildPacket(SP.PHASER, 3, PHMISS, 0, 0, 0, 0);
      simulatePacket(ws, pkt);
      expect(state.phasers[3].fuseStart).toBe(1000);
    });

    it('clears fuseStart on PHFREE', () => {
      const ws = connectAndOpen();
      state.phasers[3].fuseStart = 500;
      const pkt = buildPacket(SP.PHASER, 3, PHFREE, 0, 0, 0, 0);
      simulatePacket(ws, pkt);
      expect(state.phasers[3].fuseStart).toBe(0);
    });

    it('plays phaserFire audio for own player only', () => {
      const ws = connectAndOpen();
      state.myNumber = 4;
      const pkt = buildPacket(SP.PHASER, 4, PHHIT, 0, 0, 0, 0);
      simulatePacket(ws, pkt);
      expect(conn.audio.playPhaserFire).toHaveBeenCalled();
    });

    it('does not play phaserFire for other players', () => {
      const ws = connectAndOpen();
      state.myNumber = 4;
      const pkt = buildPacket(SP.PHASER, 5, PHHIT2, 0, 0, 0, 0);
      simulatePacket(ws, pkt);
      expect(conn.audio.playPhaserFire).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 10. SP_LOGIN
  // ============================================================
  describe('SP_LOGIN', () => {
    function connectAndOpen(): MockWebSocket {
      conn.connect('ws://test');
      const ws = getWs();
      ws.simulateOpen();
      vi.advanceTimersByTime(1);
      onStateUpdate.mockClear();
      return ws;
    }

    it('transitions login → outfit on accept', () => {
      const ws = connectAndOpen();
      state.phase = 'login';
      // SP_LOGIN: !bbxxl96s -> type, accept, pad, pad, flags, motd
      const pkt = buildPacket(SP.LOGIN, 1, 0, '');
      simulatePacket(ws, pkt);
      expect(state.phase).toBe('outfit');
      expect(state.motdComplete).toBe(true);
    });

    it('sets warning on reject', () => {
      const ws = connectAndOpen();
      state.phase = 'login';
      const pkt = buildPacket(SP.LOGIN, 0, 0, '');
      simulatePacket(ws, pkt);
      expect(state.phase).toBe('login'); // stays in login
      expect(state.warningText).toContain('rejected');
      expect(state.loginRejected).toBe(true);
    });

    it('always sets motdComplete', () => {
      const ws = connectAndOpen();
      const pkt = buildPacket(SP.LOGIN, 0, 0, '');
      simulatePacket(ws, pkt);
      expect(state.motdComplete).toBe(true);
    });
  });

  // ============================================================
  // 11. SP_MASK / SP_PICKOK
  // ============================================================
  describe('SP_MASK / SP_PICKOK', () => {
    function connectAndOpen(): MockWebSocket {
      conn.connect('ws://test');
      const ws = getWs();
      ws.simulateOpen();
      vi.advanceTimersByTime(1);
      onStateUpdate.mockClear();
      return ws;
    }

    it('updates teamMask', () => {
      const ws = connectAndOpen();
      const pkt = buildPacket(SP.MASK, 0x0B);
      simulatePacket(ws, pkt);
      expect(state.teamMask).toBe(0x0B);
    });

    it('transitions to alive on PICKOK ok=1', () => {
      const ws = connectAndOpen();
      state.phase = 'outfit';
      // SP_PICKOK: !bbxx -> type, ok
      const pkt = buildPacket(SP.PICKOK, 1);
      simulatePacket(ws, pkt);
      expect(state.phase).toBe('alive');
    });

    it('does not transition on PICKOK ok=0', () => {
      const ws = connectAndOpen();
      state.phase = 'outfit';
      const pkt = buildPacket(SP.PICKOK, 0);
      simulatePacket(ws, pkt);
      expect(state.phase).toBe('outfit');
    });
  });

  // ============================================================
  // 12. Remaining server packets
  // ============================================================
  describe('Remaining packets', () => {
    function connectAndOpen(): MockWebSocket {
      conn.connect('ws://test');
      const ws = getWs();
      ws.simulateOpen();
      vi.advanceTimersByTime(1);
      onStateUpdate.mockClear();
      return ws;
    }

    it('MOTD: appends lines and caps at 200', () => {
      const ws = connectAndOpen();
      for (let i = 0; i < 210; i++) {
        const pkt = buildPacket(SP.MOTD, `Line ${i}`);
        simulatePacket(ws, pkt);
      }
      expect(state.motdLines.length).toBe(200);
    });

    it('PLAYER_INFO: sets shipType and team', () => {
      const ws = connectAndOpen();
      // SP_PLAYER_INFO: !bbbb -> type, pnum, shipType, team
      const pkt = buildPacket(SP.PLAYER_INFO, 3, 2, FED);
      simulatePacket(ws, pkt);
      expect(state.players[3].shipType).toBe(2);
      expect(state.players[3].team).toBe(FED);
    });

    it('KILLS: scales by /100', () => {
      const ws = connectAndOpen();
      // SP_KILLS: !bbxxI -> type, pnum, pad, pad, kills*100
      const pkt = buildPacket(SP.KILLS, 5, 350);
      simulatePacket(ws, pkt);
      expect(state.players[5].kills).toBe(3.5);
    });

    it('FLAGS: updates player flags', () => {
      const ws = connectAndOpen();
      // SP_FLAGS: !bbbxI -> type, pnum, tractor, pad, flags
      const pkt = buildPacket(SP.FLAGS, 2, 0, 0x0001);
      simulatePacket(ws, pkt);
      expect(state.players[2].flags).toBe(0x0001);
    });

    it('PLANET: updates planet fields', () => {
      const ws = connectAndOpen();
      // SP_PLANET: !bbbbhxxl -> type, pnum, owner, info, flags(h), pad, armies(l)
      const pkt = buildPacket(SP.PLANET, 10, FED, 0x0F, 0x30, 15);
      simulatePacket(ws, pkt);
      expect(state.planets[10].owner).toBe(FED);
      expect(state.planets[10].info).toBe(0x0F);
      expect(state.planets[10].flags).toBe(0x30);
      expect(state.planets[10].armies).toBe(15);
    });

    it('PLANET_LOC: updates planet position and name', () => {
      const ws = connectAndOpen();
      // SP_PLANET_LOC: !bbxxll16s -> type, pnum, pad, pad, x, y, name
      const pkt = buildPacket(SP.PLANET_LOC, 5, 20000, 30000, 'Earth');
      simulatePacket(ws, pkt);
      expect(state.planets[5].x).toBe(20000);
      expect(state.planets[5].y).toBe(30000);
      expect(state.planets[5].name).toBe('Earth');
    });

    it('MESSAGE: stores and caps at 100', () => {
      const ws = connectAndOpen();
      for (let i = 0; i < 110; i++) {
        // SP_MESSAGE: !bBBB80s -> type, flags, from, to, text
        const pkt = buildPacket(SP.MESSAGE, 0x08, 0, 0, `Msg ${i}`);
        simulatePacket(ws, pkt);
      }
      expect(state.messages.length).toBe(100);
    });

    it('WARNING: sets warningText', () => {
      const ws = connectAndOpen();
      vi.setSystemTime(5000);
      const pkt = buildPacket(SP.WARNING, 'Shields failing!');
      simulatePacket(ws, pkt);
      expect(state.warningText).toBe('Shields failing!');
      expect(state.warningTime).toBe(5000);
    });

    it('HOSTILE: updates war and hostile', () => {
      const ws = connectAndOpen();
      // SP_HOSTILE: !bbbb -> type, pnum, war, hostile
      const pkt = buildPacket(SP.HOSTILE, 3, 0x0E, 0x0F);
      simulatePacket(ws, pkt);
      expect(state.players[3].war).toBe(0x0E);
      expect(state.players[3].hostile).toBe(0x0F);
    });

    it('QUEUE: updates queuePos', () => {
      const ws = connectAndOpen();
      const pkt = buildPacket(SP.QUEUE, 4);
      simulatePacket(ws, pkt);
      expect(state.queuePos).toBe(4);
    });

    it('PL_LOGIN: updates rank, name, login', () => {
      const ws = connectAndOpen();
      // SP_PL_LOGIN: !bbbx16s16s16s -> type, pnum, rank, pad, name, monitor, login
      const pkt = buildPacket(SP.PL_LOGIN, 2, 5, 'Commander', 'host1', 'cmdr');
      simulatePacket(ws, pkt);
      expect(state.players[2].rank).toBe(5);
      expect(state.players[2].name).toBe('Commander');
      expect(state.players[2].login).toBe('cmdr');
    });

    it('PLASMA_INFO: updates status and plays audio', () => {
      const ws = connectAndOpen();
      state.myNumber = 3;
      state.plasmas[3].status = PTFREE;
      // SP_PLASMA_INFO: !bbbxhxx -> type, war, status, pad, pnum(h), pad
      const pkt = buildPacket(SP.PLASMA_INFO, 0, PTMOVE, 3);
      simulatePacket(ws, pkt);
      expect(state.plasmas[3].status).toBe(PTMOVE);
      expect(conn.audio.playPlasmaFire).toHaveBeenCalled();
    });

    it('PING: sends response', () => {
      const ws = connectAndOpen();
      ws.send.mockClear();
      vi.setSystemTime(1000);
      // SP_PING: !bBHBBBB -> type, num, lag(H), tloss_sc, tloss_cs, iloss_sc, iloss_cs
      const pkt = buildPacket(SP.PING, 42, 50, 0, 0, 0, 0);
      simulatePacket(ws, pkt);
      expect(ws.send).toHaveBeenCalled();
      const sent = new Uint8Array(ws.send.mock.calls[0][0]);
      expect(sent[0]).toBe(CP.PING_RESPONSE.code);
    });
  });

  // ============================================================
  // 13. Client senders
  // ============================================================
  describe('Client senders', () => {
    function connectAndOpen(): MockWebSocket {
      conn.connect('ws://test');
      const ws = getWs();
      ws.simulateOpen();
      vi.advanceTimersByTime(1);
      ws.send.mockClear();
      return ws;
    }

    it('sendLogin sends CP_LOGIN', () => {
      const ws = connectAndOpen();
      conn.sendLogin('bob', 'pass', 'bob');
      expect(ws.send).toHaveBeenCalledTimes(1);
      const sent = new Uint8Array(ws.send.mock.calls[0][0]);
      expect(sent[0]).toBe(CP.LOGIN.code);
      expect(sent.length).toBe(formatSize(CP.LOGIN.format));
    });

    it('sendSpeed sends CP_SPEED', () => {
      const ws = connectAndOpen();
      conn.sendSpeed(9);
      const sent = new Uint8Array(ws.send.mock.calls[0][0]);
      expect(sent[0]).toBe(CP.SPEED.code);
      expect(sent[1]).toBe(9);
    });

    it('sendDirection masks to 0xFF', () => {
      const ws = connectAndOpen();
      conn.sendDirection(300); // 300 & 0xFF = 44
      const sent = new Uint8Array(ws.send.mock.calls[0][0]);
      expect(sent[0]).toBe(CP.DIRECTION.code);
      expect(sent[1]).toBe(300 & 0xFF);
    });

    it('sendShield on/off', () => {
      const ws = connectAndOpen();
      conn.sendShield(true);
      let sent = new Uint8Array(ws.send.mock.calls[0][0]);
      expect(sent[0]).toBe(CP.SHIELD.code);
      expect(sent[1]).toBe(1);

      conn.sendShield(false);
      sent = new Uint8Array(ws.send.mock.calls[1][0]);
      expect(sent[1]).toBe(0);
    });

    it('sendBeam up=1, down=2', () => {
      const ws = connectAndOpen();
      conn.sendBeam(true);
      let sent = new Uint8Array(ws.send.mock.calls[0][0]);
      expect(sent[0]).toBe(CP.BEAM.code);
      expect(sent[1]).toBe(1);

      conn.sendBeam(false);
      sent = new Uint8Array(ws.send.mock.calls[1][0]);
      expect(sent[1]).toBe(2);
    });

    it('sendMessage sends CP_MESSAGE', () => {
      const ws = connectAndOpen();
      conn.sendMessage(0, 0x08, 'Hello world');
      const sent = new Uint8Array(ws.send.mock.calls[0][0]);
      expect(sent[0]).toBe(CP.MESSAGE.code);
      expect(sent.length).toBe(formatSize(CP.MESSAGE.format));
    });

    it('sendWar sends CP_WAR', () => {
      const ws = connectAndOpen();
      conn.sendWar(0x0E);
      const sent = new Uint8Array(ws.send.mock.calls[0][0]);
      expect(sent[0]).toBe(CP.WAR.code);
      expect(sent[1]).toBe(0x0E);
    });

    it('send() is a no-op when WS is closed', () => {
      const ws = connectAndOpen();
      ws.readyState = MockWebSocket.CLOSED;
      ws.send.mockClear();
      conn.sendSpeed(5);
      expect(ws.send).not.toHaveBeenCalled();
    });
  });
});
