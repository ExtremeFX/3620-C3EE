import { EV } from './EventBus.js';

/**
 * HARPIA Universe - AAA Cinematic Audio Synthesizer & Celestial Ship AI Voice
 * Design sonoro cinematográfico de alto impacto inspirado na atmosfera etérea,
 * misteriosa e orquestral (estilo Evanescence / Amy Lee / Sci-Fi Cinema):
 * - Sub-bass impacts profundos (braams e sub-drops)
 * - Acordes harmónicos celestiais e etéreos
 * - Chimes holográficos de alta fidelidade para bloqueio de alvos
 * - Voz de computador de bordo cinemática feminina etérea (Web Speech API + Harmónicos)
 */

// Garantir que nenhuma síntese de voz do navegador fica ativa ou presa
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  try { window.speechSynthesis.cancel(); } catch (e) {}
}

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// ── Master Audio Bus (Hierarquia: Master → Engine/World → SFX → destination) ──
// Estrutura de canais:
//   ctx.destination
//       └── masterGain            ← Controlo global (Master Volume)
//               ├── worldGain     ← Sons espaciais: motores, warp, impactos mineração
//               │     └── worldFilter (lowpass dinâmico de distância por zoom)
//               └── sfxGain       ← Sons de UI/HUD: beeps, alertas, holographic locks

let masterGain   = null; // Canal mestre — controla tudo
let worldGain    = null; // Canal do mundo espacial
let worldFilter  = null; // Filtro de distância espacial (zoom)
let sfxGain      = null; // Canal de efeitos de UI/HUD

// Volumes persistidos por sessão (carregados do localStorage)
const _audioPrefs = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem('harpia_audio_prefs') || '{}');
    return {
      master:  typeof saved.master  === 'number' ? Math.max(0, Math.min(1, saved.master))  : 1.0,
      sfx:     typeof saved.sfx     === 'number' ? Math.max(0, Math.min(1, saved.sfx))     : 1.0,
      engines: typeof saved.engines === 'number' ? Math.max(0, Math.min(1, saved.engines)) : 1.0,
    };
  } catch (e) {
    return { master: 1.0, sfx: 1.0, engines: 1.0 };
  }
})();

function _saveAudioPrefs() {
  try { localStorage.setItem('harpia_audio_prefs', JSON.stringify(_audioPrefs)); } catch (e) {}
}

function _getMasterBus() {
  const ctx = getAudioContext();
  if (!ctx) return null;
  if (!masterGain) {
    masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(_audioPrefs.master, ctx.currentTime);
    masterGain.connect(ctx.destination);
  }
  return masterGain;
}

function _getSfxBus() {
  const ctx = getAudioContext();
  if (!ctx) return null;
  const master = _getMasterBus();
  if (!master) return null;
  if (!sfxGain) {
    sfxGain = ctx.createGain();
    sfxGain.gain.setValueAtTime(_audioPrefs.sfx, ctx.currentTime);
    sfxGain.connect(master);
  }
  return sfxGain;
}

export function getWorldBus() {
  const ctx = getAudioContext();
  if (!ctx) return null;
  const master = _getMasterBus();
  if (!master) return null;
  if (!worldGain) {
    worldFilter = ctx.createBiquadFilter();
    worldFilter.type = 'lowpass';
    worldFilter.frequency.setValueAtTime(18000, ctx.currentTime);
    worldFilter.Q.setValueAtTime(0.7, ctx.currentTime);

    worldGain = ctx.createGain();
    worldGain.gain.setValueAtTime(_audioPrefs.engines, ctx.currentTime);

    worldFilter.connect(worldGain);
    worldGain.connect(master);
  }
  return worldFilter;
}

// ── API Pública de Controlo de Volume ────────────────────────────────────────

/**
 * Define o volume global Master (0.0 — 1.0).
 * @param {number} value
 */
export function setMasterVolume(value) {
  _audioPrefs.master = Math.max(0, Math.min(1, value));
  _saveAudioPrefs();
  const ctx = getAudioContext();
  if (masterGain && ctx) {
    masterGain.gain.setTargetAtTime(_audioPrefs.master, ctx.currentTime, 0.05);
  }
}

/**
 * Define o volume do canal SFX / HUD (0.0 — 1.0).
 * @param {number} value
 */
