/**
 * HARPIA Universe - StationHangarView
 * Orquestrador Mestre da Estação (Padrão AAA)
 * Conecta State e EventBus aos submódulos desacoplados de apresentação:
 * - ShipOreStoragePanel (Esquerda: SHIP ORE STORAGE + GROK DRONES HANGAR integrados)
 * - StationStoragePanel (Direita: STORAGE STATION)
 * - ShipHangarPanel (Inferior: Doca de Naves)
 * - MarketStationPanel & ShipSpecsPanel (Visualizações modais / Assembly)
 */
import { UIComponent } from '../core/UIComponent.js';
import { EV } from '../../core/EventBus.js';
import { ShipOreStoragePanel } from './ShipOreStoragePanel.js';
import { StationStoragePanel } from './StationStoragePanel.js';
import { ShipHangarPanel } from './ShipHangarPanel.js';
import { SplitStackModal } from './SplitStackModal.js';
import { ShipSpecsPanel } from './ShipSpecsPanel.js';
import { MarketStationPanel } from './MarketStationPanel.js';
import { transferItemToStation, transferItemToShip, transferAllCargoToStation, setActiveShip, transferDroneToShip, transferDroneToStation, unloadAllDronesToStation, ensureInitialDrones } from '../../core/state.js';
import { getShipInfo } from '../../config/shipsRegistry.js';

export class StationHangarView extends UIComponent {
  /**
   * @param {Object} options
   * @param {import('../../core/EventBus.js').EventBus} options.eventBus
   * @param {Object} options.state
   */
  constructor({ eventBus, state }) {
    super();
    this.bus = eventBus;
    this.state = state;

    this.overlayEl = document.getElementById('station-hangar-overlay');
    this.hudEl = this.overlayEl ? this.overlayEl.querySelector('.station-hangar-hud') : null;
    this.undockBtn = document.getElementById('undock-btn');

    this.btnMainHangar = document.getElementById('btn-main-hangar');
    this.btnAssembly = document.getElementById('btn-assembly');
    this.btnMarket = document.getElementById('btn-market-station');
    this.activeShipId = (() => {
      try {
        const s = localStorage.getItem('harpia_active_ship');
        return (s && s !== 'H-M1') ? s : 'H-M2';
      } catch(e) {
        return 'H-M2';
      }
    })();
    this.assemblyShipImgEl = document.getElementById('assembly-ship-img');

    // Instanciação dos submódulos de apresentação
    // ShipOreStoragePanel integra minérios e baía de drones na mesma box esquerda
    this.shipOrePanel = new ShipOreStoragePanel({
      eventBus: this.bus,
      onTransfer: (cargo) => this._handleTransferOre(cargo),
      onDropItem: (data) => this._handleDropItemToShip(data),
      onDropDrone: (data) => this._handleDropDroneToHangar(data),
      onUnloadAllDrones: () => this._handleUnloadAllDrones()
    });

    this.stationStoragePanel = new StationStoragePanel({
      eventBus: this.bus,
      onDropItem: (data) => this._handleDropItemToStation(data)
    });

    this.shipHangarPanel = new ShipHangarPanel({
      eventBus: this.bus,
      onSwitchShip: (shipId) => this._handleSwitchShip(shipId)
    });

    this.splitStackModal = new SplitStackModal({
      eventBus: this.bus,
      onConfirm: (t) => {
        if (t.target === 'ship_storage') {
          this._handleDropItemToShip(t);
        } else {
          this._handleDropItemToStation(t);
        }
      }
    });

    this.shipSpecsPanel = new ShipSpecsPanel({ eventBus: this.bus });
    this.marketPanel = new MarketStationPanel({ eventBus: this.bus, state: this.state });

    this.isOpen = false;
    this._isMounted = false;

    this.bindEvents();
    this.mount();
  }

