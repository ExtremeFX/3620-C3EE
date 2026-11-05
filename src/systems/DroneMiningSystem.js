/**
 * HARPIA Universe - DroneMiningSystem
 * Sistema Autónomo de Drones Mineradores "Grok" (Estilo EVE Online)
 * 
 * Requisitos estritos do Comandante:
 * 1. Botão tático ao lado dos Mining Lasers (Atalho: 2).
 * 2. Ao clicar, lança os drones. Drones procuram asteroides num raio de 200m da nave.
 * 3. Drones voam até ao asteroide, entram em órbita sobre ele e ativam feixe único
 *    branco com tom de azul (#ffffff / aura #70d4ff).
 * 4. Ciclo de mineração: 20 segundos por unidade cada drone.
 * 5. Cada drone acumula até 10 unidades. Assim que atingir 10 unidades, regressa
 *    à nave, descarrega diretamente no ORE STORAGE da nave e volta a minerar ciclicamente.
 * 6. Ao clicar novamente no botão dos drones (ou atalho 2), recolhem imediatamente
 *    para o Drone Bay da nave (descarregando o que tiverem no porão da nave ao atracar).
 */
import { EV } from '../core/EventBus.js';
import { state, addShipOre } from '../core/state.js';
import { playSciFiBeep, playSciFiAlert } from '../core/audio.js';
import { getShipInfo } from '../config/shipsRegistry.js';

/**
 * Interpolação angular suave de menor arco
 */
function lerpAngle(current, target, rate) {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * Math.min(1.0, rate);
}

export class DroneMiningSystem {
  /**
   * @param {Object} options
   * @param {import('../core/EventBus.js').EventBus} options.eventBus
   * @param {import('../entities/ShipEntity.js').ShipEntity} options.ship
   * @param {import('../entities/AsteroidEntity.js').AsteroidEntity[]} [options.asteroids]
   */
  constructor({ eventBus, ship, asteroids = [] }) {
    this.bus = eventBus;
    this.ship = ship;
    this.asteroids = asteroids;
    this.targetAsteroid = null;
    this.isMining = false;
    this.squadronMode = 'FOCUS'; // 'FOCUS' (Focado em 1 asteroide) | 'SPLIT' (Disperso no cluster)

    // Constantes operacionais dos Drones Grok
    this.SCAN_RADIUS = 2500.0;       // Raio operacional (cobre todo o cluster e alcance de mineração da nave)
    this.CYCLE_DURATION = 20.0;      // 20 segundos por ciclo por unidade
    this.MAX_DRONE_CARGO = 1;        // Despeja na nave a cada 1 unidade extraída
    this.MAX_DRONES = 5;             // Capacidade máxima suportada pela nave pesada H-M2
    this.DRONE_SPEED_DEPLOY = 150;   // Velocidade de aproximação ao asteroide (150 m/s)
    this.DRONE_SPEED_RETURN = 150;   // Velocidade de regresso à nave e recolha manual (150 m/s)

    this.drones = [];
    this.dronesLayer = null;
    this.lasersGroup = null;
    this.impactPoints = [];

    this._initDrones();
    this._mountDomElements();
    this._bindEvents();
  }

  setAsteroids(asteroids) {
    if (Array.isArray(asteroids)) {
      this.asteroids = asteroids;
    }
  }

  _initDrones() {
    this.drones = [];
    for (let i = 0; i < this.MAX_DRONES; i++) {
      this.drones.push({
        id: i,
        name: `Grok-${i + 1}`,
        x: 0,
        y: 0,
        angle: 0,
        cycleTime: 0,
        internalCargo: 0,
        maxCargo: this.MAX_DRONE_CARGO,
        orbitAngle: i * ((2 * Math.PI) / this.MAX_DRONES),
        orbitRadius: 105 + (i % 3) * 18,
        orbitSpeed: 0.14 + (i % 2) * 0.04,
        state: 'DOCKED', // 'DOCKED' | 'DEPLOYING' | 'MINING' | 'RETURNING_TO_UNLOAD' | 'UNLOADING' | 'RECALLING'
        unloadTimer: 0,
        unloadMaxTimer: 0.35,
        unloadOreType: 'ferrox',
        unloadCargo: 0,
        laserActive: false,
        targetAsteroid: null,  // ← cada drone tem o seu próprio alvo
        domEl: null,
        laserGroup: null,
        laserGlow: null,
        laserCore: null
      });
    }
  }

  _mountDomElements() {
    // 1. Contentor HTML para sprites dos Drones
    let dronesLayer = document.getElementById('drones-layer');
    if (!dronesLayer) {
      dronesLayer = document.createElement('div');
      dronesLayer.id = 'drones-layer';
      dronesLayer.className = 'drones-layer';
      const gameWorld = document.getElementById('game-world');
      if (gameWorld) {
        const refNode = document.getElementById('mining-lasers-layer') || gameWorld.firstChild;
        gameWorld.insertBefore(dronesLayer, refNode);
      }
    }
    this.dronesLayer = dronesLayer;

    // 2. Grupo SVG para os feixes únicos brancos com tom azul
    let svgLayer = document.getElementById('mining-lasers-layer');
    if (svgLayer) {
      let droneGroup = svgLayer.querySelector('#drone-lasers-group');
      if (!droneGroup) {
        droneGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        droneGroup.id = 'drone-lasers-group';
        droneGroup.setAttribute('class', 'drone-lasers-group');
        svgLayer.appendChild(droneGroup);
      }
      this.lasersGroup = droneGroup;
    }

    this._createDroneElements();
  }

