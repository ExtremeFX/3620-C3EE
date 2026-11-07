/**
 * HARPIA Universe - CodexModal (Option 1: Interactive Holographic Game Intel Terminal)
 * Terminal futurista interativo que apresenta todas as funcionalidades, gameplay
 * e especificações do jogo em detalhe, sem ocupar espaço permanente no lobby.
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
    this.activeTab = 'flight'; // 'flight' | 'mining' | 'station' | 'market'

    // Nós DOM
    this.triggerBtn = null;
    this.overlayEl = null;
    this.modalEl = null;
    this.tabsContainer = null;
    this.contentBody = null;
    this.closeBtn = null;
  }

  mount(container) {
    if (this.root) return;

    // 1. Botão Holográfico no Lobby (Canto Inferior Esquerdo)
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'codex-lobby-trigger';
    trigger.id = 'codex-lobby-trigger';
    trigger.title = 'Aceder aos Arquivos e Guia de Voo de HARPIA';
    trigger.innerHTML = `
      <div class="codex-trigger-glow"></div>
      <div class="codex-trigger-icon">🛰️</div>
      <div class="codex-trigger-text">
        <span class="codex-trigger-title">CODEX // GAME INTEL</span>
        <span class="codex-trigger-sub">PILOT MANUAL & ARCHIVES</span>
      </div>
      <div class="codex-trigger-corner"></div>
    `;

    // 2. Modal Holográfico Central (Oculto por defeito)
    const overlay = document.createElement('div');
    overlay.className = 'codex-overlay hidden';
    overlay.id = 'codex-modal-overlay';

    overlay.innerHTML = `
      <div class="codex-backdrop"></div>
      <div class="codex-modal">
        <!-- Moldura SVG Holográfica com Cantos Chanfrados -->
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

        <!-- Cabeçalho do Terminal -->
        <div class="codex-header">
          <div class="codex-header-title">
            <span class="codex-status-pulse"></span>
            <div>
              <h2 class="codex-main-title">HARPIA UNIVERSE // TACTICAL CODEX</h2>
              <span class="codex-subtitle">CENTRAL ARCHIVES • SHIP REGISTRY • FLIGHT MANUAL</span>
            </div>
          </div>
          <button type="button" class="codex-close-btn" id="codex-close-btn" title="Fechar [ESC]">
            <span>✕</span> ESC
          </button>
        </div>

        <!-- Barra de Abas de Navegação -->
        <nav class="codex-nav-tabs" id="codex-nav-tabs">
          <button type="button" class="codex-tab-btn active" data-tab="flight">
            <span class="tab-icon">🛸</span> PILOTAGEM & VOO
          </button>
          <button type="button" class="codex-tab-btn" data-tab="mining">
            <span class="tab-icon">⛏️</span> MINERAÇÃO & DRONES
          </button>
          <button type="button" class="codex-tab-btn" data-tab="station">
            <span class="tab-icon">🏢</span> ESTAÇÃO & FROTAS
          </button>
          <button type="button" class="codex-tab-btn" data-tab="market">
            <span class="tab-icon">📈</span> MERCADO & REDE
          </button>
        </nav>

        <!-- Corpo de Conteúdo Dinâmico -->
        <div class="codex-body" id="codex-body-content">
          <!-- Renderizado via _renderTabContent() -->
        </div>

        <!-- Rodapé do Terminal -->
        <div class="codex-footer">
          <span class="codex-footer-hint">DICA: Podes abrir e consultar este guia a qualquer momento no ecrã inicial.</span>
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
    // Abrir Modal
    if (this.triggerBtn) {
      this.triggerBtn.addEventListener('click', () => {
        playTargetLockSound();
        this.open();
      });
      this.triggerBtn.addEventListener('mouseenter', () => {
        playSciFiBeep(880, 0.06, 'sine', 0.1);
      });
    }

    // Fechar Modal
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => {
        playSciFiBeep(440, 0.08, 'triangle', 0.15);
        this.close();
      });
    }

    // Clique fora do modal fecha
    if (this.overlayEl) {
      this.overlayEl.addEventListener('click', (e) => {
        if (e.target === this.overlayEl || e.target.classList.contains('codex-backdrop')) {
          this.close();
        }
      });
    }

    // Tecla ESC fecha
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    this.addCleanup(() => window.removeEventListener('keydown', onKeyDown));

    // Abas de Navegação
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
            <h3>🛸 SISTEMAS DE VOO & COCKPIT TÁTICO</h3>
            <p>Comanda naves industriais e logísticas com física de inércia espacial completa, controlos vetoriais e instrumentação holográfica em tempo real.</p>
          </div>

          <div class="codex-grid">
            <div class="codex-card">
              <div class="codex-card-tag">CONTROLO VETORIAL 360°</div>
              <h4>Dinâmica de Voo e Propulsão</h4>
              <p>Pilotagem com aceleração linear progressiva, taxa de viragem angular precisa e desaceleração inercial. Os propulsores de plasma adaptam a esteira de voo conforme a manobra.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">Cruzeiro: 110 m/s</span>
                <span class="codex-pill">Vel. Máxima: 400 m/s</span>
              </div>
            </div>

            <div class="codex-card">
              <div class="codex-card-tag">INSTRUMENTAÇÃO HOLOGRÁFICA</div>
              <h4>Cockpit & HUD Integrada</h4>
              <p>Anéis visuais dedicados à monitorização contínua de integridade do <strong>Escudo (Shield)</strong> e <strong>Casco (Hull)</strong>, velocímetro circular e bússola galáctica orbital.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">Proteção Bi-Camada</span>
                <span class="codex-pill">Interface Dinâmica</span>
              </div>
            </div>

            <div class="codex-card">
              <div class="codex-card-tag">RADAR DE SETOR</div>
              <h4>Painel Tático (Tactical Overview)</h4>
              <p>Registo permanente de corpos celestes e instalações. Seleciona qualquer campo de asteroides ou estação para traçar vetores imediatos de aproximação (<strong>Approach</strong>).</p>
              <div class="codex-card-footer">
                <span class="codex-pill">Radar Longo Alcance</span>
                <span class="codex-pill">Autotravamento</span>
              </div>
            </div>

            <div class="codex-card">
              <div class="codex-card-tag">TELEMETRIA ORBITAL</div>
              <h4>Coordenadas & Navegação Galáctica</h4>
              <p>Localização espacial exata exibida no topo do ecrã com identificação do setor e coordenadas X / Y em tempo real. Oculta de forma inteligente quando atracado em doca.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">Tecla [M] Mapa Galáctico</span>
                <span class="codex-pill">SEC-0014 Prime</span>
              </div>
            </div>
          </div>
        `;
        break;

      case 'mining':
        this.contentBody.innerHTML = `
          <div class="codex-section-intro">
            <h3>⛏️ MINERAÇÃO INDUSTRIAL & ESQUADRÃO DE DRONES</h3>
            <p>Extrai as maiores jazidas do cosmos através de lasers de plasma de alta voltagem e comanda esquadrões de drones Grok autónomos com inteligência tática.</p>
          </div>

          <div class="codex-grid">
            <div class="codex-card">
              <div class="codex-card-tag">LASERS DE ALTO RENDIMENTO</div>
              <h4>Feixes de Plasma Duplos</h4>
              <p>Instalados em torres frontais reforçadas, operam com alcance de até <strong>2.000 metros</strong>. Cada ciclo de 30 segundos extrai 2 unidades brutas depositadas diretamente no porão de carga.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">Alcance: 2.000m</span>
                <span class="codex-pill">Ciclo: 30 Segundos</span>
              </div>
            </div>

            <div class="codex-card">
              <div class="codex-card-tag">ESQUADRÃO AUTÓNOMO</div>
              <h4>Grok Mining Drones</h4>
              <p>Unidades de suporte autónomo equipadas em baía dedicada. Descolam da nave mãe, estabelecem órbita tática e deslocam-se autonomamente até aos asteroides para extração por laser próprio.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">Ciclo: 20 Segundos</span>
                <span class="codex-pill">Até 5 Drones na H-M2</span>
              </div>
            </div>

            <div class="codex-card">
              <div class="codex-card-tag">MODOS DE OPERAÇÃO</div>
              <h4>Comandos FOCUS & SPLIT</h4>
              <p><strong>FOCUS:</strong> Concentra todo o enxame de drones num único asteroide para quebra instantânea de reservas.<br>
              <strong>SPLIT:</strong> Os drones dividem-se de forma inteligente e simultânea por múltiplos asteroides, cobrindo o cinturão por inteiro.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">Comutação Instantânea</span>
                <span class="codex-pill">IA Cooperativa</span>
              </div>
            </div>

            <div class="codex-card">
              <div class="codex-card-tag">CATÁLOGO DE MINÉRIOS</div>
              <h4>Matérias-Primas do Cosmos</h4>
              <div class="codex-minerals-list">
                <div class="mineral-item"><strong style="color:#8cb0cc;">FERROX (FER):</strong> Estruturas e cascos industriais.</div>
                <div class="mineral-item"><strong style="color:#00f0ff;">CRYNEX (CRY):</strong> Cristais quânticos para reatores e lasers.</div>
                <div class="mineral-item"><strong style="color:#00ffaa;">VARELIUM (VAR):</strong> Isótopo exótico de altíssimo valor de mercado.</div>
              </div>
            </div>
          </div>
        `;
        break;

      case 'station':
        this.contentBody.innerHTML = `
          <div class="codex-section-intro">
            <h3>🏢 ESTAÇÃO ESPACIAL, LOGÍSTICA & FROTAS</h3>
            <p>Gerencia as tuas embarcações e mercadorias na doca orbital através de terminais integrados de carga e um avançado centro de montagem.</p>
          </div>

          <div class="codex-grid">
            <div class="codex-card">
              <div class="codex-card-tag">CONSOLA DUPLA LADO A LADO</div>
              <h4>Terminal Integrado de Carga (20px)</h4>
              <p>Posicionado de forma ergonómica à direita:<br>
              • <strong>Box da Nave (Esquerda):</strong> Carga de minérios + Baía de Drones Grok integrados.<br>
              • <strong>Cofre da Estação (Direita):</strong> Silo de alta segurança com capacidade para <strong>500.000 Toneladas</strong>.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">Drag & Drop Bidirecional</span>
                <span class="codex-pill">Shift + Drag Dividir</span>
              </div>
            </div>

            <div class="codex-card">
              <div class="codex-card-tag">CENTRO DE MONTAGEM</div>
              <h4>Visualizador 3D & Ship Specs</h4>
              <p>Inspeciona a tua nave sobre a plataforma rotativa em alta definição na aba <strong>ASSEMBLY</strong>. Consulta especificações completas de blindagem, propulsores, lasers e volume de porão.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">Plataforma Assembly</span>
                <span class="codex-pill">Métricas Oficiais</span>
              </div>
            </div>

            <div class="codex-card">
              <div class="codex-card-tag">NAVE INDUSTRIAL PESADA</div>
              <h4>MINING SHIP H-M2</h4>
              <p>A espinha dorsal das operações industriais. Equipada com porão de <strong>200 Toneladas</strong>, 2 lasers de plasma integrados e baía com capacidade para <strong>5 drones Grok</strong> prontos a atuar.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">200T Hold</span>
                <span class="codex-pill">5 Drones</span>
              </div>
            </div>

            <div class="codex-card">
              <div class="codex-card-tag">CARGUEIRO DE TRANSPORTE</div>
              <h4>FREIGHTER T-WS-CARGI</h4>
              <p>Gigante de transporte de carga massiva com porão de <strong>500 Toneladas</strong> e blindagem reforçada. Otimizada para exportação de minérios em grande escala para o mercado.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">500T Hold</span>
                <span class="codex-pill">Blindagem Pesada</span>
              </div>
            </div>
          </div>
        `;
        break;

      case 'market':
        this.contentBody.innerHTML = `
          <div class="codex-section-intro">
            <h3>📈 MERCADO REGIONAL, MOEDA ARP & REDE MULTIJOGADOR</h3>
            <p>Participa numa economia aberta gerida diretamente pelos jogadores, coordenada em tempo real através de rede quântica persistente.</p>
          </div>

          <div class="codex-grid">
            <div class="codex-card">
              <div class="codex-card-tag">LIVRO DE ORDENS REGIONAL</div>
              <h4>Mercado de Mercadorias</h4>
              <p>Coloca minérios, naves e drones à venda diretamente do cofre da estação. Define os teus preços unitários ou compra recursos listados por outros comandantes em trânsito.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">Ordens de Compra & Venda</span>
                <span class="codex-pill">Venda por Clique Direito</span>
              </div>
            </div>

            <div class="codex-card">
              <div class="codex-card-tag">SISTEMA MONETÁRIO</div>
              <h4>Créditos Galácticos ARP</h4>
              <p>A moeda de curso legal no setor interestelar. Ganha ARP negociando excedentes de mineração para adquirir novas naves de grande porte e equipar o teu esquadrão de drones.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">Carteira Digital</span>
                <span class="codex-pill">Taxa de Estação Transparente</span>
              </div>
            </div>

            <div class="codex-card">
              <div class="codex-card-tag">UNIVERSO PARTILHADO</div>
              <h4>Multijogador em Tempo Real</h4>
              <p>Voa lado a lado com outros comandantes. Todas as naves, feixes de mineração, movimentações de drones e alterações no mercado são sincronizadas instantaneamente via WebSockets.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">Presença Simultânea</span>
                <span class="codex-pill">Sincronização Total</span>
              </div>
            </div>

            <div class="codex-card">
              <div class="codex-card-tag">REDE DE COMUNICAÇÕES</div>
              <h4>Chat de Setor & Nuvem Persistente</h4>
              <p>Canal de comunicações instantâneo para coordenação tática com pilotos vizinhos. Todo o teu progresso, património e localização são guardados com segurança permanente na nuvem.</p>
              <div class="codex-card-footer">
                <span class="codex-pill">Comms de Setor</span>
                <span class="codex-pill">Base de Dados Turso</span>
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
