/**
 * goodwill-exclusion-labels — 상증령 §55③ 영업권 자동 배제 사유 라벨 단일 출처.
 *
 * 별지 제5쪽(`Page5GoodwillTable`)이 로컬로 갖고 있던 표를 올린 것이다. 결과 카드
 * (`PerShareValuationResultCard`)는 그 표가 없어 내부 enum 문자열("real_estate_80" 등)을
 * 화면에 그대로 출력하고 있었다.
 *
 * 형제: `stock-premium-exclusion-labels.ts`(§53⑧ 할증 배제) — 같은 층위·같은 Record 관례.
 */

import type { UnlistedGoodwillResult } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

/** §55③ 1~3호 — Record로 enum 누락을 컴파일러가 catch. */
export const GOODWILL_EXCLUSION_LABELS: Record<
  NonNullable<UnlistedGoodwillResult["excludedByLaw"]>,
  string
> = {
  liquidation: "§55③ 1호 — 청산절차 진행 → 영업권 가산 없음",
  real_estate_80: "§55③ 1호 — 부동산 80%(§54④3호) → 영업권 가산 없음",
  lt3y: "§55③ 2호 — 사업개시 3년 미만·휴·폐업(§54④2호)",
  continuous_loss_3y: "§55③ 3호 — 직전 3년 계속 결손 → 영업권 자동 0",
};
