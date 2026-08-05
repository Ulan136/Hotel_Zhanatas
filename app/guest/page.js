'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client';
import { TopBar, Busy } from '@/components/kit';
import { initials, fmt, nights, todayStr } from '@/lib/ui';

function Dots({ n }) {
  return <div className="step-dots">{[1, 2, 3].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}</div>;
}

export default function GuestPage() {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [guests, setGuests] = useState([]);
  const [q, setQ] = useState('');
  const [gid, setGid] = useState(null);
  const [gfio, setGfio] = useState('');
  const [manual, setManual] = useState(false);
  const [mf, setMf] = useState('');
  const [mp, setMp] = useState('');
  const [freeRooms, setFreeRooms] = useState([]);
  const [room, setRoom] = useState(null);
  const [arrival, setArrival] = useState(todayStr());
  const [departure, setDeparture] = useState('');
  const [doneStay, setDoneStay] = useState(null);

  useEffect(() => { load(); }, []);
  async function load() {
    setBusy(true);
    try { setGuests(await api('guests')); }
    catch { alert('Нет связи с базой.'); } finally { setBusy(false); }
  }

  function pickGuest(g) { setGid(g.id); setGfio(g.fio); goStep2(); }

  async function addSelf() {
    if (!mf.trim()) return alert('Укажите ФИО');
    setBusy(true);
    try {
      const r = await api('addGuest', { fio: mf.trim(), phone: mp });
      if (!r.ok) return alert('Ошибка');
      setGid(r.id); setGfio(mf.trim()); goStep2();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  async function goStep2() {
    setBusy(true);
    try { setFreeRooms(await api('freeRooms')); } catch { setFreeRooms([]); } finally { setBusy(false); }
    setManual(false); setStep(2);
  }

  async function confirmStay() {
    if (!arrival || !departure) return alert('Укажите период');
    setBusy(true);
    try {
      const r = await api('checkin', { guestId: gid, fio: gfio, room, arrival, departure, source: 'qr' });
      if (!r.ok) return alert(r.error || 'Ошибка. Возможно, комнату уже заняли — вернитесь и выберите другую.');
      setDoneStay({ room, arrival, departure });
      setStep(4);
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  const filtered = guests.filter((g) => (g.fio + ' ' + (g.company || '')).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="wrap">
      <TopBar icon="📱" sub="регистрация гостя"
        right={<Link className="link" style={{ color: '#fff' }} href="/">на главную</Link>} />
      <div className="content">
        {step === 1 && !manual && (
          <div className="card">
            <Dots n={1} />
            <h2>Найдите себя в списке</h2>
            <input placeholder="🔎 поиск по фамилии" value={q} onChange={(e) => setQ(e.target.value)} />
            <div style={{ marginTop: 10 }}>
              {filtered.map((g) => (
                <div key={g.id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => pickGuest(g)}>
                  <div className="avatar">{initials(g.fio)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{g.fio}</div>
                    <div className="small">{g.company || ''}</div>
                  </div>
                  <span className="chip m">›</span>
                </div>
              ))}
            </div>
            <button className="link" style={{ display: 'block', textAlign: 'center', margin: '6px auto 0' }} onClick={() => setManual(true)}>
              Меня нет в списке →
            </button>
          </div>
        )}

        {step === 1 && manual && (
          <div className="card">
            <h2>Меня нет в списке</h2>
            <label>Фамилия Имя Отчество</label>
            <input value={mf} onChange={(e) => setMf(e.target.value)} />
            <label>Телефон</label>
            <input value={mp} onChange={(e) => setMp(e.target.value)} />
            <button className="btn" onClick={addSelf}>Далее — выбрать комнату →</button>
            <button className="link" style={{ display: 'block', textAlign: 'center', margin: '10px auto 0' }} onClick={() => setManual(false)}>← назад</button>
          </div>
        )}

        {step === 2 && (
          <div className="card">
            <Dots n={2} />
            <h2>Выберите комнату</h2>
            <div className="small">Свободных: {freeRooms.length} из 28. Нажмите нужную.</div>
            <div className="freeroom-grid">
              {freeRooms.map((n) => (
                <div key={n} className={'fr' + (room === n ? ' sel' : '')} onClick={() => setRoom(n)}>№ {n}</div>
              ))}
            </div>
            <button className="btn" style={{ opacity: room ? 1 : 0.5 }} onClick={() => room ? setStep(3) : alert('Выберите комнату')}>Далее →</button>
          </div>
        )}

        {step === 3 && (
          <div className="card">
            <Dots n={3} />
            <h2>Период проживания</h2>
            <div className="list-item">
              <div className="avatar">{initials(gfio)}</div>
              <div><div style={{ fontWeight: 700 }}>{gfio}</div><div className="small">Комната № {room}</div></div>
            </div>
            <label>Прибытие</label>
            <input type="date" value={arrival} onChange={(e) => setArrival(e.target.value)} />
            <label>Выбытие</label>
            <input type="date" value={departure} onChange={(e) => setDeparture(e.target.value)} />
            <div className="small" style={{ marginTop: 8 }}>
              {nights(arrival, departure) !== '' ? <>Итого проживание: <b>{nights(arrival, departure)} суток</b></> : ''}
            </div>
            <button className="btn green" onClick={confirmStay}>✓ Подтвердить заезд</button>
          </div>
        )}

        {step === 4 && doneStay && (
          <>
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="ok-circle"><div className="c">✓</div></div>
              <h2>Заезд оформлен!</h2>
              <div className="small">Добро пожаловать</div>
            </div>
            <div className="card">
              <table><tbody>
                <tr><td className="small">Комната</td><td style={{ textAlign: 'right', fontWeight: 600 }}>№ {doneStay.room}</td></tr>
                <tr><td className="small">Период</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(doneStay.arrival)} – {fmt(doneStay.departure)}</td></tr>
                <tr><td className="small">Суток</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{nights(doneStay.arrival, doneStay.departure)}</td></tr>
              </tbody></table>
              <Link className="btn sec" href="/" style={{ textAlign: 'center', textDecoration: 'none' }}>Готово</Link>
            </div>
          </>
        )}
      </div>
      <Busy show={busy} />
    </div>
  );
}
