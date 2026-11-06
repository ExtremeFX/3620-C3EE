/**
 * HARPIA Universe - AuthPanel Component
 * Painel modular de autenticação (Login / Registo de Pilotos).
 */
import { UIComponent } from '../core/UIComponent.js';
import { api } from '../../network/ApiClient.js';

export class AuthPanel extends UIComponent {
  /**
   * @param {Object} options
   * @param {(pilot: Object) => void} [options.onSuccess]
   */
  constructor({ onSuccess = null } = {}) {
    super();
    this.onSuccess = onSuccess;
    this.activeTab = 'login';

    this.tabLoginBtn = null;
    this.tabRegisterBtn = null;
    this.loginForm = null;
    this.registerForm = null;
    this.msgEl = null;
  }

  mount(container) {
    if (this.root) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'auth-panel';
    wrapper.id = 'auth-panel';

    wrapper.innerHTML = `
      <div class="auth-header">
        <button type="button" class="auth-tab active" data-tab="login">LOGIN</button>
        <button type="button" class="auth-tab" data-tab="register">REGISTER</button>
      </div>

      <form id="login-form" class="auth-form active">
        <div class="input-group">
          <label>Username</label>
          <input type="text" name="username" placeholder="PILOT" required autocomplete="username">
        </div>
        <div class="input-group">
          <label>Password</label>
          <input type="password" name="password" placeholder="••••••••" required autocomplete="current-password">
        </div>
        <button type="submit" class="auth-btn">LOGIN</button>
      </form>

      <form id="register-form" class="auth-form">
        <div class="input-group">
          <label>Username</label>
          <input type="text" name="username" placeholder="PILOT" required autocomplete="username">
        </div>
        <div class="input-group">
          <label>Email</label>
          <input type="email" name="email" placeholder="pilot@harpia.net" required autocomplete="email">
        </div>
        <div class="input-group">
          <label>Password</label>
          <input type="password" name="password" placeholder="••••••••" required autocomplete="new-password">
        </div>
        <button type="submit" class="auth-btn">CREATE ACCOUNT</button>
      </form>

      <div class="auth-msg" id="auth-msg"></div>
    `;

    container.appendChild(wrapper);
    this.root = wrapper;

    this.tabLoginBtn = wrapper.querySelector('[data-tab="login"]');
    this.tabRegisterBtn = wrapper.querySelector('[data-tab="register"]');
    this.loginForm = wrapper.querySelector('#login-form');
    this.registerForm = wrapper.querySelector('#register-form');
    this.msgEl = wrapper.querySelector('#auth-msg');

    this.bindEvents();
  }

  bindEvents() {
    if (this.tabLoginBtn) {
      const onTabLogin = () => this.switchTab('login');
      this.tabLoginBtn.addEventListener('click', onTabLogin);
      this.addCleanup(() => this.tabLoginBtn && this.tabLoginBtn.removeEventListener('click', onTabLogin));
    }

    if (this.tabRegisterBtn) {
      const onTabReg = () => this.switchTab('register');
      this.tabRegisterBtn.addEventListener('click', onTabReg);
      this.addCleanup(() => this.tabRegisterBtn && this.tabRegisterBtn.removeEventListener('click', onTabReg));
    }

    if (this.loginForm) {
      const onLoginSubmit = (e) => this._handleLogin(e);
      this.loginForm.addEventListener('submit', onLoginSubmit);
      this.addCleanup(() => this.loginForm && this.loginForm.removeEventListener('submit', onLoginSubmit));
    }

    if (this.registerForm) {
      const onRegSubmit = (e) => this._handleRegister(e);
      this.registerForm.addEventListener('submit', onRegSubmit);
      this.addCleanup(() => this.registerForm && this.registerForm.removeEventListener('submit', onRegSubmit));
    }
  }

  switchTab(tab) {
    this.activeTab = tab;
    if (this.root) {
      this.root.querySelectorAll('.auth-tab').forEach((t) => {
        t.classList.toggle('active', t.getAttribute('data-tab') === tab);
      });
      this.root.querySelectorAll('.auth-form').forEach((f) => {
        f.classList.toggle('active', f.id === `${tab}-form`);
      });
    }
    this._setMessage('', '');
  }

  _setMessage(text, type = '') {
    if (this.msgEl) {
      this.msgEl.textContent = text;
      this.msgEl.className = `auth-msg ${type}`.trim();
    }
  }

  async _handleLogin(e) {
    e.preventDefault();
    const uInput = this.loginForm.querySelector('input[name="username"]');
    const pInput = this.loginForm.querySelector('input[name="password"]');

    const username = (uInput?.value || '').trim();
    const password = pInput?.value || '';

    this._setMessage('Authenticating...', '');

    try {
      const data = await api.login(username, password);
      api.setToken(data.token);
      api.setUser(data.pilot);

      this._setMessage('Access granted!', 'ok');

      if (typeof this.onSuccess === 'function') {
        this.onSuccess(data.pilot);
      }
    } catch (err) {
      this._setMessage(err.message || 'Authentication error', 'error');
    }
  }

  async _handleRegister(e) {
    e.preventDefault();
    const uInput = this.registerForm.querySelector('input[name="username"]');
    const eInput = this.registerForm.querySelector('input[name="email"]');
    const pInput = this.registerForm.querySelector('input[name="password"]');

    const username = (uInput?.value || '').trim();
    const email = (eInput?.value || '').trim();
    const password = pInput?.value || '';

    if (!username || !email || !password) {
      this._setMessage('Por favor preenche todos os campos (Username, Email e Password)', 'error');
      return;
    }

    if (password.length < 6) {
      this._setMessage('A password deve ter no mínimo 6 caracteres', 'error');
      return;
    }

    this._setMessage('Creating account...', '');

    try {
      const data = await api.register(username, email, password);
      api.setToken(data.token);
      api.setUser(data.pilot);

      this._setMessage('Account created successfully!', 'ok');

      if (typeof this.onSuccess === 'function') {
        this.onSuccess(data.pilot);
      }
    } catch (err) {
      this._setMessage(err.message || 'Error creating account', 'error');
    }
  }

  show() {
    if (this.root) this.root.style.display = 'block';
  }

  hide() {
    if (this.root) this.root.style.display = 'none';
  }
}
