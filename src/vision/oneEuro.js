// One Euro filter (Casiez et al. 2012): smooth when the hand is still, responsive when it moves.
const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff) / dt)

export class OneEuro {
  constructor(minCutoff = 1.2, beta = 6, dCutoff = 1) {
    this.minCutoff = minCutoff
    this.beta = beta
    this.dCutoff = dCutoff
    this.reset()
  }
  reset() {
    this.x = null
    this.dx = 0
    this.t = null
  }
  filter(value, tMs) {
    if (this.x === null) {
      this.x = value
      this.t = tMs
      return value
    }
    const dt = Math.max(1e-3, (tMs - this.t) / 1000)
    this.t = tMs
    const rawDx = (value - this.x) / dt
    this.dx += alpha(this.dCutoff, dt) * (rawDx - this.dx)
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx)
    this.x += alpha(cutoff, dt) * (value - this.x)
    return this.x
  }
}
