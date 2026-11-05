/**
 * HARPIA Universe - UserProfileBar Component
 * Barra superior esquerda (in-game) que exibe Nome, PI do piloto, e caixa de WALLET (ARP).
 */
import { UIComponent } from '../core/UIComponent.js';

export class UserProfileBar extends UIComponent {
  /**
   * @param {Object} options
   * @param {() => void} [options.onLogout]
   * @param {import('../../core/EventBus.js').EventBus} [options.eventBus]
   */
  constructor({ onLogout = null, eventBus = null } = {}) {
    super();
    this.onLogout = onLogout;
    this.bus = eventBus;

    this.usernameEl = null;
    this.piEl = null;
    this.walletAmountEl = null;
    this.logoutBtn = null;
    this._unsubCredits = null;
  }

  mount(container) {
    if (this.root) return;

    // Contentor externo que empilha o pill + wallet box verticalmente
    const wrapper = document.createElement('div');
    wrapper.className = 'user-profile-container';
    wrapper.id = 'user-profile';
    wrapper.style.display = 'none';

    wrapper.innerHTML = `
      <!-- Pill principal: Nome | PI -->
      <div class="user-profile">
        <span class="user-profile-name" id="logged-username">PILOT</span>
        <span class="user-profile-pi" id="logged-pi">0 PI</span>
        <button type="button" class="user-profile-logout-btn">LOGOUT</button>
      </div>
      <!-- Caixa WALLET separada, abaixo do pill -->
      <div class="user-wallet-box" id="user-wallet-box">
        <span class="user-wallet-label">WALLET</span>
        <span class="user-wallet-amount" id="user-wallet-amount">0 ARP</span>
      </div>
    `;

    container.appendChild(wrapper);
    this.root = wrapper;

    this.usernameEl = wrapper.querySelector('#logged-username');
    this.piEl       = wrapper.querySelector('#logged-pi');
    this.walletAmountEl = wrapper.querySelector('#user-wallet-amount');
    this.logoutBtn  = wrapper.querySelector('.user-profile-logout-btn');

    this.bindEvents();
  }

  bindEvents() {
    if (this.logoutBtn) {
      const onClick = () => {
        if (typeof this.onLogout === 'function') this.onLogout();
      };
      this.logoutBtn.addEventListener('click', onClick);
      this.addCleanup(() => this.logoutBtn && this.logoutBtn.removeEventListener('click', onClick));
    }

    // Subscrever créditos em tempo real
    if (this.bus) {
      this._unsubCredits = this.bus.on('pilot:credits_updated', (credits) => {
        this._setWallet(credits);
      });
      this.addCleanup(() => this._unsubCredits && this._unsubCredits());
    }
  }

  _setWallet(credits) {
    if (this.walletAmountEl) {
      const amount = Number(credits) || 0;
      this.walletAmountEl.textContent = `${amount.toLocaleString()} ARP`;
    }
  }

  render(pilot) {
    if (!this.root) return;

    if (!pilot) {
      this.hide();
      return;
    }

    if (this.usernameEl) {
      this.usernameEl.textContent = pilot.username || 'PILOT';
    }
    if (this.piEl) {
      this.piEl.textContent = `${pilot.pi_tokens || 0} PI`;
    }
    // Usar créditos reais do piloto
    this._setWallet(pilot.credits !== undefined ? pilot.credits : 0);

    this.show();
  }

  show() {
    if (this.root) this.root.style.display = 'flex';
  }

  hide() {
    if (this.root) this.root.style.display = 'none';
  }
}
