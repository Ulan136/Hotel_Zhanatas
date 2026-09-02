'use client';

/* Автообновление данных.

   На Vercel обычный веб-сокет не поднять, а внешний сервис (Pusher и т.п.)
   ради двух-трёх устройств в одной гостинице — лишние ключи и аккаунт.
   Поэтому просто спрашиваем сервер «что-нибудь изменилось?»: запрос
   возвращает короткую подпись состояния базы, и полную перезагрузку
   делаем только когда подпись стала другой.

   Чтобы не жечь запросы впустую: опрос идёт только когда вкладка открыта,
   а при возвращении на вкладку проверяем сразу. */

import { useEffect, useRef, useState } from 'react';
import { api } from './client';

export function useLive(onChange, { enabled = true, every = 8000 } = {}) {
  const [checkedAt, setCheckedAt] = useState(null);
  const sig = useRef(null);
  const busy = useRef(false);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    let timer = null;

    async function check() {
      if (stop || busy.current || document.visibilityState !== 'visible') return;
      busy.current = true;
      try {
        const r = await api('pulse');
        if (stop || !r?.sig) return;
        setCheckedAt(new Date());
        // Первый ответ просто запоминаем — данные уже загружены при входе.
        if (sig.current === null) { sig.current = r.sig; return; }
        if (r.sig !== sig.current) { sig.current = r.sig; await cb.current?.(); }
      } catch {
        // Нет связи — молча ждём следующей попытки.
      } finally { busy.current = false; }
    }

    function tick() { check(); timer = setTimeout(tick, every); }
    timer = setTimeout(tick, every);

    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onVisible);

    return () => {
      stop = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [enabled, every]);

  // Сбрасываем подпись — следующий ответ снова станет точкой отсчёта.
  const reset = () => { sig.current = null; };
  return { checkedAt, reset };
}

// «обновлено 15:42» — маленькая подпись под шапкой.
export function liveLabel(d) {
  if (!d) return 'обновляется автоматически';
  const p = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Almaty', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(d);
  return `обновлено в ${p}`;
}
