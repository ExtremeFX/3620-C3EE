'use strict'
const bcrypt = require('bcryptjs')
const db = require('../database/db')
const { RATE_LIMIT_STRICT_AUTH } = require('../security/rateLimiter')
const { getClientIp, validateEmail, checkIpRegistrationLimits } = require('../security/antiMultiAccount')
const { verifyTurnstileToken, getSiteKey } = require('../security/turnstile')
const { generateOtpCode, sendVerificationEmail } = require('./emailService')

// Pre-compile prepared statements for hot paths
const stmtGetPilotByUsername = db.prepare('SELECT * FROM pilots WHERE username = ?')
const stmtGetPilotByEmailOrUsername = db.prepare(
  'SELECT id FROM pilots WHERE username = ? OR (email IS NOT NULL AND email = ?)'
)
const stmtUpdateLastIp = db.prepare('UPDATE pilots SET last_ip = ? WHERE id = ?')

// Statements para verificação de email pendente
const stmtGetPending = db.prepare('SELECT * FROM pending_registrations WHERE email = ?')
const stmtSavePending = db.prepare(`
  INSERT INTO pending_registrations (email, username, password_hash, code, client_ip, expires_at, created_at, attempts)
  VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  ON CONFLICT(email) DO UPDATE SET
    username = excluded.username,
    password_hash = excluded.password_hash,
    code = excluded.code,
    client_ip = excluded.client_ip,
    expires_at = excluded.expires_at,
    created_at = excluded.created_at,
    attempts = 0
`)
const stmtDeletePending = db.prepare('DELETE FROM pending_registrations WHERE email = ?')
const stmtIncrementAttempts = db.prepare('UPDATE pending_registrations SET attempts = attempts + 1 WHERE email = ?')

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
  // ─── CONFIGURAÇÃO PÚBLICA TURNSTILE ──────────────────────────────────────
  fastify.get('/auth/turnstile/sitekey', async () => {
    return { siteKey: getSiteKey() }
  })

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

  // ─── REGISTER: PASSO 1 (PEDIDO DE REGISTO COM CÓDIGO DE VERIFICAÇÃO) ────────
  fastify.post('/auth/register', { config: RATE_LIMIT_STRICT_AUTH }, async (req, reply) => {
    const { username, email, password, turnstileToken } = req.body || {}
    const clientIp = getClientIp(req)

    // 1. Verificação de limites por IP (Anti-Multi-Account: 1 conta por IP)
    const ipCheck = checkIpRegistrationLimits(db, clientIp)
    if (!ipCheck.allowed) {
      return reply.code(429).send({ detail: ipCheck.error })
    }

    // 2. Validação Cloudflare Turnstile anti-bot
    const turnstileCheck = await verifyTurnstileToken(turnstileToken, clientIp)
    if (!turnstileCheck.success) {
      return reply.code(400).send({ detail: turnstileCheck.error })
    }

    // 3. Validação rigorosa do Email (obrigatório e sem domínios descartáveis)
    const emailCheck = validateEmail(email)
    if (!emailCheck.valid) {
      return reply.code(400).send({ detail: emailCheck.error })
    }
    const cleanEmail = emailCheck.cleanEmail

    // 4. Validação dos tipos e comprimentos de username e password
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

    // 5. Verificação de existência prévia na base de dados
    const existing = stmtGetPilotByEmailOrUsername.get(cleanUsername, cleanEmail)
    if (existing) {
      return reply.code(409).send({ detail: 'Nome de piloto ou email já se encontram em uso' })
    }

    // 6. Geração do código OTP de 6 dígitos e hash seguro da password
    const code = generateOtpCode()
    const passwordHash = await bcrypt.hash(password, 10)
    const now = Date.now()
    const expiresAt = now + 15 * 60 * 1000 // Expira em 15 minutos

    // 7. Guarda nas inscrições pendentes aguardando confirmação do email
    stmtSavePending.run(cleanEmail, cleanUsername, passwordHash, code, clientIp, expiresAt, now)

    // 8. Dispara o envio do email com o código
    await sendVerificationEmail(cleanEmail, cleanUsername, code)

    return {
      step: 'verification_required',
      message: 'Código de verificação enviado! Verifica a tua caixa de correio eletrónico.',
      email: cleanEmail
    }
  })

  // ─── REGISTER: PASSO 2 (CONFIRMAÇÃO DO CÓDIGO E CRIAÇÃO DEFINITIVA) ──────────
  fastify.post('/auth/register/verify', { config: RATE_LIMIT_STRICT_AUTH }, async (req, reply) => {
    const { email, code } = req.body || {}
    const clientIp = getClientIp(req)

    if (!email || typeof email !== 'string' || !code || typeof code !== 'string') {
      return reply.code(400).send({ detail: 'Email e código de verificação são obrigatórios' })
    }

    const cleanEmail = email.trim().toLowerCase()
    const cleanCode = code.trim().replace(/\s+/g, '')

    const pending = stmtGetPending.get(cleanEmail)
    if (!pending) {
      return reply.code(400).send({ detail: 'Nenhum registo pendente encontrado para este email. Inicia o registo novamente.' })
    }

    // Valida expiração (15 minutos)
    if (Date.now() > pending.expires_at) {
      stmtDeletePending.run(cleanEmail)
      return reply.code(400).send({ detail: 'O código de verificação expirou. Por favor solicita um novo código.' })
    }

    // Valida se excedeu número de tentativas erradas (máx 5)
    if (pending.attempts >= 5) {
      stmtDeletePending.run(cleanEmail)
      return reply.code(429).send({ detail: 'Demasiadas tentativas incorretas. O registo foi cancelado por segurança.' })
    }

    // Valida o código
    if (pending.code !== cleanCode) {
      stmtIncrementAttempts.run(cleanEmail)
      const remaining = 5 - (pending.attempts + 1)
      return reply.code(400).send({ detail: `Código incorreto. Tens mais ${remaining} tentativa(s).` })
    }

    // Re-valida limites por IP antes de criar
    const ipCheck = checkIpRegistrationLimits(db, clientIp)
    if (!ipCheck.allowed) {
      stmtDeletePending.run(cleanEmail)
      return reply.code(429).send({ detail: ipCheck.error })
    }

    // Cria a conta do piloto definitivamente com naves e armazém
    let newId
    try {
      newId = registerTx(pending.username, pending.email, pending.password_hash, clientIp)
    } catch (e) {
      if (e.message && e.message.includes('UNIQUE constraint')) {
        stmtDeletePending.run(cleanEmail)
        return reply.code(409).send({ detail: 'Nome de piloto ou email já foram registados.' })
      }
      throw e
    }

    // Remove das pendências
    stmtDeletePending.run(cleanEmail)

    const token = fastify.jwt.sign({ sub: pending.username, id: newId }, { expiresIn: '24h' })
    return {
      message: 'Conta ativada com sucesso! Bem-vindo a HARPIA Universe.',
      token,
      pilot: { id: newId, username: pending.username, credits: 1000, pi_tokens: 0 }
    }
  })

  // ─── REGISTER: REENVIAR CÓDIGO DE VERIFICAÇÃO ──────────────────────────────
  fastify.post('/auth/register/resend', { config: RATE_LIMIT_STRICT_AUTH }, async (req, reply) => {
    const { email } = req.body || {}
    if (!email || typeof email !== 'string') {
      return reply.code(400).send({ detail: 'Email é obrigatório' })
    }

    const cleanEmail = email.trim().toLowerCase()
    const pending = stmtGetPending.get(cleanEmail)
    if (!pending) {
      return reply.code(400).send({ detail: 'Nenhum registo pendente encontrado para este email.' })
    }

    // Limita reenvio a 1 vez a cada 60 segundos
    const now = Date.now()
    if (now - pending.created_at < 60 * 1000) {
      const waitSec = Math.ceil((60 * 1000 - (now - pending.created_at)) / 1000)
      return reply.code(429).send({ detail: `Aguarda ${waitSec} segundos antes de solicitar novo código.` })
    }

    const newCode = generateOtpCode()
    const newExpiresAt = now + 15 * 60 * 1000

    db.prepare('UPDATE pending_registrations SET code = ?, expires_at = ?, created_at = ?, attempts = 0 WHERE email = ?')
      .run(newCode, newExpiresAt, now, cleanEmail)

    await sendVerificationEmail(cleanEmail, pending.username, newCode)

    return { message: 'Novo código de verificação enviado para a tua caixa de correio.' }
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
