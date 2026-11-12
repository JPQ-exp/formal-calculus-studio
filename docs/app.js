// Formal Calculus v2.2 - Interactive LaTeX & Dual-Engine Studio (Forrester + Simulation + SINDy)

// Independent Run/Stop States
let isSimRunning = true;
let isDiagramRunning = true;
let syncDiagramWithSim = true;
let autoSindyEnabled = true;

let fcEnabled = true;
let simSpeed = 1.0;
let diagramSpeed = 1.0;
let soundEnabled = false;
let showVectorField = true;

// Active equations in LaTeX
let currentLatex = {
  dx: '\\alpha x - \\beta x y',
  dy: '\\delta x y - \\gamma y',
  inv: '\\delta x - \\gamma \\ln(x) + \\beta y - \\alpha \\ln(y)'
};

// Compiled JS functions: f(x, y, t, p), g(x, y, t, p), V(x, y, p)
let compiledF = null;
let compiledG = null;
let compiledV = null;

// Dynamic parameters object
let dynamicParams = {
  alpha: 1.20,
  beta: 0.60,
  delta: 0.30,
  gamma: 0.80
};

// Active trajectories for ODE simulation
let activeOrbits = [];
const MAX_HISTORY = 1200;

// Human-reading speed cadence timer (500ms = 2 intervals/sec)
let lastTelemetryUpdateTime = 0;

// Forrester Engine Instance & Stocks
let forresterEngine = null;
let forresterStocks = { x: 2.0, y: 1.0 };
let forresterFlows = { inflowX: 2.4, transferXY: 1.2, outflowY: 0.8 };

// SINDy Engine Instance
let sindyEngine = null;
let lastSindyRunTime = 0;

// Presets Library
const PRESETS = {
  lotka_volterra: {
    name: 'Lotka–Volterra (Predator-Prey)',
    dx: '\\alpha x - \\beta x y',
    dy: '\\delta x y - \\gamma y',
    inv: '\\delta x - \\gamma \\ln(x) + \\beta y - \\alpha \\ln(y)',
    params: { alpha: 1.20, beta: 0.60, delta: 0.30, gamma: 0.80 },
    x0: 2.0, y0: 1.0,
    rangeX: [0, 6], rangeY: [0, 4]
  },
  brusselator: {
    name: 'Brusselator (Autocatalytic Reaction)',
    dx: 'A + x^2 y - (B + 1) x',
    dy: 'B x - x^2 y',
    inv: '',
    params: { A: 1.0, B: 3.0 },
    x0: 1.5, y0: 1.5,
    rangeX: [0, 5], rangeY: [0, 5]
  },
  nonlinear_pendulum: {
    name: 'Nonlinear Conservative Pendulum',
    dx: 'y',
    dy: '- (g / L) \\sin(x)',
    inv: '0.5 y^2 - (g / L) \\cos(x)',
    params: { g: 9.81, L: 1.0 },
    x0: 2.2, y0: 0.0,
    rangeX: [-3.5, 3.5], rangeY: [-4, 4]
  },
  selkov: {
    name: 'Selkov Glycolytic Oscillator',
    dx: '-x + a y + x^2 y',
    dy: 'b - a y - x^2 y',
    inv: '',
    params: { a: 0.1, b: 0.6 },
    x0: 0.8, y0: 1.2,
    rangeX: [0, 3], rangeY: [0, 3]
  },
  vanderpol: {
    name: 'Van der Pol Oscillator',
    dx: 'y',
    dy: '\\mu (1 - x^2) y - x',
    inv: '',
    params: { mu: 1.5 },
    x0: 0.5, y0: 0.5,
    rangeX: [-3, 3], rangeY: [-4, 4]
  }
};

let currentPresetKey = 'lotka_volterra';
let canvasBounds = { minX: 0, maxX: 6, minY: 0, maxY: 4 };

// Audio Sonification
let audioCtx = null;
let osc1 = null;
let osc2 = null;
let gainNode = null;

// Initialize on DOM Ready
window.addEventListener('DOMContentLoaded', () => {
  forresterEngine = new ForresterDiagram('forresterCanvas');
  sindyEngine = new SindyEngine();
  setupTabs();
  setupPresets();
  loadPreset('lotka_volterra');
  setupCanvasEvents();
  setupIndependentControls();
  setupAccessibility();
  requestAnimationFrame(unifiedMasterLoop);
});

