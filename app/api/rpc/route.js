import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql } from '@/lib/db';
import { AUTH_COOKIE, signToken, verifyToken, atLeast } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Примечание: DATE-колонки приводим к ::text (иначе pg сдвигает на полночь по TZ).
// timestamptz Neon отдаёт как JS Date → при JSON-сериализации выходит ISO-UTC,
// который new Date() на клиенте парсит однозначно.

function ok(data) { return NextResponse.json(data ?? { ok: true }); }
function fail(error, status = 200) { return NextResponse.json({ ok: false, error }, { status }); }

/* Кому что можно. Всё, чего нет в списке, требует прав администратора —
   так новое действие по умолчанию закрыто, а не открыто всему интернету.
     public    — без входа: QR-страницы гостя и охраны, вход/выход
     factory   — заказчик и выше
     reception — ресепшн и админ
     admin     — только администратор */
const NEED = {
  // без входа
  hasAdmin: 'public', login: 'public', logout: 'public', me: 'public', register: 'public',
  publicGuests: 'public', publicStays: 'public', publicBookings: 'public', freeRooms: 'public',
  addGuest: 'public', updateGuest: 'public', checkin: 'public', checkout: 'public',
  guards: 'public', guardStatus: 'public', guardIn: 'public', guardOut: 'public', addShift: 'public',

  // заказчик
  report: 'factory', settings: 'factory', pulse: 'factory',
  bookings: 'factory', addBooking: 'factory',

  // ресепшн
  bootstrap: 'reception', guests: 'reception', stays: 'reception', deleteGuest: 'reception',
  staff: 'reception', addStaff: 'reception', updateStaff: 'reception', deleteStaff: 'reception',
  categories: 'reception', addCategory: 'reception', updateCategory: 'reception', deleteCategory: 'reception',
  addFinance: 'reception', payments: 'reception', addPayment: 'reception', deletePayment: 'reception',
  shifts: 'reception', setShiftType: 'reception', deleteShift: 'reception',
  moveStay: 'reception', updateStay: 'reception',
  updateBooking: 'reception', deleteBooking: 'reception',

  // администратор
  users: 'admin', addUser: 'admin', updateUser: 'admin', deleteUser: 'admin', setSetting: 'admin',
};

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return fail('Некорректный запрос'); }
  const { action } = body || {};
  // Кто спрашивает — берём из подписанной куки, а не из слов клиента.
  const me = verifyToken(req.cookies.get(AUTH_COOKIE)?.value);
  try {
    const h = handlers[action];
    if (!h) return fail('Неизвестное действие: ' + action, 400);
    const need = NEED[action] || 'admin';
    if (!atLeast(me, need)) {
      return fail(me ? 'Недостаточно прав для этого действия' : 'Нужно войти', me ? 403 : 401);
    }
    return await h(body, me);
  } catch (e) {
    // Нарушение уникального индекса «одна активная бронь на комнату» и т.п.
    if (e && e.code === '23505') {
      return fail('Конфликт: комната уже занята или запись уже существует.');
    }
    console.error('[rpc]', action, e);
    return fail(e?.message || 'Ошибка сервера');
  }
}

