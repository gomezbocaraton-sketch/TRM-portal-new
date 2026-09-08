import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TRM Partners — Client Portal',
  description: 'Construction management portal for TRM Partners LLC',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-paper text-ink font-sans antialiased">{children}</body>
    </html>
  );
}