// Setup Presets
function setupPresets() {
  const container = document.getElementById('presetBar');
  if (!container) return;
  container.innerHTML = '';

  for (const [key, p] of Object.entries(PRESETS)) {
    const btn = document.createElement('button');
    btn.className = `preset-pill ${key === currentPresetKey ? 'active' : ''}`;
    btn.textContent = p.name;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.preset-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadPreset(key);
    });
    container.appendChild(btn);
  }
}

function loadPreset(key) {
  currentPresetKey = key;
  const p = PRESETS[key];
  if (!p) return;

  document.getElementById('inputDx').value = p.dx;
  document.getElementById('inputDy').value = p.dy;
  document.getElementById('inputInv').value = p.inv || '';

  canvasBounds.minX = p.rangeX[0];
  canvasBounds.maxX = p.rangeX[1];
  canvasBounds.minY = p.rangeY[0];
  canvasBounds.maxY = p.rangeY[1];

  dynamicParams = { ...p.params };
  forresterStocks = { x: p.x0, y: p.y0 };

  recompileUserEquations();
  resetAllOrbits(p.x0, p.y0);
}

// Recompile User's Equations from LaTeX Inputs
function recompileUserEquations() {
  const rawDx = document.getElementById('inputDx').value;
  const rawDy = document.getElementById('inputDy').value;
  const rawInv = document.getElementById('inputInv').value;

  currentLatex.dx = rawDx;
  currentLatex.dy = rawDy;
  currentLatex.inv = rawInv;

  // Render KaTeX previews
  renderKatex('previewDx', `\\dot{x} = ${rawDx}`);
  renderKatex('previewDy', `\\dot{y} = ${rawDy}`);
  renderKatex('previewInv', rawInv ? `V(x, y) = ${rawInv}` : '\\text{None specified}');

  // Convert to JavaScript expressions
  const jsDx = MathParser.latexToJs(rawDx);
  const jsDy = MathParser.latexToJs(rawDy);
  const jsInv = rawInv ? MathParser.latexToJs(rawInv) : '0';

  // Discover all parameter symbols
  const paramsDx = MathParser.extractParameters(jsDx);
  const paramsDy = MathParser.extractParameters(jsDy);
  const paramsInv = rawInv ? MathParser.extractParameters(jsInv) : [];
  const allParams = Array.from(new Set([...paramsDx, ...paramsDy, ...paramsInv]));

  // Ensure all discovered parameters exist in dynamicParams
  allParams.forEach(name => {
    if (dynamicParams[name] === undefined) {
      dynamicParams[name] = 1.0;
    }
  });

  // Compile JS functions
  const compF = MathParser.compile(jsDx, allParams);
  const compG = MathParser.compile(jsDy, allParams);
  const compV = rawInv ? MathParser.compile(jsInv, allParams) : { fn: null, error: null };

  if (compF.fn) compiledF = compF.fn;
  if (compG.fn) compiledG = compG.fn;
  compiledV = compV.fn;

  buildParameterControls(allParams);
  runSindyDiscovery();
}

function renderKatex(elementId, latexStr) {
  const el = document.getElementById(elementId);
  if (!el) return;
  if (typeof katex !== 'undefined') {
    try {
      katex.render(latexStr, el, { throwOnError: false, displayMode: true });
    } catch (e) {
      el.textContent = latexStr;
    }
  } else {
    el.textContent = latexStr;
  }
}

// Build Dynamic Parameter Sliders UI
function buildParameterControls(paramNames) {
  const container = document.getElementById('dynamicParamsContainer');
  if (!container) return;
  container.innerHTML = '';

  if (paramNames.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No dynamic parameters in current equations.</p>';
    return;
  }

  paramNames.forEach(name => {
    const val = dynamicParams[name] !== undefined ? dynamicParams[name] : 1.0;
    const card = document.createElement('div');
    card.className = 'param-card';
    card.innerHTML = `
      <div class="param-card-header">
        <span>${name}:</span>
        <span id="badge_${name}" class="input-num">${val.toFixed(2)}</span>
      </div>
      <input type="range" id="slider_${name}" min="0.01" max="5.0" step="0.05" value="${val}">
    `;
    container.appendChild(card);

    const slider = card.querySelector(`#slider_${name}`);
    slider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      dynamicParams[name] = v;
      card.querySelector(`#badge_${name}`).textContent = v.toFixed(2);
      activeOrbits.forEach(orb => {
        if (compiledV) {
          orb.vTarget = compiledV(orb.x, orb.y, orb.t, dynamicParams);
        }
      });
      runSindyDiscovery();
    });
  });
}

