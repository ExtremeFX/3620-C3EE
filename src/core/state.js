/**
 * HARPIA Universe - Reactive State Store
 */
import { STORAGE_MINE_MAX } from './config.js';
import { EV } from './EventBus.js';
import { api } from '../network/ApiClient.js';
import { getShipInfo } from '../config/shipsRegistry.js';
import { getItemInfo } from '../config/itemsRegistry.js';

const _savedActiveShip = (() => {
  try {
    const s = localStorage.getItem('harpia_active_ship');
    return (s && s !== 'H-M1') ? s : 'H-M2';
  } catch(e) {
    return 'H-M2';
  }
})();

const _initialShipInfo = getShipInfo(_savedActiveShip);

// FIX BUG-ST1: JSON.parse("null") returns null, crashing Object.entries() later
const _savedShipDrones = (() => {
  try {
    const saved = localStorage.getItem('harpia_ship_drones');
    if (!saved) return { mining_drone: 5 };
    const parsed = JSON.parse(saved);
    return (parsed !== null && typeof parsed === 'object') ? parsed : { mining_drone: 5 };
  } catch(e) {
    return { mining_drone: 5 };
  }
})();

const _state = {
  pilotData: null,
  pilotSkillsData: null,
  pilotCredits: 0,
  activeShipId: _savedActiveShip,
  stationMinerals: { ferrox: 0, crynex: 0, varelium: 0, mining_drone: 0 },
  // FIX BUG-ST2: hardcoded ferrox:5 caused syncs on cold-start to overwrite real server data
  shipCargo: { ferrox: 0, crynex: 0, varelium: 0, capacity: _initialShipInfo?.capacity || 200 },
  shipDrones: _savedShipDrones,
  pilotHangarShips: [],
  fleetMissions: [],
  sectorDeposits: [],
  sectorDepositsMap: {},
  selectedTargetCell: null,
  selectedShipId: 'T-WS-Cargi',
  launchQuantity: 1,
  mapHoveredCol: -1,
  mapHoveredRow: -1,
  mapZoom: 1.0,
  mapPanX: 0,
  mapPanY: 0,
  currentFocusedStation: 'PLAYER_BASE',
  isSyncingMissions: false,
};

let _bus = null;
export function initStateBus(busInstance) {
  _bus = busInstance;
  ensureInitialDrones();
}

export function ensureInitialDrones() {
  const activeShip = _state.activeShipId || 'H-M2';
  const shipInfo = getShipInfo(activeShip);
  const cap = shipInfo?.droneCapacity || 0;
  if (cap > 0 && activeShip === 'H-M2') {
    const equipped = Number(_state.shipDrones?.mining_drone) || 0;
    const inStation = Number(_state.stationMinerals?.mining_drone) || 0;
    // Se o piloto não tem drones na baía e nem no armazém da estação, inicializa os 5 drones de série da H-M2
    if (equipped <= 0 && inStation <= 0) {
      _state.shipDrones = { ..._state.shipDrones, mining_drone: 5 };
      try {
        localStorage.setItem('harpia_ship_drones', JSON.stringify(_state.shipDrones));
      } catch (e) {}
      emit('ship:drones_updated', { ..._state.shipDrones });
    }
  }
}

function createDeepReadonlyProxy(target) {
  if (target === null || typeof target !== 'object') {
    return target;
  }
  return new Proxy(target, {
    get(obj, prop) {
      const val = Reflect.get(obj, prop);
      if (val !== null && typeof val === 'object') {
        return createDeepReadonlyProxy(val);
      }
      return val;
    },
    set(obj, prop) {
      throw new Error(`[State] Modificação direta proibida na propriedade "${String(prop)}". Utilize os setters correspondentes.`);
    },
    deleteProperty(obj, prop) {
      throw new Error(`[State] Eliminação proibida da propriedade "${String(prop)}". Utilize os setters correspondentes.`);
    }
  });
}

export const state = createDeepReadonlyProxy(_state);

function emit(event, payload) {
  if (_bus && typeof _bus.emit === 'function') {
    _bus.emit(event, payload);
  }
}

// FIX BUG-ST3: debounce syncToServer to prevent flooding the server with one request
// per ore tick or per drag. Coalesces rapid calls into a single request 400ms later.
let _syncTimer = null;
function _syncToServer() {
  if (!api.token) return;
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => {
    _syncTimer = null;
    syncStateNow();
  }, 400);
}

