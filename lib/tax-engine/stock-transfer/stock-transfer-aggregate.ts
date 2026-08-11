/**
 * 주식 양도소득세 — 다자산 합산 엔진 (Layer 2 — Orchestrator on Orchestrator)
 *
 * 동일 과세기간 내 2건 이상 종목을 양도할 때 §103② 기본공제 그룹별 1회 한도를 반영한다.
 * 기존 단건 엔진(`calculateStockTransferTaxInternal`)을 종목별로 재사용하며,
 * 상위에서 그룹별 기본공제 배분·합산·증권거래세 정보성 echo 합산을 수행.
 *
 * 순수 함수. DB 직접 호출 없음.
 *
 * [800줄 정책 분할 — D-1] stock-transfer-tax.ts(798줄)에서 추출.
 * 외부 import 경로는 stock-transfer-tax.ts의 re-export로 100% 보존(import 무변경).
 */

import type { StockTransferInput, StockTransferResult } from "./types/stock-transfer.types";
import { calculateStockTransferTaxInternal } from "./stock-transfer-tax";
import { floorTen } from "./stock-transfer-helpers";
import { applyStockTaxRate, applyBasicProgressiveRate } from "./stock-transfer-rate-calc";
import { finalizeStockTax } from "./stock-transfer-finalize";
import {
  sumSecuritiesTransactionTax,
  type SecuritiesTransactionTaxTotal,
} from "./securities-transaction-tax";
import { resolveStockCarryover } from "./stock-carryover";

// ============================================================
// 다자산 합산 결과 타입
// ============================================================

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

export interface StockTransferAggregateResult {
  /**
   * 종목별 단건 결과 배열.
   *
   * ⚠️ **`Σ items.calculatedTax ≠ totalCalculatedTax`일 수 있다** — 기타자산 2건 이상이면
   *   §104⑤ 비교과세가 합계에 적용되기 때문이다(`otherAssetComparativeTax`).
   *   items는 **자산 단독 참고값**이며, 그 차이는 비교과세의 본질이다
   *   (부동산 정본 `PerPropertyBreakdown.refCalculatedTax`와 같은 규약).
   */
  items: StockTransferResult[];
  /** 합산 양도소득금액 */
  totalTransferIncome: number;
  /**
   * 그룹별 기본공제 합계
   * - stock: §103②2호 그룹 (주식 §94①3 가·나목)
   * - real_estate_and_other_asset: §103②1호 그룹 (기타자산 §94①4)
   */
  basicDeductionByGroup: {
    stock: number;
    real_estate_and_other_asset: number;
  };
  /** 합산 과세표준 (그룹별 기본공제 1회 적용 후) */
  totalTaxBase: number;
  /**
   * 합산 산출세액.
   * 기타자산 2건 이상이면 §104⑤ 비교과세가 반영되어 **`Σ items.calculatedTax`와 다르다**
   * (`otherAssetComparativeTax` 참조).
   */
  totalCalculatedTax: number;
  /**
   * §104⑤ 비교과세(기타자산 그룹) echo — 대상이 2건 미만이면 `undefined`.
   * `"aggregate"` 모드에서만 만들어진다(§103② 기본공제가 정상 배분되는 실제 신고 경로).
   */
  otherAssetComparativeTax?: OtherAssetComparativeTax;
  /** 합산 가산세 */
  totalUnderReportPenalty: number;
  /** 합산 전자신고 공제 (전체 1회) */
  electronicFilingCredit: number;
  /** 합산 최종세액 */
  totalFinalTax: number;
  /** 합산 지방소득세 */
  totalLocalIncomeTax: number;
  /**
   * 종목별 증권거래세 정보성 echo 합산 (Phase 2 — B-E1).
   * 이미 floor된 종목별 값의 단순합 — 안분·잔액흡수 비해당.
   * 비과세 종목 echo도 포함 (증권거래세는 양도세 비과세와 독립).
   * ⚠️ 현재 aggregate UI 소비자 없음(다자산 UI 미연결) — 향후 연결 시 14지점 재점검 대상.
   */
  totalSecuritiesTransactionTax: SecuritiesTransactionTaxTotal;
}

