import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Примечание: DATE-колонки приводим к ::text (иначе pg сдвигает на полночь по TZ).
// timestamptz Neon отдаёт как JS Date → при JSON-сериализации выходит ISO-UTC,
// который new Date() на клиенте парсит однозначно.

function ok(data) { return NextResponse.json(data ?? { ok: true }); }
function fail(error, status = 200) { return NextResponse.json({ ok: false, error }, { status }); }

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return fail('Некорректный запрос'); }
  const { action } = body || {};
  try {
    const h = handlers[action];
    if (!h) return fail('Неизвестное действие: ' + action, 400);
    return await h(body);
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
  async register({ name, login, pass, role }) {
    if (!name || !login || !pass) return fail('Заполните все поля');
    const allowed = ['admin', 'reception', 'factory'];
    const r = allowed.includes(role) ? role : 'reception';
    const hash = bcrypt.hashSync(String(pass), 10);
    try {
      await sql`INSERT INTO users (name, login, pass_hash, role) VALUES (${name}, ${login}, ${hash}, ${r})`;
    } catch (e) {
      if (e.code === '23505') return fail('Логин уже занят');
      throw e;
    }
    return ok({ ok: true });
  },
  async login({ login, pass }) {
    const rows = await sql`SELECT name, login, pass_hash, role FROM users WHERE login = ${login}`;
    const u = rows[0];
    if (!u || !bcrypt.compareSync(String(pass || ''), u.pass_hash)) return fail('Неверный логин или пароль');
    return ok({ ok: true, user: { name: u.name, login: u.login, role: u.role } });
  },

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
    const [guests, staff, categories, finance, shifts, stays, roomRows, payments, settingRows] = await Promise.all([
      sql`SELECT id, fio, iin, company, citizenship, phone FROM guests ORDER BY fio`,
      sql`SELECT id, fio, role, phone FROM staff ORDER BY fio`,
      sql`SELECT id, name, ctype AS type, parent_id AS parent FROM categories ORDER BY id`,
      sql`SELECT id, ftype AS type, category, subcategory, amount::float8 AS amount, fdate::text AS date, note FROM finance ORDER BY id`,
      sql`SELECT id, fio, role, sdate::text AS date, shift, hours::float8 AS hours,
                 check_in AS "checkIn", check_out AS "checkOut", confirmed
          FROM shifts ORDER BY sdate DESC, id DESC`,
      sql`SELECT id, guest_id AS "guestId", fio, room, arrival::text AS arrival, departure::text AS departure, status, source
          FROM stays ORDER BY arrival DESC, id DESC`,
      sql`SELECT room FROM rooms ORDER BY room`,
      sql`SELECT id, fio, amount::float8 AS amount, pdate::text AS date, note
          FROM payments ORDER BY pdate DESC, id DESC`,
      sql`SELECT skey, svalue FROM settings`,
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

    return ok({ rooms, guests, staff, categories, finance, shifts, stays, guards, payments, settings });
  },

  /* ---------- Гости ---------- */
  async guests() {
    const rows = await sql`SELECT id, fio, iin, company, citizenship, phone FROM guests ORDER BY fio`;
    return ok(rows);
  },
  async addGuest({ fio, iin, company, citizenship, phone }) {
    if (!fio) return fail('Укажите ФИО');
    if (!iin) return fail('Укажите ИИН');
    const rows = await sql`INSERT INTO guests (fio, iin, company, citizenship, phone)
                           VALUES (${fio}, ${iin || ''}, ${company || ''}, ${citizenship || ''}, ${phone || ''})
                           RETURNING id`;
    return ok({ ok: true, id: rows[0].id });
  },
  async updateGuest({ id, fio, iin, company, citizenship, phone }) {
    if (!fio) return fail('Укажите ФИО');
    if (!iin) return fail('Укажите ИИН');
    await sql`UPDATE guests SET fio = ${fio}, iin = ${iin || ''}, company = ${company || ''},
                                citizenship = ${citizenship || ''}, phone = ${phone || ''}
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
    const rows = await sql`SELECT id, guest_id AS "guestId", fio, room, arrival::text AS arrival, departure::text AS departure, status, source
                           FROM stays ORDER BY arrival DESC, id DESC`;
    return ok(rows);
  },
  async freeRooms() {
    const rows = await sql`SELECT room FROM rooms WHERE room NOT IN (SELECT room FROM stays WHERE status <> 'closed') ORDER BY room`;
    return ok(rows.map((r) => r.room));
  },
  // Дата выбытия при заселении НЕ указывается — она проставляется при выселении (checkout).
  async checkin({ guestId, fio, room, arrival, source }) {
    if (!arrival) return fail('Укажите дату прибытия');
    const rn = Number(room);
    const busy = await sql`SELECT 1 FROM stays WHERE room = ${rn} AND status <> 'closed' LIMIT 1`;
    if (busy.length) return fail('Комната уже занята — выберите другую.');
    try {
      await sql`INSERT INTO stays (guest_id, fio, room, arrival, departure, status, source)
                VALUES (${guestId ? Number(guestId) : null}, ${fio}, ${rn}, ${arrival}, NULL, 'on_shift', ${source || ''})`;
    } catch (e) {
      if (e.code === '23505') return fail('Комнату только что заняли — выберите другую.');
      throw e;
    }
    return ok({ ok: true });
  },
  // Дата выбытия приходит со страницы гостя (по умолчанию сегодня, но её можно изменить).
  async checkout({ id, departure }) {
    const rows = await sql`SELECT arrival::text AS arrival FROM stays WHERE id = ${Number(id)}`;
    if (!rows.length) return fail('Заселение не найдено');
    if (departure) {
      if (departure < rows[0].arrival) return fail('Дата выбытия раньше даты прибытия');
      await sql`UPDATE stays SET status = 'closed', departure = ${departure} WHERE id = ${Number(id)}`;
    } else {
      await sql`UPDATE stays SET status = 'closed', departure = COALESCE(departure, CURRENT_DATE) WHERE id = ${Number(id)}`;
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
    const [rows, roomRows] = await Promise.all([
      sql`SELECT s.id, s.fio, s.room, s.arrival::text AS arrival, s.departure::text AS departure,
                 s.status, s.source,
                 COALESCE(g.iin, '')         AS iin,
                 COALESCE(g.company, '')     AS company,
                 COALESCE(g.citizenship, '') AS citizenship,
                 COALESCE(g.phone, '')       AS phone
            FROM stays s
            LEFT JOIN guests g ON g.id = s.guest_id
           ORDER BY s.arrival DESC, s.id DESC`,
      sql`SELECT room FROM rooms ORDER BY room`,
    ]);
    return ok({ rows, rooms: roomRows.map((r) => r.room) });
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
              VALUES (${name}, ${role || ''}, ${date}, ${shift || 'custom'}, ${parseFloat(hours) || 0},
                      ${checkIn || null}, ${checkOut || null}, true)`;
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
    const rows = await sql`INSERT INTO shifts (fio, role, sdate, shift, check_in)
                           VALUES (${name}, 'Охрана', CURRENT_DATE, 'custom', now())
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
