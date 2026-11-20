/**
 * anchor — 겸용주택 주택분 부수토지 배율 초과분의 공익수용 의제·유예 (NBL2611-C5 · 리뷰 §12.4 1번)
 *
 * ## 결함 (수정 전 master ffa74074b — FAIL)
 * C4(#3499)가 «파트 규칙 leaf»를 다른 주택 입구(G-2·동일일 분리·§155⑳·함께 양도 주택 카드)와 일반건물·상가에 연결했으나 겸용주택은 남겼다.
 * 겸용 `buildNonBusinessPart`는 가산율을 위기취득(V4-HS01)만 보고 정해, 수용 무조건 의제(영 §168의14③3호)·유예(①)가 성립해도 초과분 파트에 +10%p를 얹었다.
 * 같은 사실을 단일 주택 G-2에 넣으면 의제가 성립한다(경로 간 불일치).
 *
 * ## 설계
 * 초과분은 비과세가 아니라 분리·전액 과세다(겸용 엔진은 이미 그렇게 한다 — 초과분이 비과세로 새지 않는다). 의제는 «비사업용 토지 여부»만 바꾸므로 파트는 그대로 두고 가산율만 0이다.
 * 고시일·유예 미입력은 차단하지 않는다 — 의제 불성립 + 확인 필요 고지.
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTaxIdN as calcMixedUseTransferTax } from "../_helpers/mixed-use-identity-std";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateProgressiveTax } from "@/lib/tax-engine/tax-utils";
import { NBL_EXPROPRIATION_NOTICE_DATE_MISSING_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const TD = D("2024-06-01");
const BRACKETS = [
  { min: 0, max: 14_000_000, rate: 0.06, deduction: 0 },
  { min: 14_000_001, max: 50_000_000, rate: 0.15, deduction: 1_260_000 },
  { min: 50_000_001, max: 88_000_000, rate: 0.24, deduction: 5_760_000 },
  { min: 88_000_001, max: 150_000_000, rate: 0.35, deduction: 15_440_000 },
  { min: 150_000_001, max: 300_000_000, rate: 0.38, deduction: 19_940_000 },
  { min: 300_000_001, max: 500_000_000, rate: 0.4, deduction: 25_940_000 },
  { min: 500_000_001, max: 1_000_000_000, rate: 0.42, deduction: 35_940_000 },
  { min: 1_000_000_001, rate: 0.45, deduction: 65_940_000 },
];

/** §154③ 본문(주택 150 > 상가 100) · 1세대1주택 · 10억 → 주택·상가 비과세, 초과 100㎡(400 − 100×3)만 비사업용 파트로 과세 */
function asset(acq: string, over: Partial<MixedUseAssetInput> = {}): MixedUseAssetInput {
  return {
    isMixedUseHouse: true,
    residentialFloorArea: 150,
    nonResidentialFloorArea: 100,
    buildingFootprintArea: 100,
    totalLandArea: 400,
    landAcquisitionDate: D(acq),
    buildingAcquisitionDate: D(acq),
    transferStandardPrice: { housingPrice: 500_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 2_000_000 },
    acquisitionStandardPrice: { housingPrice: 350_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_500_000 },
    residencePeriodYears: 10,
    isMetropolitanArea: true,
    zoneType: "residential",
    isOneHouseExempt: true,
    ...over,
  };
}
const expro = (notice: string | undefined, over: Partial<MixedUseAssetInput> = {}): Partial<MixedUseAssetInput> => ({
  transferCause: "public_expropriation",
  ...(notice ? { appurtenantExcessFacts: { expropriationNoticeDate: D(notice) } } : {}),
  ...over,
});
const run = (a: MixedUseAssetInput) => calcMixedUseTransferTax(1_000_000_000, TD, a, rates);
/** 독립 oracle — 파트 하나만 과세되는 시나리오(주택·상가는 비과세): 소득금액 − 기본공제 → 누진 + 가산율. */
const oracleTax = (income: number, add: number) => {
  const base = Math.max(0, income - 2_500_000);
  return calculateProgressiveTax(base, BRACKETS) + Math.floor(base * add);
};

