/**
 * 겸용주택 신고서 양식 — 주택분·상가분을 토지/건물 4분할 표시 앵커.
 *
 * 계획서: docs/02-design/features/mixed-use-filing-form-land-building-split.plan.md
 * 변경: 일반 겸용주택 신고서 표를 [합계·주택부분·상가부분] 3열 → [합계·주택분토지·주택분건물·상가분토지·상가분건물] 5열.
 * 엔진 무변경 — MixedUseHousingPart/CommercialPart의 토지·건물 값을 표시 분할.
 *
 * anchor-A: deriveColumns → mode "mixed-4col", 컬럼 5개·라벨(토지-우선)
 * anchor-B: 정확-합 행(양도가액·취득가액·필요경비·양도차익) 4열 합 == 합계 (회귀 불변)
 * anchor-C: floor-안분 행(과세대상·장특·양도소득금액) 1원 tolerance 자기일관
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { mixedUseToFilingResult } from "@/components/calc/results/mixed-use/MixedUseResultCard";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import {
  mixedUseCase14,
  CASE14_TRANSFER_PRICE,
  CASE14_TRANSFER_DATE,
} from "../tax-engine/_helpers/mixed-use-fixture";

const rates = makeMockRates();

// 스크린샷 사례(사례14) — 23억, 취득일 분리(토지 1992 / 건물 1997).
const breakdown = calcMixedUseTransferTax(
  CASE14_TRANSFER_PRICE,
  CASE14_TRANSFER_DATE,
  mixedUseCase14(),
  rates,
);
const result = mixedUseToFilingResult(breakdown);

const ROW_LABELS: Record<string, string> = {
  transferPrice: "양도가액",
  acquisitionPrice: "취득가액",
  expenses: "필요경비",
  transferGain: "전체 양도차익",
  taxableGain: "과세대상 양도차익",
  ltDeduction: "장기보유특별공제",
  incomeAmount: "양도소득금액",
};
function rowVal(rows: ReturnType<typeof buildRows>, key: string, col: string): number {
  const r = rows.find((x) => x.label === ROW_LABELS[key]);
  const v = r?.values[col as keyof typeof r.values];
  return typeof v === "number" ? v : 0;
}
const COLS = ["housingLand", "housingBuilding", "commercialLand", "commercialBuilding"];
function colSum(rows: ReturnType<typeof buildRows>, key: string): number {
  return COLS.reduce((s, c) => s + rowVal(rows, key, c), 0);
}

describe("겸용주택 신고서 양식 4분할 (Pre-Do anchor)", () => {
  it("A0 전제: 엔진이 주택/상가 각각 토지·건물 분리값을 노출", () => {
    expect(breakdown.housingPart.landTransferGain).toBeTypeOf("number");
    expect(breakdown.housingPart.buildingTransferGain).toBeTypeOf("number");
    expect(breakdown.commercialPart.landTransferGain).toBeTypeOf("number");
    // 부분 내부 정합: land+building = part.transferGain
    const hp = breakdown.housingPart;
    expect(hp.landTransferGain + hp.buildingTransferGain).toBe(hp.transferGain);
  });

  it("A1 컬럼: mode='mixed-4col', 5열·토지-우선 라벨", () => {
    const { mode, columns } = deriveColumns(result);
    expect(mode).toBe("mixed-4col");
    expect(columns.map((c) => c.key)).toEqual([
      "total", "housingLand", "housingBuilding", "commercialLand", "commercialBuilding",
    ]);
    expect(columns.map((c) => c.label)).toEqual([
      "합계", "주택분 토지", "주택분 건물", "상가분 토지", "상가분 건물",
    ]);
  });

  it("A2 정확-합: 양도가액·취득가액·필요경비·양도차익 4열 합 == 합계 (정확 일치)", () => {
    const { mode } = deriveColumns(result);
    const rows = buildRows(result, mode, undefined, undefined, CASE14_TRANSFER_PRICE);
    // 양도가액 4열 합 == 총 양도가액
    expect(colSum(rows, "transferPrice")).toBe(rowVal(rows, "transferPrice", "total"));
    expect(rowVal(rows, "transferPrice", "total")).toBe(CASE14_TRANSFER_PRICE);
    // 취득가액·필요경비·전체양도차익 정확 일치
    expect(colSum(rows, "acquisitionPrice")).toBe(rowVal(rows, "acquisitionPrice", "total"));
    expect(colSum(rows, "expenses")).toBe(rowVal(rows, "expenses", "total"));
    expect(colSum(rows, "transferGain")).toBe(rowVal(rows, "transferGain", "total"));
  });

  it("A3 취득가액 회귀 불변: 4열 합 == 부분 estimatedAcquisitionPrice 합 (2열 시절 값)", () => {
    const { mode } = deriveColumns(result);
    const rows = buildRows(result, mode, undefined, undefined, CASE14_TRANSFER_PRICE);
    const legacyTotal =
      breakdown.housingPart.estimatedAcquisitionPrice + breakdown.commercialPart.estimatedAcquisitionPrice;
    expect(colSum(rows, "acquisitionPrice")).toBe(legacyTotal);
  });

  it("A4 floor-안분 1원 tolerance: 과세대상·장특·양도소득금액 4열 합 ≈ 합계 (±4원)", () => {
    const { mode } = deriveColumns(result);
    const rows = buildRows(result, mode, undefined, undefined, CASE14_TRANSFER_PRICE);
    for (const key of ["taxableGain", "ltDeduction", "incomeAmount"]) {
      const diff = Math.abs(colSum(rows, key) - rowVal(rows, key, "total"));
      expect(diff).toBeLessThanOrEqual(4);
    }
  });

  it("A5 상가분 비과세 없음: 상가 토지·건물 과세대상=양도차익, 비과세=0", () => {
    const { mode } = deriveColumns(result);
    const rows = buildRows(result, mode, undefined, undefined, CASE14_TRANSFER_PRICE);
    expect(rowVal(rows, "taxableGain", "commercialLand")).toBe(rowVal(rows, "transferGain", "commercialLand"));
    expect(rowVal(rows, "taxableGain", "commercialBuilding")).toBe(rowVal(rows, "transferGain", "commercialBuilding"));
  });
});
