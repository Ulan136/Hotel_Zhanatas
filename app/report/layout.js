export const metadata = {
  title: 'MEDINA — Отчёт',
  manifest: '/report.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Отчёт' },
  icons: { apple: '/icons/report-apple.png', icon: '/icons/report-192.png' },
};
export const viewport = { themeColor: '#d97706' };

export default function Layout({ children }) {
  return children;
}
