/**
 * Protocol layer tests
 *
 * Tests binary packet encoding/decoding, format string parsing,
 * and packet size calculations.
 */

import { describe, it, expect } from 'vitest';
import { pack, unpack, formatSize, parseFormat, SP, CP } from '../protocol';

describe('parseFormat', () => {
  it('parses simple format strings', () => {
    const { fields, totalSize } = parseFormat('!bBh');
    expect(totalSize).toBe(4); // 1 + 1 + 2
    expect(fields).toHaveLength(3);
    expect(fields[0].type).toBe('int8');
    expect(fields[1].type).toBe('uint8');
    expect(fields[2].type).toBe('int16');
  });

  it('handles padding bytes', () => {
    const { fields, totalSize } = parseFormat('!bxxx');
    expect(totalSize).toBe(4);
    expect(fields).toHaveLength(4);
    expect(fields[1].type).toBe('pad');
  });

  it('handles repeated fields with count prefix', () => {
    const { totalSize } = parseFormat('!3b');
    expect(totalSize).toBe(3);
  });

  it('handles string fields', () => {
    const { fields, totalSize } = parseFormat('!bxxx80s');
    expect(totalSize).toBe(84);
    expect(fields[4].type).toBe('string');
    expect(fields[4].count).toBe(80);
  });

  it('handles uint32 (I and L)', () => {
    const { totalSize } = parseFormat('!IL');
    expect(totalSize).toBe(8);
  });

  it('handles int32 (l and i)', () => {
    const { totalSize } = parseFormat('!li');
    expect(totalSize).toBe(8);
  });

  it('handles complex format like SP_YOU', () => {
    const { totalSize } = parseFormat('!bbbbbbxxIlllhhhh');
    expect(totalSize).toBe(32);
  });

  it('throws on unknown format character', () => {
    expect(() => parseFormat('!bZ')).toThrow(/Unknown format char/);
  });
});

describe('formatSize', () => {
  it('returns correct sizes for all SP packets', () => {
    // Verified sizes from C server packets.h
    expect(formatSize(SP.PLAYER_INFO.format)).toBe(4);
    expect(formatSize(SP.PLAYER.format)).toBe(12);
    expect(formatSize(SP.YOU.format)).toBe(32);
    expect(formatSize(SP.MOTD.format)).toBe(84);
    expect(formatSize(SP.WARNING.format)).toBe(84);
    expect(formatSize(SP.MESSAGE.format)).toBe(84);
    expect(formatSize(SP.KILLS.format)).toBe(8);
    expect(formatSize(SP.PSTATUS.format)).toBe(4);
    expect(formatSize(SP.FLAGS.format)).toBe(8);
    expect(formatSize(SP.MASK.format)).toBe(4);
    expect(formatSize(SP.PICKOK.format)).toBe(4);
    expect(formatSize(SP.QUEUE.format)).toBe(4);
    expect(formatSize(SP.HOSTILE.format)).toBe(4);
    expect(formatSize(SP.TORP_INFO.format)).toBe(8);
    expect(formatSize(SP.TORP.format)).toBe(12);
    expect(formatSize(SP.PHASER.format)).toBe(16);
    expect(formatSize(SP.PLANET.format)).toBe(12);
    expect(formatSize(SP.PLANET_LOC.format)).toBe(28);
    expect(formatSize(SP.PING.format)).toBe(8);
    expect(formatSize(SP.PL_LOGIN.format)).toBe(52);
    expect(formatSize(SP.RESERVED.format)).toBe(20);
    expect(formatSize(SP.LOGIN.format)).toBe(104);
  });

  it('returns correct sizes for all CP packets', () => {
    expect(formatSize(CP.SPEED.format)).toBe(4);
    expect(formatSize(CP.DIRECTION.format)).toBe(4);
    expect(formatSize(CP.PHASER.format)).toBe(4);
    expect(formatSize(CP.TORP.format)).toBe(4);
    expect(formatSize(CP.LOGIN.format)).toBe(52);
    expect(formatSize(CP.OUTFIT.format)).toBe(4);
    expect(formatSize(CP.SOCKET.format)).toBe(8);
    expect(formatSize(CP.MESSAGE.format)).toBe(84);
    expect(formatSize(CP.QUIT.format)).toBe(4);
    expect(formatSize(CP.BYE.format)).toBe(4);
    expect(formatSize(CP.UPDATES.format)).toBe(8);
    expect(formatSize(CP.PING_RESPONSE.format)).toBe(12);
  });
});

