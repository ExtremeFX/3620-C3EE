/**
 * HARPIA Universe - ShipHangarPanel
 * Módulo de Apresentação das Naves da Doca (Box Inferior)
 * Desacoplado do State global; herda de UIComponent.
 */
import { UIComponent } from '../core/UIComponent.js';
import { getShipInfo } from '../../config/shipsRegistry.js';

export class ShipHangarPanel extends UIComponent {
  /**
   * @param {Object} options
   * @param {import('../../core/EventBus.js').EventBus} [options.eventBus]
   * @param {(shipId: string) => void} [options.onSwitchShip]
   */
  constructor({ eventBus = null, onSwitchShip = null } = {}) {
    super();
    this.bus = eventBus;
    this.onSwitchShip = onSwitchShip;

    // Cache de referências DOM
    this.fleetRowEl = null;
    this.currentShips = [];
    this.activeShipId = (() => {
      try {
        const s = localStorage.getItem('harpia_active_ship');
        return (s && s !== 'H-M1') ? s : 'H-M2';
      } catch(e) {
        return 'H-M2';
      }
    })();
  }

  /**
   * Constrói e anexa a geometria SVG e a carcaça DOM uma única vez
   * @param {HTMLElement} container
   */
  mount(container) {
    if (this.root) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'hangar-bottom-panel';
    wrapper.id = 'hangar-bottom-panel';

    wrapper.innerHTML = `
      <svg class="hangar-panel-svg" viewBox="0 0 680 165" preserveAspectRatio="none">
        <defs>
          <filter id="holo-glow-bottom" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <!-- Fundo Preto Semi-Transparente da Box -->
        <polygon class="hangar-panel-bg" points="
          25,0 655,0 680,25 680,140 655,165 25,165 0,140 0,25
        " fill="#000000" fill-opacity="0.85" style="fill: #000000 !important; fill-opacity: 0.85 !important;" />

        <!-- Borda Exterior Principal com Recortes Tech e Glow -->
        <polygon points="
          25,0 655,0 680,25 680,140 655,165 25,165 0,140 0,25
        " fill="none" stroke="#00d4ff" stroke-width="2.5" filter="url(#holo-glow-bottom)" />

        <!-- Detalhes e Brackets dos Cantos -->
        <path d="M14,6 L6,6 L6,14" stroke="#00f0ff" stroke-width="2" fill="none" />
        <path d="M666,6 L674,6 L674,14" stroke="#00f0ff" stroke-width="2" fill="none" />
        <path d="M6,151 L6,159 L14,159" stroke="#00f0ff" stroke-width="2" fill="none" />
        <path d="M674,151 L674,159 L666,159" stroke="#00f0ff" stroke-width="2" fill="none" />

        <!-- Linha Decorativa Central Superior -->
        <line x1="270" y1="0" x2="410" y2="0" stroke="#00f0ff" stroke-width="3.5" />
        <line x1="290" y1="5" x2="390" y2="5" stroke="#00d4ff" stroke-width="1.5" />

        <!-- Ranhuras de Ventilação Inferiores Esquerda e Direita -->
        <path d="M35,158 L43,150" stroke="#00d4ff" stroke-width="2.5" stroke-linecap="round" />
        <path d="M44,158 L52,150" stroke="#00d4ff" stroke-width="2.5" stroke-linecap="round" />
        <path d="M53,158 L61,150" stroke="#00d4ff" stroke-width="2.5" stroke-linecap="round" />

        <path d="M619,158 L627,150" stroke="#00d4ff" stroke-width="2.5" stroke-linecap="round" />
        <path d="M628,158 L636,150" stroke="#00d4ff" stroke-width="2.5" stroke-linecap="round" />
        <path d="M637,158 L645,150" stroke="#00d4ff" stroke-width="2.5" stroke-linecap="round" />
      </svg>

      <!-- Conteúdo e HUD Integrada na Box Inferior -->
      <div class="hangar-bottom-content">
        <div class="hangar-bottom-header">
          <span class="panel-tag">SHIP HANGAR</span>
          <span class="panel-status-dot"></span>
        </div>
        <div class="hangar-bottom-inner" id="hangar-bottom-slot">
          <div class="hangar-fleet-row"></div>
        </div>
      </div>
    `;

    container.appendChild(wrapper);
    this.root = wrapper;
    this.fleetRowEl = wrapper.querySelector('.hangar-fleet-row');

    this.render({ ships: this.currentShips });
  }

