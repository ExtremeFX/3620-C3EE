/**
 * HARPIA Universe - Core EventBus
 * Barramento de eventos Pub/Sub desacoplado para comunicação entre subsistemas e UI.
 */
export class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  /**
   * Subscreve um ouvinte para um determinado evento.
   * @param {string} event 
   * @param {Function} handler 
   * @returns {Function} Função de cancelamento (unsubscribe)
   */
  on(event, handler) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Remove um ouvinte de um evento.
   * @param {string} event 
   * @param {Function} handler 
   */
  off(event, handler) {
    if (this._listeners.has(event)) {
      this._listeners.get(event).delete(handler);
    }
  }

  /**
   * Subscreve um ouvinte que será executado apenas uma vez.
   * @param {string} event 
   * @param {Function} handler 
   */
  once(event, handler) {
    const wrapper = (data) => {
      this.off(event, wrapper);
      handler(data);
    };
    this.on(event, wrapper);
  }

  /**
   * Dispara um evento transmitindo dados para todos os ouvintes registados.
   * @param {string} event 
   * @param {*} [data] 
   */
  emit(event, data) {
    if (this._listeners.has(event)) {
      for (const handler of this._listeners.get(event)) {
        try {
          handler(data);
        } catch (err) {
          console.error(`[EventBus] Erro ao processar evento "${event}":`, err);
        }
      }
    }
  }
}

/**
 * Catálogo central de eventos do jogo
 */
export const EV = Object.freeze({
  GAME_START: 'game:start',
  GAME_EXIT: 'game:exit',
  INPUT_CLICK: 'input:click',
  INPUT_DRAG: 'input:drag',
  INPUT_WHEEL: 'input:wheel',
  INPUT_RESIZE: 'input:resize',
  SHIP_TARGET_SET: 'ship:targetSet',
  SHIP_ARRIVED: 'ship:arrived',
  SHIP_MOVED: 'ship:moved',
  CAMERA_UPDATED: 'camera:updated',
  ZOOM_CHANGED: 'camera:zoomChanged',
  HUD_TOAST: 'hud:toast',
  AUTH_LOGGED_IN: 'auth:loggedIn',
  AUTH_LOGGED_OUT: 'auth:loggedOut',
  STATION_DOCKING: 'station:docking',
  STATION_DOCKED: 'station:docked',
  STATION_UNDOCK: 'station:undock',
  GALAXY_MAP_OPEN: 'galaxy:map_open',
  GALAXY_MAP_CLOSE: 'galaxy:map_close',
  GALAXY_JUMP_TO: 'galaxy:jump_to',
});
