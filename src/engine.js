// engine.js - TWRP theme model + renderer (native theme resolution, scaled by CSS)
(function () {
'use strict';
const $E = (t, c, p) => { const e = document.createElement(t); if (c) e.className = c; if (p) p.appendChild(e); return e; };
const kids = (el, tag) => [...el.children].filter(c => c.tagName === tag);
const kid = (el, tag) => [...el.children].find(c => c.tagName === tag) || null;
const ALIAS = { statusicons_align: 'status_centeralign_header_y' };
const SIM0 = {
  tw_busy: '0', tw_simulate_actions: '0', tw_no_cpu_temp: '0', tw_no_battery_percent: '0', tw_samsung_navbar: '0',
  tw_military_time: '0', tw_hide_kb: '0', tw_battery: '87', tw_cpu_temp: '38', tw_time: '9:41', tw_version: '3.7.0_12-0',
  tw_zip_location: '/sdcard/Download', tw_selectimage: '0', tw_gui_sort_order: '1',
  tw_filename: 'Magisk-v27.0.zip', tw_backup_name: '2026-11-18--09-41-00', tw_crypto_password: '', tw_confirm_formatdata: 'yes',
  ui_progress: '60', tw_screen_timeout_secs: '60', tw_brightness_pct: '80', tw_has_data_media: '1', tw_has_mtp: '1', tw_mtp_enabled: '1',
  tw_storage_display_name: 'Internal Storage', tw_storage_free_size: '23581', tw_partition_name: 'Data', tw_partition_mount_point: '/data',
  tw_partition_file_system: 'f2fs', tw_restore_name: '2026-11-18--09-41-00', tw_backups_folder: '/sdcard/TWRP/BACKUPS', tw_file: 'Magisk-v27.0.zip',
  tw_filename1: 'Magisk-v27.0.zip', tw_file_location1: '/sdcard/Download', tw_back: 'Back', tw_action: 'Reboot', tw_action_text1: 'Rebooting...',
  tw_filemanager_rename: 'file.zip', tw_backup_rename: 'backup', tw_custom_folder: '/sdcard/TWRP', tw_zip_queue_count: '1', tw_zip_index: '1',
  tw_active_slot: 'A', tw_time_zone_guioffset: '0', tw_size_progress: '60 / 100 MB', tw_operation: 'Installing', tw_min_system: '1024',
  tw_crypto_display: '****', tw_crypto_user_id: '0', tw_fm_type: 'File', tw_fileexists: '0', tw_include_encrypted_backup: '0', tw_is_encrypted: '0',
  tw_operation_state: '0', tw_operation_status: '0', tw_signed_zip_verify: '1', tw_install_reboot: '0', tw_use_compression: '1', tw_skip_md5_generate: '0'
};
const DRAW = new Set(['fill', 'text', 'image', 'button', 'background', 'fileselector', 'listbox', 'partitionlist', 'slider',
  'slidervalue', 'checkbox', 'input', 'console', 'terminal', 'keyboard', 'progressbar', 'patternpassword']);
const COLOR_ATTRS = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;

function serialize(doc) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escT = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const ser = (n, d) => {
    const t = '\t'.repeat(d);
    if (n.nodeType === 8) return `${t}<!--${n.data}-->\n`;
    if (n.nodeType !== 1) return '';
    const a = [...n.attributes].map(x => ` ${x.name}="${esc(x.value)}"`).join('');
    const ch = [...n.childNodes].filter(c => c.nodeType === 1 || c.nodeType === 8);
    const tx = [...n.childNodes].filter(c => c.nodeType === 3 || c.nodeType === 4).map(c => c.data).join('').trim();
    if (!ch.length) return tx ? `${t}<${n.tagName}${a}>${escT(tx)}</${n.tagName}>\n` : `${t}<${n.tagName}${a}/>\n`;
    return `${t}<${n.tagName}${a}>\n${ch.map(c => ser(c, d + 1)).join('')}${t}</${n.tagName}>\n`;
  };
  return '<?xml version="1.0"?>\n' + ser(doc.documentElement, 0);
}

class Theme {
  constructor(uiText, commonText, imgBase) {
    this.imgBase = imgBase;
    this.changed = { vars: {}, images: {} };   // images: filename -> png dataURL
    this.dirty = { ui: false, common: false };
    this.sim = { ...SIM0 };
    this.load(uiText, commonText);
  }
  parse(t) {
    const d = new DOMParser().parseFromString(t, 'application/xml');
    const err = d.querySelector('parsererror');
    if (err) throw new Error('XML parse error: ' + err.textContent.slice(0, 200));
    return d;
  }
  load(uiText, commonText) {
    this.ui = this.parse(uiText); this.common = this.parse(commonText); this.index();
  }
  index() {
    const all = (d, sel, f) => d.querySelectorAll(sel).forEach(f);
    this.varEl = {}; this.fonts = {}; this.imgs = {}; this.styles = {}; this.templates = {}; this.pages = {};
    all(this.ui, 'variables > variable', e => this.varEl[e.getAttribute('name')] = e);
    all(this.ui, 'resources > font', e => this.fonts[e.getAttribute('name')] = e);
    all(this.ui, 'resources > image', e => this.imgs[e.getAttribute('name')] = e.getAttribute('filename'));
    for (const d of [this.common, this.ui]) {
      all(d, 'styles > style', e => this.styles[e.getAttribute('name')] = e);
      all(d, 'templates > template', e => this.templates[e.getAttribute('name')] = e);
      all(d, 'pages > page', e => this.pages[e.getAttribute('name')] = e);
    }
  }
  snapshot() {
    const s = new XMLSerializer();
    return { ui: s.serializeToString(this.ui), common: s.serializeToString(this.common),
      changed: JSON.parse(JSON.stringify(this.changed)), dirty: { ...this.dirty } };
  }
  restore(s) {
    this.load(s.ui, s.common); this.changed = JSON.parse(JSON.stringify(s.changed)); this.dirty = { ...s.dirty };
  }
  touch(node) { this.dirty[node.ownerDocument === this.ui ? 'ui' : 'common'] = true; }
  setVar(name, value) {
    const e = this.varEl[name]; if (!e) return;
    e.setAttribute('value', value); this.changed.vars[name] = value;
  }
  hasChanges() { return this.dirty.ui || this.dirty.common || Object.keys(this.changed.vars).length || Object.keys(this.changed.images).length; }
  payload() {
    const xml = {};
    if (this.dirty.ui) xml.ui = serialize(this.ui);
    if (this.dirty.common) xml.common = serialize(this.common);
    return { vars: this.changed.vars, images: this.changed.images, xml };
  }
  markSaved() { this.changed = { vars: {}, images: {} }; this.dirty = { ui: false, common: false }; }

  // ---- variables ----
  get(n, depth = 0) {
    if (n in this.sim) return String(this.sim[n]);
    const e = this.varEl[n];
    if (e) return this.res(e.getAttribute('value'), depth + 1);
    if (ALIAS[n]) return this.get(ALIAS[n], depth + 1);
    if (/^(clock_12_pos|clock_24_pos|cpu_pos|battery_pos)$/.test(n)) return '0';
    return undefined;
  }
  res(s, depth = 0) {
    if (s == null) return ''; s = String(s); if (depth > 8) return s;
    s = s.replace(/%([A-Za-z0-9_]+)%/g, (m, n) => { const v = this.get(n, depth + 1); return v === undefined ? m : v; });
    s = s.replace(/\{@[^=}]*=([^}]*)\}/g, '$1');
    return s.replace(/\{([A-Za-z0-9_]+)\}/g, (m, n) => { const v = this.get(n, depth + 1); return v === undefined ? m : v; });
  }
  num(s) {
    s = this.res(s).trim(); if (s === '') return 0;
    if (/^-?\d+(\.\d+)?$/.test(s)) return +s;
    const v = this.get(s); return v !== undefined && v !== s ? this.num(v) : 0;
  }
  col(s) { s = this.res(s).trim(); return /^#[0-9a-f]{3,8}$/i.test(s) ? s : 'transparent'; }
  val(n) { const v = this.get(n); return v === undefined ? (/^tw_/.test(n) ? '0' : n) : v; }
  test(c) {
    const a = this.val(c.getAttribute('var1')), b = this.val(c.getAttribute('var2') || ''), op = c.getAttribute('op') || '=';
    const na = parseFloat(a), nb = parseFloat(b), numeric = !isNaN(na) && !isNaN(nb);
    const x = numeric ? na : a, y = numeric ? nb : b;
    switch (op) { case '=': return x === y; case '!=': return x !== y; case '>': return x > y; case '<': return x < y;
      case '>=': return x >= y; case '<=': return x <= y; default: return true; }
  }
  cond(el) {
    for (const c of el.children) {
      if (c.tagName === 'condition' && !this.test(c)) return false;
      if (c.tagName === 'conditions') for (const k of c.children) if (k.tagName === 'condition' && !this.test(k)) return false;
    }
    return true;
  }
  // ---- styles & placement ----
  style(el) { return this.styles[el.getAttribute('style') || el.tagName] || null; }
  sc(el, tag) { return kid(el, tag) || (this.style(el) && kid(this.style(el), tag)) || null; }
  pl(el) {
    const p = this.sc(el, 'placement');
    const g = a => p && p.hasAttribute(a) ? this.num(p.getAttribute(a)) : undefined;
    return { x: g('x') || 0, y: g('y') || 0, w: g('w'), h: g('h'), p: p && p.hasAttribute('placement') ? +p.getAttribute('placement') : 0, node: p };
  }
  font(el) {
    const own = kid(el, 'font'), st = this.style(el), sf = st && kid(st, 'font');
    const r = (own && own.getAttribute('resource')) || (sf && sf.getAttribute('resource')) || 'font_m';
    const color = el.getAttribute('color') || (own && own.getAttribute('color')) || (sf && sf.getAttribute('color')) || '%text_color%';
    const fe = this.fonts[r];
    return { res: r, size: fe ? +fe.getAttribute('size') || 36 : 36, color: this.col(color), fixed: r === 'fixed' };
  }
  textOf(el) { const c = kid(el, 'text'); return c ? this.res(c.textContent.trim()) : ''; }
  imgUrl(name) {
    const fn = this.imgs[name]; if (!fn) return '';
    return this.changed.images[fn] || `${this.imgBase}/${fn}.png`;
  }
  isDrawable(page) { return [...page.children].some(c => DRAW.has(c.tagName) || c.tagName === 'template'); }
  pageNames() { return Object.keys(this.pages).filter(n => this.isDrawable(this.pages[n])); }
  actionsOf(el) {
    const out = [];
    for (const c of el.children) {
      if (c.tagName === 'action' && c.hasAttribute('function')) out.push(c);
      else if (c.tagName === 'actions') for (const a of c.children) if (a.tagName === 'action' && a.hasAttribute('function')) out.push(a);
    }
    return out;
  }
  literalColors() {
    const map = new Map();
    for (const d of [this.ui, this.common]) for (const e of d.getElementsByTagName('*')) for (const a of e.attributes)
      if (a.name !== 'name' && COLOR_ATTRS.test(a.value)) { const k = a.value.toLowerCase(); if (!map.has(k)) map.set(k, []); map.get(k).push({ el: e, attr: a.name }); }
    return map;
  }
}

