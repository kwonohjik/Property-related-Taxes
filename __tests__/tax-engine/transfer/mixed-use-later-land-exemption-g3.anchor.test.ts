/**
 * anchor — 겸용주택 1세대1주택: 주택보다 **나중에** 취득한 부수토지가 보유요건 미만이면 그 토지분은 비과세에서 뺀다.
 *
 * 「소득세법 시행령」 §154① — 비과세 보유기간은 「해당 주택」의 보유기간이고, 나중에 취득한 부수토지는 그 토지를 취득한 날부터
 * 센다. 분리취득 경로(G-3 · `split-part-rate.anchor` A-12b·A-12c)와 같은 규칙·같은 술어(`isLaterAcquiredLandHeldTooShort` ·
 * 수용 단서 5A `landCoveredByExpropriationProviso`). 종전 겸용 엔진은 보유요건을 건물 취득일 하나로만 판정해 나중 토지도
 * 통째로 비과세했다(10억 → 세액 0).
 *  - 주택분 토지는 12억 비과세·안분 없이 전액 과세(보유 2년 미만이라 장특 0). 12억 초과면 건물분만 안분한다.
 *  - §154③ 본문으로 주택이 된 상가 부분도 그 토지분은 과세한다 — 세율은 상가 토지 파트 그대로(§154③은 §89①3호 적용 규정).
 * 건물 2021-06-01 · 토지 2023-10-01 · 양도 2024-06-01 · 주택 150㎡ > 상가 100㎡.
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTaxIdN as calc } from "../_helpers/mixed-use-identity-std";
import { makeMockRates } from "../_helpers/mock-rates";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const rates = makeMockRates();
const TD = new Date("2024-06-01");
const D = (s: string) => new Date(s);
const LATER_NOTICE = "주택보다 나중에 취득한 부수토지";

function asset(over: Partial<MixedUseAssetInput> = {}): MixedUseAssetInput {
  return {
    isMixedUseHouse: true,
    residentialFloorArea: 150,
    nonResidentialFloorArea: 100,
    buildingFootprintArea: 100,
    totalLandArea: 200,
    landAcquisitionDate: D("2023-10-01"),
    buildingAcquisitionDate: D("2021-06-01"),
    transferStandardPrice: { housingPrice: 500_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 2_000_000 },
    acquisitionStandardPrice: {
      housingPrice: 350_000_000,
      commercialBuildingPrice: 80_000_000,
      landPricePerSqm: 1_500_000,
      landPricePerSqmAtBuildingAcq: 1_400_000,
    },
    residencePeriodYears: 3,
    isMetropolitanArea: true,
    zoneType: "residential",
    isOneHouseExempt: true,
    ...over,
  };
}

const expropriation = (businessApprovalDate: string) => ({
  oneHouseExemptionProviso: {
    reason: "expropriation" as const,
    businessApprovalDate: D(businessApprovalDate),
    expropriationDate: D("2024-05-01"),
  },
});

describe("겸용주택 1세대1주택 — 나중 취득 부수토지 보유요건 미만분 비과세 제외", () => {
  it("10억 · 토지 2023-10(보유 8개월) → 주택 토지분·상가(주택 의제) 토지분 과세 (종전 0)", () => {
    const r = calc(1_000_000_000, TD, asset(), rates);
    expect(r.housingPart.incomeAmount).toBe(r.housingPart.landTransferGain);
    expect(r.housingPart.incomeAmount).toBe(73_547_369);
    expect(r.commercialPart.deemedHouseBy154_3Main).toBe(true);
    expect(r.commercialPart.incomeAmount).toBe(49_031_579);
    expect(r.total.determinedTax).toBe(74_248_947);
    expect(r.warnings.some((w) => w.includes(LATER_NOTICE))).toBe(true);
  });

  it("대조: 토지·건물 같은 날 → 전부 비과세(불변)", () => {
    const r = calc(1_000_000_000, TD, asset({ landAcquisitionDate: D("2021-06-01") }), rates);
    expect(r.total.determinedTax).toBe(0);
    expect(r.warnings.some((w) => w.includes(LATER_NOTICE))).toBe(false);
  });

  it("경계 짝: 나중 토지도 보유 2년 이상(2022-01-01) → 비과세(불변)", () => {
    const r = calc(1_000_000_000, TD, asset({ landAcquisitionDate: D("2022-01-01") }), rates);
    expect(r.total.determinedTax).toBe(0);
  });

  it("5A: 수용 단서 — 사업인정 고시일(2024-01-01) 전에 취득한 토지 → 보유요건을 받지 않아 비과세", () => {
    const r = calc(1_000_000_000, TD, asset(expropriation("2024-01-01")), rates);
    expect(r.total.determinedTax).toBe(0);
  });

  it("5A 짝: 고시일(2023-06-01) 뒤에 취득한 토지는 괄호 밖 → 과세", () => {
    const r = calc(1_000_000_000, TD, asset(expropriation("2023-06-01")), rates);
    expect(r.total.determinedTax).toBe(74_248_947);
  });

  it("25억 고가주택 → 주택 토지분 전액 + 건물분만 12억 안분 (종전 143,240,085)", () => {
    const r = calc(2_500_000_000, TD, asset(), rates);
    // 토지 191,968,422 전액 + 건물 251,118,947 안분분
    expect(r.housingPart.proratedTaxableGain).toBe(259_870_985);
    // 장특은 건물 안분분에만(토지 보유 8개월 → 0)
    expect(r.housingPart.longTermDeductionAmount).toBe(16_296_615);
    expect(r.total.determinedTax).toBe(241_282_198);
  });

  it("§154③ 단서(상가 ≥ 주택) → 주택 토지분만 추가 과세 (종전 33,523,028)", () => {
    const r = calc(1_000_000_000, TD, asset({ residentialFloorArea: 100, nonResidentialFloorArea: 150 }), rates);
    expect(r.housingPart.incomeAmount).toBe(44_019_048);
    expect(r.total.determinedTax).toBe(63_836_361);
  });

  it("부정 짝: 1세대1주택 비과세 요건 미충족 → 원래 전액 과세라 불변", () => {
    const r = calc(1_000_000_000, TD, asset({ isOneHouseExempt: false }), rates);
    expect(r.total.determinedTax).toBe(140_299_972);
    expect(r.warnings.some((w) => w.includes(LATER_NOTICE))).toBe(false);
  });
});
