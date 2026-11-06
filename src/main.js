/**
 * HARPIA Universe - Main Engine Bootstrapper
 * Ponto de entrada modular AAA que orquestra todos os subsistemas e o loop de jogo.
 */
import { EventBus, EV } from './core/EventBus.js';
import { GameLoop } from './core/GameLoop.js';
import { Camera2D } from './core/Camera2D.js';
import { Security } from './core/Security.js';
import { InputManager } from './systems/InputManager.js';
import { StarfieldRenderer } from './systems/StarfieldRenderer.js';
import { ShipEntity } from './entities/ShipEntity.js';
import { StationEntity } from './entities/StationEntity.js';
import { PlanetEntity } from './entities/PlanetEntity.js';
import { AsteroidEntity } from './entities/AsteroidEntity.js';
import { HudController } from './ui/HudController.js';
import { LobbyView } from './ui/lobby/LobbyView.js';
import { StationHangarView } from './ui/station/StationHangarView.js';
import { SpaceOreStorageWidget } from './ui/hud/SpaceOreStorageWidget.js';
import { ShipNavHud } from './ui/hud/ShipNavHud.js';
import { MiningLaserModule } from './ui/hud/MiningLaserModule.js';
import { MiningLaserRenderer } from './systems/MiningLaserRenderer.js';
import { MiningImpactEffects } from './systems/MiningImpactEffects.js';
import { DroneMiningSystem } from './systems/DroneMiningSystem.js';
import { TacticalOverviewPanel } from './ui/hud/TacticalOverviewPanel.js';
import { OffScreenRadarMarkers } from './ui/hud/OffScreenRadarMarkers.js';
import { MultiplayerSystem } from './systems/MultiplayerSystem.js';
import { MultiplayerChatWidget } from './ui/hud/MultiplayerChatWidget.js';
import { GalaxyStarmap } from './universe/GalaxyStarmap.js';
import { InterstellarWarpBanner } from './universe/InterstellarWarpBanner.js';
import { HOME_SYSTEM_ID, getCurrentSystemId } from './universe/GalaxyData.js';
import { state, initStateBus, setPilotCredits } from './core/state.js';
import { wsClient } from './network/websocket.js';
import { api } from './network/ApiClient.js';
import { initAudioEventBus } from './core/audio.js';

