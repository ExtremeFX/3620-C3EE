/**
 * HARPIA Universe - GalaxyData
 * Catálogo e dados dos sistemas estelares, rotas de salto (Stargates) e economia do universo.
 */

export const CURRENT_SYSTEM_ID = 'harpia_prime';
/** ID do sistema natal — onde existem os entities físicos locais (asteroides + estação HQ) */
export const HOME_SYSTEM_ID = 'harpia_prime';

export const SECURITY_COLORS = Object.freeze({
  HIGH: '#00f0ff', // Ciano / Azul seguro
  LOW: '#ffaa00',  // Amarelo / Laranja de alerta
  NULL: '#ff3344'  // Vermelho perigo / espaço profundo
});

export const GALAXY_SYSTEMS = [
  // ── REGIÃO 1: ALTA SEGURANÇA (HIGH-SEC: 1.0 - 0.8) ──
  {
    id: 'harpia_prime',
    name: 'Harpia Prime',
    sectorCode: 'SEC-0014',
    region: 'Dominion Core',
    security: 1.0,
    securityLevel: 'HIGH',
    x: 0,
    y: 0,
    minerals: ['ferrox', 'crynex', 'varelium'],
    stations: ['Harpia Base Station (HQ)'],
    description: 'Sede central da corporação de mineração Harpia. Sistema pacificado com frotas de patrulha permanente e infraestrutura industrial completa.',
    asteroidsCount: 11,
    economicTier: 'Tier I - Hub Primário'
  },
  {
    id: 'nova_terra',
    name: 'Nova Terra',
    sectorCode: 'SEC-0015',
    region: 'Dominion Core',
    security: 0.9,
    securityLevel: 'HIGH',
    x: 180,
    y: -90,
    minerals: ['ferrox'],
    stations: ['Terra Nova Orbital'],
    description: 'Planeta colónia com extensos anéis de ferrox metálico de alta pureza. Rotas comerciais fortemente vigiadas.',
    asteroidsCount: 14,
    economicTier: 'Tier I - Agrícola / Minério Comum'
  },
  {
    id: 'solaris_outpost',
    name: 'Solaris Outpost',
    sectorCode: 'SEC-0018',
    region: 'Dominion Core',
    security: 0.8,
    securityLevel: 'HIGH',
    x: -160,
    y: -110,
    minerals: ['ferrox', 'crynex'],
    stations: ['Solaris Solar Refinery'],
    description: 'Instalação de captação termosolar orbitando uma estrela de classe F. Depósitos abundantes de Crynex estimulados por radiação estelar.',
    asteroidsCount: 12,
    economicTier: 'Tier II - Refinaria Energética'
  },
  {
    id: 'vega_terminus',
    name: 'Vega Terminus',
    sectorCode: 'SEC-0022',
    region: 'Dominion Core',
    security: 0.8,
    securityLevel: 'HIGH',
    x: 230,
    y: 110,
    minerals: ['ferrox'],
    stations: ['Vega Gate Hub'],
    description: 'Porto de fronteira comercial interligando os sistemas centrais à região de baixa segurança. Ponto de paragem obrigatório de comboios cargueiros.',
    asteroidsCount: 9,
    economicTier: 'Tier II - Centro Logístico'
  },

  // ── REGIÃO 2: BAIXA SEGURANÇA (LOW-SEC: 0.7 - 0.4) ──
  {
    id: 'tartarus_gate',
    name: 'Tartarus Gate',
    sectorCode: 'SEC-0104',
    region: 'Borderlands',
    security: 0.6,
    securityLevel: 'LOW',
    x: -260,
    y: 80,
    minerals: ['ferrox', 'crynex'],
    stations: ['Tartarus Free Station'],
    description: 'Antiga fortaleza de defesa convertida em porto livre para mineradores e exploradores independentes. Risco moderado de incursões piratas.',
    asteroidsCount: 16,
    economicTier: 'Tier III - Porto Franco'
  },
  {
    id: 'iron_bridge',
    name: 'Iron Bridge',
    sectorCode: 'SEC-0108',
    region: 'Borderlands',
    security: 0.5,
    securityLevel: 'LOW',
    x: 380,
    y: 30,
    minerals: ['ferrox', 'crynex'],
    stations: ['Iron Works Foundry'],
    description: 'Gigantesca ponte de asteroides com ligas metálicas densas. Alta rentabilidade mineral com escolta recomendada.',
    asteroidsCount: 18,
    economicTier: 'Tier III - Complexo Metalúrgico'
  },
  {
    id: 'cold_horizon',
    name: 'Cold Horizon',
    sectorCode: 'SEC-0112',
    region: 'Borderlands',
    security: 0.5,
    securityLevel: 'LOW',
    x: -120,
    y: 220,
    minerals: ['crynex'],
    stations: ['Horizon Observation Lab'],
    description: 'Nebulosa escura e gélida na fronteira galáctica. Os campos de Crynex daqui possuem pureza isotópica acima da média.',
    asteroidsCount: 15,
    economicTier: 'Tier III - Zona de Extração'
  },
  {
    id: 'nexus_vault',
    name: 'Nexus Vault',
    sectorCode: 'SEC-0119',
    region: 'Borderlands',
    security: 0.4,
    securityLevel: 'LOW',
    x: 120,
    y: 250,
    minerals: ['ferrox', 'crynex', 'varelium'],
    stations: ['Vault Black Market'],
    description: 'Esconderijo secreto de mineradores veteranos nos confins da jurisdição de Harpia. Pequenas concentrações raras de Varelium detetadas.',
    asteroidsCount: 14,
    economicTier: 'Tier IV - Mercado Negro'
  },

  // ── REGIÃO 3: ESPAÇO PROFUNDO / ANARQUIA (NULL-SEC: 0.3 - 0.0) ──
  {
    id: 'abyss_prime',
    name: 'Abyss Prime',
    sectorCode: 'SEC-0901',
    region: 'The Great Void',
    security: 0.3,
    securityLevel: 'NULL',
    x: -410,
    y: -40,
    minerals: ['crynex', 'varelium'],
    stations: ['Abyss Deep Rig'],
    description: 'Setor instável gravitacionalmente às portas do Grande Vazio. Tempestades de plasma frequentes e jazidas valiosas de Varelium.',
    asteroidsCount: 20,
    economicTier: 'Tier V - Espaço Sem Lei'
  },
  {
    id: 'void_nexus',
    name: 'Void Nexus',
    sectorCode: 'SEC-0915',
    region: 'The Great Void',
    security: 0.2,
    securityLevel: 'NULL',
    x: -330,
    y: 290,
    minerals: ['varelium'],
    stations: ['Shadow Depot'],
    description: 'Antiga anomalia espacial onde o tecido quântico oscila. O Varelium puro é extraído em densidades sem precedentes.',
    asteroidsCount: 22,
    economicTier: 'Tier V - Fronteira Perdida'
  },
  {
    id: 'dark_matter_rift',
    name: 'Dark Matter Rift',
    sectorCode: 'SEC-0928',
    region: 'The Great Void',
    security: 0.1,
    securityLevel: 'NULL',
    x: 480,
    y: 190,
    minerals: ['crynex', 'varelium'],
    stations: [],
    description: 'Fenda dimensional sem estações nem leis. Apenas os pilotos mais bem equipados arriscam a travessia para colher os minérios mais raros.',
    asteroidsCount: 25,
    economicTier: 'Tier V - Zona de Risco Extremo'
  },
  {
    id: 'omega_station',
    name: 'Omega Station',
    sectorCode: 'SEC-0999',
    region: 'The Great Void',
    security: 0.0,
    securityLevel: 'NULL',
    x: 0,
    y: 430,
    minerals: ['ferrox', 'crynex', 'varelium'],
    stations: ['Omega Citadel (Ruins)'],
    description: 'O ponto mais distante do universo cartografado. Cidade orbital misteriosa abandonada rodeada por cinturões titânicos de minério.',
    asteroidsCount: 30,
    economicTier: 'Tier V - Ponto Terminal'
  }
];