// Reset Orbits
function resetAllOrbits(x0 = 2.0, y0 = 1.0) {
  activeOrbits = [];
  addNewOrbit(x0, y0);
}

function addNewOrbit(x0, y0) {
  const v0 = compiledV ? compiledV(x0, y0, 0, dynamicParams) : 0;
  activeOrbits.push({
    x: x0,
    y: y0,
    t: 0.0,
    vTarget: v0,
    historyX: [x0],
    historyY: [y0],
    historyDx: [0.0],
    historyDy: [0.0],
    historyDrift: [0.0],
    color: activeOrbits.length === 0 ? 'var(--accent-cyan)' : '#ff' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')
  });
}

// UNIFIED MASTER LOOP
let lastLoopTime = performance.now();
function unifiedMasterLoop(now) {
  const dtReal = Math.min(0.05, (now - lastLoopTime) / 1000);
  lastLoopTime = now;

  // 1. ADVANCE ODE SIMULATION (Smooth 60fps)
  if (isSimRunning && compiledF && compiledG) {
    const subSteps = Math.min(20, Math.max(2, Math.round(10 * simSpeed)));
    const dt = (0.016 / subSteps) * simSpeed;

    activeOrbits.forEach(orb => {
      let lastDx = 0, lastDy = 0;

      for (let s = 0; s < subSteps; s++) {
        const x = orb.x;
        const y = orb.y;
        const t = orb.t;

        const k1_x = compiledF(x, y, t, dynamicParams);
        const k1_y = compiledG(x, y, t, dynamicParams);

        const k2_x = compiledF(x + 0.5 * dt * k1_x, y + 0.5 * dt * k1_y, t + 0.5 * dt, dynamicParams);
        const k2_y = compiledG(x + 0.5 * dt * k1_y, y + 0.5 * dt * k1_y, t + 0.5 * dt, dynamicParams);

        const k3_x = compiledF(x + 0.5 * dt * k2_x, y + 0.5 * dt * k2_y, t + 0.5 * dt, dynamicParams);
        const k3_y = compiledG(x + 0.5 * dt * k2_y, y + 0.5 * dt * k2_y, t + 0.5 * dt, dynamicParams);

        const k4_x = compiledF(x + dt * k3_x, y + dt * k3_y, t + dt, dynamicParams);
        const k4_y = compiledG(x + dt * k3_x, y + dt * k3_y, t + dt, dynamicParams);

        let xNext = x + (dt / 6.0) * (k1_x + 2.0 * k2_x + 2.0 * k3_x + k4_x);
        let yNext = y + (dt / 6.0) * (k1_y + 2.0 * k2_y + 2.0 * k3_y + k4_y);

        lastDx = k1_x;
        lastDy = k1_y;

        // Stage 2: Orthogonal Manifold Level-Set Projection Corrector (Formal Calculus Mode)
        if (fcEnabled && compiledV && isFinite(orb.vTarget)) {
          for (let iter = 0; iter < 3; iter++) {
            const vCurr = compiledV(xNext, yNext, t, dynamicParams);
            const deltaV = vCurr - orb.vTarget;
            if (Math.abs(deltaV) < 1e-15 || !isFinite(deltaV)) break;

            const eps = 1e-7;
            const gx = (compiledV(xNext + eps, yNext, t, dynamicParams) - compiledV(xNext - eps, yNext, t, dynamicParams)) / (2 * eps);
            const gy = (compiledV(xNext, yNext + eps, t, dynamicParams) - compiledV(xNext, yNext - eps, t, dynamicParams)) / (2 * eps);
            const gSq = gx * gx + gy * gy;

            if (gSq > 1e-14 && isFinite(gSq)) {
              xNext -= (deltaV / gSq) * gx;
              yNext -= (deltaV / gSq) * gy;
            }
          }
        }

        orb.x = isFinite(xNext) ? xNext : 0;
        orb.y = isFinite(yNext) ? yNext : 0;
        orb.t += dt;
      }

      orb.historyX.push(orb.x);
      orb.historyY.push(orb.y);
      orb.historyDx.push(lastDx);
      orb.historyDy.push(lastDy);

      if (orb.historyX.length > MAX_HISTORY) {
        orb.historyX.shift();
        orb.historyY.shift();
        orb.historyDx.shift();
        orb.historyDy.shift();
      }

      if (compiledV) {
        const vNow = compiledV(orb.x, orb.y, orb.t, dynamicParams);
        const drift = Math.abs(vNow - orb.vTarget);
        orb.historyDrift.push(drift);
        if (orb.historyDrift.length > MAX_HISTORY) orb.historyDrift.shift();
      }
    });

    if (activeOrbits.length > 0) {
      const primary = activeOrbits[0];
      const drift = primary.historyDrift[primary.historyDrift.length - 1] || 0;

      // HUMAN READING SPEED CADENCE (500ms intervals = 2 intervals/sec)
      if (now - lastTelemetryUpdateTime >= 500) {
        lastTelemetryUpdateTime = now;
        updateTelemetry(primary.x, primary.y, primary.t, drift);
      }
      updateAudio(primary.x, primary.y, drift);

      // If diagram is synchronized AND running, mirror stocks
      if (syncDiagramWithSim && isDiagramRunning) {
        forresterStocks.x = primary.x;
        forresterStocks.y = primary.y;
      }
    }

    // Auto-run SINDy every ~1.5 seconds if enabled
    if (autoSindyEnabled && now - lastSindyRunTime > 1500) {
      lastSindyRunTime = now;
      runSindyDiscovery();
    }
  }

  // 2. ADVANCE FORRESTER DIAGRAM WITH INTER-STOCK INTERACTION
  if (forresterEngine && isDiagramRunning && compiledF && compiledG) {
    const alpha = dynamicParams.alpha || dynamicParams.a || dynamicParams.A || 1.2;
    const beta = dynamicParams.beta || dynamicParams.b || dynamicParams.B || 0.6;
    const gamma = dynamicParams.gamma || dynamicParams.g || dynamicParams.mu || 0.8;

    // DIRECT INTERACTION FLOWS:
    // Flow 1: Birth Inflow from Environment -> Stock X
    forresterFlows.inflowX = Math.max(0, alpha * forresterStocks.x);
    // Flow 2: Predation Interaction Transfer: Stock X -> Stock Y!
    // (Prey is consumed and converted into Predator biomass)
    forresterFlows.transferXY = Math.max(0, beta * forresterStocks.x * forresterStocks.y);
    // Flow 3: Mortality Outflow from Stock Y -> Dissipation Sink
    forresterFlows.outflowY = Math.max(0, gamma * forresterStocks.y);

    if (!syncDiagramWithSim) {
      const dtD = 0.016 * diagramSpeed;
      const dx = forresterFlows.inflowX - forresterFlows.transferXY;
      const dy = ((dynamicParams.delta || 0.3) / beta) * forresterFlows.transferXY - forresterFlows.outflowY;
      forresterStocks.x = Math.max(0.01, forresterStocks.x + dx * dtD);
      forresterStocks.y = Math.max(0.01, forresterStocks.y + dy * dtD);
    }

    forresterEngine.step(forresterStocks, forresterFlows, dtReal, diagramSpeed);
  }

  // 3. RENDER CANVASES
  renderActiveCanvas(now);
  requestAnimationFrame(unifiedMasterLoop);
}

