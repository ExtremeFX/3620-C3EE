/**
 * HARPIA Universe - DailyRewardWidget Component
 * Widget interativo de recompensa diária (+50 PI) com temporizador e proteção transacional.
 */
import { UIComponent } from '../core/UIComponent.js';
import { api } from '../../network/ApiClient.js';

export class DailyRewardWidget extends UIComponent {
  /**
   * @param {Object} options
   * @param {(data: Object) => void} [options.onRewardClaimed]
   * @param {(msg: string, type: string) => void} [options.onToast]
   */
  constructor({ onRewardClaimed = null, onToast = null } = {}) {
    super();
    this.onRewardClaimed = onRewardClaimed;
    this.onToast = onToast;

    this.timerEl = null;
    this._interval = null;
    this._remainingSeconds = 0;
  }

  mount(container) {
    if (this.root) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'daily-reward-box';
    wrapper.id = 'daily-reward-box';

    wrapper.innerHTML = `
      <img src="./assets/daily_reward.png" alt="Daily Reward" class="daily-reward-img">
      <div class="daily-reward-overlay">
        <div class="daily-reward-badge">+50 PI</div>
        <div class="daily-reward-timer" id="daily-reward-timer">CHECKING...</div>
      </div>
    `;

    container.appendChild(wrapper);
    this.root = wrapper;
    this.timerEl = wrapper.querySelector('#daily-reward-timer');

    this.bindEvents();
    this.updateState();
  }

  bindEvents() {
    if (!this.root) return;

    const onClick = () => this.claimReward();
    this.root.addEventListener('click', onClick);
    this.addCleanup(() => this.root && this.root.removeEventListener('click', onClick));
  }

  _formatSeconds(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  async updateState() {
    if (!this.timerEl) return;

    if (!api.token) {
      this.timerEl.textContent = 'LOGIN FIRST';
      this.timerEl.className = 'daily-reward-timer';
      return;
    }

    try {
      const data = await api.getDailyReward();
      if (data.available) {
        this.timerEl.textContent = 'AVAILABLE';
        this.timerEl.className = 'daily-reward-timer claimable';
        if (this._interval) clearInterval(this._interval);
      } else {
        this._remainingSeconds = data.remaining_seconds || 0;
        this.timerEl.textContent = this._formatSeconds(this._remainingSeconds);
        this.timerEl.className = 'daily-reward-timer cooldown';

        if (this._interval) clearInterval(this._interval);
        this._interval = setInterval(() => {
          if (this._remainingSeconds > 0) {
            this._remainingSeconds--;
            this.timerEl.textContent = this._formatSeconds(this._remainingSeconds);
          } else {
            clearInterval(this._interval);
            this.timerEl.textContent = 'AVAILABLE';
            this.timerEl.className = 'daily-reward-timer claimable';
          }
        }, 1000);
      }
    } catch (e) {
      console.warn('[DailyRewardWidget] Error fetching daily reward state:', e);
    }
  }

  async claimReward() {
    if (!api.token) {
      if (this.onToast) this.onToast('LOG IN FIRST TO CLAIM YOUR 50 PI!', 'warning');
      return;
    }

    if (this._remainingSeconds > 0) {
      if (this.onToast) {
        this.onToast(`REWARD CLAIMED TODAY • Next reward available at 00:00 (${this._formatSeconds(this._remainingSeconds)})`, 'warning');
      }
      return;
    }

    try {
      const data = await api.claimDailyReward();
      if (this.onToast) this.onToast(`🎉 ${data.message} | TOTAL: ${data.total_pi} PI`, 'success');
      if (typeof this.onRewardClaimed === 'function') {
        this.onRewardClaimed(data);
      }
      this.updateState();
    } catch (err) {
      const remaining = err.data?.remaining_seconds;
      if (remaining !== undefined) {
        this._remainingSeconds = remaining;
        if (this.onToast) this.onToast(`Already claimed today! Reset at 00:00: ${this._formatSeconds(remaining)}`, 'warning');
        this.updateState();
      } else {
        if (this.onToast) this.onToast(err.message || 'Error claiming reward', 'warning');
      }
    }
  }

  destroy() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    super.destroy();
  }
}