export function setSfxVolume(value) {
  _audioPrefs.sfx = Math.max(0, Math.min(1, value));
  _saveAudioPrefs();
  const ctx = getAudioContext();
  if (sfxGain && ctx) {
    sfxGain.gain.setTargetAtTime(_audioPrefs.sfx, ctx.currentTime, 0.05);
  }
}

/**
 * Define o volume do canal de Motores / Mundo Espacial (0.0 — 1.0).
 * @param {number} value
 */
export function setEnginesVolume(value) {
  _audioPrefs.engines = Math.max(0, Math.min(1, value));
  _saveAudioPrefs();
  const ctx = getAudioContext();
  if (worldGain && ctx) {
    worldGain.gain.setTargetAtTime(_audioPrefs.engines, ctx.currentTime, 0.05);
  }
}

/**
 * Devolve os volumes atuais de todos os canais.
 * @returns {{ master: number, sfx: number, engines: number }}
 */
export function getAudioVolumes() {
  return { ..._audioPrefs };
}

/**
 * Atualiza o volume e a filtragem acústica de distância com base no zoom da câmara.
 * Transição 100% contínua e suave via AudioParam.setTargetAtTime (sem cortes ou cliques).
 *
 * @param {number} zoom - Nível atual de zoom da câmara
 * @param {number} minZoom - Zoom mínimo (afastado ao máximo, default 0.4)
 * @param {number} maxZoom - Zoom máximo (aproximação máxima, default 2.8)
 */
export function updateSpatialAudioZoom(zoom, minZoom = 0.4, maxZoom = 2.8) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    getWorldBus();
    if (!worldGain || !worldFilter) return;

    // Fator normalizado 0.0 (zoom out máximo) -> 1.0 (zoom in máximo)
    const t = Math.max(0, Math.min(1, (zoom - minZoom) / (maxZoom - minZoom)));

    // 1. Curva de volume: Mínimo mas audível (0.18) no zoom out máximo até 1.0 no zoom in máximo
    const targetVolume = 0.18 + 0.82 * Math.pow(t, 0.85);

    // 2. Curva acústica de distância espacial (lowpass filter):
    // No zoom out: ~720Hz (efeito longe, distante, abafado no espaço)
    // No zoom in: 18.000Hz (efeito perto, brilhante, detalhado)
    const minFreq = 720;
    const maxFreq = 18000;
    const targetFreq = minFreq * Math.pow(maxFreq / minFreq, t);

    const now = ctx.currentTime;
    // Constante de tempo de 0.045s garante resposta instantânea ao scroll com ZERO estalidos ou cortes
    worldGain.gain.setTargetAtTime(targetVolume, now, 0.045);
    worldFilter.frequency.setTargetAtTime(targetFreq, now, 0.045);
  } catch (e) {}
}

/**
 * Conecta o sistema de áudio ao EventBus para responder automaticamente à câmara.
 * @param {import('./EventBus.js').EventBus} bus
 */
export function initAudioEventBus(bus) {
  if (!bus) return;
  bus.on(EV.CAMERA_UPDATED, (cam) => {
    if (cam && typeof cam.zoom === 'number') {
      updateSpatialAudioZoom(cam.zoom, cam.minZoom || 0.4, cam.maxZoom || 2.8);
    }
  });
}

/**
 * Impacto Cinemático de Sub-Bass (Cinema Trailer Braam / Sub-Drop)
 * Cria a sensação física e imersiva de potência no espaço.
 */
export function playCinematicImpact(intensity = 1.0) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Sub-oscilador (drop de 85Hz para 28Hz)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(85, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.55);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(140, now);
    filter.frequency.exponentialRampToValueAtTime(45, now + 0.6);

    const masterGain = Math.min(0.35, 0.22 * intensity);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(masterGain, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(getWorldBus() || ctx.destination);

    osc.start(now);
    osc.stop(now + 0.7);
  } catch (e) {}
}

/**
 * Acorde Harmónico Celestial e Etéreo (Pad cinemático estilo Evanescence)
 * Multi-osciladores com envelope suave e ressonância espacial.
 */
