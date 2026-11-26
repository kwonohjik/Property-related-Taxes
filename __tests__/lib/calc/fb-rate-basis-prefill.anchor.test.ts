/**
 * F-3 — 상속세 이력 prefill이 적용률 법정량(공제액 ÷ 가업상속 재산가액)을 넘긴다 + 분수 표기 leaf
 *
 * 종전 prefill은 상속세 결과의 `appliedRate` double(예 400/1200)만 넘겨 양도세 엔진이 소수 6자리로
 * 반올림했다(의제 취득가액 +268원). 상속세 결과에는 `deduction`·`finalValue` 정수가 이미 있다.
 * 계획서: docs/02-design/features/fb-97-2-4-fixes.plan.md §3.4 A-1 · §5
 */
import { describe, it, expect } from "vitest";
import {
  filterFamilyBusinessInheritanceCandidates,
  candidateToPrefill,
} from "@/lib/calc/family-business-inheritance-lookup";
import { formatFractionPercent } from "@/lib/calc/format-fraction-percent";
import { familyBusinessRateBasisError } from "@/lib/tax-engine/family-business-applied-rate";
import type { CalculationRecord } from "@/lib/storage/types";

function record(fbDetail: Record<string, unknown>): CalculationRecord {
  return {
    id: "rec-1",
    userId: "local-user",
    taxType: "inheritance",
    title: "테스트 상속",
    inputData: {
      deathDate: "2024-03-15",
      estateItems: [{ id: "asset-1", name: "공장부지", familyBusinessCategory: "business_real_estate", marketValue: 5_000_000_000 }],
    },
    resultData: { result: { deductionDetail: { familyBusinessDetail: fbDetail } } },
    taxLawVersion: "2024-03-15",
    linkedCalculationId: null,
    clientId: null,
    createdAt: "2024-04-01T00:00:00.000Z",
    updatedAt: "2024-04-01T00:00:00.000Z",
  } as CalculationRecord;
}

describe("F-3 prefill 법정량", () => {
  it("공제 400억 · 재산가액 1,200억 → fbRateBasis 그대로 · 표시 적용률 = 같은 비율 · ⑧ 정합 통과", () => {
    const { candidates } = filterFamilyBusinessInheritanceCandidates(
      [record({ deduction: 40_000_000_000, finalValue: 120_000_000_000, appliedRate: 40_000_000_000 / 120_000_000_000, usedDirectInput: false })],
      "2026-05-22",
    );
    expect(candidates[0].familyBusinessAssets[0].rateBasis).toEqual({ kind: "deduction_ratio", deductionAmount: 40_000_000_000, businessEstateValue: 120_000_000_000 });
    const prefill = candidateToPrefill(candidates[0], "asset-1")!;
    expect(prefill.fbRateBasis).toEqual(candidates[0].familyBusinessAssets[0].rateBasis);
    expect(familyBusinessRateBasisError(prefill.fbRateBasis, prefill.fbDeductionAppliedRate)).toBeNull();
  });

  it("F-2: 직접입력 모드는 재산가액을 모른다 → 법정량 없음 · 적용률을 1로 채우지 않는다(산정 불가 사유)", () => {
    const { candidates } = filterFamilyBusinessInheritanceCandidates(
      [record({ deduction: 30_000_000_000, finalValue: 30_000_000_000, appliedRate: 1, usedDirectInput: true })],
      "2026-05-22",
    );
    expect(candidates[0].familyBusinessAssets[0].rateBasis).toBeUndefined();
    expect(candidates[0].familyBusinessAssets[0].rateUnavailable).toBe("direct_input");
    const prefill = candidateToPrefill(candidates[0], "asset-1")!;
    expect(prefill.fbRateBasis).toBeUndefined();
    expect(prefill.rateUnavailable).toBe("direct_input");
    expect(prefill.fbDeductionAppliedRate).toBe(0);
  });

  it("구 레코드(finalValue 없음) → 법정량 없음 · 이력의 적용률(구 ③ 산식) 그대로", () => {
    const { candidates } = filterFamilyBusinessInheritanceCandidates(
      [record({ deduction: 8_000_000_000, appliedRate: 1, usedDirectInput: false })],
      "2026-05-22",
    );
    expect(candidates[0].familyBusinessAssets[0].rateBasis).toBeUndefined();
    expect(candidates[0].familyBusinessAssets[0].rateUnavailable).toBeUndefined();
    expect(candidateToPrefill(candidates[0], "asset-1")!.fbDeductionAppliedRate).toBe(1);
  });
});

describe("formatFractionPercent — 표시 전용 (넷째 자리 절사 · 최소 둘째 자리)", () => {
  it.each([
    [4, 5, "80.00"],
    [1, 3, "33.3333"],
    [2, 3, "66.6666"],
    [1, 8, "12.50"],
    [0, 7, "0.00"],
    [7, 7, "100.00"],
    [800_000, 1_000_000, "80.00"],
    [40_000_000_000, 120_000_000_000, "33.3333"],
  ])("%i/%i → %s", (n, d, out) => {
    expect(formatFractionPercent(n, d)).toBe(out);
  });
  it("분모 0 → 0.00", () => {
    expect(formatFractionPercent(1, 0)).toBe("0.00");
  });
});

describe("③ 복원 — 형태가 깨진 fbRateBasis는 버린다 (calc-wizard-asset-migrate-phase3)", () => {
  const fb = (basis: unknown) => ({
    familyBusinessInheritance: {
      decedentAcquisitionPrice: 1,
      inheritanceMarketValue: 2,
      fbDeductionAppliedRate: 0.5,
      inheritanceDate: "2024-01-01",
      fbRateBasis: basis,
    },
  });
  it.each([
    ["다른 kind", { kind: "corporate_business_assets", totalAssets: 1, nonBusinessAssets: 0 }],
    ["숫자 아님", { kind: "deduction_ratio", deductionAmount: "1", businessEstateValue: 2 }],
    ["null", null],
  ])("%s → undefined", async (_l, basis) => {
    const { applyPhase3Normalize } = await import("@/lib/stores/calc-wizard-asset-migrate-phase3");
    const a = fb(basis) as Record<string, unknown>;
    applyPhase3Normalize(a);
    expect((a.familyBusinessInheritance as Record<string, unknown>).fbRateBasis).toBeUndefined();
  });
  it("정상 법정량은 그대로 둔다", async () => {
    const { applyPhase3Normalize } = await import("@/lib/stores/calc-wizard-asset-migrate-phase3");
    const basis = { kind: "deduction_ratio", deductionAmount: 1, businessEstateValue: 2 };
    const a = fb(basis) as Record<string, unknown>;
    applyPhase3Normalize(a);
    expect((a.familyBusinessInheritance as Record<string, unknown>).fbRateBasis).toEqual(basis);
  });
});
