import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthMigrationListener } from "@/components/auth/AuthMigrationListener";
import { SelectOnFocusProvider } from "@/components/providers/SelectOnFocusProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://korean-tax-calc.vercel.app";

export const metadata: Metadata = {
  title: {
    default: "한국 부동산 세금 계산기",
    template: "%s | 한국 부동산 세금 계산기",
  },
  description:
    "양도소득세·취득세·상속세·증여세·재산세·종합부동산세 무료 자동 계산. 최신 세법(2024~2025) 반영.",
  keywords: [
    "부동산 세금", "부동산 세금 계산기",
    "양도소득세 계산기", "취득세 계산기", "상속세 계산기",
    "증여세 계산기", "재산세 계산기", "종합부동산세 계산기",
    "종부세 계산기", "양도세 계산기", "1세대1주택 비과세",
    "다주택 중과세", "생애최초 취득세 감면",
  ],
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: SITE_URL,
    siteName: "한국 부동산 세금 계산기",
    title: "한국 부동산 세금 계산기",
    description:
      "양도소득세·취득세·상속세·증여세·재산세·종합부동산세 무료 자동 계산. 최신 세법(2024~2025) 반영.",
  },
  robots: { index: true, follow: true },
  metadataBase: new URL(SITE_URL),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <SelectOnFocusProvider>
            <AuthMigrationListener />
            <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur">
              <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
                <span className="font-semibold text-sm">한국 부동산 세금 계산기</span>
                <ThemeToggle />
              </div>
            </header>
            {children}
          </SelectOnFocusProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
