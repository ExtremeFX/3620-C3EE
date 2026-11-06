'use strict'

/**
 * HARPIA Universe - Spatial Multiplayer Manager
 * Gere a presença em tempo real de pilotos no espaço, replicação de telemetria,
 * feixes de mineração visíveis e sistema de chat espacial por setor/universo.
 */

class SpatialMultiplayerManager {
  constructor() {
    this.pilots = new Map() // pilotId (Number) -> PilotState
    this.wsManager = null
    this.tickInterval = null
    this.tickRateMs = 100 // 10 Hz (atualização a cada 100ms com interpolação suave no cliente)

    // Pool de Asteroides Autorizados do Servidor (Partilhado por todos os pilotos em tempo real)
    this.asteroids = new Map([
      ['harpia_asteroid_ferrox_v1',  { key: 'harpia_asteroid_ferrox_v1',  ore: 'ferrox',   maxUnits: 60,  currentUnits: 60,  isDepleted: false, depletedAt: null }],
      ['harpia_asteroid_ferrox_2',   { key: 'harpia_asteroid_ferrox_2',   ore: 'ferrox',   maxUnits: 60,  currentUnits: 60,  isDepleted: false, depletedAt: null }],
      ['harpia_asteroid_ferrox_3',   { key: 'harpia_asteroid_ferrox_3',   ore: 'ferrox',   maxUnits: 60,  currentUnits: 60,  isDepleted: false, depletedAt: null }],
      ['harpia_asteroid_ferrox_4',   { key: 'harpia_asteroid_ferrox_4',   ore: 'ferrox',   maxUnits: 60,  currentUnits: 60,  isDepleted: false, depletedAt: null }],
      ['harpia_asteroid_varelium_1', { key: 'harpia_asteroid_varelium_1', ore: 'varelium', maxUnits: 60,  currentUnits: 60,  isDepleted: false, depletedAt: null }],
      ['harpia_asteroid_crynex_1',   { key: 'harpia_asteroid_crynex_1',   ore: 'crynex',   maxUnits: 100, currentUnits: 100, isDepleted: false, depletedAt: null }],
      ['harpia_asteroid_crynex_2',   { key: 'harpia_asteroid_crynex_2',   ore: 'crynex',   maxUnits: 100, currentUnits: 100, isDepleted: false, depletedAt: null }],
      ['harpia_asteroid_crynex_3',   { key: 'harpia_asteroid_crynex_3',   ore: 'crynex',   maxUnits: 100, currentUnits: 100, isDepleted: false, depletedAt: null }],
      ['harpia_asteroid_crynex_4',   { key: 'harpia_asteroid_crynex_4',   ore: 'crynex',   maxUnits: 100, currentUnits: 100, isDepleted: false, depletedAt: null }],
      ['harpia_asteroid_crynex_5',   { key: 'harpia_asteroid_crynex_5',   ore: 'crynex',   maxUnits: 100, currentUnits: 100, isDepleted: false, depletedAt: null }],
      ['harpia_asteroid_crynex_6',   { key: 'harpia_asteroid_crynex_6',   ore: 'crynex',   maxUnits: 100, currentUnits: 100, isDepleted: false, depletedAt: null }],
    ])
  }

  /**
   * Inicializa o ciclo de simulação espacial
   * @param {import('../websocket/wsManager')} wsManager 
   */
  start(wsManager) {
    if (this.tickInterval) return
    this.wsManager = wsManager
    console.log('[MULTIPLAYER] Spatial Manager iniciado (10 Hz World State Replication)')

    this.tickInterval = setInterval(() => this.tick(), this.tickRateMs)
  }

