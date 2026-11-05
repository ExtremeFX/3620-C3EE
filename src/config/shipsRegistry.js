/**
 * HARPIA Universe - Ships Registry (Data-Driven Architecture)
 * Catálogo central de especificações, assets visuais e metadados de todas as naves.
 */

export const SHIPS_REGISTRY = {
  'H-M2': {
    id: 'H-M2',
    name: 'MINING SHIP H-M2',
    class: 'HEAVY MINING',
    description: 'Heavy industrial mining vessel with 200T ore hold, dual high-yield lasers (2 units / 30s cycle, 2000m range), 150m hull span and 5 Grok mining drone bay.',
    capacity: 200,
    laserCycle: 30,
    unitsPerCycle: 2,
    miningRange: 2000,
    cruiseVelocity: 110.0,
    maxVelocity: 400.0,
    turnRate: 2.1,
    hullSpan: 150,
    dockingSequence: 2.0,
    droneCapacity: 5,
    thrustersCount: 2,
    mediaType: 'image',
    imageSrc: 'assets/ships/MINING SHIPS/H-M2.png',
    thumbnail: 'assets/ships/MINING SHIPS/H-M2.png',
    thrusters: [
      { id: 'left', left: '40%', top: '83%', width: '9.5%', height: '34%', color: 'cyan', idleScale: 1.0 },
      { id: 'right', left: '58%', top: '83%', width: '9.5%', height: '34%', color: 'cyan', idleScale: 1.0 }
    ]
  },
  'H-7M': {
    id: 'H-7M',
    name: 'LIGHT MINER H-7M',
    class: 'MINING',
    description: 'Agile asteroid prospector with rapid traversal engines.',
    capacity: 70,
    turnRate: 3.4,
    mediaType: 'image',
    imageSrc: 'assets/ships/MINING SHIPS/H-M2.png',
    thumbnail: 'assets/ships/MINING SHIPS/H-M2.png',
    thrustersCount: 1,
    thrusters: [
      { id: 'main', left: '50%', top: '86%', width: '18%', height: '32%', color: 'cyan', idleScale: 1.0 }
    ]
  },
  'HARPI-T1': {
    id: 'HARPI-T1',
    name: 'HARPI-T1',
    class: 'TRANSPORT',
    description: 'High-capacity armored transport vessel equipped with 1000T cargo hold for heavy bulk logistics and interplanetary trade.',
    capacity: 1000,
    cruiseVelocity: 95.0,
    maxVelocity: 260.0,
    turnRate: 3.5,
    hullSpan: 160,
    dockingSequence: 2.2,
    droneCapacity: 0,
    thrustersCount: 4,
    mediaType: 'image',
    imageSrc: 'assets/ships/TRANSPORT SHIPS/HARPI-T1.png',
    thumbnail: 'assets/ships/TRANSPORT SHIPS/HARPI-T1.png',
    thrusters: [
      { id: 'ext-left', left: '41%', top: '83%', width: '7.5%', height: '33%', color: 'cyan', idleScale: 1.0 },
      { id: 'ext-right', left: '59%', top: '83%', width: '7.5%', height: '33%', color: 'cyan', idleScale: 1.0 },
      { id: 'mid-left', left: '47.2%', top: '90.5%', width: '6%', height: '16.5%', color: 'orange', idleScale: 0.2 },
      { id: 'mid-right', left: '52.8%', top: '90.5%', width: '6%', height: '16.5%', color: 'orange', idleScale: 0.2 }
    ]
  },
  'T-WS-Cargi': {
    id: 'T-WS-Cargi',
    name: 'FREIGHTER T-WS-CARGI',
    class: 'TRANSPORT',
    description: 'Long-range armored cargo freighter designed for bulk mineral export.',
    capacity: 500,
    turnRate: 1.6,
    mediaType: 'image',
    imageSrc: 'assets/ships/TRANSPORT SHIPS/T-WS-Cargi.png',
    thumbnail: 'assets/ships/TRANSPORT SHIPS/T-WS-Cargi.png',
    thrustersCount: 1,
    thrusters: [
      { id: 'main', left: '50%', top: '86%', width: '16%', height: '32%', color: 'cyan', idleScale: 1.0 }
    ]
  }
};

/**
 * Retorna os metadados de uma nave ou um fallback seguro caso o ID não conste no registo
 * @param {string} shipId 
 * @returns {Object}
 */
export function getShipInfo(shipId) {
  if (!shipId) return SHIPS_REGISTRY['H-M2'];
  if (SHIPS_REGISTRY[shipId]) {
    return SHIPS_REGISTRY[shipId];
  }
  const clean = String(shipId).trim();
  const upper = clean.toUpperCase();
  if (SHIPS_REGISTRY[upper]) {
    return SHIPS_REGISTRY[upper];
  }
  const normalized = upper.replace(/_/g, '-');
  if (SHIPS_REGISTRY[normalized]) {
    return SHIPS_REGISTRY[normalized];
  }
  // Se for H-M1 antigo, mapear suavemente para H-M2
  if (upper === 'H-M1' || upper === 'HM1') {
    return SHIPS_REGISTRY['H-M2'];
  }
  // Fallback seguro apenas para variações explícitas de HARPI-T1
  if (/^HARPI[-_]?T[-_]?1$/i.test(upper) || upper === 'T1' || upper === 'HARPI' || upper === 'HARPI-T1') {
    return SHIPS_REGISTRY['HARPI-T1'];
  }
  return {
    id: shipId,
    name: shipId,
    class: 'UNKNOWN',
    description: 'Unregistered vessel.',
    capacity: 100,
    mediaType: 'image',
    thumbnail: 'assets/ships/MINING SHIPS/H-M2.png',
    imageSrc: 'assets/ships/MINING SHIPS/H-M2.png'
  };
}
