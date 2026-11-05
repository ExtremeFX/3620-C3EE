/**
 * HARPIA Universe - ShipEntity
 * Entidade que modela a nave mineradora H-M1: física, rotação pelo arco mais curto e propulsor.
 */
import { EV } from '../core/EventBus.js';
import { getShipInfo } from '../config/shipsRegistry.js';
import { playWarpChargeSound, playWarpEntrySound, playWarpExitSound, startHoverSound, stopHoverSound, stopWarpSound } from '../core/audio.js';

export class ShipEntity {
  /**
   * @param {import('../core/EventBus.js').EventBus} eventBus 
   */
  constructor(eventBus) {
    this.bus = eventBus;
    this.shipId = 'H-M2';

    // Posição no mundo espacial
    this.x = 0;
    this.y = 0;
    this.targetX = 0;
    this.targetY = 0;

    // Rotação da proa em radianos (0 rad = apontando para o norte/topo)
    this.angle = 0;
    this.targetAngle = 0;

    this.isMoving = false;
    this.baseWidth = 90;

    // Efeito de Banking / Micro-Roll 3D ao curvar (GPU Matrix)
    this.rollAngle = 0; // graus de inclinação sobre o eixo longitudinal (-34° a +34°)
    this.targetRoll = 0;

    // Impulso de Recoil de Motores (Game Feel / Inércia de arranque de 0.15s)
    this.recoilTimer = 0;       // temporizador ativo do recoil (segundos)
    this.recoilDuration = 0.15; // duração exata da contração de inércia (0.15s)
    this.recoilY = 0;           // recuo para trás em pixels (longitudinal)
    this.recoilZ = 0;           // afundamento em profundidade 3D Z
    this.squashScaleX = 1.0;    // compressão elástica horizontal
    this.squashScaleY = 1.0;    // compressão elástica vertical

    // Estado cinemático de atracagem no hangar da estação
    this.isDocking = false;
    this.isDocked = false;
    this.dockProgress = 0; // 0 a 1
    this.dockDuration = 1.6; // segundos de desvanecimento suave
    this.opacity = 1.0;
    this.scale = 1.0;

    // Velocidade de deslocamento e rotação (em unidades por segundo)
    this.rotationSpeed = 8.0;   // radianos/segundo
    this.minSpeed = 110.0;      // velocidade de cruzeiro mínima
    this.maxSpeed = 320.0;      // pixels mundiais/segundo
    this.currentSpeed = 0;

    // Estado do Motor de Dobra Hiperespacial (Warp Drive)
    this.warpState = 'IDLE'; // 'IDLE' | 'ALIGNING' | 'IN_WARP'
    this.warpTargetX = 0;
    this.warpTargetY = 0;
    this.warpTargetName = '';
    this.warpTimer = 0;
    this.warpSpeed = 4500.0;

    // Estatísticas vitais da nave (Escudo e Casco)
    this.shieldMax = 1250;
    this.shield = 1250;
    this.hullMax = 1000;
    this.hull = 1000;
    this.flightMode = 1;

    // Garantir existência e montagem dinâmica do wrapper DOM da nave
    this._ensureDomElement();

    // Carregar último estado persistido do jogador (posição e se estava atracado)
    this._loadSavedState();

    if (this.bus) {
      this.bus.on('hangar:switch_ship', ({ shipId }) => this.applyShipSpecs(shipId));
      this.bus.on('ship:active_changed', ({ shipId }) => this.applyShipSpecs(shipId));
      this.bus.on('ship:hydrate_position', (pos) => this.hydratePosition(pos));
    }

    // Inicia som de paira na primeira interação do jogador se a nave estiver parada no espaço
    if (typeof window !== 'undefined') {
      const tryStartHover = () => {
        setTimeout(() => {
          if (!this.isMoving && !this.isDocked && !this.isDocking && this.warpState === 'IDLE') {
            startHoverSound(1.2);
          }
        }, 150);
      };
      window.addEventListener('click', tryStartHover, { once: true });
      window.addEventListener('keydown', tryStartHover, { once: true });
      window.addEventListener('pointerdown', tryStartHover, { once: true });
    }
  }

