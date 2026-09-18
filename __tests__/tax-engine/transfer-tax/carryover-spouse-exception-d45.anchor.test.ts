/**
 * D45 — 이월과세 §97의2②2호: 배우자 예외 + 레거시 선언 anchor.
 * 계획서: docs/00-pm/transfer-review-4-defects.plan.md §3 · §7.
 *
 * ②2호가 걸리면 B, 안 걸리면 ②3호로 사실상 max(A, B)다 — ②2호를 더 자주 걸수록 세액은 내려가기만 한다.
 *
 * 배우자 예외: 서면-2022-부동산-0068(질의1) · 서면-2016-법령해석재산-3313 · 서면-2016-부동산-4434 ·
 * 서면-2016-부동산-3753 — 「**증여일 현재** 1세대1주택」을 **배우자**로부터 증여받았으면 ②2호를 적용하지
 * 않는다. D-8(A 해당·B 불해당)이 걸릴 조합이라도 풀린다 ⇒ 세액이 오른다.
 *
 * OH 픽스처(`carryover-exclusion-one-house-auto.test.ts`와 같은 값): 15억 · 증여자 2000-06-01 취득 1천만 ·
 * 양도 2026-02-16 · 증여 2025-06-01(B 보유 8개월 → B 불해당). mock 세율.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

function run(carryoverOver: Record<string, unknown> = {}) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "housing",
      transferPrice: 1_500_000_000,
      transferDate: new Date("2026-02-16"),
      acquisitionPrice: 0,
      acquisitionDate: new Date("2025-06-01"),
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 0,
      isRegulatedArea: false,
      acquisitionCause: "carryover_gift",
      carryoverTaxation: {
        giftRegistryDate: new Date("2025-06-01"),
        donorAcquisitionDate: new Date("2000-06-01"),
        donorAcquisitionPrice: 10_000_000,
        useEstimatedAcquisition: false,
        giftTaxAmount: 0,
        giftDateValuation: 1_500_000_000,
        ...carryoverOver,
      },
    } as Partial<TransferTaxInput>),
    rates,
  );
}

describe("D45 배우자 예외 — ②2호 불적용 (D-8이 걸릴 조합)", () => {
  it("D45-A2 배우자 · 증여일 현재 1세대1주택 → ②2호 불적용 → ②3호로 A 채택 58,378,000", () => {
    const r = run({ donorRelation: "spouse", spouseGiftOneHouseAtGiftDate: true });
    const d = r.carryoverTaxationDetail!;
    expect(d.isEligible).toBe(true);
    expect(d.exclusionReason).toBeUndefined();
    expect(d.spouseOneHouseExceptionApplied).toBe(true);
    expect(d.adoptedScenario).toBe("A");
    expect(d.scenarioB.determinedTax).toBe(0);
    expect(r.determinedTax).toBe(58_378_000);
  });

  it("D45-A2+ 긍정 짝: 같은 배우자 증여라도 사실이 false면 D-8 그대로 → B 0 · 출처 auto", () => {
    const r = run({ donorRelation: "spouse", spouseGiftOneHouseAtGiftDate: false });
    const d = r.carryoverTaxationDetail!;
    expect(d.exclusionReason).toBe("one_house_exemption");
    expect(d.oneHouseExclusionSource).toBe("auto");
    expect(d.spouseOneHouseExceptionApplied).toBeUndefined();
    expect(r.determinedTax).toBe(0);
  });

  it("D45-A3 직계존비속이면 같은 사실을 넣어도 무시한다(배우자 예외) → B 0", () => {
    const r = run({ donorRelation: "lineal", spouseGiftOneHouseAtGiftDate: true });
    expect(r.carryoverTaxationDetail?.exclusionReason).toBe("one_house_exemption");
    expect(r.carryoverTaxationDetail?.spouseOneHouseExceptionApplied).toBeUndefined();
    expect(r.determinedTax).toBe(0);
  });

  it("D45-A4 D-8이 걸리지 않는 조합(B도 1세대1주택)에서는 예외 echo가 서지 않는다", () => {
    const r = run({
      donorRelation: "spouse",
      spouseGiftOneHouseAtGiftDate: true,
      giftRegistryDate: new Date("2023-06-01"),
    });
    expect(r.carryoverTaxationDetail?.exclusionReason).not.toBe("one_house_exemption");
    expect(r.carryoverTaxationDetail?.spouseOneHouseExceptionApplied).toBeUndefined();
  });
});

describe("D45 레거시 선언 (Q-3) — 저장 당시 세액 재현", () => {
  it("D45-L0 레거시 플래그 → Step 2에서 ②2호 배제 · 출처 legacy_declaration · 배우자 예외보다 앞선다", () => {
    // OH-2(증여 2023-06-01)는 자동 판정이면 ②2호가 걸리지 않아 A 58,378,000이다.
    const auto = run({ giftRegistryDate: new Date("2023-06-01") });
    expect(auto.determinedTax).toBe(58_378_000);

    const legacy = run({
      giftRegistryDate: new Date("2023-06-01"),
      donorRelation: "spouse",
      spouseGiftOneHouseAtGiftDate: true,
      exclusionDeclared: { legacyOneHouseExemptionDeclared: true },
    });
    const d = legacy.carryoverTaxationDetail!;
    expect(d.exclusionReason).toBe("one_house_exemption");
    expect(d.oneHouseExclusionSource).toBe("legacy_declaration");
    expect(legacy.determinedTax).toBe(0);
  });
});
