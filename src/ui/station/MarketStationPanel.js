/**
 * HARPIA Universe - MarketStationPanel (EVE Online Style Market Browser)
 * Painel Central do Mercado Regional da Estação.
 * Funcionalidades:
 * - Visual cru, militar e funcional com lista de itens/ordens à venda no mercado da estação.
 * - Suporta qualquer item/minério que o piloto possua no armazém da estação.
 * - Ao submeter uma ordem de venda, o item é deduzido do armazém e entra de imediato na lista de ordens à venda no mercado.
 * - Possibilidade de cancelar a sua própria ordem e reaver os itens.
 */
import { UIComponent } from '../core/UIComponent.js';
import { state, setMinerals, setPilotCredits, setHangarShips } from '../../core/state.js';
import { api } from '../../network/ApiClient.js';
import { wsClient } from '../../network/websocket.js';
import { playSciFiBeep, playSciFiAlert } from '../../core/audio.js';
import { getItemInfo } from '../../config/itemsRegistry.js';

export class MarketStationPanel extends UIComponent {
  /**
   * @param {Object} options
   * @param {import('../../core/EventBus.js').EventBus} options.eventBus
   * @param {import('../../core/state.js').state} options.state
   */
  constructor({ eventBus, state: st } = {}) {
    super();
    this.bus = eventBus;
    this.stateRef = st || state;
    this.isVisible = false;
    this.isSubmitting = false;

    this.orders = [];
    // DOM Elements
    this.tableBodyEl = null;
    this.orderCountEl = null;
    this.createModalEl = null;
    this.statusEl = null;
  }

