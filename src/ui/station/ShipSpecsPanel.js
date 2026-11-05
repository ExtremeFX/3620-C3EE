/**
 * HARPIA Universe - ShipSpecsPanel
 * Painel de especificacoes tecnicas simples — Assembly Mode
 */
import { UIComponent } from '../core/UIComponent.js';
import { getShipInfo } from '../../config/shipsRegistry.js';

const SHIP_SPECS = {
  'H-M2': [
    'Ship Class:  Heavy Mining Ship',
    'Model:  H-M2 Heavy Miner',
    'Ore Hold:  200 T  (Ore & Minerals)',
    'Mining Lasers:  Dual High-Yield Lasers',
    'Thruster Config:  Dual Plasma Thrusters',
    'Laser Cycle:  2 a 30s / Unit',
    'Mining Range:  2000 m',
    'Max Velocity:  400.0 u/s',
    'Cruise Velocity:  110.0 u/s',
    'Turn Rate:  6.0 rad/s',
    'Hull Span:  150 m',
    'Docking Sequence:  2.0 s',
    'Drone Bay:  5 Mining Drones'
  ],
  'H-7M': [
    'Ship Class:  Mining Ship',
    'Model:  H-7M Light Miner',
    'Ore Hold:  70 T  (Ore & Minerals)',
    'Mining Lasers:  Single Pulse Laser',
    'Laser Cycle:  210 s / Unit',
    'Mining Range:  450 m',
    'Max Velocity:  360.0 u/s',
    'Cruise Velocity:  130.0 u/s',
    'Turn Rate:  9.5 rad/s',
    'Hull Span:  75 m',
    'Docking Sequence:  1.4 s'
  ],
  'T-WS-Cargi': [
    'Ship Class:  Transport Ship',
    'Model:  T-WS-Cargi Freighter',
    'Cargo Hold:  500 T  (Heavy Bulk)',
    'Mining Equipment:  None (Freighter)',
    'Max Velocity:  210.0 u/s',
    'Cruise Velocity:  85.0 u/s',
    'Turn Rate:  4.0 rad/s',
    'Hull Span:  180 m',
    'Docking Sequence:  2.5 s'
  ],
  'HARPI-T1': [
    'Ship Class:  Transport Ship',
    'Model:  HARPI-T1 Heavy Transport',
    'Cargo Hold:  1000 T  (Heavy Bulk Freight)',
    'Mining Equipment:  None (Cargo Transport)',
    'Thruster Config:  Quad Plasma Engine Cluster',
    'Max Velocity:  260.0 u/s',
    'Cruise Velocity:  95.0 u/s',
    'Turn Rate:  3.5 rad/s',
    'Hull Span:  160 m',
    'Docking Sequence:  2.2 s',
    'Drone Bay:  0 Units'
  ]
};

export class ShipSpecsPanel extends UIComponent {
  constructor({ eventBus = null } = {}) {
    super();
    this.bus = eventBus;
    this.activeShipId = (() => {
      try {
        const s = localStorage.getItem('harpia_active_ship');
        return (s && s !== 'H-M1') ? s : 'H-M2';
      } catch(e) {
        return 'H-M2';
      }
    })();
  }

  mount(container) {
    if (this.root) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'hangar-side-panel hangar-panel-left ship-specs-panel collapsed';
    wrapper.id = 'ship-specs-panel';

    wrapper.innerHTML = `
      <svg class="hangar-panel-svg" viewBox="0 0 380 620" preserveAspectRatio="none">
        <defs>
          <filter id="holo-glow-specs" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <polygon class="hangar-panel-bg" points="32,12 245,12 262,22 325,22 365,58 365,568 348,585 348,605 320,605 306,612 65,612 32,580 16,580 16,58" fill="#000000" fill-opacity="0.88" style="fill:#000000 !important;fill-opacity:0.88 !important;" />
        <polygon points="32,12 245,12 262,22 325,22 365,58 365,568 348,585 348,605 320,605 306,612 65,612 32,580 16,580 16,58" fill="none" stroke="#00d4ff" stroke-width="2.5" filter="url(#holo-glow-specs)" />
        <path d="M250,7 L290,7 L290,15" fill="none" stroke="#00f0ff" stroke-width="2" />
        <path d="M294,7 L334,7 L334,17" fill="none" stroke="#00f0ff" stroke-width="1.5" />
        <line x1="340" y1="15" x2="352" y2="15" stroke="#00f0ff" stroke-width="2" />
        <path d="M285,598 L298,585" stroke="#00d4ff" stroke-width="3" stroke-linecap="round" />
        <path d="M296,598 L309,585" stroke="#00d4ff" stroke-width="3" stroke-linecap="round" />
        <path d="M307,598 L320,585" stroke="#00d4ff" stroke-width="3" stroke-linecap="round" />
        <path d="M318,598 L331,585" stroke="#00d4ff" stroke-width="3" stroke-linecap="round" />
        <path d="M329,598 L342,585" stroke="#00d4ff" stroke-width="3" stroke-linecap="round" />
        <path d="M280,601 L344,601" stroke="#00d4ff" stroke-width="2" />
      </svg>

      <div class="hangar-panel-content">
        <div class="hangar-panel-header">
          <span class="panel-tag">ASSEMBLY // SHIP SPECS</span>
          <span class="panel-status-dot"></span>
        </div>
        <div class="ship-specs-inner">
          <div class="specs-ship-thumb">
            <img class="specs-ship-img" id="specs-ship-img" src="assets/ships/MINING SHIPS/H-M2.png" alt="H-M2" />
            <span class="specs-ship-model" id="specs-ship-model">H-M2</span>
          </div>
          <ul class="specs-list" id="specs-list"></ul>
        </div>
      </div>
    `;

    container.appendChild(wrapper);
    this.root = wrapper;
    this.render(this.activeShipId);
  }

  render(shipId = 'H-M2') {
    if (!this.root) return;
    this.activeShipId = shipId;

    const shipInfo = getShipInfo(shipId);
    const lines = SHIP_SPECS[shipId] || SHIP_SPECS['H-M2'];

    const imgEl = this.root.querySelector('#specs-ship-img');
    const modelEl = this.root.querySelector('#specs-ship-model');
    const listEl = this.root.querySelector('#specs-list');

    if (imgEl && shipInfo.thumbnail) {
      imgEl.src = shipInfo.thumbnail;
      imgEl.alt = shipId;
    }
    if (modelEl) modelEl.textContent = shipId;
    if (listEl) {
      listEl.innerHTML = lines.map(line => `<li class="specs-line">${line}</li>`).join('');
    }
  }

  showPanel() {
    if (this.root) this.root.classList.remove('collapsed');
  }

  hidePanel() {
    if (this.root) this.root.classList.add('collapsed');
  }

  destroy() {
    super.destroy();
    this.hidePanel();
    if (this.root && this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
      this.root = null;
    }
  }
}
