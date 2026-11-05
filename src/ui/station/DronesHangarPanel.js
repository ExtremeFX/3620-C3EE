/**
 * HARPIA Universe - DronesHangarPanel
 * Módulo de Apresentação do Drone Hangar (Exclusivo para Drones)
 * Localizado na vista MAIN HANGAR na janela panorâmica superior.
 * Regra EVE Online estrita:
 * Drones transitam UNICA E EXCLUSIVAMENTE entre STORAGE STATION e DRONES HANGAR.
 */
import { UIComponent } from '../core/UIComponent.js';
import { getItemInfo } from '../../config/itemsRegistry.js';
import { getShipInfo } from '../../config/shipsRegistry.js';
import { playSciFiBeep } from '../../core/audio.js';

export class DronesHangarPanel extends UIComponent {
  /**
   * @param {Object} options
   * @param {import('../../core/EventBus.js').EventBus} [options.eventBus]
   * @param {(data: {itemId: string, amount: number, source: string}) => void} [options.onDropDrone]
   * @param {() => void} [options.onUnloadAll]
   */
  constructor({ eventBus = null, onDropDrone = null, onUnloadAll = null } = {}) {
    super();
    this.bus = eventBus;
    this.onDropDrone = onDropDrone;
    this.onUnloadAll = onUnloadAll;

    // Cache de referências DOM
    this.capacityValEl = null;
    this.progressFillEl = null;
    this.itemsGridEl = null;
    this.dropZoneEl = null;
    this.unloadBtn = null;
    this.btnStackAll = null;
    this.contextMenuEl = null;
    this.ctxTitleEl = null;
    this.ctxUnloadOneBtn = null;
    this.ctxUnloadAllBtn = null;
    this._activeContextItemId = null;

    this.activeShipId = 'H-M2';
    this.currentDrones = { mining_drone: 0 };
    this.isVisible = true;
  }

