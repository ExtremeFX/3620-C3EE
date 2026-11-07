/**
 * HARPIA Universe - TacticalOverviewPanel
 * Painel de Overview Tático estilo EVE Online:
 * - Lista em tempo real todos os contactos celestiais (Estação Harpia e Asteroides).
 * - Ordenação dinâmica por proximidade da nave.
 * - Distância ao vivo formatada (m / km).
 * - Trava de Mira (Lock Target).
 */
import { UIComponent } from '../core/UIComponent.js';
import { EV } from '../../core/EventBus.js';
import { playTacticalSelectSound } from '../../core/audio.js';

export class TacticalOverviewPanel extends UIComponent {
  /**
   * @param {Object} options
   * @param {import('../../core/EventBus.js').EventBus} options.eventBus
   * @param {import('../../entities/ShipEntity.js').ShipEntity} options.ship
   * @param {import('../../entities/StationEntity.js').StationEntity} options.station
   * @param {import('../../entities/AsteroidEntity.js').AsteroidEntity[]} options.asteroids
   */
  constructor({ eventBus, ship, station, asteroids = [], droneMiningSystem = null }) {
    super();
    this.bus = eventBus;
    this.ship = ship;
    this.station = station;
    this.asteroids = asteroids;
    this.droneMiningSystem = droneMiningSystem;

    this.isCollapsed = false;
    /** @type {Object|null} */
    this.selectedTarget = null;
    this.lastUpdate = 0;
    this.updateThrottle = 100; // ms entre ordenações/atualizações de dados
    // Quando false, esconde estação e asteroides natais (piloto está noutro sistema)
    this.homeSystemVisible = true;

    // Nós DOM em cache
    this.listEl = null;
    this.toggleBtn = null;
    this.countBadgeEl = null;
  }

  setDroneMiningSystem(system) {
    this.droneMiningSystem = system;
  }

  /**
   * Quando o piloto está fora do sistema natal, esconder os contactos que apenas existem lá.
   * @param {boolean} visible
   */
  setHomeSystemVisible(visible) {
    this.homeSystemVisible = visible;
    // Se saiu do sistema e tinha a estação/asteroide selecionado, limpar seleção
    if (!visible && this.selectedTarget) {
      this.selectedTarget = null;
      this._updateActionBar();
    }
    // Força rebuild da lista para refletir os contactos disponíveis
    this.updateContacts(true);
  }

  mount(container) {
    if (this.root) return;

    const wrap = document.createElement('div');
    wrap.className = 'tactical-overview-panel';
    wrap.id = 'tactical-overview-panel';
    wrap.style.display = 'none'; // Iniciar oculto (aparece apenas em voo espacial)

    wrap.innerHTML = `
      <!-- Cabeçalho Tático -->
      <div class="overview-header" id="overview-header">
        <div class="overview-header-left">
          <span class="overview-radar-icon">⌖</span>
          <span class="overview-title">TACTICAL OVERVIEW</span>
          <span class="overview-count" id="overview-count">0</span>
        </div>
        <button type="button" class="overview-toggle-btn" id="overview-toggle-btn" title="Minimizar / Expandir">
          ▼
        </button>
      </div>

      <!-- Tabela de Contactos Celestiais -->
      <div class="overview-body" id="overview-body">
        <div class="overview-table-head">
          <span class="col-icon">#</span>
          <span class="col-name">CONTACT</span>
          <span class="col-dist">DIST</span>
          <span class="col-units">STATUS</span>
        </div>
        <div class="overview-list" id="overview-list"></div>
      </div>


    `;

    // Bloquear propagação de pointer e wheel para que não afetem a nave ou o canvas do jogo
    const _blockEv = (e) => { e.stopPropagation(); };
    ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'click', 'contextmenu', 'wheel'].forEach(evt => {
      wrap.addEventListener(evt, _blockEv);
    });

    container.appendChild(wrap);
    this.root = wrap;

