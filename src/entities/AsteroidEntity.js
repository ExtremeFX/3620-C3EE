/**
 * HARPIA Universe - AsteroidEntity
 * Entidade modular que modela os asteroides de mineração (Ferrox, Varelium, etc.) no espaço:
 * - Capacidade máxima: 60 unidades por asteroide
 * - Redução progressiva e suave da escala conforme as unidades são mineradas
 * - Ao atingir o estado Depleted (0 unidades), desaparece suavemente no espaço
 * - Respawn automático a cada 60 minutos após ficar Depleted (com persistência local independente)
 * - Rotação axial contínua e suave
 * - HUD discreto com indicação apenas das unidades (60 / 60 U)
 */
import { EV } from '../core/EventBus.js';
import { playSciFiBeep } from '../core/audio.js';

const RESPAWN_COOLDOWN_MS = 60 * 60 * 1000; // 60 minutos (3600 segundos)

export class AsteroidEntity {
  /**
   * @param {Object} [options]
   * @param {string|number} [options.id=1] Identificador único do asteroide
   * @param {string} [options.oreType='ferrox'] Tipo de minério ('ferrox', 'varelium', etc.)
   * @param {string} [options.oreName='Ferrox'] Nome de exibição do minério
   * @param {string} [options.imageSrc='./assets/items/ferrox.png'] Caminho para a textura do asteroide
   * @param {number} [options.x=4500] Coordenada mundial X
   * @param {number} [options.y=-2400] Coordenada mundial Y
   * @param {number} [options.baseWidth=320] Largura base em pixels (a 60 unidades)
   * @param {number} [options.rotationSpeed=0.02] Velocidade angular (rad/s)
   * @param {number} [options.maxUnits=60] Capacidade máxima de unidades
   * @param {string} [options.storageKey] Chave de persistência LocalStorage
   * @param {string} [options.wrapId] ID do elemento HTML container
   * @param {string} [options.bodyId] ID do corpo rotativo
   * @param {string} [options.unitsTextId] ID do texto de unidades
   * @param {import('../core/EventBus.js').EventBus} [options.eventBus] Barramento de eventos global
   */
  constructor({
    id = 1,
    oreType = 'ferrox',
    oreName = 'Ferrox',
    imageSrc = './assets/items/ferrox.png',
    x = 4500,
    y = -2400,
    baseWidth = 320,
    rotationSpeed = 0.02,
    maxUnits = 60,
    storageKey = null,
    wrapId = null,
    bodyId = null,
    unitsTextId = null,
    eventBus = null
  } = {}) {
    this.id = id;
    this.oreType = oreType;
    this.oreName = oreName;
    this.imageSrc = imageSrc;
    this.x = x;
    this.y = y;
    this.baseWidth = baseWidth;
    this.angle = Math.random() * Math.PI * 2; // Orientação angular inicial natural
    this.rotationSpeed = rotationSpeed;
    this.bus = eventBus;

    // Configuração de Recursos do Asteroide
    this.maxUnits = maxUnits;
    this.currentUnits = maxUnits;
    this.isDepleted = false;
    this.depletedAt = null;
    this.respawnCooldownMs = RESPAWN_COOLDOWN_MS;

    // Chave de persistência local individualizada
    this.storageKey = storageKey || (oreType === 'ferrox' && (id === 1 || id === '1') ? 'harpia_asteroid_ferrox_v1' : `harpia_asteroid_${oreType}_${id}`);

    // Identificadores de DOM
    this.wrapId = wrapId || (oreType === 'ferrox' && (id === 1 || id === '1') ? 'asteroid-wrap' : `asteroid-wrap-${oreType}-${id}`);
    this.bodyId = bodyId || (oreType === 'ferrox' && (id === 1 || id === '1') ? 'asteroid-body' : `asteroid-body-${oreType}-${id}`);
    this.unitsTextId = unitsTextId || (oreType === 'ferrox' && (id === 1 || id === '1') ? 'ast-units-text' : `ast-units-text-${oreType}-${id}`);

    // Dinâmica de Escala e Opacidade com Transição Suave (Lerp)
    this.currentScale = 1.0;
    this.targetScale = 1.0;
    this.currentOpacity = 1.0;
    this.targetOpacity = 1.0;

    // Elementos DOM em Cache
    this.wrapEl = null;
    this.bodyEl = null;
    this.imgEl = null;
    this.unitsTextEl = null;

    this._ensureDomElement();
    this._loadState();
    this._updateHudTag();
  }

