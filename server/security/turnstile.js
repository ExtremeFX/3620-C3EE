'use strict'

/**
 * HARPIA Universe - Cloudflare Turnstile Security Module
 * 
 * Proteção anti-bot e anti-automação no registo de pilotos.
 * Usa as chaves oficiais de teste da Cloudflare como fallback para desenvolvimento e deploy inicial:
 * Sitekey teste (sempre passa): 1x00000000000000000000AA
 * Secret teste (sempre passa):  1x0000000000000000000000000000000AA
 */

const DEFAULT_SECRET_KEY = '1x0000000000000000000000000000000AA'
const DEFAULT_SITE_KEY   = '1x00000000000000000000AA'

function getSiteKey() {
  return process.env.TURNSTILE_SITE_KEY || DEFAULT_SITE_KEY
}

/**
 * Valida o token de desafio do Cloudflare Turnstile com os servidores da Cloudflare
 * @param {string} token - Token gerado pelo widget do Turnstile no frontend
 * @param {string} remoteIp - IP do cliente
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function verifyTurnstileToken(token, remoteIp) {
  // Se explicitamente desativado via env var (ex: testes automatizados)
  if (process.env.TURNSTILE_DISABLED === 'true') {
    return { success: true }
  }

  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return {
      success: false,
      error: 'Por favor resolve a verificação de segurança Cloudflare Turnstile anti-bot.'
    }
  }

  const secretKey = process.env.TURNSTILE_SECRET_KEY || DEFAULT_SECRET_KEY

  try {
    const formData = new URLSearchParams()
    formData.append('secret', secretKey)
    formData.append('response', token.trim())
    if (remoteIp) {
      formData.append('remoteip', remoteIp)
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      signal: controller.signal
    })

    clearTimeout(timeout)

    const outcome = await res.json()

    if (outcome && outcome.success) {
      return { success: true }
    }

    console.warn('[Turnstile] Falha na validação do token Cloudflare:', outcome['error-codes'] || outcome)
    return {
      success: false,
      error: 'Falha na verificação de segurança anti-bot. Atualiza a página e tenta novamente.'
    }
  } catch (err) {
    console.error('[Turnstile] Erro ao comunicar com Cloudflare Turnstile:', err.message)
    // Em caso de indisponibilidade extrema do serviço da Cloudflare em dev/teste, não bloqueia utilizador
    if (secretKey === DEFAULT_SECRET_KEY) {
      return { success: true }
    }
    return {
      success: false,
      error: 'Serviço de verificação anti-bot temporariamente indisponível. Tenta novamente.'
    }
  }
}

module.exports = {
  verifyTurnstileToken,
  getSiteKey
}
