import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import "./globals.css";
export const runtime = "nodejs";
export const metadata: Metadata = {
  icons: { icon: "/favicon.svg" },
  title: "鲁银智能化平台 · 鲁盐集团",
  description: "智能经营与规范治理协同平台",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <AntdRegistry>{children}</AntdRegistry>
      </body>
    </html>
  );
}
