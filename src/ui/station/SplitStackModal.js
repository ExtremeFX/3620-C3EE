/**
 * HARPIA Universe - SplitStackModal
 * Janela Tática de Seleção de Quantidade (Estilo EVE Online Split Stack Dialog)
 * Ativada via Shift + Drag & Drop entre inventários.
 */
import { UIComponent } from '../core/UIComponent.js';
import { getItemInfo } from '../../config/itemsRegistry.js';

export class SplitStackModal extends UIComponent {
  /**
   * @param {Object} options
   * @param {import('../../core/EventBus.js').EventBus} [options.eventBus]
   * @param {(data: {itemId: string, amount: number, source: string, target: string}) => void} [options.onConfirm]
   */
  constructor({ eventBus = null, onConfirm = null } = {}) {
    super();
    this.bus = eventBus;
    this.onConfirm = onConfirm;

    this.isOpen = false;
    this.currentTransfer = null; // { itemId, maxAmount, source, target }
    this.selectedQuantity = 1;

    // Elementos DOM
    this.modalEl = null;
    this.itemImgEl = null;
    this.itemNameEl = null;
    this.itemMaxEl = null;
    this.sliderEl = null;
    this.inputEl = null;
    this.confirmBtn = null;
    this.cancelBtn = null;
  }

  mount(container = document.body) {
    if (this.root) return;

    const overlay = document.createElement('div');
    overlay.className = 'split-stack-overlay';
    overlay.id = 'split-stack-modal';

    overlay.innerHTML = `
      <div class="split-stack-dialog">
        <!-- Barra Superior Tática EVE -->
        <div class="split-stack-header">
          <div class="split-header-title">
            <span class="split-icon">⚖️</span>
            <span class="split-title-text">ITEM QUANTITY // SPLIT STACK</span>
          </div>
          <button type="button" class="split-close-btn" title="Cancel (ESC)">✕</button>
        </div>

        <!-- Corpo do Modal com Item Preview -->
        <div class="split-stack-body">
          <div class="split-item-preview">
            <div class="split-item-thumb" id="split-thumb-box">
              <img id="split-item-img" src="" alt="Item" class="split-img">
            </div>
            <div class="split-item-info">
              <span class="split-item-name" id="split-item-name">FERROX</span>
              <span class="split-item-meta" id="split-item-avail">AVAILABLE: 5 Units</span>
              <span class="split-direction-tag" id="split-direction-tag">TRANSFER DIRECTION</span>
            </div>
          </div>

          <!-- Seletor de Quantidade com Slider e Input -->
          <div class="split-controls">
            <div class="split-input-row">
              <span class="split-input-label">QUANTITY TO MOVE:</span>
              <div class="split-number-wrapper">
                <button type="button" class="split-step-btn" id="split-step-dec">−</button>
                <input type="number" class="split-number-input" id="split-number-input" min="1" max="1" value="1">
                <button type="button" class="split-step-btn" id="split-step-inc">+</button>
              </div>
            </div>

            <!-- Slider de Alta Precisão -->
            <input type="range" class="split-range-slider" id="split-range-slider" min="1" max="1" value="1">

            <!-- Botões de Atalho Rápido EVE Online -->
            <div class="split-quick-buttons">
              <button type="button" class="split-quick-btn" data-preset="min">MIN (1)</button>
              <button type="button" class="split-quick-btn" data-preset="half">HALF (50%)</button>
              <button type="button" class="split-quick-btn" data-preset="max">MAX</button>
            </div>
          </div>
        </div>

        <!-- Ações do Modal -->
        <div class="split-stack-footer">
          <button type="button" class="split-action-btn cancel-btn" id="split-cancel-btn">CANCEL</button>
          <button type="button" class="split-action-btn confirm-btn" id="split-confirm-btn">CONFIRM TRANSFER</button>
        </div>
      </div>
    `;

 container.appendChild(overlay);
 this.root = overlay;
 this.modalEl = overlay;

 // Cache de referências DOM
 this.itemImgEl = overlay.querySelector('#split-item-img');
 this.itemNameEl = overlay.querySelector('#split-item-name');
 this.itemMaxEl = overlay.querySelector('#split-item-avail');
 this.directionEl = overlay.querySelector('#split-direction-tag');
 this.sliderEl = overlay.querySelector('#split-range-slider');
 this.inputEl = overlay.querySelector('#split-number-input');
 this.confirmBtn = overlay.querySelector('#split-confirm-btn');
 this.cancelBtn = overlay.querySelector('#split-cancel-btn');
 this.closeBtn = overlay.querySelector('.split-close-btn');

 this.bindEvents();
 }

