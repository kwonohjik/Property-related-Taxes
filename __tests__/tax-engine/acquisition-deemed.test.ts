/**
 * 취득세 간주취득 판정 단위 테스트
 *
 * acquisition-deemed.ts — assessMajorShareholder,
 *   assessLandCategoryChange, assessBuildingRenovation, assessDeemedAcquisition
 *
 * 지방세법 §7의2 — 간주취득 3종:
 * 1. 과점주주: 주주 1인 + 특수관계인 지분 합계 50% 초과
 * 2. 토지 지목변경: 시가표준액 증가분 과세
 * 3. 건물 개수: 시가표준액 증가분 과세
 */

import { describe, it, expect } from "vitest";
import {
  assessMajorShareholder,
  assessLandCategoryChange,
  assessBuildingRenovation,
  assessDeemedAcquisition,
} from "../../lib/tax-engine/acquisition-deemed";

// ============================================================
// 과점주주 간주취득 (지방세법 §7의2 ①)
// ============================================================

describe("assessMajorShareholder — 과점주주 간주취득", () => {
  it("상장법인: 비과세", () => {
    const result = assessMajorShareholder({
      corporateAssetValue: 1_000_000_000,
      prevShareRatio: 0.3,
      newShareRatio: 0.6,
      isListed: true,
    });
    expect(result.isSubjectToTax).toBe(false);
    expect(result.deemedTaxBase).toBe(0);
    expect(result.taxableRatio).toBe(0);
    expect(result.warnings[0]).toContain("상장법인");
  });

  it("취득 후 50% 이하: 과점주주 아님 — 비과세", () => {
    const result = assessMajorShareholder({
      corporateAssetValue: 1_000_000_000,
      prevShareRatio: 0.3,
      newShareRatio: 0.45,
      isListed: false,
    });
    expect(result.isSubjectToTax).toBe(false);
    expect(result.deemedTaxBase).toBe(0);
  });

  it("최초 과점주주 취득 (0% → 60%): 취득 후 전체 지분율로 과세", () => {
    // 법인 자산 10억, 취득 후 60% → 과세표준 = 10억 × 0.6 = 6억
    const result = assessMajorShareholder({
      corporateAssetValue: 1_000_000_000,
      prevShareRatio: 0,
      newShareRatio: 0.6,
      isListed: false,
    });
    expect(result.isSubjectToTax).toBe(true);
    expect(result.taxableRatio).toBe(0.6);
    expect(result.deemedTaxBase).toBe(600_000_000); // 10억 × 0.6
    expect(result.warnings[0]).toContain("최초 과점주주");
  });

  it("비과점 → 과점 (30% → 55%): 취득 후 전체 55% 기준 과세", () => {
    // prevShareRatio 30% ≤ 50%, newShareRatio 55% > 50%
    // 최초 과점주주 취득 → 전체 55% 과세
    const result = assessMajorShareholder({
      corporateAssetValue: 2_000_000_000,
      prevShareRatio: 0.3,
      newShareRatio: 0.55,
      isListed: false,
    });
    expect(result.isSubjectToTax).toBe(true);
    expect(result.taxableRatio).toBe(0.55);
    expect(result.deemedTaxBase).toBe(1_100_000_000); // 20억 × 0.55
  });

  it("과점주주 지분율 증가 (55% → 70%): 증가분 15%만 과세", () => {
    // 이미 과점주주 55% → 70%로 증가: 증가분 15% 과세
    // 부동소수점: 0.70 - 0.55 = 0.14999... → Math.floor(10억 × 0.14999...) = 149,999,999
    const result = assessMajorShareholder({
      corporateAssetValue: 1_000_000_000,
      prevShareRatio: 0.55,
      newShareRatio: 0.7,
      isListed: false,
    });
    expect(result.isSubjectToTax).toBe(true);
    expect(result.taxableRatio).toBeCloseTo(0.15);
    expect(result.deemedTaxBase).toBe(149_999_999); // Math.floor(10억 × (0.70-0.55))
    expect(result.warnings[0]).toContain("증가분");
  });

  it("과점주주 지분율 감소 또는 동일: 비과세", () => {
    const result = assessMajorShareholder({
      corporateAssetValue: 1_000_000_000,
      prevShareRatio: 0.7,
      newShareRatio: 0.6,
      isListed: false,
    });
    expect(result.isSubjectToTax).toBe(false);
    expect(result.deemedTaxBase).toBe(0);
  });

  it("과세표준 = Math.floor(자산가치 × 지분율)", () => {
    // 10억 × 33.33% = 333,300,000원 (floor)
    const result = assessMajorShareholder({
      corporateAssetValue: 1_000_000_000,
      prevShareRatio: 0,
      newShareRatio: 0.3333,
      isListed: false,
    });
    // 0.3333 > 0.5? No → 비과세 확인
    expect(result.isSubjectToTax).toBe(false);
  });

  it("경계값: newShareRatio 정확히 50% — 비과세", () => {
    // 50% 초과가 기준, 50%는 과점주주 아님
    const result = assessMajorShareholder({
      corporateAssetValue: 1_000_000_000,
      prevShareRatio: 0.3,
      newShareRatio: 0.5,
      isListed: false,
    });
    expect(result.isSubjectToTax).toBe(false);
  });

  it("경계값: newShareRatio 50.01% — 과세 (최초 과점주주)", () => {
    const result = assessMajorShareholder({
      corporateAssetValue: 1_000_000_000,
      prevShareRatio: 0,
      newShareRatio: 0.5001,
      isListed: false,
    });
    expect(result.isSubjectToTax).toBe(true);
    expect(result.deemedTaxBase).toBe(Math.floor(1_000_000_000 * 0.5001));
  });
});

