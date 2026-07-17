/**
 * 취득세 Phase 2 Anchor 테스트
 *
 * 설계 문서: acquisition-tax-upgrade.phases.md §1 Phase 2 "완료 기준"
 *
 * 검증 항목:
 * P2-1 세율특례 §15:
 *   - 상속 1가구1주택 단독 → 0.8% (2.8% - 2%)
 *   - 상속 1가구1주택 + §13②(대도시 법인) → 2.4% ((2.8%-2%)×3) — 페이지 21 인용 1,000분의 24
 *   - 협의분할(공유물 분할) → 0% (4% - 2% = 2%, but co_ownership_split은 0%인지 확인)
 *   - 이혼 재산분할 → basicRate - 2%
 *   - 합병 토지(대도시 법인) → 6% ((4%-2%)×3)
 *   - §13①(본점 중과) 대상 → §15 배제, basicRate 그대로
 *
 * P2-2 법인·공장 중과:
 *   - 대도시 법인 5년 이내 본점 신축 → 8.4% (2.8% × 3)
 *   - 비도시형 공장 건물 신축 → 6.8% (2.8% + 4%p)
 *   - 비도시형 공장 토지 매매 → 8% (4% + 4%p)
 *   - §13①+§13② 중복 → basicRate × 3
 *   - 중과제외업종(은행) → §13② 배제
 *
 * P2-5 자경농지 감면:
 *   - 자경농지 매매 → 1.5% (3% × 50%)
 *   - 감면 요건 미충족 → 0원 감면
 *   - 생애최초 vs 자경농지 중복 → 유리한 것 선택 (지방세특례제한법 §180)
 *
 * P2-3 휴면법인:
 *   - 휴면법인 5년 이내 → isWithin5Years: true
 *   - 휴면법인 5년 경과 → isWithin5Years: false
 */

import { describe, it, expect } from "vitest";
import {
  applySpecialRate,
  isValidSpecialRateType,
} from "../../../lib/tax-engine/acquisition-tax-rate-special";
import {
  assessCorpSurcharge,
} from "../../../lib/tax-engine/acquisition-corp-surcharge";
import {
  assessSelfCultivationReduction,
} from "../../../lib/tax-engine/acquisition-self-cultivation-reduction";
import {
  assessDormantCorp,
} from "../../../lib/tax-engine/acquisition-dormant-corp";
import { calcAcquisitionTax } from "../../../lib/tax-engine/acquisition-tax";

// ============================================================
// P2-1 세율특례 §15 Anchor
// ============================================================

