import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "今晚投什么？",
  description: "给聚会准备的一张排序选票"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="grain" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
