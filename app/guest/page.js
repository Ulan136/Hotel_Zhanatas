'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client';
import { TopBar, Busy } from '@/components/kit';
import { initials, fmt, todayStr, CITIZENSHIPS, groupByBlock } from '@/lib/ui';

function Dots({ n }) {
  return <div className="step-dots">{[1, 2, 3].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}</div>;
}

// Анкета гостя: ФИО, ИИН, Компания, Гражданство, Телефон.
function GuestForm({ init, title, onCancel, onDone }) {
  const [fio, setFio] = useState(init?.fio || '');
  const [iin, setIin] = useState(init?.iin || '');
  const [company, setCompany] = useState(init?.company ?? 'Инжиниринг');
  const [cit, setCit] = useState(init?.citizenship || 'Казахстан');
  const [citOther, setCitOther] = useState('');
  const [phone, setPhone] = useState(init?.phone || '');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!fio.trim()) return alert('Укажите ФИО');
    if (!iin.trim()) return alert('Укажите ИИН');
    const citizenship = (cit === 'Другое' ? citOther.trim() : cit);
    if (!citizenship) return alert('Укажите гражданство');
    const payload = { fio: fio.trim(), iin: iin.trim(), company: company.trim(), citizenship, phone: phone.trim() };
    setBusy(true);
    try {
      const r = init?.id
        ? await api('updateGuest', { id: init.id, ...payload })
        : await api('addGuest', payload);
      if (!r.ok) return alert(r.error || 'Ошибка');
      onDone({ id: init?.id ?? r.id, ...payload });
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="card">
      <h2>{title}</h2>
      <label>Фамилия Имя Отчество</label>
      <input value={fio} onChange={(e) => setFio(e.target.value)} placeholder="Иванов Иван Иванович" />

      <label>ИИН</label>
      <input value={iin} onChange={(e) => setIin(e.target.value)} inputMode="numeric" placeholder="12 цифр" />

      <label>Компания / вахта</label>
      <input value={company} onChange={(e) => setCompany(e.target.value)} />

      <label>Гражданство</label>
      <select value={cit} onChange={(e) => setCit(e.target.value)}>
        {CITIZENSHIPS.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      {cit === 'Другое' && (
        <input value={citOther} onChange={(e) => setCitOther(e.target.value)} placeholder="укажите страну" />
      )}

      <label>Телефон</label>
      <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+7 ___ ___ __ __" />

      <button className="btn" disabled={busy} onClick={submit}>Далее — выбрать комнату →</button>
      {onCancel && (
        <button className="link" style={{ display: 'block', textAlign: 'center', margin: '10px auto 0' }} onClick={onCancel}>← назад</button>
      )}
      <Busy show={busy} />
    </div>
  );
}

