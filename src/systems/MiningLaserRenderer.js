/**
 * HARPIA Universe - MiningLaserRenderer
 * Renderização gráfica dos feixes de laser de mineração da nave mineradora.
 * - Feixes duais de alta precisão
 * - Proporcional à nave mineradora ativa
 * - Acompanha rotação da nave, zoom e posição do asteroide
 */
export class MiningLaserRenderer {
  /**
   * @param {Object} options
   * @param {import('../core/EventBus.js').EventBus} options.eventBus
   * @param {import('./MiningImpactEffects.js').MiningImpactEffects} [options.impactEffects]
   */
  constructor({ eventBus, impactEffects = null }) {
    this.bus = eventBus;
    this.impactEffects = impactEffects;
    this.isActive = false;
    this.impactPoints = [];

    this.svg = document.getElementById('mining-lasers-layer');
    this._createSvgElements();
  }

  _createSvgElements() {
    if (!this.svg) {
      this.svg = document.getElementById('mining-lasers-layer');
    }
    if (!this.svg) return;

    // Apenas os dois feixes de laser fininhos — sem bolas ou flares volumosos
    this.svg.innerHTML = `
      <g id="mining-laser-group" class="mining-laser-group" style="display: none;">
        <!-- Feixe Esquerdo (Glow fino + Linha Core) -->
        <line id="laser-left-glow" class="laser-line-glow" x1="0" y1="0" x2="0" y2="0" />
        <line id="laser-left-core" class="laser-line-core" x1="0" y1="0" x2="0" y2="0" />

        <!-- Feixe Direito (Glow fino + Linha Core) -->
        <line id="laser-right-glow" class="laser-line-glow" x1="0" y1="0" x2="0" y2="0" />
        <line id="laser-right-core" class="laser-line-core" x1="0" y1="0" x2="0" y2="0" />
      </g>
    `;

    this.groupEl = this.svg.querySelector('#mining-laser-group');
    this.lGlow = this.svg.querySelector('#laser-left-glow');
    this.lCore = this.svg.querySelector('#laser-left-core');
    this.rGlow = this.svg.querySelector('#laser-right-glow');
    this.rCore = this.svg.querySelector('#laser-right-core');
  }

  setActive(active) {
    this.isActive = !!active;
    if (!this.groupEl) {
      this._createSvgElements();
    }
    if (this.groupEl) {
      this.groupEl.style.display = this.isActive ? 'block' : 'none';
    }
  }

  /**
   * Atualização contínua chamada no render loop da engine
   * @param {import('../core/Camera2D.js').Camera2D} camera
   * @param {import('../entities/ShipEntity.js').ShipEntity} ship
   * @param {import('../entities/AsteroidEntity.js').AsteroidEntity} asteroid
   */
  render(camera, ship, asteroid) {
    if (!this.isActive || !ship || !asteroid || ship.isDocked || asteroid.isDepleted || asteroid.currentOpacity <= 0.05) {
      this.impactPoints = [];
      if (this.groupEl && this.groupEl.style.display !== 'none') {
        this.groupEl.style.display = 'none';
      }
      return;
    }

    if (!this.groupEl) {
      this._createSvgElements();
    }

    if (this.groupEl && this.groupEl.style.display === 'none') {
      this.groupEl.style.display = 'block';
    }

    // 1. Posição da nave no ecrã (a câmara foca na nave, logo está no centro)
    const cx = camera.width / 2;
    const cy = camera.height / 2;

    const scaledWidth = ship.baseWidth * camera.zoomRatio * ship.scale;
    const angle = ship.angle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Hardpoints das asas da nave H-M1 (em coordenadas locais da nave apontando para cima)
    const localX1 = -scaledWidth * 0.22;
    const localY1 = -scaledWidth * 0.05;
    const localX2 = scaledWidth * 0.22;
    const localY2 = -scaledWidth * 0.05;

    // Rotação dos hardpoints para coordenadas de ecrã
    const p1x = cx + (localX1 * cos - localY1 * sin);
    const p1y = cy + (localX1 * sin + localY1 * cos);
    const p2x = cx + (localX2 * cos - localY2 * sin);
    const p2y = cy + (localX2 * sin + localY2 * cos);

    // 2. Posição do asteroide projetada no ecrã
    const astScreen = camera.worldToScreen(asteroid.x, asteroid.y);

    // Ponto de impacto no centro do asteroide
    const t1x = astScreen.x - 4;
    const t1y = astScreen.y - 2;
    const t2x = astScreen.x + 4;
    const t2y = astScreen.y + 2;

    // Regista os pontos de impacto para os efeitos visuais
    this.impactPoints = [
      { x: t1x, y: t1y, type: 'ship' },
      { x: t2x, y: t2y, type: 'ship' }
    ];

    // 3. Atualizar Feixe Esquerdo (fino e limpo)
    if (this.lGlow && this.lCore) {
      this.lGlow.setAttribute('x1', p1x.toFixed(1));
      this.lGlow.setAttribute('y1', p1y.toFixed(1));
      this.lGlow.setAttribute('x2', t1x.toFixed(1));
      this.lGlow.setAttribute('y2', t1y.toFixed(1));

      this.lCore.setAttribute('x1', p1x.toFixed(1));
      this.lCore.setAttribute('y1', p1y.toFixed(1));
      this.lCore.setAttribute('x2', t1x.toFixed(1));
      this.lCore.setAttribute('y2', t1y.toFixed(1));
    }

    // 4. Atualizar Feixe Direito (fino e limpo)
    if (this.rGlow && this.rCore) {
      this.rGlow.setAttribute('x1', p2x.toFixed(1));
      this.rGlow.setAttribute('y1', p2y.toFixed(1));
      this.rGlow.setAttribute('x2', t2x.toFixed(1));
      this.rGlow.setAttribute('y2', t2y.toFixed(1));

      this.rCore.setAttribute('x1', p2x.toFixed(1));
      this.rCore.setAttribute('y1', p2y.toFixed(1));
      this.rCore.setAttribute('x2', t2x.toFixed(1));
      this.rCore.setAttribute('y2', t2y.toFixed(1));
    }
  }

  getImpactPoints() {
    return this.isActive ? this.impactPoints : [];
  }
}