export function playEtherealChord(rootFreq = 220, duration = 1.8, gainLevel = 0.12) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Acorde menor celestial: Fundamental, 3ª menor, 5ª justa e oitava
    const freqs = [rootFreq, rootFreq * 1.1892, rootFreq * 1.4983, rootFreq * 2];

    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      // Ligeiro detune para criar atmosfera e largura estereofónica
      osc.frequency.setValueAtTime(f + (idx - 1.5) * 0.8, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1800, now);
      filter.frequency.exponentialRampToValueAtTime(600, now + duration);

      const voiceGain = (gainLevel / freqs.length) * (1 - idx * 0.12);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(voiceGain, now + 0.25); // Ataque suave
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(getWorldBus() || ctx.destination);

      osc.start(now);
      osc.stop(now + duration);
    });
  } catch (e) {}
}

/**
 * Clique Tático Holográfico Sublime (Subtle & High-Tech Sci-Fi Haptic Tap)
 * Som discreto, aveludado e elegante para seleção de contactos/alvos no HUD tático.
 * Arquitetura de dupla camada: micro-impulso háptico de vidro + corpo sub-táctil aveludado.
 */
export function playTacticalSelectSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const sfxBus = _getSfxBus() || ctx.destination;

    // ── Camada 1: Impulso Háptico Holográfico (Glass Micro-Impulse) ──
    const oscImpulse = ctx.createOscillator();
    const gainImpulse = ctx.createGain();
    const filterImpulse = ctx.createBiquadFilter();

    oscImpulse.type = 'sine';
    // Micro-pitch descendente ultra-rápido: 2100Hz -> 1250Hz em 16ms
    oscImpulse.frequency.setValueAtTime(2100, now);
    oscImpulse.frequency.exponentialRampToValueAtTime(1250, now + 0.016);

    filterImpulse.type = 'bandpass';
    filterImpulse.frequency.setValueAtTime(1600, now);
    filterImpulse.Q.setValueAtTime(2.0, now);

    gainImpulse.gain.setValueAtTime(0.0001, now);
    gainImpulse.gain.linearRampToValueAtTime(0.045, now + 0.002);
    gainImpulse.gain.exponentialRampToValueAtTime(0.0001, now + 0.028);

    oscImpulse.connect(filterImpulse);
    filterImpulse.connect(gainImpulse);
    gainImpulse.connect(sfxBus);

    oscImpulse.start(now);
    oscImpulse.stop(now + 0.035);

    // ── Camada 2: Ressonância Suave de Cockpit (Velvety Tactile Body) ──
    const oscBody = ctx.createOscillator();
    const gainBody = ctx.createGain();
    const filterBody = ctx.createBiquadFilter();

    oscBody.type = 'sine';
    // Frequência suave: 480Hz -> 320Hz em 35ms (peso tátil sem rispidez)
    oscBody.frequency.setValueAtTime(480, now);
    oscBody.frequency.exponentialRampToValueAtTime(320, now + 0.035);

    filterBody.type = 'lowpass';
    filterBody.frequency.setValueAtTime(750, now);

    gainBody.gain.setValueAtTime(0.0001, now);
    gainBody.gain.linearRampToValueAtTime(0.035, now + 0.003);
    gainBody.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

    oscBody.connect(filterBody);
    filterBody.connect(gainBody);
    gainBody.connect(sfxBus);

    oscBody.start(now);
    oscBody.stop(now + 0.05);
  } catch (e) {}
}

/**
 * Bloqueio de Alvo Holográfico (Harmónico cristalino de alta fidelidade e suave)
 */
export function playTargetLockSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const sfxBus = _getSfxBus() || ctx.destination;

    // Frequência harmónica Solfeggio 528Hz + harmónico superior 1056Hz
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(528, now);
    osc1.frequency.exponentialRampToValueAtTime(792, now + 0.12);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1056, now);
    osc2.frequency.exponentialRampToValueAtTime(1320, now + 0.12);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.055, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(sfxBus);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.2);
    osc2.stop(now + 0.2);
  } catch (e) {}
}

/**
 * Comando Tático Holográfico (Veludo espacial com ressonância profunda)
 */
export function playTacticalCommandSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.09);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(_getSfxBus() || ctx.destination);

    osc.start(now);
    osc.stop(now + 0.24);
  } catch (e) {}
}

// ── Som de Dobra Hiperespacial (som-warp.ogg + warp-continuo.ogg) ─────────────
// Requisitos do Comandante:
// 1. som-warp.ogg toca do início ao fim (spool-up e salto de entrada);
// 2. 2 segundos antes do fim de som-warp.ogg (~3.27s), inicia warp-continuo.ogg;
// 3. warp-continuo.ogg corre em loop contínuo e sem cortes enquanto a nave viaja em warp;
// 4. Ao chegar ao destino, fade-out suave do contínuo e disparo da saída final.

