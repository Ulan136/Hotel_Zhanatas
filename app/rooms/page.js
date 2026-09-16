'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client';
import { TopBar, Busy } from '@/components/kit';
import { shortName, groupByBlock, blockOf, fmt, timeHM } from '@/lib/ui';

/* Экран «Кто в комнатах» — для охраны и вообще для быстрого взгляда.
   Только просмотр: ничего нажать и испортить нельзя. Личных данных
   (ИИН, паспорт, телефон) здесь нет — только имя, комната и дата заезда. */

const norm = (v) => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim();

export default function RoomsPage() {
  const [rooms, setRooms] = useState([]);
  const [stays, setStays] = useState([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(true);
  const [at, setAt] = useState(null);
  const [err, setErr] = useState('');

  async function load(first = false) {
    if (first) setBusy(true);
    try {
      const [r, s] = await Promise.all([api('publicRooms'), api('publicStays')]);
      setRooms(Array.isArray(r) ? r : []);
      setStays(Array.isArray(s) ? s : []);
      setAt(new Date());
      setErr('');
    } catch (e) {
      setErr(e.message || 'Нет связи с базой');
    } finally { if (first) setBusy(false); }
  }

  useEffect(() => {
    load(true);
    // Обновляем сами, пока экран открыт: охране не нужно ничего нажимать.
    const t = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') load();
    }, 15000);
    const onShow = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onShow); };
  }, []);

  // По каждой комнате — кто живёт (может быть двое).
  const byRoom = new Map();
  for (const s of stays) {
    const k = Number(s.room);
    if (!byRoom.has(k)) byRoom.set(k, []);
    byRoom.get(k).push(s);
  }
  for (const list of byRoom.values()) list.sort((a, b) => (a.slot || 1) - (b.slot || 1));

  const items = rooms.map((r) => {
    const who = (byRoom.get(Number(r.room)) || []);
    const seats = Number(r.seats) || 1;
    const status = !who.length ? 'free' : who.length < seats ? 'part' : 'occ';
    return { room: Number(r.room), seats, who, status };
  });

  const occ = items.filter((x) => x.who.length).length;
  const free = items.length - occ;
  const freeSeats = items.reduce((a, x) => a + Math.max(0, x.seats - x.who.length), 0);
  const people = stays.length;

  // Поиск: по имени гостя или номеру комнаты.
  const qq = norm(q);
  const found = qq
    ? items.filter((x) => String(x.room).includes(qq) || x.who.some((s) => norm(s.fio).includes(qq)))
    : items;

  return (
    <div className="wrap">
      <TopBar icon="🏨" sub="кто в комнатах · только просмотр"
        right={<Link className="link" style={{ color: '#fff' }} href="/guard">смена →</Link>} />
      <div className="content">

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <h2 style={{ margin: 0 }}>Комнаты сейчас</h2>
            <span className="small">🟢 {at ? 'обновлено в ' + timeHM(at.toISOString()) : '…'}</span>
          </div>
          <div className="small" style={{ marginTop: 2 }}>
            Экран обновляется сам. Здесь ничего нельзя изменить — только посмотреть, кто где живёт.
          </div>

          <div className="kpi3" style={{ marginTop: 10 }}>
            <div className="tile" style={{ background: 'var(--fullbg)' }}>
              <div className="v" style={{ fontSize: 20, color: 'var(--expd)' }}>{people}</div>
              <div className="l" style={{ color: 'var(--expd)' }}>гостей в гостинице</div>
            </div>
            <div className="tile" style={{ background: 'var(--eef)' }}>
              <div className="v" style={{ fontSize: 20, color: 'var(--primd)' }}>{occ}</div>
              <div className="l" style={{ color: 'var(--primd)' }}>комнат занято</div>
            </div>
            <div className="tile" style={{ background: 'var(--freebg)' }}>
              <div className="v" style={{ fontSize: 20, color: 'var(--incd)' }}>{free}</div>
              <div className="l" style={{ color: 'var(--incd)' }}>комнат свободно</div>
            </div>
          </div>
          <div className="small" style={{ marginTop: 6 }}>
            Свободных мест всего: <b>{freeSeats}</b> — с учётом вторых мест в комнатах.
          </div>

          <label>Поиск</label>
          <input placeholder="🔎 фамилия или номер комнаты" value={q} onChange={(e) => setQ(e.target.value)} />
          {qq && (
            <div className="small" style={{ marginTop: 6 }}>
              Найдено комнат: <b>{found.length}</b>.{' '}
              <button className="link" onClick={() => setQ('')}>сбросить</button>
            </div>
          )}

          {err && (
            <div className="small" style={{ marginTop: 10, background: 'var(--partbg)', color: 'var(--warnd)', padding: '8px 10px', borderRadius: 8 }}>
              {err}. Экран покажет данные, как только связь появится.
            </div>
          )}
        </div>

        <div className="card">
          <div className="legend">
            <span><i className="dot" style={{ background: 'var(--free)' }} />свободно</span>
            <span><i className="dot" style={{ background: 'var(--full)' }} />занято</span>
            <span><i className="dot" style={{ background: 'var(--line)' }} />есть 2-е место</span>
          </div>

          {groupByBlock(found, (r) => r.room).map(({ block, items: list, from, to }) => (
            <div key={block}>
              <div className="block-title">
                Блок {block}
                <span>{from}–{to} · свободно {list.filter((r) => r.who.length < r.seats).length} из {list.length}</span>
              </div>
              <div className="rooms">
                {list.map((r) => (
                  <div key={r.room} className={'room ' + r.status} style={{ cursor: 'default' }}
                    title={r.who.map((x) => x.fio).join(' · ')}>
                    <div className="bar" />
                    <div className="n">{r.room}</div>
                    {r.who.length
                      ? r.who.map((x) => <div key={x.id} className="s">{shortName(x.fio)}</div>)
                      : <div className="s">свободно</div>}
                    {r.status === 'part' && <div className="s free2">+1 место</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!found.length && <div className="small">Ничего не найдено.</div>}
        </div>

        {/* Список для смены: кто, где и с какого числа */}
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Список по комнатам</div>
          <div className="small" style={{ marginBottom: 8 }}>Всего проживает: <b>{people}</b>.</div>
          <div style={{ overflow: 'auto' }}>
            <table><tbody>
              <tr><th>Комн.</th><th>Блок</th><th>Гость</th><th>С какого</th></tr>
              {stays.slice().sort((a, b) => Number(a.room) - Number(b.room) || (a.slot || 1) - (b.slot || 1))
                .filter((s) => !qq || String(s.room).includes(qq) || norm(s.fio).includes(qq))
                .map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 700 }}>{s.room}</td>
                    <td>{blockOf(s.room)}</td>
                    <td>{s.fio}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmt(s.arrival)}</td>
                  </tr>
                ))}
              {!stays.length && <tr><td colSpan={4} className="small">Сейчас никто не проживает.</td></tr>}
            </tbody></table>
          </div>
        </div>

        <div className="card">
          <Link className="btn sec" style={{ display: 'block', textDecoration: 'none', textAlign: 'center' }} href="/guard">
            🛡️ Отметить смену
          </Link>
        </div>
      </div>
      <Busy show={busy} />
    </div>
  );
}
