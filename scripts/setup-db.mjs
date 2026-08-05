// Разворачивает схему БД в Neon. Запуск: npm run db:setup
// Требует переменную DATABASE_URL (из .env.local или окружения).
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Подхватываем .env.local / .env, если есть (без обязательной зависимости).
try {
  const { config } = await import('dotenv');
  config({ path: '.env.local' });
  config({ path: '.env' });
} catch { /* dotenv необязателен */ }

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('✗ DATABASE_URL не задана. Создайте .env.local со строкой подключения Neon.');
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');

// Разбиваем на отдельные операторы (в схеме нет тел функций с ';', поэтому это безопасно).
const statements = schema
  .split(/;\s*(?:\r?\n|$)/)
  .map((s) => s.replace(/--.*$/gm, '').trim())
  .filter((s) => s.length > 0);

const sql = neon(url);

console.log(`→ Выполняю ${statements.length} операторов…`);
for (const stmt of statements) {
  const preview = stmt.replace(/\s+/g, ' ').slice(0, 60);
  try {
    await sql.query(stmt);
    console.log('  ✓', preview);
  } catch (e) {
    console.error('  ✗', preview, '\n    ', e.message);
    process.exit(1);
  }
}
console.log('✓ Схема развёрнута.');
