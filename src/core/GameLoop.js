/**
 * HARPIA Universe - Core GameLoop
 * Motor de ciclo de frames com cálculo de Delta-Time (dt) determinístico.
 * Garante taxa de atualização e física idênticas em qualquer monitor (60Hz, 144Hz, 240Hz).
 */
export class GameLoop {
  constructor() {
    this._rafId = null;
    this._isRunning = false;
    this._lastTimestamp = 0;
    this._updateCallbacks = new Set();
    this._renderCallbacks = new Set();

    // Limitação de dt máximo (100ms) para prevenir saltos de física caso a aba fique em segundo plano
    this.maxDeltaTime = 0.1;
    this.fps = 60;

    this._loop = this._loop.bind(this);
  }

  /**
   * Adiciona um callback ao passo de atualização de lógica/física.
   * @param {Function} callback Recebe dt em segundos
   */
  addUpdate(callback) {
    this._updateCallbacks.add(callback);
    return () => this._updateCallbacks.delete(callback);
  }

  /**
   * Adiciona um callback ao passo de renderização gráfica.
   * @param {Function} callback Recebe interpolação/alpha
   */
  addRender(callback) {
    this._renderCallbacks.add(callback);
    return () => this._renderCallbacks.delete(callback);
  }

  start() {
    if (this._isRunning) return;
    this._isRunning = true;
    this._lastTimestamp = performance.now();
    this._rafId = requestAnimationFrame(this._loop);
  }

  stop() {
    this._isRunning = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  _loop(currentTimestamp) {
    if (!this._isRunning) return;

    // Cálculo do Delta-Time em segundos
    let dt = (currentTimestamp - this._lastTimestamp) / 1000;
    this._lastTimestamp = currentTimestamp;

    // Proteção contra time jumps (ex: ao alternar de aba)
    if (dt > this.maxDeltaTime) {
      dt = this.maxDeltaTime;
    }

    if (dt > 0) {
      this.fps = Math.round(1 / dt);
    }

    // 1. Fase de Atualização de Lógica & Física
    for (const updateFn of this._updateCallbacks) {
      try {
        updateFn(dt);
      } catch (err) {
        console.error('[GameLoop] Erro no ciclo de update:', err);
      }
    }

    // 2. Fase de Renderização Gráfica
    for (const renderFn of this._renderCallbacks) {
      try {
        renderFn();
      } catch (err) {
        console.error('[GameLoop] Erro no ciclo de render:', err);
      }
    }

    this._rafId = requestAnimationFrame(this._loop);
  }
}