describe("[P2-Anchor #P2-1] 세율특례 §15 — applySpecialRate", () => {

  it("#A1 상속 1가구1주택 단독 → 0.8% (2.8% - 2%)", () => {
    // phases.md Phase 2 완료 기준: "상속 1가구1주택 → 0.8% (현재 2.8%)"
    const result = applySpecialRate(
      0.028,
      "inheritance_one_house",
      { isCorpMetro: false, isHeadquarterOrFactorySurcharge: false }
    );
    expect(result.isApplied).toBe(true);
    expect(result.appliedRate).toBeCloseTo(0.008, 5);
    expect(result.rateMode).toBe("special_rate_solo");
  });

  it("#A2 상속 1가구1주택 + §13②(대도시 법인) → 2.4% ((2.8%-2%)×3) — 페이지 21 인용 1,000분의 24", () => {
    // 설계서 인용: "대도시 법인 합병... (2.8%-2%)×3 = 2.4%"
    const result = applySpecialRate(
      0.028,
      "inheritance_one_house",
      { isCorpMetro: true, isHeadquarterOrFactorySurcharge: false }
    );
    expect(result.isApplied).toBe(true);
    expect(result.appliedRate).toBeCloseTo(0.024, 5);
    expect(result.rateMode).toBe("special_rate_with_metro");
    // anchor: 1,000분의 24 = 0.024
  });

  it("#A3 협의분할(공유물 분할) → 2% (4% - 2%) — 유상취득 4% 기준", () => {
    // co_ownership_split: 토지 유상 4% → 4% - 2% = 2%
    const result = applySpecialRate(
      0.04,
      "co_ownership_split",
      { isCorpMetro: false, isHeadquarterOrFactorySurcharge: false }
    );
    expect(result.isApplied).toBe(true);
    expect(result.appliedRate).toBeCloseTo(0.02, 5);
    expect(result.rateMode).toBe("special_rate_solo");
  });

  it("#A4 이혼 재산분할 → basicRate - 2% (예: 매매 4% → 2%)", () => {
    // phases.md Phase 2 완료 기준: "이혼 재산분할 → basicRate - 2%"
    const result = applySpecialRate(
      0.04,
      "divorce_division",
      { isCorpMetro: false, isHeadquarterOrFactorySurcharge: false }
    );
    expect(result.isApplied).toBe(true);
    expect(result.appliedRate).toBeCloseTo(0.02, 5);
  });

  it("#A5 합병 토지 + §13②(대도시 법인) → 6% ((4%-2%)×3)", () => {
    // 설계서: "대도시 법인 합병 토지 4% → (4%-2%)×3 = 6%"
    const result = applySpecialRate(
      0.04,
      "corp_merger",
      { isCorpMetro: true, isHeadquarterOrFactorySurcharge: false }
    );
    expect(result.isApplied).toBe(true);
    expect(result.appliedRate).toBeCloseTo(0.06, 5);
    expect(result.rateMode).toBe("special_rate_with_metro");
  });

  it("#A6 §13①(본점 중과) 대상 → §15 배제 — basicRate 그대로", () => {
    // 설계서: "§13① 본점·공장 중과는 §15 적용 배제"
    const result = applySpecialRate(
      0.028,
      "inheritance_one_house",
      { isCorpMetro: false, isHeadquarterOrFactorySurcharge: true }
    );
    expect(result.isApplied).toBe(false);
    expect(result.appliedRate).toBe(0.028); // 기본세율 그대로
    expect(result.rateMode).toBe("hq_surcharge_excluded");
  });

  it("#A7 세율특례 없음 → 미적용, basicRate 그대로", () => {
    const result = applySpecialRate(
      0.04,
      undefined,
      { isCorpMetro: false, isHeadquarterOrFactorySurcharge: false }
    );
    expect(result.isApplied).toBe(false);
    expect(result.appliedRate).toBe(0.04);
    expect(result.rateMode).toBe("no_special_rate");
  });

  it("#A8 환매권 행사 → 2% (4% - 2%)", () => {
    const result = applySpecialRate(
      0.04,
      "redemption",
      { isCorpMetro: false, isHeadquarterOrFactorySurcharge: false }
    );
    expect(result.isApplied).toBe(true);
    expect(result.appliedRate).toBeCloseTo(0.02, 5);
    expect(result.rateMode).toBe("special_rate_solo");
  });

  it("#A9 건축물 이전 → 2% (4% - 2%)", () => {
    const result = applySpecialRate(
      0.04,
      "building_relocation",
      { isCorpMetro: false, isHeadquarterOrFactorySurcharge: false }
    );
    expect(result.isApplied).toBe(true);
    expect(result.appliedRate).toBeCloseTo(0.02, 5);
  });

  it("#A10 isValidSpecialRateType 유효 타입 검증", () => {
    expect(isValidSpecialRateType("inheritance_one_house")).toBe(true);
    expect(isValidSpecialRateType("co_ownership_split")).toBe(true);
    expect(isValidSpecialRateType("invalid_type")).toBe(false);
    expect(isValidSpecialRateType(undefined)).toBe(false);
  });
});

// ============================================================
// P2-2 법인·공장 중과 §13① Anchor
// ============================================================

