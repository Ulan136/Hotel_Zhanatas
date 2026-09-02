'use client';

/* Настоящий PDF без сторонних библиотек.
   Кириллицу обычные PDF-шрифты не знают, поэтому вшиваем свой шрифт
   (см. lib/pdffont.js) как CIDFontType2 с кодировкой Identity-H:
   в текст пишем не буквы, а номера глифов. */

import { FONT_REGULAR, FONT_BOLD, fontBytes } from './pdffont';

/* --------------------- разбор шрифта --------------------- */

/* Из TTF нам нужны: размер em, ширины букв, таблица «символ → номер глифа»
   и габариты для описателя шрифта. */
function parseFont(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = {};
  const numTables = dv.getUint16(4);
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    let tag = '';
    for (let k = 0; k < 4; k++) tag += String.fromCharCode(bytes[o + k]);
    tables[tag] = { off: dv.getUint32(o + 8), len: dv.getUint32(o + 12) };
  }

  const head = tables.head.off;
  const unitsPerEm = dv.getUint16(head + 18) || 1000;
  const bbox = [dv.getInt16(head + 36), dv.getInt16(head + 38),
    dv.getInt16(head + 40), dv.getInt16(head + 42)];

  const numGlyphs = dv.getUint16(tables.maxp.off + 4);
  const hhea = tables.hhea.off;
  const ascent = dv.getInt16(hhea + 4);
  const descent = dv.getInt16(hhea + 6);
  const numHMetrics = dv.getUint16(hhea + 34);

  // Ширины: сначала пары (ширина, левый вынос), дальше все глифы шириной как последний.
  const widths = new Array(numGlyphs).fill(0);
  const hm = tables.hmtx.off;
  let last = 0;
  for (let g = 0; g < numGlyphs; g++) {
    if (g < numHMetrics) last = dv.getUint16(hm + g * 4);
    widths[g] = last;
  }

  return { dv, tables, unitsPerEm, bbox, numGlyphs, ascent, descent, widths, cmap: readCmap(dv, tables.cmap.off) };
}

// Таблица cmap: поддерживаем формат 4 (BMP) и 12 (полный Unicode).
function readCmap(dv, base) {
  const n = dv.getUint16(base + 2);
  let best = 0;
  for (let i = 0; i < n; i++) {
    const rec = base + 4 + i * 8;
    const pid = dv.getUint16(rec);
    const eid = dv.getUint16(rec + 2);
    const off = base + dv.getUint32(rec + 4);
    const fmt = dv.getUint16(off);
    const score = (fmt === 12 ? 4 : 0) + (pid === 3 && (eid === 1 || eid === 10) ? 2 : 0) + (pid === 0 ? 1 : 0);
    if (!best || score > best.score) best = { off, fmt, score };
  }
  const map = new Map();
  if (!best) return map;

  if (best.fmt === 4) {
    const segX2 = dv.getUint16(best.off + 6);
    const seg = segX2 / 2;
    const endO = best.off + 14;
    const startO = endO + segX2 + 2;
    const deltaO = startO + segX2;
    const rangeO = deltaO + segX2;
    for (let s = 0; s < seg; s++) {
      const end = dv.getUint16(endO + s * 2);
      const start = dv.getUint16(startO + s * 2);
      const delta = dv.getInt16(deltaO + s * 2);
      const ro = dv.getUint16(rangeO + s * 2);
      if (start === 0xffff) continue;
      for (let c = start; c <= end && c !== 0x10000; c++) {
        let g;
        if (ro === 0) g = (c + delta) & 0xffff;
        else {
          const gi = rangeO + s * 2 + ro + (c - start) * 2;
          if (gi + 1 >= dv.byteLength) continue;
          g = dv.getUint16(gi);
          if (g) g = (g + delta) & 0xffff;
        }
        if (g) map.set(c, g);
      }
    }
  } else if (best.fmt === 12) {
    const groups = dv.getUint32(best.off + 12);
    for (let i = 0; i < groups; i++) {
      const o = best.off + 16 + i * 12;
      const start = dv.getUint32(o);
      const end = dv.getUint32(o + 4);
      const gid = dv.getUint32(o + 8);
      for (let c = start; c <= end; c++) map.set(c, gid + (c - start));
    }
  }
  return map;
}

/* --------------------- сборка PDF --------------------- */

const enc = (s) => new TextEncoder().encode(s);
const pad = (n, w) => String(n).padStart(w, '0');

