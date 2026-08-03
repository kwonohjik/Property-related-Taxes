/**
 * §104⑤ 크로스 — 이력 후보 선별 (C-3c)
 *
 * 계획서: `docs/00-pm/cross-104-5-c3-ui-design.plan.md` §4.2 · O-3
 *
 * ── 무엇을 고정하는가 ──────────────────────────────────────────────────
 * 과세연도는 **세 경로가 서로 다른 자리**에 둔다(다자산 `inputData.taxYear` · 단건
 * `inputData.transferDate` · 주식 `extractStockTransferDate`). 하나라도 못 뽑으면 그 이력은
 * **조용히 후보에서 사라진다** — 사용자는 「내 계산이 왜 안 보이지」로 겪는다.
 */
import { describe, it, expect } from "vitest";
import {
  extractTaxYear,
  buildRealEstateCandidates,
  buildOtherAssetCandidates,
  crossableYears,
  detectBasicDeductionOverlap,
} from "@/lib/calc/cross-104-5-history";
import type { CalculationRecord, LocalTaxType } from "@/lib/storage/types";

function rec(
  taxType: LocalTaxType,
  inputData: Record<string, unknown>,
  resultData: Record<string, unknown> = {},
  o: Partial<CalculationRecord> = {},
): CalculationRecord {
  return {
    id: `${taxType}-${JSON.stringify(inputData).slice(0, 12)}`,
    userId: "local-user",
    taxType,
    title: "테스트",
    inputData,
    resultData,
    taxLawVersion: "2024",
    createdAt: new Date("2024-07-01").toISOString(),
    ...o,
  } as unknown as CalculationRecord;
}

const aggResult = (o: Record<string, unknown> = {}) => ({
  groupTaxes: [],
  calculatedTaxByGroups: 100_000_000,
  calculatedTax: 100_000_000,
  taxBase: 300_000_000,
  clause1BucketTaxBase: 300_000_000,
  clause1BucketTax: 100_000_000,
  clause8TaxBase: 0,
  clause8Tax: 0,
  basicDeduction: 2_500_000,
  ...o,
});

const stockResult = (o: Record<string, unknown> = {}) => ({
  basicDeductionGroup: "real_estate_and_other_asset",
  taxBase: 200_000_000,
  calculatedTax: 56_060_000,
  clause1BucketTaxBase: 200_000_000,
  clause1BucketTax: 56_060_000,
  clause9TaxBase: 0,
  clause9Tax: 0,
  basicDeduction: 2_500_000,
  ...o,
});

describe("과세연도 추출 (O-3) — 세 경로", () => {
  it("Y-1: 부동산 **다자산**은 `inputData.taxYear`(number)", () => {
    expect(extractTaxYear(rec("transfer", { __multiTransfer: true, taxYear: 2023 }))).toBe(2023);
  });

  it("Y-2: 부동산 **단건**은 `inputData.transferDate`", () => {
    expect(extractTaxYear(rec("transfer", { transferDate: "2022-05-10" }))).toBe(2022);
  });

  it("Y-3: **주식**은 `extractStockTransferDate`", () => {
    expect(
      extractTaxYear(rec("stock_transfer", { transferDate: "2024-03-02" })),
    ).toBe(2024);
  });

  it("Y-4: 아무것도 없으면 `taxLawVersion`으로 최후 시도", () => {
    expect(extractTaxYear(rec("transfer", {}, {}, { taxLawVersion: "2021" }))).toBe(2021);
  });
});