export default function GuestPage() {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [guests, setGuests] = useState([]);
  const [q, setQ] = useState('');
  const [gid, setGid] = useState(null);
  const [gfio, setGfio] = useState('');
  const [form, setForm] = useState(null); // null | {mode:'new'|'fill', init}
  const [freeRooms, setFreeRooms] = useState([]);
  const [room, setRoom] = useState(null);
  const [arrival, setArrival] = useState(todayStr());
  const [doneStay, setDoneStay] = useState(null);

  useEffect(() => { load(); }, []);
  async function load() {
    setBusy(true);
    try {
      const r = await api('guests');
      // Если API вернул ошибку (например, в базе ещё нет колонок iin/citizenship) —
      // не роняем страницу, а показываем понятное сообщение.
      if (Array.isArray(r)) setGuests(r);
      else { setGuests([]); alert(r?.error || 'База ещё не обновлена. Обратитесь к администратору.'); }
    } catch (e) { setGuests([]); alert(e.message || 'Нет связи с базой.'); }
    finally { setBusy(false); }
  }

  // Если у гостя из списка нет ИИН или гражданства — просим дозаполнить анкету.
  function pickGuest(g) {
    if (!g.iin || !g.citizenship) { setForm({ mode: 'fill', init: g }); return; }
    setGid(g.id); setGfio(g.fio); goStep2();
  }

  function afterForm(g) {
    setGid(g.id); setGfio(g.fio); setForm(null); goStep2();
  }

  async function goStep2() {
    setBusy(true);
    try { const fr = await api('freeRooms'); setFreeRooms(Array.isArray(fr) ? fr : []); } catch { setFreeRooms([]); } finally { setBusy(false); }
    setStep(2);
  }

  async function confirmStay() {
    if (!arrival) return alert('Укажите дату прибытия');
    setBusy(true);
    try {
      const r = await api('checkin', { guestId: gid, fio: gfio, room, arrival, source: 'qr' });
      if (!r.ok) return alert(r.error || 'Ошибка. Возможно, комнату уже заняли — вернитесь и выберите другую.');
      setDoneStay({ room, arrival });
      setStep(4);
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  const filtered = guests.filter((g) =>
    (g.fio + ' ' + (g.company || '') + ' ' + (g.iin || '')).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="wrap">
      <TopBar icon="📱" sub="регистрация гостя"
        right={<Link className="link" style={{ color: '#fff' }} href="/">на главную</Link>} />
      <div className="content">
        {step === 1 && form && (
          <GuestForm
            title={form.mode === 'fill' ? 'Дополните данные' : 'Меня нет в списке'}
            init={form.init}
            onCancel={() => setForm(null)}
            onDone={afterForm}
          />
        )}

        {step === 1 && !form && (
          <div className="card">
            <Dots n={1} />
            <h2>Найдите себя в списке</h2>
            <input placeholder="🔎 поиск по фамилии или ИИН" value={q} onChange={(e) => setQ(e.target.value)} />
            <div style={{ marginTop: 10 }}>
              {filtered.map((g) => (
                <div key={g.id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => pickGuest(g)}>
                  <div className="avatar">{initials(g.fio)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{g.fio}</div>
                    <div className="small">{[g.company, g.citizenship].filter(Boolean).join(' · ')}</div>
                  </div>
                  <span className="chip m">›</span>
                </div>
              ))}
            </div>
            <button className="link" style={{ display: 'block', textAlign: 'center', margin: '6px auto 0' }} onClick={() => setForm({ mode: 'new' })}>
              Меня нет в списке →
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="card">
            <Dots n={2} />
            <h2>Выберите комнату</h2>
            <div className="small">Свободных комнат: {freeRooms.length}. Нажмите нужную.</div>
            {freeRooms.length === 0 && <div className="small">Свободных комнат нет — обратитесь на ресепшн.</div>}
            {groupByBlock(freeRooms).map(({ block, items }) => (
              <div key={block}>
                <div className="block-title">Блок {block}<span>свободно {items.length}</span></div>
                <div className="freeroom-grid">
                  {items.map((n) => (
                    <div key={n} className={'fr' + (room === n ? ' sel' : '')} onClick={() => setRoom(n)}>№ {n}</div>
                  ))}
                </div>
              </div>
            ))}
            <button className="btn" style={{ opacity: room ? 1 : 0.5 }} onClick={() => room ? setStep(3) : alert('Выберите комнату')}>Далее →</button>
          </div>
        )}

        {step === 3 && (
          <div className="card">
            <Dots n={3} />
            <h2>Дата прибытия</h2>
            <div className="list-item">
              <div className="avatar">{initials(gfio)}</div>
              <div><div style={{ fontWeight: 700 }}>{gfio}</div><div className="small">Блок {Math.floor(room / 100) || 1} · комната № {room}</div></div>
            </div>
            <label>Прибытие</label>
            <input type="date" value={arrival} onChange={(e) => setArrival(e.target.value)} />
            <div className="small" style={{ marginTop: 8 }}>
              Дата выбытия не указывается — её отметит ресепшн при выселении.
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
                <tr><td className="small">Гость</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{gfio}</td></tr>
                <tr><td className="small">Комната</td><td style={{ textAlign: 'right', fontWeight: 600 }}>№ {doneStay.room}</td></tr>
                <tr><td className="small">Прибытие</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(doneStay.arrival)}</td></tr>
                <tr><td className="small">Статус</td><td style={{ textAlign: 'right', fontWeight: 600 }}>на смене</td></tr>
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
