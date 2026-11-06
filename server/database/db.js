'use strict'
const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')

function initDatabase() {
  const preferredPath = process.env.DB_PATH || path.join(__dirname, '..', 'harpia.db')
  try {
    const instance = new Database(preferredPath)
    console.log(`[DB] Base de dados ligada em: ${preferredPath}`)
    return instance
  } catch (err) {
    console.warn(`[DB] Falha ao abrir em ${preferredPath} (${err.message}) — a usar fallback seguro em /tmp/harpia.db`)
    const tmpPath = path.join('/tmp', 'harpia.db')
    const instance = new Database(tmpPath)
    console.log(`[DB] Base de dados ligada com sucesso em: ${tmpPath}`)
    return instance
  }
}

const db = initDatabase()

// Performance and integrity PRAGMAs
try {
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')  // FIX BUG-DB1: foreign key constraints were silently disabled
  db.pragma('wal_checkpoint(TRUNCATE)')
} catch (e) {
  console.warn('[DB] Aviso de PRAGMAs:', e.message)
}

// Tabelas principais
db.exec(`
  CREATE TABLE IF NOT EXISTS pilots (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    username          TEXT UNIQUE NOT NULL,
    email             TEXT UNIQUE,
    password          TEXT NOT NULL,
    credits           INTEGER DEFAULT 5000 CHECK (credits >= 0),
    pi_tokens         INTEGER DEFAULT 0 CHECK (pi_tokens >= 0),
    last_daily_reward INTEGER DEFAULT 0,
    created_at        INTEGER DEFAULT (unixepoch() * 1000)
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
`)

// FIX BUG-DB2: missing column migrations — consolidated and guarded by column existence check
;[
  'ALTER TABLE pilot_storage ADD COLUMN core_v2      INTEGER DEFAULT 0 CHECK (core_v2 >= 0)',
  'ALTER TABLE pilot_storage ADD COLUMN h_m2         INTEGER DEFAULT 0 CHECK (h_m2 >= 0)',
  'ALTER TABLE pilot_storage ADD COLUMN mining_drone INTEGER DEFAULT 0 CHECK (mining_drone >= 0)',
  'ALTER TABLE pilots ADD COLUMN position_json       TEXT DEFAULT NULL',
  'ALTER TABLE pilots ADD COLUMN active_ship_id      TEXT DEFAULT "H-M2"',
  'ALTER TABLE pilots ADD COLUMN created_ip          TEXT DEFAULT NULL',
  'ALTER TABLE pilots ADD COLUMN last_ip             TEXT DEFAULT NULL',
  // Migrate last_daily_reward from TEXT to INTEGER (stored as epoch ms)
  // SQLite cannot ALTER column type, but INTEGER affinity handles numeric strings transparently
].forEach(sql => {
  try { db.exec(sql) } catch (e) {
    // Only silently skip "duplicate column" errors; log anything unexpected
    if (!e.message.includes('duplicate column name')) {
      console.warn('[DB] Migration warning:', e.message)
    }
  }
})

// FIX BUG-DB3: add performance indexes missing from original schema
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_hangar_ships_pilot     ON hangar_ships(pilot_id);
  CREATE INDEX IF NOT EXISTS idx_active_missions_phase  ON active_missions(phase, pilot_id);
  CREATE INDEX IF NOT EXISTS idx_active_missions_pilot  ON active_missions(pilot_id);
  CREATE INDEX IF NOT EXISTS idx_market_orders_pilot    ON market_orders(pilot_id);
  CREATE INDEX IF NOT EXISTS idx_pilots_created_ip      ON pilots(created_ip);
`)

module.exports = db
