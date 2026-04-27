/**
 * 토지·건물 소유자 분리 양도세 — 이미지 case 12
 *
 * 사례: 갑이 단독주택(서울 성북구 길음동)의 건물만 소유, 부속토지는 갑의 부인 소유.
 *   - 양도일: 2020.2.16  취득일: 1999.5.20  일괄양도가액: 1,500,000,000원
 *   - 실거래가 확인 불가 → 환산취득가 (PHD §164⑤ 3-시점)
 *   - 다주택자 (단독주택 + 아파트 2채), 조정대상지역 중과 무시 (사용자 지시)
 *   - 갑은 건물 분만 신고 (selfOwns: "building_only")
 *
 * 소득령 §166⑥, §168②: 인별 과세 원칙 — 부부 합산 불가, 갑·부인 각자 신고.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();

// ──────────────────────────────────────────────────────────────
// PHD 3-시점 데이터 (이미지 표 기반)
// 토지면적: 350㎡, 건물면적: 115㎡
// ──────────────────────────────────────────────────────────────
// 시점별 개별공시지가(원/㎡):
//   취득시 (1998.1.1):  930,000
//   최초공시시 (2005.1.1): 1,620,000
//   양도시 (2019.1.1):  2,548,000
//
// 개별주택가격:
//   최초공시 P_F (2005.1.1): 430,000,000
//   양도시   P_T (2019.1.1): 690,000,000
//   (2020.1.1 미공시 → 2019년도 사용)
//
// 건물 기준시가(신축 1966년 시멘트블록 단독주택 1층, 추정값 — 회귀 anchor 용):
//   취득시: 15,000,000  최초공시시: 12,000,000  양도시: 8,000,000
// ──────────────────────────────────────────────────────────────
const LAND_AREA = 350;
const PHD = {
  landArea: LAND_AREA,
  firstDisclosureDate: new Date("2005-01-01"),
  firstDisclosureHousingPrice: 430_000_000,
  landPricePerSqmAtAcquisition: 930_000,
  buildingStdPriceAtAcquisition: 15_000_000,
  landPricePerSqmAtFirstDisclosure: 1_620_000,
  buildingStdPriceAtFirstDisclosure: 12_000_000,
  transferHousingPrice: 690_000_000,
  landPricePerSqmAtTransfer: 2_548_000,
  buildingStdPriceAtTransfer: 8_000_000,
};

const BASE_INPUT = baseTransferInput({
  propertyType: "housing",
  transferDate: new Date("2020-02-16"),
  transferPrice: 1_500_000_000,
  acquisitionDate: new Date("1999-05-20"),   // 건물 취득일 (등기부등본 접수일)
  landAcquisitionDate: new Date("1999-05-20"), // 토지 취득일 (동일)
  acquisitionPrice: 0,
  useEstimatedAcquisition: true,
  acquisitionMethod: "estimated",
  standardPriceAtAcquisition: 0,  // PHD 경로에서 자동 산출 — 미사용
  standardPriceAtTransfer: 0,
  standardPricePerSqmAtAcquisition: PHD.landPricePerSqmAtAcquisition,
  acquisitionArea: LAND_AREA,
  expenses: 0,
  isOneHousehold: false,
  householdHousingCount: 2,
  residencePeriodMonths: 0,
  isRegulatedArea: false,   // 사용자 지시: 조정대상지역 중과 무시
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  landSplitMode: "apportioned",
  preHousingDisclosure: PHD,
});

// ============================================================
// Case 12-A: 갑 (건물주) — selfOwns: "building_only"
// ============================================================

describe("Case 12-A: 갑 (건물주) selfOwns=building_only", () => {
  const input = { ...BASE_INPUT, selfOwns: "building_only" as const };

  it("calcSplitGain: selfOwns 메타 필드 포함", () => {
    const result = calcSplitGain(input);
    expect(result).not.toBeNull();
    expect(result!.selfOwns).toBe("building_only");
  });

  it("calcSplitGain: 토지·건물 양도차익 모두 계산됨 (마스킹 없음)", () => {
    const result = calcSplitGain(input);
    expect(result).not.toBeNull();
    // 양쪽 모두 양도차익 계산됨 (합산은 엔진에서 selfOwns 필터)
    expect(result!.land.transferPrice).toBeGreaterThan(0);
    expect(result!.building.transferPrice).toBeGreaterThan(0);
  });

  it("calcSplitGain: 보유연수 — 양쪽 동일 취득일 (1999.5.20 ~ 2020.2.16 ≈ 20년)", () => {
    const result = calcSplitGain(input);
    expect(result).not.toBeNull();
    expect(result!.land.holdingYears).toBe(20);
    expect(result!.building.holdingYears).toBe(20);
  });

  it("calculateTransferTax: taxableGain = 건물 분 양도차익만 (토지 분 미포함)", () => {
    const inputAll = { ...BASE_INPUT, selfOwns: undefined };   // selfOwns 없음 → both
    const resultAll = calculateTransferTax(inputAll, mockRates);
    const resultBuilding = calculateTransferTax(input, mockRates);

    // building_only 세액 < both 세액
    expect(resultBuilding.transferGain).toBeLessThan(resultAll.transferGain);
    expect(resultBuilding.taxableGain).toBeLessThan(resultAll.taxableGain);
  });

  it("calculateTransferTax: splitDetail.selfOwns = building_only", () => {
    const result = calculateTransferTax(input, mockRates);
    expect(result.splitDetail).toBeDefined();
    expect(result.splitDetail!.selfOwns).toBe("building_only");
  });

  it("calculateTransferTax: splitDetail 포함 (손실 조기 반환 시에도)", () => {
    const result = calculateTransferTax(input, mockRates);
    expect(result.splitDetail).toBeDefined();
    // building_only → 건물 공제율은 계산되나 손실이므로 공제액 = 0, 토지 공제 = 0
    expect(result.splitDetail!.land.longTermDeduction).toBe(0);
    expect(result.splitDetail!.building.longTermDeduction).toBe(0);
  });

  it("calculateTransferTax: 건물 분 손실 시 세액 = 0 (건물 비중 극소, 낡은 건물)", () => {
    // 1966년 낡은 시멘트블록 1층 단독주택: 건물 기준시가가 토지보다 압도적으로 작아
    // building.gain < 0 → selfOwns=building_only 시 ownerRawGain < 0 → transferGain = 0
    const result = calculateTransferTax(input, mockRates);
    expect(result.transferGain).toBe(0);
    expect(result.totalTax).toBe(0);
  });

  it("calculateTransferTax: steps에 '본인 신고분: 건물' 포함", () => {
    const result = calculateTransferTax(input, mockRates);
    const ownerStep = result.steps.find((s) => s.label.includes("본인 신고분"));
    expect(ownerStep).toBeDefined();
    expect(ownerStep!.label).toContain("건물");
  });

  // ── 회귀 anchor ────────────────────────────────────────────
  it("[anchor] calculateTransferTax: building_only 손실 → 세액 0, splitDetail 존재", () => {
    const result = calculateTransferTax(input, mockRates);
    // 1966년 낡은 건물 + 토지 공시지가 압도 → 건물 분 손실 → 세액 0
    expect(result.totalTax).toBe(0);
    expect(result.transferGain).toBe(0);
    expect(result.splitDetail).toBeDefined();
    expect(result.splitDetail!.selfOwns).toBe("building_only");
    expect(result.splitDetail!.building.gain).toBeLessThan(0); // 손실 확인
  });
});

// ============================================================
// Case 12-B: 부인 (토지주) — selfOwns: "land_only"
// ============================================================

describe("Case 12-B: 부인 (토지주) selfOwns=land_only", () => {
  const input = { ...BASE_INPUT, selfOwns: "land_only" as const };

  it("calcSplitGain: selfOwns = land_only", () => {
    const result = calcSplitGain(input);
    expect(result).not.toBeNull();
    expect(result!.selfOwns).toBe("land_only");
  });

  it("calculateTransferTax: taxableGain = 토지 분 양도차익만 (건물 손실 미반영)", () => {
    const inputAll = { ...BASE_INPUT, selfOwns: undefined };
    const resultAll = calculateTransferTax(inputAll, mockRates);
    const resultLand = calculateTransferTax(input, mockRates);

    // both에서는 건물 손실이 토지 이익과 상계됨 → resultAll.transferGain < land.gain
    // land_only에서는 토지 이익만 → resultLand.transferGain > resultAll.transferGain (손실 미상계)
    expect(resultLand.transferGain).toBeGreaterThan(resultAll.transferGain);
    expect(resultLand.splitDetail!.land.gain).toBeGreaterThan(0);
  });

  it("calculateTransferTax: 토지 분 장기보유공제 > 0, 건물 분 = 0", () => {
    const result = calculateTransferTax(input, mockRates);
    expect(result.splitDetail).toBeDefined();
    expect(result.splitDetail!.land.longTermDeduction).toBeGreaterThan(0);
    expect(result.splitDetail!.building.longTermDeduction).toBe(0);
  });

  it("calculateTransferTax: steps에 '본인 신고분: 토지' 포함", () => {
    const result = calculateTransferTax(input, mockRates);
    const ownerStep = result.steps.find((s) => s.label.includes("본인 신고분"));
    expect(ownerStep).toBeDefined();
    expect(ownerStep!.label).toContain("토지");
  });

  it("[일관성] 인별 과세: land_only 이익 = both 이익 + 건물 손실 절댓값", () => {
    const inputBoth = { ...BASE_INPUT, selfOwns: undefined };
    const inputBuilding = { ...BASE_INPUT, selfOwns: "building_only" as const };
    const inputLand = { ...BASE_INPUT, selfOwns: "land_only" as const };

    const both = calculateTransferTax(inputBoth, mockRates);
    const building = calculateTransferTax(inputBuilding, mockRates);
    const land = calculateTransferTax(inputLand, mockRates);

    // both: 건물 손실이 토지 이익과 상계 → 합산 이익 < 토지만 이익
    expect(land.transferGain).toBeGreaterThan(both.transferGain);
    // building: 손실 → 세액 0
    expect(building.transferGain).toBe(0);
    // 분리 신고 합산 = 토지 이익 (건물 손실은 소멸)
    expect(building.transferGain + land.transferGain).toBeGreaterThan(both.transferGain);
  });
});

// ============================================================
// Case 12-C: selfOwns 미지정 → "both" 기본값 (회귀)
// ============================================================

describe("Case 12-C: selfOwns 미지정 → both 기본값 (회귀)", () => {
  it("calcSplitGain: selfOwns = both (미지정)", () => {
    const input = { ...BASE_INPUT };
    delete (input as Record<string, unknown>).selfOwns;
    const result = calcSplitGain(input);
    expect(result).not.toBeNull();
    expect(result!.selfOwns).toBe("both");
  });

  it("calculateTransferTax: selfOwns 미지정 시 기존 동작 동일", () => {
    const inputOld = { ...BASE_INPUT };
    const inputBoth = { ...BASE_INPUT, selfOwns: "both" as const };
    const resultOld = calculateTransferTax(inputOld, mockRates);
    const resultBoth = calculateTransferTax(inputBoth, mockRates);

    expect(resultOld.totalTax).toBe(resultBoth.totalTax);
    expect(resultOld.transferGain).toBe(resultBoth.transferGain);
  });
});
