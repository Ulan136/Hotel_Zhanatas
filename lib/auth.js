import crypto from 'node:crypto';

/* ---------------- Серверная сессия ----------------
   Раньше вход проверялся только в браузере: сервер верил любому запросу.
   Теперь при входе выдаём подписанный токен в httpOnly-куке — подделать его
   без секрета нельзя, а JavaScript на странице его даже не видит.

   Секрет: AUTH_SECRET, если задан в переменных окружения; иначе берём
   строку подключения к базе (она тоже секретна и всегда есть на сервере). */
const SECRET = process.env.AUTH_SECRET || process.env.DATABASE_URL || 'medina-dev-secret';

export const AUTH_COOKIE = 'medina_auth';

const b64 = (s) => Buffer.from(s).toString('base64url');
const mac = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

export function signToken({ login, role, name }, days = 30) {
  const data = b64(JSON.stringify({ login, role, name, exp: Date.now() + days * 86400000 }));
  return `${data}.${mac(data)}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const i = token.lastIndexOf('.');
  if (i <= 0) return null;
  const data = token.slice(0, i);
  const sig = token.slice(i + 1);
  const want = mac(data);
  // Сравниваем за постоянное время — чтобы по скорости ответа нельзя было подобрать подпись.
  const a = Buffer.from(sig);
  const b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!p?.exp || p.exp < Date.now()) return null;
    if (!p.login || !p.role) return null;
    return p;
  } catch { return null; }
}

/* Кто выше по правам. Заказчик видит только отчёт, ресепшн — работу с гостями,
   админ — всё. Действия без входа перечислены отдельно (QR-страницы гостя и охраны). */
export const RANK = { factory: 1, reception: 2, admin: 3 };
export function atLeast(me, need) {
  if (need === 'public') return true;
  if (!me) return false;
  return (RANK[me.role] || 0) >= (RANK[need] || 99);
}