export function syncStateNow() {
  if (!api.token) return Promise.resolve();
  if (_syncTimer) {
    clearTimeout(_syncTimer);
    _syncTimer = null;
  }
  let shipPos = null;
  if (typeof window !== 'undefined' && window.HarpiaEngine?.ship) {
    const s = window.HarpiaEngine.ship;
    shipPos = {
      x: Math.round(s.x),
      y: Math.round(s.y),
      angle: Number(s.angle.toFixed(3)),
      isDocked: Boolean(s.isDocked)
    };
  }

  return api.syncStorage({
    shipId: _state.activeShipId || 'H-M2',
    activeShipId: _state.activeShipId || 'H-M2',
    storage: { ..._state.stationMinerals },
    shipCargo: { ..._state.shipCargo },
    shipDrones: { ..._state.shipDrones },
    position: shipPos
  }).catch(err => {
    console.warn('[State] syncStorage failed:', err);
    // FIX BUG-ST5: on 401, clear stale token so the player is redirected to login
    if (err && err.status === 401) {
      api.setToken(null);
      api.setUser(null);
      emit(EV.AUTH_LOGGED_OUT, null);
    }
  });
}

export function setPilotData(pilot) {
  _state.pilotData = pilot;
  if (pilot && typeof pilot.credits === 'number') {
    _state.pilotCredits = pilot.credits;
  } else if (pilot && typeof pilot.credits === 'string') {
    // FIX BUG-ST6: backend may serialize credits as a string
    const n = Number(pilot.credits);
    if (Number.isFinite(n)) _state.pilotCredits = n;
  }
  // FIX BUG-ST7: do not emit AUTH_LOGGED_IN when pilot is null (logout path)
  if (pilot) {
    emit(EV.AUTH_LOGGED_IN, pilot);
  } else {
    emit(EV.AUTH_LOGGED_OUT, null);
  }
}

export function setPilotCredits(credits) {
  _state.pilotCredits = Number(credits) || 0;
  if (_state.pilotData) {
    _state.pilotData.credits = _state.pilotCredits;
  }
  try {
    const user = JSON.parse(localStorage.getItem('harpia_user') || 'null');
    if (user) {
      user.credits = _state.pilotCredits;
      localStorage.setItem('harpia_user', JSON.stringify(user));
    }
  } catch (e) {}
  emit('pilot:credits_updated', _state.pilotCredits);
}

export function setMinerals(minerals) {
  if (!minerals || typeof minerals !== 'object') return;
  for (const [k, v] of Object.entries(minerals)) {
    const num = Number(v);
    // FIX BUG-ST8: Number(-10) is truthy; use Number() without || 0 trick, guard explicitly
    _state.stationMinerals[k] = Number.isFinite(num) && num >= 0 ? num : 0;
  }
  ensureInitialDrones();
  emit('minerals:updated', { ..._state.stationMinerals });
}

export function setActiveShip(shipId) {
  if (!shipId) return;
  _state.activeShipId = shipId;
  try {
    localStorage.setItem('harpia_active_ship', shipId);
  } catch (e) {}

  const shipInfo = getShipInfo(shipId);
  const targetCap = (shipInfo && typeof shipInfo.capacity === 'number') ? shipInfo.capacity : 30;

  // Carregar o cargo específico da nave do hangar se existir
  const shipInHangar = Array.isArray(_state.pilotHangarShips) ? _state.pilotHangarShips.find(s => s.ship_id === shipId) : null;
  let loadedCargo = null;
  if (shipInHangar && shipInHangar.cargo_json) {
    try { loadedCargo = JSON.parse(shipInHangar.cargo_json); } catch(_) {}
  }

  if (loadedCargo && typeof loadedCargo === 'object') {
    _state.shipCargo = {
      ferrox: Math.max(0, Number(loadedCargo.ferrox) || 0),
      crynex: Math.max(0, Number(loadedCargo.crynex) || 0),
      varelium: Math.max(0, Number(loadedCargo.varelium) || 0),
      capacity: targetCap
    };
  } else {
    _state.shipCargo = {
      ferrox: 0,
      crynex: 0,
      varelium: 0,
      capacity: targetCap
    };
  }

  emit('ship:cargo_updated', { ..._state.shipCargo });
  emit('ship:active_changed', { shipId, shipInfo });
  ensureInitialDrones();
  emit('ship:drones_updated', { ..._state.shipDrones });
  _syncToServer();
}

