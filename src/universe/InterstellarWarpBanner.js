/**
 * HARPIA Universe - InterstellarWarpBanner
 * Banner modular do HUD que aparece quando o piloto traça uma rota de Warp Interestelar.
 * Mostra o destino, a distância estimada e um botão "ENGAGE WARP DRIVE" para disparar o warp da nave.
 * Desaparece automaticamente após o warp ser iniciado ou cancelado.
 */
import { UIComponent } from '../ui/core/UIComponent.js';
import { EV } from '../core/EventBus.js';
import { playSciFiBeep, playCinematicImpact } from '../core/audio.js';
import { setCurrentSystemId } from './GalaxyData.js';

export class InterstellarWarpBanner extends UIComponent {
  /**
   * @param {Object} options
   * @param {import('../core/EventBus.js').EventBus} options.eventBus
   * @param {import('../entities/ShipEntity.js').ShipEntity} options.ship
   */
  constructor({ eventBus, ship }) {
    super();
    this.bus = eventBus;
    this.ship = ship;

    this.activeRoute = null; // { system, worldCoords, distKm }
    this.targetSystem = null;
    this.nameEl = null;
    this.distEl = null;
  }

  mount(container) {
    if (this.root) return;

    const wrap = document.createElement('div');
    wrap.className = 'interstellar-warp-banner';
    wrap.id = 'interstellar-warp-banner';
    wrap.style.display = 'none';
    wrap.innerHTML = `
      <div class="warp-banner-info">
        <span class="warp-banner-icon">⌖</span>
        <div class="warp-banner-texts">
          <span class="warp-banner-title">ROTA DE WARP TRAÇADA • DESTINO:</span>
          <span class="warp-banner-target" id="warp-banner-target-name">—</span>
        </div>
      </div>
      <div class="warp-banner-info">
        <div class="warp-banner-texts">
          <span class="warp-banner-title">DISTÂNCIA ESTIMADA</span>
          <span class="warp-banner-target" id="warp-banner-dist" style="font-size:11px;">—</span>
        </div>
      </div>
      <div class="warp-banner-actions">
        <button type="button" class="btn-engage-interstellar-warp" id="btn-engage-interstellar-warp">
          ▶ ENGAGE WARP DRIVE
        </button>
        <button type="button" class="btn-cancel-interstellar-route" id="btn-cancel-interstellar-route" title="Cancelar Rota">✕</button>
      </div>
    `;

    container.appendChild(wrap);
    this.root = wrap;

    this.nameEl = wrap.querySelector('#warp-banner-target-name');
    this.distEl = wrap.querySelector('#warp-banner-dist');

    this._bindEvents();
  }

  _bindEvents() {
    // Ouvir a rota traçada pelo GalaxyStarmap
    const unsubRoute = this.bus.on('warp:set_interstellar_route', ({ system, worldCoords, distKm }) => {
      this.setRoute({ system, worldCoords, distKm });
    });
    this.addCleanup(unsubRoute);

    // Ocultar banner enquanto a nave está atracada
    const unsubDocked = this.bus.on(EV.STATION_DOCKED, () => {
      this.hide();
      this.activeRoute = null;
      this.targetSystem = null;
    });
    this.addCleanup(unsubDocked);

    // Ocultar banner quando o jogo termina
    const unsubExit = this.bus.on(EV.GAME_EXIT, () => {
      this.hide();
      this.activeRoute = null;
      this.targetSystem = null;
    });
    this.addCleanup(unsubExit);

    // Conclusão do salto de warp interestelar
    const unsubWarpDone = this.bus.on('ship:warp_completed', () => {
      if (this.targetSystem) {
        setCurrentSystemId(this.targetSystem.id);
        this.bus.emit('system:changed', { system: this.targetSystem });
        this.bus.emit(EV.HUD_TOAST, {
          message: `CHEGADA AO SISTEMA: ${this.targetSystem.name.toUpperCase()} (${this.targetSystem.securityLevel}-SEC ${this.targetSystem.security.toFixed(1)})`,
          type: 'success'
        });
        this.targetSystem = null;
      }
    });
    this.addCleanup(unsubWarpDone);

    if (!this.root) return;

    // Botão de engajar Warp Drive
    const btnEngage = this.root.querySelector('#btn-engage-interstellar-warp');
    if (btnEngage) {
      btnEngage.addEventListener('click', (e) => {
        e.stopPropagation();
        this._engageWarp();
      });
    }

    // Botão de cancelar rota
    const btnCancel = this.root.querySelector('#btn-cancel-interstellar-route');
    if (btnCancel) {
      btnCancel.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hide();
        this.activeRoute = null;
        this.targetSystem = null;
        this.bus.emit(EV.HUD_TOAST, { message: 'ROTA DE WARP CANCELADA', type: 'info' });
      });
    }
  }

  /**
   * Define e mostra uma nova rota interestelar no banner
   * @param {{system: Object, worldCoords: {x: number, y: number}, distKm: string}} route
   */
  setRoute({ system, worldCoords, distKm }) {
    this.activeRoute = { system, worldCoords, distKm };

    if (this.nameEl) this.nameEl.textContent = system.name.toUpperCase();
    if (this.distEl) this.distEl.textContent = `${distKm} km`;

    this.show();
  }

  show() {
    if (!this.root) return;
    this.root.style.display = 'flex';
  }

  hide() {
    if (!this.root) return;
    this.root.style.display = 'none';
  }

  /**
   * Dispara o Warp Drive da nave para as coordenadas mundiais do sistema destino
   */
  _engageWarp() {
    if (!this.activeRoute) return;

    const { system, worldCoords } = this.activeRoute;
    if (!this.ship) {
      this.bus.emit(EV.HUD_TOAST, { message: 'ERRO: Nave não disponível para warp', type: 'error' });
      return;
    }

    if (this.ship.isDocked || this.ship.isDocking) {
      this.bus.emit(EV.HUD_TOAST, { message: 'IMPOSSÍVEL WARPAR: Nave atracada na Estação', type: 'error' });
      return;
    }

    if (this.ship.warpState !== 'IDLE') {
      this.bus.emit(EV.HUD_TOAST, { message: 'WARP DRIVE JÁ ATIVO', type: 'info' });
      return;
    }

    playCinematicImpact(1.2);

    // Guardar o sistema alvo para atualizar o estado do universo quando a nave chegar
    this.targetSystem = system;

    // Acionar warp interestelar via método nativo da nave
    this.ship.warpTo(worldCoords.x, worldCoords.y, system.name);

    // Emitir evento para telemetria
    this.bus.emit(EV.GALAXY_JUMP_TO, { targetSystem: system });

    this.hide();
    this.activeRoute = null;
  }
}
