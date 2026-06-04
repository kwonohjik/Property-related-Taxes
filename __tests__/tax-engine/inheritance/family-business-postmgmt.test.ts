/**
 * 가업상속공제 사후관리 orchestrator anchor (PR-2)
 *
 * 계획서: docs/00-pm/inheritance-family-business-postmgmt.plan.md (v3) §5
 * 법령: 상증법 §18의2⑤⑨⑩ + 상증령 §15⑧⑩⑪⑮⑯⑰⑱㉕ (KoreanLaw MCP 2026-06-04 검증)
 *
 * PHF-PERIOD(5년가드)·OFZ(면제)·JUSTIFY(정당사유)·MULTI(재차부과)·CGT(환원)·
 * INTEREST(이자)·EMPLOY/SALARY(정규직 4호 AND)·AMEND(수정신고)·META(빌더).
 */

import { describe, expect, it } from "vitest";
import {
  buildAmendmentReturnData,
  buildFamilyBusinessPostMgmtMeta,
  calcFamilyBusinessPostMgmt,
  isWithinFiveYears,
  mapEstateItemToPostMgmtType,
} from "@/lib/tax-engine/credits/family-business-postmgmt-orchestrator";
import {
  calcRegularEmployeeAverage,
  isEmploymentDropViolation,
  isSalaryDropViolation,
} from "@/lib/tax-engine/credits/family-business-employment";
import type {
  EstateItem,
  FamilyBusinessDeductionDetail,
  FamilyBusinessPostMgmtInput,
} from "@/lib/tax-engine/types/inheritance-gift.types";

function baseInput(over: Partial<FamilyBusinessPostMgmtInput> = {}): FamilyBusinessPostMgmtInput {
  return {
    appliedDeduction: 10_000_000_000, // 100억
    deathDate: "2025-07-01",
    filingDeadline: "2026-01-31",
    ofzExemptionActive: false,
    violations: [],
    annualInterestRate: 0.022,
    ...over,
  };
}

// ============================================================
// PHF-PERIOD — 5년 가드 (상증법 §18의2⑤ "상속개시일부터 5년 이내")
// ============================================================
describe("PHF-PERIOD — 5년 가드", () => {
  it("isWithinFiveYears: 1.5년 내 → true / 5.5년 → false / 정확히 5년 → true(경계 포함)", () => {
    expect(isWithinFiveYears("2027-06-01", "2026-01-01")).toBe(true);
    expect(isWithinFiveYears("2031-06-01", "2026-01-01")).toBe(false);
    expect(isWithinFiveYears("2031-01-01", "2026-01-01")).toBe(true);
  });

  it("PHF-PERIOD-2: 5년 초과 위반 → 자동 면제(outside_five_year_period)", () => {
    const r = calcFamilyBusinessPostMgmt(baseInput({
      deathDate: "2026-01-01",
      violations: [{ date: "2031-06-01", type: "business_cessation", cessationSubType: "ceo_not_serving" }],
    }));
    expect(r.perViolationDetail[0].exempted).toBe(true);
    expect(r.perViolationDetail[0].exemptionReason).toBe("outside_five_year_period");
    expect(r.totalRecapture).toBe(0);
  });

  it("PHF-PERIOD-1: 5년 내 위반 → 추징(미면제)", () => {
    const r = calcFamilyBusinessPostMgmt(baseInput({
      deathDate: "2026-01-01",
      filingDeadline: "2026-07-31",
      violations: [{ date: "2027-06-01", type: "business_cessation", cessationSubType: "business_pause" }],
    }));
    expect(r.perViolationDetail[0].exempted).toBe(false);
    expect(r.totalRecapture).toBe(10_000_000_000); // 100% 추징
  });
});

