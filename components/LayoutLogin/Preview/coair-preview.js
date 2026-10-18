/**
 * COAIr sign-in product preview — framework-free engine.
 *
 *   import { mountCoairPreview } from './coair-preview.js';
 *   import { COAIR_PREVIEW_CONTENT } from './content.js';
 *   import './coair-preview.css';
 *   const ctl = mountCoairPreview(document.getElementById('preview'), COAIR_PREVIEW_CONTENT);
 *   // later: ctl.destroy()
 *
 * No dependencies. All timers are owned by the controller and cleared on destroy().
 * Animation pauses when the tab is hidden, on user Pause, and is static under
 * prefers-reduced-motion.
 */

const ICONS = {
  queris: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 9.5H39a5 5 0 0 1 5 5V30a5 5 0 0 1-5 5H22.5L15 41.5V35H9a5 5 0 0 1-5-5V14.5a5 5 0 0 1 5-5Z"/><circle cx="21" cy="21" r="6.4"/><path d="M25.8 25.8 31.5 31.5" stroke="#F8A810"/></svg>',
  chronos: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><path d="M5 6V42H44" stroke-width="3.4"/><path d="M12 13H30M19 24H41" stroke-width="5.4"/><path d="M14 34.5H34" stroke="#F8A810" stroke-width="5.4"/></svg>',
  forensis: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" aria-hidden="true"><circle cx="20" cy="20" r="14.5"/><path d="M30.5 30.5 42.5 42.5"/><path d="M20 11.5V20.5"/><path d="M20 20.5 27 25.5" stroke="#F8A810"/></svg>',
  doc: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F8A810" stroke-width="2" aria-hidden="true"><path d="M4 4h12l4 4v12H4z"/><path d="M8 12h8M8 16h5"/></svg>',
  circle: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F8A810" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>',
  shield: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F8A810" stroke-width="2" aria-hidden="true"><path d="M12 3 4 7v5c0 5 3.5 8 8 9 4.5-1 8-4 8-9V7z"/></svg>',
  download: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v3h16v-3"/></svg>',
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** **bold** and [[highlight]] only; everything else escaped. */
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[\[(.+?)\]\]/g, '<mark>$1</mark>');

function shell(c) {
  return `
  <div class="cpv-brand"><div class="cpv-mark" aria-hidden="true">CO<b>AI</b>r</div>
    <div class="cpv-brand-t">${esc(c.brand.name)}<small>${esc(c.brand.tagline)}</small></div></div>
  <div class="cpv-hero">
    <div class="cpv-eyebrow">${esc(c.eyebrow)}</div>
    <h1 class="cpv-h1">${esc(c.headline.lead)}<em>${esc(c.headline.accent)}</em></h1>
    <p class="cpv-sub">${esc(c.subhead)}</p>
  </div>
  <div class="cpv-stage">
    <div class="cpv-tabs" role="tablist" aria-label="COAIr modules">
      ${c.scenes.map((s, i) => `<button type="button" class="cpv-tab" role="tab" aria-selected="false" data-i="${i}">${ICONS[s.kind] || ''}${esc(s.label)}<span class="cpv-tab-bar"></span></button>`).join('')}
    </div>
    <div class="cpv-window" aria-live="off">
      <div class="cpv-chrome"><i></i><i></i><i></i><span>${esc(c.windowTitle)} · <b data-ref="ctx"></b></span></div>
      ${c.scenes.map((s, i) => `<div class="cpv-scene" data-scene="${i}" role="tabpanel"></div>`).join('')}
    </div>
    <div class="cpv-caption"><span>${esc(c.caption)}</span><button type="button" class="cpv-pp" data-ref="pp">Pause</button></div>
  </div>
  <div class="cpv-trust">
    ${c.trust.map((t) => `<div>${ICONS[t.icon] || ''}<span><b>${esc(t.title)}</b>${esc(t.sub)}</span></div>`).join('')}
  </div>`;
}

