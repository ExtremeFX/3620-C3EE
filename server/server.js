'use strict'

const path = require('path')
const Fastify = require('fastify')
const bcrypt = require('bcryptjs')
const db = require('./database/db')
const wsManager = require('./websocket/wsManager')
const simulation = require('./simulation/simulationEngine')
const spatialManager = require('./multiplayer/spatialManager')
const { registerRateLimiter } = require('./security/rateLimiter')

const app = Fastify({ logger: true, trustProxy: true })

// ─── JSON BODY PARSER ────────────────────────────────────────────────────────
app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  if (!body || body.trim().length === 0) return done(null, {})
  try {
    const parsed = JSON.parse(body)
    done(null, (parsed !== null && typeof parsed === 'object') ? parsed : {})
  } catch (err) {
    err.statusCode = 400
    done(err, undefined)
  }
})

// ─── CORS ────────────────────────────────────────────────────────────────────
const envOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
const ALLOWED_ORIGINS = ['http://localhost:8000', 'http://127.0.0.1:8000', ...envOrigins]

app.register(require('@fastify/cors'), {
  origin: (origin, cb) => {
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

// ─── JWT & WEBSOCKETS ─────────────────────────────────────────────────────────
const jwtSecret = process.env.JWT_SECRET || 'HARPIA_PRODUCTION_FALLBACK_SECRET_2026_KEY_SECURE'
if (!process.env.JWT_SECRET) {
  console.warn('[WARN] JWT_SECRET não definida — a usar chave padrão de fallback.')
}
app.register(require('@fastify/jwt'), { secret: jwtSecret })
app.register(require('@fastify/websocket'))

// ─── RATE LIMITING ───────────────────────────────────────────────────────────
registerRateLimiter(app)

// ─── STATIC FILES ─────────────────────────────────────────────────────────────
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

const BLOCKED_PREFIXES = ['/server/', '/node_modules/']
const BLOCKED_EXTENSIONS = /\.(db|db-shm|db-wal|js\.map|env)$/i

app.addHook('onRequest', async (req, reply) => {
  const url = (req.url || '').split('?')[0].toLowerCase()

  if (BLOCKED_PREFIXES.some(p => url.startsWith(p)) || BLOCKED_EXTENSIONS.test(url)) {
    return reply.code(403).send('Access denied')
  }

  if (url.startsWith('/assets/')) {
    const referer = req.headers['referer'] || req.headers['referrer'] || ''
    const host    = req.headers['host'] || ''
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

    if (!token) {
      try { socket.close(4001, 'Missing authentication token') } catch (_) {}
      return
    }

    let pilotId
    let username = 'Piloto'
    try {
      const decoded = app.jwt.verify(token)
      pilotId = decoded.id
      username = decoded.sub || 'Piloto'
    } catch (e) {
      try { socket.close(4003, 'Invalid or expired token') } catch (_) {}
      return
    }

    wsManager.registerClient(pilotId, socket, username)
    spatialManager.registerPilot(pilotId, username)
    console.log(`[WS] Piloto #${pilotId} (${username}) conectado via WebSocket`)
  })

  // Router de Mensagens Multijogador (Telemetria, Mineração, Chat Espacial)
  wsManager.onMessage((pilotId, msg, socket, username) => {
    if (msg.type === 'PILOT_TELEMETRY') {
      spatialManager.updateTelemetry(pilotId, { ...msg.payload, username })
    } else if (msg.type === 'PILOT_MINING_STATE') {
      spatialManager.updateMining(pilotId, msg.payload)
    } else if (msg.type === 'CHAT_MESSAGE') {
      spatialManager.broadcastChat(pilotId, username, msg.payload?.channel, msg.payload?.text)
    }
  })

  wsManager.onDisconnect((pilotId) => {
    spatialManager.unregisterPilot(pilotId)
  })

  // ─── DIAGNOSTIC: TESTE TCP PORTA 587 (SMTP GMAIL) ──────────────────────────
  api.get('/api/diag/smtp', async () => {
    const net = require('net')
    return new Promise((resolve) => {
      const s = net.connect(587, 'smtp.gmail.com', () => {
        resolve({ result: 'SMTP_PORT_587_OPEN', host: 'smtp.gmail.com', port: 587 })
        s.end()
      })
      s.setTimeout(10000)
      s.on('timeout', () => {
        resolve({ result: 'SMTP_TIMEOUT', host: 'smtp.gmail.com', port: 587, detail: '10s timeout reached' })
        s.destroy()
      })
      s.on('error', (e) => {
        resolve({ result: 'SMTP_ERROR', code: e.code, message: e.message })
      })
    })
  })
})

// ─── SERVER STARTUP (ASYNC SCHEMA + SEED + LISTEN) ───────────────────────────
async function start() {
  try {
    await db.initSchema()

    // Seed: piloto Ninja (se não existir)
    try {
      const ninjaExists = await db.get("SELECT id FROM pilots WHERE username = 'Ninja'")
      if (!ninjaExists) {
        const hash = await bcrypt.hash('123', 10)
        await db.transaction(async (tx) => {
          const info = await tx.run(
            "INSERT INTO pilots (username, email, password, credits, pi_tokens) VALUES ('Ninja','ninja@harpia.net',?,5000,0)",
            [hash]
          )
          const ninjaId = info.lastInsertRowid
          await tx.run("INSERT INTO hangar_ships (pilot_id, ship_id, quantity) VALUES (?, 'H-M2', 1)", [ninjaId])
          await tx.run("INSERT INTO hangar_ships (pilot_id, ship_id, quantity) VALUES (?, 'H-7M', 5)", [ninjaId])
          await tx.run("INSERT INTO hangar_ships (pilot_id, ship_id, quantity) VALUES (?, 'T-WS-Cargi', 1)", [ninjaId])
          await tx.run("INSERT INTO pilot_storage (pilot_id, ferrox, crynex, varelium, mining_drone) VALUES (?, 0, 0, 0, 0)", [ninjaId])
        })
        console.log('[DB] Piloto Ninja inicializado com naves e armazém em Turso Cloud')
      }
    } catch (seedErr) {
      console.warn('[DB] Seed warning:', seedErr.message)
    }

    const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8000
    await app.listen({ port: PORT, host: '0.0.0.0' })

    console.log('===========================================================')
    console.log('  HARPIA Universe - Modular Monolith Server ONLINE')
    console.log('  HTTP/API: Fastify v4')
    console.log('  Database: Turso Cloud (libsql persistent)')
    console.log('  Engine:   1s Tick Authoritative Simulation Loop')
    console.log('  Realtime: WebSockets Manager')
    console.log(`  URL:      http://localhost:${PORT}`)
    console.log('===========================================================')

    await simulation.start()
    spatialManager.start(wsManager)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