  _getPilotStorageKey() {
    try {
      const u = JSON.parse(localStorage.getItem('harpia_user') || '{}');
      if (u && (u.id || u.username)) return `harpia_ship_state_${u.id || u.username}`;
    } catch (_) {}
    return 'harpia_ship_state';
  }

  _loadSavedState() {
    try {
      const savedShip = localStorage.getItem('harpia_active_ship');
      const targetShip = (savedShip && savedShip !== 'H-M1') ? savedShip : 'H-M2';
      this.applyShipSpecs(targetShip);

      const key = this._getPilotStorageKey();
      const saved = localStorage.getItem(key) || localStorage.getItem('harpia_ship_state');
      if (saved) {
        const data = JSON.parse(saved);
        if (typeof data.x === 'number' && typeof data.y === 'number') {
          this.x = data.x;
          this.y = data.y;
          this.targetX = data.x;
          this.targetY = data.y;
        }
        if (typeof data.angle === 'number') {
          this.angle = data.angle;
          this.targetAngle = data.angle;
        }
        if (data.isDocked === true) {
          this.isDocked = true;
          this.opacity = 0;
          if (this.wrapEl) this.wrapEl.style.display = 'none';
        }
      }
    } catch (e) {
      console.warn('[ShipEntity] Failed to load persisted state:', e);
    }
    this._setThrusting(false);
  }

  _setThrusting(active) {
    if (!this.wrapEl) return;
    const thrusters = this.wrapEl.querySelectorAll('.ship-thruster-rig');
    for (const el of thrusters) {
      if (active) el.classList.add('thrusting');
      else el.classList.remove('thrusting');
    }
  }

  applyShipSpecs(shipId) {
    if (!shipId) return;
    this.shipId = shipId;
    const info = getShipInfo(shipId);
    if (info) {
      if (typeof info.hullSpan === 'number') this.baseWidth = info.hullSpan;
      if (typeof info.dockingSequence === 'number') this.dockDuration = info.dockingSequence;
      if (typeof info.cruiseVelocity === 'number') this.minSpeed = info.cruiseVelocity;
      if (typeof info.maxVelocity === 'number') this.maxSpeed = info.maxVelocity;
      if (typeof info.turnRate === 'number') this.rotationSpeed = info.turnRate;

      // Renderização e montagem 100% declarativa e dinâmica dos propulsores via schema
      this._renderThrusters(info);
      this._updateVisual(info);
    }
  }


  _ensureDomElement() {
    let wrap = document.getElementById('center-ship-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'center-ship-wrap';
      wrap.className = 'center-ship-wrap';
      const gameWorld = document.getElementById('game-world') || document.body;
      gameWorld.appendChild(wrap);
    }
    this.wrapEl = wrap;
    return wrap;
  }

