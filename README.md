# Formal Calculus v2.2 - Interactive Dynamical Systems & Verification Studio

An interactive WebAssembly-powered dynamical systems studio and engineering verification emulator built on **Formal Calculus v2.2**.

Features real-time LaTeX equation compilation, authentic Forrester stock-and-flow diagrams with physical inter-stock interactions, data-driven system identification (SINDy), Farkas lemma reachability safety certification, and machine-epsilon level-set manifold projection.

---

## 🌟 Key Features

* **Interactive LaTeX Equation Studio:** Paste arbitrary non-linear differential equations ($\dot{x} = f(x, y)$, $\dot{y} = g(x, y)$) with live KaTeX rendering and automatic dynamic parameter slider discovery.
* **Universal Forrester Stock-and-Flow Engine:** System Dynamics architecture featuring stocks with liquid fill levels, valved conduits with fluid particles, boundary cloud reservoirs, and causal feedback loops. Demonstrates direct trophic interaction where prey biomass flows into predator stocks.
* **Dual-Engine Independent Control:** Dedicated **Run / Stop / Reset** toolbars and speed controls for both the Forrester Diagram and the Phase Simulation.
* **The Formal Calculus Framework Toggle (ON / OFF):**
  * **ON (Manifold-Projected):** Uses orthogonal manifold level-set projection to collapse secular truncation drift from $\sim 10^{-8}$ down to machine epsilon ($9.99 \times 10^{-16}$) and preserves exact neutral center stability ($\text{Re}(\lambda) = 0.00\text{e}+00$).
  * **OFF (Classical RK4):** Standard unconstrained Runge-Kutta, demonstrating secular numerical drift and artificial energy dissipation.
* **SINDy Data-Driven Model Discovery:** Ingests live orbit trajectories and recovers underlying kinetic rates, stoichiometric matrices, conversion efficiencies $\eta$, and verifies zero left null-space leakage ($< 10^{-16}$) via Moore-Penrose pseudoinverse regression.
* **Farkas Lemma Safety Verifier:** Computes polynomial dual linear certificates proving whether hazardous states $(x_{\text{unsafe}}, y_{\text{unsafe}})$ are provably unreachable.
* **Multimodal Accessibility:** WCAG AAA high-contrast theme, keyboard navigation, and real-time audio sonification (audible phase frequencies and acoustic drift detuning).

---

## 🚀 Quick Start (Local Run)

The web frontend is completely self-contained with a high-performance **36 KB WebAssembly (WASM)** compute core.

### Option 1: Python
```bash
cd web
python -m http.server 8080
```
Open [http://localhost:8080](http://localhost:8080) in your browser.

### Option 2: Node.js
```bash
cd web
npx serve
```

---

## 🛠️ Building the Rust WASM Core from Source

Prerequisites: [Rust & Cargo](https://rustup.rs/) with the `wasm32-unknown-unknown` target.

```bash
cd engine
cargo build --target wasm32-unknown-unknown --release
```
The compiled binary will be located at `engine/target/wasm32-unknown-unknown/release/engine.wasm`.

---

## 📚 Mathematical Reference

* **Substrate Master Operator:**
  $$\frac{d\mathbf{x}}{dt} = \begin{bmatrix} \boldsymbol{\Delta}_{\text{res}} \\ \mathbf{0} \end{bmatrix} \mathbf{v}(\mathbf{x}) - \mathbf{\Lambda}\mathbf{x} + \mathbf{Q}_{\mathcal{M}_{\text{space}}}\mathbf{x}$$
* **Catalytic Invariance (Theorem 2.2):**
  $$\Pi_{\text{ctl}}\boldsymbol{\Delta} = \mathbf{0}$$
* **Extensive Valuation Conservation (Theorem 2.3):**
  $$\mathbf{w}_{\text{res}}^\top \boldsymbol{\Delta}_{\text{res}} = \mathbf{0}^\top \implies \operatorname{val}(\mathbf{x}') = \operatorname{val}(\mathbf{x})$$

---

## 📄 License
MIT License.
