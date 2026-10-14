"use client";

/**
 * 취득 당시 **계약서 토지·건물 구분금액**의 §100③ 판정 표시 (#17-6) — 같은 날 취득한 주택의 배율 초과분 분리 결과에서만 뜬다.
 *
 * 엔진 판정(`splitDetail.acqSplitJudgment`)을 **그대로 읽는다** — 이탈률을 다시 계산하면 경계(정확히 30%)에서 엔진과 갈린다.
 * 양도가액 축 표시(`SaleSplitJudgmentBlock`)와 비교 구조는 같지만 문구가 취득 쪽이다(안분 기준 = 취득시 기준시가, 신고서 양도가액 문구 없음).
 */
import type { AcqSplitJudgmentDetail } from "@/lib/tax-engine/types/transfer-split-gain.types";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { cn } from "@/lib/utils";

/** bp → 퍼센트 문자열 — 정수만 거쳐 반올림한다(`SaleSplitJudgmentBlock`과 같은 규약). */
// 소수 첫째 자리 반올림 — 단, 30% 미만(예: 2999bp)이 반올림으로 「30.0%」로 보여 「30% 미만」 제목과 어긋나지 않게 29.9%로 둔다.
const pct = (bp: number) => {
  const v = Math.round(bp / 10) / 10;
  return `${(bp < 3000 && v >= 30 ? 29.9 : v).toFixed(1)}%`;
};

const TITLE: Record<AcqSplitJudgmentDetail["outcome"], string> = {
  contract: "취득가액의 토지·건물 구분은 계약서 구분금액을 적용했습니다 (안분 가액과 30% 미만 차이)",
  deemed_unclear: "계약서 구분금액을 인정하지 않고 취득시 기준시가 안분 가액을 적용했습니다 (30% 이상 차이)",
  exempt_other_law: "30% 이상 차이가 있으나 다른 법령에서 가액을 구분한 경우로 신고해 계약서 구분금액을 적용했습니다",
  before_effective: "양도일이 2016년 1월 1일 전이라 30% 판정 없이 계약서 구분금액을 적용했습니다",
};

export function AcqSplitJudgmentBlock({ j }: { j: AcqSplitJudgmentDetail }) {
  const tone = j.outcome === "deemed_unclear" ? "rose" : j.outcome === "exempt_other_law" ? "amber" : "emerald";
  const row = (label: string, land: string, building: string, strong = false) => (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono text-right", strong && "font-semibold")}>{land}</span>
      <span className={cn("font-mono text-right", strong && "font-semibold")}>{building}</span>
    </>
  );
  return (
    // `ToneCard`는 `data-testid`를 DOM으로 흘리지 않는다 — 래퍼 div에 단다.
    <div data-testid="acq-split-judgment" data-outcome={j.outcome}>
      <ToneCard tone={tone} title={TITLE[j.outcome]} className="mt-1">
        <div className="text-xs grid grid-cols-3 gap-x-2 gap-y-1">
          <span />
          <span className="font-medium text-center">토지</span>
          <span className="font-medium text-center">건물</span>
          {row("계약서 구분금액", j.declared.land.toLocaleString(), j.declared.building.toLocaleString())}
          {row("취득시 기준시가 안분 가액", j.apportioned.land.toLocaleString(), j.apportioned.building.toLocaleString())}
          {j.outcome !== "before_effective" && row("차이", pct(j.landDeviationBp), pct(j.buildingDeviationBp))}
          {row("적용 가액", j.applied.land.toLocaleString(), j.applied.building.toLocaleString(), true)}
        </div>
        <p className="text-caption mt-1.5 leading-snug text-muted-foreground">
          근거: {TRANSFER.SPLIT_DEEMED_UNCLEAR}
          {j.outcome === "exempt_other_law" && ` · ${TRANSFER.SPLIT_DEEMED_UNCLEAR_EXEMPTION} 1호`}
          {j.outcome !== "before_effective" &&
            " — 토지·건물 각각을 안분 가액 대비로 비교하며 어느 한쪽이라도 30% 이상 차이가 나면 불분명으로 봅니다(비교 단위를 정면으로 정한 예규·재결은 확인하지 못했습니다 — 확인 필요)."}
        </p>
      </ToneCard>
    </div>
  );
}
