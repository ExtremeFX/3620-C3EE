/**
 * HARPIA Universe - InputManager System
 * Gestão centralizada e desacoplada de eventos de rato, arrasto e scroll.
 */
import { EV } from '../core/EventBus.js';

export class InputManager {
  /**
   * @param {import('../core/EventBus.js').EventBus} eventBus 
   */
  constructor(eventBus) {
    this.bus = eventBus;
    this.isEnabled = false;

    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragDist = 0;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    this._onWheel = this._onWheel.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onResize = this._onResize.bind(this);
  }

  enable() {
    if (this.isEnabled) return;
    this.isEnabled = true;

    window.addEventListener('wheel', this._onWheel, { passive: false });
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('resize', this._onResize);
  }

  disable() {
    if (!this.isEnabled) return;
    this.isEnabled = false;
    this.isDragging = false;

    window.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('resize', this._onResize);
  }

  _isInteractiveElement(target) {
    if (!target || typeof target.closest !== 'function') return false;
    return !!(
      target.closest('.tactical-overview-panel') ||
      target.closest('.offscreen-radar-layer') ||
      target.closest('.radar-edge-marker') ||
      target.closest('#space-ore-mount') ||
      target.closest('#ship-nav-mount') ||
      target.closest('.space-ore-storage') ||
      target.closest('.ship-nav-hud') ||
      target.closest('.mining-module-control') ||
      target.closest('button') ||
      target.closest('.game-hud-top') ||
      target.closest('.auth-panel') ||
      target.closest('.daily-reward-box') ||
      target.closest('.station-hangar-overlay') ||
      target.closest('.split-stack-overlay') ||
      target.closest('.eve-context-menu') ||
      target.closest('[draggable="true"]') ||
      target.closest('.storage-drop-zone') ||
      target.closest('.user-profile') ||
      target.closest('.user-profile-container') ||
      target.closest('.user-wallet-box') ||
      target.closest('.hangar-market-panel') ||
      target.closest('.eve-sell-modal-overlay') ||
      target.closest('.back-lobby-btn') ||
      target.closest('#lobby-mount') ||
      target.closest('.game-toast') ||
      !target.closest('#game-world')
    );
  }

  _onWheel(e) {
    if (!this.isEnabled) return;
    e.preventDefault();
    this.bus.emit(EV.INPUT_WHEEL, { deltaY: e.deltaY });
  }

  _onMouseDown(e) {
    if (!this.isEnabled) return;
    if (e.button !== 0) return; // Apenas botão principal (esquerdo) comanda a nave
    if (this._isInteractiveElement(e.target)) return;

    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragDist = 0;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
  }

  _onMouseMove(e) {
    if (!this.isEnabled || !this.isDragging) return;

    const dx = e.clientX - this.lastMouseX;
    const dy = e.clientY - this.lastMouseY;
    this.dragDist += Math.abs(dx) + Math.abs(dy);
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;

    this.bus.emit(EV.INPUT_DRAG, { dx, dy, x: e.clientX, y: e.clientY });
  }

  _onMouseUp(e) {
    if (!this.isEnabled) return;
    if (e.button !== 0) return;
    const wasDragging = this.isDragging;
    this.isDragging = false;

    if (this._isInteractiveElement(e.target)) return;

    // Distância euclidiana real entre mousedown e mouseup
    const netDist = Math.hypot(e.clientX - this.dragStartX, e.clientY - this.dragStartY);
    if (wasDragging && netDist < 25) {
      this.bus.emit(EV.INPUT_CLICK, { screenX: e.clientX, screenY: e.clientY });
    }
  }

  _onResize() {
    this.bus.emit(EV.INPUT_RESIZE, {
      width: window.innerWidth,
      height: window.innerHeight
    });
  }
}
