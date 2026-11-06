/**
 * HARPIA Universe - RemoteShipEntity
 * Entidade que modela e renderiza no espaço as naves de outros jogadores online,
 * com interpolação suave (dead reckoning a 60 FPS), propulsores ativos e badge de piloto.
 */
import { getShipInfo } from '../config/shipsRegistry.js';

export class RemoteShipEntity {
  /**
   * @param {Object} data - Dados iniciais do piloto enviados pelo servidor
   * @param {HTMLElement} parentLayer - Elemento DOM da camada de naves remotas
   */
  constructor(data, parentLayer) {
    this.id = data.id;
    this.username = data.name || `Piloto #${data.id}`;
    this.shipId = data.shp || 'H-M2';

    // Posição no mundo espacial (com alvos para interpolação lerp suave)
    this.x = data.x || 0;
    this.y = data.y || 0;
    this.targetX = data.x || 0;
    this.targetY = data.y || 0;

    this.angle = data.ang || 0;
    this.targetAngle = data.ang || 0;

    this.speed = data.spd || 0;
    this.isMoving = Boolean(data.mov);
    this.isDocked = Boolean(data.doc);
    this.warpState = data.wrp || 'IDLE';
    this.miningTarget = data.min || null;

    this.baseWidth = 150;
    this.parentLayer = parentLayer;

    this.wrapEl = null;
    this.badgeEl = null;
    this.imgEl = null;
    this.thrusterRigs = [];

    // Estruturas de Mineração e Drones Remotos
    this.laserGroup = null;
    this.laserElements = null;
    this.remoteDrones = [];

    this._createDomElement();
    this.applyShipSpecs(this.shipId);
  }

  _createDomElement() {
    const wrap = document.createElement('div');
    wrap.className = 'remote-ship-wrap';
    wrap.id = `remote-ship-${this.id}`;

    // Badge flutuante do nome do piloto (exibida apenas ao passar o rato)
    const badge = document.createElement('div');
    badge.className = 'remote-pilot-badge';
    badge.innerHTML = `<span class="remote-pilot-name">${this.username}</span>`;

    // Imagem da fuselagem da nave
    const img = document.createElement('img');
    img.className = 'remote-ship-img';
    img.alt = this.username;

    wrap.appendChild(badge);
    wrap.appendChild(img);

    this.parentLayer.appendChild(wrap);
    this.wrapEl = wrap;
    this.badgeEl = badge;
    this.imgEl = img;
  }

  applyShipSpecs(shipId) {
    this.shipId = shipId;
    const info = getShipInfo(shipId);

    if (this.imgEl) {
      this.imgEl.src = info.imageSrc || info.thumbnail || 'assets/ships/MINING SHIPS/H-M2.png';
    }

    if (info && info.hullSpan) {
      this.baseWidth = info.hullSpan;
    }

    this._renderThrusters(info);
  }

  _renderThrusters(info) {
    if (!this.wrapEl) return;
    this.wrapEl.querySelectorAll('.ship-thruster-rig').forEach(el => el.remove());
    this.thrusterRigs = [];

    const thrusters = (info && Array.isArray(info.thrusters) && info.thrusters.length)
      ? info.thrusters
      : [{ id: 'main', left: '50%', top: '86%', width: '18%', height: '32%', color: 'cyan' }];

    const isQuad = thrusters.length >= 4;
    const isDual = thrusters.length >= 2;

    this.wrapEl.classList.remove('dual-thrusters', 'quad-thrusters');
    if (isQuad) {
      this.wrapEl.classList.add('dual-thrusters', 'quad-thrusters');
    } else if (isDual) {
      this.wrapEl.classList.add('dual-thrusters');
    }

    thrusters.forEach((t, i) => {
      const rig = document.createElement('div');
      let classList = 'ship-thruster-rig';
      if (t.color === 'orange') {
        classList += ' ship-thruster-orange';
        if (i === 2) classList += ' ship-thruster-orange-1';
        if (i === 3) classList += ' ship-thruster-orange-2';
      } else if (i === 1) {
        classList += ' ship-thruster-rig-2';
      }
      rig.className = classList;
      if (t.left) rig.style.left = t.left;
      if (t.top) rig.style.top = t.top;
      if (t.width) rig.style.width = t.width;
      if (t.height) rig.style.height = t.height;

      rig.innerHTML = `
        <div class="thruster-outer-glow"></div>
        <div class="thruster-plasma-flame"></div>
        <div class="thruster-core-beam"></div>
        <div class="thruster-shock-diamond"></div>
      `;

      this.wrapEl.appendChild(rig);
      this.thrusterRigs.push(rig);
    });
  }

