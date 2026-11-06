'use strict'

/**
 * HARPIA Universe - Anti-Multi-Account & Identity Protection Module
 *
 * Previne criação de contas infinitas, farming abusivo e multi-accounting através de:
 * 1. Validação estrita de formato de Email e bloqueio de domínios temporários / descartáveis
 * 2. Limite de criação de contas por endereço IP (tempo e total)
 * 3. Identificação e registo de IP do cliente (compatível com proxies e Cloudflare)
 */

// Lista negra dos principais provedores de email temporário / descartável
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  '10minutemail.com', '10minutemail.net', '10minutemail.org', '10minutemail.co.uk',
  'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tempmail.net', 'tempmail.ninja',
  'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamail.biz',
  'mailinator.com', 'yopmail.com', 'yopmail.fr', 'yopmail.net',
  'sharklasers.com', 'grr.la', 'pokemail.net', 'spam4.me',
  'throwawaymail.com', 'dispostable.com', 'fakemailgenerator.com',
  'mohmal.com', 'trashmail.com', 'trashmail.net', 'trashmail.me',
  'burnermail.io', 'crazymailing.com', 'generator.email', 'tempail.com',
  'nada.ltd', 'getairmail.com', 'mytemp.email', 'inboxbear.com',
  'tempr.email', 'emailondeck.com', 'dropmail.me', 'fakeinbox.com',
  'minuteinbox.com', 'getnada.com', 'abcvg.com', 'duck2.club'
])

// Expressão regular RFC 5322 simplificada para email
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

// Configurações estritas anti-multi-account por IP
const LIMITS = {
  MAX_PER_DAY: 1,      // Apenas 1 conta por IP por dia
  MAX_TOTAL_PER_IP: 1, // Limite estrito de 1 conta única por IP
  DAY_IN_MS: 24 * 60 * 60 * 1000
}

// Redes e IPs com exceção especial autorizada (ex: desenvolvedor / administrador / testes)
const EXCEPTION_NETWORKS = [
  '2001:8a0:67eb:9000:f1d2:1014:6377:e82b',
  '31.22.203.38',
  '2001:8a0:67eb:',  // Prefixo IPv6 residencial do criador
  '31.22.203.'       // Prefixo IPv4 residencial do criador
]

function isExceptionNetwork(ip) {
  if (!ip || typeof ip !== 'string') return false
  const envList = (process.env.MULTI_ACCOUNT_WHITELIST || '').split(',').map(s => s.trim()).filter(Boolean)
  const allExceptions = [...EXCEPTION_NETWORKS, ...envList]
  return allExceptions.some(prefix => ip === prefix || ip.startsWith(prefix))
}

/**
 * Extrai o IP real do cliente, respeitando headers de proxies reversos (Hostless, Cloudflare, etc.)
 */
function getClientIp(req) {
  const cfIp = req.headers['cf-connecting-ip']
  if (cfIp) return cfIp.trim()

  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) {
    const firstIp = forwarded.split(',')[0].trim()
    if (firstIp) return firstIp
  }

  const realIp = req.headers['x-real-ip']
  if (realIp) return realIp.trim()

  return req.ip || req.socket?.remoteAddress || '127.0.0.1'
}

/**
 * Valida o email fornecido (formato e bloqueio de emails temporários)
 * @param {string} email
 * @returns {{ valid: boolean, error?: string, cleanEmail?: string }}
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required to register a pilot.' }
  }

  const cleanEmail = email.trim().toLowerCase()

  if (cleanEmail.length > 254) {
    return { valid: false, error: 'Email is too long (maximum 254 characters).' }
  }

  if (!EMAIL_REGEX.test(cleanEmail)) {
    return { valid: false, error: 'Invalid email address format.' }
  }

  const parts = cleanEmail.split('@')
  if (parts.length !== 2) {
    return { valid: false, error: 'Invalid email address format.' }
  }

  const domain = parts[1]

  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return {
      valid: false,
      error: 'Temporary or disposable email domains are strictly prohibited in HARPIA Universe.'
    }
  }

  return { valid: true, cleanEmail }
}

/**
 * Verifica se o IP do cliente excedeu o limite de criação de contas (async — Turso)
 * @param {import('@libsql/client').Client} client - Instância Turso
 * @param {string} ip - Endereço IP do cliente
 * @returns {Promise<{ allowed: boolean, error?: string }>}
 */
async function checkIpRegistrationLimits(client, ip) {
  const now = Date.now()
  const oneDayAgo = now - LIMITS.DAY_IN_MS
  const isException = isExceptionNetwork(ip)
  const maxTotalAllowed = isException ? 2 : LIMITS.MAX_TOTAL_PER_IP
  const maxDailyAllowed = isException ? 2 : LIMITS.MAX_PER_DAY

  try {
    let totalCount = 0
    let recentCount = 0

    if (isException) {
      // Para a rede do criador com permissão especial de até 2 contas
      const totalResult = await client.execute({
        sql: `SELECT COUNT(*) as count FROM pilots WHERE created_ip = ? OR created_ip LIKE '2001:8a0:67eb:%' OR created_ip LIKE '31.22.203.%'`,
        args: [ip]
      })
      totalCount = totalResult.rows[0]?.count ?? 0

      const recentResult = await client.execute({
        sql: `SELECT COUNT(*) as count FROM pilots WHERE (created_ip = ? OR created_ip LIKE '2001:8a0:67eb:%' OR created_ip LIKE '31.22.203.%') AND created_at > ?`,
        args: [ip, oneDayAgo]
      })
      recentCount = recentResult.rows[0]?.count ?? 0
    } else {
      // 1. Total de contas associadas a este IP
      const totalResult = await client.execute({
        sql: 'SELECT COUNT(*) as count FROM pilots WHERE created_ip = ?',
        args: [ip]
      })
      totalCount = totalResult.rows[0]?.count ?? 0

      // 2. Contas criadas nas últimas 24 horas por este IP
      const recentResult = await client.execute({
        sql: 'SELECT COUNT(*) as count FROM pilots WHERE created_ip = ? AND created_at > ?',
        args: [ip, oneDayAgo]
      })
      recentCount = recentResult.rows[0]?.count ?? 0
    }

    console.log(`[AntiMultiAccount] Verifying registration for IP: "${ip}" (exception: ${isException}). Existing accounts: ${totalCount}/${maxTotalAllowed}`)

    if (totalCount >= maxTotalAllowed) {
      return {
        allowed: false,
        error: isException
          ? 'Registration limit reached for this network (maximum 2 accounts allowed).'
          : 'A pilot account is already registered from this network. Multi-accounting is strictly prohibited.'
      }
    }

    if (recentCount >= maxDailyAllowed) {
      return {
        allowed: false,
        error: `Registration limit reached. Only ${maxDailyAllowed} account(s) per day allowed from this network.`
      }
    }
  } catch (err) {
    console.warn('[AntiMultiAccount] Warning checking IP limits:', err.message)
    return { allowed: true }
  }

  return { allowed: true }
}

module.exports = {
  getClientIp,
  validateEmail,
  checkIpRegistrationLimits,
  isExceptionNetwork,
  LIMITS
}
