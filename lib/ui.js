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

export function timeHM(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

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

export function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function monthStart() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
}
