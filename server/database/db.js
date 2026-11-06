'use strict'

/**
 * HARPIA Universe - Database Module (Turso / libsql)
 * Persistent SQLite via Turso Cloud — survives container restarts and redeployments.
 * Falls back to local file if TURSO credentials are not supplied.
 */

const fs = require('fs')
const path = require('path')
const { createClient } = require('@libsql/client')

// Simple fallback .env parser for local dev without external packages
try {
  const envPath = path.join(__dirname, '..', '..', '.env')
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8')
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return
      const idx = trimmed.indexOf('=')
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim()
        const val = trimmed.slice(idx + 1).trim()
        if (!process.env[key]) {
          process.env[key] = val
        }
      }
    })
  }
} catch (_) {}

function createDbClient() {
  const url = process.env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN

  if (url && authToken) {
    console.log('[DB] Connecting to Turso Cloud:', url)
    return createClient({ url, authToken })
  }

  console.warn('[DB] TURSO credentials not detected — using local file:harpia-dev.db')
  return createClient({ url: 'file:harpia-dev.db' })
}

const client = createDbClient()

function wrapRunner(runner) {
  return {
    async get(sql, args = []) {
      const res = await runner.execute({ sql, args })
      return res.rows && res.rows.length > 0 ? res.rows[0] : null
    },
    async all(sql, args = []) {
      const res = await runner.execute({ sql, args })
      return res.rows || []
    },
    async run(sql, args = []) {
      const res = await runner.execute({ sql, args })
      return {
        lastInsertRowid: res.lastInsertRowid !== undefined && res.lastInsertRowid !== null
          ? Number(res.lastInsertRowid)
          : null,
        rowsAffected: res.rowsAffected || 0
      }
    },
    async execute(stmt) {
      return runner.execute(stmt)
    }
  }
}

const db = {
  client,
  ...wrapRunner(client),

  async exec(sql) {
    if (typeof client.executeMultiple === 'function') {
      return client.executeMultiple(sql)
    }
    return client.execute(sql)
  },

  async transaction(fn) {
    const tx = await client.transaction('write')
    const wrappedTx = wrapRunner(tx)
    try {
      const result = await fn(wrappedTx)
      await tx.commit()
      return result
    } catch (err) {
      try { await tx.rollback() } catch (_) {}
      throw err
    }
  },

  async initSchema() {
    console.log('[DB] Initializing database schema in Turso...')
    await client.executeMultiple(`
      CREATE TABLE IF NOT EXISTS pilots (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        username          TEXT UNIQUE NOT NULL,
        email             TEXT UNIQUE,
        password          TEXT NOT NULL,
        credits           INTEGER DEFAULT 5000 CHECK (credits >= 0),
        pi_tokens         INTEGER DEFAULT 0 CHECK (pi_tokens >= 0),
        last_daily_reward INTEGER DEFAULT 0,
        created_at        INTEGER DEFAULT (unixepoch() * 1000),
        position_json     TEXT DEFAULT NULL,
        active_ship_id    TEXT DEFAULT 'H-M2',
        created_ip        TEXT DEFAULT NULL,
        last_ip           TEXT DEFAULT NULL
      );

      CREATE TABLE IF NOT EXISTS hangar_ships (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        pilot_id    INTEGER NOT NULL,
        ship_id     TEXT NOT NULL,
        quantity    INTEGER DEFAULT 0 CHECK (quantity >= 0),
        in_mission  INTEGER DEFAULT 0 CHECK (in_mission >= 0),
        location    TEXT DEFAULT 'BASE',
        cargo_json  TEXT DEFAULT '{}',
        FOREIGN KEY (pilot_id) REFERENCES pilots (id),
        UNIQUE (pilot_id, ship_id)
      );

      CREATE TABLE IF NOT EXISTS pilot_storage (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        pilot_id      INTEGER UNIQUE NOT NULL,
        ferrox        INTEGER DEFAULT 0 CHECK (ferrox >= 0),
        crynex        INTEGER DEFAULT 0 CHECK (crynex >= 0),
        varelium      INTEGER DEFAULT 0 CHECK (varelium >= 0),
        mining_drone  INTEGER DEFAULT 0 CHECK (mining_drone >= 0),
        core_v2       INTEGER DEFAULT 0 CHECK (core_v2 >= 0),
        h_m2          INTEGER DEFAULT 0 CHECK (h_m2 >= 0),
        max_storage   INTEGER DEFAULT 70000,
        FOREIGN KEY (pilot_id) REFERENCES pilots (id)
      );

      CREATE TABLE IF NOT EXISTS asteroid_deposits (
        cell_id       TEXT PRIMARY KEY,
        col           INTEGER NOT NULL,
        row           INTEGER NOT NULL,
        mineral_key   TEXT NOT NULL,
        current_units INTEGER NOT NULL,
        max_units     INTEGER NOT NULL,
        last_mined_at INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS active_missions (
        id                TEXT PRIMARY KEY,
        pilot_id          INTEGER NOT NULL,
        ship_id           TEXT NOT NULL,
        quantity          INTEGER NOT NULL,
        target_col        INTEGER NOT NULL,
        target_row        INTEGER NOT NULL,
        phase             TEXT NOT NULL,
        status            TEXT DEFAULT 'ACTIVE',
        started_at        INTEGER NOT NULL,
        mining_started_at INTEGER NOT NULL,
        mining_ends_at    INTEGER NOT NULL,
        completes_at      INTEGER NOT NULL,
        cargo_minerals    TEXT DEFAULT '{}',
        cargo_capacity    INTEGER DEFAULT 500,
        created_at        INTEGER NOT NULL,
        FOREIGN KEY (pilot_id) REFERENCES pilots (id)
      );

      CREATE TABLE IF NOT EXISTS market_orders (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        pilot_id         INTEGER NOT NULL,
        seller_name      TEXT NOT NULL,
        item_id          TEXT NOT NULL,
        item_name        TEXT NOT NULL,
        quantity         INTEGER NOT NULL CHECK (quantity > 0),
        price_per_unit   INTEGER NOT NULL CHECK (price_per_unit > 0),
        total_price      INTEGER NOT NULL CHECK (total_price > 0),
        station_id       TEXT DEFAULT 'HARPIA BASE',
        created_at       INTEGER DEFAULT (unixepoch() * 1000),
        FOREIGN KEY (pilot_id) REFERENCES pilots (id)
      );

      CREATE TABLE IF NOT EXISTS pending_registrations (
        email             TEXT PRIMARY KEY,
        username          TEXT NOT NULL,
        password_hash     TEXT NOT NULL,
        code              TEXT NOT NULL,
        client_ip         TEXT NOT NULL,
        expires_at        INTEGER NOT NULL,
        created_at        INTEGER NOT NULL,
        attempts          INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_hangar_ships_pilot     ON hangar_ships(pilot_id);
      CREATE INDEX IF NOT EXISTS idx_active_missions_phase  ON active_missions(phase, pilot_id);
      CREATE INDEX IF NOT EXISTS idx_active_missions_pilot  ON active_missions(pilot_id);
      CREATE INDEX IF NOT EXISTS idx_market_orders_pilot    ON market_orders(pilot_id);
      CREATE INDEX IF NOT EXISTS idx_pilots_created_ip      ON pilots(created_ip);
    `)

    console.log('[DB] Turso schema verified and synchronized!')
  }
}

module.exports = db
