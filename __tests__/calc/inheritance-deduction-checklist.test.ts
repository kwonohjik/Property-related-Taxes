/**
 * inheritance-deduction-checklist.ts 단위 테스트
 *
 * 커버리지:
 *   A. isManualItemActive — override 3-state × hasValue 매트릭스
 *   B. isAutoItemVisible — autoDetected × hasValue × override 매트릭스
 *   C. casualtyLoss 단일 진실 (form.casualtyLossEnabled 직접 사용)
 *   D. manualItemHasValue — 각 key별 hasValue 판정
 *   E. autoItemHasValue — 각 key별 hasValue 판정
 */

import { describe, it, expect } from "vitest";
import {
  isManualItemActive,
  isAutoItemVisible,
  manualItemHasValue,
  autoItemHasValue,
  type ChecklistFormSlice,
} from "@/lib/calc/inheritance-deduction-checklist";

// ──────────────────────────────────────────────
// 헬퍼: 최소 빈 폼 팩토리
// ──────────────────────────────────────────────

function emptyForm(): ChecklistFormSlice {
  return {
    spouseActualAmount: "",
    netFinancialAssets: "",
    cohabitHouseStdPrice: "",
    cohabitDirectAmount: "",
    ancillaryLandArea: "",
    buildingFootprintArea: "",
    ancillaryLandRegion: "",
    farmingAssetValue: "",
    farming: undefined,
    familyBusinessValue: "",
    familyBusinessYears: "",
    familyBusinessDirectAmount: "",
    familyBusiness: undefined,
    legateeAmountNonHeir: "",
    priorGiftDeductionTotal: "",
    disasterLossDeduction: "",
    casualtyLossEnabled: false,
    appraisalRealEstateFee: "",
    appraisalUnlistedFee: "",
    appraisalTangibleFee: "",
    foreignTaxPaid: "",
    foreignInheritanceTaxBase: "",
    shortTermReinheritAssets: [],
    shortTermReinheritPriorDeathDate: "",
    shortTermReinheritTaxPaid: "",
    shortTermReinheritAssetValue: "",
    shortTermReinheritPriorEstateValue: "",
    shortTermReinheritYears: "",
    deductionChecklistOverrides: {},
  };
}

// ──────────────────────────────────────────────
// A. isManualItemActive — override 3-state × hasValue
// ──────────────────────────────────────────────

