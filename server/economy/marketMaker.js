'use strict'

const db = require('../database/db')
const ws = require('../websocket/wsManager')
const bcrypt = require('bcryptjs')

const NPC_CORPORATIONS = [
  { name: 'Harpia Mining Consortium', focus: 'ferrox', station: 'HARPIA BASE' },
  { name: 'Orion Energy Labs', focus: 'crynex', station: 'HARPIA BASE' },
  { name: 'Vektor Deep Space Logistics', focus: 'varelium', station: 'HARPIA BASE' },
  { name: 'Aegis Station Procurement', focus: 'all', station: 'HARPIA BASE' }
]

const COMMODITIES = {
  ferrox: { name: 'Ferrox Ore', basePrice: 120, minPrice: 110, maxPrice: 130, minQty: 25, maxQty: 180 },
  crynex: { name: 'Crynex Crystal', basePrice: 280, minPrice: 260, maxPrice: 305, minQty: 15, maxQty: 95 },
  varelium: { name: 'Varelium Isotope', basePrice: 450, minPrice: 420, maxPrice: 490, minQty: 10, maxQty: 60 }
}

class MarketMaker {
  constructor() {
    this.npcPilotId = null
    this.initialized = false
    this.tickCounter = 0
  }

  init() {
    if (this.initialized) return

    // 1. Garantir existência da conta de sistema para ordens NPC
    let npcPilot = db.prepare("SELECT id FROM pilots WHERE username = 'Harpia Market Authority'").get()
    if (!npcPilot) {
      const hash = bcrypt.hashSync('npc_secure_market_authority_998', 10)
      const info = db.prepare(`
        INSERT INTO pilots (username, email, password, credits, pi_tokens)
        VALUES ('Harpia Market Authority', 'market@harpia.net', ?, 999999999, 0)
      `).run(hash)
      this.npcPilotId = info.lastInsertRowid
      console.log(`[MARKET] Conta NPC Market Authority criada com ID #${this.npcPilotId}`)
    } else {
      this.npcPilotId = npcPilot.id
    }

    this.initialized = true
    // 2. Garantir liquidez inicial no mercado
    this.ensureMarketLiquidity()
    console.log('[MARKET] Sistema Autónomo de Liquidez e Market Makers inicializado.')
  }