/* ── scene builders: return {el-html, play(ctx)} ── */
const SCENES = {
  queris: {
    html: (s) => `
      <div class="cpv-q" data-ref="q"></div>
      <div class="cpv-think" data-ref="think"><span class="cpv-dots"><i></i><i></i><i></i></span><span data-ref="thinkTxt"></span></div>
      <div class="cpv-ans">${s.answer.map((a, i) => `<p data-ref="a${i}">${md(a.text)} <span class="cpv-cite"${a.highlight ? ' data-ref="hot"' : ''}>${esc(a.cite)}</span></p>`).join('')}</div>
      <div class="cpv-peek" data-ref="peek"><div class="cpv-peek-h"><span class="cpv-ic">PDF</span><div><b>${esc(s.peek.file)}</b><small>${esc(s.peek.meta)}</small></div></div>
        <div class="cpv-peek-t">${md(s.peek.text)}</div></div>`,
    play(s, el, t) {
      const q = el.querySelector('[data-ref=q]'), think = el.querySelector('[data-ref=think]'), tt = el.querySelector('[data-ref=thinkTxt]');
      const lines = s.answer.map((_, i) => el.querySelector(`[data-ref=a${i}]`)), hot = el.querySelector('[data-ref=hot]'), peek = el.querySelector('[data-ref=peek]');
      [think, peek, ...lines].forEach((x) => x.classList.remove('on')); hot && hot.classList.remove('hot');
      tt.textContent = s.thinking[0];
      let i = 0;
      const type = () => {
        if (i <= s.question.length) { q.innerHTML = esc(s.question.slice(0, i)) + '<span class="cpv-caret"></span>'; i++; t.at(28, type); }
        else { q.textContent = s.question; after(); }
      };
      const after = () => {
        t.at(250, () => think.classList.add('on'));
        if (s.thinking[1]) t.at(1200, () => (tt.textContent = s.thinking[1]));
        t.at(2300, () => { think.classList.remove('on'); lines[0] && lines[0].classList.add('on'); });
        lines.slice(1).forEach((l, k) => t.at(2900 + k * 600, () => l.classList.add('on')));
        t.at(2900 + lines.length * 600, () => hot && hot.classList.add('hot'));
        t.at(3300 + lines.length * 600, () => peek.classList.add('on'));
      };
      type();
    },
    final(s, el) {
      el.querySelector('[data-ref=q]').textContent = s.question;
      el.querySelectorAll('.cpv-ans p,.cpv-peek').forEach((x) => x.classList.add('on'));
      const h = el.querySelector('[data-ref=hot]'); h && h.classList.add('hot');
    },
  },

  chronos: {
    html: (s) => `
      <div class="cpv-tl"><div class="cpv-ax"></div>
        ${s.axis.map((a) => `<div class="cpv-m" style="left:${a.at * 100}%">${esc(a.label)}</div>`).join('')}
        ${s.events.map((e, i) => `<div class="cpv-pt${e.flag ? ' d' : ''}" data-pt="${i}" style="left:calc(${e.at * 100}% - 6px)"></div>`).join('')}
      </div>
      <div class="cpv-rows">${s.events.map((e, i) => `
        <div class="cpv-r${e.flag ? ' dl' : ''}" data-row="${i}"><span class="cpv-id">${esc(e.id)}</span><span class="cpv-dt">${esc(e.date)}</span>
          <span class="cpv-ev">${esc(e.text)}</span><span class="cpv-ref">${esc(e.ref)}</span>
          <span class="cpv-fl${e.flag ? '' : ' none'}">▲ ${esc(e.flag || '')}</span></div>`).join('')}</div>
      <div class="cpv-export" data-ref="export">${ICONS.download}${esc(s.exportLabel)}</div>`,
    play(s, el, t) {
      const pts = el.querySelectorAll('[data-pt]'), rows = el.querySelectorAll('[data-row]'), ex = el.querySelector('[data-ref=export]');
      [...pts, ...rows, ex].forEach((x) => x.classList.remove('on'));
      s.events.forEach((_, k) => t.at(400 + k * 700, () => { pts[k].classList.add('on'); rows[k].classList.add('on'); }));
      t.at(700 + s.events.length * 700, () => ex.classList.add('on'));
    },
    final(s, el) { el.querySelectorAll('[data-pt],[data-row],[data-ref=export]').forEach((x) => x.classList.add('on')); },
  },

  forensis: {
    html: (s) => `
      <div class="cpv-kp">${s.kpis.map((k, i) => `<div class="cpv-k ${k.tone}"><small>${esc(k.label)}</small><b data-kpi="${i}">0</b></div>`).join('')}</div>
      <div class="cpv-bars">${s.sections.map((r, i) => `
        <div class="cpv-bar"><span class="cpv-lbl">${esc(r.name)}</span><div class="cpv-track"><i class="p" data-bp="${i}"></i><i class="a" data-ba="${i}"></i></div>
        <span class="cpv-v">×${(r.planned / r.actual).toFixed(1)}</span></div>`).join('')}</div>
      <div class="cpv-legend"><span><i style="background:#C9D3DD"></i>${esc(s.legend[0])}</span><span><i style="background:#F8A810"></i>${esc(s.legend[1])}</span></div>
      <div class="cpv-note" data-ref="note">${md(s.note.text)} <span class="cpv-cite">${esc(s.note.cite)}</span></div>`,
    play(s, el, t) {
      const kp = el.querySelectorAll('[data-kpi]'), note = el.querySelector('[data-ref=note]');
      note.classList.remove('on'); kp.forEach((x) => (x.textContent = '0'));
      el.querySelectorAll('.cpv-track i').forEach((x) => (x.style.width = '0'));
      t.at(200, () => s.kpis.forEach((k, i) => t.count(kp[i], k.value, k.suffix, 900)));
      s.sections.forEach((r, i) => t.at(900 + i * 350, () => {
        el.querySelector(`[data-bp="${i}"]`).style.width = (r.planned / s.scaleMax) * 100 + '%';
        el.querySelector(`[data-ba="${i}"]`).style.width = (r.actual / s.scaleMax) * 100 + '%';
      }));
      t.at(1800 + s.sections.length * 350, () => note.classList.add('on'));
    },
    final(s, el) {
      el.querySelectorAll('[data-kpi]').forEach((x, i) => (x.textContent = s.kpis[i].value.toLocaleString() + s.kpis[i].suffix));
      s.sections.forEach((r, i) => {
        el.querySelector(`[data-bp="${i}"]`).style.width = (r.planned / s.scaleMax) * 100 + '%';
        el.querySelector(`[data-ba="${i}"]`).style.width = (r.actual / s.scaleMax) * 100 + '%';
      });
      el.querySelector('[data-ref=note]').classList.add('on');
    },
  },
};

