/**
 * §104⑤ 크로스 합산 **어댑터** — 저장된 이력(`resultData`)을 `Cross1045Input`으로 옮긴다.
 *
 * 계획서: `docs/00-pm/cross-104-5-c3-ui-design.plan.md` **C-3b** (§4.3)
 *
 * ── 이 파일이 하는 일 / 하지 않는 일 ──────────────────────────────────
 * ✅ 이력 `resultData`의 **세 가지 형태**를 판별해 호별 값을 추출한다.
 * ❌ **세액을 계산하지 않는다.** 저장된 값을 읽어 모양만 바꾼다 — 계산은 전부
 *    `computeCross1045`(`lib/tax-engine/comparative-104-5-cross.ts`)가 한다.
 * ❌ **네트워크를 타지 않는다.** 순수 함수라 단위 테스트가 쉽다. 재계산이 필요한 경우
 *    (부동산 단건 `mode:"single"`)는 **신호만 반환**하고 호출자가 처리한다.
 *
 * ## `resultData` 세 형태 (실측)
 *
 * | 출처 | 저장 형태 | 호별 값 |
 * |---|---|---|
 * | 부동산 **다자산** `/calc/transfer-tax/multi` | `AggregateTransferResult` (직접) | ✅ 있다 |
 * | 부동산 **단건** `/calc/transfer-tax` | `{ mode, result, aggregated? }` (`TransferAPIResult`) | `mode`별로 다름 |
 * | 주식 `/calc/stock-transfer-tax` | `StockTransferResult` (직접) | ✅ C-3a에서 추가 |
 *
 * 부동산 단건은 `mode`가 셋이다:
 * - `"bundled"` — 일괄양도 자동 안분. **`aggregated`(= `AggregateTransferResult`)를 품고 있어** 쓸 수 있다.
 * - `"single"` — 자산 1건. `TransferTaxResult`에는 **호 정보가 없다**(`candidateClauses` 미노출 ·
 *   `appliedRate`로 역추론 불가) ⇒ **`needsRecalc`** 를 돌려주고, 호출자가 `inputData`(폼)를
 *   다자산 API로 다시 태운다(`PropertyItem.form`이 `TransferFormData`를 그대로 담는다).
 * - `"mixed-use"` — 겸용주택. 위와 같은 이유로 `needsRecalc`.
 */
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { Cross1045Input } from "@/lib/tax-engine/comparative-104-5-cross";

/** 한쪽 엔진에서 뽑아낸 §104⑤ 재료 */
export interface CrossSide {
  /** 그 엔진의 양도소득과세표준 합계 */
  taxBase: number;
  /** §104①1호 버킷 과세표준·세액 */
  clause1TaxBase: number;
  clause1Tax: number;
  /** 부동산 §104①8호 / 기타자산 §104①9호 과세표준·세액 */
  nblClauseTaxBase: number;
  nblClauseTax: number;
  /**
   * §104⑤**2호** 산출세액 — **1호와 MAX를 취하기 전** 값이다.
   * ⚠️ 부동산은 `calculatedTaxByGroups`이지 `calculatedTax`가 아니다(후자는 이미 비교 후).
   */
  clause2Tax: number;
}

/** 어댑터 결과 — 재계산이 필요하면 `needsRecalc` */
export type CrossExtract =
  | { ok: true; side: CrossSide }
  | { ok: false; needsRecalc: true; reason: string };

/**
 * 이력 `resultData`가 부동산 **다자산 결과**인가.
 * `mode` 래핑(`TransferAPIResult`)과 구별하는 유일한 신호가 이 두 필드다.
 */
function isAggregate(v: Record<string, unknown>): boolean {
  return "groupTaxes" in v && "calculatedTaxByGroups" in v;
}

/**
 * 부동산 이력 `resultData` → `CrossSide`.
 *
 * 다자산 결과(또는 `mode:"bundled"`의 `aggregated`)만 호별 값을 갖는다.
 */
