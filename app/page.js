import Link from 'next/link';
import { TopBar } from '@/components/kit';

export default function Home() {
  return (
    <div className="wrap">
      <TopBar sub="учёт гостей и финансов" right={<span className="demo-badge">общая база</span>} />
      <div className="content">
        <Link className="big-choice" style={{ background: 'linear-gradient(135deg,#4f46e5,#4338ca)' }} href="/admin">
          <div className="ic">🖥️</div>
          <div className="t">Вход для персонала</div>
          <div className="d">админ / ресепшн — комнаты, финансы, столовая, смены, отчёты</div>
        </Link>
        <Link className="big-choice" style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }} href="/guest">
          <div className="ic">📱</div>
          <div className="t">Регистрация гостя (QR)</div>
          <div className="d">гость выбирает себя, комнату и период</div>
        </Link>
        <Link className="big-choice" style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }} href="/report">
          <div className="ic">📊</div>
          <div className="t">Вход для отчёта (заказчик)</div>
          <div className="d">руководство — просмотр посещений вахты (только чтение)</div>
        </Link>
        <Link className="big-choice" style={{ background: 'linear-gradient(135deg,#0ea5e9,#0369a1)' }} href="/guard">
          <div className="ic">🛡️</div>
          <div className="t">Охрана — отметить смену</div>
          <div className="d">приход / уход по QR, часы считаются сами</div>
        </Link>
        <div className="card">
          <div className="small">
            Общая база: Neon Postgres. Данные видны на всех устройствах в реальном времени.
            Для QR используйте прямые адреса страниц: /guest, /guard, /report.
          </div>
        </div>
      </div>
    </div>
  );
}
