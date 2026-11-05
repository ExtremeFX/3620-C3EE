/**
 * HARPIA Universe - GalaxyStarmap
 * Mapa Galáctico Tático Interativo (Tecla 'M')
 * - Renderização em Canvas 2D acelerado com nós de sistemas estelares, hiper-rotas e nebulosas
 * - Navegação fluida com Pan & Zoom
 * - Filtragem interativa por tipo de minério (Ferrox, Crynex, Varelium)
 * - Painel tático lateral com telemetria do sistema, segurança e traçado de rotas
 */
import { UIComponent } from '../ui/core/UIComponent.js';
import { EV } from '../core/EventBus.js';
import { 
  GALAXY_SYSTEMS, 
  GALAXY_ROUTES, 
  SECURITY_COLORS,
  getGalaxySystem,
  getCurrentSystemId,
  setCurrentSystemId,
  getSystemWorldCoordinates
} from './GalaxyData.js';
import { playTargetLockSound, playTacticalCommandSound } from '../core/audio.js';

export class GalaxyStarmap extends UIComponent {
  /**
   * @param {Object} options
   * @param {import('../core/EventBus.js').EventBus} options.eventBus
   * @param {import('../entities/ShipEntity.js').ShipEntity} [options.ship]
   */
  constructor({ eventBus, ship = null }) {
    super();
    this.bus = eventBus;
    this.ship = ship;

    this.isOpen = false;
    this.isInGame = false;

    // Foco e transformação da câmara do mapa
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1.0;
    this.minZoom = 0.55;
    this.maxZoom = 2.4;

    // Interação
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.hoveredSystem = null;
    this.selectedSystem = getGalaxySystem(getCurrentSystemId());
    this.activeFilter = 'ALL'; // 'ALL' | 'ferrox' | 'crynex' | 'varelium'

    // Animação contínua
    this.animFrameId = null;
    this.pulseTimer = 0;

    // Elementos DOM em cache
    this.canvas = null;
    this.ctx = null;
    this.detailsPanelEl = null;
  }

