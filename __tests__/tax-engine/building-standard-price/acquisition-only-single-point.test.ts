/**
 * 단일시점 모드(acquisitionOnly) anchor — PHD 건물 기준시가 계산 전용.
 * 계획서: docs/02-design/features/phd-building-std-modal-single-timepoint.plan.md
 *
 * acquisitionOnly의 valuation은 동일 입력 2시점 호출의 acquisition과 동일해야 한다(대칭 회귀).
 * ≥2001 일반 / ≤2000 §164⑤ acqBase 모두.
 */
import { describe, it, expect } from "vitest";
import { calcBuildingStandardPrice } from "@/lib/tax-engine/building-standard-price";
import type { BuildingStandardPriceInput } from "@/lib/tax-engine/types/building-standard-price.types";

const POINT = { structureKey: "rc", usageNo: 34, landPricePerM2: 3_500_000 };
const COMMON = { taxType: "transfer" as const, floorArea: 200, builtYear: 1998 };

function twoPointAcq(acqYear: number) {
  const input: BuildingStandardPriceInput = {
    ...COMMON,
    acquisitionYear: acqYear,
    transferYear: 2010,
    acquisition: POINT,
    transfer: { structureKey: "rc", usageNo: 34, landPricePerM2: 4_000_000 },
  };
  return calcBuildingStandardPrice(input);
}

function singlePoint(acqYear: number) {
  const input: BuildingStandardPriceInput = {
    ...COMMON,
    acquisitionOnly: true,
    acquisitionYear: acqYear,
    acquisition: POINT,
  };
  return calcBuildingStandardPrice(input);
}

describe("acquisitionOnly 단일시점 = 2시점 acquisition (대칭)", () => {
  it("≥2001(2003): valuation === 2시점 acquisition", () => {
    const single = singlePoint(2003);
    const two = twoPointAcq(2003);
    expect(single.valuation).toBeDefined();
    expect(single.transfer).toBeUndefined();
    expect(single.valuation!.standardPrice).toBe(two.acquisition!.standardPrice);
    expect(single.legalBasis).toBe(two.legalBasis); // transfer 근거 유지
  });

  it("≤2000(2000): §164⑤ acqBase 환산값 = 2시점 acquisition + acqBaseConversion 부착", () => {
    const single = singlePoint(2000);
    const two = twoPointAcq(2000);
    expect(single.valuation!.standardPrice).toBe(two.acquisition!.standardPrice);
    expect(single.acqBaseConversion).toBeDefined();
    expect(single.acqBaseConversion!.convertedTotal).toBe(single.valuation!.standardPrice);
  });

  it("복합·기계식은 단일시점 미지원(throw)", () => {
    expect(() =>
      calcBuildingStandardPrice({
        ...COMMON,
        acquisitionOnly: true,
        acquisitionYear: 2003,
        acquisition: POINT,
        isMechanicalParking: true,
        parkingLotCount: 10,
      }),
    ).toThrow();
  });
});
