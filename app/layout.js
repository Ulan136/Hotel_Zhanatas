import './globals.css';
import RegisterSW from '@/components/RegisterSW';

export const metadata = {
  title: 'MEDINA — учёт гостиницы',
  description: 'Комнаты, финансы, смены и отчёты (вахтовый метод)',
  // Next эмитит только mobile-web-app-capable; добавляем legacy-тег для iOS.
  other: { 'apple-mobile-web-app-capable': 'yes' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,      // приложение не «зумит» при фокусе на поле (iOS)
  viewportFit: 'cover',
  themeColor: '#4338ca',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
