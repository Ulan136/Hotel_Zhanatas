'use client';
import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, getSess, setSess, clearSess, getLastLogin, forgetMe, REPORT_SESS_KEY as SK } from '@/lib/client';
import { TopBar, Busy, Modal } from '@/components/kit';
import { useLive, liveLabel } from '@/lib/live';
import { fmt, fmtDateTime, timeHM, nightsNow, todayStr, groupByBlock, blockOf, formatPhone } from '@/lib/ui';
import { fuzzyScore } from '@/lib/fuzzy';
import { downloadXlsx } from '@/lib/xlsx';
import { downloadPdf } from '@/lib/pdf';

const onlyDigits = (v) => String(v || '').replace(/\D/g, '');

const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
function weekday(d) {
  const p = String(d || '').slice(0, 10).split('-').map(Number);
  if (p.length !== 3 || !p[0]) return '';
  return WD[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()];
}

function statusText(s) {
  return s === 'closed' ? 'выехал' : s === 'booked' ? 'бронь' : 'проживает';
}

/* ================= Аналитика за период =================
   Заказчику важно видеть не только «кто сейчас живёт», но и как шла
   загрузка за выбранные дни: сколько человек было в гостинице каждый
   день, когда был пик, сколько заездов и выездов. */
const DAYMS = 86400000;
const dstr = (d) => {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
};
const dshort = (s) => { const [, m, d] = String(s).split('-'); return d && m ? `${d}.${m}` : ''; };

/* По каждому дню периода: сколько человек проживало, сколько заехало и выехало.
   Длинный период сворачиваем в недели, иначе столбики становятся нечитаемыми. */
function buildSeries(rows, from, to) {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return { pts: [], weekly: false };
  const n = Math.min(Math.round((b - a) / DAYMS) + 1, 370);
  const raw = [];
  for (let i = 0; i < n; i++) {
    const key = dstr(new Date(a + i * DAYMS));
    let live = 0, inn = 0, out = 0;
    for (const s of rows) {
      const arr = String(s.arrival || '').slice(0, 10);
      if (!arr) continue;
      const dep = String(s.departure || '').slice(0, 10);
      if (arr === key) inn++;
      if (dep === key) out++;
      if (arr <= key && (!dep || dep >= key)) live++;
    }
    raw.push({ key, key2: key, live, inn, out });
  }
  if (raw.length <= 62) return { pts: raw, weekly: false };
  const pts = [];
  for (let i = 0; i < raw.length; i += 7) {
    const c = raw.slice(i, i + 7);
    pts.push({
      key: c[0].key, key2: c[c.length - 1].key,
      live: Math.round(c.reduce((s, x) => s + x.live, 0) / c.length),
      inn: c.reduce((s, x) => s + x.inn, 0),
      out: c.reduce((s, x) => s + x.out, 0),
    });
  }
  return { pts, weekly: true };
}