  ensureMarketLiquidity() {
    if (!this.npcPilotId) return

    let createdAny = false
    for (const [itemId, info] of Object.entries(COMMODITIES)) {
      const activeNpcOrders = db.prepare(`
        SELECT COUNT(*) as count FROM market_orders 
        WHERE pilot_id = ? AND item_id = ?
      `).get(this.npcPilotId, itemId)

      const count = activeNpcOrders ? activeNpcOrders.count : 0
      const targetOrders = 2 // Pelo menos 2 ordens de cada minério sempre disponíveis

      if (count < targetOrders) {
        const needed = targetOrders - count
        for (let i = 0; i < needed; i++) {
          this._createNpcOrder(itemId, info)
          createdAny = true
        }
      }
    }

    // 2. Migrar qualquer ordem existente de core_v2 para a nave H-M2
    const migrated = db.prepare(`
      UPDATE market_orders 
      SET item_id = 'H-M2', item_name = 'H-M2' 
      WHERE item_id = 'core_v2'
    `).run()
    if (migrated.changes > 0) {
      createdAny = true
      console.log(`[MARKET] ${migrated.changes} ordem(ns) de CORE V2 atualizadas para a nave H-M2.`)
    }

    // 3. Atualizar e garantir disponibilidade da nave H-M2 (upgrade a 155.000 ARP)
    const priceUpdated = db.prepare(`
      UPDATE market_orders 
      SET price_per_unit = 155000, total_price = quantity * 155000 
      WHERE item_id = 'H-M2' AND price_per_unit != 155000 AND pilot_id = ?
    `).run(this.npcPilotId)
    if (priceUpdated.changes > 0) {
      createdAny = true
      console.log(`[MARKET] Preço de ${priceUpdated.changes} ordem(ns) de H-M2 atualizado para 155.000 ARP.`)
    }

    const activeHm2 = db.prepare(`
      SELECT COUNT(*) as count FROM market_orders 
      WHERE pilot_id = ? AND item_id = 'H-M2'
    `).get(this.npcPilotId)

    if (!activeHm2 || activeHm2.count === 0) {
      db.prepare(`
        INSERT INTO market_orders (pilot_id, seller_name, item_id, item_name, quantity, price_per_unit, total_price, station_id)
        VALUES (?, 'Aegis Station Procurement', 'H-M2', 'H-M2', 1, 155000, 155000, 'HARPIA BASE')
      `).run(this.npcPilotId)
      createdAny = true
      console.log('[MARKET] Nave H-M2 disponibilizada no mercado por 155.000 ARP.')
    }

    // 4. Garantir disponibilidade dos drones GROK a 70.000 ARP
    const priceGrokUpdated = db.prepare(`
      UPDATE market_orders
      SET price_per_unit = 70000, total_price = quantity * 70000
      WHERE item_id = 'mining_drone' AND price_per_unit != 70000 AND pilot_id = ?
    `).run(this.npcPilotId)
    if (priceGrokUpdated.changes > 0) {
      createdAny = true
      console.log(`[MARKET] Preço de ${priceGrokUpdated.changes} ordem(ns) de GROK Drone atualizado para 70.000 ARP.`)
    }

    const activeGrok = db.prepare(`
      SELECT COUNT(*) as count FROM market_orders
      WHERE pilot_id = ? AND item_id = 'mining_drone'
    `).get(this.npcPilotId)

    if (!activeGrok || activeGrok.count === 0) {
      db.prepare(`
        INSERT INTO market_orders (pilot_id, seller_name, item_id, item_name, quantity, price_per_unit, total_price, station_id)
        VALUES (?, 'Aegis Station Procurement', 'mining_drone', 'GROK Mining Drone', 5, 70000, 350000, 'HARPIA BASE')
      `).run(this.npcPilotId)
      createdAny = true
      console.log('[MARKET] GROK Mining Drones disponibilizados no mercado por 70.000 ARP cada.')
    }

    // 5. Garantir disponibilidade da nave de transporte HARPI-T1 a 1.000.000 ARP
    const priceT1Updated = db.prepare(`
      UPDATE market_orders 
      SET price_per_unit = 1000000, total_price = quantity * 1000000 
      WHERE (item_id = 'HARPI-T1' OR item_id = 'harpi_t1' OR item_id = 'harpi-t1') AND price_per_unit != 1000000 AND pilot_id = ?
    `).run(this.npcPilotId)
    if (priceT1Updated.changes > 0) {
      createdAny = true
      console.log(`[MARKET] Preço de ${priceT1Updated.changes} ordem(ns) de HARPI-T1 atualizado para 1.000.000 ARP.`)
    }

    const activeHarpiT1 = db.prepare(`
      SELECT COUNT(*) as count FROM market_orders 
      WHERE pilot_id = ? AND (item_id = 'HARPI-T1' OR item_id = 'harpi_t1' OR item_id = 'harpi-t1')
    `).get(this.npcPilotId)

    if (!activeHarpiT1 || activeHarpiT1.count === 0) {
      db.prepare(`
        INSERT INTO market_orders (pilot_id, seller_name, item_id, item_name, quantity, price_per_unit, total_price, station_id)
        VALUES (?, 'Vektor Deep Space Logistics', 'HARPI-T1', 'HARPI-T1', 1, 1000000, 1000000, 'HARPIA BASE')
      `).run(this.npcPilotId)
      createdAny = true
      console.log('[MARKET] Nave de transporte HARPI-T1 disponibilizada no mercado por 1.000.000 ARP.')
    }

    if (createdAny) {
      ws.broadcast('MARKET_UPDATED', { reason: 'LIQUIDITY_REPLENISHED' })
    }
  }

