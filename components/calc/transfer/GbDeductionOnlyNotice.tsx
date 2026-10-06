"use client";

/**
 * 일반건물 감정가액·매매사례가액 — 「필요경비는 개산공제만 인정」 안내 (A2 · 설계서 §3.7)
 *
 * 「소득세법」 §97②2호 **본문**: 추계 취득가액(매매사례가액·감정가액·환산취득가액)이면 그 금액에 자산별 대통령령
 * 금액(개산공제 — 시행령 §163⑥)을 더한 것이 필요경비다. **단서**의 「자본적지출·양도비」 택일은 환산취득가액에 한정된다.
 * 그래서 감정·매매사례 파트/자산에 자본적지출·양도비를 입력해도 세액이 바뀌지 않는다 — 입력 칸을 막지 않고 알린다.
 *
 * 파트 카드(`PartAcqModeField`)·자산 단위 필요경비(`AssetSectionExpense`) 두 곳이 같은 문구를 쓴다(단일 소스).
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";

export function GbDeductionOnlyNotice() {
  return (
    <ToneCard tone="amber" bodyClassName="space-y-1">
      <p className="text-xs text-amber-900" data-testid="gb-deduction-only-notice">
        감정가액·매매사례가액은 추계 취득가액이라 필요경비는 개산공제(취득시 기준시가 × 율 — 3%, 미등기양도자산
        0.3%; 「소득세법 시행령」 §163⑥)만 인정됩니다. 자본적지출·양도비는 필요경비에 산입되지 않으므로 입력해도
        세액이 바뀌지 않습니다 (「소득세법」 §97②2호 본문).
      </p>
    </ToneCard>
  );
}