describe("[P2-Anchor #P2-2] 법인·공장 중과 §13① — assessCorpSurcharge", () => {

  it("#B1 대도시 법인 본점 신축 → 8.4% (2.8% × 3) — phases.md 완료 기준", () => {
    // 설계서: "대도시 5년 이내 법인 본점 신축 → 8.4% (2.8 × 3)"
    // §13①(본점) + §13②(대도시 5년) 중복 = 표준세율 × 3
    const result = assessCorpSurcharge({
      basicRate: 0.028,       // 원시취득 기본세율 2.8%
      acquiredBy: "corporation",
      isMetropolitanCongestion: true,
      isHeadquarterNewBuild: true,
      isWithin5YearsOfEstablishment: true,
      propertyType: "building",
    });
    expect(result.isSurcharged).toBe(true);
    expect(result.surchargeType).toBe("headquarters_metro_combined");
    // 2.8% × 3 = 8.4%
    expect(result.surchargeRate).toBeCloseTo(0.084, 5);
  });

  it("#B2 비도시형 공장 건물 신축 → 6.8% (2.8% + 4%p) — phases.md 완료 기준", () => {
    // 설계서: "비도시형 공장 건물 신축 → 6.8%"
    const result = assessCorpSurcharge({
      basicRate: 0.028,
      acquiredBy: "corporation",
      isNonUrbanFactory: true,
      factoryComponent: "building",
      propertyType: "building",
    });
    expect(result.isSurcharged).toBe(true);
    expect(result.surchargeType).toBe("factory_building");
    // 2.8% + 4%p = 6.8%
    expect(result.surchargeRate).toBeCloseTo(0.068, 5);
    expect(result.excludesSpecialRate).toBe(true); // §13① 대상 → §15 배제
  });

  it("#B3 비도시형 공장 토지 매매 → 8% (4% + 4%p) — phases.md 완료 기준", () => {
    // 설계서: "비도시형 공장 토지 매매 → 8%"
    const result = assessCorpSurcharge({
      basicRate: 0.04,
      acquiredBy: "corporation",
      isNonUrbanFactory: true,
      factoryComponent: "land",
      propertyType: "land",
    });
    expect(result.isSurcharged).toBe(true);
    expect(result.surchargeType).toBe("factory_land");
    // 4% + 4%p = 8%
    expect(result.surchargeRate).toBeCloseTo(0.08, 5);
  });

  it("#B4 본점 단독 (§13①만) → 표준세율 + 4%p", () => {
    // 과밀억제권역 + 본점 신증축, 5년 이내 아님
    const result = assessCorpSurcharge({
      basicRate: 0.04,
      acquiredBy: "corporation",
      isMetropolitanCongestion: true,
      isHeadquarterNewBuild: true,
      isWithin5YearsOfEstablishment: false,
      propertyType: "building",
    });
    expect(result.isSurcharged).toBe(true);
    expect(result.surchargeType).toBe("headquarters_new_build");
    expect(result.surchargeRate).toBeCloseTo(0.08, 5); // 4% + 4%p
    expect(result.excludesSpecialRate).toBe(true);
  });

  it("#B5 대도시 법인 5년 이내 단독 (§13②만) → 표준세율 × 3 - 4%p", () => {
    // 과밀억제권역 + 5년 이내, 본점 신증축 아님
    const result = assessCorpSurcharge({
      basicRate: 0.04,
      acquiredBy: "corporation",
      isMetropolitanCongestion: true,
      isHeadquarterNewBuild: false,
      isWithin5YearsOfEstablishment: true,
      propertyType: "land",
    });
    expect(result.isSurcharged).toBe(true);
    expect(result.surchargeType).toBe("metro_corp_5yr");
    // 4% × 3 - 4%p = 8%
    expect(result.surchargeRate).toBeCloseTo(0.08, 5);
    expect(result.isCorpMetroContext).toBe(true);
    expect(result.excludesSpecialRate).toBe(false); // §13②는 §15 배제 아님
  });

  it("#B6 중과제외업종(은행) → §13② 배제, 미중과", () => {
    // §13②단서: 은행업은 대도시 법인 중과 제외
    const result = assessCorpSurcharge({
      basicRate: 0.04,
      acquiredBy: "corporation",
      isMetropolitanCongestion: true,
      isWithin5YearsOfEstablishment: true,
      excludedBusinessType: "bank",
      propertyType: "land",
    });
    expect(result.isSurcharged).toBe(false);
    expect(result.surchargeType).toBe("not_applicable");
  });

  it("#B7 개인 취득 → 법인 중과 미적용", () => {
    const result = assessCorpSurcharge({
      basicRate: 0.04,
      acquiredBy: "individual",
      isMetropolitanCongestion: true,
      isHeadquarterNewBuild: true,
      isWithin5YearsOfEstablishment: true,
      propertyType: "building",
    });
    expect(result.isSurcharged).toBe(false);
  });
});

