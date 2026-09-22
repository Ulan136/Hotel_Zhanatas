'use client';

/* Настоящий файл Excel (.xlsx) без сторонних библиотек.
   .xlsx — это ZIP с несколькими XML внутри, поэтому здесь собран
   минимальный ZIP-упаковщик (без сжатия) и минимальная книга Excel.
   Текст пишем «инлайн-строками», чтобы обойтись без словаря строк. */

/* ------------------------- ZIP ------------------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const utf8 = (s) => new TextEncoder().encode(s);

// ZIP без сжатия (method 0) — Excel такие файлы открывает штатно.
// Открыт наружу: тем же упаковщиком собирается бланк отчёта (lib/reportForm.js).
export function zipParts(files) { return zip(files); }
function zip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  const push = (arr) => { chunks.push(arr); offset += arr.length; };
  const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

  for (const f of files) {
    const name = utf8(f.name);
    const data = utf8(f.data);
    const crc = crc32(data);
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), // 0x0800 — имена в UTF-8
      ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length),
      ...u16(name.length), ...u16(0),
    ]);
    const localOffset = offset;
    push(local); push(name); push(data);

    central.push({ name, crc, size: data.length, localOffset });
  }

  const centralStart = offset;
  for (const c of central) {
    const head = new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0),
      ...u16(0), ...u16(0),
      ...u32(c.crc), ...u32(c.size), ...u32(c.size),
      ...u16(c.name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(c.localOffset),
    ]);
    push(head); push(c.name);
  }
  const centralSize = offset - centralStart;

  push(new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(central.length), ...u16(central.length),
    ...u32(centralSize), ...u32(centralStart), ...u16(0),
  ]));

  const out = new Uint8Array(offset);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

/* ------------------------ Excel ------------------------ */

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

function colName(i) {
  let s = '';
  i += 1;
  while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function sheetXml(rows, o) {
  const bold = o.bold, head = o.head, grid = o.grid;
  const ncols = rows.reduce((m, r) => Math.max(m, (r || []).length), 0);

  // Ширину колонок либо задаём явно (бланк), либо прикидываем по содержимому.
  const widths = [];
  for (const r of rows) {
    (r || []).forEach((v, i) => {
      const len = String(v == null ? '' : v).length + 2;
      if (!widths[i] || widths[i] < len) widths[i] = Math.min(len, 42);
    });
  }
  const w = (i) => (o.widths && o.widths[i]) || Math.max(8, widths[i] || 8);
  const cols = ncols
    ? '<cols>' + Array.from({ length: ncols }, (_, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${w(i)}" customWidth="1"/>`).join('') + '</cols>'
    : '';

  /* Стили: 1 — жирный, 2 — шапка бланка (жирная, в рамке, по центру,
     с переносом), 3 — клетка таблицы в рамке. Строки бланка выводим
     целиком, вместе с пустыми ячейками, иначе рамка получится рваной. */
  const styleOf = (ri) => head.has(ri) ? ' s="2"' : grid.has(ri) ? ' s="3"' : bold.has(ri) ? ' s="1"' : '';
  const whole = (ri) => head.has(ri) || grid.has(ri);

  const body = rows.map((r, ri) => {
    const style = styleOf(ri);
    const row = r || [];
    const n = whole(ri) ? ncols : row.length;
    let cells = '';
    for (let ci = 0; ci < n; ci++) {
      const v = row[ci];
      const ref = colName(ci) + (ri + 1);
      if (v == null || v === '') {
        if (style) cells += `<c r="${ref}"${style}/>`;
        continue;
      }
      cells += isNum(v)
        ? `<c r="${ref}"${style}><v>${v}</v></c>`
        : `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    }
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join('');

  const merges = (o.merges || []).length
    ? `<mergeCells count="${o.merges.length}">` +
      o.merges.map((m) => `<mergeCell ref="${esc(m)}"/>`).join('') + '</mergeCells>'
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${body}</sheetData>${merges}</worksheet>`;
}

/* Строит .xlsx и возвращает байты.
     rows       — массив массивов (строки листа)
     boldRows   — номера строк (с нуля) жирным
     headRows   — строки шапки бланка: жирные, в рамке, по центру
     gridRows   — строки таблицы: в рамке
     merges     — объединённые ячейки, например 'B1:E1'
     widths     — ширина колонок, если нужна не автоматическая           */
export function buildXlsx(rows, {
  sheetName = 'Лист1', boldRows = [], headRows = [], gridRows = [], merges = [], widths = null,
} = {}) {
  const bold = new Set(boldRows);
  const head = new Set(headRows);
  const grid = new Set(gridRows);
  const files = [
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    {
      name: 'xl/styles.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="2"><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs></styleSheet>`,
    },
    { name: 'xl/worksheets/sheet1.xml', data: sheetXml(rows, { bold, head, grid, merges, widths }) },
  ];
  return zip(files);
}

/* ---------------------- Скачивание ---------------------- */

/* Сохраняем устойчиво: ссылку отзываем с задержкой (иначе часть браузеров
   обрывает загрузку), а если сохранить не дали — открываем в новой вкладке. */
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/* Поделиться файлом — системное окно «Отправить» (WhatsApp, почта, Telegram…).
   Работает на телефонах и в новых браузерах; если нельзя — вернёт false. */
export async function shareXlsx(filename, rows, opts, text) {
  try {
    const bytes = buildXlsx(rows, opts);
    const file = new File([bytes], filename, { type: XLSX_MIME });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename, text: text || filename });
      return true;
    }
  } catch (e) {
    // Пользователь закрыл окно «Поделиться» — это не ошибка.
    if (e?.name === 'AbortError') return true;
  }
  return false;
}

export function canShareFiles() {
  try {
    const f = new File([new Uint8Array([1])], 't.xlsx', { type: XLSX_MIME });
    return !!navigator.canShare?.({ files: [f] });
  } catch { return false; }
}

export function downloadXlsx(filename, rows, opts) {
  return downloadXlsxBytes(filename, buildXlsx(rows, opts));
}

// Сохранение уже готовых байтов — так скачивается бланк отчёта.
export function downloadXlsxBytes(filename, bytes) {
  const blob = new Blob([bytes], { type: XLSX_MIME });

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

  alert('Браузер не дал сохранить файл. Откройте страницу в обычном браузере (не в режиме приложения) и повторите.');
  return false;
}
