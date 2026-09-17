'use client';
import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, getSess, setSess, clearSess, getLastLogin, forgetMe, REPORT_SESS_KEY as SK } from '@/lib/client';
import { TopBar, Busy, Modal } from '@/components/kit';
import { useLive, liveLabel } from '@/lib/live';
import { fmt, fmtDateTime, timeHM, nightsNow, todayStr, groupByBlock, blockOf, formatPhone,
         STAY_TYPES, stayTypeLabel } from '@/lib/ui';
import { fuzzyScore } from '@/lib/fuzzy';
import { downloadXlsx } from '@/lib/xlsx';
import { downloadPdf } from '@/lib/pdf';

const onlyDigits = (v) => String(v || '').replace(/\D/g, '');

// Реквизиты гостиницы — в шапке отчёта и в первой строке PDF/Excel.
const HOTEL = 'Гостиница «Медина» · г. Жанатас · Абдраимов';

const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
function weekday(d) {
  const p = String(d || '').slice(0, 10).split('-').map(Number);
  if (p.length !== 3 || !p[0]) return '';
  return WD[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()];
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
  const [showRooms, setShowRooms] = useState(false); // управляется в кабинете
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [q, setQ] = useState('');
  const [who, setWho] = useState('all'); // all | living | left
  /* Даты включаются только когда их трогают. По умолчанию журнал
     начинается с самого раннего, кто СЕЙЧАС живёт в гостинице. */
  const [useDates, setUseDates] = useState(false);
  const [booked, setBooked] = useState(0);
  const [bookings, setBookings] = useState([]);
  const [seats, setSeats] = useState([]);   // сколько мест в каждой комнате
  const [req, setReq] = useState(false);       // открыта форма заявки
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
      const r = await api('login', { login: login.trim(), pass: pass.trim(), remember });
      if (!r.ok || r.user.role !== 'factory') return alert('Неверный логин или пароль');
      setSess({ name: r.user.name, login: r.user.login, role: r.user.role }, remember, SK);
      setAuthed(true);
      await render();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  function doLogout() {
    api('logout').catch(() => {});
    clearSess(SK); setAuthed(false); setPass(''); setRows([]); setRooms([]);
  }

  async function render() {
    setBusy(true);
    try {
      const [d, cfg] = await Promise.all([api('report'), api('settings').catch(() => null)]);
      setRows(Array.isArray(d?.rows) ? d.rows : []);
      setRooms(Array.isArray(d?.rooms) ? d.rooms : []);
      setShowRooms(cfg?.report_show_rooms === '1');
      setBooked(Number(d?.booked) || 0);
      setBookings(Array.isArray(d?.bookings) ? d.bookings : []);
      setSeats(Array.isArray(d?.seats) ? d.seats : []);
    } catch { setRows([]); setRooms([]); setBookings([]); setSeats([]); } finally { setBusy(false); }
  }

  // Отчёт тоже освежается сам, пока вкладка открыта.
  const { checkedAt } = useLive(render, { enabled: authed && !req });

  /* ---------- текущая занятость (на сейчас) ---------- */
  const active = rows.filter((s) => s.status !== 'closed');
  const busyRooms = new Map(active.map((s) => [s.room, s]));
  const freeRooms = rooms.filter((n) => !busyRooms.has(n));

  /* ---------- период = журнал регистраций ----------
     По умолчанию (даты не трогали) журнал начинается с самой ранней даты
     заезда среди тех, кто сейчас в гостинице: тот, кто заехал раньше всех
     и ещё не выехал, возглавляет список, а дальше идут все за ним.
     Как только заказчик ставит свои даты — работает выбранный период. */
  const day = (v) => String(v || '').slice(0, 10);
  const liveFrom = active.reduce((m, s2) => {
    const a = day(s2.arrival);
    return a && (!m || a < m) ? a : m;
  }, '');
  const effFrom = useDates ? from : (liveFrom || todayStr());
  const effTo = useDates ? to : todayStr();
  let list = rows.filter((s) => {
    const a = day(s.arrival);
    return (!effFrom || a >= effFrom) && (!effTo || a <= effTo);
  });

  const nLiving = list.filter((s) => s.status !== 'closed').length;
  const nLeft = list.filter((s) => s.status === 'closed').length;

  /* ---------- фильтр по статусу: проживает / уже выехал ---------- */
  if (who === 'living') list = list.filter((s) => s.status !== 'closed');
  if (who === 'left') list = list.filter((s) => s.status === 'closed');

  /* ---------- поиск: ФИО (с опечатками), ИИН / паспорт, телефон ---------- */
  const qDigits = onlyDigits(q);
  const qText = q.trim().toLowerCase();
  if (qText) {
    list = list.filter((s) => {
      if (qDigits.length >= 3) {
        if (onlyDigits(s.iin).includes(qDigits)) return true;
        if (onlyDigits(s.phone).includes(qDigits)) return true;
      }
      // Номер паспорта бывает с буквами — ищем и как обычный текст.
      if (qText.length >= 3) {
        if (String(s.iin || '').toLowerCase().includes(qText)) return true;
        if (String(s.docNo || '').toLowerCase().includes(qText)) return true;
      }
      return fuzzyScore(q, s.fio) !== null;
    });
  }

  /* ---------- хронология: строго по дате заезда, ранние сверху ---------- */
  const key = (s) => day(s.arrival) + 'T' + String(s.arrivedAt || '').slice(11, 19);
  list = [...list].sort((x, y) => key(x).localeCompare(key(y)) || (Number(x.id) - Number(y.id)));

  // Дни журнала: на каждую дату — своя строка-разделитель.
  const journal = [];
  for (const s of list) {
    const d = day(s.arrival);
    const last = journal[journal.length - 1];
    if (last && last.date === d) last.items.push(s);
    else journal.push({ date: d, items: [s] });
  }

  // Сплошная нумерация журнала и ширина строки-разделителя.
  let no = 0;
  const cols = showRooms ? 11 : 10;

  // Сколько человек живёт в гостинице сейчас — не зависит от выбранного периода.
  const livingNow = active.length;

  const period = effFrom === effTo ? fmt(effFrom) : `${fmt(effFrom)} – ${fmt(effTo)}`;

  function setToday() { setUseDates(true); setFrom(todayStr()); setTo(todayStr()); }
  // «Всё время» — от самой ранней записи в базе до сегодня.
  const firstDay = rows.reduce((m, s2) => {
    const a = String(s2.arrival || '').slice(0, 10);
    return a && (!m || a < m) ? a : m;
  }, '');
  function setAll() { setUseDates(true); setFrom(firstDay || todayStr()); setTo(todayStr()); }
  function setDays(n) {
    setUseDates(true);
    const d = new Date(); d.setDate(d.getDate() - (n - 1));
    const p = (x) => String(x).padStart(2, '0');
    setFrom(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
    setTo(todayStr());
  }

  /* Выгрузка в формате, который принимает завод:
     дата заезда · дата выезда · ФИО · должность, а сводка справа — только в первой строке. */
  function buildReportRows() {
    const head = ['дата заезда', 'дата выезда', 'фамилия имя отчество', 'должность',
      'количество занятых номеров', 'количество свободных номеров', 'количество гостей по заявке'];
    const body = list.map((s, i) => [
      s.arrivedAt ? fmtDateTime(s.arrivedAt) : fmt(s.arrival),
      s.departure ? (s.departedAt ? fmtDateTime(s.departedAt) : fmt(s.departure)) : '',
      s.fio,
      s.position || '',
      // Сводные числа проставляются один раз — в первой строке, как в образце.
      i === 0 ? busyRooms.size : '',
      i === 0 ? freeRooms.length : '',
      i === 0 ? booked : '',
    ]);
    return { rows: [[HOTEL], head, ...body], head };
  }

  /* Excel — строго по бланку завода: одна таблица, где вахтовики и ИТР
     стоят РЯДОМ, каждый в своих колонках, а справа три пары цифр (в/а · ИТР).
     Шапка двухэтажная, поэтому верхние заголовки объединяем по ячейкам. */
  function exportExcel() {
    const allStays = rows;           // все проживания: из них берём категории по ФИО
    try {
    const cat = (s2) => stayTypeLabel(s2.stayType);
    const vah = list.filter((s2) => cat(s2) === 'Вахтовый');
    const itr = list.filter((s2) => cat(s2) === 'ИТР');
    const rest = list.filter((s2) => !cat(s2));
    const when = (s2) => (s2.arrivedAt ? fmtDateTime(s2.arrivedAt) : fmt(s2.arrival));

    /* Категория комнаты видна по тому, кто в ней живёт. Свободная комната
       берёт категорию своего блока: на деле блок 1 занят ИТР, блок 2 — вахтой,
       и отдельно закреплять комнаты не нужно — система видит это сама. */
    /* В бланке считаются МЕСТА, а не комнаты: в одной комнате может жить
       двое, и по комнатам цифры не сходились. Место занято тем, кто в нём
       живёт, — категория берётся прямо из его анкеты. */
    const occVah = active.filter((s2) => cat(s2) === 'Вахтовый').length;
    const occItr = active.filter((s2) => cat(s2) === 'ИТР').length;

    /* Свободное место относим к своему блоку: блок 1 занят ИТР, блок 2 —
       вахтой, система видит это по жильцам и закреплять ничего не нужно. */
    const perBlock = new Map();
    const inRoom = new Map();
    for (const s2 of active) {
      inRoom.set(s2.room, (inRoom.get(s2.room) || 0) + 1);
      const c = cat(s2);
      if (!c) continue;
      const b = blockOf(s2.room);
      const t = perBlock.get(b) || { itr: 0, vah: 0 };
      if (c === 'ИТР') t.itr++; else t.vah++;
      perBlock.set(b, t);
    }
    let freeVah = 0, freeItr = 0;
    for (const r of (seats || [])) {
      const n = Math.max(0, (Number(r.seats) || 1) - (inRoom.get(r.room) || 0));
      if (!n) continue;
      const t = perBlock.get(blockOf(r.room)) || { itr: 0, vah: 0 };
      if (t.itr > t.vah) freeItr += n;
      else if (t.vah > t.itr) freeVah += n;
      else { freeItr += n; freeVah += n; }   // блок пуст — место подойдёт обоим
    }

    /* Гости по заявке считаются прямо из списка заявок — ничего отмечать
       вручную не нужно. Категорию берём: 1) из самой заявки, 2) из анкеты,
       если этот человек у нас уже жил, 3) иначе считаем вахтовым — основной
       поток, и одно нажатие в списке заявок переключает на ИТР. */
    const nm = (v) => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const nameCat = new Map();
    for (const s2 of allStays) { const c = cat(s2); if (c && s2.fio) nameCat.set(nm(s2.fio), c); }
    const bookCat = (b) => stayTypeLabel(b.stayType) || nameCat.get(nm(b.fio)) || 'Вахтовый';

    const wait = (bookings || []).filter((b) => b.status !== 'closed');
    const cnt = (t) => wait.filter((b) => bookCat(b) === t)
      .reduce((a, b) => a + (Number(b.people) || 1), 0);
    const bookVah = cnt('Вахтовый');
    const bookItr = cnt('ИТР');

    const sheet = [
      [HOTEL],
      [`Отчёт о проживании · ${period}`],
      [],
    ];
    const head0 = sheet.length;               // верхний этаж шапки
    sheet.push(['№', 'вахтовики', '', '', '', 'ИТР', '', '',
      'количество занятых мест', '', 'количество свободных мест', '',
      'количество гостей по заявке', '']);
    sheet.push(['', 'дата и время заселения', 'ФИО', 'должность', 'подразделение',
      'дата и время заселения', 'ФИО', 'должность',
      'в/а', 'ИТР', 'в/а', 'ИТР', 'в/а', 'ИТР']);

    const firstData = sheet.length;
    const n = Math.max(vah.length, itr.length, 1);
    for (let i = 0; i < n; i++) {
      const v = vah[i]; const t = itr[i];
      sheet.push([
        i + 1,
        v ? when(v) : '', v ? v.fio : '', v ? (v.position || '') : '', v ? (v.destination || '') : '',
        t ? when(t) : '', t ? t.fio : '', t ? (t.position || '') : '',
        i === 0 ? occVah : '', i === 0 ? occItr : '',
        i === 0 ? freeVah : '', i === 0 ? freeItr : '',
        i === 0 ? bookVah : '', i === 0 ? bookItr : '',
      ]);
    }
    const lastData = sheet.length - 1;

    // Записи без категории не теряем — выносим отдельным списком под таблицей.
    const tail = [];
    if (rest.length) {
      sheet.push([]);
      tail.push(sheet.length);
      sheet.push([`Без категории — ${rest.length} чел. (проставьте ИТР или Вахтовый в анкете)`]);
      rest.forEach((s2, i) => sheet.push([i + 1, when(s2), s2.fio, s2.position || '', s2.destination || '']));
    }

    const gridRows = [];
    for (let r = firstData; r <= lastData; r++) gridRows.push(r);

    downloadXlsx(`MEDINA_${effFrom}_${effTo}.xlsx`, sheet, {
      sheetName: 'Отчёт',
      boldRows: [0, 1, ...tail],
      headRows: [head0, head0 + 1],
      gridRows,
      merges: [
        `A${head0 + 1}:A${head0 + 2}`,      // № — на два этажа
        `B${head0 + 1}:E${head0 + 1}`,      // вахтовики
        `F${head0 + 1}:H${head0 + 1}`,      // ИТР
        `I${head0 + 1}:J${head0 + 1}`,      // занятых номеров
        `K${head0 + 1}:L${head0 + 1}`,      // свободных номеров
        `M${head0 + 1}:N${head0 + 1}`,      // гостей по заявке
      ],
      widths: [5, 19, 28, 20, 20, 19, 28, 20, 9, 9, 9, 9, 9, 9],
    });
    } catch (e) {
      alert('Не удалось собрать файл: ' + (e?.message || e));
    }
  }

  /* PDF собираем сами — получается обычный файл, который можно
     сохранить и отправить, а не только распечатать. */
  function exportPdf() {
    const { head } = buildReportRows();
    const body = list.map((s, i) => [
      s.arrivedAt ? fmtDateTime(s.arrivedAt) : fmt(s.arrival),
      s.departure ? (s.departedAt ? fmtDateTime(s.departedAt) : fmt(s.departure)) : '',
      s.fio,
      s.position || '',
      i === 0 ? String(busyRooms.size) : '',
      i === 0 ? String(freeRooms.length) : '',
      i === 0 ? String(booked) : '',
    ]);
    // Колонкам с длинными заголовками даём больше места.
    const widths = [120, 120, 175, 150, 120, 120, 120];
    downloadPdf(`MEDINA_${effFrom}_${effTo}.pdf`, {
      title: `${HOTEL} · ${period}`,
      subtitle: `Отчёт о проживании · записей: ${body.length} · свободно комнат: ${freeRooms.length} · занято: ${busyRooms.size}`,
      columns: head.map((t, i) => ({ title: t, width: widths[i], align: i >= 4 ? 'right' : 'left' })),
      rows: body,
      footer: `${HOTEL} · сформировано ${fmtDateTime(new Date().toISOString())}`,
    });
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
              autoComplete="username" name="username"
              autoCapitalize="none" autoCorrect="off" spellCheck={false} />
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
      <TopBar icon="📊" sub="Медина · г. Жанатас · заказчик"
        right={<button className="link" style={{ color: '#fff' }} onClick={doLogout}>выйти</button>} />
      <div className="content">

        {/* --- Период и выгрузка --- */}
        <div className="card noprint">
          <h2>Отчёт о проживании</h2>
          <div className="small">🟢 {liveLabel(checkedAt)}. Только просмотр.</div>

          <div className="chips-row">
            <button className={'chipbtn' + (useDates ? '' : ' on')} onClick={() => setUseDates(false)}>Сейчас в гостинице</button>
            <button className={'chipbtn' + (useDates && from === todayStr() && to === todayStr() ? ' on' : '')} onClick={setToday}>Сегодня</button>
            <button className="chipbtn" onClick={() => setDays(7)}>7 дней</button>
            <button className="chipbtn" onClick={() => setDays(30)}>30 дней</button>
            <button className={'chipbtn' + (useDates && firstDay && from === firstDay && to === todayStr() ? ' on' : '')} onClick={setAll}>Всё время</button>
          </div>

          <div className="two">
            <div><label>Период с</label>
              <input type="date" value={from} onChange={(e) => { setUseDates(true); setFrom(e.target.value); }} /></div>
            <div><label>по</label>
              <input type="date" value={to} onChange={(e) => { setUseDates(true); setTo(e.target.value); }} /></div>
          </div>

          <div className="small" style={{ marginTop: 6 }}>
            {useDates
              ? <>Показываем заезды с {fmt(effFrom)} по {fmt(effTo)} — по датам, от ранних к поздним.</>
              : <>Сейчас показываем всех с {fmt(effFrom)} — с самого раннего, кто ещё живёт в гостинице.
                  Поставьте свои даты, чтобы посмотреть период.</>}
          </div>

          <div className="two" style={{ marginTop: 10 }}>
            <button className="btn sec" style={{ margin: 0 }} onClick={exportPdf}>⤓ PDF</button>
            <button className="btn sec" style={{ margin: 0 }} onClick={exportExcel}>⤓ Excel</button>
          </div>
          <div className="small" style={{ marginTop: 6 }}>
            В PDF и Excel уходит то, что видно ниже, — с учётом периода и поиска.
            {' '}<button className="link" onClick={() => window.print()}>🖨 распечатать</button>
          </div>
        </div>

        {/* --- Сводка --- */}
        <div className="card">
          <div style={{ fontWeight: 700 }}>Гостиница «Медина»</div>
          <div className="small" style={{ marginBottom: 8 }}>г. Жанатас · Абдраимов · {period}</div>
          {/* Занятость фонда — цифры показываем всегда, даже когда номера комнат скрыты */}
          <div className="kpi3">
            <div className="tile" style={{ background: 'var(--freebg)' }}>
              <div className="v" style={{ fontSize: 20, color: 'var(--incd)' }}>{livingNow}</div>
              <div className="l" style={{ color: 'var(--incd)' }}>проживает сейчас</div>
            </div>
            <div className="tile" style={{ background: 'var(--freebg)' }}>
              <div className="v" style={{ fontSize: 20, color: 'var(--incd)' }}>{freeRooms.length}</div>
              <div className="l" style={{ color: 'var(--incd)' }}>свободно комнат</div>
            </div>
            <div className="tile" style={{ background: 'var(--fullbg)' }}>
              <div className="v" style={{ fontSize: 20, color: 'var(--expd)' }}>{busyRooms.size}</div>
              <div className="l" style={{ color: 'var(--expd)' }}>занято комнат</div>
            </div>
          </div>
          <div className="small" style={{ marginTop: 6 }}>
            Всего комнат в гостинице: {rooms.length} · ожидается по заявкам: <b>{booked}</b> чел.
          </div>
        </div>

        {/* --- Заявки на проживание от заказчика --- */}
        <Requests list={bookings} onAdd={() => setReq(true)} onReload={render} />

        {/* --- Поиск и таблица --- */}
        <div className="card">
          <div className="noprint">
            <label>Кого показывать в списке</label>
            <div className="seg">
              <button className={who === 'all' ? 'on' : ''} onClick={() => setWho('all')}>
                Все <b>{nLiving + nLeft}</b>
              </button>
              <button className={who === 'living' ? 'on' : ''} onClick={() => setWho('living')}>
                Проживают <b>{nLiving}</b>
              </button>
              <button className={who === 'left' ? 'on' : ''} onClick={() => setWho('left')}>
                Выехали <b>{nLeft}</b>
              </button>
            </div>
            <div className="seghint">Нажмите, чтобы отфильтровать таблицу ниже.</div>

            <label>Поиск</label>
            <input placeholder="🔎 ФИО, ИИН / паспорт или телефон" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="small" style={{ marginTop: 6 }}>
              Поиск по фамилии терпит опечатки. По ИИН, паспорту и телефону — от трёх символов подряд.
              {q && <> <button className="link" onClick={() => setQ('')}>сбросить</button></>}
            </div>
          </div>

          <div style={{ fontWeight: 700, margin: '12px 0 6px' }}>
            {who === 'living' ? 'Журнал: проживают сейчас' : who === 'left' ? 'Журнал: уже выехали' : 'Журнал регистраций'}
          </div>
          <div style={{ overflow: 'auto' }}>
            <table>
              <tbody>
                <tr>
                  <th>№</th>
                  <th>ФИО</th><th>Должность</th><th>ИИН / паспорт</th><th>Телефон</th><th>Компания</th>
                  {showRooms && <th>Комн.</th>}
                  <th>Заезд</th><th>Выезд</th><th>Сут.</th><th>Статус</th>
                </tr>
                {journal.length ? journal.map((g) => (
                  <Fragment key={g.date}>
                    <tr>
                      <td colSpan={cols} style={{ background: 'var(--eef)', fontWeight: 700, color: 'var(--primd)' }}>
                        {fmt(g.date)} · {weekday(g.date)} — заехало {g.items.length}
                      </td>
                    </tr>
                    {g.items.map((s) => (
                      <tr key={s.id}>
                        <td style={{ color: 'var(--muted)' }}>{++no}</td>
                        <td>{s.fio}</td>
                        <td>{s.position || '—'}</td>
                        <td>{s.iin || '—'}</td>
                        <td>{s.phone ? formatPhone(s.phone) : '—'}</td>
                        <td>{s.company || '—'}</td>
                        {showRooms && <td>№{s.room}</td>}
                        <td>{s.arrivedAt ? timeHM(s.arrivedAt) : '—'}</td>
                        <td>{s.departure ? (s.departedAt ? fmtDateTime(s.departedAt) : fmt(s.departure)) : '—'}</td>
                        <td>{nightsNow(s.arrival, s.departure)}</td>
                        <td>{statusText(s.status)}</td>
                      </tr>
                    ))}
                  </Fragment>
                )) : <tr><td colSpan={cols} className="small">За эти даты никто не заезжал.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* --- Занятость комнат: показывается, только если разрешено в кабинете --- */}
        {showRooms && (
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
        )}

      </div>

      <Modal open={req} onClose={() => setReq(false)}>
        <RequestForm onClose={() => setReq(false)} onSaved={async () => { setReq(false); await render(); }} />
      </Modal>

      <Busy show={busy} />
    </div>
  );
}

/* ===================== Заявка на проживание =====================
   Заказчик сам сообщает, кого и куда ждёт. Это информация для ресепшна,
   а не бронь конкретной комнаты, поэтому поля необязательные и строгих
   проверок нет — кроме самого ФИО. */
function Requests({ list, onAdd, onReload }) {
  const today = todayStr();
  const rows = (list || []).filter((b) => b.status !== 'closed');

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Заявка на проживание</div>
        <span className="small">активных: {rows.length}</span>
      </div>
      <div className="small" style={{ marginTop: 4 }}>
        Сообщите, кого и на какой объект ждёте. Заявку сразу видит ресепшн — комнату подберут при заезде.
      </div>
      <button className="btn" onClick={onAdd}>+ Новая заявка</button>

      {rows.length ? (
        <div style={{ marginTop: 10 }}>
          {rows.map((b) => (
            <div key={b.id} className="list-item" style={{ alignItems: 'flex-start' }}>
              <div className="avatar">{b.people > 1 ? b.people : '👤'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{b.fio || `${b.people} чел.`}</div>
                {/* Категория прямо под именем: одно касание — и заявка попадает в счёт */}
                <BookingType b={b} onSaved={onReload} />
                <div className="small">
                  {fmt(b.date)}
                  {b.destination ? ` · ${b.destination}` : ''}
                  {b.date < today && <span style={{ color: 'var(--warnd)' }}> · дата прошла</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : <div className="small" style={{ marginTop: 8 }}>Активных заявок нет.</div>}
    </div>
  );
}

/* Переключатель категории у заявки: ИТР или в/а (вахта). Без него заявка
   не попадает в колонки «количество гостей по заявке». */
function BookingType({ b, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const cur = stayTypeLabel(b.stayType);
  async function set(t) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api('setBookingType', { id: b.id, stayType: t });
      if (!r.ok) return alert(r.error || 'Ошибка');
      setOpen(false);
      await onSaved?.();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  // Выбрано — показываем метку. Не выбрано — сразу видно, как заявка пойдёт в отчёт.
  if (!open) {
    return (
      <div className="small" style={{ margin: '3px 0' }}>
        {cur
          ? <span className={'chip ' + (cur === 'ИТР' ? 'i' : 'a')}>{cur === 'ИТР' ? 'ИТР' : 'в/а'}</span>
          : <span className="chip m">в/а · по умолчанию</span>}
        {' '}<button className="link" onClick={() => setOpen(true)}>изменить</button>
      </div>
    );
  }
  return (
    <div style={{ margin: '3px 0' }}>
      <div className="seg seg-sm">
        <button className={cur === 'ИТР' ? 'on' : ''} disabled={busy} onClick={() => set('ИТР')}>ИТР</button>
        <button className={cur === 'Вахтовый' ? 'on' : ''} disabled={busy} onClick={() => set('Вахтовый')}>в/а</button>
      </div>
      <button className="link" onClick={() => setOpen(false)}>отмена</button>
    </div>
  );
}

function RequestForm({ onClose, onSaved }) {
  const [fio, setFio] = useState('');
  const [dest, setDest] = useState('');
  const [date, setDate] = useState(todayStr());
  const [stayType, setStayType] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!fio.trim()) return alert('Укажите ФИО');
    if (!stayType) return alert('Выберите категорию проживания: ИТР или Вахтовый');
    setBusy(true);
    try {
      const r = await api('addBooking', {
        date, people: 1, fio: fio.trim(), destination: dest.trim(), source: 'report',
        stayType,
      });
      if (!r.ok) return alert(r.error || 'Ошибка');
      onSaved();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <h2>Заявка на проживание</h2>
      <div className="small">Информация для ресепшна. Комнату подберут при заезде.</div>

      <label>ФИО</label>
      <input value={fio} onChange={(e) => setFio(e.target.value)} placeholder="кого ждём" />

      <label>Категория проживания</label>
      <div className="seg">
        {STAY_TYPES.map((t) => (
          <button key={t} className={stayType === t ? 'on' : ''} onClick={() => setStayType(t)}>{t}</button>
        ))}
      </div>
      <div className="seghint">
        С этого начинается учёт: в отчёте ИТР и вахта идут отдельными списками.
      </div>

      <label>Куда (объект / цех)</label>
      <input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="например: ремонтный цех" />

      <label>Дата заезда</label>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <div className="small" style={{ marginTop: 6 }}>
        По умолчанию сегодня — дату можно изменить.
      </div>

      <button className="btn" disabled={busy} onClick={submit}>✓ Отправить заявку</button>
      <button className="btn sec" onClick={onClose}>Отмена</button>
      <Busy show={busy} />
    </>
  );
}
