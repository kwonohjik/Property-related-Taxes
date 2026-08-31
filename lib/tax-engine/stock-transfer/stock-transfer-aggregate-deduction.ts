/**
 * 다종목 합산 — 비과세 배제 · §103①1호 기소진액 leaf
 *
 * `stock-transfer-aggregate.ts` 에서 분리(800줄 정책). 순수 함수 · 의존 없음.
 *
 * 두 헬퍼 모두 **단건 경로는 이미 정상인데 합산 경로만 규약이 어긋나 있던** 결함을
 * 고치면서 신설됐다(리뷰 2026-08-28 #1·#16).
 */

import type { StockTransferInput, StockTransferResult } from "./types/stock-transfer.types";
import { isForeignStockItem, type AggregateStockItemInput } from "./foreign-stock-aggregate-adapter";

/** §103① 각 호별 연간 기본공제 한도. */
export const BASIC_DEDUCTION_LIMIT = 2_500_000;

/** 총계에서 비과세 종목을 제외할 때 쓰는 필드 이름. */
type TaxableSumField = "transferIncome" | "taxBase" | "calculatedTax" | "basicDeduction";

/**
 * 비과세 종목을 총계에서 제외하는 선택자.
 *
 * 🔴 2026-08-28 정정(리뷰 #1 — **세액 변경**) — 단건 경로는 `applyExemptZeroing` 이
 * **finalTax·지방소득세만** 0으로 만들고 `taxBase`·`calculatedTax` 는 산식 표시용 echo 로
 * 남긴다(`stock-transfer-tax.ts` 의 `treatExemptAsTaxable`). 그런데 합산 총계는 그 echo 를
 * 필터 없이 더하고 있었다 — 같은 파일이 §104⑤ 비교과세(`!r.isExempt`)와 §102② 통산
 * (`loss-offset-core.ts` 의 `if (r.exempt) return 0`)에서는 비과세를 명시 배제하는데
 * **총계 세 곳만 규약이 어긋났다**.
 *
 * 실측: 코스피 소액주주 장내(비과세·차익 4,000만) + 코스피 대주주(차익 1,000만)
 *   → totalFinalTax 9,000,000 (정상 1,500,000) · 지방소득세 900,000 (정상 150,000)
 *   ⇒ 본세 7,500,000 + 지방 750,000 **과대**.
 * 「상장 소액주주 장내양도」는 가장 흔한 정상 입력이라 도달 확률이 높다.
 *
 * ⚠️ **종목별 결과의 echo 는 그대로 둔다** — 총계에서 빼는 것과 종목 산식 표시를 지우는
 *    것은 다르다. 결과뷰가 비과세 종목의 「가상 산출세액」을 보여주는 규약은 유지된다
 *    (anchor AG-EX-4 가 고정).
 *
 * 법령: 소득세법 §94①3호 가목 1) 단서(과세대상 제외) · §92②(산출세액은 과세표준에 세율 적용).
 *       비과세 자산은 과세표준·산출세액 어느 단계에도 산입되지 않는다.
 */
export function taxableField(r: StockTransferResult, field: TaxableSumField): number {
  return r.isExempt ? 0 : r[field];
}

/**
 * §103①1호(부동산·기타자산 그룹)의 **기소진액** — 같은 과세기간 부동산 양도에서 이미 쓴 공제.
 *
 * 🔴 2026-08-28 정정(리뷰 #16 — **세액 변경**) — 종전에는 합산 엔진이 누적 카운터를 0에서
 * 시작하고 스프레드 **뒤**에 `realEstateGroupBasicDeductionUsed: otherAssetUsed` 를 얹어
 * **사용자 선언값을 확실히 덮어썼다**. 단건 경로(`stock-transfer-helpers.ts` 의
 * `calcBasicDeduction`)는 `remaining = max(0, 250만 − used)` 로 정상 반영하는데 다종목만
 * 버렸다. 실측: 기소진 250만 선언/미선언의 `totalFinalTax` 가 **완전히 동일**했다
 * (입력이 세액에 0 영향) ⇒ 최대 2,500,000 × 45% = 1,125,000 과소.
 *
 * 🔑 이 필드는 **신고 단위**다 — `calc-wizard-stock-store.ts` 의 `carryFilingFields` 가
 *    종목 간 승계 필드로 명시하고 있어 모든 종목이 같은 값을 갖는 것이 정상이다.
 *    값이 갈리면 **한도를 넘지 않는 쪽(최댓값)** 을 택한다 — §103① 의 취지가 연간 한도이고,
 *    적게 잡으면 한도를 초과 공제하게 된다.
 * 🔑 국외주식 입력에는 이 축이 없다(`ForeignStockInput`) — 0 으로 본다.
 *
 * 법령: 소득세법 §103①1호(§94①1·2·4호 소득 그룹 연 250만원 한도) · 같은 조 ②.
 */
export function resolveRealEstateGroupUsedSeed(inputs: AggregateStockItemInput[]): number {
  const declared = inputs.map((i) =>
    isForeignStockItem(i) ? 0 : ((i as StockTransferInput).realEstateGroupBasicDeductionUsed ?? 0),
  );
  return Math.min(BASIC_DEDUCTION_LIMIT, Math.max(0, ...declared, 0));
}
