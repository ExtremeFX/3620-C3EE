import { UIComponent } from '../core/UIComponent.js';
import { EV } from '../../core/EventBus.js';
import { state, addShipOre } from '../../core/state.js';
import { playSciFiBeep, playSciFiAlert, playCinematicImpact } from '../../core/audio.js';
import { getShipInfo } from '../../config/shipsRegistry.js';

export class MiningLaserModule extends UIComponent {
  /**
   * @param {Object} options
   * @param {import('../../core/EventBus.js').EventBus} options.eventBus
   * @param {import('../../entities/ShipEntity.js').ShipEntity} options.ship
   * @param {import('../../entities/AsteroidEntity.js').AsteroidEntity} [options.asteroid]
   * @param {import('../../entities/AsteroidEntity.js').AsteroidEntity[]} [options.asteroids]
   * @param {import('../../systems/MiningLaserRenderer.js').MiningLaserRenderer} options.laserRenderer
   * @param {import('../../systems/DroneMiningSystem.js').DroneMiningSystem} [options.droneMiningSystem]
   */
  constructor({ eventBus, ship, asteroid, asteroids, laserRenderer, droneMiningSystem = null }) {
    super();
    this.bus = eventBus;
    this.ship = ship;
    this.asteroids = asteroids || (asteroid ? [asteroid] : []);
    this.activeAsteroid = this.asteroids[0] || null;
    this.laserRenderer = laserRenderer;
    this.droneMiningSystem = droneMiningSystem;

    // Configurações do ciclo — dinâmicas conforme a nave ativa
    this.cycleDuration = 60;      // segundos por ciclo
    this.unitsPerCycle = 1;       // unidades extraídas por ciclo completo
    this.maxMiningDistance = 500; // alcance máximo permitido

    this._applyShipSpecs(ship?.shipId || 'H-M2');

    // Estado do módulo
    this.isActive = false;
    this.cycleTime = 0;
    this.isVisible = true;

    // Constantes do anel SVG de progresso
    this.ringRadius = 26;
    this.ringCircumference = 2 * Math.PI * this.ringRadius; // ~163.36px

    // Elementos DOM em cache
    this.btnEl = null;
    this.progressRingEl = null;
    this.timerTextEl = null;
    this.droneBtnEl = null;
    this.droneProgressEl = null;
    this.droneTimerEl = null;
    this.droneCardEl = null;
    this.droneSquadModeBtn = null;
    this.droneModeLabel = null;

    this._onKeyDown = this._onKeyDown.bind(this);

    // Reagir à troca de nave ativa
    if (this.bus) {
      const unsubSwitch = this.bus.on('hangar:switch_ship', ({ shipId }) => {
        this._applyShipSpecs(shipId);
      });
      const unsubActive = this.bus.on('ship:active_changed', ({ shipId }) => {
        this._applyShipSpecs(shipId);
      });
      this.addCleanup(unsubSwitch);
      this.addCleanup(unsubActive);
    }
  }

  setDroneMiningSystem(system) {
    this.droneMiningSystem = system;
  }

  _applyShipSpecs(shipId) {
    const info = getShipInfo(shipId || 'H-M2');
    if (info) {
      this.cycleDuration = typeof info.laserCycle === 'number' ? info.laserCycle : 60;
      this.unitsPerCycle = typeof info.unitsPerCycle === 'number' ? info.unitsPerCycle : 1;
      this.maxMiningDistance = typeof info.miningRange === 'number' ? info.miningRange : 500;
    }
    // Reset visual timer display
    if (this.timerTextEl) {
      this.timerTextEl.textContent = `${this.cycleDuration}s`;
    }
  }

  getActiveAsteroid() {
    return this.activeAsteroid || this.asteroids[0] || null;
  }

