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

// Гражданство — фиксированный список для выпадающего меню.
export const CITIZENSHIPS = [
  'Казахстан', 'Узбекистан', 'Кыргызстан', 'Россия',
  'Таджикистан', 'Туркменистан', 'Азербайджан',
  'Китай', 'Турция', 'Другое',
];

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