function Analytics({ rows, from, to, roomsTotal }) {
  const [pick, setPick] = useState(null);
  const { pts, weekly } = buildSeries(rows, from, to);
  if (!pts.length) return null;

  const peak = pts.reduce((m, p) => (p.live > m.live ? p : m), pts[0]);
  const max = Math.max(peak.live, 1);
  const avg = pts.reduce((s, p) => s + p.live, 0) / pts.length;
  const totalIn = pts.reduce((s, p) => s + p.inn, 0);
  const totalOut = pts.reduce((s, p) => s + p.out, 0);
  const cur = pick != null ? pts[pick] : null;
  const H = 132; // высота поля столбиков

  return (
    <div className="card">
      <div style={{ fontWeight: 700 }}>Загрузка за период</div>
      <div className="small" style={{ marginTop: 2 }}>
        {weekly ? 'Столбик — неделя, высота — среднее число людей в гостинице.'
          : 'Столбик — день, высота — сколько человек было в гостинице.'}
      </div>

      <div className="kpi3" style={{ marginTop: 10 }}>
        <div className="tile" style={{ background: 'var(--eef)' }}>
          <div className="v" style={{ fontSize: 20, color: 'var(--primd)' }}>{totalIn}</div>
          <div className="l" style={{ color: 'var(--primd)' }}>заездов</div>
        </div>
        <div className="tile" style={{ background: 'var(--panel)' }}>
          <div className="v" style={{ fontSize: 20 }}>{totalOut}</div>
          <div className="l" style={{ color: 'var(--muted)' }}>выездов</div>
        </div>
        <div className="tile" style={{ background: 'var(--panel)' }}>
          <div className="v" style={{ fontSize: 20 }}>{peak.live}</div>
          <div className="l" style={{ color: 'var(--muted)' }}>пик · {dshort(peak.key)}</div>
        </div>
      </div>

      {/* Строка подробностей: пока не трогают график — общий итог */}
      <div className="small" style={{ margin: '12px 0 6px', minHeight: 18, color: 'var(--ink)' }}>
        {cur
          ? <><b>{weekly ? `${dshort(cur.key)}–${dshort(cur.key2)}` : dshort(cur.key)}</b>
              {' · '}{cur.live} чел. в гостинице · заехали {cur.inn} · выехали {cur.out}</>
          : <>В среднем <b>{avg.toFixed(1).replace('.0', '')}</b> чел. в день из {roomsTotal} комнат</>}
      </div>

      {/* Столбики. Тонкая линия — среднее по периоду. */}
      {pts.length >= 3 && (<>
      <div
        style={{ position: 'relative', height: H, display: 'flex', alignItems: 'flex-end', gap: 2 }}
        onMouseLeave={() => setPick(null)}
      >
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: (avg / max) * (H - 18),
          borderTop: '1px solid var(--line)', pointerEvents: 'none', zIndex: 0,
        }} />
        {pts.map((p, i) => (
          <div
            key={p.key}
            onMouseEnter={() => setPick(i)}
            onClick={() => setPick(pick === i ? null : i)}
            style={{
              flex: 1, minWidth: 0, height: '100%', display: 'flex',
              alignItems: 'flex-end', justifyContent: 'center', cursor: 'pointer',
              position: 'relative', zIndex: 1,
            }}
          >
            <div
              title={`${dshort(p.key)} — ${p.live}`}
              style={{
                width: '100%', maxWidth: 24,
                height: Math.max((p.live / max) * (H - 18), p.live ? 3 : 1),
                borderRadius: '4px 4px 0 0',
                background: p.live ? 'var(--primary)' : 'var(--line)',
                opacity: pick == null || pick === i ? 1 : 0.45,
              }}
            />
          </div>
        ))}
      </div>

      <div className="small" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span>{dshort(pts[0].key)}</span>
        <span>среднее {avg.toFixed(1).replace('.0', '')}</span>
        <span>{dshort(pts[pts.length - 1].key2)}</span>
      </div>
      </>)}
    </div>
  );
}

/* Разрез: по компаниям и по объектам — куда людей направили.
   Форма подстраивается под данные: одна компания — просто строка,
   всё по одному — список, а если есть перевес — полоски. */
