/**
 * HARPIA Universe - Items & Minerals Registry (Data-Driven Architecture)
 * Catálogo central de metadados, ícones, cores e imagens de todos os itens e minérios.
 */

export const ITEMS_REGISTRY = {
  ferrox: {
    id: 'ferrox',
    name: 'FERROX',
    type: 'mineral',
    unit: 'Units',
    massPerUnit: 1, // 1 T per unit
    color: '#ff9900',
    glowColor: 'rgba(255, 153, 0, 0.4)',
    imageSrc: 'assets/items/ferrox.png',
    description: 'High-density ferromagnetic asteroid ore with luminescent crystallization.'
  },
  crynex: {
    id: 'crynex',
    name: 'CRYNEX',
    type: 'mineral',
    unit: 'Units',
    massPerUnit: 1,
    color: '#ff9900',
    glowColor: 'rgba(255, 153, 0, 0.45)',
    imageSrc: 'assets/items/crynex.png',
    description: 'High-energy volcanic plasma core ore with volatile fission resonance.'
  },
  varelium: {
    id: 'varelium',
    name: 'VARELIUM',
    type: 'mineral',
    unit: 'Units',
    massPerUnit: 1,
    color: '#e024c3',
    glowColor: 'rgba(224, 36, 195, 0.4)',
    imageSrc: 'assets/items/varelium.png',
    description: 'Rare dimensional resonance isotope.'
  },
  mining_drone: {
    id: 'mining_drone',
    name: 'GROK',
    fullName: 'GROK MINING DRONE',
    type: 'drone',
    category: 'DRONES',
    unit: 'Units',
    massPerUnit: 5,
    laserCycle: 20,
    unitsPerCycle: 1,
    laserType: 'single',
    laserColor: '#ffffff',
    laserGlowColor: 'rgba(180, 235, 255, 0.85)',
    color: '#00f0ff',
    glowColor: 'rgba(0, 240, 255, 0.6)',
    imageSrc: 'assets/items/mining_drone.png',
    description: 'Autonomous mining drone Grok. Fires a single white-blue precision laser with a 20-second mining cycle (1 unit per drone).'
  },
  h_m2: {
    id: 'h_m2',
    name: 'H-M2',
    type: 'ship',
    unit: 'Units',
    massPerUnit: 25,
    color: '#00d4ff',
    glowColor: 'rgba(0, 212, 255, 0.45)',
    imageSrc: 'assets/ships/MINING SHIPS/H-M2.png',
    description: 'Advanced mining vessel upgrade with reinforced chassis and dual high-yield extraction lasers.'
  },
  harpi_t1: {
    id: 'HARPI-T1',
    name: 'HARPI-T1',
    type: 'ship',
    unit: 'Units',
    massPerUnit: 100,
    color: '#00d4ff',
    glowColor: 'rgba(0, 212, 255, 0.45)',
    imageSrc: 'assets/ships/TRANSPORT SHIPS/HARPI-T1.png',
    description: 'High-capacity armored transport vessel (1000T cargo hold) for heavy bulk logistics.'
  }
};

const ALIASES = {
  grok: 'mining_drone',
  'mining-drone': 'mining_drone',
  'h-m2': 'h_m2',
  core_v2: 'h_m2',
  'harpi-t1': 'harpi_t1'
};

/**
 * Retorna os metadados do item ou um fallback seguro
 * @param {string} itemId 
 * @returns {Object}
 */
export function getItemInfo(itemId) {
  const key = String(itemId).toLowerCase().trim();
  const canonicalKey = ALIASES[key] || key.replace(/-/g, '_');
  if (ITEMS_REGISTRY[canonicalKey]) {
    return ITEMS_REGISTRY[canonicalKey];
  }
  if (ITEMS_REGISTRY[key]) {
    return ITEMS_REGISTRY[key];
  }
  return {
    id: key,
    name: String(itemId).toUpperCase(),
    type: 'item',
    unit: 'Units',
    massPerUnit: 1,
    color: '#00f0ff',
    glowColor: 'rgba(0, 240, 255, 0.3)',
    imageSrc: null,
    description: 'Unregistered storage item.'
  };
}