export class HarpiaGameEngine {
  constructor() {
    console.log('%c[HARPIA UNIVERSE] Initializing AAA modular engine...', 'color: #00f0ff; font-weight: bold;');

    // 0. Proteção e Segurança do Cliente
    Security.init();

    // 1. Core
    this.bus = new EventBus();
    initStateBus(this.bus);
    this.loop = new GameLoop();
    this.camera = new Camera2D(this.bus);
    initAudioEventBus(this.bus);

    // 2. Sistemas
    this.input = new InputManager(this.bus);
    const canvas = document.getElementById('starfield-canvas');
    this.renderer = new StarfieldRenderer(canvas);

    // 3. Entidades - Cluster de 4 Asteroides de Ferrox
    this.ship = new ShipEntity(this.bus);
    this.station = new StationEntity();
    this.planet = new PlanetEntity();
    this.asteroids = [
      new AsteroidEntity({
        id: 1,
        name: 'Ferrox Asteroid Alpha',
        x: 4500,
        y: -2400,
        baseWidth: 320,
        rotationSpeed: 0.02,
        storageKey: 'harpia_asteroid_ferrox_v1',
        wrapId: 'asteroid-wrap',
        eventBus: this.bus
      }),
      new AsteroidEntity({
        id: 2,
        name: 'Ferrox Asteroid Beta',
        x: 4100,
        y: -2050,
        baseWidth: 290,
        rotationSpeed: -0.018,
        storageKey: 'harpia_asteroid_ferrox_2',
        wrapId: 'asteroid-wrap-2',
        eventBus: this.bus
      }),
      new AsteroidEntity({
        id: 3,
        name: 'Ferrox Asteroid Gamma',
        x: 4950,
        y: -2150,
        baseWidth: 340,
        rotationSpeed: 0.024,
        storageKey: 'harpia_asteroid_ferrox_3',
        wrapId: 'asteroid-wrap-3',
        eventBus: this.bus
      }),
      new AsteroidEntity({
        id: 4,
        name: 'Ferrox Asteroid Delta',
        x: 4680,
        y: -2850,
        baseWidth: 310,
        rotationSpeed: -0.021,
        storageKey: 'harpia_asteroid_ferrox_4',
        wrapId: 'asteroid-wrap-4',
        eventBus: this.bus
      }),
      // Asteroide de Varelium na posição oposta a Ferrox (-4500, 2400)
      new AsteroidEntity({
        id: 1,
        oreType: 'varelium',
        oreName: 'Varelium',
        imageSrc: './assets/items/varelium.png',
        x: -4500,
        y: 2400,
        baseWidth: 320,
        rotationSpeed: 0.02,
        maxUnits: 60,
        storageKey: 'harpia_asteroid_varelium_1',
        wrapId: 'asteroid-wrap-varelium',
        bodyId: 'asteroid-body-varelium',
        unitsTextId: 'ast-units-text-varelium',
        eventBus: this.bus
      }),
      // Lote de 6 Asteroides Celestiais de Crynex (100 Unidades cada)
      new AsteroidEntity({
        id: 1,
        oreType: 'crynex',
        oreName: 'Crynex',
        imageSrc: './assets/items/crynex.png',
        x: -1850,
        y: -3800,
        baseWidth: 330,
        rotationSpeed: 0.019,
        maxUnits: 100,
        storageKey: 'harpia_asteroid_crynex_1',
        eventBus: this.bus
      }),
      new AsteroidEntity({
        id: 2,
        oreType: 'crynex',
        oreName: 'Crynex',
        imageSrc: './assets/items/crynex.png',
        x: -2300,
        y: -3550,
        baseWidth: 350,
        rotationSpeed: -0.022,
        maxUnits: 100,
        storageKey: 'harpia_asteroid_crynex_2',
        eventBus: this.bus
      }),
      new AsteroidEntity({
        id: 3,
        oreType: 'crynex',
        oreName: 'Crynex',
        imageSrc: './assets/items/crynex.png',
        x: -2750,
        y: -3900,
        baseWidth: 310,
        rotationSpeed: 0.025,
        maxUnits: 100,
        storageKey: 'harpia_asteroid_crynex_3',
        eventBus: this.bus
      }),
      new AsteroidEntity({
        id: 4,
        oreType: 'crynex',
        oreName: 'Crynex',
        imageSrc: './assets/items/crynex.png',
        x: -2100,
        y: -4250,
        baseWidth: 340,
        rotationSpeed: -0.018,
        maxUnits: 100,
        storageKey: 'harpia_asteroid_crynex_4',
        eventBus: this.bus
      }),
      new AsteroidEntity({
        id: 5,
        oreType: 'crynex',
        oreName: 'Crynex',
        imageSrc: './assets/items/crynex.png',
        x: -2550,
        y: -4400,
        baseWidth: 320,
        rotationSpeed: 0.021,
        maxUnits: 100,
        storageKey: 'harpia_asteroid_crynex_5',
        eventBus: this.bus
      }),
      new AsteroidEntity({
        id: 6,
        oreType: 'crynex',
        oreName: 'Crynex',
        imageSrc: './assets/items/crynex.png',
        x: -1700,
        y: -4500,
        baseWidth: 360,
        rotationSpeed: -0.024,
        maxUnits: 100,
        storageKey: 'harpia_asteroid_crynex_6',
        eventBus: this.bus
      })
    ];
    this.asteroid = this.asteroids[0];

    if (typeof window !== 'undefined') {
      window.harpiaAsteroids = this.asteroids;
      window.harpiaAsteroid = this.asteroids[0];
    }

    // 4. UI & Controladores Modulares
    this.hud = new HudController(this.bus, this.camera);
    this.hangarView = new StationHangarView({ eventBus: this.bus, state });

    this.spaceOreStorage = new SpaceOreStorageWidget({ eventBus: this.bus, state });
    const spaceOreMount = document.getElementById('space-ore-mount') || document.getElementById('game-world');
    if (spaceOreMount) {
      this.spaceOreStorage.mount(spaceOreMount);
    }

    this.shipNavHud = new ShipNavHud({ eventBus: this.bus, ship: this.ship });
    this.impactEffects = new MiningImpactEffects();
    this.laserRenderer = new MiningLaserRenderer({ eventBus: this.bus, impactEffects: this.impactEffects });
    this.droneMiningSystem = new DroneMiningSystem({
      eventBus: this.bus,
      ship: this.ship,
      asteroids: this.asteroids
    });
    if (typeof window !== 'undefined') {
      window.harpiaDroneMiningSystem = this.droneMiningSystem;
    }
    this.miningModule = new MiningLaserModule({
      eventBus: this.bus,
      ship: this.ship,
      asteroids: this.asteroids,
      asteroid: this.asteroid,
      laserRenderer: this.laserRenderer,
      droneMiningSystem: this.droneMiningSystem
    });

    // ── Subsistemas Táticos Espaciais (Overview, Radar de Borda) ──
    this.overviewPanel = new TacticalOverviewPanel({
      eventBus: this.bus,
      ship: this.ship,
      station: this.station,
      asteroids: this.asteroids,
      droneMiningSystem: this.droneMiningSystem
    });

    this.radarMarkers = new OffScreenRadarMarkers({
      eventBus: this.bus,
      ship: this.ship,
      camera: this.camera,
      station: this.station,
      asteroids: this.asteroids,
      overviewPanel: this.overviewPanel
    });

    const shipNavMount = document.getElementById('ship-nav-mount') || document.getElementById('game-world');
    if (shipNavMount) {
      this.shipNavHud.mount(shipNavMount);
      this.miningModule.mount(shipNavMount);
    }

    // Montar componentes táticos no ecrã
    this.overviewPanel.mount(document.body);
    this.radarMarkers.mount(document.body);

    // ── Mapa Galáctico Tático (Starmap - Tecla 'M') ──
    this.galaxyStarmap = new GalaxyStarmap({
      eventBus: this.bus,
      ship: this.ship
    });
    const galaxyMount = document.getElementById('galaxy-map-mount') || document.body;
    this.galaxyStarmap.mount(galaxyMount);

    // ── Banner de Rota de Warp Interestelar no HUD ──
    this.interstellarWarpBanner = new InterstellarWarpBanner({
      eventBus: this.bus,
      ship: this.ship
    });
    const warpMount = document.getElementById('interstellar-warp-mount') || document.getElementById('game-world');
    if (warpMount) {
      this.interstellarWarpBanner.mount(warpMount);
    }

    // ── Subsistema Multijogador Espacial (Naves Remotas & Chat Global) ──
    this.multiplayerSystem = new MultiplayerSystem({
      bus: this.bus,
      localShip: this.ship,
      droneMiningSystem: this.droneMiningSystem
    });
    this.chatWidget = new MultiplayerChatWidget({ bus: this.bus });
    this.chatWidget.mount(document.body);
    this.chatWidget.hide();

    const lobbyMount = document.getElementById('lobby-mount') || document.body;
    this.lobbyView = new LobbyView({ eventBus: this.bus });
    this.lobbyView.mount(lobbyMount);

    this._bindEvents();
    this._setupPipeline();

    console.log('%c[HARPIA UNIVERSE] Engine simulation ready.', 'color: #00ffaa; font-weight: bold;');
  }

