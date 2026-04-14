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

export const metadata: Metadata = {
  title: "KoreanTaxCalc — 한국 부동산 세금 계산기",
  description:
    "양도소득세·상속세·증여세·취득세·재산세·종합부동산세 자동 계산",
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
