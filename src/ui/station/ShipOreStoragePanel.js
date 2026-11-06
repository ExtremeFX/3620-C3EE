/**
 * HARPIA Universe - ShipOreStoragePanel
 * Módulo Integrado de Armazenamento e Equipamento da Nave (Box Esquerda)
 * Contém duas seções dedicadas:
 * 1. SHIP ORE STORAGE (Minérios / Carga da Nave)
 * 2. GROK DRONES HANGAR (Drones de mineração equipados na baía da nave)
 * Desacoplado do State global; herda de UIComponent.
 * Suporta Drag & Drop no estilo EVE Online com a STORAGE STATION.
 */
import { UIComponent } from '../core/UIComponent.js';
import { getItemInfo } from '../../config/itemsRegistry.js';
import { getShipInfo } from '../../config/shipsRegistry.js';
import { playSciFiBeep } from '../../core/audio.js';

export class ShipOreStoragePanel extends UIComponent {
  /**
   * @param {Object} options
   * @param {import('../../core/EventBus.js').EventBus} [options.eventBus]
   * @param {(cargo: Object) => void} [options.onTransfer]
   * @param {(data: {itemId: string, amount: number, source: string}) => void} [options.onDropItem]
   * @param {(data: {itemId: string, amount: number, source: string}) => void} [options.onDropDrone]
   * @param {() => void} [options.onUnloadAllDrones]
   */
  constructor({
    eventBus = null,
    onTransfer = null,
    onDropItem = null,
    onDropDrone = null,
    onUnloadAllDrones = null
  } = {}) {
    super();
    this.bus = eventBus;
    this.onTransfer = onTransfer;
    this.onDropItem = onDropItem;
    this.onDropDrone = onDropDrone;
    this.onUnloadAllDrones = onUnloadAllDrones;

    // Estado local
    this.currentData = { ferrox: 0, crynex: 0, varelium: 0, capacity: 200 };
    this.currentDrones = { mining_drone: 0 };
    this.activeShipId = 'H-M2';

    // Nós DOM - Minérios
    this.capacityValEl = null;
    this.progressFillEl = null;
    this.itemsGridEl = null;
    this.dropZoneEl = null;
    this.transferBtn = null;
    this.btnStackAll = null;

    // Nós DOM - Drones
    this.dronesCapValEl = null;
    this.dronesCapFillEl = null;
    this.dronesGridEl = null;
    this.dronesDropZoneEl = null;
    this.dronesUnloadBtn = null;
    this.btnStackDrones = null;

    // Context Menus
    this.contextMenuEl = null;
    this.ctxTitleEl = null;
    this.ctxStackBtn = null;
    this.ctxTransferBtn = null;
    this._activeContextItemId = null;
    this._activeContextItemAmount = 0;

    this.dronesContextMenuEl = null;
    this.dronesCtxTitleEl = null;
    this.dronesCtxUnloadOneBtn = null;
    this.dronesCtxUnloadAllBtn = null;
    this._activeContextDroneId = null;
    this._activeContextDroneAmount = 0;
  }

