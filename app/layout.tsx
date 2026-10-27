import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'An Toàn Xe Điện | Quản lý đa tài khoản',
  description: 'Theo dõi học sinh, thiết bị, vị trí và cảnh báo vượt tốc độ với dữ liệu tách biệt theo tài khoản.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