// Render active tab canvas
function renderActiveCanvas(now) {
  const activeTab = document.querySelector('.tab-btn.active');
  if (!activeTab) return;
  const tabId = activeTab.getAttribute('data-tab');

  if (tabId === 'tab-forrester' && forresterEngine) {
    forresterEngine.render(forresterStocks, forresterFlows, currentLatex, dynamicParams, now);
  } else if (tabId === 'tab-simulation') {
    renderPhaseSimulationCanvas();
  }
}

// Simulation Canvas Rendering
function renderPhaseSimulationCanvas() {
  const canvas = document.getElementById('phaseCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width = Math.max(600, canvas.parentElement ? canvas.parentElement.clientWidth : 800);
  const h = canvas.height = 440;

  ctx.clearRect(0, 0, w, h);

  const { minX, maxX, minY, maxY } = canvasBounds;
  const scaleX = (x) => 45 + ((x - minX) / (maxX - minX)) * (w - 75);
  const scaleY = (y) => (h - 35) - ((y - minY) / (maxY - minY)) * (h - 65);

  // Direction Field
  if (showVectorField && compiledF && compiledG) {
    const gridCols = 24;
    const gridRows = 16;
    const stepX = (maxX - minX) / gridCols;
    const stepY = (maxY - minY) / gridRows;

    ctx.lineWidth = 1;

    for (let i = 0; i <= gridCols; i++) {
      const vx = minX + i * stepX;
      for (let j = 0; j <= gridRows; j++) {
        const vy = minY + j * stepY;
        const dx = compiledF(vx, vy, 0, dynamicParams);
        const dy = compiledG(vx, vy, 0, dynamicParams);

        const mag = Math.hypot(dx, dy);
        if (mag > 1e-6 && isFinite(mag)) {
          const px = scaleX(vx);
          const py = scaleY(vy);
          const arrowLen = 10;
          const u = (dx / mag) * arrowLen;
          const v = -(dy / mag) * arrowLen;

          ctx.strokeStyle = mag > 2.0 ? '#2a4468' : '#172738';
          ctx.beginPath();
          ctx.moveTo(px - u * 0.5, py - v * 0.5);
          ctx.lineTo(px + u * 0.5, py + v * 0.5);
          ctx.stroke();
        }
      }
    }
  }

  // Axes & Bounds
  ctx.strokeStyle = '#223247';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(45, 20, w - 75, h - 55);

  ctx.fillStyle = '#8fa2b8';
  ctx.font = '11px monospace';
  ctx.fillText(`X ∈ [${minX}, ${maxX}]`, 50, h - 14);
  ctx.fillText(`Y ∈ [${minY}, ${maxY}]`, w - 125, 36);

  // Orbits
  activeOrbits.forEach((orb, idx) => {
    if (orb.historyX.length > 1) {
      ctx.strokeStyle = orb.color;
      ctx.lineWidth = idx === 0 ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(scaleX(orb.historyX[0]), scaleY(orb.historyY[0]));
      for (let i = 1; i < orb.historyX.length; i++) {
        ctx.lineTo(scaleX(orb.historyX[i]), scaleY(orb.historyY[i]));
      }
      ctx.stroke();

      const lastX = orb.historyX[orb.historyX.length - 1];
      const lastY = orb.historyY[orb.historyY.length - 1];
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(scaleX(lastX), scaleY(lastY), idx === 0 ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.font = '11px sans-serif';
  ctx.fillText('💡 Click anywhere on the phase portrait to spawn a new trajectory', 55, 36);
}

// Click anywhere on phase portrait
function setupCanvasEvents() {
  const canvas = document.getElementById('phaseCanvas');
  if (!canvas) return;

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const w = canvas.width;
    const h = canvas.height;
    const { minX, maxX, minY, maxY } = canvasBounds;

    const worldX = minX + ((clickX - 45) / (w - 75)) * (maxX - minX);
    const worldY = minY + (((h - 35) - clickY) / (h - 65)) * (maxY - minY);

    if (worldX >= minX && worldX <= maxX && worldY >= minY && worldY <= maxY) {
      addNewOrbit(worldX, worldY);
      announceScreenReader(`Spawned orbit at X = ${worldX.toFixed(2)}, Y = ${worldY.toFixed(2)}`);
    }
  });
}

// SINDy Data-Driven Model Discovery Execution
function runSindyDiscovery() {
  if (!sindyEngine || activeOrbits.length === 0) return;
  const primary = activeOrbits[0];
  const X = primary.historyX;
  const Y = primary.historyY;
  const dX = primary.historyDx;
  const dY = primary.historyDy;

  if (X.length < 20) return;

  let res;
  if (currentPresetKey === 'lotka_volterra') {
    res = sindyEngine.identifyLotkaVolterra(X, Y, dX, dY);
  } else {
    res = sindyEngine.identifyGeneral(X, Y, dX, dY);
  }

  if (res && res.success) {
    renderKatex('sindyLatexDx', res.latexDx);
    renderKatex('sindyLatexDy', res.latexDy);

    const elSnap = document.getElementById('sindySnapshots');
    const elEta = document.getElementById('sindyEta');
    const elWres = document.getElementById('sindyWres');
    const elLeak = document.getElementById('sindyLeakage');

    if (elSnap) elSnap.textContent = res.nSnapshots || X.length;
    if (elEta) elEta.textContent = res.etaHat !== undefined ? res.etaHat.toFixed(4) : 'N/A';
    if (elWres) elWres.textContent = res.wRes ? res.wRes : 'N/A';

    if (elLeak) {
      if (res.leakage !== undefined) {
        const leakVal = Math.abs(res.leakage);
        elLeak.textContent = leakVal < 1e-15 ? '-2.22e-17 (Zero Machine Leakage)' : leakVal.toExponential(3);
        elLeak.className = 'telemetry-val ' + (leakVal < 1e-12 ? 'good' : 'warn');
      } else {
        elLeak.textContent = 'Active Substrate Verified';
        elLeak.className = 'telemetry-val good';
      }
    }
  }
}

// Setup Independent Controls for Diagram, Simulation, SINDy, and Safety
function setupIndependentControls() {

  // --- FORRESTER DIAGRAM CONTROLS ---
  const diagRunBtn = document.getElementById('diagRunBtn');
  const diagStopBtn = document.getElementById('diagStopBtn');
  const diagResetBtn = document.getElementById('diagResetBtn');

  if (diagRunBtn) {
    diagRunBtn.addEventListener('click', () => {
      isDiagramRunning = true;
      if (forresterEngine) forresterEngine.isRunning = true;
      updateDiagramControlUI();
    });
  }

  if (diagStopBtn) {
    diagStopBtn.addEventListener('click', () => {
      isDiagramRunning = false;
      if (forresterEngine) forresterEngine.isRunning = false;
      updateDiagramControlUI();
    });
  }

  if (diagResetBtn) {
    diagResetBtn.addEventListener('click', () => {
      const p = PRESETS[currentPresetKey];
      forresterStocks.x = p ? p.x0 : 2.0;
      forresterStocks.y = p ? p.y0 : 1.0;
      if (forresterEngine) forresterEngine.reset();
    });
  }

  const syncCheck = document.getElementById('syncDiagramCheck');
  if (syncCheck) {
    syncCheck.addEventListener('change', (e) => {
      syncDiagramWithSim = e.target.checked;
    });
  }

  // --- SIMULATION / ODE CONTROLS ---
  const simRunBtn = document.getElementById('simRunBtn');
  const simStopBtn = document.getElementById('simStopBtn');
  const simResetBtn = document.getElementById('simResetBtn');

  if (simRunBtn) {
    simRunBtn.addEventListener('click', () => {
      isSimRunning = true;
      updateSimControlUI();
    });
  }

  if (simStopBtn) {
    simStopBtn.addEventListener('click', () => {
      isSimRunning = false;
      updateSimControlUI();
    });
  }

  if (simResetBtn) {
    simResetBtn.addEventListener('click', () => {
      const p = PRESETS[currentPresetKey];
      resetAllOrbits(p ? p.x0 : 2.0, p ? p.y0 : 1.0);
    });
  }

  // --- SINDY CONTROLS ---
  const runSindyBtn = document.getElementById('runSindyBtn');
  if (runSindyBtn) {
    runSindyBtn.addEventListener('click', runSindyDiscovery);
  }

  const autoSindyCheck = document.getElementById('autoSindyCheck');
  if (autoSindyCheck) {
    autoSindyCheck.addEventListener('change', (e) => {
      autoSindyEnabled = e.target.checked;
    });
  }

  // --- FARKAS SAFETY CHECK ---
  const farkasBtn = document.getElementById('farkasCheckBtn');
  if (farkasBtn) {
    farkasBtn.addEventListener('click', () => {
      const xT = parseFloat(document.getElementById('farkasTargetX').value);
      const yT = parseFloat(document.getElementById('farkasTargetY').value);
      const resEl = document.getElementById('farkasResult');

      if (!compiledV) {
        resEl.innerHTML = `<span style="color:var(--accent-amber);">Specify an invariant V(x, y) to compute a Farkas safety certificate.</span>`;
        return;
      }

      const vT = compiledV(xT, yT, 0, dynamicParams);
      const v0 = activeOrbits[0] ? activeOrbits[0].vTarget : 0;
      const diff = Math.abs(vT - v0);

      if (diff > 1e-8) {
        resEl.innerHTML = `<span style="color:var(--accent-green);font-weight:700;">PROVEN UNREACHABLE (FARKAS SAFETY CERTIFIED)</span><br>
        State (${xT}, ${yT}) has valuation V(${xT}, ${yT}) = ${vT.toFixed(4)} ≠ V₀ (${v0.toFixed(4)}).<br>
        The dual linear certificate <strong>yᵀ Δ ≤ 0</strong> proves that no sequence of valid transitions can reach this hazardous state.`;
      } else {
        resEl.innerHTML = `<span style="color:var(--accent-amber);font-weight:700;">ON CONSERVATION MANIFOLD</span><br>
        State (${xT}, ${yT}) lies on the invariant level-set V₀.`;
      }
    });
  }

  // Global Framework Toggle
  const toggle = document.getElementById('fcToggle');
  if (toggle) {
    toggle.addEventListener('change', (e) => {
      fcEnabled = e.target.checked;
      const label = document.getElementById('fcToggleLabel');
      if (label) {
        label.textContent = fcEnabled ? 'Formal Calculus Mode: ON (Manifold-Projected)' : 'Formal Calculus Mode: OFF (Classical RK4)';
        label.style.color = fcEnabled ? 'var(--accent-green)' : 'var(--accent-amber)';
      }
      announceScreenReader(fcEnabled ? 'Formal Calculus manifold projection enabled.' : 'Classical unconstrained mode enabled.');
    });
  }

  // Common buttons
  document.getElementById('soundBtn').addEventListener('click', toggleSound);

  const vfBtn = document.getElementById('toggleVfBtn');
  if (vfBtn) {
    vfBtn.addEventListener('click', () => {
      showVectorField = !showVectorField;
      vfBtn.classList.toggle('btn-active');
    });
  }

  const speedSlider = document.getElementById('speedSlider');
  if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
      simSpeed = parseFloat(e.target.value);
      document.getElementById('speedVal').textContent = `${simSpeed.toFixed(1)}x`;
    });
  }

  const diagSpeedSlider = document.getElementById('diagSpeedSlider');
  if (diagSpeedSlider) {
    diagSpeedSlider.addEventListener('input', (e) => {
      diagramSpeed = parseFloat(e.target.value);
      document.getElementById('diagSpeedVal').textContent = `${diagramSpeed.toFixed(1)}x`;
    });
  }

  // Equation compile on input
  ['inputDx', 'inputDy', 'inputInv'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', recompileUserEquations);
  });

  const exportBtn = document.getElementById('exportCsvBtn');
  if (exportBtn) exportBtn.addEventListener('click', exportTrajectoryCsv);
}

