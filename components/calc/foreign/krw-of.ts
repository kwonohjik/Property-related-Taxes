/**
 * 국외자산 화면 미리보기 공용 — 외화 × 환율 [× 주식 수] 원화 환산 (엔진 환산 leaf `fx-krw.ts`와 **같은 값**).
 *
 * 부동소수 `Math.floor(외화 × 환율)`은 1원 과소가 난다(`400000 × 1300.10` → 520,039,999, 정확값 520,040,000).
 * 한도 위반(소수 4자리 초과·상한 초과)·빈 입력은 `null` — 렌더 중에 던지지 않는다.
 */
import { toKrwOrNull } from "@/lib/tax-engine/fx-krw";

/** 같은 통화로 쓰는 `krwOf`(ForeignDatedAmountRows 용) — 외화액·환율이 양수일 때만 환산한다 */
export function krwOfExact(amountForeign: number, exchangeRate: number): number | null {
  return toKrwOrNull(amountForeign, exchangeRate);
}

/**
 * 1주당 외화 단가 × 주식 수 × 환율 — 단가×수량을 BigInt 곱에 함께 넣는다(미리 곱하면 `0.1 × 3`이 어긋난다).
 * 단가·환율·주식 수 중 하나라도 양수가 아니면 `null`(엔진은 0이면 환산하지 않으므로 미리보기도 숨긴다).
 */
export function perShareKrwPreview(perShareForeign: number, shareCount: number, exchangeRate: number): number | null {
  if (!(perShareForeign > 0) || !(shareCount > 0) || !(exchangeRate > 0)) return null;
  return toKrwOrNull(perShareForeign, exchangeRate, shareCount);
}

/** 총액 외화 × 환율 — 총액·환율이 양수일 때만 */
export function totalKrwPreview(totalForeign: number, exchangeRate: number): number | null {
  if (!(totalForeign > 0) || !(exchangeRate > 0)) return null;
  return toKrwOrNull(totalForeign, exchangeRate);
}