describe('pack and unpack', () => {
  it('round-trips simple integers', () => {
    const buf = pack('!bBh', 1, 2, 3);
    expect(buf.byteLength).toBe(4);
    const result = unpack('!bBh', new DataView(buf));
    expect(result).toEqual([1, 2, 3]);
  });

  it('handles signed negative values', () => {
    const buf = pack('!bhl', -1, -256, -100000);
    const result = unpack('!bhl', new DataView(buf));
    expect(result).toEqual([-1, -256, -100000]);
  });

  it('handles unsigned 32-bit values', () => {
    const buf = pack('!I', 0xDEADBEEF);
    const result = unpack('!I', new DataView(buf));
    expect(result).toEqual([0xDEADBEEF]);
  });

  it('handles padding bytes (ignored on unpack)', () => {
    const buf = pack('!bxxb', 42, 99);
    expect(buf.byteLength).toBe(4);
    const result = unpack('!bxxb', new DataView(buf));
    expect(result).toEqual([42, 99]);
  });

  it('handles strings', () => {
    const buf = pack('!b16s', 1, 'Hello');
    const result = unpack('!b16s', new DataView(buf));
    expect(result[0]).toBe(1);
    expect(result[1]).toBe('Hello');
  });

  it('truncates long strings to field size', () => {
    const longStr = 'A'.repeat(100);
    const buf = pack('!16s', longStr);
    expect(buf.byteLength).toBe(16);
    const result = unpack('!16s', new DataView(buf));
    expect(result[0]).toBe('A'.repeat(16));
  });

  it('null-terminates strings on unpack', () => {
    // Create a buffer with "Hi\0garbage"
    const buf = new ArrayBuffer(8);
    const bytes = new Uint8Array(buf);
    bytes[0] = 72; // H
    bytes[1] = 105; // i
    bytes[2] = 0;   // null
    bytes[3] = 99;  // garbage
    const result = unpack('!8s', new DataView(buf));
    expect(result[0]).toBe('Hi');
  });

  it('round-trips CP_SPEED packet', () => {
    const buf = pack(CP.SPEED.format, CP.SPEED.code, 9);
    const result = unpack(CP.SPEED.format, new DataView(buf));
    expect(result[0]).toBe(CP.SPEED.code); // type = 2
    expect(result[1]).toBe(9);             // speed = 9
  });

  it('round-trips CP_DIRECTION packet', () => {
    const buf = pack(CP.DIRECTION.format, CP.DIRECTION.code, 128);
    const result = unpack(CP.DIRECTION.format, new DataView(buf));
    expect(result[0]).toBe(CP.DIRECTION.code); // type = 3
    expect(result[1]).toBe(128);               // dir = 128
  });

  it('round-trips CP_LOGIN packet', () => {
    const buf = pack(CP.LOGIN.format, CP.LOGIN.code, 0, 'testuser', 'pass123', 'testlogin');
    const result = unpack(CP.LOGIN.format, new DataView(buf));
    expect(result[0]).toBe(CP.LOGIN.code);
    expect(result[1]).toBe(0);
    expect(result[2]).toBe('testuser');
    expect(result[3]).toBe('pass123');
    expect(result[4]).toBe('testlogin');
  });

  it('round-trips SP_YOU packet', () => {
    // type=12, pnum=5, hostile=0x0E, swar=0x02, armies=3, tractor=0,
    // flags=0x0801, damage=50, shield=80, fuel=8000, etemp=100, wtemp=200, whydead=0, whodead=0
    const buf = pack(SP.YOU.format,
      SP.YOU.code, 5, 0x0E, 0x02, 3, 0,
      0x0801, 50, 80, 8000, 100, 200, 0, 0
    );
    expect(buf.byteLength).toBe(32);
    const f = unpack(SP.YOU.format, new DataView(buf));
    expect(f[0]).toBe(12);    // type
    expect(f[1]).toBe(5);     // pnum
    expect(f[2]).toBe(0x0E);  // hostile
    expect(f[3]).toBe(0x02);  // swar
    expect(f[4]).toBe(3);     // armies
    expect(f[5]).toBe(0);     // tractor
    expect(f[6]).toBe(0x0801); // flags
    expect(f[7]).toBe(50);    // damage
    expect(f[8]).toBe(80);    // shield
    expect(f[9]).toBe(8000);  // fuel
    expect(f[10]).toBe(100);  // etemp
    expect(f[11]).toBe(200);  // wtemp
    expect(f[12]).toBe(0);    // whydead
    expect(f[13]).toBe(0);    // whodead
  });

  it('round-trips SP_PLAYER packet', () => {
    const buf = pack(SP.PLAYER.format, SP.PLAYER.code, 3, 128, 9, 50000, 30000);
    const f = unpack(SP.PLAYER.format, new DataView(buf));
    expect(f[0]).toBe(4);     // type
    expect(f[1]).toBe(3);     // pnum
    expect(f[2]).toBe(128);   // dir
    expect(f[3]).toBe(9);     // speed
    expect(f[4]).toBe(50000); // x
    expect(f[5]).toBe(30000); // y
  });

  it('round-trips SP_PLANET_LOC packet', () => {
    const buf = pack(SP.PLANET_LOC.format, SP.PLANET_LOC.code, 7, 25000, 75000, 'Earth');
    const f = unpack(SP.PLANET_LOC.format, new DataView(buf));
    expect(f[0]).toBe(26);      // type
    expect(f[1]).toBe(7);       // planet number
    expect(f[2]).toBe(25000);   // x
    expect(f[3]).toBe(75000);   // y
    expect(f[4]).toBe('Earth'); // name
  });

  it('round-trips SP_MESSAGE packet', () => {
    const msg = 'Hello team!';
    const buf = pack(SP.MESSAGE.format, SP.MESSAGE.code, 0x04, 5, 0, msg);
    const f = unpack(SP.MESSAGE.format, new DataView(buf));
    expect(f[0]).toBe(1);
    expect(f[1]).toBe(0x04);  // MTEAM flag
    expect(f[2]).toBe(5);     // from
    expect(f[3]).toBe(0);     // to
    expect(f[4]).toBe(msg);
  });
});

