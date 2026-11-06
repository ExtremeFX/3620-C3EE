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
    return { valid: false, error: 'O email é obrigatório para registar um piloto.' }
  }

  const cleanEmail = email.trim().toLowerCase()

  if (cleanEmail.length > 254) {
    return { valid: false, error: 'O email é demasiado longo (máximo 254 carateres).' }
  }

  if (!EMAIL_REGEX.test(cleanEmail)) {
    return { valid: false, error: 'O formato do email introduzido não é válido.' }
  }

  const parts = cleanEmail.split('@')
  if (parts.length !== 2) {
    return { valid: false, error: 'O formato do email introduzido não é válido.' }
  }

  const domain = parts[1]

  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return {
      valid: false,
      error: 'Emails temporários / descartáveis não são permitidos no HARPIA Universe.'
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

  try {
    // 1. Total de contas associadas a este IP
    const totalResult = await client.execute({
      sql: 'SELECT COUNT(*) as count FROM pilots WHERE created_ip = ?',
      args: [ip]
    })
    const totalCount = totalResult.rows[0]?.count ?? 0

    console.log(`[AntiMultiAccount] Verificando registo para IP: "${ip}". Contas existentes: ${totalCount}`)

    if (totalCount >= LIMITS.MAX_TOTAL_PER_IP) {
      return {
        allowed: false,
        error: 'Já existe uma conta de piloto registada a partir desta rede. Multi-contas não são permitidas.'
      }
    }

    // 2. Contas criadas nas últimas 24 horas por este IP
    const recentResult = await client.execute({
      sql: 'SELECT COUNT(*) as count FROM pilots WHERE created_ip = ? AND created_at > ?',
      args: [ip, oneDayAgo]
    })
    const recentCount = recentResult.rows[0]?.count ?? 0

    if (recentCount >= LIMITS.MAX_PER_DAY) {
      return {
        allowed: false,
        error: 'Limite de criação de contas atingido. Só é permitida 1 conta por dia a partir desta rede.'
      }
    }
  } catch (err) {
    console.warn('[AntiMultiAccount] Aviso ao verificar limites de IP:', err.message)
    return { allowed: true }
  }

  return { allowed: true }
}

module.exports = {
  getClientIp,
  validateEmail,
  checkIpRegistrationLimits,
  LIMITS
}
