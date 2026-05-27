/**
 * J-1 — 가업상속공제 raw 평가액 통일 anchor (J1-1~8 + 회귀)
 *
 * 현행: deriveFamilyBusinessValue가 marketValue ?? 0만 읽어 감정가·기준시가·비상장 V2 평가
 *   가업자산을 0으로 산입 → §60 보충평가 무시 + 공제 누락.
 * 수정: resolveEstateItemValue(5단계 §60 우선순위) 채택. marketValue tier-1 우선이라 회귀 0.
 *
 * Plan:   docs/00-pm/inheritance-family-business-raw-valuation-unification-j1.plan.md
 * Design: docs/02-design/features/inheritance-family-business-raw-valuation-unification-j1.engine.design.md
 */
import { describe, it, expect } from "vitest";
import {
  deriveFamilyBusinessValue,
  calcFamilyBusinessDeductionPhase2,
} from "@/lib/tax-engine/deductions/family-business";
import {
  resolveEstateItemValue,
  computeStockValuation,
} from "@/lib/tax-engine/valuation/resolve-estate-item-value";
import { getValuatedAmount } from "@/lib/calc/inheritance-deduction-suggest";
import type {
  EstateItem,
  FamilyBusinessInheritanceInput,
  UnlistedStockValuationInput,
} from "@/lib/tax-engine/types/inheritance-gift.types";

const V = 5_000_000_000; // 50억

function fbItem(overrides: Partial<EstateItem>): EstateItem {
  return {
    id: "fb-1",
    category: "unlisted_stock",
    name: "가업법인 비상장주식",
    familyBusinessCategory: "corporate_stock",
    ...overrides,
  } as EstateItem;
}

function eligibleInput(): FamilyBusinessInheritanceInput {
  return {
    businessType: "corporate",
    operatingYears: 30,
    isEligibleIndustry: true,
    enterpriseSize: "sme",
    totalAssets: 0,
    decedentMajorShareholdingMet: true,
    decedentCEORequirementMet: true,
    heirIsAdult: true,
    heirTwoYearEngagement: true,
    heirOfficerByFilingDeadline: true,
    heirCEOWithinTwoYears: true,
  } as FamilyBusinessInheritanceInput;
}

// 유효한 비상장 V2 입력 (totalValuation > 0)
function v2Input(): UnlistedStockValuationInput {
  return {
    corpName: "㈜가업",
    businessStartDate: new Date("2000-01-01"),
    evaluationDate: new Date("2024-05-01"),
    faceValuePerShare: 5_000,
    totalShares: 50_000,
    ownedShares: 50_000,
    isRealEstateHeavy: false,
    fiscalYears: [
      { fiscalYearLabel: "2023", fiscalYearEndDate: new Date("2023-12-31"), taxableIncome: 100_000_000 },
      { fiscalYearLabel: "2022", fiscalYearEndDate: new Date("2022-12-31"), taxableIncome: 90_000_000 },
      { fiscalYearLabel: "2021", fiscalYearEndDate: new Date("2021-12-31"), taxableIncome: 80_000_000 },
    ],
    capitalChanges: [],
    netAssetValueRaw: {
      bsTotalAssets: 3_000_000_000,
      assetValuationDelta: 0,
      corpTaxReservedAmount: 0,
      paidInCapitalIncrease: 0,
      otherEarnedRights: 0,
      prepaidExpenses: 0,
      preGiftRetainedEarnings: 0,
      bsTotalLiabilities: 1_000_000_000,
      corporateTaxPayable: 0,
      farmingSurtax: 0,
      localIncomeTax: 0,
      dividendPayable: 0,
      retirementProvision: 0,
      otherProvision: 0,
      reserveExcluded: 0,
      allowanceExcluded: 0,
      deferredTaxAdjustment: 0,
    },
    isContinuousLossLastThreeYears: false,
    capitalizationRate: 0.1,
    isMaxShareholder: false,
    companySize: "large",
  };
}

describe("J-1 가업상속공제 raw 평가액 통일 (deriveFamilyBusinessValue)", () => {
  it("J1-1: appraisedValue 50억(시가 없음) → derive=50억", () => {
    expect(deriveFamilyBusinessValue([fbItem({ appraisedValue: V })])).toBe(V);
  });

  it("J1-2: standardPrice 50억 → derive=50억", () => {
    expect(deriveFamilyBusinessValue([fbItem({ standardPrice: V })])).toBe(V);
  });

  it("J1-3: 비상장 V2 평가 → derive = V2 totalValuation (computeStockValuation)", () => {
    const item = fbItem({ unlistedStockValuationV2: v2Input(), unlistedValuationMode: "formal" });
    const expected = computeStockValuation(item);
    expect(expected).toBeGreaterThan(0);
    expect(deriveFamilyBusinessValue([item])).toBe(expected);
  });

  it("J1-4 다운스트림: appraised 50억 + 자격충족 + override 미입력 → deduction=50억", () => {
    const r = calcFamilyBusinessDeductionPhase2({
      input: eligibleInput(),
      estateItems: [fbItem({ appraisedValue: V })],
      taxIfNoFBD: 1_000_000_000,
      lawRef: "상증법 §18의2",
    });
    expect(r.detail.eligible).toBe(true);
    expect(r.detail.autoDerivedValue).toBe(V);
    expect(r.deduction).toBe(V); // 50억 < 600억 캡
  });

  it("J1-5 이중차감 가드: corporate_stock + corporateTotalAssets → §15⑤2호 차감 1회만", () => {
    // 총자산 100억 중 사업무관 20억 → 비율 80%. raw(appraised 50억) × 0.8 = 40억
    const item = fbItem({
      appraisedValue: V,
      corporateTotalAssets: 10_000_000_000,
      corporateNonBusinessAssets: { nonBusinessLand: 2_000_000_000 },
    });
    expect(deriveFamilyBusinessValue([item])).toBe(4_000_000_000); // 50억 × (100−20)/100
  });

  it("J1-6 marketValue 우선 회귀: marketValue 30억 + appraisedValue 50억 → derive=30억", () => {
    expect(deriveFamilyBusinessValue([fbItem({ marketValue: 3_000_000_000, appraisedValue: V })])).toBe(
      3_000_000_000,
    );
  });

  it("J1-7 단일 진실: resolveEstateItemValue ≡ getValuatedAmount", () => {
    const items = [
      fbItem({ appraisedValue: V }),
      fbItem({ standardPrice: V }),
      fbItem({ marketValue: 3_000_000_000 }),
      fbItem({ unlistedStockValuationV2: v2Input(), unlistedValuationMode: "formal" }),
    ];
    for (const it of items) {
      expect(resolveEstateItemValue(it)).toBe(getValuatedAmount(it));
    }
  });

  it("J1-8 비주식 가업자산: 공장(business_real_estate)·standardPrice 50억 → derive=50억", () => {
    const factory = {
      id: "f1",
      category: "real_estate_building",
      name: "가업 공장",
      familyBusinessCategory: "business_real_estate",
      standardPrice: V,
    } as EstateItem;
    expect(deriveFamilyBusinessValue([factory])).toBe(V);
  });

  it("회귀: marketValue 50억 → derive=50억 (기존 동작 불변)", () => {
    expect(deriveFamilyBusinessValue([fbItem({ marketValue: V })])).toBe(V);
  });
});
