'use client';
import { zipParts } from '@/lib/xlsx';

/* ------------------------------------------------------------------
   БЛАНК ОТЧЁТА ДЛЯ ЗАКАЗЧИКА

   Оформление целиком взято из файла заказчика: шрифты, размеры,
   выравнивание по центру, бирюзовые полосы, рамки, ширина колонок
   и высота строк. Мы ничего не рисуем сами — только подставляем данные.

   Смена оформления = заменить STYLES_XML/THEME_XML на части нового
   образца и поправить номера оформления (s=...) в разметке ниже.
   ------------------------------------------------------------------ */

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:x14ac="http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><fonts count="10"><font><sz val="11.0"/><color rgb="FF000000"/><name val="Calibri"/><scheme val="minor"/></font><font><b/><sz val="11.0"/><color theme="1"/><name val="Calibri"/></font><font><b/><sz val="13.0"/><color theme="1"/><name val="Calibri"/></font><font><b/><sz val="12.0"/><color theme="1"/><name val="Calibri"/></font><font/><font><color theme="1"/><name val="Calibri"/></font><font><b/><sz val="15.0"/><color theme="1"/><name val="Calibri"/></font><font><b/><color theme="1"/><name val="Calibri"/></font><font><b/><sz val="14.0"/><color theme="1"/><name val="Calibri"/></font><font><color theme="1"/><name val="Calibri"/><scheme val="minor"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="lightGray"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFA2C4C9"/><bgColor rgb="FFA2C4C9"/></patternFill></fill></fills><borders count="6"><border/><border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top></border><border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom></border><border><left style="thin"><color rgb="FF000000"/></left><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom></border><border><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom></border><border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><bottom style="thin"><color rgb="FF000000"/></bottom></border></borders><cellStyleXfs count="1"><xf borderId="0" fillId="0" fontId="0" numFmtId="0" applyAlignment="1" applyFont="1"/></cellStyleXfs><cellXfs count="18"><xf borderId="0" fillId="0" fontId="0" numFmtId="0" xfId="0" applyAlignment="1" applyFont="1"><alignment readingOrder="0" shrinkToFit="0" vertical="bottom" wrapText="0"/></xf><xf borderId="0" fillId="2" fontId="1" numFmtId="0" xfId="0" applyFill="1" applyFont="1"/><xf borderId="1" fillId="0" fontId="2" numFmtId="0" xfId="0" applyAlignment="1" applyBorder="1" applyFont="1"><alignment horizontal="center" shrinkToFit="0" wrapText="1"/></xf><xf borderId="2" fillId="0" fontId="3" numFmtId="0" xfId="0" applyAlignment="1" applyBorder="1" applyFont="1"><alignment horizontal="center" shrinkToFit="0" wrapText="1"/></xf><xf borderId="0" fillId="2" fontId="2" numFmtId="0" xfId="0" applyAlignment="1" applyFill="1" applyFont="1"><alignment horizontal="center" shrinkToFit="0" vertical="center" wrapText="1"/></xf><xf borderId="3" fillId="0" fontId="2" numFmtId="0" xfId="0" applyAlignment="1" applyBorder="1" applyFont="1"><alignment horizontal="center" shrinkToFit="0" vertical="center" wrapText="1"/></xf><xf borderId="4" fillId="0" fontId="4" numFmtId="0" xfId="0" applyBorder="1" applyFont="1"/><xf borderId="0" fillId="2" fontId="5" numFmtId="0" xfId="0" applyFill="1" applyFont="1"/><xf borderId="5" fillId="0" fontId="4" numFmtId="0" xfId="0" applyBorder="1" applyFont="1"/><xf borderId="2" fillId="0" fontId="6" numFmtId="0" xfId="0" applyAlignment="1" applyBorder="1" applyFont="1"><alignment horizontal="center"/></xf><xf borderId="0" fillId="2" fontId="7" numFmtId="0" xfId="0" applyAlignment="1" applyFill="1" applyFont="1"><alignment horizontal="center"/></xf><xf borderId="2" fillId="0" fontId="7" numFmtId="0" xfId="0" applyAlignment="1" applyBorder="1" applyFont="1"><alignment horizontal="center"/></xf><xf borderId="2" fillId="0" fontId="8" numFmtId="0" xfId="0" applyAlignment="1" applyBorder="1" applyFont="1"><alignment horizontal="center"/></xf><xf borderId="2" fillId="0" fontId="8" numFmtId="0" xfId="0" applyAlignment="1" applyBorder="1" applyFont="1"><alignment horizontal="center" readingOrder="0"/></xf><xf borderId="2" fillId="2" fontId="8" numFmtId="0" xfId="0" applyAlignment="1" applyBorder="1" applyFill="1" applyFont="1"><alignment horizontal="center"/></xf><xf borderId="2" fillId="2" fontId="8" numFmtId="0" xfId="0" applyBorder="1" applyFill="1" applyFont="1"/><xf borderId="2" fillId="0" fontId="9" numFmtId="0" xfId="0" applyBorder="1" applyFont="1"/><xf borderId="2" fillId="2" fontId="5" numFmtId="0" xfId="0" applyBorder="1" applyFill="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle xfId="0" name="Normal" builtinId="0"/></cellStyles><dxfs count="0"/></styleSheet>`;

