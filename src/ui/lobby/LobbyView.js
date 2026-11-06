/**
 * HARPIA Universe - LobbyView Orchestrator
 * Componente mestre que orquestra todo o ambiente do Lobby (LogoCanvas, AuthPanel, DailyReward, UserProfile e Play Game).
 */
import { UIComponent } from '../core/UIComponent.js';
import { EV } from '../../core/EventBus.js';
import { api } from '../../network/ApiClient.js';
import { setMinerals, setShipCargo, setShipDrones, setHangarShips, setFleetMissions, setDeposits, setPilotCredits, setActiveShip } from '../../core/state.js';
import { LogoCanvas } from '../logo/LogoCanvas.js';
import { AuthPanel } from './AuthPanel.js';
import { DailyRewardWidget } from './DailyRewardWidget.js';
import { UserProfileBar } from './UserProfileBar.js';

export class LobbyView extends UIComponent {
  /**
   * @param {Object} options
   * @param {import('../../core/EventBus.js').EventBus} options.eventBus
   */
  constructor({ eventBus }) {
    super();
    this.bus = eventBus;

    // Subcomponentes modulares
    this.logoCanvas = new LogoCanvas();
    this.authPanel = new AuthPanel({
      onSuccess: (pilot) => this._handleAuthSuccess(pilot)
    });
    this.dailyReward = new DailyRewardWidget({
      onRewardClaimed: (data) => this._handleRewardClaimed(data),
      onToast: (msg, type) => this._showToast(msg, type)
    });
    this.userProfile = new UserProfileBar({
      eventBus: eventBus,
      onLogout: () => this.handleLogout()
    });

    this.playGameWrap = null;
    this.bannerRightEl = null;
  }

  mount(container) {
    if (this.root) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'lobby-root';
    wrapper.id = 'lobby-root';

    // Banner Top-Right
    const banner = document.createElement('div');
    banner.className = 'banner-right';
    banner.innerHTML = `<img src="./assets/Screenshot_8.png" alt="HARPIA" class="banner-img" onerror="this.style.display='none'">`;
    wrapper.appendChild(banner);
    this.bannerRightEl = banner;

    // Montagem do Logo Canvas
    this.logoCanvas.mount(wrapper);

    // Montagem dos submódulos
    this.dailyReward.mount(wrapper);
    this.authPanel.mount(wrapper);
    this.userProfile.mount(wrapper);

    // Play Game Button
    const playWrap = document.createElement('div');
    playWrap.className = 'play-game-wrap';
    playWrap.id = 'play-game-wrap';
    playWrap.style.display = 'none';
    playWrap.innerHTML = `
      <div class="plasma-waves">
        <div class="wave wave-1"></div>
        <div class="wave wave-2"></div>
        <div class="wave wave-3"></div>
      </div>
      <button type="button" class="play-game-btn">
        <span class="play-game-glow"></span>
        <span class="play-game-text">PLAY GAME</span>
      </button>
    `;
    wrapper.appendChild(playWrap);
    this.playGameWrap = playWrap;

    container.appendChild(wrapper);
    this.root = wrapper;

    this.bindEvents();
    this.checkSession();
  }

  bindEvents() {
    if (this.playGameWrap) {
      const onPlayClick = () => this.handlePlayGame();
      this.playGameWrap.addEventListener('click', onPlayClick);
      this.addCleanup(() => this.playGameWrap && this.playGameWrap.removeEventListener('click', onPlayClick));
    }

    if (this.bus) {
      const unsubGameExit = this.bus.on(EV.GAME_EXIT, () => {
        this.show();
        this.logoCanvas.resume();
      });
      this.addCleanup(unsubGameExit);

      const unsubGameStart = this.bus.on(EV.GAME_START, () => {
        this.logoCanvas.pause();
      });
      this.addCleanup(unsubGameStart);
    }
  }

