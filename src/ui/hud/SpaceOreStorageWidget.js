/**
 * HARPIA Universe - SpaceOreStorageWidget
 * Widget HUD exibido no espaco exterior (topo-centro)
 * Apresenta o ORE STORAGE da nave com capacidade de 30T.
 * Area inferior permanece vazia ate que o primeiro bloco seja minerado.
 * Ao minerar, exibe os quadrados de minerio (imagem + unidades no estilo Eve Online).
 */
import { UIComponent } from '../core/UIComponent.js';
import { EV } from '../../core/EventBus.js';
import { getItemInfo } from '../../config/itemsRegistry.js';

export class SpaceOreStorageWidget extends UIComponent {
  /**
   * @param {Object} options
   * @param {import('../../core/EventBus.js').EventBus} options.eventBus
   * @param {Object} [options.state]
   */
  constructor({ eventBus, state = null }) {
    super();
    this.bus = eventBus;
    this.state = state;

    this.capacityValEl = null;
    this.barFillEl = null;
    this.slotAreaEl = null;

    this.currentCargo = {
      ferrox: 0,
      crynex: 0,
      varelium: 0,
      capacity: 30
    };
  }

  mount(container) {
    if (this.root) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'space-ore-storage is-empty';
    wrapper.id = 'space-ore-storage';

    wrapper.innerHTML = `
      <div class="space-ore-header">
        <div class="space-ore-title">
          <span class="space-ore-dot"></span>
          <span class="space-ore-label">ORE STORAGE</span>
        </div>
        <div class="space-ore-cap-box">
          <span class="space-ore-cap-text" id="space-ore-cap-text">0 / 30 T</span>
        </div>
      </div>
      <div class="space-ore-bar-track">
        <div class="space-ore-bar-fill" id="space-ore-bar-fill" style="width: 0%;"></div>
      </div>
      <div class="space-ore-slot-area" id="space-ore-slot-area">
        <!-- Permanece vazio sem nada enquanto nao houver minerio minerado -->
      </div>
    `;

    container.appendChild(wrapper);
    this.root = wrapper;

    this.capacityValEl = wrapper.querySelector('#space-ore-cap-text');
    this.barFillEl = wrapper.querySelector('#space-ore-bar-fill');
    this.slotAreaEl = wrapper.querySelector('#space-ore-slot-area');

    this.bindEvents();

    if (this.state && this.state.shipCargo) {
      this.render(this.state.shipCargo);
    } else {
      this.render(this.currentCargo);
    }
  }

  bindEvents() {
    if (!this.bus) return;

    const unsubCargo = this.bus.on('ship:cargo_updated', (cargo) => {
      this.render(cargo);
    });
    this.addCleanup(unsubCargo);

    const unsubDocking = this.bus.on(EV.STATION_DOCKING, () => this.hide());
    const unsubDocked = this.bus.on(EV.STATION_DOCKED, () => this.hide());
    this.addCleanup(unsubDocking);
    this.addCleanup(unsubDocked);

    const unsubUndock = this.bus.on(EV.STATION_UNDOCK, () => this.show());
    this.addCleanup(unsubUndock);

    const unsubStart = this.bus.on(EV.GAME_START, () => this.show());
    const unsubExit = this.bus.on(EV.GAME_EXIT, () => this.hide());
    this.addCleanup(unsubStart);
    this.addCleanup(unsubExit);
  }

  render(cargo = {}) {
    if (!this.root) return;

    this.currentCargo = { ...this.currentCargo, ...cargo };
    const { ferrox = 0, crynex = 0, varelium = 0, capacity = 30 } = this.currentCargo;

    const total = Number(ferrox) + Number(crynex) + Number(varelium);
    const maxCap = Math.max(1, Number(capacity));
    const percentage = Math.min(100, Math.round((total / maxCap) * 100));

    if (this.capacityValEl) {
      this.capacityValEl.textContent = `${total} / ${maxCap} T`;
    }

    if (this.barFillEl) {
      this.barFillEl.style.width = `${percentage}%`;
      if (percentage >= 100) {
        this.barFillEl.classList.add('full');
      } else {
        this.barFillEl.classList.remove('full');
      }
    }

    if (this.slotAreaEl) {
      const ores = [
        { id: 'ferrox', amount: Number(ferrox) },
        { id: 'crynex', amount: Number(crynex) },
        { id: 'varelium', amount: Number(varelium) }
      ];

      // Filtra apenas minerios com quantidade > 0 minerados
      const activeOres = ores.filter(ore => ore.amount > 0);

      if (activeOres.length === 0) {
        // Espaco sem nada enquanto a nave nao minerar o primeiro bloco
        this.slotAreaEl.innerHTML = '';
        this.root.classList.add('is-empty');
      } else {
        this.root.classList.remove('is-empty');
        this.slotAreaEl.innerHTML = activeOres.map(ore => {
          const meta = getItemInfo(ore.id);
          const imageContent = meta.imageSrc
            ? `<img src="${meta.imageSrc}" alt="${meta.name}" class="storage-slot-img">`
            : `<div class="storage-slot-placeholder-icon" style="color: ${meta.color};">💠</div>`;

          return `
            <div class="space-ore-card">
              <div class="storage-item-square space-item-square" style="--item-glow: ${meta.glowColor};">
                ${imageContent}
                <span class="storage-slot-type-badge">${meta.name.substring(0, 3)}</span>
                <span class="space-item-units-badge">${ore.amount}</span>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  }

  show() {
    if (this.root) {
      this.root.classList.remove('hidden');
    }
  }

  hide() {
    if (this.root) {
      this.root.classList.add('hidden');
    }
  }
}
