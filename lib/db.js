import { neon } from '@neondatabase/serverless';

// Ленивая инициализация: не дёргаем neon() во время сборки (когда переменной ещё нет),
// а только при первом реальном запросе в рантайме.
let _sql = null;
function getSql() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL не задана. Укажите её в .env.local или в Vercel → Settings → Environment Variables.');
    }
    // HTTP-драйвер Neon: идеален для serverless (Vercel) — без пулов и «висящих» соединений.
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

// Использовать как теговый шаблон: sql`SELECT ... ${value}` — параметры экранируются.
export function sql(strings, ...values) {
  return getSql()(strings, ...values);
}
