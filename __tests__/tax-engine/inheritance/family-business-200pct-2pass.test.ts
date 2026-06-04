/**
 * E5 2-pass — orchestrator taxIfNoFBD 실산정 anchor (상증법 §18의2② + 상증령 §15⑥⑦)
 *
 * 법령 (KoreanLaw mst=283637 §15⑦ + PDF 380p):
 *   taxIfNoFBD = 가업상속공제 미적용 시 §3의2 따라 계산한 가업상속인 부담 상속세액.
 *   §18의2②: 가업외 상속재산(①) > taxIfNoFBD × 200%(②) → 공제 배제.
 *
 * 검증: orchestrator(calcInheritanceTax)가 medium 가업에서 taxIfNoFBD를 0이 아닌 실값으로
 *       2-pass 산정하여 200% 가드를 active=true로 판정하는지.
 */
import { describe, expect, it } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import type {
  InheritanceTaxInput,
  Heir,
  FamilyBusinessInheritanceInput,
} from "@/lib/tax-engine/types/inheritance-gift.types";

const 억 = 100_000_000;

function mediumFB(over: Partial<FamilyBusinessInheritanceInput> = {}): FamilyBusinessInheritanceInput {
  return {
    businessType: "corporate",
    operatingYears: 20,
    enterpriseSize: "medium",
    averageRevenue3Y: 400_000_000_000, // 4천억 (5천억 미만 OK)
    isEligibleIndustry: true,
    decedentMajorShareholdingMet: true,
    isListedOnExchange: false,
    decedentCEORequirementMet: true,
    heirIsAdult: true,
    heirTwoYearEngagement: true,
    heirOfficerByFilingDeadline: true,
    heirCEOWithinTwoYears: true,
    unrelatedAssetsAcknowledged: true,
    postManagementAcknowledged: true,
    ...over,
  };
}

/** 자녀 1명 단독상속 + 가업법인주식 30억. familyBusiness만 교체. */
function makeInput(fb: FamilyBusinessInheritanceInput | undefined): InheritanceTaxInput {
  const heirs: Heir[] = [{ id: "c1", relation: "child", name: "자녀", isHeir: true }];
  return {
    decedentType: "resident",
    deathDate: "2024-06-01",
    estateItems: [
      {
        id: "fb-stock",
        category: "unlisted_stock",
        name: "가업 법인주식",
        marketValue: 30 * 억,
        familyBusinessCategory: "corporate_stock",
        isFamilyBusinessAsset: true,
      },
    ],
    funeralExpense: 0,
    funeralIncludesBongan: false,
    debts: 0,
    debtItems: [],
    preGiftsWithin10Years: [],
    heirs,
    deductionInput: {
      heirs,
      netFinancialAssets: 0,
      cohabitHouseStdPrice: 0,
      farmingAssetValue: 0,
      // familyBusinessValue 미설정 — 가업주식 EstateItem 자동합산(deriveFamilyBusinessValue) 사용
      legateeAmountNonHeir: 0,
      familyBusiness: fb,
    },
    creditInput: { priorGifts: [], isFiledOnTime: true },
    isGenerationSkip: false,
  };
}

describe("E5 2-pass — taxIfNoFBD 실산정 + 200% 가드", () => {
  it("E5-1: medium 통과 — taxIfNoFBD 실산정(active=true, >0), 가드 통과, 공제 적용", () => {
    const fb = mediumFB({ heirOtherEstateValue: 3 * 억, heirDebt: 0 }); // 가업외 net 3억 (작음)
    const r = calcInheritanceTax(makeInput(fb));
    const g = r.deductionDetail.familyBusinessDetail?.mediumGuard;
    expect(g).toBeDefined();
    expect(g!.active).toBe(true); // PR-1 안전장치(active:false) 아님 — 실산정 작동
    expect(g!.taxIfNoFBD).toBeGreaterThan(0); // 0 fallback 아님
    expect(g!.exceeded).toBe(false);
    expect(r.deductionDetail.familyBusinessDetail?.eligible).toBe(true);
    expect(r.deductionDetail.familyBusinessDeduction).toBeGreaterThan(0);
  });

  it("E5-2: medium 초과 — 가업외 net 100억 > taxIfNoFBD×200% → 공제 배제", () => {
    const fb = mediumFB({ heirOtherEstateValue: 100 * 억, heirDebt: 0 });
    const r = calcInheritanceTax(makeInput(fb));
    const g = r.deductionDetail.familyBusinessDetail?.mediumGuard;
    expect(g!.active).toBe(true);
    expect(g!.taxIfNoFBD).toBeGreaterThan(0);
    expect(g!.otherEstateNet).toBe(100 * 억);
    expect(g!.exceeded).toBe(true);
    expect(r.deductionDetail.familyBusinessDetail?.eligible).toBe(false);
    expect(r.deductionDetail.familyBusinessDetail?.ineligibleReasons).toContain(
      "medium_other_estate_exceeds_200pct",
    );
    expect(r.deductionDetail.familyBusinessDeduction).toBe(0);
  });

  it("E5-3: sme — 2-pass 미발동, 200% 가드 비활성(mediumGuard undefined)", () => {
    const fb = mediumFB({ enterpriseSize: "sme", averageRevenue3Y: undefined, heirOtherEstateValue: 100 * 억 });
    const r = calcInheritanceTax(makeInput(fb));
    expect(r.deductionDetail.familyBusinessDetail?.mediumGuard).toBeUndefined();
    // sme는 가드 무관 — 가업공제 적용
    expect(r.deductionDetail.familyBusinessDeduction).toBeGreaterThan(0);
  });

  it("E5-4: 가업 미입력 — familyBusinessDetail 없음 (회귀 0)", () => {
    const r = calcInheritanceTax(makeInput(undefined));
    expect(r.deductionDetail.familyBusinessDetail?.mediumGuard).toBeUndefined();
  });

  it("E5-5: 경계 — 가업외 net = taxIfNoFBD×200% 직전/직후 동일 판정 일관", () => {
    // taxIfNoFBD 실값을 먼저 산정
    const probe = calcInheritanceTax(makeInput(mediumFB({ heirOtherEstateValue: 1 * 억 })));
    const cap200 = probe.deductionDetail.familyBusinessDetail!.mediumGuard!.cap200pct;
    expect(cap200).toBeGreaterThan(0);
    // cap200 미만 → 통과
    const below = calcInheritanceTax(makeInput(mediumFB({ heirOtherEstateValue: cap200 - 억 })));
    expect(below.deductionDetail.familyBusinessDetail!.mediumGuard!.exceeded).toBe(false);
    // cap200 초과 → 배제
    const above = calcInheritanceTax(makeInput(mediumFB({ heirOtherEstateValue: cap200 + 억 })));
    expect(above.deductionDetail.familyBusinessDetail!.mediumGuard!.exceeded).toBe(true);
  });
});
