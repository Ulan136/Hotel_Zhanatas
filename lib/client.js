'use client';

// Единая точка вызова API. Все запросы — POST /api/rpc c телом {action, ...params}.
export async function api(action, params) {
  const res = await fetch('/api/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...(params || {}) }),
  });
  if (!res.ok) {
    let msg = 'Ошибка сети: ' + res.status;
    try { const j = await res.json(); if (j && j.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

// Сессия в localStorage (как в исходной версии).
export function getSess() {
  try { return JSON.parse(localStorage.getItem('medina_sess')); } catch { return null; }
}
export function setSess(s) {
  try { localStorage.setItem('medina_sess', JSON.stringify(s)); } catch {}
}
export function clearSess() {
  try { localStorage.removeItem('medina_sess'); } catch {}
}