describe("C5-1 — 수용 의제(영 §168의14③3호): 초과분 파트에 +10%p가 없다", () => {
  it("🔴 고시 2019-01-01 · 취득 2015-06-01(2년 이전 구간 — 사전-2023-법규재산-0142) → 의제 성립 · 가산 0", () => {
    const r = run(asset("2015-06-01", expro("2019-01-01")));
    const nb = r.nonBusinessLandPart!;
    expect(nb.excessArea).toBe(100);
    expect(r.housingPart.incomeAmount).toBe(0);
    expect(r.commercialPart.incomeAmount).toBe(0);
    expect(nb.deemedBusiness?.reason).toBe("public_expropriation");
    expect(nb.additionalRate).toBe(0);
    expect(r.total.transferTax).toBe(oracleTax(nb.incomeAmount, 0));
    // 실측(mock 세율): 수정 전 8,906,243(소득금액 43,164,978 − 기본공제 250만 = 40,664,978 → 누진 4,839,746 + 10%p 4,066,497) → 수정 후 4,839,746.
    expect(nb.incomeAmount).toBe(43_164_978);
    expect(r.total.transferTax).toBe(4_839_746);
  });

  it("독립 검산 — 같은 초과분을 «일반 토지 한 자산»으로 넣은 단건 엔진 값과 같다", () => {
    const r = run(asset("2015-06-01", expro("2019-01-01")));
    const nb = r.nonBusinessLandPart!;
    const land = calculateTransferTax(
      baseTransferInput({
        propertyType: "land",
        transferPrice: 100_000_000 + nb.transferGain,
        acquisitionPrice: 100_000_000,
        expenses: 0,
        acquisitionDate: D("2015-06-01"),
        transferDate: TD,
        isNonBusinessLand: false,
        isOneHousehold: false,
        householdHousingCount: 0,
      }),
      rates,
    );
    expect(r.total.transferTax).toBe(land.calculatedTax);
  });

  it("대조 — 고시일 미입력: 의제 불성립(+10%p 유지) + «확인 필요» 고지, 차단하지 않는다", () => {
    const r = run(asset("2015-06-01", expro(undefined)));
    const nb = r.nonBusinessLandPart!;
    expect(nb.additionalRate).toBe(0.1);
    expect(nb.deemedBusiness).toBeUndefined();
    expect(r.total.transferTax).toBe(oracleTax(nb.incomeAmount, 0.1));
    expect(r.warnings).toContain(NBL_EXPROPRIATION_NOTICE_DATE_MISSING_NOTICE);
  });

  it("대조 — 취득이 고시일 2년 이내(취득 2018-06-01 · 고시 2019-01-01)면 의제 불성립", () => {
    const nb = run(asset("2018-06-01", expro("2019-01-01"))).nonBusinessLandPart!;
    expect(nb.additionalRate).toBe(0.1);
    expect(nb.deemedBusiness).toBeUndefined();
  });

  it("대조 — 양도원인이 수용이 아니면 고시일이 있어도 읽지 않는다", () => {
    const nb = run(asset("2015-06-01", { appurtenantExcessFacts: { expropriationNoticeDate: D("2019-01-01") } })).nonBusinessLandPart!;
    expect(nb.additionalRate).toBe(0.1);
  });

  it("가목 — 고시일 2006-12-31 이전이면 취득일과 무관하게 의제 (경계 2006-12-31 포함 · 2007-01-01 불포함)", () => {
    expect(run(asset("2005-06-01", expro("2006-12-31"))).nonBusinessLandPart!.additionalRate).toBe(0);
    expect(run(asset("2018-06-01", expro("2006-12-31"))).nonBusinessLandPart!.additionalRate).toBe(0);
    expect(run(asset("2018-06-01", expro("2007-01-01"))).nonBusinessLandPart!.additionalRate).toBe(0.1);
  });
});

