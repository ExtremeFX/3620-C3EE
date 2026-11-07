/**
 * HARPIA Universe - CodexModal (Option 1: Interactive Holographic Game Intel Terminal)
 * High-tech interactive terminal showcasing gameplay, mechanics, ships, and economy in English.
 */
import { UIComponent } from '../core/UIComponent.js';
import { playSciFiBeep, playTargetLockSound } from '../../core/audio.js';

export class CodexModal extends UIComponent {
  /**
   * @param {Object} options
   * @param {import('../../core/EventBus.js').EventBus} [options.eventBus]
   */
  constructor({ eventBus = null } = {}) {
    super();
    this.bus = eventBus;

    this.isOpen = false;
    this.activeTab = 'flight'; // 'flight' | 'mining' | 'station' | 'market' | 'system'

    // DOM Nodes
    this.triggerBtn = null;
    this.overlayEl = null;
    this.modalEl = null;
    this.tabsContainer = null;
    this.contentBody = null;
    this.closeBtn = null;
  }

  mount(container) {
    if (this.root) return;

    // 1. Holographic Trigger Button in Lobby (Bottom-Left)
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'codex-lobby-trigger';
    trigger.id = 'codex-lobby-trigger';
    trigger.title = 'Access HARPIA Archives & Flight Intel';
    trigger.innerHTML = `
      <div class="codex-trigger-glow"></div>
      <div class="codex-trigger-icon">🛰️</div>
      <div class="codex-trigger-text">
        <span class="codex-trigger-title">CODEX // GAME INTEL</span>
        <span class="codex-trigger-sub">PILOT MANUAL & ARCHIVES</span>
      </div>
      <div class="codex-trigger-corner"></div>
    `;

    // 2. Central Holographic Modal (Hidden by default)
    const overlay = document.createElement('div');
    overlay.className = 'codex-overlay hidden';
    overlay.id = 'codex-modal-overlay';

    overlay.innerHTML = `
      <div class="codex-backdrop"></div>
      <div class="codex-modal">
        <!-- Holographic SVG Frame with Chamfered Corners -->
        <svg class="codex-svg-frame" viewBox="0 0 960 640" preserveAspectRatio="none">
          <defs>
            <filter id="codex-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <polygon points="30,0 930,0 960,30 960,610 930,640 30,640 0,610 0,30" 
            fill="#000914" fill-opacity="0.94" stroke="#00f0ff" stroke-width="2" filter="url(#codex-glow)" />
          <path d="M30,12 L80,12" stroke="#00ffff" stroke-width="3" />
          <path d="M880,12 L930,12" stroke="#00ffff" stroke-width="3" />
          <line x1="12" y1="40" x2="12" y2="90" stroke="#00f0ff" stroke-width="2" />
          <line x1="948" y1="40" x2="948" y2="90" stroke="#00f0ff" stroke-width="2" />
        </svg>

        <!-- Terminal Header -->
        <div class="codex-header">
          <div class="codex-header-title">
            <span class="codex-status-pulse"></span>
            <div>
              <h2 class="codex-main-title">HARPIA UNIVERSE // TACTICAL CODEX</h2>
              <span class="codex-subtitle">CENTRAL ARCHIVES • SHIP REGISTRY • FLIGHT MANUAL</span>
            </div>
          </div>
          <button type="button" class="codex-close-btn" id="codex-close-btn" title="Close [ESC]">
            <span>✕</span> ESC
          </button>
        </div>

        <!-- Navigation Tabs -->
        <nav class="codex-nav-tabs" id="codex-nav-tabs">
          <button type="button" class="codex-tab-btn active" data-tab="flight">
            <span class="tab-icon">🛸</span> FLIGHT & COCKPIT
          </button>
          <button type="button" class="codex-tab-btn" data-tab="mining">
            <span class="tab-icon">⛏️</span> MINING & DRONES
          </button>
          <button type="button" class="codex-tab-btn" data-tab="station">
            <span class="tab-icon">🏢</span> STATION & FLEET
          </button>
          <button type="button" class="codex-tab-btn" data-tab="market">
            <span class="tab-icon">📈</span> MARKET & NETWORK
          </button>
          <button type="button" class="codex-tab-btn" data-tab="system">
            <span class="tab-icon">⚙️</span> SYSTEM & SPECS
          </button>
        </nav>

        <!-- Dynamic Body Content -->
        <div class="codex-body" id="codex-body-content">
          <!-- Rendered dynamically via _renderTabContent() -->
        </div>

        <!-- Terminal Footer -->
        <div class="codex-footer">
          <span class="codex-footer-hint">INTEL: You can open this codex at any time from the main lobby screen.</span>
          <span class="codex-footer-badge">SECTOR SEC-0014 • HARPIA PRIME</span>
        </div>
      </div>
    `;

    container.appendChild(trigger);
    container.appendChild(overlay);

    this.root = overlay;
    this.triggerBtn = trigger;
    this.overlayEl = overlay;
    this.modalEl = overlay.querySelector('.codex-modal');
    this.tabsContainer = overlay.querySelector('#codex-nav-tabs');
    this.contentBody = overlay.querySelector('#codex-body-content');
    this.closeBtn = overlay.querySelector('#codex-close-btn');

    this.bindEvents();
    this._renderTabContent(this.activeTab);
  }

