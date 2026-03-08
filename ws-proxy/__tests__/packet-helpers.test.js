/**
 * Tests for ws-proxy/packet-helpers.js — Netrek packet building/parsing
 *
 * Run with: node --test ws-proxy/__tests__/packet-helpers.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSPWarning,
  buildSPLoginReject,
  rewritePassword,
  extractString,
  isCPLogin,
  isGuestLogin,
  isQueryLogin,
  extractLoginCredentials,
  buildCPLogin,
} = require('../packet-helpers');

// ============================================================
// buildSPWarning
// ============================================================
describe('buildSPWarning', () => {
  it('returns 84-byte buffer', () => {
    const buf = buildSPWarning('test');
    assert.equal(buf.length, 84);
  });

  it('sets type byte to 10 (SP_WARNING)', () => {
    const buf = buildSPWarning('test');
    assert.equal(buf[0], 10);
  });

  it('writes message starting at byte 4', () => {
    const buf = buildSPWarning('Hello');
    const msg = buf.toString('ascii', 4).replace(/\0.*/, '');
    assert.equal(msg, 'Hello');
  });

  it('truncates message to 79 chars', () => {
    const long = 'X'.repeat(100);
    const buf = buildSPWarning(long);
    const msg = buf.toString('ascii', 4).replace(/\0.*/, '');
    assert.equal(msg.length, 79);
  });

  it('pads remaining bytes with zeros', () => {
    const buf = buildSPWarning('Hi');
    // Bytes 1-3 should be 0 (padding)
    assert.equal(buf[1], 0);
    assert.equal(buf[2], 0);
    assert.equal(buf[3], 0);
    // Bytes after message should be 0
    assert.equal(buf[6], 0); // 'Hi' at 4,5 — byte 6 should be null
  });
});

// ============================================================
// buildSPLoginReject
// ============================================================
describe('buildSPLoginReject', () => {
  it('returns 104-byte buffer', () => {
    const buf = buildSPLoginReject();
    assert.equal(buf.length, 104);
  });

  it('sets type byte to 17 (SP_LOGIN)', () => {
    const buf = buildSPLoginReject();
    assert.equal(buf[0], 17);
  });

  it('sets accept byte to 0 (reject)', () => {
    const buf = buildSPLoginReject();
    assert.equal(buf[1], 0);
  });

  it('fills remaining bytes with zeros', () => {
    const buf = buildSPLoginReject();
    for (let i = 2; i < 104; i++) {
      assert.equal(buf[i], 0, `byte ${i} should be 0`);
    }
  });
});

// ============================================================
// rewritePassword
// ============================================================
describe('rewritePassword', () => {
  it('overwrites bytes 20-35 with the secret', () => {
    const buf = buildCPLogin(0, 'TestUser', 'original', 'TestUser');
    rewritePassword(buf, 'proxysecret');
    const newPassword = extractString(buf, 20, 16);
    assert.equal(newPassword, 'proxysecret');
  });

  it('preserves the name field (bytes 4-19)', () => {
    const buf = buildCPLogin(0, 'TestUser', 'original', 'TestUser');
    rewritePassword(buf, 'newsecret');
    const name = extractString(buf, 4, 16);
    assert.equal(name, 'TestUser');
  });

  it('preserves the login field (bytes 36-51)', () => {
    const buf = buildCPLogin(0, 'TestUser', 'original', 'mylogin');
    rewritePassword(buf, 'newsecret');
    const login = extractString(buf, 36, 16);
    assert.equal(login, 'mylogin');
  });

  it('null-pads the password field', () => {
    const buf = buildCPLogin(0, 'TestUser', 'longpassword123', 'TestUser');
    rewritePassword(buf, 'short');
    // After 'short' (5 bytes), remaining bytes should be 0
    assert.equal(buf[25], 0);
    assert.equal(buf[35], 0);
  });

  it('truncates secret to 15 chars', () => {
    const buf = buildCPLogin(0, 'TestUser', 'original', 'TestUser');
    rewritePassword(buf, 'averylongsecretkey');
    const newPassword = extractString(buf, 20, 16);
    assert.equal(newPassword, 'averylongsecret'); // 15 chars
  });
});

// ============================================================
// extractString
// ============================================================
describe('extractString', () => {
  it('extracts null-terminated string', () => {
    const buf = Buffer.alloc(16);
    buf.write('Hello', 0, 'ascii');
    assert.equal(extractString(buf, 0, 16), 'Hello');
  });

  it('returns full string if no null terminator', () => {
    const buf = Buffer.alloc(5);
    buf.write('ABCDE', 0, 'ascii');
    assert.equal(extractString(buf, 0, 5), 'ABCDE');
  });

  it('returns empty string for all-null buffer', () => {
    const buf = Buffer.alloc(16);
    assert.equal(extractString(buf, 0, 16), '');
  });

  it('handles offset correctly', () => {
    const buf = Buffer.alloc(32);
    buf.write('NameHere', 4, 'ascii');
    assert.equal(extractString(buf, 4, 16), 'NameHere');
  });
});

