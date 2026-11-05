/**
 * HARPIA Universe - ShipOreStoragePanel
 * Módulo de Apresentação da Carga da Nave (Box Esquerda)
 * Desacoplado do State global; herda de UIComponent.
 * Mostra itens/minérios em slots quadrados com imagem e unidades por baixo.
 * Suporta Drag & Drop no estilo EVE Online para transferir para o armazém da estação.
 */
import { UIComponent } from '../core/UIComponent.js';
import { getItemInfo } from '../../config/itemsRegistry.js';
import { playSciFiBeep } from '../../core/audio.js';

export class ShipOreStoragePanel extends UIComponent {
  /**
   * @param {Object} options
   * @param {import('../../core/EventBus.js').EventBus} [options.eventBus]
   * @param {(cargo: Object) => void} [options.onTransfer]
   * @param {(data: {itemId: string, amount: number, source: string}) => void} [options.onDropItem]
   */
  constructor({ eventBus = null, onTransfer = null, onDropItem = null } = {}) {
    super();
    this.bus = eventBus;
    this.onTransfer = onTransfer;
    this.onDropItem = onDropItem;

    // Cache de nós DOM
    this.capacityValEl = null;
    this.progressFillEl = null;
    this.itemsGridEl = null;
    this.dropZoneEl = null;
    this.transferBtn = null;
    this.btnStackAll = null;
    this.currentData = { ferrox: 0, crynex: 0, varelium: 0, capacity: 30 };
  }

  /**
   * Constrói e anexa a geometria SVG e a carcaça DOM uma única vez
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

      <!-- Conteúdo e HUD Integrada na Box Desenhada -->
      <div class="hangar-panel-content">
        <div class="hangar-panel-header">
          <span class="panel-tag">SHIP ORE STORAGE</span>
          <div class="panel-header-right">
            <button type="button" class="btn-stack-all" id="btn-stack-ship" title="Stack all identical items (EVE Online)">
              <span class="stack-icon">⧉</span> STACK ALL
            </button>
            <span class="panel-status-dot"></span>
          </div>
        </div>
        <div class="hangar-panel-inner-slot" id="hangar-ship-storage-slot">
          <div class="storage-cargo-meta">
            <span class="storage-meta-label">CARGO CAPACITY</span>
            <span class="storage-meta-value ship-cap-val">0 / 30 T</span>
          </div>
          <div class="storage-progress-track">
            <div class="storage-progress-fill ship-cap-fill" style="width: 0%"></div>
          </div>

          <!-- Drop Zone Visual Holográfica estilo EVE Online -->
          <div class="storage-drop-zone" id="ship-drop-zone">
            <div class="drop-zone-crosshairs">
              <span class="crosshair tl"></span>
              <span class="crosshair tr"></span>
              <span class="crosshair bl"></span>
              <span class="crosshair br"></span>
            </div>
            <div class="drop-zone-indicator">
              <span class="drop-zone-icon">📥</span>
              <span class="drop-zone-text">DROP ITEMS HERE TO LOAD SHIP</span>
            </div>

            <!-- Grelha Livre de Quadrados de Itens (Inventário Estilo Eve Online) -->
            <div class="storage-items-grid ship-items-grid" id="ship-ore-grid">
              <!-- Renderizado dinamicamente -->
            </div>
          </div>

          <div class="storage-actions">
            <button type="button" class="panel-action-btn transfer-to-station-btn" disabled>
              TRANSFER TO BASE
            </button>
          </div>
        </div>
      </div>
    `;

    container.appendChild(wrapper);
    this.root = wrapper;

    // Guarda nós estáticos
    this.capacityValEl = wrapper.querySelector('.ship-cap-val');
    this.progressFillEl = wrapper.querySelector('.ship-cap-fill');
    this.itemsGridEl = wrapper.querySelector('#ship-ore-grid');
    this.dropZoneEl = wrapper.querySelector('#ship-drop-zone');
    this.transferBtn = wrapper.querySelector('.transfer-to-station-btn');
    this.btnStackAll = wrapper.querySelector('#btn-stack-ship');

    if (this.btnStackAll) {
      this.btnStackAll.addEventListener('click', () => this.stackAll());
    }

    this.bindEvents();
    this.render(this.currentData);
  }

  /**
   * Consolida todos os itens idênticos em pilhas únicas (EVE Online Stack All)
   */
  stackAll() {
    playSciFiBeep(980, 0.12, 'triangle', 0.2);
    this.render(this.currentData);
    if (this.bus) {
      this.bus.emit('hud:toast', {
        message: 'CARGO CONSOLIDATED • All identical items stacked',
        type: 'info'
      });
    }
  }