describe("isManualItemActive", () => {
  describe("familyBusiness", () => {
    it("A-1: 빈 폼 + override 없음 → false (hasValue=false)", () => {
      expect(isManualItemActive(emptyForm(), "familyBusiness")).toBe(false);
    });

    it("A-2: 빈 폼 + override=true → true", () => {
      const form = { ...emptyForm(), deductionChecklistOverrides: { familyBusiness: true } };
      expect(isManualItemActive(form, "familyBusiness")).toBe(true);
    });

    it("A-3: 빈 폼 + override=false → false", () => {
      const form = { ...emptyForm(), deductionChecklistOverrides: { familyBusiness: false } };
      expect(isManualItemActive(form, "familyBusiness")).toBe(false);
    });

    it("A-4: 값 있음 + override 없음 → true (hasValue=true가 override 기본값)", () => {
      const form = { ...emptyForm(), familyBusinessValue: "100000000" };
      expect(isManualItemActive(form, "familyBusiness")).toBe(true);
    });

    it("A-5: 값 있음 + override=false → false (override가 hasValue보다 우선)", () => {
      const form = {
        ...emptyForm(),
        familyBusinessValue: "100000000",
        deductionChecklistOverrides: { familyBusiness: false },
      };
      expect(isManualItemActive(form, "familyBusiness")).toBe(false);
    });

    it("A-6: 값 있음 + override=true → true", () => {
      const form = {
        ...emptyForm(),
        familyBusinessValue: "100000000",
        deductionChecklistOverrides: { familyBusiness: true },
      };
      expect(isManualItemActive(form, "familyBusiness")).toBe(true);
    });
  });

  describe("legatee", () => {
    it("빈 폼 → false", () => {
      expect(isManualItemActive(emptyForm(), "legatee")).toBe(false);
    });
    it("legateeAmountNonHeir 있음 → true", () => {
      const form = { ...emptyForm(), legateeAmountNonHeir: "50000000" };
      expect(isManualItemActive(form, "legatee")).toBe(true);
    });
    it("legateeAmountNonHeir 있음 + override=false → false", () => {
      const form = {
        ...emptyForm(),
        legateeAmountNonHeir: "50000000",
        deductionChecklistOverrides: { legatee: false },
      };
      expect(isManualItemActive(form, "legatee")).toBe(false);
    });
  });

  describe("priorGiftDeduction", () => {
    it("빈 폼 → false", () => {
      expect(isManualItemActive(emptyForm(), "priorGiftDeduction")).toBe(false);
    });
    it("priorGiftDeductionTotal 있음 → true", () => {
      const form = { ...emptyForm(), priorGiftDeductionTotal: "10000000" };
      expect(isManualItemActive(form, "priorGiftDeduction")).toBe(true);
    });
  });

  describe("disasterAdjust", () => {
    it("빈 폼 → false", () => {
      expect(isManualItemActive(emptyForm(), "disasterAdjust")).toBe(false);
    });
    it("disasterLossDeduction 있음 → true", () => {
      const form = { ...emptyForm(), disasterLossDeduction: "5000000" };
      expect(isManualItemActive(form, "disasterAdjust")).toBe(true);
    });
  });

  describe("appraisalFee", () => {
    it("빈 폼 → false", () => {
      expect(isManualItemActive(emptyForm(), "appraisalFee")).toBe(false);
    });
    it("appraisalRealEstateFee 있음 → true", () => {
      const form = { ...emptyForm(), appraisalRealEstateFee: "500000" };
      expect(isManualItemActive(form, "appraisalFee")).toBe(true);
    });
    it("appraisalUnlistedFee 있음 → true", () => {
      const form = { ...emptyForm(), appraisalUnlistedFee: "300000" };
      expect(isManualItemActive(form, "appraisalFee")).toBe(true);
    });
    it("appraisalTangibleFee 있음 → true", () => {
      const form = { ...emptyForm(), appraisalTangibleFee: "200000" };
      expect(isManualItemActive(form, "appraisalFee")).toBe(true);
    });
  });

  describe("foreignTax", () => {
    it("빈 폼 → false", () => {
      expect(isManualItemActive(emptyForm(), "foreignTax")).toBe(false);
    });
    it("foreignTaxPaid 있음 → true", () => {
      const form = { ...emptyForm(), foreignTaxPaid: "3000000" };
      expect(isManualItemActive(form, "foreignTax")).toBe(true);
    });
    it("foreignInheritanceTaxBase 있음 → true", () => {
      const form = { ...emptyForm(), foreignInheritanceTaxBase: "100000000" };
      expect(isManualItemActive(form, "foreignTax")).toBe(true);
    });
  });

  describe("shortTermReinherit", () => {
    it("빈 폼 → false", () => {
      expect(isManualItemActive(emptyForm(), "shortTermReinherit")).toBe(false);
    });
    it("shortTermReinheritPriorDeathDate 있음 → true", () => {
      const form = { ...emptyForm(), shortTermReinheritPriorDeathDate: "2023-01-01" };
      expect(isManualItemActive(form, "shortTermReinherit")).toBe(true);
    });
    it("shortTermReinheritAssets 길이 > 0 → true", () => {
      const form = {
        ...emptyForm(),
        shortTermReinheritAssets: [{ name: "자산1", value: "10000000" }],
      };
      expect(isManualItemActive(form, "shortTermReinherit")).toBe(true);
    });
    it("override=true (빈 폼) → true", () => {
      const form = {
        ...emptyForm(),
        deductionChecklistOverrides: { shortTermReinherit: true },
      };
      expect(isManualItemActive(form, "shortTermReinherit")).toBe(true);
    });
  });
});

// ──────────────────────────────────────────────
// B. isManualItemActive — casualtyLoss 단일 진실
// ──────────────────────────────────────────────

describe("isManualItemActive — casualtyLoss 단일 진실", () => {
  it("C-1: casualtyLossEnabled=false → false", () => {
    const form = { ...emptyForm(), casualtyLossEnabled: false };
    expect(isManualItemActive(form, "casualtyLoss")).toBe(false);
  });

  it("C-2: casualtyLossEnabled=true → true", () => {
    const form = { ...emptyForm(), casualtyLossEnabled: true };
    expect(isManualItemActive(form, "casualtyLoss")).toBe(true);
  });

  it("C-3: casualtyLossEnabled=false + override=true → false (단일 진실: override 무시)", () => {
    // casualtyLoss는 override가 아닌 casualtyLossEnabled를 단일 진실로 사용
    const form = {
      ...emptyForm(),
      casualtyLossEnabled: false,
      deductionChecklistOverrides: { casualtyLoss: true },
    };
    // isManualItemActive는 casualtyLoss일 때 casualtyLossEnabled만 사용
    expect(isManualItemActive(form, "casualtyLoss")).toBe(false);
  });
});

// ──────────────────────────────────────────────
// C. isAutoItemVisible — autoDetected × hasValue × override
// ──────────────────────────────────────────────

