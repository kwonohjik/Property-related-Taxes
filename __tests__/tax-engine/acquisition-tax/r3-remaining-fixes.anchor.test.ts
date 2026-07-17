import { describe, it, expect } from "vitest";
import { calcAcquisitionTax } from "@/lib/tax-engine/acquisition-tax";
import type { AcquisitionTaxInput } from "@/lib/tax-engine/types/acquisition.types";

/**
 * 취득세 R3 잔여 확정결함 수정 anchor (R3-05·R3-06·R3-07·R3-09·R3-10).
 * 각 케이스는 수정 무력화 시 실패하도록 법령정답을 원 단위로 고정한다.
 *
 * - R3-05 §151①1가: 법인 §13②③⑥⑦ 비주택 중과 지방교육세 = 본문액 × 300%.
 * - R3-06 §13의2③: 조정 고급주택 증여 = 제2항 12% + 중과기준세율×400%(8%p) = 20%.
 * - R3-07 §10의3①: 특수관계 유상 130% 초과 과다신고 → 사실상취득가격 유지(시가 하향 금지).
 * - R3-09 농특세법 §4 10호: 지특법 §6① 자경농지 취득세 = 농특세 비과세.
 * - R3-10 §11①8나: 6~9억 선형보간 세율 = 4자리 확정세율(다섯째자리 반올림).
 */
const BASE = { acquiredBy: "individual", balancePaymentDate: "2024-06-01" } as const;

describe("[AT-R3R] R3 잔여 수정 anchor", () => {
  it("[AT-R3R-05] 대도시 법인 5년내 상가 10억 §13② 8% → 지방교육세 가목 ×300% = 12,000,000", () => {
    const r = calcAcquisitionTax({
      ...BASE,
      propertyType: "building",
      acquisitionCause: "purchase",
      reportedPrice: 1_000_000_000,
      acquiredBy: "corporation",
      isMetropolitanCongestion: true,
      isWithin5YearsOfEstablishment: true,
    } as AcquisitionTaxInput);
    // 본문 (표준 4% − 2%) × 20% × 10억 = 0.4% = 4,000,000 → 가목 ×300% = 12,000,000
    // (수정 전에는 surchargeType=undefined로 붕괴해 본문 0.4% = 4,000,000)
    expect(r.localEducationTax).toBe(12_000_000);
    // 농특세는 표준 4% 성분만 2%로 치환 → (2% + 중과분 4%) × 10억 × 10% = 0.6% = 6,000,000
    expect(r.ruralSpecialTax).toBe(6_000_000);
    expect(r.appliedRate).toBeCloseTo(0.08, 5);
  });

  it("[AT-R3R-05b] 대도시 법인 본점·공장(§13①)은 §151①1가 열거 제외 → 본문 0.4% 유지", () => {
    const r = calcAcquisitionTax({
      ...BASE,
      propertyType: "building",
      acquisitionCause: "purchase",
      reportedPrice: 1_000_000_000,
      acquiredBy: "corporation",
      isMetropolitanCongestion: true,
      isHeadquarterNewBuild: true, // §13① 본점 신증축 → 가목 아님
    } as AcquisitionTaxInput);
    // §13①은 §151①1가(§13②③⑥⑦)에 미열거 → 본문 (4%−2%)×20% = 0.4% = 4,000,000
    expect(r.localEducationTax).toBe(4_000_000);
  });

  it("[AT-R3R-06] 조정대상지역 고급주택 15억 증여 → §13의2③ 20% (구 사치성 단독 11.5%)", () => {
    const r = calcAcquisitionTax({
      ...BASE,
      propertyType: "housing",
      acquisitionCause: "gift",
      reportedPrice: 1_500_000_000,
      marketValue: 1_500_000_000,
      isLuxuryProperty: true,
      isRegulatedArea: true,
      standardValue: 1_500_000_000,
      wholeHouseStandardValue: 1_500_000_000,
      houseCountAfter: 1,
    } as AcquisitionTaxInput);
    // §13의2②(증여 12%) + §13⑤(사치성 8%p) = 20%. 과세표준 15억 × 20% = 300,000,000.
    expect(r.appliedRate).toBeCloseTo(0.2, 5);
    expect(r.acquisitionTax).toBe(300_000_000);
  });

  it("[AT-R3R-07] 특수관계 유상 신고가 10억 > 시가 7억×130% → 사실상취득가격 10억 유지", () => {
    const r = calcAcquisitionTax({
      ...BASE,
      propertyType: "building",
      acquisitionCause: "purchase",
      reportedPrice: 1_000_000_000, // 10억 > 7억×1.3 = 9.1억 (과다신고)
      marketValue: 700_000_000,
      isRelatedParty: true,
    } as AcquisitionTaxInput);
    // 과다신고는 §10의3② 저가 상향 대상 아님 → 사실상취득가격 10억 과세.
    // (수정 전에는 130% 초과분도 시가 7억으로 하향 → 과소)
    expect(r.taxBaseMethod).toBe("actual_price");
    expect(r.taxBase).toBe(1_000_000_000);
    expect(r.acquisitionTax).toBe(40_000_000); // 10억 × 4%
  });

  it("[AT-R3R-07b] 특수관계 유상 저가취득(신고가 3억 < 시가 7억×70%) → 시가인정액 상향 유지", () => {
    const r = calcAcquisitionTax({
      ...BASE,
      propertyType: "building",
      acquisitionCause: "purchase",
      reportedPrice: 300_000_000, // 3억 < 7억×0.7 = 4.9억 (저가)
      marketValue: 700_000_000,
      isRelatedParty: true,
    } as AcquisitionTaxInput);
    // 저가취득은 §10의3② 시가인정액 상향 유지 (R3-07 수정이 저가 경로는 건드리지 않음)
    expect(r.taxBaseMethod).toBe("recognized_market");
    expect(r.taxBase).toBe(700_000_000);
  });

  it("[AT-R3R-09] 자경농지 5억 3% + §6① 감면 → 농특세법 §4 10호 비과세(0) + 감면후 8,500,000", () => {
    const r = calcAcquisitionTax({
      ...BASE,
      propertyType: "land_farmland",
      acquisitionCause: "purchase",
      reportedPrice: 500_000_000,
      isSelfCultivatedFarmer: true,
      farmingYears: 5,
      farmlandArea: 3000,
      farmlandLocationDistance: 10,
    } as AcquisitionTaxInput);
    // 본세 15,000,000 × 50% 감면 = 7,500,000 후 남은 본세 7,500,000
    // 농특세 §4 10호 비과세 = 0 (구값 1,000,000), 교육세 §151①1 본문 0.2% = 1,000,000
    expect(r.ruralSpecialTax).toBe(0);
    expect(r.localEducationTax).toBe(1_000_000);
    expect(r.totalTaxAfterReduction).toBe(8_500_000);
  });

  it("[AT-R3R-10] 주택 7억 유상 → §11①8나 4자리 확정세율 0.0167 → 11,690,000 (구 11,666,666)", () => {
    const r = calcAcquisitionTax({
      ...BASE,
      propertyType: "housing",
      acquisitionCause: "purchase",
      reportedPrice: 700_000_000,
      houseCountAfter: 1,
    } as AcquisitionTaxInput);
    // (7억×2−9억)/300억 = 0.016666 → 4자리 0.0167. floor(7억 × 0.0167) = 11,690,000.
    expect(r.appliedRate).toBe(0.0167);
    expect(r.acquisitionTax).toBe(11_690_000);
  });
});