describe("후보 선별", () => {
  it("C-1: 부동산 다자산 이력은 곧바로 쓸 수 있다", () => {
    const cs = buildRealEstateCandidates([rec("transfer", { taxYear: 2024 }, aggResult())]);
    expect(cs).toHaveLength(1);
    expect(cs[0].taxYear).toBe(2024);
    expect(cs[0].extract.ok).toBe(true);
  });

  it("C-2: 부동산 **단건**은 목록에 남되 「다시 계산」 사유가 붙는다", () => {
    const cs = buildRealEstateCandidates([
      rec("transfer", { transferDate: "2024-01-01" }, { mode: "single", result: {} }),
    ]);
    expect(cs).toHaveLength(1);
    expect(cs[0].extract.ok).toBe(false);
    if (cs[0].extract.ok) return;
    expect(cs[0].extract.needsRecalc).toBe(true);
  });

  it("C-3: 🔒 **주식(§94①3호)은 후보에서 아예 제외**된다 (다시 계산해도 대상이 아니다)", () => {
    const cs = buildOtherAssetCandidates([
      rec("stock_transfer", { transferDate: "2024-03-02" },
        stockResult({ basicDeductionGroup: "stock" })),
    ]);
    expect(cs).toHaveLength(0);
  });

  it("C-4: 기타자산 **구 버전 이력**은 남되 「다시 계산」 대상이다", () => {
    const cs = buildOtherAssetCandidates([
      rec("stock_transfer", { transferDate: "2024-03-02" },
        { basicDeductionGroup: "real_estate_and_other_asset", taxBase: 1, calculatedTax: 1 }),
    ]);
    expect(cs).toHaveLength(1);
    expect(cs[0].extract.ok).toBe(false);
  });

  it("C-5: 세목이 다르면 섞이지 않는다", () => {
    const records = [
      rec("transfer", { taxYear: 2024 }, aggResult()),
      rec("stock_transfer", { transferDate: "2024-03-02" }, stockResult()),
      rec("gift", { taxYear: 2024 }),
    ];
    expect(buildRealEstateCandidates(records)).toHaveLength(1);
    expect(buildOtherAssetCandidates(records)).toHaveLength(1);
  });
});

describe("합산 가능 연도", () => {
  it("Yr-1: **양쪽에 다 있는 연도만** 내림차순", () => {
    const re = buildRealEstateCandidates([
      rec("transfer", { taxYear: 2022 }, aggResult()),
      rec("transfer", { taxYear: 2024 }, aggResult()),
    ]);
    const oa = buildOtherAssetCandidates([
      rec("stock_transfer", { transferDate: "2024-03-02" }, stockResult()),
      rec("stock_transfer", { transferDate: "2023-03-02" }, stockResult()),
    ]);
    expect(crossableYears(re, oa)).toEqual([2024]);
  });

  it("Yr-2: 한쪽만 있으면 빈 배열", () => {
    const re = buildRealEstateCandidates([rec("transfer", { taxYear: 2024 }, aggResult())]);
    expect(crossableYears(re, [])).toEqual([]);
  });

  it("Yr-3: ⚠️ **「다시 계산」 대상도 연도 후보에는 포함**된다 — 재계산하면 쓸 수 있으므로", () => {
    const re = buildRealEstateCandidates([
      rec("transfer", { transferDate: "2024-01-01" }, { mode: "single", result: {} }),
    ]);
    const oa = buildOtherAssetCandidates([
      rec("stock_transfer", { transferDate: "2024-03-02" }, stockResult()),
    ]);
    expect(crossableYears(re, oa)).toEqual([2024]);
  });
});

describe("§103② 기본공제 중복 감지 (R-2)", () => {
  it("B-1: 양쪽이 각각 250만원을 쓰면 250만원 초과", () => {
    const r = detectBasicDeductionOverlap({
      realEstateBasicDeduction: 2_500_000,
      otherAssetBasicDeduction: 2_500_000,
    });
    expect(r.total).toBe(5_000_000);
    expect(r.exceeded).toBe(true);
    expect(r.excess).toBe(2_500_000);
  });

  it("B-2: 합계가 한도 이하이면 초과 아님", () => {
    const r = detectBasicDeductionOverlap({
      realEstateBasicDeduction: 2_500_000,
      otherAssetBasicDeduction: 0,
    });
    expect(r.exceeded).toBe(false);
    expect(r.excess).toBe(0);
  });
});
