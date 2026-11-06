'use strict'
const bcrypt = require('bcryptjs')
const db = require('../database/db')
const { RATE_LIMIT_STRICT_AUTH } = require('../security/rateLimiter')
const { getClientIp, validateEmail, checkIpRegistrationLimits } = require('../security/antiMultiAccount')

// Pre-compile prepared statements for hot paths
const stmtGetPilotByUsername = db.prepare('SELECT * FROM pilots WHERE username = ?')
const stmtGetPilotByEmailOrUsername = db.prepare(
  'SELECT id FROM pilots WHERE username = ? OR (email IS NOT NULL AND email = ?)'
)
const stmtUpdateLastIp = db.prepare('UPDATE pilots SET last_ip = ? WHERE id = ?')

// FIX BUG-AUTH1: wrap the entire registration in a transaction
const registerTx = db.transaction((username, email, hash, clientIp) => {
  const now = Date.now()
  // FIX ANTI-SMURF: last_daily_reward definido para o momento atual impede recolher Daily Reward
  // instantaneamente no minuto 0 após registo — desbloqueia apenas às 00:00 do dia seguinte.
  const info = db.prepare(
    'INSERT INTO pilots (username, email, password, credits, pi_tokens, last_daily_reward, created_at, created_ip, last_ip) VALUES (?,?,?,1000,0,?,?,?,?)'
  ).run(username, email, hash, now, now, clientIp, clientIp)
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

    // Atualiza o último IP do piloto de forma segura
    try {
      stmtUpdateLastIp.run(getClientIp(req), pilot.id)
    } catch (_) {}

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
    const clientIp = getClientIp(req)

    // 1. Verificação de limites por IP (Anti-Multi-Account)
    const ipCheck = checkIpRegistrationLimits(db, clientIp)
    if (!ipCheck.allowed) {
      return reply.code(429).send({ detail: ipCheck.error })
    }

    // 2. Validação rigorosa do Email (obrigatório e sem domínios descartáveis)
    const emailCheck = validateEmail(email)
    if (!emailCheck.valid) {
      return reply.code(400).send({ detail: emailCheck.error })
    }
    const cleanEmail = emailCheck.cleanEmail

    // 3. Validação dos tipos e comprimentos de username e password
    if (typeof username !== 'string' || typeof password !== 'string') {
      return reply.code(400).send({ detail: 'Nome de piloto e palavra-passe devem ser texto' })
    }
    const cleanUsername = username.trim()
    if (!cleanUsername || !password) {
      return reply.code(400).send({ detail: 'Nome de piloto e palavra-passe são obrigatórios' })
    }
    if (cleanUsername.length < 3 || cleanUsername.length > 24) {
      return reply.code(400).send({ detail: 'Nome de piloto deve ter entre 3 e 24 carateres' })
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(cleanUsername)) {
      return reply.code(400).send({ detail: 'Nome de piloto só pode conter letras, números, hífen e underscore' })
    }
    if (password.length < 6 || password.length > 128) {
      return reply.code(400).send({ detail: 'A palavra-passe deve ter entre 6 e 128 carateres' })
    }

    // 4. Verificação de existência prévia
    const existing = stmtGetPilotByEmailOrUsername.get(cleanUsername, cleanEmail)
    if (existing) {
      return reply.code(409).send({ detail: 'Nome de piloto ou email já se encontram em uso' })
    }

    // 5. Criptografia assíncrona da palavra-passe
    const hash = await bcrypt.hash(password, 10)

    let newId
    try {
      newId = registerTx(cleanUsername, cleanEmail, hash, clientIp)
    } catch (e) {
      if (e.message && e.message.includes('UNIQUE constraint')) {
        return reply.code(409).send({ detail: 'Nome de piloto ou email já se encontram em uso' })
      }
      throw e
    }

    const token = fastify.jwt.sign({ sub: cleanUsername, id: newId }, { expiresIn: '24h' })
    return {
      message: 'Conta de piloto criada com sucesso',
      token,
      pilot: { id: newId, username: cleanUsername, credits: 1000, pi_tokens: 0 }
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
