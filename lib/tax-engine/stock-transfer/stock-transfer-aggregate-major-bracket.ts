/**
 * 대주주 §104①11호 **가목 2)** «3억원» 구간 — 과세기간 합계 과세표준에 **1회** 적용
 *
 * 계획서: docs/00-pm/stock-major-shareholder-bracket-unit.plan.md (Q-1 a · Q-2 a · Q-3 a)
 * `stock-transfer-aggregate.ts`가 700줄을 넘겨 법령 축(§104①11호 가목 2)) 하나로 분리했다.
 *
 * [결함] 다종목 STEP 3가 종목마다 `applyStockTaxRate`로 누진표를 따로 적용해 **3억 구간이 종목 수만큼
 *   반복**됐다. 대주주 2종목(각 소득 4억)에서 합계 169,375,000원 — 합계 과세표준에 1회 적용한 값은
 *   184,375,000원(차 15,000,000원). 종목이 하나 늘 때마다 최대 3억 × 5% = 15,000,000원 과소.
 *
 * [법령·서식 — 직접 확인]
 *   · 소득세법 §104① 본문 「거주자의 양도소득세는 **해당 과세기간의 양도소득과세표준**에 다음 각 호의 세율을 적용」
 *   · §92②·③ · §102①2호(주식 §94①3호는 **하나의 소득**) · §103①2호(기본공제 연 250만원)
 *   · 소득세법 시행규칙 별지 제84호서식 작성방법 4번 「③ 세율구분란: 주식의 경우에는 … 세율이 같은 자산을
 *     **합산하여 적습니다**」(세율구분 1-63 = 20~25% 한 칸)
 *   · 국세청 재산세과-3820(2008.11.17.) 회신 1 「같은 호의 세율이 적용되는 경우에는 소득금액을 합산하여
 *     세율을 적용」(2008년 일반 해석 — 주식 전용 아님, 계획서 V-2)
 *   · 엔진 자체 선례 — 한 종목 안의 로트 분할은 이미 합산 1회(`lot-allocation-tax.ts`)다. 종목 사이만 남아 있었다.
 *
 * [대상] **같은 과세기간에 가목 2) 누진표를 탄 과세표준**이 2건 이상인 종목들. 그 과세표준은 세액을 낸 코드가
 *   직접 알려준다(`RateCalcResult.majorProgressiveBase`) — 카테고리·보유기간 술어를 여기서 재구현하지 않는다.
 *   비대주주(나목 20%)·대주주 1년 미만 비중소(가목 1) 30% 단일)·국외주식(§104①12호)·기타자산(§94①4호)은
 *   그 표를 타지 않으므로 자동 제외된다.
 *
 * [표시 — Q-2 a] 종목 행(`items[]`)은 **종목 단독 산출**로 둔다. 합계에만 보정을 싣고 echo로 드러낸다.
 *   종목에 세액을 안분하지 않는다(역안분 재제안 금지·자동 안분 fallback 금지).
 *   그래서 `Σ items.calculatedTax ≠ totalCalculatedTax`일 수 있다 — 기타자산 §104⑤와 같은 규약이다.
 */

import type { StockTransferResult } from "./types/stock-transfer.types";
import { floorTen } from "./stock-transfer-helpers";
import { applyMajorProgressiveRate } from "./stock-transfer-rate-calc";

/**
 * 가목 2) 대주주 합산 누진 echo — **보정이 생길 때만** 실린다(합산해도 세액이 같으면 `undefined`).
 *
 * 보정은 **음이 아니다**: 누진표는 볼록하므로 `f(ΣB) ≥ Σf(B)`다.
 */
export interface MajorProgressiveGroupTax {
  /** 가목 2) 누진표를 탄 종목 수(2 이상). 종목 안 단기분은 세지 않는다 */
  itemCount: number;
  /** 합산 과세표준(기본공제·양도차손 통산 후) */
  aggregatedTaxBase: number;
  /** 종목별로 3억 구간을 따로 적용한 세액의 단순 합 — **참고값**(종전 합계) */
  itemSumTax: number;
  /** 합산 과세표준에 3억 구간을 1회 적용한 세액 — 이 그룹의 결정 산출세액 */
  aggregatedTax: number;
  /** `aggregatedTax − itemSumTax` — 합계 산출세액에 더해진 값(> 0) */
  adjustment: number;
}

/**
 * @param bases 종목별 «가목 2) 누진표를 탄 과세표준»(없으면 0). 인덱스는 `items`와 같다.
 * @returns 대상이 2건 미만이거나 합산 세액이 같으면 `undefined`
 */
export function computeMajorProgressiveGroupTax(
  items: readonly StockTransferResult[],
  bases: readonly number[],
): MajorProgressiveGroupTax | undefined {
  const targets = bases
    .map((b, i) => ({ b, i }))
    // 비과세 종목은 세액 계산 자체를 하지 않으므로 방어적으로 한 번 더 거른다.
    .filter(({ b, i }) => b > 0 && !items[i]?.isExempt);
  if (targets.length < 2) return undefined;

  const aggregatedTaxBase = targets.reduce((s, { b }) => s + b, 0);
  // 종목별 누진 세액은 STEP 3의 `floorTen(rateResult.calculatedTax)`와 같은 절사 규약으로 맞춘다.
  const itemSumTax = targets.reduce((s, { b }) => s + floorTen(applyMajorProgressiveRate(b).tax), 0);
  const aggregatedTax = floorTen(applyMajorProgressiveRate(aggregatedTaxBase).tax);
  const adjustment = aggregatedTax - itemSumTax;
  if (adjustment <= 0) return undefined;

  return { itemCount: targets.length, aggregatedTaxBase, itemSumTax, aggregatedTax, adjustment };
}
