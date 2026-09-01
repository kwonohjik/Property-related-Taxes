/**
 * §104⑤ 비교과세 — **기타자산(§94①4호) 그룹**
 *
 * `stock-transfer-aggregate.ts`가 797줄에 닿아 분리했다(800줄 정책 · 착지 목표 ≤700).
 * 이음매는 **법령 축**이다 — 이 파일은 §104⑤ 하나만 다루고, 합산 오케스트레이션(§103①②·
 * §102②·§118의6)은 원래 파일에 남는다.
 *
 * ⚠️ 외부에서 쓰던 `OtherAssetComparativeTax` 타입은 `stock-transfer-aggregate.ts`가
 *    **그대로 re-export**한다 — import 경로 무변경([[feedback_800line_split_export_preservation]]).
 */

import type { StockTransferResult } from "./types/stock-transfer.types";
import { floorTen } from "./stock-transfer-helpers";
import { applyStockTaxRate, applyBasicProgressiveRate } from "./stock-transfer-rate-calc";
import { smeFlag, type AggregateStockItemInput } from "./foreign-stock-aggregate-adapter";

/**
 * §104⑤ 비교과세 — **기타자산(§94①4호) 그룹** echo.
 *
 * ⚠️ 주식(§94①3호 가·나목)은 §104⑤ 대상이 **아니다** — 본문이 「제94조제1항제1호ㆍ제2호 및
 *   **제4호**에서 규정한 자산」으로 3호를 뺐다. 그래서 이 값은 기타자산 그룹만 본다.
 */
export interface OtherAssetComparativeTax {
  /** §104⑤ 대상 건수(비과세 제외). 2 이상일 때만 이 객체가 만들어진다 */
  itemCount: number;
  /** 합산 과세표준 */
  aggregatedTaxBase: number;
  /**
   * 자산별 산출세액 **단순 합계** — 참고값이다.
   * §104⑤ 어느 호도 아니며(호별 합산을 하지 않아 누진 구간이 자산마다 리셋된다),
   * 이 값이 결정 산출세액이 되어서는 안 된다.
   */
  itemSumTax: number;
  /**
   * **§104⑤1호** — 양도소득과세표준 **합계액**에 §55①(기본누진) 1회.
   * §104①9호분도 **기본세율**로 계산한다(법문이 §55①만 지목한다).
   */
  clause1Tax: number;
  /**
   * **§104⑤2호** — 「각 호별로 합산한 자산」의 산출세액 합계(예규 재산-536).
   * §104①1호 버킷(§55① 누진) + §104①9호 버킷(기본세율 + 10%p).
   */
  clause2Tax: number;
  /**
   * §104①**9호** 버킷의 과세표준·산출세액. 9호 자산이 없으면 둘 다 0.
   *
   * **§104⑤ 크로스 조정 레이어**(`comparative-104-5-cross.ts`)가 부동산 §104①8호와 한 버킷으로
   * 재합산하려면 이 둘이 필요하다 — 「본문 후단: 8호 및 9호의 자산은 **동일한 자산으로 보고**」.
   * `otherClausesTax`(= 8호·9호를 뺀 나머지)는 `clause2Tax − clause9Tax`로 얻는다.
   */
  clause9TaxBase: number;
  clause9Tax: number;
  /**
   * §104①**1호** 버킷의 과세표준·산출세액. 1호 자산이 없으면 둘 다 0.
   *
   * 부동산 `AggregateTransferResult.clause1BucketTaxBase`·`clause1BucketTax`와 **대칭**이다 —
   * 2호의 「자산별」이 예규상 「**각 호별로 합산한 자산**」이므로 **부동산 1호와 기타자산 1호도
   * 합산 대상**이다(기재부 재산세제과-536). 크로스 조정 레이어가 두 값을 한 버킷으로 묶는다.
   *
   * ⚠️ **이름에 `Bucket`이 붙는 이유** — 위 `clause1Tax`는 §104**⑤**1호(과세표준 합계액 ×
   *   §55①)이고 이 필드는 §104**①**1호(호별 버킷)다. **다른 조항의 「1호」**라 이름이 겹치면
   *   조정 레이어에서 치명적으로 혼동된다. 8호·9호는 §104⑤에 그 번호가 없어 접미사가 없다.
   *
   * 📌 `clause1BucketTax + clause9Tax === clause2Tax`가 불변식이다(버킷이 이 둘뿐이므로).
   */
  clause1BucketTaxBase: number;
  clause1BucketTax: number;
  /** MAX가 고른 호 — 9호가 섞이지 않으면 두 값이 같아 `"clause2"`가 된다 */
  applied: "clause1" | "clause2";
  /** `MAX(clause1Tax, clause2Tax)` — 이 그룹의 결정 산출세액 */
  aggregatedTax: number;
}

