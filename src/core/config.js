/**
 * HARPIA Universe - Global Configuration
 * Constantes e parâmetros globais do jogo. Fonte única da verdade.
 */

// --- Economia ---
export const STORAGE_MINE_MAX  = 50_000;
export const PI_DAILY_REWARD   = 50;
export const REWARD_COOLDOWN_H = 24;

// --- Mundo / Mapa ---
export const WORLD_WIDTH       = 12_000;
export const WORLD_HEIGHT      = 12_000;
export const SECTOR_COLS       = 40;
export const SECTOR_ROWS       = 40;
export const CELL_SIZE_PX      = 64;

// --- Câmara / Renderização ---
export const CAMERA_LERP       = 0.08;
export const ZOOM_MIN          = 0.3;
export const ZOOM_MAX          = 2.8;
export const ZOOM_STEP         = 0.001;

// --- Nave H-M2 ---
export const SHIP_BASE_SPEED   = 220;
export const SHIP_ROT_SPEED    = 3.5;
export const SHIP_ROT_THRESH   = 0.85;

// --- Estação ---
export const STATION_BASE_W    = 2500;
export const STATION_WORLD_X   = 0;
export const STATION_WORLD_Y   = 0;

// --- Starfield ---
export const STAR_COUNT_LAYER1 = 120;
export const STAR_COUNT_LAYER2 = 60;
export const STAR_COUNT_LAYER3 = 30;
export const STAR_PARALLAX     = [0.15, 0.35, 0.65];

// --- Rede / WebSocket ---
export const WS_RECONNECT_BASE  = 1000;
export const WS_RECONNECT_MAX   = 30_000;

// --- Minerais ---
export const MINERAL_TYPES = Object.freeze(['ferrox', 'crynex', 'varelium']);
