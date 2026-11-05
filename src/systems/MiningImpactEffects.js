/**
 * HARPIA Universe - MiningImpactEffects
 * Efeitos Visuais Cinematográficos de Impacto dos Lasers e Rastos de Iões dos Drones:
 * 1. Incandescência dinâmica na rocha onde o feixe toca (Heat Glow / Hotspot)
 * 2. Fagulhas incandescentes hiper-rápidas a saltar (Sparks)
 * 3. Detritos e poeira mineral a desprenderem-se da rocha (Mineral Debris)
 * 4. Rastos de Plasma de Iões (Ion Thruster Trails) atrás dos drones a 150 m/s
 */
export class MiningImpactEffects {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.particles = [];
    this.maxParticles = 140; // Otimizado a 60fps
    this.trailParticles = [];
    this.maxTrailParticles = 350; // Rastos de iões dos drones no vácuo
    this.lastTime = performance.now();

    this._initCanvas();
  }

  _initCanvas() {
    let canvas = document.getElementById('mining-impacts-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'mining-impacts-canvas';
      canvas.className = 'mining-impacts-canvas';
      
      const gameWorld = document.getElementById('game-world');
      if (gameWorld) {
        const lasersLayer = document.getElementById('mining-lasers-layer');
        if (lasersLayer && lasersLayer.nextSibling) {
          gameWorld.insertBefore(canvas, lasersLayer.nextSibling);
        } else {
          gameWorld.appendChild(canvas);
        }
      } else {
        document.body.appendChild(canvas);
      }
    }

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this._resize();

    // FIX BUG-MIE: store bound reference so we can remove it in destroy()
    // Previously an anonymous arrow was used, making removal impossible — each new
    // instance would permanently accumulate another resize listener.
    this._boundResize = () => this._resize();
    window.addEventListener('resize', this._boundResize);
  }

  _resize() {
    if (!this.canvas) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /**
   * Emite partículas e incandescência num ponto de impacto de laser
   * @param {number} x Coordenada X no ecrã
   * @param {number} y Coordenada Y no ecrã
   * @param {string} type 'ship' (laser vermelho/laranja) ou 'drone' (laser azul/branco)
   * @param {number} intensity Fator multiplicador de intensidade
   * @param {number} zoom Rácio de zoom da câmara (camera.zoomRatio) — escala partículas com o nível de zoom
   */
  emitImpact(x, y, type = 'ship', intensity = 1.0, zoom = 1.0) {
    if (!this.ctx || x < -50 || x > window.innerWidth + 50 || y < -50 || y > window.innerHeight + 50) {
      return;
    }

    // Escala de partículas proporcional ao zoom: zoom máximo (1.0) = tamanho base; zoom mínimo ≈ tamanho menor
    const zs = Math.max(0.3, Math.min(1.0, zoom));

    // 1. Gera fagulhas incandescentes a saltar (Sparks)
    const sparkCount = Math.floor((type === 'ship' ? 2 : 1) * intensity);
    for (let i = 0; i < sparkCount; i++) {
      if (this.particles.length >= this.maxParticles) break;

      const angle = Math.random() * Math.PI * 2;
      const speed = (60 + Math.random() * 120) * (type === 'ship' ? 1.0 : 0.85) * zs;

      this.particles.push({
        x: x + (Math.random() - 0.5) * 4 * zs,
        y: y + (Math.random() - 0.5) * 4 * zs,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.18 + Math.random() * 0.22,
        maxLife: 0.35,
        size: (1.0 + Math.random() * 1.8) * zs,
        type: type === 'ship' ? 'spark_ship' : 'spark_drone'
      });
    }

    // 2. Detritos e micro-poeira mineral a desprenderem-se da rocha
    if (Math.random() < 0.45 * intensity) {
      if (this.particles.length < this.maxParticles) {
        const dAngle = Math.random() * Math.PI * 2;
        const dSpeed = (15 + Math.random() * 40) * zs;
        this.particles.push({
          x: x,
          y: y,
          vx: Math.cos(dAngle) * dSpeed,
          vy: Math.sin(dAngle) * dSpeed - 10 * zs,
          life: 0.35 + Math.random() * 0.35,
          maxLife: 0.7,
          size: (1.8 + Math.random() * 2.2) * zs,
          type: 'debris'
        });
      }
    }
  }

  /**
   * Gera partículas débeis de plasma de iões (Ion Thruster Trails) atrás dos drones em voo
   * @param {Array} drones
   * @param {import('../core/Camera2D.js').Camera2D} camera
   * @param {number} dt
   */
  emitDroneTrails(drones = [], camera = null, dt = 0.016) {
    if (!drones || drones.length === 0 || !camera) return;

    for (let i = 0; i < drones.length; i++) {
      const drone = drones[i];
      if (!drone || drone.state === 'DOCKED' || !drone.domEl || drone.domEl.style.display === 'none') {
        drone._prevNozzleX = undefined;
        drone._prevNozzleY = undefined;
        continue;
      }

      // Direção da traseira do drone no sistema de coordenadas mundial
      const tailAngle = drone.angle + (Math.PI / 2);

      // Ponto de ejeção do propulsor de iões (traseira do modelo em coordenadas de mundo)
      const nozzleX = drone.x + Math.cos(tailAngle) * 15;
      const nozzleY = drone.y + Math.sin(tailAngle) * 15;

      const isHighSpeed = (drone.state === 'DEPLOYING' || drone.state === 'RETURNING_TO_UNLOAD' || drone.state === 'RECALLING');

      // Se é o primeiro frame deste drone ou mudou de posição brusca, inicializa histórico
      if (drone._prevNozzleX === undefined) {
        drone._prevNozzleX = nozzleX;
        drone._prevNozzleY = nozzleY;
      }

      // Distância percorrida desde o frame anterior
      const dX = nozzleX - drone._prevNozzleX;
      const dY = nozzleY - drone._prevNozzleY;
      const moveDist = Math.hypot(dX, dY);

      // Interpolação densa a cada 0.9 metros: elimina por completo o efeito pontilhado / código morse
      const steps = Math.min(8, Math.max(1, Math.ceil(moveDist / 0.9)));

      for (let s = 1; s <= steps; s++) {
        if (this.trailParticles.length >= this.maxTrailParticles) {
          this.trailParticles.shift();
        }

        const t = s / steps;
        const posX = drone._prevNozzleX + dX * t;
        const posY = drone._prevNozzleY + dY * t;

        // Ejeção inercial suave para trás
        const exhaustSpeed = (isHighSpeed ? 20 : 10) + Math.random() * 8;
        const vx = Math.cos(tailAngle) * exhaustSpeed;
        const vy = Math.sin(tailAngle) * exhaustSpeed;

        this.trailParticles.push({
          x: posX,
          y: posY,
          vx: vx,
          vy: vy,
          life: isHighSpeed ? (0.32 + Math.random() * 0.15) : (0.20 + Math.random() * 0.10),
          maxLife: isHighSpeed ? 0.45 : 0.28,
          size: 0.95 + Math.random() * 0.35,
          isHighSpeed: isHighSpeed
        });
      }

      drone._prevNozzleX = nozzleX;
      drone._prevNozzleY = nozzleY;
    }
  }

  /**
   * Atualiza e renderiza todos os efeitos de impacto, rastos e transferência de carga
   * @param {Array<{x: number, y: number, type: string}>} activeImpacts Pontos de laser ativos neste frame
   * @param {Array} drones Drones ativos
   * @param {import('../core/Camera2D.js').Camera2D} camera
   * @param {Array} activeTransfers Transferências ativas de minério dos drones para a nave
   */
  render(activeImpacts = [], drones = [], camera = null, activeTransfers = []) {
    if (!this.ctx || !this.canvas) return;

    const now = performance.now();
    const dt = Math.min(0.06, (now - this.lastTime) / 1000);
    this.lastTime = now;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // ── 1. Rastos de Plasma de Iões dos Drones (Ion Thruster Trails - Fininhos) ──
    this.emitDroneTrails(drones, camera, dt);

    if (this.trailParticles.length > 0 && camera) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      const zoom = camera.zoomRatio || 1.0;
      const sw = this.canvas.width;
      const sh = this.canvas.height;

      for (let i = this.trailParticles.length - 1; i >= 0; i--) {
        const tp = this.trailParticles[i];
        tp.life -= dt;
        if (tp.life <= 0) {
          this.trailParticles.splice(i, 1);
          continue;
        }

        // Movimento inercial no vácuo
        tp.x += tp.vx * dt;
        tp.y += tp.vy * dt;
        tp.vx *= 0.93;
        tp.vy *= 0.93;

        // Projeta coordenadas de mundo para o ecrã
        const sp = camera.worldToScreen(tp.x, tp.y);
        if (sp.x < -30 || sp.x > sw + 30 || sp.y < -30 || sp.y > sh + 30) {
          continue;
        }

        const progress = tp.life / tp.maxLife; // 1.0 -> 0.0
        // Raio fininho e elegante
        const radius = (tp.size * (0.85 + (1.0 - progress) * 0.75)) * zoom;
        const alpha = Math.min(1.0, progress * (tp.isHighSpeed ? 0.8 : 0.5));

        const grad = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, radius * 1.4);
        grad.addColorStop(0, `rgba(255, 255, 255, ${alpha.toFixed(2)})`);
        grad.addColorStop(0.35, `rgba(0, 212, 255, ${(alpha * 0.8).toFixed(2)})`);
        grad.addColorStop(0.7, `rgba(0, 110, 255, ${(alpha * 0.35).toFixed(2)})`);
        grad.addColorStop(1, `rgba(0, 70, 255, 0)`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, radius * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    // ── 2. Incandescência dinâmica (Heat Glow Hotspot) nos pontos de contacto dos lasers ──
    const zoom = (camera && camera.zoomRatio) ? camera.zoomRatio : 1.0;
    const zs = Math.max(0.3, Math.min(1.0, zoom));

    for (let i = 0; i < activeImpacts.length; i++) {
      const imp = activeImpacts[i];
      if (imp.x < -30 || imp.x > this.canvas.width + 30 || imp.y < -30 || imp.y > this.canvas.height + 30) {
        continue;
      }

      const isShip = imp.type === 'ship';
      // Raio do glow escalonado pelo zoom — fica menor ao fazer zoom out, maior ao fazer zoom in
      const radius = (isShip ? (9 + Math.random() * 3) : (6 + Math.random() * 2.5)) * zs;

      const grad = ctx.createRadialGradient(imp.x, imp.y, 0, imp.x, imp.y, radius);
      if (isShip) {
        grad.addColorStop(0, 'rgba(255, 255, 230, 0.95)');  // Núcleo branco incandescente
        grad.addColorStop(0.35, 'rgba(255, 90, 20, 0.85)'); // Anel laranja fogo
        grad.addColorStop(0.75, 'rgba(255, 20, 0, 0.4)');   // Aura avermelhada
        grad.addColorStop(1, 'rgba(255, 0, 0, 0)');
      } else {
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');  // Núcleo branco drone
        grad.addColorStop(0.4, 'rgba(100, 210, 255, 0.85)'); // Anel azul ciano
        grad.addColorStop(0.8, 'rgba(0, 140, 255, 0.35)');  // Aura azul
        grad.addColorStop(1, 'rgba(0, 100, 255, 0)');
      }

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(imp.x, imp.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      this.emitImpact(imp.x, imp.y, imp.type, 1.0, zoom);
    }

    // ── 3. Partículas de faíscas e detritos minerais ──
    if (this.particles.length === 0) return;

    ctx.save();
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;

      const progress = p.life / p.maxLife;

      if (p.type === 'spark_ship') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = progress > 0.6 ? '#ffffff' : (progress > 0.3 ? '#ff9933' : '#ff3300');
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * progress, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'spark_drone') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = progress > 0.6 ? '#ffffff' : '#70d4ff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * progress, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = `rgba(180, 150, 130, ${(progress * 0.75).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * progress, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // ── 4. Feixe Magnético Trator e Minério em Levitação para a Nave Mãe ──
    if (activeTransfers && activeTransfers.length > 0 && camera) {
      ctx.save();
      const zoom = camera.zoomRatio || 1.0;

      for (let i = 0; i < activeTransfers.length; i++) {
        const tr = activeTransfers[i];
        const pDrone = camera.worldToScreen(tr.droneX, tr.droneY);
        const pShip = camera.worldToScreen(tr.shipX, tr.shipY);

        const fullDx = pShip.x - pDrone.x;
        const fullDy = pShip.y - pDrone.y;
        const fullDist = Math.hypot(fullDx, fullDy);
        if (fullDist < 1) continue;

        const angle = Math.atan2(fullDy, fullDx);

        // Ponto da escotilha do porão de minério no bordo da nave mãe voltado para o drone
        const bayOffset = Math.min(24 * zoom, fullDist * 0.35);
        const bayX = pShip.x - Math.cos(angle) * bayOffset;
        const bayY = pShip.y - Math.sin(angle) * bayOffset;

        const dx = bayX - pDrone.x;
        const dy = bayY - pDrone.y;
        const beamDist = Math.hypot(dx, dy);

        // a) Escotilha Aberta e Iluminada da Baía da Nave Mãe (Glow Âmbar / Alerta)
        ctx.globalCompositeOperation = 'screen';
        const bayAura = ctx.createRadialGradient(bayX, bayY, 0, bayX, bayY, 14 * zoom);
        bayAura.addColorStop(0, 'rgba(255, 200, 50, 0.95)');
        bayAura.addColorStop(0.45, 'rgba(255, 120, 0, 0.7)');
        bayAura.addColorStop(1, 'rgba(255, 60, 0, 0)');
        ctx.fillStyle = bayAura;
        ctx.beginPath();
        ctx.arc(bayX, bayY, 14 * zoom, 0, Math.PI * 2);
        ctx.fill();

        // b) Feixe Trator de Confinamento Magnético (Cyan / Elétrico)
        // Aura externa
        ctx.beginPath();
        ctx.moveTo(pDrone.x, pDrone.y);
        ctx.lineTo(bayX, bayY);
        ctx.strokeStyle = 'rgba(0, 230, 255, 0.55)';
        ctx.lineWidth = Math.max(3, 7.5 * zoom);
        ctx.lineCap = 'round';
        ctx.stroke();

        // Linha central de alta energia
        ctx.beginPath();
        ctx.moveTo(pDrone.x, pDrone.y);
        ctx.lineTo(bayX, bayY);
        ctx.strokeStyle = 'rgba(240, 255, 255, 0.95)';
        ctx.lineWidth = Math.max(1.5, 2.4 * zoom);
        ctx.stroke();

        // c) Anéis de Confinamento Magnético ondulando ao longo do raio em direção à nave
        const ringCount = 4;
        const tOffset = (now * 0.0035) % 1.0;
        for (let r = 0; r < ringCount; r++) {
          const rProg = (tr.progress + r * 0.25 + tOffset) % 1.0;
          const rx = pDrone.x + dx * rProg;
          const ry = pDrone.y + dy * rProg;
          const ringRadius = Math.max(3, (4 + (1 - rProg) * 6) * zoom);

          ctx.beginPath();
          ctx.ellipse(rx, ry, ringRadius * 0.45, ringRadius, angle, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(0, 245, 255, ${((1 - rProg) * 0.85).toFixed(2)})`;
          ctx.lineWidth = Math.max(1, 1.6 * zoom);
          ctx.stroke();
        }

        // d) Fragmento Mineral Incandescente a Levitar para o Porão
        // Curva suave de aceleração magnética em direção à escotilha
        const easeProg = tr.progress * (2 - tr.progress); // ease-out dinâmico
        const oreX = pDrone.x + dx * easeProg;
        const oreY = pDrone.y + dy * easeProg;
        const oreRadius = Math.max(3.2, 5.5 * zoom);

        let oreGlowColor = 'rgba(255, 170, 0, 0.9)'; // ferrox (ouro)
        let oreCoreColor = '#fff3d0';
        if (tr.oreType === 'varelium') {
          oreGlowColor = 'rgba(0, 235, 255, 0.95)';
          oreCoreColor = '#e0ffff';
        } else if (tr.oreType === 'crynex') {
          oreGlowColor = 'rgba(220, 70, 255, 0.95)';
          oreCoreColor = '#fbe8ff';
        }

        const oreGrad = ctx.createRadialGradient(oreX, oreY, 0, oreX, oreY, oreRadius * 2.5);
        oreGrad.addColorStop(0, oreCoreColor);
        oreGrad.addColorStop(0.4, oreGlowColor);
        oreGrad.addColorStop(1, 'rgba(0, 210, 255, 0)');

        ctx.fillStyle = oreGrad;
        ctx.beginPath();
        ctx.arc(oreX, oreY, oreRadius * 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = oreCoreColor;
        ctx.beginPath();
        ctx.arc(oreX, oreY, oreRadius, 0, Math.PI * 2);
        ctx.fill();

        // e) Flash de captura quando o minério entra no porão da nave
        if (tr.progress > 0.75) {
          const catchAlpha = (tr.progress - 0.75) / 0.25;
          const catchGrad = ctx.createRadialGradient(bayX, bayY, 0, bayX, bayY, 20 * zoom);
          catchGrad.addColorStop(0, `rgba(255, 255, 255, ${(catchAlpha * 0.95).toFixed(2)})`);
          catchGrad.addColorStop(0.35, `rgba(0, 240, 255, ${(catchAlpha * 0.85).toFixed(2)})`);
          catchGrad.addColorStop(0.7, `rgba(255, 150, 0, ${(catchAlpha * 0.5).toFixed(2)})`);
          catchGrad.addColorStop(1, 'rgba(0, 150, 255, 0)');

          ctx.fillStyle = catchGrad;
          ctx.beginPath();
          ctx.arc(bayX, bayY, 20 * zoom, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    }
  }

  clear() {
    this.particles = [];
    this.trailParticles = [];
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  // FIX BUG-MIE: removes the persistent resize listener to prevent memory leak
  destroy() {
    if (this._boundResize) {
      window.removeEventListener('resize', this._boundResize);
      this._boundResize = null;
    }
    this.clear();
    this.canvas = null;
    this.ctx = null;
  }
}
