// TWRP Theme Studio server - zero build step, only needs express.
// THEME_DIR can point at android_bootable_recovery/gui/theme to edit the real source tree.
const express = require('express');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const THEME_DIR = path.resolve(process.env.THEME_DIR || path.join(__dirname, 'theme'));
const DENSITY = process.env.DENSITY || 'portrait_hdpi';
const UI_PATH = path.join(THEME_DIR, DENSITY, 'ui.xml');
const COMMON_PATH = path.join(THEME_DIR, 'common', 'portrait.xml');
const IMG_DIR = path.join(THEME_DIR, DENSITY, 'images');

const read = p => fs.readFileSync(p, 'utf8');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const safeName = n => /^[A-Za-z0-9_\-]+$/.test(n);

function listFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    const full = path.join(dir, d.name);
    return d.isDirectory() ? listFiles(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  });
}

// Merge the client's changes on top of what is on disk (formatting-preserving for variable edits).
function applyChanges(body = {}) {
  let ui = read(UI_PATH), common = read(COMMON_PATH);
  const xml = body.xml || {};
  if (xml.ui) ui = xml.ui;
  else for (const [name, value] of Object.entries(body.vars || {})) {
    if (!safeName(name)) continue;
    const re = new RegExp('(<variable\\s+name="' + name + '"\\s+value=")[^"]*(")');
    ui = ui.replace(re, (_, a, b) => a + esc(value) + b);
  }
  if (xml.common) common = xml.common;
  const images = {};
  for (const [name, url] of Object.entries(body.images || {})) {
    const m = /^data:image\/png;base64,(.+)$/.exec(url || '');
    if (m && safeName(name)) images[name] = Buffer.from(m[1], 'base64');
  }
  return { ui, common, images };
}

// ---- minimal ZIP writer (deflate) ----
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function makeZip(entries) {
  const out = [], central = []; let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name), comp = zlib.deflateRawSync(data), crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    out.push(lh, nameBuf, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...out, cd, end]);
}

const app = express();
app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'src')));
app.use('/theme', express.static(THEME_DIR));

app.get('/api/theme', (req, res) => {
  try {
    res.json({
      ui: read(UI_PATH), common: read(COMMON_PATH),
      imageBase: `/theme/${DENSITY}/images`,
      images: fs.existsSync(IMG_DIR) ? fs.readdirSync(IMG_DIR).filter(f => f.endsWith('.png')) : [],
      themeDir: THEME_DIR,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/save', (req, res) => {
  try {
    const { ui, common, images } = applyChanges(req.body);
    if (req.body.xml?.ui || Object.keys(req.body.vars || {}).length) fs.writeFileSync(UI_PATH, ui);
    if (req.body.xml?.common) fs.writeFileSync(COMMON_PATH, common);
    fs.mkdirSync(IMG_DIR, { recursive: true });
    for (const [name, buf] of Object.entries(images)) fs.writeFileSync(path.join(IMG_DIR, name + '.png'), buf);
    let git = null;
    if (req.body.commit) {
      try {
        const run = a => execFileSync('git', a, { cwd: THEME_DIR, stdio: 'pipe' }).toString();
        run(['add', '-A', '.']);
        run(['commit', '-m', String(req.body.message || 'Theme edited via TWRP Theme Studio')]);
        git = 'committed';
        if (req.body.push) { try { run(['push']); git = 'committed & pushed'; } catch (e) { git = 'committed (push failed)'; } }
      } catch (e) { git = 'nothing to commit / git unavailable'; }
    }
    res.json({ status: 'ok', git });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// Build ui.zip from disk + the client's unsaved changes (does not touch the source tree).
app.post('/api/export', (req, res) => {
  try {
    const { ui, common, images } = applyChanges(req.body);
    const skip = new Set(['ui.xml']);
    const base = path.join(THEME_DIR, DENSITY);
    const entries = [{ name: 'ui.xml', data: Buffer.from(ui) }, { name: 'portrait.xml', data: Buffer.from(common) }];
    for (const rel of listFiles(base)) {
      if (skip.has(rel)) continue;
      const m = /^images\/(.+)\.png$/.exec(rel);
      entries.push({ name: rel, data: m && images[m[1]] ? images[m[1]] : fs.readFileSync(path.join(base, rel)) });
    }
    for (const [name, buf] of Object.entries(images)) if (!entries.some(e => e.name === `images/${name}.png`)) entries.push({ name: `images/${name}.png`, data: buf });
    res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="ui.zip"' });
    res.send(makeZip(entries));
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.listen(PORT, HOST, () => {
  console.log(`TWRP Theme Studio  ->  http://localhost:${PORT}`);
  console.log(`Theme source       ->  ${THEME_DIR}`);
});