  /**
   * Garante a existência do elemento DOM no mundo do jogo
   */
  _ensureDomElement() {
    let wrap = document.getElementById(this.wrapId);
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = this.wrapId;
      wrap.className = 'asteroid-wrap';
      wrap.innerHTML = `
        <div class="asteroid-body" id="${this.bodyId}">
          <img src="${this.imageSrc}" alt="${this.oreName} Asteroid" class="asteroid-img">
        </div>
        <div class="asteroid-hover-units" id="${this.unitsTextId}">${this.maxUnits} / ${this.maxUnits} U</div>
      `;

      const gameWorld = document.getElementById('game-world');
      const lasersLayer = document.getElementById('mining-lasers-layer');
      if (lasersLayer && gameWorld) {
        gameWorld.insertBefore(wrap, lasersLayer);
      } else if (gameWorld) {
        gameWorld.appendChild(wrap);
      }
    }

    this.wrapEl = wrap;
    this.bodyEl = wrap.querySelector('.asteroid-body') || document.getElementById(this.bodyId);
    this.imgEl = wrap.querySelector('.asteroid-img');
    this.unitsTextEl = wrap.querySelector('.asteroid-hover-units') || document.getElementById(this.unitsTextId);
  }

  /**
   * Carrega o estado salvo no LocalStorage para manter integridade entre sessões
   */
  _loadState() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && typeof data.currentUnits === 'number') {
          this.currentUnits = Math.max(0, Math.min(this.maxUnits, data.currentUnits));
          this.isDepleted = !!data.isDepleted;
          this.depletedAt = data.depletedAt ? Number(data.depletedAt) : null;

          // Se estava depleted, verificar se já decorreram os 60 minutos
          if (this.isDepleted && this.depletedAt) {
            const elapsed = Date.now() - this.depletedAt;
            if (elapsed >= this.respawnCooldownMs) {
              // Já decorreram 60 minutos -> Respawn imediato
              this.respawn(false);
              return;
            } else {
              // Ainda em cooldown de respawn
              this.currentUnits = 0;
              this.currentScale = 0.0;
              this.targetScale = 0.0;
              this.currentOpacity = 0.0;
              this.targetOpacity = 0.0;
              this._updateHudTag();
              return;
            }
          }
        }
      }
    } catch (e) {
      console.warn(`[AsteroidEntity ${this.oreType}#${this.id}] Falha ao ler estado do storage:`, e);
    }

    this._syncTargets();
    this.currentScale = this.targetScale;
    this.currentOpacity = this.targetOpacity;
    this._updateHudTag();
  }

  /**
   * Salva o estado atual do asteroide no LocalStorage
   */
  _saveState() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({
        currentUnits: this.currentUnits,
        maxUnits: this.maxUnits,
        isDepleted: this.isDepleted,
        depletedAt: this.depletedAt
      }));
    } catch (e) {}
  }

  /**
   * Calcula a escala alvo com base nas unidades restantes:
   * - 60 unidades -> 1.0 (100% de escala)
   * - 1 unidade -> ~0.30 (tamanho mínimo antes de colapsar)
   * - 0 unidades (Depleted) -> 0.0 e opacidade 0.0 (desaparece)
   */
  _syncTargets() {
    if (this.isDepleted || this.currentUnits <= 0) {
      this.targetScale = 0.0;
      this.targetOpacity = 0.0;
    } else {
      const ratio = this.currentUnits / this.maxUnits;
      this.targetScale = 0.28 + 0.72 * ratio;
      this.targetOpacity = 1.0;
    }
  }

  /**
   * Minera uma quantidade de unidades do asteroide
   * @param {number} [amount=1]
   * @returns {number} Unidades efetivamente extraídas
   */
  mineUnit(amount = 1) {
    if (this.isDepleted || this.currentUnits <= 0) {
      return 0;
    }

    const taken = Math.min(amount, this.currentUnits);
    this.currentUnits -= taken;

    if (this.currentUnits <= 0) {
      this.currentUnits = 0;
      this.isDepleted = true;
      this.depletedAt = Date.now();
      this.targetScale = 0.0;
      this.targetOpacity = 0.0;

      if (this.bus) {
        this.bus.emit(EV.HUD_TOAST, {
          message: `${this.oreName.toUpperCase()} ASTEROID DEPLETED • Respawn scheduled in 60 minutes`,
          type: 'warning'
        });
      }
    } else {
      this._syncTargets();
    }

    this._saveState();
    this._updateHudTag();
    return taken;
  }

  /**
   * Alias para mineUnit
   * @param {number} [amount=1]
   */
  extractOre(amount = 1) {
    return this.mineUnit(amount);
  }

  /**
   * Sincronização autoritativa vinda do Servidor Multiplayer
   * @param {number} currentUnits 
   * @param {boolean} isDepleted 
   */
  applyServerUnits(currentUnits, isDepleted = false) {
    this.currentUnits = Math.max(0, Math.min(this.maxUnits, Number(currentUnits) || 0));
    this.isDepleted = isDepleted || this.currentUnits <= 0;

    if (this.isDepleted) {
      this.currentUnits = 0;
      this.targetScale = 0.0;
      this.targetOpacity = 0.0;
    } else {
      this._syncTargets();
      if (this.wrapEl) {
        this.wrapEl.style.display = 'flex';
      }
    }

    this._saveState();
    this._updateHudTag();
  }

  /**
   * Executa o respawn do asteroide regenerando as 60 unidades completas
   * @param {boolean} [notify=true] Se deve emitir toast e efeito sonoro
   */
  respawn(notify = true) {
    this.currentUnits = this.maxUnits; // 60
    this.isDepleted = false;
    this.depletedAt = null;

    this.currentScale = 0.1;
    this.currentOpacity = 0.0;
    this.targetScale = 1.0;
    this.targetOpacity = 1.0;

    this._saveState();
    this._updateHudTag();

    if (this.wrapEl) {
      this.wrapEl.style.display = 'flex';
    }

    if (notify) {
      playSciFiBeep(960, 0.4, 'sine', 0.25);
      if (this.bus) {
        this.bus.emit(EV.HUD_TOAST, {
          message: `SENSOR DETECTION • ${this.oreName} Asteroid regenerated and detected (${this.maxUnits}/${this.maxUnits} Units)!`,
          type: 'info'
        });
      }
    }
  }

  /**
   * Retorna os milissegundos restantes para o respawn
   * @returns {number}
   */
  getRemainingRespawnTime() {
    if (!this.isDepleted || !this.depletedAt) return 0;
    const elapsed = Date.now() - this.depletedAt;
    return Math.max(0, this.respawnCooldownMs - elapsed);
  }

  /**
   * Atualiza o indicador de unidades no centro do asteroide (apenas unidades 60 / 60 U)
   */
  _updateHudTag() {
    if (!this.unitsTextEl) {
      this.unitsTextEl = document.getElementById(this.unitsTextId);
    }

    if (this.unitsTextEl) {
      if (this.isDepleted) {
        this.unitsTextEl.textContent = `0 / ${this.maxUnits} U`;
      } else {
        this.unitsTextEl.textContent = `${this.currentUnits} / ${this.maxUnits} U`;
      }
    }
  }

  /**
   * Atualiza a lógica de respawn e a interpolação ultra suave de rotação, escala e opacidade
   * @param {number} dt Delta-time em segundos
   */
  update(dt) {
    // 1. Rotação axial contínua suave
    this.angle += this.rotationSpeed * dt;
    if (this.angle >= Math.PI * 2) {
      this.angle -= Math.PI * 2;
    }

    // 2. Verificação periódica de Respawn (cooldown de 60 minutos)
    if (this.isDepleted) {
      const remainingMs = this.getRemainingRespawnTime();
      if (remainingMs <= 0) {
        this.respawn(true);
      } else {
        this._updateHudTag();
      }
    }

    // 3. Interpolação suave e progressiva de escala e opacidade (GPU friendly)
    const lerpRate = Math.min(1.0, dt * 2.8);
    this.currentScale += (this.targetScale - this.currentScale) * lerpRate;
    this.currentOpacity += (this.targetOpacity - this.currentOpacity) * lerpRate;

    // 4. Se estiver totalmente depleted e transparente, ocultar elemento do DOM
    if (!this.wrapEl) {
      this.wrapEl = document.getElementById(this.wrapId);
    }
    if (this.wrapEl) {
      if (this.isDepleted && this.currentOpacity <= 0.01) {
        this.wrapEl.style.display = 'none';
      } else {
        this.wrapEl.style.display = 'flex';
        this.wrapEl.style.opacity = Math.max(0, Math.min(1, this.currentOpacity)).toFixed(3);
      }
    }
  }

  /**
   * Renderiza o asteroide na câmara espacial com projeção, rotação axial e escala progressiva
   * @param {import('../core/Camera2D.js').Camera2D} camera
   */
  render(camera) {
    if (!this.wrapEl) {
      this.wrapEl = document.getElementById(this.wrapId);
      this.bodyEl = document.getElementById(this.bodyId);
    }
    if (!this.wrapEl) return;

    if (this.isDepleted && this.currentOpacity <= 0.01) {
      return;
    }

    const ratio = camera.zoomRatio;
    const scaledWidth = Math.round(this.baseWidth * ratio * Math.max(0.01, this.currentScale));
    this.wrapEl.style.width = scaledWidth + 'px';
    this.wrapEl.style.height = scaledWidth + 'px';

    const offsetX = Math.round((this.x - camera.x) * ratio);
    const offsetY = Math.round((this.y - camera.y) * ratio);

    this.wrapEl.style.transform = `translate3d(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px), 0)`;

    if (this.bodyEl) {
      const deg = (this.angle * (180 / Math.PI)) % 360;
      this.bodyEl.style.transform = `rotate(${deg.toFixed(2)}deg)`;
    }
  }
}