  /**
   * Constrói e anexa a geometria SVG e as duas seções integradas
   * @param {HTMLElement} container
   */
  mount(container) {
    if (this.root) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'hangar-side-panel hangar-panel-left';
    wrapper.id = 'hangar-left-panel';

    wrapper.innerHTML = `
      <svg class="hangar-panel-svg" viewBox="0 0 380 620" preserveAspectRatio="none">
        <defs>
          <filter id="holo-glow-left" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <!-- Fundo Preto Semi-Transparente da Box -->
        <polygon class="hangar-panel-bg" points="
          32,12 245,12 262,22 325,22 365,58 365,568 348,585 348,605 320,605 306,612 65,612 32,580 16,580 16,58
        " fill="#000000" fill-opacity="0.85" style="fill: #000000 !important; fill-opacity: 0.85 !important;" />

        <!-- Borda Exterior Principal com Recortes Tech e Glow -->
        <polygon points="
          32,12 245,12 262,22 325,22 365,58 365,568 348,585 348,605 320,605 306,612 65,612 32,580 16,580 16,58
        " fill="none" stroke="#00d4ff" stroke-width="2.5" filter="url(#holo-glow-left)" />

        <!-- Detalhes do Canto Superior (Recortes Mecânicos) -->
        <path d="M250,7 L290,7 L290,15" fill="none" stroke="#00f0ff" stroke-width="2" />
        <path d="M294,7 L334,7 L334,17" fill="none" stroke="#00f0ff" stroke-width="1.5" />
        <line x1="340" y1="15" x2="352" y2="15" stroke="#00f0ff" stroke-width="2" />

        <!-- Canto Inferior: Ranhuras de Ventilação Tática -->
        <path d="M285,598 L298,585" stroke="#00d4ff" stroke-width="3" stroke-linecap="round" />
        <path d="M296,598 L309,585" stroke="#00d4ff" stroke-width="3" stroke-linecap="round" />
        <path d="M307,598 L320,585" stroke="#00d4ff" stroke-width="3" stroke-linecap="round" />
        <path d="M318,598 L331,585" stroke="#00d4ff" stroke-width="3" stroke-linecap="round" />
        <path d="M329,598 L342,585" stroke="#00d4ff" stroke-width="3" stroke-linecap="round" />
        <path d="M280,601 L344,601" stroke="#00d4ff" stroke-width="2" />
      </svg>

      <!-- Conteúdo Duplo Integrado na Box Esquerda -->
      <div class="hangar-panel-content ship-dual-storage-content">
        <!-- SEÇÃO 1: SHIP ORE STORAGE -->
        <div class="ship-storage-section ship-ore-section">
          <div class="hangar-panel-header">
            <span class="panel-tag">SHIP ORE STORAGE</span>
            <div class="panel-header-right">
              <button type="button" class="btn-stack-all" id="btn-stack-ship" title="Stack all identical items (EVE Online)">
                <span class="stack-icon">☷</span> STACK ALL
              </button>
              <span class="panel-status-dot"></span>
            </div>
          </div>

          <div class="storage-cargo-meta">
            <span class="storage-meta-label">CARGO CAPACITY</span>
            <span class="storage-meta-value ship-cap-val">0 / 200 T</span>
          </div>
          <div class="storage-progress-track">
            <div class="storage-progress-fill ship-cap-fill" style="width: 0%"></div>
          </div>

          <!-- Drop Zone Ore -->
          <div class="storage-drop-zone ship-ore-dropzone" id="ship-drop-zone">
            <div class="drop-zone-crosshairs">
              <span class="crosshair tl"></span><span class="crosshair tr"></span>
              <span class="crosshair bl"></span><span class="crosshair br"></span>
            </div>
            <div class="drop-zone-indicator">
              <span class="drop-zone-icon">⤓</span>
              <span class="drop-zone-text">DROP ORES HERE TO LOAD SHIP</span>
            </div>

            <!-- Grelha de Minérios da Nave -->
            <div class="storage-items-grid ship-items-grid" id="ship-ore-grid"></div>
          </div>

          <div class="ship-section-actions">
            <button type="button" class="panel-action-btn transfer-to-station-btn" id="btn-transfer-all-ship" disabled>
              TRANSFER TO BASE
            </button>
          </div>
        </div>

        <!-- DIVISÓRIA CIBERNÉTICA -->
        <div class="hangar-section-divider"></div>

        <!-- SEÇÃO 2: GROK DRONES HANGAR -->
        <div class="ship-storage-section ship-drones-section">
          <div class="hangar-panel-header hangar-sub-header">
            <div class="drones-header-title">
              <span class="drones-tag-icon">🛸</span>
              <span class="panel-tag">GROK DRONES HANGAR</span>
            </div>
            <div class="panel-header-right">
              <button type="button" class="btn-stack-all" id="btn-stack-drones" title="Stack all identical drones">
                <span class="stack-icon">☷</span> STACK ALL
              </button>
            </div>
          </div>

          <div class="storage-cargo-meta">
            <span class="storage-meta-label">DRONE BAY CAPACITY</span>
            <span class="storage-meta-value drones-cap-val">0 / 0 DRONES</span>
          </div>
          <div class="storage-progress-track">
            <div class="storage-progress-fill drones-cap-fill" style="width: 0%"></div>
          </div>

          <!-- Drop Zone Drones -->
          <div class="storage-drop-zone ship-drones-dropzone" id="drones-panel-dropzone">
            <div class="drop-zone-crosshairs">
              <span class="crosshair tl"></span><span class="crosshair tr"></span>
              <span class="crosshair bl"></span><span class="crosshair br"></span>
            </div>
            <div class="drop-zone-indicator">
              <span class="drop-zone-icon">🛸</span>
              <span class="drop-zone-text">DROP DRONES HERE TO EQUIP</span>
            </div>

            <!-- Grelha de Drones da Nave -->
            <div class="drones-items-container" id="drones-items-container"></div>
          </div>

          <div class="ship-section-actions">
            <button type="button" class="drones-unload-btn panel-action-btn" id="btn-unload-drones" disabled>
              UNLOAD TO STATION
            </button>
          </div>
        </div>
      </div>
    `;

    container.appendChild(wrapper);
    this.root = wrapper;

    // Cache nós de minérios
    this.capacityValEl = wrapper.querySelector('.ship-cap-val');
    this.progressFillEl = wrapper.querySelector('.ship-cap-fill');
    this.itemsGridEl = wrapper.querySelector('#ship-ore-grid');
    this.dropZoneEl = wrapper.querySelector('#ship-drop-zone');
    this.transferBtn = wrapper.querySelector('#btn-transfer-all-ship');
    this.btnStackAll = wrapper.querySelector('#btn-stack-ship');

    // Cache nós de drones
    this.dronesCapValEl = wrapper.querySelector('.drones-cap-val');
    this.dronesCapFillEl = wrapper.querySelector('.drones-cap-fill');
    this.dronesGridEl = wrapper.querySelector('#drones-items-container');
    this.dronesDropZoneEl = wrapper.querySelector('#drones-panel-dropzone');
    this.dronesUnloadBtn = wrapper.querySelector('#btn-unload-drones');
    this.btnStackDrones = wrapper.querySelector('#btn-stack-drones');

    if (this.btnStackAll) {
      this.btnStackAll.addEventListener('click', () => this.stackAllOres());
    }

    if (this.btnStackDrones) {
      this.btnStackDrones.addEventListener('click', () => this.stackAllDrones());
    }

    this.bindEvents();
    this.render({ cargo: this.currentData, drones: this.currentDrones, activeShipId: this.activeShipId });
  }