  _bindEvents() {
    // Zoom via roda do rato
    this.bus.on(EV.INPUT_WHEEL, ({ deltaY }) => {
      this.camera.applyZoom(deltaY);
    });

    // Clique de navegação no ecrã -> Converte para coordenadas mundiais e orienta a nave normalmente
    this.bus.on(EV.INPUT_CLICK, ({ screenX, screenY }) => {
      if (this.ship.isDocked || this.ship.isDocking) return;
      if (this.galaxyStarmap && this.galaxyStarmap.isOpen) return; // Ignora cliques quando mapa galáctico está ativo

      const worldPos = this.camera.screenToWorld(screenX, screenY);
      this.ship.setDestination(worldPos.x, worldPos.y);
    });

    // Redimensionamento de janela
    this.bus.on(EV.INPUT_RESIZE, ({ width, height }) => {
      this.camera.resize(width, height);
      this.renderer.resize(width, height);
    });

    // Transições de estado Jogo / Lobby
    this.bus.on(EV.GAME_START, () => {
      this.start();
    });

    this.bus.on(EV.GAME_EXIT, () => {
      this.stop();
    });

    // Desatracagem desacoplada via EventBus
    this.bus.on('station:request_undock', () => {
      this.undockShip();
    });

    // Ligação WebSocket em tempo real para sincronização do universo e mercado
    this.bus.on(EV.AUTH_LOGGED_IN, () => {
      if (api.token) {
        wsClient.connect(api.token);
      }
    });

    this.bus.on(EV.AUTH_LOGGED_OUT, () => {
      wsClient.disconnect();
    });

    // Se já tiver token guardado na sessão, ligar imediatamente
    if (api.token) {
      wsClient.connect(api.token);
    }

    // Atualização em tempo real de créditos / carteira via WebSocket
    wsClient.on('CREDITS_UPDATED', (payload) => {
      const credits = typeof payload === 'number' ? payload : (payload && payload.credits);
      if (typeof credits === 'number') {
        setPilotCredits(credits);
        const user = api.user;
        if (user) {
          user.credits = credits;
          api.setUser(user);
        }
      }
    });

    // ── Visibilidade de Entities Locais ao Mudar de Sistema ──
    // Quando a nave chega a um sistema interestelar diferente do HOME, ocultar a estação e os
    // asteroides que pertencem exclusivamente ao sistema natal (Harpia Prime).
    const onSystemVisibilityUpdate = () => {
      const isHome = getCurrentSystemId() === HOME_SYSTEM_ID;
      this._setHomeSystemVisible(isHome);
    };
    this.bus.on('ship:warp_completed', onSystemVisibilityUpdate);
    this.bus.on('system:changed', onSystemVisibilityUpdate);
  }