  /**
   * Monta os submódulos nos seus respetivos mount-points declarativos
   */
  mount() {
    if (this._isMounted) return;

    const oreMount = document.getElementById('station-ore-storage-mount') || this.hudEl;
    const storageMount = document.getElementById('station-storage-mount') || this.hudEl;
    const hangarMount = document.getElementById('station-ship-hangar-mount') || this.hudEl;

    if (oreMount) this.shipOrePanel.mount(oreMount);
    if (oreMount) this.shipSpecsPanel.mount(oreMount);
    if (storageMount) this.stationStoragePanel.mount(storageMount);
    if (hangarMount) {
      this.shipHangarPanel.mount(hangarMount);
      this.shipHangarPanel.hidePanel();
    }
    if (this.splitStackModal) this.splitStackModal.mount(document.body);

    if (this.overlayEl && this.marketPanel) {
      this.marketPanel.mount(this.overlayEl);
      this.marketPanel.root && this.marketPanel.root.classList.add('hidden');
    }

    this._isMounted = true;
  }

  /**
   * Abre o hangar e sincroniza os dados do State global para os painéis
   */
  open() {
    this.isOpen = true;
    if (this.overlayEl) {
      this.overlayEl.classList.add('active');
      this.overlayEl.classList.remove('mode-assembly');
    }

    const leftPanel = document.getElementById('hangar-left-panel');
    if (leftPanel) leftPanel.classList.remove('collapsed');

    if (this.shipSpecsPanel) this.shipSpecsPanel.hidePanel();
    if (this.marketPanel) this.marketPanel.hidePanel();

    if (this.btnMainHangar) this.btnMainHangar.classList.add('active');
    if (this.btnAssembly) this.btnAssembly.classList.remove('active');
    if (this.btnMarket) this.btnMarket.classList.remove('active');

    this.syncState();
  }

  /**
   * Extrai dados do State e delega a cada componente filho
   */
  syncState() {
    if (!this.state) return;

    // 1. Box Esquerda: Carga e Drones da nave atual integrada
    ensureInitialDrones();
    const shipInfo = getShipInfo(this.activeShipId);
    const cargo = {
      ...(this.state.shipCargo || {}),
      capacity: shipInfo?.capacity || 200
    };
    this.shipOrePanel.render({
      cargo,
      drones: this.state.shipDrones || { mining_drone: 0 },
      activeShipId: this.activeShipId || 'H-M2'
    });

    // 2. Box Direita: Armazém permanente da estação
    const minerals = this.state.stationMinerals || {
      ferrox: 0,
      crynex: 0,
      varelium: 0
    };
    this.stationStoragePanel.render({
      minerals,
      capacity: 500000
    });

    // 3. Box Inferior: Naves na doca
    const ships = this.state.pilotHangarShips || [];
    this.shipHangarPanel.render({ ships, activeShipId: this.activeShipId || 'H-M2' });
  }

  /**
   * Fecha o hangar
   */
  close() {
    this.isOpen = false;
    if (this.overlayEl) {
      this.overlayEl.classList.remove('active');
      this.overlayEl.classList.remove('mode-assembly');
    }
    if (this.marketPanel) {
      this.marketPanel.hidePanel();
    }
    if (this.shipSpecsPanel) {
      this.shipSpecsPanel.hidePanel();
    }
    const leftPanel = document.getElementById('hangar-left-panel');
    if (leftPanel) {
      leftPanel.classList.remove('collapsed');
    }
    if (this.btnMainHangar) this.btnMainHangar.classList.add('active');
    if (this.btnAssembly) this.btnAssembly.classList.remove('active');
    if (this.btnMarket) this.btnMarket.classList.remove('active');
  }