  async _loadPilotHangarState() {
    if (!api.token) return;
    try {
      const data = await api.fetchHangarData();
      if (data) {
        if (data.activeShipId) {
          setActiveShip(data.activeShipId);
        }
        if (data.ships) {
          setHangarShips(data.ships);
        }
        if (data.storage) {
          setMinerals(data.storage);
        }
        if (data.shipCargo) {
          setShipCargo(data.shipCargo);
        }
        if (data.shipDrones) {
          setShipDrones(data.shipDrones);
        }
        if (data.missions) {
          setFleetMissions(data.missions);
        }
        if (data.deposits) {
          setDeposits(data.deposits);
        }
        if (typeof data.credits === 'number') {
          setPilotCredits(data.credits);
        }
        if (data.position && this.bus) {
          this.bus.emit('ship:hydrate_position', data.position);
        }
      }
    } catch (err) {
      console.warn('[LobbyView] Falha ao carregar estado do hangar:', err);
    }
  }

  async _handleAuthSuccess(pilot) {
    this.authPanel.hide();
    this.userProfile.render(pilot);
    if (this.playGameWrap) this.playGameWrap.style.display = 'flex';
    this.dailyReward.updateState();

    await this._loadPilotHangarState();

    if (this.bus) {
      this.bus.emit(EV.AUTH_LOGGED_IN, pilot);
    }
  }

  _handleRewardClaimed(data) {
    if (data && data.total_pi !== undefined) {
      const currentUser = api.user || {};
      currentUser.pi_tokens = data.total_pi;
      api.setUser(currentUser);
      this.userProfile.render(currentUser);
    }
  }

  _showToast(message, type = 'info') {
    if (this.bus) {
      this.bus.emit(EV.HUD_TOAST, { message, type, duration: 3500 });
    }
  }

  handleLogout() {
    api.setToken(null);
    api.setUser(null);

    // Repor inventário local limpo
    setMinerals({ ferrox: 0, crynex: 0, varelium: 0 });
    setShipCargo({ ferrox: 0, crynex: 0, varelium: 0, capacity: 30 });

    this.userProfile.hide();
    if (this.playGameWrap) this.playGameWrap.style.display = 'none';
    this.authPanel.show();
    this.dailyReward.updateState();

    if (this.bus) {
      this.bus.emit(EV.AUTH_LOGGED_OUT);
    }
  }

  async checkSession() {
    if (!api.token) {
      this.authPanel.show();
      this.userProfile.hide();
      if (this.playGameWrap) this.playGameWrap.style.display = 'none';
      this.dailyReward.updateState();
      return;
    }

    try {
      const data = await api.getMe();
      if (data && data.pilot) {
        api.setUser(data.pilot);
        await this._handleAuthSuccess(data.pilot);
      } else {
        this.handleLogout();
      }
    } catch (err) {
      if (err && err.status === 401) {
        this.handleLogout();
      } else {
        console.warn('[LobbyView] Server momentarily unreachable; maintaining cached session:', err);
        if (api.user) {
          await this._handleAuthSuccess(api.user);
        }
      }
    }
  }

  async handlePlayGame() {
    await this._loadPilotHangarState();

    const gameWorld = document.getElementById('game-world');
    if (gameWorld) {
      gameWorld.classList.add('active');
    }
    document.body.classList.add('in-game');

    this.logoCanvas.pause();

    const bgVid = document.getElementById('lobby-bg-video');
    if (bgVid && !bgVid.paused) {
      try { bgVid.pause(); } catch (_) {}
    }

    if (this.bus) {
      this.bus.emit(EV.GAME_START);
    }
  }

  exitGameWorld() {
    const gameWorld = document.getElementById('game-world');
    if (gameWorld) {
      gameWorld.classList.remove('active');
    }
    document.body.classList.remove('in-game');

    this.logoCanvas.resume();

    const bgVid = document.getElementById('lobby-bg-video');
    if (bgVid) {
      try { bgVid.play().catch(() => {}); } catch (_) {}
    }

    if (this.bus) {
      this.bus.emit(EV.GAME_EXIT);
    }
  }

  show() {
    if (this.root) this.root.style.display = 'block';
  }

  hide() {
    if (this.root) this.root.style.display = 'none';
  }

  destroy() {
    super.destroy();
    this.logoCanvas.destroy();
    this.authPanel.destroy();
    this.dailyReward.destroy();
    this.userProfile.destroy();
  }
}
