// Утилиты форматирования, общие для всех страниц (клиент).

export function initials(f) {
  const p = String(f || '').trim().split(/\s+/);
  return ((p[0] || '')[0] || '') + ((p[1] || '')[0] || '');
}

export function fmt(d) {
  if (!d) return '—';
  d = String(d);
  if (d.indexOf('T') > 0) d = d.slice(0, 10);
  const p = d.split('-');
  return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : d;
}

// Время смены — тоже по Астане (см. fmtTime ниже).
export function timeHM(iso) { return fmtTime(iso); }

export function hoursText(h) {
  h = +h || 0;
  let H = Math.floor(h);
  let M = Math.round((h - H) * 60);
  if (M === 60) { H++; M = 0; }
  return H + ' ч ' + (M < 10 ? '0' : '') + M + ' мин';
}

export function nights(a, b) {
  if (!a || !b) return '';
  const d = (new Date(b) - new Date(a)) / 86400000;
  return d >= 0 ? Math.round(d) : '';
}

// Суток проживания. Если выбытие ещё не отмечено — считаем по сегодняшний день.
export function nightsNow(a, b) {
  if (!a) return '';
  return nights(a, b || todayStr());
}

/* --- Блоки комнат ---
   Номер комнаты кодирует блок первой цифрой: 1xx — блок 1, 2xx — блок 2.
   Ничего не зашито жёстко: блоки и диапазоны вычисляются из самих номеров,
   поэтому при добавлении блока 3xx всё заработает само. */
export function blockOf(room) {
  return Math.floor(Number(room) / 100) || 1;
}

// Группирует список по блокам: [{ block, items, from, to }], блоки по возрастанию.
export function groupByBlock(list, num = (x) => x) {
  const map = new Map();
  for (const it of list || []) {
    const b = blockOf(num(it));
    if (!map.has(b)) map.set(b, []);
    map.get(b).push(it);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([block, items]) => {
      const nums = items.map(num).sort((a, b) => a - b);
      return { block, items, from: nums[0], to: nums[nums.length - 1] };
    });
}

// Гражданство: сначала самые частые, «Другое» — свободный ввод.
export const CITIZENSHIPS = ['Казахстан', 'Россия', 'Китай', 'Кыргызстан', 'Узбекистан', 'Другое'];

/* --- Оплата охраны ---
   Платим за ДЕНЬ выхода: будни (пн–пт) по одной ставке, суббота и воскресенье — по другой.
   Две отметки в один день оплачиваются один раз. */
export const DEFAULT_GUARD_RATES = { weekday: 8000, weekend: 10000 };

// true для субботы и воскресенья. Дата — строка 'ГГГГ-ММ-ДД'.
export function isWeekend(dateStr) {
  const d = String(dateStr || '').slice(0, 10).split('-');
  if (d.length !== 3) return false;
  // Считаем в UTC, чтобы часовой пояс устройства не сдвинул день.
  const day = new Date(Date.UTC(+d[0], +d[1] - 1, +d[2])).getUTCDay();
  return day === 0 || day === 6;
}

/* Начисление по сменам одного человека.
   shifts — записи смен (нужны поля fio и date). Возвращает дни и сумму. */
export function guardEarned(shifts, rates = DEFAULT_GUARD_RATES) {
  const days = new Set();
  for (const s of shifts || []) {
    const d = String(s?.date || '').slice(0, 10);
    if (d) days.add(d);
  }
  let weekday = 0, weekend = 0;
  for (const d of days) { if (isWeekend(d)) weekend++; else weekday++; }
  const rW = Number(rates?.weekday) || 0;
  const rE = Number(rates?.weekend) || 0;
  return {
    days: days.size,
    weekday,
    weekend,
    amount: weekday * rW + weekend * rE,
    dates: [...days].sort(),
  };
}

// Компания-вахта по умолчанию.
export const DEFAULT_COMPANY = 'ЕвроХим';

/* Телефон: показываем как +7 ххх ххх хх хх — по группам, так читается лучше.
   Пользователь набирает только цифры, пробелы и +7 подставляются сами. */
export const PHONE_PLACEHOLDER = '+7 ххх ххх хх хх';

export function formatPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  // 11 цифр и больше — код страны уже введён, берём последние 10.
  if (d.length >= 11) d = d.slice(-10);
  // Иначе первая 7 или 8 — это код страны из подставленного «+7».
  else if (d[0] === '7' || d[0] === '8') d = d.slice(1);
  const rest = d.slice(0, 10);
  let out = '+7';
  if (rest.length) out += ' ' + rest.slice(0, 3);
  if (rest.length > 3) out += ' ' + rest.slice(3, 6);
  if (rest.length > 6) out += ' ' + rest.slice(6, 8);
  if (rest.length > 8) out += ' ' + rest.slice(8, 10);
  return out;
}

// Пустой номер (введён только код страны) сохраняем как пустую строку.
export function cleanPhone(v) {
  const d = String(v || '').replace(/\D/g, '');
  return d.length > 1 ? formatPhone(d) : '';
}

export function money(n) {
  return (Math.round(+n || 0)).toLocaleString('ru-RU') + ' ₸';
}

/* --- Время по Астане ---
   Вся система живёт по времени Астаны (UTC+5), независимо от того,
   какой часовой пояс стоит на телефоне гостя или на сервере. */
export const TZ = 'Asia/Almaty';
export const TZ_OFFSET = '+05:00';

function astanaParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const g = (t) => parts.find((p) => p.type === t)?.value || '';
  let hh = g('hour');
  if (hh === '24') hh = '00';
  return { y: g('year'), m: g('month'), d: g('day'), hh, mi: g('minute') };
}

// Сегодняшняя дата по Астане: 'ГГГГ-ММ-ДД'.
export function todayStr() {
  const p = astanaParts();
  return `${p.y}-${p.m}-${p.d}`;
}

// Текущее время по Астане: 'ЧЧ:ММ'.
export function nowTime() {
  const p = astanaParts();
  return `${p.hh}:${p.mi}`;
}

// Первое число текущего месяца по Астане.
export function monthStart() {
  const p = astanaParts();
  return `${p.y}-${p.m}-01`;
}

// Метка времени → '01.09.2026 15:30' по Астане.
export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const p = astanaParts(d);
  return `${p.d}.${p.m}.${p.y} ${p.hh}:${p.mi}`;
}

// Метка времени → '15:30' по Астане.
export function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = astanaParts(d);
  return `${p.hh}:${p.mi}`;
}

/* Дата 'ГГГГ-ММ-ДД' + время 'ЧЧ:ММ' → строка с поясом Астаны.
   Сервер сохранит именно тот момент, который выбрал пользователь. */
export function toAstanaISO(date, time) {
  if (!date) return null;
  const t = /^\d{1,2}:\d{2}$/.test(String(time || '')) ? String(time).padStart(5, '0') : '00:00';
  return `${date}T${t}:00${TZ_OFFSET}`;
}

// Должности гостей — частые варианты, список дополняется вводом.
export const POSITIONS = [
  'Инженер', 'Начальник смены', 'Мастер', 'Слесарь КИПиА', 'Электрик',
  'Механик', 'Оператор', 'Технолог', 'Диспетчер', 'Другое',
];
