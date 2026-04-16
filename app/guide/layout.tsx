/**
 * 가이드 공통 레이아웃 (T-10)
 * 헤더 아래 breadcrumb 바 + 최대 폭 컨테이너 제공
 */

import Link from "next/link";

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {/* Breadcrumb 바 */}
      <div className="border-b bg-muted/30">
        <div className="mx-auto max-w-screen-lg px-4 py-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors">
            홈
          </Link>
          <span>/</span>
          <span>가이드</span>
        </div>
      </div>

      {/* 본문 */}
      <div className="mx-auto max-w-screen-lg px-4 py-8">
        {children}
      </div>
    </div>
  );
}