// ============================================================
// PHF-OFZ — 기회발전특구 사후관리 면제 (§15㉕ → §15⑪1·2호 한정)
// ============================================================
describe("PHF-OFZ — OFZ 사후관리 면제", () => {
  it("PHF-OFZ-1: ofz + ceo_not_serving → 면제", () => {
    const r = calcFamilyBusinessPostMgmt(baseInput({
      ofzExemptionActive: true,
      violations: [{ date: "2026-06-01", type: "business_cessation", cessationSubType: "ceo_not_serving" }],
    }));
    expect(r.perViolationDetail[0].exempted).toBe(true);
    expect(r.perViolationDetail[0].exemptionReason).toBe("ofz_exemption");
  });

  it("PHF-OFZ-2: ofz + industry_change → 면제", () => {
    const r = calcFamilyBusinessPostMgmt(baseInput({
      ofzExemptionActive: true,
      violations: [{ date: "2026-06-01", type: "business_cessation", cessationSubType: "industry_change" }],
    }));
    expect(r.perViolationDetail[0].exempted).toBe(true);
    expect(r.perViolationDetail[0].exemptionReason).toBe("ofz_exemption");
  });

  it("PHF-OFZ-3 ★: ofz + business_pause(§15⑪3호) → 면제 불성립(추징)", () => {
    const r = calcFamilyBusinessPostMgmt(baseInput({
      ofzExemptionActive: true,
      violations: [{ date: "2026-06-01", type: "business_cessation", cessationSubType: "business_pause" }],
    }));
    expect(r.perViolationDetail[0].exempted).toBe(false);
    expect(r.totalRecapture).toBe(10_000_000_000);
  });

  it("PHF-OFZ-4: ofz + asset_disposal → 면제 불성립", () => {
    const r = calcFamilyBusinessPostMgmt(baseInput({
      ofzExemptionActive: true,
      violations: [{ date: "2026-06-01", type: "asset_disposal", disposedAssetValue: 5_000_000_000, totalBusinessAssetValue: 10_000_000_000 }],
    }));
    expect(r.perViolationDetail[0].exempted).toBe(false);
  });
});

// ============================================================
// PHF-JUSTIFY — 명시 정당사유 (§15⑧)
// ============================================================
describe("PHF-JUSTIFY — 정당사유", () => {
  it("PHF-JUSTIFY-1: asset_disposal + expropriation → 면제", () => {
    const r = calcFamilyBusinessPostMgmt(baseInput({
      violations: [{ date: "2026-06-01", type: "asset_disposal", disposedAssetValue: 5_000_000_000, totalBusinessAssetValue: 10_000_000_000 }],
      justifiableReasons: [{ violationRef: 0, reasonCode: "expropriation" }],
    }));
    expect(r.perViolationDetail[0].exempted).toBe(true);
    expect(r.perViolationDetail[0].exemptionReason).toBe("expropriation");
    expect(r.totalRecapture).toBe(0);
  });

  it("우선순위: 5년 초과는 정당사유보다 우선(outside_five_year_period)", () => {
    const r = calcFamilyBusinessPostMgmt(baseInput({
      deathDate: "2026-01-01",
      violations: [{ date: "2032-01-01", type: "asset_disposal", disposedAssetValue: 5_000_000_000, totalBusinessAssetValue: 10_000_000_000 }],
      justifiableReasons: [{ violationRef: 0, reasonCode: "expropriation" }],
    }));
    expect(r.perViolationDetail[0].exemptionReason).toBe("outside_five_year_period");
  });
});

// ============================================================
// PHF-MULTI — 재차 부과 §15⑩ 단서 (종전 처분 자산 제외)
// ============================================================
describe("PHF-MULTI — 재차 부과 §15⑩ 단서", () => {
  it("PHF-MULTI-1: priorDisposedExcluded가 분자·분모에서 차감되어 추징 감소", () => {
    // priorDisposedExcluded 20억: ratio=(60억-20억)/(100억-20억)=40/80=0.5 → 추징 50억
    const withPrior = calcFamilyBusinessPostMgmt(baseInput({
      violations: [{
        date: "2026-06-01", type: "asset_disposal",
        disposedAssetValue: 6_000_000_000, totalBusinessAssetValue: 10_000_000_000,
        priorDisposedExcluded: 2_000_000_000,
      }],
    }));
    expect(withPrior.totalRecapture).toBe(5_000_000_000);

    // 단서 미적용: ratio=60/100=0.6 → 추징 60억
    const noPrior = calcFamilyBusinessPostMgmt(baseInput({
      violations: [{
        date: "2026-06-01", type: "asset_disposal",
        disposedAssetValue: 6_000_000_000, totalBusinessAssetValue: 10_000_000_000,
      }],
    }));
    expect(noPrior.totalRecapture).toBe(6_000_000_000);
  });
});

