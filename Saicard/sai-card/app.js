/* Sai Life Sciences business card generator
 * All geometry in PDF points (1 pt = 0.352778 mm), page origin top-left,
 * measured from the supplied artwork Shiv_card.pdf. */
(() => {
  const { PDFDocument, cmyk } = PDFLib;

  // ---------- Geometry (page incl. bleed + slug for crop marks) ----------
  const PAGE = { w: 306.945, h: 221.906 };
  const TRIM = { x: 33, y: 33, w: 240.945, h: 155.906 };
  const BLEED = { x: 24.496, y: 24.497, w: 257.953, h: 172.913 };
  const MARGIN = 17.008; // 6 mm
  const SAFE_RIGHT = TRIM.x + TRIM.w - MARGIN; // 256.937

  const L = {
    front: {
      name: { x: 154.1211, base: 59.5193, size: 9 },
      titleFirstGap: 9.855, lead: 9,
      contact: { x: 153.3, lastBase: 172.16, size: 9, emailSize: 8.5 },
      maxW: SAFE_RIGHT - 154.1211, // ~102.8 pt (36.3 mm)
    },
    back: {
      x: 49.3267, size: 9, lead: 9,
      webBase: 171.9949,
      addrGap: 16.047, // website baseline -> last address baseline
      qr: { x: 190.387, y: 105.736, size: 66.579 },
      maxW: 190.387 - MARGIN - 49.3267, // ~124 pt to keep 6 mm from QR... widened below
    },
    minSize: 7,
  };
  // back column: allow up to 6 mm gap before the QR
  L.back.maxW = 190.387 - 6.5 - 49.3267; // ~134.6 pt (47.3 mm)

  const COLORS = {
    k100: { pdf: cmyk(0, 0, 0, 1), css: '#231f20' },
    k80: { pdf: cmyk(0, 0, 0, 0.8), css: '#58595b' },
    rich: { pdf: cmyk(0.906, 0.785, 0.617, 0.969), css: '#000000' },
  };

  const SAMPLE = {
    unit: 'unit2',
    name: 'Shivanand Kokatnur',
    title: 'Sr. Vice President & Head,\nManufacturing Science\n& Technology (MSAT)',
    mobile: '+91 733 734 8197',
    direct: '',
    email: 'shivanandkokatnur.s@sailife.com',
  };

  // Units pre-filled from the supplied card and Sai Life Sciences' published addresses
  // (annual report / stock-exchange filings). Verify before printing.
  const DEFAULT_SETTINGS = {
    website: 'www.sailife.com',
    websiteUrl: 'https://www.sailife.com/',
    labels: 'md', labelSingle: false, order: 'md',
    units: [
      { id: 'unit2', name: 'Unit II', company: 'Sai Life Sciences Limited',
        address: 'Unit II, Plot No. DS-4, DS-7 & DS-16,\nIKP Knowledge Park, Genome Valley,\nTurakpally village, Shamirpet,\nMedchal Malkajigiri (Dist.),\nHyderabad-500078, Telengana, India.' },
      { id: 'corp', name: 'Corporate Office', company: 'Sai Life Sciences Limited',
        address: 'Corporate Office,\nL4-01 & 02, SLN Terminus,\nSurvey #133, Gachibowli Miyapur Road,\nGachibowli, Hyderabad-500032,\nTelangana, India.' },
      { id: 'unit3', name: 'Unit III', company: 'Sai Life Sciences Limited',
        address: 'Unit III, Survey No. 296/7/3 & 4,\nBollaram, Jinnaram Mandal,\nMedak (Dist.),\nTelangana, India.' },
      { id: 'unit4', name: 'Unit IV', company: 'Sai Life Sciences Limited',
        address: 'Unit IV, Plot No. 79-A, 79-B, 80-A,\n80-B, 81-A & 82,\nKolhar Industrial Area,\nBidar-585403, Karnataka, India.' },
      { id: 'unit6', name: 'Unit VI', company: 'Sai Life Sciences Limited',
        address: 'Unit VI, Plot No. 136A, B & 137,\nKolhar Industrial Area,\nBidar-585403, Karnataka, India.' },
    ],
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  let SET = clone(DEFAULT_SETTINGS);
  const STORE = 'saiCardSettings';
  try { const j = JSON.parse(window.localStorage.getItem(STORE)); if (j && Array.isArray(j.units) && j.units.length) SET = { ...SET, ...j }; } catch (e) {}
  const persist = () => { try { window.localStorage.setItem(STORE, JSON.stringify(SET)); } catch (e) {} };

  // ---------- State ----------
  const S = { fonts: null, templateBytes: null, csvRows: [] };
  const $ = (s) => document.querySelector(s);
  const form = $('#cardForm');

  // ---------- Font handling ----------
  const MEM = {};
  async function idbGet(k) { return MEM[k] || null; }
  async function idbSet(k, v) { if (v == null) delete MEM[k]; else MEM[k] = v; }
  const isCFF = (buf) => { const u = new Uint8Array(buf, 0, 4); return String.fromCharCode(...u) === 'OTTO'; };

  async function makeFont(buf, family) {
    const fk = fontkit.create(new Uint8Array(buf));
    const face = new FontFace(family, buf.slice(0));
    await face.load(); document.fonts.add(face);
    return { buf, fk, family, upm: fk.unitsPerEm, cff: isCFF(buf) };
  }

  async function loadFonts() {
    const [ur, us] = await Promise.all([idbGet('reg'), idbGet('semi')]);
    const fetchBuf = (u) => fetch(u).then((r) => r.arrayBuffer());
    const regBuf = ur ? ur.buf : await fetchBuf('assets/fallback-regular.ttf');
    const semiBuf = us ? us.buf : await fetchBuf('assets/fallback-semibold.ttf');
    const stamp = Date.now();
    S.fonts = {
      reg: await makeFont(regBuf, 'CardReg' + stamp),
      semi: await makeFont(semiBuf, 'CardSemi' + stamp),
      custom: { reg: ur?.name, semi: us?.name },
    };
    const c = S.fonts.custom;
    $('#fontStatus').textContent = (c.reg || c.semi)
      ? `Fonts: ${c.reg || 'Barlow SC Regular (fallback)'} · ${c.semi || 'Barlow SC SemiBold (fallback)'}`
      : 'Fonts: Barlow Semi Condensed (Calibre fallback) — upload Calibre in Fonts tab';
    $('#fontStatus').classList.toggle('ok', !!(c.reg && c.semi));
  }

  // Same metric pdf-lib uses: sum of glyph advances (no kerning)
  function width(font, text, size) {
    if (!text) return 0;
    const run = font.fk.layout(text);
    let w = 0; for (const g of run.glyphs) w += g.advanceWidth;
    return (w / font.upm) * size;
  }

  function wrap(font, text, size, maxW) {
    const out = [];
    for (const raw of String(text || '').split(/\r?\n/)) {
      const line = raw.trim(); if (!line) continue;
      if (width(font, line, size) <= maxW) { out.push(line); continue; }
      let cur = '';
      for (const word of line.split(/\s+/)) {
        const t = cur ? cur + ' ' + word : word;
        if (width(font, t, size) <= maxW || !cur) cur = t; else { out.push(cur); cur = word; }
      }
      if (cur) out.push(cur);
    }
    return out;
  }

  function fit(font, text, size, maxW, label, warns) {
    let s = size;
    while (s > L.minSize && width(font, text, s) > maxW) s = +(s - 0.25).toFixed(2);
    if (s < size) warns.push(`${label} reduced to ${s} pt to fit.`);
    if (width(font, text, s) > maxW) warns.push(`${label} is still too long at ${L.minSize} pt — please shorten it.`);
    return s;
  }

  // ---------- Layout engine (shared by preview + PDF) ----------
  function layout(d) {
    const F = S.fonts, warns = [];
    const front = [], back = [];
    const fl = L.front, bl = L.back;

    // FRONT – name block (top-anchored)
    let nameLines = [];
    if (d.name) {
      const nm = d.name.trim();
      let s = fl.name.size;
      while (s > 8 && width(F.semi, nm, s) > fl.maxW) s = +(s - 0.25).toFixed(2);
      if (width(F.semi, nm, s) <= fl.maxW) {
        if (s < fl.name.size) warns.push(`Name reduced to ${s} pt to fit.`);
        nameLines = [{ t: nm, s }];
      } else {
        nameLines = wrap(F.semi, nm, fl.name.size, fl.maxW).map((t) => ({ t, s: fl.name.size }));
        warns.push(`Long name split over ${nameLines.length} lines.`);
      }
      nameLines.forEach((n, i) => front.push({ t: n.t, x: fl.name.x, y: fl.name.base + i * fl.lead, size: n.s, font: 'semi', color: 'k100' }));
    }
    const titleLines = wrap(F.reg, d.title, 9, fl.maxW);
    let y = fl.name.base + Math.max(0, nameLines.length - 1) * fl.lead + fl.titleFirstGap;
    titleLines.forEach((t, i) => { front.push({ t, x: fl.name.x, y: y + i * fl.lead, size: 9, font: 'reg', color: 'k80' }); });
    const titleBottom = titleLines.length ? y + (titleLines.length - 1) * fl.lead : y - fl.titleFirstGap;

    // FRONT – contact block (bottom-anchored)
    const contact = phoneLines(d).map((p) => ({ t: p.t, size: fl.contact.size, label: p.label }));
    if (d.email) contact.push({ t: d.email, size: fl.contact.emailSize, label: 'Email' });
    const cMax = TRIM.x + TRIM.w - 11.34 - fl.contact.x; // original email runs to 4.4 mm from trim; allow 4 mm
    contact.forEach((c, i) => {
      const s = fit(F.reg, c.t, c.size, cMax, c.label, warns);
      const base = fl.contact.lastBase - (contact.length - 1 - i) * fl.lead;
      front.push({ t: c.t, x: fl.contact.x, y: base, size: s, font: 'reg', color: 'k80' });
    });
    const contactTop = fl.contact.lastBase - (contact.length - 1) * fl.lead - 9;
    if (contact.length && titleBottom + 6 > contactTop) warns.push('Designation runs into the phone/email block — use fewer lines.');
    if (!d.unitObj) warns.push('No unit selected — add one in Settings.');
    if (titleLines.length > 5) warns.push(`Designation has ${titleLines.length} lines; the original design uses 3.`);

    // BACK – website (bottom line), address (bottom-anchored), company
    if (d.website) {
      const s = fit(F.reg, d.website, bl.size, bl.maxW, 'Website', warns);
      back.push({ t: d.website, x: bl.x, y: bl.webBase, size: s, font: 'reg', color: 'k80' });
    }
    const addr = wrap(F.reg, d.address, bl.size, bl.maxW);
    const lastAddr = bl.webBase - bl.addrGap;
    addr.forEach((t, i) => back.push({ t, x: bl.x, y: lastAddr - (addr.length - 1 - i) * bl.lead, size: bl.size, font: 'reg', color: 'k80' }));
    if (d.company) {
      const s = fit(F.semi, d.company, bl.size, bl.maxW, 'Company name', warns);
      const cy = lastAddr - addr.length * bl.lead;
      back.push({ t: d.company, x: bl.x, y: cy, size: s, font: 'semi', color: 'rich' });
      if (cy - 7 < TRIM.y + MARGIN) warns.push('Address is too long for the back of the card.');
    }

    return { front, back, qr: buildQR(d), warns };
  }

  function phoneLines(d) {
    const nums = [];
    if (d.mobile) nums.push({ k: 'm', v: d.mobile.trim(), label: 'Mobile No' });
    if (d.direct) nums.push({ k: 'd', v: d.direct.trim(), label: 'Direct No' });
    if (SET.order === 'dm') nums.reverse();
    const useLabel = SET.labels !== 'none' && (nums.length > 1 || SET.labelSingle);
    const pre = SET.labels === 'full' ? { m: 'Mobile ', d: 'Direct ' } : { m: 'M ', d: 'D ' };
    return nums.map((n) => ({ t: (useLabel ? pre[n.k] : '') + n.v, label: n.label }));
  }

  // ---------- vCard + QR ----------
  const esc = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/\n/g, ' ').replace(/;/g, '\\;');
  function vcard(d) {
    const parts = (d.name || '').trim().split(/\s+/);
    const last = parts.length > 1 ? parts.pop() : '';
    const first = parts.join(' ');
    const title = String(d.title || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(' ');
    const addr = String(d.address || '').split(/\r?\n/).map((s) => s.trim().replace(/,$/, '')).filter(Boolean).join(', ');
    const L2 = ['BEGIN:VCARD', 'VERSION:3.0', `N:${esc(last)};${esc(first)}`, `FN:${esc(d.name)}`];
    if (d.company) L2.push(`ORG:${esc(d.company)}`);
    if (title) L2.push(`TITLE:${esc(title)}`);
    if (d.mobile) L2.push(`TEL;TYPE=CELL:${d.mobile.trim()}`);
    if (d.direct) L2.push(`TEL;TYPE=WORK:${d.direct.trim()}`);
    if (d.email) L2.push(`EMAIL:${d.email}`);
    const url = d.websiteUrl || (d.website ? 'https://' + d.website.replace(/^https?:\/\//, '') : '');
    if (url) L2.push(`URL:${url}`);
    if (addr) L2.push(`ADR;TYPE=WORK:;;${esc(addr)};;;;`);
    L2.push('END:VCARD');
    return L2.join('\r\n');
  }
  function buildQR(d) {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    const q = qrcode(0, 'L'); q.addData(vcard(d), 'Byte'); q.make();
    const n = q.getModuleCount(), m = L.back.qr.size / n, rects = [];
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (q.isDark(r, c)) { const s = c; while (c < n && q.isDark(r, c)) c++; rects.push([L.back.qr.x + s * m, L.back.qr.y + r * m, (c - s) * m, m]); }
        else c++;
      }
    }
    // single path, local coords (origin = QR top-left, y down); vertical runs merged too
    const path = rects.map(([x, y, w, h]) => `M${(x - L.back.qr.x).toFixed(4)} ${(y - L.back.qr.y).toFixed(4)}h${w.toFixed(4)}v${h.toFixed(4)}h${(-w).toFixed(4)}z`).join('');
    return { n, m, rects, path };
  }

  // ---------- Preview (SVG, same coordinates) ----------
  const NS = 'http://www.w3.org/2000/svg';
  function el(name, attrs, text) { const e = document.createElementNS(NS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; }
  function drawSvg(svg, img, items, qr) {
    svg.replaceChildren();
    svg.appendChild(el('image', { href: img, x: 0, y: 0, width: PAGE.w, height: PAGE.h }));
    for (const it of items) {
      const f = S.fonts[it.font];
      svg.appendChild(el('text', { x: it.x, y: it.y, 'font-size': it.size, fill: COLORS[it.color].css, style: `font-family:'${f.family}';font-kerning:none;white-space:pre` }, it.t));
    }
    if (qr) svg.appendChild(el('path', { d: qr.path, fill: '#000', transform: `translate(${L.back.qr.x} ${L.back.qr.y})`, 'shape-rendering': 'crispEdges' }));
    // guides
    const g = el('g', { class: 'guides' });
    g.appendChild(el('rect', { x: TRIM.x, y: TRIM.y, width: TRIM.w, height: TRIM.h, class: 'g-trim' }));
    g.appendChild(el('rect', { x: BLEED.x, y: BLEED.y, width: BLEED.w, height: BLEED.h, class: 'g-bleed' }));
    g.appendChild(el('rect', { x: TRIM.x + MARGIN, y: TRIM.y + MARGIN * 0.7, width: TRIM.w - 2 * MARGIN, height: TRIM.h - MARGIN * 1.4, class: 'g-safe' }));
    svg.appendChild(g);
  }

  function person() { const o = {}; for (const k of ['unit', 'name', 'title', 'mobile', 'direct', 'email']) o[k] = form.elements[k].value; return o; }
  function findUnit(key) {
    if (!key) return null; const k = String(key).trim().toLowerCase();
    return SET.units.find((u) => u.id === key) || SET.units.find((u) => u.name.trim().toLowerCase() === k) || null;
  }
  function withUnit(p) {
    const u = findUnit(p.unit) || null;
    return { ...p, unitObj: u, company: u ? u.company : '', address: u ? u.address : '', website: SET.website, websiteUrl: SET.websiteUrl };
  }
  function data() { return withUnit(person()); }

  let raf = 0;
  function render() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (!S.fonts) return;
      const d = data();
      const lay = layout(d);
      drawSvg($('#svgFront'), 'assets/template-front.png', lay.front, null);
      drawSvg($('#svgBack'), 'assets/template-back.png', lay.back, lay.qr);
      const w = $('#warnings'); w.replaceChildren();
      lay.warns.forEach((t) => { const li = document.createElement('li'); li.textContent = t; w.appendChild(li); });
    });
  }

  // ---------- PDF ----------
  async function addCard(pdf, tpl, fonts, d, trimOnly) {
    const lay = layout(d);
    const sides = [[tpl[0], lay.front, null], [tpl[1], lay.back, lay.qr]];
    for (const [emb, items, qr] of sides) {
      const p = pdf.addPage([PAGE.w, PAGE.h]);
      p.drawPage(emb, { x: 0, y: 0, width: PAGE.w, height: PAGE.h });
      for (const it of items) p.drawText(it.t, { x: it.x, y: PAGE.h - it.y, size: it.size, font: fonts[it.font], color: COLORS[it.color].pdf });
      if (qr) p.drawSvgPath(qr.path, { x: L.back.qr.x, y: PAGE.h - L.back.qr.y, color: COLORS.rich.pdf });
      if (trimOnly) { p.setMediaBox(TRIM.x, TRIM.y, TRIM.w, TRIM.h); p.setCropBox(TRIM.x, TRIM.y, TRIM.w, TRIM.h); p.setTrimBox(TRIM.x, TRIM.y, TRIM.w, TRIM.h); }
      else { p.setTrimBox(TRIM.x, TRIM.y, TRIM.w, TRIM.h); p.setBleedBox(BLEED.x, BLEED.y, BLEED.w, BLEED.h); }
    }
    return lay.warns;
  }

  async function newDoc() {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const tplDoc = await PDFDocument.load(S.templateBytes);
    const tpl = await pdf.embedPdf(tplDoc, [0, 1]);
    const F = S.fonts;
    const fonts = {
      reg: await pdf.embedFont(F.reg.buf, { subset: !F.reg.cff }),
      semi: await pdf.embedFont(F.semi.buf, { subset: !F.semi.cff }),
    };
    pdf.setTitle('Business card'); pdf.setCreator('Sai Life Sciences card generator'); pdf.setProducer('pdf-lib');
    return { pdf, tpl, fonts };
  }

  function save(bytes, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  const slug = (s) => (s || 'card').trim().replace(/[^\w]+/g, '_').replace(/^_|_$/g, '') || 'card';
  const trimOnly = () => document.querySelector('input[name=out]:checked').value === 'trim';

  async function download() {
    const btns = [$('#downloadBtn'), $('#downloadTop')]; btns.forEach((b) => { b.disabled = true; b.dataset.l = b.textContent; b.textContent = 'Generating…'; });
    try {
      const d = data(); const { pdf, tpl, fonts } = await newDoc();
      await addCard(pdf, tpl, fonts, d, trimOnly());
      save(await pdf.save(), `${slug(d.name)}_card${trimOnly() ? '_trim' : ''}.pdf`);
    } catch (e) { console.error(e); alert('Could not create PDF: ' + e.message); }
    btns.forEach((b) => { b.disabled = false; b.textContent = b.dataset.l; });
  }

  // ---------- CSV ----------
  function parseCSV(txt) {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < txt.length; i++) {
      const ch = txt[i];
      if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += ch;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    const clean = rows.filter((r) => r.some((c) => c.trim()));
    if (!clean.length) return [];
    const head = clean[0].map((h) => h.trim().toLowerCase());
    return clean.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
  }

  async function batch() {
    const btn = $('#batchBtn'); btn.disabled = true; btn.textContent = 'Generating…';
    try {
      const shared = person(); const { pdf, tpl, fonts } = await newDoc(); const issues = [];
      for (const r of S.csvRows) {
        const unitKey = r.unit && findUnit(r.unit) ? findUnit(r.unit).id : shared.unit;
        if (r.unit && !findUnit(r.unit)) issues.push(`${r.name}: unit "${r.unit}" not found, used ${findUnit(shared.unit)?.name || 'default'}.`);
        const d = withUnit({ unit: unitKey, name: r.name || '', title: (r.title || '').split('|').join('\n'), mobile: r.mobile || r.phone || '', direct: r.direct || r.phone2 || '', email: r.email || '' });
        const w = await addCard(pdf, tpl, fonts, d, trimOnly());
        if (w.length) issues.push(`${d.name}: ${w.join(' ')}`);
      }
      save(await pdf.save(), `cards_batch_${S.csvRows.length}.pdf`);
      $('#csvInfo').textContent = `Created ${S.csvRows.length} cards (${S.csvRows.length * 2} pages: front, back, front, back…).` + (issues.length ? ' Check: ' + issues.join(' · ') : '');
    } catch (e) { console.error(e); alert('Batch failed: ' + e.message); }
    btn.disabled = false; btn.textContent = 'Generate batch PDF';
  }

  // ---------- Wiring ----------
  function fill(d) { for (const [k, v] of Object.entries(d)) if (form.elements[k]) form.elements[k].value = v; }

  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
    document.querySelectorAll('.tabpane').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== t.dataset.tab));
  }));
  form.addEventListener('input', render);
  form.addEventListener('change', render);
  form.addEventListener('input', persist); form.addEventListener('change', persist);
  document.addEventListener('click', () => setTimeout(persist, 0));
  $('#guides').addEventListener('change', (e) => document.body.classList.toggle('show-guides', e.target.checked));
  $('#downloadBtn').addEventListener('click', download);
  $('#downloadTop').addEventListener('click', download);
  $('#batchBtn').addEventListener('click', batch);
  $('#resetBtn').addEventListener('click', () => { fill(SAMPLE); renderUnitSelect(); render(); });
  $('#sampleCsv').addEventListener('click', () => {
    const csv = 'name,title,mobile,direct,email,unit\n"Shivanand Kokatnur","Sr. Vice President & Head,|Manufacturing Science|& Technology (MSAT)","+91 733 734 8197","","shivanandkokatnur.s@sailife.com","Unit II"\n"Priya Sharma","Manager,|Quality Assurance","+91 98480 12345","+91 40 6815 6123","priya.sharma@sailife.com","Unit IV"\n';
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'cards_sample.csv'; a.click();
  });
  $('#csvFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    S.csvRows = parseCSV(await f.text()).filter((r) => r.name);
    $('#csvInfo').textContent = S.csvRows.length ? `${S.csvRows.length} people found: ${S.csvRows.slice(0, 5).map((r) => r.name).join(', ')}${S.csvRows.length > 5 ? '…' : ''}` : 'No rows with a "name" column found.';
    $('#batchBtn').disabled = !S.csvRows.length;
  });
  // Characters a card can need — fonts missing any of them are flagged (e.g. trial/test fonts)
  const NEEDED = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 @.,&()-+/#:'";
  function openFont(buf, psName) {
    let fk = fontkit.create(new Uint8Array(buf));
    if (fk.fonts) throw new Error('This is a font collection (.ttc). Please choose a single .otf/.ttf font.');
    return fk;
  }
  function missingChars(fk) { return [...NEEDED].filter((c) => !fk.hasGlyphForCodePoint(c.codePointAt(0))); }
  async function setFont(key, buf, name) {
    let fk;
    try { fk = openFont(buf); } catch (e) { alert(e.message.includes('collection') ? e.message : 'That is not a readable font file.'); return false; }
    const miss = missingChars(fk);
    const w = $('#fontWarn');
    if (miss.length) {
      const li = document.createElement('li');
      li.textContent = `${name} is missing ${miss.length} characters (${miss.join(' ').replace('  ', ' space ')}). It looks like a trial/test font — those characters would print as boxes. Not applied.`;
      w.appendChild(li); return false;
    }
    await idbSet(key, { buf, name }); return true;
  }
  async function onFont(key, input) {
    const f = input.files[0]; if (!f) return;
    $('#fontWarn').replaceChildren();
    if (await setFont(key, await f.arrayBuffer(), f.name)) { await loadFonts(); render(); }
    input.value = '';
  }
  $('#fontReg').addEventListener('change', (e) => onFont('reg', e.target));
  $('#fontSemi').addEventListener('change', (e) => onFont('semi', e.target));

  // ---- Local Font Access API (Chrome / Edge desktop) ----
  let LOCAL = [];
  $('#localFontsBtn').addEventListener('click', async () => {
    const msg = $('#localFontsMsg');
    if (!('queryLocalFonts' in window)) { msg.textContent = 'This browser cannot read installed fonts. Open the page in Google Chrome or Microsoft Edge on your computer, or use Option 2.'; return; }
    try {
      msg.textContent = 'Reading installed fonts…';
      LOCAL = (await window.queryLocalFonts()).sort((x, y) => x.fullName.localeCompare(y.fullName));
    } catch (e) {
      msg.textContent = 'Permission was blocked. Allow "Fonts" for this site (padlock icon in the address bar) and try again — or use Option 2. ' + (e && e.name === 'SecurityError' ? '(Not allowed inside this embedded preview — open the page directly.)' : '');
      return;
    }
    if (!LOCAL.length) { msg.textContent = 'No fonts were returned.'; return; }
    const fill = (sel, pick) => {
      sel.replaceChildren(...LOCAL.map((f, i) => { const o = document.createElement('option'); o.value = i; o.textContent = `${f.fullName}  (${f.style})`; return o; }));
      const i = LOCAL.findIndex(pick); if (i >= 0) sel.value = i;
    };
    const isCal = (f) => /calibre/i.test(f.family) && !/test/i.test(f.family);
    fill($('#localReg'), (f) => isCal(f) && /^regular$/i.test(f.style));
    fill($('#localSemi'), (f) => isCal(f) && /^semibold$/i.test(f.style) || isCal(f) && /semibold/i.test(f.fullName) && !/italic/i.test(f.fullName));
    $('#localFontsBox').classList.remove('hidden');
    const found = LOCAL.some(isCal);
    msg.textContent = `${LOCAL.length} installed fonts found.` + (found ? ' Calibre was found and pre-selected.' : ' Calibre was not found — pick the fonts to use.');
  });
  $('#localApply').addEventListener('click', async () => {
    $('#fontWarn').replaceChildren();
    const r = LOCAL[+$('#localReg').value], sm = LOCAL[+$('#localSemi').value];
    if (!r || !sm) return;
    try {
      const okR = await setFont('reg', await (await r.blob()).arrayBuffer(), r.fullName);
      const okS = await setFont('semi', await (await sm.blob()).arrayBuffer(), sm.fullName);
      await loadFonts(); render();
      $('#localFontsMsg').textContent = okR && okS ? `Using ${r.fullName} and ${sm.fullName}.` : 'Some fonts were not applied — see the warning below.';
    } catch (e) { $('#localFontsMsg').textContent = 'Could not read that font: ' + e.message; }
  });
  $('#fontReset').addEventListener('click', async () => { $('#fontWarn').replaceChildren(); await idbSet('reg', null); await idbSet('semi', null); await loadFonts(); render(); });

  // ---------- Settings UI ----------
  function renderUnitSelect() {
    const sel = $('#unitSelect'); const cur = sel.value || SAMPLE.unit;
    sel.replaceChildren(...SET.units.map((u) => { const o = document.createElement('option'); o.value = u.id; o.textContent = u.name || '(unnamed unit)'; return o; }));
    sel.value = SET.units.some((u) => u.id === cur) ? cur : (SET.units[0]?.id || '');
  }
  function renderUnits() {
    const list = $('#unitList'); list.replaceChildren();
    SET.units.forEach((u, i) => {
      const box = document.createElement('div'); box.className = 'unit-card';
      box.innerHTML = `<div class="unit-head"><input class="u-name" aria-label="Unit name" placeholder="Unit name (e.g. Unit II)"><button type="button" class="btn ghost small u-del" aria-label="Delete unit">Delete</button></div>
        <label>Company name<input class="u-company"></label>
        <label>Address <small>One line per row</small><textarea class="u-addr" rows="5"></textarea></label>`;
      box.querySelector('.u-name').value = u.name; box.querySelector('.u-company').value = u.company; box.querySelector('.u-addr').value = u.address;
      box.querySelector('.u-name').addEventListener('input', (e) => { u.name = e.target.value; renderUnitSelect(); });
      box.querySelector('.u-company').addEventListener('input', (e) => { u.company = e.target.value; });
      box.querySelector('.u-addr').addEventListener('input', (e) => { u.address = e.target.value; });
      box.querySelector('.u-del').addEventListener('click', () => { if (SET.units.length <= 1) { alert('Keep at least one unit.'); return; } if (confirm(`Delete ${u.name || 'this unit'}?`)) { SET.units.splice(i, 1); renderUnits(); renderUnitSelect(); render(); } });
      list.appendChild(box);
    });
  }
  function renderSettings() {
    $('#setWebsite').value = SET.website; $('#setWebsiteUrl').value = SET.websiteUrl;
    $('#setLabels').value = SET.labels; $('#setLabelSingle').checked = !!SET.labelSingle; $('#setOrder').value = SET.order;
    renderUnits(); renderUnitSelect();
  }
  $('#setWebsite').addEventListener('input', (e) => { SET.website = e.target.value; });
  $('#setWebsiteUrl').addEventListener('input', (e) => { SET.websiteUrl = e.target.value; });
  $('#setLabels').addEventListener('change', (e) => { SET.labels = e.target.value; render(); });
  $('#setLabelSingle').addEventListener('change', (e) => { SET.labelSingle = e.target.checked; render(); });
  $('#setOrder').addEventListener('change', (e) => { SET.order = e.target.value; render(); });
  $('#addUnit').addEventListener('click', () => {
    const id = 'u' + Date.now().toString(36);
    SET.units.push({ id, name: 'New unit', company: SET.units[0]?.company || 'Sai Life Sciences Limited', address: '' });
    renderUnits(); renderUnitSelect(); $('#unitList').lastElementChild.querySelector('.u-name').select();
  });
  $('#exportSettings').addEventListener('click', () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(SET, null, 2)], { type: 'application/json' }));
    a.download = 'card-settings.json'; a.click();
  });
  $('#importSettings').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (!Array.isArray(j.units) || !j.units.length) throw new Error('No units in file');
      SET = { ...clone(DEFAULT_SETTINGS), ...j, units: j.units.map((u, i) => ({ id: u.id || 'u' + i, name: u.name || '', company: u.company || '', address: u.address || '' })) };
      renderSettings(); render(); alert(`Loaded ${SET.units.length} units.`);
    } catch (err) { alert('Could not read settings file: ' + err.message); }
    e.target.value = '';
  });

  (async () => {
    renderSettings();
    fill(SAMPLE);
    S.templateBytes = await fetch('assets/template.pdf').then((r) => r.arrayBuffer());
    await loadFonts(); render();
  })();
})();