export function extractRealEstateSide(resultData: Record<string, unknown>): CrossExtract {
  const agg = isAggregate(resultData)
    ? (resultData as unknown as AggregateTransferResult)
    : pickBundledAggregate(resultData);

  if (!agg) {
    const mode = typeof resultData.mode === "string" ? resultData.mode : "unknown";
    return {
      ok: false,
      needsRecalc: true,
      reason:
        `부동산 계산이 «${mode}» 형태라 §104① 호별 값이 없습니다. ` +
        `저장된 입력으로 다시 계산해야 합니다.`,
    };
  }

  return {
    ok: true,
    side: {
      taxBase: agg.taxBase,
      clause1TaxBase: agg.clause1BucketTaxBase,
      clause1Tax: agg.clause1BucketTax,
      nblClauseTaxBase: agg.clause8TaxBase,
      nblClauseTax: agg.clause8Tax,
      // §104⑤2호 — MAX 전 값
      clause2Tax: agg.calculatedTaxByGroups,
    },
  };
}

/** `mode:"bundled"` 응답이 품고 있는 `aggregated`를 꺼낸다(없으면 null) */
function pickBundledAggregate(v: Record<string, unknown>): AggregateTransferResult | null {
  const inner = v.aggregated;
  if (inner && typeof inner === "object" && isAggregate(inner as Record<string, unknown>)) {
    return inner as unknown as AggregateTransferResult;
  }
  return null;
}

/**
 * 주식 이력 `resultData`(단건 `StockTransferResult`) → `CrossSide`.
 *
 * ⚠️ 주식 마법사는 **단건 엔드포인트**를 쓴다(다자산 UI 미연결). 그래서 자산이 하나뿐이고
 *   「버킷」은 곧 그 종목이다 — C-3a가 `clause1Bucket*`·`clause9*`를 무조건 실어 둔다.
 * 🔒 **주식(§94①3호)은 §104⑤ 대상이 아니다** — 그 경우 호별 값이 전부 0이라 합산에 기여하지
 *   않는다. 다만 `taxBase`까지 0으로 두면 §104⑤1호가 과소가 되므로, **대상이 아닌 종목은
 *   애초에 후보로 고르지 못하게** 하는 것이 호출자(화면) 책임이다.
 */
export function extractOtherAssetSide(resultData: Record<string, unknown>): CrossExtract {
  const r = resultData as unknown as StockTransferResult;
  if (typeof r.clause1BucketTaxBase !== "number" || typeof r.clause9TaxBase !== "number") {
    return {
      ok: false,
      needsRecalc: true,
      reason:
        "기타자산 계산에 §104① 호별 값이 없습니다(구 버전 이력). 다시 계산해야 합니다.",
    };
  }
  if (r.basicDeductionGroup !== "real_estate_and_other_asset") {
    return {
      ok: false,
      needsRecalc: true,
      reason: "이 계산은 주식(§94①3호)이라 §104⑤ 합산 대상이 아닙니다.",
    };
  }
  return {
    ok: true,
    side: {
      taxBase: r.taxBase,
      clause1TaxBase: r.clause1BucketTaxBase,
      clause1Tax: r.clause1BucketTax,
      nblClauseTaxBase: r.clause9TaxBase,
      nblClauseTax: r.clause9Tax,
      // 단건이라 §104⑤ 비교 자체가 없다 — 산출세액이 곧 2호다.
      clause2Tax: r.calculatedTax,
    },
  };
}

/**
 * 양쪽 `CrossSide` → `Cross1045Input`.
 *
 * `otherClausesTax` = **양쪽 2호 합 − 1호 버킷 세액 − 8·9호 세액**.
 * 즉 「재합산할 호를 걷어낸 나머지」이며, 각 엔진이 낸 값을 그대로 쓴다(재계산 없음).
 */
export function buildCross1045Input(args: {
  realEstate: CrossSide;
  otherAsset: CrossSide;
  basicBrackets: Cross1045Input["basicBrackets"];
  nbl89Brackets: Cross1045Input["nbl89Brackets"];
  reduction?: Cross1045Input["reduction"];
}): Cross1045Input {
  const { realEstate: re, otherAsset: oa, basicBrackets, nbl89Brackets, reduction } = args;

  const otherClausesTax =
    re.clause2Tax - re.clause1Tax - re.nblClauseTax +
    (oa.clause2Tax - oa.clause1Tax - oa.nblClauseTax);

  return {
    totalTaxBase: re.taxBase + oa.taxBase,
    realEstateClause1TaxBase: re.clause1TaxBase,
    otherAssetClause1TaxBase: oa.clause1TaxBase,
    clause8TaxBase: re.nblClauseTaxBase,
    clause9TaxBase: oa.nblClauseTaxBase,
    otherClausesTax,
    basicBrackets,
    nbl89Brackets,
    ...(reduction ? { reduction } : {}),
  };
}