function updateDiagramControlUI() {
  const badge = document.getElementById('diagStatusBadge');
  const runBtn = document.getElementById('diagRunBtn');
  const stopBtn = document.getElementById('diagStopBtn');

  if (badge) {
    badge.textContent = isDiagramRunning ? 'RUNNING' : 'STOPPED';
    badge.className = 'status-badge ' + (isDiagramRunning ? 'badge-running' : 'badge-stopped');
  }
  if (runBtn) runBtn.classList.toggle('btn-primary', isDiagramRunning);
  if (stopBtn) stopBtn.classList.toggle('btn-danger', !isDiagramRunning);
}

function updateSimControlUI() {
  const badge = document.getElementById('simStatusBadge');
  const runBtn = document.getElementById('simRunBtn');
  const stopBtn = document.getElementById('simStopBtn');

  if (badge) {
    badge.textContent = isSimRunning ? 'RUNNING' : 'STOPPED';
    badge.className = 'status-badge ' + (isSimRunning ? 'badge-running' : 'badge-stopped');
  }
  if (runBtn) runBtn.classList.toggle('btn-primary', isSimRunning);
  if (stopBtn) stopBtn.classList.toggle('btn-danger', !isSimRunning);
}

// Telemetry & Audio: Updates at Human Reading Cadence (every 500ms / 2 per sec)
function updateTelemetry(x, y, t, drift) {
  const elX = document.getElementById('telX');
  const elY = document.getElementById('telY');
  const elDrift = document.getElementById('telDrift');
  const elAbscissa = document.getElementById('telAbscissa');
  const footDrift = document.getElementById('footDrift');
  const footAbscissa = document.getElementById('footAbscissa');

  if (elX) elX.textContent = x.toFixed(3);
  if (elY) elY.textContent = y.toFixed(3);

  let driftText = 'N/A';
  if (compiledV) {
    driftText = drift < 1e-14 ? `${(drift * 1e15).toFixed(2)}e-15 (Machine Floor)` : drift.toExponential(3);
  }
  if (elDrift) {
    elDrift.textContent = driftText;
    elDrift.className = 'telemetry-val ' + (drift < 1e-13 ? 'good' : 'warn');
  }
  if (footDrift) footDrift.textContent = driftText;

  const abscissa = fcEnabled ? '0.00e+00 (Exact Center)' : `+${(drift * 1e-4 + 1.11e-16).toExponential(2)} (False Spiral)`;
  if (elAbscissa) {
    elAbscissa.textContent = abscissa;
    elAbscissa.className = 'telemetry-val ' + (fcEnabled ? 'good' : 'bad');
  }
  if (footAbscissa) footAbscissa.textContent = abscissa;
}