  bindEvents() {
    // Open Modal
    if (this.triggerBtn) {
      this.triggerBtn.addEventListener('click', () => {
        playTargetLockSound();
        this.open();
      });
      this.triggerBtn.addEventListener('mouseenter', () => {
        playSciFiBeep(880, 0.06, 'sine', 0.1);
      });
    }

    // Close Modal
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => {
        playSciFiBeep(440, 0.08, 'triangle', 0.15);
        this.close();
      });
    }

    // Click outside closes modal
    if (this.overlayEl) {
      this.overlayEl.addEventListener('click', (e) => {
        if (e.target === this.overlayEl || e.target.classList.contains('codex-backdrop')) {
          this.close();
        }
      });
    }

    // ESC key closes modal
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    this.addCleanup(() => window.removeEventListener('keydown', onKeyDown));

    // Tab buttons
    if (this.tabsContainer) {
      const tabButtons = this.tabsContainer.querySelectorAll('.codex-tab-btn');
      tabButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const tabId = btn.getAttribute('data-tab');
          if (tabId && tabId !== this.activeTab) {
            playSciFiBeep(980, 0.08, 'sine', 0.15);
            this.switchTab(tabId);
          }
        });
      });
    }
  }

  open() {
    this.isOpen = true;
    if (this.overlayEl) {
      this.overlayEl.classList.remove('hidden');
    }
    this._renderTabContent(this.activeTab);
  }

  close() {
    this.isOpen = false;
    if (this.overlayEl) {
      this.overlayEl.classList.add('hidden');
    }
  }

  switchTab(tabId) {
    this.activeTab = tabId;
    if (this.tabsContainer) {
      this.tabsContainer.querySelectorAll('.codex-tab-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
      });
    }
    this._renderTabContent(tabId);
  }

  _renderTabContent(tabId) {
    if (!this.contentBody) return;

    switch (tabId) {
      case 'flight':
        this.contentBody.innerHTML = `
          <div class="codex-section-intro">
            <h3>🛸 FLIGHT DYNAMICS & TACTICAL COCKPIT</h3>
            <p>Command heavy industrial and logistical vessels with true Newtonian inertia, omnidirectional vector thrusters, and real-time holographic telemetry.</p>
          </div>

          <div class="codex-grid">
            <div class="codex-card">
              <div class="codex-card-tag">360° VECTOR THRUST</div>
              <h4>Flight Physics & Propulsion</h4>
              <p>Full 360-degree pilot control with progressive linear acceleration, calibrated angular turn rate, and inertial drift. Dual plasma engine trails dynamically respond to throttle and maneuvering.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">Cruise: 110 m/s</span>
                <span class="codex-pill">Max Velocity: 400 m/s</span>
              </div>
            </div>

            <div class="codex-card">
              <div class="codex-card-tag">HOLOGRAPHIC INSTRUMENTATION</div>
              <h4>Integrated Cockpit HUD</h4>
              <p>Dedicated circular telemetry monitors tracking real-time <strong>Shield</strong> and <strong>Hull</strong> integrity, orbital speed gauge, approach crosshairs, and navigational compass.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">Dual-Layer Defense</span>
                <span class="codex-pill">Dynamic Telemetry</span>
              </div>
            </div>

            <div class="codex-card">
              <div class="codex-card-tag">SECTOR RADAR</div>
              <h4>Tactical Overview Panel</h4>
              <p>Live contacts registry scanning celestial bodies and deep space infrastructure. Select any asteroid field, station, or waypoint to lock and engage direct <strong>Approach</strong> vectors.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">Long-Range Radar</span>
                <span class="codex-pill">Auto Target Lock</span>
              </div>
            </div>

            <div class="codex-card">
              <div class="codex-card-tag">ORBITAL TELEMETRY</div>
              <h4>Galactic Coords & Star Map</h4>
              <p>Real-time spatial telemetry displayed at the top HUD showing sector code, planetary orbit, and exact X/Y coordinates. Automatically hidden inside station docks.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">Key [M] Galaxy Map</span>
                <span class="codex-pill">SEC-0014 Prime</span>
              </div>
            </div>
          </div>
        `;
        break;

      case 'mining':
        this.contentBody.innerHTML = `
          <div class="codex-section-intro">
            <h3>⛏️ INDUSTRIAL EXTRACTION & DRONE SQUADRON</h3>
            <p>Strip mineral-rich celestial asteroids using high-output plasma lasers, and command autonomous Grok drone swarms with tactical cooperative AI.</p>
          </div>

          <div class="codex-grid">
            <div class="codex-card">
              <div class="codex-card-tag">HIGH-YIELD BEAMS</div>
              <h4>Dual Plasma Mining Lasers</h4>
              <p>Forward-mounted heavy emitters with an effective range of <strong>2,000 meters</strong>. Each 30-second cycle yields 2 raw ore units deposited directly into the ship's hold.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">Range: 2,000m</span>
                <span class="codex-pill">Cycle: 30s / 2 Units</span>
              </div>
            </div>

            <div class="codex-card">
              <div class="codex-card-tag">AUTONOMOUS SQUADRON</div>
              <h4>Grok Mining Drones</h4>
              <p>Unmanned extraction support craft housed in the ship's drone bay. Drones deploy, orbit in defensive escort, and autonomously navigate to target asteroids with independent laser beams.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">Cycle: 20 Seconds</span>
                <span class="codex-pill">Up to 5 on H-M2</span>
              </div>
            </div>

            <div class="codex-card">
              <div class="codex-card-tag">TACTICAL COMMANDS</div>
              <h4>FOCUS & SPLIT Modes</h4>
              <p><strong>FOCUS:</strong> Orders the entire drone swarm to concentrate firepower on a single asteroid for rapid resource depletion.<br>
              <strong>SPLIT:</strong> Swarm intelligently disperses across multiple celestial asteroids simultaneously.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">One-Click Toggle</span>
                <span class="codex-pill">Cooperative AI</span>
              </div>
            </div>

            <div class="codex-card">
              <div class="codex-card-tag">CELESTIAL ORE ROSTER</div>
              <h4>Cosmic Raw Commodities</h4>
              <div class="codex-minerals-list">
                <div class="mineral-item"><strong style="color:#8cb0cc;">FERROX (FER):</strong> Dense structural ore for hulls and space station modules.</div>
                <div class="mineral-item"><strong style="color:#00f0ff;">CRYNEX (CRY):</strong> High-energy quantum crystal for reactor cores and plasma lasers.</div>
                <div class="mineral-item"><strong style="color:#00ffaa;">VARELIUM (VAR):</strong> Ultra-rare exotic isotope commanding premium regional market value.</div>
              </div>
            </div>
          </div>
        `;
        break;

      case 'station':
        this.contentBody.innerHTML = `
          <div class="codex-section-intro">
            <h3>🏢 ORBITAL DOCK, LOGISTICS & FLEET MANAGEMENT</h3>
            <p>Manage vessels and cargo at the station orbital terminal featuring dual side-by-side consoles and a full 3D assembly yard.</p>
          </div>

          <div class="codex-grid">
            <div class="codex-card">
              <div class="codex-card-tag">SIDE-BY-SIDE DUAL CONSOLE</div>
              <h4>Integrated Cargo Terminal (20px Gap)</h4>
              <p>Ergonomic dual-dock layout positioned on the right:<br>
              • <strong>Ship Console (Left):</strong> Ship Ore Storage + Grok Drone Bay in a single integrated HUD.<br>
              • <strong>Station Vault (Right):</strong> Heavy-duty permanent storage with <strong>500,000 Ton</strong> capacity.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">Two-Way Drag & Drop</span>
                <span class="codex-pill">Shift + Drag Split</span>
              </div>
            </div>

            <div class="codex-card">
              <div class="codex-card-tag">ASSEMBLY YARD</div>
              <h4>3D Viewport & Ship Specs</h4>
              <p>Inspect your active vessel on the rotating orbital platform in the <strong>ASSEMBLY</strong> tab. Review comprehensive technical metrics including armor, shields, turn rate, and cargo hold.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">Assembly Mode</span>
                <span class="codex-pill">Official Specs</span>
              </div>
            </div>

            <div class="codex-card">
              <div class="codex-card-tag">HEAVY INDUSTRIAL MINER</div>
              <h4>MINING SHIP H-M2</h4>
              <p>The industrial workhorse of HARPIA Universe. Outfitted with a <strong>200-Ton</strong> ore hold, dual forward plasma lasers, and a dedicated bay accommodating up to <strong>5 Grok mining drones</strong>.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">200T Ore Hold</span>
                <span class="codex-pill">5 Drone Bay</span>
              </div>
            </div>

            <div class="codex-card">
              <div class="codex-card-tag">BULK TRANSPORT FREIGHTER</div>
              <h4>FREIGHTER T-WS-CARGI</h4>
              <p>Massive commercial transport freighter featuring a <strong>500-Ton</strong> cargo capacity and reinforced plating. Designed for bulk mineral export and large-scale market logistics.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">500T Cargo Hold</span>
                <span class="codex-pill">Armored Hull</span>
              </div>
            </div>
          </div>
        `;
        break;

      case 'market':
        this.contentBody.innerHTML = `
          <div class="codex-section-intro">
            <h3>📈 REGIONAL MARKET, ARP CREDITS & MULTIPLAYER NETWORK</h3>
            <p>Participate in a persistent player-driven economy coordinated across a real-time quantum network.</p>
          </div>

          <div class="codex-grid">
            <div class="codex-card">
              <div class="codex-card-tag">REGIONAL ORDER BOOK</div>
              <h4>Commodity Exchange</h4>
              <p>Place commodities, ships, and drones up for sale directly from station storage. Specify custom unit prices or instantly fulfill existing open buy and sell orders.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">Buy & Sell Orders</span>
                <span class="codex-pill">Right-Click Sell Shortcut</span>
              </div>
            </div>

            <div class="codex-card">
              <div class="codex-card-tag">UNIVERSAL CURRENCY</div>
              <h4>ARP Credits</h4>
              <p>Official currency across all sectors. Earn ARP by exporting mined minerals, trading equipment, or fulfilling regional supply quotas to acquire top-tier vessels.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">Digital Wallet</span>
                <span class="codex-pill">Transparent Station Fee</span>
              </div>
            </div>

            <div class="codex-card">
              <div class="codex-card-tag">SHARED UNIVERSE</div>
              <h4>Real-Time Multiplayer</h4>
              <p>Pilot alongside fellow commanders. All player positions, mining lasers, drone operations, and market transactions synchronize seamlessly via WebSockets.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">Live Player Presence</span>
                <span class="codex-pill">Full State Sync</span>
              </div>
            </div>

            <div class="codex-card">
              <div class="codex-card-tag">COMMUNICATIONS NETWORK</div>
              <h4>Sector Comms & Cloud Persistence</h4>
              <p>Instant sector chat channel for tactical wing coordination. Player accounts, station vaults, fleet rosters, and wallets persist securely in the cloud.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">Sector Chat</span>
                <span class="codex-pill">Turso Cloud DB</span>
              </div>
            </div>
          </div>
        `;
        break;

      case 'system':
        this.contentBody.innerHTML = `
          <div class="codex-section-intro">
            <h3>⚙️ SYSTEM & HARDWARE REQUIREMENTS</h3>
            <p>Optimal specifications and browser configuration for high-fidelity 60 FPS flight, real-time multiplayer, and low-latency physics in HARPIA Universe.</p>
          </div>

          <div class="codex-grid">
            <div class="codex-card">
              <div class="codex-card-tag">MINIMUM SPEC // 1080P FLIGHT</div>
              <h4>Base Flight Profile</h4>
              <p>Ensures smooth navigation, responsive cockpit controls, and stable sector streaming at standard 1080p resolution with post-processing enabled.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">CPU: 4 Cores (2.5+ GHz)</span>
                <span class="codex-pill">RAM: 8 GB DDR4</span>
                <span class="codex-pill">GPU: Intel UHD 630 / Iris / Vega 8</span>
                <span class="codex-pill">Net: 10 Mbps (&lt;80ms ping)</span>
              </div>
            </div>

            <div class="codex-card">
              <div class="codex-card-tag">RECOMMENDED SPEC // 1440P+ 60 FPS</div>
              <h4>High-Performance Wing</h4>
              <p>Designed for flawless 60 FPS combat, dense asteroid belts, particle-rich mining beams, multi-vessel encounters, and ultra-wide displays.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">CPU: 6+ Cores (Intel i5 10th+ / Ryzen 5)</span>
                <span class="codex-pill">RAM: 16 GB Dual-Channel</span>
                <span class="codex-pill">GPU: GTX 1650 / RTX 2060+ / RX 5500+</span>
                <span class="codex-pill">Storage: NVMe / SATA SSD</span>
                <span class="codex-pill">Net: 50+ Mbps Fiber (&lt;35ms ping)</span>
              </div>
            </div>

            <div class="codex-card">
              <div class="codex-card-tag">CRITICAL BROWSER SETTING</div>
              <h4>Hardware Acceleration</h4>
              <p>Mandatory for GPU canvas rendering. Ensure <strong>"Use graphics acceleration when available"</strong> is enabled in your browser settings (Chrome, Edge, Brave, Firefox, Opera) to avoid CPU software fallback.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">Hardware Acceleration: ON</span>
                <span class="codex-pill">WebGL 2.0 Enabled</span>
                <span class="codex-pill">GPU Rasterization</span>
              </div>
            </div>

            <div class="codex-card">
              <div class="codex-card-tag">ENGINE & AUDIO INTEGRATION</div>
              <h4>Platform & Web Audio Engine</h4>
              <p>Compatible with 64-bit Windows 10/11, macOS 11+, and Linux. Interactive audio requires initial user interaction (click anywhere on lobby or cockpit) to permit browser sound activation.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">64-Bit OS</span>
                <span class="codex-pill">Web Audio API</span>
                <span class="codex-pill">WebSocket 10 Hz Real-Time</span>
              </div>
            </div>
          </div>
        `;
        break;
    }
  }

  destroy() {
    super.destroy();
    if (this.triggerBtn && this.triggerBtn.parentNode) {
      this.triggerBtn.parentNode.removeChild(this.triggerBtn);
    }
    if (this.overlayEl && this.overlayEl.parentNode) {
      this.overlayEl.parentNode.removeChild(this.overlayEl);
    }
  }
}