/** §103②1호 그룹 키 — 기타자산(§94①4호)은 부동산과 같은 기본공제 그룹이다. */
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
 *   기여하지 않으며, 종전 동작과 동일하다(통산 미구현은 별건).
 *
 * @returns 대상이 2건 미만이면 `undefined`(§104⑤은 「둘 이상 양도」가 요건이다)
 */
function computeOtherAssetComparativeTax(
  items: StockTransferResult[],
  inputs: StockTransferInput[],
): OtherAssetComparativeTax | undefined {
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
        inputs[rep.i].isSmallMediumEnterprise,
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

/**
 * 다자산 합산 계산 — §103② 기본공제 그룹별 1회 한도 적용
 *
 * "aggregate" 모드:
 *   1. 각 종목 단건 계산 (realEstateGroupBasicDeductionUsed 연동)
 *   2. 그룹별 기본공제를 250만원 한도 내에서 배분
 *   3. 합산 세액은 단건 세액 합계 (그룹별 기본공제 중복 없음)
 *
 * "each_item" 모드:
 *   - 각 종목 그대로 합산 (기본공제 중복 가능 — 단건 계산 보조용)
 */
export function calculateStockTransferTaxAggregate(
  inputs: StockTransferInput[],
  deductionMode: "each_item" | "aggregate" = "aggregate",
): StockTransferAggregateResult {
  /**
   * §97의2① 이월과세 — **여기가 ②3호 비교의 기준점**이다.
   *
   * ②3호가 비교하는 「양도소득 **결정세액**」은 §92의 계산 순서를 거친 **과세기간 단위**
   * 개념이라 종목 단위로 비교하면 틀린다 — 주식은 §103② 기본공제가 **그룹 단위 연 1회**라
   * 한 종목의 A/B가 **다른 종목의 세액까지** 움직이기 때문이다(계획서 §4 Q-2 · 실측 반례).
   *
   * ⚠️ `aggregateCore`는 이 resolve를 **다시 하지 않는다** — 순환을 만들지 않기 위해서다.
   */
  const resolved = resolveStockCarryover(
    inputs,
    (list) => aggregateCore(list, deductionMode).totalFinalTax,
    (i) => calculateStockTransferTaxInternal(i).transferIncome,
  );
  return aggregateCore(resolved, deductionMode);
}

/** 합산 계산 본체 — 이월과세 A/B가 **이미 확정된** 입력을 받는다. */
function aggregateCore(
  inputs: StockTransferInput[],
  deductionMode: "each_item" | "aggregate",
): StockTransferAggregateResult {
  const BASIC_DEDUCTION_LIMIT = 2_500_000;

  if (deductionMode === "each_item" || inputs.length === 1) {
    // 단건 또는 each_item 모드 — 개별 계산 합산
    //
    // §104⑤ 비교과세를 여기서는 적용하지 않는다:
    //   · `inputs.length === 1` — 법문 요건이 「자산을 **둘 이상** 양도하는 경우」다.
    //   · `each_item` — §103② 기본공제 **중복을 허용**하는 진단 모드라 애초에 유효한 신고가
    //     아니다(위 함수 주석). 실제 신고 경로는 `"aggregate"`이며 Zod 기본값도 그쪽이다
    //     (`lib/api/stock-transfer-tax-schema.ts:548`).
    const items = inputs.map((input) => calculateStockTransferTaxInternal(input));
    const totalTransferIncome = items.reduce((s, r) => s + r.transferIncome, 0);
    const totalCalculatedTax = items.reduce((s, r) => s + r.calculatedTax, 0);
    const totalUnderReportPenalty = items.reduce((s, r) => s + r.underReportPenalty, 0);
    const electronicFilingCredit = items.some((r) => r.electronicFilingCredit > 0)
      ? 20_000
      : 0;
    // 결정세액 10원 미만 절사 — 단건 finalizeStockTax·aggregate 분기와 대칭
    // (구성요소가 모두 10배수라 현재 실수치 불변이나, 향후 변경 대비 정합 유지)
    const totalFinalTax = Math.max(
      0,
      floorTen(totalCalculatedTax + totalUnderReportPenalty - electronicFilingCredit),
    );
    const totalLocalIncomeTax = Math.floor((totalCalculatedTax * 0.10) / 10) * 10;

    return {
      items,
      totalTransferIncome,
      basicDeductionByGroup: {
        stock: items
          .filter((r) => r.basicDeductionGroup === "stock")
          .reduce((s, r) => s + r.basicDeduction, 0),
        real_estate_and_other_asset: items
          .filter((r) => r.basicDeductionGroup === "real_estate_and_other_asset")
          .reduce((s, r) => s + r.basicDeduction, 0),
      },
      totalTaxBase: items.reduce((s, r) => s + r.taxBase, 0),
      totalCalculatedTax,
      totalUnderReportPenalty,
      electronicFilingCredit,
      totalFinalTax,
      totalLocalIncomeTax,
      totalSecuritiesTransactionTax: sumSecuritiesTransactionTax(items),
    };
  }

  // "aggregate" 모드 — §103② 그룹별 기본공제 1회 한도 배분
  // STEP 1: 각 종목 기본공제 최대 소진으로 단건 계산 (순수 소득금액 파악)
  const rawItems = inputs.map((input) =>
    calculateStockTransferTaxInternal({
      ...input,
      // 부동산 그룹은 이미 소진됨으로 처리 → 실질적 기본공제 0
      realEstateGroupBasicDeductionUsed: BASIC_DEDUCTION_LIMIT,
    }),
  );

  // STEP 2: 그룹별 소득금액 합산
  const stockGroupIncome = rawItems
    .filter((r) => r.basicDeductionGroup === "stock")
    .reduce((s, r) => s + r.transferIncome, 0);

  const otherAssetGroupIncome = rawItems
    .filter((r) => r.basicDeductionGroup === "real_estate_and_other_asset")
    .reduce((s, r) => s + r.transferIncome, 0);

  const stockBasicDeduction = Math.min(Math.max(0, stockGroupIncome), BASIC_DEDUCTION_LIMIT);
  const otherAssetBasicDeduction = Math.min(
    Math.max(0, otherAssetGroupIncome),
    BASIC_DEDUCTION_LIMIT,
  );

  // STEP 3: 종목별 기본공제 순차 배분 후 재계산
  //
  // §103② 기본공제는 그룹별 연간 1회 250만원.
  // 입력 순서 기준 앞 종목부터 최대 소진.
  //
  // 주식 그룹(그룹2):
  //   - 엔진 내부 calcBasicDeduction은 "stock" 그룹을 항상 min(income, 250만) 적용
  //   - realEstateGroupBasicDeductionUsed로 제어 불가 (별도 그룹)
  //   - 해결: 첫 종목은 input 그대로(기본공제 full), 나머지는 transferIncome을
  //     "이전 소진량만큼 빼서" 과표를 조정한 결과를 rawItems[i] 기반으로 패치
  //
  // 기타자산 그룹(그룹1):
  //   - realEstateGroupBasicDeductionUsed로 직접 제어 가능

  let stockUsed = 0;        // 주식 그룹 기본공제 누적 사용량
  let otherAssetUsed = 0;   // 기타자산 그룹 누적 사용량

  const processedItems = inputs.map((input, i) => {
    const r = rawItems[i];
    if (r.isExempt) return r;

    const income = r.transferIncome;

    if (r.basicDeductionGroup === "stock") {
      // 이 종목에서 실제 적용할 기본공제
      const remaining = Math.max(0, BASIC_DEDUCTION_LIMIT - stockUsed);
      const deductThis = Math.min(Math.max(0, income), remaining);
      stockUsed += deductThis;

      // 2026-07-29 정정(#591 감사 R7 — **세액 변경**): 종전에는 `deductThis > 0`이면 무조건
      // 엔진 전량 재계산으로 보냈는데, 순수 엔진 `calcBasicDeduction`은 주식 그룹에 **항상**
      // `min(income, 2,500,000)`을 적용한다. 그래서 앞 종목이 한도를 일부만 쓴 경우
      // 뒤 종목이 **250만원 전액을 다시 공제**받아 그룹 한도(§103②2호)를 넘겼다.
      //   실측: 종목A가 1,000,000 사용 → 종목B가 잔여 1,500,000이 아니라 2,500,000 공제
      //        → 그룹 합계 3,500,000 (한도 초과) → 과세표준·산출세액 과소.
      //
      // 0/전액 두 갈래를 없애고 **항상 정확한 잔여액(deductThis)으로 패치**한다.
      // (전액 케이스는 deductThis == min(income, 250만)이라 종전 엔진 경로와 결과가 같다.)
      const taxBaseAfterDeduction = Math.floor(Math.max(0, income - deductThis));
      const rateResult = applyStockTaxRate(
        taxBaseAfterDeduction,
        r.taxCategory,
        input.isSmallMediumEnterprise,
        r.isShortTermHolding,
        r.isExempt, // 비과세 분기 산식 echo
      );
      const newCalculatedTax = floorTen(rateResult.calculatedTax);
      const newFinalize = finalizeStockTax(newCalculatedTax, input);
      return {
        ...r,
        basicDeduction: deductThis,
        taxBase: taxBaseAfterDeduction,
        appliedRate: rateResult.appliedRate,
        progressiveDeduction: rateResult.progressiveDeduction,
        calculatedTax: newCalculatedTax,
        underReportPenalty: newFinalize.underReportPenalty,
        latePaymentPenalty: newFinalize.latePaymentPenalty,
        electronicFilingCredit: newFinalize.electronicFilingCredit,
        finalTax: newFinalize.finalTax,
        localIncomeTax: newFinalize.localIncomeTax,
      };
    } else {
      // 기타자산 그룹: realEstateGroupBasicDeductionUsed로 직접 제어
      const adjustedInput: StockTransferInput = {
        ...input,
        realEstateGroupBasicDeductionUsed: otherAssetUsed,
      };
      const recalc = calculateStockTransferTaxInternal(adjustedInput);
      otherAssetUsed += recalc.basicDeduction;
      return recalc;
    }
  });

  const totalTransferIncome = processedItems.reduce((s, r) => s + r.transferIncome, 0);

  // §104⑤ 비교과세 — 기타자산 그룹만 호별 합산으로 다시 낸다(위 함수 주석 참조).
  // 주식 그룹은 §104⑤ 대상이 아니라 종전대로 단건 합계다.
  const otherAssetComparativeTax = computeOtherAssetComparativeTax(processedItems, inputs);
  const totalCalculatedTax =
    processedItems.reduce((s, r) => s + r.calculatedTax, 0) +
    (otherAssetComparativeTax
      ? otherAssetComparativeTax.aggregatedTax - otherAssetComparativeTax.itemSumTax
      : 0);

  // 가산세는 **자산별 단건 값의 합**을 유지한다 — 부동산 정본과 같은 방침
  // (`transfer-tax-aggregate.ts` "자산별 가산세는 단건 엔진이 처리, aggregate는 합산만 수행").
  const totalUnderReportPenalty = processedItems.reduce((s, r) => s + r.underReportPenalty, 0);

  // 전자신고 공제는 합산 1회
  const anyElectronic = inputs.some((inp) => inp.isElectronicFiling);
  const electronicFilingCredit = anyElectronic && totalCalculatedTax > 0 ? 20_000 : 0;

  const totalFinalTax = Math.max(
    0,
    floorTen(totalCalculatedTax + totalUnderReportPenalty - electronicFilingCredit),
  );
  const totalLocalIncomeTax = Math.floor((totalCalculatedTax * 0.10) / 10) * 10;

  return {
    items: processedItems,
    totalTransferIncome,
    basicDeductionByGroup: {
      stock: stockBasicDeduction,
      real_estate_and_other_asset: otherAssetBasicDeduction,
    },
    totalTaxBase: processedItems.reduce((s, r) => s + r.taxBase, 0),
    totalCalculatedTax,
    ...(otherAssetComparativeTax ? { otherAssetComparativeTax } : {}),
    totalUnderReportPenalty,
    electronicFilingCredit,
    totalFinalTax,
    totalLocalIncomeTax,
    totalSecuritiesTransactionTax: sumSecuritiesTransactionTax(processedItems),
  };
}
