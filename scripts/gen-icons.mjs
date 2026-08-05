// Генерация иконок PWA для каждого кабинета. Запуск: node scripts/gen-icons.mjs
// Full-bleed фон (для maskable) + белый векторный глиф по центру (safe-zone).
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(OUT, { recursive: true });

// Глифы (внутри центральной safe-зоны ~ 160..352 из 512)
const GLYPHS = {
  // Кабинет — сетка комнат 2×2
  admin: `
    <rect x="168" y="168" width="80" height="80" rx="16"/>
    <rect x="264" y="168" width="80" height="80" rx="16"/>
    <rect x="168" y="264" width="80" height="80" rx="16"/>
    <rect x="264" y="264" width="80" height="80" rx="16"/>`,
  // Охрана — щит
  guard: `<path d="M256 148 L352 184 V268 C352 330 306 360 256 382 C206 360 160 330 160 268 V184 Z"/>`,
  // Гость — человек
  guest: `
    <circle cx="256" cy="206" r="50"/>
    <path d="M172 372 C172 306 214 278 256 278 C298 278 340 306 340 372 Z"/>`,
  // Отчёт — столбцы диаграммы
  report: `
    <rect x="172" y="262" width="48" height="90" rx="9"/>
    <rect x="232" y="212" width="48" height="140" rx="9"/>
    <rect x="292" y="160" width="48" height="192" rx="9"/>`,
};

const APPS = [
  { key: 'admin', c1: '#6366f1', c2: '#4338ca' },
  { key: 'guard', c1: '#0ea5e9', c2: '#0369a1' },
  { key: 'guest', c1: '#10b981', c2: '#059669' },
  { key: 'report', c1: '#f59e0b', c2: '#d97706' },
];

function svg({ c1, c2, key }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
    </linearGradient></defs>
    <rect width="512" height="512" fill="url(#g)"/>
    <g fill="#ffffff">${GLYPHS[key]}</g>
  </svg>`;
}

for (const app of APPS) {
  const buf = Buffer.from(svg(app));
  for (const size of [192, 512]) {
    await sharp(buf).resize(size, size).png().toFile(join(OUT, `${app.key}-${size}.png`));
  }
  // apple-touch-icon: 180×180, без прозрачности (iOS сам скругляет)
  await sharp(buf).resize(180, 180).flatten({ background: app.c2 }).png().toFile(join(OUT, `${app.key}-apple.png`));
  console.log('✓', app.key);
}
console.log('Готово. Иконки в public/icons/');
