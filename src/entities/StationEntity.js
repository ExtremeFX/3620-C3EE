/**
 * HARPIA Universe - StationEntity
 * Entidade que modela a Estação Espacial Principal: escala, perspectiva ótica e posicionamento.
 */
import { STATION_BASE_W } from '../core/config.js';

export class StationEntity {
  constructor() {
    this.baseWidth = STATION_BASE_W;
    this.wrapEl = document.getElementById('main-station-wrap');
  }

  /**
   * Retorna as coordenadas mundiais do centro e raio da baía de atracagem
   * @param {import('../core/Camera2D.js').Camera2D} camera
   */
  getDockingBayWorld(camera) {
    const camW = camera ? camera.width : (typeof window !== 'undefined' ? window.innerWidth : 1920);
    const stationCenterX = -(camW * 0.38);
    const scale = this.baseWidth / 1450;

    // Coordenada mundial real comprovada da baía de atracagem dimensionada proporcionalmente
    const bayWorldX = Math.round(stationCenterX + (20 * scale));
    const bayWorldY = Math.round(-200 * scale);
    const bayRadius = Math.round(180 * scale);

    return {
      x: bayWorldX,
      y: bayWorldY,
      radius: bayRadius
    };
  }

  /**
   * Renderização com perspectiva ótica realista
   * @param {import('../core/Camera2D.js').Camera2D} camera 
   */
  render(camera) {
    if (!this.wrapEl) return;

    const ratio = camera.zoomRatio;
    const scaledWidth = Math.round(this.baseWidth * ratio);
    this.wrapEl.style.width = scaledWidth + 'px';

    // No zoom máximo, a estação fica à esquerda (~38% da tela a partir do centro)
    // Conforme a câmara segue a nave e o pan, a estação move-se em perfeita sincronia com o mundo
    const baseOffsetX = -(camera.width * 0.38);
    const camX = camera.x;
    const camY = camera.y;
    const currentOffsetX = Math.round(baseOffsetX * ratio - camX * ratio + (camera.shakeOffsetX || 0));
    const currentOffsetY = Math.round(-camY * ratio + (camera.shakeOffsetY || 0));

    this.wrapEl.style.transform = `translate3d(calc(-50% + ${currentOffsetX}px), calc(-50% + ${currentOffsetY}px), 0)`;
  }
}
