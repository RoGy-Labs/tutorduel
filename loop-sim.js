/* The small live learner behind the opening animation: a diagonal Bayesian logistic learner per student, a clustered
   population prior learned from completed sessions, and CODuel's evidence gate. It runs on real sessions of the
   held-out-profile roster with the judge's stored click probabilities. It is a simplified stand-in for CODuel, used to
   show the mechanism; the paper's numbers come from the full method (see Results). Pure logic, no DOM: the same file
   runs in Node for checks and in the browser for the canvas. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TD_SIM = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const K = 6;
  const PAIRS = [];
  for (let a = 0; a < K; a++) for (let b = a + 1; b < K; b++) PAIRS.push([a, b]);
  const pairIndex = (a, b) => { const i = Math.min(a, b), j = Math.max(a, b); return 5 * i - (i * (i - 1)) / 2 + (j - i - 1); };
  const sigma = (z) => 1 / (1 + Math.exp(-z));
  const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const probWin = (q, a, b) => (a < b ? q.P[pairIndex(a, b)] : 1 - q.P[pairIndex(a, b)]);
  const regret = (U, a, b) => 2 * Math.max(...U) - U[a] - U[b];
  const floorQ = (U) => { const s = [...U].sort((x, y) => y - x); return s[0] - s[1]; };

  const flat = (v0) => [{ w: 1, mu: new Array(K).fill(0), var: new Array(K).fill(v0) }];
  const DEFAULTS = { v0: 2.25, optimism: 0.5, maxK: 8, birthMargin: 1.0, alpha: 4, nMin: 8, z: 0.5, varFloor: 0.09, oracle: false };

  /* A belief over one student's persona utilities: a mixture of diagonal Gaussians, reweighted by each click. */
  class Learner {
    constructor(components) {
      this.comps = components.map((c) => ({ logw: Math.log(c.w), m: c.mu.slice(), prec: c.var.map((v) => 1 / v) }));
    }
    weights() {
      const mx = Math.max(...this.comps.map((c) => c.logw));
      const ws = this.comps.map((c) => Math.exp(c.logw - mx));
      const s = ws.reduce((x, y) => x + y, 0);
      return ws.map((w) => w / s);
    }
    mean() {
      const w = this.weights(), m = new Array(K).fill(0);
      this.comps.forEach((c, k) => { for (let i = 0; i < K; i++) m[i] += w[k] * c.m[i]; });
      return m;
    }
    sd() {
      const w = this.weights(), mu = this.mean(), v = new Array(K).fill(0);
      this.comps.forEach((c, k) => { for (let i = 0; i < K; i++) v[i] += w[k] * (1 / c.prec[i] + (c.m[i] - mu[i]) ** 2); });
      return v.map(Math.sqrt);
    }
    predict(a, b) {
      const w = this.weights(); let p = 0;
      this.comps.forEach((c, k) => {
        const d = c.m[a] - c.m[b], v = 1 / c.prec[a] + 1 / c.prec[b];
        p += w[k] * sigma(d / Math.sqrt(1 + (Math.PI * v) / 8));
      });
      return Math.min(0.999, Math.max(0.001, p));
    }
    update(a, b, y) {
      this.comps.forEach((c) => {
        const d = c.m[a] - c.m[b], v = 1 / c.prec[a] + 1 / c.prec[b];
        const pk = sigma(d / Math.sqrt(1 + (Math.PI * v) / 8));
        c.logw += Math.log(y ? pk : 1 - pk);
        const p = sigma(d), h = Math.max(p * (1 - p), 0.05), g = y - p;
        c.prec[a] += h; c.prec[b] += h;
        c.m[a] += g / c.prec[a]; c.m[b] -= g / c.prec[b];
      });
    }
    select(remaining, optimism) {
      const m = this.mean(), s = this.sd();
      const bonus = remaining > 0 ? optimism : 0;
      const sc = m.map((x, i) => x + bonus * s[i]);
      const idx = [0, 1, 2, 3, 4, 5].sort((i, j) => sc[j] - sc[i]);
      return [idx[0], idx[1]];
    }
  }

  /* What recurs across students: completed users are grouped into a few types by their estimated utilities, and each
     type's component is fitted on all of its members' clicks, so the prior for a new user of that type is sharp. */
  class Population {
    constructor(opt) { this.opt = opt; this.users = []; this.clusters = []; }
    fitComponent(c) {
      const L = new Learner(flat(this.opt.v0));
      c.clicks.forEach(([a, b, y]) => L.update(a, b, y));
      const m = L.mean(), n = c.members.length;
      const centre = m.reduce((x, y) => x + y, 0) / K;
      c.mu = m.map((x) => x - centre);
      c.var = new Array(K).fill(0).map((_, i) => {
        const spread = c.members.reduce((s, u) => s + (u[i] - c.mu[i]) ** 2, 0) / n;
        return Math.max(this.opt.varFloor, 1 / L.comps[0].prec[i] + 0.5 * spread + this.opt.v0 / (n + 2));
      });
    }
    /* Assign a completed user to the type that explains their clicks best; open a new type when none beats a flat
       prior by a margin (the paper's "birth" of a component). `key` (the profile) is only used for diagnostics. */
    add(vec, clicks, key) {
      const mean = vec.reduce((a, b) => a + b, 0) / K;
      const v = vec.map((x) => x - mean);
      this.users.push(v);
      let k = -1;
      if (this.opt.oracle && key != null) {
        k = this.clusters.findIndex((c) => c.key === key);
      } else {
        const flatLL = clicks.length * Math.log(0.5);
        let best = -1, bl = -Infinity;
        this.clusters.forEach((c, i) => {
          const L = new Learner([{ w: 1, mu: c.mu, var: c.var }]);
          let ll = 0;
          clicks.forEach(([a, b, y]) => { const p = L.predict(a, b); ll += Math.log(y ? p : 1 - p); });
          if (ll > bl) { bl = ll; best = i; }
        });
        if (best >= 0 && (bl - flatLL > this.opt.birthMargin || this.clusters.length >= this.opt.maxK)) k = best;
      }
      if (k < 0) {
        this.clusters.push({ key, members: [v], clicks: clicks.slice(), mu: v.slice(), var: new Array(K).fill(this.opt.v0) });
        k = this.clusters.length - 1;
      } else {
        this.clusters[k].members.push(v);
        this.clusters[k].clicks.push(...clicks);
      }
      this.fitComponent(this.clusters[k]);
      return k;
    }
    components() {
      const n = this.users.length;
      const lam = n ? Math.max(this.opt.alpha / (this.opt.alpha + n), 0.05) : 1;
      const comps = [{ w: lam, mu: new Array(K).fill(0), var: new Array(K).fill(this.opt.v0), iso: true }];
      this.clusters.forEach((c) => comps.push({ w: (1 - lam) * c.members.length / n, mu: c.mu, var: c.var, size: c.members.length }));
      return comps;
    }
  }

  /* The whole loop: state across arrivals, and one arrival played out round by round. */
  class Loop {
    constructor(arrivals, opt = {}) {
      this.opt = Object.assign({}, DEFAULTS, opt);
      this.arrivals = arrivals;
      this.reset(1);
    }
    reset(seed) {
      this.seed = seed;
      this.rng = mulberry32(seed * 1000003 + 7);
      this.pop = new Population(this.opt);
      this.ell = [];              // per completed session: log-likelihood ratio, population learner vs no-transfer
      this.gateOpen = false;
      this.done = [];             // completed arrivals: {label, excessT, excessR, cluster}
      this.t = 0;                 // arrivals completed
      this.order = this.arrivals.map((_, i) => i);
      for (let i = this.order.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [this.order[i], this.order[j]] = [this.order[j], this.order[i]]; }
      this.clicks = 0;
    }
    gateStatus() {
      const n = this.ell.length;
      if (n < this.opt.nMin) return { open: false, n, mean: 0, se: 0 };
      const mean = this.ell.reduce((a, b) => a + b, 0) / n;
      const sd = Math.sqrt(this.ell.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, n - 1));
      const se = sd / Math.sqrt(n);
      return { open: mean > this.opt.z * se, n, mean, se };
    }
    /* Prepare the next arrival: every round is decided now, so the animation can replay it at any speed. */
    nextArrival() {
      const session = this.arrivals[this.order[this.t % this.order.length]];
      const gate = this.gateStatus();
      this.gateOpen = gate.open;
      const prior = this.pop.components();
      const T = new Learner(prior), N = new Learner(flat(this.opt.v0)), R = new Learner(flat(this.opt.v0));
      const rounds = [], clicks = [];
      let excessT = 0, excessR = 0, ell = 0;
      const B = session.qs.length;
      session.qs.forEach((q, j) => {
        const remaining = B - 1 - j;
        const acting = gate.open ? T : N;
        const before = { mean: acting.mean(), sd: acting.sd(), weights: T.weights() };
        const [a, b] = acting.select(remaining, this.opt.optimism);
        const [ra, rb] = R.select(remaining, this.opt.optimism);
        const u = this.rng();
        const p = probWin(q, a, b), y = u < p ? 1 : 0;
        const pr = probWin(q, ra, rb), yr = u < pr ? 1 : 0;
        { const pt = T.predict(a, b), pn = N.predict(a, b); ell += y ? Math.log(pt / pn) : Math.log((1 - pt) / (1 - pn)); }
        T.update(a, b, y); N.update(a, b, y); R.update(ra, rb, yr); clicks.push([a, b, y]);
        const r = regret(q.U, a, b), fl = floorQ(q.U);
        excessT += r - fl; excessR += regret(q.U, ra, rb) - fl;
        rounds.push({ j, q: q.q, U: q.U, pair: [a, b], click: y ? a : b, p: y ? p : 1 - p, r, floor: fl, excess: r - fl,
          before, after: { mean: acting.mean(), sd: acting.sd(), weights: T.weights() }, refPair: [ra, rb] });
      });
      this.current = { session, rounds, clicks, excessT, excessR, ell, gate, prior, mUser: N.mean(), index: this.t };
      return this.current;
    }
    /* Close the current arrival: store the session, refit the population, re-evaluate the gate. */
    commit() {
      const c = this.current;
      if (!c) return null;
      const cluster = this.pop.add(c.mUser, c.clicks, c.session.profile_key);
      this.ell.push(c.ell);
      this.clicks += c.rounds.length;
      this.done.push({ label: c.session.label, key: c.session.profile_key, excessT: c.excessT, excessR: c.excessR, cluster, gate: c.gate.open });
      this.t += 1;
      const g = this.gateStatus();
      this.gateOpen = g.open;
      this.current = null;
      return { cluster, gate: g };
    }
    /* Play n arrivals instantly. */
    skip(n) { for (let i = 0; i < n; i++) { this.nextArrival(); this.commit(); } }
  }

  return { Loop, Learner, Population, PAIRS, pairIndex, probWin, regret, floorQ, mulberry32, DEFAULTS };
});
