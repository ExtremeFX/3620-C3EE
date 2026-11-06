'use strict'
const bcrypt = require('bcryptjs')
const db = require('../database/db')
const { RATE_LIMIT_STRICT_AUTH } = require('../security/rateLimiter')
const { getClientIp, validateEmail, checkIpRegistrationLimits } = require('../security/antiMultiAccount')
const { verifyTurnstileToken, getSiteKey } = require('../security/turnstile')
const { generateOtpCode, sendVerificationEmail } = require('./emailService')

async function registerPilotTx(username, email, hash, clientIp) {
  return db.transaction(async (tx) => {
    const now = Date.now()
    const info = await tx.run(
      'INSERT INTO pilots (username, email, password, credits, pi_tokens, last_daily_reward, created_at, created_ip, last_ip) VALUES (?,?,?,1000,0,?,?,?,?)',
      [username, email, hash, now, now, clientIp, clientIp]
    )
    const newId = info.lastInsertRowid

    await tx.run("INSERT INTO hangar_ships (pilot_id, ship_id, quantity) VALUES (?, 'H-M2', 1)", [newId])
    await tx.run("INSERT INTO hangar_ships (pilot_id, ship_id, quantity) VALUES (?, 'H-7M', 5)", [newId])
    await tx.run("INSERT INTO hangar_ships (pilot_id, ship_id, quantity) VALUES (?, 'T-WS-Cargi', 1)", [newId])
    await tx.run('INSERT INTO pilot_storage (pilot_id, ferrox, crynex, varelium, mining_drone) VALUES (?, 0, 0, 0, 0)', [newId])

    return newId
  })
}

