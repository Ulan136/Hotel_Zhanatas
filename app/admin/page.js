'use client';
import { useEffect, useState } from 'react';
import { api, getSess, setSess as saveSess, clearSess, getLastLogin, forgetMe } from '@/lib/client';
import { TopBar, Busy, Modal } from '@/components/kit';
import { useLive, liveLabel } from '@/lib/live';
import { downloadXlsx } from '@/lib/xlsx';
import { initials, fmt, timeHM, money, nightsNow, todayStr, nowTime, monthStart,
         fmtDateTime, toAstanaISO, CITIZENSHIPS, POSITIONS,
         DEFAULT_COMPANY, PHONE_PLACEHOLDER, formatPhone, cleanPhone, groupByBlock, blockOf,
         DEFAULT_GUARD_RATES, guardEarned, SHIFT_TYPES, defaultShiftType, shiftHours,
         shiftTypeLabel, shiftTypeOf, shortName,
         BIRTH_PLACEHOLDER, formatBirth, birthToISO, birthToText, birthInput,
         birthLegacyYear, birthError } from '@/lib/ui';

const STAFF_ROLES = ['Повар', 'Помощник повара', 'Ресепшн', 'Уборка', 'Охрана', 'Другое'];
const EMPTY = { rooms: [], guests: [], stays: [], finance: [], shifts: [], staff: [], categories: [], guards: [], payments: [], settings: {}, bookings: [] };
const topCats = (cats, t) => cats.filter((c) => c.type === t && !c.parent);
const subCats = (cats, pid) => cats.filter((c) => String(c.parent || '') === String(pid));

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
function monthName(m) { const [y, mm] = m.split('-'); return (MONTHS[+mm - 1] || mm) + ' ' + y; }

export default function AdminPage() {
  const [sess, setSess] = useState(null);
  const [view, setView] = useState('boot');        // boot | reg | login | app
  const [screen, setScreen] = useState('tabs');     // tabs | settings
  const [tab, setTab] = useState('rooms');
  const [seg, setSeg] = useState('guests');
  const [db, setDb] = useState(EMPTY);
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);

  useEffect(() => { boot(); }, []);

  async function reload() { setDb(await api('bootstrap')); }

  /* Данные подтягиваются сами: пока открыт кабинет, каждые несколько секунд
     спрашиваем сервер, не изменилось ли что-нибудь. Пока открыто окно
     (заселение, оплата и т.п.) — не трогаем, чтобы не сбить ввод. */
  const { checkedAt } = useLive(reload, { enabled: view === 'app' && !modal });
  async function withBusy(fn) { setBusy(true); try { return await fn(); } finally { setBusy(false); } }

  async function boot() {
    const s = getSess();
    if (s) { setSess(s); return openApp(s); }
    try {
      const h = await withBusy(() => api('hasAdmin'));
      setView(h.hasAdmin ? 'login' : 'reg');
    } catch { setView('login'); alert('Нет связи с базой. Проверьте DATABASE_URL.'); }
  }
  async function openApp(s) {
    try { await withBusy(reload); setView('app'); }
    catch { alert('Нет связи с базой.'); }
  }
  function logout(forget) {
    api('logout').catch(() => {});
    if (forget) forgetMe(); else clearSess();
    setSess(null); setView('login'); setScreen('tabs');
  }

  const closeModal = () => setModal(null);
  async function afterSave(segAfter) {
    await reload();
    closeModal();
    if (segAfter) setSeg(segAfter);
  }
  async function loadUsers() { try { setUsers(await api('users')); } catch { setUsers([]); } }

  function openSettings(s) {
    const nextSeg = s || seg || 'guests';
    setSeg(nextSeg);
    setScreen('settings');
    if (nextSeg === 'users') loadUsers();
  }

  /* ---------------- boot / auth screens ---------------- */
  if (view === 'boot') return <Frame sub="кабинет"><Busy show /></Frame>;

  if (view === 'reg') return (
    <Frame sub="регистрация администратора">
      <RegForm onDone={(s) => { saveSess(s, true); setSess(s); openApp(s); }} setBusy={setBusy} />
      <Busy show={busy} />
    </Frame>
  );

  if (view === 'login') return (
    <Frame sub="вход">
      <LoginForm
        onDone={(s, remember) => { saveSess(s, remember); setSess(s); openApp(s); }}
        setBusy={setBusy}
      />
      <Busy show={busy} />
    </Frame>
  );

  /* ---------------- app ---------------- */
  const right = (
    <span>
      {sess?.role === 'admin' && <button className="link" style={{ color: '#fff', marginRight: 12 }} onClick={() => setScreen('uchet')}>📊 Учёт</button>}
      <button className="link" style={{ color: '#fff', marginRight: 12 }} onClick={() => openSettings()}>⚙ Настройки</button>
      <button className="link" style={{ color: '#fff' }} onClick={() => logout(false)}>выйти</button>
    </span>
  );

  return (
    <div className="wrap">
      <TopBar sub={sess ? `${sess.name} · ${sess.role === 'admin' ? 'админ' : sess.role === 'reception' ? 'ресепшн' : 'заказчик'}` : 'кабинет'} right={right} />
      <div className="content">
        {screen === 'settings'
          ? <Settings db={db} seg={seg} sess={sess} users={users} setSeg={openSettings} setModal={setModal}
              onDelete={handleDelete} backToApp={() => setScreen('tabs')} />
          : screen === 'uchet'
          ? <Uchet db={db} backToApp={() => setScreen('tabs')}
              onPay={(row) => setModal({ type: 'pay', data: row })}
              onDelPayment={(id) => handleDelete('payment', id)}
              onReload={reload} />
          : <>
              {tab === 'rooms' && <RoomsTab db={db} checkedAt={checkedAt}
                onFree={(n) => setModal({ type: 'checkin', room: n })}
                onOcc={(stay) => setModal({ type: 'room', stay })}
                onBook={() => setModal({ type: 'booking' })}
                onDelBooking={(id) => handleDelete('booking', id)}
                onCloseBooking={async (b) => {
                  if (!confirm(`Закрыть заявку на ${b.people} чел. от ${fmt(b.date)}?`)) return;
                  await withBusy(() => api('updateBooking', { ...b, status: 'closed' }));
                  await reload();
                }} />}
              {tab === 'fin' && <FinTab db={db} onAdd={() => setModal({ type: 'fin' })} />}
              {tab === 'shifts' && <ShiftsTab db={db}
                onAdd={() => setModal({ type: 'shift' })}
                onPay={(row) => setModal({ type: 'pay', data: row })}
                onEditPayment={(p) => setModal({ type: 'payEdit', data: p })}
                onDelPayment={(id) => handleDelete('payment', id)}
                onReload={reload} />}
            </>}
      </div>

      {screen === 'tabs' && (
        <div className="tabbar">
          {[['rooms', '▦', 'Комнаты'], ['fin', '₸', 'Расходы'], ['shifts', '🕒', 'Смены']].map((x) => (
            <button key={x[0]} className={tab === x[0] ? 'active' : ''} onClick={() => setTab(x[0])}>
              <span className="ic">{x[1]}</span>{x[2]}
            </button>
          ))}
        </div>
      )}

      <Modal open={!!modal} onClose={closeModal}>
        {modal?.type === 'checkin' && <CheckinModal room={modal.room} guests={db.guests} onClose={closeModal} onSaved={() => afterSave()} />}
        {modal?.type === 'room' && <RoomModal stay={modal.stay} rooms={db.rooms} onClose={closeModal}
          onSaved={async () => { await reload(); closeModal(); }}
          onCheckout={async (id, departure, departedAt) => {
            const r = await withBusy(() => api('checkout', { id, departure, departedAt }));
            if (!r.ok) return alert(r.error || 'Ошибка');
            await afterSave();
          }} />}
        {modal?.type === 'fin' && <FinModal cats={db.categories} staff={db.staff} onClose={closeModal} onSaved={() => afterSave()} onNeedCats={() => { closeModal(); openSettings('cats'); }} />}
        {modal?.type === 'shift' && <ShiftModal db={db} onClose={closeModal} onSaved={() => afterSave()} />}
        {modal?.type === 'pay' && <PayModal row={modal.data} onClose={closeModal} onSaved={() => afterSave()} />}
        {modal?.type === 'payEdit' && <PayEditModal row={modal.data} onClose={closeModal} onSaved={() => afterSave()} />}
        {modal?.type === 'finEdit' && <FinEditModal row={modal.data} onClose={closeModal} onSaved={() => afterSave()} />}
        {modal?.type === 'booking' && <BookingModal onClose={closeModal} onSaved={() => afterSave()} />}
        {modal?.type === 'guest' && <GuestModal guest={modal.data} onClose={closeModal} onSaved={() => afterSave('guests')} />}
        {modal?.type === 'staff' && <StaffModal worker={modal.data} onClose={closeModal} onSaved={() => afterSave('staff')} />}
        {modal?.type === 'cat' && <CatModal cat={modal.data} parentId={modal.parentId} ctype={modal.ctype} onClose={closeModal} onSaved={() => afterSave('cats')} />}
        {modal?.type === 'user' && <UserModal user={modal.data} onClose={closeModal} onSaved={async () => { closeModal(); await loadUsers(); }} />}
      </Modal>

      <Busy show={busy} />
    </div>
  );

  async function handleDelete(kind, arg) {
    if (kind === 'guest') {
      const g = db.guests.find((x) => x.id === arg);
      const inr = db.stays.find((s) => String(s.guestId) === String(arg) && s.status !== 'closed');
      if (inr) return alert('Нельзя удалить: гость заселён (комната №' + inr.room + '). Сначала отметьте выбытие.');
      if (!confirm('Удалить гостя?')) return;
      await withBusy(() => api('deleteGuest', { id: arg })); await reload();
    } else if (kind === 'staff') {
      if (!confirm('Удалить работника?')) return;
      await withBusy(() => api('deleteStaff', { id: arg })); await reload();
    } else if (kind === 'cat') {
      if (!confirm('Удалить категорию?')) return;
      await withBusy(() => api('deleteCategory', { id: arg })); await reload();
    } else if (kind === 'booking') {
      if (!confirm('Удалить заявку на бронь?')) return;
      await withBusy(() => api('deleteBooking', { id: arg })); await reload();
    } else if (kind === 'finance') {
      if (!confirm('Удалить эту операцию из журнала? Суммы пересчитаются.')) return;
      await withBusy(() => api('deleteFinance', { id: arg })); await reload();
    } else if (kind === 'payment') {
      if (!confirm('Удалить эту выплату? Долг пересчитается.')) return;
      await withBusy(() => api('deletePayment', { id: arg })); await reload();
    } else if (kind === 'user') {
      if (arg === sess.login) return alert('Нельзя удалить пользователя, под которым вы вошли.');
      if (!confirm('Удалить пользователя «' + arg + '»?')) return;
      await withBusy(() => api('deleteUser', { login: arg })); await loadUsers();
    }
  }
}

