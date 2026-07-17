/**
 * Phase 4 부가세·감면 anchor 테스트
 *
 * P4-1 지방교육세 주택 유상거래 분기 (§151①1나)
 * P4-2 중과세 시 지방교육세 매트릭스 (사치성·다주택)
 * P4-3 생애최초 소형주택 300만원 한도 (§36의3①1호)
 * P4-4 농특세 읍·면 지역 100㎡ 기준 (농특세법 §4②6호)
 */

import { describe, it, expect } from "vitest";
import { calcAcquisitionTax } from "../../../lib/tax-engine/acquisition-tax";
import { calcLocalEducationTax, calcTaxWithAdditional } from "../../../lib/tax-engine/acquisition-tax-rate";
import type { AcquisitionTaxInput } from "../../../lib/tax-engine/types/acquisition.types";

const BASE: Partial<AcquisitionTaxInput> = {
  acquiredBy: "individual",
  reportedPrice: 0,
  balancePaymentDate: "2026-01-01",
};

// ============================================================
// P4-1 지방교육세 — 주택 유상거래 분기 (§151①1나)
// ============================================================

describe("P4-1 calcLocalEducationTax 주택 유상거래 분기", () => {
  it("#E1 6억 이하 주택 매매(1%): 본세 600만 → 교육세 600만×50%×20%=600,000", () => {
    const result = calcLocalEducationTax({
      taxBase: 600_000_000,
      appliedRate: 0.01,
      acquisitionTax: 6_000_000,
      propertyType: "housing",
      acquisitionCause: "purchase",
      isSurcharged: false,
    });
    expect(result).toBe(600_000);
  });

  it("#E2 9억 초과 주택 매매(3%): 10억×3%=3,000만 → 교육세 3,000만×50%×20%=3,000,000", () => {
    const result = calcLocalEducationTax({
      taxBase: 1_000_000_000,
      appliedRate: 0.03,
      acquisitionTax: 30_000_000,
      propertyType: "housing",
      acquisitionCause: "purchase",
      isSurcharged: false,
    });
    expect(result).toBe(3_000_000);
  });

  it("#E3 주택 증여(무상): §151①1 본문 (3.5%−2%)×20% = 5억×0.3%=1,500,000", () => {
    const result = calcLocalEducationTax({
      taxBase: 500_000_000,
      appliedRate: 0.035,
      acquisitionTax: 17_500_000,
      propertyType: "housing",
      acquisitionCause: "gift",
      isSurcharged: false,
    });
    expect(result).toBe(1_500_000);
  });

  it("#E4 주택 유상 다주택 중과(8%): §151①1나 → (4%−2%)×20% = 0.4% = 2,000,000", () => {
    const result = calcLocalEducationTax({
      taxBase: 500_000_000,
      appliedRate: 0.08,
      acquisitionTax: 40_000_000,
      propertyType: "housing",
      acquisitionCause: "purchase",
      isSurcharged: true,
      surchargeType: "multi_house_8", // §13의2 → 나목 0.4% 고정
    });
    expect(result).toBe(2_000_000);
  });

  it("#E5 토지 매매: 기본 0.4% = 5억×2%×20%=2,000,000", () => {
    const result = calcLocalEducationTax({
      taxBase: 500_000_000,
      appliedRate: 0.04,
      acquisitionTax: 20_000_000,
      propertyType: "land",
      acquisitionCause: "purchase",
      isSurcharged: false,
    });
    expect(result).toBe(2_000_000);
  });
});

// ============================================================
// P4-2 사치성 교육세 매트릭스
// ============================================================

describe("P4-2 사치성 중과세 교육세 매트릭스", () => {
  it("#E6 사치성 단독(luxury_solo) 고급주택 유상 9억↑: 본문 표준율(3%) 본세×50%×20% = 0.3% = 1,500,000", () => {
    const result = calcLocalEducationTax({
      taxBase: 500_000_000,
      appliedRate: 0.11, // 3%+8%p (사치성 중과 최종 세율)
      acquisitionTax: 55_000_000,
      propertyType: "housing",
      acquisitionCause: "purchase",
      isSurcharged: true,
      surchargeType: "luxury_solo",
      basicRate: 0.03, // §11①8 주택 표준세율 (9억 초과 3%)
    });
    // [R3-01] 사치성(§13⑤)은 §151①1 가목·나목 부재 → 본문. 중과분 미반영, 표준율 본세 기준.
    //   §11①8 주택 유상 본문 = 표준율 본세(5억×3%=15,000,000) × 50% × 20% = 1,500,000.
    //   (구 1.4% 하드코딩 7,000,000은 중과분 반영으로 법 근거 없는 과다과세였음)
    expect(result).toBe(1_500_000);
  });

  it("#E7 사치성+다주택 중복(luxury_multi, §13의2③): §151①1나 → 0.4% = 2,000,000", () => {
    const result = calcLocalEducationTax({
      taxBase: 500_000_000,
      appliedRate: 0.20, // 12%+8%p
      acquisitionTax: 100_000_000,
      propertyType: "housing",
      acquisitionCause: "purchase",
      isSurcharged: true,
      surchargeType: "luxury_multi",
      basicRate: 0.04,
    });
    // [R3-01] §13의2③(사치성+다주택)은 §13의2에 해당 → 나목 (4%−2%)×20% = 0.4% = 2,000,000.
    //   (구 1.8% 하드코딩 9,000,000은 법 근거 없음)
    expect(result).toBe(2_000_000);
  });
});

// ============================================================
// P4-3 생애최초 소형주택 300만원 한도 (§36의3①1호)
// ============================================================

