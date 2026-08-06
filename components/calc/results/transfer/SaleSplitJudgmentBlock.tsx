"use client";

/**
 * §100③ 「구분 기재 가액이 안분가액과 30% 이상 차이 → 불분명 의제」 **판정 표시**.
 *
 * 계획서: `docs/02-design/features/general-building-sale-split-mode.plan.md` §12.5
 *
 * ## 두 경로가 같은 컴포넌트를 쓴다
 *
 * split(토지·건물 취득일 분리 — `SplitGainDetailSection`)과 일반건물(`GeneralBuildingValuationDetailCard`)이
 * 같은 판정을 받으므로 표시도 하나여야 한다. 각자 그리면 문구·반올림이 갈리고, 그 차이는
 * **금액이 틀리는 것보다 오래 숨는다**.
 *
 * 🔴 **엔진 판정을 그대로 읽는다 — 재계산하지 않는다**(U-9). 이탈률은 엔진이 준 bp를 퍼센트로
 *    바꾸기만 한다. 화면이 「구분값 대 안분값」을 다시 나누면 경계(정확히 30%)에서 엔진과 갈린다.
 */

import type { SaleSplitJudgmentDetail } from "@/lib/tax-engine/types/transfer-split-gain.types";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { cn } from "@/lib/utils";

const BASIS_LABEL = {
  appraisal: "감정평가가액",
  std_price: "양도시 기준시가",
} as const;

const REJECT_LABEL = {
  out_of_window: "감정일자가 유효 기간을 벗어나 감정평가가액을 쓰지 않았습니다",
  incomplete: "토지·건물 중 한쪽만 평가되어 감정평가가액을 쓰지 않았습니다",
} as const;

const EXEMPTION_LABEL = {
  other_law: "다른 법령에 구분 기준이 있는 경우 (소득세법 시행령 §166⑧1호)",
  demolished_land_only: "건물을 철거하고 토지만 사용하는 경우 (소득세법 시행령 §166⑧2호)",
} as const;

export function SaleSplitJudgmentBlock({
  j,
  exemptionNote,
}: {
  j: SaleSplitJudgmentDetail;
  /**
   * §166⑧ 예외를 선택한 사용자가 적은 **근거 문구**.
   *
   * ⚠️ 이 값은 **엔진을 거치지 않는다** — 계산에 쓰이지 않는 서술 텍스트라 API로 보내지 않기로
   * 했다(계획서 §15.3). 그래서 판정 결과(`j`)에는 없고 **호출부가 폼에서 읽어 넘긴다**.
   */
  exemptionNote?: string;
}) {
  /**
   * bp → 퍼센트 문자열. **정수만 거쳐 반올림한다.**
   *
   * `(bp / 100).toFixed(1)`은 부동소수에 걸린다 — 5555bp(=55.55%)가 내부적으로 55.549999…라
   * `"55.5"`가 나온다. 표시 전용이라 세액에 영향은 없지만, **반올림 결과가 우연에 좌우되는 것**은
   * 이 저장소의 정수 연산 원칙과 어긋난다. ⇒ 십분율 정수(`bp/10`)에서 반올림한다.
   * (`Math.round` 금지는 세액 계산 규칙이고, 여기는 화면 문자열이다.)
   */
  const pct = (bp: number) => `${(Math.round(bp / 10) / 10).toFixed(1)}%`;
  const tone = j.deemedUnclear ? "rose" : j.exemptionApplied ? "amber" : "emerald";
  const title = j.deemedUnclear
    ? "구분 기재 가액을 인정하지 않고 안분가액을 적용했습니다 (소득세법 §100③)"
    : j.exemptionApplied
      ? "30% 이상 차이가 있으나 예외로 구분 기재 가액을 인정했습니다"
      : "구분 기재 가액이 안분가액과 30% 미만 차이로 그대로 적용되었습니다";

  const row = (label: string, land: string, building: string, strong = false) => (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono text-right", strong && "font-semibold")}>{land}</span>
      <span className={cn("font-mono text-right", strong && "font-semibold")}>{building}</span>
    </>
  );

  return (
    // ⚠️ `ToneCard`는 `data-testid`를 DOM으로 흘리지 않는다(props에 없다 — `ToggleCard`와 같다).
    //    TS는 `data-*`를 JSX 특례로 통과시키므로 **타입만 보고 붙였다가 조용히 사라진다**.
    <div data-testid="sale-split-judgment">
      <ToneCard tone={tone} title={title} className="mt-1">
        <div className="text-xs grid grid-cols-3 gap-x-2 gap-y-1">
          <span />
          <span className="font-medium text-center">토지</span>
          <span className="font-medium text-center">건물</span>
          {row("구분 기재 가액", j.declared.land.toLocaleString(), j.declared.building.toLocaleString())}
          {row("안분 가액", j.apportioned.land.toLocaleString(), j.apportioned.building.toLocaleString())}
          {row("차이", pct(j.landDeviationBp), pct(j.buildingDeviationBp))}
          {row("적용 가액", j.applied.land.toLocaleString(), j.applied.building.toLocaleString(), true)}
        </div>
        <p className="text-caption mt-1.5 leading-snug text-muted-foreground">
          안분 기준: {BASIS_LABEL[j.basisKind]}
          {j.appraisalRejected && ` — ${REJECT_LABEL[j.appraisalRejected]}`}
        </p>
        {j.exemptionApplied && (
          <>
            <p className="text-caption leading-snug text-muted-foreground">
              예외 사유: {EXEMPTION_LABEL[j.exemptionApplied]}
            </p>
            {exemptionNote?.trim() && (
              <p className="text-caption leading-snug text-muted-foreground" data-testid="sale-split-exemption-note-display">
                근거: {exemptionNote.trim()}
              </p>
            )}
            <p className="text-caption leading-snug text-muted-foreground">
              ※ 신고서에 <strong>구분 기재한 가액을 그대로 적용</strong>한 사유로 위 내용을 기재하세요.
            </p>
          </>
        )}
        {j.deemedUnclear && (
          <p className="text-caption leading-snug text-muted-foreground">
            ※ 신고서 양도가액은 <strong>안분가액</strong>(토지 {j.applied.land.toLocaleString()} · 건물{" "}
            {j.applied.building.toLocaleString()})으로 기재됩니다 — 계약서상 구분 기재 금액과 다릅니다.
          </p>
        )}
      </ToneCard>
    </div>
  );
}
