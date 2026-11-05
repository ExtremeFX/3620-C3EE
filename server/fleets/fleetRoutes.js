/**
 * HARPIA Universe - Fleet & Hangar Routes
 * Gestão modular de naves no hangar, despacho de frotas e missões ativas.
 */
'use strict'
const db = require('../database/db')
const ws = require('../websocket/wsManager')
const { RATE_LIMIT_SYNC } = require('../security/rateLimiter')

// FIX BUG-SQL1: centralised whitelist of allowed column names for dynamic SQL.
// Using a frozen Set as the single source of truth prevents any column name that
// is not explicitly listed from ever reaching a SQL statement — even if future
// code paths forget to validate beforehand.
const ALLOWED_STORAGE_COLS = Object.freeze(new Set([
  'ferrox', 'crynex', 'varelium', 'mining_drone', 'core_v2', 'h_m2'
]))

/**
 * Returns the sanitised column name or throws if it is not in the whitelist.
 * Use this for every dynamic SQL fragment that interpolates a storage column.
 * @param {string} raw
 * @returns {string}
 */
function safeStorageCol(raw) {
  const col = String(raw).toLowerCase().replace(/-/g, '_')
  if (!ALLOWED_STORAGE_COLS.has(col)) {
    throw Object.assign(new Error(`[SQL] Rejected unsafe column name: "${raw}"`), { status: 400 })
  }
  return col
}

// FIX BUG-SYNC1: canonical per-ship capacity limits used by the sync endpoint
// to clamp client-submitted cargo values on the server side.
const CANONICAL_CAPACITIES = Object.freeze({
  'H-M2': 200,
  'HARPI-T1': 1000,
  'H-7M': 70,
  'T-WS-Cargi': 500
})

// FIX BUG-SYNC2: maximum storage the station can hold (mirrors client config).
const MAX_STATION_STORAGE = 70_000

