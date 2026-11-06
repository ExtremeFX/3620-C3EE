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
    this.isTicking = false
  }

  async init() {
    if (this.initialized) return

    // 1. Garantir existência da conta de sistema para ordens NPC
    let npcPilot = await db.get("SELECT id FROM pilots WHERE username = 'Harpia Market Authority'")
    if (!npcPilot) {
      const hash = await bcrypt.hash('npc_secure_market_authority_998', 10)
      const info = await db.run(
        "INSERT INTO pilots (username, email, password, credits, pi_tokens) VALUES ('Harpia Market Authority', 'market@harpia.net', ?, 999999999, 0)",
        [hash]
      )
      this.npcPilotId = info.lastInsertRowid
      console.log(`[MARKET] Conta NPC Market Authority criada com ID #${this.npcPilotId}`)
    } else {
      this.npcPilotId = npcPilot.id
    }

    this.initialized = true
    // 2. Garantir liquidez inicial no mercado
    await this.ensureMarketLiquidity()
    console.log('[MARKET] Sistema Autónomo de Liquidez e Market Makers inicializado.')
  }

  async ensureMarketLiquidity() {
    if (!this.npcPilotId) return

    let createdAny = false
    for (const [itemId, info] of Object.entries(COMMODITIES)) {
      const activeNpcOrders = await db.get(
        'SELECT COUNT(*) as count FROM market_orders WHERE pilot_id = ? AND item_id = ?',
        [this.npcPilotId, itemId]
      )

      const count = activeNpcOrders ? activeNpcOrders.count : 0
      const targetOrders = 2

      if (count < targetOrders) {
        const needed = targetOrders - count
        for (let i = 0; i < needed; i++) {
          await this._createNpcOrder(itemId, info)
          createdAny = true
        }
      }
    }

    // 2. Migrar ordens antigas de core_v2 para H-M2 se houver
    const migrated = await db.run("UPDATE market_orders SET item_id = 'H-M2', item_name = 'H-M2' WHERE item_id = 'core_v2'")
    if (migrated.rowsAffected > 0) {
      createdAny = true
    }

    // 3. Atualizar e garantir disponibilidade da nave H-M2 (upgrade a 155.000 ARP)
    const priceUpdated = await db.run(
      "UPDATE market_orders SET price_per_unit = 155000, total_price = quantity * 155000 WHERE item_id = 'H-M2' AND price_per_unit != 155000 AND pilot_id = ?",
      [this.npcPilotId]
    )
    if (priceUpdated.rowsAffected > 0) {
      createdAny = true
    }

    const activeHm2 = await db.get(
      "SELECT COUNT(*) as count FROM market_orders WHERE pilot_id = ? AND item_id = 'H-M2'",
      [this.npcPilotId]
    )

    if (!activeHm2 || activeHm2.count === 0) {
      await db.run(
        "INSERT INTO market_orders (pilot_id, seller_name, item_id, item_name, quantity, price_per_unit, total_price, station_id) VALUES (?, 'Aegis Station Procurement', 'H-M2', 'H-M2', 1, 155000, 155000, 'HARPIA BASE')",
        [this.npcPilotId]
      )
      createdAny = true
    }

    // 4. Garantir disponibilidade dos drones GROK a 70.000 ARP
    const priceGrokUpdated = await db.run(
      "UPDATE market_orders SET price_per_unit = 70000, total_price = quantity * 70000 WHERE item_id = 'mining_drone' AND price_per_unit != 70000 AND pilot_id = ?",
      [this.npcPilotId]
    )
    if (priceGrokUpdated.rowsAffected > 0) {
      createdAny = true
    }

    const activeGrok = await db.get(
      "SELECT COUNT(*) as count FROM market_orders WHERE pilot_id = ? AND item_id = 'mining_drone'",
      [this.npcPilotId]
    )

    if (!activeGrok || activeGrok.count === 0) {
      await db.run(
        "INSERT INTO market_orders (pilot_id, seller_name, item_id, item_name, quantity, price_per_unit, total_price, station_id) VALUES (?, 'Aegis Station Procurement', 'mining_drone', 'GROK Mining Drone', 5, 70000, 350000, 'HARPIA BASE')",
        [this.npcPilotId]
      )
      createdAny = true
    }

    // 5. Garantir disponibilidade da nave de transporte HARPI-T1 a 1.000.000 ARP
    const priceT1Updated = await db.run(
      "UPDATE market_orders SET price_per_unit = 1000000, total_price = quantity * 1000000 WHERE (item_id = 'HARPI-T1' OR item_id = 'harpi_t1' OR item_id = 'harpi-t1') AND price_per_unit != 1000000 AND pilot_id = ?",
      [this.npcPilotId]
    )
    if (priceT1Updated.rowsAffected > 0) {
      createdAny = true
    }

    const activeHarpiT1 = await db.get(
      "SELECT COUNT(*) as count FROM market_orders WHERE pilot_id = ? AND (item_id = 'HARPI-T1' OR item_id = 'harpi_t1' OR item_id = 'harpi-t1')",
      [this.npcPilotId]
    )

    if (!activeHarpiT1 || activeHarpiT1.count === 0) {
      await db.run(
        "INSERT INTO market_orders (pilot_id, seller_name, item_id, item_name, quantity, price_per_unit, total_price, station_id) VALUES (?, 'Vektor Deep Space Logistics', 'HARPI-T1', 'HARPI-T1', 1, 1000000, 1000000, 'HARPIA BASE')",
        [this.npcPilotId]
      )
      createdAny = true
    }

    if (createdAny) {
      ws.broadcast('MARKET_UPDATED', { reason: 'LIQUIDITY_REPLENISHED' })
    }
  }

  async _createNpcOrder(itemId, info) {
    const corp = NPC_CORPORATIONS.find(c => c.focus === itemId) || NPC_CORPORATIONS[0]
    const priceVariance = Math.floor((Math.random() * (info.maxPrice - info.minPrice)) + info.minPrice)
    const quantity = Math.floor((Math.random() * (info.maxQty - info.minQty)) + info.minQty)
    const totalPrice = quantity * priceVariance

    await db.run(
      'INSERT INTO market_orders (pilot_id, seller_name, item_id, item_name, quantity, price_per_unit, total_price, station_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [this.npcPilotId, corp.name, itemId, info.name, quantity, priceVariance, totalPrice, corp.station]
    )
  }

  async tick() {
    if (this.isTicking) return
    this.isTicking = true

    try {
      if (!this.initialized) {
        await this.init()
      }

      this.tickCounter++

      // A cada 10 ticks (~10s), processar compras automáticas
      if (this.tickCounter % 10 === 0) {
        await this.processPlayerOrderProcurement()
      }

      // A cada 30 ticks (~30s), verificar reabastecimento
      if (this.tickCounter % 30 === 0) {
        await this.ensureMarketLiquidity()
      }
    } catch (err) {
      console.warn('[MARKET] Erro no tick do market maker:', err.message)
    } finally {
      this.isTicking = false
    }
  }

  async processPlayerOrderProcurement() {
    if (!this.npcPilotId) return

    const playerOrders = await db.all(
      'SELECT id, pilot_id, seller_name, item_id, item_name, quantity, price_per_unit, total_price, station_id FROM market_orders WHERE pilot_id != ? ORDER BY id ASC',
      [this.npcPilotId]
    )

    if (playerOrders.length === 0) return

    for (const order of playerOrders) {
      const commodity = COMMODITIES[order.item_id]
      if (!commodity) continue

      const isPriceFair = order.price_per_unit <= Math.round(commodity.basePrice * 1.20)
      const shouldBuy = isPriceFair && (Math.random() < 0.40)

      if (shouldBuy) {
        const buyerCorp = NPC_CORPORATIONS[Math.floor(Math.random() * NPC_CORPORATIONS.length)].name

        await db.transaction(async (tx) => {
          await tx.run('UPDATE pilots SET credits = credits + ? WHERE id = ?', [order.total_price, order.pilot_id])
          await tx.run('DELETE FROM market_orders WHERE id = ?', [order.id])
        })

        const currentPilot = await db.get('SELECT credits FROM pilots WHERE id = ?', [order.pilot_id])
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

        ws.broadcast('MARKET_UPDATED', { reason: 'ORDER_PURCHASED', orderId: order.id })
      }
    }
  }
}

module.exports = new MarketMaker()