  mount(container) {
    if (this.root) return;

    const wrap = document.createElement('div');
    wrap.className = 'galaxy-map-overlay';
    wrap.id = 'galaxy-map-overlay';
    wrap.style.display = 'none';

    wrap.innerHTML = `
      <!-- Cabeçalho Tático Superior -->
      <div class="galaxy-map-header">
        <div class="galaxy-header-left">
          <span class="galaxy-radar-glyph">⌖</span>
          <div class="galaxy-title-block">
            <span class="galaxy-main-title">GALAXY STARMAP</span>
            <span class="galaxy-sub-title">CARTOGRAFIA ESTELAR • DOMINIONS & THE GREAT VOID</span>
          </div>
        </div>

        <!-- Filtros Rápidos de Recursos -->
        <div class="galaxy-filters-bar">
          <span class="filter-label">FILTRAR MINÉRIO:</span>
          <button type="button" class="filter-btn active" data-filter="ALL">TODOS</button>
          <button type="button" class="filter-btn filter-ferrox" data-filter="ferrox">FERROX</button>
          <button type="button" class="filter-btn filter-crynex" data-filter="crynex">CRYNEX</button>
          <button type="button" class="filter-btn filter-varelium" data-filter="varelium">VARELIUM</button>
        </div>

        <div class="galaxy-header-right">
          <button type="button" class="galaxy-btn-recenter" id="galaxy-btn-recenter" title="Recentrar em Harpia Prime">
            ◈ RECENTRAR
          </button>
          <button type="button" class="galaxy-btn-close" id="galaxy-btn-close" title="Fechar Mapa (M / ESC)">
            ✕ FECHAR [M]
          </button>
        </div>
      </div>

      <!-- Canvas Interativo do Mapa -->
      <canvas class="galaxy-map-canvas" id="galaxy-map-canvas"></canvas>

      <!-- Legenda de Segurança Inferior Esquerda -->
      <div class="galaxy-map-legend">
        <div class="legend-item"><span class="leg-dot high"></span> HIGH-SEC (1.0 - 0.8)</div>
        <div class="legend-item"><span class="leg-dot low"></span> LOW-SEC (0.7 - 0.4)</div>
        <div class="legend-item"><span class="leg-dot null"></span> NULL-SEC (0.3 - 0.0)</div>
      </div>

      <!-- Atalhos e Instruções no Fundo -->
      <div class="galaxy-map-help">
        <span>ARRASTAR: Mover Mapa</span> • <span>RODA: Zoom</span> • <span>CLIQUE: Selecionar Sistema</span> • <span>[M]: Fechar</span>
      </div>

      <!-- Painel Lateral de Detalhes do Sistema Selecionado -->
      <div class="galaxy-details-panel" id="galaxy-details-panel">
        <div class="details-header">
          <div class="details-sys-name" id="details-sys-name">HARPIA PRIME</div>
          <div class="details-sec-badge" id="details-sec-badge">1.0 HIGH-SEC</div>
        </div>

        <div class="details-body">
          <div class="details-meta-row">
            <span class="d-label">REGIÃO:</span>
            <span class="d-val" id="details-region">Dominion Core</span>
          </div>
          <div class="details-meta-row">
            <span class="d-label">CÓDIGO:</span>
            <span class="d-val" id="details-sector">SEC-0014</span>
          </div>
          <div class="details-meta-row">
            <span class="d-label">STATUS:</span>
            <span class="d-val highlight" id="details-status">📍 LOCALIZAÇÃO ATUAL</span>
          </div>
          <div class="details-meta-row">
            <span class="d-label">ECONOMIA:</span>
            <span class="d-val" id="details-tier">Tier I - Hub Primário</span>
          </div>

          <div class="details-section-divider"></div>

          <div class="details-section-title">RECURSOS DETETADOS</div>
          <div class="details-minerals-list" id="details-minerals-list"></div>

          <div class="details-section-divider"></div>

          <div class="details-section-title">CORPOS CELESTIAIS & INSTALAÇÕES</div>
          <div class="details-stations-text" id="details-stations-text"></div>

          <div class="details-section-divider"></div>

          <div class="details-description" id="details-description"></div>
        </div>

        <div class="details-actions">
          <button type="button" class="btn-set-destination" id="btn-set-destination">
            ⌖ TRAÇAR ROTA DE SALTO
          </button>
        </div>
      </div>
    `;

    container.appendChild(wrap);
    this.root = wrap;

    this.canvas = wrap.querySelector('#galaxy-map-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.detailsPanelEl = wrap.querySelector('#galaxy-details-panel');

    this._resizeCanvas();
    this.bindEvents();
    this._updateDetailsPanel();
  }

  _resizeCanvas() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  bindEvents() {
    if (!this.root || !this.canvas) return;

    // Redimensionamento de janela
    const onResize = () => {
      this._resizeCanvas();
      if (this.isOpen) this._renderFrame();
    };
    window.addEventListener('resize', onResize);
    this.addCleanup(() => window.removeEventListener('resize', onResize));

    // Fechar mapa
    const btnClose = this.root.querySelector('#galaxy-btn-close');
    if (btnClose) {
      btnClose.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
      });
    }

    // Recentrar
    const btnRecenter = this.root.querySelector('#galaxy-btn-recenter');
    if (btnRecenter) {
      btnRecenter.addEventListener('click', (e) => {
        e.stopPropagation();
        this.recenter();
      });
    }

