// Adapted from Wlarskog/gesture-particles, src/utils/OneEuroFilter.ts.
// Copyright (c) 2026 William Larskog. MIT: licenses/GESTURE-PARTICLES-MIT.txt.
// Type annotations removed; the original filtering algorithm is preserved.
class LowPass {
  y = 0;
  initialized = false;
  filter(value, alpha) {
    if (!this.initialized) { this.initialized = true; this.y = value; return value; }
    this.y = alpha * value + (1 - alpha) * this.y;
    return this.y;
  }
  last() { return this.y; }
  reset() { this.initialized = false; }
}
export class OneEuroFilter {
  x = new LowPass(); dx = new LowPass(); lastTime = null;
  constructor(minCutoff = 1, beta = .02, dCutoff = 1) {
    Object.assign(this, { minCutoff, beta, dCutoff });
  }
  alpha(cutoff, dt) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  filter(value, timestamp) {
    if (this.lastTime === null) {
      this.lastTime = timestamp; this.dx.filter(0, 1); return this.x.filter(value, 1);
    }
    const dt = Math.max((timestamp - this.lastTime) / 1000, 1e-4);
    this.lastTime = timestamp;
    const dValue = (value - this.x.last()) / dt;
    const edValue = this.dx.filter(dValue, this.alpha(this.dCutoff, dt));
    return this.x.filter(value, this.alpha(this.minCutoff + this.beta * Math.abs(edValue), dt));
  }
  reset() { this.x.reset(); this.dx.reset(); this.lastTime = null; }
}
