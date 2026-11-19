/**
 * anchor (NBL2611-V4-HS01) — 겸용주택 배율 초과분(비사업용 토지 파트)에 위기취득 특례가 걸린다.
 *
 * 법령: 「소득세법」 부칙(2008.12.26. 법률 제9270호) 제14조① — 2009.3.16.~2012.12.31. 취득 자산은
 * §104①1호(기본세율)로 양도세를 계산한다(=+10%p 가산 배제). 정본 leaf `CRISIS_ACQ_EXCLUSION_WINDOW`
 * (`legal-codes/surcharge-transition.ts`). 단일 주택 G-2(`buildNblPartRateInput` → `calcTax`)·함께 양도 파트 카드는 이미 배제한다.
 * 겸용 엔진만 `additionalRate: 0.10` 리터럴이라 같은 사실이 경로마다 달랐다(리뷰 V4-HS01).
 *
 * 기준 시나리오 — §154③ 본문(주택 150 > 상가 100) · 1세대1주택 · 전체 10억(12억 이하) → 주택·상가 비과세,
 * 배율 초과 토지(400㎡ − 정착 100㎡×3배 = 100㎡)만 비사업용 토지 파트로 과세. 그래서 총세액 = 그 파트 한 개의 세액이다.
 * 독립 oracle: 과세표준 = 파트 소득금액 − 기본공제 250만원 → 누진 산식(+10%p 유무만 다르다).
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTaxIdN as calcMixedUseTransferTax } from "../_helpers/mixed-use-identity-std";
import { makeMockRates } from "../_helpers/mock-rates";
import { calculateProgressiveTax } from "@/lib/tax-engine/tax-utils";
import { CRISIS_ACQ_EXCLUSION_WINDOW } from "@/lib/tax-engine/legal-codes/surcharge-transition";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const rates = makeMockRates();
const TD = new Date("2024-06-01");
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

function asset(acq: string, over: Partial<MixedUseAssetInput> = {}): MixedUseAssetInput {
  return {
    isMixedUseHouse: true,
    residentialFloorArea: 150,
    nonResidentialFloorArea: 100,
    buildingFootprintArea: 100,
    totalLandArea: 400,
    landAcquisitionDate: new Date(acq),
    buildingAcquisitionDate: new Date(acq),
    transferStandardPrice: { housingPrice: 500_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 2_000_000 },
    acquisitionStandardPrice: { housingPrice: 350_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_500_000 },
    residencePeriodYears: 10,
    isMetropolitanArea: true,
    zoneType: "residential",
    isOneHouseExempt: true,
    ...over,
  };
}

/** 독립 oracle — 파트 하나만 과세되는 시나리오의 세액(가산율 add). */
function oracleTax(nbIncome: number, add: number): number {
  const base = Math.max(0, nbIncome - 2_500_000);
  return calculateProgressiveTax(base, BRACKETS) + Math.floor(base * add);
}

describe("NBL2611-V4-HS01 — 겸용 배율 초과분 × 위기취득 특례", () => {
  it("정본 윈도우 상수 — 2009-03-16 ~ 2012-12-31 (재정의 금지 — 이 앵커가 상수 변경을 잡는다)", () => {
    expect(CRISIS_ACQ_EXCLUSION_WINDOW).toEqual({ start: "2009-03-16", end: "2012-12-31" });
  });

  it("🔴 2010 취득 — 초과분 파트 가산 0 · 세액 = 누진만 (종전 +10%p)", () => {
    const r = calcMixedUseTransferTax(1_000_000_000, TD, asset("2010-06-01"), rates);
    const nb = r.nonBusinessLandPart!;
    expect(nb.excessArea).toBe(100);
    expect(r.commercialPart.incomeAmount).toBe(0);
    expect(r.housingPart.incomeAmount).toBe(0);
    expect(nb.additionalRate).toBe(0);
    expect(r.total.transferTax).toBe(oracleTax(nb.incomeAmount, 0));
    // 장특은 존속한다(부칙 §14①은 세율만 배제 — 서울행정법원 2024구단72950).
    expect(nb.longTermDeductionAmount).toBeGreaterThan(0);
  });

  it("경계 — 윈도우 첫날(2009-03-16)·끝날(2012-12-31) 취득은 배제", () => {
    for (const d of ["2009-03-16", "2012-12-31"]) {
      const r = calcMixedUseTransferTax(1_000_000_000, TD, asset(d), rates);
      const nb = r.nonBusinessLandPart!;
      expect(nb.additionalRate, d).toBe(0);
      expect(r.total.transferTax, d).toBe(oracleTax(nb.incomeAmount, 0));
    }
  });

  it("대조 — 윈도우 밖(2009-03-15 · 2013-01-01)은 +10%p 유지 (게이트를 통째로 연 것이 아니다)", () => {
    for (const d of ["2009-03-15", "2013-01-01", "2021-06-01"]) {
      const r = calcMixedUseTransferTax(1_000_000_000, TD, asset(d), rates);
      const nb = r.nonBusinessLandPart!;
      expect(nb.additionalRate, d).toBe(0.1);
      expect(r.total.transferTax, d).toBe(oracleTax(nb.incomeAmount, 0.1));
    }
  });

  it("토지 취득일 기준 — 토지 2010 · 건물 2015 별개 취득이면 토지 취득일(배율 초과분은 토지)이 정한다", () => {
    const r = calcMixedUseTransferTax(
      1_000_000_000,
      TD,
      asset("2010-06-01", {
        buildingAcquisitionDate: new Date("2015-06-01"),
        acquisitionStandardPrice: {
          housingPrice: 350_000_000,
          commercialBuildingPrice: 80_000_000,
          landPricePerSqm: 1_500_000,
          landPricePerSqmAtBuildingAcq: 1_800_000,
        },
      }),
      rates,
    );
    expect(r.nonBusinessLandPart!.additionalRate).toBe(0);
  });
});