  mount(container) {
    if (this.root) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'hangar-market-panel eve-style-market';
    wrapper.id = 'hangar-market-panel';

    wrapper.innerHTML = `
      <!-- Conteúdo EVE Online do Mercado -->
      <div class="market-panel-content">

        <!-- Top Header Bar -->
        <div class="eve-market-header">
          <div class="eve-market-brand">
            <span class="eve-status-indicator"></span>
            <div class="eve-market-title-wrap">
              <span class="eve-market-title">REGIONAL MARKET // ORDER BOOK</span>
              <span class="eve-market-station-tag">HARPIA BASE · STATION STORAGE COMMODITIES</span>
            </div>
          </div>
        </div>

        <!-- Barra de Filtros e Status da Tabela -->
        <div class="eve-market-toolbar">
          <div class="eve-toolbar-info">
            <span class="eve-toolbar-text">ITEMS FOR SALE ON MARKET:</span>
            <span class="eve-orders-count-badge" id="eve-orders-count">0 ORDERS</span>
          </div>
          <button type="button" class="eve-refresh-btn" id="eve-btn-refresh" title="Refresh Market">
            ⟳ REFRESH
          </button>
        </div>

        <!-- Tabela Crua e Funcional de Ordens de Venda (Sell Orders) -->
        <div class="eve-table-container">
          <table class="eve-market-table">
            <thead>
              <tr>
                <th style="width: 28px;"></th>
                <th>ITEM</th>
                <th class="col-right">QUANTITY</th>
                <th class="col-right">UNIT PRICE</th>
                <th class="col-right">TOTAL (ARP)</th>
                <th>LOCATION</th>
                <th>SELLER</th>
                <th class="col-center" style="width: 85px;">ACTION</th>
              </tr>
            </thead>
            <tbody id="eve-market-tbody">
              <!-- As linhas das ordens são inseridas dinamicamente aqui -->
            </tbody>
          </table>
        </div>

        <!-- Rodapé / Barra de Status do Mercado -->
        <div class="eve-market-footer">
          <span class="eve-footer-status" id="eve-footer-status">Market operational. Ready for transactions.</span>
          <span class="eve-footer-hint">HARPIA SECURE COMMODITY EXCHANGE</span>
        </div>

      </div>

      <!-- Modal / Pop-over Desdobrável: Criar Nova Ordem de Venda -->
      <div class="eve-sell-modal-overlay hidden" id="eve-sell-modal">
        <div class="eve-sell-modal-card">
          <div class="eve-sell-modal-header">
            <span class="eve-modal-title">NEW SELL ORDER // MARKET</span>
            <button type="button" class="eve-modal-close" id="eve-sell-modal-close">✕</button>
          </div>

          <div class="eve-sell-modal-body">
            <!-- Escolha do Item Disponível no Armazém da Estação -->
            <div class="eve-field-group">
              <label class="eve-field-label">ITEM AVAILABLE IN STATION STORAGE</label>
              <select class="eve-select" id="eve-sell-item-select">
                <!-- Populado dinamicamente com itens com stock > 0 -->
              </select>
              <div class="eve-field-hint" id="eve-sell-stock-hint">Available: 0</div>
            </div>

            <!-- Quantidade a Vender -->
            <div class="eve-field-group">
              <label class="eve-field-label">QUANTITY TO SELL</label>
              <div class="eve-qty-input-wrap">
                <input type="number" class="eve-input" id="eve-sell-qty" value="1" min="1" step="1">
                <button type="button" class="eve-qty-max-btn" id="eve-sell-qty-max">MAX</button>
              </div>
            </div>

            <!-- Preço por Unidade -->
            <div class="eve-field-group">
              <label class="eve-field-label">DESIRED UNIT PRICE (ARP)</label>
              <input type="number" class="eve-input" id="eve-sell-price" value="120" min="1" step="1">
            </div>

            <!-- Resumo da Ordem -->
            <div class="eve-order-summary-box">
              <div class="eve-summary-row">
                <span>ESTIMATED TOTAL VALUE:</span>
                <strong class="eve-summary-total" id="eve-sell-total">120 ARP</strong>
              </div>
              <div class="eve-summary-sub">The item will be deducted from Station Storage and listed on the Regional Market.</div>
            </div>

            <!-- Botão de Confirmação -->
            <button type="button" class="eve-confirm-sell-btn" id="eve-sell-submit-btn">
              LIST ON MARKET
            </button>
          </div>
        </div>
      </div>
    `;

    container.appendChild(wrapper);
    this.root = wrapper;

    // Cache referências do DOM
    this.tableBodyEl = wrapper.querySelector('#eve-market-tbody');
    this.orderCountEl = wrapper.querySelector('#eve-orders-count');
    this.createModalEl = wrapper.querySelector('#eve-sell-modal');
    this.statusEl = wrapper.querySelector('#eve-footer-status');

    this.itemSelectEl = wrapper.querySelector('#eve-sell-item-select');
    this.stockHintEl = wrapper.querySelector('#eve-sell-stock-hint');
    this.qtyInputEl = wrapper.querySelector('#eve-sell-qty');
    this.priceInputEl = wrapper.querySelector('#eve-sell-price');
    this.totalSumEl = wrapper.querySelector('#eve-sell-total');
    this.submitBtnEl = wrapper.querySelector('#eve-sell-submit-btn');

    this._bindEvents();
  }

