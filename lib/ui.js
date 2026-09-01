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
