/**
 * 사례 35 후속-1 — §99-164-10 환산주택가격 anchor 테스트
 *
 * 산식:
 *   환산주택가격 = 최초공시주택가격
 *                × (취득당시 토지기준시가 + 취득당시 건물기준시가)
 *                ÷ (최초공시 당시 토지기준시가 + 최초공시 당시 건물기준시가)
 *
 * 가상 케이스 F1 (Plan §2):
 *   최초공시주택가격 100,000,000
 *   최초공시 토지 28,000,000 + 건물 12,000,000 = 40,000,000
 *   취득당시 토지 30,000,000 + 건물 14,000,000 = 44,000,000
 *   → 환산주택가격 = 100M × 44M ÷ 40M = 110,000,000
 *
 *   자산별 안분 (취득당시 기준시가 비율):
 *   토지 환산 = 110M × 30/44 = 75,000,000
 *   건물 환산 = 110M − 75M = 35,000,000
 */

import { describe, it, expect } from "vitest";
import {
  calcConvertedHousingPrice,
  applyConvertedHousingPriceOverride,
} from "@/lib/tax-engine/general-building-converted-housing";
import type { GeneralBuildingInput } from "@/lib/tax-engine/general-building-valuation";

const BASE_INPUT: GeneralBuildingInput = {
  totalTransferPrice: 800_000_000,
  transferDate: new Date("2024-02-19"),
  acquisitionDate: new Date("1995-03-15"),
  landArea: 85,
  buildingArea: 180,
  buildingFootprintArea: 90,
  transferLandPricePerSqm: 10_830_000,
  transferBuildingStdPrice: 20_629_440,
  // 취득당시
  acquisitionLandPricePerSqm: 352_941,        // 30,000,000 / 85 = 352,941.176... → floor 352941
  acquisitionBuildingStdPrice: 14_000_000,
  buildingAcquisitionCause: "purchase",
  // 신규 §99-164-10 4필드
  hasFirstDisclosure: true,
  firstDisclosurePrice: 100_000_000,
  firstDisclosureLandStdPrice: 28_000_000,
  firstDisclosureBuildingStdPrice: 12_000_000,
};

describe("사례 35 후속-1: §99-164-10 환산주택가격", () => {
  it("F1-1: 환산주택가격 산식 = 100M × 44M ÷ 40M = 110M (acqLandPerSqm=352,941 → landTotal=29,999,985)", () => {
    // 실제 acqLandStd = 352,941 × 85 = 29,999,985 (floor 단가 사용으로 미세 손실 15)
    // acqTotal = 29,999,985 + 14,000,000 = 43,999,985
    // 환산 = floor(100,000,000 × 43,999,985 / 40,000,000) = floor(109,999,962.5) = 109,999,962
    const converted = calcConvertedHousingPrice(BASE_INPUT);
    expect(converted).toBe(109_999_962);
  });

  it("F1-1b: 정확 단가 환경(acqLandTotal=30M으로 round-trip 가능한 경우) → 110,000,000", () => {
    // landArea=100, acqLandPerSqm=300_000 → acqLandTotal = 30M 정확
    const input: GeneralBuildingInput = {
      ...BASE_INPUT,
      landArea: 100,
      acquisitionLandPricePerSqm: 300_000,
    };
    expect(calcConvertedHousingPrice(input)).toBe(110_000_000);
  });

  it("F1-2: applyConvertedHousingPriceOverride — 자산별 안분 후 acquisition*StdPrice override", () => {
    const input: GeneralBuildingInput = {
      ...BASE_INPUT,
      landArea: 100,
      acquisitionLandPricePerSqm: 300_000,
    };
    const overridden = applyConvertedHousingPriceOverride(input);
    // 환산 110M / acqTotal 44M
    //   convertedLand = floor(110M × 30M / 44M) = floor(75,000,000) = 75,000,000
    //   convertedBuilding = 110M − 75M = 35,000,000
    //   landPerSqm = floor(75M / 100) = 750,000
    expect(overridden.acquisitionLandPricePerSqm).toBe(750_000);
    expect(overridden.acquisitionBuildingStdPrice).toBe(35_000_000);
  });

  it("F1-4: hasFirstDisclosure=false → input 그대로 반환 (회귀 0)", () => {
    const input: GeneralBuildingInput = { ...BASE_INPUT, hasFirstDisclosure: false };
    const result = applyConvertedHousingPriceOverride(input);
    expect(result).toBe(input); // 참조 동일
  });

  it("F1-4b: hasFirstDisclosure=undefined → input 그대로 반환", () => {
    const { hasFirstDisclosure: _, ...rest } = BASE_INPUT;
    void _;
    const result = applyConvertedHousingPriceOverride(rest as GeneralBuildingInput);
    expect(result.acquisitionLandPricePerSqm).toBe(rest.acquisitionLandPricePerSqm);
    expect(result.acquisitionBuildingStdPrice).toBe(rest.acquisitionBuildingStdPrice);
  });

  it("F1-5: 최초공시 합계 0 → 입력 그대로 (방어)", () => {
    const input: GeneralBuildingInput = {
      ...BASE_INPUT,
      firstDisclosureLandStdPrice: 0,
      firstDisclosureBuildingStdPrice: 0,
    };
    expect(calcConvertedHousingPrice(input)).toBe(0);
    const result = applyConvertedHousingPriceOverride(input);
    // converted=0이면 override 하지 않고 input 그대로
    expect(result.acquisitionLandPricePerSqm).toBe(input.acquisitionLandPricePerSqm);
  });
});