class Pdf {
  constructor() {
    this.chunks = [];
    this.len = 0;
    this.objs = [];            // смещение каждого объекта
  }
  push(x) { const b = typeof x === 'string' ? enc(x) : x; this.chunks.push(b); this.len += b.length; }
  obj(body, stream) {
    const id = this.objs.length + 1;
    this.objs.push(this.len);
    this.push(`${id} 0 obj\n${body}\n`);
    if (stream) { this.push('stream\n'); this.push(stream); this.push('\nendstream\n'); }
    this.push('endobj\n');
    return id;
  }
  reserve() { this.objs.push(-1); return this.objs.length; }
  fill(id, body, stream) {
    this.objs[id - 1] = this.len;
    this.push(`${id} 0 obj\n${body}\n`);
    if (stream) { this.push('stream\n'); this.push(stream); this.push('\nendstream\n'); }
    this.push('endobj\n');
  }
  bytes(rootId) {
    const xref = this.len;
    let t = `xref\n0 ${this.objs.length + 1}\n0000000000 65535 f \n`;
    for (const o of this.objs) t += `${pad(o, 10)} 00000 n \n`;
    t += `trailer\n<</Size ${this.objs.length + 1}/Root ${rootId} 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
    this.push(t);

    const out = new Uint8Array(this.len);
    let p = 0;
    for (const c of this.chunks) { out.set(c, p); p += c.length; }
    return out;
  }
}

// Экранирование для строк в PDF (используем только в /ToUnicode).
const hex4 = (n) => n.toString(16).toUpperCase().padStart(4, '0');

/* Шрифт внутри PDF: объекты Type0 → CIDFontType2 → FontFile2. */
function embedFont(pdf, f, name) {
  const k = 1000 / f.unitsPerEm;
  const ff = pdf.obj(`<</Length ${f.raw.length}/Length1 ${f.raw.length}>>`, f.raw);

  const bb = f.bbox.map((v) => Math.round(v * k));
  const fd = pdf.obj(
    `<</Type/FontDescriptor/FontName/${name}/Flags 32` +
    `/FontBBox[${bb.join(' ')}]/ItalicAngle 0` +
    `/Ascent ${Math.round(f.ascent * k)}/Descent ${Math.round(f.descent * k)}` +
    `/CapHeight ${Math.round(f.ascent * k)}/StemV 80/FontFile2 ${ff} 0 R>>`);

  const w = [];
  for (let g = 0; g < f.numGlyphs; g++) w.push(Math.round(f.widths[g] * k));
  const cid = pdf.obj(
    `<</Type/Font/Subtype/CIDFontType2/BaseFont/${name}` +
    `/CIDSystemInfo<</Registry(Adobe)/Ordering(Identity)/Supplement 0>>` +
    `/FontDescriptor ${fd} 0 R/DW 1000/W[0[${w.join(' ')}]]/CIDToGIDMap/Identity>>`);

  // ToUnicode — чтобы текст из PDF можно было скопировать и найти поиском.
  const pairs = [];
  for (const [code, gid] of f.cmap) if (code <= 0xffff) pairs.push([gid, code]);
  let cmapTxt = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n' +
    '/CIDSystemInfo <</Registry (Adobe)/Ordering (UCS)/Supplement 0>> def\n' +
    '/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000><FFFF>\nendcodespacerange\n';
  for (let i = 0; i < pairs.length; i += 100) {
    const part = pairs.slice(i, i + 100);
    cmapTxt += `${part.length} beginbfchar\n`;
    for (const [g, c] of part) cmapTxt += `<${hex4(g)}> <${hex4(c)}>\n`;
    cmapTxt += 'endbfchar\n';
  }
  cmapTxt += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n';
  const tu = pdf.obj(`<</Length ${enc(cmapTxt).length}>>`, cmapTxt);

  return pdf.obj(
    `<</Type/Font/Subtype/Type0/BaseFont/${name}/Encoding/Identity-H` +
    `/DescendantFonts[${cid} 0 R]/ToUnicode ${tu} 0 R>>`);
}

/* --------------------- рисование --------------------- */

// Ширина строки в пунктах при заданном кегле.
function textWidth(f, s, size) {
  let w = 0;
  for (const ch of String(s)) {
    const g = f.cmap.get(ch.codePointAt(0)) || 0;
    w += f.widths[g] || 0;
  }
  return (w / f.unitsPerEm) * size;
}

// Текст в PDF пишется номерами глифов — переводим строку в hex.
function glyphHex(f, s) {
  let out = '';
  for (const ch of String(s)) out += hex4(f.cmap.get(ch.codePointAt(0)) || 0);
  return out;
}

// Обрезаем то, что не влезло в колонку, и ставим многоточие.
function fit(f, s, size, max) {
  const t = String(s ?? '');
  if (textWidth(f, t, size) <= max) return t;
  let cut = t;
  while (cut.length > 1 && textWidth(f, cut + '…', size) > max) cut = cut.slice(0, -1);
  return cut + '…';
}

/* Заголовки колонок длинные («количество свободных номеров»), поэтому
   переносим их по словам — не больше указанного числа строк. */
function wrap(f, s, size, max, maxLines = 2) {
  const words = String(s ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (textWidth(f, test, size) <= max || !cur) { cur = test; continue; }
    lines.push(fit(f, cur, size, max)); cur = w;
    if (lines.length === maxLines - 1) break;
  }
  const rest = words.slice(lines.join(' ').split(/\s+/).filter(Boolean).length).join(' ');
  if (lines.length < maxLines) lines.push(fit(f, lines.length === maxLines - 1 ? (rest || cur) : cur, size, max));
  return lines.filter(Boolean);
}

/* Таблица на страницах A4 (альбомная). columns — [{title, width, align}]. */
export function buildTablePdf({ title, subtitle, columns, rows, footer }) {
  const R = parseFont(fontBytes(FONT_REGULAR)); R.raw = fontBytes(FONT_REGULAR);
  const B = parseFont(fontBytes(FONT_BOLD)); B.raw = fontBytes(FONT_BOLD);

  const W = 842, H = 595, M = 32;         // A4 альбомная
  const size = 9, headSize = 9, rowH = 17;

  // Ширины колонок подгоняем под лист.
  const total = columns.reduce((a, c) => a + c.width, 0);
  const scale = (W - M * 2) / total;
  const cols = columns.map((c) => ({ ...c, w: c.width * scale }));

  const topY = H - M - 42;                 // ниже заголовка
  const bottomY = M + 22;

  const pdf = new Pdf();
  pdf.push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const fR = embedFont(pdf, R, 'DejaVuSans');
  const fB = embedFont(pdf, B, 'DejaVuSans-Bold');

  // Шапка таблицы может занять две строки — от этого зависит, сколько строк влезет.
  const headLines = cols.map((c) => wrap(B, c.title, headSize, c.w - 8, 3));
  const headRows = Math.max(1, ...headLines.map((l) => l.length));
  const headH = 6 + headRows * 12;
  const perPage = Math.max(1, Math.floor((topY - bottomY - headH) / rowH));
  const pages = Math.max(1, Math.ceil(rows.length / perPage));

  const pagesId = pdf.reserve();
  const kids = [];

  for (let p = 0; p < pages; p++) {
    const part = rows.slice(p * perPage, (p + 1) * perPage);
    let s = '';

    const put = (font, sz, x, y, str, gray) => {
      if (str == null || str === '') return;
      s += `BT ${gray != null ? `${gray} ${gray} ${gray} rg ` : '0 0 0 rg '}` +
        `/${font} ${sz} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm <${glyphHex(font === 'F2' ? B : R, str)}> Tj ET\n`;
    };
    const rect = (x, y, w, h, gray) => { s += `${gray} ${gray} ${gray} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f\n`; };

    // Шапка листа
    put('F2', 14, M, H - M - 12, title);
    if (subtitle) put('F1', 9, M, H - M - 28, subtitle, 0.4);

    // Заголовок таблицы
    let y = topY;
    rect(M, y + 12 - headH, W - M * 2, headH, 0.92);
    let x = M;
    cols.forEach((c, ci) => {
      headLines[ci].forEach((line, li) => {
        const tx = c.align === 'right' ? x + c.w - 4 - textWidth(B, line, headSize) : x + 4;
        put('F2', headSize, tx, y + 1 - li * 12, line);
      });
      x += c.w;
    });
    y -= headH - 6;

    // Строки
    part.forEach((row, i) => {
      if (i % 2 === 1) rect(M, y - 4, W - M * 2, rowH, 0.975);
      let cx = M;
      cols.forEach((c, ci) => {
        const t = fit(R, row[ci], size, c.w - 8);
        const tx = c.align === 'right' ? cx + c.w - 4 - textWidth(R, t, size) : cx + 4;
        put('F1', size, tx, y + 1, t);
        cx += c.w;
      });
      y -= rowH;
    });

    // Подвал
    const foot = [footer, pages > 1 ? `стр. ${p + 1} из ${pages}` : ''].filter(Boolean).join(' · ');
    if (foot) put('F1', 8, M, M, foot, 0.45);

    const content = pdf.obj(`<</Length ${enc(s).length}>>`, s);
    kids.push(pdf.obj(
      `<</Type/Page/Parent ${pagesId} 0 R/MediaBox[0 0 ${W} ${H}]` +
      `/Resources<</Font<</F1 ${fR} 0 R/F2 ${fB} 0 R>>>>/Contents ${content} 0 R>>`));
  }

  pdf.fill(pagesId, `<</Type/Pages/Kids[${kids.map((k) => `${k} 0 R`).join(' ')}]/Count ${kids.length}>>`);
  const root = pdf.obj(`<</Type/Catalog/Pages ${pagesId} 0 R>>`);
  return pdf.bytes(root);
}

/* --------------------- сохранение --------------------- */

export function downloadPdf(filename, opts) {
  const bytes = buildTablePdf(opts);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  try {
    const a = document.createElement('a');
    if ('download' in a) {
      const url = URL.createObjectURL(blob);
      a.href = url; a.download = filename; a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch {} }, 5000);
      return true;
    }
  } catch {}
  try {
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (w) { setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 60000); return true; }
  } catch {}
  alert('Браузер не дал сохранить файл. Откройте страницу в обычном браузере и повторите.');
  return false;
}
