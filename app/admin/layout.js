export const metadata = {
  title: 'MEDINA — Кабинет',
  manifest: '/admin.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Кабинет' },
  icons: { apple: '/icons/admin-apple.png', icon: '/icons/admin-192.png' },
};
export const viewport = { themeColor: '#4338ca' };

export default function Layout({ children }) {
  return children;
}