module.exports = async function (fastify) {
  // ─── CONFIGURAÇÃO PÚBLICA TURNSTILE ──────────────────────────────────────
  fastify.get('/auth/turnstile/sitekey', async () => {
    return { siteKey: getSiteKey() }
  })

  // ─── LOGIN ────────────────────────────────────────────────────────────────
  fastify.post('/auth/login', { config: RATE_LIMIT_STRICT_AUTH }, async (req, reply) => {
    const { username, password } = req.body || {}

    if (typeof username !== 'string' || typeof password !== 'string') {
      return reply.code(400).send({ detail: 'Username and password must be strings' })
    }
    if (!username.trim() || !password) {
      return reply.code(400).send({ detail: 'Username and password are required' })
    }
    if (password.length > 128) {
      return reply.code(400).send({ detail: 'Password too long' })
    }

    const pilot = await db.get('SELECT * FROM pilots WHERE username = ?', [username.trim()])

    const valid = pilot && await bcrypt.compare(password, pilot.password)
    if (!valid) {
      return reply.code(401).send({ detail: 'Invalid credentials' })
    }

    const token = fastify.jwt.sign({ sub: pilot.username, id: pilot.id }, { expiresIn: '24h' })

    try {
      await db.run('UPDATE pilots SET last_ip = ? WHERE id = ?', [getClientIp(req), pilot.id])
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
    const ipCheck = await checkIpRegistrationLimits(db.client, clientIp)
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
      return reply.code(400).send({ detail: 'Pilot callsign and password must be strings' })
    }
    const cleanUsername = username.trim()
    if (!cleanUsername || !password) {
      return reply.code(400).send({ detail: 'Pilot callsign and password are required' })
    }
    if (cleanUsername.length < 3 || cleanUsername.length > 24) {
      return reply.code(400).send({ detail: 'Pilot callsign must be between 3 and 24 characters' })
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(cleanUsername)) {
      return reply.code(400).send({ detail: 'Callsign may only contain letters, numbers, hyphens, and underscores' })
    }
    if (password.length < 6 || password.length > 128) {
      return reply.code(400).send({ detail: 'Password must be between 6 and 128 characters' })
    }

    // 5. Verificação de existência prévia na base de dados
    const existing = await db.get(
      'SELECT id FROM pilots WHERE username = ? OR (email IS NOT NULL AND email = ?)',
      [cleanUsername, cleanEmail]
    )
    if (existing) {
      return reply.code(409).send({ detail: 'Callsign or email address is already in use' })
    }

    // 6. Geração do código OTP de 6 dígitos e hash seguro da password
    const code = generateOtpCode()
    const passwordHash = await bcrypt.hash(password, 10)
    const now = Date.now()
    const expiresAt = now + 15 * 60 * 1000 // Expira em 15 minutos

    // 7. Guarda nas inscrições pendentes aguardando confirmação do email
    await db.run(`
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
    `, [cleanEmail, cleanUsername, passwordHash, code, clientIp, expiresAt, now])

    // 8. Dispara o envio do email com o código
    const emailResult = await sendVerificationEmail(cleanEmail, cleanUsername, code)

    // Se o envio de email estiver indisponível/bloqueado no host (ex: firewall do Render Free bloqueia portas SMTP 25, 465, 587):
    if (!emailResult || !emailResult.sent || emailResult.mode === 'log_fallback') {
      console.log(`[AUTH] Outbound SMTP blocked by host firewall. Auto-activating pilot: ${cleanUsername}`)
      const newId = await registerPilotTx(cleanUsername, cleanEmail, passwordHash, clientIp)
      await db.run('DELETE FROM pending_registrations WHERE email = ?', [cleanEmail])

      const token = fastify.jwt.sign({ sub: cleanUsername, id: newId }, { expiresIn: '24h' })
      return {
        step: 'completed',
        message: 'Account created and activated! Welcome to HARPIA Universe, Commander.',
        token,
        pilot: { id: newId, username: cleanUsername, credits: 1000, pi_tokens: 0 }
      }
    }

    return {
      step: 'verification_required',
      message: 'Verification code sent! Please check your email inbox or spam folder.',
      email: cleanEmail
    }
  })

  // ─── REGISTER: PASSO 2 (CONFIRMAÇÃO DO CÓDIGO E CRIAÇÃO DEFINITIVA) ──────────
  fastify.post('/auth/register/verify', { config: RATE_LIMIT_STRICT_AUTH }, async (req, reply) => {
    const { email, code } = req.body || {}
    const clientIp = getClientIp(req)

    if (!email || typeof email !== 'string' || !code || typeof code !== 'string') {
      return reply.code(400).send({ detail: 'Email and verification code are required' })
    }

    const cleanEmail = email.trim().toLowerCase()
    const cleanCode = code.trim().replace(/\s+/g, '')

    const pending = await db.get('SELECT * FROM pending_registrations WHERE email = ?', [cleanEmail])
    if (!pending) {
      return reply.code(400).send({ detail: 'No pending registration found for this email. Please restart registration.' })
    }

    // Valida expiração (15 minutos)
    if (Date.now() > pending.expires_at) {
      await db.run('DELETE FROM pending_registrations WHERE email = ?', [cleanEmail])
      return reply.code(400).send({ detail: 'Verification code has expired. Please request a new code.' })
    }

    // Valida se excedeu número de tentativas erradas (máx 5)
    if (pending.attempts >= 5) {
      await db.run('DELETE FROM pending_registrations WHERE email = ?', [cleanEmail])
      return reply.code(429).send({ detail: 'Too many invalid attempts. Registration cancelled for security.' })
    }

    // Valida o código
    if (pending.code !== cleanCode) {
      await db.run('UPDATE pending_registrations SET attempts = attempts + 1 WHERE email = ?', [cleanEmail])
      const remaining = 5 - (pending.attempts + 1)
      return reply.code(400).send({ detail: `Incorrect code. ${remaining} attempt(s) remaining.` })
    }

    // Re-valida limites por IP antes de criar
    const ipCheck = await checkIpRegistrationLimits(db.client, clientIp)
    if (!ipCheck.allowed) {
      await db.run('DELETE FROM pending_registrations WHERE email = ?', [cleanEmail])
      return reply.code(429).send({ detail: ipCheck.error })
    }

    // Cria a conta do piloto definitivamente com naves e armazém
    let newId
    try {
      newId = await registerPilotTx(pending.username, pending.email, pending.password_hash, clientIp)
    } catch (e) {
      if (e.message && e.message.includes('UNIQUE constraint')) {
        await db.run('DELETE FROM pending_registrations WHERE email = ?', [cleanEmail])
        return reply.code(409).send({ detail: 'Pilot callsign or email has already been registered.' })
      }
      throw e
    }

    // Remove das pendências
    await db.run('DELETE FROM pending_registrations WHERE email = ?', [cleanEmail])

    const token = fastify.jwt.sign({ sub: pending.username, id: newId }, { expiresIn: '24h' })
    return {
      message: 'Account verified and activated! Welcome to HARPIA Universe.',
      token,
      pilot: { id: newId, username: pending.username, credits: 1000, pi_tokens: 0 }
    }
  })

  // ─── REGISTER: REENVIAR CÓDIGO DE VERIFICAÇÃO ──────────────────────────────
  fastify.post('/auth/register/resend', { config: RATE_LIMIT_STRICT_AUTH }, async (req, reply) => {
    const { email } = req.body || {}
    if (!email || typeof email !== 'string') {
      return reply.code(400).send({ detail: 'Email is required' })
    }

    const cleanEmail = email.trim().toLowerCase()
    const pending = await db.get('SELECT * FROM pending_registrations WHERE email = ?', [cleanEmail])
    if (!pending) {
      return reply.code(400).send({ detail: 'No pending registration found for this email address.' })
    }

    // Limita reenvio a 1 vez a cada 60 segundos
    const now = Date.now()
    if (now - pending.created_at < 60 * 1000) {
      const waitSec = Math.ceil((60 * 1000 - (now - pending.created_at)) / 1000)
      return reply.code(429).send({ detail: `Please wait ${waitSec} seconds before requesting a new code.` })
    }

    const newCode = generateOtpCode()
    const newExpiresAt = now + 15 * 60 * 1000

    await db.run(
      'UPDATE pending_registrations SET code = ?, expires_at = ?, created_at = ?, attempts = 0 WHERE email = ?',
      [newCode, newExpiresAt, now, cleanEmail]
    )

    await sendVerificationEmail(cleanEmail, pending.username, newCode)

    return { message: 'New verification code dispatched to your inbox.' }
  })

  // ─── ME ───────────────────────────────────────────────────────────────────
  fastify.get('/auth/me', {
    onRequest: async (req, reply) => {
      try { await req.jwtVerify() }
      catch { return reply.code(401).send({ detail: 'Invalid session' }) }
    }
  }, async (req, reply) => {
    const pilot = await db.get('SELECT id, username, credits, pi_tokens, last_daily_reward FROM pilots WHERE id = ?', [req.user.id])
    if (!pilot) return reply.code(404).send({ detail: 'Pilot not found' })
    return { pilot }
  })
}