  mount(container) {
    if (this.root) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'hud-module-rack-right';
    wrapper.id = 'hud-module-rack-right';

    wrapper.innerHTML = `
      <div class="mining-module-card" id="mining-module-card" title="Mining Laser (Atalho: 1)">
        <!-- Botão Tático Estilo Módulo Eve Online -->
        <button type="button" class="mining-module-btn" id="mining-module-btn" aria-label="Toggle Mining Laser">
          <!-- Chanfro / Marcador Superior Esquerdo com Atalho 1 -->
          <div class="module-corner-bracket top-left">
            <span class="module-hotkey-badge">1</span>
          </div>

          <!-- Marcador Superior Direito -->
          <div class="module-corner-bracket top-right">
            <span class="module-pip"></span>
          </div>

          <!-- Lente Circular Central com Anel de Progresso SVG -->
          <div class="module-lens-wrapper">
            <svg class="module-cycle-svg" viewBox="0 0 64 64">
              <!-- Círculo de trilho de fundo -->
              <circle class="cycle-track" cx="32" cy="32" r="${this.ringRadius}" />
              <!-- Círculo de preenchimento dinâmico do ciclo de 60s -->
              <circle class="cycle-progress" id="mining-cycle-progress" 
                cx="32" cy="32" r="${this.ringRadius}"
                stroke-dasharray="${this.ringCircumference.toFixed(2)}"
                stroke-dashoffset="${this.ringCircumference.toFixed(2)}" />
            </svg>

            <!-- Ícone Holográfico da Nave Mineradora H-M2 -->
            <div class="module-ship-hologram">
              <img src="./assets/ships/MINING SHIPS/H-M2.png" alt="H-M2 Miner" class="module-ship-img">
            </div>

            <!-- Efeito de pulso de laser quando ativo -->
            <div class="module-laser-pulse" id="module-laser-pulse"></div>
          </div>

          <!-- Marcador Inferior Direito -->
          <div class="module-corner-bracket bottom-right">
            <svg class="module-corner-cursor" viewBox="0 0 10 10">
              <polygon points="0,0 8,4 4,8" fill="#ff7700" />
            </svg>
          </div>
        </button>

        <!-- Rótulo Inferior -->
        <div class="mining-module-footer">
          <span class="mining-module-title">Mining Laser</span>
          <span class="mining-module-timer" id="mining-module-timer">60s</span>
        </div>
      </div>

      <!-- Botão Tático Grok Drones (Atalho: 2) ao lado dos Mining Lasers -->
      <div class="mining-module-card drone-module-card" id="drone-module-card" title="Grok Drones (Atalho: 2) • Raio 200m • Ciclo 20s">
        <!-- Modo da Esquadra: FOCUS vs SPLIT (Atalho: 3) -->
        <button type="button" class="drone-squad-mode-pill" id="drone-squad-mode-btn" title="Alternar Modo da Esquadra: FOCADO vs DISPERSO (Atalho: 3)">
          <span class="drone-mode-dot" id="drone-mode-dot"></span>
          <span class="drone-mode-label" id="drone-mode-label">FOCUS</span>
          <span class="drone-mode-key">3</span>
        </button>

        <button type="button" class="mining-module-btn drone-module-btn" id="drone-module-btn" aria-label="Toggle Grok Drones (Atalho: 2)">
          <!-- Chanfro / Marcador Superior Esquerdo com Atalho 2 -->
          <div class="module-corner-bracket top-left">
            <span class="module-hotkey-badge drone-hotkey-badge">2</span>
          </div>

          <!-- Marcador Superior Direito -->
          <div class="module-corner-bracket top-right">
            <span class="module-pip drone-pip"></span>
          </div>

          <!-- Lente Circular Central com Anel de Progresso SVG (Ciclo 20s) -->
          <div class="module-lens-wrapper">
            <svg class="module-cycle-svg" viewBox="0 0 64 64">
              <!-- Círculo de trilho de fundo -->
              <circle class="cycle-track" cx="32" cy="32" r="${this.ringRadius}" />
              <!-- Círculo de preenchimento dinâmico do ciclo de 20s -->
              <circle class="cycle-progress drone-cycle-progress" id="drone-cycle-progress" 
                cx="32" cy="32" r="${this.ringRadius}"
                stroke-dasharray="${this.ringCircumference.toFixed(2)}"
                stroke-dashoffset="${this.ringCircumference.toFixed(2)}" />
            </svg>

            <!-- Ícone Holográfico do Drone Grok -->
            <div class="module-ship-hologram drone-hologram">
              <img src="./assets/items/mining_drone.png" alt="Grok Drones" class="module-ship-img drone-img">
            </div>

            <!-- Efeito de pulso de laser quando ativo -->
            <div class="module-laser-pulse drone-pulse" id="drone-pulse"></div>
          </div>

          <!-- Marcador Inferior Direito -->
          <div class="module-corner-bracket bottom-right">
            <svg class="module-corner-cursor" viewBox="0 0 10 10">
              <polygon points="0,0 8,4 4,8" fill="#00d4ff" />
            </svg>
          </div>
        </button>

        <!-- Rótulo Inferior -->
        <div class="mining-module-footer">
          <span class="mining-module-title">Grok Drones</span>
          <span class="mining-module-timer drone-module-timer" id="drone-module-timer">20s</span>
        </div>
      </div>
    `;

    container.appendChild(wrapper);
    this.root = wrapper;

    this.btnEl = wrapper.querySelector('#mining-module-btn');
    this.progressRingEl = wrapper.querySelector('#mining-cycle-progress');
    this.timerTextEl = wrapper.querySelector('#mining-module-timer');

    this.droneBtnEl = wrapper.querySelector('#drone-module-btn');
    this.droneProgressEl = wrapper.querySelector('#drone-cycle-progress');
    this.droneTimerEl = wrapper.querySelector('#drone-module-timer');
    this.droneCardEl = wrapper.querySelector('#drone-module-card');
    this.droneSquadModeBtn = wrapper.querySelector('#drone-squad-mode-btn');
    this.droneModeLabel = wrapper.querySelector('#drone-mode-label');

    this.bindEvents();
  }