export function setShipCargo(cargo) {
  if (!cargo || typeof cargo !== 'object') return;
  for (const [k, v] of Object.entries(cargo)) {
    if (k !== 'capacity') {
      const num = Number(v);
      _state.shipCargo[k] = Number.isFinite(num) && num >= 0 ? num : 0;
    }
  }
  
  const activeShip = _state.activeShipId || 'H-M2';
  const info = getShipInfo(activeShip);
  _state.shipCargo.capacity = (info && typeof info.capacity === 'number') ? info.capacity : (Number(cargo.capacity) || 200);

  emit('ship:cargo_updated', { ..._state.shipCargo });
}

export function setShipDrones(drones) {
  if (!drones || typeof drones !== 'object') return;
  _state.shipDrones = { ..._state.shipDrones, ...drones };
  ensureInitialDrones();
  try {
    localStorage.setItem('harpia_ship_drones', JSON.stringify(_state.shipDrones));
  } catch (e) {}
  emit('ship:drones_updated', { ..._state.shipDrones });
}

export function transferDroneToShip(droneId = 'mining_drone', amount = null) {
  const activeShip = _state.activeShipId || 'H-M2';
  const shipInfo = getShipInfo(activeShip);
  const maxDroneCap = (shipInfo && typeof shipInfo.droneCapacity === 'number') ? shipInfo.droneCapacity : 0;

  if (maxDroneCap <= 0) {
    emit('hud:toast', {
      message: `NO DRONE BAY • ${shipInfo?.name || activeShip} has 0 drone capacity. Equip H-M2.`,
      type: 'warning'
    });
    return 0;
  }

  // FIX BUG-ST9: _state.shipDrones could be null if localStorage contained "null"
  const shipDrones = _state.shipDrones || {};
  let currentShipDrones = 0;
  for (const [, v] of Object.entries(shipDrones)) {
    const n = Number(v);
    currentShipDrones += Number.isFinite(n) ? Math.max(0, n) : 0;
  }

  const freeSpace = Math.max(0, maxDroneCap - currentShipDrones);
  if (freeSpace <= 0) {
    emit('hud:toast', {
      message: `DRONE BAY FULL • Max capacity reached (${currentShipDrones}/${maxDroneCap} drones)`,
      type: 'warning'
    });
    return 0;
  }

  const stationQty = Number(_state.stationMinerals[droneId]) || 0;
  if (stationQty <= 0) {
    emit('hud:toast', {
      message: `OUT OF STOCK • No ${droneId.toUpperCase()} available in Station Storage`,
      type: 'warning'
    });
    return 0;
  }

  // FIX BUG-ST10: validate amount to prevent NaN/float/negative drone counts
  let requested = (amount !== null) ? Math.floor(Number(amount)) : stationQty;
  if (!Number.isFinite(requested) || requested <= 0) return 0;

  let toTransfer = Math.min(requested, stationQty, freeSpace);
  if (toTransfer <= 0) return 0;

  _state.stationMinerals[droneId] = stationQty - toTransfer;
  _state.shipDrones[droneId] = (Number(_state.shipDrones[droneId]) || 0) + toTransfer;

  try {
    localStorage.setItem('harpia_ship_drones', JSON.stringify(_state.shipDrones));
  } catch (e) {}

  emit('ship:drones_updated', { ..._state.shipDrones });
  emit('minerals:updated', { ..._state.stationMinerals });
  _syncToServer();

  emit('hud:toast', {
    message: `DRONES LOADED • +${toTransfer}x ${droneId.toUpperCase()} in Drone Bay (${currentShipDrones + toTransfer}/${maxDroneCap})`,
    type: 'success'
  });

  return toTransfer;
}

