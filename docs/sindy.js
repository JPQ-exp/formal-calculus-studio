/* SINDy: Sparse Identification of Nonlinear Dynamics & Formal Calculus Substrate Inversion
   References:
   1. Brunton, Proctor, Kutz (PNAS 2016)
   2. Technical Report FC-TR-2026-05, Section 2.2 & Algorithm 2 (Formal Calculus v2.2)
*/

class SindyEngine {
  constructor() {
    this.polyTerms = [
      { name: '1', fn: (x, y) => 1.0, tex: '1' },
      { name: 'x', fn: (x, y) => x, tex: 'x' },
      { name: 'y', fn: (x, y) => y, tex: 'y' },
      { name: 'x^2', fn: (x, y) => x * x, tex: 'x^2' },
      { name: 'xy', fn: (x, y) => x * y, tex: 'x y' },
      { name: 'y^2', fn: (x, y) => y * y, tex: 'y^2' },
      { name: 'x^3', fn: (x, y) => x * x * x, tex: 'x^3' },
      { name: 'x^2y', fn: (x, y) => x * x * y, tex: 'x^2 y' }
    ];
  }

  // Algorithm 2: Constrained Hypergraph Identification (Moore-Penrose Pseudoinverse)
  identifyLotkaVolterra(historyX, historyY, dX, dY) {
    const K = historyX.length;
    if (K < 15) {
      return { success: false, message: 'Need at least 15 trajectory snapshots.' };
    }

    // Dictionary: Psi = [x, xy, y]^T
    // Compute M = Psi * Psi^T (3x3 symmetric) and B = dX * Psi^T
    let m11 = 0, m12 = 0, m13 = 0, m22 = 0, m23 = 0, m33 = 0;
    let bx1 = 0, bx2 = 0, bx3 = 0;
    let by1 = 0, by2 = 0, by3 = 0;

    for (let i = 0; i < K; i++) {
      const x = historyX[i];
      const y = historyY[i];
      const xy = x * y;
      const vx = dX[i];
      const vy = dY[i];

      m11 += x * x;
      m12 += x * xy;
      m13 += x * y;
      m22 += xy * xy;
      m23 += xy * y;
      m33 += y * y;

      bx1 += vx * x;
      bx2 += vx * xy;
      bx3 += vx * y;

      by1 += vy * x;
      by2 += vy * xy;
      by3 += vy * y;
    }

    const M = [m11, m12, m13, m12, m22, m23, m13, m23, m33];
    const [a11, a12, a13, a21, a22, a23, a31, a32, a33] = M;
    const det = a11 * (a22 * a33 - a23 * a32) - a12 * (a21 * a33 - a23 * a31) + a13 * (a21 * a32 - a22 * a31);

    if (Math.abs(det) < 1e-12) {
      return { success: false, message: 'Matrix singular (insufficient trajectory diversity).' };
    }

    const inv = [
      (a22 * a33 - a23 * a32) / det, (a13 * a32 - a12 * a33) / det, (a12 * a23 - a13 * a22) / det,
      (a23 * a31 - a21 * a33) / det, (a11 * a33 - a13 * a31) / det, (a13 * a21 - a11 * a23) / det,
      (a21 * a32 - a22 * a31) / det, (a12 * a31 - a11 * a32) / det, (a11 * a22 - a12 * a21) / det
    ];

    const thetaX = [
      inv[0] * bx1 + inv[1] * bx2 + inv[2] * bx3,
      inv[3] * bx1 + inv[4] * bx2 + inv[5] * bx3,
      inv[6] * bx1 + inv[7] * bx2 + inv[8] * bx3
    ];

    const thetaY = [
      inv[0] * by1 + inv[1] * by2 + inv[2] * by3,
      inv[3] * by1 + inv[4] * by2 + inv[5] * by3,
      inv[6] * by1 + inv[7] * by2 + inv[8] * by3
    ];

    // Parameter extraction (Table 4.2 in report)
    const alphaHat = thetaX[0];
    const betaHat = -thetaX[1];
    const deltaHat = thetaY[1];
    const gammaHat = -thetaY[2];
    const etaHat = betaHat !== 0 ? deltaHat / betaHat : 1.0;

    // Left null-space leakage: w^T * Delta(:, 2) = -delta + eta * beta
    const leakage = -deltaHat + etaHat * betaHat;

    return {
      success: true,
      nSnapshots: K,
      alphaHat,
      betaHat,
      deltaHat,
      gammaHat,
      etaHat,
      leakage,
      latexDx: `\\dot{x} = ${alphaHat.toFixed(4)} x - ${betaHat.toFixed(4)} x y`,
      latexDy: `\\dot{y} = ${deltaHat.toFixed(4)} x y - ${gammaHat.toFixed(4)} y`,
      wRes: `[ ${deltaHat.toFixed(4)}, \\, ${betaHat.toFixed(4)} ]^T`,
      deltaRes: `\\begin{bmatrix} 1 & -1 \\\\ 0 & ${etaHat.toFixed(4)} \\end{bmatrix}`
    };
  }

