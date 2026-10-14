/**
 * anchor: 기본통칙 95-0…1 — **소유자 분리(`selfOwns` ≠ both)와 파트 합 불일치는 통칙·파트별 산식 밖**이다(현재 한계를 고정한다).
 *
 * 본인이 토지 또는 건물 한쪽만 소유하면 «주택(건물)보다 보유기간이 오래된 부수토지»의 비교 대상(주택 보유연수)이 본인 파트가 아니고,
 * §155⑳ 경로와 일반 경로 중 어느 쪽 값이 정본인지 근거가 부족하다 — 통칙은 적용하지 않고 종전 값을 그대로 둔다(결과 고지도 내지 않는다).
 * 이 anchor는 그 «적용하지 않음»을 고정한다. 통일은 별도 결정 대상이다.
 *
 * 기대값은 독립 정수 산식이다(엔진 출력 복사 아님).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { buildRentalLthdParts } from "@/lib/tax-engine/transfer-tax-rental-housing-lthd-parts";
import type { SplitGainResult } from "@/lib/tax-engine/types/transfer-split-gain.types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const mulDiv = (a: number, b: number, c: number): number => Number((BigInt(a) * BigInt(b)) / BigInt(c));
const hasNotice = (r: { warnings?: string[] }) => (r.warnings ?? []).some((w) => w.includes("토지가 주택보다 먼저 취득돼"));

const rentalA: NonNullable<TransferTaxInput["rentalHousingException"]> = {
  applyException: true,
  scenario: "A",
  rentalUnits: [
    {
      businessRegistrationDate: D("2018-06-01"), rentalRegistrationDate: D("2018-06-01"),
      rentalCategory: "long_general" as const, rentalAcquisitionType: "purchase" as const, isApartment: false,
      region: "non-metro" as const, isExcluded918Rule: false, standardPriceAtRentalStart: 250_000_000,
      hasMinimum2Units: false, rentalMonths: 96, rentalAutoTermination: false, requirementsConfirmed: true,
    },
  ],
};

/** 토지 2008-07-01 · 건물 2014-09-01 · 양도 2024-06-01 · 거주 60개월(토지 15년 · 건물 9년) — 토지 80% : 건물 20% 양도가. */
function house(over: Partial<TransferTaxInput> & { buildingGainZero?: boolean }): TransferTaxInput {
  const S = 2_000_000_000;
  const landP = 1_600_000_000;
  const bldP = S - landP;
  return baseTransferInput({
    propertyType: "housing", transferPrice: S, acquisitionPrice: 300_000_000,
    landTransferPrice: landP, buildingTransferPrice: bldP,
    landStandardPriceAtTransfer: landP, buildingStandardPriceAtTransfer: bldP,
    landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: over.buildingGainZero ? bldP : 100_000_000,
    acquisitionDate: D("2014-09-01"), landAcquisitionDate: D("2008-07-01"), transferDate: D("2024-06-01"),
    isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    buildingFootprintArea: 60, acquisitionArea: 300, appurtenantLandZone: "non_urban" as const,
    residencePeriodMonths: 60, isOneHousehold: true, householdHousingCount: 1, expenses: 0, annualBasicDeductionUsed: 0,
    ...over,
  } as Partial<TransferTaxInput>);
}

describe("일반 split 경로 — 소유자 분리는 통칙 미적용 (종전 값: 토지 자신의 보유연수 표2)", () => {
  it("land_only — 토지분 = 토지 15년 표2(보유 40% + 거주 20% = 60%), 통칙 echo·고지 없음 (통칙 적용 시 56%)", () => {
    const r = calculateTransferTax(house({ selfOwns: "land_only" }), rates);
    const sd = r.splitDetail!;
    expect(sd.selfOwns).toBe("land_only");
    expect(r.isExempt).toBe(false);
    expect(sd.land.longTermRate).toBeCloseTo(0.6, 12);
    expect(sd.land.appurtenantLthd).toBeUndefined();
    expect(hasNotice(r)).toBe(false);
    // 소유하지 않은 건물 파트는 공제 0
    expect(sd.building.longTermDeduction).toBe(0);
    expect(sd.land.longTermDeduction).toBe(mulDiv(sd.land.taxableGainAfterProration ?? sd.land.gain, 60, 100));
  });

  it("building_only — 건물분 = 건물 9년 표2 56%, 소유하지 않은 토지 파트는 공제율·공제액 0 (토지 echo·통칙 없음)", () => {
    const r = calculateTransferTax(house({ selfOwns: "building_only" }), rates);
    const sd = r.splitDetail!;
    expect(sd.selfOwns).toBe("building_only");
    expect(r.isExempt).toBe(false);
    expect(sd.land.longTermRate).toBe(0);
    expect(sd.land.longTermDeduction).toBe(0);
    expect(sd.land.appurtenantLthd).toBeUndefined();
    expect(sd.building.longTermRate).toBeCloseTo(0.56, 12);
    expect(hasNotice(r)).toBe(false);
  });
});

