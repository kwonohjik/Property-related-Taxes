/**
 * 기준시가 비례 안분 — 공용 leaf.
 *
 * 결합 금액(양도가액·개별주택가격 등) `total`을 토지분·건물분 기준시가 비율로 나눈다.
 * `토지분 = floor(total × land ÷ (land + building))`, `건물분 = total − 토지분`(잔액 흡수).
 * 토지분을 먼저 절사하고 건물이 잔액을 흡수하므로 `토지분 + 건물분 ≡ total`이 항상 성립한다
 * (양도소득세 집행기준 99-164-9 — 60,000천원 × 50/80 = 37,500천원 · 나머지 22,500천원).
 *
 * 양도가액 안분(`sale-split-apportion-basis.ts`)과 개별주택가격의 취득시·양도시 토지·건물 분할
 * (`transfer-tax-split-acq-price.ts`)이 **같은 함수**를 써서 절사 규약이 갈리지 않게 한다.
 * 곱이 안전 정수를 넘으면 `safeMultiplyThenDivide`가 BigInt로 처리한다.
 */
import { safeMultiplyThenDivide } from "./tax-utils";

export interface StdPricePair {
  land: number;
  building: number;
}

export function apportionByStdPrice(total: number, land: number, building: number): StdPricePair {
  const denom = land + building;
  const landPart = Math.floor(safeMultiplyThenDivide(total, land, denom));
  return { land: landPart, building: total - landPart };
}
