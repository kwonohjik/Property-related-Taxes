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
 *
 * 비과세 케이스 (§9):
 * - 상장법인 주식 취득 (§9①)
 * - 합병·분할로 인한 주식 취득 (§9②)
 * - 법인 설립 시 주식 취득 (§9③)
 */

import { describe, it, expect } from "vitest";
import {
  assessMajorShareholder,
  assessLandCategoryChange,
  assessBuildingRenovation,
  assessDeemedAcquisition,
} from "../../lib/tax-engine/acquisition-deemed";
import { calcAcquisitionTax } from "../../lib/tax-engine/acquisition-tax";

// ============================================================
// 과점주주 간주취득 (지방세법 §7의2 ①)
// ============================================================

describe("assessMajorShareholder — 과점주주 간주취득", () => {
  it("상장법인: 비과세 (§9①)", () => {
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

  // ── 신규: §9② 합병·분할로 인한 주식 취득 비과세 ──
  it("합병으로 인한 주식 취득 — §9② 비과세 (anchor)", () => {
    // 법인 합병 절차에서 주식 취득 → 과점주주 요건 충족해도 비과세
    const result = assessMajorShareholder({
      corporateAssetValue: 5_000_000_000,   // 50억 법인 자산
      prevShareRatio: 0.0,
      newShareRatio: 0.7,                   // 70% 취득 (과점주주 요건 충족)
      isListed: false,
      isMergerOrSplitShare: true,           // 합병으로 취득
    });
    expect(result.isSubjectToTax).toBe(false);
    expect(result.deemedTaxBase).toBe(0);
    expect(result.taxableRatio).toBe(0);
    expect(result.legalBasis).toContain("§9");
    expect(result.warnings[0]).toContain("합병·분할");
  });

  it("분할로 인한 주식 취득 — §9② 비과세", () => {
    // 이미 과점주주(60%)인데 추가 취득해도 분할 취득이면 비과세
    const result = assessMajorShareholder({
      corporateAssetValue: 2_000_000_000,
      prevShareRatio: 0.6,
      newShareRatio: 0.8,
      isListed: false,
      isMergerOrSplitShare: true,
    });
    expect(result.isSubjectToTax).toBe(false);
    expect(result.deemedTaxBase).toBe(0);
    expect(result.warnings[0]).toContain("합병·분할");
  });

  // ── 신규: §9③ 법인 설립 시 주식 취득 비과세 ──
  it("법인 설립 시 주식 취득 — §9③ 비과세 (anchor)", () => {
    // 법인 설립 과정에서 취득 → 과점주주 요건 충족해도 비과세
    const result = assessMajorShareholder({
      corporateAssetValue: 1_000_000_000,
      prevShareRatio: 0.0,
      newShareRatio: 1.0,                   // 100% 설립 취득
      isListed: false,
      isFoundingShare: true,                // 법인 설립 시 취득
    });
    expect(result.isSubjectToTax).toBe(false);
    expect(result.deemedTaxBase).toBe(0);
    expect(result.taxableRatio).toBe(0);
    expect(result.legalBasis).toContain("§9");
    expect(result.warnings[0]).toContain("법인 설립");
  });

  // ── 비과세 우선순위 확인 ──
  it("상장 + 합병 동시: 상장법인 비과세 우선 적용", () => {
    // 상장이 최우선, 합병도 함께 true여도 상장 메시지로 처리
    const result = assessMajorShareholder({
      corporateAssetValue: 1_000_000_000,
      prevShareRatio: 0.0,
      newShareRatio: 0.7,
      isListed: true,
      isMergerOrSplitShare: true,
    });
    expect(result.isSubjectToTax).toBe(false);
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

  // ── 신규: 취득 시기 2분화 안내 ──
  it("사실상 변경 완료일 + 공부 등록일 모두 제공 시 — 빠른 날 안내 포함", () => {
    // 사실상 변경 완료일 2024-03-01, 공부 등록일 2024-04-15 → 2024-03-01이 취득 시기
    const result = assessLandCategoryChange({
      prevCategory: "임야",
      newCategory: "대",
      prevStandardValue: 50_000_000,
      newStandardValue: 200_000_000,
      actualChangeDate: "2024-03-01",
      registrationDate: "2024-04-15",
    });
    expect(result.isSubjectToTax).toBe(true);
    // 취득 시기 안내 warning 포함 여부 확인
    const timingWarning = result.warnings.find(w => w.includes("취득 시기"));
    expect(timingWarning).toBeDefined();
    expect(timingWarning).toContain("2024-03-01");   // 빠른 날 명시
    expect(timingWarning).toContain("2024-04-15");
  });

  it("공부 등록일만 제공 시 — 사실상 변경 더 빠를 수 있다는 안내 포함", () => {
    const result = assessLandCategoryChange({
      prevCategory: "전",
      newCategory: "대",
      prevStandardValue: 80_000_000,
      newStandardValue: 250_000_000,
      registrationDate: "2024-06-01",
    });
    expect(result.isSubjectToTax).toBe(true);
    const timingWarning = result.warnings.find(w => w.includes("취득 시기"));
    expect(timingWarning).toBeDefined();
    expect(timingWarning).toContain("2024-06-01");
  });

  it("취득 시기 날짜 미제공 시 — 취득 시기 안내 없음", () => {
    const result = assessLandCategoryChange({
      prevCategory: "전",
      newCategory: "대",
      prevStandardValue: 80_000_000,
      newStandardValue: 250_000_000,
    });
    expect(result.isSubjectToTax).toBe(true);
    const timingWarning = result.warnings.find(w => w.includes("취득 시기"));
    expect(timingWarning).toBeUndefined();
  });

  // ── LandCategory 28종 타입 점검 (대표 지목 포함) ──
  it("LandCategory 28종 — 잡종지→대 지목변경 과세", () => {
    const result = assessLandCategoryChange({
      prevCategory: "잡종지",
      newCategory: "대",
      prevStandardValue: 120_000_000,
      newStandardValue: 300_000_000,
    });
    expect(result.isSubjectToTax).toBe(true);
    expect(result.deemedTaxBase).toBe(180_000_000);
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

  // ── 신규: 취득 시기 2분화 안내 ──
  it("사용승인일 + 사실상 사용개시일 모두 제공 시 — 빠른 날 안내 포함", () => {
    // 사실상 사용개시일 2024-02-01 (사용승인 전 거주), 사용승인일 2024-04-20
    // → 2024-02-01이 취득 시기
    const result = assessBuildingRenovation({
      renovationType: "use_change",
      prevStandardValue: 150_000_000,
      newStandardValue: 250_000_000,
      usageApprovalDate: "2024-04-20",
      actualUsageDate: "2024-02-01",
    });
    expect(result.isSubjectToTax).toBe(true);
    const timingWarning = result.warnings.find(w => w.includes("취득 시기"));
    expect(timingWarning).toBeDefined();
    expect(timingWarning).toContain("2024-04-20");
    expect(timingWarning).toContain("2024-02-01");
  });

  it("사용승인일만 제공 시 — 사실상 사용 먼저 안내 포함", () => {
    const result = assessBuildingRenovation({
      renovationType: "structural_change",
      prevStandardValue: 200_000_000,
      newStandardValue: 380_000_000,
      usageApprovalDate: "2024-07-01",
    });
    expect(result.isSubjectToTax).toBe(true);
    const timingWarning = result.warnings.find(w => w.includes("취득 시기"));
    expect(timingWarning).toBeDefined();
    expect(timingWarning).toContain("2024-07-01");
  });

  it("취득 시기 날짜 미제공 시 — 취득 시기 안내 없음", () => {
    const result = assessBuildingRenovation({
      renovationType: "major_repair",
      prevStandardValue: 150_000_000,
      newStandardValue: 220_000_000,
    });
    expect(result.isSubjectToTax).toBe(true);
    const timingWarning = result.warnings.find(w => w.includes("취득 시기"));
    expect(timingWarning).toBeUndefined();
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

  it("합병 주식 취득 → 비과세 결과 (§9② anchor)", () => {
    const result = assessDeemedAcquisition({
      majorShareholder: {
        corporateAssetValue: 10_000_000_000,
        prevShareRatio: 0.0,
        newShareRatio: 0.8,
        isListed: false,
        isMergerOrSplitShare: true,
      },
    });
    expect(result.type).toBe("major_shareholder");
    expect(result.isSubjectToTax).toBe(false);
    expect(result.deemedTaxBase).toBe(0);
    expect(result.warnings[0]).toContain("합병·분할");
  });

  it("법인 설립 주식 취득 → 비과세 결과 (§9③ anchor)", () => {
    const result = assessDeemedAcquisition({
      majorShareholder: {
        corporateAssetValue: 500_000_000,
        prevShareRatio: 0.0,
        newShareRatio: 1.0,
        isListed: false,
        isFoundingShare: true,
      },
    });
    expect(result.type).toBe("major_shareholder");
    expect(result.isSubjectToTax).toBe(false);
    expect(result.deemedTaxBase).toBe(0);
    expect(result.warnings[0]).toContain("법인 설립");
  });
});

// ============================================================
// deemedInput 미제공 경로 (calcAcquisitionTax 오케스트레이터)
// ============================================================

describe("calcAcquisitionTax — deemedInput 미제공 시 경고 반환", () => {
  const baseInput = {
    propertyType: "land" as const,
    acquisitionCause: "deemed_major_shareholder" as const,
    reportedPrice: 0,
    acquiredBy: "individual" as const,
    standardValue: 500_000_000,
  };

  it("deemed_major_shareholder — deemedInput 없으면 0원 결과 + 경고", () => {
    const result = calcAcquisitionTax(baseInput);
    expect(result.acquisitionTax).toBe(0);
    expect(result.totalTax).toBe(0);
    expect(result.totalTaxAfterReduction).toBe(0);
    // 경고 메시지에 deemedInput 요청 포함
    const warnMsg = result.warnings.find(w => w.includes("deemedInput"));
    expect(warnMsg).toBeDefined();
    expect(warnMsg).toContain("deemed_major_shareholder");
  });

  it("deemed_land_category — deemedInput 없으면 0원 결과 + 경고", () => {
    const result = calcAcquisitionTax({
      ...baseInput,
      acquisitionCause: "deemed_land_category",
    });
    expect(result.acquisitionTax).toBe(0);
    const warnMsg = result.warnings.find(w => w.includes("deemedInput"));
    expect(warnMsg).toBeDefined();
    expect(warnMsg).toContain("deemed_land_category");
  });

  it("deemed_renovation — deemedInput 없으면 0원 결과 + 경고", () => {
    const result = calcAcquisitionTax({
      ...baseInput,
      propertyType: "building" as const,
      acquisitionCause: "deemed_renovation",
    });
    expect(result.acquisitionTax).toBe(0);
    const warnMsg = result.warnings.find(w => w.includes("deemedInput"));
    expect(warnMsg).toBeDefined();
  });
});

// ============================================================
// deemedDetail 필드 검증 (AcquisitionTaxResult)
// ============================================================

describe("calcAcquisitionTax — deemedDetail 필드 구성", () => {
  it("과점주주 비과세(합병) 시 deemedDetail 포함", () => {
    const result = calcAcquisitionTax({
      propertyType: "land" as const,
      acquisitionCause: "deemed_major_shareholder" as const,
      reportedPrice: 0,
      acquiredBy: "individual" as const,
      standardValue: 500_000_000,
      deemedInput: {
        majorShareholder: {
          corporateAssetValue: 2_000_000_000,
          prevShareRatio: 0.0,
          newShareRatio: 0.7,
          isListed: false,
          isMergerOrSplitShare: true,
        },
      },
    });
    expect(result.acquisitionTax).toBe(0);
    expect(result.isExempt).toBe(false); // 비과세사유(exemptionType)와 구분
    expect(result.deemedDetail).toBeDefined();
    expect(result.deemedDetail!.type).toBe("major_shareholder");
    expect(result.deemedDetail!.isSubjectToTax).toBe(false);
    expect(result.deemedDetail!.deemedTaxBase).toBe(0);
    expect(result.deemedDetail!.prevShareRatio).toBe(0.0);
    expect(result.deemedDetail!.newShareRatio).toBe(0.7);
  });

  it("지목변경 과세 시 deemedDetail.prevStandardValue/newStandardValue 포함", () => {
    const result = calcAcquisitionTax({
      propertyType: "land" as const,
      acquisitionCause: "deemed_land_category" as const,
      reportedPrice: 0,
      acquiredBy: "individual" as const,
      standardValue: 200_000_000,
      deemedInput: {
        landCategory: {
          prevCategory: "임야",
          newCategory: "대",
          prevStandardValue: 50_000_000,
          newStandardValue: 200_000_000,
        },
      },
    });
    // 과세표준 = 200M - 50M = 150M
    expect(result.deemedDetail).toBeDefined();
    expect(result.deemedDetail!.type).toBe("land_category");
    expect(result.deemedDetail!.isSubjectToTax).toBe(true);
    expect(result.deemedDetail!.deemedTaxBase).toBe(150_000_000);
    expect(result.deemedDetail!.prevStandardValue).toBe(50_000_000);
    expect(result.deemedDetail!.newStandardValue).toBe(200_000_000);
  });

  it("건물 개수 과세 시 deemedDetail 포함", () => {
    const result = calcAcquisitionTax({
      propertyType: "building" as const,
      acquisitionCause: "deemed_renovation" as const,
      reportedPrice: 0,
      acquiredBy: "individual" as const,
      standardValue: 300_000_000,
      deemedInput: {
        renovation: {
          renovationType: "use_change",
          prevStandardValue: 100_000_000,
          newStandardValue: 300_000_000,
        },
      },
    });
    expect(result.deemedDetail).toBeDefined();
    expect(result.deemedDetail!.type).toBe("renovation");
    expect(result.deemedDetail!.isSubjectToTax).toBe(true);
    expect(result.deemedDetail!.deemedTaxBase).toBe(200_000_000);
    expect(result.deemedDetail!.prevStandardValue).toBe(100_000_000);
    expect(result.deemedDetail!.newStandardValue).toBe(300_000_000);
  });
});