  _bindEvents() {
    // Modal & Toolbar events
    const closeBtn = this.root.querySelector('#eve-sell-modal-close');
    const refreshBtn = this.root.querySelector('#eve-btn-refresh');
    const maxBtn = this.root.querySelector('#eve-sell-qty-max');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this._closeSellModal());
    }
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.fetchOrders());
    }

    if (this.itemSelectEl) {
      this.itemSelectEl.addEventListener('change', () => this._onItemSelectChange());
    }

    if (this.qtyInputEl) {
      this.qtyInputEl.addEventListener('input', () => this._updateModalTotal());
    }
    if (this.priceInputEl) {
      this.priceInputEl.addEventListener('input', () => this._updateModalTotal());
    }

    if (maxBtn) {
      maxBtn.addEventListener('click', () => {
        const available = this._getSelectedAvailableStock();
        if (this.qtyInputEl) this.qtyInputEl.value = Math.max(1, available);
        this._updateModalTotal();
      });
    }

    if (this.submitBtnEl) {
      this.submitBtnEl.addEventListener('click', () => this._submitSellOrder());
    }

    // Delegação de eventos na tabela para cancelar ou comprar ordens
    if (this.tableBodyEl) {
      this.tableBodyEl.addEventListener('click', (e) => {
        const cancelBtn = e.target.closest('.eve-btn-cancel-order');
        if (cancelBtn) {
          const orderId = cancelBtn.dataset.orderId;
          if (orderId) this._cancelOrder(orderId);
        }
        const buyBtn = e.target.closest('.eve-btn-buy-order');
        if (buyBtn) {
          const orderId = buyBtn.dataset.orderId;
          if (orderId) this._buyOrder(orderId);
        }
      });
    }

    // Eventos WebSocket para atualizações em tempo real
    if (wsClient) {
      const unsubWsSold = wsClient.on('MARKET_ORDER_SOLD', (payload) => {
        if (!payload) return;
        playSciFiBeep(1600, 0.25, 'sine', 0.25);
        if (payload.newCredits !== null && payload.newCredits !== undefined) {
          setPilotCredits(payload.newCredits);
        }
        this._setStatus(`[TRANSACTION] Your sell order (${payload.quantity}x ${payload.itemName}) was purchased by ${payload.buyerName} for ${Number(payload.totalPrice).toLocaleString()} ARP!`);
        this.fetchOrders();
      });

      const unsubWsUpdated = wsClient.on('MARKET_UPDATED', () => {
        if (this.isVisible) {
          this.fetchOrders();
        }
      });

      this.addCleanup(unsubWsSold);
      this.addCleanup(unsubWsUpdated);
    }

    // Eventos do EventBus
    if (this.bus) {
      const unsub1 = this.bus.on('minerals:updated', () => this.syncData());
      const unsub2 = this.bus.on('pilot:credits_updated', () => this.syncData());
      this.addCleanup(unsub1);
      this.addCleanup(unsub2);
    }
  }

  async fetchOrders() {
    try {
      this._setStatus('Loading market orders...');
      const res = await api.fetchMarketOrders();
      if (res && res.success && Array.isArray(res.orders)) {
        this.orders = res.orders;
        this._renderOrdersTable();
        this._setStatus(`Market synchronized. ${this.orders.length} active orders.`);
      }
    } catch (err) {
      this._setStatus('Error communicating with regional market.');
    }
  }

  _renderOrdersTable() {
    if (!this.tableBodyEl) return;

    if (this.orderCountEl) {
      this.orderCountEl.textContent = `${this.orders.length} ORDERS`;
    }

    if (!this.orders || this.orders.length === 0) {
      this.tableBodyEl.innerHTML = `
        <tr class="eve-table-empty">
          <td colspan="8">NO ACTIVE ORDERS. RIGHT-CLICK AN ITEM IN STATION STORAGE TO LIST IT FOR SALE.</td>
        </tr>
      `;
      return;
    }

    const currentPilotId = api.user?.id || (this.stateRef.pilotData?.id) || 0;

    this.tableBodyEl.innerHTML = this.orders.map(order => {
      const isOwner = Number(order.pilot_id) === Number(currentPilotId);
      const itemMeta = getItemInfo(order.item_id);
      const iconUrl = itemMeta.imageSrc ? `./${itemMeta.imageSrc}` : null;
      const iconHtml = iconUrl
        ? `<img src="${iconUrl}" alt="${order.item_name}" class="eve-item-icon" onerror="this.style.opacity=0.3">`
        : `<span style="font-size:18px;opacity:0.5;">💠</span>`;

      const actionHtml = isOwner
        ? `<button type="button" class="eve-btn-cancel-order" data-order-id="${order.id}">CANCEL</button>`
        : `<button type="button" class="eve-btn-buy-order" data-order-id="${order.id}" title="Buy ${order.quantity}x ${order.item_name} for ${order.total_price} ARP">BUY</button>`;

      return `
        <tr class="eve-table-row ${isOwner ? 'eve-row-owner' : ''}">
          <td class="eve-col-icon">
            ${iconHtml}
          </td>
          <td class="eve-col-name">
            <span class="eve-item-title">${order.item_name}</span>
            <span class="eve-item-sub">[${order.item_id.toUpperCase()}]</span>
          </td>
          <td class="col-right eve-col-qty">${Number(order.quantity).toLocaleString()}</td>
          <td class="col-right eve-col-price">${Number(order.price_per_unit).toLocaleString()} ARP</td>
          <td class="col-right eve-col-total">${Number(order.total_price).toLocaleString()} ARP</td>
          <td class="eve-col-loc">${order.station_id || 'HARPIA BASE'}</td>
          <td class="eve-col-seller">
            <span class="${isOwner ? 'eve-seller-self' : 'eve-seller-other'}">${order.seller_name}${isOwner ? ' (You)' : ''}</span>
          </td>
          <td class="col-center eve-col-action">${actionHtml}</td>
        </tr>
      `;
    }).join('');
  }

  openSellFor(itemId) {
    if (!this.isVisible) {
      this.showPanel();
    }
    this._openSellModal(itemId);
  }

  _openSellModal(preselectedItemId = null) {
    this._populateItemSelect(preselectedItemId);
    if (this.createModalEl) {
      this.createModalEl.classList.remove('hidden');
    }
    this._updateModalTotal();
  }

  _closeSellModal() {
    if (this.createModalEl) {
      this.createModalEl.classList.add('hidden');
    }
  }

  _populateItemSelect(preselectedItemId = null) {
    if (!this.itemSelectEl) return;

    const storage = this.stateRef.stationMinerals || {};
    const items = [
      { id: 'ferrox', name: 'Ferrox Ore', qty: storage.ferrox || 0, defaultPrice: 120 },
      { id: 'crynex', name: 'Crynex Crystal', qty: storage.crynex || 0, defaultPrice: 280 },
      { id: 'varelium', name: 'Varelium Isotope', qty: storage.varelium || 0, defaultPrice: 450 },
      { id: 'H-M2', name: 'H-M2', qty: (storage.h_m2 || storage.core_v2 || 0), defaultPrice: 155000 },
      { id: 'HARPI-T1', name: 'HARPI-T1', qty: (storage.harpi_t1 || 0), defaultPrice: 1000000 }
    ];

    this.itemSelectEl.innerHTML = items.map(item => {
      const disabled = item.qty <= 0 ? 'disabled' : '';
      const isSelected = preselectedItemId ? (item.id === preselectedItemId) : false;
      return `<option value="${item.id}" data-price="${item.defaultPrice}" data-qty="${item.qty}" ${disabled} ${isSelected ? 'selected' : ''}>
        ${item.name} (${item.qty} in storage)
      </option>`;
    }).join('');

    if (preselectedItemId) {
      this.itemSelectEl.value = preselectedItemId;
    }

    this._onItemSelectChange();
  }

  _onItemSelectChange() {
    const selected = this.itemSelectEl?.selectedOptions[0];
    if (!selected) return;

    const price = selected.dataset.price || '120';
    const qty = parseInt(selected.dataset.qty, 10) || 0;

    if (this.priceInputEl) this.priceInputEl.value = price;
    if (this.stockHintEl) {
      this.stockHintEl.textContent = `Available in Station Storage: ${qty} units`;
      this.stockHintEl.style.color = qty > 0 ? '#00f0ff' : '#ff4444';
    }

    if (this.qtyInputEl) {
      this.qtyInputEl.value = qty > 0 ? 1 : 0;
      this.qtyInputEl.max = qty;
    }

    this._updateModalTotal();
  }

  _getSelectedAvailableStock() {
    const selected = this.itemSelectEl?.selectedOptions[0];
    if (!selected) return 0;
    return parseInt(selected.dataset.qty, 10) || 0;
  }

  _updateModalTotal() {
    const qty = parseInt(this.qtyInputEl?.value, 10) || 0;
    const price = parseInt(this.priceInputEl?.value, 10) || 0;
    const total = qty * price;
    const available = this._getSelectedAvailableStock();

    if (this.totalSumEl) {
      this.totalSumEl.textContent = `${total.toLocaleString()} ARP`;
    }

    if (this.submitBtnEl) {
      const isValid = qty > 0 && price > 0 && qty <= available && !this.isSubmitting;
      this.submitBtnEl.disabled = !isValid;
    }
  }

  async _submitSellOrder() {
    const selected = this.itemSelectEl?.value;
    const qty = parseInt(this.qtyInputEl?.value, 10) || 0;
    const price = parseInt(this.priceInputEl?.value, 10) || 0;
    const available = this._getSelectedAvailableStock();

    if (!selected || qty <= 0 || price <= 0 || qty > available || this.isSubmitting) return;

    this.isSubmitting = true;
    if (this.submitBtnEl) {
      this.submitBtnEl.disabled = true;
      this.submitBtnEl.textContent = 'LISTING ORDER...';
    }

    try {
      const res = await api.sellMarketOre({ itemId: selected, amount: qty, pricePerUnit: price });
      if (res && res.success) {
        playSciFiBeep(1200, 0.25, 'sine', 0.25);
        if (res.storage) setMinerals(res.storage);

        // Atualizar imediatamente a lista de ordens do mercado
        if (res.orders) {
          this.orders = res.orders;
          this._renderOrdersTable();
        } else {
          await this.fetchOrders();
        }

        this._closeSellModal();
        this._setStatus(`✓ Sell order created! ${qty}x ${selected.toUpperCase()} listed on Market.`);
      } else {
        throw new Error(res?.detail || 'Failed to list sell order');
      }
    } catch (err) {
      playSciFiAlert();
      this._setStatus(`✕ Error: ${err.message}`);
    } finally {
      this.isSubmitting = false;
      if (this.submitBtnEl) {
        this.submitBtnEl.textContent = 'LIST ON MARKET';
      }
      this._updateModalTotal();
    }
  }

  async _cancelOrder(orderId) {
    try {
      this._setStatus('Cancelling order...');
      const res = await api.cancelMarketOrder(orderId);
      if (res && res.success) {
        playSciFiBeep(880, 0.15, 'sine', 0.2);
        if (res.storage) setMinerals(res.storage);
        if (res.orders) {
          this.orders = res.orders;
          this._renderOrdersTable();
        } else {
          await this.fetchOrders();
        }
        this._setStatus(`✓ Order #${orderId} cancelled. Items restored to storage.`);
      } else {
        throw new Error(res?.detail || 'Failed to cancel order');
      }
    } catch (err) {
      playSciFiAlert();
      this._setStatus(`✕ Error: ${err.message}`);
    }
  }

  async _buyOrder(orderId) {
    const order = this.orders.find(o => Number(o.id) === Number(orderId));
    if (!order) return;

    const currentCredits = this.stateRef.pilotCredits || 0;
    if (currentCredits < order.total_price) {
      playSciFiAlert();
      this._setStatus(`✕ Insufficient ARP: you have ${currentCredits.toLocaleString()} ARP, order costs ${Number(order.total_price).toLocaleString()} ARP.`);
      return;
    }

    try {
      this._setStatus(`Purchasing ${order.quantity}x ${order.item_name}...`);
      const res = await api.buyMarketOrder(orderId);
      if (res && res.success) {
        playSciFiBeep(1400, 0.2, 'sine', 0.25);
        if (typeof res.credits === 'number') {
          setPilotCredits(res.credits);
        }
        if (res.storage) {
          setMinerals(res.storage);
        }
        if (res.ships) {
          setHangarShips(res.ships);
        }
        if (res.orders) {
          this.orders = res.orders;
          this._renderOrdersTable();
        } else {
          await this.fetchOrders();
        }
        this._setStatus(`✓ Bought ${order.quantity}x ${order.item_name} for ${Number(order.total_price).toLocaleString()} ARP!`);
      } else {
        throw new Error(res?.detail || 'Failed to complete market purchase');
      }
    } catch (err) {
      playSciFiAlert();
      this._setStatus(`✕ Purchase Error: ${err.message}`);
    }
  }

  _setStatus(msg) {
    if (this.statusEl) {
      this.statusEl.textContent = msg;
    }
  }

  syncData() {
    if (!this.isVisible) return;

    if (!this.createModalEl?.classList.contains('hidden')) {
      this._populateItemSelect();
    }
  }

  showPanel() {
    this.isVisible = true;
    if (this.root) {
      this.root.classList.remove('hidden');
      requestAnimationFrame(() => {
        this.root.classList.add('visible');
      });
    }
    this.syncData();
    this.fetchOrders();
  }

  hidePanel() {
    this.isVisible = false;
    this._closeSellModal();
    if (this.root) {
      this.root.classList.remove('visible');
      this.root.classList.add('hidden');
    }
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