  /**
   * Mostra ou oculta todos os entities físicos do sistema natal (estação + asteroides).
   * Chamado quando o piloto muda de sistema interestelar.
   * @param {boolean} visible
   */
  _setHomeSystemVisible(visible) {
    // Estação Harpia
    const stationEl = this.station?.wrapEl;
    if (stationEl) {
      stationEl.style.display = visible ? '' : 'none';
    }

    // Todos os asteroides do sistema natal
    for (const ast of this.asteroids) {
      if (ast?.wrapEl) {
        ast.wrapEl.style.display = visible ? '' : 'none';
      }
    }

    // Parar minério se sair do sistema
    if (!visible) {
      if (this.miningModule) this.miningModule.stopMining();
    }

    // Notificar o OverviewPanel para não mostrar esses contactos fora do sistema natal
    if (this.overviewPanel) {
      this.overviewPanel.setHomeSystemVisible(visible);
    }
    // Notificar os marcadores de radar de borda
    if (this.radarMarkers) {
      this.radarMarkers.setHomeSystemVisible(visible);
    }
  }

  _setupPipeline() {
    // ── Pipeline de Atualização de Lógica & Física (Delta-Time determinístico) ──
    this.loop.addUpdate((dt) => {
      // 1. Atualiza física e deslocamento da nave
      this.ship.update(dt);

      // Verificação de atracagem: aciona suavemente quando a nave entra e atraca na baía da estação (apenas no sistema natal)
      if (!this.ship.isDocking && !this.ship.isDocked && (getCurrentSystemId() === HOME_SYSTEM_ID)) {
        const bay = this.station.getDockingBayWorld(this.camera);
        const distToBay = Math.hypot(this.ship.x - bay.x, this.ship.y - bay.y);

        // Se a nave estiver na baía e tiver chegado ao destino ou já estiver parada lá
        if (distToBay <= bay.radius) {
          const distToTarget = Math.hypot(this.ship.x - this.ship.targetX, this.ship.y - this.ship.targetY);
          if (!this.ship.isMoving || distToTarget <= 75) {
            this.ship.startDockingSequence(bay.x, bay.y);
          }
        }
      }

      // 2. A câmara foca rigorosamente na posição mundial da nave
      this.camera.setFocus(this.ship.x, this.ship.y);

      // 3. Interpolação suave de câmara (zoom, pan)
      this.camera.update(dt);

      // 4. Atualiza rotação axial contínua de todos os asteroides do cluster
      for (let i = 0; i < this.asteroids.length; i++) {
        this.asteroids[i].update(dt);
      }

      // 5. Atualiza o ciclo determinístico e alcance do Mining Laser
      this.miningModule.update(dt);

      // 6. Atualiza a navegação, órbita e ciclo de 20s dos drones Grok
      this.droneMiningSystem.update(dt);

      // 7. Atualiza o painel tático de overview
      if (this.overviewPanel) this.overviewPanel.update();

      // 8. Sincroniza efeito de dobra espacial (Warp Streaks) no motor de estrelas
      if (this.renderer) {
        this.renderer.setWarp(this.ship.warpState === 'IN_WARP', this.ship.angle);
      }

      // 9. Atualiza o subsistema multijogador espacial (naves remotas e telemetria)
      if (this.multiplayerSystem) {
        this.multiplayerSystem.update(dt);
      }
    });

    // ── Pipeline de Renderização Gráfica Acelerada por GPU ──
    this.loop.addRender(() => {
      // 1. Renderiza o starfield infinito acelerado no canvas
      this.renderer.render(this.camera);

      // 1b. Renderiza o Planeta Celestial no fundo com parallax cósmico
      this.planet.render(this.camera);

      // 2. Renderiza a Estação Espacial com perspectiva ótica convergente
      this.station.render(this.camera);

      // 3. Renderiza o cluster de asteroides com projeção e escala dinâmica
      for (let i = 0; i < this.asteroids.length; i++) {
        this.asteroids[i].render(this.camera);
      }

      // 4. Renderiza feixes dos lasers duplos de mineração (entre asteroide ativo e a nave)
      this.laserRenderer.render(this.camera, this.ship, this.miningModule.getActiveAsteroid());

      // 5. Renderiza os drones Grok e os seus feixes únicos brancos com tom azul
      this.droneMiningSystem.render(this.camera);

      // 5b. Efeitos de impacto incandescentes nos pontos de contacto dos lasers (nave + drones)
      const allImpacts = [
        ...this.laserRenderer.getImpactPoints(),
        ...this.droneMiningSystem.getImpactPoints()
      ];
      this.impactEffects.render(
        allImpacts,
        this.droneMiningSystem.drones,
        this.camera,
        this.droneMiningSystem.getActiveTransfers()
      );

      // 5c. Renderiza as naves dos outros jogadores online no espaço
      if (this.multiplayerSystem) {
        this.multiplayerSystem.render(this.camera);
      }

      // 6. Renderiza a nave mineradora H-M2 centrada com rotação suave
      this.ship.render(this.camera);

      // 7. Renderiza a HUD e o marcador tático sincronizado
      this.hud.render();

      // 8. Atualiza o HUD tático de navegação da nave (velocidade, escudo, casco)
      this.shipNavHud.render(this.ship);

      // 9. Renderiza os marcadores de radar fora de ecrã (bordas da janela)
      if (this.radarMarkers) {
        this.radarMarkers.render();
      }
    });
  }

