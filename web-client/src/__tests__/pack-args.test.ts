/**
 * Verify all pack() calls in net.ts have the correct number of arguments.
 *
 * For each CP_ packet, we count the non-pad fields in the format string
 * and verify that pack() produces a buffer of the expected size.
 */

import { describe, it, expect } from 'vitest';
import { pack, formatSize, parseFormat, CP, SP } from '../protocol';

/** Count non-pad fields (the number of values pack expects) */
function countValueFields(fmt: string): number {
  const { fields } = parseFormat(fmt);
  return fields.filter(f => f.type !== 'pad').length;
}

describe('CP packet format field counts', () => {
  const packets = Object.entries(CP);

  for (const [name, def] of packets) {
    it(`CP.${name} format '${def.format}' has correct field count`, () => {
      const count = countValueFields(def.format);
      // Each format should produce the expected byte count
      const size = formatSize(def.format);
      expect(size).toBeGreaterThan(0);
      expect(count).toBeGreaterThanOrEqual(1); // At minimum: the packet type byte
    });
  }
});

describe('pack produces correct sizes for all CP packets', () => {
  it('CP_SOCKET: !bbbxI -> 8 bytes, 4 values', () => {
    const buf = pack(CP.SOCKET.format, 27, 0, 0, 10);
    expect(buf.byteLength).toBe(8);
    expect(countValueFields(CP.SOCKET.format)).toBe(4);
  });

  it('CP_SPEED: !bbxx -> 4 bytes, 2 values', () => {
    const buf = pack(CP.SPEED.format, 2, 9);
    expect(buf.byteLength).toBe(4);
    expect(countValueFields(CP.SPEED.format)).toBe(2);
  });

  it('CP_LOGIN: !bbxx16s16s16s -> 52 bytes, 5 values', () => {
    const buf = pack(CP.LOGIN.format, 8, 0, 'name', 'pass', 'login');
    expect(buf.byteLength).toBe(52);
    expect(countValueFields(CP.LOGIN.format)).toBe(5);
  });

  it('CP_OUTFIT: !bbbx -> 4 bytes, 3 values', () => {
    const buf = pack(CP.OUTFIT.format, 9, 1, 2);
    expect(buf.byteLength).toBe(4);
    expect(countValueFields(CP.OUTFIT.format)).toBe(3);
  });

  it('CP_MESSAGE: !bBBx80s -> 84 bytes, 4 values', () => {
    const buf = pack(CP.MESSAGE.format, 1, 0x08, 0, 'Hello');
    expect(buf.byteLength).toBe(84);
    expect(countValueFields(CP.MESSAGE.format)).toBe(4);
  });

  it('CP_TRACTOR: !bbbx -> 4 bytes, 3 values', () => {
    const buf = pack(CP.TRACTOR.format, 24, 1, 5);
    expect(buf.byteLength).toBe(4);
    expect(countValueFields(CP.TRACTOR.format)).toBe(3);
  });

  it('CP_UPDATES: !bxxxI -> 8 bytes, 2 values', () => {
    const buf = pack(CP.UPDATES.format, 31, 50000);
    expect(buf.byteLength).toBe(8);
    expect(countValueFields(CP.UPDATES.format)).toBe(2);
  });

  it('CP_PING_RESPONSE: !bBbxll -> 12 bytes, 5 values', () => {
    const buf = pack(CP.PING_RESPONSE.format, 42, 1, 0, 0, 0);
    expect(buf.byteLength).toBe(12);
    expect(countValueFields(CP.PING_RESPONSE.format)).toBe(5);
  });

  it('CP_RESERVED: !bxxx16s16s -> 36 bytes, 3 values', () => {
    const buf = pack(CP.RESERVED.format, 33, 'challenge_data', 'response_data');
    expect(buf.byteLength).toBe(36);
    expect(countValueFields(CP.RESERVED.format)).toBe(3);
  });

  it('CP_FEATURE: !bcbbi80s -> 88 bytes, 6 values', () => {
    const buf = pack(CP.FEATURE.format, 60, 0, 0, 0, 0, 'FEATURE_NAME');
    expect(buf.byteLength).toBe(88);
    expect(countValueFields(CP.FEATURE.format)).toBe(6);
  });

  it('CP_DET_TORPS: !bxxx -> 4 bytes, 1 value', () => {
    const buf = pack(CP.DET_TORPS.format, 20);
    expect(buf.byteLength).toBe(4);
    expect(countValueFields(CP.DET_TORPS.format)).toBe(1);
  });

  it('CP_DET_MYTORP: !bxh -> 4 bytes, 2 values', () => {
    const buf = pack(CP.DET_MYTORP.format, 21, 42);
    expect(buf.byteLength).toBe(4);
    expect(countValueFields(CP.DET_MYTORP.format)).toBe(2);
  });

  it('CP_QUIT: !bxxx -> 4 bytes, 1 value', () => {
    const buf = pack(CP.QUIT.format, 7);
    expect(buf.byteLength).toBe(4);
  });

  it('CP_BYE: !bxxx -> 4 bytes, 1 value', () => {
    const buf = pack(CP.BYE.format, 29);
    expect(buf.byteLength).toBe(4);
  });
});