  // General SINDy Sequential Thresholded Least Squares (STLS) for arbitrary systems
  identifyGeneral(historyX, historyY, dX, dY, threshold = 0.05) {
    const K = historyX.length;
    if (K < 20) {
      return { success: false, message: 'Need at least 20 snapshots.' };
    }

    const D = this.polyTerms.length;

    const fitActive = (activeIdx, targetVec) => {
      const p = activeIdx.length;
      if (p === 0) return {};

      const AtA = new Array(p * p).fill(0);
      const AtB = new Array(p).fill(0);

      for (let k = 0; k < K; k++) {
        const psi = this.polyTerms.map(t => t.fn(historyX[k], historyY[k]));
        for (let r = 0; r < p; r++) {
          const vr = psi[activeIdx[r]];
          AtB[r] += vr * targetVec[k];
          for (let c = 0; c < p; c++) {
            AtA[r * p + c] += vr * psi[activeIdx[c]];
          }
        }
      }

      for (let r = 0; r < p; r++) AtA[r * p + r] += 1e-8; // Tikhonov regularization

      // Solve via Gauss-Jordan
      const M = [];
      for (let i = 0; i < p; i++) {
        M[i] = [];
        for (let j = 0; j < p; j++) M[i][j] = AtA[i * p + j];
        M[i][p] = AtB[i];
      }

      for (let i = 0; i < p; i++) {
        let maxRow = i;
        for (let k = i + 1; k < p; k++) {
          if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) maxRow = k;
        }
        const tmp = M[i]; M[i] = M[maxRow]; M[maxRow] = tmp;

        if (Math.abs(M[i][i]) < 1e-12) continue;
        const pv = M[i][i];
        for (let j = i; j <= p; j++) M[i][j] /= pv;

        for (let k = 0; k < p; k++) {
          if (k !== i) {
            const factor = M[k][i];
            for (let j = i; j <= p; j++) M[k][j] -= factor * M[i][j];
          }
        }
      }

      const sol = {};
      for (let i = 0; i < p; i++) sol[activeIdx[i]] = M[i][p];
      return sol;
    };

    // STLS iterations for dx
    let activeX = Array.from({ length: D }, (_, i) => i);
    for (let it = 0; it < 3; it++) {
      const sol = fitActive(activeX, dX);
      activeX = activeX.filter(idx => Math.abs(sol[idx] || 0) > threshold);
    }
    const finalX = fitActive(activeX, dX);

    // STLS iterations for dy
    let activeY = Array.from({ length: D }, (_, i) => i);
    for (let it = 0; it < 3; it++) {
      const sol = fitActive(activeY, dY);
      activeY = activeY.filter(idx => Math.abs(sol[idx] || 0) > threshold);
    }
    const finalY = fitActive(activeY, dY);

    const formatLatex = (sol, varName) => {
      const entries = Object.entries(sol).filter(([_, c]) => Math.abs(c) > 0.01);
      if (entries.length === 0) return `\\dot{${varName}} = 0`;

      const terms = entries.map(([idx, c], i) => {
        const t = this.polyTerms[parseInt(idx)];
        const sign = c >= 0 ? (i === 0 ? '' : ' + ') : ' - ';
        const absVal = Math.abs(c).toFixed(3);
        const name = t.tex === '1' ? '' : ` ${t.tex}`;
        return `${sign}${absVal}${name}`;
      });
      return `\\dot{${varName}} = ${terms.join('')}`;
    };

    return {
      success: true,
      nSnapshots: K,
      latexDx: formatLatex(finalX, 'x'),
      latexDy: formatLatex(finalY, 'y')
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SindyEngine;
}
