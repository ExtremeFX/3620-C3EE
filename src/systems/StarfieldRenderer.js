/**
 * HARPIA Universe - StarfieldRenderer System
 * Motor de renderização estelar GPU-accelerated com parallax multinível e wrap toroidal infinito.
 */
export class StarfieldRenderer {
  /**
   * @param {HTMLCanvasElement} canvas 
   */
  constructor(canvas) {
    this.canvas = canvas;
    if (!this.canvas) {
      throw new Error('[StarfieldRenderer] Canvas #starfield-canvas não encontrado no DOM.');
    }

    // Contexto otimizado para GPU (desativa composição alfa do canvas com o DOM)
    this.ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: true });

    this.stars = [];
    this.numStars = 650;
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.resize(this.width, this.height);
    this.initStars();
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
  }

  initStars() {
    this.stars = [];
    for (let i = 0; i < this.numStars; i++) {
      const layer = Math.random() < 0.6 ? 1 : (Math.random() < 0.85 ? 2 : 3);
      this.stars.push({
        x: (Math.random() - 0.5) * (this.width * 2.5),
        y: (Math.random() - 0.5) * (this.height * 2.5),
        radius: layer === 1 ? (Math.random() * 0.8 + 0.3) : (layer === 2 ? (Math.random() * 1.1 + 0.6) : (Math.random() * 1.4 + 0.9)),
        alpha: Math.random() * 0.7 + 0.3,
        twinkleSpeed: Math.random() * 0.03 + 0.005,
        twinklePhase: Math.random() * Math.PI * 2,
        layer: layer,
        color: this._getStarColor()
      });
    }
  }

  _getStarColor() {
    const r = Math.random();
    if (r < 0.65) return '#ffffff'; // Branco puro
    if (r < 0.85) return '#00f0ff'; // Azul ciano
    if (r < 0.95) return '#88ccff'; // Azul celeste
    return '#ffd277';               // Dourado suave
  }

  /**
   * Renderiza um frame do starfield
   * @param {import('../core/Camera2D.js').Camera2D} camera 
   */
  render(camera) {
    const ctx = this.ctx;
    const cx = this.width / 2;
    const cy = this.height / 2;

    // Fundo espacial profundo (GPU direct clear)
    ctx.fillStyle = '#01040a';
    ctx.fillRect(0, 0, this.width, this.height);

    // Nebulosa suave central
    const grad = ctx.createRadialGradient(cx, cy, 50, cx, cy, this.width * 0.8);
    grad.addColorStop(0, 'rgba(0, 40, 70, 0.25)');
    grad.addColorStop(0.5, 'rgba(0, 15, 35, 0.12)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Dimensões para wrap toroidal infinito
    const worldW = Math.max(1600, this.width * 2.5);
    const worldH = Math.max(1200, this.height * 2.5);

    // Renderizar estrelas
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      // Parallax mais expressivo: camada frontal move-se 2.5x a posição da câmara
      const parallaxFactor = s.layer === 1 ? 0.15 : (s.layer === 2 ? 0.55 : 1.0);

      // Deslocamento relativo estritamente ao foco da nave (com micro-vibrações de shake)
      const camX = camera.x + (camera.shakeOffsetX || 0) * 0.5;
      const camY = camera.y + (camera.shakeOffsetY || 0) * 0.5;

      let offsetX = ((s.x - camX * parallaxFactor) % worldW);
      if (offsetX > worldW / 2) offsetX -= worldW;
      if (offsetX < -worldW / 2) offsetX += worldW;

      let offsetY = ((s.y - camY * parallaxFactor) % worldH);
      if (offsetY > worldH / 2) offsetY -= worldH;
      if (offsetY < -worldH / 2) offsetY += worldH;

      const sx = cx + offsetX * camera.zoom;
      const sy = cy + offsetY * camera.zoom;

      // Frustum culling das estrelas fora da tela
      if (sx < -60 || sx > this.width + 60 || sy < -60 || sy > this.height + 60) {
        continue;
      }

      // Brilho cintilante
      s.twinklePhase += s.twinkleSpeed;
      const currentAlpha = Math.max(0.1, Math.min(1.0, s.alpha + Math.sin(s.twinklePhase) * 0.25));
      const currentRadius = Math.max(0.5, s.radius * Math.sqrt(camera.zoom));

      ctx.save();
      ctx.globalAlpha = currentAlpha;

      if (this.isWarping) {
        // Efeito de Dobra Hiperespacial (Warp Streaks)
        const streakLen = (35 + s.layer * 25) * Math.max(0.8, camera.zoom);
        const cosA = Math.cos(this.warpAngle - Math.PI / 2);
        const sinA = Math.sin(this.warpAngle - Math.PI / 2);

        ctx.strokeStyle = s.color;
        ctx.lineWidth = Math.max(1.2, currentRadius * 1.4);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx - cosA * streakLen, sy - sinA * streakLen);
        ctx.lineTo(sx + cosA * 8, sy + sinA * 8);
        ctx.stroke();
      } else {
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(sx, sy, currentRadius, 0, Math.PI * 2);
        ctx.fill();

        if (s.layer === 3 && camera.zoom > 1.1) {
          ctx.shadowBlur = 6 * camera.zoom;
          ctx.shadowColor = s.color;
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  /**
   * Configura o efeito visual de dobra hiperespacial
   * @param {boolean} isWarping 
   * @param {number} [angle=0] 
   */
  setWarp(isWarping, angle = 0) {
    this.isWarping = isWarping;
    this.warpAngle = angle;
  }
}
