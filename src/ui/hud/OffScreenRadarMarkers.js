/**
 * HARPIA Universe - OffScreenRadarMarkers
 * Indicadores Táticos Fora de Ecrã (Edge Markers):
 * - Identifica corpos celestiais e estações fora da janela de visualização atual da câmara.
 * - Projeta marcadores na borda do ecrã apontando para o vetor do alvo com a distância em tempo real.
 * - Permite clicar diretamente no marcador da borda para travar a mira no Overview e iniciar o salto Warp.
 */
import { UIComponent } from '../core/UIComponent.js';
import { EV } from '../../core/EventBus.js';
import { playTargetLockSound } from '../../core/audio.js';

export class OffScreenRadarMarkers extends UIComponent {
  /**
   * @param {Object} options
   * @param {import('../../core/EventBus.js').EventBus} options.eventBus
   * @param {import('../../entities/ShipEntity.js').ShipEntity} options.ship
   * @param {import('../../core/Camera2D.js').Camera2D} options.camera
   * @param {import('../../entities/StationEntity.js').StationEntity} options.station
   * @param {import('../../entities/AsteroidEntity.js').AsteroidEntity[]} options.asteroids
   * @param {import('./TacticalOverviewPanel.js').TacticalOverviewPanel} [options.overviewPanel]
   */
  constructor({ eventBus, ship, camera, station, asteroids = [], overviewPanel = null }) {
    super();
    this.bus = eventBus;
    this.ship = ship;
    this.camera = camera;
    this.station = station;
    this.asteroids = asteroids;
    this.overview = overviewPanel;
    // Quando false, os marcadores ficam ocultos (piloto está fora do sistema natal)
    this.homeSystemVisible = true;

    // Marcadores representativos dos setores e clusters do universo
    this.targets = [
      {
        id: 'marker_station',
        overviewId: 'station_harpia',
        name: 'BASE HARPIA',
        type: 'station',
        color: '#00f0ff',
        icon: '◈',
        getX: () => 0,
        getY: () => 0
      },
      {
        id: 'marker_ferrox',
        overviewId: 'cluster_ferrox',
        name: 'FERROX CLUSTER',
        type: 'ferrox',
        color: '#ffaa00',
        icon: '⬡',
        getX: () => this._getClusterCenter('ferrox', 4500, -2600).x,
        getY: () => this._getClusterCenter('ferrox', 4500, -2600).y
      },
      {
        id: 'marker_varelium',
        overviewId: 'cluster_varelium',
        name: 'VARELIUM DEPOSIT',
        type: 'varelium',
        color: '#00ffaa',
        icon: '◆',
        getX: () => this._getClusterCenter('varelium', -4500, 2400).x,
        getY: () => this._getClusterCenter('varelium', -4500, 2400).y
      },
      {
        id: 'marker_crynex',
        overviewId: 'cluster_crynex',
        name: 'CRYNEX CLUSTER',
        type: 'crynex',
        color: '#a855f7',
        icon: '❖',
        getX: () => this._getClusterCenter('crynex', -2200, -4066).x,
        getY: () => this._getClusterCenter('crynex', -2200, -4066).y
      }
    ];

    /** @type {Map<string, HTMLElement>} */
    this.markerElements = new Map();
  }

  setOverviewPanel(panel) {
    this.overview = panel;
  }

  /**
   * Ocultar/mostrar marcadores dos clusters natais (Harpia Prime) quando em sistema remoto.
   * @param {boolean} visible
   */
  setHomeSystemVisible(visible) {
    this.homeSystemVisible = visible;
    // Forçar update imediato: ocultar todos os marcadores se saiu do sistema
    if (!visible) {
      this.targets.forEach(t => {
        const el = this.markerElements.get(t.id);
        if (el) el.style.display = 'none';
      });
    }
  }

  _getClusterCenter(oreType, fallbackX, fallbackY) {
    const list = (this.asteroids || []).filter(a => a && a.oreType === oreType);
    if (list.length === 0) return { x: fallbackX, y: fallbackY };
    const sx = list.reduce((sum, a) => sum + a.x, 0);
    const sy = list.reduce((sum, a) => sum + a.y, 0);
    return { x: Math.round(sx / list.length), y: Math.round(sy / list.length) };
  }

