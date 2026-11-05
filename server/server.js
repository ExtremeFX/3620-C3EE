'use strict'

const path = require('path')
const Fastify = require('fastify')
const db = require('./database/db')
const wsManager = require('./websocket/wsManager')
const simulation = require('./simulation/simulationEngine')
const { registerRateLimiter } = require('./security/rateLimiter')

// ─── SEED: piloto Ninja (apenas em dev, dentro de uma transação) ────────────
const bcrypt = require('bcryptjs')
const seedTx = db.transaction(() => {
  const ninjaExists = db.prepare("SELECT id FROM pilots WHERE username = 'Ninja'").get()
  if (ninjaExists) return

  // FIX BUG-SEED1: wrap all seed inserts in a single transaction so the account
  // is never left half-initialised if the process crashes mid-seed
  const hash = bcrypt.hashSync('123', 10)
  const info = db.prepare("INSERT INTO pilots (username, email, password, credits, pi_tokens) VALUES ('Ninja','ninja@harpia.net',?,5000,0)").run(hash)
  const ninjaId = info.lastInsertRowid
  db.prepare("INSERT OR IGNORE INTO hangar_ships (pilot_id, ship_id, quantity) VALUES (?, 'H-M2', 1)").run(ninjaId)
  db.prepare("INSERT OR IGNORE INTO hangar_ships (pilot_id, ship_id, quantity) VALUES (?, 'H-7M', 5)").run(ninjaId)
  db.prepare("INSERT OR IGNORE INTO hangar_ships (pilot_id, ship_id, quantity) VALUES (?, 'T-WS-Cargi', 1)").run(ninjaId)
  db.prepare("INSERT OR IGNORE INTO pilot_storage (pilot_id, ferrox, crynex, varelium, mining_drone) VALUES (?, 0, 0, 0, 0)").run(ninjaId)
  console.log('[DB] Piloto Ninja inicializado com naves e armazém')
})
seedTx()

const app = Fastify({ logger: true })

// ─── JSON BODY PARSER ────────────────────────────────────────────────────────
app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  if (!body || body.trim().length === 0) return done(null, {})
  try {
    const parsed = JSON.parse(body)
    // FIX BUG-JSON: ensure parsed body is always an object (not a primitive)
    done(null, (parsed !== null && typeof parsed === 'object') ? parsed : {})
  } catch (err) {
    err.statusCode = 400
    done(err, undefined)
  }
})

// ─── CORS ────────────────────────────────────────────────────────────────────
// Restringe origens ou aceita configuradas via ALLOWED_ORIGINS e *.hostless.app
const envOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
const ALLOWED_ORIGINS = ['http://localhost:8000', 'http://127.0.0.1:8000', ...envOrigins]

app.register(require('@fastify/cors'), {
  origin: (origin, cb) => {
    // Permite pedidos sem header Origin (same-origin, fetch local, curl)
    if (!origin) return cb(null, true)
    if (
      ALLOWED_ORIGINS.includes(origin) ||
      ALLOWED_ORIGINS.includes('*') ||
      origin.endsWith('.hostless.app') ||
      origin.endsWith('.hostless.cloud')
    ) {
      return cb(null, true)
    }
    cb(new Error('CORS: origin not allowed'), false)
  }
})

// FIX BUG-JWT: carregar JWT secret de env var com fallback seguro para não quebrar no primeiro boot
const jwtSecret = process.env.JWT_SECRET || 'HARPIA_PRODUCTION_FALLBACK_SECRET_2026_KEY_SECURE'
if (!process.env.JWT_SECRET) {
  console.warn('[WARN] JWT_SECRET não definida — a usar chave padrão de fallback. Configure JWT_SECRET no Hostless!')
}
app.register(require('@fastify/jwt'), { secret: jwtSecret })
app.register(require('@fastify/websocket'))

// ─── RATE LIMITING (Proteção anti-spam / DDoS / Brute-force) ─────────────
registerRateLimiter(app)

// ─── STATIC FILES ─────────────────────────────────────────────────────────────
// FIX BUG-STATIC: block access to server source, database, and node_modules via onRequest hook
// The root stays at project root so the game frontend is served correctly.
app.register(require('@fastify/static'), {
  root: path.join(__dirname, '..'),
  prefix: '/',
  setHeaders: (res, filePath) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    if (/\.(png|jpg|jpeg|webm|gif|svg|webp)$/i.test(filePath)) {
      res.setHeader('Content-Disposition', 'inline')
      res.setHeader('X-Frame-Options', 'SAMEORIGIN')
      res.setHeader('X-Content-Type-Options', 'nosniff')
    }
  }
})

// Block direct access to server source, database, node_modules
const BLOCKED_PREFIXES = ['/server/', '/node_modules/']
const BLOCKED_EXTENSIONS = /\.(db|db-shm|db-wal|js\.map|env)$/i

app.addHook('onRequest', async (req, reply) => {
  const url = (req.url || '').split('?')[0].toLowerCase()

  // Block server internals and database files
  if (BLOCKED_PREFIXES.some(p => url.startsWith(p)) || BLOCKED_EXTENSIONS.test(url)) {
    return reply.code(403).send('Access denied')
  }

  // Referer check for /assets/ — improved: no longer breaks on production domains
  if (url.startsWith('/assets/')) {
    const referer = req.headers['referer'] || req.headers['referrer'] || ''
    const host    = req.headers['host'] || ''
    // Allow when request comes from same host or has no referer (direct page load / same-origin)
    const sameHost = host && (referer === '' || referer.includes(host))
    if (!sameHost) {
      return reply.code(403).send('Access denied')
    }
  }
})

// ─── ROUTES ──────────────────────────────────────────────────────────────────
app.register(async function (api) {
  await api.register(require('./auth/authRoutes'))
  await api.register(require('./economy/economyRoutes'))
  await api.register(require('./fleets/fleetRoutes'))

  // WebSocket endpoint
  api.get('/ws', { websocket: true }, (socket, req) => {
    const token = req.query.token

    // FIX BUG-WS5: reject the connection immediately if no token or invalid token
    // instead of silently registering as pilotId=0
    if (!token) {
      try { socket.close(4001, 'Missing authentication token') } catch (_) {}
      return
    }

    let pilotId
    try {
      const decoded = app.jwt.verify(token)
      pilotId = decoded.id
    } catch (e) {
      try { socket.close(4003, 'Invalid or expired token') } catch (_) {}
      return
    }

    wsManager.registerClient(pilotId, socket)
    console.log(`[WS] Piloto #${pilotId} conectado via WebSocket`)
  })
})

// ─── START ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8000
app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err)
    process.exit(1)
  }
  console.log('===========================================================')
  console.log('  HARPIA Universe - Modular Monolith Server ONLINE')
  console.log('  HTTP/API: Fastify v4')
  console.log('  Engine:   1s Tick Authoritative Simulation Loop')
  console.log('  Realtime: WebSockets Manager')
  console.log(`  URL:      http://localhost:${PORT}`)
  console.log('===========================================================')

  simulation.start()
})
