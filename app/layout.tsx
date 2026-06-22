import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "무료 SEO 검사기",
  description: "홈페이지 URL을 입력하면 SEO 기본 항목을 빠르게 점검합니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