function Breakdown({ list }) {
  const groups = (field) => {
    const m = new Map();
    for (const s of list) {
      const v = String(s[field] || '').trim();
      if (!v) continue;
      m.set(v, (m.get(v) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  const parts = [
    { title: 'Компании', items: groups('company') },
    { title: 'Объекты', items: groups('destination') },
  ].filter((p) => p.items.length);
  if (!parts.length) return null;

  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 2 }}>Кого и куда направили</div>
      <div className="small">Считаем заезды за выбранные даты.</div>
      {parts.map((p) => {
        const total = p.items.reduce((a, x) => a + x[1], 0);
        const max = p.items[0][1];
        return (
          <div key={p.title} style={{ marginTop: 12 }}>
            <div className="small" style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
              {p.title} · {p.items.length}
            </div>

            {p.items.length === 1 ? (
              /* Одна группа — полоска ничего не сравнивает, пишем словами. */
              <div style={{ fontSize: 13.5 }}>Все {total} — <b>{p.items[0][0]}</b></div>
            ) : max === 1 ? (
              /* Все по одному — сравнивать нечего, показываем список. */
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {p.items.map(([name]) => (
                  <span key={name} className="rchip" style={{ background: 'var(--panel)', fontWeight: 600 }}>{name}</span>
                ))}
              </div>
            ) : (
              <>
                {p.items.slice(0, 8).map(([name, n]) => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '5px 0' }}>
                    <div style={{ flex: '0 0 38%', fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ height: 10, width: `${(n / max) * 100}%`, minWidth: 4, borderRadius: '0 4px 4px 0', background: 'var(--primary)' }} />
                    </div>
                    <div style={{ flex: '0 0 26px', textAlign: 'right', fontSize: 12.5, fontWeight: 700 }}>{n}</div>
                  </div>
                ))}
                {p.items.length > 8 && (
                  <div className="small" style={{ marginTop: 4 }}>
                    и ещё {p.items.length - 8} — по одному-два человека
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
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
  const [booked, setBooked] = useState(0);
  const [bookings, setBookings] = useState([]);
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
      const [d, cfg] = await Promise.all([api('report'), api('settings').catch(() => null)]);
      setRows(Array.isArray(d?.rows) ? d.rows : []);
      setRooms(Array.isArray(d?.rooms) ? d.rooms : []);
      setShowRooms(cfg?.report_show_rooms === '1');
      setBooked(Number(d?.booked) || 0);
      setBookings(Array.isArray(d?.bookings) ? d.bookings : []);
    } catch { setRows([]); setRooms([]); setBookings([]); } finally { setBusy(false); }
  }

  // Отчёт тоже освежается сам, пока вкладка открыта.
  const { checkedAt } = useLive(render, { enabled: authed && !req });

  /* ---------- текущая занятость (на сейчас) ---------- */
  const active = rows.filter((s) => s.status !== 'closed');
  const busyRooms = new Map(active.map((s) => [s.room, s]));
  const freeRooms = rooms.filter((n) => !busyRooms.has(n));

  /* ---------- период = журнал регистраций ----------
     Список идёт по дате заезда, от ранней к поздней: меняешь даты — меняется
     список, как в бумажном журнале регистраций. */
  const day = (v) => String(v || '').slice(0, 10);
  let list = rows.filter((s) => {
    const a = day(s.arrival);
    return (!from || a >= from) && (!to || a <= to);
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

  const period = from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;

  function setToday() { setFrom(todayStr()); setTo(todayStr()); }
  // «Всё время» — от самой ранней записи в базе до сегодня.
  const firstDay = rows.reduce((m, s2) => {
    const a = String(s2.arrival || '').slice(0, 10);
    return a && (!m || a < m) ? a : m;
  }, '');
  function setAll() { setFrom(firstDay || todayStr()); setTo(todayStr()); }
  function setDays(n) {
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
    return { rows: [['MEDINA'], head, ...body], head };
  }

  function exportExcel() {
    const { rows } = buildReportRows();
    downloadXlsx(`MEDINA_${from}_${to}.xlsx`, rows, { sheetName: 'Отчёт', boldRows: [0, 1] });
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
    downloadPdf(`MEDINA_${from}_${to}.pdf`, {
      title: `MEDINA · ${period}`,
      subtitle: `Отчёт о проживании · записей: ${body.length} · свободно комнат: ${freeRooms.length} · занято: ${busyRooms.size}`,
      columns: head.map((t, i) => ({ title: t, width: widths[i], align: i >= 4 ? 'right' : 'left' })),
      rows: body,
      footer: `MEDINA · сформировано ${fmtDateTime(new Date().toISOString())}`,
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
          <div className="small">🟢 {liveLabel(checkedAt)}. Только просмотр.</div>

          <div className="chips-row">
            <button className={'chipbtn' + (from === todayStr() && to === todayStr() ? ' on' : '')} onClick={setToday}>Сегодня</button>
            <button className="chipbtn" onClick={() => setDays(7)}>7 дней</button>
            <button className="chipbtn" onClick={() => setDays(30)}>30 дней</button>
            <button className={'chipbtn' + (firstDay && from === firstDay && to === todayStr() ? ' on' : '')} onClick={setAll}>Всё время</button>
          </div>

          <div className="two">
            <div><label>Период с</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><label>по</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>

          <div className="small" style={{ marginTop: 6 }}>
            Список идёт по датам заезда, от ранних к поздним — как журнал регистраций.
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
          <div style={{ fontWeight: 700, marginBottom: 8 }}>MEDINA · {period}</div>
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

        {/* --- Аналитика: загрузка и разрезы за период --- */}
        <Analytics rows={rows} from={from} to={to} roomsTotal={rooms.length} />
        <Breakdown list={list} />

        {/* --- Заявки на проживание от заказчика --- */}
        <Requests list={bookings} onAdd={() => setReq(true)} />

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
function Requests({ list, onAdd }) {
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
            <div key={b.id} className="list-item">
              <div className="avatar">{b.people > 1 ? b.people : '👤'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{b.fio || `${b.people} чел.`}</div>
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

function RequestForm({ onClose, onSaved }) {
  const [fio, setFio] = useState('');
  const [dest, setDest] = useState('');
  const [date, setDate] = useState(todayStr());
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!fio.trim()) return alert('Укажите ФИО');
    setBusy(true);
    try {
      const r = await api('addBooking', {
        date, people: 1, fio: fio.trim(), destination: dest.trim(), source: 'report',
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