  /**
   * Registra ouvintes com unsubscribe explícito
   */
  bindEvents() {
    if (this.bus) {
      // Entrada e saída da estação
      const unsubDocked = this.bus.on(EV.STATION_DOCKED, () => this.open());
      this.addCleanup(unsubDocked);

      const unsubUndock = this.bus.on(EV.STATION_UNDOCK, () => this.close());
      this.addCleanup(unsubUndock);

      // Reatividade a atualizações de estado
      const unsubMinerals = this.bus.on('minerals:updated', (minerals) => {
        this.stationStoragePanel.render({ minerals, capacity: 500000 });
      });
      this.addCleanup(unsubMinerals);

      const unsubCargo = this.bus.on('ship:cargo_updated', (cargo) => {
        this.shipOrePanel.renderCargo(cargo);
      });
      this.addCleanup(unsubCargo);

      const unsubShips = this.bus.on('hangar:ships_updated', (ships) => {
        this.shipHangarPanel.render({ ships, activeShipId: this.activeShipId || 'H-M2' });
      });
      this.addCleanup(unsubShips);

      // Atualização reativa de drones na box integrada
      const unsubDrones = this.bus.on('ship:drones_updated', (drones) => {
        this.shipOrePanel.renderDrones(drones, this.activeShipId || 'H-M2');
      });
      this.addCleanup(unsubDrones);

      // Eventos de Drag & Drop nos dois sentidos
      const unsubTransferItem = this.bus.on('inventory:transfer_item', (payload) => {
        this._handleDropItemToStation(payload);
      });
      this.addCleanup(unsubTransferItem);

      const unsubTransferToShip = this.bus.on('inventory:transfer_to_ship', (payload) => {
        this._handleDropItemToShip(payload);
      });
      this.addCleanup(unsubTransferToShip);

      const unsubTransferAll = this.bus.on('station:transfer_ore_to_station', () => {
        this._handleTransferOre();
      });
      this.addCleanup(unsubTransferAll);

      const unsubSplit = this.bus.on('inventory:split_stack_request', (data) => {
        if (this.splitStackModal) {
          this.splitStackModal.open(data);
        }
      });
      this.addCleanup(unsubSplit);

      // Eventos de transferência de Drones (Box Esquerda <-> Station Storage)
      const unsubDroneToBay = this.bus.on('drones:transfer_to_bay', (payload) => {
        this._handleDropDroneToHangar(payload);
      });
      this.addCleanup(unsubDroneToBay);

      const unsubDroneToStation = this.bus.on('drones:transfer_to_station', (payload) => {
        transferDroneToStation(payload.itemId || 'mining_drone', payload.amount || null);
      });
      this.addCleanup(unsubDroneToStation);

      const unsubDroneUnloadAll = this.bus.on('drones:unload_all', () => {
        this._handleUnloadAllDrones();
      });
      this.addCleanup(unsubDroneUnloadAll);

      // Ouvinte para trocar de nave ativa
      const unsubSwitchShip = this.bus.on('hangar:switch_ship', ({ shipId }) => {
        if (!shipId) return;
        this.activeShipId = shipId;
        setActiveShip(shipId);
        this._updateCentralAssemblyShip(shipId);
        if (this.shipSpecsPanel) {
          this.shipSpecsPanel.render(shipId);
        }
        if (this.shipHangarPanel) {
          this.shipHangarPanel.setActiveShip(shipId);
        }
        // Atualiza a box integrada com a nova capacidade de carga e drones
        const shipInfo = getShipInfo(shipId);
        this.shipOrePanel.render({
          cargo: { ...(this.state?.shipCargo || {}), capacity: shipInfo?.capacity || 200 },
          drones: this.state?.shipDrones || { mining_drone: 0 },
          activeShipId: shipId
        });
      });
      this.addCleanup(unsubSwitchShip);

      // Ouvinte para abrir o mercado de venda diretamente a partir do clique direito
      const unsubOpenMarketSell = this.bus.on('station:open_market_sell', ({ itemId }) => {
        if (this.marketPanel && this.marketPanel.isVisible) {
          this.marketPanel.openSellFor(itemId);
        } else {
          this.switchTab('market_station');
          setTimeout(() => {
            if (this.marketPanel) {
              this.marketPanel.openSellFor(itemId);
            }
          }, 350);
        }
      });
      this.addCleanup(unsubOpenMarketSell);
    }

    // Botão de desatracagem
    if (this.undockBtn) {
      const onUndockClick = () => {
        if (this.bus) {
          this.bus.emit('station:request_undock');
        } else if (typeof window.undockShipFromStation === 'function') {
          window.undockShipFromStation();
        }
      };
      this.undockBtn.addEventListener('click', onUndockClick);
      this.addCleanup(() => this.undockBtn && this.undockBtn.removeEventListener('click', onUndockClick));
    }

    // Botões de navegação do topo (MAIN HANGAR / ASSEMBLY / MARKET STATION)
    const navItems = [
      { btn: this.btnMainHangar, id: 'main_hangar' },
      { btn: this.btnAssembly, id: 'assembly' },
      { btn: this.btnMarket, id: 'market_station' }
    ];

    navItems.forEach(({ btn, id }) => {
      if (!btn) return;
      const onNavClick = () => this.switchTab(id);
      btn.addEventListener('click', onNavClick);
      this.addCleanup(() => btn && btn.removeEventListener('click', onNavClick));
    });
  }