/**
 * @param {HTMLElement} root  empty container; becomes the dark left panel
 * @param {object} content    see content.js
 * @param {{autoplay?:boolean, startAt?:number}} [opts]
 */
export function mountCoairPreview(root, content, opts = {}) {
  root.classList.add('cpv');
  root.setAttribute('aria-label', `${content.brand.name} product preview`);
  root.innerHTML = shell(content);

  const tabs = [...root.querySelectorAll('.cpv-tab')];
  const scenes = [...root.querySelectorAll('.cpv-scene')];
  const ctx = root.querySelector('[data-ref=ctx]');
  const pp = root.querySelector('[data-ref=pp]');
  content.scenes.forEach((s, i) => (scenes[i].innerHTML = SCENES[s.kind].html(s)));

  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cur = -1, paused = false, timers = [], rafs = [], destroyed = false;

  const t = {
    at(ms, fn) { const id = setTimeout(() => { if (!paused && !destroyed) fn(); }, ms); timers.push(id); },
    count(node, to, suf, ms) {
      const t0 = performance.now();
      const f = (now) => { if (paused || destroyed) return; const k = Math.min(1, (now - t0) / ms);
        node.textContent = Math.round(to * k).toLocaleString('en-US') + suf; if (k < 1) rafs.push(requestAnimationFrame(f)); };
      rafs.push(requestAnimationFrame(f));
    },
  };
  const clear = () => { timers.forEach(clearTimeout); rafs.forEach(cancelAnimationFrame); timers = []; rafs = []; };

  function select(i) {
    cur = i;
    tabs.forEach((tb, k) => { tb.classList.toggle('on', k === i); tb.setAttribute('aria-selected', String(k === i));
      tb.style.setProperty('--cpv-dur', content.scenes[k].durationMs + 'ms');
      const bar = tb.querySelector('.cpv-tab-bar'); bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; });
    scenes.forEach((sc, k) => sc.classList.toggle('on', k === i));
    ctx.textContent = content.scenes[i].context;
  }
  function show(i) {
    clear(); select(i);
    const s = content.scenes[i];
    // Panel hidden (e.g. phones, where the layout sets display:none): don't animate, check again later.
    if (!root.getClientRects().length) { SCENES[s.kind].final(s, scenes[i]); t.at(1500, () => show(i)); return; }
    if (paused || reduced) { SCENES[s.kind].final(s, scenes[i]); return; }
    SCENES[s.kind].play(s, scenes[i], t);
    t.at(s.durationMs, () => show((cur + 1) % content.scenes.length));
  }
  function setPaused(v) {
    paused = v; root.classList.toggle('paused', v); pp.textContent = v ? 'Play' : 'Pause';
    if (!v) show(cur); else { clear(); SCENES[content.scenes[cur].kind].final(content.scenes[cur], scenes[cur]); }
  }

  tabs.forEach((tb) => tb.addEventListener('click', () => { paused = false; root.classList.remove('paused'); pp.textContent = 'Pause'; show(+tb.dataset.i); }));
  pp.addEventListener('click', () => setPaused(!paused));
  const onVis = () => { if (document.hidden) { clear(); } else if (!paused) { show(cur); } };
  document.addEventListener('visibilitychange', onVis);
  // iOS/Safari back-forward cache restores the page with timers frozen — restart cleanly.
  const onShow = (e) => { if (e.persisted && !paused) show(cur); };
  window.addEventListener('pageshow', onShow);

  if (reduced) { paused = true; root.classList.add('paused'); pp.textContent = 'Play'; }
  show(opts.startAt || 0);
  if (opts.autoplay === false) setPaused(true);

  return {
    goTo: (i) => show(i),
    pause: () => setPaused(true),
    play: () => setPaused(false),
    destroy() { destroyed = true; clear(); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pageshow', onShow); root.innerHTML = ''; root.classList.remove('cpv', 'paused'); },
  };
}