/* ===================== Shell ===================== */
function Frame({ sub, children }) {
  return (
    <div className="wrap">
      <TopBar sub={sub} />
      <div className="content">{children}</div>
    </div>
  );
}

/* ===================== Auth forms ===================== */
function RegForm({ onDone, setBusy }) {
  const [name, setName] = useState(''); const [login, setLogin] = useState(''); const [pass, setPass] = useState('');
  async function submit() {
    if (!name || !login || !pass) return alert('Заполните все поля');
    setBusy(true);
    try {
      const r = await api('register', { name, login, pass, role: 'admin' });
      if (!r.ok) return alert(r.error || 'Ошибка');
      onDone({ name, login, role: 'admin' });
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="card">
      <h2>Регистрация администратора</h2>
      <div className="small">Первый пользователь — админ.</div>
      <label>Имя</label><input value={name} onChange={(e) => setName(e.target.value)} />
      <label>Логин</label><input value={login} onChange={(e) => setLogin(e.target.value)} />
      <label>Пароль</label><input type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
      <button className="btn" onClick={submit}>Зарегистрироваться</button>
    </div>
  );
}

function LoginForm({ onDone, setBusy }) {
  const [login, setLogin] = useState(''); const [pass, setPass] = useState('');
  const [remember, setRemember] = useState(true);
  // Подставляем запомненный логин (пароль не хранится).
  useEffect(() => { const l = getLastLogin(); if (l) setLogin(l); }, []);
  async function submit() {
    if (!login.trim() || !pass) return alert('Введите логин и пароль');
    setBusy(true);
    try {
      const r = await api('login', { login: login.trim(), pass, remember });
      if (!r.ok || r.user.role === 'factory') return alert('Неверный логин или пароль');
      onDone({ name: r.user.name, login: r.user.login, role: r.user.role }, remember);
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function addStaff() {
    const n = prompt('Имя сотрудника:'); if (!n) return;
    const l = prompt('Логин:'); if (!l) return;
    const p = prompt('Пароль:'); if (!p) return;
    setBusy(true);
    try { const r = await api('register', { name: n, login: l, pass: p, role: 'reception' }); alert(r.ok ? 'Сотрудник добавлен' : (r.error || 'Ошибка')); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="card">
      <h2>Вход</h2>
      <label>Логин</label>
      <input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" name="username" />
      <label>Пароль</label>
      <input type="password" value={pass} onChange={(e) => setPass(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()} autoComplete="current-password" name="password" />
      <label className="remember">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        <span>Запомнить меня на этом устройстве</span>
      </label>
      <button className="btn" onClick={submit}>Войти</button>
      {login && (
        <button className="link" style={{ display: 'block', margin: '10px auto 0', fontSize: 13 }}
          onClick={() => { forgetMe(); setLogin(''); setPass(''); }}>Это не я — забыть логин</button>
      )}
      <button className="link" style={{ display: 'block', marginTop: 12 }} onClick={addStaff}>+ Добавить сотрудника (ресепшн)</button>
    </div>
  );
}

/* ===================== Rooms ===================== */
function RoomsTab({ db, onFree, onOcc, onBook, onDelBooking, onCloseBooking, checkedAt }) {
  let occ = 0, free = 0;
  db.rooms.forEach((r) => { if (r.status === 'free') free++; else occ++; });
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Комнаты</h2>
        <span className="small">🟢 {liveLabel(checkedAt)}</span>
      </div>
      <div className="small" style={{ marginTop: 2, marginBottom: 6 }}>
        Новые гости появляются здесь сами — обновлять страницу не нужно.
      </div>
      <div className="legend">
        <span><i className="dot" style={{ background: 'var(--free)' }} />свободно</span>
        <span><i className="dot" style={{ background: 'var(--full)' }} />занято</span>
        <span><i className="dot" style={{ background: 'var(--part)' }} />бронь</span>
      </div>
      <div className="tiles" style={{ marginBottom: 12 }}>
        <div className="tile" style={{ background: 'var(--fullbg)' }}><div className="v" style={{ color: 'var(--expd)' }}>{occ}</div><div className="l" style={{ color: 'var(--expd)' }}>занято</div></div>
        <div className="tile" style={{ background: 'var(--freebg)' }}><div className="v" style={{ color: 'var(--incd)' }}>{free}</div><div className="l" style={{ color: 'var(--incd)' }}>свободно</div></div>
      </div>
      <Bookings db={db} onBook={onBook} onDel={onDelBooking} onClose={onCloseBooking} />

      {groupByBlock(db.rooms, (r) => r.room).map(({ block, items, from, to }) => {
        const bfree = items.filter((r) => r.status === 'free').length;
        return (
          <div key={block}>
            <div className="block-title">
              Блок {block}
              <span>{from}–{to} · свободно {bfree} из {items.length}</span>
            </div>
            <div className="rooms">
              {items.map((r) => {
                const cls = r.status === 'free' ? 'free' : r.status === 'occ' ? 'occ' : 'book';
                // На занятой комнате вместо слова «занято» показываем, кто там живёт.
                const who = r.stay ? shortName(r.stay.fio) : '';
                const s = r.status === 'free' ? 'свободно' : (who || (r.status === 'occ' ? 'занято' : 'бронь'));
                return (
                  <div key={r.room} className={'room ' + cls} title={r.stay?.fio || ''}
                    onClick={() => r.status === 'free' ? onFree(r.room) : onOcc(r.stay)}>
                    <div className="bar" /><div className="n">{r.room}</div><div className="s">{s}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RoomModal({ stay: s, rooms, onClose, onCheckout, onSaved }) {
  // Дата выбытия: по умолчанию сегодня, но её можно изменить — для поздних выселений.
  const [departure, setDeparture] = useState(todayStr());
  const [depTime, setDepTime] = useState(nowTime());

  /* Правка заезда: дату иногда вбивают неверно (месяц, год), и тогда
     неправильно считаются сутки. Меняет только ресепшн, здесь, в кабинете. */
  const [edit, setEdit] = useState(false);
  const [arr, setArr] = useState(String(s.arrival || '').slice(0, 10));
  const [arrTime, setArrTime] = useState(s.arrivedAt ? timeHM(s.arrivedAt) : '12:00');
  const [busy, setBusy] = useState(false);

  // Перевод в другую комнату: выбираем из свободных.
  const [move, setMove] = useState(false);
  const freeRooms = (rooms || []).filter((r) => r.status === 'free').map((r) => r.room);
  const [toRoom, setToRoom] = useState('');

  const arrival = String(s.arrival || '').slice(0, 10);
  const future = arrival > todayStr();      // заезд «в будущем» — почти всегда опечатка

  async function saveRoom() {
    const n = Number(toRoom);
    if (!n) return alert('Выберите комнату');
    if (!confirm(`Перевести ${s.fio} из комнаты №${s.room} в №${n}?`)) return;
    setBusy(true);
    try {
      const r = await api('moveStay', { id: s.id, room: n });
      if (!r.ok) return alert(r.error || 'Ошибка');
      await onSaved?.();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  async function saveArrival() {
    if (!arr) return alert('Укажите дату прибытия');
    if (arr > todayStr() && !confirm(`Дата ${fmt(arr)} — в будущем. Всё равно сохранить?`)) return;
    setBusy(true);
    try {
      const r = await api('updateStay', { id: s.id, arrival: arr, arrivedAt: toAstanaISO(arr, arrTime) });
      if (!r.ok) return alert(r.error || 'Ошибка');
      await onSaved?.();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  function submit() {
    if (!departure) return alert('Укажите дату выбытия');
    if (arrival && departure < arrival) return alert('Дата выбытия раньше даты прибытия. Проверьте дату.');
    if (!confirm(`Выселить ${s.fio} из комнаты №${s.room}?\n\nВыбытие: ${fmt(departure)} ${depTime}.`)) return;
    onCheckout(s.id, departure, toAstanaISO(departure, depTime));
  }

  return (
    <>
      <h2>Блок {blockOf(s.room)} · комната № {s.room}</h2>
      <div className="list-item">
        <div className="avatar">{initials(s.fio)}</div>
        <div style={{ flex: 1 }}><div style={{ fontWeight: 700 }}>{s.fio}</div><div className="small">{s.source || ''}</div></div>
        {s.status === 'booked' ? <span className="chip a">бронь</span> : <span className="chip g">на смене</span>}
      </div>
      <div className="tiles">
        <div className="tile" style={{ background: 'var(--freebg)' }}><div className="l" style={{ color: 'var(--incd)' }}>Прибытие</div><div className="v" style={{ fontSize: 13, color: 'var(--incd)' }}>{s.arrivedAt ? fmtDateTime(s.arrivedAt) : fmt(s.arrival)}</div></div>
        <div className="tile" style={{ background: 'var(--partbg)' }}><div className="l" style={{ color: 'var(--warnd)' }}>Суток</div><div className="v" style={{ fontSize: 16, color: 'var(--warnd)' }}>{nightsNow(s.arrival, departure)}</div></div>
      </div>

      <div className="small" style={{ marginTop: 6 }}>
        {future && <span style={{ color: 'var(--expd)' }}>Дата заезда в будущем — похоже на опечатку. </span>}
        <button className="link" onClick={() => setEdit(!edit)}>
          {edit ? 'не менять заезд' : '✎ изменить дату заезда'}
        </button>
      </div>

      {edit && (
        <div style={{ marginTop: 8, padding: 10, borderRadius: 10, background: 'var(--eef)' }}>
          <label>Прибытие — дата и время</label>
          <div className="two">
            <input type="date" value={arr} onChange={(e) => setArr(e.target.value)} />
            <input type="time" value={arrTime} onChange={(e) => setArrTime(e.target.value)} />
          </div>
          <div className="small" style={{ marginTop: 6 }}>
            Время по Астане. Исправьте, если при заселении ошиблись.
          </div>
          <button className="btn" disabled={busy} onClick={saveArrival}>✓ Сохранить заезд</button>
        </div>
      )}

      <div className="small" style={{ marginTop: 6 }}>
        <button className="link" onClick={() => setMove(!move)}>
          {move ? 'не переселять' : '⇄ перевести в другую комнату'}
        </button>
      </div>

      {move && (
        <div style={{ marginTop: 8, padding: 10, borderRadius: 10, background: 'var(--eef)' }}>
          {freeRooms.length ? (
            <>
              <label>Свободная комната</label>
              <select value={toRoom} onChange={(e) => setToRoom(e.target.value)}>
                <option value="">— выберите комнату —</option>
                {groupByBlock(freeRooms).map(({ block, items }) => (
                  <optgroup key={block} label={`Блок ${block}`}>
                    {items.map((n) => <option key={n} value={n}>№ {n}</option>)}
                  </optgroup>
                ))}
              </select>
              <div className="small" style={{ marginTop: 6 }}>
                Даты заезда и выезда сохранятся — меняется только комната.
              </div>
              <button className="btn" disabled={busy} onClick={saveRoom}>⇄ Перевести</button>
            </>
          ) : <div className="small">Свободных комнат нет.</div>}
        </div>
      )}

      <label>Выбытие</label>
      <div className="two">
        <input type="date" value={departure} onChange={(e) => setDeparture(e.target.value)} />
        <input type="time" value={depTime} onChange={(e) => setDepTime(e.target.value)} />
      </div>
      <div className="small" style={{ marginTop: 6 }}>
        Время по Астане. Подставлены сегодняшний день и текущее время.
        {departure !== todayStr() && <> <button className="link" onClick={() => { setDeparture(todayStr()); setDepTime(nowTime()); }}>вернуть сейчас</button></>}
      </div>

      <button className="btn red" onClick={submit}>✓ Выселить</button>
      <button className="btn sec" onClick={onClose}>Закрыть</button>
    </>
  );
}

function CheckinModal({ room, guests, onClose, onSaved }) {
  const [gid, setGid] = useState(guests[0]?.id ?? '');
  const [arrival, setArrival] = useState(todayStr());
  const [arrTime, setArrTime] = useState(nowTime());
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!arrival) return alert('Укажите дату прибытия');
    const g = guests.find((x) => String(x.id) === String(gid));
    setBusy(true);
    try {
      const arrivedAt = toAstanaISO(arrival, arrTime);
      const r = await api('checkin', { guestId: gid, fio: g?.fio, room, arrival, arrivedAt, source: 'ресепшн' });
      if (!r.ok) return alert(r.error || 'Ошибка');
      onSaved();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  return (
    <>
      <h2>Заселить · блок {Math.floor(room / 100) || 1}, комната № {room}</h2>
      {guests.length === 0
        ? <div className="small">Сначала добавьте гостя в ⚙ Настройки → Гости.</div>
        : <>
            <label>Гость</label>
            <select value={gid} onChange={(e) => setGid(e.target.value)}>
              {guests.map((g) => <option key={g.id} value={g.id}>{g.fio}</option>)}
            </select>
            <label>Прибытие</label>
            <div className="two">
              <input type="date" value={arrival} onChange={(e) => setArrival(e.target.value)} />
              <input type="time" value={arrTime} onChange={(e) => setArrTime(e.target.value)} />
            </div>
            <div className="small" style={{ marginTop: 6 }}>
              Время по Астане. Дата выбытия не указывается — она проставится при выселении.
            </div>
            <button className="btn" disabled={busy} onClick={submit}>Заселить</button>
          </>}
      <button className="btn sec" onClick={onClose}>Отмена</button>
    </>
  );
}


/* ===================== Заявки на бронь =====================
   Бронируем не конкретные комнаты, а количество человек на дату:
   завод сообщает «приедет 5 человек», ресепшн держит места. */
function Bookings({ db, onBook, onDel, onClose }) {
  const list = (db.bookings || []).filter((b) => b.status !== 'closed');
  const today = todayStr();
  const soon = list.filter((b) => b.date >= today);
  const people = soon.reduce((a, b) => a + (+b.people || 0), 0);
  const free = (db.rooms || []).filter((r) => r.status === 'free').length;

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>Заявки на бронь</h2>
        <span className="small">ожидаем {people} чел. · свободно {free}</span>
      </div>
      <div className="small" style={{ marginTop: 4 }}>
        Бронь по количеству человек, комнату гость выберет при заезде.
        Заявки заказчика из его отчёта приходят сюда же.
      </div>
      <button className="btn" onClick={onBook}>+ Заявка на бронь</button>

      {list.length ? (
        <div style={{ marginTop: 10 }}>
          {list.map((b) => {
            const past = b.date < today;
            return (
              <div key={b.id} className="list-item">
                <div className="avatar" style={{ background: past ? 'var(--warn)' : 'var(--primary)' }}>{b.people}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>
                    {b.fio ? b.fio : `${b.people} чел.`}
                    {b.source === 'report' && <span className="small" style={{ color: 'var(--primd)' }}> · от заказчика</span>}
                  </div>
                  <div className="small">
                    {fmt(b.date)}
                    {b.destination ? ` · ${b.destination}` : ''}
                    {b.fio && b.people > 1 ? ` · ${b.people} чел.` : ''}
                    {[b.company, b.note].filter(Boolean).length ? ' · ' + [b.company, b.note].filter(Boolean).join(' · ') : ''}
                    {past && <span style={{ color: 'var(--warnd)' }}> · дата прошла</span>}
                  </div>
                </div>
                <button className="link" onClick={() => onClose(b)}>закрыть</button>
                &nbsp;&nbsp;
                <button className="link" style={{ color: 'var(--full)' }} onClick={() => onDel(b.id)}>удал.</button>
              </div>
            );
          })}
        </div>
      ) : <div className="small" style={{ marginTop: 8 }}>Активных заявок нет.</div>}
    </div>
  );
}

function BookingModal({ onClose, onSaved }) {
  const [date, setDate] = useState(todayStr());
  const [people, setPeople] = useState('1');
  const [company, setCompany] = useState(DEFAULT_COMPANY);
  const [fio, setFio] = useState('');
  const [dest, setDest] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const n = Number(people) || 0;
    if (!date) return alert('Укажите дату');
    if (!(n > 0)) return alert('Укажите количество человек');
    setBusy(true);
    try {
      const r = await api('addBooking', {
        date, people: n, company: company.trim(), note: note.trim(),
        fio: fio.trim(), destination: dest.trim(), source: 'admin',
      });
      if (!r.ok) return alert(r.error || 'Ошибка');
      onSaved();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <h2>Заявка на бронь</h2>
      <div className="small">Сколько человек ждём и на какую дату. Комнаты выберутся при заезде.</div>
      <label>Дата заезда</label>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <label>Количество человек</label>
      <input inputMode="numeric" value={people}
        onChange={(e) => setPeople(e.target.value.replace(/\D/g, '').slice(0, 3))} />
      <div className="chips-row">
        {[1, 2, 5, 10].map((n) => (
          <button key={n} className="chipbtn" onClick={() => setPeople(String(n))}>{n}</button>
        ))}
      </div>
      <label>Компания / вахта</label>
      <input value={company} onChange={(e) => setCompany(e.target.value)} />
      <label>ФИО (необязательно)</label>
      <input value={fio} onChange={(e) => setFio(e.target.value)} placeholder="если известно" />
      <label>Куда — объект / цех (необязательно)</label>
      <input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="например: ремонтный цех" />
      <label>Комментарий (необязательно)</label>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="например: приедут вечером" />
      <button className="btn" disabled={busy} onClick={submit}>✓ Сохранить заявку</button>
      <button className="btn sec" onClick={onClose}>Отмена</button>
      <Busy show={busy} />
    </>
  );
}

/* ===================== Оплата охраны =====================
   Начисляем за ДЕНЬ выхода: будни и выходные по разным ставкам.
   Долг считаем за всё время: начислено минус выплачено, поэтому
   частичная оплата и недоплата за прошлый месяц не теряются. */
function guardRates(settings) {
  const n = (v, d) => { const x = Number(v); return Number.isFinite(x) && x >= 0 ? x : d; };
  return {
    night: n(settings?.guard_rate_night, DEFAULT_GUARD_RATES.night),
    day: n(settings?.guard_rate_day, DEFAULT_GUARD_RATES.day),
  };
}

function GuardPay({ db, onPay, onEditPayment, onDelPayment, onReload }) {
  const saved = guardRates(db.settings);
  const [rn, setRn] = useState(String(saved.night));
  const [rd, setRd] = useState(String(saved.day));
  const [editRates, setEditRates] = useState(false);
  const [busy, setBusy] = useState(false);

  const rates = saved;
  const guardShifts = (db.shifts || []).filter((x) => x.role === 'Охрана');
  const names = new Set([
    ...(db.staff || []).filter((x) => x.role === 'Охрана').map((x) => x.fio),
    ...guardShifts.map((x) => x.fio),
  ]);

  const rows = [...names].filter(Boolean).sort((a, b) => a.localeCompare(b)).map((fio) => {
    const e = guardEarned(guardShifts.filter((x) => x.fio === fio), rates);
    const paid = (db.payments || []).filter((p) => p.fio === fio).reduce((a, p) => a + (+p.amount || 0), 0);
    return { fio, ...e, paid, debt: e.amount - paid };
  });

  const totalEarned = rows.reduce((a, r) => a + r.amount, 0);
  const totalPaid = rows.reduce((a, r) => a + r.paid, 0);
  const totalDebt = totalEarned - totalPaid;

  async function saveRates() {
    const a = Number(rn), b = Number(rd);
    if (!Number.isFinite(a) || a < 0 || !Number.isFinite(b) || b < 0) return alert('Ставка должна быть числом');
    setBusy(true);
    try {
      await api('setSetting', { key: 'guard_rate_night', value: String(Math.round(a)) });
      await api('setSetting', { key: 'guard_rate_day', value: String(Math.round(b)) });
      await onReload?.();
      setEditRates(false);
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  // Журнал выплат: по датам, ранние сверху — как в тетради.
  const [allPays, setAllPays] = useState(false);
  const payLog = (db.payments || []).slice().sort(
    (a, b) => String(a.date).localeCompare(String(b.date)) || (Number(a.id) - Number(b.id)));
  const recent = allPays ? payLog : payLog.slice(-12);

  return (
    <div className="card">
      <h2 style={{ fontSize: 15 }}>Оплата охраны</h2>
      <div className="small">
        Смена <b>Ночь</b> — {money(rates.night)} · смена <b>День</b> — {money(rates.day)}.
        {' '}<button className="link" onClick={() => setEditRates(!editRates)}>{editRates ? 'скрыть' : 'изменить ставки'}</button>
      </div>
      <div className="small">Считаем по виду смены. По субботам и воскресеньям смена предлагается дневная.</div>

      {editRates && (
        <div style={{ marginTop: 8 }}>
          <div className="two">
            <div><label>Смена «Ночь», ₸</label><input inputMode="numeric" value={rn} onChange={(e) => setRn(e.target.value.replace(/\D/g, ''))} /></div>
            <div><label>Смена «День», ₸</label><input inputMode="numeric" value={rd} onChange={(e) => setRd(e.target.value.replace(/\D/g, ''))} /></div>
          </div>
          <button className="btn" disabled={busy} onClick={saveRates}>Сохранить ставки</button>
        </div>
      )}

      <div className="kpi3" style={{ marginTop: 12 }}>
        <div className="tile" style={{ background: 'var(--eef)' }}>
          <div className="v" style={{ fontSize: 16, color: 'var(--primd)' }}>{money(totalEarned)}</div>
          <div className="l" style={{ color: 'var(--primd)' }}>начислено</div>
        </div>
        <div className="tile" style={{ background: 'var(--freebg)' }}>
          <div className="v" style={{ fontSize: 16, color: 'var(--incd)' }}>{money(totalPaid)}</div>
          <div className="l" style={{ color: 'var(--incd)' }}>выплачено</div>
        </div>
        <div className="tile" style={{ background: totalDebt > 0 ? 'var(--fullbg)' : 'var(--freebg)' }}>
          <div className="v" style={{ fontSize: 16, color: totalDebt > 0 ? 'var(--expd)' : 'var(--incd)' }}>{money(totalDebt)}</div>
          <div className="l" style={{ color: totalDebt > 0 ? 'var(--expd)' : 'var(--incd)' }}>к выплате</div>
        </div>
      </div>

      {rows.length ? (
        <div style={{ marginTop: 12 }}>
          {rows.map((r) => (
            <div key={r.fio} className="list-item" style={{ alignItems: 'flex-start' }}>
              <div className="avatar">{initials(r.fio)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{r.fio}</div>
                <div className="small">
                  {r.days} смен ({r.night} ноч. + {r.day} дневн.) · начислено {money(r.amount)}
                </div>
                <div className="small">
                  выплачено <b style={{ color: 'var(--incd)' }}>{money(r.paid)}</b>
                  {' · '}
                  {r.debt > 0
                    ? <>долг <b style={{ color: 'var(--expd)' }}>{money(r.debt)}</b></>
                    : r.debt < 0
                      ? <>переплата <b style={{ color: 'var(--warnd)' }}>{money(-r.debt)}</b></>
                      : <b style={{ color: 'var(--incd)' }}>рассчитан</b>}
                </div>
              </div>
              <button className={'btn ' + (r.debt > 0 ? '' : 'sec')}
                style={{ margin: 0, width: 'auto', padding: '8px 12px', fontSize: 13 }}
                onClick={() => onPay(r)}>Оплатить</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="small" style={{ marginTop: 10 }}>
          Охранников нет. Заведите их в «⚙ Настройки → Работники» с должностью «Охрана».
        </div>
      )}

      {payLog.length > 0 && (
        <>
          <div className="block-title">Журнал выплат<span>{payLog.length}</span></div>
          <div className="small" style={{ marginBottom: 6 }}>
            Каждую выплату можно исправить или удалить — долг пересчитается сразу.
            {payLog.length > 12 && (
              <> <button className="link" onClick={() => setAllPays(!allPays)}>
                {allPays ? 'показать последние 12' : `показать все ${payLog.length}`}
              </button></>
            )}
          </div>
          <div style={{ overflow: 'auto' }}>
            <table><tbody>
              <tr><th>Дата</th><th>Кому</th><th>Сумма</th><th>Комментарий</th><th></th></tr>
              {recent.map((p) => (
                <tr key={p.id}>
                  <td>{fmt(p.date)}</td>
                  <td style={{ fontWeight: 600 }}>{p.fio}</td>
                  <td style={{ color: 'var(--incd)', fontWeight: 700 }}>{money(p.amount)}</td>
                  <td>{p.note || ''}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="link" onClick={() => onEditPayment?.(p)}>✎</button>
                    {' '}
                    <button className="link" style={{ color: 'var(--full)' }} onClick={() => onDelPayment(p.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </>
      )}
    </div>
  );
}

/* Выплата: сумму можно менять — платим полностью или частично. */
function PayModal({ row, onClose, onSaved }) {
  const debt = Math.max(0, Math.round(row?.debt || 0));
  const [amount, setAmount] = useState(String(debt));
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const num = Number(amount) || 0;
  const left = Math.round((row?.debt || 0) - num);

  async function submit() {
    if (!(num > 0)) return alert('Укажите сумму больше нуля');
    if (num > debt && !confirm(`Сумма ${money(num)} больше долга ${money(debt)}.\n\nВсё равно выплатить?`)) return;
    setBusy(true);
    try {
      const r = await api('addPayment', { fio: row.fio, amount: num, date, note: note.trim() });
      if (!r.ok) return alert(r.error || 'Ошибка');
      onSaved();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <h2>Оплата · {row?.fio}</h2>
      <div className="tiles">
        <div className="tile" style={{ background: 'var(--eef)' }}><div className="l" style={{ color: 'var(--primd)' }}>Начислено</div><div className="v" style={{ fontSize: 15, color: 'var(--primd)' }}>{money(row?.amount)}</div></div>
        <div className="tile" style={{ background: 'var(--freebg)' }}><div className="l" style={{ color: 'var(--incd)' }}>Уже выплачено</div><div className="v" style={{ fontSize: 15, color: 'var(--incd)' }}>{money(row?.paid)}</div></div>
      </div>
      <div className="small" style={{ margin: '8px 0' }}>
        {row?.days} смен ({row?.night} ноч. + {row?.day} дневн.) · долг <b style={{ color: 'var(--expd)' }}>{money(debt)}</b>
      </div>

      <label>Сумма выплаты, ₸</label>
      <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} />
      <div className="chips-row">
        <button className="chipbtn" onClick={() => setAmount(String(debt))}>Весь долг</button>
        <button className="chipbtn" onClick={() => setAmount(String(Math.round(debt / 2)))}>Половина</button>
        <button className="chipbtn" onClick={() => setAmount('')}>Очистить</button>
      </div>
      <div className="small" style={{ marginTop: 6 }}>
        {num > 0 && (left > 0
          ? <>После выплаты останется долг <b style={{ color: 'var(--expd)' }}>{money(left)}</b>.</>
          : left === 0
            ? <b style={{ color: 'var(--incd)' }}>Долг будет закрыт полностью.</b>
            : <>Переплата <b style={{ color: 'var(--warnd)' }}>{money(-left)}</b>.</>)}
      </div>

      <label>Дата выплаты</label>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />

      <label>Комментарий (необязательно)</label>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="например: аванс за сентябрь" />

      <button className="btn green" disabled={busy} onClick={submit}>✓ Выплатить {num > 0 ? money(num) : ''}</button>
      <button className="btn sec" onClick={onClose}>Отмена</button>
      <Busy show={busy} />
    </>
  );
}

/* Правка выплаты: сумма, дата, комментарий. Кому — не меняем,
   иначе долг «переедет» на другого человека незаметно. */
function PayEditModal({ row, onClose, onSaved }) {
  const [amount, setAmount] = useState(String(Math.round(+row?.amount || 0)));
  const [date, setDate] = useState(String(row?.date || '').slice(0, 10) || todayStr());
  const [note, setNote] = useState(row?.note || '');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const num = Number(amount) || 0;
    if (!(num > 0)) return alert('Укажите сумму больше нуля');
    setBusy(true);
    try {
      const r = await api('updatePayment', { id: row.id, fio: row.fio, amount: num, date, note: note.trim() });
      if (!r.ok) return alert(r.error || 'Ошибка');
      onSaved();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <h2>Правка выплаты</h2>
      <div className="small">Кому: <b>{row?.fio}</b>. Долг пересчитается сразу после сохранения.</div>
      <label>Сумма, ₸</label>
      <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} />
      <label>Дата выплаты</label>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <label>Комментарий</label>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="например: аванс за сентябрь" />
      <button className="btn" disabled={busy} onClick={submit}>Сохранить</button>
      <button className="btn sec" onClick={onClose}>Отмена</button>
      <Busy show={busy} />
    </>
  );
}

/* Правка операции журнала: тип, категория, сумма, дата, комментарий. */
function FinEditModal({ row, onClose, onSaved }) {
  const [type, setType] = useState(row?.type === 'income' ? 'income' : 'expense');
  const [category, setCategory] = useState(row?.category || '');
  const [subcategory, setSubcategory] = useState(row?.subcategory || '');
  const [amount, setAmount] = useState(String(Math.round(Math.abs(+row?.amount || 0))));
  const [date, setDate] = useState(String(row?.date || '').slice(0, 10) || todayStr());
  const [note, setNote] = useState(row?.note || '');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const num = Number(amount) || 0;
    if (!(num > 0)) return alert('Укажите сумму больше нуля');
    if (!date) return alert('Укажите дату');
    setBusy(true);
    try {
      const r = await api('updateFinance', {
        id: row.id, type, category: category.trim(), subcategory: subcategory.trim(),
        amount: num, date, note: note.trim(),
      });
      if (!r.ok) return alert(r.error || 'Ошибка');
      onSaved();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <h2>Правка операции</h2>
      <label>Тип</label>
      <div className="seg">
        <button className={type === 'expense' ? 'on' : ''} onClick={() => setType('expense')}>Расход</button>
        <button className={type === 'income' ? 'on' : ''} onClick={() => setType('income')}>Доход</button>
      </div>
      <label>Категория</label>
      <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="например: Зарплата" />
      <label>Подкатегория</label>
      <input value={subcategory} onChange={(e) => setSubcategory(e.target.value)} placeholder="необязательно" />
      <label>Сумма, ₸</label>
      <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} />
      <label>Дата</label>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <label>Комментарий</label>
      <input value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn" disabled={busy} onClick={submit}>Сохранить</button>
      <button className="btn sec" onClick={onClose}>Отмена</button>
      <Busy show={busy} />
    </>
  );
}

/* ===================== Finance — операции (для персонала) ===================== */
function FinTab({ db, onAdd }) {
  const f = db.finance;
  return (
    <>
      <div className="card">
        <h2>Расходы и доходы</h2>
        <div className="small">Внесение операций. Категории создаются в «⚙ Настройки → Категории». Сводки и отчёты — в разделе «📊 Учёт».</div>
        <button className="btn" onClick={onAdd}>+ Добавить расход / доход</button>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 15 }}>Последние операции</h2>
        {f.length ? f.slice().reverse().slice(0, 40).map((x, i) => {
          const g = x.type === 'income';
          return (
            <div key={x.id ?? i} className="list-item">
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{x.category}{x.subcategory ? ' › ' + x.subcategory : ''}</div>
                <div className="small">{fmt(x.date)}{x.note ? ' · ' + x.note : ''}</div>
              </div>
              <div style={{ fontWeight: 700, color: g ? 'var(--incd)' : 'var(--expd)' }}>{g ? '+' : '−'}{money(Math.abs(x.amount))}</div>
            </div>
          );
        }) : <div className="small">Пока нет операций.</div>}
      </div>
    </>
  );
}

/* ===================== Finance — отчёт (для учёта) ===================== */
function FinReport({ db, onEdit, onDelete }) {
  const [allOps, setAllOps] = useState(false);
  const f = db.finance;
  const inc = f.filter((x) => x.type === 'income').reduce((a, b) => a + +b.amount, 0);
  const exp = f.filter((x) => x.type === 'expense').reduce((a, b) => a + +b.amount, 0);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const [rep, setRep] = useState(null);

  function build() {
    let ops = f.filter((x) => x.type === 'expense');
    if (from) ops = ops.filter((x) => String(x.date).slice(0, 10) >= from);
    if (to) ops = ops.filter((x) => String(x.date).slice(0, 10) <= to);
    const total = ops.reduce((a, b) => a + +b.amount, 0);
    const grp = {};
    ops.forEach((x) => {
      const c = x.category || '(без категории)';
      const s = x.subcategory || '— без подкатегории —';
      if (!grp[c]) grp[c] = { sum: 0, subs: {} };
      grp[c].sum += +x.amount; grp[c].subs[s] = (grp[c].subs[s] || 0) + +x.amount;
    });
    setRep({ total, grp, from, to });
  }

  const byMonth = {};
  f.forEach((x) => {
    const m = String(x.date).slice(0, 7);
    if (!byMonth[m]) byMonth[m] = { inc: 0, exp: 0 };
    if (x.type === 'income') byMonth[m].inc += +x.amount; else byMonth[m].exp += +x.amount;
  });
  const months = Object.keys(byMonth).sort().reverse();

  // Журнал: по дате, ранние сверху; последние записи — внизу, как в тетради.
  const log = f.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)) || (Number(a.id) - Number(b.id)));
  const shownLog = allOps ? log : log.slice(-30);

  function exportOps() {
    const rows = [['Дата', 'Тип', 'Категория', 'Подкатегория', 'Сумма', 'Комментарий']];
    f.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach((x) => {
      rows.push([String(x.date).slice(0, 10), x.type === 'income' ? 'Доход' : 'Расход', x.category || '', x.subcategory || '', Math.round(+x.amount || 0), x.note || '']);
    });
    downloadXlsx('medina-operations-' + todayStr() + '.xlsx', rows, { sheetName: 'Операции', boldRows: [0] });
  }
  function exportSummary() {
    const rows = [['Месяц', 'Доход', 'Расход', 'Остаток']];
    months.slice().reverse().forEach((m) => {
      const r = byMonth[m];
      rows.push([monthName(m), Math.round(r.inc), Math.round(r.exp), Math.round(r.inc - r.exp)]);
    });
    rows.push(['Итого', Math.round(inc), Math.round(exp), Math.round(inc - exp)]);
    downloadXlsx('medina-summary-' + todayStr() + '.xlsx', rows, { sheetName: 'Сводка', boldRows: [0, rows.length - 1] });
  }

  return (
    <>
      <div className="card">
        <h2 style={{ fontSize: 15 }}>Итог за всё время</h2>
        <div className="tiles" style={{ marginTop: 8 }}>
          <div className="tile" style={{ background: 'var(--freebg)' }}><div className="l" style={{ color: 'var(--incd)' }}>Доход</div><div className="v" style={{ fontSize: 18, color: 'var(--incd)' }}>{money(inc)}</div></div>
          <div className="tile" style={{ background: 'var(--fullbg)' }}><div className="l" style={{ color: 'var(--expd)' }}>Расход</div><div className="v" style={{ fontSize: 18, color: 'var(--expd)' }}>{money(exp)}</div></div>
        </div>
        <div className="tile" style={{ background: 'var(--eef)', marginTop: 10 }}><div className="l" style={{ color: 'var(--primd)' }}>Остаток (доход − расход)</div><div className="v" style={{ fontSize: 20, color: 'var(--primd)' }}>{money(inc - exp)}</div></div>
      </div>

      {/* Журнал операций: как в тетради — по датам, ранние сверху,
          каждую строку можно поправить или удалить. */}
      <div className="card">
        <h2 style={{ fontSize: 15 }}>Журнал операций</h2>
        <div className="small">
          Все расходы и доходы по датам. Ошиблись — нажмите ✎, лишнее — ✕.
          {log.length > 30 && (
            <> <button className="link" onClick={() => setAllOps(!allOps)}>
              {allOps ? 'показать последние 30' : `показать все ${log.length}`}
            </button></>
          )}
        </div>
        {log.length ? (
          <div style={{ overflow: 'auto', marginTop: 10 }}>
            <table><tbody>
              <tr><th>Дата</th><th>Статья</th><th style={{ textAlign: 'right' }}>Сумма</th><th>Комментарий</th><th></th></tr>
              {shownLog.map((x) => (
                <tr key={x.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmt(x.date)}</td>
                  <td style={{ fontWeight: 600 }}>{x.category}{x.subcategory ? ' › ' + x.subcategory : ''}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap',
                               color: x.type === 'income' ? 'var(--incd)' : 'var(--expd)' }}>
                    {x.type === 'income' ? '+' : '−'}{money(Math.abs(x.amount))}
                  </td>
                  <td>{x.note || ''}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="link" onClick={() => onEdit?.(x)}>✎</button>
                    {' '}
                    <button className="link" style={{ color: 'var(--full)' }} onClick={() => onDelete?.(x.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody></table>
          </div>
        ) : <div className="small" style={{ marginTop: 8 }}>Операций пока нет.</div>}
      </div>

      <div className="card">
        <h2 style={{ fontSize: 15 }}>Помесячная сводка</h2>
        <div className="small">Доход, расход и остаток по каждому месяцу.</div>
        <div className="noprint" style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button className="btn sec" style={{ margin: 0, flex: 1, minWidth: 90 }} onClick={() => window.print()}>🖨 Печать</button>
          <button className="btn sec" style={{ margin: 0, flex: 1, minWidth: 120 }} onClick={exportSummary}>⬇ Сводка в Excel</button>
          <button className="btn sec" style={{ margin: 0, flex: 1, minWidth: 130 }} onClick={exportOps}>⬇ Операции в Excel</button>
        </div>
        {months.length ? (
          <div style={{ overflow: 'auto', marginTop: 12 }}>
            <table><tbody>
              <tr><th>Месяц</th><th style={{ textAlign: 'right' }}>Доход</th><th style={{ textAlign: 'right' }}>Расход</th><th style={{ textAlign: 'right' }}>Остаток</th></tr>
              {months.map((m) => {
                const r = byMonth[m]; const bal = r.inc - r.exp;
                return (
                  <tr key={m}>
                    <td style={{ fontWeight: 600 }}>{monthName(m)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--incd)' }}>{money(r.inc)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--expd)' }}>{money(r.exp)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: bal >= 0 ? 'var(--incd)' : 'var(--expd)' }}>{money(bal)}</td>
                  </tr>
                );
              })}
              <tr style={{ background: 'var(--panel)' }}>
                <td style={{ fontWeight: 700 }}>Итого</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--incd)' }}>{money(inc)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--expd)' }}>{money(exp)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: (inc - exp) >= 0 ? 'var(--incd)' : 'var(--expd)' }}>{money(inc - exp)}</td>
              </tr>
            </tbody></table>
          </div>
        ) : <div className="small" style={{ marginTop: 10 }}>Пока нет операций.</div>}
      </div>

      <div className="card noprint">
        <h2 style={{ fontSize: 15 }}>Отчёт по расходам (по категориям)</h2>
        <label>с</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label>по</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <button className="btn" onClick={build}>Показать отчёт</button>
        <button className="btn sec" onClick={() => window.print()}>🖨 Печать / PDF</button>
      </div>

      {rep && (
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 2 }}>Отчёт по расходам</div>
          <div className="small" style={{ marginBottom: 8 }}>{rep.from ? fmt(rep.from) : 'начало'} – {rep.to ? fmt(rep.to) : 'сегодня'}</div>
          <div className="tile" style={{ background: 'var(--fullbg)', marginBottom: 10 }}><div className="v" style={{ fontSize: 20, color: 'var(--expd)' }}>{money(rep.total)}</div><div className="l" style={{ color: 'var(--expd)' }}>всего расходов</div></div>
          {Object.keys(rep.grp).length ? (
            <div style={{ overflow: 'auto' }}>
              <table><tbody>
                <tr><th>Категория / подкатегория</th><th style={{ textAlign: 'right' }}>Сумма</th></tr>
                {Object.keys(rep.grp).sort((a, b) => rep.grp[b].sum - rep.grp[a].sum).map((c) => (
                  <FragmentCat key={c} name={c} data={rep.grp[c]} />
                ))}
              </tbody></table>
            </div>
          ) : <div className="small">Нет расходов за период.</div>}
        </div>
      )}
    </>
  );
}

function FragmentCat({ name, data }) {
  return (
    <>
      <tr style={{ background: 'var(--panel)' }}><td style={{ fontWeight: 700 }}>{name}</td><td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--expd)' }}>{money(data.sum)}</td></tr>
      {Object.keys(data.subs).sort((a, b) => data.subs[b] - data.subs[a]).map((s) => (
        <tr key={s}><td style={{ paddingLeft: 22, color: 'var(--muted)' }}>{s}</td><td style={{ textAlign: 'right' }}>{money(data.subs[s])}</td></tr>
      ))}
    </>
  );
}

// Категория зарплаты: в подкатегорию подставляем список наших сотрудников.
const isSalaryCat = (name) => /зарплат|зп\b|оплата труда/i.test(String(name || ''));

function FinModal({ cats, staff, onClose, onSaved, onNeedCats }) {
  const [type, setType] = useState('expense');
  const [cat, setCat] = useState('');
  const [sub, setSub] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const tops = topCats(cats, type);
  const catName = cats.find((x) => String(x.id) === String(cat))?.name || '';
  const salary = isSalaryCat(catName);
  // Для зарплаты подкатегория — это сотрудник; иначе обычные подкатегории.
  const workers = (staff || []).map((x) => x.fio).filter(Boolean).sort((a, b) => a.localeCompare(b));
  const subs = cat ? subCats(cats, cat) : [];
  useEffect(() => { setCat(tops[0]?.id ?? ''); setSub(''); /* eslint-disable-next-line */ }, [type]);
  useEffect(() => { setSub(''); }, [cat]);

  async function submit() {
    if (!cat) { onNeedCats(); return; }
    const a = parseFloat(amount);
    if (!a) return alert('Укажите сумму');
    if (salary && !sub) return alert('Выберите сотрудника');
    const c = cats.find((x) => String(x.id) === String(cat));
    setBusy(true);
    try {
      await api('addFinance', { type, category: c?.name, subcategory: sub, amount: a, date, note });
      onSaved();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <h2>Новая операция (сумма)</h2>
      <div className="small" style={{ marginBottom: 4 }}>Запись расхода/дохода с суммой. Категории создаются в «⚙ Настройки → Категории».</div>
      <label>Тип</label>
      <select value={type} onChange={(e) => setType(e.target.value)}>
        <option value="expense">Расход</option><option value="income">Доход</option>
      </select>
      <label>Категория</label>
      {tops.length ? (
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          {tops.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      ) : (
        <div className="small" style={{ background: 'var(--partbg)', color: 'var(--warnd)', padding: '8px 10px', borderRadius: 8, marginTop: 6 }}>
          Нет категорий типа «{type === 'expense' ? 'расход' : 'доход'}». Создайте их в ⚙ Настройки → Категории.
        </div>
      )}
      {salary ? (
        <>
          <label>Наши сотрудники</label>
          {workers.length ? (
            <select value={sub} onChange={(e) => setSub(e.target.value)}>
              <option value="">— выберите сотрудника —</option>
              {workers.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          ) : (
            <div className="small" style={{ background: 'var(--partbg)', color: 'var(--warnd)', padding: '8px 10px', borderRadius: 8, marginTop: 6 }}>
              Работников пока нет. Заведите их в ⚙ Настройки → Работники.
            </div>
          )}
          <div className="small" style={{ marginTop: 6 }}>Кому платим. Попадёт в отчёт как «Зарплата › {sub || '—'}».</div>
        </>
      ) : (
        <>
          <label>Подкатегория (вид)</label>
          <select value={sub} onChange={(e) => setSub(e.target.value)}>
            <option value="">— без подкатегории —</option>
            {subs.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </>
      )}
      <label>Сумма, ₸</label><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
      <label>Дата</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <label>Комментарий</label><input value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn" disabled={busy} onClick={submit}>{cat ? 'Сохранить' : 'Создать категории'}</button>
      <button className="btn sec" onClick={onClose}>Отмена</button>
    </>
  );
}

/* ===================== Shifts ===================== */
const shiftLabel = (t) => t === 'day' ? 'День (сутки)' : 'Ночь 20:00–08:00';

/* Операции (для персонала): добавить смену + график */
function ShiftsTab({ db, onAdd, onPay, onEditPayment, onDelPayment, onReload }) {
  const sh = db.shifts.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const hours = sh.reduce((a, b) => a + (+b.hours || 0), 0);
  const [switching, setSwitching] = useState(0);

  // Вид смены можно поправить прямо в графике — от него зависит сумма.
  async function flipShift(x) {
    const next = shiftTypeOf(x) === 'day' ? 'night' : 'day';
    setSwitching(x.id);
    try { await api('setShiftType', { id: x.id, shift: next }); await onReload?.(); }
    catch (e) { alert(e.message); } finally { setSwitching(0); }
  }

  return (
    <>
      <div className="card">
        <h2>Смены персонала</h2>
        <div className="small">Охрана отмечает приход/уход по QR. Табель — в разделе «📊 Учёт».</div>
        <div className="tiles" style={{ marginTop: 10 }}>
          <div className="tile" style={{ background: 'var(--eef)' }}><div className="v" style={{ fontSize: 18, color: 'var(--primd)' }}>{sh.length}</div><div className="l" style={{ color: 'var(--primd)' }}>смен</div></div>
          <div className="tile" style={{ background: 'var(--freebg)' }}><div className="v" style={{ fontSize: 18, color: 'var(--incd)' }}>{hours}</div><div className="l" style={{ color: 'var(--incd)' }}>часов</div></div>
        </div>
        <button className="btn" onClick={onAdd}>+ Добавить смену</button>
        <div className="small" style={{ marginTop: 8 }}>Охранников заводите в «⚙ Настройки → Работники» (должность «Охрана»).</div>
      </div>

      <GuardPay db={db} onPay={onPay} onEditPayment={onEditPayment} onDelPayment={onDelPayment} onReload={onReload} />

      <div className="card">
        <h2 style={{ fontSize: 15 }}>График смен</h2>
        <div className="small">Вид смены в таблице можно нажать и переключить — сумма пересчитается.</div>
        {sh.length ? (
          <div style={{ overflow: 'auto' }}>
            <table><tbody>
              <tr><th>Дата</th><th>Сотрудник</th><th>Должн.</th><th>Смена</th><th>Ч</th><th>Подтв.</th></tr>
              {sh.map((x) => {
                const conf = x.confirmed ? <span style={{ color: 'var(--incd)', fontWeight: 700 }}>✓</span> : (x.role === 'Охрана' ? <span style={{ color: 'var(--warnd)' }}>ждёт</span> : '—');
                const times = x.checkIn ? (timeHM(x.checkIn) + '–' + (x.checkOut ? timeHM(x.checkOut) : '…')) : '';
                return (
                  <tr key={x.id}>
                    <td>{fmt(x.date)}</td>
                    <td style={{ fontWeight: 600 }}>{x.fio}</td>
                    <td>{x.role || ''}</td>
                    <td>
                      <button className="link" disabled={switching === x.id} onClick={() => flipShift(x)}
                        title="Нажмите, чтобы поменять вид смены">
                        {shiftTypeLabel(x)}
                      </button>
                      {times ? <span className="small"> · {times}</span> : ''}
                    </td>
                    <td>{x.checkIn && !x.checkOut ? '…' : (x.hours || '')}</td>
                    <td>{conf}</td>
                  </tr>
                );
              })}
            </tbody></table>
          </div>
        ) : <div className="small">Смен нет.</div>}
      </div>
    </>
  );
}

/* Табель (для учёта) */
function ShiftsReport({ db, onPay, onEditPayment, onDelPayment, onReload }) {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const [tabel, setTabel] = useState(null);

  const rates = guardRates(db.settings);

  function buildTabel() {
    const rows0 = db.shifts.filter((x) => (!from || String(x.date).slice(0, 10) >= from) && (!to || String(x.date).slice(0, 10) <= to));
    const byName = {};
    rows0.forEach((x) => {
      const k = x.fio + '|' + (x.role || '');
      if (!byName[k]) byName[k] = { name: x.fio, role: x.role, shifts: [] };
      byName[k].shifts.push(x);
    });
    // Деньги считаем по видам смен теми же ставками, что и в блоке оплаты.
    const rows = Object.values(byName).map((r) => {
      const e = guardEarned(r.shifts, rates);
      return { ...r, cnt: e.days, night: e.night, day: e.day, amount: e.amount };
    }).sort((a, b) => b.amount - a.amount);
    setTabel({ rows, total: rows.reduce((a, b) => a + b.amount, 0), from, to });
  }

  return (
    <>
      <GuardPay db={db} onPay={onPay} onEditPayment={onEditPayment} onDelPayment={onDelPayment} onReload={onReload} />

      <div className="card noprint">
        <h2 style={{ fontSize: 15 }}>Табель за период</h2>
        <label>с</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label>по</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <button className="btn" onClick={buildTabel}>Показать табель</button>
        <button className="btn sec" onClick={() => window.print()}>🖨 Печать</button>
      </div>

      {tabel && (
        <div className="card">
          <div style={{ fontWeight: 700 }}>Табель за период</div>
          <div className="small" style={{ marginBottom: 8 }}>
            {tabel.from ? fmt(tabel.from) : 'начало'} – {tabel.to ? fmt(tabel.to) : 'сегодня'} · начислено за период: <b>{money(tabel.total)}</b>
          </div>
          {tabel.rows.length ? (
            <div style={{ overflow: 'auto' }}>
              <table><tbody>
                <tr><th>Сотрудник</th><th>Должн.</th><th>Смен</th><th>Ночь</th><th>День</th><th>Начислено</th></tr>
                {tabel.rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{r.name}</td><td>{r.role || ''}</td>
                    <td>{r.cnt}</td><td>{r.night}</td><td>{r.day}</td>
                    <td style={{ fontWeight: 700 }}>{money(r.amount)}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          ) : <div className="small">Нет смен.</div>}
        </div>
      )}
    </>
  );
}

/* Новая смена. Вид смены подставляется по дате (сб/вс — День, иначе Ночь),
   но его всегда можно переключить вручную. */
function ShiftModal({ db, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('Охрана');
  const [date, setDate] = useState(todayStr());
  const [shift, setShift] = useState(defaultShiftType(todayStr()));
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  // Пока вид смены не трогали руками — подстраиваем его под выбранную дату.
  useEffect(() => { if (!touched) setShift(defaultShiftType(date)); }, [date, touched]);

  const rates = guardRates(db?.settings);
  const workers = (db?.staff || []).map((x) => x.fio).filter(Boolean);

  function pickShift(t) { setShift(t); setTouched(true); }

  async function submit() {
    if (!name.trim()) return alert('Укажите сотрудника');
    setBusy(true);
    try {
      await api('addShift', { name: name.trim(), role, date, shift, hours: shiftHours(shift) });
      onSaved();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <h2>Новая смена</h2>
      <label>Сотрудник</label>
      <input value={name} onChange={(e) => setName(e.target.value)} list="staff-list" placeholder="начните набирать ФИО" />
      <datalist id="staff-list">{workers.map((w) => <option key={w} value={w} />)}</datalist>

      <label>Должность</label>
      <select value={role} onChange={(e) => setRole(e.target.value)}>{STAFF_ROLES.map((r) => <option key={r}>{r}</option>)}</select>

      <label>Дата</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} />

      <label>Смена</label>
      <div className="pick2">
        {SHIFT_TYPES.map((t) => (
          <button key={t.key}
            className={'pick' + (shift === t.key ? ' on' : '')}
            onClick={() => pickShift(t.key)}>
            <b>{t.label}</b>
            <span>{t.time} · {money(t.key === 'day' ? rates.day : rates.night)}</span>
          </button>
        ))}
      </div>
      <div className="small" style={{ marginTop: 6 }}>
        {touched
          ? <>Вид смены выбран вручную.</>
          : <>Подставлен по дате: {isWeekendDate(date) ? 'суббота или воскресенье — День' : 'будний день — Ночь'}.</>}
      </div>

      <button className="btn" disabled={busy} onClick={submit}>Сохранить</button>
      <button className="btn sec" onClick={onClose}>Отмена</button>
    </>
  );
}

const isWeekendDate = (d) => defaultShiftType(d) === 'day';

/* ===================== Report tab ===================== */
function ReportTab({ db }) {
  // Хронологически: кто заехал раньше — выше, новые записи внизу.
  const rows = db.stays.slice().sort((a, b) =>
    a.arrival === b.arrival ? (a.id - b.id) : (a.arrival < b.arrival ? -1 : 1));
  const total = rows.reduce((a, s) => { const n = nightsNow(s.arrival, s.departure); return a + (typeof n === 'number' ? n : 0); }, 0);
  return (
    <>
      <div className="card noprint">
        <h2>Отчёт (вахтовый метод)</h2>
        <div className="small">Проживание работников вахтовым методом.</div>
        <button className="btn row" style={{ marginTop: 10 }} onClick={() => window.print()}>🖨 Печать / PDF</button>
      </div>
      <div className="card">
        <div style={{ fontWeight: 700 }}>Отчёт о проживании (вахтовый метод)</div>
        <div className="small" style={{ marginBottom: 10 }}>Всего проживаний: {rows.length} · человеко-суток: {total} <span style={{ opacity: .7 }}>(незакрытые — по сегодняшний день)</span></div>
        <div style={{ overflow: 'auto' }}>
          <table><tbody>
            <tr><th>ФИО</th><th>Комн.</th><th>Прибытие</th><th>Выбытие</th><th>Сут.</th><th>Статус</th></tr>
            {rows.length ? rows.map((s) => {
              const st = s.status === 'closed' ? 'закрыт' : s.status === 'booked' ? 'бронь' : 'на смене';
              return <tr key={s.id}><td>{s.fio}</td><td>№{s.room}</td><td>{fmt(s.arrival)}</td><td>{s.departure ? fmt(s.departure) : '—'}</td><td>{nightsNow(s.arrival, s.departure)}</td><td>{st}</td></tr>;
            }) : <tr><td colSpan={6} className="small">Нет заселений.</td></tr>}
          </tbody></table>
        </div>
      </div>
    </>
  );
}

/* ===================== Админ-учёт (все отчёты) ===================== */
function Uchet({ db, backToApp, onPay, onEditPayment, onDelPayment, onEditFin, onDelFin, onReload }) {
  const [seg, setSeg] = useState('stay');
  const segs = [['stay', '🏨 Проживание'], ['fin', '₸ Финансы'], ['shifts', '🕒 Смены']];
  return (
    <>
      <div className="card">
        <h2>📊 Админ-учёт</h2>
        <div className="small">Все отчёты гостиницы в одном месте: проживание вахты, финансы и табель смен.</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {segs.map((s) => (
            <button key={s[0]} className={'btn ' + (seg === s[0] ? '' : 'sec')} style={{ flex: '1 1 30%', margin: 0, padding: '9px 4px', fontSize: 13, minWidth: 96 }} onClick={() => setSeg(s[0])}>{s[1]}</button>
          ))}
        </div>
      </div>

      {seg === 'stay' && <ReportTab db={db} />}
      {seg === 'fin' && <FinReport db={db} onEdit={onEditFin} onDelete={onDelFin} />}
      {seg === 'shifts' && <ShiftsReport db={db} onPay={onPay} onEditPayment={onEditPayment}
                             onDelPayment={onDelPayment} onReload={onReload} />}

      <div className="card"><button className="btn sec" onClick={backToApp}>← назад в кабинет</button></div>
    </>
  );
}

/* ===================== Settings ===================== */
function roleChip(r) {
  if (r === 'admin') return <span className="chip" style={{ background: 'var(--eef)', color: 'var(--primd)' }}>Админ</span>;
  if (r === 'reception') return <span className="chip g">Ресепшн</span>;
  return <span className="chip a">Заказчик</span>;
}

function Row({ av, title, sub, onEdit, onDel }) {
  return (
    <div className="list-item">
      <div className="avatar">{av}</div>
      <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>{title}</div><div className="small">{sub}</div></div>
      <button className="link" onClick={onEdit}>изм.</button>
      &nbsp;&nbsp;
      <button className="link" style={{ color: 'var(--full)' }} onClick={onDel}>удал.</button>
    </div>
  );
}

function Settings({ db, seg, sess, users, setSeg, setModal, onDelete, backToApp }) {
  const segs = [['guests', 'Гости'], ['staff', 'Работники'], ['cats', 'Категории']];
  if (sess?.role === 'admin') { segs.unshift(['users', 'Пользователи']); segs.push(['report', 'Отчёт']); }

  return (
    <>
      <div className="card">
        <h2>⚙ Настройки</h2>
        <div className="small">Пользователи — доступ по логину; Гости — кто заселяется; Работники — персонал; Категории — статьи доходов и расходов; Отчёт — что видит заказчик.</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          {segs.map((s) => (
            <button key={s[0]} className={'btn ' + (seg === s[0] ? '' : 'sec')} style={{ flex: '1 1 30%', margin: 0, padding: '9px 4px', fontSize: 13, minWidth: 84 }} onClick={() => setSeg(s[0])}>{s[1]}</button>
          ))}
        </div>
      </div>

      {seg === 'users' && (
        <div className="card">
          <button className="btn" onClick={() => setModal({ type: 'user' })}>+ Добавить пользователя</button>
          {users.length ? <div style={{ marginTop: 12 }}>
            {users.map((u) => (
              <Row key={u.login} av={initials(u.name)} title={u.name}
                sub={<>{u.login} &nbsp; {roleChip(u.role)}</>}
                onEdit={() => setModal({ type: 'user', data: u })}
                onDel={() => onDelete('user', u.login)} />
            ))}
          </div> : <div className="small" style={{ marginTop: 10 }}>Пока нет пользователей.</div>}
        </div>
      )}

      {seg === 'guests' && (
        <div className="card">
          <button className="btn" onClick={() => setModal({ type: 'guest' })}>+ Добавить гостя</button>
          {db.guests.length ? <div style={{ marginTop: 12 }}>
            {db.guests.map((x) => {
              const inr = db.stays.find((s) => String(s.guestId) === String(x.id) && s.status !== 'closed');
              return <Row key={x.id} av={initials(x.fio)} title={x.fio}
                sub={<>{[x.position, x.company, x.destination, birthToText(x.birthYear), x.iin && 'ИИН ' + x.iin, x.phone].filter(Boolean).join(' · ')}{inr ? <> · <b style={{ color: 'var(--incd)' }}>№{inr.room}</b></> : ''}</>}
                onEdit={() => setModal({ type: 'guest', data: x })}
                onDel={() => onDelete('guest', x.id)} />;
            })}
          </div> : <div className="small" style={{ marginTop: 10 }}>Пока нет гостей.</div>}
        </div>
      )}

      {seg === 'staff' && (
        <div className="card">
          <button className="btn" onClick={() => setModal({ type: 'staff' })}>+ Добавить работника</button>
          <div className="small" style={{ marginTop: 8 }}>Работники с должностью «Охрана» видны на странице охраны (/guard).</div>
          {db.staff.length ? <div style={{ marginTop: 12 }}>
            {db.staff.map((x) => (
              <Row key={x.id} av={initials(x.fio)} title={x.fio}
                sub={<>{x.role || ''}{x.phone ? ' · ' + x.phone : ''}</>}
                onEdit={() => setModal({ type: 'staff', data: x })}
                onDel={() => onDelete('staff', x.id)} />
            ))}
          </div> : <div className="small" style={{ marginTop: 10 }}>Пока нет работников.</div>}
        </div>
      )}

      {seg === 'report' && <ReportSettings />}

      {seg === 'cats' && (
        <>
          <div className="card">
            <button className="btn" onClick={() => setModal({ type: 'cat' })}>+ Добавить категорию</button>
            <div className="small" style={{ marginTop: 8 }}>Категория (напр. «Продукты») и её подкатегории (напр. «Мясо», «Овощи»). По ним отчёт покажет суммы.</div>
          </div>
          <div className="card">
            <CatsList db={db} setModal={setModal} onDelete={onDelete} />
          </div>
        </>
      )}

      <div className="card"><button className="btn sec" onClick={backToApp}>← назад в кабинет</button></div>
    </>
  );
}

/* Что заказчик видит в своём отчёте. Часть гостиниц не хочет показывать номера комнат. */
function ReportSettings() {
  const [showRooms, setShowRooms] = useState(null);   // null — ещё грузим
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try { const s = await api('settings'); setShowRooms(s?.report_show_rooms === '1'); }
      catch { setShowRooms(false); }
    })();
  }, []);

  async function toggle(v) {
    setShowRooms(v); setBusy(true); setSaved(false);
    try {
      const r = await api('setSetting', { key: 'report_show_rooms', value: v ? '1' : '0' });
      if (!r.ok) { setShowRooms(!v); return alert(r.error || 'Не удалось сохранить'); }
      setSaved(true);
    } catch (e) { setShowRooms(!v); alert(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="card">
      <h2>Отчёт для заказчика</h2>
      <div className="small">Настройки страницы /report — того, что видит руководство завода.</div>
      {showRooms === null ? (
        <div className="small" style={{ marginTop: 10 }}>Загружаем…</div>
      ) : (
        <>
          <label className="remember" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={showRooms} disabled={busy} onChange={(e) => toggle(e.target.checked)} />
            <span>Показывать номера комнат</span>
          </label>
          <div className="small" style={{ marginTop: 6 }}>
            {showRooms
              ? 'Заказчик видит колонку «Комната» и блок занятости комнат.'
              : 'Номера комнат скрыты: заказчик видит только ФИО, ИИН, телефон, даты и сколько человек проживает.'}
            {saved && <> · <b style={{ color: 'var(--incd)' }}>сохранено</b></>}
          </div>
        </>
      )}
      <Busy show={busy} />
    </div>
  );
}

function CatsList({ db, setModal, onDelete }) {
  const cs = db.categories;
  const tops = cs.filter((c) => !c.parent);
  if (!tops.length) return <div className="small">Пока нет категорий. Добавьте свои статьи расходов и доходов.</div>;
  return tops.map((c) => (
    <div key={c.id}>
      <div className="list-item">
        <div className="avatar">₸</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>{c.name} &nbsp; {c.type === 'income' ? <span className="chip g">доход</span> : <span className="chip a">расход</span>}</div>
          <div className="small"><button className="link" onClick={() => setModal({ type: 'cat', parentId: c.id, ctype: c.type })}>+ подкатегория</button></div>
        </div>
        <button className="link" onClick={() => setModal({ type: 'cat', data: c })}>изм.</button>
        &nbsp;&nbsp;
        <button className="link" style={{ color: 'var(--full)' }} onClick={() => onDelete('cat', c.id)}>удал.</button>
      </div>
      {cs.filter((s) => String(s.parent || '') === String(c.id)).map((s) => (
        <div key={s.id} className="list-item" style={{ marginLeft: 22, background: 'var(--card)' }}>
          <div style={{ flex: 1, fontWeight: 500 }}>↳ {s.name}</div>
          <button className="link" onClick={() => setModal({ type: 'cat', data: s })}>изм.</button>
          &nbsp;&nbsp;
          <button className="link" style={{ color: 'var(--full)' }} onClick={() => onDelete('cat', s.id)}>удал.</button>
        </div>
      ))}
    </div>
  ));
}

/* ---- Settings modals ---- */
function GuestModal({ guest, onClose, onSaved }) {
  const edit = !!guest;
  const known = CITIZENSHIPS.includes(guest?.citizenship || '');
  const [fio, setFio] = useState(guest?.fio || '');
  const [iin, setIin] = useState(guest?.iin || '');
  const [docNo, setDocNo] = useState(guest?.docNo || '');
  const [birth, setBirth] = useState(birthInput(guest?.birthYear || ''));
  const bornYearOnly = birthLegacyYear(guest?.birthYear || '');
  const [company, setCompany] = useState(guest?.company ?? DEFAULT_COMPANY);
  const knownPos = POSITIONS.includes(guest?.position || '');
  const [pos, setPos] = useState(guest?.position ? (knownPos ? guest.position : 'Другое') : 'Инженер');
  const [posOther, setPosOther] = useState(guest?.position && !knownPos ? guest.position : '');
  const [destination, setDestination] = useState(guest?.destination || '');
  const [cit, setCit] = useState(guest?.citizenship ? (known ? guest.citizenship : 'Другое') : 'Казахстан');
  const [citOther, setCitOther] = useState(guest?.citizenship && !known ? guest.citizenship : '');
  const [phone, setPhone] = useState(guest?.phone ? formatPhone(guest.phone) : '+7 ');
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
      const r = edit ? await api('updateGuest', { id: guest.id, ...payload }) : await api('addGuest', payload);
      if (!r.ok) return alert(r.error || 'Ошибка'); onSaved();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  return (
    <>
      <h2>{edit ? 'Изменить гостя' : 'Новый гость'}</h2>
      <label>ФИО</label><input value={fio} onChange={(e) => setFio(e.target.value)} />
      <label>ИИН / Номер паспорта</label>
      <input value={iin} onChange={(e) => setIin(e.target.value)} placeholder="12 цифр или номер паспорта" />
      <label>Номер документа</label><input value={docNo} onChange={(e) => setDocNo(e.target.value)} placeholder="удостоверение или паспорт" />
      <label>Дата рождения</label>
      <input value={birth} onChange={(e) => setBirth(formatBirth(e.target.value))}
        inputMode="numeric" placeholder={BIRTH_PLACEHOLDER} />
      <div className="small" style={{ marginTop: 4 }}>
        {bornYearOnly
          ? <>Раньше был указан только год — <b>{bornYearOnly}</b>. Впишите полную дату.</>
          : 'День, месяц, год — точки подставятся сами.'}
      </div>
      <label>Компания / вахта</label><input value={company} onChange={(e) => setCompany(e.target.value)} />
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
      <button className="btn" disabled={busy} onClick={submit}>Сохранить</button>
      <button className="btn sec" onClick={onClose}>Отмена</button>
    </>
  );
}

function StaffModal({ worker, onClose, onSaved }) {
  const edit = !!worker;
  const [fio, setFio] = useState(worker?.fio || '');
  const [role, setRole] = useState(worker?.role || STAFF_ROLES[0]);
  const [phone, setPhone] = useState(worker?.phone || '');
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!fio.trim()) return alert('Укажите ФИО');
    setBusy(true);
    try {
      const r = edit ? await api('updateStaff', { id: worker.id, fio, role, phone }) : await api('addStaff', { fio, role, phone });
      if (!r.ok) return alert(r.error || 'Ошибка'); onSaved();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  return (
    <>
      <h2>{edit ? 'Изменить работника' : 'Новый работник'}</h2>
      <label>ФИО</label><input value={fio} onChange={(e) => setFio(e.target.value)} />
      <label>Должность</label>
      <select value={role} onChange={(e) => setRole(e.target.value)}>{STAFF_ROLES.map((r) => <option key={r}>{r}</option>)}</select>
      <label>Телефон</label><input value={phone} onChange={(e) => setPhone(e.target.value)} />
      <button className="btn" disabled={busy} onClick={submit}>Сохранить</button>
      <button className="btn sec" onClick={onClose}>Отмена</button>
    </>
  );
}

function CatModal({ cat, parentId, ctype, onClose, onSaved }) {
  const edit = !!cat;
  const isSub = edit ? !!cat.parent : !!parentId;
  const [name, setName] = useState(cat?.name || '');
  const [type, setType] = useState(cat?.type || ctype || 'expense');
  const [busy, setBusy] = useState(false);
  const title = edit ? (isSub ? 'Изменить подкатегорию' : 'Изменить категорию') : (parentId ? 'Новая подкатегория' : 'Новая категория');
  async function submit() {
    if (!name.trim()) return alert('Укажите название');
    setBusy(true);
    try {
      const r = edit
        ? await api('updateCategory', { id: cat.id, title: name, ctype: type })
        : await api('addCategory', { title: name, ctype: type, parent: parentId || '' });
      if (!r.ok) return alert(r.error || 'Ошибка'); onSaved();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  return (
    <>
      <h2>{title}</h2>
      <label>Название</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={parentId ? 'Напр. Мясо, Овощи' : 'Напр. Продукты, Коммуналка'} />
      {!isSub && (
        <>
          <label>Тип</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="expense">Расход</option><option value="income">Доход</option>
          </select>
        </>
      )}
      <button className="btn" disabled={busy} onClick={submit}>Сохранить</button>
      <button className="btn sec" onClick={onClose}>Отмена</button>
    </>
  );
}

function UserModal({ user, onClose, onSaved }) {
  const edit = !!user;
  const [name, setName] = useState(user?.name || '');
  const [login, setLogin] = useState(user?.login || '');
  const [pass, setPass] = useState('');
  const [role, setRole] = useState(user?.role || 'admin');
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!name.trim() || !login.trim()) return alert('Имя и логин обязательны');
    if (!edit && !pass) return alert('Укажите пароль для нового пользователя');
    setBusy(true);
    try {
      const r = edit ? await api('updateUser', { login, name, role, pass }) : await api('addUser', { name, login, pass, role });
      if (!r.ok) return alert(r.error || 'Ошибка'); onSaved();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  return (
    <>
      <h2>{edit ? 'Изменить пользователя' : 'Новый пользователь'}</h2>
      <label>Имя</label><input value={name} onChange={(e) => setName(e.target.value)} />
      <label>Логин</label>
      <input value={login} onChange={(e) => setLogin(e.target.value)} readOnly={edit} style={edit ? { background: 'var(--eef)', color: 'var(--muted)' } : undefined} />
      <label>Пароль{edit ? ' (пусто — не менять)' : ''}</label>
      <input type="text" value={pass} onChange={(e) => setPass(e.target.value)} />
      <label>Роль</label>
      <select value={role} onChange={(e) => setRole(e.target.value)}>
        <option value="admin">Админ (полный доступ)</option>
        <option value="reception">Ресепшн</option>
        <option value="factory">Заказчик (только отчёт)</option>
      </select>
      <button className="btn" disabled={busy} onClick={submit}>Сохранить</button>
      <button className="btn sec" onClick={onClose}>Отмена</button>
    </>
  );
}
