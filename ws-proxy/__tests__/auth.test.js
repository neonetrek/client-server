/**
 * Tests for ws-proxy/auth.js — Realm auth module
 *
 * Uses in-memory SQLite (:memory:) so no file cleanup needed.
 * Run with: node --test ws-proxy/__tests__/auth.test.js
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../auth');

describe('Auth module — controller mode', () => {
  before(() => {
    auth.init(
      { mode: 'controller', proxySecret: 'testsecret', apiKey: 'testkey' },
      { dbPath: ':memory:' }
    );
  });

  after(() => {
    auth.close();
  });

  // ============================================================
  // Registration
  // ============================================================
  describe('register', () => {
    it('registers a new player', async () => {
      const result = await auth.register('Picard', 'picard@enterprise.com', 'engage');
      assert.deepStrictEqual(result, { ok: true });
    });

    it('rejects duplicate name', async () => {
      const result = await auth.register('Picard', 'other@test.com', 'other');
      assert.equal(result.ok, false);
      assert.equal(result.error, 'Name already taken');
    });

    it('rejects duplicate name case-insensitively', async () => {
      const result = await auth.register('picard', 'other@test.com', 'other');
      assert.equal(result.ok, false);
      assert.equal(result.error, 'Name already taken');
    });

    it('rejects name shorter than 2 chars', async () => {
      const result = await auth.register('A', 'a@t.com', 'pass');
      assert.equal(result.ok, false);
      assert.match(result.error, /2-15 characters/);
    });

    it('rejects name longer than 15 chars', async () => {
      const result = await auth.register('A'.repeat(16), 'a@t.com', 'pass');
      assert.equal(result.ok, false);
      assert.match(result.error, /2-15 characters/);
    });

    it('rejects name with invalid characters', async () => {
      const result = await auth.register('bad name!', 'a@t.com', 'pass');
      assert.equal(result.ok, false);
      assert.match(result.error, /letters, numbers/);
    });

    it('rejects name "guest"', async () => {
      const result = await auth.register('guest', 'a@t.com', 'pass');
      assert.equal(result.ok, false);
      assert.match(result.error, /reserved/);
    });

    it('rejects name "Guest" (case-insensitive)', async () => {
      const result = await auth.register('Guest', 'a@t.com', 'pass');
      assert.equal(result.ok, false);
      assert.match(result.error, /reserved/);
    });

    it('rejects empty password', async () => {
      const result = await auth.register('ValidName', 'a@t.com', '');
      assert.equal(result.ok, false);
      assert.match(result.error, /Password/);
    });

    it('rejects password longer than 15 chars', async () => {
      const result = await auth.register('ValidName2', 'a@t.com', 'A'.repeat(16));
      assert.equal(result.ok, false);
      assert.match(result.error, /1-15 characters/);
    });

    it('allows registration without email', async () => {
      const result = await auth.register('NoEmail', null, 'secret');
      assert.deepStrictEqual(result, { ok: true });
    });

    it('allows names with dots, hyphens, underscores', async () => {
      const result = await auth.register('Cpt.Kirk-Jr_2', null, 'secret');
      assert.deepStrictEqual(result, { ok: true });
    });
  });

  // ============================================================
  // Validation
  // ============================================================
  describe('validate', () => {
    it('validates correct password', async () => {
      const result = await auth.validate('Picard', 'engage');
      assert.equal(result.ok, true);
    });

    it('validates case-insensitive name lookup', async () => {
      const result = await auth.validate('picard', 'engage');
      assert.equal(result.ok, true);
    });

    it('rejects wrong password', async () => {
      const result = await auth.validate('Picard', 'wrongpassword');
      assert.equal(result.ok, false);
      assert.equal(result.error, 'Wrong password');
    });

    it('rejects unknown player', async () => {
      const result = await auth.validate('Nonexistent', 'anything');
      assert.equal(result.ok, false);
      assert.equal(result.error, 'Unknown player');
    });
  });

  // ============================================================
  // Stats sync
  // ============================================================
  describe('syncStats', () => {
    it('syncs stats for registered players', async () => {
      const stats = [
        {
          name: 'Picard', server: 'London', instance: 'bots',
          rank: 3, hours: 10.5, offense: 100, bombing: 50,
          planets: 20, kills: 100, deaths: 30, total: 170,
        },
      ];
      const result = await auth.syncStats(stats);
      assert.equal(result.ok, true);
      assert.equal(result.synced, 1);
    });

    it('skips stats for unregistered players', async () => {
      const stats = [
        {
          name: 'UnknownDude', server: 'London', instance: 'bots',
          rank: 1, hours: 1, offense: 5, bombing: 0,
          planets: 0, kills: 5, deaths: 10, total: 5,
        },
      ];
      const result = await auth.syncStats(stats);
      assert.equal(result.ok, true);
      assert.equal(result.synced, 0);
    });

    it('upserts stats on repeated sync', async () => {
      const stats = [
        {
          name: 'Picard', server: 'London', instance: 'bots',
          rank: 4, hours: 20.0, offense: 200, bombing: 100,
          planets: 40, kills: 200, deaths: 50, total: 340,
        },
      ];
      const result = await auth.syncStats(stats);
      assert.equal(result.ok, true);
      assert.equal(result.synced, 1);

      // Verify by checking leaderboard
      const lb = await auth.getGlobalLeaderboard();
      const picard = lb.players.find(p => p.name === 'Picard');
      assert.equal(picard.rank, 4);
      assert.equal(picard.offense, 200);
    });

    it('handles multiple players and instances', async () => {
      const stats = [
        {
          name: 'Picard', server: 'London', instance: 'arena',
          rank: 5, hours: 5, offense: 50, bombing: 25,
          planets: 10, kills: 50, deaths: 15, total: 85,
        },
        {
          name: 'NoEmail', server: 'London', instance: 'arena',
          rank: 2, hours: 3, offense: 20, bombing: 10,
          planets: 5, kills: 20, deaths: 8, total: 35,
        },
      ];
      const result = await auth.syncStats(stats);
      assert.equal(result.ok, true);
      assert.equal(result.synced, 2);
    });
  });

  // ============================================================
  // Global leaderboard
  // ============================================================
  describe('getGlobalLeaderboard', () => {
    it('returns leaderboard data', async () => {
      const lb = await auth.getGlobalLeaderboard();
      assert.ok(lb.updated);
      assert.ok(Array.isArray(lb.players));
      assert.ok(lb.players.length > 0);
    });

    it('includes all synced stats rows', async () => {
      const lb = await auth.getGlobalLeaderboard();
      // Picard has stats for 'bots' and 'arena', NoEmail for 'arena'
      const picardEntries = lb.players.filter(p => p.name === 'Picard');
      assert.ok(picardEntries.length >= 2);
    });

    it('sorts by rank desc, then total desc', async () => {
      const lb = await auth.getGlobalLeaderboard();
      for (let i = 1; i < lb.players.length; i++) {
        const prev = lb.players[i - 1];
        const curr = lb.players[i];
        assert.ok(
          prev.rank > curr.rank || (prev.rank === curr.rank && prev.total >= curr.total),
          `Sort order violated at index ${i}: rank ${prev.rank}/${curr.rank}, total ${prev.total}/${curr.total}`
        );
      }
    });
  });
});

describe('Auth module — no config', () => {
  before(() => {
    auth.init(null);
  });

  after(() => {
    auth.close();
  });

  it('register returns error when not configured', async () => {
    const result = await auth.register('Test', 'a@t.com', 'pass');
    assert.equal(result.ok, false);
    assert.match(result.error, /not configured/);
  });

  it('validate returns error when not configured', async () => {
    const result = await auth.validate('Test', 'pass');
    assert.equal(result.ok, false);
    assert.match(result.error, /not configured/);
  });

  it('getGlobalLeaderboard returns null when not configured', async () => {
    const result = await auth.getGlobalLeaderboard();
    assert.equal(result, null);
  });
});
