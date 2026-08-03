/**
 * §104⑤ 크로스 합산 어댑터 — 이력 `resultData` 3형태 판별 + `Cross1045Input` 조립 (C-3b)
 *
 * 계획서: `docs/00-pm/cross-104-5-c3-ui-design.plan.md` §4.3
 *
 * ── 무엇을 고정하는가 ──────────────────────────────────────────────────
 * 어댑터는 **세액을 계산하지 않는다**. 저장된 값을 읽어 모양만 바꾸고, 호별 값이 없는 형태
 * (부동산 단건 `mode:"single"`·`"mixed-use"`)는 **`needsRecalc` 신호**를 낸다.
 * 그 판별을 틀리면 §104⑤이 **조용히 0으로** 합산되므로 형태별 전수를 고정한다.
 */
import { describe, it, expect } from "vitest";
import {
  extractRealEstateSide,
  extractOtherAssetSide,
  buildCross1045Input,
  type CrossSide,
} from "@/lib/calc/cross-104-5-adapter";
import { computeCross1045 } from "@/lib/tax-engine/comparative-104-5-cross";
import {
  BASIC_PROGRESSIVE_BRACKETS,
  NBL_HEAVY_CORP_BRACKETS,
} from "@/lib/tax-engine/stock-transfer/stock-rate-tables";

/** 부동산 다자산 결과의 최소 형태 */
function aggregateResult(o: Partial<Record<string, number>> = {}) {
  return {
    groupTaxes: [],
    calculatedTaxByGroups: 138_060_000,
    calculatedTaxByGeneral: 0,
    calculatedTax: 138_060_000,
    taxBase: 410_000_000,
    clause1BucketTaxBase: 410_000_000,
    clause1BucketTax: 138_060_000,
    clause8TaxBase: 0,
    clause8Tax: 0,
    ...o,
  } as unknown as Record<string, unknown>;
}

/** 주식 단건 결과의 최소 형태 */
function stockResult(o: Partial<Record<string, unknown>> = {}) {
  return {
    basicDeductionGroup: "real_estate_and_other_asset",
    taxBase: 297_500_000,
    calculatedTax: 93_110_000,
    clause1BucketTaxBase: 297_500_000,
    clause1BucketTax: 93_110_000,
    clause9TaxBase: 0,
    clause9Tax: 0,
    ...o,
  } as unknown as Record<string, unknown>;
}