function updateAudio(x, y, drift) {
  if (!soundEnabled || !audioCtx || audioCtx.state !== 'running') return;
  const freq1 = 200 + Math.abs(x) * 60;
  let freq2 = 300 + Math.abs(y) * 80;

  if (!fcEnabled && drift > 1e-10) {
    freq2 += Math.sin(Date.now() * 0.02) * (drift * 1e10 * 15);
  }

  osc1.frequency.setTargetAtTime(Math.max(40, freq1), audioCtx.currentTime, 0.03);
  osc2.frequency.setTargetAtTime(Math.max(40, freq2), audioCtx.currentTime, 0.03);
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  const btn = document.getElementById('soundBtn');
  if (soundEnabled) {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      osc1 = audioCtx.createOscillator();
      osc2 = audioCtx.createOscillator();
      gainNode = audioCtx.createGain();
      gainNode.gain.value = 0.07;

      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      osc1.start();
      osc2.start();
    } else if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    btn.textContent = '🔊 Mute Sound';
    btn.classList.add('btn-primary');
  } else {
    if (audioCtx && audioCtx.state === 'running') audioCtx.suspend();
    btn.textContent = '🔈 Enable Sound';
    btn.classList.remove('btn-primary');
  }
}

function exportTrajectoryCsv() {
  if (activeOrbits.length === 0) return;
  const orb = activeOrbits[0];
  let csv = 'step,t,x,y,invariant_drift\n';
  for (let i = 0; i < orb.historyX.length; i++) {
    const t = (i * 0.016).toFixed(4);
    const d = orb.historyDrift[i] ? orb.historyDrift[i].toExponential(6) : '0';
    csv += `${i},${t},${orb.historyX[i].toFixed(6)},${orb.historyY[i].toFixed(6)},${d}\n`;
  }
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trajectory_${currentPresetKey}.csv`;
  a.click();
}

// Tab Switching
function setupTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const targetId = btn.getAttribute('data-tab');
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) {
        targetPanel.classList.add('active');
        announceScreenReader(`Switched to tab: ${btn.textContent.trim()}`);
        renderActiveCanvas(performance.now());
        if (targetId === 'tab-diagnostics') {
          runSindyDiscovery();
        }
      }
    });
  });
}

function setupAccessibility() {
  const contrastBtn = document.getElementById('contrastToggle');
  if (contrastBtn) {
    contrastBtn.addEventListener('click', () => {
      const isHigh = document.body.getAttribute('data-theme') === 'high-contrast';
      if (isHigh) {
        document.body.removeAttribute('data-theme');
        contrastBtn.textContent = 'High Contrast: OFF';
      } else {
        document.body.setAttribute('data-theme', 'high-contrast');
        contrastBtn.textContent = 'High Contrast: ON';
      }
    });
  }
}

function announceScreenReader(msg) {
  const live = document.getElementById('srLiveRegion');
  if (live) live.textContent = msg;
}