  _createDroneElements() {
    if (!this.dronesLayer || !this.lasersGroup) return;

    this.drones.forEach((drone) => {
      // Elemento DOM do drone
      if (!drone.domEl) {
        const el = document.createElement('div');
        el.className = 'grok-drone-entity';
        el.id = `grok-drone-${drone.id}`;
        el.style.display = 'none';
        el.innerHTML = `
          <div class="grok-drone-hull">
            <img src="./assets/items/mining_drone.png" alt="Grok Mining Drone" class="grok-drone-sprite" />
            <div class="grok-drone-thruster-glow"></div>
          </div>
        `;
        this.dronesLayer.appendChild(el);
        drone.domEl = el;
      }

      // Elemento SVG para o laser único do drone
      if (!drone.laserGroup) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'grok-drone-laser-unit');
        g.style.display = 'none';

        // Feixe Glow (fino com tom azul-celeste suave)
        const glow = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        glow.setAttribute('class', 'grok-laser-glow');

        // Feixe Core (branco puro central)
        const core = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        core.setAttribute('class', 'grok-laser-core');

        g.appendChild(glow);
        g.appendChild(core);
        this.lasersGroup.appendChild(g);

        drone.laserGroup = g;
        drone.laserGlow = glow;
        drone.laserCore = core;
      }
    });
  }

  _bindEvents() {
    if (!this.bus) return;
    this._unsubs = this._unsubs || [];

    // Desatracagem / atracagem na estação
    this._unsubs.push(
      this.bus.on(EV.STATION_DOCKED, () => {
        this.dockAllImmediately();
      }),
      this.bus.on(EV.STATION_DOCKING, () => {
        this.dockAllImmediately();
      }),
      // Troca de nave ativa
      this.bus.on('ship:active_changed', () => {
        this.dockAllImmediately();
      }),
      // Alternar drones via evento
      this.bus.on('drones:toggle', () => {
        this.toggleDrones();
      }),
      // Alternar e definir modo da esquadra (FOCUS vs SPLIT)
      this.bus.on('drones:toggle_mode', () => {
        this.toggleSquadronMode();
      }),
      this.bus.on('drones:set_mode', ({ mode }) => {
        this.setSquadronMode(mode);
      })
    );
  }

  /**
   * Obtém o raio de ação e scan dos drones, baseado no alcance da nave ativa
   * @returns {number}
   */
  getScanRadius() {
    const activeShipId = state.activeShipId || 'H-M2';
    const shipInfo = getShipInfo(activeShipId);
    const shipRange = shipInfo?.miningRange || 500;
    return Math.max(2500.0, shipRange + 500);
  }

  /**
   * Obtém a lista de asteroides ativos (não esgotados) dentro do alcance operacional
   * @param {number} fromX
   * @param {number} fromY
   * @param {number} [maxRadius=this.getScanRadius()]
   * @returns {import('../entities/AsteroidEntity.js').AsteroidEntity[]}
   */
  getActiveAsteroidsInRange(fromX, fromY, maxRadius = this.getScanRadius()) {
    const list = this.asteroids.filter(ast => {
      if (!ast || ast.isDepleted || ast.currentUnits <= 0) return false;
      const d = Math.hypot(fromX - ast.x, fromY - ast.y);
      return d <= maxRadius;
    });
    list.sort((a, b) => {
      const da = Math.hypot(fromX - a.x, fromY - a.y);
      const db = Math.hypot(fromX - b.x, fromY - b.y);
      return da - db;
    });
    return list;
  }

  /**
   * Procura o asteroide não esgotado mais próximo dentro do raio operacional
   * @param {number} fromX
   * @param {number} fromY
   * @param {number} [maxRadius=this.getScanRadius()]
   * @returns {import('../entities/AsteroidEntity.js').AsteroidEntity|null}
   */
  findNearestAsteroidInRange(fromX, fromY, maxRadius = this.getScanRadius()) {
    const inRange = this.getActiveAsteroidsInRange(fromX, fromY, maxRadius);
    return inRange.length > 0 ? inRange[0] : null;
  }

  /**
   * Procura o melhor asteroide para um drone no Modo Disperso (SPLIT).
   * Distribui a esquadra de forma equilibrada por todos os depósitos ativos no cluster.
   * @param {Object} drone Instância do drone
   * @returns {import('../entities/AsteroidEntity.js').AsteroidEntity|null}
   */
  getSplitTargetForDrone(drone) {
    const inRange = this.getActiveAsteroidsInRange(this.ship.x, this.ship.y, this.getScanRadius());
    if (inRange.length === 0) return null;
    if (inRange.length === 1) return inRange[0];

    // Conta quantos outros drones já estão atribuídos a cada asteroide ativo
    const counts = new Map();
    for (let i = 0; i < inRange.length; i++) {
      counts.set(inRange[i], 0);
    }

    for (let i = 0; i < this.MAX_DRONES; i++) {
      const other = this.drones[i];
      if (other !== drone && other.state !== 'DOCKED' && other.targetAsteroid) {
        if (!other.targetAsteroid.isDepleted && other.targetAsteroid.currentUnits > 0) {
          if (counts.has(other.targetAsteroid)) {
            counts.set(other.targetAsteroid, counts.get(other.targetAsteroid) + 1);
          }
        }
      }
    }

    // Ordena priorizando o asteroide com menos drones atribuídos; desempata pela distância à nave
    inRange.sort((a, b) => {
      const ca = counts.get(a) || 0;
      const cb = counts.get(b) || 0;
      if (ca !== cb) return ca - cb;
      const da = Math.hypot(this.ship.x - a.x, this.ship.y - a.y);
      const db = Math.hypot(this.ship.x - b.x, this.ship.y - b.y);
      return da - db;
    });

    return inRange[0];
  }

  /**
   * Resolve o asteroide alvo para um drone conforme o modo ativo (FOCUS vs SPLIT)
   * @param {Object} drone
   * @param {import('../entities/AsteroidEntity.js').AsteroidEntity} [explicitTarget=null]
   * @returns {import('../entities/AsteroidEntity.js').AsteroidEntity|null}
   */
  getTargetForDrone(drone, explicitTarget = null) {
    if (this.squadronMode === 'SPLIT') {
      const splitTarget = this.getSplitTargetForDrone(drone);
      if (splitTarget) return splitTarget;
    }

    if (explicitTarget && !explicitTarget.isDepleted && explicitTarget.currentUnits > 0) {
      return explicitTarget;
    }

    return this.findNearestAsteroidInRange(this.ship.x, this.ship.y, this.getScanRadius());
  }

  /**
   * Alterna entre Modo Focado (FOCUS) e Modo Disperso (SPLIT)
   * @returns {'FOCUS'|'SPLIT'}
   */
  toggleSquadronMode() {
    const newMode = this.squadronMode === 'FOCUS' ? 'SPLIT' : 'FOCUS';
    this.setSquadronMode(newMode);
    return newMode;
  }

  /**
   * Define o modo da esquadra de drones
   * @param {'FOCUS'|'SPLIT'} mode
   */
  setSquadronMode(mode) {
    if (mode !== 'FOCUS' && mode !== 'SPLIT') return;
    this.squadronMode = mode;

    if (mode === 'SPLIT') {
      playSciFiBeep(1040, 0.14, 'triangle', 0.22);
      if (this.bus) {
        this.bus.emit(EV.HUD_TOAST, {
          message: '🛸 SQUADRON MODE: SPLIT • Drones distributing across asteroid cluster',
          type: 'success'
        });
        this.bus.emit('drones:mode_changed', { mode: 'SPLIT' });
      }
    } else {
      playSciFiBeep(880, 0.14, 'sine', 0.22);
      if (this.bus) {
        this.bus.emit(EV.HUD_TOAST, {
          message: '🛸 SQUADRON MODE: FOCUS • All drones focusing on a single target deposit',
          type: 'info'
        });
        this.bus.emit('drones:mode_changed', { mode: 'FOCUS' });
      }
    }

    // Se já há drones no espaço a minerar, redistribui ou foca imediatamente
    if (this.hasDeployedDrones() && this.isMining) {
      const primary = this.findNearestAsteroidInRange(this.ship.x, this.ship.y, this.getScanRadius());
      for (let i = 0; i < this.MAX_DRONES; i++) {
        const drone = this.drones[i];
        if (drone.state === 'DEPLOYING' || drone.state === 'MINING' || drone.state === 'ORBITING_SHIP') {
          const newTarget = (mode === 'SPLIT') ? this.getSplitTargetForDrone(drone) : primary;
          if (newTarget && newTarget !== drone.targetAsteroid) {
            drone.targetAsteroid = newTarget;
            drone.state = 'DEPLOYING';
            drone.cycleTime = 0;
            drone.laserActive = false;
            if (drone.laserGroup) drone.laserGroup.style.display = 'none';
          }
        }
      }
    }
  }

  getSquadronMode() {
    return this.squadronMode;
  }

  /**
   * Obtém o número de drones Grok disponíveis na baía da nave ativa
   */
  getAvailableDronesCount() {
    const activeShipId = state.activeShipId || 'H-M2';
    const shipInfo = getShipInfo(activeShipId);
    const capacity = shipInfo?.droneCapacity || 0;
    if (capacity <= 0) return 0;

    let equipped = Number(state.shipDrones?.mining_drone) || 0;
    // Se estiver na H-M2 e ainda não abriu o hangar, permite a capacidade total da baía
    if (equipped <= 0 && activeShipId === 'H-M2') {
      equipped = 5;
    }
    return Math.min(capacity, equipped);
  }

  /**
   * Verifica se há drones atualmente fora da baía
   */
  hasDeployedDrones() {
    return this.drones.some(d => d.state !== 'DOCKED');
  }

  /**
   * Alterna o estado dos drones (acionado pelo botão Grok Drones ou Tecla 2)
   */
  toggleDrones() {
    if (this.ship.isDocked || this.ship.isDocking) return;

    if (this.isMining || this.hasDeployedDrones()) {
      // Estavam ativos -> Recolher para o drone bay
      this.recallDrones();
    } else {
      // Estavam recolhidos -> Procurar asteroide e lançar
      this.launchDrones();
    }
  }

  /**
   * Lança os drones: todos mineram o asteroide mais próximo dentro do raio de 200m
   * Não saem do raio de 200m para procurar outros asteroides longínquos
   */
  launchDrones(explicitTarget = null) {
    const count = this.getAvailableDronesCount();
    const activeShipId = state.activeShipId || 'H-M2';
    const shipInfo = getShipInfo(activeShipId);

    if (count <= 0) {
      playSciFiAlert();
      this.bus.emit(EV.HUD_TOAST, {
        message: `NO DRONE BAY • Vessel ${shipInfo?.name || activeShipId} has 0 drone capacity. Equip H-M2.`,
        type: 'warning'
      });
      this.bus.emit('drones:launch_failed', { reason: 'no_bay' });
      return;
    }

    // 1. Procurar asteroides no raio operacional
    let targetAst = explicitTarget;
    if (!targetAst || targetAst.isDepleted || targetAst.currentUnits <= 0) {
      const scanRadius = this.getScanRadius();
      const inRange = this.getActiveAsteroidsInRange(this.ship.x, this.ship.y, scanRadius);
      if (inRange.length === 0) {
        playSciFiAlert();
        this.bus.emit(EV.HUD_TOAST, {
          message: `NO TARGET IN RANGE • Approach an asteroid deposit to deploy drones.`,
          type: 'warning'
        });
        this.bus.emit('drones:launch_failed', { reason: 'out_of_range' });
        return;
      }
      targetAst = inRange[0];
    }

    // 2. Verificar se o porão da nave já está cheio
    const cargo = state.shipCargo;
    const currentTotal = (cargo.ferrox || 0) + (cargo.crynex || 0) + (cargo.varelium || 0);
    const maxCap = cargo.capacity || 30;
    if (currentTotal >= maxCap) {
      playSciFiAlert();
      this.bus.emit(EV.HUD_TOAST, {
        message: `ORE STORAGE FULL (${maxCap}/${maxCap} T) • Unload at station before deploying drones`,
        type: 'warning'
      });
      this.bus.emit('drones:launch_failed', { reason: 'cargo_full' });
      return;
    }

    // 3. Ativação e lançamento conforme o modo da esquadra (FOCUS vs SPLIT)
    this.isMining = true;

    for (let i = 0; i < this.MAX_DRONES; i++) {
      const drone = this.drones[i];
      if (i < count) {
        // Resolve asteroide alvo: ou todos no targetAst (FOCUS) ou distribuídos pelo cluster (SPLIT)
        const assignedAst = this.getTargetForDrone(drone, targetAst) || targetAst;
        drone.targetAsteroid = assignedAst;
        drone.x = this.ship.x;
        drone.y = this.ship.y;
        drone.cycleTime = 0;
        drone.internalCargo = 0;
        drone.state = 'DEPLOYING';
        drone.orbitAngle = (i * ((2 * Math.PI) / count)) + (Math.random() * 0.15);

        // Órbita do lado de fora do asteroide alvo (raio do asteroide + folga)
        const astRadius = ((assignedAst.baseWidth || 320) * 0.5) * (assignedAst.currentScale || 1.0);
        drone.orbitRadius = Math.max(170, astRadius + 45 + (i % 3) * 22);

        if (drone.domEl) drone.domEl.style.display = 'block';
      } else {
        drone.state = 'DOCKED';
        drone.targetAsteroid = null;
        drone.laserActive = false;
        if (drone.domEl) drone.domEl.style.display = 'none';
        if (drone.laserGroup) drone.laserGroup.style.display = 'none';
      }
    }

    playSciFiBeep(920, 0.16, 'triangle', 0.25);
    const distToTarget = Math.round(Math.hypot(this.ship.x - targetAst.x, this.ship.y - targetAst.y));
    const isSplit = this.squadronMode === 'SPLIT';
    this.bus.emit(EV.HUD_TOAST, {
      message: isSplit
        ? `🛸 ${count}x GROK DRONES DEPLOYED • SPLIT CLUSTER MODE • Parallel Extraction`
        : `🛸 ${count}x GROK DRONES DEPLOYED • FOCUS MODE • ${targetAst.oreName || 'Deposit'} (${distToTarget}m)`,
      type: 'success'
    });

    this.bus.emit('drones:state_changed', { isMining: true, activeCount: count });
  }

  /**
   * Recolhe todos os drones de volta para o Drone Bay (estilo EVE Online)
   */
  recallDrones() {
    this.isMining = false;

    let returningCount = 0;
    for (const drone of this.drones) {
      if (drone.state !== 'DOCKED') {
        drone.state = 'RECALLING';
        drone.laserActive = false;
        if (drone.laserGroup) {
          drone.laserGroup.style.display = 'none';
        }
        returningCount++;
      }
    }

    playSciFiBeep(640, 0.12, 'sine', 0.18);
    this.bus.emit(EV.HUD_TOAST, {
      message: `RECALLING DRONES • ${returningCount}x Grok returning to bay`,
      type: 'info'
    });

    this.bus.emit('drones:state_changed', { isMining: false, activeCount: 0 });
  }

  /**
   * Reorienta os drones para um asteroide selecionado especificamente (Comando Tático de Esquadra)
   * @param {import('../entities/AsteroidEntity.js').AsteroidEntity} targetAst 
   */
  retargetDrones(targetAst) {
    if (!targetAst || targetAst.isDepleted || targetAst.currentUnits <= 0) {
      if (this.bus) {
        this.bus.emit(EV.HUD_TOAST, {
          message: 'INVALID TARGET • Asteroid is depleted or unavailable',
          type: 'warning'
        });
      }
      return;
    }

    if (!this.hasDeployedDrones()) {
      this.launchDrones(targetAst);
      return;
    }

    this.isMining = true;
    let count = 0;
    for (const drone of this.drones) {
      if (drone.state !== 'DOCKED') {
        drone.targetAsteroid = targetAst;
        drone.state = 'DEPLOYING';
        drone.cycleTime = 0;
        drone.laserActive = false;
        if (drone.laserGroup) drone.laserGroup.style.display = 'none';
        count++;
      }
    }

    playSciFiBeep(880, 0.12, 'triangle', 0.2);
    if (this.bus) {
      this.bus.emit(EV.HUD_TOAST, {
        message: `DRONE SQUADRON • Focus fire on ${targetAst.oreName || 'Deposit'}`,
        type: 'info'
      });
      this.bus.emit('drones:state_changed', { isMining: true, activeCount: count });
    }
  }

  /**
   * Coloca os drones em modo de espera defensivo/órbita em torno da nave
   */
  setDronesStandby() {
    let count = 0;
    for (const drone of this.drones) {
      if (drone.state !== 'DOCKED') {
        drone.laserActive = false;
        if (drone.laserGroup) drone.laserGroup.style.display = 'none';
        drone.state = 'ORBITING_SHIP';
        drone.targetAsteroid = null;
        count++;
      }
    }

    if (count > 0) {
      playSciFiBeep(720, 0.1, 'sine', 0.15);
      if (this.bus) {
        this.bus.emit(EV.HUD_TOAST, {
          message: `DRONE SQUADRON • Standing by in ship orbit (${count} units)`,
          type: 'info'
        });
      }
    }
  }

  /**
   * Atraca imediatamente todos os drones (ao atracar na estação)
   */
  dockAllImmediately() {
    this.isMining = false;

    for (const drone of this.drones) {
      // Se tinha minério quando atracou na estação, transfere para o porão da nave
      if (drone.internalCargo > 0) {
        const oreType = (drone.targetAsteroid && drone.targetAsteroid.oreType) || 'ferrox';
        addShipOre(oreType, drone.internalCargo);
        drone.internalCargo = 0;
      }
      drone.targetAsteroid = null;
      drone.state = 'DOCKED';
      drone.laserActive = false;
      drone.cycleTime = 0;
      if (drone.domEl) drone.domEl.style.display = 'none';
      if (drone.laserGroup) drone.laserGroup.style.display = 'none';
    }

    this.bus.emit('drones:state_changed', { isMining: false, activeCount: 0 });
  }

  /**
   * Loop determinístico de física, navegação e ciclos dos drones
   * @param {number} dt Delta-time em segundos
   */
  update(dt) {
    const count = this.getAvailableDronesCount();
    let activeDronesCount = 0;

    for (let i = 0; i < this.MAX_DRONES; i++) {
      const drone = this.drones[i];

      if (i >= count && drone.state === 'DOCKED') {
        if (drone.domEl && drone.domEl.style.display !== 'none') {
          drone.domEl.style.display = 'none';
        }
        continue;
      }

      if (drone.state !== 'DOCKED') {
        activeDronesCount++;
      }

      let asteroid = drone.targetAsteroid;

      switch (drone.state) {
        // ── 1. Voo em direção ao Asteroide ──
        case 'DEPLOYING': {
          // Se o asteroide esgotou antes de chegar, procura outro conforme o modo da esquadra
          if (!asteroid || asteroid.isDepleted || asteroid.currentUnits <= 0) {
            const nextAst = this.getTargetForDrone(drone);
            if (nextAst) {
              drone.targetAsteroid = nextAst;
              asteroid = nextAst;
            } else {
              drone.laserActive = false;
              if (drone.laserGroup) drone.laserGroup.style.display = 'none';
              if (drone.internalCargo > 0) {
                drone.state = 'RETURNING_TO_UNLOAD';
              } else {
                drone.state = 'ORBITING_SHIP';
                drone.targetAsteroid = null;
              }
              break;
            }
          }

          drone.orbitAngle += dt * drone.orbitSpeed;
          const astRadius = ((asteroid.baseWidth || 320) * 0.5) * (asteroid.currentScale || 1.0);
          drone.orbitRadius = Math.max(170, astRadius + 45 + (drone.id % 3) * 22);

          const targetX = asteroid.x + Math.cos(drone.orbitAngle) * drone.orbitRadius;
          const targetY = asteroid.y + Math.sin(drone.orbitAngle) * drone.orbitRadius;

          const dx = targetX - drone.x;
          const dy = targetY - drone.y;
          const dist = Math.hypot(dx, dy);

          if (dist < 32) {
            // Chegou à órbita do asteroide: inicia mineração
            drone.state = 'MINING';
            drone.laserActive = true;
            if (drone.laserGroup) drone.laserGroup.style.display = 'block';
          } else {
            const droneSpeed = this.DRONE_SPEED_DEPLOY * (0.96 + (drone.id % 3) * 0.04);
            const step = Math.min(dist, droneSpeed * dt);
            drone.x += (dx / dist) * step;
            drone.y += (dy / dist) * step;
            const flightAngle = Math.atan2(dy, dx) + (Math.PI / 2);
            drone.angle = lerpAngle(drone.angle, flightAngle, dt * 12.0);
          }
          break;
        }

        // ── 2. Em Órbita a Minerar (Feixe Branco-Azulado • 20s por Unidade) ──
        case 'MINING': {
          if (!asteroid || asteroid.isDepleted || asteroid.currentUnits <= 0) {
            // Asteroide esgotou: procura outro depósito conforme o modo da esquadra (FOCUS vs SPLIT)
            const nextAst = this.getTargetForDrone(drone);
            if (nextAst) {
              drone.targetAsteroid = nextAst;
              asteroid = nextAst;
              drone.state = 'DEPLOYING';
            } else {
              drone.laserActive = false;
              if (drone.laserGroup) drone.laserGroup.style.display = 'none';
              if (drone.internalCargo > 0) {
                drone.state = 'RETURNING_TO_UNLOAD';
              } else {
                drone.state = 'ORBITING_SHIP';
                drone.targetAsteroid = null;
              }
            }
            break;
          }

          // Órbita fluida sobre o asteroide
          drone.orbitAngle += dt * drone.orbitSpeed;
          const astRadius = ((asteroid.baseWidth || 320) * 0.5) * (asteroid.currentScale || 1.0);
          drone.orbitRadius = Math.max(170, astRadius + 45 + (drone.id % 3) * 22);

          const orbitTargetX = asteroid.x + Math.cos(drone.orbitAngle) * drone.orbitRadius;
          const orbitTargetY = asteroid.y + Math.sin(drone.orbitAngle) * drone.orbitRadius;

          drone.x += (orbitTargetX - drone.x) * Math.min(1.0, dt * 4.0);
          drone.y += (orbitTargetY - drone.y) * Math.min(1.0, dt * 4.0);

          // Proa aponta estritamente no sentido do voo orbital (a frente da nave acompanha o trajeto, nunca voa de lado)
          const tangentX = -Math.sin(drone.orbitAngle);
          const tangentY = Math.cos(drone.orbitAngle);
          const flightAngle = Math.atan2(tangentY, tangentX) + (Math.PI / 2);
          drone.angle = lerpAngle(drone.angle, flightAngle, dt * 10.0);
          drone.laserActive = true;
          if (drone.laserGroup && drone.laserGroup.style.display === 'none') {
            drone.laserGroup.style.display = 'block';
          }

          // ── Ciclo de 20s por Unidade ──
          drone.cycleTime += dt;
          if (drone.cycleTime >= this.CYCLE_DURATION) {
            drone.cycleTime = 0;
            const extracted = (typeof asteroid.mineUnit === 'function') 
              ? asteroid.mineUnit(1) 
              : ((typeof asteroid.extractOre === 'function') ? asteroid.extractOre(1) : 1);

            if (extracted > 0) {
              drone.internalCargo += extracted;

              // Atualiza badge de carga visual no drone
              this._updateDroneCargoBadge(drone);

              // ── A cada 1 unidade regressa imediatamente à nave para despejar no ORE STORAGE ──
              drone.laserActive = false;
              if (drone.laserGroup) drone.laserGroup.style.display = 'none';
              drone.state = 'RETURNING_TO_UNLOAD';
            }
          }
          break;
        }

        // ── 3. Regresso à Nave para Descarregar a Unidade no ORE STORAGE ──
        case 'RETURNING_TO_UNLOAD': {
          drone.laserActive = false;
          if (drone.laserGroup) drone.laserGroup.style.display = 'none';

          // Abordagem tática em leque pelos flancos e retaguarda (elimina a fila indiana)
          const spreadAngle = (drone.id - 2) * 0.45; // leque tático de -50° a +50°
          const shipAngle = (this.ship.angle !== undefined) ? this.ship.angle : 0;
          const targetAngle = shipAngle + Math.PI + spreadAngle;
          const standoffDist = 100 + (drone.id % 2) * 14; // 100m a 114m da nave mãe

          const targetX = this.ship.x + Math.cos(targetAngle) * standoffDist;
          const targetY = this.ship.y + Math.sin(targetAngle) * standoffDist;

          const dx = targetX - drone.x;
          const dy = targetY - drone.y;
          const distToTarget = Math.hypot(dx, dy);
          const distToShip = Math.hypot(this.ship.x - drone.x, this.ship.y - drone.y);

          if (distToTarget < 28 || distToShip <= standoffDist + 6) {
            // Chegou à posição de escolta para descarga: inicia sequência do feixe magnético (0.7s)
            drone.state = 'UNLOADING';
            drone.unloadTimer = 0.7;
            drone.unloadMaxTimer = 0.7;
            drone.unloadOreType = (asteroid && asteroid.oreType) || 'ferrox';
            drone.unloadCargo = drone.internalCargo > 0 ? drone.internalCargo : 1;
          } else {
            // Ligeira variação de velocidade individual (145 a 155 m/s) para formação viva
            const droneSpeed = this.DRONE_SPEED_RETURN * (0.96 + (drone.id % 3) * 0.04);
            const step = Math.min(distToTarget, droneSpeed * dt);
            drone.x += (dx / distToTarget) * step;
            drone.y += (dy / distToTarget) * step;
            const flightAngle = Math.atan2(dy, dx) + (Math.PI / 2);
            drone.angle = lerpAngle(drone.angle, flightAngle, dt * 10.0);
          }
          break;
        }

        // ── 3b. Sequência Visual de Descarga Magnética para o Porão da Nave (0.7s) ──
        case 'UNLOADING': {
          drone.laserActive = false;
          if (drone.laserGroup) drone.laserGroup.style.display = 'none';

          // Drone mantém posição a ~100m e orienta o casco para a nave mãe
          const toShipAngle = Math.atan2(this.ship.y - drone.y, this.ship.x - drone.x) + (Math.PI / 2);
          drone.angle = lerpAngle(drone.angle, toShipAngle, dt * 12.0);

          drone.unloadTimer -= dt;

          if (drone.unloadTimer <= 0) {
            // Conclusão da transferência magnética: o minério entra no ORE STORAGE
            const cargoToUnload = drone.unloadCargo || drone.internalCargo || 1;
            const oreType = drone.unloadOreType || 'ferrox';

            addShipOre(oreType, cargoToUnload);

            drone.internalCargo = 0;
            drone.unloadCargo = 0;
            this._updateDroneCargoBadge(drone);

            // Verificar se o porão da nave atingiu o limite máximo
            const cargo = state.shipCargo;
            const currentTotal = (cargo.ferrox || 0) + (cargo.crynex || 0) + (cargo.varelium || 0);
            const maxCap = cargo.capacity || 30;

            if (currentTotal >= maxCap) {
              drone.state = 'DOCKED';
              if (drone.domEl) drone.domEl.style.display = 'none';
              if (this.isMining) {
                this.isMining = false;
                this.bus.emit(EV.HUD_TOAST, {
                  message: `SHIP ORE STORAGE FULL (${maxCap}/${maxCap} T) • Return to station to unload`,
                  type: 'warning'
                });
              }
            } else if (this.isMining) {
              // Volta a minerar ciclicamente! Procura alvo conforme o modo da esquadra (FOCUS vs SPLIT)
              if (this.squadronMode === 'SPLIT' || !asteroid || asteroid.isDepleted || asteroid.currentUnits <= 0) {
                drone.targetAsteroid = this.getTargetForDrone(drone);
              }
              if (drone.targetAsteroid && !drone.targetAsteroid.isDepleted && drone.targetAsteroid.currentUnits > 0) {
                drone.state = 'DEPLOYING';
                drone.cycleTime = 0;
              } else {
                // Se não houver mais asteroides: orbitam a nave até o utilizador clicar em recolher drones
                drone.state = 'ORBITING_SHIP';
                drone.targetAsteroid = null;
                drone.cycleTime = 0;
                drone.laserActive = false;
                if (drone.laserGroup) drone.laserGroup.style.display = 'none';
                if (drone.domEl) drone.domEl.style.display = 'block';
              }
            } else {
              drone.state = 'DOCKED';
              if (drone.domEl) drone.domEl.style.display = 'none';
            }
          }
          break;
        }

        // ── 5. Em Órbita da Nave (Standby até o utilizador recolher ou surgir asteroide) ──
        case 'ORBITING_SHIP': {
          drone.laserActive = false;
          if (drone.laserGroup) drone.laserGroup.style.display = 'none';
          if (drone.domEl) drone.domEl.style.display = 'block';

          // Raio e velocidade orbital em torno da nave
          drone.orbitAngle += dt * 0.9;
          const shipOrbitRadius = 80 + (drone.id % 3) * 18;

          const targetX = this.ship.x + Math.cos(drone.orbitAngle) * shipOrbitRadius;
          const targetY = this.ship.y + Math.sin(drone.orbitAngle) * shipOrbitRadius;

          const dx = targetX - drone.x;
          const dy = targetY - drone.y;
          const dist = Math.hypot(dx, dy);

          if (dist > 2) {
            const step = Math.min(dist, Math.max(this.DRONE_SPEED_RETURN, dist * 6) * dt);
            drone.x += (dx / dist) * step;
            drone.y += (dy / dist) * step;
          }

          // Proa aponta estritamente no sentido do voo (nunca anda de lado)
          if (dist > 30) {
            const flightAngle = Math.atan2(dy, dx) + (Math.PI / 2);
            drone.angle = lerpAngle(drone.angle, flightAngle, dt * 10.0);
          } else {
            const tangentX = -Math.sin(drone.orbitAngle);
            const tangentY = Math.cos(drone.orbitAngle);
            const flightAngle = Math.atan2(tangentY, tangentX) + (Math.PI / 2);
            drone.angle = lerpAngle(drone.angle, flightAngle, dt * 10.0);
          }

          // Se surgir um novo asteroide (respawn ou deslocação da nave para perto de outro)
          if (this.isMining) {
            const nextAst = this.findNearestAsteroidInRange(this.ship.x, this.ship.y, this.getScanRadius());
            if (nextAst && !nextAst.isDepleted && nextAst.currentUnits > 0) {
              drone.targetAsteroid = nextAst;
              drone.state = 'DEPLOYING';
              drone.cycleTime = 0;
            }
          }
          break;
        }

        // ── 4. Recolha Geral Ordenada pelo Jogador (Atalho 2 / Botão) ──
        case 'RECALLING': {
          drone.laserActive = false;
          if (drone.laserGroup) drone.laserGroup.style.display = 'none';

          const dx = this.ship.x - drone.x;
          const dy = this.ship.y - drone.y;
          const dist = Math.hypot(dx, dy);

          if (dist < 55) {
            // Descarrega o que tiver no porão da nave ao recolher
            if (drone.internalCargo > 0) {
              const oreType = (asteroid && asteroid.oreType) || 'ferrox';
              addShipOre(oreType, drone.internalCargo);
              drone.internalCargo = 0;
              this._updateDroneCargoBadge(drone);
            }
            drone.state = 'DOCKED';
            drone.targetAsteroid = null;
            drone.cycleTime = 0;
            if (drone.domEl) drone.domEl.style.display = 'none';
            if (drone.laserGroup) drone.laserGroup.style.display = 'none';

            // Verifica se todos os drones já recolheram
            const allDocked = this.drones.every(d => d.state === 'DOCKED');
            if (allDocked) {
              this.bus.emit(EV.HUD_TOAST, {
                message: `ALL GROK DRONES DOCKED IN BAY`,
                type: 'info'
              });
            }
          } else {
            const step = Math.min(dist, this.DRONE_SPEED_RETURN * dt);
            drone.x += (dx / dist) * step;
            drone.y += (dy / dist) * step;
            const flightAngle = Math.atan2(dy, dx) + (Math.PI / 2);
            drone.angle = lerpAngle(drone.angle, flightAngle, dt * 12.0);
          }
          break;
        }

        case 'DOCKED':
        default:
          drone.x = this.ship.x;
          drone.y = this.ship.y;
          break;
      }
    }

    // Se estava a minerar mas todos os drones atracaram e não há asteroides
    if (this.isMining && activeDronesCount === 0) {
      this.isMining = false;
      this.bus.emit('drones:state_changed', { isMining: false, activeCount: 0 });
    }
  }

  _updateDroneCargoBadge(drone) {
    if (!drone.domEl) return;
    const badge = drone.domEl.querySelector('.grok-drone-cargo-badge');
    if (badge && badge.parentNode) {
      badge.parentNode.removeChild(badge);
    }
  }

  /**
   * Renderização gráfica contínua chamada a cada frame da GPU
   * @param {import('../core/Camera2D.js').Camera2D} camera
   */
  render(camera) {
    if (!camera) return;
    this.impactPoints = [];

    for (let i = 0; i < this.MAX_DRONES; i++) {
      const drone = this.drones[i];

      if (drone.state === 'DOCKED' || !drone.domEl) {
        if (drone.domEl && drone.domEl.style.display !== 'none') {
          drone.domEl.style.display = 'none';
        }
        if (drone.laserGroup && drone.laserGroup.style.display !== 'none') {
          drone.laserGroup.style.display = 'none';
        }
        continue;
      }

      // Converte coordenadas mundiais do drone para coordenadas de ecrã
      const screenPos = camera.worldToScreen(drone.x, drone.y);

      // Escala dinâmica suave baseada no zoom da câmara
      const baseW = 26;
      const baseH = 39;
      const scale = Math.max(0.6, Math.min(1.35, camera.zoomRatio));
      const w = baseW * scale;
      const h = baseH * scale;

      drone.domEl.style.display = 'block';
      drone.domEl.style.width = `${w.toFixed(1)}px`;
      drone.domEl.style.height = `${h.toFixed(1)}px`;
      drone.domEl.style.transform = `translate3d(${(screenPos.x - w / 2).toFixed(1)}px, ${(screenPos.y - h / 2).toFixed(1)}px, 0) rotate(${drone.angle.toFixed(3)}rad)`;

      // ── Feixe Único Branco com Tom de Azul do Drone Grok ──
      const asteroid = drone.targetAsteroid;

      if (drone.laserActive && drone.state === 'MINING' && asteroid && drone.laserGlow && drone.laserCore) {
        if (drone.laserGroup && drone.laserGroup.style.display === 'none') {
          drone.laserGroup.style.display = 'block';
        }

        // Ponto de emissão do laser de mineração no drone (ecrã)
        const originX = screenPos.x;
        const originY = screenPos.y;

        // Ponto de impacto no asteroide: calculado no espaço de mundo para manter escala e alinhamento perfeitos em qualquer zoom
        const astRadius = ((asteroid.baseWidth || 320) * 0.5) * (asteroid.currentScale || 1.0);
        const toDroneX = drone.x - asteroid.x;
        const toDroneY = drone.y - asteroid.y;
        const dToDrone = Math.hypot(toDroneX, toDroneY) || 1.0;
        const uX = toDroneX / dToDrone;
        const uY = toDroneY / dToDrone;

        // Impacto na face do asteroide voltada para o drone (~50% do raio a partir do centro da rocha)
        const hitDist = astRadius * 0.50;
        const impactWorldX = asteroid.x + uX * hitDist;
        const impactWorldY = asteroid.y + uY * hitDist;
        const impactScreen = camera.worldToScreen(impactWorldX, impactWorldY);

        const targetX = impactScreen.x;
        const targetY = impactScreen.y;

        drone.laserGlow.setAttribute('x1', originX.toFixed(1));
        drone.laserGlow.setAttribute('y1', originY.toFixed(1));
        drone.laserGlow.setAttribute('x2', targetX.toFixed(1));
        drone.laserGlow.setAttribute('y2', targetY.toFixed(1));

        drone.laserCore.setAttribute('x1', originX.toFixed(1));
        drone.laserCore.setAttribute('y1', originY.toFixed(1));
        drone.laserCore.setAttribute('x2', targetX.toFixed(1));
        drone.laserCore.setAttribute('y2', targetY.toFixed(1));

        // Regista ponto de impacto ativo do drone
        this.impactPoints.push({ x: targetX, y: targetY, type: 'drone' });
      } else {
        if (drone.laserGroup && drone.laserGroup.style.display !== 'none') {
          drone.laserGroup.style.display = 'none';
        }
      }
    }
  }

  getImpactPoints() {
    return this.impactPoints || [];
  }

  getActiveTransfers() {
    const transfers = [];
    for (let i = 0; i < this.MAX_DRONES; i++) {
      const drone = this.drones[i];
      if (drone.state === 'UNLOADING') {
        const progress = Math.max(0.0, Math.min(1.0, 1.0 - (drone.unloadTimer / (drone.unloadMaxTimer || 0.35))));
        transfers.push({
          droneX: drone.x,
          droneY: drone.y,
          shipX: this.ship.x,
          shipY: this.ship.y,
          progress: progress,
          oreType: drone.unloadOreType || 'ferrox',
          droneId: drone.id
        });
      }
    }
    return transfers;
  }

  destroy() {
    this.dockAllImmediately();
    if (this._unsubs) {
      for (const unsub of this._unsubs) {
        if (typeof unsub === 'function') unsub();
      }
      this._unsubs = [];
    }
    if (this.dronesLayer && this.dronesLayer.parentNode) {
      this.dronesLayer.parentNode.removeChild(this.dronesLayer);
    }
    if (this.lasersGroup && this.lasersGroup.parentNode) {
      this.lasersGroup.parentNode.removeChild(this.lasersGroup);
    }
  }
}