let _warpIntroBuffer = null;
let _warpLoopBuffer = null;
let _warpLoading = false;

let _warpIntroSource = null;
let _warpIntroGain = null;
let _warpLoopSource = null;
let _warpLoopGain = null;
let _warpExitSource = null;
let _warpExitGain = null;

async function _loadWarpBuffers() {
  if (_warpIntroBuffer && _warpLoopBuffer) return true;
  if (_warpLoading) return false;
  _warpLoading = true;
  try {
    const ctx = getAudioContext();
    if (!ctx) return false;

    const [resIntro, resLoop] = await Promise.all([
      fetch('assets/sounds/som-warp.ogg'),
      fetch('assets/sounds/warp-continuo.ogg')
    ]);

    const [bufIntro, bufLoop] = await Promise.all([
      resIntro.arrayBuffer(),
      resLoop.arrayBuffer()
    ]);

    _warpIntroBuffer = await ctx.decodeAudioData(bufIntro);
    _warpLoopBuffer = await ctx.decodeAudioData(bufLoop);
  } catch (e) {
    console.warn('[audio] Erro ao carregar sons de warp:', e);
  }
  _warpLoading = false;
  return !!(_warpIntroBuffer && _warpLoopBuffer);
}

_loadWarpBuffers();

/**
 * Inicia o warp sound: toca som-warp.ogg do início ao fim e,
 * 2 segundos antes do seu término, inicia warp-continuo.ogg em crossfade.
 */
export async function startWarpSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Cancela qualquer som de warp anterior
    stopWarpSound(0.04);

    await _loadWarpBuffers();
    if (!_warpIntroBuffer) return;

    const now = ctx.currentTime;
    const dest = getWorldBus() || ctx.destination;

    // 1. som-warp.ogg: toca do início ao fim sem loop
    _warpIntroGain = ctx.createGain();
    _warpIntroGain.gain.setValueAtTime(0.80, now);
    _warpIntroGain.connect(dest);

    _warpIntroSource = ctx.createBufferSource();
    _warpIntroSource.buffer = _warpIntroBuffer;
    _warpIntroSource.loop = false;
    _warpIntroSource.connect(_warpIntroGain);
    _warpIntroSource.start(now);

    // 2. 2 segundos antes do fim de som-warp.ogg, entra warp-continuo.ogg
    if (_warpLoopBuffer) {
      const introDuration = _warpIntroBuffer.duration || 5.27;
      const delayUntilContinuous = Math.max(0, introDuration - 2.0); // ~3.27s
      const loopStartTime = now + delayUntilContinuous;

      _warpLoopGain = ctx.createGain();
      // Silêncio até aos 3.27s
      _warpLoopGain.gain.setValueAtTime(0.0001, now);
      _warpLoopGain.gain.setValueAtTime(0.0001, loopStartTime);
      // Crossfade de 1.8s fundindo com os últimos 2s de som-warp.ogg
      _warpLoopGain.gain.linearRampToValueAtTime(0.75, loopStartTime + 1.8);
      _warpLoopGain.connect(dest);

      _warpLoopSource = ctx.createBufferSource();
      _warpLoopSource.buffer = _warpLoopBuffer;
      _warpLoopSource.loop = true;
      _warpLoopSource.connect(_warpLoopGain);
      _warpLoopSource.start(loopStartTime);
    }
  } catch (e) {}
}

/**
 * Para todos os sons de warp com fade-out rápido (cancelamento ou interrupção).
 */
export function stopWarpSound(fadeDuration = 0.1) {
  try {
    const ctx = getAudioContext();
    const now = ctx ? ctx.currentTime : 0;

    if (_warpIntroGain && ctx) {
      _warpIntroGain.gain.cancelScheduledValues(now);
      _warpIntroGain.gain.setValueAtTime(_warpIntroGain.gain.value, now);
      _warpIntroGain.gain.linearRampToValueAtTime(0.0001, now + fadeDuration);
    }
    const introSrc = _warpIntroSource;
    _warpIntroSource = null;
    _warpIntroGain = null;
    if (introSrc) setTimeout(() => { try { introSrc.stop(); } catch (e) {} }, fadeDuration * 1000 + 40);

    if (_warpLoopGain && ctx) {
      _warpLoopGain.gain.cancelScheduledValues(now);
      _warpLoopGain.gain.setValueAtTime(_warpLoopGain.gain.value, now);
      _warpLoopGain.gain.linearRampToValueAtTime(0.0001, now + fadeDuration);
    }
    const loopSrc = _warpLoopSource;
    _warpLoopSource = null;
    _warpLoopGain = null;
    if (loopSrc) setTimeout(() => { try { loopSrc.stop(); } catch (e) {} }, fadeDuration * 1000 + 40);
  } catch (e) {}
}

