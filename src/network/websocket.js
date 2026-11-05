/**
 * HARPIA Universe - WebSocket Client
 * Comunicação bi-direcional em tempo real com auto-reconnect exponencial.
 */
import { WS_RECONNECT_BASE, WS_RECONNECT_MAX } from '../core/config.js';

export class HarpiaWebSocket {
  constructor() {
    this.ws = null;
    this.token = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.isConnected = false;
  }

  connect(token) {
    if (token) this.token = token;
    if (!this.token) return;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host || 'localhost:8000';
    const url = `${wsProto}//${host}/ws?token=${encodeURIComponent(this.token)}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        console.log('%c[WebSocket] Ligado ao servidor de simulação', 'color: #00ffaa;');
        this._dispatch('open', null);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.type) {
            this._dispatch(data.type, data.payload || data);
          }
        } catch (e) {
          console.error('[WebSocket] Erro ao processar mensagem recebida:', e);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[WebSocket] Erro de ligação:', err);
      };

      this.ws.onclose = (event) => {
        this.isConnected = false;
        this._dispatch('close', null);

        // Se o servidor fechou por autenticação (4001 = sem token, 4003 = token inválido/expirado) ou 1000 (normal closure), não tenta reconectar
        if (event && (event.code === 4001 || event.code === 4003 || event.code === 1000)) {
          console.warn(`[WebSocket] Sessão encerrada (código ${event.code}: ${event.reason || 'Auth/Manual'}). Auto-reconnect suspenso.`);
          return;
        }

        this._scheduleReconnect();
      };
    } catch (e) {
      this._scheduleReconnect();
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  send(type, payload = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    } else {
      console.warn('[WebSocket] Não conectado. Mensagem descartada:', type);
    }
  }

  on(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType).add(callback);
    return () => this.off(eventType, callback);
  }

  off(eventType, callback) {
    if (this.listeners.has(eventType)) {
      this.listeners.get(eventType).delete(callback);
    }
  }

  _dispatch(eventType, data) {
    if (this.listeners.has(eventType)) {
      for (const cb of this.listeners.get(eventType)) {
        try {
          cb(data);
        } catch (err) {
          console.error(`[WebSocket] Erro no listener "${eventType}":`, err);
        }
      }
    }
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    // Backoff exponencial com jitter aleatório (±15%) para evitar sobrecarga simultânea
    const baseDelay = Math.min(WS_RECONNECT_BASE * Math.pow(2, this.reconnectAttempts), WS_RECONNECT_MAX);
    const jitter = baseDelay * (0.85 + Math.random() * 0.3);
    const delay = Math.round(jitter);
    this.reconnectAttempts++;
    console.log(`[WebSocket] Tentativa de reconexão #${this.reconnectAttempts} agendada para daqui a ${(delay / 1000).toFixed(1)}s...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isConnected && this.token) {
        this.connect(this.token);
      }
    }, delay);
  }
}

export const wsClient = new HarpiaWebSocket();
