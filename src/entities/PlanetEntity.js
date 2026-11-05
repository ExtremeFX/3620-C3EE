/**
 * HARPIA Universe - PlanetEntity
 * Entidade que modela o Planeta Vermelho Celestial no fundo à direita:
 * Escala colossal e parallax profundo sincronizado com o campo estelar,
 * evidenciando que está a uma distância astronómica (muito mais distante que a Estação).
 */
export class PlanetEntity {
  constructor() {
    this.wrapEl = document.getElementById('celestial-planet-wrap');
    this.baseWidth = Math.min(960, Math.max(680, window.innerWidth * 0.52));
    // Fator de parallax celeste (0.05: mesmo universo das estrelas, mas muito mais distante que a estação)
    this.parallaxFactor = 0.05;

    window.addEventListener('resize', () => {
      this.baseWidth = Math.min(960, Math.max(680, window.innerWidth * 0.52));
    });
  }

  /**
   * Renderiza a projeção e deslocamento por parallax
   * @param {import('../core/Camera2D.js').Camera2D} camera 
   */
  render(camera) {
    if (!this.wrapEl) return;

    const ratio = camera.zoomRatio || 1;
    // Variação de zoom cósmica muito subtil por estar a anos-luz/milhões de km de distância
    const zoomScale = 1 + (ratio - 1) * 0.12;
    const scaledWidth = Math.round(this.baseWidth * zoomScale);
    this.wrapEl.style.width = `${scaledWidth}px`;
    this.wrapEl.style.height = `${scaledWidth}px`;

    // Deslocamento por parallax relativo à posição da câmara (com micro-resposta a tremores)
    const offsetX = Math.round(-camera.x * this.parallaxFactor + (camera.shakeOffsetX || 0) * 0.25);
    const offsetY = Math.round(-camera.y * this.parallaxFactor + (camera.shakeOffsetY || 0) * 0.25);

    this.wrapEl.style.transform = `translate3d(${offsetX}px, calc(-50% + ${offsetY}px), 0)`;
  }
}