describe('unpack overflow protection', () => {
  it('throws RangeError when buffer is too small', () => {
    const smallBuf = new ArrayBuffer(2);
    expect(() => unpack('!bBhl', new DataView(smallBuf))).toThrow(RangeError);
  });

  it('throws RangeError for string field overflow', () => {
    const smallBuf = new ArrayBuffer(4);
    expect(() => unpack('!bxxx80s', new DataView(smallBuf))).toThrow(RangeError);
  });
});

describe('pack with missing values', () => {
  it('uses 0 for missing numeric values', () => {
    // Pack with fewer values than fields - should use 0 defaults
    const buf = pack('!bb', 1);
    const result = unpack('!bb', new DataView(buf));
    expect(result[0]).toBe(1);
    expect(result[1]).toBe(0); // defaulted to 0
  });

  it('uses empty string for missing string values', () => {
    const buf = pack('!b16s', 1);
    const result = unpack('!b16s', new DataView(buf));
    expect(result[0]).toBe(1);
    expect(result[1]).toBe('');
  });
});

describe('big-endian byte order', () => {
  it('encodes int16 in big-endian', () => {
    const buf = pack('!h', 0x0102);
    const bytes = new Uint8Array(buf);
    expect(bytes[0]).toBe(0x01);
    expect(bytes[1]).toBe(0x02);
  });

  it('encodes int32 in big-endian', () => {
    const buf = pack('!l', 0x01020304);
    const bytes = new Uint8Array(buf);
    expect(bytes[0]).toBe(0x01);
    expect(bytes[1]).toBe(0x02);
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);
  });
});
