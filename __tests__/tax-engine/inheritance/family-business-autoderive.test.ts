/**
 * 가업상속공제 요건 자동판정 anchor (Phase 1)
 *
 * 설계: docs/02-design/features/inheritance-family-business-deduction/eligibility-autoderive.engine.design.md
 * 법령: 상증법 §67 / 상증령 §15③2호 (KoreanLaw mst=283637 시행 2026-02-27)
 *
 * 케이스 인벤토리 21행 1:1 대응. 18세 ≠ 19세(§15③2호가는 18세, 민법§4 미성년 19세 아님).
 */
import { describe, it, expect } from "vitest";
import {
  calcInheritanceFilingDeadline,
  deriveFBHeirIsAdult,
  deriveFBHeirOfficerByDeadline,
  deriveFBHeirCEOWithinTwoYears,
  deriveFBHeirEngagement,
  suggestFBOperatingYears,
  resolveFamilyBusinessRequirements,
} from "@/lib/tax-engine/deductions/family-business-autoderive";
import { calcFamilyBusinessDeductionPhase2 } from "@/lib/tax-engine/deductions/family-business";
import type { FamilyBusinessInheritanceInput } from "@/lib/tax-engine/types/inheritance-gift.types";

/** 전 요건 충족 base (corporate 외 — individual로 지분 요건 skip) */
function baseFb(over: Partial<FamilyBusinessInheritanceInput> = {}): FamilyBusinessInheritanceInput {
  return {
    businessType: "individual",
    operatingYears: 20,
    enterpriseSize: "sme",
    isEligibleIndustry: true,
    totalAssets: 100_000_000,
    decedentCEORequirementMet: true,
    heirIsAdult: false,
    heirTwoYearEngagement: false,
    heirOfficerByFilingDeadline: false,
    heirCEOWithinTwoYears: false,
    unrelatedAssetsAcknowledged: true,
    postManagementAcknowledged: true,
    ...over,
  };
}

describe("§67 신고기한 — calcInheritanceFilingDeadline (말일+6개월)", () => {
  it("FB-07: 상속 2024-03-15 → 2024-09-30 (3월 말일+6M)", () => {
    expect(calcInheritanceFilingDeadline("2024-03-15")).toBe("2024-09-30");
  });
  it("FB-08: 상속 2024-08-31 → 2025-02-28 (8월 말일+6M, 2월 말일 보정)", () => {
    expect(calcInheritanceFilingDeadline("2024-08-31")).toBe("2025-02-28");
  });
  it("FB-09: 상속 2024-01-31 → 2024-07-31", () => {
    expect(calcInheritanceFilingDeadline("2024-01-31")).toBe("2024-07-31");
  });
});

describe("§15③2호가 — 18세 (deriveFBHeirIsAdult, 18세 기준)", () => {
  const death = "2024-05-10";
  it("FB-01: 18세 생일 당일 상속개시 → 충족", () => {
    expect(deriveFBHeirIsAdult("2006-05-10", death)).toBe(true);
  });
  it("FB-02: 18세 생일 전날 상속개시 → 미충족(만17세)", () => {
    expect(deriveFBHeirIsAdult("2006-05-11", death)).toBe(false);
  });
  it("FB-03: birthDate 미입력 → false(보수적)", () => {
    expect(deriveFBHeirIsAdult(undefined, death)).toBe(false);
  });
});

describe("§15③2호다 — 신고기한 임원취임 (deriveFBHeirOfficerByDeadline)", () => {
  const deadline = "2024-09-30";
  it("FB-10: 취임 = 신고기한 당일 → 충족", () => {
    expect(deriveFBHeirOfficerByDeadline("2024-09-30", deadline)).toBe(true);
  });
  it("FB-11: 취임 = 신고기한 +1일 → 미충족", () => {
    expect(deriveFBHeirOfficerByDeadline("2024-10-01", deadline)).toBe(false);
  });
  it("FB-12: 취임 미입력 → false", () => {
    expect(deriveFBHeirOfficerByDeadline(undefined, deadline)).toBe(false);
  });
});