// ============================================================
// PHF-CGT-NET — 양도세 환원 공제 (§18의2⑩)
// ============================================================
describe("PHF-CGT-NET — 양도세 환원 공제", () => {
  it("PHF-CGT-NET-1: 추징 100억 + 환원 50억 → netRecapture 50억", () => {
    const r = calcFamilyBusinessPostMgmt(baseInput({
      violations: [{ date: "2026-06-01", type: "share_decrease" }],
      cgtCreditAmount: 5_000_000_000,
    }));
    expect(r.totalRecapture).toBe(10_000_000_000);
    expect(r.cgtCreditApplied).toBe(5_000_000_000);
    expect(r.netRecapture).toBe(5_000_000_000);
  });

  it("PHF-CGT-NET-2: 환원 > 추징 → netRecapture 0(음수 가드), 적용액=추징 min", () => {
    const r = calcFamilyBusinessPostMgmt(baseInput({
      appliedDeduction: 500_000_000, // 5억
      violations: [{ date: "2026-06-01", type: "share_decrease" }],
      cgtCreditAmount: 10_000_000_000,
    }));
    expect(r.totalRecapture).toBe(500_000_000);
    expect(r.cgtCreditApplied).toBe(500_000_000);
    expect(r.netRecapture).toBe(0);
  });
});

// ============================================================
// PHF-INTEREST — 이자상당액 (§15⑯)
// ============================================================
describe("PHF-INTEREST — 이자상당액", () => {
  it("PHF-INTEREST-DAYS-1: 신고기한 2026-01-01 → 위반 2026-01-31(30일), 연 2.2%", () => {
    const r = calcFamilyBusinessPostMgmt(baseInput({
      appliedDeduction: 1_000_000_000, // 10억
      deathDate: "2025-07-01",
      filingDeadline: "2026-01-01",
      violations: [{ date: "2026-01-31", type: "business_cessation", cessationSubType: "business_pause" }],
      annualInterestRate: 0.022,
    }));
    // 추징 10억(100%), 이자 = floor(10억 × 30 × 0.022/365) = 1,808,219
    expect(r.perViolationDetail[0].recapture).toBe(1_000_000_000);
    expect(r.totalInterest).toBe(1_808_219);
  });
});

// ============================================================
// PHF-EMPLOY / PHF-SALARY — 정규직·총급여 §⑤4호 AND
// ============================================================
describe("PHF-EMPLOY/SALARY — 정규직·총급여 4호 AND", () => {
  it("calcRegularEmployeeAverage: 월 인원 평균 (§15⑰)", () => {
    expect(calcRegularEmployeeAverage([
      { monthEnd: "2026-01", regularEmployees: 80 },
      { monthEnd: "2026-02", regularEmployees: 100 },
    ])).toBe(90);
  });

  it("PHF-EMPLOY-3 ★: §15⑱ 분할·합병 승계 인원(spinoffMerged) 포함", () => {
    expect(calcRegularEmployeeAverage([
      { monthEnd: "2026-01", regularEmployees: 80, spinoffMerged: 20 },
    ])).toBe(100);
  });

  it("PHF-EMPLOY-1/2: 81<90 미달 위반 / 95>=90 통과", () => {
    expect(isEmploymentDropViolation(81, 100)).toBe(true);
    expect(isEmploymentDropViolation(95, 100)).toBe(false);
    expect(isSalaryDropViolation(81, 100)).toBe(true);
    expect(isSalaryDropViolation(95, 100)).toBe(false);
  });

  it("PHF-SALARY-1: 정규직 위반 + 총급여 통과 → bothViolated=false (AND)", () => {
    const r = calcFamilyBusinessPostMgmt(baseInput({
      employmentTracking: {
        fiveYearData: [{ monthEnd: "2026-01", regularEmployees: 80 }],
        priorTwoYearData: [{ monthEnd: "2024-12", regularEmployees: 100 }],
        fiveYearTotalSalary: 1_000_000_000,
        priorTwoYearTotalSalary: 1_000_000_000, // 총급여 100% 유지 → 미달 아님
      },
    }));
    expect(r.employmentResult?.employmentDrop).toBe(true);
    expect(r.employmentResult?.salaryDrop).toBe(false);
    expect(r.employmentResult?.bothViolated).toBe(false);
  });

  it("PHF-SALARY-2: 양쪽 모두 위반 → bothViolated=true", () => {
    const r = calcFamilyBusinessPostMgmt(baseInput({
      employmentTracking: {
        fiveYearData: [{ monthEnd: "2026-01", regularEmployees: 80 }],
        priorTwoYearData: [{ monthEnd: "2024-12", regularEmployees: 100 }],
        fiveYearTotalSalary: 800_000_000,
        priorTwoYearTotalSalary: 1_000_000_000,
      },
    }));
    expect(r.employmentResult?.bothViolated).toBe(true);
    expect(r.employmentResult?.threshold).toBe(90);
  });
});

