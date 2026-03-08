/**
 * Realm Auth Module
 *
 * Handles centralized player identity across a realm of NeoNetrek servers.
 *
 * Modes:
 *   "controller" (LHR) — owns the SQLite database, serves auth API endpoints
 *   "server" (IAD/LAX/NRT) — proxies auth requests to the controller
 *
 * Config (from config.json "realm" key):
 *   { mode: "controller", proxySecret: "...", apiKey: "..." }
 *   { mode: "server", controller: "https://...", proxySecret: "...", apiKey: "..." }
 */

const bcrypt = require('bcryptjs');
const path = require('path');

const BCRYPT_ROUNDS = 10;
const DB_PATH = '/opt/netrek/var/auth.db';
const FETCH_TIMEOUT_MS = 5000;
const LEADERBOARD_CACHE_MS = 5 * 60 * 1000;

let db = null;
let realmConfig = null;
let leaderboardCache = null; // { data, timestamp }

// ---- Initialization ----

function init(config, options) {
  realmConfig = config;
  if (!realmConfig) {
    console.log('[auth] No realm config — auth disabled');
    return;
  }

  console.log(`[auth] Realm mode: ${realmConfig.mode}`);

  if (realmConfig.mode === 'controller') {
    initDatabase((options && options.dbPath) || DB_PATH);
  }
}

function initDatabase(dbPath) {
  const Database = require('better-sqlite3');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      email TEXT,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      last_login TEXT
    );

    CREATE TABLE IF NOT EXISTS player_stats (
      player_id INTEGER NOT NULL REFERENCES players(id),
      server TEXT NOT NULL,
      instance TEXT NOT NULL,
      rank INTEGER DEFAULT 0,
      hours REAL DEFAULT 0,
      offense INTEGER DEFAULT 0,
      bombing INTEGER DEFAULT 0,
      planets INTEGER DEFAULT 0,
      kills INTEGER DEFAULT 0,
      deaths INTEGER DEFAULT 0,
      total INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (player_id, server, instance)
    );
  `);

  console.log(`[auth] SQLite database initialized at ${DB_PATH}`);
}

// ---- Controller: local database operations ----

function registerLocal(name, email, password) {
  if (!db) return { ok: false, error: 'Database not initialized' };

  // Validate inputs
  if (!name || name.length < 2 || name.length > 15) {
    return { ok: false, error: 'Name must be 2-15 characters' };
  }
  if (!/^[a-zA-Z0-9_\-\.]+$/.test(name)) {
    return { ok: false, error: 'Name may only contain letters, numbers, _ - .' };
  }
  if (name.toLowerCase() === 'guest') {
    return { ok: false, error: 'Name "guest" is reserved' };
  }
  if (!password || password.length < 1 || password.length > 15) {
    return { ok: false, error: 'Password must be 1-15 characters' };
  }

  // Check if name already exists
  const existing = db.prepare('SELECT id FROM players WHERE name = ?').get(name);
  if (existing) {
    return { ok: false, error: 'Name already taken' };
  }

  const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  db.prepare('INSERT INTO players (name, email, password_hash) VALUES (?, ?, ?)')
    .run(name, email || null, hash);

  console.log(`[auth] Registered player: ${name}`);
  return { ok: true };
}

function validateLocal(name, password) {
  if (!db) return { ok: false, error: 'Database not initialized' };

  const player = db.prepare('SELECT id, password_hash FROM players WHERE name = ?').get(name);
  if (!player) {
    return { ok: false, error: 'Unknown player' };
  }

  if (!bcrypt.compareSync(password, player.password_hash)) {
    return { ok: false, error: 'Wrong password' };
  }

  db.prepare('UPDATE players SET last_login = datetime(\'now\') WHERE id = ?').run(player.id);
  return { ok: true };
}

function syncStatsLocal(stats) {
  if (!db) return { ok: false, error: 'Database not initialized' };

  const findPlayer = db.prepare('SELECT id FROM players WHERE name = ? COLLATE NOCASE');
  const upsert = db.prepare(`
    INSERT INTO player_stats (player_id, server, instance, rank, hours, offense, bombing, planets, kills, deaths, total, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(player_id, server, instance) DO UPDATE SET
      rank = excluded.rank,
      hours = excluded.hours,
      offense = excluded.offense,
      bombing = excluded.bombing,
      planets = excluded.planets,
      kills = excluded.kills,
      deaths = excluded.deaths,
      total = excluded.total,
      updated_at = datetime('now')
  `);

  const runBatch = db.transaction((entries) => {
    let synced = 0;
    for (const e of entries) {
      const player = findPlayer.get(e.name);
      if (!player) continue; // skip unregistered players
      const result = upsert.run(
        player.id, e.server, e.instance,
        e.rank || 0, e.hours || 0, e.offense || 0, e.bombing || 0,
        e.planets || 0, e.kills || 0, e.deaths || 0, e.total || 0
      );
      if (result.changes > 0) synced++;
    }
    return synced;
  });

  const synced = runBatch(stats);
  return { ok: true, synced };
}

function getBestRankLocal(name) {
  if (!db) return 0;
  const row = db.prepare(
    'SELECT MAX(ps.rank) AS rank FROM player_stats ps JOIN players p ON p.id = ps.player_id WHERE p.name = ? COLLATE NOCASE'
  ).get(name);
  return (row && row.rank) || 0;
}

function getGlobalLeaderboardLocal() {
  if (!db) return { updated: new Date().toISOString(), players: [] };

  const rows = db.prepare(`
    SELECT
      p.name,
      MAX(ps.rank) AS rank,
      SUM(ps.hours) AS hours,
      SUM(ps.offense) AS offense,
      SUM(ps.bombing) AS bombing,
      SUM(ps.planets) AS planets,
      SUM(ps.kills) AS kills,
      SUM(ps.deaths) AS deaths,
      SUM(ps.total) AS total
    FROM player_stats ps
    JOIN players p ON p.id = ps.player_id
    GROUP BY p.id
    ORDER BY rank DESC, total DESC
  `).all();

  return {
    updated: new Date().toISOString(),
    players: rows,
  };
}

// ---- Server mode: proxy to controller ----

async function registerRemote(name, email, password) {
  try {
    const res = await fetch(`${realmConfig.controller}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': realmConfig.apiKey,
      },
      body: JSON.stringify({ name, email, password }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return await res.json();
  } catch (err) {
    console.error('[auth] Controller unreachable for register:', err.message);
    return { ok: false, error: 'Auth service unavailable' };
  }
}