class Renderer {
  constructor(theme, root) { this.t = theme; this.root = root; this.nodes = []; }
  reg(d, node) { d.dataset.n = this.nodes.length; this.nodes.push(node); }
  render(name) {
    const t = this.t, root = this.root; root.innerHTML = ''; this.nodes = [];
    root.style.width = (t.num('screen_width') || 1080) + 'px';
    root.style.height = (t.num('screen_height') || 1920) + 'px';
    root.style.background = '#000';
    const page = t.pages[name];
    if (!page) { root.textContent = 'Page not found: ' + name; return; }
    this.walk(page, root, null);
  }
  walk(parent, box, tpl) {
    for (const el of parent.children) {
      const tag = el.tagName;
      if (tag === 'template') { const tp = this.t.templates[el.getAttribute('name')]; if (tp && this.t.cond(el)) this.walk(tp, box, tp); continue; }
      if (!DRAW.has(tag) || !this.t.cond(el)) continue;
      this['d_' + tag](el, box, tpl);
    }
  }
  box(el, box, cls, pl, tpl) {
    const d = $E('div', 'o ' + cls, box);
    d.style.left = pl.x + 'px'; d.style.top = pl.y + 'px';
    if (pl.w !== undefined) d.style.width = pl.w + 'px';
    if (pl.h !== undefined) d.style.height = pl.h + 'px';
    const p = pl.p, tx = p === 1 || p === 3 ? -100 : p === 4 || p === 5 ? -50 : 0, ty = p === 2 || p === 3 ? -100 : p === 4 ? -50 : 0;
    if (tx || ty) d.style.transform = `translate(${tx}%,${ty}%)`;
    this.reg(d, { el, tpl });
    return d;
  }
  img(name, cls) { const i = new Image(); i.draggable = false; i.className = cls || 'im'; i.src = this.t.imgUrl(name); i.alt = name || ''; return i; }
  label(t, el, parent, extra) {
    const f = t.font(el), s = $E('span', 'tx', parent);
    s.style.fontSize = f.size + 'px'; s.style.color = f.color; if (f.fixed) s.classList.add('mono');
    return s;
  }
  d_background(el) { this.root.style.background = this.t.col(el.getAttribute('color')); }
  d_fill(el, box, tpl) {
    const t = this.t, d = this.box(el, box, 'fill', t.pl(el), tpl);
    d.style.background = t.col(el.getAttribute('color'));
  }
  d_text(el, box, tpl) {
    const t = this.t, pl = t.pl(el), d = this.box(el, box, 'txt', pl, tpl), f = t.font(el);
    d.textContent = t.textOf(el);
    d.style.fontSize = f.size + 'px'; d.style.color = f.color; if (f.fixed) d.classList.add('mono');
  }
  d_image(el, box, tpl) {
    const t = this.t, pl = t.pl(el), d = this.box(el, box, 'img', pl, tpl);
    const c = kid(el, 'image'), r = (c && c.getAttribute('resource')) || el.getAttribute('resource');
    const i = this.img(r); if (pl.w !== undefined) i.style.width = '100%'; if (pl.h !== undefined) i.style.height = '100%'; d.appendChild(i);
  }
  d_button(el, box, tpl) {
    const t = this.t, pl = t.pl(el), d = this.box(el, box, 'btn', pl, tpl), st = t.style(el);
    const imgN = kid(el, 'image') || (st && kid(st, 'image'));
    const res = imgN && imgN.getAttribute('resource');
    if (res) d.appendChild(this.img(res));
    const fillN = t.sc(el, 'fill');
    if (fillN && !res) d.style.background = t.col(fillN.getAttribute('color'));
    const hl = t.sc(el, 'highlight');
    d.style.setProperty('--hl', hl ? t.col(hl.getAttribute('color')) : 'transparent');
    const txt = t.textOf(el);
    const tpl6 = pl.node && pl.node.getAttribute('textplacement') === '6';
    if (txt) { const f = t.font(el), s = $E('span', 'tx bt', d); s.textContent = txt; s.style.fontSize = f.size + 'px'; s.style.color = f.color; if (res && !tpl6) s.classList.add('abs'); else if (tpl6) d.style.gap = '24px'; }
    d.dataset.nav = '1';
  }
  list(el, box, tpl, kind) {
    const t = this.t, pl = t.pl(el), st = t.style(el), d = this.box(el, box, 'list', pl, tpl);
    const bg = st && kid(st, 'background'); if (bg) d.style.background = t.col(bg.getAttribute('color'));
    const hdr = st && kid(st, 'header'), sep = st && kid(st, 'separator'), hl = st && kid(st, 'highlight'), icon = t.sc(el, 'icon');
    const ff = t.font(el), fs = ff.size;
    const sepCol = t.col(sep ? sep.getAttribute('color') : '%fileselector_linecolor%');
    const sepH = t.num(sep ? sep.getAttribute('height') : '%fileselector_separatorheight%') || 2;
    const title = t.textOf(el);
    if (title) {
      const h = $E('div', 'lrow lhead', d); h.textContent = title; h.style.fontSize = fs + 'px';
      h.style.color = t.col(hdr ? hdr.getAttribute('textcolor') : '%accent_color%');
      h.style.borderBottom = `${t.num(hdr ? hdr.getAttribute('separatorheight') : 2) || 2}px solid ${t.col(hdr ? hdr.getAttribute('separatorcolor') : '%accent_color%')}`;
    }
    let rows;
    if (kind === 'fileselector') rows = [['folder', '..'], ['folder', 'Download'], ['folder', 'DCIM'], ['folder', 'Android'], ['file', 'Magisk-v27.0.zip'], ['file', 'LineageOS-21.zip'], ['file', 'boot.img']].map(([i, n]) => ({ icon: i, text: n }));
    else if (kind === 'partitionlist') rows = ['Boot (64MB)', 'System (2048MB)', 'Vendor (512MB)', 'Data (23581MB)', 'Cache (256MB)', 'Recovery (96MB)'].map((n, i) => ({ text: n, sel: i % 2 === 0 }));
    else rows = kids(el, 'listitem').filter(li => t.cond(li)).map((li, i) => {
      const dv = kid(li, 'data'), v = dv && dv.getAttribute('variable');
      return { text: t.res(li.getAttribute('name')), sel: v && v in t.sim ? t.sim[v] === '1' : i % 2 === 0 };
    });
    rows.forEach((r, i) => {
      const row = $E('div', 'lrow', d); row.style.minHeight = Math.round(fs * 2.1) + 'px'; row.style.fontSize = fs + 'px'; row.style.color = ff.color;
      row.style.borderBottom = `${sepH}px solid ${sepCol}`;
      if (kind === 'fileselector' && i === 4 && hl) row.style.background = t.col(hl.getAttribute('color'));
      let name = r.icon;
      if (icon) { if (kind === 'fileselector') name = icon.getAttribute(r.icon); else name = icon.getAttribute(r.sel ? 'selected' : 'unselected'); }
      if (name && t.imgs[name]) row.appendChild(this.img(name));
      const tx = $E('span', 'tx', row); tx.textContent = r.text;
    });
  }
  d_fileselector(e, b, t) { this.list(e, b, t, 'fileselector'); }
  d_listbox(e, b, t) { this.list(e, b, t, 'listbox'); }
  d_partitionlist(e, b, t) { this.list(e, b, t, 'partitionlist'); }
  d_slider(el, box, tpl) {
    const t = this.t, pl = t.pl(el); if (!pl.p) pl.p = 5;
    const d = this.box(el, box, 'slider', pl, tpl), rs = t.sc(el, 'resource');
    const base = rs && rs.getAttribute('base'), used = rs && rs.getAttribute('used'), touch = rs && rs.getAttribute('touch');
    if (base) d.appendChild(this.img(base));
    if (used) { const u = $E('div', 'abs clip', d); u.style.width = '30%'; u.appendChild(this.img(used)); }
    if (touch) { const h = this.img(touch); h.classList.add('abs'); h.style.left = '0'; d.appendChild(h); }
    const f = t.font(el), s = $E('span', 'tx abs ctr', d); s.textContent = t.textOf(el); s.style.fontSize = f.size + 'px'; s.style.color = f.color;
  }
  d_slidervalue(el, box, tpl) {
    const t = this.t, pl = t.pl(el), d = this.box(el, box, 'sv', pl, tpl), f = t.font(el);
    const l = $E('div', 'tx', d); l.textContent = t.textOf(el) + ' 60'; l.style.fontSize = f.size + 'px'; l.style.color = f.color;
    const dim = kid(t.style(el) || el, 'dimensions'), lh = dim ? t.num(dim.getAttribute('lineh')) || 3 : 3;
    const line = $E('div', 'svline', d); line.style.height = lh + 'px'; line.style.background = t.col('%fileselector_linecolor%');
    const rs = kid(t.style(el) || el, 'resource'), hn = rs && rs.getAttribute('handle');
    if (hn) { const h = this.img(hn); h.classList.add('abs'); h.style.left = '50%'; h.style.bottom = '0'; d.appendChild(h); }
    d.style.height = (f.size * 1.4 + (hn ? 108 : 40)) + 'px';
  }
  d_checkbox(el, box, tpl) {
    const t = this.t, pl = t.pl(el), d = this.box(el, box, 'cb', pl, tpl), im = t.sc(el, 'image'), f = t.font(el);
    const dv = kid(el, 'data'), v = dv && dv.getAttribute('variable'), on = v && v in t.sim ? t.sim[v] === '1' : true;
    if (im) d.appendChild(this.img(im.getAttribute(on ? 'checked' : 'unchecked')));
    const s = $E('span', 'tx', d); s.textContent = t.textOf(el); s.style.fontSize = f.size + 'px'; s.style.color = f.color;
  }
  d_input(el, box, tpl) {
    const t = this.t, pl = t.pl(el), d = this.box(el, box, 'inp', pl, tpl), f = t.font(el), bg = t.sc(el, 'background'), cur = t.sc(el, 'cursor');
    if (bg) d.style.background = t.col(bg.getAttribute('color'));
    const s = $E('span', 'tx', d); s.textContent = t.textOf(el); s.style.fontSize = f.size + 'px'; s.style.color = f.color;
    const c = $E('i', 'cursor', d); c.style.background = cur ? t.col(cur.getAttribute('color')) : '#fff'; c.style.width = (cur ? t.num(cur.getAttribute('width')) : 3) + 'px';
  }
  term(el, box, tpl, lines) {
    const t = this.t, pl = t.pl(el), d = this.box(el, box, 'con mono', pl, tpl), st = t.style(el);
    const c = st && kid(st, 'color'), bg = st && kid(st, 'background'), f = t.font(el);
    d.style.background = t.col(c ? c.getAttribute('background') : bg ? bg.getAttribute('color') : '%background_color%');
    const fg = c ? t.col(c.getAttribute('foreground')) : f.color;
    d.style.color = fg; d.style.fontSize = (f.res === 'fixed' || !st ? f.size : t.fonts.fixed ? +t.fonts.fixed.getAttribute('size') : 30) + 'px';
    lines.forEach(([txt, k]) => { const l = $E('div', 'cl', d); l.textContent = txt; if (k) l.style.color = t.col(k); });
  }
  d_console(el, box, tpl) {
    this.term(el, box, tpl, [["Installing zip file '/sdcard/Download/Magisk-v27.0.zip'"], ['Checking for Digest file...'], ['Patching system image unconditionally...'],
      ['Updating partition details...', '%text_success_color%'], ['...done'], ['Unmounting System...'], ['E: sample error line', '%text_fail_color%'], ['Done processing script file']]);
  }
  d_terminal(el, box, tpl) { this.term(el, box, tpl, [['~ # ls /sdcard'], ['Android  DCIM  Download  Pictures'], ['~ # _']]); }
  d_progressbar(el, box, tpl) {
    const t = this.t, pl = t.pl(el), d = this.box(el, box, 'pb', pl, tpl), rs = kid(el, 'resource');
    if (!rs) return;
    d.appendChild(this.img(rs.getAttribute('empty')));
    const c = $E('div', 'abs clip', d); c.style.width = '60%'; c.appendChild(this.img(rs.getAttribute('full')));
  }
  d_patternpassword(el, box, tpl) {
    const t = this.t, pl = t.pl(el), d = this.box(el, box, 'pat', pl, tpl), dot = kid(el, 'dot');
    const r = dot ? t.num(dot.getAttribute('radius')) : 32, w = pl.w || 800;
    d.style.height = (pl.h || w) + 'px';
    for (let i = 0; i < 9; i++) { const p = $E('i', 'dot', d); p.style.width = p.style.height = r + 'px';
      p.style.left = (i % 3) * (w - r) / 2 + 'px'; p.style.top = Math.floor(i / 3) * (w - r) / 2 + 'px';
      p.style.background = t.col(dot ? dot.getAttribute(i === 4 ? 'activecolor' : 'color') : '#555'); }
  }
  d_keyboard(el, box, tpl) {
    const t = this.t, pl = t.pl(el), d = this.box(el, box, 'kb', pl, tpl), layout = kid(el, 'layout1'); if (!layout) return;
    const bg = kid(el, 'background'); if (bg) d.style.background = t.col(bg.getAttribute('color'));
    const km = kid(el, 'keymargin'), mx = km ? +km.getAttribute('x') || 0 : 0, my = km ? +km.getAttribute('y') || 0 : 0;
    const ks = kid(layout, 'keysize'), kh = +ks.getAttribute('height'), kw = +ks.getAttribute('width');
    const an = kid(el, 'key-alphanumeric'), ot = kid(el, 'key-other');
    const labels = {}; [el, layout].forEach(p => kids(p, 'keylabel').forEach(k => labels[k.getAttribute('key')] = k));
    d.style.paddingTop = my / 2 + 'px';
    for (let r = 1; r <= 6; r++) {
      const row = kid(layout, 'row' + r); if (!row) continue;
      const rowEl = $E('div', 'kbrow', d); rowEl.style.height = kh + 'px'; rowEl.style.marginBottom = my + 'px'; rowEl.style.paddingLeft = mx / 2 + 'px';
      [...row.attributes].filter(a => /^key\d+$/.test(a.name)).sort((a, b) => a.name.slice(3) - b.name.slice(3)).forEach(a => {
        let w = kw, c = a.value; const m = /^(\d+):([\s\S]*)$/.exec(c); if (m) { w = +m[1]; c = m[2]; }
        const k = $E('div', 'key', rowEl); k.style.width = (w - mx) + 'px'; k.style.marginRight = mx + 'px';
        if (c === '') { k.style.visibility = 'hidden'; return; }
        const lab = labels['0:' + c] || labels[c], special = c.length > 1 || lab, cfg = special ? ot : an;
        if (cfg) k.style.background = t.col(cfg.getAttribute('color'));
        const txt = $E('span', 'tx', k); txt.style.color = cfg ? t.col(cfg.getAttribute('textcolor')) : '#eee';
        const fnt = cfg && t.fonts[cfg.getAttribute('font')]; txt.style.fontSize = (fnt ? fnt.getAttribute('size') : 46) + 'px';
        const res = lab && lab.getAttribute('resource');
        if (res && t.imgs[res]) { txt.remove(); k.appendChild(this.img(res)); } else txt.textContent = lab ? lab.getAttribute('text') : c;
      });
    }
  }
}
window.Engine = { Theme, Renderer, serialize, kid, kids };
})();
