'use strict'

const HEARTBEAT_INTERVAL_MS = 30_000 // 30 seconds

class WebSocketManager {
  constructor() {
    this.clients = new Map() // pilot_id -> Set(sockets)
  }

  registerClient(pilotId, socket) {
    // FIX BUG-WS1: reject unauthenticated connections (pilotId = 0 from failed JWT)
    if (!pilotId || pilotId === 0) {
      try { socket.close(4003, 'Authentication required') } catch (_) {}
      return
    }

    const key = Number(pilotId)
    if (!this.clients.has(key)) {
      this.clients.set(key, new Set())
    }
    this.clients.get(key).add(socket)

    // FIX BUG-WS2: missing error listener — unhandled WS errors crash the Node.js process
    socket.on('error', (err) => {
      console.error(`[WS] Socket error for pilot #${key}:`, err.message)
      const set = this.clients.get(key)
      if (set) {
        set.delete(socket)
        if (set.size === 0) this.clients.delete(key)
      }
    })

    socket.on('close', () => {
      if (socket._heartbeatTimer) {
        clearInterval(socket._heartbeatTimer)
        socket._heartbeatTimer = null
      }
      const set = this.clients.get(key)
      if (set) {
        set.delete(socket)
        if (set.size === 0) this.clients.delete(key)
      }
    })

    // FIX BUG-WS3: heartbeat to detect and clean up stale (ghost) connections
    socket._isAlive = true
    socket.on('pong', () => { socket._isAlive = true })

    socket._heartbeatTimer = setInterval(() => {
      if (!socket._isAlive) {
        console.warn(`[WS] Pilot #${key} heartbeat timeout — terminating ghost socket`)
        clearInterval(socket._heartbeatTimer)
        socket._heartbeatTimer = null
        try { socket.terminate() } catch (_) {}
        const set = this.clients.get(key)
        if (set) {
          set.delete(socket)
          if (set.size === 0) this.clients.delete(key)
        }
        return
      }
      socket._isAlive = false
      try { socket.ping() } catch (_) {}
    }, HEARTBEAT_INTERVAL_MS)
  }

  // FIX BUG-WS4: pass error callback to ws.send() to handle race condition between
  // readyState check and actual write (connection may close between the two)
  _safeSend(ws, msg) {
    if (ws.readyState !== 1) return // OPEN = 1
    ws.send(msg, (err) => {
      if (err) {
        console.warn('[WS] send error (socket dropped):', err.message)
      }
    })
  }

  sendToPilot(pilotId, type, payload) {
    const key = Number(pilotId)
    const set = this.clients.get(key)
    if (!set || set.size === 0) return

    const msg = JSON.stringify({ type, payload, timestamp: Date.now() })
    for (const ws of set) {
      this._safeSend(ws, msg)
    }
  }

  broadcast(type, payload) {
    const msg = JSON.stringify({ type, payload, timestamp: Date.now() })
    for (const set of this.clients.values()) {
      for (const ws of set) {
        this._safeSend(ws, msg)
      }
    }
  }
}

module.exports = new WebSocketManager()