const THEME_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" name="Sheets"><a:themeElements><a:clrScheme name="Sheets"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="000000"/></a:dk2><a:lt2><a:srgbClr val="FFFFFF"/></a:lt2><a:accent1><a:srgbClr val="4F81BD"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2><a:accent3><a:srgbClr val="9BBB59"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4><a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6><a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="0000FF"/></a:folHlink></a:clrScheme><a:fontScheme name="Sheets"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface="Calibri"/><a:cs typeface="Calibri"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface="Calibri"/><a:cs typeface="Calibri"/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:lumMod val="110000"/><a:satMod val="105000"/><a:tint val="67000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:lumMod val="105000"/><a:satMod val="103000"/><a:tint val="73000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:lumMod val="105000"/><a:satMod val="109000"/><a:tint val="81000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:satMod val="103000"/><a:lumMod val="102000"/><a:tint val="94000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:satMod val="110000"/><a:lumMod val="100000"/><a:shade val="100000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:lumMod val="99000"/><a:satMod val="120000"/><a:shade val="78000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst><a:outerShdw blurRad="57150" dist="19050" dir="5400000" algn="ctr" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="63000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/><a:satMod val="170000"/></a:schemeClr></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="93000"/><a:satMod val="150000"/><a:shade val="98000"/><a:lumMod val="102000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:tint val="98000"/><a:satMod val="130000"/><a:shade val="90000"/><a:lumMod val="103000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="63000"/><a:satMod val="120000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;

// Заголовок над колонками заявок — с теми же отступами, что в образце.
const HEAD_REQUESTS = `Заявки                                                                                                 Фамилия имя отчество`;

// Сетка всегда дотягивается до 23-й строки; данных больше — таблица растёт.
const MIN_LAST_ROW = 23;

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

/* Ячейка: s — номер оформления из образца, v — значение.
   Число пишем числом, текст — строкой внутри файла. */