  mount(container) {
    if (this.root) return;

    const wrap = document.createElement('div');
    wrap.className = 'offscreen-radar-layer';
    wrap.id = 'offscreen-radar-layer';
    wrap.style.display = 'none'; // Iniciar oculto

    // Cria os elementos DOM de cada marcador
    this.targets.forEach(t => {
      const el = document.createElement('div');
      el.className = `radar-edge-marker marker-${t.type}`;
      el.id = t.id;
      el.style.display = 'none';

      el.innerHTML = `
        <div class="marker-arrow">▲</div>
        <div class="marker-badge" style="border-color: ${t.color};">
          <span class="marker-icon" style="color: ${t.color};">${t.icon}</span>
          <div class="marker-info">
            <span class="marker-name">${t.name}</span>
            <span class="marker-dist">---</span>
          </div>
        </div>
      `;

      el.addEventListener('mousedown', (e) => e.stopPropagation());
      el.addEventListener('mouseup', (e) => e.stopPropagation());
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        playTargetLockSound();
        if (this.overview) {
          this.overview.selectTargetById(t.overviewId);
        } else {
          this.bus.emit('overview:select_target', { targetId: t.overviewId });
        }
      });

      wrap.appendChild(el);
      this.markerElements.set(t.id, el);
    });

    container.appendChild(wrap);
    this.root = wrap;

    this.bindEvents();
  }

  bindEvents() {
    this.isInGame = false;
    const unsubStart = this.bus.on(EV.GAME_START, () => {
      this.isInGame = true;
      if (!this.ship.isDocked && !this.ship.isDocking) {
        if (this.root) this.root.style.display = 'block';
      }
    });
    const unsubExit = this.bus.on(EV.GAME_EXIT, () => {
      this.isInGame = false;
      if (this.root) this.root.style.display = 'none';
    });
    const unsubDocking = this.bus.on(EV.STATION_DOCKING, () => {
      if (this.root) this.root.style.display = 'none';
    });
    const unsubDocked = this.bus.on(EV.STATION_DOCKED, () => {
      if (this.root) this.root.style.display = 'none';
    });
    const unsubUndock = this.bus.on(EV.STATION_UNDOCK, () => {
      if (this.isInGame && this.root) this.root.style.display = 'block';
    });
    this.addCleanup(unsubStart);
    this.addCleanup(unsubExit);
    this.addCleanup(unsubDocking);
    this.addCleanup(unsubDocked);
    this.addCleanup(unsubUndock);
  }

  /**
   * Chamado no loop de renderização para calcular posições na borda do ecrã
   */
  render() {
    if (!this.root || !this.camera || this.ship.isDocked || !this.isInGame || !this.homeSystemVisible) {
      if (this.root && this.root.style.display !== 'none') {
        this.root.style.display = 'none';
      }
      return;
    }

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const cx = screenW / 2;
    const cy = screenH / 2;

    const paddingX = 48;
    const paddingY = 48;
    const minX = paddingX;
    const maxX = screenW - paddingX;
    const minY = paddingY;
    const maxY = screenH - paddingY;

    this.targets.forEach(t => {
      const el = this.markerElements.get(t.id);
      if (!el) return;

      const worldX = t.getX();
      const worldY = t.getY();
      const screenPos = this.camera.worldToScreen(worldX, worldY);

      // Distância da nave ao corpo
      const dist = Math.hypot(this.ship.x - worldX, this.ship.y - worldY);

      // Se o objeto estiver dentro do ecrã visível (com margem de 100px), oculta o marcador de borda
      const isVisibleOnScreen = (
        screenPos.x >= 80 && screenPos.x <= screenW - 80 &&
        screenPos.y >= 80 && screenPos.y <= screenH - 80
      );

      if (isVisibleOnScreen) {
        if (el.style.display !== 'none') el.style.display = 'none';
        return;
      }

      // Projeta um raio a partir do centro da tela em direção ao objeto
      const dx = screenPos.x - cx;
      const dy = screenPos.y - cy;
      const angle = Math.atan2(dy, dx);

      // Clamping elíptico / retangular às margens do ecrã
      let edgeX = cx;
      let edgeY = cy;

      const m = dy / (dx === 0 ? 0.0001 : dx);
      const halfW = (maxX - minX) / 2;
      const halfH = (maxY - minY) / 2;

      if (Math.abs(m) <= halfH / halfW) {
        // Interseta as laterais esquerda ou direita
        edgeX = dx > 0 ? maxX : minX;
        edgeY = cy + (dx > 0 ? halfW : -halfW) * m;
      } else {
        // Interseta o topo ou fundo
        edgeY = dy > 0 ? maxY : minY;
        edgeX = cx + (dy > 0 ? halfH : -halfH) / m;
      }

      // Garante limites estritos
      edgeX = Math.max(minX, Math.min(maxX, edgeX));
      edgeY = Math.max(minY, Math.min(maxY, edgeY));

      el.style.display = 'flex';
      el.style.transform = `translate3d(${edgeX.toFixed(1)}px, ${edgeY.toFixed(1)}px, 0)`;

      // A seta de direção aponta para fora (ângulo do vetor)
      const arrowEl = el.querySelector('.marker-arrow');
      if (arrowEl) {
        const deg = (angle * 180 / Math.PI) - 90;
        arrowEl.style.transform = `rotate(${deg.toFixed(1)}deg)`;
      }

      // Distância formatada
      const distEl = el.querySelector('.marker-dist');
      if (distEl) {
        distEl.textContent = dist < 1000 ? `${Math.round(dist)} m` : `${(dist / 1000).toFixed(1)} km`;
      }
    });
  }
}