  _renderShipThumbnail(shipInfo, s = {}) {
    let imgSrc = shipInfo?.thumbnail || shipInfo?.imageSrc || shipInfo?.posterSrc;
    const sid = String(s.ship_id || shipInfo?.id || '').toUpperCase();
    if (sid.includes('HARPI') || sid.includes('T1')) {
      imgSrc = 'assets/ships/TRANSPORT SHIPS/HARPI-T1.png';
    } else if (sid === 'H-M2') {
      imgSrc = 'assets/ships/MINING SHIPS/H-M2.png';
    } else if (sid.includes('T-WS') || sid.includes('CARGI')) {
      imgSrc = 'assets/ships/TRANSPORT SHIPS/T-WS-Cargi.png';
    } else if (!imgSrc) {
      imgSrc = 'assets/ships/MINING SHIPS/H-M2.png';
    }
    return `
      <div class="fleet-ship-thumbnail">
        <img src="${imgSrc}" alt="${shipInfo?.name || sid || 'Ship'}" class="fleet-ship-img">
      </div>
    `;
  }

  /**
   * Atualiza os cards das naves sem recriar o SVG da box
   * @param {Object} [data]
   * @param {Array} [data.ships]
   */
  render(data = {}) {
    if (!this.root || !this.fleetRowEl) return;

    const ships = data.ships || this.currentShips || [];
    this.currentShips = ships;
    const activeShipId = data.activeShipId || this.activeShipId || 'H-M2';
    this.activeShipId = activeShipId;

    if (ships.length === 0) {
      const defaultShip = getShipInfo('H-M2');
      this.fleetRowEl.innerHTML = `
        <div class="hangar-fleet-card active-ship">
          ${this._renderShipThumbnail(defaultShip)}
          <div class="fleet-card-details">
            <span class="fleet-ship-name">${defaultShip.name}</span>
            <span class="fleet-ship-qty">ACTIVE SHIP</span>
          </div>
          <span class="fleet-active-badge">ACTIVE</span>
        </div>
      `;
      return;
    }

    this.fleetRowEl.innerHTML = ships.map((s) => {
      const shipInfo = getShipInfo(s.ship_id);
      const isActive = s.active || s.ship_id === activeShipId;
      return `
        <div class="hangar-fleet-card ${isActive ? 'active-ship' : ''}" data-ship-id="${s.ship_id}">
          ${this._renderShipThumbnail(shipInfo, s)}
          <div class="fleet-card-details">
            <span class="fleet-ship-name">${shipInfo.name || s.name || s.ship_id}</span>
            <span class="fleet-ship-qty">${isActive ? 'ACTIVE SHIP' : `AVAILABLE: ${s.quantity || 1}`}</span>
          </div>
          ${!isActive ? `<button type="button" class="fleet-switch-btn" data-switch="${s.ship_id}">EQUIP</button>` : '<span class="fleet-active-badge">ACTIVE</span>'}
        </div>
      `;
    }).join('');

    // Liga listeners nos botões de equipar
    this.fleetRowEl.querySelectorAll('.fleet-switch-btn').forEach((btn) => {
      const onBtnClick = (e) => {
        const targetId = e.currentTarget.getAttribute('data-switch');
        if (typeof this.onSwitchShip === 'function') {
          this.onSwitchShip(targetId);
        } else if (this.bus && targetId) {
          this.bus.emit('hangar:switch_ship', { shipId: targetId });
        }
      };
      btn.addEventListener('click', onBtnClick);
      this.addCleanup(() => btn.removeEventListener('click', onBtnClick));
    });
  }

  setActiveShip(shipId) {
    if (!shipId) return;
    this.activeShipId = shipId;
    this.render({ ships: this.currentShips, activeShipId: shipId });
  }

  showPanel() {
    if (this.root) {
      this.root.classList.remove('hidden');
      this.root.style.display = 'flex';
    }
  }

  hidePanel() {
    if (this.root) {
      this.root.classList.add('hidden');
      this.root.style.display = 'none';
    }
  }
}
