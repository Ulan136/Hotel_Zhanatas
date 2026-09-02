'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client';
import { TopBar, Busy } from '@/components/kit';
import { initials, fmt, timeHM, hoursText, todayStr, toAstanaISO,
         defaultShiftType, shiftTypeLabel } from '@/lib/ui';

// ── помощники по времени ──────────────────────────────────────
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}
// Время смены записываем по Астане, а не по часам устройства.
const iso = (dateStr, time) => toAstanaISO(dateStr, time);
/* Возвращает {inTime, outTime, outDate, hours} для выбранного вида смены.
   Видов ровно два: «День» — сутки, «Ночь» — 12 часов с 20:00 до 08:00. */
function planShift(type, date) {
  if (type === 'day') return { inTime: '08:00', outTime: '08:00', outDate: addDays(date, 1), hours: 24 };
  return { inTime: '20:00', outTime: '08:00', outDate: addDays(date, 1), hours: 12 };
}

export default function GuardPage() {
  const [screen, setScreen] = useState('list'); // list | manual | shift | done
  const [busy, setBusy] = useState(false);
  const [guards, setGuards] = useState([]);
  const [name, setName] = useState('');
  const [manualName, setManualName] = useState('');

  const [mode, setMode] = useState('schedule');  // schedule | now
  const [shiftType, setShiftType] = useState(defaultShiftType(todayStr()));
  const [shiftTouched, setShiftTouched] = useState(false);
  const [date, setDate] = useState(todayStr());
  const [live, setLive] = useState({});          // статус живой смены (для режима «сейчас»)
  const [done, setDone] = useState(null);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => { loadGuards(); }, []);
  async function loadGuards() {
    setBusy(true);
    try { setGuards(await api('guards')); }
    catch { alert('Нет связи с базой.'); } finally { setBusy(false); }
  }

  async function openShift(n) {
    setName(n); setBusy(true);
    try { setLive(await api('guardStatus', { name: n })); }
    catch { setLive({}); } finally { setBusy(false); }
    setDate(todayStr()); setShiftType(defaultShiftType(todayStr())); setShiftTouched(false);
    setSavedCount(0); setMode('schedule'); setScreen('shift');
  }

  // Пока вид смены не выбирали руками — он следует за датой (сб/вс — День).
  function changeDate(d) {
    setDate(d);
    if (!shiftTouched) setShiftType(defaultShiftType(d));
  }
  function pickShift(t) { setShiftType(t); setShiftTouched(true); }

  const plan = planShift(shiftType, date);

  async function saveShift() {
    setBusy(true);
    try {
      const r = await api('addShift', {
        name, role: 'Охрана', date, shift: shiftType, hours: plan.hours,
        checkIn: iso(date, plan.inTime), checkOut: iso(plan.outDate, plan.outTime),
      });
      if (!r.ok) return alert(r.error || 'Ошибка');
      setSavedCount((c) => c + 1);
      setDone({
        title: 'Смена записана', name,
        rows: {
          'Смена': shiftTypeLabel(shiftType),
          'Дата': fmt(date),
          'Приход': plan.inTime, 'Уход': plan.outTime,
          'Часы': hoursText(plan.hours),
        },
        nextDate: addDays(date, 1),
      });
      setScreen('done');
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  async function liveIn() {
    setBusy(true);
    try {
      const r = await api('guardIn', { name });
      if (!r.ok) return alert(r.error || 'Ошибка');
      setDone({ title: 'Приход отмечен', name, rows: { 'Приход': timeHM(r.checkIn), 'Статус': 'на смене' } });
      setScreen('done');
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function liveOut() {
    setBusy(true);
    try {
      const r = await api('guardOut', { name });
      if (!r.ok) return alert(r.error || 'Ошибка');
      setDone({ title: 'Уход отмечен', name, rows: { 'Приход': timeHM(r.checkIn), 'Уход': timeHM(r.checkOut), 'Отработано': hoursText(r.hours) } });
      setScreen('done');
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  const segBtn = (val, label, active) => (
    <button
      onClick={() => pickShift(val)}
      style={{
        flex: 1, padding: '12px 4px', borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: 'pointer',
        border: '1px solid var(--line)',
        background: active ? 'var(--primary)' : 'var(--panel)',
        color: active ? '#fff' : 'var(--ink)',
        whiteSpace: 'pre-line', lineHeight: 1.2,
      }}
    >{label}</button>
  );

  return (
    <div className="wrap">
      <TopBar icon="🛡️" sub="охрана · учёт смен"
        right={<Link className="link" style={{ color: '#fff' }} href="/">на главную</Link>} />
      <div className="content">
        {screen === 'list' && (
          <div className="card">
            <h2>🛡️ Учёт смен</h2>
            <div className="small">Выберите себя, чтобы записать смену.</div>
            {guards.length ? (
              <div style={{ marginTop: 12 }}>
                {guards.map((n) => (
                  <div key={n} className="list-item" style={{ cursor: 'pointer' }} onClick={() => openShift(n)}>
                    <div className="avatar">{initials(n)}</div>
                    <div style={{ flex: 1, fontWeight: 600 }}>{n}</div>
                    <span className="chip m">›</span>
                  </div>
                ))}
              </div>
            ) : <div className="small" style={{ marginTop: 10 }}>Список охранников пуст — добавьте в кабинете (⚙ Настройки → Работники, должность «Охрана»).</div>}
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
            <button className="btn" onClick={() => manualName.trim() && openShift(manualName.trim())}>Далее →</button>
            <button className="link" style={{ display: 'block', textAlign: 'center', margin: '10px auto 0' }} onClick={() => setScreen('list')}>← назад</button>
          </div>
        )}

        {screen === 'shift' && (
          <>
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="avatar" style={{ width: 60, height: 60, fontSize: 20, margin: '4px auto' }}>{initials(name)}</div>
              <h2 style={{ marginTop: 6 }}>{name}</h2>
              {live.open && <div style={{ marginTop: 4 }}><span className="chip g">на смене с {timeHM(live.checkIn)}</span></div>}
            </div>

            {/* переключатель режима */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              <button className={'btn ' + (mode === 'schedule' ? '' : 'sec')} style={{ margin: 0 }} onClick={() => setMode('schedule')}>📅 По графику</button>
              <button className={'btn ' + (mode === 'now' ? '' : 'sec')} style={{ margin: 0 }} onClick={() => setMode('now')}>⏱ Сейчас</button>
            </div>

            {mode === 'schedule' ? (
              <div className="card">
                <h2 style={{ fontSize: 16 }}>Записать смену</h2>
                <label>Дата</label>
                <input type="date" value={date} onChange={(e) => changeDate(e.target.value)} />

                <label>Смена</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {segBtn('night', 'Ночь\n20–08', shiftType === 'night')}
                  {segBtn('day', 'День\nсутки', shiftType === 'day')}
                </div>
                <div className="small" style={{ marginTop: 6 }}>
                  {shiftTouched ? 'Смена выбрана вручную.'
                    : (defaultShiftType(date) === 'day'
                        ? 'Суббота или воскресенье — подставлена дневная смена.'
                        : 'Будний день — подставлена ночная смена.')}
                </div>

                <div className="tile" style={{ background: 'var(--eef)', marginTop: 12 }}>
                  <div className="l" style={{ color: 'var(--primd)' }}>
                    {plan.inTime} – {plan.outTime}{plan.outDate !== date ? ' (следующий день)' : ''}
                  </div>
                  <div className="v" style={{ fontSize: 20, color: 'var(--primd)' }}>{hoursText(plan.hours)}</div>
                </div>

                <button className="btn green" disabled={busy} onClick={saveShift}>✓ Сохранить смену</button>
                {savedCount > 0 && <div className="small" style={{ textAlign: 'center', marginTop: 8, color: 'var(--incd)' }}>Записано смен: {savedCount}</div>}
              </div>
            ) : (
              <div className="card" style={{ textAlign: 'center' }}>
                <div className="small" style={{ marginBottom: 12 }}>Кнопка фиксирует текущее время сервера.</div>
                {live.open
                  ? <button className="btn red" onClick={liveOut}>🚪 Отметить УХОД</button>
                  : <button className="btn green" onClick={liveIn}>✅ Отметить ПРИХОД</button>}
              </div>
            )}

            <button className="btn sec" onClick={() => setScreen('list')}>← к списку</button>
          </>
        )}

        {screen === 'done' && done && (
          <>
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="ok-circle"><div className="c">✓</div></div>
              <h2>{done.title}</h2>
              <div className="small">{done.name}</div>
            </div>
            <div className="card">
              <table><tbody>
                {Object.keys(done.rows).map((k) => (
                  <tr key={k}><td className="small">{k}</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{done.rows[k]}</td></tr>
                ))}
              </tbody></table>
              {done.nextDate && (
                <button className="btn" onClick={() => { setDate(done.nextDate); setMode('schedule'); setScreen('shift'); }}>
                  + Записать ещё день ({fmt(done.nextDate)})
                </button>
              )}
              <button className="btn sec" onClick={() => { setScreen('list'); loadGuards(); }}>Готово</button>
            </div>
          </>
        )}
      </div>
      <Busy show={busy} />
    </div>
  );
}
