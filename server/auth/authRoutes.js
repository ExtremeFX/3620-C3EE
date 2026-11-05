'use strict'
const bcrypt = require('bcryptjs')
const db = require('../database/db')
const { RATE_LIMIT_STRICT_AUTH } = require('../security/rateLimiter')

// Pre-compile prepared statements for hot paths
const stmtGetPilotByUsername = db.prepare('SELECT * FROM pilots WHERE username = ?')
const stmtGetPilotByEmailOrUsername = db.prepare(
  'SELECT id FROM pilots WHERE username = ? OR (email IS NOT NULL AND email = ?)'
)

// FIX BUG-AUTH1: wrap the entire registration in a transaction — previously, if any
// INSERT failed partway through, the pilot account existed without ships/storage.
const registerTx = db.transaction((username, email, hash) => {
  const info = db.prepare('INSERT INTO pilots (username, email, password, pi_tokens) VALUES (?,?,?,0)').run(username, email || null, hash)
  const newId = info.lastInsertRowid

  // Starter ships aligned with fleetRoutes.js expected schema
  db.prepare("INSERT INTO hangar_ships (pilot_id, ship_id, quantity) VALUES (?, 'H-M2', 1)").run(newId)
  db.prepare("INSERT INTO hangar_ships (pilot_id, ship_id, quantity) VALUES (?, 'H-7M', 5)").run(newId)
  db.prepare("INSERT INTO hangar_ships (pilot_id, ship_id, quantity) VALUES (?, 'T-WS-Cargi', 1)").run(newId)
  db.prepare('INSERT INTO pilot_storage (pilot_id, ferrox, crynex, varelium, mining_drone) VALUES (?, 0, 0, 0, 0)').run(newId)

  return newId
})

module.exports = async function (fastify) {
  // ─── LOGIN ────────────────────────────────────────────────────────────────
  fastify.post('/auth/login', { config: RATE_LIMIT_STRICT_AUTH }, async (req, reply) => {
    const { username, password } = req.body || {}

    // FIX BUG-AUTH2: validate input types and lengths before hitting bcrypt
    if (typeof username !== 'string' || typeof password !== 'string') {
      return reply.code(400).send({ detail: 'Username and password must be strings' })
    }
    if (!username.trim() || !password) {
      return reply.code(400).send({ detail: 'Username and password are required' })
    }
    if (password.length > 128) {
      return reply.code(400).send({ detail: 'Password too long' })
    }

    const pilot = stmtGetPilotByUsername.get(username)

    // FIX BUG-AUTH3: replace bcrypt.compareSync (blocks event loop) with async compare
    const valid = pilot && await bcrypt.compare(password, pilot.password)
    if (!valid) {
      return reply.code(401).send({ detail: 'Invalid credentials' })
    }

    const token = fastify.jwt.sign({ sub: pilot.username, id: pilot.id }, { expiresIn: '24h' })
    return {
      message: 'Access Granted',
      token,
      pilot: {
        id: pilot.id,
        username: pilot.username,
        credits: pilot.credits,
        pi_tokens: pilot.pi_tokens || 0
      }
    }
  })

  // ─── REGISTER ─────────────────────────────────────────────────────────────
  fastify.post('/auth/register', { config: RATE_LIMIT_STRICT_AUTH }, async (req, reply) => {
    const { username, email, password } = req.body || {}

    // FIX BUG-AUTH2: validate input types and lengths
    if (typeof username !== 'string' || typeof password !== 'string') {
      return reply.code(400).send({ detail: 'Username and password must be strings' })
    }
    if (!username.trim() || !password) {
      return reply.code(400).send({ detail: 'Username and password are required' })
    }
    if (username.length > 32) {
      return reply.code(400).send({ detail: 'Username too long (max 32 characters)' })
    }
    if (password.length < 4 || password.length > 128) {
      return reply.code(400).send({ detail: 'Password must be between 4 and 128 characters' })
    }
    if (email !== undefined && email !== null && email !== '') {
      if (typeof email !== 'string' || !email.includes('@')) {
        return reply.code(400).send({ detail: 'Invalid email format' })
      }
    }

    // FIX BUG-AUTH4: check both username AND email to avoid uncaught UNIQUE constraint crash
    const existing = stmtGetPilotByEmailOrUsername.get(username, email || null)
    if (existing) {
      return reply.code(409).send({ detail: 'Username or email already in use' })
    }

    // FIX BUG-AUTH3: async bcrypt hash
    const hash = await bcrypt.hash(password, 10)

    let newId
    try {
      newId = registerTx(username, email, hash)
    } catch (e) {
      // Catch any remaining SQLite constraint errors (e.g. race condition after our check)
      if (e.message && e.message.includes('UNIQUE constraint')) {
        return reply.code(409).send({ detail: 'Username or email already in use' })
      }
      throw e
    }

    const token = fastify.jwt.sign({ sub: username, id: newId }, { expiresIn: '24h' })
    return {
      message: 'Account created successfully',
      token,
      pilot: { id: newId, username, credits: 5000, pi_tokens: 0 }
    }
  })

  // ─── ME ───────────────────────────────────────────────────────────────────
  fastify.get('/auth/me', {
    onRequest: async (req, reply) => {
      try { await req.jwtVerify() }
      catch { return reply.code(401).send({ detail: 'Invalid session' }) }
    }
  }, async (req, reply) => {
    const pilot = db.prepare('SELECT id, username, credits, pi_tokens, last_daily_reward FROM pilots WHERE id = ?').get(req.user.id)
    if (!pilot) return reply.code(404).send({ detail: 'Pilot not found' })
    return { pilot }
  })
}