// ============================================================
// PHF-AMEND — 수정신고 매핑 (별지 제9호서식, §18의2⑨)
// ============================================================
describe("PHF-AMEND — 수정신고 매핑", () => {
  it("PHF-AMEND-1/2: postMgmtResult → AmendmentReturnData + 기한 = 위반월말 + 6개월", () => {
    const post = calcFamilyBusinessPostMgmt(baseInput({
      violations: [{ date: "2027-03-15", type: "share_decrease" }],
      cgtCreditAmount: 3_000_000_000,
    }));
    const amend = buildAmendmentReturnData(post, "2027-03-15");
    expect(amend.additionalDeterminedTax).toBe(post.totalRecapture);
    expect(amend.interestPenalty).toBe(post.totalInterest);
    expect(amend.cgtCreditReceived).toBe(post.cgtCreditApplied);
    expect(amend.netPayable).toBe(post.netRecapture + post.totalInterest);
    // 2027-03-15 → endOfMonth 2027-03-31 + 6개월 = 2027-09-30
    expect(amend.amendmentDeadline).toBe("2027-09-30");
  });
});

// ============================================================
// PHF-META — 사후관리 메타 빌더 + 자산 매핑
// ============================================================
describe("PHF-META — 사후관리 메타 빌더", () => {
  const detail: FamilyBusinessDeductionDetail = {
    eligible: true,
    appliedCap: 30_000_000_000,
    operatingYears: 15,
    finalValue: 20_000_000_000,
    deduction: 20_000_000_000,
    appliedRate: 1,
    usedDirectInput: false,
    ofzExemptionActive: true,
    breakdown: [],
  };
  const estateItems = [
    { id: "a1", category: "real_estate_land", name: "공장부지", marketValue: 5_000_000_000, familyBusinessCategory: "business_real_estate" },
    { id: "a2", category: "unlisted_stock", name: "법인주식", marketValue: 15_000_000_000, familyBusinessCategory: "corporate_stock" },
    { id: "a3", category: "cash", name: "현금", marketValue: 1_000_000_000 }, // 가업 자산 아님 → 제외
  ] as unknown as EstateItem[];

  it("PHF-META-1: 가업공제 > 0 → meta set (신고기한·OFZ·자산)", () => {
    const meta = buildFamilyBusinessPostMgmtMeta({
      familyBusinessDeduction: 20_000_000_000,
      familyBusinessDetail: detail,
      estateItems,
      deathDate: "2026-01-15",
    });
    expect(meta).toBeDefined();
    expect(meta?.appliedDeduction).toBe(20_000_000_000);
    expect(meta?.deathDate).toBe("2026-01-15");
    expect(meta?.ofzExemptionActive).toBe(true);
    expect(meta?.usedDirectInput).toBe(false);
    // PHF-META-3: 신고기한 = endOfMonth(2026-01-15) + 6개월 = 2026-07-31
    expect(meta?.filingDeadline).toBe("2026-07-31");
    // 가업 자산만 (a3 cash 제외) + 타입 매핑
    expect(meta?.inheritedAssets).toEqual([
      { id: "a1", value: 5_000_000_000, type: "land" },
      { id: "a2", value: 15_000_000_000, type: "stock" },
    ]);
  });

  it("PHF-META-2: 가업공제 0 → undefined", () => {
    expect(buildFamilyBusinessPostMgmtMeta({
      familyBusinessDeduction: 0,
      familyBusinessDetail: detail,
      estateItems,
      deathDate: "2026-01-15",
    })).toBeUndefined();
  });

  it("PHF-META-4: usedDirectInput carry", () => {
    const meta = buildFamilyBusinessPostMgmtMeta({
      familyBusinessDeduction: 10_000_000_000,
      familyBusinessDetail: { ...detail, usedDirectInput: true },
      estateItems: [],
      deathDate: "2026-01-15",
    });
    expect(meta?.usedDirectInput).toBe(true);
  });

  it("mapEstateItemToPostMgmtType: 카테고리 매핑", () => {
    expect(mapEstateItemToPostMgmtType("real_estate_land")).toBe("land");
    expect(mapEstateItemToPostMgmtType("real_estate_apartment")).toBe("building");
    expect(mapEstateItemToPostMgmtType("listed_stock")).toBe("stock");
    expect(mapEstateItemToPostMgmtType("cash")).toBe("other");
  });
});