describe("P4-3 생애최초 소형주택 300만원 한도", () => {
  it("#E8 일반 주택 생애최초: 한도 200만, 본세 500만 → 감면 200만", () => {
    const input: AcquisitionTaxInput = {
      ...BASE as AcquisitionTaxInput,
      propertyType: "housing",
      acquisitionCause: "purchase",
      reportedPrice: 400_000_000,   // 4억
      standardValue: 380_000_000,
      houseCountAfter: 1,
      isRegulatedArea: false,
      isFirstHome: true,
      isSmallHouseFirstHome: false,
    };
    const result = calcAcquisitionTax(input);
    // 4억×1%=400만 → 감면 200만 한도
    expect(result.reductionAmount).toBe(2_000_000);
    expect(result.totalTaxAfterReduction).toBe(result.totalTax - 2_000_000);
  });

  it("#E9 소형주택 생애최초: 한도 300만, 본세 200만 → 감면 200만 (전액)", () => {
    const input: AcquisitionTaxInput = {
      ...BASE as AcquisitionTaxInput,
      propertyType: "housing",
      acquisitionCause: "purchase",
      reportedPrice: 200_000_000,   // 2억 → 본세 200만
      standardValue: 190_000_000,
      houseCountAfter: 1,
      isRegulatedArea: false,
      isFirstHome: true,
      isSmallHouseFirstHome: true,  // 소형주택
    };
    const result = calcAcquisitionTax(input);
    // 2억×1%=200만 → 소형 300만 한도 → 전액 200만 감면
    expect(result.acquisitionTax).toBe(2_000_000);
    expect(result.reductionAmount).toBe(2_000_000);
  });

  it("#E10 소형주택 생애최초: 한도 300만, 본세 400만 → 감면 300만", () => {
    const input: AcquisitionTaxInput = {
      ...BASE as AcquisitionTaxInput,
      propertyType: "housing",
      acquisitionCause: "purchase",
      reportedPrice: 400_000_000,
      standardValue: 380_000_000,
      houseCountAfter: 1,
      isRegulatedArea: false,
      isFirstHome: true,
      isSmallHouseFirstHome: true,
    };
    const result = calcAcquisitionTax(input);
    expect(result.reductionAmount).toBe(3_000_000);
  });
});

// ============================================================
// P4-4 농특세 읍·면 지역 100㎡ 기준
// ============================================================

describe("P4-4 농특세 읍·면 지역 100㎡ 기준 비과세", () => {
  it("#E11 도시 지역 95㎡ 주택(9억 초과): 농특세 과세 (85㎡ 초과, 세율 3%)", () => {
    const input: AcquisitionTaxInput = {
      ...BASE as AcquisitionTaxInput,
      propertyType: "housing",
      acquisitionCause: "purchase",
      reportedPrice: 1_000_000_000,  // 10억 (9억 초과 → 3%)
      standardValue: 900_000_000,
      houseCountAfter: 1,
      isRegulatedArea: false,
      areaSqm: 95,
      isRuralRegion: false,  // 도시 지역 → 85㎡ 기준
    };
    const result = calcAcquisitionTax(input);
    // [R3-02] 비중과 주택(9억↑ 3%): 표준세율 2% 치환 → 10억 × 0.2% = 2,000,000 (구값 1,000,000은 오산식)
    expect(result.ruralSpecialTax).toBe(2_000_000);
  });

  it("#E12 읍·면 지역 95㎡ 주택(9억 초과): 농특세 비과세 (100㎡ 이하, P4-4)", () => {
    const input: AcquisitionTaxInput = {
      ...BASE as AcquisitionTaxInput,
      propertyType: "housing",
      acquisitionCause: "purchase",
      reportedPrice: 1_000_000_000,
      standardValue: 900_000_000,
      houseCountAfter: 1,
      isRegulatedArea: false,
      areaSqm: 95,
      isRuralRegion: true,  // 읍·면 지역 → 100㎡ 기준
    };
    const result = calcAcquisitionTax(input);
    expect(result.ruralSpecialTax).toBe(0);  // 95㎡ ≤ 100㎡ → 비과세
  });

  it("#E13 읍·면 지역 105㎡ 주택(9억 초과): 농특세 과세 (100㎡ 초과)", () => {
    const input: AcquisitionTaxInput = {
      ...BASE as AcquisitionTaxInput,
      propertyType: "housing",
      acquisitionCause: "purchase",
      reportedPrice: 1_000_000_000,
      standardValue: 900_000_000,
      houseCountAfter: 1,
      isRegulatedArea: false,
      areaSqm: 105,
      isRuralRegion: true,
    };
    const result = calcAcquisitionTax(input);
    // [R3-02] 비중과 주택 9억↑(3%), 105㎡(>100㎡ 과세): 10억 × 0.2% = 2,000,000
    expect(result.ruralSpecialTax).toBe(2_000_000);
  });

  it("#E14 법인 주택 5억 매매 — 부가세 anchor (설계 P4-T)", () => {
    // 법인 주택 5억: 본세 12% = 6,000만
    // 농특세 = (12%-2%)×5억×10% = 5,000,000
    // 교육세 = 5억×2%×20% = 2,000,000 (중과 → 기본 교육세)
    const input: AcquisitionTaxInput = {
      ...BASE as AcquisitionTaxInput,
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquiredBy: "corporation",
      reportedPrice: 500_000_000,
      standardValue: 480_000_000,
      houseCountAfter: 1,
      isRegulatedArea: false,
    };
    const result = calcAcquisitionTax(input);
    expect(result.acquisitionTax).toBe(60_000_000);   // 5억×12%
    expect(result.ruralSpecialTax).toBe(5_000_000);    // (12%-2%)×5억×10%
    expect(result.localEducationTax).toBe(2_000_000);  // 5억×2%×20%
  });
});