const handlers = {
  /* ---------- Аутентификация ---------- */
  async hasAdmin() {
    const r = await sql`SELECT count(*)::int AS n FROM users WHERE role = 'admin'`;
    return ok({ hasAdmin: r[0].n > 0 });
  },
  async register({ name, login, pass, role }, me) {
    if (!name || !login || !pass) return fail('Заполните все поля');
    const allowed = ['admin', 'reception', 'factory'];
    const r = allowed.includes(role) ? role : 'reception';
    /* Пока в базе нет ни одного администратора — это первичная настройка,
       её может пройти кто угодно. Как только админ есть, добавлять людей
       может только он: иначе любой посторонний создал бы себе доступ. */
    if (!me || me.role !== 'admin') {
      const a = await sql`SELECT count(*)::int AS n FROM users WHERE role = 'admin'`;
      if (a[0].n > 0) return fail('Добавлять пользователей может только администратор', 403);
    }
    const hash = bcrypt.hashSync(String(pass), 10);
    try {
      await sql`INSERT INTO users (name, login, pass_hash, role) VALUES (${name}, ${login}, ${hash}, ${r})`;
    } catch (e) {
      if (e.code === '23505') return fail('Логин уже занят');
      throw e;
    }
    return ok({ ok: true });
  },
  async login({ login, pass, remember = true }) {
    const rows = await sql`SELECT name, login, pass_hash, role FROM users WHERE login = ${login}`;
    const u = rows[0];
    if (!u || !bcrypt.compareSync(String(pass || ''), u.pass_hash)) return fail('Неверный логин или пароль');
    const res = ok({ ok: true, user: { name: u.name, login: u.login, role: u.role } });
    /* httpOnly — куку не прочитает скрипт на странице; secure — только по HTTPS;
       sameSite lax — её не пришлёт чужой сайт от вашего имени. */
    res.cookies.set(AUTH_COOKIE, signToken({ login: u.login, role: u.role, name: u.name }), {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/',
      ...(remember ? { maxAge: 30 * 24 * 3600 } : {}),
    });
    return res;
  },
  async logout() {
    const res = ok({ ok: true });
    res.cookies.set(AUTH_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
    return res;
  },
  async me(_body, me) { return ok({ ok: true, user: me || null }); },

  /* ---------- Пользователи ---------- */
  async users() {
    const rows = await sql`SELECT name, login, role FROM users ORDER BY name`;
    return ok(rows);
  },
  async addUser({ name, login, pass, role }) {
    return handlers.register({ name, login, pass, role });
  },
  async updateUser({ login, name, role, pass }) {
    if (!login) return fail('Нет логина');
    const allowed = ['admin', 'reception', 'factory'];
    const r = allowed.includes(role) ? role : 'reception';
    if (pass) {
      const hash = bcrypt.hashSync(String(pass), 10);
      await sql`UPDATE users SET name = ${name}, role = ${r}, pass_hash = ${hash} WHERE login = ${login}`;
    } else {
      await sql`UPDATE users SET name = ${name}, role = ${r} WHERE login = ${login}`;
    }
    return ok({ ok: true });
  },
  async deleteUser({ login }) {
    await sql`DELETE FROM users WHERE login = ${login}`;
    return ok({ ok: true });
  },

  /* ---------- Общий срез (bootstrap) ---------- */
  async bootstrap() {
    const [guests, staff, categories, finance, shifts, stays, roomRows, payments, settingRows, bookings] = await Promise.all([
      sql`SELECT id, fio, iin, doc_no AS "docNo", birth_year AS "birthYear", company, position, destination, citizenship, phone FROM guests ORDER BY fio`,
      sql`SELECT id, fio, role, phone FROM staff ORDER BY fio`,
      sql`SELECT id, name, ctype AS type, parent_id AS parent FROM categories ORDER BY id`,
      sql`SELECT id, ftype AS type, category, subcategory, amount::float8 AS amount, fdate::text AS date, note FROM finance ORDER BY id`,
      sql`SELECT id, fio, role, sdate::text AS date, shift, hours::float8 AS hours,
                 check_in AS "checkIn", check_out AS "checkOut", confirmed
          FROM shifts ORDER BY sdate DESC, id DESC`,
      sql`SELECT id, guest_id AS "guestId", fio, room, arrival::text AS arrival, departure::text AS departure, arrived_at AS "arrivedAt", departed_at AS "departedAt", status, source FROM stays ORDER BY arrival DESC, id DESC`,
      sql`SELECT room FROM rooms ORDER BY room`,
      sql`SELECT id, fio, amount::float8 AS amount, pdate::text AS date, note
          FROM payments ORDER BY pdate DESC, id DESC`,
      sql`SELECT skey, svalue FROM settings`,
      sql`SELECT id, bdate::text AS date, people, company, note, status,
                 fio, destination, source
          FROM bookings ORDER BY bdate DESC, id DESC`,
    ]);

    const settings = {};
    for (const r of settingRows) settings[r.skey] = r.svalue;

    const active = {};
    for (const s of stays) if (s.status !== 'closed') active[s.room] = s;
    const rooms = roomRows.map((r) => {
      const st = active[r.room];
      const status = !st ? 'free' : (st.status === 'booked' ? 'book' : 'occ');
      return { room: r.room, status, stay: st || null };
    });
    const guards = staff.filter((s) => s.role === 'Охрана').map((s) => s.fio);

    return ok({ rooms, guests, staff, categories, finance, shifts, stays, guards, payments, settings, bookings });
  },

  /* ---------- Гости ---------- */
  async guests() {
    const rows = await sql`SELECT id, fio, iin, doc_no AS "docNo", birth_year AS "birthYear", company, position, destination, citizenship, phone FROM guests ORDER BY fio`;
    return ok(rows);
  },
  /* Страница гостя открывается по QR без пароля, поэтому ей отдаём
     только то, без чего она не работает: имя, компанию, гражданство и
     признак «ИИН уже заполнен». Ни ИИН, ни паспорта, ни телефонов. */
  async publicGuests() {
    const rows = await sql`SELECT id, fio, company, position, destination, citizenship,
                                  (COALESCE(iin, '') <> '') AS "hasIin"
                             FROM guests ORDER BY fio`;
    return ok(rows);
  },
  /* Кого ждут по заявкам заказчика. Открыто без пароля — этот список
     видит гость на своём телефоне, поэтому только имя, компания и объект. */
  async publicBookings() {
    const rows = await sql`SELECT id, fio, company, destination, bdate::text AS date
                             FROM bookings
                            WHERE status = 'new' AND COALESCE(fio, '') <> ''
                            ORDER BY bdate, id`;
    return ok(rows);
  },
  async publicStays() {
    const rows = await sql`SELECT id, guest_id AS "guestId", fio, room, arrival::text AS arrival,
                                  arrived_at AS "arrivedAt", status
                             FROM stays WHERE status <> 'closed' ORDER BY room`;
    return ok(rows);
  },
  async addGuest({ fio, iin, docNo, birthYear, company, position, destination, citizenship, phone }) {
    if (!fio) return fail('Укажите ФИО');
    if (!iin) return fail('Укажите ИИН');
    const rows = await sql`INSERT INTO guests
        (fio, iin, doc_no, birth_year, company, position, destination, citizenship, phone)
      VALUES (${fio}, ${iin || ''}, ${docNo || ''}, ${String(birthYear || '')}, ${company || ''},
              ${position || ''}, ${destination || ''}, ${citizenship || ''}, ${phone || ''})
      RETURNING id`;
    return ok({ ok: true, id: rows[0].id });
  },
  /* Пустое поле означает «не меняем»: страница гостя больше не получает
     ИИН и телефон, и без этого правила они бы затирались при дозаполнении. */
  async updateGuest({ id, fio, iin, docNo, birthYear, company, position, destination, citizenship, phone }) {
    if (!fio) return fail('Укажите ФИО');
    const keep = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v));
    await sql`UPDATE guests SET
        fio         = ${fio},
        iin         = COALESCE(${keep(iin)}, iin),
        doc_no      = COALESCE(${keep(docNo)}, doc_no),
        birth_year  = COALESCE(${keep(birthYear)}, birth_year),
        company     = COALESCE(${keep(company)}, company),
        position    = COALESCE(${keep(position)}, position),
        destination = COALESCE(${keep(destination)}, destination),
        citizenship = COALESCE(${keep(citizenship)}, citizenship),
        phone       = COALESCE(${keep(phone)}, phone)
      WHERE id = ${Number(id)}`;
    return ok({ ok: true });
  },
  async deleteGuest({ id }) {
    const act = await sql`SELECT room FROM stays WHERE guest_id = ${Number(id)} AND status <> 'closed' LIMIT 1`;
    if (act.length) return fail('Нельзя удалить: гость сейчас заселён (комната №' + act[0].room + '). Сначала отметьте выбытие.');
    await sql`DELETE FROM guests WHERE id = ${Number(id)}`;
    return ok({ ok: true });
  },

  /* ---------- Персонал ---------- */
  async staff() {
    const rows = await sql`SELECT id, fio, role, phone FROM staff ORDER BY fio`;
    return ok(rows);
  },
  async addStaff({ fio, role, phone }) {
    if (!fio) return fail('Укажите ФИО');
    const rows = await sql`INSERT INTO staff (fio, role, phone) VALUES (${fio}, ${role || ''}, ${phone || ''}) RETURNING id`;
    return ok({ ok: true, id: rows[0].id });
  },
  async updateStaff({ id, fio, role, phone }) {
    await sql`UPDATE staff SET fio = ${fio}, role = ${role || ''}, phone = ${phone || ''} WHERE id = ${Number(id)}`;
    return ok({ ok: true });
  },
  async deleteStaff({ id }) {
    await sql`DELETE FROM staff WHERE id = ${Number(id)}`;
    return ok({ ok: true });
  },

  /* ---------- Категории ---------- */
  async categories() {
    const rows = await sql`SELECT id, name, ctype AS type, parent_id AS parent FROM categories ORDER BY id`;
    return ok(rows);
  },
  async addCategory({ title, name, ctype, parent }) {
    const nm = title || name;
    if (!nm) return fail('Укажите название');
    const t = ctype === 'income' ? 'income' : 'expense';
    const p = parent ? Number(parent) : null;
    await sql`INSERT INTO categories (name, ctype, parent_id) VALUES (${nm}, ${t}, ${p})`;
    return ok({ ok: true });
  },
  async updateCategory({ id, title, name, ctype }) {
    const nm = title || name;
    const t = ctype === 'income' ? 'income' : 'expense';
    await sql`UPDATE categories SET name = ${nm}, ctype = ${t} WHERE id = ${Number(id)}`;
    return ok({ ok: true });
  },
  async deleteCategory({ id }) {
    await sql`DELETE FROM categories WHERE id = ${Number(id)}`;
    return ok({ ok: true });
  },

  /* ---------- Финансы ---------- */
  async addFinance({ type, category, subcategory, amount, date, note }) {
    const t = type === 'income' ? 'income' : 'expense';
    const a = Math.abs(parseFloat(amount) || 0);
    if (!a) return fail('Укажите сумму');
    await sql`INSERT INTO finance (ftype, category, subcategory, amount, fdate, note)
              VALUES (${t}, ${category || ''}, ${subcategory || ''}, ${a}, ${date}, ${note || ''})`;
    return ok({ ok: true });
  },

  /* ---------- Комнаты / заселения ---------- */
  async stays() {
    const rows = await sql`SELECT id, guest_id AS "guestId", fio, room, arrival::text AS arrival, departure::text AS departure, arrived_at AS "arrivedAt", departed_at AS "departedAt", status, source FROM stays ORDER BY arrival DESC, id DESC`;
    return ok(rows);
  },
  async freeRooms() {
    const rows = await sql`SELECT room FROM rooms WHERE room NOT IN (SELECT room FROM stays WHERE status <> 'closed') ORDER BY room`;
    return ok(rows.map((r) => r.room));
  },
  // Дата выбытия при заселении НЕ указывается — она проставляется при выселении (checkout).
  async checkin({ guestId, fio, room, arrival, arrivedAt, source, bookingId }) {
    if (!arrival) return fail('Укажите дату прибытия');
    const rn = Number(room);
    const busy = await sql`SELECT 1 FROM stays WHERE room = ${rn} AND status <> 'closed' LIMIT 1`;
    if (busy.length) return fail('Комната уже занята — выберите другую.');
    try {
      await sql`INSERT INTO stays (guest_id, fio, room, arrival, departure, arrived_at, status, source)
                VALUES (${guestId ? Number(guestId) : null}, ${fio}, ${rn}, ${arrival}, NULL,
                        ${arrivedAt || null}, 'on_shift', ${source || ''})`;
    } catch (e) {
      if (e.code === '23505') return fail('Комнату только что заняли — выберите другую.');
      throw e;
    }
    // Пришёл по заявке — снимаем её из ожидания, чтобы ресепшн не ждал дважды.
    if (bookingId) {
      await sql`UPDATE bookings SET status = 'done' WHERE id = ${Number(bookingId)} AND status = 'new'`;
    }
    return ok({ ok: true });
  },
  /* Перевод в другую комнату. Уникальный индекс не даст занять комнату,
     где уже кто-то живёт, — на всякий случай проверяем и сами. */
  async moveStay({ id, room }) {
    const n = Number(room);
    if (!n) return fail('Укажите комнату');
    const cur = await sql`SELECT room, status FROM stays WHERE id = ${Number(id)}`;
    if (!cur.length) return fail('Заселение не найдено');
    if (cur[0].status === 'closed') return fail('Проживание уже закрыто');
    if (Number(cur[0].room) === n) return fail('Это та же самая комната');

    const exists = await sql`SELECT 1 FROM rooms WHERE room = ${n}`;
    if (!exists.length) return fail('Такой комнаты нет');

    const busy = await sql`SELECT fio FROM stays WHERE room = ${n} AND status <> 'closed' LIMIT 1`;
    if (busy.length) return fail('Комната №' + n + ' занята: ' + busy[0].fio);

    await sql`UPDATE stays SET room = ${n} WHERE id = ${Number(id)}`;
    return ok({ ok: true });
  },

  /* Правка даты заезда. Нужна ресепшну: в спешке дату иногда вбивают
     неверно (например 19.09 вместо 19.08), и это ломает счёт суток. */
  async updateStay({ id, arrival, arrivedAt }) {
    if (!arrival) return fail('Укажите дату прибытия');
    const rows = await sql`SELECT departure::text AS departure, status FROM stays WHERE id = ${Number(id)}`;
    if (!rows.length) return fail('Заселение не найдено');
    const dep = rows[0].departure;
    if (dep && arrival > dep) return fail('Дата прибытия позже даты выбытия (' + dep + ')');
    await sql`UPDATE stays SET arrival = ${arrival}, arrived_at = ${arrivedAt || null}
              WHERE id = ${Number(id)}`;
    return ok({ ok: true });
  },

  // Дата выбытия приходит со страницы гостя (по умолчанию сегодня, но её можно изменить).
  async checkout({ id, departure, departedAt }) {
    const rows = await sql`SELECT arrival::text AS arrival FROM stays WHERE id = ${Number(id)}`;
    if (!rows.length) return fail('Заселение не найдено');
    if (departure) {
      if (departure < rows[0].arrival) return fail('Дата выбытия раньше даты прибытия');
      await sql`UPDATE stays SET status = 'closed', departure = ${departure},
                                 departed_at = ${departedAt || null} WHERE id = ${Number(id)}`;
    } else {
      await sql`UPDATE stays SET status = 'closed', departure = COALESCE(departure, CURRENT_DATE),
                                 departed_at = COALESCE(${departedAt || null}, now()) WHERE id = ${Number(id)}`;
    }
    return ok({ ok: true });
  },

  /* ---------- Настройки системы ---------- */
  async settings() {
    const rows = await sql`SELECT skey, svalue FROM settings`;
    const out = {};
    for (const r of rows) out[r.skey] = r.svalue;
    // Значения по умолчанию, если строки ещё нет.
    if (out.report_show_rooms === undefined) out.report_show_rooms = '0';
    return ok(out);
  },
  async setSetting({ key, value }) {
    if (!key) return fail('Не указан параметр');
    await sql`INSERT INTO settings (skey, svalue) VALUES (${key}, ${String(value ?? '')})
              ON CONFLICT (skey) DO UPDATE SET svalue = EXCLUDED.svalue`;
    return ok({ ok: true });
  },

  /* ---------- Отчёт заказчика ---------- */
  // Проживания вместе с данными гостя (ИИН, телефон) и списком комнат — для поиска и занятости.
  async report() {
    const [rows, roomRows, bookings] = await Promise.all([
      sql`SELECT s.id, s.fio, s.room, s.arrival::text AS arrival, s.departure::text AS departure,
                 s.arrived_at AS "arrivedAt", s.departed_at AS "departedAt",
                 s.status, s.source,
                 COALESCE(g.iin, '')         AS iin,
                 COALESCE(g.doc_no, '')      AS "docNo",
                 COALESCE(g.birth_year, '')  AS "birthYear",
                 COALESCE(g.company, '')     AS company,
                 COALESCE(g.position, '')    AS position,
                 COALESCE(g.destination, '') AS destination,
                 COALESCE(g.citizenship, '') AS citizenship,
                 COALESCE(g.phone, '')       AS phone
            FROM stays s
            LEFT JOIN guests g ON g.id = s.guest_id
           -- Хронологически: кто заехал раньше — выше, новые записи внизу.
           ORDER BY s.arrival ASC, s.id ASC`,
      sql`SELECT room FROM rooms ORDER BY room`,
      sql`SELECT id, bdate::text AS date, people, company, note, status,
                   fio, destination, source
            FROM bookings WHERE status = 'new' ORDER BY bdate`,
    ]);
    const booked = bookings.reduce((a, b) => a + (+b.people || 0), 0);
    return ok({ rows, rooms: roomRows.map((r) => r.room), bookings, booked });
  },

  /* ---------- Пульс ----------
     Дешёвая «подпись» состояния базы: сколько записей и какой последний id.
     Кабинет и отчёт опрашивают её раз в несколько секунд и перезагружают
     данные только когда подпись изменилась — так новый гость появляется
     у ресепшна сам, без нажатия «обновить». */
  async pulse() {
    // Кроме количества и последнего id берём величины, которые меняются
    // при правках: сколько сейчас заселено, сколько заявок открыто, суммы.
    const r = await sql`
      SELECT (SELECT count(*) FROM stays)                            AS c1,
             (SELECT COALESCE(max(id), 0) FROM stays)                AS m1,
             (SELECT count(*) FROM stays WHERE status <> 'closed')   AS a1,
             (SELECT count(*) FROM guests)                           AS c2,
             (SELECT COALESCE(max(id), 0) FROM guests)               AS m2,
             (SELECT count(*) FROM shifts)                           AS c3,
             (SELECT COALESCE(max(id), 0) FROM shifts)               AS m3,
             (SELECT COALESCE(sum(hours), 0) FROM shifts)            AS h3,
             (SELECT count(*) FROM bookings)                         AS c4,
             (SELECT COALESCE(max(id), 0) FROM bookings)             AS m4,
             (SELECT count(*) FROM bookings WHERE status = 'new')    AS a4,
             (SELECT count(*) FROM payments)                         AS c5,
             (SELECT COALESCE(sum(amount), 0) FROM payments)         AS s5,
             (SELECT count(*) FROM finance)                          AS c6,
             (SELECT COALESCE(sum(amount), 0) FROM finance)          AS s6,
             (SELECT COALESCE(max(departed_at), to_timestamp(0)) FROM stays) AS d1`;
    const x = r[0] || {};
    // Склеиваем всё в одну строку — сравнивать проще, чем объект.
    const sig = [x.c1, x.m1, x.a1, x.c2, x.m2, x.c3, x.m3, x.h3,
      x.c4, x.m4, x.a4, x.c5, x.s5, x.c6, x.s6,
      x.d1 ? new Date(x.d1).getTime() : 0].join('.');
    return ok({ sig });
  },

  /* ---------- Смены ---------- */
  async shifts() {
    const rows = await sql`SELECT id, fio, role, sdate::text AS date, shift, hours::float8 AS hours,
                                  check_in AS "checkIn", check_out AS "checkOut", confirmed
                           FROM shifts ORDER BY sdate DESC, id DESC`;
    return ok(rows);
  },
  async addShift({ name, role, date, shift, hours, checkIn, checkOut }) {
    if (!name) return fail('Укажите сотрудника');
    await sql`INSERT INTO shifts (fio, role, sdate, shift, hours, check_in, check_out, confirmed)
              VALUES (${name}, ${role || ''}, ${date}, ${shift === 'day' ? 'day' : 'night'}, ${parseFloat(hours) || 0},
                      ${checkIn || null}, ${checkOut || null}, true)`;
    return ok({ ok: true });
  },

  // Переключить вид смены у уже записанной смены (ошиблись при вводе).
  async setShiftType({ id, shift }) {
    const t = shift === 'day' ? 'day' : 'night';
    await sql`UPDATE shifts SET shift = ${t}, hours = ${t === 'day' ? 24 : 12}
              WHERE id = ${Number(id)}`;
    return ok({ ok: true });
  },
  async deleteShift({ id }) {
    await sql`DELETE FROM shifts WHERE id = ${Number(id)}`;
    return ok({ ok: true });
  },

  /* ---------- Заявки на бронь (числом человек, без привязки к комнатам) ---------- */
  async bookings() {
    const rows = await sql`SELECT id, bdate::text AS date, people, company, note, status,
                                  fio, destination, source, created_at AS "createdAt"
                           FROM bookings ORDER BY bdate DESC, id DESC`;
    return ok(rows);
  },
  async addBooking({ date, people, company, note, fio, destination, source }) {
    const n = Math.round(Number(people) || 0) || 1;
    if (!date) return fail('Укажите дату');
    if (!(n > 0)) return fail('Укажите количество человек');
    const rows = await sql`INSERT INTO bookings (bdate, people, company, note, fio, destination, source)
                           VALUES (${date}, ${n}, ${company || ''}, ${note || ''},
                                   ${fio || ''}, ${destination || ''}, ${source || 'admin'})
                           RETURNING id`;
    return ok({ ok: true, id: rows[0].id });
  },
  async updateBooking({ id, date, people, company, note, status, fio, destination }) {
    const n = Math.round(Number(people) || 0);
    if (!(n > 0)) return fail('Укажите количество человек');
    const st = status === 'closed' ? 'closed' : 'new';
    await sql`UPDATE bookings SET bdate = ${date}, people = ${n}, company = ${company || ''},
                                  note = ${note || ''}, status = ${st},
                                  fio = ${fio || ''}, destination = ${destination || ''}
              WHERE id = ${Number(id)}`;
    return ok({ ok: true });
  },
  async deleteBooking({ id }) {
    await sql`DELETE FROM bookings WHERE id = ${Number(id)}`;
    return ok({ ok: true });
  },

  /* ---------- Выплаты охране ---------- */
  async payments() {
    const rows = await sql`SELECT id, fio, amount::float8 AS amount, pdate::text AS date, note
                           FROM payments ORDER BY pdate DESC, id DESC`;
    return ok(rows);
  },
  async addPayment({ fio, amount, date, note }) {
    if (!fio) return fail('Не указан сотрудник');
    const a = Math.round((parseFloat(amount) || 0) * 100) / 100;
    if (!(a > 0)) return fail('Сумма должна быть больше нуля');
    const rows = await sql`INSERT INTO payments (fio, amount, pdate, note)
                           VALUES (${fio}, ${a}, ${date || null}, ${note || ''})
                           RETURNING id`;
    return ok({ ok: true, id: rows[0].id });
  },
  async deletePayment({ id }) {
    await sql`DELETE FROM payments WHERE id = ${Number(id)}`;
    return ok({ ok: true });
  },

  /* ---------- Охрана (QR) ---------- */
  async guards() {
    const rows = await sql`SELECT fio FROM staff WHERE role = 'Охрана' ORDER BY fio`;
    return ok(rows.map((r) => r.fio));
  },
  async guardStatus({ name }) {
    const rows = await sql`SELECT check_in AS "checkIn", check_out AS "checkOut", sdate::text AS date
                           FROM shifts WHERE fio = ${name} AND check_in IS NOT NULL AND check_out IS NULL
                           ORDER BY id DESC LIMIT 1`;
    if (rows.length) return ok({ open: true, checkIn: rows[0].checkIn, date: rows[0].date });
    return ok({ open: false });
  },
  async guardIn({ name }) {
    const open = await sql`SELECT 1 FROM shifts WHERE fio = ${name} AND check_in IS NOT NULL AND check_out IS NULL LIMIT 1`;
    if (open.length) return fail('Вы уже на смене');
    // Дату берём по Астане, вид смены — по дню недели (сб/вс — День, иначе Ночь).
    const rows = await sql`INSERT INTO shifts (fio, role, sdate, shift, check_in)
                           SELECT ${name}, 'Охрана', d,
                                  CASE WHEN EXTRACT(ISODOW FROM d) >= 6 THEN 'day' ELSE 'night' END,
                                  now()
                             FROM (SELECT (now() AT TIME ZONE 'Asia/Almaty')::date AS d) t
                           RETURNING check_in AS "checkIn"`;
    return ok({ ok: true, checkIn: rows[0].checkIn });
  },
  async guardOut({ name }) {
    const rows = await sql`SELECT id, check_in FROM shifts WHERE fio = ${name} AND check_in IS NOT NULL AND check_out IS NULL ORDER BY id DESC LIMIT 1`;
    if (!rows.length) return fail('Открытая смена не найдена');
    const upd = await sql`UPDATE shifts
                          SET check_out = now(),
                              hours = round(EXTRACT(EPOCH FROM (now() - check_in)) / 3600.0, 2),
                              confirmed = true
                          WHERE id = ${rows[0].id}
                          RETURNING check_in AS "checkIn", check_out AS "checkOut", hours::float8 AS hours`;
    return ok({ ok: true, checkIn: upd[0].checkIn, checkOut: upd[0].checkOut, hours: upd[0].hours });
  },
};