  /**
   * Alterna entre os modos do Hangar (MAIN HANGAR / ASSEMBLY / MARKET STATION)
   * @param {'main_hangar'|'assembly'|'market_station'} id
   */
  switchTab(id) {
    const navItems = [
      { btn: this.btnMainHangar, id: 'main_hangar' },
      { btn: this.btnAssembly, id: 'assembly' },
      { btn: this.btnMarket, id: 'market_station' }
    ];

    navItems.forEach(item => item.btn && item.btn.classList.remove('active'));
    const current = navItems.find(item => item.id === id);
    if (current && current.btn) current.btn.classList.add('active');

    const leftPanel = document.getElementById('hangar-left-panel');
    if (id === 'assembly') {
      if (this.marketPanel) this.marketPanel.hidePanel();
      if (this.shipHangarPanel) this.shipHangarPanel.showPanel();
      if (leftPanel) leftPanel.classList.add('collapsed');
      if (this.overlayEl) this.overlayEl.classList.add('mode-assembly');
      this._updateCentralAssemblyShip(this.activeShipId);
      setTimeout(() => {
        if (this.shipSpecsPanel) {
          this.shipSpecsPanel.render(this.activeShipId);
          this.shipSpecsPanel.showPanel();
        }
      }, 420);
    } else if (id === 'market_station') {
      if (this.shipSpecsPanel) this.shipSpecsPanel.hidePanel();
      if (this.shipHangarPanel) this.shipHangarPanel.hidePanel();
      if (leftPanel) leftPanel.classList.add('collapsed');
      if (this.overlayEl) this.overlayEl.classList.remove('mode-assembly');
      setTimeout(() => {
        if (this.marketPanel) this.marketPanel.showPanel();
      }, 420);
    } else {
      if (this.marketPanel) this.marketPanel.hidePanel();
      if (this.shipSpecsPanel) this.shipSpecsPanel.hidePanel();
      if (this.shipHangarPanel) this.shipHangarPanel.hidePanel();
      setTimeout(() => {
        if (leftPanel) leftPanel.classList.remove('collapsed');
        if (this.overlayEl) this.overlayEl.classList.remove('mode-assembly');
      }, 300);
    }

    if (this.bus) {
      this.bus.emit('station:nav_changed', { tab: id });
    }
  }

  _handleDropItemToStation({ itemId, amount }) {
    if (!itemId) return;
    transferItemToStation(itemId, amount);
  }

  _handleDropItemToShip({ itemId, amount }) {
    if (!itemId) return;
    transferItemToShip(itemId, amount);
  }

  _handleDropDroneToHangar({ itemId, amount }) {
    if (!itemId) return;
    transferDroneToShip(itemId, amount);
  }

  _handleUnloadAllDrones() {
    unloadAllDronesToStation();
  }

  _handleTransferOre() {
    transferAllCargoToStation();
  }

  _handleSwitchShip(shipId) {
    if (this.bus) {
      this.bus.emit('hangar:switch_ship', { shipId });
    }
  }

  _updateCentralAssemblyShip(shipId = 'H-M2') {
    if (!this.assemblyShipImgEl) {
      this.assemblyShipImgEl = document.getElementById('assembly-ship-img');
    }
    if (!this.assemblyShipImgEl) return;

    const shipInfo = getShipInfo(shipId);
    let imgSrc = shipInfo?.imageSrc || shipInfo?.thumbnail;
    const sid = String(shipId).toUpperCase();
    if (sid.includes('HARPI') || sid.includes('T1')) {
      imgSrc = 'assets/ships/TRANSPORT SHIPS/HARPI-T1.png';
    } else if (!imgSrc) {
      imgSrc = 'assets/ships/MINING SHIPS/H-M2.png';
    }
    this.assemblyShipImgEl.src = imgSrc;
    this.assemblyShipImgEl.alt = shipInfo?.name || shipId;
  }

  /**
   * Desmonta submódulos e executa cleanups
   */
  destroy() {
    super.destroy();

    this.shipOrePanel.destroy();
    this.stationStoragePanel.destroy();
    this.shipHangarPanel.destroy();
    if (this.shipSpecsPanel) this.shipSpecsPanel.destroy();
    if (this.marketPanel) this.marketPanel.destroy();
    if (this.splitStackModal) this.splitStackModal.destroy();

    this._isMounted = false;
  }
}
