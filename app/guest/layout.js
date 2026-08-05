export const metadata = {
  title: 'MEDINA — Гость',
  manifest: '/guest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Гость' },
  icons: { apple: '/icons/guest-apple.png', icon: '/icons/guest-192.png' },
};
export const viewport = { themeColor: '#059669' };

export default function Layout({ children }) {
  return children;
}
