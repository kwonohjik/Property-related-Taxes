// §98의9 수도권 밖 준공후미분양 — evaluator 단위 anchor (A-1~A-8)
// 케이스 인벤토리: docs/02-design/features/transfer-98-9-unsold.engine.design.md §2
import { describe, it, expect } from "vitest";
import { evaluateUnsold989, resolveHouseCountExclusion } from "@/lib/tax-engine/transfer-reductions/unsold-98-9";
import type { Unsold989EvaluationInput } from "@/lib/tax-engine/transfer-reductions/types";

function base(overrides?: Partial<Unsold989EvaluationInput>): Unsold989EvaluationInput {
  return {
    id: "unsold_98_9",
    generalHouseAcquisitionDate: new Date("2014-01-01"),
    transferDate: new Date("2024-06-01"),
    unsoldHouseAcquisitionDate: new Date("2024-02-01"),
    unsoldHouseAcquisitionPrice: 500_000_000,
    unsoldHouseExclusiveArea: 84,
    isNonCapitalRegion: true,
    wasOneHouseholdAtAcquisition: true,
    meetsSellerAndContractRequirement: true,
    ...overrides,
  };
}

function codesOf(r: ReturnType<typeof evaluateUnsold989>): string[] {
  return r.isEligible ? [] : r.ineligibleReasons.map((x) => x.code);
}

describe("§98의9 evaluateUnsold989", () => {
  it("A-1: 적격 (2024.2.1 취득·5억·84㎡·토글 3종✓) → exclusion 1·종부세 안내", () => {
    const r = evaluateUnsold989(base());
    expect(r.isEligible).toBe(true);
    if (r.isEligible) {
      expect(r.houseCountExclusion).toBe(1);
      expect(r.comprehensiveTaxNote).toBe(true);
      expect(r.surchargeNotAffected).toBe(true);
      expect(r.dualExclusionApplied).toBeUndefined();
    }
  });

  it("A-2: 취득가 7.5억 → 불적용 / 정확히 7억 → 적용 (경계 포함)", () => {
    const over = evaluateUnsold989(base({ unsoldHouseAcquisitionPrice: 750_000_000 }));
    expect(over.isEligible).toBe(false);
    expect(codesOf(over)).toContain("PRICE_EXCEEDED");

    const exact = evaluateUnsold989(base({ unsoldHouseAcquisitionPrice: 700_000_000 }));
    expect(exact.isEligible).toBe(true);
  });

  it("A-3: 전용 90㎡ → 불적용 / 85.00㎡ → 적용 (경계 포함)", () => {
    const over = evaluateUnsold989(base({ unsoldHouseExclusiveArea: 90 }));
    expect(over.isEligible).toBe(false);
    expect(codesOf(over)).toContain("AREA_EXCEEDED");

    const exact = evaluateUnsold989(base({ unsoldHouseExclusiveArea: 85 }));
    expect(exact.isEligible).toBe(true);
  });

  it("A-4: 미분양 취득일 ≤ 종전주택 취득일 → 불적용 (취득순서)", () => {
    const r = evaluateUnsold989(base({
      generalHouseAcquisitionDate: new Date("2025-01-01"),
      transferDate: new Date("2026-06-01"),
      unsoldHouseAcquisitionDate: new Date("2024-06-01"),
    }));
    expect(r.isEligible).toBe(false);
    expect(codesOf(r)).toContain("ACQUISITION_ORDER");
  });

  it("A-5: 시한 — 2024.1.9 / 2027.1.1 취득 → 불적용 (경계 2024.1.10·2026.12.31 적용)", () => {
    const before = evaluateUnsold989(base({ unsoldHouseAcquisitionDate: new Date("2024-01-09") }));
    expect(codesOf(before)).toContain("OUT_OF_PERIOD");

    const after = evaluateUnsold989(base({
      unsoldHouseAcquisitionDate: new Date("2027-01-01"),
      transferDate: new Date("2027-06-01"),
    }));
    expect(codesOf(after)).toContain("OUT_OF_PERIOD");

    const fromEdge = evaluateUnsold989(base({ unsoldHouseAcquisitionDate: new Date("2024-01-10") }));
    expect(fromEdge.isEligible).toBe(true);

    const toEdge = evaluateUnsold989(base({
      unsoldHouseAcquisitionDate: new Date("2026-12-31"),
      transferDate: new Date("2027-06-01"),
    }));
    expect(toEdge.isEligible).toBe(true);
  });

  it("A-6: 토글 미확인 3종 → 각 불적용 사유", () => {
    const region = evaluateUnsold989(base({ isNonCapitalRegion: false }));
    expect(codesOf(region)).toContain("REGION_UNCONFIRMED");

    const oneHouse = evaluateUnsold989(base({ wasOneHouseholdAtAcquisition: false }));
    expect(codesOf(oneHouse)).toContain("ONE_HOUSE_UNCONFIRMED");

    const seller = evaluateUnsold989(base({ meetsSellerAndContractRequirement: false }));
    expect(codesOf(seller)).toContain("SELLER_UNCONFIRMED");
  });

  it("A-7: 필수 입력(취득일·취득가·면적) 미입력 → 사유 (자동 fallback 금지)", () => {
    const r = evaluateUnsold989(base({
      unsoldHouseAcquisitionDate: undefined,
      unsoldHouseAcquisitionPrice: undefined,
      unsoldHouseExclusiveArea: undefined,
    }));
    expect(r.isEligible).toBe(false);
    expect(codesOf(r)).toEqual(
      expect.arrayContaining(["MISSING_UNSOLD_ACQ_DATE", "MISSING_PRICE", "MISSING_AREA"]),
    );
  });

  it("A-8: 양도일 < 미분양 취득일 → 불적용 (법 ① '취득한 후 양도' — 검토 발견)", () => {
    const r = evaluateUnsold989(base({
      unsoldHouseAcquisitionDate: new Date("2026-01-01"),
      transferDate: new Date("2025-06-01"),
    }));
    expect(r.isEligible).toBe(false);
    expect(codesOf(r)).toContain("TRANSFER_BEFORE_ACQUISITION");
  });
});