  /**
   * Sincroniza o estado com o pacote mais recente do servidor
   * @param {Object} data 
   */
  sync(data) {
    if (Number.isFinite(data.x)) this.targetX = data.x;
    if (Number.isFinite(data.y)) this.targetY = data.y;
    if (Number.isFinite(data.ang)) this.targetAngle = data.ang;
    if (Number.isFinite(data.spd)) this.speed = data.spd;

    this.isMoving = Boolean(data.mov);
    this.isDocked = Boolean(data.doc);
    this.warpState = data.wrp || 'IDLE';
    this.miningTarget = data.min || null;

    if (data.name && data.name !== this.username) {
      this.username = data.name;
      const nameEl = this.badgeEl?.querySelector('.remote-pilot-name');
      if (nameEl) nameEl.textContent = this.username;
    }

    if (data.shp && data.shp !== this.shipId) {
      this.applyShipSpecs(data.shp);
    }
  }

  /**
   * Atualização de física e interpolação no loop de jogo (60 FPS)
   * @param {number} dt - Delta time em segundos
   */
  update(dt) {
    if (this.isDocked) return;

    // Interpolação suave de posição mundiais (Lerp a 14/s para zero atraso visual)
    const posLerp = Math.min(1.0, 14.0 * dt);
    this.x += (this.targetX - this.x) * posLerp;
    this.y += (this.targetY - this.y) * posLerp;

    // Rotação suave pelo menor arco angular
    let diff = (this.targetAngle - this.angle) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    this.angle += diff * Math.min(1.0, 12.0 * dt);

    // Efeito de fogo nos propulsores de acordo com movimento
    const thrusting = this.isMoving || this.speed > 10;
    this.thrusterRigs.forEach(rig => {
      rig.classList.toggle('thrusting', thrusting);
    });
  }

  /**
   * Renderização na projeção da câmara espacial
   * @param {import('../core/Camera2D.js').Camera2D} camera 
   */
  render(camera) {
    if (!this.wrapEl) return;

    if (this.isDocked) {
      this.wrapEl.style.display = 'none';
      this._hideMiningEffects();
      return;
    }
    this.wrapEl.style.display = 'flex';

    const ratio = camera.zoomRatio;
    const scaledWidth = Math.round(this.baseWidth * ratio);
    this.wrapEl.style.width = scaledWidth + 'px';

    const offsetX = Math.round((this.x - camera.x) * ratio);
    const offsetY = Math.round((this.y - camera.y) * ratio);
    const deg = Math.round(this.angle * (180 / Math.PI));

    // Posiciona a nave no espaço respeitando rotação
    this.wrapEl.style.transform = `translate3d(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px), 0) rotate(${deg}deg)`;

    // Contrarrotação na tag de identificação do piloto para manter o texto sempre perfeitamente legível na horizontal
    if (this.badgeEl) {
      this.badgeEl.style.transform = `translateX(-50%) rotate(${-deg}deg)`;
    }

    // Renderiza feixes laser e drones da nave de outro jogador
    this._renderMiningEffects(camera, scaledWidth);
  }

  _getTargetCoords() {
    if (!this.miningTarget) return null;
    if (this.miningTarget.asteroidKey && window.harpiaAsteroids) {
      const ast = window.harpiaAsteroids.find(a => a.storageKey === this.miningTarget.asteroidKey);
      if (ast && !ast.isDepleted) {
        return { x: ast.x, y: ast.y };
      }
    }
    if (Number.isFinite(this.miningTarget.targetX) && Number.isFinite(this.miningTarget.targetY)) {
      return { x: this.miningTarget.targetX, y: this.miningTarget.targetY };
    }
    return null;
  }