  bindEvents() {
    if (this.btnEl) {
      this.btnEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleMining();
      });
    }

    if (this.droneBtnEl) {
      this.droneBtnEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleDrones();
      });
    }

    if (this.droneSquadModeBtn) {
      this.droneSquadModeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleSquadronMode();
      });
    }

    // Atalhos de Teclado: '1' para Mining Laser, '2' para Grok Drones, '3' para Modo Esquadra
    window.addEventListener('keydown', this._onKeyDown);
    this.addCleanup(() => window.removeEventListener('keydown', this._onKeyDown));

    if (!this.bus) return;

    // Desligar e ocultar ao entrar no Hangar
    const unsubDocking = this.bus.on(EV.STATION_DOCKING, () => {
      this.stopMining();
      this.hide();
    });
    const unsubDocked = this.bus.on(EV.STATION_DOCKED, () => {
      this.stopMining();
      this.hide();
    });
    this.addCleanup(unsubDocking);
    this.addCleanup(unsubDocked);

    // Reexibir ao sair no espaço exterior
    const unsubUndock = this.bus.on(EV.STATION_UNDOCK, () => this.show());
    this.addCleanup(unsubUndock);

    // Controlo no arranque e saída
    const unsubStart = this.bus.on(EV.GAME_START, () => this.show());
    const unsubExit = this.bus.on(EV.GAME_EXIT, () => {
      this.stopMining();
      this.hide();
    });
    this.addCleanup(unsubStart);
    this.addCleanup(unsubExit);

    // Reatividade do estado dos Drones Grok (EVE Online)
    const unsubDroneState = this.bus.on('drones:state_changed', ({ isMining, activeCount }) => {
      this._onDroneStateChanged(isMining, activeCount);
    });
    const unsubDroneMode = this.bus.on('drones:mode_changed', ({ mode }) => {
      this._updateSquadronModeUI(mode);
    });
    const unsubDroneFailed = this.bus.on('drones:launch_failed', () => {
      if (this.droneBtnEl) {
        this.droneBtnEl.classList.remove('error-pulse');
        void this.droneBtnEl.offsetWidth;
        this.droneBtnEl.classList.add('error-pulse');
      }
    });
    this.addCleanup(unsubDroneState);
    this.addCleanup(unsubDroneMode);
    this.addCleanup(unsubDroneFailed);
  }

  _onKeyDown(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (!this.isVisible || this.ship?.isDocked) return;

    if (e.key === '1') {
      this.toggleMining();
    } else if (e.key === '2') {
      this.toggleDrones();
    } else if (e.key === '3') {
      this.toggleSquadronMode();
    }
  }

  /**
   * Alterna modo de esquadra (FOCUS vs SPLIT) (Atalho: 3)
   */
  toggleSquadronMode() {
    if (this.ship?.isDocked || this.ship?.isDocking) return;
    if (this.droneMiningSystem) {
      const newMode = this.droneMiningSystem.toggleSquadronMode();
      this._updateSquadronModeUI(newMode);
    } else if (this.bus) {
      this.bus.emit('drones:toggle_mode');
    }
  }

  _updateSquadronModeUI(mode) {
    if (!this.droneSquadModeBtn || !this.droneModeLabel) return;
    const isSplit = mode === 'SPLIT';
    this.droneModeLabel.textContent = isSplit ? 'SPLIT' : 'FOCUS';
    this.droneSquadModeBtn.classList.toggle('split-active', isSplit);
    this.droneSquadModeBtn.setAttribute('title', isSplit 
      ? 'Modo DISPERSO ativo • Drones dividem-se pelo cluster (Atalho: 3)' 
      : 'Modo FOCADO ativo • Drones concentram-se no mesmo asteroide (Atalho: 3)');
  }

  /**
   * Alterna estado dos Drones Grok (Atalho: 2)
   */
  toggleDrones() {
    if (this.ship?.isDocked || this.ship?.isDocking) return;
    if (this.droneMiningSystem) {
      this.droneMiningSystem.toggleDrones();
    } else if (this.bus) {
      this.bus.emit('drones:toggle');
    }
  }

  _onDroneStateChanged(isMining, activeCount) {
    if (!this.droneBtnEl) return;
    if (isMining) {
      this.droneBtnEl.classList.add('active');
      if (this.droneTimerEl) {
        this.droneTimerEl.textContent = 'Mining';
        this.droneTimerEl.classList.add('active');
      }
    } else {
      this.droneBtnEl.classList.remove('active');
      if (this.droneTimerEl) {
        this.droneTimerEl.textContent = '20s';
        this.droneTimerEl.classList.remove('active');
      }
      if (this.droneProgressEl) {
        this.droneProgressEl.style.strokeDashoffset = this.ringCircumference.toFixed(2);
      }
    }
  }

  /**
   * Alterna entre os 2 estados: Desligado (OFF) e Ligado (ON)
   */
  toggleMining() {
    if (this.isActive) {
      this.stopMining();
      playSciFiBeep(440, 0.12, 'sine', 0.15);
      this.bus.emit(EV.HUD_TOAST, {
        message: '◇ MINING ARRAYS OFFLINE • Power Diverted to Propulsion',
        type: 'info'
      });
    } else {
      this.startMining();
    }
  }

  /**
   * Ativa o módulo e inicia o ciclo no asteroide mais próximo dentro do alcance
   */
  startMining() {
    if (this.ship.isDocked || this.ship.isDocking) return;

    // Procura o asteroide ativo mais próximo
    let nearest = null;
    let minDist = Infinity;

    for (const ast of this.asteroids) {
      if (ast.isDepleted || ast.currentUnits <= 0) continue;
      const dist = Math.hypot(this.ship.x - ast.x, this.ship.y - ast.y);
      if (dist < minDist) {
        minDist = dist;
        nearest = ast;
      }
    }

    if (!nearest || minDist > this.maxMiningDistance) {
      this._triggerOutOfRangeError(minDist === Infinity ? 0 : minDist);
      return;
    }

    // Verificação de Capacidade de Carga
    const cargo = state.shipCargo;
    const currentTotal = (cargo.ferrox || 0) + (cargo.crynex || 0) + (cargo.varelium || 0);
    const maxCap = cargo.capacity || 30;
    if (currentTotal >= maxCap) {
      this._triggerCargoFullError();
      return;
    }

    // Ativação
    this.activeAsteroid = nearest;
    this.isActive = true;
    this.cycleTime = 0;

    if (this.btnEl) {
      this.btnEl.classList.add('active');
    }

    if (this.laserRenderer) {
      this.laserRenderer.setActive(true);
    }

    if (this.bus) {
      this.bus.emit('mining:started', { asteroid: nearest });
    }

    playCinematicImpact(0.8);
    this.bus.emit(EV.HUD_TOAST, {
      message: `❖ RESONANCE LASERS ACTIVE • Harvesting Stellar Matter from ${nearest.oreName || 'Ore Core'}`,
      type: 'info'
    });

    this._updateVisualProgress();
  }

  /**
   * Desativa o módulo e interrompe lasers imediatamente
   */
  stopMining() {
    this.isActive = false;
    this.cycleTime = 0;

    if (this.btnEl) {
      this.btnEl.classList.remove('active');
    }

    if (this.laserRenderer) {
      this.laserRenderer.setActive(false);
    }

    if (this.bus) {
      this.bus.emit('mining:stopped');
    }

    this._updateVisualProgress();
  }

  _triggerOutOfRangeError(distance) {
    if (this.btnEl) {
      this.btnEl.classList.remove('error-pulse');
      void this.btnEl.offsetWidth;
      this.btnEl.classList.add('error-pulse');
    }

    playSciFiAlert();
    this.bus.emit(EV.HUD_TOAST, {
      message: distance > 0 
        ? `◈ TARGET EXCEEDS RANGE • Proximity: ${Math.round(distance)}m (Maximum: ${this.maxMiningDistance}m)`
        : '◈ NO CELESTIAL DEPOSIT IN SENSOR RANGE',
      type: 'error'
    });
  }

  _triggerCargoFullError() {
    if (this.btnEl) {
      this.btnEl.classList.remove('error-pulse');
      void this.btnEl.offsetWidth;
      this.btnEl.classList.add('error-pulse');
    }

    playSciFiAlert();
    this.bus.emit(EV.HUD_TOAST, {
      message: '⚠ CARGO HOLD AT MAXIMUM CAPACITY • Return to base station to unload',
      type: 'error'
    });
  }

  /**
   * Atualização contínua a cada frame (Delta-Time determinístico)
   * @param {number} dt Delta time em segundos
   */
  update(dt) {
    if (this.isActive) {
      const target = this.activeAsteroid;

      // 1. Verificação contínua se o asteroide foi esgotado
      if (!target || target.isDepleted || target.currentUnits <= 0) {
        this.stopMining();
        playSciFiAlert();
        this.bus.emit(EV.HUD_TOAST, {
          message: '◈ CELESTIAL DEPOSIT EXHAUSTED • Resonance Lost',
          type: 'warning'
        });
      } else {
        // 2. Verificação contínua de distância
        const currentDist = Math.hypot(this.ship.x - target.x, this.ship.y - target.y);
        if (currentDist > this.maxMiningDistance) {
          this.stopMining();
          playSciFiAlert();
          this.bus.emit(EV.HUD_TOAST, {
            message: `◈ BEAM DECOHERENCE • Target drifted out of range (${Math.round(currentDist)}m > ${this.maxMiningDistance}m)`,
            type: 'warning'
          });
        } else {
          // Avanço do ciclo de mineração da nave
          this.cycleTime += dt;
          this._updateVisualProgress();

          // Conclusão do ciclo da nave
          if (this.cycleTime >= this.cycleDuration) {
            this._completeCycle();
          }
        }
      }
    }

    // 2. Atualização visual do anel de progresso do botão Grok Drones (20s)
    this._updateDronesButtonProgress();
  }

  _updateDronesButtonProgress() {
    if (!this.droneProgressEl || !this.droneMiningSystem) return;

    if (this.droneMiningSystem.hasDeployedDrones()) {
      let maxCycle = 0;
      let anyMining = false;
      let anyReturning = false;
      let anyOrbiting = false;

      for (const d of this.droneMiningSystem.drones) {
        if (d.state === 'MINING') {
          anyMining = true;
          if (d.cycleTime > maxCycle) maxCycle = d.cycleTime;
        } else if (d.state === 'RETURNING_TO_UNLOAD') {
          anyReturning = true;
        } else if (d.state === 'ORBITING_SHIP') {
          anyOrbiting = true;
        }
      }

      if (anyMining) {
        const progress = Math.min(1.0, maxCycle / 20.0);
        const offset = this.ringCircumference * (1.0 - progress);
        this.droneProgressEl.style.strokeDashoffset = offset.toFixed(2);
        const remSec = Math.max(0, Math.ceil(20.0 - maxCycle));
        if (this.droneTimerEl) {
          this.droneTimerEl.textContent = `${remSec}s`;
          this.droneTimerEl.classList.add('active');
        }
      } else if (anyReturning) {
        this.droneProgressEl.style.strokeDashoffset = '0';
        if (this.droneTimerEl) {
          this.droneTimerEl.textContent = 'Unload';
          this.droneTimerEl.classList.add('active');
        }
      } else if (anyOrbiting) {
        this.droneProgressEl.style.strokeDashoffset = '0';
        if (this.droneTimerEl) {
          this.droneTimerEl.textContent = 'Orbit';
          this.droneTimerEl.classList.add('active');
        }
      }
    } else {
      if (!this.droneMiningSystem.isMining) {
        this.droneProgressEl.style.strokeDashoffset = this.ringCircumference.toFixed(2);
        if (this.droneTimerEl && !this.droneTimerEl.classList.contains('active')) {
          this.droneTimerEl.textContent = '20s';
        }
      }
    }
  }

  _updateVisualProgress() {
    if (!this.progressRingEl || !this.timerTextEl) return;

    if (!this.isActive) {
      this.progressRingEl.style.strokeDashoffset = this.ringCircumference.toFixed(2);
      this.timerTextEl.textContent = `${this.cycleDuration}s`;
      this.timerTextEl.classList.remove('active');
      return;
    }

    const progress = Math.min(1.0, this.cycleTime / this.cycleDuration);
    const offset = this.ringCircumference * (1.0 - progress);
    this.progressRingEl.style.strokeDashoffset = offset.toFixed(2);

    const remainingSec = Math.max(0, Math.ceil(this.cycleDuration - this.cycleTime));
    const mins = Math.floor(remainingSec / 60);
    const secs = remainingSec % 60;
    this.timerTextEl.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    this.timerTextEl.classList.add('active');
  }

  _completeCycle() {
    const target = this.activeAsteroid;

    // 1. Verificar se o asteroide ainda contém recursos
    if (!target || target.isDepleted || target.currentUnits <= 0) {
      this.stopMining();
      return;
    }

    // 2. Extrai unitsPerCycle unidades do asteroide
    const toExtract = this.unitsPerCycle || 1;
    const extracted = target.mineUnit(toExtract);
    if (extracted <= 0) {
      this.stopMining();
      return;
    }

    // Notificar rede multiplayer para sincronização global de minério
    if (typeof window !== 'undefined' && window.harpiaMultiplayer?.reportMine) {
      window.harpiaMultiplayer.reportMine(target.storageKey, extracted);
    }

    // 3. Adiciona ao porão da nave com o tipo de minério do asteroide alvo
    const oreId = target.oreType || 'ferrox';
    const oreName = target.oreName || 'Ferrox';
    const added = addShipOre(oreId, extracted);

    if (added > 0) {
      playCinematicImpact(0.6);
      this.bus?.emit('mining:impact', { added, target });
      this.bus?.emit('hud:hull_float_text', { text: `+${added} ${oreName}` });
    }

    // 4. Se o asteroide alvo ficou totalmente Depleted nesta extração
    if (target.isDepleted || target.currentUnits <= 0) {
      this.stopMining();
      playSciFiAlert();
      this.bus.emit(EV.HUD_TOAST, {
        message: `✦ ${oreName.toUpperCase()} CORE DEPLETED • Asteroid disintegrated into cosmic dust`,
        type: 'warning'
      });
      return;
    }

    // 5. Verificar se a capacidade da nave esgotou
    const cargo = state.shipCargo;
    const currentTotal = (cargo.ferrox || 0) + (cargo.crynex || 0) + (cargo.varelium || 0);
    const maxCap = cargo.capacity || 30;

    if (currentTotal >= maxCap) {
      this.stopMining();
      this.bus.emit(EV.HUD_TOAST, {
        message: `⚠ ORE HOLD FULL (${maxCap}/${maxCap} T) • Return to station to unload`,
        type: 'warning'
      });
    } else {
      // Inicia imediatamente o próximo ciclo
      this.cycleTime = 0;
      this._updateVisualProgress();
    }
  }

  show() {
    this.isVisible = true;
    if (this.root) {
      this.root.classList.remove('hidden');
    }
  }

  hide() {
    this.isVisible = false;
    if (this.root) {
      this.root.classList.add('hidden');
    }
  }
}
