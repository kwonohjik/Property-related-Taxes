"use client";

/**
 * 조정대상지역 한 축의 표시 — 판정 메뉴 ②와 양도세 계산기 ②·④가 **같은 컴포넌트**를 쓴다(결정 #5, G7-6).
 *
 * 주소(법정동코드)가 있으면 토글 대신 자동 판정을 읽기 전용으로 보이고, 없으면 토글이다.
 * 계산기는 종전에 주소가 있어도 토글을 띄웠다 — 엔진이 코드를 우선해 토글을 무시하는데 화면은 정정 수단처럼 안내했다.
 */
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { isRegulatedByBjdCode } from "@/lib/tax-engine/data/regulated-areas";

/**
 * 조정대상지역 한 축 — **주소가 있으면 자동 판정(읽기전용) · 없으면 토글**.
 *
 * 취득 당시·양도 당시 **둘이 같은 컴포넌트**를 쓴다. 종전에는 취득 당시만 자동 판정으로
 * 바뀌어, 주소를 넣으면 「엔진이 무시하는 토글」이 양도 당시 쪽에만 남아 있었다(F-3).
 *
 * 🔑 주소가 있을 때 토글을 띄우면 **사용자가 켠 값이 조용히 버려진다** — 엔진 소비처
 *    셋(거주요건·§155① 처분기한·다주택 중과)이 전부 `regionCode`를 우선하기 때문이다.
 */
export function RegulatedAreaField({
  verdict,
  autoLabel,
  autoTestId,
  toggleTestId,
  toggleTitle,
  checked,
  onCheckedChange,
  toggleDescription = "소재지를 입력하면 읍·면·동·택지지구 예외까지 자동 판정합니다",
  toggleSize = "sm",
}: {
  verdict: ReturnType<typeof isRegulatedByBjdCode> | null;
  autoLabel: string;
  autoTestId: string;
  toggleTestId: string;
  toggleTitle: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  /** 주소가 없어 토글을 보일 때의 설명 — 호출 화면마다 다르다(계산기는 거주요건 안내) */
  toggleDescription?: string;
  toggleSize?: "default" | "sm";
}) {
  if (!verdict) {
    return (
      <ToggleCard
        data-testid={toggleTestId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        title={toggleTitle}
        description={toggleDescription}
        tone="rose"
        size={toggleSize}
      />
    );
  }
  return (
    <div className="space-y-2" data-testid={autoTestId}>
      <ToneCard
        tone={verdict.isRegulated ? "rose" : "emerald"}
        bodyClassName=""
        className="px-3 py-2"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-micro font-semibold text-green-800">
            자동
          </span>
          <span className="text-sm font-medium">
            {autoLabel} {verdict.isRegulated ? "해당" : "미해당"}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{verdict.basis}</p>
      </ToneCard>
      {/*
        🔴 「아래 토글」이라고 쓰지 않는다 — 이 분기에서는 토글이 렌더되지 않는다.
           화면에 없는 것을 가리키는 안내가 「1단계에서 입력하세요」를 만든 병이다.
        ⚠️ 이 주석은 `&&` 괄호 **밖**에 둔다 — 안은 표현식 자리라 중괄호 주석이
           객체 리터럴로 파싱돼 파일 전체가 깨진다(실측). 주석 본문에 닫는
           슬래시-별표 표기를 적는 것도 같은 이유로 금지다(주석이 거기서 끝난다).
      */}
      {verdict.confidence === "low" && (
        <ToneCard tone="amber" bodyClassName="" className="px-3 py-2">
          <p className="text-xs leading-relaxed">
            이 지역은 지정 이력 자료에 없어 자동 판정이 <b>불확실</b>합니다. 직접 선택하려면
            위 <b>소재지</b>를 지우세요 — 그러면 직접 고르는 토글이 나타납니다.
          </p>
        </ToneCard>
      )}
    </div>
  );
}