  /**
   * Constrói e anexa a geometria SVG e a carcaça DOM
   * @param {HTMLElement} container
   */
  mount(container) {
    if (this.root) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'drones-hangar-panel';
    wrapper.id = 'drones-hangar-panel';

    wrapper.innerHTML = `
      <svg class="drones-panel-svg" viewBox="0 0 440 285" preserveAspectRatio="none">
        <defs>
          <filter id="holo-glow-drones" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <!-- Fundo Preto Semi-Transparente da Box -->
        <polygon class="drones-panel-bg" points="
          24,10 400,10 428,38 428,255 404,278 28,278 12,258 12,24
        " fill="#000000" fill-opacity="0.85" style="fill: #000000 !important; fill-opacity: 0.85 !important;" />

        <!-- Borda Exterior Principal com Glow Ciano -->
        <polygon points="
          24,10 400,10 428,38 428,255 404,278 28,278 12,258 12,24
        " fill="none" stroke="#00d4ff" stroke-width="2.2" filter="url(#holo-glow-drones)" />

        <!-- Detalhes Tech de Ângulo e Corte Superior -->
        <path d="M22,6 L42,6" stroke="#00f0ff" stroke-width="2" />
        <path d="M388,6 L410,6 L434,30" fill="none" stroke="#00f0ff" stroke-width="2" />
        <line x1="432" y1="36" x2="432" y2="52" stroke="#00f0ff" stroke-width="2" />

        <!-- Ranhuras Táticas no Canto Inferior -->
        <path d="M360,272 L372,260" stroke="#00d4ff" stroke-width="2.5" stroke-linecap="round" />
        <path d="M370,272 L382,260" stroke="#00d4ff" stroke-width="2.5" stroke-linecap="round" />
        <path d="M380,272 L392,260" stroke="#00d4ff" stroke-width="2.5" stroke-linecap="round" />
        <line x1="355" y1="274" x2="400" y2="274" stroke="#00d4ff" stroke-width="1.5" />
      </svg>

      <!-- Conteúdo do Painel -->
      <div class="drones-panel-content">
        <div class="hangar-panel-header">
          <div class="drones-header-title">
            <span class="drones-tag-icon">🛸</span>
            <span class="panel-tag">GROK DRONES HANGAR</span>
          </div>
          <div class="panel-header-right">
            <button type="button" class="btn-stack-all" id="btn-stack-drones" title="Stack all identical drones">
              <span class="stack-icon">⧉</span> STACK ALL
            </button>
            <span class="panel-status-dot"></span>
          </div>
        </div>

        <div class="drones-panel-inner-slot" id="drones-panel-dropzone">
          <div class="storage-cargo-meta">
            <span class="storage-meta-label">DRONE BAY CAPACITY</span>
            <span class="storage-meta-value drones-cap-val">0 / 0 DRONES</span>
          </div>
          <div class="storage-progress-track">
            <div class="storage-progress-fill drones-cap-fill" style="width: 0%"></div>
          </div>

          <!-- Contentor dos Drones / Drop Zone -->
          <div class="drones-items-container" id="drones-items-container">
            <!-- Renderizado dinamicamente via render() -->
          </div>
        </div>

        <!-- Botão de Ação Inferior: Descarregar Drones para a Estação -->
        <div class="drones-panel-footer">
          <button type="button" class="drones-unload-btn" id="btn-unload-drones" disabled>
            UNLOAD TO STATION
          </button>
        </div>
      </div>

      <!-- Menu de Contexto (Clique Direito no Drone) -->
      <div class="storage-context-menu" id="drones-context-menu" style="display: none;">
        <div class="storage-context-header">
          <span class="storage-context-title" id="drones-ctx-title">GROK MINING DRONE</span>
        </div>
        <div class="storage-context-actions">
          <button type="button" class="storage-ctx-btn" id="drones-ctx-unload-one">
            <span>⮑</span> Unload 1 Unit to Station
          </button>
          <button type="button" class="storage-ctx-btn" id="drones-ctx-unload-all">
            <span>⮑⮑</span> Unload All to Station
          </button>
        </div>
      </div>
    `;

    container.appendChild(wrapper);
    this.root = wrapper;

    // Cacheamento dos seletores DOM
    this.capacityValEl = wrapper.querySelector('.drones-cap-val');
    this.progressFillEl = wrapper.querySelector('.drones-cap-fill');
    this.itemsGridEl = wrapper.querySelector('#drones-items-container');
    this.dropZoneEl = wrapper.querySelector('#drones-panel-dropzone');
    this.unloadBtn = wrapper.querySelector('#btn-unload-drones');
    this.btnStackAll = wrapper.querySelector('#btn-stack-drones');
    this.contextMenuEl = wrapper.querySelector('#drones-context-menu');
    this.ctxTitleEl = wrapper.querySelector('#drones-ctx-title');
    this.ctxUnloadOneBtn = wrapper.querySelector('#drones-ctx-unload-one');
    this.ctxUnloadAllBtn = wrapper.querySelector('#drones-ctx-unload-all');

    this.bindEvents();
  }

  /**
   * Renderiza a capacidade do drone bay da nave ativa e os drones equipados
   * @param {Object} options
   * @param {Object} [options.drones]
   * @param {string} [options.activeShipId]
   */
  render({ drones = null, activeShipId = null } = {}) {
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

    // Atualiza Barra e HUD de Capacidade
    if (droneCapacity <= 0) {
      if (this.capacityValEl) {
        this.capacityValEl.textContent = '0 / 0 (NO BAY)';
        this.capacityValEl.style.color = 'rgba(255, 180, 0, 0.9)';
      }
      if (this.progressFillEl) {
        this.progressFillEl.style.width = '0%';
        this.progressFillEl.style.background = 'rgba(255, 180, 0, 0.5)';
      }
    } else {
      const pct = Math.min(100, (totalDrones / droneCapacity) * 100);
      if (this.capacityValEl) {
        this.capacityValEl.textContent = `${totalDrones} / ${droneCapacity} DRONES`;
        this.capacityValEl.style.color = '#00f0ff';
      }
      if (this.progressFillEl) {
        this.progressFillEl.style.width = `${pct}%`;
        this.progressFillEl.style.background = 'linear-gradient(90deg, #00d4ff 0%, #00ffaa 100%)';
      }
    }

    // Botão de descarregar
    if (this.unloadBtn) {
      this.unloadBtn.disabled = totalDrones === 0;
    }

    // Renderiza o interior do container
    this._renderItems(droneList, droneCapacity, shipInfo);
  }

