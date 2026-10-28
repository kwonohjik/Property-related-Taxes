/**
 * anchor: 기본통칙 95-0…1 — **건물만 본인(`building_only`)과 파트 합 불일치는 통칙·파트별 산식 밖**이다(현재 한계를 고정한다).
 *
 * 본인이 건물만 소유하면 토지 파트가 없어 통칙 비교 대상이 없다. 합 일치 방어도 그대로다.
 * **토지만 본인(`land_only`)은 이 한계에서 빠졌다** — 같은 세대면 소유자 같음과 같은 통칙·파트별 산식을 탄다
 * (부동산거래관리과-622 · 재산세제과-1183, 계획서 `land-only-lthd-rate-basis.plan.md` Q-1 a). 종전에는 이 파일이 그 «적용하지 않음»을 고정했다.
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

describe("일반 split 경로 — 건물만 본인은 통칙 밖 · 토지만 본인은 통칙 적용", () => {
  it("land_only(같은 세대) — 통칙 적용: max(표1 토지 15년 30%, 표2 주택 9년 보유 36% + 거주 20% = 56%) = 56%, 통칙 echo·고지 있음 (종전 토지 15년 표2 60%)", () => {
    const r = calculateTransferTax(house({ selfOwns: "land_only" }), rates);
    const sd = r.splitDetail!;
    expect(sd.selfOwns).toBe("land_only");
    expect(r.isExempt).toBe(false);
    expect(sd.land.longTermRate).toBeCloseTo(0.56, 12);
    expect(sd.land.appurtenantLthd?.table1Applied).toBe(false);
    expect(hasNotice(r)).toBe(true);
    // 소유하지 않은 건물 파트는 공제 0
    expect(sd.building.longTermDeduction).toBe(0);
    expect(sd.land.longTermDeduction).toBe(mulDiv(sd.land.taxableGainAfterProration ?? sd.land.gain, 56, 100));
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

describe("§155⑳ 경로 — 건물만 본인은 종전 단일 보유연수(건물 취득일) · 토지만 본인은 토지 파트 통칙", () => {
  it("land_only(건물 양도차익 0) — 토지 파트만 파트별 산식: 표1 토지 15년 30% · 표2 주택 9년 보유 36% + 거주 20% = 56% → 통칙 56%, 건물 파트 0", () => {
    const r = calculateTransferTax(house({ selfOwns: "land_only", buildingGainZero: true, rentalHousingException: rentalA }), rates);
    const t = r.rentalHousingExceptionDetail!;
    expect(t.applied).toBe(true);
    const parts = t.formulaTrace.partsLthd!;
    // 토지 양도차익 1,400,000,000(양도가 16억 − 취득가 2억)
    expect([parts.land.gain, parts.land.holdYears, parts.land.rateTable1, parts.land.rateTable2]).toEqual([1_400_000_000, 15, 0.3, 0.56]);
    expect(parts.land.appurtenant?.table1Applied).toBe(false);
    expect(parts.building.gain).toBe(0);
    expect(t.formulaTrace.gain95Table2).toBe(1_400_000_000 - mulDiv(1_400_000_000, 56, 100));
    expect(hasNotice(r)).toBe(true);
  });

  it("building_only(토지 양도차익 0) — partsLthd 없음 · 종전 단일 56%", () => {
    const r = calculateTransferTax(house({ selfOwns: "building_only", landAcquisitionPrice: 1_600_000_000, rentalHousingException: rentalA }), rates);
    const t = r.rentalHousingExceptionDetail!;
    expect(t.applied).toBe(true);
    expect(t.formulaTrace.partsLthd).toBeUndefined();
    expect(t.formulaTrace.gain95Table2).toBe(300_000_000 - mulDiv(300_000_000, 56, 100));
  });
});

describe("buildRentalLthdParts — 두 방어를 각각 단독으로 가른다 (합 일치 · 건물만 본인)", () => {
  const sd = (selfOwns: SplitGainResult["selfOwns"], landGain: number, buildingGain: number): SplitGainResult =>
    ({
      land: { gain: landGain, holdingYears: 15 }, building: { gain: buildingGain, holdingYears: 9 },
      selfOwns, note: "",
    }) as unknown as SplitGainResult;

  it("정상 — 본인이 두 파트를 소유하고 합이 맞으면 파트를 만든다(토지가 오래돼 통칙 연수 포함)", () => {
    const p = buildRentalLthdParts({ splitDetail: sd("both", 1000, 500), nonBusinessGain: 100, housingGain: 1400 });
    expect(p).toEqual({ land: { gain: 900, holdYears: 15, houseHoldYears: 9 }, building: { gain: 500, holdYears: 9 } });
  });

  it("건물만 본인 방어 — 합이 맞아도 만들지 않는다(통칙의 비교 대상 토지 파트가 본인 것이 아니다)", () => {
    expect(buildRentalLthdParts({ splitDetail: sd("building_only", 0, 500), nonBusinessGain: 0, housingGain: 500 })).toBeUndefined();
  });

  it("토지만 본인 — 토지 파트만 만든다(건물 파트 양도차익 0 · 토지가 오래돼 통칙 연수 포함), 합 일치 방어는 그대로", () => {
    expect(buildRentalLthdParts({ splitDetail: sd("land_only", 1000, 0), nonBusinessGain: 0, housingGain: 1000 }))
      .toEqual({ land: { gain: 1000, holdYears: 15, houseHoldYears: 9 }, building: { gain: 0, holdYears: 9 } });
    // 건물 양도차익이 남아 있어도 본인 소유가 아니라 0으로 본다 — 합 일치는 land + 0 = housingGain
    expect(buildRentalLthdParts({ splitDetail: sd("land_only", 1000, 500), nonBusinessGain: 0, housingGain: 1000 })).toBeDefined();
    expect(buildRentalLthdParts({ splitDetail: sd("land_only", 1000, 0), nonBusinessGain: 0, housingGain: 1001 })).toBeUndefined();
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