// ============================================================
// P2-5 자경농지 50% 감면 Anchor
// ============================================================

describe("[P2-Anchor #P2-5] 자경농지 50% 감면 — §6", () => {

  it("#C1 자경농지 매매 요건 모두 충족 → 취득세 50% 감면", () => {
    // phases.md 완료 기준: "자경농지 매매 → 1.5% (3% × 50%)"
    // 농지 매매 3%를 가정: 과세표준 1억, 본세 300만원 → 150만원 감면
    const result = assessSelfCultivationReduction({
      isSelfCultivatedFarmer: true,
      farmingYears: 3,
      farmlandArea: 5000,
      farmlandLocationDistance: 15,
      acquisitionTax: 3_000_000,
      propertyType: "land_farmland",
      acquisitionCause: "purchase",
    });
    expect(result.isEligible).toBe(true);
    // 3,000,000 × 50% = 1,500,000
    expect(result.reductionAmount).toBe(1_500_000);
  });

  it("#C2 자경농지 5억 매매 → 50% 감면 (실 세금액 기준)", () => {
    // 농지 5억, 세율 3% → 취득세 본세 15,000,000 → 감면 7,500,000
    const result = assessSelfCultivationReduction({
      isSelfCultivatedFarmer: true,
      farmingYears: 5,
      farmlandArea: 3000,
      farmlandLocationDistance: 10,
      acquisitionTax: 15_000_000,
      propertyType: "land_farmland",
      acquisitionCause: "purchase",
    });
    expect(result.isEligible).toBe(true);
    expect(result.reductionAmount).toBe(7_500_000);
  });

  it("#C3 영농 연수 미달 (1년) → 감면 불가", () => {
    const result = assessSelfCultivationReduction({
      isSelfCultivatedFarmer: true,
      farmingYears: 1, // 요건: 2년 이상
      farmlandArea: 5000,
      farmlandLocationDistance: 15,
      acquisitionTax: 3_000_000,
      propertyType: "land_farmland",
      acquisitionCause: "purchase",
    });
    expect(result.isEligible).toBe(false);
    expect(result.reductionAmount).toBe(0);
    expect(result.ineligibleReasons.length).toBeGreaterThan(0);
  });

  it("#C4 거리 초과 (40km) → 감면 불가", () => {
    const result = assessSelfCultivationReduction({
      isSelfCultivatedFarmer: true,
      farmingYears: 5,
      farmlandArea: 5000,
      farmlandLocationDistance: 40, // 요건: 30km 이내
      acquisitionTax: 3_000_000,
      propertyType: "land_farmland",
      acquisitionCause: "purchase",
    });
    expect(result.isEligible).toBe(false);
    expect(result.reductionAmount).toBe(0);
  });

  it("#C5 면적 25,000㎡ (한도 30,000㎡ 이내) → 전액 감면 (지특령 §3②3호)", () => {
    const result = assessSelfCultivationReduction({
      isSelfCultivatedFarmer: true,
      farmingYears: 5,
      farmlandArea: 25_000, // 논·밭·과수원 한도 30,000㎡ 이내
      farmlandLocationDistance: 15,
      acquisitionTax: 3_000_000,
      propertyType: "land_farmland",
      acquisitionCause: "purchase",
    });
    expect(result.isEligible).toBe(true);
    expect(result.reductionAmount).toBe(1_500_000); // 3,000,000 × 50%
  });

  it("#C5b 면적 초과 (60,000㎡) → 초과분만 제외한 부분감면 (지특령 §3②3호)", () => {
    // 경감대상 = 본세 × (30,000/60,000) = 1,500,000, 감면 = × 50% = 750,000
    const result = assessSelfCultivationReduction({
      isSelfCultivatedFarmer: true,
      farmingYears: 5,
      farmlandArea: 60_000, // 한도 30,000㎡ 2배 초과
      farmlandLocationDistance: 15,
      acquisitionTax: 3_000_000,
      propertyType: "land_farmland",
      acquisitionCause: "purchase",
    });
    expect(result.isEligible).toBe(true);
    expect(result.reductionAmount).toBe(750_000);
  });

  it("#C6 농지가 아닌 물건 → 자경 감면 미적용", () => {
    const result = assessSelfCultivationReduction({
      isSelfCultivatedFarmer: true,
      farmingYears: 5,
      farmlandArea: 5000,
      farmlandLocationDistance: 15,
      acquisitionTax: 3_000_000,
      propertyType: "housing", // 주택 → 감면 불가
      acquisitionCause: "purchase",
    });
    expect(result.isEligible).toBe(false);
  });

  it("#C7 자경 미신청 → 감면 0원", () => {
    const result = assessSelfCultivationReduction({
      isSelfCultivatedFarmer: false,
      farmingYears: 5,
      farmlandArea: 5000,
      farmlandLocationDistance: 15,
      acquisitionTax: 3_000_000,
      propertyType: "land_farmland",
      acquisitionCause: "purchase",
    });
    expect(result.isEligible).toBe(false);
    expect(result.reductionAmount).toBe(0);
  });
});

