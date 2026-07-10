/**
 * 감사 확정 결함 회귀 테스트
 * ref: general-building-converted-housing.ts:28 / :49 (integer-rounding)
 *
 * 결함: calcConvertedHousingPrice(line 28)와 applyConvertedHousingPriceOverride(line 49)가
 *       분자가 Number.MAX_SAFE_INTEGER(9.007e15)를 초과할 수 있는 곱셈을 부동소수 `*`로
 *       수행 → 오버플로 영역에서 floor 경계가 1원 어긋남. 형제 파일 general-building-extension.ts는
 *       동일 규모 안분에 safeMultiplyThenDivide(BigInt fallback)를 사용하는데 본 파일만 이탈.
 *
 * 기대값은 §99-164-10 환산주택가격 산식의 **정수(BigInt) 정확 floor**로 독립 도출:
 *   converted = floor(firstDisc × acqTotal / firstDiscTotal)
 *             = floor(1,438,937,212 × 3,665,346,385 / 1,755,512,643)
 *   분자 5,274,203,308,246,179,000 > 9.007e15 → double 정수 정확도 손실.
 *   BigInt 정확 floor = 3,004,366,461  (수정 전 float 경로 = 3,004,366,462, +1원 과대)
 */

import { describe, it, expect } from "vitest";
import {
  calcConvertedHousingPrice,
  applyConvertedHousingPriceOverride,
} from "@/lib/tax-engine/general-building-converted-housing";
import type { GeneralBuildingInput } from "@/lib/tax-engine/general-building-valuation";

// acqTotal = acqLandStd(2,000,000,000) + acqBuildingStd(1,665,346,385) = 3,665,346,385
// firstDiscTotal = 1,000,000,000 + 755,512,643 = 1,755,512,643
const OVERFLOW_INPUT: GeneralBuildingInput = {
  totalTransferPrice: 5_000_000_000,
  transferDate: new Date("2024-02-19"),
  acquisitionDate: new Date("1995-03-15"),
  landArea: 100,
  buildingArea: 300,
  buildingFootprintArea: 150,
  transferLandPricePerSqm: 40_000_000,
  transferBuildingStdPrice: 900_000_000,
  // 취득당시 기준시가 — acqLandStd = 20,000,000 × 100 = 2,000,000,000
  acquisitionLandPricePerSqm: 20_000_000,
  acquisitionBuildingStdPrice: 1_665_346_385,
  buildingAcquisitionCause: "purchase",
  // §99-164-10 4필드
  hasFirstDisclosure: true,
  firstDisclosurePrice: 1_438_937_212,
  firstDisclosureLandStdPrice: 1_000_000_000,
  firstDisclosureBuildingStdPrice: 755_512_643,
};

describe("audit-fix: §99-164-10 환산주택가격 BigInt 오버플로 절사 정확성", () => {
  it("calcConvertedHousingPrice — 분자 오버플로 시 정수 정확 floor (float +1원 방지)", () => {
    // BigInt 독립 도출: floor(1,438,937,212 × 3,665,346,385 / 1,755,512,643) = 3,004,366,461
    // 수정 전 float 경로는 3,004,366,462 (1원 과대) → 실패했음.
    expect(calcConvertedHousingPrice(OVERFLOW_INPUT)).toBe(3_004_366_461);
  });

  it("applyConvertedHousingPriceOverride — 자산별 안분도 정수 정확 floor", () => {
    // converted = 3,004,366,461
    // convertedLand = floor(3,004,366,461 × 2,000,000,000 / 3,665,346,385) = 1,639,335,629
    // convertedBuilding = 3,004,366,461 − 1,639,335,629 = 1,365,030,832  (float 경로 = 1,365,030,833)
    // acquisitionLandPricePerSqm = floor(1,639,335,629 / 100) = 16,393,356
    const overridden = applyConvertedHousingPriceOverride(OVERFLOW_INPUT);
    expect(overridden.acquisitionLandPricePerSqm).toBe(16_393_356);
    expect(overridden.acquisitionBuildingStdPrice).toBe(1_365_030_832);
  });

  it("소규모 입력(비오버플로) 회귀 0 — 기존 산식과 동일", () => {
    // landArea=100, acqLandPerSqm=300,000 → acqLandStd=30M, acqBuildingStd=14M → acqTotal=44M
    // firstDiscTotal=40M, firstDisc=100M → floor(100M × 44M / 40M) = 110,000,000
    const smallInput: GeneralBuildingInput = {
      ...OVERFLOW_INPUT,
      acquisitionLandPricePerSqm: 300_000,
      acquisitionBuildingStdPrice: 14_000_000,
      firstDisclosurePrice: 100_000_000,
      firstDisclosureLandStdPrice: 28_000_000,
      firstDisclosureBuildingStdPrice: 12_000_000,
    };
    expect(calcConvertedHousingPrice(smallInput)).toBe(110_000_000);
    const overridden = applyConvertedHousingPriceOverride(smallInput);
    // convertedLand = floor(110M × 30M / 44M) = 75,000,000 → /100 = 750,000
    expect(overridden.acquisitionLandPricePerSqm).toBe(750_000);
    expect(overridden.acquisitionBuildingStdPrice).toBe(35_000_000);
  });
});