/** §103①1호 그룹 키 — 기타자산(§94①4호)은 부동산과 같은 기본공제 그룹이다. */
const OTHER_ASSET_GROUP = "real_estate_and_other_asset" as const;

/** §104①9호(비사업용 토지 과다소유법인 주식) 카테고리 — 다목·라목 **둘 다**에 얹힌다. */
const NBL_HEAVY_CORP_CATEGORIES: ReadonlySet<StockTransferResult["taxCategory"]> = new Set([
  "other_asset_block_shareholder_nbl",
  "other_asset_heavy_re_nbl",
]);

/**
 * §104⑤ 비교과세 — **기타자산(§94①4호) 그룹**의 산출세액을 호별 합산으로 다시 낸다.
 *
 * [법령]
 * - 「소득세법」 §104⑤ 본문: 「해당 과세기간에 제94조제1항제1호ㆍ제2호 및 **제4호**에서 규정한
 *   자산을 **둘 이상 양도**하는 경우 양도소득 산출세액은 다음 각 호의 금액 중 **큰 것** … 으로 한다」
 *     1호 — 양도소득과세표준 **합계액**에 §55①의 세율을 적용한 산출세액
 *     2호 — §104①~④·⑦에 따라 계산한 **자산별** 산출세액 합계액
 * - 「기획재정부 재산-536」(2018.6.19.) · 국세청 「기준-2018-법령해석재산-0098」:
 *   「2호의 "자산별"에서 "자산"의 의미는 §104 **각 호별로 합산한 자산**을 의미」
 *   ⇒ 같은 호 자산의 과세표준 합산은 **단서가 아니라 본문**이며 **조건이 없다**.
 *
 * [호 버킷 — 기타자산에 걸릴 수 있는 호는 **둘**이다]
 * - **§104①1호** — 「§94①1호·2호 및 **4호**에 따른 자산 — §55①에 따른 세율」. 기타자산의 기본.
 * - **§104①9호** — 그 중 **비사업용 토지 과다소유법인 주식**(시행령 §167의7: 자산총액 중
 *   「법인세법」 §55의2②에 따른 비사토 가액 비율 50% 이상) → **기본세율 + 10%p**.
 * 단기세율(§104①2·3호)은 「§94①**1호 및 2호**에서 규정하는 자산」이라 4호가 빠져
 * **기타자산에 적용되지 않는다** — 그래서 버킷은 이 둘뿐이다.
 *
 * ⚠️ **1호와 2호가 갈린다** — 9호 도입 전에는 호가 하나뿐이라 「1호 = 2호」였고 합산 누진 1회로
 *   충분했다. 이제는 **1호가 이길 수 있다**: 1호는 9호분까지 **기본세율**로 합쳐 계산하므로,
 *   버킷이 각 1건씩이면 「합산으로 올라간 누진 구간」이 「+10%p」를 넘어설 수 있다.
 *   ⇒ MAX를 실제로 취한다(`applied`가 어느 호를 골랐는지 echo한다).
 *
 * [종전 결함] `Σ 단건 세액`을 그대로 합계로 썼다. 그러면 **누진 구간이 자산마다 리셋**되어
 *   1호도 2호도 아닌 값이 나온다 — 부동산 쪽 P11이 저질렀다 되돌린 오류와 같은 성질이다
 *   (`aggregate-progressive-clause-104-5.anchor.test.ts` ❌재제안 금지 항목).
 *   실측 과소 **27,840,000**(기타자산 2건 · 각 양도차익 3억).
 *
 * ⚠️ **주식(§94①3호 가·나목)은 대상이 아니다** — 본문이 3호를 열거하지 않는다.
 * ⚠️ **차손 통산(§102②)은 이 함수의 범위가 아니다** — 차손 자산은 `taxBase`가 0이라 합계에
 *   기여하지 않는다. 2026-08-12에 **주식 그룹**(§102①2호)에는 통산이 들어갔지만
 *   **기타자산 그룹**(§102①1호)은 아직이라(STEP 1.5 주석), 여기 들어오는 값은 종전과 같다.
 *
 * @returns 대상이 2건 미만이면 `undefined`(§104⑤은 「둘 이상 양도」가 요건이다)
 */
