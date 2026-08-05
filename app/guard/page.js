'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client';
import { TopBar, Busy } from '@/components/kit';
import { initials, fmt, timeHM, hoursText } from '@/lib/ui';

export default function GuardPage() {
  const [screen, setScreen] = useState('list'); // list | manual | status | done
  const [busy, setBusy] = useState(false);
  const [guards, setGuards] = useState([]);
  const [name, setName] = useState('');
  const [manualName, setManualName] = useState('');
  const [status, setStatus] = useState({});
  const [done, setDone] = useState(null);

  useEffect(() => { loadGuards(); }, []);

  async function loadGuards() {
    setBusy(true);
    try { setGuards(await api('guards')); }
    catch { alert('Нет связи с базой.'); } finally { setBusy(false); }
  }

  async function openStatus(n) {
    setName(n); setBusy(true);
    try { setStatus(await api('guardStatus', { name: n })); setScreen('status'); }
    catch { alert('Нет связи с базой'); } finally { setBusy(false); }
  }

  async function doIn() {
    setBusy(true);
    try {
      const r = await api('guardIn', { name });
      if (!r.ok) return alert(r.error || 'Ошибка');
      setDone({ title: 'Приход отмечен', rows: { 'Приход': timeHM(r.checkIn), 'Статус': 'на смене' } });
      setScreen('done');
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  async function doOut() {
    setBusy(true);
    try {
      const r = await api('guardOut', { name });
      if (!r.ok) return alert(r.error || 'Ошибка');
      setDone({ title: 'Уход отмечен', rows: { 'Приход': timeHM(r.checkIn), 'Уход': timeHM(r.checkOut), 'Отработано': hoursText(r.hours) } });
      setScreen('done');
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="wrap">
      <TopBar icon="🛡️" sub="охрана · учёт по QR"
        right={<Link className="link" style={{ color: '#fff' }} href="/">на главную</Link>} />
      <div className="content">
        {screen === 'list' && (
          <div className="card">
            <h2>🛡️ Учёт смен</h2>
            <div className="small">Выберите себя. Время фиксирует сервер по нажатию.</div>
            {guards.length ? (
              <div style={{ marginTop: 12 }}>
                {guards.map((n) => (
                  <div key={n} className="list-item" style={{ cursor: 'pointer' }} onClick={() => openStatus(n)}>
                    <div className="avatar">{initials(n)}</div>
                    <div style={{ flex: 1, fontWeight: 600 }}>{n}</div>
                    <span className="chip m">›</span>
                  </div>
                ))}
              </div>
            ) : <div className="small" style={{ marginTop: 10 }}>Список охранников пуст — добавьте в кабинете.</div>}
            <button className="link" style={{ display: 'block', textAlign: 'center', margin: '8px auto 0' }} onClick={() => setScreen('manual')}>
              Ввести имя вручную →
            </button>
          </div>
        )}

        {screen === 'manual' && (
          <div className="card">
            <h2>Ваше имя</h2>
            <label>ФИО охранника</label>
            <input value={manualName} onChange={(e) => setManualName(e.target.value)} />
            <button className="btn" onClick={() => manualName.trim() && openStatus(manualName.trim())}>Далее →</button>
            <button className="link" style={{ display: 'block', textAlign: 'center', margin: '10px auto 0' }} onClick={() => setScreen('list')}>← назад</button>
          </div>
        )}

        {screen === 'status' && (
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="avatar" style={{ width: 64, height: 64, fontSize: 22, margin: '6px auto' }}>{initials(name)}</div>
            <h2 style={{ marginTop: 8 }}>{name}</h2>
            {status.open ? (
              <>
                <div><span className="chip g">на смене с {timeHM(status.checkIn)}</span></div>
                <div className="small" style={{ margin: '10px 0 14px' }}>Приход: {fmt(status.date)} в {timeHM(status.checkIn)}. Нажмите, когда уходите.</div>
                <button className="btn red" onClick={doOut}>🚪 Отметить УХОД</button>
              </>
            ) : (
              <>
                <div><span className="chip m">не на смене</span></div>
                <div className="small" style={{ margin: '10px 0 14px' }}>Нажмите, когда пришли на смену.</div>
                <button className="btn green" onClick={doIn}>✅ Отметить ПРИХОД</button>
              </>
            )}
            <button className="link" style={{ display: 'block', margin: '12px auto 0' }} onClick={() => setScreen('list')}>← к списку</button>
          </div>
        )}

        {screen === 'done' && done && (
          <>
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="ok-circle"><div className="c">✓</div></div>
              <h2>{done.title}</h2>
              <div className="small">{name}</div>
            </div>
            <div className="card">
              <table><tbody>
                {Object.keys(done.rows).map((k) => (
                  <tr key={k}><td className="small">{k}</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{done.rows[k]}</td></tr>
                ))}
              </tbody></table>
              <button className="btn sec" onClick={() => { setScreen('list'); loadGuards(); }}>Готово</button>
            </div>
          </>
        )}
      </div>
      <Busy show={busy} />
    </div>
  );
}
