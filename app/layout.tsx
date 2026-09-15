import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "时光自习室 · 每一分专注都算数",
  description: "记录每次学习，自动累加每天的有效学习时间。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
