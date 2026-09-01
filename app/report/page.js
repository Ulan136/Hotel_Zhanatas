'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, getSess, setSess, clearSess, getLastLogin, forgetMe, REPORT_SESS_KEY as SK } from '@/lib/client';
import { TopBar, Busy } from '@/components/kit';
import { fmt, nightsNow, todayStr, groupByBlock, blockOf, formatPhone } from '@/lib/ui';
import { fuzzyScore } from '@/lib/fuzzy';

const onlyDigits = (v) => String(v || '').replace(/\D/g, '');

// Выгрузка в Excel: CSV с точкой с запятой и BOM — Excel открывает такой файл сразу.
function downloadCSV(filename, rows) {
  const cell = (v) => { v = String(v == null ? '' : v); return /[";\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const csv = rows.map((r) => r.map(cell).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function statusText(s) {
  return s === 'closed' ? 'выехал' : s === 'booked' ? 'бронь' : 'проживает';
}

export default function ReportPage() {
  const [authed, setAuthed] = useState(false);
  const [login, setLogin] = useState('');
  const [pass, setPass] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);

  const [rows, setRows] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [q, setQ] = useState('');

  useEffect(() => {
    const s = getSess(SK);
    if (s) { setAuthed(true); render(); return; }
    const l = getLastLogin(SK);
    if (l) setLogin(l);
  }, []);

  async function doLogin() {
    if (!login.trim() || !pass) return alert('Введите логин и пароль');
    setBusy(true);
    try {
      const r = await api('login', { login: login.trim(), pass: pass.trim() });
      if (!r.ok || r.user.role !== 'factory') return alert('Неверный логин или пароль');
      setSess({ name: r.user.name, login: r.user.login, role: r.user.role }, remember, SK);
      setAuthed(true);
      await render();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  function doLogout() { clearSess(SK); setAuthed(false); setPass(''); setRows([]); setRooms([]); }

  async function render() {
    setBusy(true);
    try {
      const d = await api('report');
      setRows(Array.isArray(d?.rows) ? d.rows : []);
      setRooms(Array.isArray(d?.rooms) ? d.rooms : []);
    } catch { setRows([]); setRooms([]); } finally { setBusy(false); }
  }

  /* ---------- текущая занятость (на сейчас) ---------- */
  const active = rows.filter((s) => s.status !== 'closed');
  const busyRooms = new Map(active.map((s) => [s.room, s]));
  const freeRooms = rooms.filter((n) => !busyRooms.has(n));

  /* ---------- фильтр периода ---------- */
  // Проживание попадает в отчёт, если пересекается с выбранным периодом.
  const day = (v) => String(v || '').slice(0, 10);
  let list = rows.filter((s) => {
    const a = day(s.arrival);
    const d = day(s.departure) || '9999-12-31';
    if (from && d < from) return false;
    if (to && a > to) return false;
    return true;
  });

  /* ---------- поиск: ФИО (с опечатками), ИИН, телефон ---------- */
  const qDigits = onlyDigits(q);
  if (q.trim()) {
    list = list.filter((s) => {
      if (qDigits.length >= 3) {
        if (onlyDigits(s.iin).includes(qDigits)) return true;
        if (onlyDigits(s.phone).includes(qDigits)) return true;
      }
      return fuzzyScore(q, s.fio) !== null;
    });
  }

  const totalNights = list.reduce((a, s) => {
    const n = nightsNow(s.arrival, s.departure);
    return a + (typeof n === 'number' ? n : 0);
  }, 0);
  const livingNow = list.filter((s) => s.status !== 'closed').length;

  const period = from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;

  function setToday() { setFrom(todayStr()); setTo(todayStr()); }
  function setDays(n) {
    const d = new Date(); d.setDate(d.getDate() - (n - 1));
    const p = (x) => String(x).padStart(2, '0');
    setFrom(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
    setTo(todayStr());
  }

  function exportExcel() {
    const head = ['№', 'ФИО', 'ИИН', 'Телефон', 'Компания', 'Гражданство', 'Блок', 'Комната', 'Прибытие', 'Выбытие', 'Суток', 'Статус'];
    const body = list.map((s, i) => [
      i + 1, s.fio, s.iin || '', s.phone ? formatPhone(s.phone) : '', s.company || '', s.citizenship || '',
      blockOf(s.room), s.room, fmt(s.arrival), s.departure ? fmt(s.departure) : '—',
      nightsNow(s.arrival, s.departure), statusText(s.status),
    ]);
    const meta = [
      ['MEDINA — отчёт о проживании (вахтовый метод)'],
      ['Период', period],
      ['Проживаний в отчёте', list.length, 'человеко-суток', totalNights],
      ['Свободно комнат', freeRooms.length, 'занято', busyRooms.size],
      [],
    ];
    downloadCSV(`MEDINA_отчёт_${from}_${to}.csv`, [...meta, head, ...body]);
  }

  if (!authed) {
    return (
      <div className="wrap">
        <TopBar icon="📊" sub="заказчик · отчёт"
          right={<Link className="link" style={{ color: '#fff' }} href="/">на главную</Link>} />
        <div className="content">
          <div className="card">
            <h2>🔒 Вход для отчёта</h2>
            <div className="small">Только просмотр отчёта о проживании (вахтовый метод).</div>
            <label>Логин</label>
            <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="otchet"
              autoComplete="username" name="username" />
            <label>Пароль</label>
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doLogin()} placeholder="•••"
              autoComplete="current-password" name="password" />
            <label className="remember">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>Запомнить меня на этом устройстве</span>
            </label>
            <button className="btn" onClick={doLogin}>Войти</button>
            {login && (
              <button className="link" style={{ display: 'block', margin: '10px auto 0', fontSize: 13 }}
                onClick={() => { forgetMe(SK); setLogin(''); setPass(''); }}>Это не я — забыть логин</button>
            )}
            <div className="small" style={{ marginTop: 12, background: 'var(--partbg)', color: 'var(--warnd)', padding: '8px 10px', borderRadius: 8 }}>
              Доступ выдаёт администратор в разделе «Пользователи» (роль «Заказчик»).
            </div>
          </div>
        </div>
        <Busy show={busy} />
      </div>
    );
  }

  return (
    <div className="wrap">
      <TopBar icon="📊" sub="заказчик · только просмотр"
        right={<button className="link" style={{ color: '#fff' }} onClick={doLogout}>выйти</button>} />
      <div className="content">

        {/* --- Период и выгрузка --- */}
        <div className="card noprint">
          <h2>Отчёт о проживании</h2>
          <div className="small">Данные обновляются автоматически. Только просмотр.</div>

          <div className="chips-row">
            <button className={'chipbtn' + (from === todayStr() && to === todayStr() ? ' on' : '')} onClick={setToday}>Сегодня</button>
            <button className="chipbtn" onClick={() => setDays(7)}>7 дней</button>
            <button className="chipbtn" onClick={() => setDays(30)}>30 дней</button>
          </div>

          <div className="two">
            <div><label>Период с</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><label>по</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>

          <div className="two" style={{ marginTop: 10 }}>
            <button className="btn sec" style={{ margin: 0 }} onClick={() => window.print()}>🖨 PDF / печать</button>
            <button className="btn sec" style={{ margin: 0 }} onClick={exportExcel}>⤓ Excel</button>
          </div>
          <div className="small" style={{ marginTop: 6 }}>
            В PDF и Excel уходит то, что видно ниже, — с учётом периода и поиска.
          </div>
        </div>

        {/* --- Сводка --- */}
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>MEDINA · {period}</div>
          <div className="kpi3">
            <div className="tile" style={{ background: 'var(--freebg)' }}>
              <div className="v" style={{ fontSize: 20, color: 'var(--incd)' }}>{livingNow}</div>
              <div className="l" style={{ color: 'var(--incd)' }}>проживает</div>
            </div>
            <div className="tile" style={{ background: 'var(--eef)' }}>
              <div className="v" style={{ fontSize: 20, color: 'var(--primd)' }}>{list.length}</div>
              <div className="l" style={{ color: 'var(--primd)' }}>проживаний</div>
            </div>
            <div className="tile" style={{ background: 'var(--partbg)' }}>
              <div className="v" style={{ fontSize: 20, color: 'var(--warnd)' }}>{totalNights}</div>
              <div className="l" style={{ color: 'var(--warnd)' }}>человеко-суток</div>
            </div>
          </div>
        </div>

        {/* --- Поиск и таблица --- */}
        <div className="card">
          <div className="noprint">
            <label>Поиск</label>
            <input placeholder="🔎 ФИО, ИИН или телефон" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="small" style={{ marginTop: 6 }}>
              Поиск по фамилии терпит опечатки. По ИИН и телефону — от трёх цифр подряд.
              {q && <> <button className="link" onClick={() => setQ('')}>сбросить</button></>}
            </div>
          </div>

          <div style={{ fontWeight: 700, margin: '12px 0 6px' }}>Проживание работников</div>
          <div style={{ overflow: 'auto' }}>
            <table>
              <tbody>
                <tr>
                  <th>ФИО</th><th>ИИН</th><th>Телефон</th><th>Компания</th>
                  <th>Комн.</th><th>Прибытие</th><th>Выбытие</th><th>Сут.</th><th>Статус</th>
                </tr>
                {list.length ? list.map((s) => (
                  <tr key={s.id}>
                    <td>{s.fio}</td>
                    <td>{s.iin || '—'}</td>
                    <td>{s.phone ? formatPhone(s.phone) : '—'}</td>
                    <td>{s.company || '—'}</td>
                    <td>№{s.room}</td>
                    <td>{fmt(s.arrival)}</td>
                    <td>{s.departure ? fmt(s.departure) : '—'}</td>
                    <td>{nightsNow(s.arrival, s.departure)}</td>
                    <td>{statusText(s.status)}</td>
                  </tr>
                )) : <tr><td colSpan={9} className="small">Ничего не найдено за выбранный период.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* --- Занятость комнат --- */}
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Комнаты сейчас</div>
          <div className="small" style={{ marginBottom: 8 }}>
            Свободно <b style={{ color: 'var(--incd)' }}>{freeRooms.length}</b> ·
            занято <b style={{ color: 'var(--expd)' }}>{busyRooms.size}</b> из {rooms.length}
          </div>

          <div className="block-title">Свободные комнаты<span>{freeRooms.length}</span></div>
          {freeRooms.length ? groupByBlock(freeRooms).map(({ block, items }) => (
            <div key={block}>
              <div className="small" style={{ margin: '6px 0 2px' }}>Блок {block} · {items.length}</div>
              <div className="roomchips">
                {items.map((n) => <span key={n} className="rchip free">{n}</span>)}
              </div>
            </div>
          )) : <div className="small">Свободных комнат нет.</div>}

          <div className="block-title">Занятые комнаты<span>{busyRooms.size}</span></div>
          {busyRooms.size ? groupByBlock([...busyRooms.keys()]).map(({ block, items }) => (
            <div key={block}>
              <div className="small" style={{ margin: '6px 0 2px' }}>Блок {block} · {items.length}</div>
              <div className="roomchips">
                {items.map((n) => (
                  <span key={n} className="rchip occ" title={busyRooms.get(n)?.fio}>
                    {n} <i>{busyRooms.get(n)?.fio}</i>
                  </span>
                ))}
              </div>
            </div>
          )) : <div className="small">Занятых комнат нет.</div>}
        </div>

      </div>
      <Busy show={busy} />
    </div>
  );
}
