/**
 * NeoNetrek Protocol Layer
 *
 * Binary packet encoding/decoding for the Netrek protocol.
 * Format strings follow Python struct conventions:
 *   b = int8, B = uint8, h = int16, H = uint16,
 *   l = int32, L = uint32, I = uint32,
 *   x = pad byte, s = string (preceded by count)
 *   ! = network byte order (big-endian)
 */

// ============================================================
// Format string parser
// ============================================================

interface FormatField {
  type: 'int8' | 'uint8' | 'int16' | 'uint16' | 'int32' | 'uint32' | 'pad' | 'string';
  size: number;        // bytes consumed
  count?: number;      // for strings: character count
}

export function parseFormat(fmt: string): { fields: FormatField[]; totalSize: number } {
  const fields: FormatField[] = [];
  let totalSize = 0;
  let i = 0;

  // Skip byte order marker
  if (fmt[i] === '!') i++;

  while (i < fmt.length) {
    let count = 0;
    // Parse optional numeric prefix
    while (i < fmt.length && fmt[i] >= '0' && fmt[i] <= '9') {
      count = count * 10 + parseInt(fmt[i]);
      i++;
    }
    if (count === 0) count = 1;

    const ch = fmt[i++];
    switch (ch) {
      case 'b':
        for (let j = 0; j < count; j++) {
          fields.push({ type: 'int8', size: 1 });
          totalSize += 1;
        }
        break;
      case 'B':
        for (let j = 0; j < count; j++) {
          fields.push({ type: 'uint8', size: 1 });
          totalSize += 1;
        }
        break;
      case 'h':
        for (let j = 0; j < count; j++) {
          fields.push({ type: 'int16', size: 2 });
          totalSize += 2;
        }
        break;
      case 'H':
        for (let j = 0; j < count; j++) {
          fields.push({ type: 'uint16', size: 2 });
          totalSize += 2;
        }
        break;
      case 'l':
      case 'i':
        for (let j = 0; j < count; j++) {
          fields.push({ type: 'int32', size: 4 });
          totalSize += 4;
        }
        break;
      case 'L':
      case 'I':
        for (let j = 0; j < count; j++) {
          fields.push({ type: 'uint32', size: 4 });
          totalSize += 4;
        }
        break;
      case 'x':
        for (let j = 0; j < count; j++) {
          fields.push({ type: 'pad', size: 1 });
          totalSize += 1;
        }
        break;
      case 's':
        fields.push({ type: 'string', size: count, count });
        totalSize += count;
        break;
      case 'c':
        // Single character, treat as int8
        for (let j = 0; j < count; j++) {
          fields.push({ type: 'int8', size: 1 });
          totalSize += 1;
        }
        break;
      default:
        throw new Error(`Unknown format char: '${ch}' in format '${fmt}'`);
    }
  }

  return { fields, totalSize };
}

// Cache parsed formats
const formatCache = new Map<string, { fields: FormatField[]; totalSize: number }>();

function getFormat(fmt: string) {
  let cached = formatCache.get(fmt);
  if (!cached) {
    cached = parseFormat(fmt);
    formatCache.set(fmt, cached);
  }
  return cached;
}

/** Decode a binary packet according to a format string */
export function unpack(fmt: string, buffer: DataView, offset: number = 0): (number | string)[] {
  const { fields, totalSize } = getFormat(fmt);

  // Bounds check: ensure buffer has enough data
  if (offset + totalSize > buffer.byteLength) {
    throw new RangeError(
      `unpack: buffer too small. Need ${offset + totalSize} bytes, have ${buffer.byteLength}`
    );
  }

  const result: (number | string)[] = [];
  let pos = offset;

  for (const field of fields) {
    switch (field.type) {
      case 'int8':
        result.push(buffer.getInt8(pos));
        pos += 1;
        break;
      case 'uint8':
        result.push(buffer.getUint8(pos));
        pos += 1;
        break;
      case 'int16':
        result.push(buffer.getInt16(pos, false)); // big-endian
        pos += 2;
        break;
      case 'uint16':
        result.push(buffer.getUint16(pos, false));
        pos += 2;
        break;
      case 'int32':
        result.push(buffer.getInt32(pos, false));
        pos += 4;
        break;
      case 'uint32':
        result.push(buffer.getUint32(pos, false));
        pos += 4;
        break;
      case 'pad':
        pos += 1;
        break;
      case 'string': {
        const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset + pos, field.count!);
        // Find null terminator
        let end = field.count!;
        for (let j = 0; j < field.count!; j++) {
          if (bytes[j] === 0) { end = j; break; }
        }
        result.push(new TextDecoder().decode(bytes.subarray(0, end)));
        pos += field.count!;
        break;
      }
    }
  }

  return result;
}

/** Encode values into a binary packet according to a format string */
export function pack(fmt: string, ...values: (number | string)[]): ArrayBuffer {
  const { fields, totalSize } = getFormat(fmt);
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let pos = 0;
  let valIdx = 0;

  for (const field of fields) {
    switch (field.type) {
      case 'int8':
        view.setInt8(pos, (values[valIdx++] as number) ?? 0);
        pos += 1;
        break;
      case 'uint8':
        view.setUint8(pos, (values[valIdx++] as number) ?? 0);
        pos += 1;
        break;
      case 'int16':
        view.setInt16(pos, (values[valIdx++] as number) ?? 0, false);
        pos += 2;
        break;
      case 'uint16':
        view.setUint16(pos, (values[valIdx++] as number) ?? 0, false);
        pos += 2;
        break;
      case 'int32':
        view.setInt32(pos, (values[valIdx++] as number) ?? 0, false);
        pos += 4;
        break;
      case 'uint32':
        view.setUint32(pos, (values[valIdx++] as number) ?? 0, false);
        pos += 4;
        break;
      case 'pad':
        pos += 1;
        break;
      case 'string': {
        const str = (values[valIdx++] as string) ?? '';
        const encoded = new TextEncoder().encode(str);
        const len = Math.min(encoded.length, field.count!);
        bytes.set(encoded.subarray(0, len), pos);
        // Rest is already zero-filled
        pos += field.count!;
        break;
      }
    }
  }

  return buffer;
}