describe("isAutoItemVisible", () => {
  describe("spouse", () => {
    it("D-1: 자동감지=true → true (항상, override 무관)", () => {
      expect(isAutoItemVisible(emptyForm(), "spouse", true)).toBe(true);
    });

    it("D-2: 자동감지=false + 빈 폼 + override 없음 → false", () => {
      expect(isAutoItemVisible(emptyForm(), "spouse", false)).toBe(false);
    });

    it("D-3: 자동감지=false + spouseActualAmount 있음 → true", () => {
      const form = { ...emptyForm(), spouseActualAmount: "3000000000" };
      expect(isAutoItemVisible(form, "spouse", false)).toBe(true);
    });

    it("D-4: 자동감지=false + override=true → true", () => {
      const form = { ...emptyForm(), deductionChecklistOverrides: { spouse: true } };
      expect(isAutoItemVisible(form, "spouse", false)).toBe(true);
    });

    it("D-5: 자동감지=true + override=false → true (autoDetected 끄기 무효)", () => {
      const form = { ...emptyForm(), deductionChecklistOverrides: { spouse: false } };
      expect(isAutoItemVisible(form, "spouse", true)).toBe(true);
    });
  });

  describe("financial", () => {
    it("자동감지=true → true", () => {
      expect(isAutoItemVisible(emptyForm(), "financial", true)).toBe(true);
    });

    it("자동감지=false + netFinancialAssets 있음 → true", () => {
      const form = { ...emptyForm(), netFinancialAssets: "200000000" };
      expect(isAutoItemVisible(form, "financial", false)).toBe(true);
    });

    it("자동감지=false + 빈 폼 → false", () => {
      expect(isAutoItemVisible(emptyForm(), "financial", false)).toBe(false);
    });
  });

  describe("cohabit", () => {
    it("자동감지=true → true", () => {
      expect(isAutoItemVisible(emptyForm(), "cohabit", true)).toBe(true);
    });

    it("cohabitHouseStdPrice 있음 → true", () => {
      const form = { ...emptyForm(), cohabitHouseStdPrice: "500000000" };
      expect(isAutoItemVisible(form, "cohabit", false)).toBe(true);
    });

    it("ancillaryLandArea 있음 → true", () => {
      const form = { ...emptyForm(), ancillaryLandArea: "100" };
      expect(isAutoItemVisible(form, "cohabit", false)).toBe(true);
    });
  });

  describe("farming", () => {
    it("자동감지=true → true", () => {
      expect(isAutoItemVisible(emptyForm(), "farming", true)).toBe(true);
    });

    it("farmingAssetValue 있음 → true", () => {
      const form = { ...emptyForm(), farmingAssetValue: "150000000" };
      expect(isAutoItemVisible(form, "farming", false)).toBe(true);
    });

    it("farming 객체 있음 → true", () => {
      const form = { ...emptyForm(), farming: { dummy: true } };
      expect(isAutoItemVisible(form, "farming", false)).toBe(true);
    });
  });
});

// ──────────────────────────────────────────────
// D. manualItemHasValue — 각 key별 상세 케이스
// ──────────────────────────────────────────────

describe("manualItemHasValue", () => {
  it("familyBusiness: familyBusiness 객체 있음 → true", () => {
    const form = { ...emptyForm(), familyBusiness: { businessType: "corporate" } };
    expect(manualItemHasValue(form, "familyBusiness")).toBe(true);
  });

  it("casualtyLoss: casualtyLossEnabled=true → true", () => {
    const form = { ...emptyForm(), casualtyLossEnabled: true };
    expect(manualItemHasValue(form, "casualtyLoss")).toBe(true);
  });

  it("casualtyLoss: casualtyLossEnabled=false → false", () => {
    expect(manualItemHasValue(emptyForm(), "casualtyLoss")).toBe(false);
  });

  it("shortTermReinherit: shortTermReinheritTaxPaid 있음 → true", () => {
    const form = { ...emptyForm(), shortTermReinheritTaxPaid: "50000000" };
    expect(manualItemHasValue(form, "shortTermReinherit")).toBe(true);
  });
});

// ──────────────────────────────────────────────
// E. autoItemHasValue — 각 key별 상세 케이스
// ──────────────────────────────────────────────

describe("autoItemHasValue", () => {
  it("spouse: spouseActualAmount 없음 → false", () => {
    expect(autoItemHasValue(emptyForm(), "spouse")).toBe(false);
  });

  it("spouse: spouseActualAmount 있음 → true", () => {
    const form = { ...emptyForm(), spouseActualAmount: "100000" };
    expect(autoItemHasValue(form, "spouse")).toBe(true);
  });

  it("cohabit: buildingFootprintArea 있음 → true", () => {
    const form = { ...emptyForm(), buildingFootprintArea: "80" };
    expect(autoItemHasValue(form, "cohabit")).toBe(true);
  });

  it("farming: farming 객체 있음, farmingAssetValue 없음 → true", () => {
    const form = { ...emptyForm(), farming: { type: "rice" } };
    expect(autoItemHasValue(form, "farming")).toBe(true);
  });
});