  start() {
    this.input.enable();

    // Sincronizar câmara imediatamente na posição persistida da nave
    this.camera.x = this.ship.x;
    this.camera.y = this.ship.y;
    this.camera.setFocus(this.ship.x, this.ship.y);

    // Sincronizar visibilidade dos entities locais (apenas no sistema natal)
    const isHome = getCurrentSystemId() === HOME_SYSTEM_ID;
    this._setHomeSystemVisible(isHome);

    // Se o jogador estava dentro da estação, restaurar o Hangar ativo
    if (this.ship.isDocked) {
      this.bus.emit(EV.STATION_DOCKED);
    }

    if (this.chatWidget) {
      this.chatWidget.show();
    }

    this.loop.start();
  }

  stop() {
    this.input.disable();
    if (this.chatWidget) {
      this.chatWidget.hide();
    }
    this.loop.stop();
  }

  undockShip() {
    if (!this.ship.isDocked && !this.ship.isDocking) return;
    const bay = this.station.getDockingBayWorld(this.camera);
    // Ponto de saída do hangar com margem de segurança proporcional no espaço aberto
    const margin = Math.round(220 * (this.station.baseWidth / 1450));
    const exitX = bay.x + margin;
    const exitY = bay.y;
    this.camera.resetPan();
    this.ship.undock(exitX, exitY);
    this.camera.setFocus(this.ship.x, this.ship.y);
  }
}

// Inicializar motor garantindo execução mesmo com carregamento assíncrono
function initEngine() {
  if (!window.HarpiaEngine) {
    window.HarpiaEngine = new HarpiaGameEngine();
    window.undockShipFromStation = () => {
      if (window.HarpiaEngine) {
        window.HarpiaEngine.undockShip();
      }
    };
    window.exitGameWorld = () => {
      if (window.HarpiaEngine && window.HarpiaEngine.lobbyView) {
        window.HarpiaEngine.lobbyView.exitGameWorld();
      }
    };
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initEngine);
} else {
  initEngine();
}
