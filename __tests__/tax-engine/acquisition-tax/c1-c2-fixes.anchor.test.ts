import { describe, it, expect } from "vitest";
import { calcAcquisitionTax } from "@/lib/tax-engine/acquisition-tax";
import type { AcquisitionTaxInput } from "@/lib/tax-engine/types/acquisition.types";

/**
 * 취득세 C-1·C-2 구조적 확정결함 수정 anchor.
 *
 * - C-1 지방세법 §13의2①·④·시행령 §28의2 1호·§28의5: 부담부증여 유상분 다주택 중과에도
 *   메인 assessSurcharge와 동일한 중과배제(저가주택·일시적2주택·지정전계약)를 적용.
 * - C-2 지방세법 §15①2호: 상속 세율특례는 가목 1가구1주택(isOneHouseHousehold) /
 *   나목 §6① 감면농지(isSelfCultivatedFarmlandInheritance) 요건 충족 시에만 발동.
 */
const B = { acquiredBy: "individual", balancePaymentDate: "2026-04-01" } as const;

describe("[AT-C2] §15①2호 상속특례 요건 게이트", () => {
  it("[AT-C2-a] 상속주택 + 1가구1주택 요건 충족 → 특례 0.8% 발동", () => {
    const r = calcAcquisitionTax({
      ...B, propertyType: "housing", acquisitionCause: "inheritance",
      reportedPrice: 0, standardValue: 500_000_000,
      specialRateType: "inheritance_one_house",
      isOneHouseHousehold: true,
    } as AcquisitionTaxInput);
    expect(r.appliedRate).toBeCloseTo(0.008, 5); // 2.8% − 2%
    expect(r.specialRateDetail).toBeDefined();
  });

  it("[AT-C2-b] 상속주택 + 1가구1주택 요건 미충족 → 특례 미적용, 표준 2.8%", () => {
    const r = calcAcquisitionTax({
      ...B, propertyType: "housing", acquisitionCause: "inheritance",
      reportedPrice: 0, standardValue: 500_000_000,
      specialRateType: "inheritance_one_house",
      // isOneHouseHousehold 미설정 → 게이트 차단 (구 버그: 0.8% 적용)
    } as AcquisitionTaxInput);
    expect(r.appliedRate).toBeCloseTo(0.028, 5);
    expect(r.specialRateDetail).toBeUndefined();
  });

  it("[AT-C2-c] 상속농지 + 자경농지 상속 요건 충족 → 특례 0.3% 발동", () => {
    const r = calcAcquisitionTax({
      ...B, propertyType: "land_farmland", acquisitionCause: "inheritance",
      reportedPrice: 0, standardValue: 500_000_000,
      specialRateType: "inheritance_one_house",
      isSelfCultivatedFarmlandInheritance: true,
    } as AcquisitionTaxInput);
    expect(r.appliedRate).toBeCloseTo(0.003, 5); // 2.3% − 2%
  });

  it("[AT-C2-d] 상속농지 + 요건 미충족 → 특례 미적용, 표준 2.3%", () => {
    const r = calcAcquisitionTax({
      ...B, propertyType: "land_farmland", acquisitionCause: "inheritance",
      reportedPrice: 0, standardValue: 500_000_000,
      specialRateType: "inheritance_one_house",
      // isSelfCultivatedFarmlandInheritance 미설정 → 게이트 차단 (구 버그: 0.3% 적용)
    } as AcquisitionTaxInput);
    expect(r.appliedRate).toBeCloseTo(0.023, 5);
  });
});

describe("[AT-C1] 부담부증여 유상분 다주택 중과배제 재사용", () => {
  it("[AT-C1-a] 수도권 저가주택(시가표준 9천만≤1억) 부담부증여 3주택 → 유상분 중과 배제", () => {
    const r = calcAcquisitionTax({
      ...B, propertyType: "housing", acquisitionCause: "burdened_gift",
      reportedPrice: 0, standardValue: 90_000_000, wholeHouseStandardValue: 90_000_000,
      encumbrance: 50_000_000, isRegulatedArea: true, isMetropolitanRegion: true,
      houseCountAfter: 3, giftRelation: "other",
    } as AcquisitionTaxInput);
    // 유상분 5천만 × 1%(저가 배제 → 표준) = 500,000
    // 무상분 4천만 × 3.5%(std 9천만<3억 → §13의2② 미발동, 증여 표준) = 1,400,000
    // 합계 1,900,000 (구 버그: 유상분 12% 6,000,000 → 7,400,000)
    expect(r.acquisitionTax).toBe(1_900_000);
  });

  it("[AT-C1-b] 일시적 2주택 부담부증여 → 유상분 중과 배제(무상분 §13의2② 유지)", () => {
    const r = calcAcquisitionTax({
      ...B, propertyType: "housing", acquisitionCause: "burdened_gift",
      reportedPrice: 0, standardValue: 500_000_000, wholeHouseStandardValue: 500_000_000,
      encumbrance: 300_000_000, isRegulatedArea: true, isMetropolitanRegion: true,
      houseCountAfter: 2, isTemporaryTwoHouse: true,
      previousHouseRegion: "regulated", newHouseRegion: "regulated", giftRelation: "other",
    } as AcquisitionTaxInput);
    // 유상분 3억 × 1%(일시적2주택 배제 → 표준) = 3,000,000
    // 무상분 2억 × 12%(std 5억≥3억 조정 → §13의2②) = 24,000,000
    // 합계 27,000,000 (구 버그: 유상분 8% 24,000,000 → 48,000,000)
    expect(r.acquisitionTax).toBe(27_000_000);
  });

  it("[AT-C1-c] 배제 대상 아닌 일반 다주택 부담부증여 → 유상·무상 모두 12% 중과 유지(회귀 방어)", () => {
    const r = calcAcquisitionTax({
      ...B, propertyType: "housing", acquisitionCause: "burdened_gift",
      reportedPrice: 0, standardValue: 1_000_000_000, wholeHouseStandardValue: 1_000_000_000,
      encumbrance: 500_000_000, isRegulatedArea: true, isMetropolitanRegion: true,
      houseCountAfter: 3, giftRelation: "other",
    } as AcquisitionTaxInput);
    // 유상분 5억 × 12%(3주택 조정) + 무상분 5억 × 12%(§13의2②) = 120,000,000
    expect(r.acquisitionTax).toBe(120_000_000);
  });
});