  /**
   * @param {Array<{id: string, amount: number}>} items
   * @param {number} droneCapacity
   * @param {Object} shipInfo
   */
  _renderItems(items, droneCapacity, shipInfo) {
    if (!this.itemsGridEl) return;

    if (droneCapacity <= 0) {
      this.itemsGridEl.innerHTML = `
        <div class="drones-empty-state no-bay">
          <div class="drones-empty-icon warning-pulse">⚠️</div>
          <div class="drones-empty-title">NO DRONE BAY</div>
          <div class="drones-empty-hint">Vessel ${shipInfo?.name || this.activeShipId} has 0 drone capacity.<br>Equip <strong>H-M2</strong> in Ship Hangar to operate drones.</div>
        </div>
      `;
      return;
    }

    if (items.length === 0) {
      this.itemsGridEl.innerHTML = `
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

    this.itemsGridEl.innerHTML = html;
    this._attachDragHandlers();
    this._attachContextMenuHandlers();
  }

  /**
   * Permite arrastar drones do DRONES HANGAR para a STORAGE STATION
   */
  _attachDragHandlers() {
    const cards = this.itemsGridEl.querySelectorAll('.drone-item-card[draggable="true"]');
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
   * Conecta Drop Zone exclusiva:
   * SÓ e UNICAMENTE aceita itens vindos de station_storage que sejam drones!
   */
  bindEvents() {
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

          if (!payload || !payload.itemId) return;

          // REGRA EVE ONLINE ESTRITA:
          // 1. Origem DEVE ser obrigatoriamente station_storage
          if (payload.source !== 'station_storage') {
            playSciFiBeep(220, 0.15, 'sawtooth', 0.25);
            if (this.bus) {
              this.bus.emit('hud:toast', {
                message: 'INVALID TRANSFER • Drones can only be transferred from Station Storage.',
                type: 'warning'
              });
            }
            return;
          }

          // 2. O item transferido DEVE ser obrigatoriamente do tipo drone
          const itemInfo = getItemInfo(payload.itemId);
          const isDrone = payload.itemId === 'mining_drone' || (itemInfo && itemInfo.type === 'drone');
          if (!isDrone) {
            playSciFiBeep(220, 0.15, 'sawtooth', 0.25);
            if (this.bus) {
              this.bus.emit('hud:toast', {
                message: 'DRONES ONLY • Drones Hangar is strictly reserved for drone units.',
                type: 'warning'
              });
            }
            return;
          }

          // 3. Verifica capacidade de drones da nave ativa
          const shipInfo = getShipInfo(this.activeShipId);
          const maxCapacity = shipInfo?.droneCapacity || 0;
          if (maxCapacity <= 0) {
            playSciFiBeep(220, 0.18, 'sawtooth', 0.3);
            if (this.bus) {
              this.bus.emit('hud:toast', {
                message: `NO DRONE BAY • Vessel ${shipInfo?.name || this.activeShipId} has 0 drone capacity. Equip H-M2.`,
                type: 'warning'
              });
            }
            return;
          }

          let currentTotal = 0;
          Object.values(this.currentDrones).forEach(v => currentTotal += Number(v) || 0);
          if (currentTotal >= maxCapacity) {
            playSciFiBeep(220, 0.15, 'sawtooth', 0.25);
            if (this.bus) {
              this.bus.emit('hud:toast', {
                message: `DRONE BAY FULL • Capacity reached (${currentTotal}/${maxCapacity} drones)`,
                type: 'warning'
              });
            }
            return;
          }

          // Transferência aceite!
          playSciFiBeep(1200, 0.15, 'triangle', 0.28);

          if (typeof this.onDropDrone === 'function') {
            this.onDropDrone(payload);
          } else if (this.bus) {
            this.bus.emit('drones:transfer_to_bay', payload);
          }
        } catch (err) {
          console.warn('[DronesHangarPanel] Error parsing drop:', err);
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

    // Botão de descarregar todos os drones
    if (this.unloadBtn) {
      const onUnloadClick = () => {
        playSciFiBeep(880, 0.12, 'sine', 0.25);
        if (typeof this.onUnloadAll === 'function') {
          this.onUnloadAll();
        } else if (this.bus) {
          this.bus.emit('drones:unload_all');
        }
      };
      this.unloadBtn.addEventListener('click', onUnloadClick);
      this.addCleanup(() => this.unloadBtn && this.unloadBtn.removeEventListener('click', onUnloadClick));
    }

    // Botão Stack All
    if (this.btnStackAll) {
      const onStackClick = () => {
        playSciFiBeep(1350, 0.1, 'sine', 0.2);
        if (this.bus) {
          this.bus.emit('hud:toast', {
            message: 'DRONES STACKED • All bay drone units consolidated',
            type: 'info'
          });
        }
      };
      this.btnStackAll.addEventListener('click', onStackClick);
      this.addCleanup(() => this.btnStackAll && this.btnStackAll.removeEventListener('click', onStackClick));
    }

    // Destaque quando drag inicia em station_storage
    if (this.bus) {
      const unsubDragStart = this.bus.on('inventory:drag_start', (data) => {
        const isDrone = data && (data.itemId === 'mining_drone' || (getItemInfo(data.itemId)?.type === 'drone'));
        if (data && data.source === 'station_storage' && isDrone && this.dropZoneEl) {
          this.dropZoneEl.classList.add('awaiting-drop');
        }
      });
      const unsubDragEnd = this.bus.on('inventory:drag_end', () => {
        if (this.dropZoneEl) {
          this.dropZoneEl.classList.remove('awaiting-drop');
          this.dropZoneEl.classList.remove('drag-over');
        }
      });
      this.addCleanup(unsubDragStart);
      this.addCleanup(unsubDragEnd);
    }
  }

  /**
   * Conecta o menu de contexto (clique direito) nos cartões de drones
   */
  _attachContextMenuHandlers() {
    const cards = this.itemsGridEl.querySelectorAll('.drone-item-card');
    cards.forEach((card) => {
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const itemId = card.dataset.droneId;
        const amount = parseInt(card.dataset.itemAmount, 10) || 0;
        if (amount <= 0) return;

        this._openContextMenu(e.clientX, e.clientY, itemId, amount);
      });
    });
  }

  _openContextMenu(x, y, itemId, amount) {
    if (!this.contextMenuEl) return;

    this._activeContextItemId = itemId;
    const meta = getItemInfo(itemId);
    if (this.ctxTitleEl) this.ctxTitleEl.textContent = `${meta.name} (${amount})`;

    this.contextMenuEl.style.display = 'flex';
    this.contextMenuEl.style.left = `${x}px`;
    this.contextMenuEl.style.top = `${y}px`;

    playSciFiBeep(1100, 0.08, 'sine', 0.18);

    const onDocClick = (e) => {
      if (this.contextMenuEl && !this.contextMenuEl.contains(e.target)) {
        this._closeContextMenu();
        document.removeEventListener('click', onDocClick);
      }
    };
    setTimeout(() => document.addEventListener('click', onDocClick), 20);

    if (this.ctxUnloadOneBtn) {
      this.ctxUnloadOneBtn.onclick = () => {
        this._closeContextMenu();
        if (this.bus) {
          this.bus.emit('drones:transfer_to_station', { itemId, amount: 1 });
        }
      };
    }

    if (this.ctxUnloadAllBtn) {
      this.ctxUnloadAllBtn.onclick = () => {
        this._closeContextMenu();
        if (this.bus) {
          this.bus.emit('drones:transfer_to_station', { itemId, amount });
        }
      };
    }
  }

  _closeContextMenu() {
    if (this.contextMenuEl) {
      this.contextMenuEl.style.display = 'none';
      this._activeContextItemId = null;
    }
  }

  showPanel() {
    this.isVisible = true;
    if (this.root) {
      this.root.classList.remove('hidden');
      this.root.style.display = 'flex';
    }
  }

  hidePanel() {
    this.isVisible = false;
    if (this.root) {
      this.root.classList.add('hidden');
      this.root.style.display = 'none';
    }
    this._closeContextMenu();
  }

  destroy() {
    this._closeContextMenu();
    super.destroy();
  }
}