  /**
   * Extrai apenas minérios e itens válidos no porão da nave (ignora metadados e naves)
   */
  _extractItems(data) {
    const items = [];
    let total = 0;
    const ignoredKeys = new Set(['capacity', 'max_storage', 'id', 'pilot_id', 'created_at', 'in_mission', 'location', 'quantity']);

    for (const [key, val] of Object.entries(data)) {
      if (ignoredKeys.has(key.toLowerCase())) continue;

      // Naves pertencem exclusivamente ao Ship Hangar, nunca ao porão de minérios
      const meta = getItemInfo(key);
      if (meta && meta.type === 'ship') continue;
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
   * Renderiza o armazém no formato EVE Online (apenas itens reais, sem slots vazios falsos)
   * @param {Object} [data]
   */
  render(data = {}) {
    if (!this.root) return;

    this.currentData = { ...this.currentData, ...data };
    const capacity = this.currentData.capacity || 30;
    const { items, total } = this._extractItems(this.currentData);
    const percentage = Math.min(100, Math.round((total / Math.max(1, capacity)) * 100));

    if (this.capacityValEl) this.capacityValEl.textContent = `${total.toLocaleString()} / ${capacity.toLocaleString()} T`;
    if (this.progressFillEl) this.progressFillEl.style.width = `${percentage}%`;
    if (this.transferBtn) this.transferBtn.disabled = total === 0;

    this._renderGrid(items);
  }

  /**
   * Renderiza os itens no estilo EVE Online:
   * Cada item possui thumbnail com badge de pilha, nome e unidades.
   * Se não houver itens, mostra estado vazio limpo do contentor.
   * @param {Array<{id: string, amount: number}>} items
   */
  _renderGrid(items = []) {
    if (!this.itemsGridEl) return;

    if (items.length === 0) {
      this.itemsGridEl.innerHTML = `
        <div class="storage-empty-state">
          <div class="storage-empty-icon">☷</div>
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
        : `<div class="storage-slot-placeholder-icon" style="color: ${meta.color};">💠</div>`;

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
    this._attachDragHandlers();
    this._attachSlotDropHandlers();
    this._attachContextMenuHandlers();
  }

  /**
   * Conecta eventos HTML5 Drag & Drop nativo estilo EVE Online nos cards
   */
  _attachDragHandlers() {
    const cards = this.itemsGridEl.querySelectorAll('.storage-item-card[draggable="true"]');
    cards.forEach((card) => {
      card.addEventListener('dragstart', (e) => {
        const itemId = card.dataset.itemId;
        const amount = parseInt(card.dataset.itemAmount, 10) || 0;

        card.classList.add('is-dragging');

        // Formata os dados de transferência
        const payload = JSON.stringify({
          source: 'ship_storage',
          itemId,
          amount,
          shiftKey: !!e.shiftKey
        });

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', payload);
        e.dataTransfer.setData('application/json', payload);

        // Comunica início do drag para a estação destacar o drop target
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
   * Conecta eventos de Drop direto em cada slot para STACK de itens iguais ou colocação em slot livre
   */
  _attachSlotDropHandlers() {
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

          // Se veio da estação para a nave: transfere e empilha!
          if (payload.source === 'station_storage') {
            const itemInfo = getItemInfo(payload.itemId);
            if (payload.itemId === 'mining_drone' || (itemInfo && itemInfo.type === 'drone')) {
              playSciFiBeep(220, 0.15, 'sawtooth', 0.25);
              if (this.bus) {
                this.bus.emit('hud:toast', {
                  message: 'ORE STORAGE ONLY • Drones can only be transferred to DRONES HANGAR.',
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
            // Reorganização interna de pilha na nave (Stacking)
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
          console.warn('[ShipOreStoragePanel] Slot drop error:', err);
        }
      });
    });
  }

  /**
   * Liga eventos de clique com cleanup explícito
   */
  bindEvents() {
    if (!this.transferBtn) return;

    const onTransferClick = () => {
      const { total } = this._extractItems(this.currentData);
      if (total === 0) return;
      if (typeof this.onTransfer === 'function') {
        this.onTransfer({ ...this.currentData });
      } else if (this.bus) {
        this.bus.emit('station:transfer_ore_to_station', { ...this.currentData });
      }
    };

    this.transferBtn.addEventListener('click', onTransferClick);
    this.addCleanup(() => this.transferBtn && this.transferBtn.removeEventListener('click', onTransferClick));

    // Drop Zone na Nave (para receber itens arrastados da Estação)
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
                  message: 'ORE STORAGE ONLY • Drones can only be transferred to DRONES HANGAR.',
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
          console.warn('[ShipOreStoragePanel] Error parsing dropped item:', err);
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

      if (this.bus) {
        const unsubDragStart = this.bus.on('inventory:drag_start', (data) => {
          // Só destaca se o item vier de fora da nave (ex: da estação)
          if (data && data.source !== 'ship_storage') {
            dropZone.classList.add('awaiting-drop');
          }
        });
        const unsubDragEnd = this.bus.on('inventory:drag_end', () => {
          dropZone.classList.remove('awaiting-drop');
          dropZone.classList.remove('drag-over');
        });
        this.addCleanup(unsubDragStart);
        this.addCleanup(unsubDragEnd);
      }
    }
  }

  /**
   * Liga eventos de clique com o botão direito nos cartões de itens da nave
   */
  _attachContextMenuHandlers() {
    const cards = this.itemsGridEl.querySelectorAll('.storage-item-card[draggable="true"]');
    cards.forEach((card) => {
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const itemId = card.dataset.itemId;
        const amount = parseInt(card.dataset.itemAmount, 10) || 0;
        if (amount <= 0) return;

        this._showContextMenu(e.clientX, e.clientY, itemId, amount);
      });
    });
  }

  _createContextMenu() {
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
          <span class="eve-ctx-icon">⧉</span>
          <span class="eve-ctx-text">Stack All</span>
        </button>
        <button type="button" class="eve-context-item" id="ctx-ship-transfer">
          <span class="eve-ctx-icon">📦</span>
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
        this._hideContextMenu();
        this.stackAll();
      });
    }

    if (this.ctxTransferBtn) {
      this.ctxTransferBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetId = this._activeContextItemId;
        const amount = this._activeContextItemAmount;
        this._hideContextMenu();
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
          this._hideContextMenu();
        }
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this._hideContextMenu();
      }
    });
  }

  _showContextMenu(clientX, clientY, itemId, amount) {
    this._createContextMenu();
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

  _hideContextMenu() {
    if (this.contextMenuEl) {
      this.contextMenuEl.classList.add('hidden');
      this._activeContextItemId = null;
    }
  }

  destroy() {
    super.destroy();
    this._hideContextMenu();
    if (this.contextMenuEl && this.contextMenuEl.parentNode) {
      this.contextMenuEl.parentNode.removeChild(this.contextMenuEl);
      this.contextMenuEl = null;
    }
  }
}
