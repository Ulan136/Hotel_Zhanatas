'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client';
import { TopBar, Busy } from '@/components/kit';
import { fmt, nights } from '@/lib/ui';

export default function ReportPage() {
  const [authed, setAuthed] = useState(false);
  const [login, setLogin] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  async function doLogin() {
    setBusy(true);
    try {
      const r = await api('login', { login: login.trim(), pass: pass.trim() });
      if (!r.ok || r.user.role !== 'factory') return alert('Неверный логин или пароль');
      setAuthed(true);
      await render();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  async function render() {
    setBusy(true);
    try {
      const data = await api('stays');
      setRows(Array.isArray(data) ? data : []);
    } catch { setRows([]); } finally { setBusy(false); }
  }

  let list = rows.slice().sort((a, b) => (a.arrival < b.arrival ? 1 : -1));
  if (from) list = list.filter((s) => String(s.arrival).slice(0, 10) >= from);
  if (to) list = list.filter((s) => String(s.arrival).slice(0, 10) <= to);
  const total = list.reduce((a, s) => { const n = nights(s.arrival, s.departure); return a + (typeof n === 'number' ? n : 0); }, 0);
  const onshift = list.filter((s) => s.status === 'on_shift').length;

  return (
    <div className="wrap">
      <TopBar icon="📊" sub={authed ? 'заказчик · только просмотр' : 'заказчик · отчёт'}
        right={<Link className="link" style={{ color: '#fff' }} href="/">на главную</Link>} />
      <div className="content">
        {!authed ? (
          <div className="card">
            <h2>🔒 Вход для отчёта</h2>
            <div className="small">Только просмотр отчёта о проживании (вахтовый метод).</div>
            <label>Логин</label>
            <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="otchet" />
            <label>Пароль</label>
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doLogin()} placeholder="•••" />
            <button className="btn" onClick={doLogin}>Войти</button>
            <div className="small" style={{ marginTop: 12, background: 'var(--partbg)', color: 'var(--warnd)', padding: '8px 10px', borderRadius: 8 }}>
              Доступ выдаёт администратор в разделе «Пользователи» (роль «Заказчик»).
            </div>
          </div>
        ) : (
          <>
            <div className="card noprint">
              <h2>Посещаемость вахты</h2>
              <div className="small">Только просмотр. Данные обновляются автоматически.</div>
              <label>Период с</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <label>по</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              <button className="btn sec" onClick={() => window.print()}>🖨 Печать / PDF</button>
            </div>
            <div className="card">
              <div className="tiles" style={{ marginBottom: 12 }}>
                <div className="tile" style={{ background: 'var(--freebg)' }}>
                  <div className="v" style={{ fontSize: 20, color: 'var(--incd)' }}>{onshift}</div>
                  <div className="l" style={{ color: 'var(--incd)' }}>сейчас на смене</div>
                </div>
                <div className="tile" style={{ background: 'var(--eef)' }}>
                  <div className="v" style={{ fontSize: 20, color: 'var(--primd)' }}>{total}</div>
                  <div className="l" style={{ color: 'var(--primd)' }}>человеко-суток</div>
                </div>
              </div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Отчёт о проживании (вахтовый метод)</div>
              <div className="small" style={{ marginBottom: 8 }}>Всего проживаний: {list.length}</div>
              <div style={{ overflow: 'auto' }}>
                <table>
                  <tbody>
                    <tr><th>ФИО</th><th>Комн.</th><th>Прибытие</th><th>Выбытие</th><th>Сут.</th><th>Статус</th></tr>
                    {list.length ? list.map((s) => (
                      <tr key={s.id}>
                        <td>{s.fio}</td><td>№{s.room}</td><td>{fmt(s.arrival)}</td><td>{fmt(s.departure)}</td>
                        <td>{nights(s.arrival, s.departure)}</td>
                        <td>{s.status === 'closed' ? 'закрыт' : s.status === 'booked' ? 'бронь' : 'на смене'}</td>
                      </tr>
                    )) : <tr><td colSpan={6} className="small">Нет данных за период.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
      <Busy show={busy} />
    </div>
  );
}