// Rotas bidirecionais entre Stargates
export const GALAXY_ROUTES = [
  // Conexões de Harpia Prime (Hub Central)
  ['harpia_prime', 'nova_terra'],
  ['harpia_prime', 'solaris_outpost'],
  ['harpia_prime', 'vega_terminus'],
  ['harpia_prime', 'tartarus_gate'],

  // Linhas High-Sec
  ['nova_terra', 'vega_terminus'],
  ['solaris_outpost', 'tartarus_gate'],

  // Transições High-Sec -> Low-Sec
  ['vega_terminus', 'iron_bridge'],
  ['tartarus_gate', 'cold_horizon'],
  ['tartarus_gate', 'abyss_prime'],

  // Conexões Low-Sec
  ['iron_bridge', 'nexus_vault'],
  ['cold_horizon', 'nexus_vault'],
  ['cold_horizon', 'void_nexus'],

  // Transições Low-Sec -> Null-Sec
  ['abyss_prime', 'void_nexus'],
  ['iron_bridge', 'dark_matter_rift'],
  ['nexus_vault', 'omega_station'],

  // Conexões Null-Sec / Espaço Profundo
  ['void_nexus', 'omega_station'],
  ['dark_matter_rift', 'omega_station']
];

/**
 * Procura um sistema pelo ID
 * @param {string} id
 */
export function getGalaxySystem(id) {
  return GALAXY_SYSTEMS.find(s => s.id === id) || null;
}

/**
 * Retorna os sistemas diretamente conectados a um determinado sistema
 * @param {string} systemId
 */
export function getConnectedSystems(systemId) {
  const connectedIds = new Set();
  for (const [from, to] of GALAXY_ROUTES) {
    if (from === systemId) connectedIds.add(to);
    else if (to === systemId) connectedIds.add(from);
  }
  return GALAXY_SYSTEMS.filter(s => connectedIds.has(s.id));
}

let _currentSystemId = 'harpia_prime';

export function getCurrentSystemId() {
  return _currentSystemId;
}

export function setCurrentSystemId(id) {
  if (GALAXY_SYSTEMS.some(s => s.id === id)) {
    _currentSystemId = id;
  }
}

/**
 * Converte as coordenadas do mapa galáctico para coordenadas mundiais do espaço contínuo da simulação.
 * Escala interestelar: 1 unidade no Starmap = 250m mundiais.
 * @param {Object} system
 * @returns {{x: number, y: number}}
 */
export function getSystemWorldCoordinates(system) {
  if (!system) return { x: 0, y: 0 };
  return {
    x: Math.round((system.x ?? 0) * 250),
    y: Math.round((system.y ?? 0) * 250)
  };
}