module.exports = async function (fastify) {
  // 1. Obter estado completo do Hangar do Piloto
  fastify.get('/pilot/hangar', {
    onRequest: async (req, reply) => {
      try { await req.jwtVerify() }
      catch { return reply.code(401).send({ detail: 'Invalid session' }) }
    }
  }, async (req, reply) => {
    const pilotId = req.user.id

    // Garantir que existe registo em pilot_storage
    db.prepare(`
      INSERT INTO pilot_storage (pilot_id, ferrox, crynex, varelium)
      VALUES (?, 0, 0, 0)
      ON CONFLICT(pilot_id) DO NOTHING
    `).run(pilotId)

    // Garantir que a nave mineradora pesada H-M2 do jogador existe no hangar com cargo inicial limpo
    const existingHm2 = db.prepare('SELECT id, cargo_json FROM hangar_ships WHERE pilot_id = ? AND ship_id = ?').get(pilotId, 'H-M2')
    if (!existingHm2) {
      const defaultCargo = JSON.stringify({ ferrox: 0, crynex: 0, varelium: 0, capacity: 200 })
      db.prepare("INSERT INTO hangar_ships (pilot_id, ship_id, quantity, location, cargo_json) VALUES (?, 'H-M2', 1, 'BASE', ?)").run(pilotId, defaultCargo)
    }

    const ships = db.prepare('SELECT ship_id, quantity, in_mission, location, cargo_json FROM hangar_ships WHERE pilot_id = ?').all(pilotId)
    const storage = db.prepare('SELECT ferrox, crynex, varelium, core_v2, h_m2, mining_drone, max_storage FROM pilot_storage WHERE pilot_id = ?').get(pilotId) || { ferrox: 0, crynex: 0, varelium: 0, core_v2: 0, h_m2: 0, mining_drone: 5, max_storage: 70000 }
    const missions = db.prepare("SELECT * FROM active_missions WHERE pilot_id = ? AND phase != 'DOCKED'").all(pilotId)
    const deposits = db.prepare('SELECT cell_id, col, row, mineral_key, current_units, max_units FROM asteroid_deposits').all()

    const pilotRow = db.prepare('SELECT credits, position_json, active_ship_id FROM pilots WHERE id = ?').get(pilotId)
    const credits = pilotRow ? pilotRow.credits : 0
    const activeShipId = (pilotRow && pilotRow.active_ship_id && pilotRow.active_ship_id !== 'H-M1') ? pilotRow.active_ship_id : 'H-M2'

    // FIX BUG-SQL1: use the module-level CANONICAL_CAPACITIES constant
    const canonicalCapacities = CANONICAL_CAPACITIES

    // Normalizar e sanear o cargo_json de cada nave do piloto
    for (const s of ships) {
      let cargo = null
      try { cargo = JSON.parse(s.cargo_json || '{}') } catch(_) {}
      if (!cargo || typeof cargo !== 'object') cargo = {}

      const cap = canonicalCapacities[s.ship_id] || Number(cargo.capacity) || 30
      cargo.capacity = cap
      cargo.ferrox = Math.max(0, Number(cargo.ferrox) || 0)
      cargo.crynex = Math.max(0, Number(cargo.crynex) || 0)
      cargo.varelium = Math.max(0, Number(cargo.varelium) || 0)

      // Guard: se minérios excederem a capacidade máxima daquela nave, podar
      const totalOre = cargo.ferrox + cargo.crynex + cargo.varelium
      if (totalOre > cap) {
        const ratio = cap / totalOre
        cargo.ferrox = Math.floor(cargo.ferrox * ratio)
        cargo.crynex = Math.floor(cargo.crynex * ratio)
        cargo.varelium = Math.floor(cargo.varelium * ratio)
      }

      const updatedJson = JSON.stringify(cargo)
      if (updatedJson !== s.cargo_json) {
        s.cargo_json = updatedJson
        db.prepare('UPDATE hangar_ships SET cargo_json = ? WHERE pilot_id = ? AND ship_id = ?')
          .run(updatedJson, pilotId, s.ship_id)
      }
    }

    // Obter o cargo da nave ativa real do piloto (não hardcoded)
    const activeShip = ships.find(s => s.ship_id === activeShipId) || ships.find(s => s.ship_id === 'H-M2') || ships[0]
    let activeShipCargo = null
    if (activeShip && activeShip.cargo_json) {
      try { activeShipCargo = JSON.parse(activeShip.cargo_json) } catch(_) {}
    }
    if (!activeShipCargo) {
      activeShipCargo = { ferrox: 0, crynex: 0, varelium: 0, capacity: canonicalCapacities[activeShipId] || 200 }
    }

    let savedPosition = null
    if (pilotRow && pilotRow.position_json) {
      try { savedPosition = JSON.parse(pilotRow.position_json) } catch(_) {}
    }

    return {
      success: true,
      ships,
      storage,
      activeShipId: activeShip ? activeShip.ship_id : activeShipId,
      shipCargo: activeShipCargo,
      missions,
      deposits,
      credits,
      position: savedPosition
    }
  })

  // 1b. Sincronizar e persistir Estado do Inventário (Estação e Nave) e Posição Espacial
  fastify.post('/pilot/storage/sync', {
    config: RATE_LIMIT_SYNC,
    onRequest: async (req, reply) => {
      try { await req.jwtVerify() }
      catch { return reply.code(401).send({ detail: 'Invalid session' }) }
    }
  }, async (req, reply) => {
    const pilotId = req.user.id
    const { storage, shipCargo, shipId, activeShipId, position } = req.body || {}

    // FIX BUG-SYNC3: validate activeShipId against known models to prevent
    // arbitrary strings from being persisted in the pilots table.
    const KNOWN_SHIP_IDS = new Set(Object.keys(CANONICAL_CAPACITIES))
    const targetShipId = (shipId || activeShipId || 'H-M2')
    if (!KNOWN_SHIP_IDS.has(targetShipId)) {
      return reply.code(400).send({ detail: `Unknown ship model: ${targetShipId}` })
    }

    // FIX BUG-SYNC4: clamp every storage value to [0, MAX_STATION_STORAGE] on the
    // server side so a tampered client cannot inflate its stockpile beyond the game cap.
    function clampOre(val) {
      const n = Math.floor(Number(val))
      return (Number.isFinite(n) && n >= 0) ? Math.min(n, MAX_STATION_STORAGE) : 0
    }

    const syncTx = db.transaction(() => {
      if (storage && typeof storage === 'object') {
        const ferrox       = clampOre(storage.ferrox)
        const crynex       = clampOre(storage.crynex)
        const varelium     = clampOre(storage.varelium)
        const miningDrone  = clampOre(storage.mining_drone)

        // FIX BUG-SYNC5: cross-check total station storage against the hard cap
        // so a client submitting inflated values is capped at MAX_STATION_STORAGE.
        const totalOre = ferrox + crynex + varelium
        const scaledFerrox   = totalOre > MAX_STATION_STORAGE ? Math.floor(ferrox   * MAX_STATION_STORAGE / totalOre) : ferrox
        const scaledCrynex   = totalOre > MAX_STATION_STORAGE ? Math.floor(crynex   * MAX_STATION_STORAGE / totalOre) : crynex
        const scaledVarielium= totalOre > MAX_STATION_STORAGE ? Math.floor(varelium * MAX_STATION_STORAGE / totalOre) : varelium

        db.prepare(`
          INSERT INTO pilot_storage (pilot_id, ferrox, crynex, varelium, mining_drone)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(pilot_id) DO UPDATE SET
            ferrox       = excluded.ferrox,
            crynex       = excluded.crynex,
            varelium     = excluded.varelium,
            mining_drone = excluded.mining_drone
        `).run(pilotId, scaledFerrox, scaledCrynex, scaledVarielium, miningDrone)
      }

      if (shipCargo && typeof shipCargo === 'object') {
        // FIX BUG-SYNC6: use canonical server-side capacity — never trust the
        // client-sent capacity field, which could be inflated to bypass the hold limit.
        const cap = CANONICAL_CAPACITIES[targetShipId] || 30
        const sanitizedCargo = {
          ferrox:   Math.max(0, Math.min(Math.floor(Number(shipCargo.ferrox)   || 0), cap)),
          crynex:   Math.max(0, Math.min(Math.floor(Number(shipCargo.crynex)   || 0), cap)),
          varelium: Math.max(0, Math.min(Math.floor(Number(shipCargo.varelium) || 0), cap)),
          capacity: cap
        }
        // If combined ore exceeds hold capacity, scale down proportionally
        const total = sanitizedCargo.ferrox + sanitizedCargo.crynex + sanitizedCargo.varelium
        if (total > cap) {
          const ratio = cap / total
          sanitizedCargo.ferrox   = Math.floor(sanitizedCargo.ferrox   * ratio)
          sanitizedCargo.crynex   = Math.floor(sanitizedCargo.crynex   * ratio)
          sanitizedCargo.varelium = Math.floor(sanitizedCargo.varelium * ratio)
        }

        const cargoJson = JSON.stringify(sanitizedCargo)
        const ship = db.prepare('SELECT id FROM hangar_ships WHERE pilot_id = ? AND ship_id = ?').get(pilotId, targetShipId)
        if (ship) {
          db.prepare('UPDATE hangar_ships SET cargo_json = ? WHERE pilot_id = ? AND ship_id = ?').run(cargoJson, pilotId, targetShipId)
        } else {
          db.prepare('INSERT INTO hangar_ships (pilot_id, ship_id, quantity, location, cargo_json) VALUES (?, ?, 1, "BASE", ?)').run(pilotId, targetShipId, cargoJson)
        }
      }

      // FIX BUG-SYNC3 (cont.): only persist activeShipId if it is a known model
      if (activeShipId && KNOWN_SHIP_IDS.has(activeShipId)) {
        db.prepare('UPDATE pilots SET active_ship_id = ? WHERE id = ?').run(activeShipId, pilotId)
      }

      if (position && typeof position === 'object') {
        // FIX BUG-SYNC7: validate position fields — only persist numeric x/y/angle + boolean isDocked
        const safePos = {
          x:        Number.isFinite(Number(position.x))     ? Math.round(Number(position.x))     : 0,
          y:        Number.isFinite(Number(position.y))     ? Math.round(Number(position.y))     : 0,
          angle:    Number.isFinite(Number(position.angle)) ? Number(Number(position.angle).toFixed(3)) : 0,
          isDocked: Boolean(position.isDocked)
        }
        db.prepare('UPDATE pilots SET position_json = ? WHERE id = ?').run(JSON.stringify(safePos), pilotId)
      }
    })

    syncTx()
    return { success: true }
  })

  // 1c. Listar todas as Ordens de Venda no Mercado da Estação (Estilo EVE Online)
  fastify.get('/market/orders', {
    onRequest: async (req, reply) => {
      try { await req.jwtVerify() }
      catch { return reply.code(401).send({ detail: 'Invalid session' }) }
    }
  }, async (req, reply) => {
    const orders = db.prepare(`
      SELECT id, pilot_id, seller_name, item_id, item_name, quantity, price_per_unit, total_price, station_id, created_at
      FROM market_orders
      ORDER BY id DESC
    `).all()

    return { success: true, orders }
  })

  // 1d. Criar Ordem de Venda no Mercado da Estação (Deduz do Armazém e Entra no Livro de Ordens)
  fastify.post('/market/sell', {
    onRequest: async (req, reply) => {
      try { await req.jwtVerify() }
      catch { return reply.code(401).send({ detail: 'Invalid session' }) }
    }
  }, async (req, reply) => {
    const pilotId = req.user.id
    const { itemId = 'ferrox', amount = 1, pricePerUnit = 120 } = req.body || {}
    const qty = parseInt(amount, 10)
    const unitPrice = parseInt(pricePerUnit, 10)

    if (isNaN(qty) || qty <= 0) {
      return reply.code(400).send({ detail: 'Quantidade inválida para venda' })
    }
    if (isNaN(unitPrice) || unitPrice <= 0) {
      return reply.code(400).send({ detail: 'Preço unitário inválido' })
    }

    let itemCol
    try {
      itemCol = safeStorageCol(itemId)
    } catch (_) {
      return reply.code(400).send({ detail: 'Item não negociável no mercado' })
    }
    if (!['ferrox', 'crynex', 'varelium', 'core_v2', 'h_m2'].includes(itemCol)) {
      return reply.code(400).send({ detail: 'Item não negociável no mercado' })
    }

    const currentStorage = db.prepare('SELECT ferrox, crynex, varelium, core_v2, h_m2 FROM pilot_storage WHERE pilot_id = ?').get(pilotId) || { ferrox: 0, crynex: 0, varelium: 0, core_v2: 0, h_m2: 0 }
    const available = currentStorage[itemCol] || 0

    if (available < qty) {
      return reply.code(400).send({ detail: `Quantidade insuficiente no armazém da estação (${available} disponíveis)` })
    }

    const pilotRow = db.prepare('SELECT username FROM pilots WHERE id = ?').get(pilotId)
    const sellerName = pilotRow ? pilotRow.username : 'Pilot'
    const itemDisplayNames = { ferrox: 'Ferrox Ore', crynex: 'Crynex Crystal', varelium: 'Varelium Isotope', core_v2: 'H-M2', h_m2: 'H-M2' }
    const itemDisplayName = itemDisplayNames[itemCol] || itemCol
    const marketItemId = itemCol === 'h_m2' ? 'H-M2' : itemCol
    const totalPrice = qty * unitPrice

    let updatedStorage = null
    let orderId = null

    const createOrderTx = db.transaction(() => {
      // Deduz do armazém da estação do piloto
      db.prepare(`UPDATE pilot_storage SET ${itemCol} = ${itemCol} - ? WHERE pilot_id = ?`).run(qty, pilotId)

      // Adiciona à lista de ordens à venda no mercado
      const info = db.prepare(`
        INSERT INTO market_orders (pilot_id, seller_name, item_id, item_name, quantity, price_per_unit, total_price, station_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'HARPIA BASE')
      `).run(pilotId, sellerName, marketItemId, itemDisplayName, qty, unitPrice, totalPrice)
      orderId = info.lastInsertRowid

      updatedStorage = db.prepare('SELECT ferrox, crynex, varelium, core_v2, h_m2 FROM pilot_storage WHERE pilot_id = ?').get(pilotId)
    })

    createOrderTx()

    const orders = db.prepare(`
      SELECT id, pilot_id, seller_name, item_id, item_name, quantity, price_per_unit, total_price, station_id, created_at
      FROM market_orders
      ORDER BY id DESC
    `).all()

    return {
      success: true,
      orderId,
      orders,
      storage: updatedStorage,
      message: `${qty}x ${itemDisplayName} colocados à venda no mercado!`
    }
  })

  // 1e. Cancelar Ordem de Venda (Retorna itens para o Armazém da Estação)
  fastify.delete('/market/orders/:id', {
    onRequest: async (req, reply) => {
      try { await req.jwtVerify() }
      catch { return reply.code(401).send({ detail: 'Invalid session' }) }
    }
  }, async (req, reply) => {
    const pilotId = req.user.id
    const orderId = parseInt(req.params.id, 10)

    const order = db.prepare('SELECT * FROM market_orders WHERE id = ? AND pilot_id = ?').get(orderId, pilotId)
    if (!order) {
      return reply.code(404).send({ detail: 'Ordem de mercado não encontrada ou pertence a outro piloto' })
    }

    let updatedStorage = null

    const cancelTx = db.transaction(() => {
      const itemCol = safeStorageCol(order.item_id)
      // Devolve itens para o armazém do piloto
      db.prepare(`UPDATE pilot_storage SET ${itemCol} = ${itemCol} + ? WHERE pilot_id = ?`).run(order.quantity, pilotId)
      // Remove ordem do mercado
      db.prepare('DELETE FROM market_orders WHERE id = ?').run(orderId)

      updatedStorage = db.prepare('SELECT ferrox, crynex, varelium, core_v2, h_m2 FROM pilot_storage WHERE pilot_id = ?').get(pilotId)
    })

    cancelTx()

    const orders = db.prepare(`
      SELECT id, pilot_id, seller_name, item_id, item_name, quantity, price_per_unit, total_price, station_id, created_at
      FROM market_orders
      ORDER BY id DESC
    `).all()

    return {
      success: true,
      orders,
      storage: updatedStorage,
      message: `Ordem #${orderId} cancelada. Itens devolvidos ao armazém.`
    }
  })

  // 1f. Comprar Ordem de Mercado (Deduz créditos, entrega minérios ao armazém da estação do comprador)
  fastify.post('/market/buy', {
    onRequest: async (req, reply) => {
      try { await req.jwtVerify() }
      catch { return reply.code(401).send({ detail: 'Invalid session' }) }
    }
  }, async (req, reply) => {
    const buyerPilotId = req.user.id
    const { orderId } = req.body || {}
    const parsedOrderId = parseInt(orderId, 10)

    if (isNaN(parsedOrderId) || parsedOrderId <= 0) {
      return reply.code(400).send({ detail: 'ID de ordem inválido' })
    }

    const order = db.prepare('SELECT * FROM market_orders WHERE id = ?').get(parsedOrderId)
    if (!order) {
      return reply.code(404).send({ detail: 'Ordem de mercado não encontrada ou já comprada' })
    }

    if (order.pilot_id === buyerPilotId) {
      return reply.code(400).send({ detail: 'Não podes comprar a tua própria ordem de venda' })
    }

    const buyer = db.prepare('SELECT credits FROM pilots WHERE id = ?').get(buyerPilotId)
    if (!buyer || buyer.credits < order.total_price) {
      return reply.code(400).send({ 
        detail: `Créditos insuficientes (${buyer ? buyer.credits : 0} ARP disponíveis, necessários ${order.total_price} ARP)` 
      })
    }

    let updatedCredits = 0
    let updatedStorage = null
    let updatedShips = []

    const buyTx = db.transaction(() => {
      // 1. Deduzir créditos do comprador
      db.prepare('UPDATE pilots SET credits = credits - ? WHERE id = ?').run(order.total_price, buyerPilotId)

      // 2. Se o vendedor for outro piloto real (e não o bot de liquidez do sistema), creditar o vendedor
      const npcPilot = db.prepare("SELECT id FROM pilots WHERE username = 'Harpia Market Authority'").get()
      const npcId = npcPilot ? npcPilot.id : 0
      if (order.pilot_id !== npcId) {
        db.prepare('UPDATE pilots SET credits = credits + ? WHERE id = ?').run(order.total_price, order.pilot_id)
        
        // Notificar vendedor se estiver online
        ws.sendToPilot(order.pilot_id, 'MARKET_ORDER_SOLD', {
          orderId: order.id,
          itemId: order.item_id,
          itemName: order.item_name,
          quantity: order.quantity,
          pricePerUnit: order.price_per_unit,
          totalPrice: order.total_price,
          buyerName: req.user.username || 'Outro Piloto'
        })
      }

      // 3. Se for minério/item, adiciona ao armazém de minérios; se for nave, vai para o Ship Hangar
      const itemRaw = String(order.item_id).toLowerCase().replace('-', '_');
      const isShip = itemRaw === 'h_m2' || itemRaw === 'core_v2' || itemRaw === 'harpi_t1' || 
                     String(order.item_id).toUpperCase() === 'HARPI-T1' || 
                     String(order.item_id).toUpperCase() === 'H-M2';

      if (!isShip) {
        const itemCol = safeStorageCol(order.item_id);
        db.prepare(`
          INSERT INTO pilot_storage (pilot_id, ferrox, crynex, varelium)
          VALUES (?, 0, 0, 0)
          ON CONFLICT(pilot_id) DO NOTHING
        `).run(buyerPilotId)

        try {
          db.prepare(`
            UPDATE pilot_storage 
            SET ${itemCol} = ${itemCol} + ?
            WHERE pilot_id = ?
          `).run(order.quantity, buyerPilotId)
        } catch (_) {}
      }

      // Se for a nave H-M2, disponibiliza-a imediatamente no Hangar do Piloto!
      if (itemCol === 'h_m2' || String(order.item_id).toUpperCase() === 'H-M2') {
        const existingShip = db.prepare('SELECT id, quantity FROM hangar_ships WHERE pilot_id = ? AND ship_id = ?').get(buyerPilotId, 'H-M2')
        if (existingShip) {
          db.prepare('UPDATE hangar_ships SET quantity = quantity + ? WHERE id = ?').run(order.quantity, existingShip.id)
        } else {
          const defaultCargo = JSON.stringify({ ferrox: 0, crynex: 0, varelium: 0, capacity: 200 })
          db.prepare("INSERT INTO hangar_ships (pilot_id, ship_id, quantity, location, cargo_json) VALUES (?, 'H-M2', ?, 'BASE', ?)").run(buyerPilotId, order.quantity, defaultCargo)
        }
      }

      // Se for a nave de transporte HARPI-T1, disponibiliza-a imediatamente no Hangar do Piloto com 1000T de capacidade!
      if (itemCol === 'harpi_t1' || String(order.item_id).toUpperCase() === 'HARPI-T1') {
        const existingShip = db.prepare('SELECT id, quantity FROM hangar_ships WHERE pilot_id = ? AND ship_id = ?').get(buyerPilotId, 'HARPI-T1')
        if (existingShip) {
          db.prepare('UPDATE hangar_ships SET quantity = quantity + ? WHERE id = ?').run(order.quantity, existingShip.id)
        } else {
          const defaultCargo = JSON.stringify({ ferrox: 0, crynex: 0, varelium: 0, capacity: 1000 })
          db.prepare("INSERT INTO hangar_ships (pilot_id, ship_id, quantity, location, cargo_json) VALUES (?, 'HARPI-T1', ?, 'BASE', ?)").run(buyerPilotId, order.quantity, defaultCargo)
        }
      }

      // 4. Remover ordem comprada do mercado
      db.prepare('DELETE FROM market_orders WHERE id = ?').run(order.id)

      const updatedBuyer = db.prepare('SELECT credits FROM pilots WHERE id = ?').get(buyerPilotId)
      updatedCredits = updatedBuyer ? updatedBuyer.credits : 0
      updatedStorage = db.prepare('SELECT ferrox, crynex, varelium, core_v2, h_m2 FROM pilot_storage WHERE pilot_id = ?').get(buyerPilotId)
      updatedShips = db.prepare('SELECT ship_id, quantity, in_mission, location, cargo_json FROM hangar_ships WHERE pilot_id = ?').all(buyerPilotId)
    })

    buyTx()

    // 5. Notificar todos via WebSocket da remoção da ordem
    ws.broadcast('MARKET_UPDATED', { reason: 'ORDER_BOUGHT', orderId: order.id })

    const remainingOrders = db.prepare(`
      SELECT id, pilot_id, seller_name, item_id, item_name, quantity, price_per_unit, total_price, station_id, created_at
      FROM market_orders
      ORDER BY id DESC
    `).all()

    return {
      success: true,
      credits: updatedCredits,
      storage: updatedStorage,
      ships: updatedShips,
      orders: remainingOrders,
      message: `Compraste ${order.quantity}x ${order.item_name} por ${order.total_price} ARP!`
    }
  })

  // 2. Despachar Frota de Mineração ou Cargueiro Comercial
  fastify.post('/fleets/launch', {
    onRequest: async (req, reply) => {
      try { await req.jwtVerify() }
      catch { return reply.code(401).send({ detail: 'Invalid session' }) }
    }
  }, async (req, reply) => {
    const pilotId = req.user.id
    const { ship_id, quantity = 1, target_col = 0, target_row = 0 } = req.body || {}

    const qty = parseInt(quantity, 10)
    if (!ship_id || isNaN(qty) || qty <= 0) {
      return reply.code(400).send({ detail: 'Invalid launch data' })
    }

    const launchTx = db.transaction(() => {
      // Verificar se o piloto tem naves disponíveis
      const shipRow = db.prepare('SELECT quantity, in_mission FROM hangar_ships WHERE pilot_id = ? AND ship_id = ?').get(pilotId, ship_id)
      if (!shipRow || shipRow.quantity < qty) {
        return { error: 400, detail: 'Insufficient ships in hangar for launch' }
      }

      // Atualizar hangar: diminuir disponíveis, aumentar em missão
      db.prepare(`
        UPDATE hangar_ships 
        SET quantity = quantity - ?,
            in_mission = in_mission + ?
        WHERE pilot_id = ? AND ship_id = ?
      `).run(qty, qty, pilotId, ship_id)

      const now = Date.now()
      const missionId = `M-${now.toString(36)}-${Math.random().toString(36).substring(2, 6)}`

      // Duração da missão (segundos simulados)
      const travelTimeMs = 15 * 1000 // 15s ida, 15s volta
      const miningTimeMs = 30 * 1000 // 30s mineração
      const miningStartedAt = now + travelTimeMs
      const miningEndsAt = miningStartedAt + miningTimeMs
      const completesAt = miningEndsAt + travelTimeMs

      // Carga mineral estimada
      const cargoCapacity = qty * 250
      const cargo = {
        ferrox: Math.round(cargoCapacity * 0.5),
        crynex: Math.round(cargoCapacity * 0.3),
        varelium: Math.round(cargoCapacity * 0.2)
      }

      db.prepare(`
        INSERT INTO active_missions (
          id, pilot_id, ship_id, quantity, target_col, target_row,
          phase, status, started_at, mining_started_at, mining_ends_at, completes_at,
          cargo_minerals, cargo_capacity, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'OUTBOUND', 'ACTIVE', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        missionId, pilotId, ship_id, qty, target_col, target_row,
        now, miningStartedAt, miningEndsAt, completesAt,
        JSON.stringify(cargo), cargoCapacity, now
      )

      const mission = {
        id: missionId,
        pilot_id: pilotId,
        ship_id,
        quantity: qty,
        target_col,
        target_row,
        phase: 'OUTBOUND',
        status: 'ACTIVE',
        started_at: now,
        mining_started_at: miningStartedAt,
        mining_ends_at: miningEndsAt,
        completes_at: completesAt,
        cargo_minerals: JSON.stringify(cargo),
        cargo_capacity: cargoCapacity
      }

      ws.sendToPilot(pilotId, 'FLEET_LAUNCHED', mission)
      return { success: true, mission }
    })

    const result = launchTx()
    if (result.error) {
      return reply.code(result.error).send(result)
    }
    return result
  })

  // 3. Recolher / Abortar Frota de Volta à Base
  fastify.post('/fleets/recall', {
    onRequest: async (req, reply) => {
      try { await req.jwtVerify() }
      catch { return reply.code(401).send({ detail: 'Invalid session' }) }
    }
  }, async (req, reply) => {
    const pilotId = req.user.id
    const { mission_id } = req.body || {}

    if (!mission_id) {
      return reply.code(400).send({ detail: 'Mission ID required' })
    }

    const recallTx = db.transaction(() => {
      const mission = db.prepare("SELECT * FROM active_missions WHERE id = ? AND pilot_id = ? AND phase != 'DOCKED'").get(mission_id, pilotId)
      if (!mission) {
        return { error: 404, detail: 'Active mission not found' }
      }

      if (mission.phase === 'RETURNING') {
        return { error: 400, detail: 'Fleet is already returning to base' }
      }

      const now = Date.now()
      const returnDurationMs = 12 * 1000 // 12 segundos para regressar
      const newCompletesAt = now + returnDurationMs

      db.prepare(`
        UPDATE active_missions
        SET phase = 'RETURNING',
            status = 'RETURNING_EARLY',
            completes_at = ?
        WHERE id = ?
      `).run(newCompletesAt, mission_id)

      ws.sendToPilot(pilotId, 'MISSION_PHASE_CHANGED', { mission_id, phase: 'RETURNING' })
      return { success: true, message: 'Fleet returning to base', completes_at: newCompletesAt }
    })

    const result = recallTx()
    if (result.error) {
      return reply.code(result.error).send(result)
    }
    return result
  })
}
