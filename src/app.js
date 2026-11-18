// app.js - TWRP Theme Studio UI
(async function () {
'use strict';
const { Theme, Renderer, kid, kids } = Engine;
const $ = s => document.querySelector(s);
const h = (tag, a = {}, ...ch) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(a || {})) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v; else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v);
  }
  ch.flat().forEach(c => c != null && e.append(c.nodeType ? c : document.createTextNode(c)));
  return e;
};
const toast = (m, ms = 2200) => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms); };

let T, R, page = 'main2', hist = [], mode = 'preview', sel = null, tab = 'colors', undo = [], redo = [], lastCp = 0, scale = 1, fontScale = 1;
const screen = $('#screen');

async function load() {
  const j = await (await fetch('/api/theme')).json();
  if (j.error) throw new Error(j.error);
  T = new Theme(j.ui, j.common, j.imageBase);
  R = new Renderer(T, screen);
  undo = []; redo = []; sel = null;
  if (!T.pages[page]) page = T.pageNames()[0];
  fillPages(); refresh(); buildTab();
}
function fillPages() {
  const s = $('#pageSel'); s.innerHTML = '';
  T.pageNames().forEach(n => s.append(h('option', { value: n }, n)));
  s.value = page;
}
// ---- rendering ----
let raf = 0;
function refresh() { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); }
function draw() {
  R.render(page); screen.classList.toggle('edit', mode === 'edit');
  if (fontScale !== 1) screen.querySelectorAll('.tx,.txt').forEach(e => e.style.fontSize = parseFloat(e.style.fontSize) * fontScale + 'px');
  if (sel) { const i = R.nodes.findIndex(n => n.el === sel.el); screen.querySelectorAll(`[data-n="${i}"]`).forEach(d => d.classList.add('sel')); }
  fit(); $('#pageSel').value = page; $('#dot').classList.toggle('on', !!T.hasChanges());
  $('#bUndo').disabled = !undo.length; $('#bRedo').disabled = !redo.length;
}
function fit() {
  const w = parseFloat(screen.style.width) || 1080, hh = parseFloat(screen.style.height) || 1920, wrap = $('#stageWrap');
  scale = Math.min((wrap.clientWidth - 28) / w, (wrap.clientHeight - 28) / hh); if (!(scale > 0)) return;
  screen.style.transform = `scale(${scale})`; screen.style.setProperty('--sc', scale);
  const p = $('#phone'); p.style.width = w * scale + 'px'; p.style.height = hh * scale + 'px';
}
new ResizeObserver(fit).observe($('#stageWrap'));
function go(name, push = true) { if (!T.pages[name]) return toast('No such page: ' + name); if (push && name !== page) hist.push(page); page = name; sel = null; refresh(); if (tab === 'element') buildTab(); }
function back() { if (hist.length) go(hist.pop(), false); }
// ---- history ----
function cp(force) {
  const now = Date.now();
  if (force || now - lastCp > 800) { undo.push(T.snapshot()); if (undo.length > 60) undo.shift(); redo = []; }
  lastCp = now;
}
function restore(from, to) { if (!from.length) return; to.push(T.snapshot()); T.restore(from.pop()); sel = null; fillPages(); refresh(); buildTab(); }
$('#bUndo').onclick = () => restore(undo, redo); $('#bRedo').onclick = () => restore(redo, undo);
// ---- preview interaction ----
function nodeAt(e) { const d = e.target.closest && e.target.closest('[data-n]'); return d ? { d, n: R.nodes[+d.dataset.n] } : null; }
function runActions(el) {
  let target = null, rerender = false;
  for (const a of T.actionsOf(el)) {
    const f = a.getAttribute('function'), v = a.textContent.trim();
    if (f === 'set') { const m = /^([^=]+)=(.*)$/.exec(v); if (m) { T.sim[m[1]] = T.res(m[2]); rerender = true; } }
    else if (f === 'page') target = v;
    else if (f === 'overlay') target = v;
    else if (f === 'key') { if (v === 'home') target = 'main2'; else if (v === 'back') { back(); return; } }
  }
  if (target) go(target); else if (rerender) refresh();
}
let drag = null;
screen.addEventListener('pointerdown', e => {
  const hit = nodeAt(e); if (mode !== 'edit') return;
  if (!hit) { sel = null; refresh(); buildTab(); return; }
  select(hit.n);
  const pl = T.pl(hit.n.el); drag = { n: hit.n, d: hit.d, sx: e.clientX, sy: e.clientY, x: pl.x, y: pl.y, moved: false, id: e.pointerId };
  screen.setPointerCapture(e.pointerId); e.preventDefault();
});
screen.addEventListener('pointermove', e => {
  if (!drag) return; const dx = (e.clientX - drag.sx) / scale, dy = (e.clientY - drag.sy) / scale;
  if (!drag.moved && Math.hypot(dx, dy) < 4 / scale) return; drag.moved = true;
  drag.d.style.left = Math.round(drag.x + dx) + 'px'; drag.d.style.top = Math.round(drag.y + dy) + 'px'; drag.nx = Math.round(drag.x + dx); drag.ny = Math.round(drag.y + dy);
});
screen.addEventListener('pointerup', e => {
  if (!drag) return; const d = drag; drag = null;
  if (d.moved) { cp(true); setPlace(d.n.el, { x: d.nx, y: d.ny }); refresh(); buildTab(); }
});
screen.addEventListener('click', e => {
  if (mode === 'edit') return; const hit = nodeAt(e); if (!hit) return;
  const el = hit.n.el; if (el.tagName === 'button') runActions(el);
});
function select(n) { sel = { el: n.el, tpl: n.tpl }; screen.querySelectorAll('.sel').forEach(x => x.classList.remove('sel')); refresh(); setTab('element'); }
function setPlace(el, o) {
  let p = kid(el, 'placement');
  if (!p) { p = el.ownerDocument.createElement('placement'); el.insertBefore(p, el.firstChild); }
  for (const [k, v] of Object.entries(o)) { if (v === '' || v == null) p.removeAttribute(k); else p.setAttribute(k, v); }
  T.touch(el);
}
// ---- UI helpers ----
function hexParts(hex) {
  hex = (hex || '#000000').trim(); if (/^#[0-9a-f]{3}$/i.test(hex)) hex = '#' + [...hex.slice(1)].map(c => c + c).join('');
  const rgb = /^#[0-9a-f]{6}/i.test(hex) ? hex.slice(0, 7) : '#000000';
  return { rgb, a: /^#[0-9a-f]{8}$/i.test(hex) ? parseInt(hex.slice(7), 16) : 255 };
}
const toHex = (rgb, a) => rgb + (a < 255 ? Math.round(a).toString(16).padStart(2, '0') : '');
function colorRow(label, sub, get, set) {
  const p = hexParts(get());
  const c = h('input', { type: 'color', value: p.rgb }), a = h('input', { type: 'range', class: 'alpha', min: 0, max: 255, value: p.a, title: 'Alpha' }), t = h('input', { type: 'text', class: 'hex', value: get() });
  const push = () => { const v = toHex(c.value, +a.value); t.value = v; cp(); set(v); };
  c.oninput = push; a.oninput = push;
  t.onchange = () => { if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(t.value)) { t.value = get(); return; } const q = hexParts(t.value); c.value = q.rgb; a.value = q.a; cp(); set(t.value); };
  return h('div', { class: 'row' }, h('div', { class: 'lb' }, h('b', {}, label), sub && h('small', {}, sub)), a, c, t);
}
function numRow(label, get, set, max) {
  const n = h('input', { type: 'number', value: get() }), r = h('input', { type: 'range', class: 'rg', min: 0, max: max || Math.max(200, get() * 2), value: get() });
  n.oninput = () => { r.value = n.value; cp(); set(n.value); }; r.oninput = () => { n.value = r.value; cp(); set(r.value); };
  return h('div', { class: 'row' }, h('div', { class: 'lb' }, h('b', {}, label)), r, n);
}
function setTab(t) { tab = t; document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); buildTab(); if ($('#panel').classList.contains('hidden')) togglePanel(true); }
const TABS = [['colors', 'Colors'], ['layout', 'Layout'], ['images', 'Images'], ['element', 'Element'], ['presets', 'Presets'], ['sim', 'Simulate']];
$('#tabs').append(...TABS.map(([k, l]) => h('button', { 'data-t': k, class: k === tab ? 'on' : '', onclick: () => setTab(k) }, l)));
function togglePanel(open) {
  const p = $('#panel'); const o = open ?? p.classList.contains('hidden');
  p.classList.toggle('hidden', !o); document.body.classList.toggle('open', o); setTimeout(fit, 30);
}
$('#fab').onclick = () => togglePanel();
$('#fsBtn').onclick = () => { document.body.classList.add('full'); setTimeout(fit, 30); (document.documentElement.requestFullscreen || (() => 0)).call(document.documentElement).catch?.(() => 0); };
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) { document.body.classList.remove('full'); setTimeout(fit, 30); } });
screen.addEventListener('dblclick', () => { if (document.body.classList.contains('full')) { document.body.classList.remove('full'); if (document.fullscreenElement) document.exitFullscreen(); setTimeout(fit, 30); } });
// ---- tabs ----
const COLOR_LABELS = {
  background_color: ['Background', 'Page background'], accent_color: ['Accent', 'Header, tabs, list titles'], text_color: ['Text', 'Main text'],
  text_button_color: ['Button text', ''], highlight_color: ['Press highlight', 'Overlay while a button is pressed'], caps_highlight_color: ['Keyboard press', ''],
  text_success_color: ['Success', ''], text_fail_color: ['Fail / error', ''], fileselector_linecolor: ['List divider', 'Lines, scrollbar track'],
  fileselector_highlight_color: ['List selection', ''], accent_color_semitransparent: ['Accent (soft)', ''], highlight: ['Highlight', ''],
  warning: ['Warning', ''], error: ['Error', ''], transparent: ['Transparent', 'Leave at 00 alpha'], semi_transparent: ['Dim overlay', '']
};
const isColor = v => /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v || '');
function colorsTab(b) {
  b.append(h('h4', {}, 'Theme colors'));
  const names = Object.keys(T.varEl).filter(n => isColor(T.varEl[n].getAttribute('value')));
  names.sort((a, c) => (COLOR_LABELS[a] ? 0 : 1) - (COLOR_LABELS[c] ? 0 : 1));
  names.forEach(n => { const l = COLOR_LABELS[n]; b.append(colorRow(l ? l[0] : n, l ? l[1] || n : '', () => T.varEl[n].getAttribute('value'), v => { T.setVar(n, v); refresh(); })); });
  const lit = [...T.literalColors()];
  if (lit.length) {
    b.append(h('h4', {}, 'Hard-coded colors (replace everywhere)'));
    lit.forEach(([val, refs]) => {
      let cur = val;
      b.append(colorRow(val.toUpperCase(), `${refs.length} use${refs.length > 1 ? 's' : ''} (${[...new Set(refs.map(r => r.el.tagName))].slice(0, 3).join(', ')})`, () => cur,
        v => { cur = v; refs.forEach(r => { r.el.setAttribute(r.attr, v); T.touch(r.el); }); refresh(); }));
    });
  }
}
const GROUPS = [
  ['Screen & bars', /^(screen_|status_height|header_height|navbar_height|navbar_y|navbar_btn_y|content_)/], ['Spacing & columns', /^(indent|col\d|center_x|back_button_x|console_button_x|dialog_|pattern_)/],
  ['Tabs & buttons', /^(tab|btn)/], ['Lists, sliders & inputs', /^(fileselector_|partitionlist_|listbox_|fastscroll_|slidervalue_|slideout_|input_)/],
  ['Console & keyboard', /^(console_|keyboard_)/], ['Grid rows', /^(row\d|status_)/]
];
function layoutTab(b) {
  const nums = Object.keys(T.varEl).filter(n => !/^tw_/.test(n) && /^-?\d+$/.test(T.varEl[n].getAttribute('value')));
  b.append(h('h4', {}, 'Fonts (size)'));
  Object.values(T.fonts).forEach(f => b.append(numRow(f.getAttribute('name'), () => +f.getAttribute('size'), v => { f.setAttribute('size', v); T.touch(f); refresh(); }, 120)));
  const used = new Set();
  [...GROUPS, ['Other', /./]].forEach(([title, re]) => {
    const list = nums.filter(n => !used.has(n) && re.test(n)); if (!list.length) return; list.forEach(n => used.add(n));
    const det = h('details', {}, h('summary', { style: 'padding:8px 0;color:var(--mut);cursor:pointer' }, `${title} (${list.length})`));
    list.forEach(n => det.append(numRow(n, () => +T.varEl[n].getAttribute('value'), v => { T.setVar(n, String(v)); refresh(); })));
    if (title !== 'Grid rows' && title !== 'Other') det.open = true; b.append(det);
  });
}
// image upload -> PNG (optionally resized to original dims)
function loadImg(src) { return new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; }); }
async function setImage(name, file) {
  const src = URL.createObjectURL(file), img = await loadImg(src), fn = T.imgs[name];
  const cur = await loadImg(T.imgUrl(name)), c = document.createElement('canvas');
  c.width = cur.naturalWidth; c.height = cur.naturalHeight; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  cp(true); T.changed.images[fn] = c.toDataURL('image/png'); refresh(); buildTab();
  toast(img.naturalWidth !== c.width || img.naturalHeight !== c.height ? `Resized ${img.naturalWidth}×${img.naturalHeight} → ${c.width}×${c.height}` : 'Image replaced');
}
async function tintImage(name, color) {
  const fn = T.imgs[name], img = await loadImg(T.imgUrl(name)), c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  cp(true); T.changed.images[fn] = c.toDataURL('image/png'); refresh(); buildTab();
}
function imagesTab(b) {
  b.append(h('div', { class: 'hint', style: 'padding:0 0 10px;text-align:left' }, 'Tap a thumbnail or drop a file to replace. Images are resized to the original size so the layout never shifts.'));
  const g = h('div', { class: 'cards' });
  Object.keys(T.imgs).forEach(n => {
    const fn = T.imgs[n], im = h('img', { src: T.imgUrl(n) }), sz = h('div', { class: 'sz' }, ' '), fi = h('input', { type: 'file', accept: 'image/*', hidden: true });
    im.onload = () => sz.textContent = `${im.naturalWidth}×${im.naturalHeight}`;
    const card = h('div', { class: 'card' }, h('div', { class: 'th', onclick: () => fi.click() }, im), h('div', { class: 'nm', title: n }, n), sz, fi,
      h('div', { class: 'acts' }, h('input', { type: 'color', value: '#ffffff', title: 'Tint (keeps transparency)', onchange: e => tintImage(n, e.target.value) }),
        T.changed.images[fn] && h('button', { onclick: async () => { cp(true); delete T.changed.images[fn]; refresh(); buildTab(); } }, 'reset')));
    fi.onchange = () => fi.files[0] && setImage(n, fi.files[0]);
    card.ondragover = e => { e.preventDefault(); card.classList.add('drop'); }; card.ondragleave = () => card.classList.remove('drop');
    card.ondrop = e => { e.preventDefault(); card.classList.remove('drop'); const f = e.dataTransfer.files[0]; if (f) setImage(n, f); };
    g.append(card);
  });
  b.append(g);
}
// ---- element inspector ----
function condText(el) {
  const out = []; const add = c => out.push(`${c.getAttribute('var1')} ${c.getAttribute('op') || '='} ${c.getAttribute('var2')}`);
  for (const c of el.children) { if (c.tagName === 'condition') add(c); if (c.tagName === 'conditions') kids(c, 'condition').forEach(add); }
  return out.join(' & ');
}
function elementTab(b) {
  if (!sel || !sel.el.isConnected && !sel.el.ownerDocument) { b.append(h('div', { class: 'hint' }, 'Switch to ', h('b', {}, 'Select'), ' mode, then tap or drag any element in the preview.')); return; }
  const el = sel.el, pl = T.pl(el), place = kid(el, 'placement');
  b.append(h('h4', {}, el.tagName, el.getAttribute('style') && h('span', { class: 'chip' }, el.getAttribute('style')), sel.tpl && h('span', { class: 'chip' }, 'template: ' + sel.tpl.getAttribute('name') + ' (shared)')));
  const ct = condText(el); if (ct) b.append(h('div', { class: 'hint', style: 'padding:0 0 8px;text-align:left;font-size:12px' }, 'Shown when: ' + ct));
  const raw = a => place && place.hasAttribute(a) ? place.getAttribute(a) : '';
  const inp = {};
  const grid = h('div', { class: 'grid2' });
  ['x', 'y', 'w', 'h'].forEach(k => { inp[k] = h('input', { type: 'text', value: raw(k), placeholder: k === 'x' || k === 'y' ? String(pl[k]) : 'auto', onchange: e => { cp(true); setPlace(el, { [k]: e.target.value.trim() }); refresh(); buildTab(); } }); grid.append(h('label', {}, k.toUpperCase(), inp[k])); });
  const gsel = h('select', { onchange: e => { cp(true); setPlace(el, { placement: e.target.value === '0' ? '' : e.target.value }); refresh(); } },
    ...['Top-left', 'Top-right', 'Bottom-left', 'Bottom-right', 'Center', 'Center-X'].map((n, i) => h('option', { value: i, selected: i === pl.p }, n)));
  grid.append(h('label', {}, 'ANCHOR', gsel)); b.append(h('h4', {}, 'Position (px, or %variable%)'), grid);
  const step = h('select', {}, h('option', { value: 1 }, '1 px'), h('option', { value: 8 }, '8 px'), h('option', { value: 36 }, '36 px'));
  const nudge = (dx, dy) => { cp(true); setPlace(el, { x: String(pl.x + dx * +step.value), y: String(pl.y + dy * +step.value) }); refresh(); buildTab(); };
  b.append(h('div', { class: 'nudge' }, h('i'), h('button', { onclick: () => nudge(0, -1) }, '↑'), h('i'), h('button', { onclick: () => nudge(-1, 0) }, '←'), h('button', { onclick: () => nudge(0, 1) }, '↓'), h('button', { onclick: () => nudge(1, 0) }, '→')), h('div', { style: 'text-align:center' }, 'Step ', step));
  // text
  const tn = kid(el, 'text');
  if (tn) b.append(h('h4', {}, 'Text'), h('textarea', { value: tn.textContent.trim(), onchange: e => { cp(true); tn.textContent = e.target.value; T.touch(tn); refresh(); } }),
    h('div', { class: 'hint', style: 'padding:4px 0;text-align:left;font-size:11px' }, 'Syntax: {@key=Default text} keeps translations working; %tw_var% inserts live values.'));
  // colors
  const cols = []; const scan = n => [...n.attributes].forEach(a => { if (/color$/i.test(a.name)) cols.push({ n, a: a.name }); });
  scan(el); [...el.children].filter(c => ['fill', 'font', 'highlight', 'background', 'cursor', 'dot', 'line', 'key-alphanumeric', 'key-other'].includes(c.tagName)).forEach(scan);
  if (cols.length) { b.append(h('h4', {}, 'Colors')); cols.forEach(({ n, a }) => {
    const rawv = () => n.getAttribute(a), m = /^%(.+)%$/.exec(rawv());
    const vs = h('select', { style: 'max-width:110px', onchange: e => { cp(true); if (e.target.value) n.setAttribute(a, `%${e.target.value}%`); else n.setAttribute(a, T.col(rawv())); T.touch(n); refresh(); buildTab(); } },
      h('option', { value: '' }, 'custom'), ...Object.keys(T.varEl).filter(k => isColor(T.varEl[k].getAttribute('value'))).map(k => h('option', { value: k, selected: m && m[1] === k }, k)));
    const row = colorRow(`${n.tagName}.${a}`, m ? 'linked → ' + m[1] : 'custom color', () => { const c = T.col(rawv()); return isColor(c) ? c : '#000000'; },
      v => { n.setAttribute(a, v); T.touch(n); refresh(); });
    row.append(vs); b.append(row);
  }); }
  // image / font / style
  const imgN = kid(el, 'image');
  if (imgN && imgN.hasAttribute('resource') || el.hasAttribute('resource')) {
    const holder = imgN || el, cur = holder.getAttribute('resource');
    b.append(h('h4', {}, 'Image'), h('div', { class: 'row' }, h('select', { onchange: e => { cp(true); holder.setAttribute('resource', e.target.value); T.touch(holder); refresh(); } }, ...Object.keys(T.imgs).map(k => h('option', { value: k, selected: k === cur }, k))),
      h('button', { onclick: () => setTab('images') }, 'Edit images')));
  }
  const fn = kid(el, 'font');
  if (fn) b.append(h('h4', {}, 'Font'), h('select', { onchange: e => { cp(true); fn.setAttribute('resource', e.target.value); T.touch(fn); refresh(); } }, ...Object.keys(T.fonts).map(k => h('option', { value: k, selected: k === fn.getAttribute('resource') }, `${k} (${T.fonts[k].getAttribute('size')})`))));
  if (el.hasAttribute('style')) b.append(h('h4', {}, 'Style'), h('select', { onchange: e => { cp(true); el.setAttribute('style', e.target.value); T.touch(el); refresh(); buildTab(); } }, ...Object.keys(T.styles).map(k => h('option', { value: k, selected: k === el.getAttribute('style') }, k))));
  b.append(h('div', { style: 'margin-top:16px' }, h('button', { class: 'danger', onclick: () => { if (!confirm('Remove this element from the theme XML?')) return; cp(true); T.touch(el); el.remove(); sel = null; refresh(); buildTab(); } }, 'Delete element')));
}
// ---- presets ----
const PRESETS = {
  'Stock TWRP': { background_color: '#1A1A1A', accent_color: '#0090CA', text_color: '#EEEEEE', text_button_color: '#EEEEEE', highlight_color: '#1A1A1A80', fileselector_linecolor: '#555555', fileselector_highlight_color: '#555555', highlight: '#0090CA' },
  'AMOLED Black': { background_color: '#000000', accent_color: '#00E5FF', text_color: '#FFFFFF', text_button_color: '#FFFFFF', highlight_color: '#FFFFFF30', fileselector_linecolor: '#2A2A2A', fileselector_highlight_color: '#1F1F1F', highlight: '#00E5FF' },
  'Dracula': { background_color: '#282A36', accent_color: '#BD93F9', text_color: '#F8F8F2', text_button_color: '#F8F8F2', highlight_color: '#44475A99', fileselector_linecolor: '#44475A', fileselector_highlight_color: '#44475A', highlight: '#FF79C6' },
  'Nord': { background_color: '#2E3440', accent_color: '#88C0D0', text_color: '#ECEFF4', text_button_color: '#ECEFF4', highlight_color: '#4C566A99', fileselector_linecolor: '#4C566A', fileselector_highlight_color: '#434C5E', highlight: '#81A1C1' },
  'Catppuccin': { background_color: '#1E1E2E', accent_color: '#CBA6F7', text_color: '#CDD6F4', text_button_color: '#CDD6F4', highlight_color: '#585B7099', fileselector_linecolor: '#45475A', fileselector_highlight_color: '#313244', highlight: '#F5C2E7' },
  'Solarized': { background_color: '#002B36', accent_color: '#268BD2', text_color: '#EEE8D5', text_button_color: '#FDF6E3', highlight_color: '#58758180', fileselector_linecolor: '#073642', fileselector_highlight_color: '#073642', highlight: '#2AA198' },
  'Cyberpunk': { background_color: '#0B0B14', accent_color: '#FF2A6D', text_color: '#05D9E8', text_button_color: '#FFFFFF', highlight_color: '#FF2A6D55', fileselector_linecolor: '#7A1E48', fileselector_highlight_color: '#2A1230', highlight: '#FFD300' },
  'Paper Light': { background_color: '#F4F1EA', accent_color: '#2F6F6D', text_color: '#222222', text_button_color: '#F4F1EA', highlight_color: '#00000030', fileselector_linecolor: '#C9C4B8', fileselector_highlight_color: '#E3DED2', highlight: '#2F6F6D' }
};
function hsl(hu, s, l) { s /= 100; l /= 100; const a = s * Math.min(l, 1 - l), f = n => { const k = (n + hu / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); }; return '#' + f(0) + f(8) + f(4); }
const rgbOf = hex => { const p = hexParts(hex).rgb; return [1, 3, 5].map(i => parseInt(p.slice(i, i + 2), 16)); };
const mix = (a, b, t) => '#' + rgbOf(a).map((v, i) => Math.round(v + (rgbOf(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
// Recolor a PNG to a target color while keeping its shading (lightest pixel -> target, alpha untouched)
async function recolor(name, target) {
  const fn = T.imgs[name]; if (!fn) return;
  const img = await loadImg(T.imgUrl(name)), c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height), px = d.data, lum = i => .299 * px[i] + .587 * px[i + 1] + .114 * px[i + 2];
  let ref = 1; for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 40) ref = Math.max(ref, lum(i));
  const [r, g, b] = rgbOf(target);
  for (let i = 0; i < px.length; i += 4) if (px[i + 3]) { const f = lum(i) / ref; px[i] = Math.min(255, r * f); px[i + 1] = Math.min(255, g * f); px[i + 2] = Math.min(255, b * f); }
  x.putImageData(d, 0, 0); T.changed.images[fn] = c.toDataURL('image/png');
}
async function recolorAll() {
  const v = n => T.get(n), bg = v('background_color'), tx = v('text_color'), ac = v('accent_color');
  const btn = mix(bg, tx, .2), jobs = [];
  ['main_button', 'main_button_half_height', 'main_button_half_height_full_width', 'tab_3', 'tab_4'].forEach(n => jobs.push(recolor(n, btn)));
  ['back', 'home', 'console', 'tab_general', 'tab_timezone', 'tab_display', 'tab_vibration', 'tab_language', 'logo'].forEach(n => jobs.push(recolor(n, v('text_color'))));
  jobs.push(recolor('file', ac), recolor('folder', mix(bg, tx, .45)));
  await Promise.all(jobs);
}
let recolorOn = true;
async function applyPreset(p) {
  cp(true); for (const [k, v] of Object.entries(p)) {
    T.setVar(k, v); if (k === 'accent_color') T.setVar('accent_color_semitransparent', v + '30');
  }
  if (recolorOn) { try { await recolorAll(); } catch (e) { console.error(e); } }
  refresh(); buildTab(); toast('Palette applied');
}
function presetsTab(b) {
  const g = h('div', { class: 'presets' });
  Object.entries(PRESETS).forEach(([n, p]) => g.append(h('button', { class: 'pre', onclick: () => applyPreset(p) },
    h('div', { class: 'sw' }, ...['background_color', 'accent_color', 'text_color', 'fileselector_linecolor'].map(k => h('i', { style: `background:${p[k]}` }))), n)));
  b.append(h('label', { class: 'chk', style: 'margin-bottom:10px' }, h('input', { type: 'checkbox', checked: recolorOn, onchange: e => recolorOn = e.target.checked }), 'Also recolor button, tab & icon images to match'), g,
    h('h4', {}, 'Recolor images now'), h('button', { onclick: async () => { cp(true); await recolorAll(); refresh(); buildTab(); toast('Images recolored'); } }, 'Match images to current colors'),
    h('h4', {}, 'Surprise me'), h('button', { class: 'primary', onclick: () => { const hu = Math.random() * 360 | 0;
    applyPreset({ background_color: hsl(hu, 25, 8), accent_color: hsl((hu + 20) % 360, 80, 55), text_color: hsl(hu, 15, 93), text_button_color: hsl(hu, 15, 96), highlight_color: hsl(hu, 40, 60) + '55',
      fileselector_linecolor: hsl(hu, 15, 25), fileselector_highlight_color: hsl(hu, 20, 18), highlight: hsl((hu + 20) % 360, 80, 55) }); } }, 'Random palette'));
}
// ---- simulate ----
function simTab(b) {
  const tog = (label, k) => h('div', { class: 'row' }, h('div', { class: 'lb' }, h('b', {}, label), h('small', {}, k)), h('input', { type: 'checkbox', checked: T.sim[k] === '1', onchange: e => { T.sim[k] = e.target.checked ? '1' : '0'; refresh(); } }));
  b.append(h('h4', {}, 'Device state (preview only)'), tog('Samsung navbar order', 'tw_samsung_navbar'), tog('Hide CPU temp (shows version)', 'tw_no_cpu_temp'), tog('24-hour clock', 'tw_military_time'),
    tog('Hide battery %', 'tw_no_battery_percent'), tog('Hide keyboard', 'tw_hide_kb'), tog('Busy (running action)', 'tw_busy'), tog('Simulate actions banner', 'tw_simulate_actions'));
  const sl = (label, k, max) => h('div', { class: 'row' }, h('div', { class: 'lb' }, h('b', {}, label)), h('input', { type: 'range', max, value: T.sim[k], oninput: e => { T.sim[k] = e.target.value; refresh(); } }));
  b.append(sl('Battery %', 'tw_battery', 100), sl('CPU temp °C', 'tw_cpu_temp', 90),
    h('div', { class: 'row' }, h('div', { class: 'lb' }, h('b', {}, 'Font scale'), h('small', {}, 'Preview only — tweak if your fonts render larger/smaller')), h('input', { type: 'range', min: 70, max: 130, value: fontScale * 100, oninput: e => { fontScale = e.target.value / 100; refresh(); } })));
}
function buildTab() {
  const b = $('#tabBody'); const top = b.scrollTop; b.innerHTML = '';
  ({ colors: colorsTab, layout: layoutTab, images: imagesTab, element: elementTab, presets: presetsTab, sim: simTab })[tab](b);
  b.scrollTop = top;
}
// ---- top bar ----
$('#bBack').onclick = back; $('#pageSel').onchange = e => go(e.target.value);
$('#modeSeg').onclick = e => { const m = e.target.dataset.m; if (!m) return; mode = m; sel = m === 'edit' ? sel : null;
  document.querySelectorAll('#modeSeg button').forEach(x => x.classList.toggle('on', x.dataset.m === m)); refresh(); if (m === 'edit' && $('#panel').classList.contains('hidden')) toast('Tap or drag elements to edit them'); };
async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText); return r;
}
async function save() {
  try {
    const body = { ...T.payload(), commit: $('#optCommit').checked, push: $('#optPush').checked };
    const j = await (await post('/api/save', body)).json(); T.markSaved(); refresh(); buildTab();
    toast('Saved to source' + (j.git ? ' · ' + j.git : ''));
  } catch (e) { toast('Save failed: ' + e.message, 4000); }
}
$('#bSave').onclick = save;
$('#bExport').onclick = async () => {
  try { const r = await post('/api/export', T.payload()), u = URL.createObjectURL(await r.blob()); h('a', { href: u, download: 'ui.zip' }).click(); toast('ui.zip exported (source untouched)'); }
  catch (e) { toast('Export failed: ' + e.message, 4000); }
};
$('#bReload').onclick = async () => { if (T.hasChanges() && !confirm('Discard unsaved changes and reload from disk?')) return; await load(); toast('Reloaded'); };
document.addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
  else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !typing) { e.preventDefault(); e.shiftKey ? restore(redo, undo) : restore(undo, redo); }
  else if ((e.ctrlKey || e.metaKey) && e.key === 'y' && !typing) { e.preventDefault(); restore(redo, undo); }
  else if (!typing && sel && mode === 'edit') {
    const s = e.shiftKey ? 8 : 1, d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
    if (d) { e.preventDefault(); const pl = T.pl(sel.el); cp(); setPlace(sel.el, { x: String(pl.x + d[0]), y: String(pl.y + d[1]) }); refresh(); buildTab(); }
    else if (e.key === 'Escape') { sel = null; refresh(); buildTab(); }
  }
});
window.addEventListener('beforeunload', e => { if (T && T.hasChanges()) { e.preventDefault(); e.returnValue = ''; } });
try { await load(); } catch (e) { screen.textContent = 'Failed to load theme: ' + e.message; console.error(e); }
if (innerWidth > innerHeight) togglePanel(true);
})();