async function validateRemote(name, password) {
  try {
    const res = await fetch(`${realmConfig.controller}/api/auth/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': realmConfig.apiKey,
      },
      body: JSON.stringify({ name, password }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return await res.json();
  } catch (err) {
    console.error('[auth] Controller unreachable for validate:', err.message);
    return { ok: false, error: 'Auth service unavailable', unreachable: true };
  }
}

async function syncStatsRemote(stats) {
  try {
    const res = await fetch(`${realmConfig.controller}/api/stats/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': realmConfig.apiKey,
      },
      body: JSON.stringify(stats),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return await res.json();
  } catch (err) {
    console.error('[auth] Controller unreachable for stats sync:', err.message);
    return { ok: false, error: 'Auth service unavailable' };
  }
}

async function getGlobalLeaderboardRemote() {
  try {
    const res = await fetch(`${realmConfig.controller}/api/global-leaderboard`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return await res.json();
  } catch (err) {
    console.error('[auth] Controller unreachable for leaderboard:', err.message);
    return null;
  }
}

async function getBestRankRemote(name) {
  try {
    const res = await fetch(
      `${realmConfig.controller}/api/auth/best-rank?name=${encodeURIComponent(name)}`,
      {
        headers: { 'X-API-Key': realmConfig.apiKey },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }
    );
    const data = await res.json();
    return data.rank || 0;
  } catch (err) {
    console.error('[auth] Controller unreachable for best-rank:', err.message);
    return 0;
  }
}

// ---- Public API ----

async function register(name, email, password) {
  if (!realmConfig) return { ok: false, error: 'Auth not configured' };
  if (realmConfig.mode === 'controller') return registerLocal(name, email, password);
  return registerRemote(name, email, password);
}

async function validate(name, password) {
  if (!realmConfig) return { ok: false, error: 'Auth not configured' };
  if (realmConfig.mode === 'controller') return validateLocal(name, password);
  return validateRemote(name, password);
}

async function syncStats(stats) {
  if (!realmConfig) return { ok: false, error: 'Auth not configured' };
  if (realmConfig.mode === 'controller') return syncStatsLocal(stats);
  return syncStatsRemote(stats);
}

async function getGlobalLeaderboard() {
  if (!realmConfig) return null;
  if (realmConfig.mode === 'controller') return getGlobalLeaderboardLocal();
  return getGlobalLeaderboardRemote();
}

async function getBestRank(name) {
  if (!realmConfig) return 0;
  if (realmConfig.mode === 'controller') return getBestRankLocal(name);
  return getBestRankRemote(name);
}

// ---- Express route handlers ----

function requireApiKey(req, res, next) {
  if (!realmConfig || !realmConfig.apiKey) {
    return res.status(500).json({ error: 'Auth not configured' });
  }
  if (req.headers['x-api-key'] !== realmConfig.apiKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
}

function setupRoutes(app) {
  if (!realmConfig) return;

  const express = require('express');
  app.use('/api/auth', express.json());
  app.use('/api/stats', express.json());

  // Registration — public (browser calls this directly)
  app.post('/api/auth/register', async (req, res) => {
    const { name, email, password } = req.body || {};
    const result = await register(name, email, password);
    res.json(result);
  });

  // Validation — controller handles directly, servers proxy
  app.post('/api/auth/validate', requireApiKey, async (req, res) => {
    const { name, password } = req.body || {};
    const result = await validate(name, password);
    res.json(result);
  });

  // Best rank — used by proxy for rank-on-login
  app.get('/api/auth/best-rank', requireApiKey, async (req, res) => {
    const name = req.query.name;
    if (!name) return res.status(400).json({ error: 'Missing name parameter' });
    const rank = await getBestRank(name);
    res.json({ rank });
  });

  // Stats sync — controller handles directly, servers proxy
  app.post('/api/stats/sync', requireApiKey, async (req, res) => {
    const stats = req.body;
    if (!Array.isArray(stats)) {
      return res.status(400).json({ error: 'Expected array of stats' });
    }
    const result = await syncStats(stats);
    res.json(result);
  });

  // Global leaderboard — public, CORS, cached
  app.get('/api/global-leaderboard', async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'public, max-age=300');

    // Return cached if fresh
    if (leaderboardCache && Date.now() - leaderboardCache.timestamp < LEADERBOARD_CACHE_MS) {
      return res.json(leaderboardCache.data);
    }

    const data = await getGlobalLeaderboard();
    if (data) {
      leaderboardCache = { data, timestamp: Date.now() };
      return res.json(data);
    }

    // Return stale cache or error
    if (leaderboardCache) return res.json(leaderboardCache.data);
    res.status(503).json({ error: 'Leaderboard unavailable' });
  });
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
  realmConfig = null;
  leaderboardCache = null;
}

module.exports = { init, close, register, validate, syncStats, getGlobalLeaderboard, getBestRank, setupRoutes };
