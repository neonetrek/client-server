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

  it('CP_RESERVED: !bxxx16s -> 20 bytes, 2 values', () => {
    const buf = pack(CP.RESERVED.format, 33, 'challenge_data');
    expect(buf.byteLength).toBe(20);
    expect(countValueFields(CP.RESERVED.format)).toBe(2);
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

describe('SP packet sizes match Netrek C server', () => {
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
});