// ============================================================
// isCPLogin
// ============================================================
describe('isCPLogin', () => {
  it('detects a valid CP_LOGIN packet', () => {
    const buf = buildCPLogin(0, 'Test', 'pass', 'Test');
    assert.equal(isCPLogin(buf), true);
  });

  it('rejects wrong type byte', () => {
    const buf = Buffer.alloc(52);
    buf[0] = 9; // not CP_LOGIN
    assert.equal(isCPLogin(buf), false);
  });

  it('rejects wrong length', () => {
    const buf = Buffer.alloc(48);
    buf[0] = 8;
    assert.equal(isCPLogin(buf), false);
  });

  it('rejects zero-length buffer', () => {
    const buf = Buffer.alloc(0);
    assert.equal(isCPLogin(buf), false);
  });
});

// ============================================================
// isGuestLogin
// ============================================================
describe('isGuestLogin', () => {
  it('detects "guest" name', () => {
    const buf = buildCPLogin(0, 'guest', '', 'guest');
    assert.equal(isGuestLogin(buf), true);
  });

  it('detects "Guest" name (case-insensitive)', () => {
    const buf = buildCPLogin(0, 'Guest', '', 'Guest');
    assert.equal(isGuestLogin(buf), true);
  });

  it('detects empty name as guest', () => {
    const buf = buildCPLogin(0, '', '', '');
    assert.equal(isGuestLogin(buf), true);
  });

  it('returns false for non-guest name', () => {
    const buf = buildCPLogin(0, 'Picard', 'engage', 'Picard');
    assert.equal(isGuestLogin(buf), false);
  });
});

// ============================================================
// isQueryLogin
// ============================================================
describe('isQueryLogin', () => {
  it('returns false for normal login (query=0)', () => {
    const buf = buildCPLogin(0, 'Test', 'pass', 'Test');
    assert.equal(isQueryLogin(buf), false);
  });

  it('returns true for query mode (query=1)', () => {
    const buf = buildCPLogin(1, 'Test', 'pass', 'Test');
    assert.equal(isQueryLogin(buf), true);
  });

  it('returns true for any non-zero query byte', () => {
    const buf = buildCPLogin(255, 'Test', 'pass', 'Test');
    assert.equal(isQueryLogin(buf), true);
  });
});

// ============================================================
// extractLoginCredentials
// ============================================================
describe('extractLoginCredentials', () => {
  it('extracts name, password, and login', () => {
    const buf = buildCPLogin(0, 'Picard', 'engage', 'jlp');
    const creds = extractLoginCredentials(buf);
    assert.equal(creds.name, 'Picard');
    assert.equal(creds.password, 'engage');
    assert.equal(creds.login, 'jlp');
  });

  it('handles max-length fields (15 chars)', () => {
    const buf = buildCPLogin(0, 'A'.repeat(15), 'B'.repeat(15), 'C'.repeat(15));
    const creds = extractLoginCredentials(buf);
    assert.equal(creds.name, 'A'.repeat(15));
    assert.equal(creds.password, 'B'.repeat(15));
    assert.equal(creds.login, 'C'.repeat(15));
  });

  it('handles empty fields', () => {
    const buf = buildCPLogin(0, '', '', '');
    const creds = extractLoginCredentials(buf);
    assert.equal(creds.name, '');
    assert.equal(creds.password, '');
    assert.equal(creds.login, '');
  });
});

// ============================================================
// buildCPLogin
// ============================================================
describe('buildCPLogin', () => {
  it('builds a 52-byte buffer', () => {
    const buf = buildCPLogin(0, 'Test', 'pass', 'Test');
    assert.equal(buf.length, 52);
  });

  it('sets type byte to 8', () => {
    const buf = buildCPLogin(0, 'Test', 'pass', 'Test');
    assert.equal(buf[0], 8);
  });

  it('sets query byte', () => {
    const buf = buildCPLogin(1, 'Test', 'pass', 'Test');
    assert.equal(buf[1], 1);
  });

  it('round-trips through extractLoginCredentials', () => {
    const buf = buildCPLogin(0, 'Archer', 'secret123', 'archer');
    const creds = extractLoginCredentials(buf);
    assert.equal(creds.name, 'Archer');
    assert.equal(creds.password, 'secret123');
    assert.equal(creds.login, 'archer');
  });

  it('defaults login to name if not provided', () => {
    const buf = buildCPLogin(0, 'Worf', 'honor', undefined);
    const creds = extractLoginCredentials(buf);
    assert.equal(creds.login, 'Worf');
  });
});