describe("C5-2 — 취득일 소급(Q-11): 상속은 피상속인 취득일", () => {
  it("상속개시 2018-06-01 · 피상속인 2010-01-01 · 고시 2019-01-01 → 피상속인 취득일로 판정해 의제 성립 (자기 취득일이면 불성립)", () => {
    const base = asset("2018-06-01", expro("2019-01-01"));
    expect(run({ ...base, decedentAcquisitionDate: D("2010-01-01") }).nonBusinessLandPart!.additionalRate).toBe(0);
    expect(run(base).nonBusinessLandPart!.additionalRate).toBe(0.1);
  });
  it("수유자(상속인 아님)는 소급하지 않는다", () => {
    const r = run({ ...asset("2018-06-01", expro("2019-01-01")), decedentAcquisitionDate: D("2010-01-01"), nonHeirBequest: true });
    expect(r.nonBusinessLandPart!.additionalRate).toBe(0.1);
  });
  it("토지를 건물과 다른 날 취득했으면 토지는 피상속인 취득일을 쓰지 않는다(자기 취득일)", () => {
    const base = asset("2018-06-01", expro("2019-01-01"));
    const r = run({
      ...base,
      landAcquisitionDate: D("2017-12-01"),
      decedentAcquisitionDate: D("2010-01-01"),
      acquisitionStandardPrice: { ...base.acquisitionStandardPrice, landPricePerSqmAtBuildingAcq: 1_800_000 },
    });
    expect(r.nonBusinessLandPart!.additionalRate).toBe(0.1);
  });
});

describe("C5-3 — 주택 초과분 유예(영 §168의14①)", () => {
  const GRACE = { appurtenantExcessFacts: { graceIntervals: [{ startDate: D("2015-06-02"), endDate: D("2023-12-31") }] } };
  it("유예 구간이 §168의6 기간기준을 채우면 의제 · 가산 0", () => {
    const nb = run(asset("2015-06-01", GRACE)).nonBusinessLandPart!;
    expect(nb.deemedBusiness?.reason).toBe("grace_period");
    expect(nb.additionalRate).toBe(0);
  });
  it("유예를 입력했으나 기간기준 미충족이면 비사업용 유지 + 그 사실을 고지", () => {
    const r = run(asset("2015-06-01", { appurtenantExcessFacts: { graceIntervals: [{ startDate: D("2015-06-02"), endDate: D("2016-06-01") }] } }));
    expect(r.nonBusinessLandPart!.additionalRate).toBe(0.1);
    expect(r.warnings.some((w) => /입력한 유예기간/.test(w) && /기간기준을 충족하지 못해/.test(w))).toBe(true);
  });
  it("수용 의제가 유예보다 먼저다", () => {
    const nb = run(
      asset("2015-06-01", {
        transferCause: "public_expropriation",
        appurtenantExcessFacts: { expropriationNoticeDate: D("2019-01-01"), ...GRACE.appurtenantExcessFacts },
      }),
    ).nonBusinessLandPart!;
    expect(nb.deemedBusiness?.reason).toBe("public_expropriation");
  });
});

describe("C5-4 — 초과분은 비과세로 새지 않는다", () => {
  it("의제가 성립해도 초과분 파트는 남고 양도소득금액은 의제 전후 같다(세율만 다르다)", () => {
    const before = run(asset("2015-06-01", expro(undefined))).nonBusinessLandPart!;
    const after = run(asset("2015-06-01", expro("2019-01-01"))).nonBusinessLandPart!;
    expect(after.excessArea).toBe(before.excessArea);
    expect(after.incomeAmount).toBe(before.incomeAmount);
    expect(after.incomeAmount).toBeGreaterThan(0);
  });
});