  stop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval)
      this.tickInterval = null
    }
  }

  /**
   * Regista a entrada de um piloto no espaço online
   * @param {number} pilotId 
   * @param {string} username 
   */
  registerPilot(pilotId, username = 'Piloto') {
    const key = Number(pilotId)
    if (!key) return

    if (!this.pilots.has(key)) {
      this.pilots.set(key, {
        id: key,
        username: username || `Piloto #${key}`,
        x: 0,
        y: 0,
        angle: 0,
        speed: 0,
        isMoving: false,
        isDocked: false,
        warpState: 'IDLE',
        activeShipId: 'H-M2',
        systemId: 'HARPIA_PRIME',
        miningTarget: null,
        lastSeen: Date.now()
      })
      console.log(`[MULTIPLAYER] Piloto #${key} (${username}) entrou no espaço multijogador`)

      // Envia imediatamente ao novo piloto o estado atual dos asteroides do servidor
      if (this.wsManager) {
        this.wsManager.sendToPilot(key, 'ASTEROIDS_INIT', this.getAsteroidsSnapshot())
      }
    }
  }

  /**
   * Retorna snapshot compacto de todos os recursos de asteroides do mundo
   */
  getAsteroidsSnapshot() {
    return Array.from(this.asteroids.values()).map(a => ({
      key: a.key,
      ore: a.ore,
      maxUnits: a.maxUnits,
      currentUnits: a.currentUnits,
      isDepleted: a.isDepleted
    }))
  }

  /**
   * Processa a extração de minério de um asteroide partilhado
   * @param {number} pilotId 
   * @param {string} asteroidKey 
   * @param {number} amount 
   */
  mineAsteroid(pilotId, asteroidKey, amount = 1) {
    if (!asteroidKey || !this.asteroids.has(asteroidKey)) return
    const ast = this.asteroids.get(asteroidKey)
    if (ast.isDepleted || ast.currentUnits <= 0) return

    const take = Math.min(amount, ast.currentUnits)
    ast.currentUnits -= take

    if (ast.currentUnits <= 0) {
      ast.currentUnits = 0
      ast.isDepleted = true
      ast.depletedAt = Date.now()
      console.log(`[MULTIPLAYER] Asteroide ${asteroidKey} esgotado por Piloto #${pilotId}`)
    }

    if (this.wsManager) {
      this.wsManager.broadcast('ASTEROID_UPDATED', {
        key: ast.key,
        currentUnits: ast.currentUnits,
        maxUnits: ast.maxUnits,
        isDepleted: ast.isDepleted
      })
    }
  }

  /**
   * Atualiza a telemetria espacial enviada pelo cliente
   * @param {number} pilotId 
   * @param {Object} data 
   */
  updateTelemetry(pilotId, data = {}) {
    const key = Number(pilotId)
    const pilot = this.pilots.get(key)
    if (!pilot) {
      this.registerPilot(key, data.username)
      return
    }

    if (Number.isFinite(data.x)) pilot.x = Math.round(data.x)
    if (Number.isFinite(data.y)) pilot.y = Math.round(data.y)
    if (Number.isFinite(data.angle)) pilot.angle = Number(data.angle.toFixed(3))
    if (Number.isFinite(data.speed)) pilot.speed = Math.round(data.speed)

    pilot.isMoving = Boolean(data.isMoving)
    pilot.isDocked = Boolean(data.isDocked)
    pilot.warpState = typeof data.warpState === 'string' ? data.warpState : 'IDLE'

    if (data.activeShipId && typeof data.activeShipId === 'string') {
      pilot.activeShipId = data.activeShipId
    }
    if (data.systemId && typeof data.systemId === 'string') {
      pilot.systemId = data.systemId
    }

    pilot.lastSeen = Date.now()
  }

  /**
   * Atualiza e replica o estado do feixe de mineração para outros pilotos
   * @param {number} pilotId 
   * @param {Object} miningState 
   */
  updateMining(pilotId, miningState) {
    const key = Number(pilotId)
    const pilot = this.pilots.get(key)
    if (!pilot) return

    pilot.miningTarget = miningState && miningState.isMining ? {
      isMining: true,
      targetId: miningState.targetId || null,
      oreType: miningState.oreType || 'ferrox',
      targetX: miningState.targetX,
      targetY: miningState.targetY
    } : null

    // Notificar imediatamente todos os outros pilotos no mesmo sistema
    if (this.wsManager) {
      this._broadcastToSystem(pilot.systemId, 'PILOT_MINING_SYNC', {
        pilotId: key,
        mining: pilot.miningTarget
      }, key)
    }
  }

  /**
   * Transmite mensagem de chat para o canal especificado
   * @param {number} senderId 
   * @param {string} senderName 
   * @param {string} channel - 'system' ou 'universe'
   * @param {string} text 
   */
  broadcastChat(senderId, senderName, channel = 'system', text = '') {
    if (!text || typeof text !== 'string') return
    const cleanText = text.trim().slice(0, 200)
    if (!cleanText) return

    const key = Number(senderId)
    const pilot = this.pilots.get(key)
    const systemId = pilot ? pilot.systemId : 'HARPIA_PRIME'

    const packet = {
      senderId: key,
      senderName: senderName || (pilot ? pilot.username : 'Piloto Desconhecido'),
      channel: channel === 'universe' ? 'universe' : 'system',
      systemId: systemId,
      text: cleanText,
      timestamp: Date.now()
    }

    if (this.wsManager) {
      if (channel === 'universe') {
        this.wsManager.broadcast('CHAT_MESSAGE', packet)
      } else {
        // Enviar a todos os pilotos no mesmo sistema solar
        this._broadcastToSystem(systemId, 'CHAT_MESSAGE', packet)
      }
    }
  }

  /**
   * Remove o piloto quando desconecta
   * @param {number} pilotId 
   */
  unregisterPilot(pilotId) {
    const key = Number(pilotId)
    const pilot = this.pilots.get(key)
    if (pilot) {
      const systemId = pilot.systemId
      this.pilots.delete(key)
      console.log(`[MULTIPLAYER] Piloto #${key} saiu do espaço`)

      if (this.wsManager) {
        this._broadcastToSystem(systemId, 'PILOT_DESPAWN', { id: key }, key)
      }
    }
  }

  /**
   * Loop de Replicação de Estado do Mundo (10 Hz)
   */
  tick() {
    if (!this.wsManager) return
    const now = Date.now()

    // 1. Limpeza de conexões fantasma que não enviam telemetria há mais de 25 segundos
    for (const [id, p] of this.pilots.entries()) {
      if (now - p.lastSeen > 25000) {
        this.unregisterPilot(id)
      }
    }

    // 2. Cooldown de Respawn dos Asteroides (60 minutos)
    for (const ast of this.asteroids.values()) {
      if (ast.isDepleted && ast.depletedAt && (now - ast.depletedAt >= 3600000)) {
        ast.currentUnits = ast.maxUnits
        ast.isDepleted = false
        ast.depletedAt = null
        console.log(`[MULTIPLAYER] Asteroide ${ast.key} regenerado automaticamente (${ast.maxUnits} U)`)
        if (this.wsManager) {
          this.wsManager.broadcast('ASTEROID_UPDATED', {
            key: ast.key,
            currentUnits: ast.currentUnits,
            maxUnits: ast.maxUnits,
            isDepleted: false
          })
        }
      }
    }

    // 2. Agrupar pilotos por sistema planetário
    const bySystem = new Map() // systemId -> array de pilotos
    for (const p of this.pilots.values()) {
      const sys = p.systemId || 'HARPIA_PRIME'
      if (!bySystem.has(sys)) bySystem.set(sys, [])
      bySystem.get(sys).push(p)
    }

    // 3. Para cada sistema, enviar a lista de outros pilotos para cada jogador
    for (const [systemId, systemPilots] of bySystem.entries()) {
      if (systemPilots.length <= 1) {
        // Se só há 1 piloto ou nenhum, se houver um conectado, garantir que recebe array vazio
        if (systemPilots.length === 1) {
          this.wsManager.sendToPilot(systemPilots[0].id, 'WORLD_STATE', { pilots: [] })
        }
        continue
      }

      // Preparar payload otimizado e compacto
      for (const recipient of systemPilots) {
        const others = systemPilots
          .filter(p => p.id !== recipient.id)
          .map(p => ({
            id: p.id,
            name: p.username,
            x: p.x,
            y: p.y,
            ang: p.angle,
            spd: p.speed,
            mov: p.isMoving,
            doc: p.isDocked,
            wrp: p.warpState,
            shp: p.activeShipId,
            min: p.miningTarget
          }))

        this.wsManager.sendToPilot(recipient.id, 'WORLD_STATE', { pilots: others })
      }
    }
  }

  /**
   * Envia uma mensagem para todos os pilotos num determinado sistema
   */
  _broadcastToSystem(systemId, type, payload, excludePilotId = null) {
    if (!this.wsManager) return
    for (const p of this.pilots.values()) {
      if (p.systemId === systemId && (!excludePilotId || p.id !== excludePilotId)) {
        this.wsManager.sendToPilot(p.id, type, payload)
      }
    }
  }
}

module.exports = new SpatialMultiplayerManager()