describe("NBL2611-V10-BX09 — OH-17 결과 산식이 값과 일치한다 (echo)", () => {
  it("OH-17(§154③ 본문): 한도 비교 대상은 전체 토지 × 건물 전체 정착면적, 양도차익은 주택·상가 토지분 합", () => {
    const r = calcMixedUseTransferTax(1_000_000_000, TD, asset("2021-06-01"), rates);
    const nb = r.nonBusinessLandPart!;
    expect(nb.excessBasis).toEqual({ landArea: 400, footprintArea: 100, wholeBuildingDeemedHouse: true });
    // 표시 산식(전체 토지 − 정착 × 배율)이 값(excessArea)과 정확히 맞는다
    expect(nb.excessArea).toBe(Math.max(0, nb.excessBasis!.landArea - nb.excessBasis!.footprintArea * nb.appliedMultiplier));
    // 표시 산식(주택 토지분 × 비율 + 상가 부수토지분 × 비율)이 값(transferGain)과 맞는다
    const ratio = r.housingPart.nonBusinessTransferRatio;
    const commercialShare = nb.commercialLandTransferredGain!;
    expect(commercialShare).toBe(Math.floor(r.commercialPart.landTransferGain * ratio));
    expect(nb.transferGain).toBe(Math.floor(r.housingPart.landTransferGain * ratio) + commercialShare);
    expect(commercialShare).toBeGreaterThan(0);
  });

  it("단서 경로(§154③ 단서 — 주택 < 상가)는 주택 부수토지 × 주택 정착면적 기준이고 상가 몫 echo가 없다", () => {
    const r = calcMixedUseTransferTax(
      1_000_000_000,
      TD,
      asset("2021-06-01", { residentialFloorArea: 100, nonResidentialFloorArea: 150, buildingFootprintArea: 40 }),
      rates,
    );
    const nb = r.nonBusinessLandPart!;
    expect(nb.excessBasis?.wholeBuildingDeemedHouse).toBe(false);
    expect(nb.commercialLandTransferredGain).toBeUndefined();
  });
});

describe("NBL2611-V4-BX04·BX05 — 상가 부수토지 판정 한계 고지 (세액 불변)", () => {
  it("OH-17 경로는 «상가 부수토지에도 주택 배율 적용» 고지(BX05)를 낸다", () => {
    const r = calcMixedUseTransferTax(1_000_000_000, TD, asset("2021-06-01"), rates);
    expect(r.warnings.some((w) => /상가 부수토지까지 주택 부속토지로 보아/.test(w) && /확인 필요/.test(w))).toBe(true);
    expect(r.warnings.some((w) => /기준면적을 판정하지 않습니다/.test(w))).toBe(false);
  });

  it("단서 경로의 상가 부수토지는 «기준면적 미판정» 고지(BX04)를 낸다 — 바닥면적 필요 명시", () => {
    const r = calcMixedUseTransferTax(
      1_000_000_000,
      TD,
      asset("2021-06-01", { residentialFloorArea: 100, nonResidentialFloorArea: 150 }),
      rates,
    );
    const w = r.warnings.find((x) => /기준면적을 판정하지 않습니다/.test(x));
    expect(w).toBeDefined();
    expect(w).toMatch(/지방세법 시행령」 제101조 제1항 제2호·제2항/);
    expect(w).toMatch(/바닥면적/);
    expect(w).toMatch(/확인 필요/);
  });
});
