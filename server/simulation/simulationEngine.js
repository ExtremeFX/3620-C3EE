'use strict'
const db = require('../database/db')
const ws = require('../websocket/wsManager')
const marketMaker = require('../economy/marketMaker')

class GameSimulationEngine {
  constructor() {
    this.interval = null
    this.tickRateMs = 1000 // 1 segundo por tick
    this.tickCount = 0
  }

  start() {
    if (this.interval) return
    marketMaker.init()
    console.log('[SIM] Game Simulation Loop iniciado (1 Tick/segundo)')
    this.interval = setInterval(() => this.tick(), this.tickRateMs)
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  tick() {
    this.tickCount++
    const now = Date.now()

    try {
      // 0. Atualizar ciclo económico do mercado
      marketMaker.tick()

      // 1. Processar missões ativas
      const missions = db.prepare("SELECT * FROM active_missions WHERE phase != 'DOCKED'").all()

      for (const m of missions) {
        let newPhase = m.phase

        if (m.ship_id === 'T-WS-Cargi') {
          // Cargueiro Comercial para o Market Hub
          if (now < m.mining_started_at) {
            newPhase = 'OUTBOUND'
          } else if (m.status === 'RETURNING_EARLY') {
            newPhase = (now < m.completes_at) ? 'RETURNING' : 'DOCKED'
          } else {
            newPhase = 'DOCKED_AT_MARKET'
          }
        } else {
          // Frotas de Mineração Industrial (H-7M)
          if (now < m.mining_started_at) {
            newPhase = 'OUTBOUND'
          } else if (now < m.mining_ends_at) {
            newPhase = 'MINING'
          } else if (now < m.completes_at) {
            newPhase = 'RETURNING'
          } else {
            newPhase = 'DOCKED'
          }
        }

        // Se mudou de fase ou concluiu (chegou à base)
        if (newPhase !== m.phase) {
          if (newPhase === 'DOCKED') {
            // Entregar minerais extraídos no storage do piloto
            this.finalizeMission(m)
          } else {
            db.prepare('UPDATE active_missions SET phase = ? WHERE id = ?').run(newPhase, m.id)
            ws.sendToPilot(m.pilot_id, 'MISSION_PHASE_CHANGED', { mission_id: m.id, phase: newPhase })
          }
        }
      }
    } catch (err) {
      console.error('[SIM] Erro no tick da simulação:', err)
    }
  }

  finalizeMission(m) {
    db.transaction(() => {
      // 1. Marcar missão como concluída
      db.prepare("UPDATE active_missions SET phase = 'DOCKED', status = 'COMPLETED' WHERE id = ?").run(m.id)

      // 2. Repor naves no hangar
      db.prepare(`
        UPDATE hangar_ships 
        SET in_mission = MAX(0, in_mission - ?),
            quantity = quantity + ?
        WHERE pilot_id = ? AND ship_id = ?
      `).run(m.quantity, m.quantity, m.pilot_id, m.ship_id)

      // 3. Creditar minerais se foi missão de mineração
      let cargo = {}
      try { cargo = JSON.parse(m.cargo_minerals || '{}') } catch(e){}

      const ferrox = cargo.ferrox || 0
      const crynex = cargo.crynex || 0
      const varelium = cargo.varelium || 0

      if (ferrox > 0 || crynex > 0 || varelium > 0) {
        db.prepare(`
          INSERT INTO pilot_storage (pilot_id, ferrox, crynex, varelium)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(pilot_id) DO UPDATE SET
            ferrox = ferrox + excluded.ferrox,
            crynex = crynex + excluded.crynex,
            varelium = varelium + excluded.varelium
        `).run(m.pilot_id, ferrox, crynex, varelium)
      }

      console.log(`[SIM] Frota ${m.quantity}x ${m.ship_id} atracou na Base do Piloto #${m.pilot_id}`)

      // 4. Notificar cliente em tempo real via WebSocket
      ws.sendToPilot(m.pilot_id, 'FLEET_DOCKED', {
        mission_id: m.id,
        ship_id: m.ship_id,
        quantity: m.quantity,
        cargo_delivered: cargo
      })
    })()
  }
}

module.exports = new GameSimulationEngine()
