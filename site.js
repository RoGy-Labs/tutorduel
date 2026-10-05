/* TutorDuel site: the session player, the learning-curve chart, and the leaderboard.
   Everything is drawn from window.TD_DATA (data.js), generated from the paper's result files. No libraries. */
(() => {
  'use strict';
  const D = window.TD_DATA;
  if (!D) return;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f2 = (x) => Number(x).toFixed(2);
  const svgNS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, text) => {
    const n = document.createElementNS(svgNS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text != null) n.textContent = text;
    return n;
  };
  const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /* ------------------------------------------------------------ session player */
  const PER = D.personas;
  const TAGS = ['definitions, claims, proofs', 'one or two worked examples', 'leading questions, idea last',
    'plain words and an analogy', 'bullet summary under 90 words', 'numbered steps, encouragement'];
  const PAIRS = [];
  for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) PAIRS.push([a, b]);
  const regret = (U, a, b) => 2 * Math.max(...U) - U[a] - U[b];
  const floorQ = (U) => { const s = [...U].sort((x, y) => y - x); return s[0] - s[1]; };
  const randQ = (U) => PAIRS.reduce((s, [a, b]) => s + regret(U, a, b), 0) / PAIRS.length;
  const bestFixed = (qs) => {
    let best = null;
    for (const [a, b] of PAIRS) {
      const t = qs.reduce((s, q) => s + regret(q.U, a, b), 0);
      if (!best || t < best.t) best = { a, b, t };
    }
    return best;
  };

  const play = $('[data-play]');
  if (play) {
    const ui = {
      students: $('[data-students]', play), round: $('[data-round]', play), qid: $('[data-qid]', play),
      question: $('[data-question]', play), personas: $('[data-personas]', play), show: $('[data-show]', play),
      hint: $('[data-hint]', play), result: $('[data-result]', play), done: $('[data-done]', play),
      profile: $('[data-profile-text]', play), peek: $('[data-peek]', play), score: $('[data-score]', play),
      tally: $('[data-tally]', play), chart: $('[data-minichart]', play), auto: $('[data-auto]', play),
      restart: $('[data-restart]', play),
    };
    const S = { student: 0, t: 0, picked: [], history: [], revealed: false, peek: false };
    const session = () => D.sessions[S.student];
    const qs = () => session().questions;
    const B = 24;
    // One uniform draw per round, fixed by the arrival and the round, as in the benchmark's matched randomness.
    const draw = (t) => mulberry32(session().arrival * 7919 + t * 104729 + 17)();

    const refs = () => {
      const Q = qs();
      const bf = bestFixed(Q);
      return {
        rand: Q.map((q) => randQ(q.U)), floor: Q.map((q) => floorQ(q.U)),
        bf, bfPer: Q.map((q) => regret(q.U, bf.a, bf.b)),
      };
    };
    let R = refs();

    const cum = (arr, n) => arr.slice(0, n).reduce((s, x) => s + x, 0);
    const totals = () => {
      const n = S.history.length;
      const mine = S.history.reduce((s, h) => s + h.r, 0);
      const rand = cum(R.rand, n), floor = cum(R.floor, n), bf = cum(R.bfPer, n);
      const score = rand - floor > 1e-9 ? 100 * (rand - mine) / (rand - floor) : null;
      return { n, mine, rand, floor, bf, score };
    };
    const scoreOf = (total, n) => {
      const rand = cum(R.rand, n), floor = cum(R.floor, n);
      return rand - floor > 1e-9 ? 100 * (rand - total) / (rand - floor) : null;
    };

    function renderStudents() {
      ui.students.replaceChildren(...D.sessions.map((s, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = `Student ${String.fromCharCode(65 + i)}`;
        b.setAttribute('aria-pressed', String(i === S.student));
        b.title = s.label;
        b.addEventListener('click', () => { S.student = i; reset(); });
        return b;
      }));
    }

    function renderPersonas() {
      const q = qs()[S.t];
      const best = q ? q.U.indexOf(Math.max(...q.U)) : -1;
      const last = S.history[S.history.length - 1];
      ui.personas.replaceChildren(...PER.map((p, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'persona';
        const on = S.picked.includes(i);
        b.setAttribute('aria-pressed', String(on));
        b.disabled = S.revealed || S.t >= B;
        let tag = '';
        if (S.revealed && last) {
          if (i === last.click) tag = '<span class="tag chosen">chosen</span>';
          else if (i === best) tag = '<span class="tag best">best</span>';
          if (i === best && i === last.click) tag = '<span class="tag chosen">chosen · best</span>';
        }
        b.innerHTML = `${tag}<b>${esc(p.name)}</b><span>${esc(TAGS[i])}</span>`;
        b.addEventListener('click', () => pick(i));
        return b;
      }));
    }

    function renderQuestion() {
      const q = qs()[S.t];
      ui.round.textContent = S.t < B ? `Question ${S.t + 1} of ${B}` : `Session complete`;
      ui.qid.textContent = q ? `question id ${q.qid}` : '';
      ui.question.textContent = q ? q.question : 'All 24 questions answered.';
      ui.show.disabled = S.picked.length !== 2 || S.revealed || S.t >= B;
      if (S.t >= B) ui.hint.textContent = '';
      else if (S.revealed) ui.hint.textContent = '';
      else ui.hint.textContent = S.picked.length === 2
        ? `${PER[S.picked[0]].short} is shown first, ${PER[S.picked[1]].short} second.`
        : 'Pick two personas. The first one you pick is shown first.';
    }

    function renderProfile() {
      const s = session();
      ui.profile.textContent = s.profile;
      ui.profile.dataset.hidden = String(!S.peek);
      ui.peek.textContent = S.peek ? 'Hide' : 'Peek';
    }

    function renderTally() {
      const T = totals();
      ui.score.textContent = T.score == null ? '–' : Math.round(T.score);
      const bfScore = scoreOf(T.bf, T.n);
      const rows = [
        ['you', 'You', T.mine - T.floor, T.score, true],
        ['rand', 'Random pairs (expected)', T.rand - T.floor, T.n ? 0 : null, false],
        ['bf', 'Best fixed pair, hindsight', T.bf - T.floor, bfScore, false],
        ['fl', 'Distinct-pair floor', 0, T.n ? 100 : null, false],
      ];
      ui.tally.innerHTML = `<div class="head">after ${T.n} of ${B}</div><div class="head" style="text-align:right">excess</div><div class="head" style="text-align:right">score</div>` +
        rows.map(([k, name, ex, sc, you]) =>
          `<div class="${you ? 'you' : ''}" style="display:contents"><dt>${name}</dt><dd>${T.n ? f2(ex) : '–'}</dd><dd class="sc">${sc == null ? '–' : Math.round(sc)}</dd></div>`).join('');
      renderChart();
    }

    function renderChart() {
      const svg = ui.chart;
      const W = 300, H = 150, L = 30, Rr = 10, Tp = 10, Bm = 22;
      svg.replaceChildren();
      const randAll = R.rand.map((x, i) => x - R.floor[i]);
      const yMax = Math.max(0.5, randAll.reduce((s, x) => s + x, 0));
      const x = (t) => L + (t / B) * (W - L - Rr);
      const y = (v) => H - Bm - (v / yMax) * (H - Tp - Bm);
      svg.append(el('line', { x1: L, x2: W - Rr, y1: y(0), y2: y(0), class: 'ax' }));
      svg.append(el('line', { x1: L, x2: L, y1: y(0), y2: y(yMax), class: 'ax' }));
      svg.append(el('text', { x: L - 4, y: y(0) + 3, 'text-anchor': 'end' }, '0'));
      svg.append(el('text', { x: L - 4, y: y(yMax) + 8, 'text-anchor': 'end' }, yMax.toFixed(1)));
      svg.append(el('text', { x: W - Rr, y: H - 6, 'text-anchor': 'end' }, 'question 24'));
      const path = (vals, cls) => {
        let acc = 0; const pts = [`${x(0).toFixed(1)},${y(0).toFixed(1)}`];
        vals.forEach((v, i) => { acc += v; pts.push(`${x(i + 1).toFixed(1)},${y(acc).toFixed(1)}`); });
        svg.append(el('polyline', { points: pts.join(' '), class: cls }));
        return acc;
      };
      path(randAll, 'rand');
      path(R.bfPer.map((x, i) => x - R.floor[i]), 'bf');
      const n = S.history.length;
      if (n) path(S.history.map((h, i) => h.r - R.floor[i]), 'you');
    }

    function renderResult() {
      const last = S.history[S.history.length - 1];
      if (!S.revealed || !last) { ui.result.hidden = true; ui.result.replaceChildren(); return; }
      const q = qs()[last.t];
      const U = q.U, m = Math.max(...U), best = U.indexOf(m);
      const g1 = m - U[last.a], g2 = m - U[last.b];
      const pc = Math.round(100 * (last.click === last.a ? last.p : 1 - last.p));
      const bars = U.map((u, i) => {
        const cls = ['bar', (i === last.a || i === last.b) ? 'shown' : '', i === best ? 'best' : ''].join(' ');
        return `<div class="${cls}"><em>${f2(u)}</em><i style="--h:${(u * 100).toFixed(1)}%"></i><span>${esc(PER[i].short)}</span></div>`;
      }).join('');
      const ans = (i, first) => `<div class="answer ${i === last.click ? 'chosen' : ''}"><h4>${first ? 'Shown first' : 'Shown second'} · ${esc(PER[i].name)}${i === last.click ? ' · chosen' : ''}</h4><pre>${esc(q.answers[i])}</pre></div>`;
      ui.result.innerHTML = `
        <p class="verdict">The student chose <b>${esc(PER[last.click].name)}</b>. Under the judge's stored probabilities this choice had a ${pc}% chance.
        ${best === last.click ? 'That is also this question’s best persona for this student.' : `The best persona here was <b>${esc(PER[best].name)}</b>, which you did not show.`}</p>
        <div class="bars">${bars}</div>
        <div class="keyline"><span><i class="shown"></i>shown</span><span><i class="best"></i>best for this student</span><span><i></i>other personas</span><span>hidden utility U ∈ [0, 1]</span></div>
        <div class="regret-line">strong regret r = (${f2(m)} − ${f2(U[last.a])}) + (${f2(m)} − ${f2(U[last.b])}) = ${f2(last.r)}<br>
          floor on this question = ${f2(R.floor[last.t])} · random pairs expect ${f2(R.rand[last.t])}</div>
        <details class="plain"><summary>Read the two answers the student compared</summary><div class="answers-grid">${ans(last.a, true)}${ans(last.b, false)}</div></details>
        <div class="stage-actions"><button class="btn primary" data-next>${last.t + 1 < B ? 'Next question' : 'See the session summary'}</button></div>`;
      ui.result.hidden = false;
      $('[data-next]', ui.result).addEventListener('click', next);
    }

    const OURS = D.table.rows.find((r) => r.kind === 'ours'), ALONE = D.table.rows.find((r) => r.kind === 'ablation');
    function renderDone() {
      if (S.t < B) { ui.done.hidden = true; return; }
      const T = totals();
      const autoN = S.history.filter((h) => h.auto).length;
      const bfScore = scoreOf(T.bf, B);
      ui.done.innerHTML = `<b>Session complete.</b> Your score for this student: <b>${Math.round(T.score)}</b>.
        Random pairs score 0; the best fixed pair for this student, chosen in hindsight, scores ${Math.round(bfScore)}.
        ${autoN ? `Random pairs played the last ${autoN} rounds.` : ''}
        On the full roster, 350 such students with no knowledge carried over from development, ${esc(OURS.name)} scores ${OURS.U[2]} and learning each student alone scores ${ALONE.U[2]}.`;
      ui.done.hidden = false;
    }

    function renderAll() { renderQuestion(); renderPersonas(); renderResult(); renderTally(); renderDone(); renderProfile(); }

    function pick(i) {
      if (S.revealed || S.t >= B) return;
      const k = S.picked.indexOf(i);
      if (k >= 0) S.picked.splice(k, 1);
      else { S.picked.push(i); if (S.picked.length > 2) S.picked.shift(); }
      renderQuestion(); renderPersonas();
    }

    function playRound(a, b, auto) {
      const q = qs()[S.t];
      const p = q.P[a][b];                       // probability that the first-shown answer is chosen
      const click = draw(S.t) < p ? a : b;
      S.history.push({ t: S.t, a, b, click, p, r: regret(q.U, a, b), auto: !!auto });
    }

    function show() {
      if (S.picked.length !== 2 || S.revealed) return;
      playRound(S.picked[0], S.picked[1], false);
      S.revealed = true;
      renderAll();
    }

    function next() {
      S.t += 1; S.picked = []; S.revealed = false;
      renderAll();
      if (S.t < B) ui.question.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function autoplay() {
      if (S.revealed) { S.t += 1; S.picked = []; S.revealed = false; }
      const rng = mulberry32(session().arrival * 31 + S.t * 7 + 3);
      while (S.t < B) {
        const [a, b] = PAIRS[Math.floor(rng() * PAIRS.length)];
        const flip = rng() < 0.5;
        playRound(flip ? b : a, flip ? a : b, true);
        S.t += 1;
      }
      renderAll();
    }

    function reset() {
      S.t = 0; S.picked = []; S.history = []; S.revealed = false; R = refs();
      renderStudents(); renderAll();
    }

    ui.show.addEventListener('click', show);
    ui.auto.addEventListener('click', autoplay);
    ui.restart.addEventListener('click', reset);
    ui.peek.addEventListener('click', () => { S.peek = !S.peek; renderProfile(); });
    reset();
  }

  /* ------------------------------------------------------------ persona cards */
  const pc = $('[data-persona-cards]');
  if (pc) {
    pc.innerHTML = PER.map((p, i) => `
      <div class="col">
        <span class="k">persona ${i + 1}</span>
        <h3>${esc(p.name)}</h3>
        <p>${esc(TAGS[i])}</p>
        <details class="plain"><summary>System prompt</summary><div class="inner">${esc(p.prompt)}</div></details>
      </div>`).join('');
  }

  /* ------------------------------------------------------------ learning curves */
  const cv = $('[data-curves]');
  if (cv) {
    const svg = $('svg', cv), legend = $('[data-legend]', cv), readout = $('[data-readout]', cv), cap = $('[data-curve-caption]', cv);
    const tabs = $$('[data-roster]', cv);
    const ORDER = ['coduel', 'no_transfer', 'coldb', 'coldb_lr', 'colstim', 'rucb', 'pooled', 'metats', 'hierts'];
    const CLS = { coduel: 'm-coduel', no_transfer: 'm-notransfer', coldb: 'm-coldb', coldb_lr: 'm-coldblr', colstim: 'm-colstim', rucb: 'm-rucb', pooled: 'm-pooled',
      metats: 'm-metats', hierts: 'm-hierts' };
    const BAND = new Set(['coduel', 'no_transfer']);
    // Last-quarter excess regret per user, the method relative to no transfer (% lower; paper/generated/tab_phases.tex).
    const FINAL = D.final_quarter;
    const SEEDS = D.table.seeds;
    const NAME = D.curve_methods.coduel;
    let roster = 'U';
    const on = new Set(ORDER);
    let hover = null;

    legend.replaceChildren(...ORDER.map((m) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = CLS[m]; b.setAttribute('aria-pressed', 'true');
      b.innerHTML = `<i></i>${esc(D.curve_methods[m])}`;
      b.addEventListener('click', () => { on.has(m) ? on.delete(m) : on.add(m); b.setAttribute('aria-pressed', String(on.has(m))); draw(); });
      return b;
    }));
    tabs.forEach((t) => t.addEventListener('click', () => {
      roster = t.dataset.roster; tabs.forEach((u) => u.setAttribute('aria-pressed', String(u === t))); draw();
    }));

    const nice = (lo, hi) => {
      const span = hi - lo, step = span > 3 ? 1 : span > 1.5 ? 0.5 : 0.25;
      return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step };
    };

    function draw() {
      const data = D.curves[roster];
      const width = Math.max(320, Math.round(svg.getBoundingClientRect().width || 800));
      const height = width < 560 ? 300 : 380;
      const L = 46, Rr = 18, T = 16, Bm = 44;
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.replaceChildren();
      const N = 350;
      let lo = Infinity, hi = -Infinity;
      for (const m of ORDER) {
        if (!on.has(m) || !data[m]) continue;
        const d = data[m];
        const vals = BAND.has(m) ? d.lo.concat(d.hi) : d.mean;
        for (const v of vals) { if (v < lo) lo = v; if (v > hi) hi = v; }
      }
      if (!isFinite(lo)) { lo = 3; hi = 6; }
      const sc = nice(lo - 0.1, hi + 0.1);
      const x = (i) => L + ((i - 1) / (N - 1)) * (width - L - Rr);
      const y = (v) => T + (1 - (v - sc.lo) / (sc.hi - sc.lo)) * (height - T - Bm);
      for (let v = sc.lo; v <= sc.hi + 1e-9; v += sc.step) {
        svg.append(el('line', { x1: L, x2: width - Rr, y1: y(v), y2: y(v), class: 'grid' }));
        svg.append(el('text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end' }, v.toFixed(sc.step < 1 ? 2 : 1).replace(/\.?0+$/, '')));
      }
      [1, 50, 100, 150, 200, 250, 300, 350].forEach((a) => {
        if (width < 560 && a % 100 !== 0 && a !== 1) return;
        svg.append(el('line', { x1: x(a), x2: x(a), y1: height - Bm, y2: height - Bm + 4, class: 'axis' }));
        svg.append(el('text', { x: x(a), y: height - Bm + 16, 'text-anchor': 'middle' }, String(a)));
      });
      svg.append(el('line', { x1: L, x2: width - Rr, y1: height - Bm, y2: height - Bm, class: 'axis' }));
      svg.append(el('text', { x: (L + width - Rr) / 2, y: height - 8, 'text-anchor': 'middle' }, 'user arrival'));
      svg.append(el('text', { x: 0, y: 0, transform: `translate(12 ${(T + height - Bm) / 2}) rotate(-90)`, 'text-anchor': 'middle' }, 'excess strong regret per user'));
      const line = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i + 1).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
      for (const m of ORDER) {
        if (!on.has(m) || !data[m] || !BAND.has(m)) continue;
        const d = data[m];
        const up = d.hi.map((v, i) => `${i ? 'L' : 'M'}${x(i + 1).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
        const down = d.lo.map((v, i) => `L${x(i + 1).toFixed(1)} ${y(v).toFixed(1)}`).reverse().join(' ');
        svg.append(el('path', { d: `${up} ${down} Z`, class: `band ${CLS[m]}` }));
      }
      for (const m of [...ORDER].reverse()) {
        if (!on.has(m) || !data[m]) continue;
        svg.append(el('path', { d: line(data[m].mean), class: `line ${CLS[m]} ${m === 'coduel' ? 'em' : ''}` }));
      }
      if (hover) {
        const i = hover;
        svg.append(el('line', { x1: x(i), x2: x(i), y1: T, y2: height - Bm, class: 'cursor' }));
        for (const m of ORDER) {
          if (!on.has(m) || !data[m]) continue;
          svg.append(el('circle', { cx: x(i), cy: y(data[m].mean[i - 1]), r: 3.5, class: `dot ${CLS[m]}` }));
        }
        const parts = ORDER.filter((m) => on.has(m) && data[m]).map((m) => [m, data[m].mean[i - 1]]).sort((a, b) => a[1] - b[1]);
        readout.innerHTML = `<span><b>arrival ${i}</b></span>` + parts.map(([m, v]) => `<span><b class="${CLS[m]}" style="color:var(--sw)">${esc(D.curve_methods[m])}</b> ${v.toFixed(2)}</span>`).join('');
      } else {
        readout.innerHTML = `<span>Hover or touch the chart for values at an arrival. Bands: pointwise 95% intervals across ${SEEDS[roster]} seeds for ${esc(NAME)} and no transfer.</span>`;
      }
      cap.textContent = `${D.rosters[roster]}: ${SEEDS[roster]} seeds, 350 students, 24 questions each. Curves are centered 25-arrival moving means of per-user excess strong regret on [0, 1] utilities, with smaller windows at the two ends.`;
      svg.onpointermove = (ev) => {
        const r = svg.getBoundingClientRect();
        const px = ((ev.clientX - r.left) / r.width) * width;
        const i = Math.round(1 + ((px - L) / (width - L - Rr)) * (N - 1));
        const h = Math.max(1, Math.min(N, i));
        if (h !== hover) { hover = h; draw(); }
      };
      svg.onpointerleave = () => { hover = null; draw(); };
    }
    const callouts = $('[data-callouts]');
    if (callouts) {
      callouts.innerHTML = ['U', 'C', 'I'].map((r) => `<div class="callout"><b>−${FINAL[r].toFixed(0)}%</b><span>${esc(D.rosters[r])}: ${esc(NAME)}'s excess regret per user against no transfer, final quarter of the arrivals</span></div>`).join('');
    }
    draw();
    if (typeof ResizeObserver !== 'undefined') {
      let w = 0;
      new ResizeObserver(() => { const nw = Math.round(svg.getBoundingClientRect().width); if (nw !== w) { w = nw; draw(); } }).observe(cv);
    }
  }

  /* ------------------------------------------------------------ leaderboard */
  const lb = $('[data-leaderboard]');
  if (lb) {
    const T = D.table, table = $('[data-table]', lb), extra = $('[data-extra-cols]', lb);
    let sortKey = 'U';
    const cols = () => (extra && extra.checked ? ['U', 'C', 'I', 'T', 'D'] : ['U', 'C', 'I']);
    function cell(row, c) {
      const [ex, se, sc] = row[c];
      const bar = `<span class="scorecell"><em>${sc}</em><i style="--w:${sc}%"></i></span>`;
      const exs = row.kind === 'ref' ? `${ex.toFixed(1)}` : `${ex.toFixed(1)} ± ${se.toFixed(1)}`;
      return `<td>${bar}<span class="excess">excess ${exs}</span></td>`;
    }
    function render() {
      const C = cols();
      const head = `<thead><tr><th>Method</th>${C.map((c) => `<th ${c === sortKey ? 'aria-sort="descending"' : ''}><button type="button" data-sort="${c}">${esc(T.column_names[c])}</button></th>`).join('')}</tr></thead>`;
      const refs = T.rows.filter((r) => r.kind === 'ref');
      const methods = T.rows.filter((r) => r.kind === 'method' || r.kind === 'ours').sort((a, b) => b[sortKey][2] - a[sortKey][2] || a[sortKey][0] - b[sortKey][0]);
      const abl = T.rows.filter((r) => r.kind === 'ablation');
      const tr = (r, cls) => `<tr class="${cls}"><td>${esc(r.name)}</td>${C.map((c) => cell(r, c)).join('')}</tr>`;
      const body = `<tbody>${refs.map((r) => tr(r, 'ref')).join('')}${methods.map((r, i) => tr(r, (r.kind === 'ours' ? 'ours' : '') + (i === 0 ? ' sep' : ''))).join('')}${abl.map((r) => tr(r, 'ablation sep')).join('')}</tbody>`;
      const foot = `<tfoot><tr><td colspan="${C.length + 1}" class="muted" style="font-size:.78rem">Floor G<sub>T</sub>, already subtracted from every excess: ${C.map((c) => `${T.column_names[c]} ${T.floor[c]}`).join(' · ')}. Seeds: ${C.map((c) => `${T.column_names[c]} ${T.seeds[c]}`).join(' · ')}. The development roster was used for design and is descriptive.</td></tr></tfoot>`;
      table.innerHTML = head + body + foot;
      $$('[data-sort]', table).forEach((b) => b.addEventListener('click', () => { sortKey = b.dataset.sort; render(); }));
    }
    if (extra) extra.addEventListener('change', render);
    render();
  }

  /* ------------------------------------------------------------ copy buttons */
  $$('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const src = $(b.dataset.copy);
    const text = src ? src.textContent : '';
    const done = (msg) => { b.textContent = msg; setTimeout(() => { b.textContent = 'Copy'; }, 1600); };
    try { await navigator.clipboard.writeText(text); done('Copied'); }
    catch {
      const r = document.createRange(); r.selectNodeContents(src); const s = getSelection(); s.removeAllRanges(); s.addRange(r); done('Selected');
    }
  }));

  /* ------------------------------------------------------------ current section in the nav */
  const links = $$('.nav a');
  if (links.length && typeof IntersectionObserver !== 'undefined') {
    const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        links.forEach((a) => a.removeAttribute('aria-current'));
        const a = byId.get(e.target.id); if (a) a.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    byId.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
  }
})();
