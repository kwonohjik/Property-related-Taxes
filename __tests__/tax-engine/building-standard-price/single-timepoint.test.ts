/**
 * 건물 기준시가 — 단일 시점 모드(`singleTimePoint`) anchor
 *
 * 계획서: docs/02-design/features/building-std-modal-single-timepoint.plan.md (§6 S1~S4)
 *
 * 모달 호출부가 한 시점 필드에만 값을 주입할 때(applyTimePoint) 반대 시점 입력을 강제하지 않는다.
 * ⚠️ 취득연도 == 양도연도이면 §164⑧ 환산이 우선 — 이 경우 단일 시점 분기를 타지 않고
 *    종전 2시점 경로(취득 입력 필수)로 간다.
 */
import { describe, it, expect } from "vitest";
import {
  calcBuildingStandardPrice,
  type BuildingStandardPriceInput,
} from "../../../lib/tax-engine/building-standard-price";

/** 2시점 완전 입력(회귀 비교 기준) — 취득 2015 / 양도 2025 */
const BOTH: BuildingStandardPriceInput = {
  taxType: "transfer",
  floorArea: 200,
  builtYear: 2010,
  acquisitionYear: 2015,
  transferYear: 2025,
  acquisition: { structureKey: "rc", usageNo: 1, landPricePerM2: 5_000_000 },
  transfer: { structureKey: "rc", usageNo: 1, landPricePerM2: 7_500_000 },
};

describe("S1 singleTimePoint='transfer' — 취득 입력 없이 양도만 산출", () => {
  it("취득 point·취득연도 없이도 throw 없이 transfer만 반환", () => {
    const r = calcBuildingStandardPrice({
      taxType: "transfer",
      floorArea: BOTH.floorArea,
      builtYear: BOTH.builtYear,
      transferYear: 2025,
      transfer: BOTH.transfer,
      singleTimePoint: "transfer",
    });
    expect(r.transfer).toBeDefined();
    expect(r.acquisition).toBeUndefined();
  });

  it("양도 breakdown이 2시점 모드와 동일 (취득 입력은 양도값에 영향 없음)", () => {
    const single = calcBuildingStandardPrice({
      taxType: "transfer",
      floorArea: BOTH.floorArea,
      builtYear: BOTH.builtYear,
      transferYear: 2025,
      transfer: BOTH.transfer,
      singleTimePoint: "transfer",
    });
    const both = calcBuildingStandardPrice(BOTH);
    expect(single.transfer?.pricePerM2).toBe(both.transfer?.pricePerM2);
    expect(single.transfer?.standardPrice).toBe(both.transfer?.standardPrice);
  });

  it("양도연도 미입력이면 오류 — silent fallback 금지", () => {
    expect(() =>
      calcBuildingStandardPrice({
        taxType: "transfer",
        floorArea: 200,
        builtYear: 2010,
        transfer: BOTH.transfer,
        singleTimePoint: "transfer",
      }),
    ).toThrow(/양도연도 필수/);
  });

  it("양도 point 미입력이면 오류", () => {
    expect(() =>
      calcBuildingStandardPrice({
        taxType: "transfer",
        floorArea: 200,
        builtYear: 2010,
        transferYear: 2025,
        singleTimePoint: "transfer",
      }),
    ).toThrow(/양도시/);
  });
});