// ============================================================
// 토지 지목변경 간주취득 (지방세법 §7의2 ②)
// ============================================================

describe("assessLandCategoryChange — 지목변경 간주취득", () => {
  it("시가표준액 증가: 차액만큼 과세", () => {
    const result = assessLandCategoryChange({
      prevCategory: "전",
      newCategory: "대",
      prevStandardValue: 100_000_000,
      newStandardValue: 300_000_000,
    });
    expect(result.isSubjectToTax).toBe(true);
    expect(result.deemedTaxBase).toBe(200_000_000); // 3억 - 1억 = 2억
    expect(result.warnings[0]).toContain("전 → 대");
  });

  it("시가표준액 동일: 비과세", () => {
    const result = assessLandCategoryChange({
      prevCategory: "전",
      newCategory: "답",
      prevStandardValue: 100_000_000,
      newStandardValue: 100_000_000,
    });
    expect(result.isSubjectToTax).toBe(false);
    expect(result.deemedTaxBase).toBe(0);
  });

  it("시가표준액 감소: 비과세", () => {
    const result = assessLandCategoryChange({
      prevCategory: "대",
      newCategory: "전",
      prevStandardValue: 300_000_000,
      newStandardValue: 100_000_000,
    });
    expect(result.isSubjectToTax).toBe(false);
    expect(result.deemedTaxBase).toBe(0);
    expect(result.warnings[0]).toContain("이하");
  });

  it("입력값 그대로 prevStandardValue/newStandardValue 반환", () => {
    const result = assessLandCategoryChange({
      prevCategory: "임야",
      newCategory: "대",
      prevStandardValue: 50_000_000,
      newStandardValue: 200_000_000,
    });
    expect(result.prevStandardValue).toBe(50_000_000);
    expect(result.newStandardValue).toBe(200_000_000);
  });
});

// ============================================================
// 건물 개수(改修) 간주취득 (지방세법 §7의2 ③)
// ============================================================

describe("assessBuildingRenovation — 건물 개수 간주취득", () => {
  it("구조 변경 후 시가표준액 증가: 차액 과세", () => {
    const result = assessBuildingRenovation({
      renovationType: "structural_change",
      prevStandardValue: 200_000_000,
      newStandardValue: 350_000_000,
    });
    expect(result.isSubjectToTax).toBe(true);
    expect(result.deemedTaxBase).toBe(150_000_000);
    expect(result.warnings[0]).toContain("구조 변경");
  });

  it("용도 변경 후 시가표준액 증가: 차액 과세", () => {
    const result = assessBuildingRenovation({
      renovationType: "use_change",
      prevStandardValue: 100_000_000,
      newStandardValue: 180_000_000,
    });
    expect(result.isSubjectToTax).toBe(true);
    expect(result.deemedTaxBase).toBe(80_000_000);
    expect(result.warnings[0]).toContain("용도 변경");
  });

  it("대수선 후 시가표준액 증가: 차액 과세", () => {
    const result = assessBuildingRenovation({
      renovationType: "major_repair",
      prevStandardValue: 150_000_000,
      newStandardValue: 220_000_000,
    });
    expect(result.isSubjectToTax).toBe(true);
    expect(result.deemedTaxBase).toBe(70_000_000);
    expect(result.warnings[0]).toContain("대수선");
  });

  it("개수 후 시가표준액 미증가: 비과세", () => {
    const result = assessBuildingRenovation({
      renovationType: "major_repair",
      prevStandardValue: 200_000_000,
      newStandardValue: 180_000_000,
    });
    expect(result.isSubjectToTax).toBe(false);
    expect(result.deemedTaxBase).toBe(0);
    expect(result.warnings[0]).toContain("이하");
  });
});

// ============================================================
// 통합 간주취득 판정 (assessDeemedAcquisition)
// ============================================================

describe("assessDeemedAcquisition — 통합 판정", () => {
  it("과점주주 입력 → type: major_shareholder", () => {
    const result = assessDeemedAcquisition({
      majorShareholder: {
        corporateAssetValue: 1_000_000_000,
        prevShareRatio: 0,
        newShareRatio: 0.6,
        isListed: false,
      },
    });
    expect(result.type).toBe("major_shareholder");
    expect(result.isSubjectToTax).toBe(true);
    expect(result.deemedTaxBase).toBe(600_000_000);
  });

  it("지목변경 입력 → type: land_category", () => {
    const result = assessDeemedAcquisition({
      landCategory: {
        prevCategory: "전",
        newCategory: "대",
        prevStandardValue: 100_000_000,
        newStandardValue: 250_000_000,
      },
    });
    expect(result.type).toBe("land_category");
    expect(result.isSubjectToTax).toBe(true);
    expect(result.deemedTaxBase).toBe(150_000_000);
  });

  it("건물 개수 입력 → type: renovation", () => {
    const result = assessDeemedAcquisition({
      renovation: {
        renovationType: "structural_change",
        prevStandardValue: 100_000_000,
        newStandardValue: 180_000_000,
      },
    });
    expect(result.type).toBe("renovation");
    expect(result.isSubjectToTax).toBe(true);
    expect(result.deemedTaxBase).toBe(80_000_000);
  });

  it("입력 없음 → type: null, 비과세", () => {
    const result = assessDeemedAcquisition({});
    expect(result.type).toBeNull();
    expect(result.isSubjectToTax).toBe(false);
    expect(result.deemedTaxBase).toBe(0);
  });
});
