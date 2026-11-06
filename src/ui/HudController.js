/**
 * HARPIA Universe - HudController
 * Gestão da interface do utilizador, marcador tático no espaço e avisos (toasts).
 */
import { EV } from '../core/EventBus.js';
import { getGalaxySystem, getCurrentSystemId } from '../universe/GalaxyData.js';
import { playCinematicImpact } from '../core/audio.js';

export class HudController {
  /**
   * @param {import('../core/EventBus.js').EventBus} eventBus 
   * @param {import('../core/Camera2D.js').Camera2D} camera 
   */
  constructor(eventBus, camera) {
    this.bus = eventBus;
    this.camera = camera;

    this.markerEl = document.getElementById('ship-target-marker');
    this.toastEl = document.getElementById('game-toast');
    this.coordsEl = document.querySelector('.game-hud-coords');

    this.targetWorldX = null;
    this.targetWorldY = null;
    this.isTargetActive = false;
    this.toastTimeout = null;
    this.isDocked = false;

    this._bindEvents();
  }

  _bindEvents() {
    this.bus.on(EV.SHIP_TARGET_SET, ({ targetX, targetY }) => {
      this.targetWorldX = targetX;
      this.targetWorldY = targetY;
      this.isTargetActive = true;

      if (this.markerEl) {
        const screen = this.camera.worldToScreen(targetX, targetY);
        this.markerEl.style.left = screen.x + 'px';
        this.markerEl.style.top = screen.y + 'px';
        this.markerEl.classList.remove('active');
        void this.markerEl.offsetWidth; // Force reflow para reiniciar animação CSS
        this.markerEl.classList.add('active');
      }
    });

    this.bus.on(EV.SHIP_ARRIVED, () => {
      this.isTargetActive = false;
      if (this.markerEl) {
        this.markerEl.classList.remove('active');
      }
    });

    this.bus.on(EV.HUD_TOAST, ({ message, type = 'info', duration = 3000 }) => {
      this.showToast(message, type, duration);
    });

    // ── Eventos de Atracagem no Hangar da Estação ──
    const hangarOverlay = document.getElementById('station-hangar-overlay');

    this.bus.on(EV.STATION_DOCKING, () => {
      this.isTargetActive = false;
      if (this.markerEl) {
        this.markerEl.classList.remove('active');
      }
      playCinematicImpact(0.8);
    });

    this.bus.on(EV.STATION_DOCKED, () => {
      this.isDocked = true;
      if (hangarOverlay) {
        hangarOverlay.classList.add('active');
      }
      document.body.classList.add('station-docked');
      if (this.coordsEl) {
        this.coordsEl.style.display = 'none';
      }
    });

    this.bus.on(EV.STATION_UNDOCK, () => {
      this.isDocked = false;
      if (hangarOverlay) {
        hangarOverlay.classList.remove('active');
      }
      document.body.classList.remove('station-docked');
      if (this.coordsEl) {
        this.coordsEl.style.display = '';
      }
      playCinematicImpact(1.0);
    });

    this.bus.on('game:exit', () => {
      this.isDocked = false;
      document.body.classList.remove('station-docked');
      if (this.coordsEl) {
        this.coordsEl.style.display = '';
      }
    });

    // ── Botão Superior da HUD para Abrir Mapa Galáctico ──
    const galaxyBtn = document.getElementById('galaxy-map-hud-btn');
    if (galaxyBtn) {
      galaxyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.bus.emit('galaxy:toggle');
      });
    }

    this.bus.on(EV.GALAXY_MAP_OPEN, () => {
      this.isTargetActive = false;
      if (this.markerEl) {
        this.markerEl.classList.remove('active');
      }
    });
  }

  /**
   * Atualização do marcador tático acompanhando a câmara a cada frame
   */
  render() {
    if (this.isTargetActive && this.markerEl && this.targetWorldX !== null) {
      const screen = this.camera.worldToScreen(this.targetWorldX, this.targetWorldY);
      this.markerEl.style.left = screen.x + 'px';
      this.markerEl.style.top = screen.y + 'px';
    }

    if (this.coordsEl && !this.isDocked) {
      const wx = Math.round(this.camera.x);
      const wy = Math.round(this.camera.y);
      const currentSys = getGalaxySystem(getCurrentSystemId());
      const sysName = currentSys ? currentSys.name.toUpperCase() : 'HARPIA BASE';
      const secCode = currentSys ? currentSys.sectorCode : 'SEC-0014';
      this.coordsEl.textContent = `SECTOR ${secCode} • ${sysName} • X: ${wx} Y: ${wy}`;
    }
  }

  /**
   * Exibe notificação estilizada dentro do jogo
   */
  showToast(message, type = 'info', duration = 2800) {
    if (!this.toastEl) return;
    this.toastEl.textContent = message;
    this.toastEl.className = 'game-toast';
    // Forçar reflow para reiniciar a animação CSS caso já estivesse visível
    void this.toastEl.offsetWidth;
    this.toastEl.className = `game-toast visible ${type}`;

    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toastEl.classList.remove('visible');
    }, duration);
  }
}
