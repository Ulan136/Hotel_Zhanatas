'use client';

// Единая точка вызова API. Все запросы — POST /api/rpc c телом {action, ...params}.
export async function api(action, params) {
  const res = await fetch('/api/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...(params || {}) }),
  });
  if (res.status === 401 || res.status === 403) {
    /* Сервер не признал сессию (истекла или её сменили). Забываем вход
       на этом устройстве и показываем форму входа — иначе страница
       осталась бы «залогиненной» без прав и сыпала ошибками. */
    let msg = res.status === 401 ? 'Сессия истекла — войдите заново' : 'Недостаточно прав';
    try { const j = await res.json(); if (j && j.error) msg = j.error; } catch {}
    if (res.status === 401 && typeof window !== 'undefined') {
      for (const k of ['medina_sess', 'medina_sess_report']) {
        try { window.localStorage.removeItem(k); window.sessionStorage.removeItem(k); } catch {}
      }
      setTimeout(() => window.location.reload(), 400);
    }
    throw new Error(msg);
  }
  if (!res.ok) {
    let msg = 'Ошибка сети: ' + res.status;
    try { const j = await res.json(); if (j && j.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

/* ---------------- Сессия ----------------
   «Запомнить меня» ВКЛ  → localStorage: вход сохраняется после закрытия браузера.
   «Запомнить меня» ВЫКЛ → sessionStorage: вход живёт только до закрытия вкладки.
   Пароль нигде не сохраняется — только имя, логин и роль.
------------------------------------------ */
const SESS_KEY = 'medina_sess';
const LOGIN_KEY = 'medina_last_login';

function safeGet(store, k) { try { return store.getItem(k); } catch { return null; } }
function safeSet(store, k, v) { try { store.setItem(k, v); } catch {} }
function safeDel(store, k) { try { store.removeItem(k); } catch {} }

export function getSess(key = SESS_KEY) {
  if (typeof window === 'undefined') return null;
  for (const st of [window.localStorage, window.sessionStorage]) {
    const v = st && safeGet(st, key);
    if (v) { try { return JSON.parse(v); } catch {} }
  }
  return null;
}

export function setSess(s, remember = true, key = SESS_KEY) {
  if (typeof window === 'undefined') return;
  const keep = remember ? window.localStorage : window.sessionStorage;
  const drop = remember ? window.sessionStorage : window.localStorage;
  safeSet(keep, key, JSON.stringify(s));
  safeDel(drop, key);
  // Логин запоминаем отдельно, чтобы подставить его в форму после выхода.
  if (remember && s?.login) safeSet(window.localStorage, LOGIN_KEY + ':' + key, s.login);
  else safeDel(window.localStorage, LOGIN_KEY + ':' + key);
}

export function clearSess(key = SESS_KEY) {
  if (typeof window === 'undefined') return;
  safeDel(window.localStorage, key);
  safeDel(window.sessionStorage, key);
}

// Последний запомненный логин (для подстановки в поле «Логин»). Пароль не хранится.
export function getLastLogin(key = SESS_KEY) {
  if (typeof window === 'undefined') return '';
  return safeGet(window.localStorage, LOGIN_KEY + ':' + key) || '';
}

// Полностью забыть пользователя: и сессию, и запомненный логин.
export function forgetMe(key = SESS_KEY) {
  clearSess(key);
  if (typeof window !== 'undefined') safeDel(window.localStorage, LOGIN_KEY + ':' + key);
}

export const REPORT_SESS_KEY = 'medina_sess_report';
