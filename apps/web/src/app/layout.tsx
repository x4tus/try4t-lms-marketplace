import type { Metadata } from 'next';
import { JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';
import { NetworkStatusBanner } from '@/components/layout/network-status-banner';
import { Providers } from '@/components/providers';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-jakarta',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Try4T — Nền tảng Khóa học Trực tuyến & Chứng chỉ Thực chiến',
    template: '%s | Try4T',
  },
  description:
    'Học lập trình và công nghệ theo lộ trình bài bản trên Try4T với phòng học thông minh, ghi chú mốc thời gian, bài kiểm tra thực tế và chứng chỉ QR xác thực.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning className={`${jakarta.variable} ${jetbrains.variable}`}>
      <body className="flex min-h-screen flex-col bg-background text-foreground antialiased">
        <Providers>
          <Navbar />
          <NetworkStatusBanner />
          <div className="flex-1">{children}</div>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
