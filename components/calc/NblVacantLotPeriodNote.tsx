"use client";

/**
 * NBL-STATE-HISTORY-E3-④ — ⑦ 결과 카드: 13호(무주택 1세대 1필지 나지)로 사업용에 센 기간과 세대 주택 소유로 제외한 기간.
 * 계획서: docs/01-plan/features/nbl-state-history-e3-4-ho13-bare-land.ui.plan.md §8
 *
 * 입력은 엔진 echo(`periodEvaluation.vacantLot`)뿐이다 — 13호가 사업용 구간을 정했을 때만 있고(13호가 아니거나 행 없는 이력 OFF = 키 부재 = 이 블록 없음) 카드가 구간·일수를 새로 계산하지 않는다.
 * 고지(자기 선언 · 세대 주택 소유 기간 · 면적)는 엔진 `warnings`가 이미 카드의 「주의사항」에 싣는다(여기서 다시 그리지 않는다).
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { toDate } from "@/lib/api/date-coerce";
import { NBL } from "@/lib/tax-engine/legal-codes";
import { OTHER_LAND_HO_META } from "@/lib/tax-engine/non-business-land/other-land-ho-meta";
import type { VacantLotEcho } from "@/lib/tax-engine/non-business-land/land-usage.types";
import { addDays } from "@/lib/tax-engine/utc-date";

interface Props {
  vacantLot: VacantLotEcho;
  /**
   * 엔진이 «빈 사업기간 + 유예기간»으로 비사업용 잔여분(660㎡ 초과분 · 13호로 인정되지 않은 부분)을 다시 판정했을 때의 echo(`periodEvaluation.graceJudged`). 있으면 위 «기간 분석»의 사업용 일수·비율이 그 재판정 기준이다 —
   * 13호로 센 기간(아래 구간)과 숫자가 다른 이유를 밝힌다(L-1). 세액·판정은 엔진 결과 그대로다(표시만).
   */
  graceJudged?: { gracePeriodDays: number; totalOwnershipDays: number; meets: boolean };
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);

export function NblVacantLotPeriodNote({ vacantLot, graceJudged }: Props) {
  const { scope, intervals, houseOwnedDays } = vacantLot;
  const businessDays = intervals.reduce((s, iv) => s + iv.days, 0);
  const label = OTHER_LAND_HO_META.vacant_lot_1household.option.label;
  return (
    <div className="px-4 py-3 border-b border-border" data-testid="nbl-vacant-lot-period">
      <ToneCard tone="sky" title={`${label} 적용 기간`}>
        <p className="text-xs" data-testid="nbl-vacant-lot-period-summary">
          {label}로 사업용에 센 기간 {businessDays.toLocaleString()}일 · 세대 주택 소유로 제외한 기간 {houseOwnedDays.toLocaleString()}일
        </p>
        <p className="text-caption text-muted-foreground leading-snug" data-testid="nbl-vacant-lot-period-scope">
          {scope === "bare_intervals" ? "소유기간 중 건축물이 없던 구간 가운데 세대가 주택을 소유하지 않은 기간입니다." : "소유기간 가운데 세대가 주택을 소유하지 않은 기간입니다."}
        </p>
        {intervals.length > 0 && (
          <ul className="space-y-0.5">
            {intervals.map((iv, i) => {
              const start = toDate(iv.start, "start");
              return (
                <li key={i} data-testid={`nbl-vacant-lot-period-${i}`} className="text-xs flex flex-wrap gap-x-1.5">
                  <span className="font-mono tabular-nums whitespace-nowrap">
                    {iso(start)} ~ {iso(addDays(start, iv.days - 1))}
                  </span>{" "}
                  <span className="font-mono tabular-nums text-right">{iv.days.toLocaleString()}일</span>
                </li>
              );
            })}
          </ul>
        )}
        {graceJudged && (
          <p className="text-caption text-muted-foreground leading-snug" data-testid="nbl-vacant-lot-period-grace-judged">
            13호로 인정되지 않아 비사업용으로 남은 부분(660㎡ 초과분 · 세대 주택 소유 기간)은 {NBL.UNAVOIDABLE_PERIOD}의 유예기간 {graceJudged.gracePeriodDays.toLocaleString()}일(소유기간 {graceJudged.totalOwnershipDays.toLocaleString()}일 중)을 사업용으로 보아 {NBL.CRITERIA}의 기간기준을 다시 판정했습니다 —{" "}
            {graceJudged.meets ? "충족합니다." : "충족하지 않습니다."} 위 «기간 분석»의 사업용 일수·비율은 이 재판정 기준이라 13호로 센 기간과 다릅니다.
          </p>
        )}
      </ToneCard>
    </div>
  );
}