/**
 * Saída de Dobra Hiperespacial (Warp Exit / Chegada ao Destino).
 * Desvanece o warp contínuo e dispara o som de saída / desaceleração.
 */
export async function playWarpExitSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Desvanece o loop contínuo suavemente
    stopWarpSound(0.35);

    // Dispara a secção de desaceleração / chegada final de som-warp.ogg
    if (_warpIntroBuffer) {
      const now = ctx.currentTime;
      const dest = getWorldBus() || ctx.destination;

      _warpExitGain = ctx.createGain();
      _warpExitGain.gain.setValueAtTime(0.85, now);
      _warpExitGain.connect(dest);

      _warpExitSource = ctx.createBufferSource();
      _warpExitSource.buffer = _warpIntroBuffer;
      _warpExitSource.loop = false;
      _warpExitSource.connect(_warpExitGain);
      _warpExitSource.start(now, 4.3);
    }
  } catch (e) {}
}

export const playWarpChargeSound = startWarpSound;
export function playWarpEntrySound() {
  // Transição de aceleração coberta continuamente pelos ficheiros de áudio
}

/**
 * Bip Elegante Holográfico (Substitui o antigo bip agudo retro)
 */
export function playSciFiBeep(freq = 528, duration = 0.12, type = 'sine', gain = 0.12) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.linearRampToValueAtTime(gain, now + 0.015);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gainNode);
    gainNode.connect(_getSfxBus() || ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  } catch (err) {}
}

/**
 * Alerta Cinemático Suave (Pulso de ressonância profunda, sem som arcade de 8 bits)
 */
export function playSciFiAlert() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.35);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(700, now);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(_getSfxBus() || ctx.destination);

    osc.start(now);
    osc.stop(now + 0.38);
  } catch (err) {}
}


// ── Som de Paira da Nave (OGG loop sem cortes via Web Audio API) ──────────────
let _hoverSource = null;
let _hoverGain = null;
let _hoverBuffer = null;
let _hoverLoading = false;

async function _loadHoverBuffer() {
  if (_hoverBuffer) return _hoverBuffer;
  if (_hoverLoading) return null;
  _hoverLoading = true;
  try {
    const ctx = getAudioContext();
    if (!ctx) return null;
    const res = await fetch('assets/sounds/nave-espacial-pairando_1.ogg');
    const arrayBuf = await res.arrayBuffer();
    _hoverBuffer = await ctx.decodeAudioData(arrayBuf);
  } catch (e) {
    console.warn('[audio] Erro ao carregar som de paira:', e);
  }
  _hoverLoading = false;
  return _hoverBuffer;
}

_loadHoverBuffer();

export async function startHoverSound(fadeDuration = 1.2) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (_hoverSource) return;

    const buf = await _loadHoverBuffer();
    if (!buf) return;

    _hoverGain = ctx.createGain();
    _hoverGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    _hoverGain.gain.linearRampToValueAtTime(0.55, ctx.currentTime + fadeDuration);
    _hoverGain.connect(getWorldBus() || ctx.destination);

    _hoverSource = ctx.createBufferSource();
    _hoverSource.buffer = buf;
    _hoverSource.loop = true;
    _hoverSource.connect(_hoverGain);
    _hoverSource.start();
  } catch (e) {}
}

export function stopHoverSound(fadeDuration = 0.6) {
  try {
    if (!_hoverSource || !_hoverGain) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    _hoverGain.gain.cancelScheduledValues(now);
    _hoverGain.gain.setValueAtTime(_hoverGain.gain.value, now);
    _hoverGain.gain.linearRampToValueAtTime(0.0001, now + fadeDuration);

    const src = _hoverSource;
    _hoverSource = null;
    _hoverGain = null;

    setTimeout(() => { try { src.stop(); } catch (e) {} }, fadeDuration * 1000 + 50);
  } catch (e) {}
}