describe("어댑터 — 부동산 `resultData` 형태 판별", () => {
  it("R-1: **다자산 결과**(직접 저장)는 그대로 읽는다", () => {
    const r = extractRealEstateSide(aggregateResult());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.side.taxBase).toBe(410_000_000);
    expect(r.side.clause1TaxBase).toBe(410_000_000);
    expect(r.side.clause1Tax).toBe(138_060_000);
    // ⚠️ 2호는 `calculatedTaxByGroups`다 — `calculatedTax`(MAX 후)를 쓰면 비교가 두 번 걸린다.
    expect(r.side.clause2Tax).toBe(138_060_000);
  });

  it("R-2: ⚠️ 2호는 **MAX 전** 값이다 — `calculatedTax`와 갈리는 케이스", () => {
    const r = extractRealEstateSide(
      aggregateResult({ calculatedTaxByGroups: 100_000_000, calculatedTax: 174_060_000 }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.side.clause2Tax).toBe(100_000_000);
    expect(r.side.clause2Tax).not.toBe(174_060_000);
  });

  it("R-3: `mode:\"bundled\"`는 품고 있는 `aggregated`를 꺼낸다", () => {
    const r = extractRealEstateSide({ mode: "bundled", aggregated: aggregateResult() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.side.clause1TaxBase).toBe(410_000_000);
  });

  it("R-4: 🔒 `mode:\"single\"`은 **재계산 필요** — 호 정보가 없다", () => {
    const r = extractRealEstateSide({ mode: "single", result: { calculatedTax: 50_000_000 } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.needsRecalc).toBe(true);
    expect(r.reason).toContain("single");
  });

  it("R-5: 🔒 `mode:\"mixed-use\"`도 재계산 필요", () => {
    const r = extractRealEstateSide({ mode: "mixed-use", result: {} });
    expect(r.ok).toBe(false);
  });
});

describe("어댑터 — 주식 `resultData`", () => {
  it("S-1: 기타자산 단건을 읽는다", () => {
    const r = extractOtherAssetSide(stockResult());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.side.taxBase).toBe(297_500_000);
    expect(r.side.clause1TaxBase).toBe(297_500_000);
    expect(r.side.nblClauseTaxBase).toBe(0);
    // 단건은 §104⑤ 비교 자체가 없어 산출세액이 곧 2호다.
    expect(r.side.clause2Tax).toBe(93_110_000);
  });

  it("S-2: 9호 종목", () => {
    const r = extractOtherAssetSide(
      stockResult({
        clause1BucketTaxBase: 0, clause1BucketTax: 0,
        clause9TaxBase: 297_500_000, clause9Tax: 122_860_000,
        calculatedTax: 122_860_000,
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.side.nblClauseTaxBase).toBe(297_500_000);
    expect(r.side.clause1TaxBase).toBe(0);
  });

  it("S-3: 🔒 **주식 그룹(§94①3호)은 대상이 아니다**", () => {
    const r = extractOtherAssetSide(stockResult({ basicDeductionGroup: "stock" }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("§94①3호");
  });

  it("S-4: 🔒 **구 버전 이력**(호별 필드 없음)은 재계산 필요", () => {
    const old = { basicDeductionGroup: "real_estate_and_other_asset", taxBase: 1, calculatedTax: 1 };
    const r = extractOtherAssetSide(old as unknown as Record<string, unknown>);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.needsRecalc).toBe(true);
  });
});

describe("어댑터 — `Cross1045Input` 조립 + 도출값", () => {
  const brackets = {
    basicBrackets: BASIC_PROGRESSIVE_BRACKETS,
    nbl89Brackets: NBL_HEAVY_CORP_BRACKETS,
  };

  it("B-1: `otherClausesTax`는 **재합산 대상 호를 걷어낸 나머지**다", () => {
    const realEstate: CrossSide = {
      taxBase: 500_000_000,
      clause1TaxBase: 200_000_000, clause1Tax: 56_060_000,
      nblClauseTaxBase: 300_000_000, nblClauseTax: 124_060_000,
      clause2Tax: 200_120_000, // 56,060,000 + 124,060,000 + 20,000,000(단기 등)
    };
    const otherAsset: CrossSide = {
      taxBase: 200_000_000,
      clause1TaxBase: 200_000_000, clause1Tax: 56_060_000,
      nblClauseTaxBase: 0, nblClauseTax: 0,
      clause2Tax: 56_060_000,
    };
    const input = buildCross1045Input({ realEstate, otherAsset, ...brackets });
    // (200,120,000 − 56,060,000 − 124,060,000) + (56,060,000 − 56,060,000 − 0) = 20,000,000
    expect(input.otherClausesTax).toBe(20_000_000);
    expect(input.totalTaxBase).toBe(700_000_000);
    expect(input.realEstateClause1TaxBase).toBe(200_000_000);
    expect(input.otherAssetClause1TaxBase).toBe(200_000_000);
    expect(input.clause8TaxBase).toBe(300_000_000);
    expect(input.clause9TaxBase).toBe(0);
  });

  it("B-2: ⭐ **1호 교차 합산이 세액을 올린다** (누진 볼록성)", () => {
    const side = (base: number): CrossSide => ({
      taxBase: base,
      clause1TaxBase: base,
      clause1Tax: 0, // otherClausesTax를 0으로 만들기 위해 2호와 맞춘다
      nblClauseTaxBase: 0, nblClauseTax: 0,
      clause2Tax: 0,
    });
    const input = buildCross1045Input({
      realEstate: side(200_000_000),
      otherAsset: side(200_000_000),
      ...brackets,
    });
    const r = computeCross1045(input);
    expect(input.otherClausesTax).toBe(0);
    // 합산: 400,000,000 × 40% − 25,940,000 = 134,060,000
    expect(r.merged1Tax).toBe(134_060_000);
    // 따로: (200,000,000 × 38% − 19,940,000) × 2 = 56,060,000 × 2 = 112,120,000
    expect(r.separate1Tax).toBe(112_120_000);
    expect(r.merged1Tax - r.separate1Tax).toBe(21_940_000);
    // 1호(전체 합계 누진)와 2호(1호 버킷만 합산)가 같아진다 — 다른 호가 없으므로.
    expect(r.clause1Tax).toBe(134_060_000);
    expect(r.clause2Tax).toBe(134_060_000);
  });

  it("B-3: 🔒 1호가 한쪽에만 있으면 합산해도 **변화 없다**", () => {
    const input = buildCross1045Input({
      realEstate: {
        taxBase: 200_000_000, clause1TaxBase: 200_000_000, clause1Tax: 56_060_000,
        nblClauseTaxBase: 0, nblClauseTax: 0, clause2Tax: 56_060_000,
      },
      otherAsset: {
        taxBase: 300_000_000, clause1TaxBase: 0, clause1Tax: 0,
        nblClauseTaxBase: 300_000_000, nblClauseTax: 124_060_000, clause2Tax: 124_060_000,
      },
      ...brackets,
    });
    const r = computeCross1045(input);
    expect(r.merged1Tax).toBe(r.separate1Tax);
    expect(r.merged1Tax).toBe(56_060_000);
  });

  it("B-4: ⭐ 통합 도출값 — 부동산(1호+8호) × 기타자산(1호+9호)", () => {
    const input = buildCross1045Input({
      realEstate: {
        taxBase: 443_500_000,
        clause1TaxBase: 200_000_000, clause1Tax: 56_060_000,
        nblClauseTaxBase: 243_500_000, nblClauseTax: 96_940_000,
        clause2Tax: 153_000_000,
      },
      otherAsset: {
        taxBase: 500_000_000,
        clause1TaxBase: 200_000_000, clause1Tax: 56_060_000,
        nblClauseTaxBase: 300_000_000, nblClauseTax: 124_060_000,
        clause2Tax: 180_120_000,
      },
      ...brackets,
    });
    expect(input.otherClausesTax).toBe(0);
    const r = computeCross1045(input);
    // 1호 버킷 합산 400,000,000 → 134,060,000
    expect(r.merged1Tax).toBe(134_060_000);
    // 8호+9호 합산 543,500,000 → 52% − 35,940,000 = 246,680,000 (C-2 도출값과 동일)
    expect(r.merged89Tax).toBe(246_680_000);
    expect(r.clause2Tax).toBe(380_740_000);
    // 1호: 943,500,000 × 42% − 35,940,000 = 360,330,000
    expect(r.clause1Tax).toBe(360_330_000);
    expect(r.applied).toBe("clause2");
    expect(r.calculatedTax).toBe(380_740_000);
    // 현행(교차 미적용) = 153,000,000 + 180,120,000 = 333,120,000 ⇒ 47,620,000 과소
    expect(r.calculatedTax - (153_000_000 + 180_120_000)).toBe(47_620_000);
  });
});
