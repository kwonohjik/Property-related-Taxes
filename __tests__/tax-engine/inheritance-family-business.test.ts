/**
 * 가업상속공제 정밀화 anchor (상증법 §18의2 + 상증령 §15)
 *
 * 계획서: docs/00-pm/inheritance-family-business-deduction-expansion.plan.md (v3)
 * 디자인: docs/02-design/features/inheritance-family-business-deduction/inheritance-family-business-deduction.engine.design.md (v2)
 *
 * KoreanLaw MCP 검증 2026-05-21:
 *   - 상증법 §18의2 mst=276123 (시행 2026-01-02)
 *   - 상증령 §15 mst=283637 (시행 2026-02-27)
 *
 * Pre-Do anchor 6건 (FB-CAP-1~4 + FB-GUARD-1 + FB-RECAPTURE-1) +
 * 단위 anchor (FB-SHARE/INDIV/SPOUSE/FRAUD/DIRECT/AUTO/LEGACY/EXCL/MISMATCH).
 */

import { describe, expect, it } from "vitest";
import {
  calcFamilyBusinessDeductionDirect,
  calcFamilyBusinessDeductionLegacy,
  calcFamilyBusinessDeductionPhase2,
  check200PercentGuard,
  deriveFamilyBusinessValue,
  evaluateFamilyBusinessEligibility,
  familyBusinessCap,
} from "@/lib/tax-engine/deductions/family-business";
import type {
  EstateItem,
  FamilyBusinessInheritanceInput,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { INH } from "@/lib/tax-engine/legal-codes";

// ============================================================
// 표준 입력 헬퍼 — 자격 충족 SME corporate 15년
// ============================================================

function buildPassingFB(overrides: Partial<FamilyBusinessInheritanceInput> = {}): FamilyBusinessInheritanceInput {
  return {
    businessType: "corporate",
    operatingYears: 15,
    enterpriseSize: "sme",
    totalAssets: 100_000_000_000, // 1천억 (5천억 미만)
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
    ...overrides,
  };
}

// ============================================================
// Pre-Do anchor — FB-CAP-1~4 (상증법 §18의2① 한도 3단)
// ============================================================

describe("FB-CAP — §18의2① 영위 연수별 한도 3단", () => {
  it("FB-CAP-1: 영위 9년 → 자격 미충족 (operating_years_below_10), cap=0", () => {
    const cap = familyBusinessCap(9);
    expect(cap).toBe(0);

    const elig = evaluateFamilyBusinessEligibility(buildPassingFB({ operatingYears: 9 }));
    expect(elig.eligible).toBe(false);
    expect(elig.reasons).toContain("operating_years_below_10");
  });

  it("FB-CAP-2: 영위 15년 → 300억 캡 (1호)", () => {
    expect(familyBusinessCap(15)).toBe(30_000_000_000);
  });

  it("FB-CAP-3: 영위 25년 → 400억 캡 (2호)", () => {
    expect(familyBusinessCap(25)).toBe(40_000_000_000);
  });

  it("FB-CAP-4: 영위 35년 → 600억 캡 (3호)", () => {
    expect(familyBusinessCap(35)).toBe(60_000_000_000);
  });

  it("FB-CAP-경계: 정확히 10년 → 300억, 정확히 20년 → 400억, 정확히 30년 → 600억", () => {
    expect(familyBusinessCap(10)).toBe(30_000_000_000);
    expect(familyBusinessCap(20)).toBe(40_000_000_000);
    expect(familyBusinessCap(30)).toBe(60_000_000_000);
  });

  it("FB-CAP-fallback: undefined → 600억 (legacy/직접입력)", () => {
    expect(familyBusinessCap(undefined)).toBe(60_000_000_000);
  });
});

// ============================================================
// Pre-Do anchor — FB-GUARD-1 (§18의2② 중견기업 200% 가드)
// ============================================================

describe("FB-GUARD — §18의2② 중견기업 200% 가드", () => {
  it("FB-GUARD-1: medium + 외산 net > 200% cap → 공제 배제", () => {
    const fb = buildPassingFB({
      enterpriseSize: "medium",
      averageRevenue3Y: 400_000_000_000, // 4천억 (5천억 미만 OK)
      heirOtherEstateValue: 8_000_000_000, // 80억
      heirDebt: 500_000_000, // 5억
    });
    // 외산 net = 75억, taxIfNoFBD=30억 → cap200pct=60억 → 75 > 60 → exceeded
    const r = calcFamilyBusinessDeductionPhase2({
      input: fb,
      estateItems: undefined,
      familyBusinessValueOverride: 10_000_000_000, // 100억
      taxIfNoFBD: 3_000_000_000, // 30억
      lawRef: INH.FAMILY_BUSINESS_DEDUCTION,
    });
    expect(r.detail.eligible).toBe(false);
    expect(r.detail.ineligibleReasons).toContain("medium_other_estate_exceeds_200pct");
    expect(r.detail.mediumGuard?.exceeded).toBe(true);
    expect(r.detail.mediumGuard?.cap200pct).toBe(6_000_000_000);
    expect(r.detail.mediumGuard?.otherEstateNet).toBe(7_500_000_000);
    expect(r.deduction).toBe(0);
  });

  it("FB-GUARD-2: medium + 외산 net <= 200% cap → 통과 (300억 캡 적용)", () => {
    const fb = buildPassingFB({
      enterpriseSize: "medium",
      averageRevenue3Y: 400_000_000_000,
      heirOtherEstateValue: 5_000_000_000, // 50억
      heirDebt: 500_000_000,
    });
    // 외산 net = 45억, cap200pct = 60억 → OK
    const r = calcFamilyBusinessDeductionPhase2({
      input: fb,
      estateItems: undefined,
      familyBusinessValueOverride: 10_000_000_000,
      taxIfNoFBD: 3_000_000_000,
      lawRef: INH.FAMILY_BUSINESS_DEDUCTION,
    });
    expect(r.detail.eligible).toBe(true);
    expect(r.detail.mediumGuard?.exceeded).toBe(false);
    expect(r.detail.appliedCap).toBe(30_000_000_000);
    expect(r.deduction).toBe(10_000_000_000); // 100억 < 300억 캡
  });

  it("FB-GUARD-3: sme는 200% 가드 비활성 (mediumGuard=undefined)", () => {
    const guard = check200PercentGuard(buildPassingFB({ enterpriseSize: "sme" }), 3_000_000_000);
    expect(guard).toBeUndefined();
  });
});

// ============================================================
// Pre-Do anchor — FB-RECAPTURE-1 (산식 동결, Phase F 단위 anchor)
// ============================================================

describe("FB-RECAPTURE — 상증령 §15⑮ 추징율 100% 일률 (산식 동결)", () => {
  it("FB-RECAPTURE-1: 추징 = 공제액 × 100% (자산처분비율 추가 곱 자산처분 한정)", () => {
    // 본 PR scope 외 — 산식 동결 anchor
    const appliedDeduction = 30_000_000_000;
    const recaptureRate = 1.0; // 상증령 §15⑮ "100분의 100"

    // 자산처분 외 위반 (가업미종사·지분감소·정규직&총급여)
    const recaptureNonAsset = appliedDeduction * recaptureRate * 1;
    expect(recaptureNonAsset).toBe(30_000_000_000);

    // 자산 50% 처분 위반 (§18의2⑤1호 + 상증령 §15⑩ 자산처분비율 50%)
    const assetDisposalRatio = 0.5;
    const recaptureAsset = appliedDeduction * recaptureRate * assetDisposalRatio;
    expect(recaptureAsset).toBe(15_000_000_000);
  });
});

// ============================================================
// 단위 anchor — FB-SHARE (피상속인 지분 요건 상증령 §15③1호 가)
// ============================================================

describe("FB-SHARE — 피상속인 지분 요건 (corporate)", () => {
  it("FB-SHARE-1: corporate + decedentMajorShareholdingMet=false → decedent_majority_share_failed", () => {
    const elig = evaluateFamilyBusinessEligibility(buildPassingFB({
      decedentMajorShareholdingMet: false,
    }));
    expect(elig.eligible).toBe(false);
    expect(elig.reasons).toContain("decedent_majority_share_failed");
  });

  it("FB-SHARE-2: corporate + 상장 20% 충족 (boolean true) → OK", () => {
    const elig = evaluateFamilyBusinessEligibility(buildPassingFB({
      isListedOnExchange: true,
      decedentMajorShareholdingMet: true,
    }));
    expect(elig.eligible).toBe(true);
  });
});

// ============================================================
// 단위 anchor — FB-INDIV (individual 사업유형 지분 요건 skip)
// ============================================================

describe("FB-INDIV — 개인사업자 (businessType=individual) 지분 요건 skip", () => {
  it("FB-INDIV-1: individual + decedentMajorShareholdingMet 미입력 → eligible (지분 요건 skip)", () => {
    const elig = evaluateFamilyBusinessEligibility(buildPassingFB({
      businessType: "individual",
      decedentMajorShareholdingMet: undefined,
      isListedOnExchange: undefined,
    }));
    expect(elig.eligible).toBe(true);
    expect(elig.reasons).toEqual([]);
  });
});

// ============================================================
// 단위 anchor — FB-SPOUSE (상증령 §15③2호 후단 배우자 충족 간주)
// ============================================================

describe("FB-SPOUSE — 상속인 배우자 요건 충족 간주", () => {
  it("FB-SPOUSE-1: spouseFulfillsRequirements=true → heir 4종 평가 skip", () => {
    const elig = evaluateFamilyBusinessEligibility(buildPassingFB({
      spouseFulfillsRequirements: true,
      heirIsAdult: false,
      heirTwoYearEngagement: false,
      heirOfficerByFilingDeadline: false,
      heirCEOWithinTwoYears: false,
    }));
    expect(elig.eligible).toBe(true);
  });

  it("FB-SPOUSE-2: spouseFulfillsRequirements=false + heir 미충족 → reasons 누적", () => {
    const elig = evaluateFamilyBusinessEligibility(buildPassingFB({
      heirIsAdult: false,
      heirTwoYearEngagement: false,
    }));
    expect(elig.eligible).toBe(false);
    expect(elig.reasons).toContain("heir_not_adult");
    expect(elig.reasons).toContain("heir_engagement_short");
  });

  it("FB-SPOUSE-3: decedentEarlyDeath=true → 2년 종사 요건 면제 (heir_engagement_short 제외)", () => {
    const elig = evaluateFamilyBusinessEligibility(buildPassingFB({
      heirTwoYearEngagement: false,
      decedentEarlyDeath: true,
    }));
    expect(elig.eligible).toBe(true);
    expect(elig.reasons).not.toContain("heir_engagement_short");
  });
});

// ============================================================
// 단위 anchor — FB-FRAUD (§18의2⑧1호 short-circuit)
// ============================================================

describe("FB-FRAUD — 조세포탈·회계부정 short-circuit", () => {
  it("FB-FRAUD-1: hasTaxFraudConviction=true → reasons=[tax_fraud_conviction] only (다른 사유 무시)", () => {
    const elig = evaluateFamilyBusinessEligibility(buildPassingFB({
      operatingYears: 9, // 다른 미충족 사유 존재
      isEligibleIndustry: false,
      hasTaxFraudConviction: true,
    }));
    expect(elig.eligible).toBe(false);
    expect(elig.reasons).toEqual(["tax_fraud_conviction"]);
  });
});

// ============================================================
// 단위 anchor — FB-DIRECT (Phase E escape hatch)
// ============================================================

describe("FB-DIRECT — Phase E 직접입력 모드", () => {
  it("FB-DIRECT-1: 100억 입력 → cap 600억 fallback, deduction=100억", () => {
    const r = calcFamilyBusinessDeductionDirect(10_000_000_000, INH.FAMILY_BUSINESS_DEDUCTION);
    expect(r.detail.usedDirectInput).toBe(true);
    expect(r.detail.appliedCap).toBe(60_000_000_000);
    expect(r.deduction).toBe(10_000_000_000);
  });

  it("FB-DIRECT-2: 700억 입력 → 600억 캡 적용", () => {
    const r = calcFamilyBusinessDeductionDirect(70_000_000_000, INH.FAMILY_BUSINESS_DEDUCTION);
    expect(r.deduction).toBe(60_000_000_000);
  });

  it("FB-DIRECT-3: 직접입력 모드는 요건 판정 우회 (eligible=true 강제)", () => {
    const r = calcFamilyBusinessDeductionDirect(10_000_000_000, INH.FAMILY_BUSINESS_DEDUCTION);
    expect(r.detail.eligible).toBe(true);
    expect(r.detail.ineligibleReasons).toBeUndefined();
  });
});

// ============================================================
// 단위 anchor — FB-AUTO (EstateItem.familyBusinessCategory 자동 합산)
// ============================================================

describe("FB-AUTO — EstateItem 자동 합산", () => {
  it("FB-AUTO-1: 분류 3건 합 = 300억 자동 도출", () => {
    const estateItems: EstateItem[] = [
      { id: "1", category: "real_estate_building", name: "공장", marketValue: 10_000_000_000, familyBusinessCategory: "business_real_estate" },
      { id: "2", category: "other", name: "기계", marketValue: 5_000_000_000, familyBusinessCategory: "business_equipment" },
      { id: "3", category: "unlisted_stock", name: "법인주식", marketValue: 15_000_000_000, familyBusinessCategory: "corporate_stock" },
      { id: "4", category: "cash", name: "현금", marketValue: 1_000_000_000 }, // 가업 아님
    ];
    expect(deriveFamilyBusinessValue(estateItems)).toBe(30_000_000_000);
  });

  it("FB-AUTO-2: 빈 배열 / undefined → 0", () => {
    expect(deriveFamilyBusinessValue([])).toBe(0);
    expect(deriveFamilyBusinessValue(undefined)).toBe(0);
  });

  it("[FB15-1] corporate_stock + corporateTotalAssets 입력 → §15⑤2호 차감 (PR4)", () => {
    // 법인주식 10억, 총자산 20억, 사업무관자산 합 5억 → floor(10억 × (20억−5억)/20억) = 7.5억
    const estateItems: EstateItem[] = [
      {
        id: "1",
        category: "unlisted_stock",
        name: "법인주식",
        marketValue: 1_000_000_000,
        familyBusinessCategory: "corporate_stock",
        corporateTotalAssets: 2_000_000_000,
        corporateNonBusinessAssets: {
          nonBusinessLand: 200_000_000,
          rentedRealEstate: 100_000_000,
          externalLoans: 50_000_000,
          excessCash: 100_000_000,
          nonOperatingFinancial: 50_000_000,
        },
      },
    ];
    // floor(1,000,000,000 × (2,000,000,000 − 500,000,000) / 2,000,000,000) = 750,000,000
    expect(deriveFamilyBusinessValue(estateItems)).toBe(750_000_000);
  });

  it("[FB15-2 회귀] corporateTotalAssets 미입력 → marketValue 그대로 (직접입력 모드)", () => {
    const estateItems: EstateItem[] = [
      {
        id: "1",
        category: "unlisted_stock",
        name: "법인주식(차감 후 직접입력)",
        marketValue: 750_000_000,
        familyBusinessCategory: "corporate_stock",
        // corporateTotalAssets 미입력 → 차감 안 함
      },
    ];
    expect(deriveFamilyBusinessValue(estateItems)).toBe(750_000_000);
  });

  it("[FB15-5] 혼합 — 법인주식(차감) + 개인사업자산(비차감) 합산", () => {
    const estateItems: EstateItem[] = [
      {
        id: "1",
        category: "real_estate_building",
        name: "공장",
        marketValue: 10_000_000_000,
        familyBusinessCategory: "business_real_estate",
        // 개인사업 자산 — corporate_stock 아님 → 차감 무관
      },
      {
        id: "2",
        category: "unlisted_stock",
        name: "법인주식",
        marketValue: 1_000_000_000,
        familyBusinessCategory: "corporate_stock",
        corporateTotalAssets: 2_000_000_000,
        corporateNonBusinessAssets: {
          nonBusinessLand: 500_000_000,
          rentedRealEstate: 0,
          externalLoans: 0,
          excessCash: 0,
          nonOperatingFinancial: 0,
        },
      },
    ];
    // 공장 100억(비차감) + 법인주식 floor(10억×(20억−5억)/20억)=7.5억 = 107.5억
    expect(deriveFamilyBusinessValue(estateItems)).toBe(10_750_000_000);
  });

  it("FB-AUTO-3: Phase B에서 manual override 우선, manual 없으면 auto 사용", () => {
    const fb = buildPassingFB({ operatingYears: 15 });
    const items: EstateItem[] = [
      { id: "1", category: "other", name: "X", marketValue: 5_000_000_000, familyBusinessCategory: "other" },
    ];

    // manual override 없음 → auto 사용
    const noOverride = calcFamilyBusinessDeductionPhase2({
      input: fb,
      estateItems: items,
      taxIfNoFBD: 0,
      lawRef: INH.FAMILY_BUSINESS_DEDUCTION,
    });
    expect(noOverride.detail.finalValue).toBe(5_000_000_000);

    // manual override → override 우선
    const withOverride = calcFamilyBusinessDeductionPhase2({
      input: fb,
      estateItems: items,
      familyBusinessValueOverride: 8_000_000_000,
      taxIfNoFBD: 0,
      lawRef: INH.FAMILY_BUSINESS_DEDUCTION,
    });
    expect(withOverride.detail.finalValue).toBe(8_000_000_000);
  });
});

// ============================================================
// 단위 anchor — FB-LEGACY (familyBusinessYears legacy fallback)
// ============================================================

describe("FB-LEGACY — familyBusinessYears + familyBusinessValue 단독 사용", () => {
  it("FB-LEGACY-1: years=15 + value=200억 → 300억 캡 적용, deduction=200억", () => {
    const r = calcFamilyBusinessDeductionLegacy(20_000_000_000, 15, INH.FAMILY_BUSINESS_DEDUCTION);
    expect(r.detail.appliedCap).toBe(30_000_000_000);
    expect(r.deduction).toBe(20_000_000_000);
    expect(r.detail.usedDirectInput).toBe(false);
  });

  it("FB-LEGACY-2: years 미입력 → 600억 fallback", () => {
    const r = calcFamilyBusinessDeductionLegacy(50_000_000_000, undefined, INH.FAMILY_BUSINESS_DEDUCTION);
    expect(r.detail.appliedCap).toBe(60_000_000_000);
    expect(r.deduction).toBe(50_000_000_000);
  });

  it("FB-LEGACY-3: years=5 + value=100억 → cap=0, deduction=0 (자격 미충족)", () => {
    const r = calcFamilyBusinessDeductionLegacy(10_000_000_000, 5, INH.FAMILY_BUSINESS_DEDUCTION);
    expect(r.detail.appliedCap).toBe(0);
    expect(r.deduction).toBe(0);
    expect(r.detail.eligible).toBe(false);
    expect(r.detail.ineligibleReasons).toEqual(["operating_years_below_10"]);
  });

  it("FB-LEGACY-4: value=0 → deduction=0, detail eligible=false", () => {
    const r = calcFamilyBusinessDeductionLegacy(0, 15, INH.FAMILY_BUSINESS_DEDUCTION);
    expect(r.deduction).toBe(0);
    expect(r.detail.eligible).toBe(false);
  });
});

// ============================================================
// 단위 anchor — FB-INDUSTRY·FB-SIZE
// ============================================================

describe("FB-INDUSTRY/SIZE — 별표 업종·기업 규모 가드", () => {
  it("FB-INDUSTRY-1: isEligibleIndustry=false → industry_not_eligible", () => {
    const elig = evaluateFamilyBusinessEligibility(buildPassingFB({ isEligibleIndustry: false }));
    expect(elig.reasons).toContain("industry_not_eligible");
  });

  it("FB-SIZE-1: sme + 자산 5천억 이상 → enterprise_size_exceeded", () => {
    const elig = evaluateFamilyBusinessEligibility(buildPassingFB({
      enterpriseSize: "sme",
      totalAssets: 600_000_000_000, // 6천억
    }));
    expect(elig.reasons).toContain("enterprise_size_exceeded");
  });

  it("FB-SIZE-2: medium + 매출 5천억 이상 → enterprise_size_exceeded", () => {
    const elig = evaluateFamilyBusinessEligibility(buildPassingFB({
      enterpriseSize: "medium",
      averageRevenue3Y: 600_000_000_000,
    }));
    expect(elig.reasons).toContain("enterprise_size_exceeded");
  });
});

// ============================================================
// 단위 anchor — FB-OFZ (기회발전특구 특례 상증령 §15㉕)
// ============================================================

describe("FB-OFZ — 기회발전특구 특례 (상증령 §15㉕)", () => {
  it("FB-OFZ-1: OFZ 양 요건 충족 + heirCEOWithinTwoYears=false → 라목 면제 (heir_ceo_not_scheduled 제외)", () => {
    const elig = evaluateFamilyBusinessEligibility(buildPassingFB({
      heirCEOWithinTwoYears: false,
      isInOpportunityDevelopmentZone: true,
      ofzWorkforceRatio50PlusMet: true,
    }));
    expect(elig.eligible).toBe(true);
    expect(elig.reasons).not.toContain("heir_ceo_not_scheduled");
  });

  it("FB-OFZ-2: OFZ 비활성 (특구 소재 X) + heirCEOWithinTwoYears=false → 차단", () => {
    const elig = evaluateFamilyBusinessEligibility(buildPassingFB({
      heirCEOWithinTwoYears: false,
      isInOpportunityDevelopmentZone: false,
      ofzWorkforceRatio50PlusMet: true,
    }));
    expect(elig.eligible).toBe(false);
    expect(elig.reasons).toContain("heir_ceo_not_scheduled");
  });

  it("FB-OFZ-3: OFZ 1호만 충족 (50% 인원 X) → 면제 불성립 (둘 다 충족해야)", () => {
    const elig = evaluateFamilyBusinessEligibility(buildPassingFB({
      heirCEOWithinTwoYears: false,
      isInOpportunityDevelopmentZone: true,
      ofzWorkforceRatio50PlusMet: false,
    }));
    expect(elig.eligible).toBe(false);
    expect(elig.reasons).toContain("heir_ceo_not_scheduled");
  });

  it("FB-OFZ-4: OFZ 양 요건 충족이라도 다른 요건 미충족은 면제 대상 아님 (heir_not_adult 등)", () => {
    const elig = evaluateFamilyBusinessEligibility(buildPassingFB({
      heirIsAdult: false,
      heirCEOWithinTwoYears: false,
      isInOpportunityDevelopmentZone: true,
      ofzWorkforceRatio50PlusMet: true,
    }));
    expect(elig.eligible).toBe(false);
    expect(elig.reasons).toContain("heir_not_adult");
    // CEO 요건은 면제됐으나 18세는 면제 대상 아님
    expect(elig.reasons).not.toContain("heir_ceo_not_scheduled");
  });

  it("FB-OFZ-5: spouseFulfillsRequirements=true가 OFZ보다 우선 (전체 heir 요건 skip)", () => {
    const elig = evaluateFamilyBusinessEligibility(buildPassingFB({
      spouseFulfillsRequirements: true,
      heirCEOWithinTwoYears: false,
      heirIsAdult: false,
      isInOpportunityDevelopmentZone: false,
    }));
    expect(elig.eligible).toBe(true);
  });
});

// ============================================================
// 단위 anchor — FB-INTEGRATION (orchestrator STEP ⑧ 통합 회귀)
// ============================================================

describe("FB-INTEGRATION — Phase B 통합 산출", () => {
  it("FB-INTEGRATION-1: 자격 충족 + 200억 자산 + 영위 15년 → 200억 공제 (300억 캡 미달)", () => {
    const r = calcFamilyBusinessDeductionPhase2({
      input: buildPassingFB({ operatingYears: 15 }),
      estateItems: undefined,
      familyBusinessValueOverride: 20_000_000_000,
      taxIfNoFBD: 0,
      lawRef: INH.FAMILY_BUSINESS_DEDUCTION,
    });
    expect(r.detail.eligible).toBe(true);
    expect(r.detail.appliedCap).toBe(30_000_000_000);
    expect(r.deduction).toBe(20_000_000_000);
    expect(r.detail.usedDirectInput).toBe(false);
  });

  it("FB-INTEGRATION-2: 자격 미충족 시 deduction=0 + ineligibleReasons 전달", () => {
    const r = calcFamilyBusinessDeductionPhase2({
      input: buildPassingFB({ operatingYears: 9 }),
      estateItems: undefined,
      familyBusinessValueOverride: 20_000_000_000,
      taxIfNoFBD: 0,
      lawRef: INH.FAMILY_BUSINESS_DEDUCTION,
    });
    expect(r.detail.eligible).toBe(false);
    expect(r.detail.appliedCap).toBe(0);
    expect(r.deduction).toBe(0);
    expect(r.detail.ineligibleReasons).toContain("operating_years_below_10");
  });

  it("FB-INTEGRATION-3: 캡 초과 시 캡으로 절단 (영위 15년 + 자산 500억 → 300억)", () => {
    const r = calcFamilyBusinessDeductionPhase2({
      input: buildPassingFB({ operatingYears: 15 }),
      estateItems: undefined,
      familyBusinessValueOverride: 50_000_000_000,
      taxIfNoFBD: 0,
      lawRef: INH.FAMILY_BUSINESS_DEDUCTION,
    });
    expect(r.deduction).toBe(30_000_000_000);
  });
});

// ============================================================
// FB-APPLIED-RATE — 소득세법 시행령 §163의2③ 적용률 carry (Track 2/4 prefill 소스)
// ============================================================

describe("FB-APPLIED-RATE — 가업상속공제 적용률 (소령 §163의2③)", () => {
  it("FB-RATE-1: Phase2 캡 미초과 (자산 200억 + 영위 15년 → cap 300억) → appliedRate=1.0", () => {
    const r = calcFamilyBusinessDeductionPhase2({
      input: buildPassingFB({ operatingYears: 15 }),
      estateItems: undefined,
      familyBusinessValueOverride: 20_000_000_000,
      taxIfNoFBD: 0,
      lawRef: INH.FAMILY_BUSINESS_DEDUCTION,
    });
    expect(r.deduction).toBe(20_000_000_000);
    expect(r.detail.appliedRate).toBe(1);
  });

  it("FB-RATE-2: Phase2 캡 절단 (자산 500억 + 영위 15년 → cap 300억) → appliedRate=0.6", () => {
    const r = calcFamilyBusinessDeductionPhase2({
      input: buildPassingFB({ operatingYears: 15 }),
      estateItems: undefined,
      familyBusinessValueOverride: 50_000_000_000,
      taxIfNoFBD: 0,
      lawRef: INH.FAMILY_BUSINESS_DEDUCTION,
    });
    expect(r.deduction).toBe(30_000_000_000);
    expect(r.detail.appliedRate).toBeCloseTo(0.6, 10);
  });

  it("FB-RATE-3: 자격 미충족 (영위 9년) → deduction=0 + appliedRate=0", () => {
    const r = calcFamilyBusinessDeductionPhase2({
      input: buildPassingFB({ operatingYears: 9 }),
      estateItems: undefined,
      familyBusinessValueOverride: 10_000_000_000,
      taxIfNoFBD: 0,
      lawRef: INH.FAMILY_BUSINESS_DEDUCTION,
    });
    expect(r.deduction).toBe(0);
    expect(r.detail.appliedRate).toBe(0);
  });

  it("FB-RATE-4: 직접입력 모드 (100억 < cap 600억) → appliedRate=1.0", () => {
    const r = calcFamilyBusinessDeductionDirect(10_000_000_000, INH.FAMILY_BUSINESS_DEDUCTION);
    expect(r.deduction).toBe(10_000_000_000);
    expect(r.detail.appliedRate).toBe(1);
  });

  it("FB-RATE-5: 직접입력 모드 캡 초과 (700억 → cap 600억) → finalValue=capped이므로 appliedRate=1.0", () => {
    const r = calcFamilyBusinessDeductionDirect(70_000_000_000, INH.FAMILY_BUSINESS_DEDUCTION);
    expect(r.deduction).toBe(60_000_000_000);
    expect(r.detail.appliedRate).toBe(1);
  });

  it("FB-RATE-6: legacy 모드 캡 절단 (200억 + 영위 15년 → cap 300억 미초과) → appliedRate=1.0", () => {
    const r = calcFamilyBusinessDeductionLegacy(20_000_000_000, 15, INH.FAMILY_BUSINESS_DEDUCTION);
    expect(r.deduction).toBe(20_000_000_000);
    expect(r.detail.appliedRate).toBe(1);
  });

  it("FB-RATE-7: legacy 모드 캡 절단 (500억 + 영위 15년 → cap 300억 절단) → appliedRate=0.6", () => {
    const r = calcFamilyBusinessDeductionLegacy(50_000_000_000, 15, INH.FAMILY_BUSINESS_DEDUCTION);
    expect(r.deduction).toBe(30_000_000_000);
    expect(r.detail.appliedRate).toBeCloseTo(0.6, 10);
  });

  it("FB-RATE-8: 분모 0 가드 (familyBusinessValue=0) → appliedRate=0 (NaN 차단)", () => {
    const r = calcFamilyBusinessDeductionLegacy(0, 15, INH.FAMILY_BUSINESS_DEDUCTION);
    expect(r.deduction).toBe(0);
    expect(r.detail.appliedRate).toBe(0);
  });
});