describe("§155⑳ 경로 — 소유자 분리는 종전 단일 보유연수(건물 취득일), 파트 echo 없음", () => {
  it("land_only(건물 양도차익 0 — 파트 합이 맞아 합 일치 방어를 우회하는 시료) — partsLthd 없음 · 종전 단일 56%", () => {
    const r = calculateTransferTax(house({ selfOwns: "land_only", buildingGainZero: true, rentalHousingException: rentalA }), rates);
    const t = r.rentalHousingExceptionDetail!;
    expect(t.applied).toBe(true);
    expect(t.formulaTrace.partsLthd).toBeUndefined();
    // 종전: 주택분 전체에 건물 취득일 기준 9년 56% 하나 — 토지 양도차익 1,400,000,000
    expect(t.formulaTrace.gain95Table2).toBe(1_400_000_000 - mulDiv(1_400_000_000, 56, 100));
    expect(hasNotice(r)).toBe(false);
  });

  it("building_only(토지 양도차익 0) — partsLthd 없음 · 종전 단일 56%", () => {
    const r = calculateTransferTax(house({ selfOwns: "building_only", landAcquisitionPrice: 1_600_000_000, rentalHousingException: rentalA }), rates);
    const t = r.rentalHousingExceptionDetail!;
    expect(t.applied).toBe(true);
    expect(t.formulaTrace.partsLthd).toBeUndefined();
    expect(t.formulaTrace.gain95Table2).toBe(300_000_000 - mulDiv(300_000_000, 56, 100));
  });
});

describe("buildRentalLthdParts — 두 방어를 각각 단독으로 가른다 (합 일치 · 소유자 분리)", () => {
  const sd = (selfOwns: SplitGainResult["selfOwns"], landGain: number, buildingGain: number): SplitGainResult =>
    ({
      land: { gain: landGain, holdingYears: 15 }, building: { gain: buildingGain, holdingYears: 9 },
      selfOwns, note: "",
    }) as unknown as SplitGainResult;

  it("정상 — 본인이 두 파트를 소유하고 합이 맞으면 파트를 만든다(토지가 오래돼 통칙 연수 포함)", () => {
    const p = buildRentalLthdParts({ splitDetail: sd("both", 1000, 500), nonBusinessGain: 100, housingGain: 1400 });
    expect(p).toEqual({ land: { gain: 900, holdYears: 15, houseHoldYears: 9 }, building: { gain: 500, holdYears: 9 } });
  });

  it("소유자 분리 방어 — 합이 맞아도(건물 양도차익 0) 한쪽만 소유하면 만들지 않는다", () => {
    expect(buildRentalLthdParts({ splitDetail: sd("land_only", 1000, 0), nonBusinessGain: 0, housingGain: 1000 })).toBeUndefined();
    expect(buildRentalLthdParts({ splitDetail: sd("building_only", 0, 500), nonBusinessGain: 0, housingGain: 500 })).toBeUndefined();
  });

  it("합 일치 방어 — 두 파트를 소유해도 파트 합 ≠ 주택분 양도차익이면 종전 단일 산식으로 후퇴한다(1원 어긋나도)", () => {
    expect(buildRentalLthdParts({ splitDetail: sd("both", 1000, 500), nonBusinessGain: 0, housingGain: 1501 })).toBeUndefined();
    expect(buildRentalLthdParts({ splitDetail: sd("both", 1000, 500), nonBusinessGain: 100, housingGain: 1400 })).toBeDefined();
    expect(buildRentalLthdParts({ splitDetail: sd("both", 1000, 500), nonBusinessGain: 100, housingGain: 1399 })).toBeUndefined();
  });

  it("분리 계산 없음(단일 자산)이면 만들지 않는다", () => {
    expect(buildRentalLthdParts({ splitDetail: undefined, nonBusinessGain: 0, housingGain: 1000 })).toBeUndefined();
  });
});
