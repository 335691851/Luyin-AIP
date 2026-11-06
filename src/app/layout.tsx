import type { Metadata, Viewport } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import "./globals.css";
import MobileViewport from "@/components/mobile-viewport";
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};
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
        <MobileViewport />
        <AntdRegistry>{children}</AntdRegistry>
      </body>
    </html>
  );
}