// ============================================================
// P2-3 휴면법인 판정 Anchor
// ============================================================

describe("[P2-Anchor #P2-3] 휴면법인 판정 — assessDormantCorp", () => {

  it("#D1 휴면법인 5년 이내 → isWithin5Years: true", () => {
    // 과점주주 도달: 2023-01-01, 기준일: 2026-04-30 (약 3.3년)
    const result = assessDormantCorp({
      isDormantCorpAcquisition: true,
      dormantCorpType: "dissolved",
      majorShareholderDate: "2023-01-01",
      referenceDate: "2026-04-30",
    });
    expect(result.isDormantCorp).toBe(true);
    expect(result.isWithin5Years).toBe(true);
    expect(result.surchargeEndDate).toBe("2028-01-01");
  });

  it("#D2 휴면법인 5년 경과 → isWithin5Years: false", () => {
    // 과점주주 도달: 2018-01-01, 기준일: 2026-04-30 (약 8.3년)
    const result = assessDormantCorp({
      isDormantCorpAcquisition: true,
      dormantCorpType: "closed",
      majorShareholderDate: "2018-01-01",
      referenceDate: "2026-04-30",
    });
    expect(result.isDormantCorp).toBe(true);
    expect(result.isWithin5Years).toBe(false);
    expect(result.surchargeEndDate).toBe("2023-01-01");
  });

  it("#D3 휴면법인 아님 → isDormantCorp: false", () => {
    const result = assessDormantCorp({
      isDormantCorpAcquisition: false,
    });
    expect(result.isDormantCorp).toBe(false);
  });

  it("#D4 임원 50% 교체 유형 → 판정 정상", () => {
    const result = assessDormantCorp({
      isDormantCorpAcquisition: true,
      dormantCorpType: "officer_50pct_change",
      majorShareholderDate: "2024-06-01",
      referenceDate: "2026-04-30",
    });
    expect(result.isDormantCorp).toBe(true);
    expect(result.dormantType).toBe("officer_50pct_change");
    expect(result.isWithin5Years).toBe(true);
  });
});

// ============================================================
// P2 통합: calcAcquisitionTax에서 P2 모듈 통합 확인
// ============================================================

