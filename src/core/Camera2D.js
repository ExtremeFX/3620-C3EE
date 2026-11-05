/**
 * HARPIA Universe - Core Camera2D
 * Sistema de câmara 2D com projeções matemáticas mundo/ecrã e interpolação suave.
 */
import { EV } from './EventBus.js';

export class Camera2D {
  /**
   * @param {import('./EventBus.js').EventBus} eventBus 
   */
  constructor(eventBus) {
    this.bus = eventBus;

    // Foco mundial da câmara (segue a nave)
    this.x = 0;
    this.y = 0;

    // Controlo de Zoom
    this.zoom = 1.0;
    this.targetZoom = 1.0;
    this.minZoom = 0.4;
    this.maxZoom = 2.8;

    // Pan (deslocamento adicional pelo arrasto do rato)
    this.panX = 0;
    this.panY = 0;
    this.targetPanX = 0;
    this.targetPanY = 0;

    // Dimensões do Viewport
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // Efeito Cinemático de Camera Shake (GPU Matrix Shift)
    this.shakeIntensity = 0;
    this.shakeDecay = 5.0;
    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;

    if (this.bus) {
      this.bus.on('ship:warp_started', () => this.shake(2.0, 0.35));
      this.bus.on('ship:warp_completed', () => this.shake(2.8, 0.45));
      this.bus.on('mining:started', () => this.shake(0.8, 0.2));
      this.bus.on('mining:impact', () => this.shake(1.2, 0.22));
    }

    this.resize = this.resize.bind(this);
  }

  resize(w = window.innerWidth, h = window.innerHeight) {
    this.width = w;
    this.height = h;
  }

  /**
   * Rácio de zoom relativo ao zoom máximo (usado para escalar sprites e distâncias)
   */
  get zoomRatio() {
    return this.zoom / this.maxZoom;
  }

  /**
   * Converte coordenadas de ecrã (pixels) para coordenadas do mundo espacial.
   */
  screenToWorld(screenX, screenY) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const ratio = this.zoomRatio;
    return {
      x: this.x + (screenX - cx) / ratio,
      y: this.y + (screenY - cy) / ratio
    };
  }

  /**
   * Converte coordenadas do mundo espacial para coordenadas de ecrã (com Camera Shake).
   */
  worldToScreen(worldX, worldY) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const ratio = this.zoomRatio;
    return {
      x: cx + (worldX - this.x) * ratio + this.shakeOffsetX,
      y: cy + (worldY - this.y) * ratio + this.shakeOffsetY
    };
  }

  /**
   * Dispara um tremor cinemático de câmara (Camera Shake)
   * @param {number} [intensity=1.5] - Força do tremor em pixels
   * @param {number} [duration=0.3] - Duração do desvanecimento em segundos
   */
  shake(intensity = 1.5, duration = 0.3) {
    this.shakeIntensity = Math.min(4.0, Math.max(this.shakeIntensity, intensity));
    this.shakeDecay = duration > 0 ? this.shakeIntensity / duration : 5.0;
  }

  /**
   * Aplica zoom suave via roda do rato
   */
  applyZoom(deltaY) {
    const factor = deltaY < 0 ? 1.12 : 0.89;
    this.targetZoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.targetZoom * factor));
  }

  /**
   * Aplica arrasto parallax do rato (desativado: câmara bloqueada rigorosamente na nave)
   */
  applyPan(dx, dy) {
    // Intencionalmente desativado para manter foco absoluto na nave
  }

  /**
   * Repõe o pan a zero para garantir foco central rigoroso
   */
  resetPan() {
    this.panX = 0;
    this.panY = 0;
    this.targetPanX = 0;
    this.targetPanY = 0;
  }

  /**
   * Fixa a posição de foco da câmara no mundo
   */
  setFocus(targetX, targetY) {
    this.x = targetX;
    this.y = targetY;
  }

  /**
   * Interpolação suave a cada frame com base no delta-time
   */
  update(dt) {
    const zoomLerp = Math.min(1.0, 8.0 * dt);
    const panLerp = Math.min(1.0, 10.0 * dt);

    this.zoom += (this.targetZoom - this.zoom) * zoomLerp;
    this.panX += (this.targetPanX - this.panX) * panLerp;
    this.panY += (this.targetPanY - this.panY) * panLerp;

    // Atualização de Camera Shake suave por GPU
    if (this.shakeIntensity > 0.04) {
      this.shakeOffsetX = (Math.random() - 0.5) * 2 * this.shakeIntensity;
      this.shakeOffsetY = (Math.random() - 0.5) * 2 * this.shakeIntensity;
      this.shakeIntensity = Math.max(0, this.shakeIntensity - this.shakeDecay * dt);
    } else {
      this.shakeIntensity = 0;
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
    }

    this.bus.emit(EV.CAMERA_UPDATED, this);
  }
}
