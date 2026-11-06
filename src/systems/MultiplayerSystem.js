/**
 * HARPIA Universe - MultiplayerSystem
 * Sistema central que gere o ciclo de vida de naves remotas, telemetria de rede
 * e sincronização espacial em tempo real via WebSockets.
 */
import { RemoteShipEntity } from '../entities/RemoteShipEntity.js';
import { wsClient } from '../network/websocket.js';
import { getCurrentSystemId } from '../universe/GalaxyData.js';

export class MultiplayerSystem {
  /**
   * @param {Object} options
   * @param {import('../core/EventBus.js').EventBus} options.bus
   * @param {import('../entities/ShipEntity.js').ShipEntity} options.localShip
   */
  constructor({ bus, localShip }) {
    this.bus = bus;
    this.localShip = localShip;

    this.remoteShips = new Map(); // pilotId (Number) -> RemoteShipEntity
    this.telemetryInterval = 0.10; // 10 Hz (envio de telemetria a cada 100ms)
    this.telemetryTimer = 0;

    this.layerEl = null;
    this._ensureLayer();
    this._bindEvents();

    if (typeof window !== 'undefined') {
      window.harpiaMultiplayer = this;
    }
  }

  _ensureLayer() {
    let layer = document.getElementById('remote-ships-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'remote-ships-layer';
      layer.className = 'remote-ships-layer';
      const gameWorld = document.getElementById('game-world') || document.body;
      gameWorld.appendChild(layer);
    }
    this.layerEl = layer;
  }

  _bindEvents() {
    // 1. Pacote de Estado do Mundo com todos os pilotos presentes no mesmo setor
    wsClient.on('WORLD_STATE', (payload) => {
      const pilots = (payload && Array.isArray(payload.pilots)) ? payload.pilots : [];
      const presentIds = new Set();

      for (const p of pilots) {
        if (!p || !p.id) continue;
        const id = Number(p.id);
        presentIds.add(id);

        if (this.remoteShips.has(id)) {
          this.remoteShips.get(id).sync(p);
        } else {
          const remoteShip = new RemoteShipEntity(p, this.layerEl);
          this.remoteShips.set(id, remoteShip);
        }
      }

      // Remover naves que já não constam no pacote (saíram do sistema ou offline)
      for (const [id, ship] of this.remoteShips.entries()) {
        if (!presentIds.has(id)) {
          ship.destroy();
          this.remoteShips.delete(id);
        }
      }
    });

    // 2. Despawn imediato de um piloto que saiu
    wsClient.on('PILOT_DESPAWN', (payload) => {
      if (payload && payload.id) {
        const id = Number(payload.id);
        const ship = this.remoteShips.get(id);
        if (ship) {
          ship.destroy();
          this.remoteShips.delete(id);
        }
      }
    });

    // 3. Sincronização de feixe de mineração de outro piloto
    wsClient.on('PILOT_MINING_SYNC', (payload) => {
      if (payload && payload.pilotId) {
        const id = Number(payload.pilotId);
        const ship = this.remoteShips.get(id);
        if (ship) {
          ship.miningTarget = payload.mining;
        }
      }
    });

    // 4. Sincronização Inicial de Recursos dos Asteroides no Setor
    wsClient.on('ASTEROIDS_INIT', (asteroidsList) => {
      if (!Array.isArray(asteroidsList) || !window.harpiaAsteroids) return;
      for (const data of asteroidsList) {
        const ast = window.harpiaAsteroids.find(a => a.storageKey === data.key);
        if (ast && typeof ast.applyServerUnits === 'function') {
          ast.applyServerUnits(data.currentUnits, data.isDepleted);
        }
      }
    });

    // 5. Atualização em Tempo Real quando um asteroide é minerado por qualquer piloto
    wsClient.on('ASTEROID_UPDATED', (data) => {
      if (!data || !window.harpiaAsteroids) return;
      const ast = window.harpiaAsteroids.find(a => a.storageKey === data.key);
      if (ast && typeof ast.applyServerUnits === 'function') {
        ast.applyServerUnits(data.currentUnits, data.isDepleted);
      }
    });

    // 6. Ao mudar de sistema ou desconectar, limpar todas as naves remotas
    if (this.bus) {
      this.bus.on('system:changed', () => this.clearAll());
      this.bus.on('auth:logout', () => this.clearAll());
    }
  }

  /**
   * Envia evento de mineração para o servidor replicar em tempo real
   * @param {string} storageKey 
   * @param {number} amount 
   */
  reportMine(storageKey, amount) {
    if (!wsClient.isConnected) return;
    wsClient.send('MINE_ASTEROID', { key: storageKey, amount: amount || 1 });
  }

  clearAll() {
    for (const ship of this.remoteShips.values()) {
      ship.destroy();
    }
    this.remoteShips.clear();
  }

  /**
   * Atualização a cada frame do loop do jogo (60 FPS)
   * @param {number} dt 
   */
  update(dt) {
    // 1. Atualizar interpolação de todas as naves remotas
    for (const ship of this.remoteShips.values()) {
      ship.update(dt);
    }

    // 2. Despacho de telemetria do jogador local para o servidor (10 Hz)
    this.telemetryTimer += dt;
    if (this.telemetryTimer >= this.telemetryInterval) {
      this.telemetryTimer = 0;
      this._sendLocalTelemetry();
    }
  }

  _sendLocalTelemetry() {
    if (!wsClient.isConnected || !this.localShip) return;

    const ship = this.localShip;
    wsClient.send('PILOT_TELEMETRY', {
      x: ship.x,
      y: ship.y,
      angle: ship.angle,
      speed: ship.currentSpeed || (ship.isMoving ? ship.maxSpeed : 0),
      isMoving: ship.isMoving,
      isDocked: ship.isDocked,
      warpState: ship.warpState,
      activeShipId: ship.shipId,
      systemId: getCurrentSystemId()
    });
  }

  /**
   * Renderização na projeção da câmara espacial
   * @param {import('../core/Camera2D.js').Camera2D} camera 
   */
  render(camera) {
    for (const ship of this.remoteShips.values()) {
      ship.render(camera);
    }
  }
}