  _renderThrusters(info) {
    if (!this.wrapEl) return;
    const existing = this.wrapEl.querySelectorAll('.ship-thruster-rig');
    existing.forEach(el => el.remove());

    const thrusters = (info && Array.isArray(info.thrusters) && info.thrusters.length)
      ? info.thrusters
      : [{ id: 'main', left: '50%', top: '86%', width: '18%', height: '32%', color: 'cyan', idleScale: 1.0 }];

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
      rig.dataset.thrusterId = t.id || `thruster-${i}`;
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
    });
  }

  hydratePosition(pos) {
    if (!pos || typeof pos !== 'object') return;
    if (typeof pos.x === 'number' && typeof pos.y === 'number') {
      this.x = pos.x;
      this.y = pos.y;
      this.targetX = pos.x;
      this.targetY = pos.y;
    }
    if (typeof pos.angle === 'number') {
      this.angle = pos.angle;
      this.targetAngle = pos.angle;
    }
    if (pos.isDocked === true) {
      this.isDocked = true;
      this.opacity = 0;
      if (this.wrapEl) this.wrapEl.style.display = 'none';
    }
    this._saveState();
  }

  _updateVisual(info) {
    if (!this.wrapEl) return;
    const vidEl = this.wrapEl.querySelector('#center-ship-video');
    let imgEl = this.wrapEl.querySelector('#center-ship-image');

    if (info.mediaType === 'video' && info.videoSrc) {
      if (imgEl) imgEl.style.display = 'none';
      if (vidEl) {
        vidEl.style.display = 'block';
        const source = vidEl.querySelector('source');
        if (source && !source.src.includes(info.videoSrc)) {
          source.src = info.videoSrc;
          vidEl.load();
          vidEl.play().catch(() => {});
        }
      }
    } else {
      if (vidEl) vidEl.style.display = 'none';
      if (!imgEl) {
        imgEl = document.createElement('img');
        imgEl.id = 'center-ship-image';
        imgEl.className = 'center-ship-vid center-ship-img';
        this.wrapEl.appendChild(imgEl);
      }
      imgEl.style.display = 'block';
      imgEl.src = info.imageSrc || info.thumbnail || 'assets/ships/MINING SHIPS/H-M2.png';
      imgEl.alt = info.name || 'Ship';
    }
  }

  _saveState() {
    try {
      const stateObj = JSON.stringify({
        x: Math.round(this.x),
        y: Math.round(this.y),
        angle: Number(this.angle.toFixed(3)),
        isDocked: this.isDocked
      });
      localStorage.setItem('harpia_ship_state', stateObj);
      const pilotKey = this._getPilotStorageKey();
      if (pilotKey !== 'harpia_ship_state') {
        localStorage.setItem(pilotKey, stateObj);
      }
    } catch (e) {
      // Ignorar erros de storage
    }
  }

  /**
   * Define novo destino de voo da nave
   */
  setDestination(destX, destY) {
    if (this.isDocked || this.isDocking) return;

    const prevMoving = this.isMoving;
    this.targetX = destX;
    this.targetY = destY;

    const dx = destX - this.x;
    const dy = destY - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 6) {
      // Ângulo para onde a proa deve apontar (+PI/2 para alinhar o topo do sprite com o vetor)
      const newTargetAngle = Math.atan2(dy, dx) + Math.PI / 2;

      // Dispara o Impulso de Recoil de Motores (0.15s) se a nave estava em repouso ou mudou de rumo
      let angleDiff = Math.abs(newTargetAngle - this.angle);
      while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - Math.PI * 2);

      if (!prevMoving || angleDiff > 0.35) {
        this.recoilTimer = this.recoilDuration;
      }

      this.targetAngle = newTargetAngle;
      this.isMoving = true;

      // Para o som de paira quando a nave arranca
      stopHoverSound(0.5);

      this._setThrusting(true);

      this.bus?.emit(EV.SHIP_TARGET_SET, {
        targetX: this.targetX,
        targetY: this.targetY
      });
    }
  }

  /**
   * Aciona o Motor de Dobra Hiperespacial (Warp Drive)
   * @param {number} destX Coordenada mundial X de destino
   * @param {number} destY Coordenada mundial Y de destino
   * @param {string} [destName='Destination'] Nome de exibição do destino
   */
  warpTo(destX, destY, destName = 'Destination') {
    if (this.isDocked || this.isDocking || this.warpState !== 'IDLE') return;

    const dx = destX - this.x;
    const dy = destY - this.y;
    const dist = Math.hypot(dx, dy);

    // Mínimo de 1.500m para engajar o motor de dobra
    if (dist < 1500) {
      this.setDestination(destX, destY);
      if (this.bus) {
        this.bus?.emit(EV.HUD_TOAST, {
          message: `DISTANCE TOO SHORT FOR WARP (${Math.round(dist)}m < 1500m) • Sub-light engines engaged`,
          type: 'info'
        });
      }
      return;
    }

    // Ponto de saída do salto: 350m antes do alvo para não colidir
    const dropDistance = 350;
    const targetX = destX - (dx / dist) * dropDistance;
    const targetY = destY - (dy / dist) * dropDistance;

    this.warpTargetX = targetX;
    this.warpTargetY = targetY;
    this.warpTargetName = destName;
    this.warpState = 'ALIGNING';
    this.warpTimer = 1.6; // 1.6 segundos de alinhamento sincronizado com a carga de som-warp.ogg

    // Alinha a proa para o destino
    this.targetAngle = Math.atan2(dy, dx) + Math.PI / 2;
    this.isMoving = true;

    stopHoverSound(0.4);
    playWarpChargeSound();

    if (this.bus) {
      this.bus?.emit('ship:warp_aligning', {
        targetName: destName,
        destX,
        destY,
        dist
      });
      this.bus?.emit(EV.HUD_TOAST, {
        message: `◈ WARP DRIVE CHARGING • Quantum alignment to ${destName} (${(dist / 1000).toFixed(1)} km)`,
        type: 'info'
      });
    }
  }

  /**
   * Inicia a sequência de atracagem no hangar (mergulho em profundidade e desvanecimento)
   */
  startDockingSequence(bayX, bayY) {
    if (this.isDocking || this.isDocked) return;

    this.isDocking = true;
    this.dockProgress = 0;
    stopHoverSound(0.6);
    stopWarpSound(0.2);

    // Desliga propulsores ativos para a nave abrandar suavemente
    this._setThrusting(false);

    this.bus?.emit(EV.STATION_DOCKING);
  }

  /**
   * Desatracar da estação (restaurar nave visível no espaço)
   */
  undock(exitX, exitY) {
    this.isDocked = false;
    this.isDocking = false;
    this.dockProgress = 0;
    this.opacity = 1.0;
    this.scale = 1.0;
    if (exitX !== undefined && exitY !== undefined) {
      this.x = exitX;
      this.y = exitY;
      this.targetX = exitX;
      this.targetY = exitY;
    }
    this.isMoving = false;
    this._setThrusting(false);
    if (this.wrapEl) {
      this.wrapEl.style.display = 'flex';
      this.wrapEl.style.opacity = '1';
    }
    this._saveState();
    startHoverSound(1.2);
    this.bus?.emit(EV.STATION_UNDOCK);
  }

  /**
   * Atualização de física com Delta-Time determinístico
   */
  update(dt) {
    // ── Animação Cinemática de Docking no Hangar ──
    if (this.isDocking) {
      this.dockProgress += dt / this.dockDuration;

      // Desvanecimento suave e sereno
      const p = Math.min(1.0, this.dockProgress);
      const ease = p * p * (3 - 2 * p);
      this.opacity = Math.max(0, 1.0 - ease);
      this.scale = Math.max(0.4, 1.0 - ease * 0.5);

      if (this.dockProgress >= 1.0) {
        this.isDocking = false;
        this.isDocked = true;
        this.isMoving = false;
        this.opacity = 0;
        this._setThrusting(false);
        if (this.wrapEl) this.wrapEl.style.display = 'none';

        this._saveState();
        // Dispara evento de ancoragem concluída -> abre o interior do hangar maximizado
        this.bus?.emit(EV.STATION_DOCKED);
      }
      return;
    }

    // ── Lógica de Motor de Dobra Hiperespacial (Warp Drive) ──
    if (this.warpState === 'ALIGNING') {
      let diffAngle = this.targetAngle - this.angle;
      while (diffAngle < -Math.PI) diffAngle += Math.PI * 2;
      while (diffAngle > Math.PI) diffAngle -= Math.PI * 2;
      const rotStep = (this.rotationSpeed * 1.6) * dt;
      if (Math.abs(diffAngle) < rotStep) {
        this.angle = this.targetAngle;
      } else {
        this.angle += Math.sign(diffAngle) * rotStep;
      }

      // Inclinação aerodinâmica 3D ao alinhar para warp
      const turnIntensity = Math.max(-1.0, Math.min(1.0, diffAngle / 0.45));
      const targetRoll = -turnIntensity * 34.0;
      this.rollAngle += (targetRoll - this.rollAngle) * Math.min(1.0, 10.0 * dt);

      this.warpTimer -= dt;
      if (this.warpTimer <= 0) {
        this.warpState = 'IN_WARP';
        if (this.wrapEl) this.wrapEl.classList.add('in-warp');
        this._setThrusting(true);

        playWarpEntrySound();

        if (this.bus) {
          this.bus?.emit('ship:warp_started', {
            targetName: this.warpTargetName,
            targetX: this.warpTargetX,
            targetY: this.warpTargetY
          });
          this.bus?.emit(EV.HUD_TOAST, {
            message: `✦ WARP TUNNEL OPEN • Traversing subspace at 4,500 m/s → ${this.warpTargetName}`,
            type: 'success'
          });
        }
      }
      this.bus?.emit(EV.SHIP_MOVED, { x: this.x, y: this.y, angle: this.angle });
      return;
    }

    if (this.warpState === 'IN_WARP') {
      const dx = this.warpTargetX - this.x;
      const dy = this.warpTargetY - this.y;
      const dist = Math.hypot(dx, dy);
      const step = this.warpSpeed * dt;
      this.currentSpeed = this.warpSpeed;

      if (dist <= step || dist < 30) {
        this.x = this.warpTargetX;
        this.y = this.warpTargetY;
        this.warpState = 'IDLE';
        this.isMoving = false;
        this.currentSpeed = 0;
        if (this.wrapEl) this.wrapEl.classList.remove('in-warp');
        this._setThrusting(false);

        playWarpExitSound();

        if (this.bus) {
          this.bus?.emit('ship:warp_completed', {
            targetName: this.warpTargetName,
            x: this.x,
            y: this.y
          });
          this.bus?.emit(EV.HUD_TOAST, {
            message: `◈ SUBSPACE EXIT • Emerged at ${this.warpTargetName} — Sensors recalibrating`,
            type: 'success'
          });
          this.bus?.emit(EV.SHIP_MOVED, { x: this.x, y: this.y, angle: this.angle });
        }
        this._saveState();
        startHoverSound(1.2);
        return;
      } else {
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
        this.bus?.emit(EV.SHIP_MOVED, { x: this.x, y: this.y, angle: this.angle });
        return;
      }
    }

    if (!this.isMoving || this.isDocked) return;

    // ── 0. Recoil de Motores desativado (mantém apenas o banking roll) ──
    this.recoilY = 0;
    this.recoilZ = 0;
    this.squashScaleX = 1.0;
    this.squashScaleY = 1.0;

    // 1. Rotação suave no menor arco (-PI a +PI)
    let diffAngle = this.targetAngle - this.angle;
    while (diffAngle < -Math.PI) diffAngle += Math.PI * 2;
    while (diffAngle > Math.PI) diffAngle -= Math.PI * 2;

    const rotStep = this.rotationSpeed * dt;
    const isTurning = Math.abs(diffAngle) > 0.015;

    if (Math.abs(diffAngle) < rotStep) {
      this.angle = this.targetAngle;
    } else {
      this.angle += Math.sign(diffAngle) * rotStep;
    }

    while (this.angle < -Math.PI) this.angle += Math.PI * 2;
    while (this.angle > Math.PI) this.angle -= Math.PI * 2;

    // Micro-roll e Banking 3D Acutamente Visível (até 34° de inclinação real)
    // Curva para a direita (diffAngle > 0): asa direita baixa (+roll)
    // Curva para a esquerda (diffAngle < 0): asa esquerda baixa (-roll)
    const turnSeverity = Math.min(1.0, Math.abs(diffAngle) / 0.45);
    const targetRoll = (this.isMoving && !this.isDocked && isTurning)
      ? Math.sign(diffAngle) * turnSeverity * 34.0
      : 0;

    // Entrada rápida no roll com amortecimento elástico suave ao nivelar
    const rollSpeed = Math.abs(targetRoll) > Math.abs(this.rollAngle) ? 14.0 : 8.5;
    this.rollAngle += (targetRoll - this.rollAngle) * Math.min(1.0, rollSpeed * dt);

    // 2. Prioridade de manobra: a nave vira a frente primeiro antes de disparar o propulsor
    if (Math.abs(diffAngle) > 0.85) {
      // Em rotação fechada, mantém propulsor em standby e não avança de lado
      this._setThrusting(false);
      this.currentSpeed = 0;
      return;
    }

    // Proa orientada para o destino: aciona propulsor e avança
    const activeThruster = this.wrapEl?.querySelector('.ship-thruster-rig');
    if (activeThruster && !activeThruster.classList.contains('thrusting')) {
      this._setThrusting(true);
    }

    // 3. Deslocamento suave em direção ao alvo
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 3) {
      const alignment = Math.max(0.3, Math.cos(diffAngle));
      const currentSpeed = Math.max(this.minSpeed, Math.min(this.maxSpeed, dist * 3.5)) * alignment;
      this.currentSpeed = currentSpeed;
      const step = currentSpeed * dt;

      if (step >= dist) {
        this.x = this.targetX;
        this.y = this.targetY;
        this._onArrival();
      } else {
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
      }

      this.bus?.emit(EV.SHIP_MOVED, { x: this.x, y: this.y, angle: this.angle });
    } else {
      this.x = this.targetX;
      this.y = this.targetY;
      this._onArrival();
    }
  }

  _onArrival() {
    this.isMoving = false;
    this.currentSpeed = 0;
    this.rollAngle = 0;
    this.recoilTimer = 0;
    this.recoilY = 0;
    this.recoilZ = 0;
    this.squashScaleX = 1.0;
    this.squashScaleY = 1.0;
    this._setThrusting(false);
    if (this.wrapEl) this.wrapEl.style.filter = '';
    this._saveState();
    startHoverSound(1.2);
    this.bus?.emit(EV.SHIP_ARRIVED, { x: this.x, y: this.y });
  }

  /**
   * Renderização na camada de apresentação (GPU Composited 3D Matrix)
   * @param {import('../core/Camera2D.js').Camera2D} camera 
   */
  render(camera) {
    if (!this.wrapEl) return;

    if (this.isDocked) {
      this.wrapEl.style.display = 'none';
      return;
    }
    this.wrapEl.style.display = 'flex';

    // Escala dinâmica com o zoom e com o efeito de docking
    const scaledWidth = Math.round(this.baseWidth * camera.zoomRatio * this.scale);
    this.wrapEl.style.width = scaledWidth + 'px';
    this.wrapEl.style.opacity = this.opacity.toFixed(3);

    // Ângulo de rumo em graus e Banking Roll
    const deg = Math.round(this.angle * (180 / Math.PI));
    const roll = this.rollAngle.toFixed(1);

    // Efeito de Recoil de Motores: recuo longitudinal e afundamento em profundidade 3D
    const recY = this.recoilY ? this.recoilY.toFixed(1) : '0';
    const recZ = this.recoilZ ? this.recoilZ.toFixed(1) : '0';
    const sqX = this.squashScaleX ? this.squashScaleX.toFixed(3) : '1';
    const sqY = this.squashScaleY ? this.squashScaleY.toFixed(3) : '1';

    // Inércia de Camera Shake micro-transmitida ao corpo da nave
    const shkX = camera.shakeOffsetX ? (-camera.shakeOffsetX * 0.45).toFixed(1) : '0';
    const shkY = camera.shakeOffsetY ? (-camera.shakeOffsetY * 0.45).toFixed(1) : '0';

    // MATRIZ 3D REAL (Perspective 600px + Rotação 2D + Recoil Inercial + Squash + Banking Roll no eixo Y):
    this.wrapEl.style.transform = `translate3d(calc(-50% + ${shkX}px), calc(-50% + ${shkY}px), 0) perspective(600px) rotate(${deg}deg) translate3d(0, ${recY}px, ${recZ}px) scale(${sqX}, ${sqY}) rotateY(${roll}deg)`;

    // Iluminação Especular na asa que sobe durante o banking
    const rollAbs = Math.abs(this.rollAngle);
    if (rollAbs > 1.5) {
      const rollRatio = Math.min(1.0, rollAbs / 34.0);
      const bright = (1.0 + rollRatio * 0.25).toFixed(2);
      const shadowX = (this.rollAngle * 0.45).toFixed(1);
      this.wrapEl.style.filter = `brightness(${bright}) drop-shadow(${shadowX}px 5px 22px rgba(0, 240, 255, 0.65))`;
    } else {
      this.wrapEl.style.filter = '';
    }
  }
}