/** Get the byte size of a format string */
export function formatSize(fmt: string): number {
  return getFormat(fmt).totalSize;
}

// ============================================================
// Server Packet Definitions (SP_*)
// ============================================================

export const SP = {
  MESSAGE:     { code: 1,  format: '!bBBB80s' },
  PLAYER_INFO: { code: 2,  format: '!bbbb' },
  KILLS:       { code: 3,  format: '!bbxxI' },
  PLAYER:      { code: 4,  format: '!bbBbll' },
  TORP_INFO:   { code: 5,  format: '!bbbxhxx' },
  TORP:        { code: 6,  format: '!bBhll' },
  PHASER:      { code: 7,  format: '!bbbBlll' },
  PLASMA_INFO: { code: 8,  format: '!bbbxhxx' },
  PLASMA:      { code: 9,  format: '!bxhll' },
  WARNING:     { code: 10, format: '!bxxx80s' },
  MOTD:        { code: 11, format: '!bxxx80s' },
  YOU:         { code: 12, format: '!bbbbbbxxIlllhhhh' },
  QUEUE:       { code: 13, format: '!bxh' },
  STATUS:      { code: 14, format: '!bbxxIIIIIL' },
  PLANET:      { code: 15, format: '!bbbbhxxl' },
  PICKOK:      { code: 16, format: '!bbxx' },
  LOGIN:       { code: 17, format: '!bbxxl96s' },
  FLAGS:       { code: 18, format: '!bbbxI' },
  MASK:        { code: 19, format: '!bbxx' },
  PSTATUS:     { code: 20, format: '!bbbx' },
  HOSTILE:     { code: 22, format: '!bbbb' },
  STATS:       { code: 23, format: '!bbxx13l' },
  PL_LOGIN:    { code: 24, format: '!bbbx16s16s16s' },
  RESERVED:    { code: 25, format: '!bxxx16s' },
  PLANET_LOC:  { code: 26, format: '!bbxxll16s' },
  PING:        { code: 46, format: '!bBHBBBB' },
  FEATURE:     { code: 60, format: '!bcbbi80s' },
} as const;

// Build a lookup map: code → { format, name, size }
export interface PacketDef {
  code: number;
  format: string;
  name: string;
  size: number;
}

export const SP_BY_CODE: Map<number, PacketDef> = new Map();
for (const [name, def] of Object.entries(SP)) {
  SP_BY_CODE.set(def.code, {
    code: def.code,
    format: def.format,
    name,
    size: formatSize(def.format),
  });
}

// ============================================================
// Client Packet Definitions (CP_*)
// ============================================================

export const CP = {
  MESSAGE:       { code: 1,  format: '!bBBx80s' },
  SPEED:         { code: 2,  format: '!bbxx' },
  DIRECTION:     { code: 3,  format: '!bBxx' },
  PHASER:        { code: 4,  format: '!bBxx' },
  PLASMA:        { code: 5,  format: '!bBxx' },
  TORP:          { code: 6,  format: '!bBxx' },
  QUIT:          { code: 7,  format: '!bxxx' },
  LOGIN:         { code: 8,  format: '!bbxx16s16s16s' },
  OUTFIT:        { code: 9,  format: '!bbbx' },
  WAR:           { code: 10, format: '!bbxx' },
  SHIELD:        { code: 12, format: '!bbxx' },
  REPAIR:        { code: 13, format: '!bbxx' },
  ORBIT:         { code: 14, format: '!bbxx' },
  PLANLOCK:      { code: 15, format: '!bbxx' },
  PLAYLOCK:      { code: 16, format: '!bbxx' },
  BOMB:          { code: 17, format: '!bbxx' },
  BEAM:          { code: 18, format: '!bbxx' },
  CLOAK:         { code: 19, format: '!bbxx' },
  DET_TORPS:     { code: 20, format: '!bxxx' },
  DET_MYTORP:    { code: 21, format: '!bxh' },
  TRACTOR:       { code: 24, format: '!bbbx' },
  REPRESS:       { code: 25, format: '!bbbx' },
  COUP:          { code: 26, format: '!bxxx' },
  SOCKET:        { code: 27, format: '!bbbxI' },
  OPTIONS:       { code: 28, format: '!bxxxI' },
  BYE:           { code: 29, format: '!bxxx' },
  DOCKPERM:      { code: 30, format: '!bbxx' },
  UPDATES:       { code: 31, format: '!bxxxI' },
  RESETSTATS:    { code: 32, format: '!bbxx' },
  RESERVED:      { code: 33, format: '!bxxx16s' },
  SCAN:          { code: 34, format: '!bbxx' },
  UDP_REQ:       { code: 35, format: '!bbxxll' },
  SEQUENCE:      { code: 36, format: '!bBH' },
  PING_RESPONSE: { code: 42, format: '!bBbxll' },
  FEATURE:       { code: 60, format: '!bcbbi80s' },
} as const;
