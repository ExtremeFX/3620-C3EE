'use strict'

const fastifyRateLimit = require('@fastify/rate-limit')

/**
 * HARPIA Universe - Security / Rate Limiter Module
 * Proteção modular contra abuso de requisições e ataques de força bruta.
 */
async function registerRateLimiter(app) {
  await app.register(fastifyRateLimit, {
    global: true,
    max: 120, // 120 requisições por minuto por IP por padrão
    timeWindow: '1 minute',
    allowList: (req) => {
      const url = (req.raw?.url || req.url || '').split('?')[0].toLowerCase()
      // Não limitar carregamento de ficheiros estáticos / multimédia grandes
      if (url.startsWith('/assets/')) return true
      if (/\.(webm|png|jpg|jpeg|gif|ogg|svg|ico|css|js)$/i.test(url)) return true
      return false
    },
    errorResponseBuilder: (req, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      detail: `Limite de requisições excedido. Tente novamente em ${Math.ceil(context.ttl / 1000)} segundos.`
    })
  })
}

// Configurações modulares para rotas de alta sensibilidade
const RATE_LIMIT_STRICT_AUTH = {
  rateLimit: {
    max: 10, // Máximo 10 tentativas por minuto por IP para login/register
    timeWindow: '1 minute'
  }
}

const RATE_LIMIT_SYNC = {
  rateLimit: {
    max: 60, // Máximo 60 syncs por minuto por IP
    timeWindow: '1 minute'
  }
}

module.exports = {
  registerRateLimiter,
  RATE_LIMIT_STRICT_AUTH,
  RATE_LIMIT_SYNC
}
