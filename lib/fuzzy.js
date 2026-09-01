'use client';

/* Умный поиск по ФИО.
   Терпит: опечатку («смргей» → Сергей), пропущенную букву («сргей» → Сергей),
   лишнюю букву, перестановку соседних («сергей» / «сергей»), букву ё,
   а также набор в латинской раскладке («cthutq» → сергей). */

const RU = 'йцукенгшщзхъфывапролджэячсмитьбю';
const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.";
const EN2RU = new Map();
for (let i = 0; i < EN.length; i++) EN2RU.set(EN[i], RU[i]);

// «cthutq» — это «сергей», набранное с забытым переключением раскладки.
function fromLatinLayout(s) {
  let out = '';
  for (const ch of s) out += EN2RU.get(ch) ?? ch;
  return out;
}

export function norm(s) {
  return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

// Расстояние Дамерау—Левенштейна: замена, вставка, удаление и перестановка соседних букв.
export function distance(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = [];
  for (let i = 0; i <= m; i++) { d[i] = new Array(n + 1).fill(0); d[i][0] = i; }
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

// Сколько ошибок прощаем: чем длиннее запрос, тем больше.
function tolerance(len) {
  if (len <= 2) return 0;
  if (len <= 4) return 1;
  if (len <= 7) return 2;
  return 3;
}

// Оценка совпадения: меньше — лучше. null означает «не подходит».
function scoreOne(q, text) {
  if (!q) return null;
  const target = norm(text);
  if (!target) return null;
  if (target.startsWith(q)) return 0;

  let best = null;
  const keep = (v) => { if (v !== null && (best === null || v < best)) best = v; };

  if (target.includes(q)) keep(0.5);

  const tol = tolerance(q.length);
  for (const w of target.split(' ')) {
    if (w.startsWith(q)) { keep(0.2); continue; }
    // Сравниваем запрос с началом слова разной длины: «сргей» ≈ «сергей».
    const from = Math.max(1, q.length - 2);
    const to = Math.min(w.length, q.length + 2);
    for (let L = from; L <= to; L++) {
      const d = distance(q, w.slice(0, L));
      if (d <= tol) keep(1 + d);
    }
  }

  // Запрос из нескольких слов сверяем со строкой целиком.
  if (q.includes(' ')) {
    const d = distance(q, target.slice(0, q.length + 2));
    if (d <= tol) keep(1 + d);
  }
  return best;
}

export function fuzzyScore(query, text) {
  const q = norm(query);
  const variants = [q];
  const lat = fromLatinLayout(q);
  if (lat !== q) variants.push(lat);
  let best = null;
  for (const v of variants) {
    const s = scoreOne(v, text);
    if (s !== null && (best === null || s < best)) best = s;
  }
  return best;
}

// Возвращает подходящие элементы, лучшие — первыми.
export function fuzzySearch(query, items, getText = (x) => x, limit = 8) {
  if (!norm(query)) return [];
  const scored = [];
  for (const it of items || []) {
    const s = fuzzyScore(query, getText(it));
    if (s !== null) scored.push({ it, s });
  }
  scored.sort((a, b) => a.s - b.s || norm(getText(a.it)).localeCompare(norm(getText(b.it))));
  return scored.slice(0, limit).map((x) => x.it);
}