  /**
   * Consolida minérios
   */
  stackAllOres() {
    playSciFiBeep(980, 0.12, 'triangle', 0.2);
    this.renderCargo(this.currentData);
    if (this.bus) {
      this.bus.emit('hud:toast', {
        message: 'CARGO CONSOLIDATED • All identical items stacked',
        type: 'info'
      });
    }
  }

  /**
   * Consolida drones
   */
  stackAllDrones() {
    playSciFiBeep(1350, 0.1, 'sine', 0.2);
    this.renderDrones(this.currentDrones, this.activeShipId);
    if (this.bus) {
      this.bus.emit('hud:toast', {
        message: 'DRONES STACKED • All bay drone units consolidated',
        type: 'info'
      });
    }
  }

  /**
   * Extrai apenas minérios e itens válidos no porão da nave
   */
  _extractItems(data) {
    const items = [];
    let total = 0;
    const ignoredKeys = new Set(['capacity', 'max_storage', 'id', 'pilot_id', 'created_at', 'in_mission', 'location', 'quantity', 'drones', 'mining_drone']);

    for (const [key, val] of Object.entries(data)) {
      if (ignoredKeys.has(key.toLowerCase())) continue;

      const meta = getItemInfo(key);
      if (meta && (meta.type === 'ship' || meta.type === 'drone')) continue;
      if (key.toLowerCase().startsWith('h_') || key.toLowerCase().startsWith('h-') || key.toLowerCase() === 'core_v2') continue;

      const amount = Number(val) || 0;
      if (amount > 0) {
        total += amount;
        items.push({ id: key, amount });
      }
    }
    return { items, total };
  }

  /**
   * Atualização principal (suporta chamada completa ou parcial)
   */
  render(options = {}) {
    if (!this.root) return;

    if (options.activeShipId) {
      this.activeShipId = options.activeShipId;
    }
    if (options.cargo) {
      this.renderCargo(options.cargo);
    } else if (options.ferrox !== undefined || options.crynex !== undefined || options.varelium !== undefined) {
      this.renderCargo(options);
    }
    if (options.drones) {
      this.renderDrones(options.drones, this.activeShipId);
    }
  }

  /**
   * Renderiza a seção de Minérios
   */
  renderCargo(cargo = {}) {
    if (!this.root) return;
    this.currentData = { ...this.currentData, ...cargo };

    const shipInfo = getShipInfo(this.activeShipId);
    const capacity = (shipInfo && typeof shipInfo.capacity === 'number') ? shipInfo.capacity : (this.currentData.capacity || 200);
    const { items, total } = this._extractItems(this.currentData);
    const percentage = Math.min(100, Math.round((total / Math.max(1, capacity)) * 100));

    if (this.capacityValEl) this.capacityValEl.textContent = `${total.toLocaleString()} / ${capacity.toLocaleString()} T`;
    if (this.progressFillEl) this.progressFillEl.style.width = `${percentage}%`;
    if (this.transferBtn) this.transferBtn.disabled = total === 0;

    this._renderOreGrid(items);
  }

