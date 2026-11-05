/**
 * HARPIA Universe - ShipNavHud
 * HUD Tatico de Navegacao da Nave (Posicionado no fundo da tela centrado)
 * Apresenta em tempo real:
 * - Arco Esquerdo: Escudo (Shield % e valor 1,250 / 1,250)
 * - Arco Direito: Casco (Hull % e valor 1000 / 1,000)
 * - Reticulo central com aneis, crosshairs e silhueta holografica da nave com propulsores
 * - Velocidade digital dinamica (m/s) e chevrons de propulsao animados
 */
import { UIComponent } from '../core/UIComponent.js';
import { EV } from '../../core/EventBus.js';

export class ShipNavHud extends UIComponent {
  /**
   * @param {Object} options
   * @param {import('../../core/EventBus.js').EventBus} options.eventBus
   * @param {import('../../entities/ShipEntity.js').ShipEntity} [options.ship]
   */
  constructor({ eventBus, ship = null }) {
    super();
    this.bus = eventBus;
    this.ship = ship;

    this.displaySpeed = 0;
    this.speedTextEl = null;
    this.chevronsEl = null;
    this.flamesEl = null;
    this.shieldPctEl = null;
    this.shieldValEl = null;
    this.hullPctEl = null;
    this.hullValEl = null;
    this.modeEl = null;

    this.isVisible = true;
  }

