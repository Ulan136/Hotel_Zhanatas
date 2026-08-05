import './globals.css';

export const metadata = {
  title: 'MEDINA — учёт гостиницы',
  description: 'Комнаты, финансы, смены и отчёты (вахтовый метод)',
  manifest: undefined,
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#4338ca',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