  /**
   * Renderiza a seção de Drones
   */
  renderDrones(drones = null, activeShipId = null) {
    if (!this.root) return;
    if (drones) this.currentDrones = { ...drones };
    if (activeShipId) this.activeShipId = activeShipId;

    const shipInfo = getShipInfo(this.activeShipId);
    const droneCapacity = (shipInfo && typeof shipInfo.droneCapacity === 'number') ? shipInfo.droneCapacity : 0;

    let totalDrones = 0;
    const droneList = [];
    for (const [id, count] of Object.entries(this.currentDrones)) {
      const num = Number(count) || 0;
      if (num > 0) {
        totalDrones += num;
        droneList.push({ id, amount: num });
      }
    }

    // Atualiza Barra e HUD de Capacidade de Drones
    if (droneCapacity <= 0) {
      if (this.dronesCapValEl) {
        this.dronesCapValEl.textContent = '0 / 0 (NO BAY)';
        this.dronesCapValEl.style.color = 'rgba(255, 180, 0, 0.9)';
      }
      if (this.dronesCapFillEl) {
        this.dronesCapFillEl.style.width = '0%';
        this.dronesCapFillEl.style.background = 'rgba(255, 180, 0, 0.5)';
      }
    } else {
      const pct = Math.min(100, (totalDrones / droneCapacity) * 100);
      if (this.dronesCapValEl) {
        this.dronesCapValEl.textContent = `${totalDrones} / ${droneCapacity} DRONES`;
        this.dronesCapValEl.style.color = '#00f0ff';
      }
      if (this.dronesCapFillEl) {
        this.dronesCapFillEl.style.width = `${pct}%`;
        this.dronesCapFillEl.style.background = 'linear-gradient(90deg, #00d4ff 0%, #00ffaa 100%)';
      }
    }

    if (this.dronesUnloadBtn) {
      this.dronesUnloadBtn.disabled = totalDrones === 0;
    }

    this._renderDronesGrid(droneList, droneCapacity, shipInfo);
  }

  /**
   * Renderiza a grelha de minérios
   */
  _renderOreGrid(items = []) {
    if (!this.itemsGridEl) return;

    if (items.length === 0) {
      this.itemsGridEl.innerHTML = `
        <div class="storage-empty-state">
          <div class="storage-empty-icon">⚯</div>
          <div class="storage-empty-title">CARGO HOLD EMPTY</div>
          <div class="storage-empty-hint">Mine asteroids or transfer items to load</div>
        </div>
      `;
      return;
    }

    let html = '';
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const meta = getItemInfo(item.id);
      const imageContent = meta.imageSrc
        ? `<img src="${meta.imageSrc}" alt="${meta.name}" class="storage-slot-img">`
        : `<div class="storage-slot-placeholder-icon" style="color: ${meta.color};">✦</div>`;

      html += `
        <div class="storage-item-card" draggable="true" data-item-id="${meta.id}" data-item-amount="${item.amount}" title="${meta.name} • ${item.amount.toLocaleString()} Units\nRight-click for options • Drag to move or stack">
          <div class="storage-item-square" style="--item-glow: ${meta.glowColor};">
            ${imageContent}
            <span class="storage-slot-type-badge">${meta.name.substring(0, 3)}</span>
            <span class="storage-stack-qty">${item.amount.toLocaleString()}</span>
          </div>
          <div class="storage-item-footer">
            <span class="storage-item-name">${meta.name}</span>
            <span class="storage-item-units">${item.amount.toLocaleString()} Units</span>
          </div>
        </div>
      `;
    }

