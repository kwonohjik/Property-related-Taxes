/**
 * 복수가업 순차공제 anchor (상증령 §15④ + 상증칙 §5 / PDF 378·379p) — PR-4
 *
 * 법령 검증 (KoreanLaw MCP 2026-06-04):
 *   - 상증령 §15④ mst=283637 = 위임 조항 (공제한도·공제순서는 재정경제부령)
 *   - 상증칙 §5 mst=284609 = ① 총한도 = 계속경영기간 긴 기업 한도 ② 긴 기업 재산가액부터 순차 공제
 *   - PDF 379p 표 = 개별기업별 한도(㉯=400억, ㉰=300억)도 Min에 포함
 *
 * 산식: 각 기업 공제 = Min(잔여 총한도, 가업가액, 영위연수별 개별한도), 영위연수 내림차순
 */

import { describe, expect, it } from "vitest";
import {
  calcFamilyBusinessDeductionPhase2,
  calcMultipleFamilyBusinessDeduction,
  familyBusinessCap,
} from "@/lib/tax-engine/deductions/family-business";
import type { FamilyBusinessInheritanceInput } from "@/lib/tax-engine/types/inheritance-gift.types";
import { INH } from "@/lib/tax-engine/legal-codes";

const 억 = 100_000_000;

function buildPassingFB(
  overrides: Partial<FamilyBusinessInheritanceInput> = {},
): FamilyBusinessInheritanceInput {
  return {
    businessType: "corporate",
    operatingYears: 15,
    enterpriseSize: "sme",
    totalAssets: 100_000_000_000,
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
// calcMultipleFamilyBusinessDeduction 직접 (현행 2023.1.1.~)
// ============================================================

describe("FB-MULTI — 복수가업 순차공제 산식 (상증칙 §5, 현행)", () => {
  it("FB-MULTI-PDF379: 30년 100억 / 25년 500억 / 15년 400억 → 개별·잔여한도 둘 다 제약", () => {
    const r = calcMultipleFamilyBusinessDeduction([
      { operatingYears: 30, value: 100 * 억, label: "A" },
      { operatingYears: 25, value: 500 * 억, label: "B" },
      { operatingYears: 15, value: 400 * 억, label: "C" },
    ]);
    // 총한도 = 가장 긴(30년) 한도 = 600억
    expect(r.totalCap).toBe(600 * 억);
    // ㉮ 30년 = Min(600, 100, 600) = 100억 (가액 제약), 잔여 500억
    expect(r.lineItems[0].deduction).toBe(100 * 억);
    expect(r.lineItems[0].remainingTotalCapBefore).toBe(600 * 억);
    // ㉯ 25년 = Min(500, 500, 400) = 400억 (개별한도 제약), 잔여 100억
    expect(r.lineItems[1].deduction).toBe(400 * 억);
    expect(r.lineItems[1].individualCap).toBe(400 * 억);
    expect(r.lineItems[1].remainingTotalCapBefore).toBe(500 * 억);
    // ㉰ 15년 = Min(100, 400, 300) = 100억 (잔여한도 제약), 잔여 0
    expect(r.lineItems[2].deduction).toBe(100 * 억);
    expect(r.lineItems[2].remainingTotalCapBefore).toBe(100 * 억);
    // 합계 = 600억 (= 총한도)
    expect(r.totalDeduction).toBe(600 * 억);
  });

  it("FB-MULTI-2BIZ: 25년 300억 / 12년 150억 → 총한도 400억", () => {
    const r = calcMultipleFamilyBusinessDeduction([
      { operatingYears: 25, value: 300 * 억 },
      { operatingYears: 12, value: 150 * 억 },
    ]);
    expect(r.totalCap).toBe(400 * 억);
    // 25년 = Min(400, 300, 400) = 300억, 잔여 100억
    expect(r.lineItems[0].deduction).toBe(300 * 억);
    // 12년 = Min(100, 150, 300) = 100억 (잔여 제약)
    expect(r.lineItems[1].deduction).toBe(100 * 억);
    expect(r.totalDeduction).toBe(400 * 억);
  });

  it("FB-MULTI-SORT: 입력 순서 무관 — 영위연수 내림차순 정렬 (12년 먼저 입력해도 30년 1순위)", () => {
    const r = calcMultipleFamilyBusinessDeduction([
      { operatingYears: 12, value: 100 * 억, label: "짧은 가업" },
      { operatingYears: 30, value: 200 * 억, label: "긴 가업" },
    ]);
    expect(r.totalCap).toBe(600 * 억); // 30년 기준
    expect(r.lineItems[0].order).toBe(1);
    expect(r.lineItems[0].operatingYears).toBe(30);
    expect(r.lineItems[0].deduction).toBe(200 * 억);
    expect(r.lineItems[1].operatingYears).toBe(12);
    expect(r.lineItems[1].deduction).toBe(100 * 억);
    expect(r.totalDeduction).toBe(300 * 억);
  });

  it("FB-MULTI-CAP: 합계가 총한도 초과 시 총한도로 제한 (30년 400억 / 28년 400억 → 600억)", () => {
    const r = calcMultipleFamilyBusinessDeduction([
      { operatingYears: 30, value: 400 * 억 },
      { operatingYears: 28, value: 400 * 억 },
    ]);
    expect(r.totalCap).toBe(600 * 억);
    // 30년 = Min(600, 400, 600) = 400억, 잔여 200억
    expect(r.lineItems[0].deduction).toBe(400 * 억);
    // 28년 = Min(200, 400, 400) = 200억 (잔여 제약)
    expect(r.lineItems[1].deduction).toBe(200 * 억);
    expect(r.totalDeduction).toBe(600 * 억); // = 총한도
  });

  it("FB-MULTI-BELOW10: 모든 가업 10년 미만 → 총한도 0, 공제 0", () => {
    const r = calcMultipleFamilyBusinessDeduction([
      { operatingYears: 8, value: 100 * 억 },
      { operatingYears: 5, value: 50 * 억 },
    ]);
    expect(r.totalCap).toBe(0);
    expect(r.totalDeduction).toBe(0);
  });
});

// ============================================================
// 개정연혁 시기별 (deathDate) — 한도·개별한도 모두 시기별
// ============================================================

describe("FB-MULTI-HIST — 복수가업 시기별 한도 (familyBusinessCap 재사용)", () => {
  it("FB-MULTI-HIST-2020: 2018~2022 — 25년 150억 / 12년 200억 → 총한도 300억", () => {
    // familyBusinessCap(25, 2020) = 2018~2022 [20~30] = 300억
    expect(familyBusinessCap(25, "2020-06-01")).toBe(300 * 억);
    expect(familyBusinessCap(12, "2020-06-01")).toBe(200 * 억);
    const r = calcMultipleFamilyBusinessDeduction(
      [
        { operatingYears: 25, value: 150 * 억 },
        { operatingYears: 12, value: 200 * 억 },
      ],
      "2020-06-01",
    );
    expect(r.totalCap).toBe(300 * 억);
    // 25년 = Min(300, 150, 300) = 150억, 잔여 150억
    expect(r.lineItems[0].deduction).toBe(150 * 억);
    // 12년 = Min(150, 200, 200) = 150억 (잔여 제약)
    expect(r.lineItems[1].deduction).toBe(150 * 억);
    expect(r.totalDeduction).toBe(300 * 억);
  });

  it("FB-MULTI-HIST-2016: 2014~2017 (15년 경계) — 22년 100억 / 16년 100억 → 총한도 500억", () => {
    // familyBusinessCap(22, 2016) = 2014~2017 [20+] = 500억, (16, 2016) = [15~20] = 300억
    expect(familyBusinessCap(22, "2016-06-01")).toBe(500 * 억);
    expect(familyBusinessCap(16, "2016-06-01")).toBe(300 * 억);
    const r = calcMultipleFamilyBusinessDeduction(
      [
        { operatingYears: 22, value: 100 * 억 },
        { operatingYears: 16, value: 100 * 억 },
      ],
      "2016-06-01",
    );
    expect(r.totalCap).toBe(500 * 억);
    expect(r.lineItems[0].deduction).toBe(100 * 억);
    expect(r.lineItems[1].individualCap).toBe(300 * 억); // 16년 → 2014~2017 15~20 = 300억
    expect(r.lineItems[1].deduction).toBe(100 * 억);
    expect(r.totalDeduction).toBe(200 * 억);
  });
});

// ============================================================
// Phase2 통합 — additionalFamilyBusinesses 입력 경로
// ============================================================

describe("FB-MULTI-PHASE2 — calcFamilyBusinessDeductionPhase2 복수가업 통합", () => {
  it("FB-MULTI-PHASE2-1: 주 30년 100억 + 추가 25년 500억·15년 400억 → 600억 공제", () => {
    const fb = buildPassingFB({
      operatingYears: 30,
      deathDate: "2024-01-01",
      additionalFamilyBusinesses: [
        { operatingYears: 25, businessValue: 500 * 억, label: "B 제조법인" },
        { operatingYears: 15, businessValue: 400 * 억, label: "C 도매" },
      ],
    });
    const r = calcFamilyBusinessDeductionPhase2({
      input: fb,
      estateItems: undefined,
      familyBusinessValueOverride: 100 * 억, // 주 가업 가액
      taxIfNoFBD: 0,
      lawRef: INH.FAMILY_BUSINESS_DEDUCTION,
    });
    expect(r.detail.eligible).toBe(true);
    expect(r.detail.multipleBusinessDetail).toBeDefined();
    expect(r.detail.multipleBusinessDetail!.totalDeduction).toBe(600 * 억);
    expect(r.deduction).toBe(600 * 억);
    // 표시용: 총한도 = 600억, 전체 가업가액 합 = 1000억
    expect(r.detail.appliedCap).toBe(600 * 억);
    expect(r.detail.finalValue).toBe(1000 * 억);
    // 적용률 = 600/1000 = 0.6 (통일 산식)
    expect(r.detail.appliedRate).toBeCloseTo(0.6, 10);
    // 1순위 = 주 가업(30년)
    expect(r.detail.multipleBusinessDetail!.lineItems[0].label).toBe("주 가업");
    expect(r.detail.multipleBusinessDetail!.lineItems[0].operatingYears).toBe(30);
  });

  it("FB-MULTI-PHASE2-INELIGIBLE: 주 가업 자격 미충족(영위 5년) → 복수가업 무시, 공제 0", () => {
    const fb = buildPassingFB({
      operatingYears: 5, // 10년 미만 → 미충족
      additionalFamilyBusinesses: [{ operatingYears: 30, businessValue: 500 * 억 }],
    });
    const r = calcFamilyBusinessDeductionPhase2({
      input: fb,
      estateItems: undefined,
      familyBusinessValueOverride: 100 * 억,
      taxIfNoFBD: 0,
      lawRef: INH.FAMILY_BUSINESS_DEDUCTION,
    });
    expect(r.detail.eligible).toBe(false);
    expect(r.detail.multipleBusinessDetail).toBeUndefined();
    expect(r.deduction).toBe(0);
  });

  it("FB-MULTI-PHASE2-NOOP: additionalFamilyBusinesses 미입력 → 단일 가업 동작 (회귀)", () => {
    const fb = buildPassingFB({ operatingYears: 15, deathDate: "2024-01-01" });
    const r = calcFamilyBusinessDeductionPhase2({
      input: fb,
      estateItems: undefined,
      familyBusinessValueOverride: 100 * 억,
      taxIfNoFBD: 0,
      lawRef: INH.FAMILY_BUSINESS_DEDUCTION,
    });
    expect(r.detail.multipleBusinessDetail).toBeUndefined();
    expect(r.detail.appliedCap).toBe(300 * 억); // 15년 단일 한도
    expect(r.deduction).toBe(100 * 억); // Min(100억, 300억)
  });

  it("FB-MULTI-PHASE2-EMPTY: additionalFamilyBusinesses=[] 빈 배열 → 단일 동작 (회귀)", () => {
    const fb = buildPassingFB({
      operatingYears: 15,
      deathDate: "2024-01-01",
      additionalFamilyBusinesses: [],
    });
    const r = calcFamilyBusinessDeductionPhase2({
      input: fb,
      estateItems: undefined,
      familyBusinessValueOverride: 100 * 억,
      taxIfNoFBD: 0,
      lawRef: INH.FAMILY_BUSINESS_DEDUCTION,
    });
    expect(r.detail.multipleBusinessDetail).toBeUndefined();
    expect(r.deduction).toBe(100 * 억);
  });
});
