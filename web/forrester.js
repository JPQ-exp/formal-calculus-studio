/* Dynamic Universal Forrester Stock-and-Flow Engine
   Models authentic System Dynamics with direct inter-stock interactions (Prey -> Predator trophic transfer),
   valves, cloud reservoirs, and causal feedback loops.
*/

class ForresterDiagram {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.isRunning = true;
    this.particles = [];
    this.particleTimer = 0;

    // Human-reading speed rate cache (updated at 500ms intervals)
    this.cachedDisplayRates = {
      birth: 0,
      transfer: 0,
      death: 0,
      dx: 0,
      dy: 0
    };
    this.lastDisplayUpdateTime = 0;
  }

  reset() {
    this.particles = [];
    this.particleTimer = 0;
  }

  // Update rates at human reading cadence (500ms = 2 intervals/sec)
  updateDisplayRates(rates, now) {
    if (now - this.lastDisplayUpdateTime >= 500) {
      this.lastDisplayUpdateTime = now;
      this.cachedDisplayRates = { ...rates };
    }
  }

  step(stocks, flows, dt, diagramSpeed) {
    if (!this.isRunning) return;

    this.particleTimer += dt;
    // Controlled, gentle particle emission rate (every 0.4s)
    if (this.particleTimer > 0.4) {
      this.particleTimer = 0;
      const speed = 0.0035 * Math.max(0.2, Math.min(2.5, diagramSpeed));

      // 1. Inflow to Prey Stock [X] (Births from Environment)
      if (flows.inflowX > 0.05) {
        this.particles.push({
          type: 'inflow_x',
          progress: 0,
          speed: speed,
          color: '#00d2ff'
        });
      }

      // 2. Direct Interaction / Trophic Transfer: Prey Stock [X] -> Predator Stock [Y]
      // This is the core predation interaction where prey biomass is consumed and converted!
      if (flows.transferXY > 0.05) {
        this.particles.push({
          type: 'transfer_xy',
          progress: 0,
          speed: speed,
          color: '#00f0aa'
        });
      }

      // 3. Outflow from Predator Stock [Y] (Mortality into Dissipation Sink)
      if (flows.outflowY > 0.05) {
        this.particles.push({
          type: 'outflow_y',
          progress: 0,
          speed: speed,
          color: '#ff3366'
        });
      }
    }

    // Advance particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.progress += p.speed;
      if (p.progress >= 1.0) {
        this.particles.splice(i, 1);
      }
    }
  }

  render(stocks, flows, formulas, dynamicParams, now) {
    if (!this.canvas || !this.ctx) return;
    const ctx = this.ctx;
    const w = this.canvas.width = Math.max(700, this.canvas.parentElement ? this.canvas.parentElement.clientWidth : 800);
    const h = this.canvas.height = 420;

    ctx.clearRect(0, 0, w, h);

    // Update display numbers at human reading cadence
    this.updateDisplayRates(flows, now);
    const disp = this.cachedDisplayRates;

    const stockWidth = 110;
    const stockHeight = 75;

    // Stock X (Prey) and Stock Y (Predator)
    const stockX = {
      x: w * 0.30,
      y: h * 0.58,
      w: stockWidth,
      h: stockHeight,
      name: 'Prey Stock [X]',
      val: stocks.x,
      color: '#00d2ff'
    };

    const stockY = {
      x: w * 0.70,
      y: h * 0.58,
      w: stockWidth,
      h: stockHeight,
      name: 'Predator Stock [Y]',
      val: stocks.y,
      color: '#ffb703'
    };

    // Cloud Reservoirs (Source on left, Sink on right)
    const cloudSource = { x: w * 0.08, y: h * 0.58, label: 'Environment\n(Carrying Source)' };
    const cloudSink = { x: w * 0.92, y: h * 0.58, label: 'Dissipation\n(Mortality Sink)' };

    // 3 Valves:
    // Valve 1: Birth Inflow into X
    const valveBirth = {
      x: (cloudSource.x + (stockX.x - stockX.w / 2)) / 2,
      y: h * 0.58,
      name: 'Birth Flow (Inflow)',
      rate: disp.inflowX,
      color: '#00d2ff'
    };

    // Valve 2: PREDATION INTERACTION VALVE (Directly between Stock X and Stock Y!)
    const valvePred = {
      x: (stockX.x + stockY.x) / 2,
      y: h * 0.58,
      name: 'Predation Transfer Flow',
      rate: disp.transferXY,
      color: '#00f0aa'
    };

    // Valve 3: Mortality Outflow from Y
    const valveDeath = {
      x: ((stockY.x + stockY.w / 2) + cloudSink.x) / 2,
      y: h * 0.58,
      name: 'Mortality (Outflow)',
      rate: disp.outflowY,
      color: '#ff3366'
    };

    // 1. Draw Flow Conduits (Pipes)
    // Pipe 1: Cloud -> Stock X
    this.drawPipe(ctx, cloudSource.x + 20, h * 0.58, stockX.x - stockX.w / 2, h * 0.58);
    // Pipe 2: Stock X -> Stock Y (Direct physical interaction pipe!)
    this.drawPipe(ctx, stockX.x + stockX.w / 2, h * 0.58, stockY.x - stockY.w / 2, h * 0.58);
    // Pipe 3: Stock Y -> Cloud Sink
    this.drawPipe(ctx, stockY.x + stockY.w / 2, h * 0.58, cloudSink.x - 20, h * 0.58);

    // 2. Draw Animated Flow Particles
    this.particles.forEach(p => {
      let x1, x2, y = h * 0.58;
      if (p.type === 'inflow_x') {
        x1 = cloudSource.x + 20;
        x2 = stockX.x - stockX.w / 2;
      } else if (p.type === 'transfer_xy') {
        // Particles flow directly OUT of Stock X and INTO Stock Y!
        x1 = stockX.x + stockX.w / 2;
        x2 = stockY.x - stockY.w / 2;
      } else {
        // p.type === 'outflow_y'
        x1 = stockY.x + stockY.w / 2;
        x2 = cloudSink.x - 20;
      }

      const px = x1 + (x2 - x1) * p.progress;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(px, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // 3. Draw Valves (Hourglass Bowtie ⋈)
    this.drawValve(ctx, valveBirth.x, valveBirth.y, valveBirth.name, valveBirth.rate, valveBirth.color);
    this.drawValve(ctx, valvePred.x, valvePred.y, valvePred.name, valvePred.rate, valvePred.color, true); // highlight interaction valve!
    this.drawValve(ctx, valveDeath.x, valveDeath.y, valveDeath.name, valveDeath.rate, valveDeath.color);

    // 4. Draw Stocks (Rectangles with liquid fill levels)
    this.drawStock(ctx, stockX);
    this.drawStock(ctx, stockY);

    // 5. Draw Cloud Reservoirs
    this.drawCloud(ctx, cloudSource.x, cloudSource.y, cloudSource.label);
    this.drawCloud(ctx, cloudSink.x, cloudSink.y, cloudSink.label);

    // 6. Draw Auxiliary Parameter Converters
    const paramEntries = Object.entries(dynamicParams);
    const paramCount = paramEntries.length;
    const auxY = h * 0.18;

    paramEntries.forEach(([name, val], idx) => {
      const auxX = w * (0.20 + (idx + 0.5) * (0.60 / Math.max(1, paramCount)));
      this.drawAuxiliary(ctx, auxX, auxY, `${name} = ${typeof val === 'number' ? val.toFixed(2) : val}`);

      // Feed parameters into valves
      if (name === 'alpha' || name === 'a' || name === 'A') {
        this.drawInfoLink(ctx, auxX, auxY + 14, valveBirth.x, valveBirth.y - 18);
      } else if (name === 'beta' || name === 'delta' || name === 'b' || name === 'B') {
        this.drawInfoLink(ctx, auxX, auxY + 14, valvePred.x, valvePred.y - 18);
      } else if (name === 'gamma' || name === 'g' || name === 'mu') {
        this.drawInfoLink(ctx, auxX, auxY + 14, valveDeath.x, valveDeath.y - 18);
      } else {
        this.drawInfoLink(ctx, auxX, auxY + 14, valvePred.x, valvePred.y - 18);
      }
    });

    // 7. Draw Causal Feedback Links:
    // Both Stock X and Stock Y feed into the central Predation Interaction valve!
    this.drawInfoLink(ctx, stockX.x - 20, stockX.y - stockX.h / 2, valveBirth.x + 8, valveBirth.y - 18);
    this.drawInfoLink(ctx, stockX.x + 20, stockX.y - stockX.h / 2, valvePred.x - 12, valvePred.y - 18);
    this.drawInfoLink(ctx, stockY.x - 20, stockY.y - stockY.h / 2, valvePred.x + 12, valvePred.y - 18);
    this.drawInfoLink(ctx, stockY.x + 20, stockY.y - stockY.h / 2, valveDeath.x - 8, valveDeath.y - 18);

    // Pause Watermark if stopped
    if (!this.isRunning) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = 'var(--accent-red)';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⏸ FORRESTER DIAGRAM FROZEN (STOPPED)', w / 2, 35);
    }
  }

  drawStock(ctx, s) {
    const x = s.x - s.w / 2;
    const y = s.y - s.h / 2;

    ctx.fillStyle = '#121924';
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.rect(x, y, s.w, s.h);
    ctx.fill();
    ctx.stroke();

    // Liquid Fill Level
    const fillRatio = Math.max(0.05, Math.min(0.95, (s.val - (-1)) / 7.0));
    const fillHeight = s.h * fillRatio;
    ctx.fillStyle = s.color + '26';
    ctx.beginPath();
    ctx.rect(x, y + s.h - fillHeight, s.w, fillHeight);
    ctx.fill();

    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y + s.h - fillHeight);
    ctx.lineTo(x + s.w, y + s.h - fillHeight);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(s.name, s.x, y - 8);

    ctx.fillStyle = s.color;
    ctx.font = 'bold 16px monospace';
    ctx.fillText(s.val.toFixed(2), s.x, y + s.h / 2 + 5);
  }

  drawPipe(ctx, x1, y1, x2, y2) {
    ctx.strokeStyle = '#243447';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.strokeStyle = '#0b121a';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  drawValve(ctx, x, y, name, rate, color, isHighlighted = false) {
    const size = isHighlighted ? 15 : 12;
    ctx.fillStyle = '#1c2838';
    ctx.strokeStyle = color;
    ctx.lineWidth = isHighlighted ? 2.5 : 2;

    // Bowtie
    ctx.beginPath();
    ctx.moveTo(x - size, y - size);
    ctx.lineTo(x + size, y + size);
    ctx.lineTo(x + size, y - size);
    ctx.lineTo(x - size, y + size);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Valve stem & handle
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x, y - size - 8);
    ctx.moveTo(x - 8, y - size - 8);
    ctx.lineTo(x + 8, y - size - 8);
    ctx.stroke();

    ctx.fillStyle = '#9bb0c5';
    ctx.font = (isHighlighted ? 'bold ' : '') + '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(name, x, y + size + 14);

    ctx.fillStyle = color;
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`flux: ${rate !== undefined ? rate.toFixed(2) : '0.00'}`, x, y + size + 27);
  }

  drawCloud(ctx, x, y, label) {
    ctx.fillStyle = '#172230';
    ctx.strokeStyle = '#486581';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.arc(x - 12, y, 13, 0, Math.PI * 2);
    ctx.arc(x - 9, y - 9, 15, 0, Math.PI * 2);
    ctx.arc(x + 12, y, 13, 0, Math.PI * 2);
    ctx.arc(x, y + 7, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#8fa2b8';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    const lines = label.split('\n');
    lines.forEach((l, idx) => {
      ctx.fillText(l, x, y + (idx * 11) - 4);
    });
  }

  drawAuxiliary(ctx, x, y, label) {
    ctx.fillStyle = '#162232';
    ctx.strokeStyle = '#00d2ff';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f0f4f8';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y - 16);
  }

  drawInfoLink(ctx, x1, y1, x2, y2) {
    ctx.strokeStyle = '#3a86ff66';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);

    const midY = (y1 + y2) / 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(x1, midY, x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#3a86ff';
    ctx.beginPath();
    ctx.arc(x2, y2, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