    this.itemsGridEl.innerHTML = html;
    this._attachOreDragHandlers();
    this._attachOreSlotDropHandlers();
    this._attachOreContextMenuHandlers();
  }

  /**
   * Renderiza a grelha de drones
   */
  _renderDronesGrid(items, droneCapacity, shipInfo) {
    if (!this.dronesGridEl) return;

    if (droneCapacity <= 0) {
      this.dronesGridEl.innerHTML = `
        <div class="drones-empty-state no-bay">
          <div class="drones-empty-icon warning-pulse">⚠️</div>
          <div class="drones-empty-title">NO DRONE BAY</div>
          <div class="drones-empty-hint">Vessel ${shipInfo?.name || this.activeShipId} has 0 drone capacity.<br>Equip <strong>H-M2</strong> in Ship Hangar to operate drones.</div>
        </div>
      `;
      return;
    }

    if (items.length === 0) {
      this.dronesGridEl.innerHTML = `
        <div class="drones-empty-state">
          <div class="drones-empty-icon">🛸</div>
          <div class="drones-empty-title">DRONE BAY EMPTY</div>
          <div class="drones-empty-hint">Drag drones from <strong>Storage Station</strong> to equip into bay</div>
        </div>
      `;
      return;
    }

    let html = '';
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const meta = getItemInfo(item.id);
      const imageContent = meta.imageSrc
        ? `<img src="${meta.imageSrc}" alt="${meta.name}" class="storage-slot-img">`
        : `<div class="storage-slot-placeholder-icon" style="color: ${meta.color || '#00d4ff'};">🛸</div>`;

      html += `
        <div class="drone-item-card storage-item-card" draggable="true" data-drone-id="${meta.id}" data-item-amount="${item.amount}" title="${meta.name} • ${item.amount} in Bay\n20s Mining Cycle • Single White-Blue Laser\nDrag to Storage Station to unload • Right-click for options">
          <div class="storage-item-square drone-square" style="--item-glow: ${meta.glowColor || 'rgba(0, 212, 255, 0.5)'};">
            ${imageContent}
            <span class="storage-slot-type-badge">GROK</span>
            <span class="storage-stack-qty">${item.amount}</span>
          </div>
          <div class="storage-item-footer">
            <span class="storage-item-name">${meta.name}</span>
            <span class="storage-item-units">${item.amount} in Bay • 20s Cycle</span>
          </div>
        </div>
      `;
    }

    this.dronesGridEl.innerHTML = html;
    this._attachDroneDragHandlers();
    this._attachDroneContextMenuHandlers();
  }

  /**
   * Drag handlers para Minérios da Nave
   */
  _attachOreDragHandlers() {
    const cards = this.itemsGridEl.querySelectorAll('.storage-item-card[draggable="true"]');
    cards.forEach((card) => {
      card.addEventListener('dragstart', (e) => {
        const itemId = card.dataset.itemId;
        const amount = parseInt(card.dataset.itemAmount, 10) || 0;

        card.classList.add('is-dragging');

        const payload = JSON.stringify({
          source: 'ship_storage',
          itemId,
          amount,
          shiftKey: !!e.shiftKey
        });

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', payload);
        e.dataTransfer.setData('application/json', payload);

        if (this.bus) {
          this.bus.emit('inventory:drag_start', { source: 'ship_storage', itemId, amount });
        }
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('is-dragging');
        if (this.bus) {
          this.bus.emit('inventory:drag_end');
        }
      });
    });
  }

  /**
   * Drag handlers para Drones da Nave
   */
  _attachDroneDragHandlers() {
    const cards = this.dronesGridEl.querySelectorAll('.drone-item-card[draggable="true"]');
    cards.forEach((card) => {
      card.addEventListener('dragstart', (e) => {
        const itemId = card.dataset.droneId;
        const amount = parseInt(card.dataset.itemAmount, 10) || 0;

        card.classList.add('is-dragging');

        const payload = JSON.stringify({
          source: 'drones_hangar',
          itemId,
          amount,
          shiftKey: !!e.shiftKey
        });

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', payload);
        e.dataTransfer.setData('application/json', payload);

        if (this.bus) {
          this.bus.emit('inventory:drag_start', { source: 'drones_hangar', itemId, amount });
        }
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('is-dragging');
        if (this.bus) {
          this.bus.emit('inventory:drag_end');
        }
      });
    });
  }

  /**
   * Drop direto em slots de minérios
   */
  _attachOreSlotDropHandlers() {
    const allSlots = this.itemsGridEl.querySelectorAll('.storage-item-card');
    allSlots.forEach((slot) => {
      const targetItemId = slot.dataset.itemId || null;

      slot.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';

        if (targetItemId) {
          slot.classList.add('stack-target-hover');
        } else {
          slot.classList.add('drag-target-hover');
        }
      });

      slot.addEventListener('dragleave', () => {
        slot.classList.remove('stack-target-hover');
        slot.classList.remove('drag-target-hover');
      });

      slot.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        slot.classList.remove('stack-target-hover');
        slot.classList.remove('drag-target-hover');

        try {
          const rawData = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
          if (!rawData) return;
          const payload = JSON.parse(rawData);

          if (!payload || !payload.itemId) return;

          if (payload.source === 'station_storage') {
            const itemInfo = getItemInfo(payload.itemId);
            if (payload.itemId === 'mining_drone' || (itemInfo && itemInfo.type === 'drone')) {
              playSciFiBeep(220, 0.15, 'sawtooth', 0.25);
              if (this.bus) {
                this.bus.emit('hud:toast', {
                  message: 'ORE STORAGE ONLY • Drones must be equipped in GROK DRONES HANGAR below.',
                  type: 'warning'
                });
              }
              return;
            }

            const isShift = !!payload.shiftKey || !!e.shiftKey;
            if (isShift && payload.amount > 1 && this.bus) {
              this.bus.emit('inventory:split_stack_request', {
                itemId: payload.itemId,
                maxAmount: payload.amount,
                source: 'station_storage',
                target: 'ship_storage'
              });
            } else if (typeof this.onDropItem === 'function') {
              this.onDropItem(payload);
            } else if (this.bus) {
              this.bus.emit('inventory:transfer_to_ship', payload);
            }
            playSciFiBeep(1080, 0.12, 'triangle', 0.25);
          } else if (payload.source === 'ship_storage') {
            if (targetItemId === payload.itemId) {
              playSciFiBeep(1150, 0.12, 'triangle', 0.25);
              if (this.bus) {
                this.bus.emit('hud:toast', {
                  message: `STACK MERGED • ${payload.itemId.toUpperCase()} consolidated`,
                  type: 'info'
                });
              }
            }
          }
        } catch (err) {
          console.warn('[ShipOreStoragePanel] Ore slot drop error:', err);
        }
      });
    });
  }

  /**
   * Conecta eventos principais dos botões e zonas de Drop
   */
  bindEvents() {
    // 1. Botão Transferir Minérios para a Base
    if (this.transferBtn) {
      const onTransferClick = () => {
        const { total } = this._extractItems(this.currentData);
        if (total === 0) return;
        if (typeof this.onTransfer === 'function') {
          this.onTransfer({ ...this.currentData });
        } else if (this.bus) {
          this.bus.emit('inventory:transfer_all_to_station');
        }
      };
      this.transferBtn.addEventListener('click', onTransferClick);
      this.addCleanup(() => this.transferBtn && this.transferBtn.removeEventListener('click', onTransferClick));
    }

    // 2. Botão Descarregar Drones para a Base
    if (this.dronesUnloadBtn) {
      const onUnloadClick = () => {
        playSciFiBeep(880, 0.12, 'sine', 0.25);
        if (typeof this.onUnloadAllDrones === 'function') {
          this.onUnloadAllDrones();
        } else if (this.bus) {
          this.bus.emit('drones:unload_all');
        }
      };
      this.dronesUnloadBtn.addEventListener('click', onUnloadClick);
      this.addCleanup(() => this.dronesUnloadBtn && this.dronesUnloadBtn.removeEventListener('click', onUnloadClick));
    }

    // 3. Drop Zone de Minérios (Carga da Nave)
    if (this.dropZoneEl) {
      const dropZone = this.dropZoneEl;

      const onDragEnter = (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
      };

      const onDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!dropZone.classList.contains('drag-over')) {
          dropZone.classList.add('drag-over');
        }
      };

      const onDragLeave = (e) => {
        if (!dropZone.contains(e.relatedTarget)) {
          dropZone.classList.remove('drag-over');
        }
      };

      const onDrop = (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');

        try {
          const rawData = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
          if (!rawData) return;
          const payload = JSON.parse(rawData);

          if (payload && payload.itemId && payload.source !== 'ship_storage') {
            const itemInfo = getItemInfo(payload.itemId);
            if (payload.itemId === 'mining_drone' || (itemInfo && itemInfo.type === 'drone')) {
              playSciFiBeep(220, 0.15, 'sawtooth', 0.25);
              if (this.bus) {
                this.bus.emit('hud:toast', {
                  message: 'ORE STORAGE ONLY • Drones must be equipped in GROK DRONES HANGAR below.',
                  type: 'warning'
                });
              }
              return;
            }

            const isShift = !!payload.shiftKey || !!e.shiftKey;
            if (isShift && payload.amount > 1 && this.bus) {
              this.bus.emit('inventory:split_stack_request', {
                itemId: payload.itemId,
                maxAmount: payload.amount,
                source: payload.source,
                target: 'ship_storage'
              });
            } else if (typeof this.onDropItem === 'function') {
              this.onDropItem(payload);
            } else if (this.bus) {
              this.bus.emit('inventory:transfer_to_ship', payload);
            }
          }
        } catch (err) {
          console.warn('[ShipOreStoragePanel] Ore drop error:', err);
        }
      };

      dropZone.addEventListener('dragenter', onDragEnter);
      dropZone.addEventListener('dragover', onDragOver);
      dropZone.addEventListener('dragleave', onDragLeave);
      dropZone.addEventListener('drop', onDrop);

      this.addCleanup(() => {
        dropZone.removeEventListener('dragenter', onDragEnter);
        dropZone.removeEventListener('dragover', onDragOver);
        dropZone.removeEventListener('dragleave', onDragLeave);
        dropZone.removeEventListener('drop', onDrop);
      });
    }

    // 4. Drop Zone de Drones (Drone Bay da Nave)
    if (this.dronesDropZoneEl) {
      const droneDropZone = this.dronesDropZoneEl;

      const onDroneDragEnter = (e) => {
        e.preventDefault();
        droneDropZone.classList.add('drag-over');
      };

      const onDroneDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!droneDropZone.classList.contains('drag-over')) {
          droneDropZone.classList.add('drag-over');
        }
      };

      const onDroneDragLeave = (e) => {
        if (!droneDropZone.contains(e.relatedTarget)) {
          droneDropZone.classList.remove('drag-over');
        }
      };

      const onDroneDrop = (e) => {
        e.preventDefault();
        droneDropZone.classList.remove('drag-over');

        try {
          const rawData = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
          if (!rawData) return;
          const payload = JSON.parse(rawData);

          if (!payload || !payload.itemId) return;

          const isDrone = payload.itemId === 'mining_drone' || (getItemInfo(payload.itemId)?.type === 'drone');
          if (!isDrone) {
            playSciFiBeep(220, 0.15, 'sawtooth', 0.25);
            if (this.bus) {
              this.bus.emit('hud:toast', {
                message: 'DRONES ONLY • Mined ore must be dropped in SHIP ORE STORAGE above.',
                type: 'warning'
              });
            }
            return;
          }

          const shipInfo = getShipInfo(this.activeShipId);
          const droneCapacity = (shipInfo && typeof shipInfo.droneCapacity === 'number') ? shipInfo.droneCapacity : 0;
          if (droneCapacity <= 0) {
            playSciFiBeep(220, 0.15, 'sawtooth', 0.25);
            if (this.bus) {
              this.bus.emit('hud:toast', {
                message: `NO DRONE BAY • Vessel ${shipInfo?.name || this.activeShipId} cannot equip drones.`,
                type: 'error'
              });
            }
            return;
          }

          if (typeof this.onDropDrone === 'function') {
            this.onDropDrone(payload);
          } else if (this.bus) {
            this.bus.emit('drones:transfer_to_bay', payload);
          }
        } catch (err) {
          console.warn('[ShipOreStoragePanel] Drone drop error:', err);
        }
      };

      droneDropZone.addEventListener('dragenter', onDroneDragEnter);
      droneDropZone.addEventListener('dragover', onDroneDragOver);
      droneDropZone.addEventListener('dragleave', onDroneDragLeave);
      droneDropZone.addEventListener('drop', onDroneDrop);

      this.addCleanup(() => {
        droneDropZone.removeEventListener('dragenter', onDroneDragEnter);
        droneDropZone.removeEventListener('dragover', onDroneDragOver);
        droneDropZone.removeEventListener('dragleave', onDroneDragLeave);
        droneDropZone.removeEventListener('drop', onDroneDrop);
      });
    }

    // 5. Destacar zonas quando drag começa
    if (this.bus) {
      const unsubDragStart = this.bus.on('inventory:drag_start', (data) => {
        if (!data) return;
        const isDrone = data.itemId === 'mining_drone' || (getItemInfo(data.itemId)?.type === 'drone');

        if (data.source !== 'ship_storage' && !isDrone && this.dropZoneEl) {
          this.dropZoneEl.classList.add('awaiting-drop');
        } else if (data.source === 'station_storage' && isDrone && this.dronesDropZoneEl) {
          this.dronesDropZoneEl.classList.add('awaiting-drop');
        }
      });

      const unsubDragEnd = this.bus.on('inventory:drag_end', () => {
        if (this.dropZoneEl) {
          this.dropZoneEl.classList.remove('awaiting-drop');
          this.dropZoneEl.classList.remove('drag-over');
        }
        if (this.dronesDropZoneEl) {
          this.dronesDropZoneEl.classList.remove('awaiting-drop');
          this.dronesDropZoneEl.classList.remove('drag-over');
        }
      });

      this.addCleanup(unsubDragStart);
      this.addCleanup(unsubDragEnd);
    }
  }

  /**
   * Menu de contexto para Minérios
   */
  _attachOreContextMenuHandlers() {
    const cards = this.itemsGridEl.querySelectorAll('.storage-item-card[draggable="true"]');
    cards.forEach((card) => {
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const itemId = card.dataset.itemId;
        const amount = parseInt(card.dataset.itemAmount, 10) || 0;
        if (amount <= 0) return;

        this._showOreContextMenu(e.clientX, e.clientY, itemId, amount);
      });
    });
  }

  _createOreContextMenu() {
    if (this.contextMenuEl) return;

    const el = document.createElement('div');
    el.className = 'eve-context-menu hidden';
    el.id = 'ship-storage-context-menu';

    el.innerHTML = `
      <div class="eve-context-header">
        <span class="eve-context-title" id="ctx-ship-item-title">ITEM</span>
      </div>
      <div class="eve-context-body">
        <button type="button" class="eve-context-item" id="ctx-ship-stack">
          <span class="eve-ctx-icon">☷</span>
          <span class="eve-ctx-text">Stack All</span>
        </button>
        <button type="button" class="eve-context-item" id="ctx-ship-transfer">
          <span class="eve-ctx-icon">⤓</span>
          <span class="eve-ctx-text">Unload to Base</span>
        </button>
      </div>
    `;

    document.body.appendChild(el);
    this.contextMenuEl = el;
    this.ctxTitleEl = el.querySelector('#ctx-ship-item-title');
    this.ctxStackBtn = el.querySelector('#ctx-ship-stack');
    this.ctxTransferBtn = el.querySelector('#ctx-ship-transfer');

    if (this.ctxStackBtn) {
      this.ctxStackBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._hideOreContextMenu();
        this.stackAllOres();
      });
    }

    if (this.ctxTransferBtn) {
      this.ctxTransferBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetId = this._activeContextItemId;
        const amount = this._activeContextItemAmount;
        this._hideOreContextMenu();
        if (targetId && this.bus) {
          this.bus.emit('inventory:transfer_item', {
            itemId: targetId,
            amount,
            source: 'ship_storage'
          });
        }
      });
    }

    window.addEventListener('pointerdown', (e) => {
      if (this.contextMenuEl && !this.contextMenuEl.classList.contains('hidden')) {
        if (!this.contextMenuEl.contains(e.target)) {
          this._hideOreContextMenu();
        }
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this._hideOreContextMenu();
      }
    });
  }

  _showOreContextMenu(clientX, clientY, itemId, amount) {
    this._createOreContextMenu();
    if (!this.contextMenuEl) return;

    this._activeContextItemId = itemId;
    this._activeContextItemAmount = amount;
    const meta = getItemInfo(itemId);
    if (this.ctxTitleEl) {
      this.ctxTitleEl.textContent = `${meta.name || itemId.toUpperCase()} (${amount.toLocaleString()})`;
    }

    const menuWidth = 210;
    const menuHeight = 100;
    const posX = Math.min(clientX, window.innerWidth - menuWidth - 12);
    const posY = Math.min(clientY, window.innerHeight - menuHeight - 12);

    this.contextMenuEl.style.left = `${posX}px`;
    this.contextMenuEl.style.top = `${posY}px`;
    this.contextMenuEl.classList.remove('hidden');
  }

  _hideOreContextMenu() {
    if (this.contextMenuEl) {
      this.contextMenuEl.classList.add('hidden');
      this._activeContextItemId = null;
    }
  }

  /**
   * Menu de contexto para Drones
   */
  _attachDroneContextMenuHandlers() {
    const cards = this.dronesGridEl.querySelectorAll('.drone-item-card');
    cards.forEach((card) => {
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const itemId = card.dataset.droneId;
        const amount = parseInt(card.dataset.itemAmount, 10) || 0;
        if (amount <= 0) return;

        this._openDroneContextMenu(e.clientX, e.clientY, itemId, amount);
      });
    });
  }

  _createDroneContextMenu() {
    if (this.dronesContextMenuEl) return;

    const el = document.createElement('div');
    el.className = 'storage-context-menu';
    el.id = 'drones-bay-context-menu';
    el.style.display = 'none';

    el.innerHTML = `
      <div class="storage-context-header">
        <span class="storage-context-title" id="drones-bay-ctx-title">GROK MINING DRONE</span>
      </div>
      <div class="storage-context-actions">
        <button type="button" class="storage-ctx-btn" id="drones-bay-ctx-unload-one">
          <span>⤓</span> Unload 1 Unit to Station
        </button>
        <button type="button" class="storage-ctx-btn" id="drones-bay-ctx-unload-all">
          <span>⤓⤓</span> Unload All to Station
        </button>
      </div>
    `;

    document.body.appendChild(el);
    this.dronesContextMenuEl = el;
    this.dronesCtxTitleEl = el.querySelector('#drones-bay-ctx-title');
    this.dronesCtxUnloadOneBtn = el.querySelector('#drones-bay-ctx-unload-one');
    this.dronesCtxUnloadAllBtn = el.querySelector('#drones-bay-ctx-unload-all');

    window.addEventListener('pointerdown', (e) => {
      if (this.dronesContextMenuEl && this.dronesContextMenuEl.style.display !== 'none') {
        if (!this.dronesContextMenuEl.contains(e.target)) {
          this._closeDroneContextMenu();
        }
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this._closeDroneContextMenu();
      }
    });
  }

  _openDroneContextMenu(x, y, itemId, amount) {
    this._createDroneContextMenu();
    if (!this.dronesContextMenuEl) return;

    this._activeContextDroneId = itemId;
    this._activeContextDroneAmount = amount;
    const meta = getItemInfo(itemId);
    if (this.dronesCtxTitleEl) this.dronesCtxTitleEl.textContent = `${meta.name} (${amount})`;

    this.dronesContextMenuEl.style.display = 'flex';
    this.dronesContextMenuEl.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
    this.dronesContextMenuEl.style.top = `${Math.min(y, window.innerHeight - 120)}px`;

    playSciFiBeep(1100, 0.08, 'sine', 0.18);

    if (this.dronesCtxUnloadOneBtn) {
      this.dronesCtxUnloadOneBtn.onclick = () => {
        this._closeDroneContextMenu();
        if (this.bus) {
          this.bus.emit('drones:transfer_to_station', { itemId, amount: 1 });
        }
      };
    }

    if (this.dronesCtxUnloadAllBtn) {
      this.dronesCtxUnloadAllBtn.onclick = () => {
        this._closeDroneContextMenu();
        if (this.bus) {
          this.bus.emit('drones:transfer_to_station', { itemId, amount });
        }
      };
    }
  }

  _closeDroneContextMenu() {
    if (this.dronesContextMenuEl) {
      this.dronesContextMenuEl.style.display = 'none';
      this._activeContextDroneId = null;
    }
  }

  destroy() {
    super.destroy();
    this._hideOreContextMenu();
    this._closeDroneContextMenu();

    if (this.contextMenuEl && this.contextMenuEl.parentNode) {
      this.contextMenuEl.parentNode.removeChild(this.contextMenuEl);
      this.contextMenuEl = null;
    }
    if (this.dronesContextMenuEl && this.dronesContextMenuEl.parentNode) {
      this.dronesContextMenuEl.parentNode.removeChild(this.dronesContextMenuEl);
      this.dronesContextMenuEl = null;
    }
  }
}
