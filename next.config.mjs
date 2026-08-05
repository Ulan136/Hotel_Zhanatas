import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // В системе есть второй lockfile (C:\Users\User) — явно фиксируем корень проекта.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
