import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TONE, stripDark, type Tone } from "./tones";

/**
 * ToneCard — 안내·섹션 카드 공용 primitive (톤 단일 소스 소비).
 *
 * "색상 카드 + 섹션 번호" 패턴(components/calc/CLAUDE.md)과 비접힘 안내박스를 하나로 통합.
 *  - `sectionNum` 有 → 번호배지 + 제목 (섹션 카드)
 *  - `title`만 → 제목형 안내
 *  - 둘 다 無 → 순수 톤 박스 + children
 *
 * 톤 클래스는 `TONE`(tones.ts) 정적 Record에서만 가져온다(dynamic `bg-${tone}` 금지 —
 * feedback_tailwind_static_tone_mapping). 서술형 접힘 도움말은 CollapsibleHintCard 사용.
 *
 * 외곽 shape는 문서화된 정본(`rounded-lg border p-3 space-y-2`)에 고정 —
 * bodyClassName으로 space-y만 조정. 색값은 기존 인라인과 1:1(회귀 0).
 */
export function ToneCard({
  tone,
  title,
  sectionNum,
  className = "",
  bodyClassName = "space-y-2",
  noDark = false,
  children,
}: {
  tone: Tone;
  /** 제목 (있으면 헤더 렌더) */
  title?: ReactNode;
  /** 섹션 번호 — 있으면 번호배지 렌더. `"1-A"` 등 문자열 허용 */
  sectionNum?: string | number;
  className?: string;
  /** 외곽 space-y 등 조정 (기본 space-y-2) */
  bodyClassName?: string;
  /** dark: 변형 제거 — dark 미대응 레거시 카드를 회귀 0으로 전환할 때(예: 스톡 SectionBox) */
  noDark?: boolean;
  children?: ReactNode;
}) {
  const t = TONE[tone];
  const cardCls = noDark ? stripDark(t.card) : t.card;
  const badgeCls = noDark ? stripDark(t.badge) : t.badge;
  const titleCls = noDark ? stripDark(t.title) : t.title;
  const hasHeader = title !== undefined || sectionNum !== undefined;
  return (
    <div className={cn("rounded-lg border p-3", bodyClassName, cardCls, className)}>
      {hasHeader && (
        <div className="flex items-center gap-2">
          {sectionNum !== undefined && (
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-micro font-bold select-none ${badgeCls}`}
            >
              {sectionNum}
            </span>
          )}
          {title !== undefined && (
            <p className={`text-xs font-semibold ${titleCls}`}>{title}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
