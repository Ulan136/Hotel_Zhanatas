'use client';
import { useEffect } from 'react';

// Регистрируем service worker один раз. Ошибки глушим — не должны ронять страницу.
export default function RegisterSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