 /**
 * Abre a janela para transferir uma quantia selecionada
 * @param {Object} transferData
 * @param {string} transferData.itemId
 * @param {number} transferData.maxAmount
 * @param {string} transferData.source - 'ship_storage' | 'station_storage'
 * @param {string} transferData.target - 'ship_storage' | 'station_storage'
 */
 open(transferData) {
 if (!this.root) return;

 this.currentTransfer = transferData;
 const { itemId, maxAmount, source } = transferData;
 const meta = getItemInfo(itemId);

 this.selectedQuantity = Math.max(1, Math.floor(maxAmount / 2) || 1);

 // Atualiza interface
 if (this.itemImgEl) {
 if (meta.imageSrc) {
 this.itemImgEl.src = meta.imageSrc;
 this.itemImgEl.style.display = 'block';
 } else {
 this.itemImgEl.style.display = 'none';
 }
 }

    if (this.itemNameEl) this.itemNameEl.textContent = meta.name;
    if (this.itemMaxEl) this.itemMaxEl.textContent = `AVAILABLE: ${maxAmount.toLocaleString()} Units`;
 if (this.directionEl) {
 this.directionEl.textContent = source === 'ship_storage'
 ? 'SHIP ➔ STATION VAULT'
 : 'STATION VAULT ➔ SHIP';
 }

 // Configura inputs
 if (this.sliderEl) {
 this.sliderEl.min = '1';
 this.sliderEl.max = String(maxAmount);
 this.sliderEl.value = String(this.selectedQuantity);
 }

 if (this.inputEl) {
 this.inputEl.min = '1';
 this.inputEl.max = String(maxAmount);
 this.inputEl.value = String(this.selectedQuantity);
 }

 this.isOpen = true;
 this.modalEl.classList.add('active');
 setTimeout(() => this.inputEl && this.inputEl.focus(), 50);
 }

 close() {
 this.isOpen = false;
 if (this.modalEl) {
 this.modalEl.classList.remove('active');
 }
 this.currentTransfer = null;
 }

 _setQuantity(val) {
 if (!this.currentTransfer) return;
 const max = this.currentTransfer.maxAmount;
 let num = parseInt(val, 10);
 if (isNaN(num) || num < 1) num = 1;
 if (num > max) num = max;

 this.selectedQuantity = num;
 if (this.sliderEl) this.sliderEl.value = String(num);
 if (this.inputEl) this.inputEl.value = String(num);
 }

 _handleConfirm() {
 if (!this.currentTransfer || !this.isOpen) return;

 const qty = this.selectedQuantity;
 const transfer = { ...this.currentTransfer, amount: qty };

 this.close();

 if (typeof this.onConfirm === 'function') {
 this.onConfirm(transfer);
 } else if (this.bus) {
 if (transfer.target === 'ship_storage') {
 this.bus.emit('inventory:transfer_to_ship', transfer);
 } else {
 this.bus.emit('inventory:transfer_item', transfer);
 }
 }
 }

 bindEvents() {
 // Slider e Input sincronizados
 if (this.sliderEl) {
 this.sliderEl.addEventListener('input', (e) => this._setQuantity(e.target.value));
 }
 if (this.inputEl) {
 this.inputEl.addEventListener('input', (e) => this._setQuantity(e.target.value));
 this.inputEl.addEventListener('keydown', (e) => {
 if (e.key === 'Enter') {
 e.preventDefault();
 this._handleConfirm();
 }
 });
 }

 // Botões de incremento/decremento
 const stepDec = this.root.querySelector('#split-step-dec');
 const stepInc = this.root.querySelector('#split-step-inc');
 if (stepDec) stepDec.addEventListener('click', () => this._setQuantity(this.selectedQuantity - 1));
 if (stepInc) stepInc.addEventListener('click', () => this._setQuantity(this.selectedQuantity + 1));

 // Botões de atalho rápido (MIN, HALF, MAX)
 const presetBtns = this.root.querySelectorAll('.split-quick-btn');
 presetBtns.forEach((btn) => {
 btn.addEventListener('click', () => {
 if (!this.currentTransfer) return;
 const max = this.currentTransfer.maxAmount;
 const preset = btn.dataset.preset;
 if (preset === 'min') this._setQuantity(1);
 else if (preset === 'half') this._setQuantity(Math.max(1, Math.floor(max / 2)));
 else if (preset === 'max') this._setQuantity(max);
 });
 });

 // Confirmar e Cancelar
 if (this.confirmBtn) this.confirmBtn.addEventListener('click', () => this._handleConfirm());
 if (this.cancelBtn) this.cancelBtn.addEventListener('click', () => this.close());
 if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.close());

 // Fechar com ESC ou clique fora
 window.addEventListener('keydown', (e) => {
 if (this.isOpen && e.key === 'Escape') {
 this.close();
 }
 });

 this.root.addEventListener('click', (e) => {
 if (e.target === this.root) {
 this.close();
 }
 });
 }
}