describe("[P2-Anchor #P2-통합] calcAcquisitionTax P2 모듈 통합", () => {

  it("#E1 상속 1가구1주택 특례 → 0.8% 적용 확인", () => {
    // 상속 주택 5억, 1가구 1주택, 세율특례 §15①2 적용
    const result = calcAcquisitionTax({
      propertyType: "housing",
      acquisitionCause: "inheritance",
      reportedPrice: 0,
      standardValue: 500_000_000,
      acquiredBy: "individual",
      specialRateType: "inheritance_one_house",
      isOneHouseHousehold: true, // [C-2] §15①2호 가목 요건 — 충족 시에만 특례 발동
      balancePaymentDate: "2026-04-01",
    });
    // 기본세율 2.8% → §15 특례 → 0.8%
    expect(result.appliedRate).toBeCloseTo(0.008, 5);
    expect(result.specialRateDetail).toBeDefined();
    expect(result.specialRateDetail?.appliedRate).toBeCloseTo(0.008, 5);
  });

  it("#E2 비도시형 공장 건물 신축 → 6.8% 적용 확인", () => {
    // 법인, 공장 건물 원시취득 2.8% + §13①2호 4%p = 6.8%
    const result = calcAcquisitionTax({
      propertyType: "building",
      acquisitionCause: "new_construction",
      constructionCost: 1_000_000_000,
      reportedPrice: 0,
      acquiredBy: "corporation",
      isNonUrbanFactory: true,
      factoryComponent: "building",
      balancePaymentDate: "2026-04-01",
      usageApprovalDate: "2026-04-01",
    });
    // 2.8% + 4%p = 6.8%
    expect(result.appliedRate).toBeCloseTo(0.068, 5);
    expect(result.corpSurchargeDetail).toBeDefined();
    expect(result.corpSurchargeDetail?.surchargeType).toBe("factory_building");
  });

  it("#E3 자경농지 매매 → 50% 감면 적용 확인", () => {
    // 농지 1억 매매, 세율 3%, 취득세 300만 → 150만 감면
    const result = calcAcquisitionTax({
      propertyType: "land_farmland",
      acquisitionCause: "purchase",
      reportedPrice: 100_000_000,
      acquiredBy: "individual",
      isSelfCultivatedFarmer: true,
      farmingYears: 5,
      farmlandArea: 3000,
      farmlandLocationDistance: 10,
      balancePaymentDate: "2026-04-01",
    });
    expect(result.reductionType).toBe("self_cultivation");
    expect(result.reductionAmount).toBe(1_500_000); // 3,000,000 × 50%
    expect(result.selfCultivationReductionDetail?.isEligible).toBe(true);
  });

  it("#E4 협의분할(공유물 분할) 토지 → 2% 적용 확인", () => {
    // 토지 공유물 협의분할: §15①4 특례 4% - 2% = 2%
    const result = calcAcquisitionTax({
      propertyType: "land",
      acquisitionCause: "purchase",
      reportedPrice: 500_000_000,
      acquiredBy: "individual",
      specialRateType: "co_ownership_split",
      balancePaymentDate: "2026-04-01",
    });
    expect(result.appliedRate).toBeCloseTo(0.02, 5);
    expect(result.specialRateDetail?.type).toBe("co_ownership_split");
  });

  it("#E5 이혼 재산분할 주택 5억 → 기본세율 - 2% 확인", () => {
    // 주택 5억(1% 구간) 이혼 재산분할 → 1% - 2% = 0% (최소값 0 보장)
    const result = calcAcquisitionTax({
      propertyType: "housing",
      acquisitionCause: "purchase",
      reportedPrice: 500_000_000,
      acquiredBy: "individual",
      specialRateType: "divorce_division",
      balancePaymentDate: "2026-04-01",
    });
    // 주택 5억 기본세율 1% → §15 적용 → 1% - 2% = 0% (max 0)
    expect(result.appliedRate).toBe(0);
    // 세액도 0
    expect(result.acquisitionTax).toBe(0);
  });
});
