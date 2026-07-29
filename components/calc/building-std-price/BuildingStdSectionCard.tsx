"use client";

/**
 * 건물 기준시가 폼 섹션 카드 — 번호 배지 + 톤 카드(components/calc/CLAUDE.md 다-섹션 패턴).
 * 폼 본체와 상증 섹션 컴포넌트가 공유한다(BuildingStdPriceForm · BuildingStdValuationSections).
 */

export function SectionCard({
  num,
  title,
  tone,
  children,
  testId,
}: {
  num: number;
  title: string;
  tone: "sky" | "amber" | "emerald" | "violet" | "rose";
  children: React.ReactNode;
  /**
   * E2E 스코프용. 취득/양도 시점 블록은 필드 구성이 같아 `nth()` 서수로 집으면
   * 조건부 렌더(≤2000 취득 공시지가 등)에 서수가 밀려 **다른 시점 칸에 값이 들어간다**.
   * 시점 단위로 스코프해 그 클래스를 차단한다.
   */
  testId?: string;
}) {
  const T: Record<string, { border: string; bg: string; badge: string; text: string }> = {
    sky: { border: "border-sky-200", bg: "bg-sky-50/40", badge: "bg-sky-200 text-sky-800", text: "text-sky-700" },
    amber: { border: "border-amber-200", bg: "bg-amber-50/40", badge: "bg-amber-200 text-amber-800", text: "text-amber-700" },
    emerald: { border: "border-emerald-200", bg: "bg-emerald-50/40", badge: "bg-emerald-200 text-emerald-800", text: "text-emerald-700" },
    violet: { border: "border-violet-200", bg: "bg-violet-50/40", badge: "bg-violet-200 text-violet-800", text: "text-violet-700" },
    rose: { border: "border-rose-200", bg: "bg-rose-50/40", badge: "bg-rose-200 text-rose-800", text: "text-rose-700" },
  };
  const t = T[tone];
  return (
    <div data-testid={testId} className={`rounded-lg border p-3 space-y-2.5 ${t.border} ${t.bg}`}>
      <div className="flex items-center gap-2">
        <span className={`flex h-5 w-5 items-center justify-center rounded-full text-micro font-bold ${t.badge}`}>
          {num}
        </span>
        <span className={`text-sm font-semibold ${t.text}`}>{title}</span>
      </div>
      {children}
    </div>
  );
}
