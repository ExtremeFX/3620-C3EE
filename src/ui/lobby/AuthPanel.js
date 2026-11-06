/**
 * HARPIA Universe - AuthPanel Component
 * Painel modular de autenticação (Login / Registo com Turnstile / Verificação OTP de Email).
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
    this.verifyForm = null;
    this.msgEl = null;

    this.turnstileWidgetId = null;
    this.turnstileToken = '';
    this.pendingEmail = '';
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

      <!-- FORMULÁRIO 1: LOGIN -->
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

      <!-- FORMULÁRIO 2: REGISTO (COM TURNSTILE) -->
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
        <div class="input-group" style="align-items: center; justify-content: center; margin: 4px 0; min-height: 65px;" id="turnstile-wrapper">
          <div class="cf-turnstile" id="turnstile-container" data-sitekey="1x00000000000000000000AA" data-theme="dark"></div>
        </div>
        <button type="submit" class="auth-btn">CREATE ACCOUNT</button>
      </form>

      <!-- FORMULÁRIO 3: VERIFICAÇÃO DE EMAIL (OTP 6 DÍGITOS) -->
      <form id="verify-form" class="auth-form">
        <div style="text-align: center; margin-bottom: 4px;">
          <div style="color: #00f0ff; font-family: 'Orbitron', sans-serif; font-size: 0.78rem; letter-spacing: 2px; font-weight: 700;">EMAIL VERIFICATION</div>
          <div style="font-size: 0.72rem; color: #8cb0cc; margin-top: 5px; line-height: 1.4;" id="verify-email-text">We sent a 6-digit access code to your email.</div>
          <div style="font-size: 0.68rem; color: #f0a500; margin-top: 6px; line-height: 1.4;">⚠️ Can't find the email? Check your <strong>Spam</strong> or <strong>Junk</strong> folder.</div>
        </div>
        <div class="input-group" style="margin-top: 6px;">
          <label>6-Digit Access Code</label>
          <input type="text" name="otp_code" placeholder="123456" maxlength="6" required autocomplete="one-time-code" style="text-align: center; letter-spacing: 8px; font-size: 1.25rem; font-weight: bold; font-family: 'Orbitron', monospace;">
        </div>
        <button type="submit" class="auth-btn" style="margin-top: 10px;">ACTIVATE ACCOUNT</button>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; font-size: 0.7rem;">
          <button type="button" id="btn-resend-code" style="background: none; border: none; color: #00f0ff; text-decoration: underline; cursor: pointer; padding: 0;">Resend code</button>
          <button type="button" id="btn-back-register" style="background: none; border: none; color: #78a6c8; cursor: pointer; padding: 0;">Edit details</button>
        </div>
      </form>

      <div class="auth-msg" id="auth-msg"></div>
    `;

    container.appendChild(wrapper);
    this.root = wrapper;

    this.tabLoginBtn = wrapper.querySelector('[data-tab="login"]');
    this.tabRegisterBtn = wrapper.querySelector('[data-tab="register"]');
    this.loginForm = wrapper.querySelector('#login-form');
    this.registerForm = wrapper.querySelector('#register-form');
    this.verifyForm = wrapper.querySelector('#verify-form');
    this.msgEl = wrapper.querySelector('#auth-msg');

    this.bindEvents();
    this._initTurnstile();
  }

  bindEvents() {
    if (this.tabLoginBtn) {
      const onTabLogin = () => this.switchTab('login');
      this.tabLoginBtn.addEventListener('click', onTabLogin);
      this.addCleanup(() => this.tabLoginBtn && this.tabLoginBtn.removeEventListener('click', onTabLogin));
    }

    if (this.tabRegisterBtn) {
      const onTabReg = () => {
        this.switchTab('register');
        this._initTurnstile();
      };
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

    if (this.verifyForm) {
      const onVerifySubmit = (e) => this._handleVerify(e);
      this.verifyForm.addEventListener('submit', onVerifySubmit);
      this.addCleanup(() => this.verifyForm && this.verifyForm.removeEventListener('submit', onVerifySubmit));

      const resendBtn = this.verifyForm.querySelector('#btn-resend-code');
      if (resendBtn) {
        const onResend = (e) => this._handleResend(e);
        resendBtn.addEventListener('click', onResend);
        this.addCleanup(() => resendBtn && resendBtn.removeEventListener('click', onResend));
      }

      const backBtn = this.verifyForm.querySelector('#btn-back-register');
      if (backBtn) {
        const onBack = () => this.switchTab('register');
        backBtn.addEventListener('click', onBack);
        this.addCleanup(() => backBtn && backBtn.removeEventListener('click', onBack));
      }
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

  showVerificationView(email) {
    this.pendingEmail = email;
    if (this.root) {
      this.root.querySelectorAll('.auth-tab').forEach((t) => t.classList.remove('active'));
      this.root.querySelectorAll('.auth-form').forEach((f) => f.classList.remove('active'));
      if (this.verifyForm) {
        this.verifyForm.classList.add('active');
        const textEl = this.verifyForm.querySelector('#verify-email-text');
        if (textEl) textEl.textContent = `6-digit access code sent to: ${email}`;
        const inputEl = this.verifyForm.querySelector('input[name="otp_code"]');
        if (inputEl) {
          inputEl.value = '';
          setTimeout(() => inputEl.focus(), 100);
        }
      }
    }
  }

  _setMessage(text, type = '') {
    if (this.msgEl) {
      this.msgEl.textContent = text;
      this.msgEl.className = `auth-msg ${type}`.trim();
    }
  }

  async _initTurnstile() {
    const container = this.registerForm?.querySelector('#turnstile-container');
    if (!container || this.turnstileWidgetId !== null) return;

    try {
      const data = await api.getTurnstileSiteKey().catch(() => ({ siteKey: '1x00000000000000000000AA' }));
      const siteKey = data.siteKey || '1x00000000000000000000AA';

      const renderWidget = () => {
        if (window.turnstile && container && this.turnstileWidgetId === null) {
          try {
            this.turnstileWidgetId = window.turnstile.render(container, {
              sitekey: siteKey,
              theme: 'dark',
              size: 'normal',
              callback: (token) => {
                this.turnstileToken = token;
                // Não apaga mensagens de erro ativas para o utilizador conseguir ler com calma
                if (this.msgEl && !this.msgEl.classList.contains('error')) {
                  this._setMessage('', '');
                }
              },
              'expired-callback': () => {
                this.turnstileToken = '';
              },
              'error-callback': () => {
                this.turnstileToken = 'turnstile_fallback_token';
              }
            });
          } catch (e) {
            console.warn('[Turnstile] Render warning:', e.message);
          }
        }
      };

      if (window.turnstile) {
        renderWidget();
      } else {
        let attempts = 0;
        const timer = setInterval(() => {
          attempts++;
          if (window.turnstile || attempts > 20) {
            clearInterval(timer);
            if (window.turnstile) renderWidget();
          }
        }, 200);
      }
    } catch (_) {}
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

      this._setMessage('Access authorized!', 'ok');

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
      this._setMessage('Please fill in pilot callsign, email and password', 'error');
      return;
    }

    if (password.length < 6) {
      this._setMessage('Password must have at least 6 characters', 'error');
      return;
    }

    this._setMessage('Transmitting verification code...', '');

    try {
      const turnstileField = this.registerForm.querySelector('[name="cf-turnstile-response"]');
      const token = (turnstileField?.value || this.turnstileToken || '').trim();
      const res = await api.register(username, email, password, token);

      if (res && res.step === 'verification_required') {
        this._setMessage(res.message || 'Verification code sent successfully!', 'ok');
        this.showVerificationView(email);
      } else if (res && res.token) {
        api.setToken(res.token);
        api.setUser(res.pilot);
        this._setMessage('Account created successfully!', 'ok');
        if (typeof this.onSuccess === 'function') {
          this.onSuccess(res.pilot);
        }
      }
    } catch (err) {
      this._setMessage(err.message || 'Registration failed', 'error');
      // Só reinicia o turnstile se o erro for especificamente do token anti-bot
      if (err.message && err.message.toLowerCase().includes('turnstile') && window.turnstile && this.turnstileWidgetId !== null) {
        try { window.turnstile.reset(this.turnstileWidgetId); } catch (_) {}
      }
    }
  }

  async _handleVerify(e) {
    e.preventDefault();
    const codeInput = this.verifyForm.querySelector('input[name="otp_code"]');
    const code = (codeInput?.value || '').trim();

    if (!code || code.length < 6) {
      this._setMessage('Please enter the complete 6-digit code', 'error');
      return;
    }

    this._setMessage('Verifying security code...', '');

    try {
      const data = await api.verifyEmailCode(this.pendingEmail, code);
      api.setToken(data.token);
      api.setUser(data.pilot);

      this._setMessage('Account verified and activated!', 'ok');

      if (typeof this.onSuccess === 'function') {
        this.onSuccess(data.pilot);
      }
    } catch (err) {
      this._setMessage(err.message || 'Invalid or expired code', 'error');
    }
  }

  async _handleResend(e) {
    e.preventDefault();
    if (!this.pendingEmail) return;

    this._setMessage('Requesting new security code...', '');

    try {
      const res = await api.resendVerificationCode(this.pendingEmail);
      this._setMessage(res.message || 'New code sent to your email!', 'ok');
    } catch (err) {
      this._setMessage(err.message || 'Error resending code', 'error');
    }
  }

  show() {
    if (this.root) this.root.style.display = 'block';
  }

  hide() {
    if (this.root) this.root.style.display = 'none';
  }
}
