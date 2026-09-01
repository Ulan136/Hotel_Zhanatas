'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, getSess, setSess, clearSess, getLastLogin, forgetMe, REPORT_SESS_KEY as SK } from '@/lib/client';
import { TopBar, Busy } from '@/components/kit';
import { fmt, nightsNow } from '@/lib/ui';

export default function ReportPage() {
  const [authed, setAuthed] = useState(false);
  const [login, setLogin] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [remember, setRemember] = useState(true);

  // Запомненный вход: если сессия сохранена — сразу открываем отчёт.
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

  function doLogout() { clearSess(SK); setAuthed(false); setPass(''); setRows([]); }

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
  const total = list.reduce((a, s) => { const n = nightsNow(s.arrival, s.departure); return a + (typeof n === 'number' ? n : 0); }, 0);
  const onshift = list.filter((s) => s.status === 'on_shift').length;

  return (
    <div className="wrap">
      <TopBar icon="📊" sub={authed ? 'заказчик · только просмотр' : 'заказчик · отчёт'}
        right={authed
          ? <button className="link" style={{ color: '#fff' }} onClick={doLogout}>выйти</button>
          : <Link className="link" style={{ color: '#fff' }} href="/">на главную</Link>} />
      <div className="content">
        {!authed ? (
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
                        <td>{s.fio}</td><td>№{s.room}</td><td>{fmt(s.arrival)}</td><td>{s.departure ? fmt(s.departure) : '—'}</td>
                        <td>{nightsNow(s.arrival, s.departure)}</td>
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