export function computeOtherAssetComparativeTax(
  items: StockTransferResult[],
  inputs: AggregateStockItemInput[],
): OtherAssetComparativeTax | undefined {
  // 대상은 **기타자산 그룹**뿐이다. 국외주식은 `basicDeductionGroup: "stock"`이라
  // 여기서 자동으로 걸러진다(§104⑤이 「1호·2호 및 **4호**」만 열거해 3호가 빠지는 것과 같은 이유).
  const targets = items
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.basicDeductionGroup === OTHER_ASSET_GROUP && !r.isExempt);
  if (targets.length < 2) return undefined;

  const aggregatedTaxBase = targets.reduce((s, { r }) => s + r.taxBase, 0);
  const itemSumTax = targets.reduce((s, { r }) => s + r.calculatedTax, 0);

  // ── §104⑤2호 — 「각 호별로 합산한 자산」(예규 재산-536) ──────────────────
  const buckets = new Map<"104-1-1" | "104-1-9", typeof targets>();
  for (const t of targets) {
    const k = NBL_HEAVY_CORP_CATEGORIES.has(t.r.taxCategory) ? "104-1-9" : "104-1-1";
    buckets.set(k, [...(buckets.get(k) ?? []), t]);
  }
  let clause2Tax = 0;
  // §104①9호 버킷은 **따로 기록**한다 — 크로스 조정 레이어가 부동산 8호와 한 버킷으로
  // 재합산해야 하므로(§104⑤ 본문 후단) 과세표준·세액을 분리 노출한다.
  let clause9TaxBase = 0;
  let clause9Tax = 0;
  // §104①1호 버킷도 같은 이유로 분리한다 — 부동산 1호와 합산 대상이기 때문(위 타입 주석).
  // ⚠️ 아래 `clause1Tax`(§104⑤1호)와 **다른 것**이라 `Bucket`을 붙인다.
  let clause1BucketTaxBase = 0;
  let clause1BucketTax = 0;
  for (const [clause, bucket] of buckets) {
    const bucketBase = bucket.reduce((s, { r }) => s + r.taxBase, 0);
    // 버킷 **안에서는** 대표 선택이 결과를 바꾸지 않는다 — 1호 버킷의 두 카테고리
    // (다목·라목)는 같은 §55① 누진이고, 9호 버킷의 두 카테고리도 같은 9호 표다.
    // 세율을 재구현하지 않고 정본 `applyStockTaxRate`에 위임한다(dual-truth 방지).
    const rep = bucket[0];
    const bucketTax = floorTen(
      applyStockTaxRate(
        bucketBase,
        rep.r.taxCategory,
        smeFlag(inputs[rep.i]),
        rep.r.isShortTermHolding,
      ).calculatedTax,
    );
    clause2Tax += bucketTax;
    if (clause === "104-1-9") {
      clause9TaxBase = bucketBase;
      clause9Tax = bucketTax;
    } else {
      clause1BucketTaxBase = bucketBase;
      clause1BucketTax = bucketTax;
    }
  }

  // ── §104⑤1호 — 「과세표준 **합계액**에 §55①」 ────────────────────────────
  // 9호분도 **기본세율**로 계산한다(법문이 §55①만 지목한다). 그래서 `taxCategory` 경유가
  // 아니라 전용 헬퍼를 쓴다 — 대표가 9호면 +10%p가 섞여 1호가 아니게 된다.
  const clause1Tax = floorTen(applyBasicProgressiveRate(aggregatedTaxBase).tax);

  const aggregatedTax = Math.max(clause1Tax, clause2Tax);
  return {
    itemCount: targets.length,
    aggregatedTaxBase,
    itemSumTax,
    clause1Tax,
    clause2Tax,
    clause9TaxBase,
    clause9Tax,
    clause1BucketTaxBase,
    clause1BucketTax,
    applied: clause1Tax > clause2Tax ? "clause1" : "clause2",
    aggregatedTax,
  };
}