  _createLaserElements() {
    const svg = document.getElementById('mining-lasers-layer');
    if (!svg || this.laserGroup) return;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.id = `remote-laser-${this.id}`;
    g.setAttribute('class', 'mining-laser-group');
    g.style.display = 'none';

    g.innerHTML = `
      <line class="laser-line-glow" x1="0" y1="0" x2="0" y2="0" />
      <line class="laser-line-core" x1="0" y1="0" x2="0" y2="0" />
      <line class="laser-line-glow" x1="0" y1="0" x2="0" y2="0" />
      <line class="laser-line-core" x1="0" y1="0" x2="0" y2="0" />
    `;
    svg.appendChild(g);

    const lines = g.querySelectorAll('line');
    this.laserGroup = g;
    this.laserElements = {
      lGlow: lines[0],
      lCore: lines[1],
      rGlow: lines[2],
      rCore: lines[3]
    };
  }

  _createDroneElements() {
    const dronesLayer = document.getElementById('drones-layer');
    const svgLayer = document.getElementById('mining-lasers-layer');
    if (!dronesLayer || !svgLayer || this.remoteDrones.length > 0) return;

    for (let i = 0; i < 5; i++) {
      // 1. Elemento visual HTML do drone
      const el = document.createElement('div');
      el.className = 'grok-drone-entity';
      el.id = `remote-drone-${this.id}-${i}`;
      el.style.display = 'none';
      el.style.width = '16px';
      el.style.height = '16px';
      el.innerHTML = `
        <div class="grok-drone-hull">
          <img src="./assets/items/mining_drone.png" alt="Drone" class="grok-drone-sprite" />
          <div class="grok-drone-thruster-glow"></div>
        </div>
      `;
      dronesLayer.appendChild(el);

      // 2. Linhas SVG do feixe laser do drone
      const laserG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      laserG.setAttribute('class', 'grok-drone-laser-unit');
      laserG.style.display = 'none';

      const glow = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      glow.setAttribute('class', 'grok-laser-glow');
      const core = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      core.setAttribute('class', 'grok-laser-core');
      laserG.appendChild(glow);
      laserG.appendChild(core);
      svgLayer.appendChild(laserG);

      this.remoteDrones.push({
        domEl: el,
        laserGroup: laserG,
        laserGlow: glow,
        laserCore: core
      });
    }
  }

