/**
 * HARPIA Universe - LogoCanvas Component
 * Renderiza o logo em canvas 2D aplicando Chroma-Key em tempo real para transparência perfeita do preto,
 * com ciclo de vida (pause/resume) para 0% de impacto de CPU quando em jogo.
 */
import { UIComponent } from '../core/UIComponent.js';

export class LogoCanvas extends UIComponent {
  constructor() {
    super();
    this.videoEl = null;
    this.canvasEl = null;
    this.ctx = null;
    this.isRunning = true;
    this.rafId = null;
    this.lastTime = -1;
  }

  /**
   * @param {HTMLElement} container 
   */
  mount(container) {
    if (this.root) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'logo';

    wrapper.innerHTML = `
      <video id="logo-video-source" autoplay loop muted playsinline style="display: none;">
        <source src="./assets/logo_video.webm" type="video/webm">
      </video>
      <canvas id="logo-canvas" class="logo-vid"></canvas>
    `;

    container.appendChild(wrapper);
    this.root = wrapper;

    this.videoEl = wrapper.querySelector('#logo-video-source');
    this.canvasEl = wrapper.querySelector('#logo-canvas');

    if (this.canvasEl) {
      this.ctx = this.canvasEl.getContext('2d', { willReadFrequently: true });
    }

    this._startLoop();
  }

  _startLoop() {
    if (!this.videoEl || !this.canvasEl || !this.ctx) return;

    const renderFrame = () => {
      if (!this.isRunning) return;

      if (this.videoEl.readyState >= 2 && !this.videoEl.paused && this.videoEl.currentTime !== this.lastTime) {
        this.lastTime = this.videoEl.currentTime;

        if (this.canvasEl.width !== this.videoEl.videoWidth && this.videoEl.videoWidth > 0) {
          this.canvasEl.width = this.videoEl.videoWidth;
          this.canvasEl.height = this.videoEl.videoHeight;
        }

        if (this.canvasEl.width > 0 && this.canvasEl.height > 0) {
          this.ctx.drawImage(this.videoEl, 0, 0, this.canvasEl.width, this.canvasEl.height);
          const frame = this.ctx.getImageData(0, 0, this.canvasEl.width, this.canvasEl.height);
          const data = frame.data;
          const len = data.length;

          for (let i = 0; i < len; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const brightness = r * 0.299 + g * 0.587 + b * 0.114;

            if (brightness < 30) {
              data[i + 3] = 0;
            } else if (brightness < 70) {
              data[i + 3] = Math.floor(((brightness - 30) / 40) * 255);
            }
          }

          this.ctx.putImageData(frame, 0, 0);
        }
      }

      this.rafId = requestAnimationFrame(renderFrame);
    };

    this.videoEl.play().catch(() => {});
    this.rafId = requestAnimationFrame(renderFrame);
  }

  pause() {
    this.isRunning = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.videoEl) {
      try { this.videoEl.pause(); } catch (e) {}
    }
  }

  resume() {
    if (!this.isRunning) {
      this.isRunning = true;
      if (this.videoEl) {
        try { this.videoEl.play().catch(() => {}); } catch (e) {}
      }
      this._startLoop();
    }
  }

  destroy() {
    this.pause();
    super.destroy();
  }
}
