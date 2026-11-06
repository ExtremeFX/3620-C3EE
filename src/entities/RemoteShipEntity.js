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

    this._createDomElement();
    this.applyShipSpecs(this.shipId);
  }

  _createDomElement() {
    const wrap = document.createElement('div');
    wrap.className = 'remote-ship-wrap';
    wrap.id = `remote-ship-${this.id}`;

    // Badge flutuante do nome do piloto e modelo da nave
    const badge = document.createElement('div');
    badge.className = 'remote-pilot-badge';
    badge.innerHTML = `
      <span class="remote-pilot-name">${this.username}</span>
      <span class="remote-pilot-ship-tag">${this.shipId}</span>
    `;

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

    const shipTag = this.badgeEl?.querySelector('.remote-pilot-ship-tag');
    if (shipTag) {
      shipTag.textContent = info.name || shipId;
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
  }

  destroy() {
    if (this.wrapEl) {
      this.wrapEl.remove();
      this.wrapEl = null;
    }
  }
}
