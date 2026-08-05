import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // В системе есть второй lockfile (C:\Users\User) — явно фиксируем корень проекта.
  outputFileTracingRoot: __dirname,
  async headers() {
    const noCache = [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }];
    return [
      // Service worker всегда свежий, иначе PWA «не обновляется» после деплоя.
      { source: '/sw.js', headers: noCache },
      // Манифесты: правильный content-type + без агрессивного кэша.
      {
        source: '/:name.webmanifest',
        headers: [...noCache, { key: 'Content-Type', value: 'application/manifest+json; charset=utf-8' }],
      },
    ];
  },
};

export default nextConfig;
