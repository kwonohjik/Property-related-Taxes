"use client";

/**
 * 일반건물 감정가액·매매사례가액 — 「필요경비는 개산공제만 인정」 안내 (A2 · 설계서 §3.7)
 *
 * 「소득세법」 §97②2호 **본문**: 추계 취득가액(매매사례가액·감정가액·환산취득가액)이면 그 금액에 자산별 대통령령
 * 금액(개산공제 — 시행령 §163⑥)을 더한 것이 필요경비다. **단서**의 「자본적지출·양도비」 택일은 환산취득가액에 한정된다.
 * 그래서 감정·매매사례 파트/자산에 자본적지출을 입력해도 세액이 바뀌지 않는다 — 입력 칸을 막지 않고 알린다.
 *
 * ⚠️ **양도비는 다르다.** 자산 단위 양도비는 토지·건물(·증축분) 카드에 가액 비례로 나뉘고(「소득세법」 §100② 후문)
 * 감정·매매사례 카드 몫만 버려진다 — 다른 카드가 실지거래가액이면 가산(§97②1호), 환산취득가액이면 단서 비교(§97②2호 단서)다.
 * 그래서 **다른 카드가 몫을 받을 때**(`shareToOtherCards` — `gbOtherCardsReceiveTransferExpense`)는 「양도비도 세액 불변」이라 쓰지 않는다.
 * 계획서: `docs/00-pm/gb-deduction-only-notice-mixed-asset-transfer-expense.plan.md`
 *
 * 파트 카드(`PartAcqModeField`)·자산 단위 필요경비(`AssetSectionExpense`) 두 곳이 같은 문구를 쓴다(단일 소스).
 * 자산 단위는 분리 OFF(두 파트 모드 동일)라 `shareToOtherCards` 를 생략한다.
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";

/**
 * `shareToOtherCards` — 다른 파트·증축분 카드가 양도비 몫을 받는다(`gbOtherCardsReceiveTransferExpense`). 생략 = 모든 카드가 감정·매매사례.
 * `extension` — 일반건물 증축의 건물 파트: 증축 후 자본적지출 중 증축분 몫은 증축분 취득방식대로 반영된다(`gb-extension-capex-timing.plan.md` §10 · `capexHint` 와 같은 사실).
 */
export function GbDeductionOnlyNotice({ shareToOtherCards = false, extension = false }: { shareToOtherCards?: boolean; extension?: boolean } = {}) {
  return (
    <ToneCard tone="amber" bodyClassName="space-y-1">
      <p className="text-xs text-amber-900 dark:text-amber-200" data-testid="gb-deduction-only-notice">
        감정가액·매매사례가액은 추계 취득가액이라 필요경비는 개산공제(취득시 기준시가 × 율 — 3%, 미등기양도자산
        0.3%; 「소득세법 시행령」 §163⑥)만 인정됩니다.
        {shareToOtherCards
          ? " 이 파트 몫의 자본적지출·양도비는 필요경비에 산입되지 않습니다 (「소득세법」 §97②2호 본문). 다만 자산 전체 양도비는 토지·건물 가액에 비례해 나뉘므로(「소득세법」 §100② 후문) 다른 파트·증축분이 받는 몫은 그 취득방식대로 반영됩니다(실지거래가액이면 가산, 환산취득가액이면 개산공제와 비교 — §97②)."
          : " 자본적지출·양도비는 필요경비에 산입되지 않으므로 입력해도 세액이 바뀌지 않습니다 (「소득세법」 §97②2호 본문)."}
        {shareToOtherCards && extension &&
          " 증축 후 자본적지출 중 증축분 몫도 증축분 취득방식대로 반영됩니다(「소득세법 시행령」 §163③)."}
      </p>
    </ToneCard>
  );
}