  mount(container) {
    if (this.root) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'ship-nav-hud';
    wrapper.id = 'ship-nav-hud';

    wrapper.innerHTML = `
      <svg class="ship-nav-svg" viewBox="0 0 440 250" preserveAspectRatio="xMidYMid meet">
        <defs>
          <!-- Filtro de Glow Holografico Cyan -->
          <filter id="nav-glow-cyan" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <!-- Filtro de Glow Holografico Orange -->
          <filter id="nav-glow-orange" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <!-- Gradiente do Propulsor da Silhueta -->
          <linearGradient id="thruster-plasma-nav" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ffffff" />
            <stop offset="35%" stop-color="#00f0ff" />
            <stop offset="80%" stop-color="#0066ff" stop-opacity="0.8" />
            <stop offset="100%" stop-color="#0022ff" stop-opacity="0" />
          </linearGradient>
        </defs>

        <!-- ── RETICULOS CENTRAIS E ANEIS TATICOS ── -->
        <g class="nav-reticle-group" opacity="0.85">
          <!-- Anel Exterior Fino -->
          <circle cx="220" cy="125" r="74" fill="none" stroke="rgba(0, 212, 255, 0.3)" stroke-width="1.2" />
          <!-- Anel Interior Fino -->
          <circle cx="220" cy="125" r="52" fill="none" stroke="rgba(0, 212, 255, 0.22)" stroke-width="1" />
          
          <!-- Crosshairs Cardinais -->
          <line x1="146" y1="125" x2="168" y2="125" stroke="rgba(0, 212, 255, 0.45)" stroke-width="1" />
          <line x1="272" y1="125" x2="294" y2="125" stroke="rgba(0, 212, 255, 0.45)" stroke-width="1" />
          <line x1="220" y1="51" x2="220" y2="73" stroke="rgba(0, 212, 255, 0.45)" stroke-width="1" />

          <!-- Marcadores de Horizonte Artificial / Flight Director -->
          <!-- Marcador esquerdo azul (chevron) -->
          <path d="M178,172 L185,166 L192,172" fill="none" stroke="#00d4ff" stroke-width="2" filter="url(#nav-glow-cyan)" />
          <!-- Marcador direito laranja (chevron) -->
          <path d="M248,172 L255,166 L262,172" fill="none" stroke="#ff7700" stroke-width="2" filter="url(#nav-glow-orange)" />
          <!-- Pip circular de mira -->
          <circle cx="152" cy="88" r="2.5" fill="#00d4ff" filter="url(#nav-glow-cyan)" />
          <line x1="147" y1="88" x2="157" y2="88" stroke="#00d4ff" stroke-width="1.5" />
        </g>

        <!-- ── TOPO: INDICADOR DE MODO / GEAR ── -->
        <g class="nav-top-mode">
          <path d="M206,36 A94 94 0 0 0 196,40" fill="none" stroke="#00a8ff" stroke-width="3" stroke-linecap="round" filter="url(#nav-glow-cyan)" />
          <text x="220" y="38" class="nav-mode-text" id="nav-mode-text" text-anchor="middle">1</text>
          <path d="M234,36 A94 94 0 0 1 244,40" fill="none" stroke="#ff7700" stroke-width="3" stroke-linecap="round" filter="url(#nav-glow-orange)" />
        </g>

        <!-- ── ARCO ESQUERDO: ESCUDO (SHIELD) ── -->
        <g class="nav-shield-arc" filter="url(#nav-glow-cyan)">
          <!-- Segmento 1 (Superior) -->
          <path d="M171,48 A94 94 0 0 0 138,82" fill="none" stroke="#00a8ff" stroke-width="9" stroke-linecap="round" class="shield-bar-seg-1" />
          <!-- Segmento 2 (Medio) -->
          <path d="M135,87 A94 94 0 0 0 126,128" fill="none" stroke="#00a8ff" stroke-width="9" stroke-linecap="round" class="shield-bar-seg-2" />
          <!-- Segmento 3 (Inferior) -->
          <path d="M127,133 A94 94 0 0 0 144,175" fill="none" stroke="#00a8ff" stroke-width="9" stroke-linecap="round" class="shield-bar-seg-3" />

          <!-- Suporte Exterior com Notcha Angular -->
          <path d="M176,43 L162,56" fill="none" stroke="#00d4ff" stroke-width="1.5" />
          <path d="M123,73 L114,64 L104,64" fill="none" stroke="#00d4ff" stroke-width="1.5" />
          <path d="M123,74 A106 106 0 0 0 137,185 L144,188" fill="none" stroke="rgba(0, 212, 255, 0.45)" stroke-width="1.2" />
        </g>

        <!-- ── ARCO DIREITO: CASCO (HULL) ── -->
        <g class="nav-hull-arc" filter="url(#nav-glow-orange)">
          <!-- Segmento 1 (Superior) -->
          <path d="M269,48 A94 94 0 0 1 302,82" fill="none" stroke="#ff6b00" stroke-width="9" stroke-linecap="round" class="hull-bar-seg-1" />
          <!-- Segmento 2 (Medio) -->
          <path d="M305,87 A94 94 0 0 1 314,128" fill="none" stroke="#ff6b00" stroke-width="9" stroke-linecap="round" class="hull-bar-seg-2" />
          <!-- Segmento 3 (Inferior) -->
          <path d="M313,133 A94 94 0 0 1 296,175" fill="none" stroke="#ff6b00" stroke-width="9" stroke-linecap="round" class="hull-bar-seg-3" />

          <!-- Suporte Exterior com Notcha Angular -->
          <path d="M264,43 L278,56" fill="none" stroke="#ff7700" stroke-width="1.5" />
          <path d="M317,73 L326,64 L336,64" fill="none" stroke="#ff7700" stroke-width="1.5" />
          <path d="M317,74 A106 106 0 0 1 303,185 L296,188" fill="none" stroke="rgba(255, 119, 0, 0.45)" stroke-width="1.2" />
        </g>

        <!-- ── TEXTOS LATERAIS: SHIELD & HULL ── -->
        <g class="nav-text-block nav-shield-text">
          <text x="96" y="68" class="nav-label" text-anchor="middle">Shield</text>
          <text x="96" y="94" class="nav-percent nav-shield-pct" id="nav-shield-pct" text-anchor="middle">100%</text>
          <text x="96" y="112" class="nav-fraction nav-shield-val" id="nav-shield-val" text-anchor="middle">(1,250 / 1,250)</text>
        </g>

        <g class="nav-text-block nav-hull-text">
          <text x="344" y="68" class="nav-label" text-anchor="middle">Hull</text>
          <text x="344" y="94" class="nav-percent nav-hull-pct" id="nav-hull-pct" text-anchor="middle">100%</text>
          <text x="344" y="112" class="nav-fraction nav-hull-val" id="nav-hull-val" text-anchor="middle">(1,000 / 1,000)</text>
        </g>

        <!-- ── SILHUETA DA NAVE H-M2 NO CENTRO COM PROPULSORES ── -->
        <g class="nav-center-ship" transform="translate(220, 125)">
          <!-- Chamas dos Propulsores Plasma (sob a nave) -->
          <g id="nav-thruster-flames" class="nav-thruster-flames">
            <!-- Motor Esquerdo -->
            <path d="M-6,14 L-4,28 L-2,14 Z" fill="url(#thruster-plasma-nav)" filter="url(#nav-glow-cyan)" />
            <!-- Motor Direito -->
            <path d="M2,14 L4,28 L6,14 Z" fill="url(#thruster-plasma-nav)" filter="url(#nav-glow-cyan)" />
          </g>

          <!-- Silhueta Vetorial Estilizada AAA da Nave H-M2 Miner -->
          <path class="nav-ship-silhouette" d="
            M0,-24 
            L3,-15 L4,-8 L7,1 L13,1 L18,7 L20,13 L17,14 L14,11 L10,13 L8,9 L6,14 L3,14 L2,10 
            L-2,10 L-3,14 L-6,14 L-8,9 L-10,13 L-14,11 L-17,14 L-20,13 L-18,7 L-13,1 L-7,1 L-4,-8 L-3,-15 Z
          " fill="#142838" stroke="#00f0ff" stroke-width="1.4" filter="url(#nav-glow-cyan)" />
          
          <!-- Linhas de Cockpit e Estrutura -->
          <line x1="0" y1="-20" x2="0" y2="4" stroke="#ffffff" stroke-width="1" opacity="0.8" />
          <polygon points="0,-16 2,-11 -2,-11" fill="#00ffff" />
          <polygon points="0,-3 3,4 -3,4" fill="#00d4ff" opacity="0.8" />
        </g>

        <!-- ── PARTE INFERIOR: VELOCIDADE E CHEVRONS DE PROPULSAO ── -->
        <g class="nav-bottom-speed">
          <!-- Arco de Berco Inferior -->
          <path d="M152,185 A94 94 0 0 0 288,185" fill="none" stroke="rgba(0, 212, 255, 0.45)" stroke-width="1.5" />
          
          <!-- Leitura Digital de Velocidade -->
          <text x="220" y="208" class="nav-speed-display" id="nav-speed-display" text-anchor="middle">
            <tspan id="nav-speed-number" class="nav-speed-num">0</tspan>
            <tspan class="nav-speed-unit"> m/s</tspan>
          </text>

          <!-- Chevrons de Propulsao >>> -->
          <g class="nav-chevrons" id="nav-chevrons" filter="url(#nav-glow-cyan)">
            <path d="M211,218 L215,222 L211,226" fill="none" stroke="#00d4ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="chev chev-1" />
            <path d="M218,218 L222,222 L218,226" fill="none" stroke="#00d4ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="chev chev-2" />
            <path d="M225,218 L229,222 L225,226" fill="none" stroke="#00d4ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="chev chev-3" />
          </g>
        </g>
      </svg>
      <!-- Slot de Notificação Flutuante por cima do Hull da Nave -->
      <div class="nav-hull-floating-slot" id="nav-hull-floating-slot"></div>

      <!-- Botões de Ação Táticos (APPROACH e WARP) posicionados à esquerda do HUD -->
      <div class="nav-action-btns" id="nav-action-btns">
        <button type="button" class="nav-action-btn nav-btn-approach" id="nav-btn-approach" title="Aproximar do alvo selecionado">
          <span class="nav-btn-icon">⟶</span>
          <span class="nav-btn-label">APPROACH</span>
        </button>
        <button type="button" class="nav-action-btn nav-btn-warp" id="nav-btn-warp" title="Warp para o alvo selecionado (> 1500m)">
          <span class="nav-btn-icon">⚡</span>
          <span class="nav-btn-label">WARP TO</span>
        </button>
      </div>
    `;

    container.appendChild(wrapper);
    this.root = wrapper;

    this.speedTextEl = wrapper.querySelector('#nav-speed-number');
    this.chevronsEl = wrapper.querySelector('#nav-chevrons');
    this.flamesEl = wrapper.querySelector('#nav-thruster-flames');
    this.shieldPctEl = wrapper.querySelector('#nav-shield-pct');
    this.shieldValEl = wrapper.querySelector('#nav-shield-val');
    this.hullPctEl = wrapper.querySelector('#nav-hull-pct');
    this.hullValEl = wrapper.querySelector('#nav-hull-val');
    this.modeEl = wrapper.querySelector('#nav-mode-text');
    this.floatingSlotEl = wrapper.querySelector('#nav-hull-floating-slot');
    this.navBtnApproach = wrapper.querySelector('#nav-btn-approach');
    this.navBtnWarp = wrapper.querySelector('#nav-btn-warp');

    // Bloquear propagação de eventos de clique para o canvas do jogo
    const navActionBtns = wrapper.querySelector('#nav-action-btns');
    if (navActionBtns) {
      ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'click', 'contextmenu'].forEach(evt => {
        navActionBtns.addEventListener(evt, e => e.stopPropagation());
      });
    }

