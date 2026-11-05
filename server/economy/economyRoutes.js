'use strict'
const db = require('../database/db')

const REWARD_PI = 50

/**
 * Calcula o estado da recompensa diária baseado no reset diário às 00:00 do servidor.
 * O prémio só fica disponível após as 00:00:00 do dia seguinte ao último resgate.
 * 
 * @param {number|string|null} lastRewardRaw
 * @returns {{ available: boolean, remainingSeconds: number, startOfToday: number, startOfTomorrow: number }}
 */
function getDailyRewardStatus(lastRewardRaw) {
  const now = new Date()

  // Parse seguro do timestamp (trata inteiros, floats, strings como "1793910449997.0")
  let lastTimestamp = 0
  if (typeof lastRewardRaw === 'number' && Number.isFinite(lastRewardRaw)) {
    lastTimestamp = Math.floor(lastRewardRaw)
  } else if (typeof lastRewardRaw === 'string') {
    const parsed = parseFloat(lastRewardRaw.trim())
    if (Number.isFinite(parsed) && parsed > 0) {
      lastTimestamp = Math.floor(parsed)
    }
  }

  // Início do dia atual às 00:00:00.000 do servidor
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime()

  // Início do próximo dia às 00:00:00.000 do servidor (quando o reset acontece)
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0).getTime()

  // Se já foi resgatado hoje (ou seja, lastTimestamp >= startOfToday), não está disponível
  const alreadyClaimedToday = lastTimestamp >= startOfToday
  const available = !alreadyClaimedToday

  // Segundos restantes até à meia-noite (00:00:00) do servidor
  const remainingMs = available ? 0 : Math.max(0, startOfTomorrow - now.getTime())
  const remainingSeconds = Math.ceil(remainingMs / 1000)

  return {
    available,
    remainingSeconds,
    startOfToday,
    startOfTomorrow
  }
}

// Transação atómica para resgate da recompensa diária
const claimTx = db.transaction((pilotId) => {
  const pilot = db.prepare('SELECT id, pi_tokens, last_daily_reward FROM pilots WHERE id = ?').get(pilotId)
  if (!pilot) return { error: 404, detail: 'Pilot not found' }

  const status = getDailyRewardStatus(pilot.last_daily_reward)

  if (!status.available) {
    return {
      error: 400,
      detail: 'Reward already claimed today. Next reward available at 00:00.',
      remaining_seconds: status.remainingSeconds
    }
  }

  const nowEpoch = Math.floor(Date.now())
  const newPi = (pilot.pi_tokens || 0) + REWARD_PI

  // Armazena como inteiro puro epoch ms
  db.prepare('UPDATE pilots SET pi_tokens = ?, last_daily_reward = ? WHERE id = ?')
    .run(newPi, nowEpoch, pilot.id)

  // Recalcular tempo restante até à próxima meia-noite
  const updatedStatus = getDailyRewardStatus(nowEpoch)

  return {
    success: true,
    message: `+${REWARD_PI} PI REWARD CLAIMED!`,
    reward_pi: REWARD_PI,
    total_pi: newPi,
    remaining_seconds: updatedStatus.remainingSeconds
  }
})

const authMiddleware = {
  onRequest: async (req, reply) => {
    try { await req.jwtVerify() }
    catch { return reply.code(401).send({ detail: 'Invalid session' }) }
  }
}

module.exports = async function (fastify) {
  // ─── GET /pilot/daily-reward ────────────────────────────────────────────
  fastify.get('/pilot/daily-reward', { onRequest: authMiddleware.onRequest }, async (req, reply) => {
    const pilot = db.prepare('SELECT pi_tokens, last_daily_reward FROM pilots WHERE id = ?').get(req.user.id)
    if (!pilot) return reply.code(404).send({ detail: 'Pilot not found' })

    const status = getDailyRewardStatus(pilot.last_daily_reward)

    return {
      available: status.available,
      remaining_seconds: status.remainingSeconds,
      reward_pi: REWARD_PI,
      current_pi: pilot.pi_tokens || 0
    }
  })

  // ─── POST /pilot/daily-reward ───────────────────────────────────────────
  fastify.post('/pilot/daily-reward', { onRequest: authMiddleware.onRequest }, async (req, reply) => {
    const result = claimTx(req.user.id)
    if (result.error) {
      return reply.code(result.error).send(result)
    }
    return result
  })
}