describe("S2 singleTimePoint='acquisition' — 양도 입력 없이 취득만 산출", () => {
  it("양도 point·양도연도 없이도 throw 없이 acquisition만 반환", () => {
    const r = calcBuildingStandardPrice({
      taxType: "transfer",
      floorArea: BOTH.floorArea,
      builtYear: BOTH.builtYear,
      acquisitionYear: 2015,
      acquisition: BOTH.acquisition,
      singleTimePoint: "acquisition",
    });
    expect(r.acquisition).toBeDefined();
    expect(r.transfer).toBeUndefined();
  });

  it("취득 breakdown이 2시점 모드와 동일", () => {
    const single = calcBuildingStandardPrice({
      taxType: "transfer",
      floorArea: BOTH.floorArea,
      builtYear: BOTH.builtYear,
      acquisitionYear: 2015,
      acquisition: BOTH.acquisition,
      singleTimePoint: "acquisition",
    });
    const both = calcBuildingStandardPrice(BOTH);
    expect(single.acquisition?.pricePerM2).toBe(both.acquisition?.pricePerM2);
    expect(single.acquisition?.standardPrice).toBe(both.acquisition?.standardPrice);
  });

  // 취득 ≤2000 — §164⑤ 산정기준율 환산(2001 지수표 기준) + 계산서 ※표 echo 유지
  it("취득 ≤2000: acqBaseConversion echo가 2시점 모드와 동일", () => {
    const pre2001 = {
      taxType: "transfer" as const,
      floorArea: 200,
      builtYear: 1995,
      acquisitionYear: 1998,
      acquisition: { structureKey: "rc", usageNo: 1, landPricePerM2: 1_000_000 },
    };
    const single = calcBuildingStandardPrice({ ...pre2001, singleTimePoint: "acquisition" });
    const both = calcBuildingStandardPrice({
      ...pre2001,
      transferYear: 2025,
      transfer: BOTH.transfer,
    });
    expect(single.acqBaseConversion).toBeDefined();
    expect(single.acqBaseConversion).toEqual(both.acqBaseConversion);
    expect(single.acquisition?.standardPrice).toBe(both.acquisition?.standardPrice);
  });

  it("취득연도 미입력이면 오류", () => {
    expect(() =>
      calcBuildingStandardPrice({
        taxType: "transfer",
        floorArea: 200,
        builtYear: 2010,
        acquisition: BOTH.acquisition,
        singleTimePoint: "acquisition",
      }),
    ).toThrow(/취득연도 필수/);
  });
});

describe("S3 §164⑧ 동일연도 — singleTimePoint='transfer'라도 2시점 경로 유지", () => {
  const SAME_YEAR = {
    taxType: "transfer" as const,
    floorArea: 200,
    builtYear: 2010,
    acquisitionYear: 2025,
    transferYear: 2025,
    acquisition: { structureKey: "rc", usageNo: 1, landPricePerM2: 7_000_000 },
    holdingMonths: 6,
    adjustMonths: 12,
    sameYearFormula: "prev" as const,
    prevLandPricePerM2: 6_500_000,
  };

  it("동일연도이면 §164⑧ 환산이 적용되고 취득 결과도 함께 반환", () => {
    const r = calcBuildingStandardPrice({ ...SAME_YEAR, singleTimePoint: "transfer" });
    expect(r.sameYearAdjusted).toBe(true);
    expect(r.acquisition).toBeDefined();
    expect(r.transfer).toBeDefined();
  });

  it("동일연도 결과가 singleTimePoint 미지정과 완전 동일", () => {
    const withFlag = calcBuildingStandardPrice({ ...SAME_YEAR, singleTimePoint: "transfer" });
    const without = calcBuildingStandardPrice(SAME_YEAR);
    expect(withFlag.transfer?.standardPrice).toBe(without.transfer?.standardPrice);
    expect(withFlag.acquisition?.standardPrice).toBe(without.acquisition?.standardPrice);
  });

  // 동일연도는 양도값이 취득값에서 파생 → 취득 입력을 생략할 수 없다(입력 강제가 정당한 유일 케이스)
  it("동일연도 + 취득 point 미입력이면 오류 (단일 시점으로 우회 불가)", () => {
    const { acquisition: _drop, ...noAcq } = SAME_YEAR;
    expect(() =>
      calcBuildingStandardPrice({ ...noAcq, singleTimePoint: "transfer" }),
    ).toThrow(/취득시/);
  });
});

describe("S4 하위호환 — singleTimePoint 미지정은 현행 동작 불변", () => {
  it("2시점 전부 반환", () => {
    const r = calcBuildingStandardPrice(BOTH);
    expect(r.acquisition).toBeDefined();
    expect(r.transfer).toBeDefined();
  });

  it("취득 입력 누락 시 종전대로 오류", () => {
    const { acquisition: _drop, ...noAcq } = BOTH;
    expect(() => calcBuildingStandardPrice(noAcq)).toThrow(/취득시/);
  });

  // 복합구조·기계식주차는 별도 반환 경로 — 플래그가 있어도 2시점 경로를 그대로 탄다
  it("기계식주차는 singleTimePoint를 무시하고 2시점 반환", () => {
    const r = calcBuildingStandardPrice({
      taxType: "transfer",
      floorArea: 0,
      builtYear: 2020,
      acquisitionYear: 2015,
      transferYear: 2025,
      isMechanicalParking: true,
      parkingLotCount: 50,
      singleTimePoint: "transfer",
    });
    expect(r.acquisition).toBeDefined();
    expect(r.transfer).toBeDefined();
  });
});
