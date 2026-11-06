/**
 * HARPIA Universe - Fleet & Hangar Routes
 * Gestão modular de naves no hangar, despacho de frotas e missões ativas (Turso / Libsql async).
 */
'use strict'
const db = require('../database/db')
const ws = require('../websocket/wsManager')
const { RATE_LIMIT_SYNC } = require('../security/rateLimiter')

const ALLOWED_STORAGE_COLS = Object.freeze(new Set([
  'ferrox', 'crynex', 'varelium', 'mining_drone', 'core_v2', 'h_m2'
]))

function safeStorageCol(raw) {
  const col = String(raw).toLowerCase().replace(/-/g, '_')
  if (!ALLOWED_STORAGE_COLS.has(col)) {
    throw Object.assign(new Error(`[SQL] Rejected unsafe column name: "${raw}"`), { status: 400 })
  }
  return col
}

const CANONICAL_CAPACITIES = Object.freeze({
  'H-M2': 200,
  'HARPI-T1': 1000,
  'H-7M': 70,
  'T-WS-Cargi': 500
})

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
    await db.run(`
      INSERT INTO pilot_storage (pilot_id, ferrox, crynex, varelium)
      VALUES (?, 0, 0, 0)
      ON CONFLICT(pilot_id) DO NOTHING
    `, [pilotId])

    // Garantir que a nave mineradora pesada H-M2 do jogador existe no hangar com cargo inicial limpo
    const existingHm2 = await db.get('SELECT id, cargo_json FROM hangar_ships WHERE pilot_id = ? AND ship_id = ?', [pilotId, 'H-M2'])
    if (!existingHm2) {
      const defaultCargo = JSON.stringify({ ferrox: 0, crynex: 0, varelium: 0, capacity: 200 })
      await db.run("INSERT INTO hangar_ships (pilot_id, ship_id, quantity, location, cargo_json) VALUES (?, 'H-M2', 1, 'BASE', ?)", [pilotId, defaultCargo])
    }

    const ships = await db.all('SELECT ship_id, quantity, in_mission, location, cargo_json FROM hangar_ships WHERE pilot_id = ?', [pilotId])
    const storageRow = await db.get('SELECT ferrox, crynex, varelium, core_v2, h_m2, mining_drone, max_storage FROM pilot_storage WHERE pilot_id = ?', [pilotId])
    const storage = storageRow || { ferrox: 0, crynex: 0, varelium: 0, core_v2: 0, h_m2: 0, mining_drone: 5, max_storage: 70000 }
    const missions = await db.all("SELECT * FROM active_missions WHERE pilot_id = ? AND phase != 'DOCKED'", [pilotId])
    const deposits = await db.all('SELECT cell_id, col, row, mineral_key, current_units, max_units FROM asteroid_deposits')

    const pilotRow = await db.get('SELECT credits, position_json, active_ship_id FROM pilots WHERE id = ?', [pilotId])
    const credits = pilotRow ? pilotRow.credits : 0
    const activeShipId = (pilotRow && pilotRow.active_ship_id && pilotRow.active_ship_id !== 'H-M1') ? pilotRow.active_ship_id : 'H-M2'

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
        await db.run('UPDATE hangar_ships SET cargo_json = ? WHERE pilot_id = ? AND ship_id = ?', [updatedJson, pilotId, s.ship_id])
      }
    }

    const activeShip = ships.find(s => s.ship_id === activeShipId) || ships.find(s => s.ship_id === 'H-M2') || ships[0]
    let activeShipCargo = null
    if (activeShip && activeShip.cargo_json) {
      try { activeShipCargo = JSON.parse(activeShip.cargo_json) } catch(_) {}
    }
    if (!activeShipCargo) {
      activeShipCargo = { ferrox: 0, crynex: 0, varelium: 0, capacity: canonicalCapacities[activeShipId] || 200 }
    }

    let shipDrones = null
    if (activeShipCargo && activeShipCargo.drones && typeof activeShipCargo.drones === 'object') {
      shipDrones = activeShipCargo.drones
    } else {
      const stationDrones = Number(storage.mining_drone) || 0
      if (stationDrones === 0 && (activeShipId === 'H-M2' || (activeShip && activeShip.ship_id === 'H-M2'))) {
        shipDrones = { mining_drone: 5 }
        activeShipCargo.drones = shipDrones
      } else {
        shipDrones = { mining_drone: 0 }
      }
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
      shipDrones,
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
    const { storage, shipCargo, shipDrones, shipId, activeShipId, position } = req.body || {}

    const KNOWN_SHIP_IDS = new Set(Object.keys(CANONICAL_CAPACITIES))
    const targetShipId = (shipId || activeShipId || 'H-M2')
    if (!KNOWN_SHIP_IDS.has(targetShipId)) {
      return reply.code(400).send({ detail: `Unknown ship model: ${targetShipId}` })
    }

    function clampOre(val) {
      const n = Math.floor(Number(val))
      return (Number.isFinite(n) && n >= 0) ? Math.min(n, MAX_STATION_STORAGE) : 0
    }

    await db.transaction(async (tx) => {
      if (storage && typeof storage === 'object') {
        const ferrox       = clampOre(storage.ferrox)
        const crynex       = clampOre(storage.crynex)
        const varelium     = clampOre(storage.varelium)
        const miningDrone  = clampOre(storage.mining_drone)

        const totalOre = ferrox + crynex + varelium
        const scaledFerrox   = totalOre > MAX_STATION_STORAGE ? Math.floor(ferrox   * MAX_STATION_STORAGE / totalOre) : ferrox
        const scaledCrynex   = totalOre > MAX_STATION_STORAGE ? Math.floor(crynex   * MAX_STATION_STORAGE / totalOre) : crynex
        const scaledVarielium= totalOre > MAX_STATION_STORAGE ? Math.floor(varelium * MAX_STATION_STORAGE / totalOre) : varelium

        await tx.run(`
          INSERT INTO pilot_storage (pilot_id, ferrox, crynex, varelium, mining_drone)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(pilot_id) DO UPDATE SET
            ferrox       = excluded.ferrox,
            crynex       = excluded.crynex,
            varelium     = excluded.varelium,
            mining_drone = excluded.mining_drone
        `, [pilotId, scaledFerrox, scaledCrynex, scaledVarielium, miningDrone])
      }

      if (shipCargo && typeof shipCargo === 'object') {
        const cap = CANONICAL_CAPACITIES[targetShipId] || 30
        const sanitizedCargo = {
          ferrox:   Math.max(0, Math.min(Math.floor(Number(shipCargo.ferrox)   || 0), cap)),
          crynex:   Math.max(0, Math.min(Math.floor(Number(shipCargo.crynex)   || 0), cap)),
          varelium: Math.max(0, Math.min(Math.floor(Number(shipCargo.varelium) || 0), cap)),
          capacity: cap
        }

        if (shipDrones && typeof shipDrones === 'object') {
          sanitizedCargo.drones = {
            mining_drone: Math.max(0, Math.min(5, Math.floor(Number(shipDrones.mining_drone) || 0)))
          }
        } else {
          const existingShip = await tx.get('SELECT cargo_json FROM hangar_ships WHERE pilot_id = ? AND ship_id = ?', [pilotId, targetShipId])
          if (existingShip && existingShip.cargo_json) {
            try {
              const parsed = JSON.parse(existingShip.cargo_json)
              if (parsed && parsed.drones) sanitizedCargo.drones = parsed.drones
            } catch(_) {}
          }
        }
        const total = sanitizedCargo.ferrox + sanitizedCargo.crynex + sanitizedCargo.varelium
        if (total > cap) {
          const ratio = cap / total
          sanitizedCargo.ferrox   = Math.floor(sanitizedCargo.ferrox   * ratio)
          sanitizedCargo.crynex   = Math.floor(sanitizedCargo.crynex   * ratio)
          sanitizedCargo.varelium = Math.floor(sanitizedCargo.varelium * ratio)
        }

        const cargoJson = JSON.stringify(sanitizedCargo)
        const ship = await tx.get('SELECT id FROM hangar_ships WHERE pilot_id = ? AND ship_id = ?', [pilotId, targetShipId])
        if (ship) {
          await tx.run('UPDATE hangar_ships SET cargo_json = ? WHERE pilot_id = ? AND ship_id = ?', [cargoJson, pilotId, targetShipId])
        } else {
          await tx.run('INSERT INTO hangar_ships (pilot_id, ship_id, quantity, location, cargo_json) VALUES (?, ?, 1, "BASE", ?)', [pilotId, targetShipId, cargoJson])
        }
      }

      if (activeShipId && KNOWN_SHIP_IDS.has(activeShipId)) {
        await tx.run('UPDATE pilots SET active_ship_id = ? WHERE id = ?', [activeShipId, pilotId])
      }

      if (position && typeof position === 'object') {
        const safePos = {
          x:        Number.isFinite(Number(position.x))     ? Math.round(Number(position.x))     : 0,
          y:        Number.isFinite(Number(position.y))     ? Math.round(Number(position.y))     : 0,
          angle:    Number.isFinite(Number(position.angle)) ? Number(Number(position.angle).toFixed(3)) : 0,
          isDocked: Boolean(position.isDocked)
        }
        await tx.run('UPDATE pilots SET position_json = ? WHERE id = ?', [JSON.stringify(safePos), pilotId])
      }
    })

    return { success: true }
  })

  // 1c. Listar todas as Ordens de Venda no Mercado da Estação (Estilo EVE Online)
  fastify.get('/market/orders', {
    onRequest: async (req, reply) => {
      try { await req.jwtVerify() }
      catch { return reply.code(401).send({ detail: 'Invalid session' }) }
    }
  }, async (req, reply) => {
    const orders = await db.all(`
      SELECT id, pilot_id, seller_name, item_id, item_name, quantity, price_per_unit, total_price, station_id, created_at
      FROM market_orders
      ORDER BY id DESC
    `)
    return { success: true, orders }
  })

  // 1d. Criar Ordem de Venda no Mercado da Estação
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

    const currentStorage = await db.get('SELECT ferrox, crynex, varelium, core_v2, h_m2 FROM pilot_storage WHERE pilot_id = ?', [pilotId]) || { ferrox: 0, crynex: 0, varelium: 0, core_v2: 0, h_m2: 0 }
    const available = currentStorage[itemCol] || 0

    if (available < qty) {
      return reply.code(400).send({ detail: `Quantidade insuficiente no armazém da estação (${available} disponíveis)` })
    }

    const pilotRow = await db.get('SELECT username FROM pilots WHERE id = ?', [pilotId])
    const sellerName = pilotRow ? pilotRow.username : 'Pilot'
    const itemDisplayNames = { ferrox: 'Ferrox Ore', crynex: 'Crynex Crystal', varelium: 'Varelium Isotope', core_v2: 'H-M2', h_m2: 'H-M2' }
    const itemDisplayName = itemDisplayNames[itemCol] || itemCol
    const marketItemId = itemCol === 'h_m2' ? 'H-M2' : itemCol
    const totalPrice = qty * unitPrice

    let updatedStorage = null
    let orderId = null

    await db.transaction(async (tx) => {
      await tx.run(`UPDATE pilot_storage SET ${itemCol} = ${itemCol} - ? WHERE pilot_id = ?`, [qty, pilotId])

      const info = await tx.run(`
        INSERT INTO market_orders (pilot_id, seller_name, item_id, item_name, quantity, price_per_unit, total_price, station_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'HARPIA BASE')
      `, [pilotId, sellerName, marketItemId, itemDisplayName, qty, unitPrice, totalPrice])
      orderId = info.lastInsertRowid

      updatedStorage = await tx.get('SELECT ferrox, crynex, varelium, core_v2, h_m2 FROM pilot_storage WHERE pilot_id = ?', [pilotId])
    })

    const orders = await db.all(`
      SELECT id, pilot_id, seller_name, item_id, item_name, quantity, price_per_unit, total_price, station_id, created_at
      FROM market_orders
      ORDER BY id DESC
    `)

    return {
      success: true,
      orderId,
      orders,
      storage: updatedStorage,
      message: `${qty}x ${itemDisplayName} colocados à venda no mercado!`
    }
  })

  // 1e. Cancelar Ordem de Venda
  fastify.delete('/market/orders/:id', {
    onRequest: async (req, reply) => {
      try { await req.jwtVerify() }
      catch { return reply.code(401).send({ detail: 'Invalid session' }) }
    }
  }, async (req, reply) => {
    const pilotId = req.user.id
    const orderId = parseInt(req.params.id, 10)

    const order = await db.get('SELECT * FROM market_orders WHERE id = ? AND pilot_id = ?', [orderId, pilotId])
    if (!order) {
      return reply.code(404).send({ detail: 'Ordem de mercado não encontrada ou pertence a outro piloto' })
    }

    let updatedStorage = null

    await db.transaction(async (tx) => {
      const itemCol = safeStorageCol(order.item_id)
      await tx.run(`UPDATE pilot_storage SET ${itemCol} = ${itemCol} + ? WHERE pilot_id = ?`, [order.quantity, pilotId])
      await tx.run('DELETE FROM market_orders WHERE id = ?', [orderId])
      updatedStorage = await tx.get('SELECT ferrox, crynex, varelium, core_v2, h_m2 FROM pilot_storage WHERE pilot_id = ?', [pilotId])
    })

    const orders = await db.all(`
      SELECT id, pilot_id, seller_name, item_id, item_name, quantity, price_per_unit, total_price, station_id, created_at
      FROM market_orders
      ORDER BY id DESC
    `)

    return {
      success: true,
      orders,
      storage: updatedStorage,
      message: `Ordem #${orderId} cancelada. Itens devolvidos ao armazém.`
    }
  })

  // 1f. Comprar Ordem de Mercado
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

    const order = await db.get('SELECT * FROM market_orders WHERE id = ?', [parsedOrderId])
    if (!order) {
      return reply.code(404).send({ detail: 'Ordem de mercado não encontrada ou já comprada' })
    }

    if (order.pilot_id === buyerPilotId) {
      return reply.code(400).send({ detail: 'Não podes comprar a tua própria ordem de venda' })
    }

    const buyer = await db.get('SELECT credits FROM pilots WHERE id = ?', [buyerPilotId])
    if (!buyer || buyer.credits < order.total_price) {
      return reply.code(400).send({ 
        detail: `Créditos insuficientes (${buyer ? buyer.credits : 0} ARP disponíveis, necessários ${order.total_price} ARP)` 
      })
    }

    let updatedCredits = 0
    let updatedStorage = null
    let updatedShips = []

    await db.transaction(async (tx) => {
      // 1. Deduzir créditos do comprador
      await tx.run('UPDATE pilots SET credits = credits - ? WHERE id = ?', [order.total_price, buyerPilotId])

      // 2. Se o vendedor for outro piloto real, creditar o vendedor
      const npcPilot = await tx.get("SELECT id FROM pilots WHERE username = 'Harpia Market Authority'")
      const npcId = npcPilot ? npcPilot.id : 0
      if (order.pilot_id !== npcId) {
        await tx.run('UPDATE pilots SET credits = credits + ? WHERE id = ?', [order.total_price, order.pilot_id])
        
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

      // 3. Minério vs Nave
      const itemRaw = String(order.item_id).toLowerCase().replace('-', '_')
      const isShip = itemRaw === 'h_m2' || itemRaw === 'core_v2' || itemRaw === 'harpi_t1' || 
                     String(order.item_id).toUpperCase() === 'HARPI-T1' || 
                     String(order.item_id).toUpperCase() === 'H-M2'

      if (!isShip) {
        const itemCol = safeStorageCol(order.item_id)
        await tx.run(`
          INSERT INTO pilot_storage (pilot_id, ferrox, crynex, varelium)
          VALUES (?, 0, 0, 0)
          ON CONFLICT(pilot_id) DO NOTHING
        `, [buyerPilotId])

        try {
          await tx.run(`
            UPDATE pilot_storage 
            SET ${itemCol} = ${itemCol} + ?
            WHERE pilot_id = ?
          `, [order.quantity, buyerPilotId])
        } catch (_) {}
      }

      // H-M2
      if (itemRaw === 'h_m2' || itemRaw === 'core_v2' || String(order.item_id).toUpperCase() === 'H-M2') {
        const existingShip = await tx.get('SELECT id, quantity FROM hangar_ships WHERE pilot_id = ? AND ship_id = ?', [buyerPilotId, 'H-M2'])
        if (existingShip) {
          await tx.run('UPDATE hangar_ships SET quantity = quantity + ? WHERE id = ?', [order.quantity, existingShip.id])
        } else {
          const defaultCargo = JSON.stringify({ ferrox: 0, crynex: 0, varelium: 0, capacity: 200 })
          await tx.run("INSERT INTO hangar_ships (pilot_id, ship_id, quantity, location, cargo_json) VALUES (?, 'H-M2', ?, 'BASE', ?)", [buyerPilotId, order.quantity, defaultCargo])
        }
      }

      // HARPI-T1
      if (itemRaw === 'harpi_t1' || String(order.item_id).toUpperCase() === 'HARPI-T1') {
        const existingShip = await tx.get('SELECT id, quantity FROM hangar_ships WHERE pilot_id = ? AND ship_id = ?', [buyerPilotId, 'HARPI-T1'])
        if (existingShip) {
          await tx.run('UPDATE hangar_ships SET quantity = quantity + ? WHERE id = ?', [order.quantity, existingShip.id])
        } else {
          const defaultCargo = JSON.stringify({ ferrox: 0, crynex: 0, varelium: 0, capacity: 1000 })
          await tx.run("INSERT INTO hangar_ships (pilot_id, ship_id, quantity, location, cargo_json) VALUES (?, 'HARPI-T1', ?, 'BASE', ?)", [buyerPilotId, order.quantity, defaultCargo])
        }
      }

      // 4. Remover ordem comprada do mercado
      await tx.run('DELETE FROM market_orders WHERE id = ?', [order.id])

      const updatedBuyer = await tx.get('SELECT credits FROM pilots WHERE id = ?', [buyerPilotId])
      updatedCredits = updatedBuyer ? updatedBuyer.credits : 0
      updatedStorage = await tx.get('SELECT ferrox, crynex, varelium, core_v2, h_m2 FROM pilot_storage WHERE pilot_id = ?', [buyerPilotId])
      updatedShips = await tx.all('SELECT ship_id, quantity, in_mission, location, cargo_json FROM hangar_ships WHERE pilot_id = ?', [buyerPilotId])
    })

    // 5. Notificar via WebSocket
    ws.broadcast('MARKET_UPDATED', { reason: 'ORDER_BOUGHT', orderId: order.id })

    const remainingOrders = await db.all(`
      SELECT id, pilot_id, seller_name, item_id, item_name, quantity, price_per_unit, total_price, station_id, created_at
      FROM market_orders
      ORDER BY id DESC
    `)

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

    let missionResult = null

    try {
      missionResult = await db.transaction(async (tx) => {
        const shipRow = await tx.get('SELECT quantity, in_mission FROM hangar_ships WHERE pilot_id = ? AND ship_id = ?', [pilotId, ship_id])
        if (!shipRow || shipRow.quantity < qty) {
          return { error: 400, detail: 'Insufficient ships in hangar for launch' }
        }

        await tx.run(
          'UPDATE hangar_ships SET quantity = quantity - ?, in_mission = in_mission + ? WHERE pilot_id = ? AND ship_id = ?',
          [qty, qty, pilotId, ship_id]
        )

        const now = Date.now()
        const missionId = `M-${now.toString(36)}-${Math.random().toString(36).substring(2, 6)}`

        const travelTimeMs = 15 * 1000
        const miningTimeMs = 30 * 1000
        const miningStartedAt = now + travelTimeMs
        const miningEndsAt = miningStartedAt + miningTimeMs
        const completesAt = miningEndsAt + travelTimeMs

        const cargoCapacity = qty * 250
        const cargo = {
          ferrox: Math.round(cargoCapacity * 0.5),
          crynex: Math.round(cargoCapacity * 0.3),
          varelium: Math.round(cargoCapacity * 0.2)
        }

        await tx.run(`
          INSERT INTO active_missions (
            id, pilot_id, ship_id, quantity, target_col, target_row,
            phase, status, started_at, mining_started_at, mining_ends_at, completes_at,
            cargo_minerals, cargo_capacity, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'OUTBOUND', 'ACTIVE', ?, ?, ?, ?, ?, ?, ?)
        `, [
          missionId, pilotId, ship_id, qty, target_col, target_row,
          now, miningStartedAt, miningEndsAt, completesAt,
          JSON.stringify(cargo), cargoCapacity, now
        ])

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
    } catch (e) {
      return reply.code(500).send({ detail: e.message })
    }

    if (missionResult && missionResult.error) {
      return reply.code(missionResult.error).send(missionResult)
    }
    return missionResult
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

    let recallResult = null

    try {
      recallResult = await db.transaction(async (tx) => {
        const mission = await tx.get("SELECT * FROM active_missions WHERE id = ? AND pilot_id = ? AND phase != 'DOCKED'", [mission_id, pilotId])
        if (!mission) {
          return { error: 404, detail: 'Active mission not found' }
        }

        if (mission.phase === 'RETURNING') {
          return { error: 400, detail: 'Fleet is already returning to base' }
        }

        const now = Date.now()
        const returnDurationMs = 12 * 1000
        const newCompletesAt = now + returnDurationMs

        await tx.run(
          "UPDATE active_missions SET phase = 'RETURNING', status = 'RETURNING_EARLY', completes_at = ? WHERE id = ?",
          [newCompletesAt, mission_id]
        )

        ws.sendToPilot(pilotId, 'MISSION_PHASE_CHANGED', { mission_id, phase: 'RETURNING' })
        return { success: true, message: 'Fleet returning to base', completes_at: newCompletesAt }
      })
    } catch (e) {
      return reply.code(500).send({ detail: e.message })
    }

    if (recallResult && recallResult.error) {
      return reply.code(recallResult.error).send(recallResult)
    }
    return recallResult
  })
}