    this.listEl = wrap.querySelector('#overview-list');
    this.toggleBtn = wrap.querySelector('#overview-toggle-btn');
    this.countBadgeEl = wrap.querySelector('#overview-count');

    this.bindEvents();
    this.updateContacts(true);
  }

  bindEvents() {
    if (this.toggleBtn) {
      this.toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.isCollapsed = !this.isCollapsed;
        if (this.root) {
          this.root.classList.toggle('collapsed', this.isCollapsed);
          this.toggleBtn.textContent = this.isCollapsed ? '▲' : '▼';
        }
      });
    }

    // Ouvir seleções externas (ex: do radar de borda)
    const unsubSelect = this.bus.on('overview:select_target', ({ targetId }) => {
      this.selectTargetById(targetId);
    });
    this.addCleanup(unsubSelect);

    // Ciclo de vida: Iniciar jogo, Sair para o Lobby, Atracar e Desatracar
    this.isInGame = false;
    const unsubStart = this.bus.on(EV.GAME_START, () => {
      this.isInGame = true;
      if (!this.ship.isDocked && !this.ship.isDocking) {
        if (this.root) this.root.style.display = 'flex';
      } else {
        if (this.root) this.root.style.display = 'none';
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
      if (this.isInGame && this.root) this.root.style.display = 'flex';
    });
    this.addCleanup(unsubStart);
    this.addCleanup(unsubExit);
    this.addCleanup(unsubDocking);
    this.addCleanup(unsubDocked);
    this.addCleanup(unsubUndock);
  }

  /**
   * Obtém a lista unificada de todos os contactos do setor
   * Agrupa os asteroides por elemento (Ferrox, Crynex, Varelium) calculando a localização central de cada campo.
   */
  _getAllContacts() {
    const contacts = [];

    // Os contactos da estação e asteroides apenas existem no sistema natal (Harpia Prime).
    // Quando o piloto está noutro sistema, a lista fica vazia ou mostrará apenas contactos do novo sistema.
    if (this.homeSystemVisible) {
      // 1. Estação Principal Harpia (Centro no mundo: 0, 0)
      const stationDist = Math.hypot(this.ship.x - 0, this.ship.y - 0);
      contacts.push({
        id: 'station_harpia',
        name: 'Harpia Base Station',
        type: 'STATION',
        oreType: 'station',
        isStation: true,
        x: 0,
        y: 0,
        dist: stationDist,
        status: stationDist <= 1200 ? 'DOCK READY' : 'ONLINE',
        entity: this.station
      });
    }

    // 2. Agrupamento por Elemento / Campo de Asteroides (Localização Central do Cluster)
    // Apenas presentes no sistema natal
    if (!this.homeSystemVisible) {
      contacts.sort((a, b) => a.dist - b.dist);
      return contacts;
    }

    const clustersMap = new Map();

    for (const ast of this.asteroids) {
      if (!ast) continue;
      const type = ast.oreType || 'ferrox';
      if (!clustersMap.has(type)) {
        clustersMap.set(type, {
          oreType: type,
          oreName: ast.oreName || type.toUpperCase(),
          asteroids: [],
          totalX: 0,
          totalY: 0,
          totalUnits: 0,
          maxUnits: 0
        });
      }
      const c = clustersMap.get(type);
      c.asteroids.push(ast);
      c.totalX += ast.x;
      c.totalY += ast.y;
      c.totalUnits += (ast.currentUnits || 0);
      c.maxUnits += (ast.maxUnits || 60);
    }

    clustersMap.forEach((c, type) => {
      const count = c.asteroids.length;
      if (count === 0) return;

      const centerX = Math.round(c.totalX / count);
      const centerY = Math.round(c.totalY / count);
      const dist = Math.hypot(this.ship.x - centerX, this.ship.y - centerY);
      const isDepleted = c.totalUnits <= 0;

      // Encontra o asteroide ativo mais próximo da nave dentro deste campo
      let nearestActive = null;
      let minAstDist = Infinity;
      for (const ast of c.asteroids) {
        if (!ast.isDepleted && ast.currentUnits > 0) {
          const d = Math.hypot(this.ship.x - ast.x, this.ship.y - ast.y);
          if (d < minAstDist) {
            minAstDist = d;
            nearestActive = ast;
          }
        }
      }
      const fallbackAst = c.asteroids[0];

      contacts.push({
        id: `cluster_${type}`,
        name: `${c.oreName} Field [Center]`,
        shortName: `${c.oreName} Field`,
        type: 'ASTEROID_CLUSTER',
        oreType: type,
        isStation: false,
        x: centerX,
        y: centerY,
        dist: dist,
        totalUnits: c.totalUnits,
        maxUnits: c.maxUnits,
        status: isDepleted ? 'DEPLETED' : `${c.totalUnits} U`,
        isDepleted,
        entity: nearestActive || fallbackAst,
        nearestAsteroid: nearestActive || fallbackAst,
        asteroids: c.asteroids,
        asteroidsCount: count
      });
    });

    contacts.sort((a, b) => a.dist - b.dist);
    return contacts;
  }

  /**
   * Formata a distância de forma limpa (m ou km)
   */
  _formatDist(dist) {
    if (dist < 1000) {
      return `${Math.round(dist)} m`;
    }
    return `${(dist / 1000).toFixed(1)} km`;
  }

  /**
   * Seleciona um alvo específico
   */
  selectTarget(target) {
    this.selectedTarget = target;
    playTacticalSelectSound();

    if (this.bus) {
      this.bus.emit('target:locked', { target });
    }

    this._updateActionBar();
    this._highlightSelectedRow();
  }

  selectTargetById(targetId) {
    const contacts = this._getAllContacts();
    const found = contacts.find(c => 
      c.id === targetId || 
      c.entity === targetId ||
      (c.asteroids && c.asteroids.some(a => a === targetId || a.id === targetId))
    );
    if (found) {
      this.selectTarget(found);
    }
  }

  _updateActionBar() {
    if (!this.bus) return;

    if (!this.selectedTarget) {
      this.bus.emit('hud:target_selected', { target: null, canWarp: false, canApproach: false });
      return;
    }

    const canWarp = this.selectedTarget.dist >= 1500;
    this.bus.emit('hud:target_selected', {
      target: this.selectedTarget,
      canWarp,
      canApproach: true
    });
  }

  _highlightSelectedRow() {
    if (!this.listEl) return;
    const rows = this.listEl.querySelectorAll('.overview-row');
    rows.forEach(r => {
      const rowId = r.getAttribute('data-id');
      if (this.selectedTarget && rowId === this.selectedTarget.id) {
        r.classList.add('selected');
      } else {
        r.classList.remove('selected');
      }
    });
  }

  /**
   * Atualiza as linhas do Overview sem destruir a lista completamente
   */
  updateContacts(forceRebuild = false) {
    if (!this.listEl) return;

    const contacts = this._getAllContacts();
    if (this.countBadgeEl) {
      this.countBadgeEl.textContent = contacts.length;
    }

    // Sincronizar dados do alvo selecionado atual
    if (this.selectedTarget) {
      const refreshed = contacts.find(c => c.id === this.selectedTarget.id);
      if (refreshed) {
        this.selectedTarget = refreshed;
        this._updateActionBar();
      }
    }

    // Mapeia linhas existentes por data-id para garantir que nenhum ícone ou evento de clique seja trocado ao reordenar
    const existingMap = new Map();
    this.listEl.querySelectorAll('.overview-row').forEach(row => {
      const id = row.getAttribute('data-id');
      if (id) existingMap.set(id, row);
    });

    const existingIds = Array.from(existingMap.keys()).sort().join(',');
    const currentIds = contacts.map(c => c.id).sort().join(',');

    if (contacts.length === 0) {
      this.listEl.innerHTML = `<div style="padding: 18px 12px; font-size: 9px; color: rgba(0, 240, 255, 0.45); text-align: center; letter-spacing: 1px;">• SCANNING SECTOR • NO LOCAL CONTACTS •</div>`;
      return;
    }

    if (forceRebuild || existingIds !== currentIds) {
      this.listEl.innerHTML = '';
      existingMap.clear();
    }

    // Renderiza e reordena as linhas no DOM mantendo a integridade absoluta de cada contacto
    contacts.forEach(c => {
      let row = existingMap.get(c.id);

      let iconSrc = './assets/items/ferrox.png';
      if (c.isStation) iconSrc = './assets/items/mining_drone.png';
      else if (c.oreType === 'varelium') iconSrc = './assets/items/varelium.png';
      else if (c.oreType === 'crynex') iconSrc = './assets/items/crynex.png';

      if (!row) {
        row = document.createElement('div');
        row.className = 'overview-row';
        row.setAttribute('data-id', c.id);

        row.innerHTML = `
          <span class="col-icon">
            <img src="${iconSrc}" class="ov-icon-img" alt="${c.oreType || 'icon'}" />
          </span>
          <span class="col-name ov-name-text">${c.name}</span>
          <span class="col-dist ov-dist-text">${this._formatDist(c.dist)}</span>
          <span class="col-units ov-units-text ${c.isDepleted ? 'depleted' : ''}">${c.status}</span>
        `;

        let lastSelectTs = 0;
        const handleSelect = (e) => {
          e.stopPropagation();
          // Previne disparo duplo de pointerdown seguido de click na mesma interação
          const now = performance.now();
          if (now - lastSelectTs < 120) return;
          lastSelectTs = now;

          if (row._contact) {
            this.selectTarget(row._contact);
          }
        };

        // Registo duplo (pointerdown + click) com guard temporal para resposta tátil instantânea sem repetição
        row.addEventListener('pointerdown', handleSelect);
        row.addEventListener('click', handleSelect);

        this.listEl.appendChild(row);
        existingMap.set(c.id, row);
      } else {
        // Atualiza campos de dados da linha sem trocar elementos
        const nameEl = row.querySelector('.ov-name-text');
        const distEl = row.querySelector('.ov-dist-text');
        const unitsEl = row.querySelector('.ov-units-text');
        const imgEl = row.querySelector('.ov-icon-img');

        if (imgEl && !imgEl.src.includes(iconSrc.replace('./', ''))) {
          imgEl.src = iconSrc;
        }
        if (nameEl && nameEl.textContent !== c.name) nameEl.textContent = c.name;
        if (distEl) distEl.textContent = this._formatDist(c.dist);
        if (unitsEl) {
          unitsEl.textContent = c.status;
          unitsEl.classList.toggle('depleted', Boolean(c.isDepleted));
        }
      }

      // Vincula a referência do contacto atualizado à linha para o evento de clique
      row._contact = c;
    });

    // Reordena no DOM APENAS se a ordem de proximidade tiver efetivamente mudado
    // Isto impede mutações desnecessárias do DOM a cada 100ms que quebravam o evento click do browser
    const currentOrder = contacts.map(c => c.id).join(',');
    const domOrder = Array.from(this.listEl.children).map(el => el.getAttribute('data-id')).join(',');
    if (domOrder !== currentOrder) {
      contacts.forEach(c => {
        const r = existingMap.get(c.id);
        if (r) this.listEl.appendChild(r);
      });
    }

    this._highlightSelectedRow();
  }

  /**
   * Chamado a cada frame pelo GameLoop
   */
  update() {
    if (!this.root || this.root.style.display === 'none' || this.ship.isDocked || !this.isInGame) return;
    const now = performance.now();
    if (now - this.lastUpdate > this.updateThrottle) {
      this.lastUpdate = now;
      this.updateContacts(false);
    }
  }
}