  _createNpcOrder(itemId, info) {
    // Corporação vendedora correspondente
    const corp = NPC_CORPORATIONS.find(c => c.focus === itemId) || NPC_CORPORATIONS[0]
    
    // Pequena oscilação de preço (+- 5% do base)
    const priceVariance = Math.floor((Math.random() * (info.maxPrice - info.minPrice)) + info.minPrice)
    const quantity = Math.floor((Math.random() * (info.maxQty - info.minQty)) + info.minQty)
    const totalPrice = quantity * priceVariance

    db.prepare(`
      INSERT INTO market_orders (pilot_id, seller_name, item_id, item_name, quantity, price_per_unit, total_price, station_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(this.npcPilotId, corp.name, itemId, info.name, quantity, priceVariance, totalPrice, corp.station)

    console.log(`[MARKET] Nova Ordem NPC criada: ${quantity}x ${info.name} a ${priceVariance} ARP/un (${corp.name})`)
  }

  tick() {
    if (!this.initialized) {
      this.init()
    }

    this.tickCounter++

    // 1. A cada 10 ticks (~10s), processar compras automáticas de ordens dos jogadores (NPC Procurement)
    if (this.tickCounter % 10 === 0) {
      this.processPlayerOrderProcurement()
    }

    // 2. A cada 30 ticks (~30s), verificar se o stock do mercado precisa de reabastecimento
    if (this.tickCounter % 30 === 0) {
      this.ensureMarketLiquidity()
    }
  }

  processPlayerOrderProcurement() {
    if (!this.npcPilotId) return

    // Buscar ordens de jogadores humanos
    const playerOrders = db.prepare(`
      SELECT id, pilot_id, seller_name, item_id, item_name, quantity, price_per_unit, total_price, station_id
      FROM market_orders
      WHERE pilot_id != ?
      ORDER BY id ASC
    `).all(this.npcPilotId)

    if (playerOrders.length === 0) return

    for (const order of playerOrders) {
      const commodity = COMMODITIES[order.item_id]
      if (!commodity) continue

      // Critério de compra do NPC:
      // Se o preço for razoável (até 20% acima do preço base), há 40% de probabilidade por ciclo de compra imediata
      const isPriceFair = order.price_per_unit <= Math.round(commodity.basePrice * 1.20)
      const shouldBuy = isPriceFair && (Math.random() < 0.40)

      if (shouldBuy) {
        const buyerCorp = NPC_CORPORATIONS[Math.floor(Math.random() * NPC_CORPORATIONS.length)].name

        db.transaction(() => {
          // 1. Creditar o jogador com o valor total da venda
          db.prepare('UPDATE pilots SET credits = credits + ? WHERE id = ?').run(order.total_price, order.pilot_id)

          // 2. Remover a ordem do mercado
          db.prepare('DELETE FROM market_orders WHERE id = ?').run(order.id)

          console.log(`[MARKET] NPC '${buyerCorp}' comprou Ordem #${order.id} (${order.quantity}x ${order.item_name}) do Piloto #${order.pilot_id} por ${order.total_price} ARP`)

          // 3. Notificar o piloto em tempo real via WebSocket
          const currentPilot = db.prepare('SELECT credits FROM pilots WHERE id = ?').get(order.pilot_id)
          ws.sendToPilot(order.pilot_id, 'MARKET_ORDER_SOLD', {
            orderId: order.id,
            itemId: order.item_id,
            itemName: order.item_name,
            quantity: order.quantity,
            pricePerUnit: order.price_per_unit,
            totalPrice: order.total_price,
            buyerName: buyerCorp,
            newCredits: currentPilot ? currentPilot.credits : null
          })

          // 4. Notificar todos os clientes conectados que o livro de ordens mudou
          ws.broadcast('MARKET_UPDATED', { reason: 'ORDER_PURCHASED', orderId: order.id })
        })()
      }
    }
  }
}

module.exports = new MarketMaker()