  _renderMiningEffects(camera, scaledWidth) {
    const target = this._getTargetCoords();

    // 1. Feixes Laser da Nave Remota
    if (this.miningTarget && this.miningTarget.isMining && target) {
      if (!this.laserGroup) this._createLaserElements();

      if (this.laserGroup && this.laserElements) {
        this.laserGroup.style.display = 'block';

        const shipScreen = camera.worldToScreen(this.x, this.y);
        const targetScreen = camera.worldToScreen(target.x, target.y);

        const cos = Math.cos(this.angle);
        const sin = Math.sin(this.angle);
        const localX1 = -scaledWidth * 0.22;
        const localY1 = -scaledWidth * 0.05;
        const localX2 = scaledWidth * 0.22;
        const localY2 = -scaledWidth * 0.05;

        const p1x = shipScreen.x + (localX1 * cos - localY1 * sin);
        const p1y = shipScreen.y + (localX1 * sin + localY1 * cos);
        const p2x = shipScreen.x + (localX2 * cos - localY2 * sin);
        const p2y = shipScreen.y + (localX2 * sin + localY2 * cos);

        const t1x = targetScreen.x - 4;
        const t1y = targetScreen.y - 2;
        const t2x = targetScreen.x + 4;
        const t2y = targetScreen.y + 2;

        const { lGlow, lCore, rGlow, rCore } = this.laserElements;
        lGlow.setAttribute('x1', p1x.toFixed(1));
        lGlow.setAttribute('y1', p1y.toFixed(1));
        lGlow.setAttribute('x2', t1x.toFixed(1));
        lGlow.setAttribute('y2', t1y.toFixed(1));

        lCore.setAttribute('x1', p1x.toFixed(1));
        lCore.setAttribute('y1', p1y.toFixed(1));
        lCore.setAttribute('x2', t1x.toFixed(1));
        lCore.setAttribute('y2', t1y.toFixed(1));

        rGlow.setAttribute('x1', p2x.toFixed(1));
        rGlow.setAttribute('y1', p2y.toFixed(1));
        rGlow.setAttribute('x2', t2x.toFixed(1));
        rGlow.setAttribute('y2', t2y.toFixed(1));

        rCore.setAttribute('x1', p2x.toFixed(1));
        rCore.setAttribute('y1', p2y.toFixed(1));
        rCore.setAttribute('x2', t2x.toFixed(1));
        rCore.setAttribute('y2', t2y.toFixed(1));
      }
    } else {
      if (this.laserGroup) this.laserGroup.style.display = 'none';
    }

    // 2. Drones Grok da Nave Remota
    const mt = this.miningTarget;
    if (mt && mt.dronesActive) {
      if (this.remoteDrones.length === 0) this._createDroneElements();

      const isSplit = mt.droneMode === 'SPLIT';
      const droneTargets = Array.isArray(mt.droneTargets) ? mt.droneTargets : [];
      const activeCount = Math.min(5, Math.max(1, mt.droneCount || droneTargets.length || 2));
      const nowSec = Date.now() / 1000;
      const orbitRadius = 90;

      for (let i = 0; i < this.remoteDrones.length; i++) {
        const drone = this.remoteDrones[i];
        if (i >= activeCount) {
          drone.domEl.style.display = 'none';
          drone.laserGroup.style.display = 'none';
          continue;
        }

        // Resolver o alvo deste drone individualmente
        let droneTarget = null;
        if (isSplit && droneTargets[i] && window.harpiaAsteroids) {
          const ast = window.harpiaAsteroids.find(a => a.storageKey === droneTargets[i]);
          if (ast && !ast.isDepleted) droneTarget = { x: ast.x, y: ast.y };
        }
        // Fallback: usar o alvo do laser da nave (modo FOCUS ou sem dados SPLIT)
        if (!droneTarget) droneTarget = target;
        // Se ainda não há alvo, esconder este drone
        if (!droneTarget) {
          drone.domEl.style.display = 'none';
          drone.laserGroup.style.display = 'none';
          continue;
        }

        const targetScreen = camera.worldToScreen(droneTarget.x, droneTarget.y);
        const angleOffset = isSplit ? 0 : (i * (Math.PI * 2 / activeCount));
        const orbitAngle = nowSec * 0.8 + angleOffset;
        const droneWorldX = droneTarget.x + Math.cos(orbitAngle) * orbitRadius;
        const droneWorldY = droneTarget.y + Math.sin(orbitAngle) * orbitRadius;
        const droneScreen = camera.worldToScreen(droneWorldX, droneWorldY);
        const droneDeg = Math.round(orbitAngle * (180 / Math.PI) + 90);

        drone.domEl.style.display = 'block';
        drone.domEl.style.transform = `translate3d(${Math.round(droneScreen.x)}px, ${Math.round(droneScreen.y)}px, 0) translate(-50%, -50%) rotate(${droneDeg}deg)`;

        drone.laserGroup.style.display = 'block';
        drone.laserGlow.setAttribute('x1', droneScreen.x.toFixed(1));
        drone.laserGlow.setAttribute('y1', droneScreen.y.toFixed(1));
        drone.laserGlow.setAttribute('x2', targetScreen.x.toFixed(1));
        drone.laserGlow.setAttribute('y2', targetScreen.y.toFixed(1));

        drone.laserCore.setAttribute('x1', droneScreen.x.toFixed(1));
        drone.laserCore.setAttribute('y1', droneScreen.y.toFixed(1));
        drone.laserCore.setAttribute('x2', targetScreen.x.toFixed(1));
        drone.laserCore.setAttribute('y2', targetScreen.y.toFixed(1));
      }
    } else {
      for (const drone of this.remoteDrones) {
        if (drone.domEl) drone.domEl.style.display = 'none';
        if (drone.laserGroup) drone.laserGroup.style.display = 'none';
      }
    }
  }

  _hideMiningEffects() {
    if (this.laserGroup) this.laserGroup.style.display = 'none';
    for (const drone of this.remoteDrones) {
      if (drone.domEl) drone.domEl.style.display = 'none';
      if (drone.laserGroup) drone.laserGroup.style.display = 'none';
    }
  }

  destroy() {
    if (this.wrapEl) {
      this.wrapEl.remove();
      this.wrapEl = null;
    }
    if (this.laserGroup) {
      this.laserGroup.remove();
      this.laserGroup = null;
    }
    for (const drone of this.remoteDrones) {
      if (drone.domEl) drone.domEl.remove();
      if (drone.laserGroup) drone.laserGroup.remove();
    }
    this.remoteDrones = [];
  }
}
