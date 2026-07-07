/**
 * 신고서 양식 — 토지·건물 소유자 분리(selfOwns) 표시 앵커.
 *
 * 계획서: docs/02-design/features/transfer-filing-form-self-owns-split-fix.plan.md
 * 버그①: selfOwns="building_only"인데 토지 컬럼이 표시됨 (deriveColumns가 selfOwns 미검사).
 * 버그②: taxableRatio 분모가 land.gain+building.gain(토지 포함)이라 과세대상양도차익 분할 오염.
 * 엔진은 selfOwns를 정확히 처리(land.longTermDeduction=0, result.taxableGain=건물분) — UI 표시만 수정.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const rates = makeMockRates();

// 상가건물(비-비과세) 토지·건물 분리 — 실지 분리 입력.
//   건물: 양도 100M / 취득 60M → 건물 gain 40M
//   토지: 양도 400M / 취득 240M → 토지 gain 160M
//   양도가액 합계 = 500M, 취득가액 합계 = 300M
function splitInput(selfOwns: "both" | "building_only" | "land_only"): TransferTaxInput {
  return baseTransferInput({
    propertyType: "building",
    isOneHousehold: false,
    householdHousingCount: 0,
    transferPrice: 500_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: new Date("1999-05-20"),
    transferDate: new Date("2026-02-16"),
    landAcquisitionDate: new Date("1999-05-20"),
    landSplitMode: "actual",
    landTransferPrice: 400_000_000,
    buildingTransferPrice: 100_000_000,
    landAcquisitionPrice: 240_000_000,
    buildingAcquisitionPrice: 60_000_000,
    landDirectExpenses: 0,
    buildingDirectExpenses: 0,
    // calcApportionRatio 가드 통과용 (명시 가액이 override하므로 값에는 무영향).
    standardPriceAtAcquisition: 100_000_000,
    standardPricePerSqmAtAcquisition: 800_000,
    acquisitionArea: 100,
    selfOwns,
  });
}

// RowDef는 label로 식별.
const ROW_LABELS: Record<string, string> = {
  transferPrice: "양도가액",
  acquisitionPrice: "취득가액",
  expenses: "필요경비",
  transferGain: "전체 양도차익",
  taxableGain: "과세대상 양도차익",
  incomeAmount: "양도소득금액",
};
function rowVal(rows: ReturnType<typeof buildRows>, key: string, col: string) {
  const r = rows.find((x) => x.label === ROW_LABELS[key]);
  return r?.values[col as keyof typeof r.values] ?? null;
}

describe("신고서 양식 selfOwns 분리 (Pre-Do anchor)", () => {
  // A0: 엔진은 selfOwns를 정확히 처리 (전제 확증)
  it("A0 엔진 building_only — result.taxableGain=건물분, land.longTermDeduction=0", () => {
    const r = calculateTransferTax(splitInput("building_only"), rates);
    expect(r.splitDetail).toBeDefined();
    expect(r.splitDetail!.selfOwns).toBe("building_only");
    expect(r.splitDetail!.building.gain).toBe(40_000_000);
    expect(r.splitDetail!.land.gain).toBe(160_000_000);
    // 엔진 합계는 건물분만
    expect(r.transferGain).toBe(40_000_000);
    // 토지분 LTHD는 0 (엔진이 이미 정확)
    expect(r.splitDetail!.land.longTermDeduction).toBe(0);
  });

  // A1: 컬럼 — building_only는 토지 컬럼이 없어야 함 (버그①)
  it("A1 building_only — deriveColumns가 토지 컬럼 제외 [합계, 건물]", () => {
    const r = calculateTransferTax(splitInput("building_only"), rates);
    const { mode, columns } = deriveColumns(r);
    expect(mode).toBe("split-2col");
    const keys = columns.map((c) => c.key);
    expect(keys).toContain("total");
    expect(keys).toContain("building");
    expect(keys).not.toContain("land"); // ← 현재 RED: 토지 컬럼이 붙어 있음
  });

  // A2: 재무 분할 — 합계=건물분 자기정합 + 건물 과세대상=엔진값 (버그②)
  it("A2 building_only — 합계 양도가/취득가/경비=건물분, 자기정합, 과세대상 오염 없음", () => {
    const r = calculateTransferTax(splitInput("building_only"), rates);
    const { mode } = deriveColumns(r);
    const rows = buildRows(r, mode, undefined, undefined, 500_000_000);

    // 합계는 건물분만 (토지 미포함)
    expect(rowVal(rows, "transferPrice", "total")).toBe(100_000_000);
    expect(rowVal(rows, "acquisitionPrice", "total")).toBe(60_000_000);
    expect(rowVal(rows, "expenses", "total")).toBe(0);
    // 자기정합: 양도가액 − 취득가액 − 필요경비 = 전체 양도차익
    const tp = rowVal(rows, "transferPrice", "total") as number;
    const acq = rowVal(rows, "acquisitionPrice", "total") as number;
    const exp = (rowVal(rows, "expenses", "total") as number) ?? 0;
    expect(tp - acq - exp).toBe(rowVal(rows, "transferGain", "total"));
    // 건물 과세대상양도차익 = 엔진 result.taxableGain (분모 오염 시 축소됨)
    expect(rowVal(rows, "taxableGain", "building")).toBe(r.taxableGain);
    expect(rowVal(rows, "taxableGain", "total")).toBe(r.taxableGain);
  });

  // A3: both 무회귀 — 컬럼 3개 + 합계는 override(500M) 유지
  it("A3 both 무회귀 — 컬럼 [합계,토지,건물], 합계 양도가액=전체 500M", () => {
    const r = calculateTransferTax(splitInput("both"), rates);
    const { columns } = deriveColumns(r);
    const keys = columns.map((c) => c.key);
    expect(keys).toEqual(["total", "land", "building"]);
    const rows = buildRows(r, "split-2col", undefined, undefined, 500_000_000);
    expect(rowVal(rows, "transferPrice", "total")).toBe(500_000_000);
    expect(rowVal(rows, "acquisitionPrice", "total")).toBe(300_000_000);
  });

  // A4: land_only 대칭 — 건물 컬럼 제외
  it("A4 land_only — deriveColumns가 건물 컬럼 제외 [합계, 토지]", () => {
    const r = calculateTransferTax(splitInput("land_only"), rates);
    const { columns } = deriveColumns(r);
    const keys = columns.map((c) => c.key);
    expect(keys).toContain("total");
    expect(keys).toContain("land");
    expect(keys).not.toContain("building");
  });
});
