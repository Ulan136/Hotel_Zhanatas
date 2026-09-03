'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client';
import { TopBar, Busy } from '@/components/kit';
import { initials, fmt, todayStr, nowTime, nightsNow, fmtDateTime, toAstanaISO,
         CITIZENSHIPS, DEFAULT_COMPANY, POSITIONS,
         PHONE_PLACEHOLDER, formatPhone, cleanPhone, groupByBlock, blockOf,
         BIRTH_PLACEHOLDER, formatBirth, birthToISO, birthInput,
         birthLegacyYear, birthError } from '@/lib/ui';
import { fuzzySearch } from '@/lib/fuzzy';

/* Экраны:
   start      — Прибытие / Выбытие
   in-choice  — Вход / Регистрация
   in-search  — поиск себя по ФИО
   in-form    — анкета (новая или дозаполнение)
   in-room    — выбор комнаты
   in-date    — дата прибытия
   in-done    — чек о заезде
   out-search — поиск себя среди проживающих
   out-date   — дата выбытия и подтверждение
   out-done   — чек о выезде                                     */

function Steps({ n, of }) {
  return <div className="step-dots">{Array.from({ length: of }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}</div>;
}

/* Дата и точное время по Астане. Подставляем «сейчас», но всё можно изменить —
   для поздних регистраций. */
function DateTimeField({ label, date, time, onDate, onTime }) {
  const isNow = date === todayStr();
  return (
    <>
      <label>{label}</label>
      <div className="two">
        <input type="date" value={date} onChange={(e) => onDate(e.target.value)} />
        <input type="time" value={time} onChange={(e) => onTime(e.target.value)} />
      </div>
      <div className="small" style={{ marginTop: 6 }}>
        Время по Астане. Подставлены сегодняшний день и текущее время — при необходимости измените.
        {!isNow && <> <button className="link" onClick={() => { onDate(todayStr()); onTime(nowTime()); }}>вернуть сейчас</button></>}
      </div>
    </>
  );
}

// Поиск по ФИО с подсказками. Списка заранее нет — он появляется по мере набора.
function NameSearch({ items, getText, onPick, sub, placeholder, nothing }) {
  const [q, setQ] = useState('');
  const found = fuzzySearch(q, items, getText);
  const typed = q.trim().length > 0;
  return (
    <>
      <input autoFocus placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
      {!typed && <div className="small" style={{ marginTop: 10 }}>Начните набирать ФИО — подскажем совпадения.</div>}
      {typed && found.length === 0 && <div className="small" style={{ marginTop: 10 }}>{nothing}</div>}
      <div style={{ marginTop: 10 }}>
        {found.map((it, i) => (
          <div key={it.id ?? i} className="list-item" style={{ cursor: 'pointer' }} onClick={() => onPick(it)}>
            <div className="avatar">{initials(getText(it))}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{getText(it)}</div>
              <div className="small">{sub ? sub(it) : ''}</div>
            </div>
            <span className="chip m">›</span>
          </div>
        ))}
      </div>
    </>
  );
}

// Анкета гостя: ФИО, ИИН, Компания, Гражданство, Телефон.
function GuestForm({ init, title, onCancel, onDone }) {
  const known = CITIZENSHIPS.includes(init?.citizenship || '');
  const [fio, setFio] = useState(init?.fio || '');
  const [iin, setIin] = useState(init?.iin || '');
  const [docNo, setDocNo] = useState(init?.docNo || '');
  const [birth, setBirth] = useState(birthInput(init?.birthYear || ''));
  const bornYearOnly = birthLegacyYear(init?.birthYear || '');
  const [company, setCompany] = useState(init?.company ?? DEFAULT_COMPANY);
  const knownPos = POSITIONS.includes(init?.position || '');
  const [pos, setPos] = useState(init?.position ? (knownPos ? init.position : 'Другое') : 'Инженер');
  const [posOther, setPosOther] = useState(init?.position && !knownPos ? init.position : '');
  const [destination, setDestination] = useState(init?.destination || '');
  const [cit, setCit] = useState(init?.citizenship ? (known ? init.citizenship : 'Другое') : 'Казахстан');
  const [citOther, setCitOther] = useState(init?.citizenship && !known ? init.citizenship : '');
  const [phone, setPhone] = useState(init?.phone ? formatPhone(init.phone) : '+7 ');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!fio.trim()) return alert('Укажите ФИО');
    if (!iin.trim()) return alert('Укажите ИИН или номер паспорта');
    const citizenship = cit === 'Другое' ? citOther.trim() : cit;
    if (!citizenship) return alert('Укажите гражданство');
    const position = pos === 'Другое' ? posOther.trim() : pos;
    const bad = birthError(birth);
    if (bad) return alert(bad);
    const payload = {
      fio: fio.trim(), iin: iin.trim(), docNo: docNo.trim(), birthYear: birth.trim() ? birthToISO(birth.trim()) : bornYearOnly,
      company: company.trim(), position, destination: destination.trim(),
      citizenship, phone: cleanPhone(phone),
    };
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
      <label>ФИО</label>
      <input value={fio} onChange={(e) => setFio(e.target.value)} />

      <label>ИИН / Номер паспорта</label>
      <input value={iin} onChange={(e) => setIin(e.target.value)} placeholder="12 цифр или номер паспорта" />

      <label>Номер документа</label>
      <input value={docNo} onChange={(e) => setDocNo(e.target.value)} placeholder="удостоверение или паспорт" />

      <label>Дата рождения</label>
      <input value={birth} onChange={(e) => setBirth(formatBirth(e.target.value))}
        inputMode="numeric" placeholder={BIRTH_PLACEHOLDER} />
      <div className="small" style={{ marginTop: 4 }}>
        {bornYearOnly
          ? <>Раньше был указан только год — <b>{bornYearOnly}</b>. Впишите полную дату.</>
          : 'День, месяц, год — точки подставятся сами.'}
      </div>

      <label>Компания / вахта</label>
      <input value={company} onChange={(e) => setCompany(e.target.value)} />

      <label>Должность</label>
      <select value={pos} onChange={(e) => setPos(e.target.value)}>
        {POSITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      {pos === 'Другое' && <input value={posOther} onChange={(e) => setPosOther(e.target.value)} placeholder="укажите должность" />}

      <label>Куда (объект / цех)</label>
      <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="например: ремонтный цех" />

      <label>Гражданство</label>
      <select value={cit} onChange={(e) => setCit(e.target.value)}>
        {CITIZENSHIPS.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      {cit === 'Другое' && <input value={citOther} onChange={(e) => setCitOther(e.target.value)} placeholder="укажите страну" />}

      <label>Телефон</label>
      <input value={phone} inputMode="tel" placeholder={PHONE_PLACEHOLDER}
        onChange={(e) => setPhone(formatPhone(e.target.value))}
        onFocus={(e) => { if (!e.target.value) setPhone('+7 '); }} />

      <button className="btn" disabled={busy} onClick={submit}>Далее — выбрать комнату →</button>
      <button className="link" style={{ display: 'block', textAlign: 'center', margin: '10px auto 0' }} onClick={onCancel}>← назад</button>
      <Busy show={busy} />
    </div>
  );
}

export default function GuestPage() {
  const [screen, setScreen] = useState('start');
  const [busy, setBusy] = useState(false);
  const [guests, setGuests] = useState([]);
  const [stays, setStays] = useState([]);
  const [living, setLiving] = useState([]);

  const [guest, setGuest] = useState(null);
  const [formInit, setFormInit] = useState(null);
  const [freeRooms, setFreeRooms] = useState([]);
  const [room, setRoom] = useState(null);
  const [arrival, setArrival] = useState(todayStr());
  const [arrTime, setArrTime] = useState(nowTime());

  const [stay, setStay] = useState(null);
  const [departure, setDeparture] = useState(todayStr());
  const [depTime, setDepTime] = useState(nowTime());
  const [receipt, setReceipt] = useState(null);

  // Дата берётся у устройства гостя, поэтому проставляем её после монтирования.
  useEffect(() => { setArrival(todayStr()); setDeparture(todayStr()); setArrTime(nowTime()); setDepTime(nowTime()); }, []);

  function reset() {
    setScreen('start'); setGuest(null); setFormInit(null); setRoom(null);
    setStay(null); setReceipt(null);
    setArrival(todayStr()); setDeparture(todayStr()); setArrTime(nowTime()); setDepTime(nowTime());
  }

  async function load(action, setter) {
    setBusy(true);
    try {
      const r = await api(action);
      if (Array.isArray(r)) { setter(r); return r; }
      alert(r?.error || 'База недоступна. Обратитесь на ресепшн.');
      setter([]); return [];
    } catch (e) { alert(e.message || 'Нет связи с базой.'); setter([]); return []; }
    finally { setBusy(false); }
  }

  /* ---------------- Прибытие ---------------- */
  async function startArrival() {
    await load('publicGuests', setGuests);
    await load('publicStays', setStays);
    setScreen('in-choice');
  }

  function pickGuest(g) {
    const active = stays.find((s) => String(s.guestId) === String(g.id) && s.status !== 'closed');
    if (active) {
      return alert(`${g.fio}, вы уже заселены — блок ${blockOf(active.room)}, комната №${active.room}.\n\n`
        + 'Если нужно выехать, вернитесь назад и нажмите «ВЫБЫТИЕ».');
    }
    setGuest(g);
    // Нет ИИН или гражданства — сначала просим дозаполнить анкету.
    if (!g.hasIin || !g.citizenship) { setFormInit(g); setScreen('in-form'); return; }
    goRooms();
  }

  function afterForm(g) { setGuest(g); setFormInit(null); goRooms(); }

  async function goRooms() {
    await load('freeRooms', setFreeRooms);
    setRoom(null);
    setScreen('in-room');
  }

  async function confirmArrival() {
    if (!arrival) return alert('Укажите дату прибытия');
    setBusy(true);
    try {
      const arrivedAt = toAstanaISO(arrival, arrTime);
      const r = await api('checkin', { guestId: guest?.id, fio: guest?.fio, room, arrival, arrivedAt, source: 'qr' });
      if (!r.ok) return alert(r.error || 'Комнату уже заняли — вернитесь и выберите другую.');
      setReceipt({ fio: guest?.fio, room, arrival, arrivedAt });
      setScreen('in-done');
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  /* ---------------- Выбытие ---------------- */
  async function startDeparture() {
    const r = await load('publicStays', setStays);
    setLiving(r.filter((s) => s.status !== 'closed'));
    setScreen('out-search');
  }

  function pickStay(s) { setStay(s); setDeparture(todayStr()); setDepTime(nowTime()); setScreen('out-date'); }

  async function confirmDeparture() {
    if (!departure) return alert('Укажите дату выбытия');
    if (stay?.arrival && departure < String(stay.arrival).slice(0, 10)) {
      return alert('Дата выбытия раньше даты прибытия. Проверьте дату.');
    }
    setBusy(true);
    try {
      const departedAt = toAstanaISO(departure, depTime);
      const r = await api('checkout', { id: stay.id, departure, departedAt });
      if (!r.ok) return alert(r.error || 'Ошибка');
      setReceipt({ fio: stay.fio, room: stay.room, arrival: stay.arrival, arrivedAt: stay.arrivedAt, departure, departedAt });
      setScreen('out-done');
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  const back = (to) => (
    <button className="link" style={{ display: 'block', textAlign: 'center', margin: '10px auto 0' }} onClick={to}>← назад</button>
  );

  return (
    <div className="wrap">
      <TopBar icon="📱" sub="регистрация гостя"
        right={<Link className="link" style={{ color: '#fff' }} href="/">на главную</Link>} />
      <div className="content">

        {screen === 'start' && (
          <div className="card">
            <h2>Что отмечаем?</h2>
            <div className="small">Выберите действие.</div>
            <div className="pick2">
              <button className="pick in" onClick={startArrival}>
                <span className="ic">→</span><span className="t">ПРИБЫТИЕ</span><span className="d">заезд в комнату</span>
              </button>
              <button className="pick out" onClick={startDeparture}>
                <span className="ic">←</span><span className="t">ВЫБЫТИЕ</span><span className="d">выезд из комнаты</span>
              </button>
            </div>
          </div>
        )}

        {screen === 'in-choice' && (
          <div className="card">
            <Steps n={1} of={3} />
            <h2>Прибытие</h2>
            <div className="small">Вы уже есть в базе или заселяетесь впервые?</div>
            <div className="pick2">
              <button className="pick in" onClick={() => setScreen('in-search')}>
                <span className="ic">👤</span><span className="t">Вход</span><span className="d">я уже есть в базе</span>
              </button>
              <button className="pick reg" onClick={() => { setFormInit(null); setScreen('in-form'); }}>
                <span className="ic">✎</span><span className="t">Регистрация</span><span className="d">заполнить анкету</span>
              </button>
            </div>
            {back(reset)}
          </div>
        )}

        {screen === 'in-search' && (
          <div className="card">
            <Steps n={1} of={3} />
            <h2>Найдите себя</h2>
            <NameSearch
              items={guests}
              getText={(g) => g.fio}
              sub={(g) => [g.company, g.citizenship].filter(Boolean).join(' · ')}
              placeholder="Начните набирать ФИО"
              nothing="Никого не нашли. Проверьте написание или вернитесь и нажмите «Регистрация»."
              onPick={pickGuest}
            />
            {back(() => setScreen('in-choice'))}
          </div>
        )}

        {screen === 'in-form' && (
          <GuestForm
            title={formInit ? 'Дополните данные' : 'Регистрация'}
            init={formInit}
            onCancel={() => setScreen('in-choice')}
            onDone={afterForm}
          />
        )}

        {screen === 'in-room' && (
          <div className="card">
            <Steps n={2} of={3} />
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
            <button className="btn" style={{ opacity: room ? 1 : 0.5 }}
              onClick={() => room ? setScreen('in-date') : alert('Выберите комнату')}>Далее →</button>
            {back(() => setScreen('in-choice'))}
          </div>
        )}

        {screen === 'in-date' && (
          <div className="card">
            <Steps n={3} of={3} />
            <h2>Дата прибытия</h2>
            <div className="list-item">
              <div className="avatar">{initials(guest?.fio)}</div>
              <div>
                <div style={{ fontWeight: 700 }}>{guest?.fio}</div>
                <div className="small">Блок {blockOf(room)} · комната № {room}</div>
              </div>
            </div>
            <DateTimeField label="Прибытие" date={arrival} time={arrTime} onDate={setArrival} onTime={setArrTime} />
            <div className="small" style={{ marginTop: 8 }}>Дату выбытия указывать не нужно — отметите её при выезде.</div>
            <button className="btn green" disabled={busy} onClick={confirmArrival}>✓ Подтвердить заезд</button>
            {back(() => setScreen('in-room'))}
          </div>
        )}

        {screen === 'out-search' && (
          <div className="card">
            <h2>Выбытие</h2>
            <NameSearch
              items={living}
              getText={(s) => s.fio}
              sub={(s) => `блок ${blockOf(s.room)} · комната №${s.room} · с ${s.arrivedAt ? fmtDateTime(s.arrivedAt) : fmt(s.arrival)}`}
              placeholder="Начните набирать ФИО"
              nothing="Среди проживающих такого нет. Проверьте написание или обратитесь на ресепшн."
              onPick={pickStay}
            />
            {back(reset)}
          </div>
        )}

        {screen === 'out-date' && stay && (
          <div className="card">
            <h2>Подтвердите выбытие</h2>
            <div className="list-item">
              <div className="avatar">{initials(stay.fio)}</div>
              <div>
                <div style={{ fontWeight: 700 }}>{stay.fio}</div>
                <div className="small">Блок {blockOf(stay.room)} · комната № {stay.room} · с {stay.arrivedAt ? fmtDateTime(stay.arrivedAt) : fmt(stay.arrival)}</div>
              </div>
            </div>
            <DateTimeField label="Выбытие" date={departure} time={depTime} onDate={setDeparture} onTime={setDepTime} />
            <div className="small" style={{ marginTop: 8 }}>
              Итого проживание: <b>{nightsNow(stay.arrival, departure)} суток</b>
            </div>
            <button className="btn red" disabled={busy} onClick={confirmDeparture}>✓ Подтвердить выбытие</button>
            {back(() => setScreen('out-search'))}
          </div>
        )}

        {screen === 'in-done' && receipt && (
          <>
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="ok-circle"><div className="c">✓</div></div>
              <h2>Заезд оформлен!</h2>
              <div className="small">Добро пожаловать</div>
            </div>
            <div className="card">
              <table><tbody>
                <tr><td className="small">Гость</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{receipt.fio}</td></tr>
                <tr><td className="small">Комната</td><td style={{ textAlign: 'right', fontWeight: 600 }}>блок {blockOf(receipt.room)} · № {receipt.room}</td></tr>
                <tr><td className="small">Прибытие</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{receipt.arrivedAt ? fmtDateTime(receipt.arrivedAt) : fmt(receipt.arrival)}</td></tr>
                <tr><td className="small">Статус</td><td style={{ textAlign: 'right', fontWeight: 600 }}>на смене</td></tr>
              </tbody></table>
              <button className="btn sec" onClick={reset}>Готово</button>
            </div>
          </>
        )}

        {screen === 'out-done' && receipt && (
          <>
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="ok-circle"><div className="c">✓</div></div>
              <h2>Выбытие отмечено</h2>
              <div className="small">Хорошей дороги!</div>
            </div>
            <div className="card">
              <table><tbody>
                <tr><td className="small">Гость</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{receipt.fio}</td></tr>
                <tr><td className="small">Комната</td><td style={{ textAlign: 'right', fontWeight: 600 }}>блок {blockOf(receipt.room)} · № {receipt.room}</td></tr>
                <tr><td className="small">Прибытие</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{receipt.arrivedAt ? fmtDateTime(receipt.arrivedAt) : fmt(receipt.arrival)}</td></tr>
                <tr><td className="small">Выбытие</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{receipt.departedAt ? fmtDateTime(receipt.departedAt) : fmt(receipt.departure)}</td></tr>
                <tr><td className="small">Суток</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{nightsNow(receipt.arrival, receipt.departure)}</td></tr>
              </tbody></table>
              <button className="btn sec" onClick={reset}>Готово</button>
            </div>
          </>
        )}

      </div>
      <Busy show={busy} />
    </div>
  );
}