describe("§15③2호라 — 2년내 대표이사 (deriveFBHeirCEOWithinTwoYears)", () => {
  const deadline = "2024-09-30";
  it("FB-13: 취임 = 신고기한+2년 당일 → 충족", () => {
    expect(deriveFBHeirCEOWithinTwoYears("2026-09-30", deadline)).toBe(true);
  });
  it("FB-14: 취임 = 신고기한+2년 +1일 → 미충족", () => {
    expect(deriveFBHeirCEOWithinTwoYears("2026-10-01", deadline)).toBe(false);
  });
});

describe("§15③2호나 — 2년 종사 (deriveFBHeirEngagement)", () => {
  const death = "2024-05-10";
  it("FB-16: 종사 시작 = 상속개시 2년 전 당일 → 충족", () => {
    expect(deriveFBHeirEngagement("2022-05-10", death, false)).toBe(true);
  });
  it("FB-17: 종사기간 1년 364일 → 미충족", () => {
    expect(deriveFBHeirEngagement("2022-05-11", death, false)).toBe(false);
  });
  it("FB-18: decedentEarlyDeath(65세 단서) + 종사 미입력 → 면제 충족", () => {
    expect(deriveFBHeirEngagement(undefined, death, true)).toBe(true);
  });
});

describe("영위연수 제안 — suggestFBOperatingYears", () => {
  it("FB-19: 개업 2004-01-01 상속 2024-01-01 → 20", () => {
    expect(suggestFBOperatingYears("2004-01-01", "2024-01-01")).toBe(20);
  });
});

describe("resolveFamilyBusinessRequirements — 통합 resolve", () => {
  const death = "2024-05-10"; // 신고기한 2024-11-30
  it("FB-04: heirIsAdultOverride=true + birthDate 미입력 → override 우선 충족", () => {
    const r = resolveFamilyBusinessRequirements(
      baseFb({ heirIsAdultOverride: true }),
      undefined,
      death,
    );
    expect(r.resolvedInput.heirIsAdult).toBe(true);
    expect(r.source.heirIsAdult).toBe("override");
  });
  it("FB-05: heirId의 Heir.birthDate(인자) 사용 → 자동 충족", () => {
    const r = resolveFamilyBusinessRequirements(baseFb(), "2006-05-10", death);
    expect(r.resolvedInput.heirIsAdult).toBe(true);
    expect(r.source.heirIsAdult).toBe("auto");
  });
  it("FB-06: Heir.birthDate 없음 + familyBusiness.heirBirthDate fallback", () => {
    const r = resolveFamilyBusinessRequirements(
      baseFb({ heirBirthDate: "2006-05-10" }),
      undefined,
      death,
    );
    expect(r.resolvedInput.heirIsAdult).toBe(true);
    expect(r.source.heirIsAdult).toBe("auto");
  });
  it("FB-20: legacy — 기초데이터·override 없음 → 구 boolean fallback(source=legacy)", () => {
    const r = resolveFamilyBusinessRequirements(
      baseFb({ heirIsAdult: true }),
      undefined,
      death,
    );
    expect(r.resolvedInput.heirIsAdult).toBe(true);
    expect(r.source.heirIsAdult).toBe("legacy");
  });
  it("신고기한 도출 일치", () => {
    const r = resolveFamilyBusinessRequirements(baseFb(), undefined, death);
    expect(r.filingDeadline).toBe("2024-11-30");
  });
});

describe("FB-21: 전 요건 자동충족 → eligible=true (통합)", () => {
  it("자연인 가업상속인 전 요건 충족", () => {
    const death = "2024-05-10"; // 신고기한 2024-11-30
    const input = baseFb({
      heirEngagementStartDate: "2021-05-10", // 3년 종사
      heirOfficerAppointDate: "2024-11-30", // 신고기한 당일
      heirCEOAppointDate: "2026-11-30", // +2년 당일
    });
    const resolved = resolveFamilyBusinessRequirements(input, "2000-01-01", death);
    const r = calcFamilyBusinessDeductionPhase2({
      input: resolved.resolvedInput,
      estateItems: undefined,
      familyBusinessValueOverride: 1_000_000_000,
      taxIfNoFBD: 0,
      lawRef: "상증법 §18의2",
      resolvedMeta: { filingDeadline: resolved.filingDeadline, source: resolved.source },
    });
    expect(r.detail.eligible).toBe(true);
    expect(r.detail.resolvedRequirements?.filingDeadline).toBe("2024-11-30");
  });
});