describe("resolveHouseCountExclusion (D4-01 — 둘 다 적격이면 각각 1채)", () => {
  const ctx = {
    generalHouseAcquisitionDate: new Date("2014-01-01"),
    transferDate: new Date("2024-06-01"),
  };
  const RURAL = {
    type: "new_99_4_rural",
    // 취득 순서 「일반(2014) → 준공후미분양(2024-02) → 농어촌(2024-04)」 — 이 순서라야
    // §98의9①의 「1주택을 보유한 1세대」(미분양 취득 시점)가 성립한다 (D4-01).
    ruralHouseAcquisitionDate: new Date("2024-04-01"),
    ruralHouseStdPrice: 200_000_000,
    isRegisteredHanok: false,
    isAdjacentArea: false,
    meetsLocationRequirement: true,
  };
  const UNSOLD = {
    type: "unsold_98_9",
    unsoldHouseAcquisitionDate: new Date("2024-02-01"),
    unsoldHouseAcquisitionPrice: 500_000_000,
    unsoldHouseExclusiveArea: 84,
    isNonCapitalRegion: true,
    wasOneHouseholdAtAcquisition: true,
    meetsSellerAndContractRequirement: true,
  };

  it("§98의9 단독 → appliedList = [unsold989]", () => {
    const r = resolveHouseCountExclusion([UNSOLD], ctx);
    expect(r.appliedList.map((x) => x.id)).toEqual(["unsold_98_9"]);
    expect(r.new994Detail).toBeUndefined();
  });

  it("둘 다 적격 → appliedList 2건(§99의4 → §98의9) + dualExclusionApplied", () => {
    const r = resolveHouseCountExclusion([RURAL, UNSOLD], ctx);
    expect(r.appliedList.map((x) => x.id)).toEqual(["new_99_4_rural", "unsold_98_9"]);
    expect(r.unsold989Detail?.isEligible).toBe(true);
    if (r.unsold989Detail?.isEligible) {
      expect(r.unsold989Detail.dualExclusionApplied).toBe(true);
    }
  });

  it("둘 다 미포함 → appliedList 빈 배열", () => {
    const r = resolveHouseCountExclusion([], ctx);
    expect(r.appliedList).toEqual([]);
  });
});
