/**
 * anchor — ⑫ Zod: `carryoverTaxation.giftAssumedDebt`(당초 증여 때 인수한 채무) 수락·거부 규칙을 **스키마 단독**으로 잠근다.
 * route 경로에서는 집계 파생 단위(`carryoverDebtShareOf`)가 같은 입력을 한 번 더 던져 스키마 규칙이 빠져도 400이 나므로(이중 방어선),
 * 스키마가 스스로 막는지는 여기서만 보인다. 설계서 §5·§6.2 ⑩⑫.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { refineCarryoverTaxation } from "@/lib/api/transfer-tax-schema-companion-refines";
import { carryoverTaxationEngineShape, rejectDebtPiecesKeyRefine } from "@/lib/api/transfer-tax-building-schemas";

const BASE = {
  propertyType: "housing", transferPrice: 1_500_000_000, transferDate: "2026-03-01", acquisitionPrice: 0, acquisitionDate: "2023-06-01", expenses: 0,
  useEstimatedAcquisition: false, householdHousingCount: 2, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
  isNonBusinessLand: false, isOneHousehold: false, reductions: [], annualBasicDeductionUsed: 0, residencePeriodMonths: 0, acquisitionCause: "carryover_gift",
};
const CT = { giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2000-06-01", donorAcquisitionPrice: 100_000_000, useEstimatedAcquisition: false, giftTaxAmount: 0, giftDateValuation: 1_000_000_000, donorRelation: "lineal" };
const parse = (over: Record<string, unknown> = {}, ct: Record<string, unknown> = {}) => propertySchema.safeParse({ ...BASE, ...over, carryoverTaxation: { ...CT, ...ct } });
const paths = (r: ReturnType<typeof parse>) => (r.success ? [] : r.error.issues.map((i) => i.path.join(".")));

describe("⑫ 단건 shape — 수락·거부", () => {
  it("채무 4억 수락 · 키 보존(침묵 strip 금지)", () => {
    const r = parse({}, { giftAssumedDebt: 400_000_000 });
    expect(r.success).toBe(true);
    expect(r.success && r.data.carryoverTaxation?.giftAssumedDebt).toBe(400_000_000);
  });
  it("채무 > 평가액 · 음수·비정수 거부", () => {
    expect(paths(parse({}, { giftAssumedDebt: 1_000_000_001 }))).toContain("carryoverTaxation.giftAssumedDebt");
    expect(parse({}, { giftAssumedDebt: -1 }).success).toBe(false);
    expect(parse({}, { giftAssumedDebt: 1.5 }).success).toBe(false);
  });
  it("채무 = 평가액인데 증여세 상당액·증여자 자본적지출이 있으면 거부 · 없으면 수락", () => {
    expect(paths(parse({}, { giftAssumedDebt: 1_000_000_000, giftTaxAmount: 1 }))).toContain("carryoverTaxation.giftAssumedDebt");
    expect(paths(parse({}, { giftAssumedDebt: 1_000_000_000, donorCapitalExpenditure: 1 }))).toContain("carryoverTaxation.giftAssumedDebt");
    expect(parse({}, { giftAssumedDebt: 1_000_000_000 }).success).toBe(true);
  });
  it("지원하지 않는 조합(분양권 · 소유자 분리)은 채무와 함께 거부 · 채무 0은 어느 조합에서도 막지 않는다", () => {
    expect(paths(parse({ propertyType: "presale_right" }, { giftAssumedDebt: 1 }))).toContain("carryoverTaxation.giftAssumedDebt");
    expect(paths(parse({ selfOwns: "land_only", landAcquisitionDate: "2023-06-01", buildingOwnerSameHousehold: true }, { giftAssumedDebt: 1 }))).toContain("carryoverTaxation.giftAssumedDebt");
    expect(paths(parse({ propertyType: "presale_right" }, { giftAssumedDebt: 0 }))).not.toContain("carryoverTaxation.giftAssumedDebt");
  });
});

describe("⑩ refineCarryoverTaxation — 부담부증여(E4) 거부 · 주 자산·컴패니언 공용", () => {
  const issuesOf = (ct: Record<string, unknown>, e4: boolean) => {
    const out: { path: (string | number)[] }[] = [];
    refineCarryoverTaxation({ ...CT, ...ct } as never, "2026-03-01", { addIssue: (i: { path: (string | number)[] }) => out.push(i) } as never, ["carryoverTaxation"], false, e4);
    return out.map((i) => i.path.join("."));
  };
  it("E4 + 채무 > 0 → 채무 키로 거부 · 채무 0·E4 아님은 통과", () => {
    expect(issuesOf({ giftAssumedDebt: 400_000_000 }, true)).toContain("carryoverTaxation.giftAssumedDebt");
    expect(issuesOf({ giftAssumedDebt: 400_000_000 }, false)).not.toContain("carryoverTaxation.giftAssumedDebt");
    expect(issuesOf({ giftAssumedDebt: 0 }, true)).not.toContain("carryoverTaxation.giftAssumedDebt");
  });
  it("채무 > 평가액 · r = 1 규칙이 이 함수 단독으로 걸린다", () => {
    expect(issuesOf({ giftAssumedDebt: 1_000_000_001 }, false)).toContain("carryoverTaxation.giftAssumedDebt");
    expect(issuesOf({ giftAssumedDebt: 1_000_000_000, giftTaxAmount: 5 }, false)).toContain("carryoverTaxation.giftAssumedDebt");
  });
});

describe("⑫ 엔진 shape를 재사용하는 일반건물 소비처는 채무 키를 거부한다(받아 놓고 무시하면 침묵 strip)", () => {
  const gb = carryoverTaxationEngineShape.superRefine(rejectDebtPiecesKeyRefine);
  it("키 있으면 거부 · 없으면 통과", () => {
    expect(gb.safeParse({ ...CT, giftAssumedDebt: 1 }).success).toBe(false);
    expect(gb.safeParse({ ...CT }).success).toBe(true);
    expect(z.object({ giftAssumedDebt: z.number().optional() }).superRefine(rejectDebtPiecesKeyRefine).safeParse({ giftAssumedDebt: 0 }).success).toBe(false);
  });
  it("엔진 shape는 키를 보존한다(단건 인라인 shape와 parity)", () => {
    const r = carryoverTaxationEngineShape.safeParse({ ...CT, giftAssumedDebt: 5 });
    expect(r.success && r.data.giftAssumedDebt).toBe(5);
  });
});