function cell(ref, s, v) {
  const st = s == null ? '' : ` s="${s}"`;
  if (v == null || v === '') return `<c r="${ref}"${st}/>`;
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`;
  return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

const rowXml = (n, cells, attrs = '') => `<row r="${n}"${attrs}>${cells.join('')}</row>`;

/* Собирает файл отчёта.
     hotel      — реквизиты гостиницы (левый верхний угол)
     occRooms   — количество занятых номеров
     freeRooms  — количество свободных номеров
     bookGuests — количество гостей по заявке
     list       — [{ arrival, departure, fio, position }] — журнал заездов
     waitItr    — ФИО по заявкам: ИТР
     waitVah    — ФИО по заявкам: вахта
     nItr/nVah  — сколько человек ждём в каждой категории                 */
export function buildReportForm({
  hotel, occRooms, freeRooms, bookGuests,
  list = [], waitItr = [], waitVah = [], nItr = null, nVah = null,
}) {
  const rows = [];

  // 1 — тонкая бирюзовая полоса над шапкой
  rows.push(rowXml(1, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((c) => cell(c + '1', 1)),
    ' ht="11.25" customHeight="1"'));

  // 2 — реквизиты, названия трёх счётчиков и шапка «Заявки»
  rows.push(rowXml(2, [
    cell('A2', 2, hotel),
    cell('B2', 3, 'количество занятых номеров'),
    cell('C2', 3, 'количество свободных номеров'),
    cell('D2', 3, 'количество гостей по заявке'),
    cell('E2', 4), cell('F2', 5, HEAD_REQUESTS), cell('G2', 6), cell('H2', 7),
  ], ' ht="41.25" customHeight="1"'));

  // 3 — сами числа и подписи ИТР / Вахта
  rows.push(rowXml(3, [
    cell('A3', 8),
    cell('B3', 9, Number(occRooms) || 0),
    cell('C3', 9, Number(freeRooms) || 0),
    cell('D3', 9, Number(bookGuests) || 0),
    cell('E3', 10), cell('F3', 11, 'ИТР'), cell('G3', 11, 'Вахта'), cell('H3', 7),
  ], ' ht="20.25" customHeight="1"'));

  // 4 — полоса-разделитель
  rows.push(rowXml(4, [cell('A4', 1), ...['B', 'C', 'D', 'E', 'F', 'G', 'H'].map((c) => cell(c + '4', 7))],
    ' ht="9.75" customHeight="1"'));

  // 5 — названия колонок; справа в той же строке — счётчики заявок
  const cItr = Number(nItr == null ? waitItr.length : nItr) || 0;
  const cVah = Number(nVah == null ? waitVah.length : nVah) || 0;
  rows.push(rowXml(5, [
    cell('A5', 12, 'дата заезда'), cell('B5', 12, 'дата выезда'),
    cell('C5', 13, 'фамилия имя отчество'), cell('D5', 12, 'должность'),
    cell('E5', 14), cell('F5', 12, cItr), cell('G5', 12, cVah), cell('H5', 15),
  ]));

  // 6 и ниже — данные. Сетка не короче 23-й строки, дальше растёт по данным.
  const need = Math.max(list.length, waitItr.length, waitVah.length);
  const last = Math.max(MIN_LAST_ROW, 5 + need);
  for (let r = 6; r <= last; r++) {
    const i = r - 6;
    const g = list[i];
    rows.push(rowXml(r, [
      cell('A' + r, 16, g ? g.arrival : ''),
      cell('B' + r, 16, g ? g.departure : ''),
      cell('C' + r, 16, g ? g.fio : ''),
      cell('D' + r, 16, g ? g.position : ''),
      cell('E' + r, 17),
      cell('F' + r, 16, waitItr[i] || ''),
      cell('G' + r, 16, waitVah[i] || ''),
      cell('H' + r, 17),
    ], ' ht="15.75" customHeight="1"'));
  }

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr customHeight="1" defaultColWidth="14.43" defaultRowHeight="15.0"/><cols><col customWidth="1" min="1" max="1" width="22.29"/><col customWidth="1" min="2" max="2" width="18.0"/><col customWidth="1" min="3" max="3" width="29.0"/><col customWidth="1" min="4" max="4" width="40.0"/><col customWidth="1" min="5" max="5" width="1.86"/><col customWidth="1" min="6" max="6" width="28.0"/><col customWidth="1" min="7" max="7" width="30.0"/><col customWidth="1" min="8" max="8" width="1.71"/></cols><sheetData>${rows.join('')}</sheetData><mergeCells count="2"><mergeCell ref="A2:A3"/><mergeCell ref="F2:G2"/></mergeCells></worksheet>`;

  return zipParts([
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Отчёт" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: STYLES_XML },
    { name: 'xl/theme/theme1.xml', data: THEME_XML },
    { name: 'xl/worksheets/sheet1.xml', data: sheet },
  ]);
}