    // Estado do alvo selecionado no HUD
    this._currentTarget = null;
    this._canWarp = false;

    this.bindEvents();
  }

  bindEvents() {
    if (!this.bus) return;

    // Texto flutuante sobre o Hull da nave
    const unsubFloat = this.bus.on('hud:hull_float_text', ({ text = '+1 Ferrox' } = {}) => {
      this.showFloatingHullText(text);
    });
    this.addCleanup(unsubFloat);

    // Alvo selecionado no Tactical Overview → acende / apaga os botões APPROACH e WARP
    const unsubTarget = this.bus.on('hud:target_selected', ({ target, canWarp, canApproach }) => {
      this._currentTarget = target;
      this._canWarp = canWarp;

      if (this.navBtnApproach) {
        this.navBtnApproach.classList.toggle('nav-btn-lit', !!target && canApproach);
        this.navBtnApproach.disabled = !target || !canApproach;
      }
      if (this.navBtnWarp) {
        this.navBtnWarp.classList.toggle('nav-btn-lit', !!target && canWarp);
        this.navBtnWarp.classList.toggle('nav-btn-warp-ready', !!target && canWarp);
        this.navBtnWarp.disabled = !target || !canWarp;
      }
    });
    this.addCleanup(unsubTarget);

    // Clique no APPROACH → move nave para o alvo
    if (this.navBtnApproach) {
      this.navBtnApproach.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this._currentTarget || !this.ship) return;
        this.ship.setDestination(this._currentTarget.x ?? 0, this._currentTarget.y ?? 0);
        if (this.bus) this.bus.emit('hud:toast', {
          message: `ALIGN & APPROACH • ${this._currentTarget.name}`,
          type: 'info'
        });
      });
    }

    // Clique no WARP → inicia warp para o alvo
    if (this.navBtnWarp) {
      this.navBtnWarp.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this._currentTarget || !this.ship || !this._canWarp) return;
        this.ship.warpTo(this._currentTarget.x ?? 0, this._currentTarget.y ?? 0, this._currentTarget.name);
      });
    }

    // Ocultar ao entrar na estacao (quando o hangar overlay se ativa)
    const unsubDocking = this.bus.on(EV.STATION_DOCKING, () => this.hide());
    const unsubDocked = this.bus.on(EV.STATION_DOCKED, () => this.hide());
    this.addCleanup(unsubDocking);
    this.addCleanup(unsubDocked);

    // Reexibir ao sair no espaco exterior
    const unsubUndock = this.bus.on(EV.STATION_UNDOCK, () => this.show());
    this.addCleanup(unsubUndock);

    // Controle em inicio e saida de sessao
    const unsubStart = this.bus.on(EV.GAME_START, () => this.show());
    const unsubExit = this.bus.on(EV.GAME_EXIT, () => this.hide());
    this.addCleanup(unsubStart);
    this.addCleanup(unsubExit);
  }

  /**
   * Atualizacao ultra suave chamada no loop de renderizacao da engine
   * @param {import('../../entities/ShipEntity.js').ShipEntity} ship
   */
  render(ship = this.ship) {
    if (!this.root || !this.isVisible) return;
    if (!ship) return;

    // 1. Interpola suavemente a velocidade digital
    const targetSpeed = Math.round(ship.currentSpeed || 0);
    this.displaySpeed += (targetSpeed - this.displaySpeed) * 0.2;
    const roundedSpeed = Math.round(this.displaySpeed);

    if (this.speedTextEl) {
      this.speedTextEl.textContent = roundedSpeed;
    }

    // 2. Feedback visual dos propulsores e chevrons
    const isThrusting = (ship.isMoving && targetSpeed > 10);
    if (this.chevronsEl) {
      if (isThrusting) {
        this.chevronsEl.classList.add('active');
      } else {
        this.chevronsEl.classList.remove('active');
      }
    }

    if (this.flamesEl) {
      if (isThrusting) {
        this.flamesEl.classList.add('firing');
      } else {
        this.flamesEl.classList.remove('firing');
      }
    }

    // 3. Atualizacao de escudo e casco
    if (this.shieldPctEl && ship.shieldMax) {
      const shieldPct = Math.round((ship.shield / ship.shieldMax) * 100);
      this.shieldPctEl.textContent = `${shieldPct}%`;
      if (this.shieldValEl) {
        this.shieldValEl.textContent = `(${ship.shield.toLocaleString()} / ${ship.shieldMax.toLocaleString()})`;
      }
    }

    if (this.hullPctEl && ship.hullMax) {
      const hullPct = Math.round((ship.hull / ship.hullMax) * 100);
      this.hullPctEl.textContent = `${hullPct}%`;
      if (this.hullValEl) {
        this.hullValEl.textContent = `(${ship.hull.toLocaleString()} / ${ship.hullMax.toLocaleString()})`;
      }
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

  /**
   * Spawna notificação flutuante que sobe suavemente por cima do Hull da nave e desaparece
   * @param {string} text Texto a apresentar (ex: '+1 Ferrox')
   */
  showFloatingHullText(text = '+1 Ferrox') {
    if (!this.root) return;

    let slot = this.floatingSlotEl;
    if (!slot) {
      slot = this.root.querySelector('#nav-hull-floating-slot');
      this.floatingSlotEl = slot;
    }
    if (!slot) return;

    const el = document.createElement('div');
    el.className = 'hull-float-notification';
    el.innerHTML = `<span class="float-plus">+1</span> <span class="float-ore">${text.replace('+1', '').trim() || 'Ferrox'}</span>`;

    slot.appendChild(el);

    // Auto-remoção após o término da animação
    el.addEventListener('animationend', () => el.remove());
    setTimeout(() => {
      if (el.parentNode) el.remove();
    }, 1600);
  }
}