    // Filtros de minério
    const filterBtns = this.root.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeFilter = btn.getAttribute('data-filter') || 'ALL';
        playTacticalCommandSound();
        this._renderFrame();
      });
    });

    // Traçar Rota de Warp (Ação do Painel Lateral)
    const btnDest = this.root.querySelector('#btn-set-destination');
    if (btnDest) {
      btnDest.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this.selectedSystem) return;

        const curId = getCurrentSystemId();
        if (this.selectedSystem.id === curId) {
          this.bus.emit(EV.HUD_TOAST, {
            message: `JÁ TE ENCONTRAS EM ${this.selectedSystem.name.toUpperCase()} (Setor Atual)`,
            type: 'info'
          });
          return;
        }

        playTacticalCommandSound();
        const worldCoords = getSystemWorldCoordinates(this.selectedSystem);
        const distMeters = this.ship ? Math.hypot(this.ship.x - worldCoords.x, this.ship.y - worldCoords.y) : 50000;
        const distKm = (distMeters / 1000).toFixed(1);

        this.bus.emit('warp:set_interstellar_route', { 
          system: this.selectedSystem,
          worldCoords,
          distKm
        });

        this.bus.emit(EV.HUD_TOAST, {
          message: `ROTA DE WARP TRAÇADA • Rumo a ${this.selectedSystem.name.toUpperCase()} (${distKm} km) | Utiliza o botão no HUD`,
          type: 'success'
        });

        // Fecha o mapa para regressar à navegação espacial com o botão de Warp ativo no HUD
        this.close();
      });
    }

    // Interações com o Canvas (Pan, Zoom, Hover, Click)
    // Usamos hasMoved para distinguir drag (pan) de clique simples (selecionar sistema)
    let mouseDownX = 0;
    let mouseDownY = 0;
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.isDragging = false; // só vira true se o rato se mover
        mouseDownX = e.clientX;
        mouseDownY = e.clientY;
        this.dragStartX = e.clientX - this.panX;
        this.dragStartY = e.clientY - this.panY;
      }
    });

    const onMouseMove = (e) => {
      if (!this.isOpen) return;

      const dx = e.clientX - mouseDownX;
      const dy = e.clientY - mouseDownY;

      if (e.buttons === 1 && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        // É um arrasto real: ativa pan
        this.isDragging = true;
        this.panX = e.clientX - this.dragStartX;
        this.panY = e.clientY - this.dragStartY;
        this._renderFrame();
        return;
      }

      // Detetar hover sobre sistemas
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const hit = this._getSystemAtScreenPos(mouseX, mouseY);
      if (hit !== this.hoveredSystem) {
        this.hoveredSystem = hit;
        this.canvas.style.cursor = hit ? 'pointer' : 'move';
        this._renderFrame();
      }
    };
    window.addEventListener('mousemove', onMouseMove);
    this.addCleanup(() => window.removeEventListener('mousemove', onMouseMove));

    const onMouseUp = () => {
      this.isDragging = false;
    };
    window.addEventListener('mouseup', onMouseUp);
    this.addCleanup(() => window.removeEventListener('mouseup', onMouseUp));

    // Clique simples (sem drag) para selecionar sistema
    this.canvas.addEventListener('click', (e) => {
      if (this.isDragging) return; // foi drag, não clique

      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const hit = this._getSystemAtScreenPos(mouseX, mouseY);
      if (hit) {
        this.selectSystem(hit);
      }
    });

    // Zoom via roda do rato
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
      const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * zoomFactor));

      // Zoom centrado na posição do rato
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - this.canvas.width / 2;
      const mouseY = e.clientY - rect.top - this.canvas.height / 2;

      this.panX -= (mouseX - this.panX) * (newZoom / this.zoom - 1);
      this.panY -= (mouseY - this.panY) * (newZoom / this.zoom - 1);
      this.zoom = newZoom;

      this._renderFrame();
    }, { passive: false });

    // Tecla M e Escape para controlo do mapa
    const onKeyDown = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

      if (e.key === 'm' || e.key === 'M') {
        if (this.isOpen) {
          this.close();
        } else if (this.isInGame && (!this.ship || (!this.ship.isDocked && !this.ship.isDocking))) {
          this.open();
        }
      } else if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    this.addCleanup(() => window.removeEventListener('keydown', onKeyDown));

    // Ouvir comando externo para alternar mapa via EventBus
    const unsubToggle = this.bus.on('galaxy:toggle', () => {
      if (this.isInGame && (!this.ship || (!this.ship.isDocked && !this.ship.isDocking))) {
        this.toggle();
      }
    });
    this.addCleanup(unsubToggle);

    // Sincronizar ciclo de vida do jogo
    const unsubStart = this.bus.on(EV.GAME_START, () => {
      this.isInGame = true;
    });
    const unsubExit = this.bus.on(EV.GAME_EXIT, () => {
      this.isInGame = false;
      this.close();
    });
    const unsubDock = this.bus.on(EV.STATION_DOCKING, () => {
      if (this.isOpen) this.close();
    });

    this.addCleanup(unsubStart);
    this.addCleanup(unsubExit);
    this.addCleanup(unsubDock);
  }

  open() {
    if (this.isOpen || !this.root) return;
    this.isOpen = true;
    document.body.classList.add('galaxy-map-active');
    this.root.style.display = 'flex';
    this._resizeCanvas();
    this.recenter();

    playTargetLockSound();
    this.bus.emit(EV.GALAXY_MAP_OPEN);

    this._startAnimLoop();
  }

  close() {
    if (!this.isOpen || !this.root) return;
    this.isOpen = false;
    document.body.classList.remove('galaxy-map-active');
    this.root.style.display = 'none';

    this._stopAnimLoop();
    playTacticalCommandSound();
    this.bus.emit(EV.GALAXY_MAP_CLOSE);
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  recenter() {
    // Recentra a câmara do mapa no sistema atual
    const curId = getCurrentSystemId();
    const current = getGalaxySystem(curId) || GALAXY_SYSTEMS[0];
    this.zoom = 1.0;
    this.panX = -current.x * this.zoom;
    this.panY = -current.y * this.zoom;
    this.selectSystem(current);
  }

  selectSystem(system) {
    if (!system) return;
    this.selectedSystem = system;
    playTargetLockSound();
    this._updateDetailsPanel();
    this._renderFrame();
  }

  _updateDetailsPanel() {
    if (!this.detailsPanelEl || !this.selectedSystem) return;

    const s = this.selectedSystem;
    const isCurrent = s.id === getCurrentSystemId();

    const nameEl = this.detailsPanelEl.querySelector('#details-sys-name');
    const badgeEl = this.detailsPanelEl.querySelector('#details-sec-badge');
    const regionEl = this.detailsPanelEl.querySelector('#details-region');
    const sectorEl = this.detailsPanelEl.querySelector('#details-sector');
    const statusEl = this.detailsPanelEl.querySelector('#details-status');
    const tierEl = this.detailsPanelEl.querySelector('#details-tier');
    const mineralsListEl = this.detailsPanelEl.querySelector('#details-minerals-list');
    const stationsTextEl = this.detailsPanelEl.querySelector('#details-stations-text');
    const descEl = this.detailsPanelEl.querySelector('#details-description');

    if (nameEl) nameEl.textContent = s.name.toUpperCase();

    if (badgeEl) {
      badgeEl.textContent = `${s.security.toFixed(1)} ${s.securityLevel}-SEC`;
      badgeEl.className = `details-sec-badge sec-${s.securityLevel.toLowerCase()}`;
    }

    if (regionEl) regionEl.textContent = s.region;
    if (sectorEl) sectorEl.textContent = s.sectorCode;

    if (statusEl) {
      if (isCurrent) {
        statusEl.textContent = '📍 LOCALIZAÇÃO ATUAL';
        statusEl.className = 'd-val highlight';
      } else {
        statusEl.textContent = 'SISTEMA REMOTO';
        statusEl.className = 'd-val remote';
      }
    }

    if (tierEl) tierEl.textContent = s.economicTier;

    if (mineralsListEl) {
      mineralsListEl.innerHTML = s.minerals.map(m => {
        let label = m.toUpperCase();
        return `<span class="mineral-badge badge-${m}">◆ ${label}</span>`;
      }).join('');
    }

    if (stationsTextEl) {
      if (s.stations.length > 0) {
        stationsTextEl.innerHTML = `
          <div><strong>Estações em Órbita:</strong> ${s.stations.join(', ')}</div>
          <div><strong>Cinturões de Asteroides:</strong> ${s.asteroidsCount} depósitos cartografados</div>
        `;
      } else {
        stationsTextEl.innerHTML = `
          <div><em>Nenhuma estação orbital operacional detetada.</em></div>
          <div><strong>Cinturões de Asteroides:</strong> ${s.asteroidsCount} depósitos no espaço profundo</div>
        `;
      }
    }

    if (descEl) descEl.textContent = s.description;
  }

  _startAnimLoop() {
    this._stopAnimLoop();
    const loop = (timestamp) => {
      this.pulseTimer = timestamp * 0.003;
      this._renderFrame();
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  _stopAnimLoop() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  _getSystemAtScreenPos(screenX, screenY) {
    if (!this.canvas) return null;
    const cx = this.canvas.width / 2 + this.panX;
    const cy = this.canvas.height / 2 + this.panY;

    // Raio de clique adaptado ao zoom
    const hitRadius = Math.max(16, 20 * this.zoom);

    for (let i = 0; i < GALAXY_SYSTEMS.length; i++) {
      const s = GALAXY_SYSTEMS[i];
      const sx = cx + s.x * this.zoom;
      const sy = cy + s.y * this.zoom;
      const dist = Math.hypot(screenX - sx, screenY - sy);
      if (dist <= hitRadius) {
        return s;
      }
    }
    return null;
  }

  _renderFrame() {
    if (!this.ctx || !this.canvas || !this.isOpen) return;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Fundo espacial profundo com gradiente holográfico
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#01050e';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2 + this.panX;
    const cy = h / 2 + this.panY;

    // ── 1. Grelha Tática Holográfica Sutil ──
    this._drawTacticalGrid(ctx, cx, cy, w, h);

    // ── 2. Rotas de Hiperespaço / Stargates ──
    this._drawRoutes(ctx, cx, cy);

    // ── 3. Sistemas Estelares (Nós Planetários) ──
    this._drawSystems(ctx, cx, cy);
  }

  _drawTacticalGrid(ctx, cx, cy, w, h) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.04)';
    ctx.lineWidth = 1;

    const gridSize = 80 * this.zoom;
    const startX = (cx % gridSize) - gridSize;
    const startY = (cy % gridSize) - gridSize;

    ctx.beginPath();
    for (let x = startX; x < w + gridSize; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = startY; y < h + gridSize; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // Círculos concêntricos de alcance estelar centrados em Harpia Prime
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.07)';
    ctx.setLineDash([4, 6]);
    [200, 380, 560].forEach(r => {
      ctx.beginPath();
      ctx.arc(cx, cy, r * this.zoom, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.restore();
  }

  _drawRoutes(ctx, cx, cy) {
    ctx.save();
    GALAXY_ROUTES.forEach(([fromId, toId]) => {
      const fromSys = getGalaxySystem(fromId);
      const toSys = getGalaxySystem(toId);
      if (!fromSys || !toSys) return;

      const x1 = cx + fromSys.x * this.zoom;
      const y1 = cy + fromSys.y * this.zoom;
      const x2 = cx + toSys.x * this.zoom;
      const y2 = cy + toSys.y * this.zoom;

      // Se ambos ou um dos sistemas pertencer ao filtro ativo
      const matchesFilter = this._systemMatchesFilter(fromSys) && this._systemMatchesFilter(toSys);
      const alpha = matchesFilter ? 0.35 : 0.08;

      // Cor da linha baseada no nível de segurança médio
      const avgSec = (fromSys.security + toSys.security) / 2;
      let strokeColor = `rgba(0, 240, 255, ${alpha})`;
      if (avgSec < 0.35) strokeColor = `rgba(255, 51, 68, ${alpha})`;
      else if (avgSec < 0.75) strokeColor = `rgba(255, 170, 0, ${alpha})`;

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = matchesFilter ? 1.8 * Math.max(0.7, this.zoom) : 1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Partícula de pulso hiperespacial em movimento ao longo da rota
      if (matchesFilter) {
        const t = ((this.pulseTimer * 0.4 + (fromSys.x + toSys.y) * 0.01) % 1 + 1) % 1;
        const px = x1 + (x2 - x1) * t;
        const py = y1 + (y2 - y1) * t;
        ctx.fillStyle = avgSec > 0.7 ? '#a8f5ff' : '#ffdd88';
        ctx.beginPath();
        ctx.arc(px, py, 1.8 * this.zoom, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.restore();
  }

  _drawSystems(ctx, cx, cy) {
    GALAXY_SYSTEMS.forEach(s => {
      const sx = cx + s.x * this.zoom;
      const sy = cy + s.y * this.zoom;

      const isCurrent = s.id === getCurrentSystemId();
      const isSelected = this.selectedSystem && this.selectedSystem.id === s.id;
      const isHovered = this.hoveredSystem && this.hoveredSystem.id === s.id;
      const matchesFilter = this._systemMatchesFilter(s);

      const color = SECURITY_COLORS[s.securityLevel] || '#00f0ff';
      const baseRadius = (isCurrent ? 7.5 : 5.5) * Math.max(0.8, this.zoom);

      ctx.save();
      if (!matchesFilter) {
        ctx.globalAlpha = 0.22;
      }

      // ── Anel Pulsante do Sistema Atual (Harpia Prime) ──
      if (isCurrent) {
        const pulseR = baseRadius + 7 + Math.sin(this.pulseTimer * 2.5) * 3;
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.7)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(sx, sy, pulseR, 0, Math.PI * 2);
        ctx.stroke();

        // Anel estático interior
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sx, sy, baseRadius + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      // ── Retículo de Seleção ──
      if (isSelected) {
        const selR = baseRadius + 8;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, selR, 0, Math.PI * 2);
        ctx.stroke();

        // 4 pequenos cantos táticos estilo mira
        const cornerLen = 5 * this.zoom;
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 1.5;
        // Top-left
        ctx.beginPath();
        ctx.moveTo(sx - selR - 4, sy - selR + cornerLen);
        ctx.lineTo(sx - selR - 4, sy - selR - 4);
        ctx.lineTo(sx - selR + cornerLen, sy - selR - 4);
        ctx.stroke();
        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(sx + selR + 4, sy + selR - cornerLen);
        ctx.lineTo(sx + selR + 4, sy + selR + 4);
        ctx.lineTo(sx + selR - cornerLen, sy + selR + 4);
        ctx.stroke();
      }

      // ── Aura de Hover ──
      if (isHovered && !isSelected) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(sx, sy, baseRadius + 5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // ── Glow Radial Exterior ──
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, baseRadius * 2.8);
      glow.addColorStop(0, color);
      glow.addColorStop(0.5, color);
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, baseRadius * 2.8, 0, Math.PI * 2);
      ctx.fill();

      // ── Núcleo do Sistema Estelar ──
      ctx.fillStyle = isCurrent ? '#ffffff' : color;
      ctx.beginPath();
      ctx.arc(sx, sy, baseRadius, 0, Math.PI * 2);
      ctx.fill();

      // ── Rótulo do Nome e Segurança do Sistema ──
      const fontSize = Math.max(9, Math.min(13, Math.round(11 * this.zoom)));
      ctx.font = `${isSelected || isCurrent ? 'bold ' : ''}${fontSize}px 'Orbitron', monospace`;
      ctx.fillStyle = isSelected ? '#ffffff' : (isCurrent ? '#a8eeff' : 'rgba(255, 255, 255, 0.85)');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      const labelY = sy + baseRadius + 5;
      ctx.fillText(s.name, sx, labelY);

      // Sub-rótulo de segurança (aparece com zoom moderado)
      if (this.zoom >= 0.75) {
        ctx.font = `bold ${Math.max(8, fontSize - 2)}px monospace`;
        ctx.fillStyle = color;
        ctx.fillText(`${s.security.toFixed(1)} ${s.securityLevel}`, sx, labelY + fontSize + 2);
      }

      ctx.restore();
    });
  }

  _systemMatchesFilter(system) {
    if (this.activeFilter === 'ALL') return true;
    return system.minerals && system.minerals.includes(this.activeFilter);
  }
}
