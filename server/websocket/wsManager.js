'use strict'

const HEARTBEAT_INTERVAL_MS = 30_000 // 30 seconds

class WebSocketManager {
  constructor() {
    this.clients = new Map() // pilot_id -> Set(sockets)
    this._onMessageCallback = null
    this._onDisconnectCallback = null
  }

  onMessage(cb) {
    this._onMessageCallback = cb
  }

  onDisconnect(cb) {
    this._onDisconnectCallback = cb
  }

  registerClient(pilotId, socket, username = 'Piloto') {
    if (!pilotId || pilotId === 0) {
      try { socket.close(4003, 'Authentication required') } catch (_) {}
      return
    }

    const key = Number(pilotId)
    if (!this.clients.has(key)) {
      this.clients.set(key, new Set())
    }
    this.clients.get(key).add(socket)

    const cleanupSocket = () => {
      if (socket._heartbeatTimer) {
        clearInterval(socket._heartbeatTimer)
        socket._heartbeatTimer = null
      }
      const set = this.clients.get(key)
      if (set) {
        set.delete(socket)
        if (set.size === 0) {
          this.clients.delete(key)
          if (this._onDisconnectCallback) {
            this._onDisconnectCallback(key)
          }
        }
      }
    }

    // Escuta de mensagens recebidas do cliente (Telemetria, Chat, Feixes de mineração)
    socket.on('message', (raw) => {
      try {
        const msg = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(raw.toString())
        if (msg && msg.type && this._onMessageCallback) {
          this._onMessageCallback(key, msg, socket, username)
        }
      } catch (_) {}
    })

    socket.on('error', (err) => {
      console.error(`[WS] Socket error for pilot #${key}:`, err.message)
      cleanupSocket()
    })

    socket.on('close', () => {
      cleanupSocket()
    })

    socket._isAlive = true
    socket.on('pong', () => { socket._isAlive = true })

    socket._heartbeatTimer = setInterval(() => {
      if (!socket._isAlive) {
        console.warn(`[WS] Pilot #${key} heartbeat timeout — terminating ghost socket`)
        try { socket.terminate() } catch (_) {}
        cleanupSocket()
        return
      }
      socket._isAlive = false
      try { socket.ping() } catch (_) {}
    }, HEARTBEAT_INTERVAL_MS)
  }

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
