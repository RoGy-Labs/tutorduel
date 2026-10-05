/* The opening animation: one lap of the loop per student, drawn live.
   Stage (canvas): a student arrives, 24 duels with the policy's belief updating on each click, the session is stored,
   the population model refits. The learner on the stage is the simplified one in loop-sim.js, run on real sessions of
   the held-out-profile roster with the judge's stored click probabilities. The regret panel on the right is the paper's
   measured curve on this roster (CODuel and the no-transfer ablation), revealed up to the current arrival. */
(() => {
  'use strict';
  const D = window.TD_DATA, SIM = window.TD_SIM;
  const root = document.querySelector('[data-loop]');
  if (!root || !D || !SIM) return;
  const canvas = root.querySelector('canvas[data-stage]');
  const ctx = canvas.getContext('2d');
  const chart = root.querySelector('canvas[data-regret]');
  const cctx = chart.getContext('2d');
  const q = (s) => root.querySelector(s);
  const hud = {
    arrival: q('[data-h-arrival]'), act: q('[data-h-act]'), question: q('[data-h-question]'), clicks: q('[data-h-clicks]'),
    sessions: q('[data-h-sessions]'), types: q('[data-h-types]'), gate: q('[data-h-gate]'), play: q('[data-l-play]'),
    speed: q('[data-l-speed]'), chips: [...root.querySelectorAll('[data-l-chip]')], skip: q('[data-l-skip]'),
    readout: q('[data-h-readout]'),
  };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PER = D.personas;
  const CURVE = D.curves.U;                   // held-out profiles: the roster the stage sessions come from
  const N_ARR = 350;
  const START_AT = 40;                        // the viewer joins a loop that has already turned a few times
  const B = 24;

  /* ---------------------------------------------------------------- acts -- */
  const ROUND = 0.84;                         // seconds per question at 1x: the duels play at half the pace of the other acts
  const ACTS = [
    { key: 'arrive', name: 'A student arrives', dur: 1.6 },
    { key: 'duel', name: '24 duels, one click each', dur: B * ROUND },
    { key: 'store', name: 'Session joins the log', dur: 1.1 },
    { key: 'update', name: 'Population model refits', dur: 1.5 },
  ];
  const STARTS = []; let TOTAL = 0;
  ACTS.forEach((a) => { STARTS.push(TOTAL); TOTAL += a.dur; });
  const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : 1 - Math.pow(1 - u, 3));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, u) => a + (b - a) * u;

  /* --------------------------------------------------------------- state -- */
  const SPEEDS = [1, 2, 4];                   // the speed button cycles through these; the page opens at the first
  const loop = new SIM.Loop(D.arrivals, {});
  let cur = null, lastCommit = null, committed = false, clock = 0, speed = SPEEDS[0], playing = !reduced, visible = true, lastAct = -1;
  let shown = { mean: new Array(6).fill(0), sd: new Array(6).fill(1) };   // what the bars currently show
  let prevPop = [], popGlyphs = [];                                         // population glyphs with animated means
  let cycleSeed = 1;

  function begin() {
    if (loop.t >= N_ARR) { cycleSeed += 1; loop.reset(cycleSeed); popGlyphs = []; }
    cur = loop.nextArrival();
    committed = false;
    clock = 0; lastAct = -1;
  }
  function commitNow() {
    if (committed) return;
    lastCommit = loop.commit(); committed = true; syncGlyphs(false);
  }
  loop.skip(START_AT - 1);
  syncGlyphs(true);
  begin();

  function syncGlyphs(snap) {
    const comps = loop.pop.components().filter((c) => !c.iso);
    comps.forEach((c, i) => {
      if (!popGlyphs[i]) popGlyphs[i] = { mu: c.mu.slice(), target: c.mu.slice(), size: c.size, born: snap ? -10 : performance.now() / 1000 };
      popGlyphs[i].target = c.mu.slice(); popGlyphs[i].size = c.size;
      if (snap) popGlyphs[i].mu = c.mu.slice();
    });
    popGlyphs.length = comps.length;
  }

  /* -------------------------------------------------------------- colors -- */
  let C = {};
  function applyTheme() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    C = { fg: v('--fg'), muted: v('--muted'), line: v('--line'), lineS: v('--line-strong'), panel: v('--panel'), panel2: v('--panel-2'),
      accent: v('--accent'), accentSoft: v('--accent-soft'), blue: v('--blue'), blueSoft: v('--blue-soft'), gray: v('--c-notransfer') };
  }
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* -------------------------------------------------------------- sizing -- */
  let W = 0, H = 0, CW = 0, CH = 0;
  function resize() {
    const r = canvas.parentNode.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    // Only the drawing buffers are sized here; the CSS sizes both canvases to their containers, so a canvas never
    // keeps a width measured in another layout (the HUD is full width below 900px and 300px beside the stage above).
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c = chart.parentNode.getBoundingClientRect();
    CW = c.width; CH = 150;
    chart.width = Math.round(CW * dpr); chart.height = Math.round(CH * dpr);
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  if (window.ResizeObserver) { const ro = new ResizeObserver(resize); ro.observe(canvas.parentNode); ro.observe(chart.parentNode); }

  /* ------------------------------------------------------------- helpers -- */
  function rr(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function label(txt, x, y, col, size, align, weight) {
    ctx.font = `${weight || 500} ${size || 10.5}px "IBM Plex Mono", ui-monospace, Menlo, monospace`;
    ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = col; ctx.fillText(txt, x, y);
  }
  function text(txt, x, y, col, size, align, weight, family) {
    ctx.font = `${weight || 400} ${size}px ${family || '"IBM Plex Sans", system-ui, sans-serif'}`;
    ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = col; ctx.fillText(txt, x, y);
  }
  function wrap(txt, maxW, size, lines) {
    ctx.font = `400 ${size}px "IBM Plex Sans", system-ui, sans-serif`;
    const words = txt.split(' '), out = []; let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; if (out.length === lines) break; } else line = t;
    }
    if (out.length < lines && line) out.push(line);
    if (out.length === lines && words.join(' ') !== out.join(' ')) out[lines - 1] = out[lines - 1].replace(/\s*\S*$/, '') + ' …';
    return out;
  }
  function arrow(x1, y1, x2, y2, col, dashed, on) {
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = on ? 2 : 1.2;
    if (dashed) { ctx.setLineDash([5, 5]); ctx.lineDashOffset = on ? -clock * 26 : 0; }
    ctx.beginPath(); ctx.moveTo(x1, y1); const mx = (x1 + x2) / 2; ctx.bezierCurveTo(mx, y1, mx, y2, x2, y2); ctx.stroke();
    ctx.setLineDash([]);
    const ang = x2 >= x1 ? 0 : Math.PI;
    ctx.translate(x2, y2); ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-6, -3.2); ctx.lineTo(-6, 3.2); ctx.closePath();
    ctx.fillStyle = col; ctx.fill(); ctx.restore();
  }
  const sig = (z) => 1 / (1 + Math.exp(-z));
  const relative = (m) => { const mu = m.reduce((a, b) => a + b, 0) / 6; return m.map((x) => sig(1.1 * (x - mu))); };

  /* ------------------------------------------------------------ geometry -- */
  function geom() {
    const left = Math.min(190, W * 0.26);
    return { left, sx: left + 22, sw: W - left - 36, qy: 30, qh: 62, by0: 126, by1: Math.min(H - 118, 368), fy: H - 66 };
  }

  /* --------------------------------------------------------- left column -- */
  function drawLeft(act, u) {
    const g = geom();
    const cx = g.left / 2;
    const gateOn = cur ? cur.gate.open : loop.gateOpen;
    // population model: one glyph per learned type (top left, the policy's memory)
    const py = 36, gh = 30;
    const types = popGlyphs.length, show = Math.min(types, 4);
    const gw = Math.min(34, (g.left - 28) / Math.max(1, show) - 4);
    label(`POPULATION MODEL · ${types} ${types === 1 ? 'TYPE' : 'TYPES'}`, 14, 18, C.muted, 9.5);
    for (let i = 0; i < show; i++) {
      const gl = popGlyphs[i], x = 14 + i * (gw + 4);
      const born = clamp((performance.now() / 1000 - gl.born) * 2, 0, 1);
      ctx.save(); ctx.globalAlpha = 0.35 + 0.65 * born;
      rr(x, py, gw, gh, 3); ctx.fillStyle = C.panel2; ctx.fill();
      const rel = relative(gl.mu), bw = (gw - 8) / 6;
      rel.forEach((v, k) => { ctx.fillStyle = C.blue; ctx.fillRect(x + 4 + k * bw, py + gh - 3 - v * (gh - 8), bw - 1, v * (gh - 8)); });
      text(`${gl.size}`, x + gw / 2, py + gh + 9, C.muted, 9, 'center');
      ctx.restore();
    }
    if (types > 4) text(`+${types - 4}`, 14 + show * (gw + 4) + 2, py + gh / 2, C.muted, 10);
    if (!types) text('nothing learned yet', 14, py + gh / 2, C.muted, 10);
    // prior arrow: population -> stage header
    const on0 = act === 0 && gateOn;
    arrow(14 + show * (gw + 4) + 6, py + gh / 2, g.sx - 6, 52, gateOn ? C.blue : C.lineS, true, on0);
    label(gateOn ? 'prior' : 'no prior', g.sx - 10, 42, gateOn ? C.blue : C.muted, 9.5, 'right');
    // the arriving student (middle), with the queue above
    label('ARRIVALS', 14, 112, C.muted, 9.5);
    for (let i = 3; i >= 1; i--) {
      const y = 132 + (3 - i) * 18;
      ctx.beginPath(); ctx.arc(cx, y, 5, 0, 6.2832); ctx.fillStyle = C.lineS; ctx.globalAlpha = 0.35 + 0.2 * (3 - i); ctx.fill(); ctx.globalAlpha = 1;
    }
    const slide = act === 0 ? ease(u * 1.4) : 1;
    const cy = lerp(190, 232, slide), r = 20;
    const leaving = act === 2 ? ease(u) : act === 3 ? 1 : 0;
    ctx.save();
    ctx.globalAlpha = 1 - leaving;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fillStyle = C.panel; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = C.accent; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy - 5, 6, 0, 6.2832); ctx.fillStyle = C.accent; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy + 14, 11, Math.PI, 0); ctx.fill();
    text(`student ${committed ? loop.t : loop.t + 1}`, cx, cy + 34, C.fg, 11.5, 'center', 600);
    const ly = cy + 52;
    rr(cx - 5, ly - 2, 10, 8, 2); ctx.fillStyle = C.muted; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, ly - 3, 3.5, Math.PI, 0); ctx.lineWidth = 1.5; ctx.strokeStyle = C.muted; ctx.stroke();
    text('preferences hidden', cx, ly + 14, C.muted, 10, 'center');
    ctx.restore();
    // completed sessions (bottom)
    const sy = H - 62;
    label(`COMPLETED SESSIONS · ${loop.t}`, 14, sy - 16, C.muted, 9.5);
    for (let i = 2; i >= 0; i--) { rr(cx - 26 + i * 3, sy + i * 4, 52, 26, 4); ctx.fillStyle = C.panel; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = C.lineS; ctx.stroke(); }
    if (loop.t > 0) { ctx.fillStyle = C.lineS; for (let k = 0; k < 3; k++) ctx.fillRect(cx - 16, sy + 7 + k * 6, 30 - k * 8, 2); }
    // store arrow: stage -> stack
    const on2 = act === 2;
    arrow(g.sx - 6, g.by1 + 46, cx + 32, sy + 12, on2 ? C.fg : C.lineS, true, on2);
    label('store', (g.sx + cx + 32) / 2 + 6, (g.by1 + 46 + sy + 12) / 2 - 10, on2 ? C.fg : C.muted, 9.5, 'center');
    // refit arrow: stack -> population model, up the left edge
    const on3 = act === 3;
    ctx.save(); ctx.strokeStyle = on3 ? C.blue : C.lineS; ctx.lineWidth = on3 ? 2 : 1.2; ctx.setLineDash([5, 5]); ctx.lineDashOffset = on3 ? -clock * 26 : 0;
    ctx.beginPath(); ctx.moveTo(cx - 30, sy + 12); ctx.bezierCurveTo(4, sy + 12, 4, py + 60, 8, py + gh + 24); ctx.stroke(); ctx.setLineDash([]);
    ctx.translate(8, py + gh + 22); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-3.2, 6); ctx.lineTo(3.2, 6); ctx.closePath(); ctx.fillStyle = on3 ? C.blue : C.lineS; ctx.fill();
    ctx.restore();
    // the stored card flies from the stage into the stack
    if (act === 2 && cur) {
      const e = ease(u);
      const x0 = g.sx + g.sw / 2, y0 = (g.by0 + g.by1) / 2, x1 = cx, y1 = sy + 12;
      const x = lerp(x0, x1, e), y = lerp(y0, y1, e) - Math.sin(e * Math.PI) * 40, w = lerp(240, 52, e), h = lerp(78, 26, e);
      rr(x - w / 2, y - h / 2, w, h, 6); ctx.fillStyle = C.panel; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = C.accent; ctx.stroke();
      if (e < 0.8) {
        ctx.save(); ctx.globalAlpha = 1 - e / 0.8;
        text(`student ${committed ? loop.t : loop.t + 1} · 24 pairs and clicks`, x, y - 20, C.fg, 11, 'center', 600);
        text('profile, revealed to you only:', x, y - 3, C.muted, 10, 'center');
        text(wrap(cur.session.label, w - 20, 10.5, 1)[0] || '', x, y + 15, C.accent, 10.5, 'center', 500);
        ctx.restore();
      }
    }
  }

  /* --------------------------------------------------------------- stage -- */
  function roundState(u) {
    const j = Math.min(B - 1, Math.floor(u * B));
    const ur = u * B - j;
    return { j, ur, r: cur.rounds[j] };
  }
  function drawStage(act, u) {
    const g = geom();
    rr(g.sx - 12, 8, g.sw + 24, H - 16, 12); ctx.lineWidth = 1.2; ctx.strokeStyle = C.line; ctx.stroke();
    const head = act === 1 ? 'ONLINE · ONE CLICK PER QUESTION · THE POLICY SEES NEITHER THE PROFILE NOR THE UTILITIES'
      : act === 0 ? (cur.gate.open ? 'ARRIVE · BELIEF STARTS FROM THE POPULATION PRIOR' : 'ARRIVE · BELIEF STARTS FLAT (GATE CLOSED)')
      : act === 2 ? 'STORE · THE SESSION JOINS THE COMPLETED LOG' : 'UPDATE · TYPES REFIT ON ALL COMPLETED SESSIONS';
    label(head, g.sx, 20, C.muted, 9.5);
    let rs = null;
    if (act === 1) rs = roundState(u);
    const r = rs ? rs.r : cur.rounds[act === 0 ? 0 : B - 1];
    const fade = act === 2 ? 1 - ease(u * 1.6) : act === 3 ? 0 : act === 0 ? ease((u - 0.45) / 0.5) : 1;
    // question
    if (fade > 0) {
      ctx.save(); ctx.globalAlpha = fade;
      rr(g.sx, g.qy + 10, g.sw, g.qh, 6); ctx.fillStyle = C.panel2; ctx.fill();
      label(act === 1 ? `QUESTION ${rs.j + 1} / 24` : act === 0 ? 'QUESTION 1 / 24' : 'QUESTION 24 / 24', g.sx + 12, g.qy + 24, C.muted, 9.5);
      const lines = wrap(r.q, g.sw - 24, 12.5, 2);
      lines.forEach((ln, i) => text(ln, g.sx + 12, g.qy + 42 + i * 16, C.fg, 12.5));
      ctx.restore();
    }
    // belief bars: interpolate within the round
    let mean, sd;
    if (act === 0) { const e = ease((u - 0.3) / 0.6); mean = r.before.mean.map((m) => m * e); sd = r.before.sd.map((s) => lerp(Math.sqrt(loop.opt.v0), s, e)); }
    else if (act === 1) { const e = ease((rs.ur - 0.62) / 0.38); mean = r.before.mean.map((m, i) => lerp(m, r.after.mean[i], e)); sd = r.before.sd.map((s, i) => lerp(s, r.after.sd[i], e)); }
    else { mean = r.after.mean; sd = r.after.sd; }
    const rel = relative(mean), relHi = relative(mean.map((m, i) => m + sd[i])), relLo = relative(mean.map((m, i) => m - sd[i]));
    const cols = 6, gap = 14, bw = (g.sw - gap * (cols - 1)) / cols, base = g.by1, top = g.by0 + 14, hgt = base - top;
    const inPair = (i) => rs && (r.pair[0] === i || r.pair[1] === i);
    const clicked = rs && rs.ur >= 0.36;
    const best = r.U.indexOf(Math.max(...r.U));
    for (let i = 0; i < cols; i++) {
      const x = g.sx + i * (bw + gap);
      // frame for the shown pair
      if (act === 1 && inPair(i)) {
        rr(x - 6, top - 26, bw + 12, hgt + 54, 8); ctx.fillStyle = C.accentSoft; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = C.accent; ctx.stroke();
        label(r.pair[0] === i ? 'SHOWN FIRST' : 'SHOWN SECOND', x + bw / 2, top - 15, C.accent, 8.5, 'center');
      }
      // true utility (hidden from the policy): hollow bar
      ctx.save(); ctx.globalAlpha = Math.max(0.25, fade);
      ctx.setLineDash([3, 3]); ctx.lineWidth = 1.2; ctx.strokeStyle = i === best ? C.blue : C.lineS;
      ctx.strokeRect(x + 2, base - r.U[i] * hgt, bw - 4, r.U[i] * hgt); ctx.setLineDash([]);
      ctx.restore();
      // belief
      const h = rel[i] * hgt;
      ctx.fillStyle = act === 1 && inPair(i) ? C.accent : C.gray;
      ctx.globalAlpha = act >= 2 ? 0.45 : 0.9; ctx.fillRect(x + bw * 0.22, base - h, bw * 0.56, h); ctx.globalAlpha = 1;
      // whisker
      ctx.strokeStyle = C.fg; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.moveTo(x + bw / 2, base - relLo[i] * hgt); ctx.lineTo(x + bw / 2, base - relHi[i] * hgt); ctx.stroke(); ctx.globalAlpha = 1;
      // name
      text(PER[i].short, x + bw / 2, base + 14, C.fg, 11, 'center', 500);
      // click mark
      if (act === 1 && clicked && r.click === i) {
        const pulse = clamp((rs.ur - 0.36) / 0.5, 0, 1);
        ctx.beginPath(); ctx.arc(x + bw / 2, base - h - 14, 6 + pulse * 18, 0, 6.2832); ctx.strokeStyle = C.accent; ctx.globalAlpha = 0.5 * (1 - pulse); ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(x + bw / 2, base - h - 14, 8, 0, 6.2832); ctx.fillStyle = C.accent; ctx.fill();
        text('✓', x + bw / 2, base - h - 14, C.panel, 10, 'center', 700);
      }
      if (i === best && (act >= 2 || (act === 1 && clicked))) label('BEST', x + bw / 2, base - r.U[i] * hgt - 8 - (r.click === i && act === 1 ? 20 : 0), C.blue, 8.5, 'center');
    }
    // legend
    const ly = base + 32;
    ctx.fillStyle = C.gray; ctx.fillRect(g.sx, ly - 4, 10, 8); text("policy's belief", g.sx + 15, ly, C.muted, 10);
    ctx.setLineDash([3, 3]); ctx.strokeStyle = C.lineS; ctx.strokeRect(g.sx + 112, ly - 4, 10, 8); ctx.setLineDash([]); text('true utility, hidden', g.sx + 127, ly, C.muted, 10);
    ctx.fillStyle = C.accent; ctx.fillRect(g.sx + 250, ly - 4, 10, 8); text('shown pair', g.sx + 265, ly, C.muted, 10);
    // footer: what happened this round
    const fy = g.fy;
    if (act === 1) {
      const m = Math.max(...r.U);
      if (clicked) {
        text(`The student chose ${PER[r.click].name} (judge probability ${(r.p * 100).toFixed(0)}%).`, g.sx, fy, C.fg, 12, 'left', 500);
        label(`strong regret r = (${m.toFixed(2)} − ${r.U[r.pair[0]].toFixed(2)}) + (${m.toFixed(2)} − ${r.U[r.pair[1]].toFixed(2)}) = ${r.r.toFixed(2)}   ·   floor ${r.floor.toFixed(2)}`, g.sx, fy + 20, C.muted, 10);
      } else {
        text(`Showing ${PER[r.pair[0]].name} and ${PER[r.pair[1]].name}.`, g.sx, fy, C.fg, 12, 'left', 500);
        label('waiting for the click …', g.sx, fy + 20, C.muted, 10);
      }
      const done = cur.rounds.slice(0, rs.j + (clicked ? 1 : 0)).reduce((s, x) => s + x.excess, 0);
      label(`excess so far ${done.toFixed(2)}`, g.sx + g.sw, fy, C.muted, 10, 'right');
    } else if (act === 0) {
      text(cur.gate.open ? `Prior: a mixture of ${popGlyphs.length} user types learned from ${loop.t} completed sessions.` : `Prior: flat. The gate keeps transfer off until ${loop.opt.nMin} sessions show it predicts clicks better.`, g.sx, fy, C.fg, 12, 'left', 500);
      label(`student ${loop.t + 1} · ${cur.session.qs.length} questions`, g.sx, fy + 20, C.muted, 10);
    } else if (act === 2) {
      text(`Session complete: excess regret ${cur.excessT.toFixed(2)} over 24 questions.`, g.sx, fy, C.fg, 12, 'left', 500);
      label(`the record keeps the pairs and clicks, not the profile`, g.sx, fy + 20, C.muted, 10);
    } else {
      const born = lastCommit && lastCommit.cluster === popGlyphs.length - 1 && popGlyphs[popGlyphs.length - 1] && popGlyphs[popGlyphs.length - 1].size === 1;
      text(born ? `New type opened: student ${loop.t}'s clicks fit no existing type.` : `Student ${loop.t} joined type ${lastCommit ? lastCommit.cluster + 1 : '?'} of ${popGlyphs.length}; that type refits on all its members' clicks.`, g.sx, fy, C.fg, 12, 'left', 500);
      const gs = loop.gateStatus();
      label(`gate: ${gs.n} sessions, mean log-likelihood ratio ${gs.mean.toFixed(2)} ± ${gs.se.toFixed(2)} → transfer ${gs.open ? 'ON' : 'OFF'}`, g.sx, fy + 20, gs.open ? C.blue : C.muted, 10);
    }
  }

  /* ------------------------------------------------------- regret panel -- */
  function drawChart() {
    const t = Math.max(1, Math.min(N_ARR, loop.t + 1));
    cctx.clearRect(0, 0, CW, CH);
    const L = 30, R = 10, T = 12, Bm = 24;
    const lo = 3, hi = 5.5;
    const x = (i) => L + ((i - 1) / (N_ARR - 1)) * (CW - L - R);
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (CH - T - Bm);
    cctx.strokeStyle = C.line; cctx.lineWidth = 1;
    [3, 4, 5].forEach((v) => { cctx.beginPath(); cctx.moveTo(L, y(v)); cctx.lineTo(CW - R, y(v)); cctx.stroke(); cctx.fillStyle = C.muted; cctx.font = '9.5px "IBM Plex Mono", monospace'; cctx.textAlign = 'right'; cctx.textBaseline = 'middle'; cctx.fillText(String(v), L - 6, y(v)); });
    cctx.textAlign = 'center'; cctx.textBaseline = 'alphabetic';
    [1, 100, 200, 300].forEach((a) => cctx.fillText(String(a), x(a), CH - 8));
    const series = [['no_transfer', C.gray, 1.4], ['coduel', C.accent, 2.2]];
    for (const [k, col, lw] of series) {
      const d = CURVE[k]; if (!d) continue;
      // band
      cctx.beginPath();
      for (let i = 1; i <= t; i++) { const px = x(i), py = y(clamp(d.hi[i - 1], lo, hi)); i === 1 ? cctx.moveTo(px, py) : cctx.lineTo(px, py); }
      for (let i = t; i >= 1; i--) cctx.lineTo(x(i), y(clamp(d.lo[i - 1], lo, hi)));
      cctx.closePath(); cctx.fillStyle = col; cctx.globalAlpha = 0.14; cctx.fill(); cctx.globalAlpha = 1;
      cctx.beginPath(); cctx.strokeStyle = col; cctx.lineWidth = lw; cctx.lineJoin = 'round';
      for (let i = 1; i <= t; i++) { const px = x(i), py = y(clamp(d.mean[i - 1], lo, hi)); i === 1 ? cctx.moveTo(px, py) : cctx.lineTo(px, py); }
      cctx.stroke();
      cctx.beginPath(); cctx.arc(x(t), y(clamp(d.mean[t - 1], lo, hi)), 3.2, 0, 6.2832); cctx.fillStyle = col; cctx.fill();
    }
    cctx.strokeStyle = C.lineS; cctx.setLineDash([3, 3]); cctx.beginPath(); cctx.moveTo(x(t), T); cctx.lineTo(x(t), CH - Bm); cctx.stroke(); cctx.setLineDash([]);
    if (hud.readout) {
      const c = CURVE.coduel.mean[t - 1], n = CURVE.no_transfer.mean[t - 1];
      hud.readout.innerHTML = `<span><b style="color:var(--accent)">CODuel</b> ${c.toFixed(2)}</span><span><b>no transfer</b> ${n.toFixed(2)}</span><span>${(100 * (n - c) / n).toFixed(0)}% lower</span>`;
    }
  }

  /* ----------------------------------------------------------------- hud -- */
  function updateHud(act, u) {
    if (act !== lastAct) {
      lastAct = act;
      hud.act.textContent = ACTS[act].name;
      hud.chips.forEach((c, i) => c.setAttribute('aria-current', String(i === act)));
      root.dataset.phase = ACTS[act].key;
    }
    hud.arrival.textContent = `arrival t = ${committed ? loop.t : loop.t + 1} of ${N_ARR}`;
    const j = act === 1 ? Math.min(B, Math.floor(u * B) + 1) : act === 0 ? 0 : B;
    hud.question.textContent = `${j} / ${B}`;
    hud.clicks.textContent = (loop.clicks + (committed ? 0 : act === 1 ? Math.max(0, j - (roundState(u).ur < 0.36 ? 1 : 0)) : act === 0 ? 0 : B)).toLocaleString('en-US');
    hud.sessions.textContent = String(loop.t);
    hud.types.textContent = String(popGlyphs.length);
    const gateOn = cur ? cur.gate.open : loop.gateOpen;
    hud.gate.textContent = gateOn ? 'on' : 'off';
    hud.gate.dataset.on = String(gateOn);
  }

  /* ---------------------------------------------------------------- loop -- */
  function draw(act, u) {
    ctx.clearRect(0, 0, W, H);
    drawLeft(act, u);
    drawStage(act, u);
    drawChart();
  }
  let last = 0, raf = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (!W) resize();
    if (!W) return;
    if (playing && visible) {
      clock += dt * speed;
      if (clock >= TOTAL) { commitNow(); begin(); }
    }
    // glyphs ease toward their refit means
    popGlyphs.forEach((gl) => { gl.mu = gl.mu.map((m, i) => lerp(m, gl.target[i], Math.min(1, dt * 4))); });
    let act = 0;
    for (let i = ACTS.length - 1; i >= 0; i--) if (clock >= STARTS[i]) { act = i; break; }
    const u = clamp((clock - STARTS[act]) / ACTS[act].dur, 0, 1);
    if (act === 3) commitNow();          // the session is stored before the population refits
    draw(act, u);
    updateHud(act, u);
  }

  /* ------------------------------------------------------------ controls -- */
  function setPlaying(v) { playing = v; hud.play.setAttribute('aria-label', v ? 'Pause' : 'Play'); hud.play.textContent = v ? '❚❚' : '▶'; root.dataset.playing = String(v); }
  hud.play.addEventListener('click', () => setPlaying(!playing));
  hud.speed.addEventListener('click', () => { speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]; hud.speed.textContent = `${speed}×`; });
  hud.chips.forEach((chip, i) => chip.addEventListener('click', () => { clock = STARTS[i] + 0.001; lastAct = -1; setPlaying(true); }));
  if (hud.skip) hud.skip.addEventListener('click', () => {
    commitNow(); loop.skip(24); syncGlyphs(true); begin(); setPlaying(true);
  });
  if (window.IntersectionObserver) new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { threshold: 0.15 }).observe(root);

  root._td = { jump: (s) => { clock = s; lastAct = -1; }, STARTS, ACTS };
  resize();
  setPlaying(!reduced);
  if (reduced) {
    clock = STARTS[1] + ACTS[1].dur * 0.52;      // one still, mid-duel
    const u = 0.52; draw(1, u); updateHud(1, u);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { resize(); draw(1, u); });
  }
  raf = requestAnimationFrame(frame);
})();
