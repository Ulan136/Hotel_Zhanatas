export const metadata = {
  title: 'MEDINA — Охрана',
  manifest: '/guard.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Охрана' },
  icons: { apple: '/icons/guard-apple.png', icon: '/icons/guard-192.png' },
};
export const viewport = { themeColor: '#0369a1' };

export default function Layout({ children }) {
  return children;
}