export function transferDroneToStation(droneId = 'mining_drone', amount = null) {
  const currentShipDrones = Number(_state.shipDrones?.[droneId]) || 0;
  if (currentShipDrones <= 0) return 0;

  // FIX BUG-ST10: validate amount
  let requested = (amount !== null) ? Math.floor(Number(amount)) : currentShipDrones;
  if (!Number.isFinite(requested) || requested <= 0) return 0;

  let toTransfer = Math.min(requested, currentShipDrones);
  if (toTransfer <= 0) return 0;

  _state.shipDrones[droneId] = currentShipDrones - toTransfer;
  _state.stationMinerals[droneId] = (Number(_state.stationMinerals[droneId]) || 0) + toTransfer;

  try {
    localStorage.setItem('harpia_ship_drones', JSON.stringify(_state.shipDrones));
  } catch (e) {}

  emit('ship:drones_updated', { ..._state.shipDrones });
  emit('minerals:updated', { ..._state.stationMinerals });
  _syncToServer();

  emit('hud:toast', {
    message: `DRONES UNLOADED • ${toTransfer}x returned to Station Storage`,
    type: 'info'
  });

  return toTransfer;
}

export function unloadAllDronesToStation() {
  // FIX BUG-ST9: guard against null shipDrones
  const drones = _state.shipDrones || {};
  let totalMoved = 0;
  for (const [droneId, qty] of Object.entries(drones)) {
    const num = Number(qty) || 0;
    if (num > 0) {
      _state.stationMinerals[droneId] = (Number(_state.stationMinerals[droneId]) || 0) + num;
      _state.shipDrones[droneId] = 0;
      totalMoved += num;
    }
  }

  if (totalMoved > 0) {
    try {
      localStorage.setItem('harpia_ship_drones', JSON.stringify(_state.shipDrones));
    } catch (e) {}
    emit('ship:drones_updated', { ..._state.shipDrones });
    emit('minerals:updated', { ..._state.stationMinerals });
    _syncToServer();
    emit('hud:toast', {
      message: `ALL DRONES UNLOADED • ${totalMoved}x returned to Station Storage`,
      type: 'info'
    });
  }
  return totalMoved;
}

// FIX BUG-ST11: reserved property names that must never be treated as ore/drone keys
const _RESERVED_CARGO_KEYS = new Set(['capacity']);

export function transferItemToStation(itemId, amount = null) {
  // Guard against reserved keys that would corrupt cargo capacity
  if (_RESERVED_CARGO_KEYS.has(itemId)) return 0;

  // If it's a drone, redirect to the drone transfer path
  if (itemId === 'mining_drone' || (getItemInfo(itemId) && getItemInfo(itemId).type === 'drone')) {
    return transferDroneToStation(itemId, amount);
  }

  const cargo = _state.shipCargo;
  const current = cargo[itemId] || 0;
  if (current <= 0) return 0;

  // FIX BUG-ST12: validate amount — negative amounts would ADD to cargo (exploit)
  let requested = (amount !== null) ? Number(amount) : current;
  if (!Number.isFinite(requested) || requested <= 0) return 0;

  const toTransfer = Math.min(requested, current);
  cargo[itemId] = current - toTransfer;
  _state.stationMinerals[itemId] = (_state.stationMinerals[itemId] || 0) + toTransfer;

  emit('ship:cargo_updated', { ..._state.shipCargo });
  emit('minerals:updated', { ..._state.stationMinerals });
  _syncToServer();
  return toTransfer;
}

export function transferItemToShip(itemId, amount = null) {
  // Guard against reserved keys
  if (_RESERVED_CARGO_KEYS.has(itemId)) return 0;

  if (itemId === 'mining_drone' || (getItemInfo(itemId) && getItemInfo(itemId).type === 'drone')) {
    emit('hud:toast', {
      message: 'DRONES RESTRICTED • Drones must be transferred to DRONES HANGAR, not Ore Hold.',
      type: 'warning'
    });
    return 0;
  }

  const station = _state.stationMinerals;
  const cargo = _state.shipCargo;
  const currentStation = station[itemId] || 0;
  if (currentStation <= 0) return 0;

  let totalCargo = 0;
  for (const [k, v] of Object.entries(cargo)) {
    if (!_RESERVED_CARGO_KEYS.has(k)) totalCargo += Number(v) || 0;
  }
  const maxCap = cargo.capacity || 30;
  const freeSpace = Math.max(0, maxCap - totalCargo);
  if (freeSpace <= 0) return 0;

  let requested = (amount !== null) ? Number(amount) : currentStation;
  if (!Number.isFinite(requested) || requested <= 0) return 0;

  let toTransfer = Math.min(requested, currentStation, freeSpace);
  if (toTransfer <= 0) return 0;

  station[itemId] = currentStation - toTransfer;
  cargo[itemId] = (cargo[itemId] || 0) + toTransfer;

  emit('ship:cargo_updated', { ..._state.shipCargo });
  emit('minerals:updated', { ..._state.stationMinerals });
  _syncToServer();
  return toTransfer;
}