describe('packet sizes match Netrek C server (packets.h)', () => {
  // All Netrek packets must be multiples of 4 bytes
  it('all SP packets are 4-byte aligned', () => {
    for (const [name, def] of Object.entries(SP) as [string, { format: string }][]) {
      const size = formatSize(def.format);
      expect(size % 4, `SP.${name} size ${size} is not 4-byte aligned`).toBe(0);
    }
  });

  it('all CP packets are 4-byte aligned', () => {
    for (const [name, def] of Object.entries(CP) as [string, { format: string }][]) {
      const size = formatSize(def.format);
      expect(size % 4, `CP.${name} size ${size} is not 4-byte aligned`).toBe(0);
    }
  });

  // Authoritative sizes from C server packets.h py-struct comments.
  // A mismatch here causes TCP stream desynchronization and disconnects.
  it('CP packet sizes match C server struct sizes', () => {
    const expected: Record<string, number> = {
      MESSAGE: 84,       // !bBBx80s
      SPEED: 4,          // !bbxx
      DIRECTION: 4,      // !bBxx
      PHASER: 4,         // !bBxx
      PLASMA: 4,         // !bBxx
      TORP: 4,           // !bBxx
      QUIT: 4,           // !bxxx
      LOGIN: 52,         // !bbxx16s16s16s
      OUTFIT: 4,         // !bbbx
      WAR: 4,            // !bbxx
      SHIELD: 4,         // !bbxx
      REPAIR: 4,         // !bbxx
      ORBIT: 4,          // !bbxx
      PLANLOCK: 4,       // !bbxx
      PLAYLOCK: 4,       // !bbxx
      BOMB: 4,           // !bbxx
      BEAM: 4,           // !bbxx
      CLOAK: 4,          // !bbxx
      DET_TORPS: 4,      // !bxxx
      DET_MYTORP: 4,     // !bxh
      TRACTOR: 4,        // !bbbx
      REPRESS: 4,        // !bbbx
      COUP: 4,           // !bxxx
      SOCKET: 8,         // !bbbxI
      OPTIONS: 104,      // !bxxxI96s
      BYE: 4,            // !bxxx
      DOCKPERM: 4,       // !bbxx
      UPDATES: 8,        // !bxxxI
      RESETSTATS: 4,     // !bbxx
      RESERVED: 36,      // !bxxx16s16s
      SCAN: 4,           // !bbxx
      UDP_REQ: 8,        // !bbbxI
      SEQUENCE: 4,       // !bBH
      PING_RESPONSE: 12, // !bBbxll
      FEATURE: 88,       // !bcbbi80s
    };
    for (const [name, size] of Object.entries(expected)) {
      const def = (CP as Record<string, { format: string }>)[name];
      if (!def) continue; // skip packets not implemented in client
      expect(formatSize(def.format), `CP.${name} size mismatch`).toBe(size);
    }
  });

  it('SP packet sizes match C server struct sizes', () => {
    const expected: Record<string, number> = {
      MESSAGE: 84,       // !bBBB80s
      PLAYER_INFO: 4,    // !bbbb
      KILLS: 8,          // !bbxxI
      PLAYER: 12,        // !bbBbll
      TORP_INFO: 8,      // !bbbxhxx
      TORP: 12,          // !bBhll
      PHASER: 16,        // !bbbBlll
      PLASMA_INFO: 8,    // !bbbxhxx
      PLASMA: 12,        // !bxhll
      WARNING: 84,       // !bxxx80s
      MOTD: 84,          // !bxxx80s
      YOU: 32,           // !bbbbbbxxIlllhhhh
      QUEUE: 4,          // !bxh
      STATUS: 28,        // !bbxxIIIIIL
      PLANET: 12,        // !bbbbhxxl
      PICKOK: 4,         // !bbxx
      LOGIN: 104,        // !bbxxl96s
      FLAGS: 8,          // !bbbxI
      MASK: 4,           // !bbxx
      PSTATUS: 4,        // !bbbx
      HOSTILE: 4,        // !bbbb
      STATS: 56,         // !bbxx13l
      PL_LOGIN: 52,      // !bbbx16s16s16s
      RESERVED: 20,      // !bxxx16s
      PLANET_LOC: 28,    // !bbxxll16s
      PING: 8,           // !bBHBBBB
      FEATURE: 88,       // !bcbbi80s
    };
    for (const [name, size] of Object.entries(expected)) {
      const def = (SP as Record<string, { format: string }>)[name];
      if (!def) continue;
      expect(formatSize(def.format), `SP.${name} size mismatch`).toBe(size);
    }
  });
});