export function transferAllCargoToStation() {
  const cargo = _state.shipCargo;
  let transferred = 0;
  for (const [k, v] of Object.entries(cargo)) {
    if (!_RESERVED_CARGO_KEYS.has(k) && typeof v === 'number' && v > 0) {
      _state.stationMinerals[k] = (_state.stationMinerals[k] || 0) + v;
      transferred += v;
      cargo[k] = 0;
    }
  }
  if (transferred > 0) {
    emit('ship:cargo_updated', { ..._state.shipCargo });
    emit('minerals:updated', { ..._state.stationMinerals });
    _syncToServer();
  }
  return transferred;
}

export function addShipOre(oreId = 'ferrox', amount = 1) {
  // FIX BUG-ST13: guard against writing to reserved keys (e.g. oreId='capacity')
  if (_RESERVED_CARGO_KEYS.has(oreId)) return 0;

  const cargo = _state.shipCargo;
  let currentTotal = 0;
  for (const [k, v] of Object.entries(cargo)) {
    if (!_RESERVED_CARGO_KEYS.has(k)) currentTotal += Number(v) || 0;
  }
  const maxCap = cargo.capacity || 30;
  if (currentTotal >= maxCap) return 0;

  // FIX BUG-ST14: validate amount to prevent negative ore additions
  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) return 0;

  const toAdd = Math.min(numAmount, maxCap - currentTotal);
  cargo[oreId] = (cargo[oreId] || 0) + toAdd;

  emit('ship:cargo_updated', { ..._state.shipCargo });
  _syncToServer();
  return toAdd;
}

export function setFleetMissions(missions) {
  _state.fleetMissions = missions;
  emit('missions:synced', missions);
}

export function setHangarShips(ships) {
  const safeShips = Array.isArray(ships) ? ships.filter(s => s && s.ship_id !== 'H-7M' && s.ship_id !== 'H-M1') : [];
  _state.pilotHangarShips = safeShips;
  emit('hangar:updated', safeShips);
  emit('hangar:ships_updated', safeShips);
}

export function setDeposits(deposits) {
  // FIX BUG-ST15: deposits.forEach crashes if response is null/undefined/non-array
  if (!Array.isArray(deposits)) {
    console.warn('[State] setDeposits: expected array, got', typeof deposits);
    return;
  }
  _state.sectorDeposits = deposits;
  _state.sectorDepositsMap = {};
  deposits.forEach(d => {
    _state.sectorDepositsMap[`${d.col},${d.row}`] = d;
  });
  emit('deposits:updated', deposits);
}

export function setSelectedTargetCell(cell) {
  _state.selectedTargetCell = cell;
  emit('map:targetSet', cell);
}

export function setSelectedShipId(id) {
  _state.selectedShipId = id;
}

export function setLaunchQuantity(qty) {
  _state.launchQuantity = qty;
}

export function setMapHover(col, row) {
  _state.mapHoveredCol = col;
  _state.mapHoveredRow = row;
}

export function setMapZoom(z) {
  _state.mapZoom = z;
}

export function setMapPan(x, y) {
  _state.mapPanX = x;
  _state.mapPanY = y;
}

export function setFocusedStation(st) {
  _state.currentFocusedStation = st;
  emit('station:focus', st);
}

export function setSyncingMissions(v) {
  _state.isSyncingMissions = v;
}

export function setSkillsData(data) {
  _state.pilotSkillsData = data;
  emit('skills:updated', data);
}

export function getCellDeposit(col, row) {
  return _state.sectorDepositsMap[`${col},${row}`] ?? null;
}

export function getStorageTotals() {
  const m = _state.stationMinerals;
  // FIX BUG-ST16: use Number() guard to prevent NaN if any mineral is undefined
  const ferrox   = Number(m.ferrox)   || 0;
  const crynex   = Number(m.crynex)   || 0;
  const varelium = Number(m.varelium) || 0;
  return {
    ferrox,
    crynex,
    varelium,
    total: ferrox + crynex + varelium,
    max: STORAGE_MINE_MAX
  };
}
