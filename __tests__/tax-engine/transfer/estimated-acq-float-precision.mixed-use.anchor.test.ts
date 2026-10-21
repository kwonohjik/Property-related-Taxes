/**
 * 환산취득가액 부동소수 1원 과소 — 겸용주택 기준시가·면적 비율 안분 anchor (2026-10-21)
 *
 * 계획: docs/00-pm/estimated-acquisition-float-precision.plan.md §6.1(A2~A6·B1) · §4.1(A3 132,413,792→793 · A5 473,249,999→250,000)
 *
 * 비율 안분(`금액 × (분자 ÷ 분모)`)은 참값이 정수일 때 1원 과소가 난다(R 모양, 참값 정수 표본의 약 4%).
 * 기대값은 리터럴 + BigInt 정수 나눗셈으로 고정하고, 지점마다 「옛 식이 참값보다 1 작다」는 전제를 함께 고정한다.
 * 이 표본들은 전부 mock 세율의 `calcMixedUseTransferTax` 실행 결과다(가상 fixture — 실제 신고 사례 아님).
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { apportionAcquisitionPrice, apportionTransferPrice } from "@/lib/tax-engine/transfer-tax-mixed-use-helpers";
import { resolveHousingInheritedAcqPhd } from "@/lib/tax-engine/transfer-tax-mixed-use-inheritance";
import { createDefaultTransferFormData, computeTransferSummary } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { multiplyByArea } from "@/lib/tax-engine/area-utils";
import { makeMockRates } from "./../_helpers/mock-rates";
import type { MixedUseAssetInput, MixedUseDerivedAreas } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { PreHousingDisclosureResult } from "@/lib/tax-engine/types/transfer.types";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const TD = D("2024-08-20");
const big = (a: number, b: number, c: number) => Number((BigInt(a) * BigInt(b)) / BigInt(c));
const oldRatio = (a: number, b: number, c: number) => Math.floor(a * (b / c));
/** 옛 식이 참값보다 1 작은 지점임을 고정 */
function premise(label: string, a: number, b: number, c: number, exact: number) {
  expect(big(a, b, c), `${label} 참값`).toBe(exact);
  expect(oldRatio(a, b, c), `${label} 옛 식(1원 과소)`).toBe(exact - 1);
}

/** 주택 100㎡ · 상가 100㎡ · 토지 200㎡(주택부수 100 · 상가부수 100) · 2010-03-15 동시 취득 · 비과세 아님 */
function asset(acq: { h: number; p: number; c: number; n: number }, tr: { h: number; p: number; c: number; n: number }, over: Record<string, unknown> = {}): MixedUseAssetInput {
  return {
    isMixedUseHouse: true,
    residentialFloorArea: 100,
    nonResidentialFloorArea: 100,
    buildingFootprintArea: 100,
    totalLandArea: 200,
    landAcquisitionDate: D("2010-03-15"),
    buildingAcquisitionDate: D("2010-03-15"),
    transferStandardPrice: { housingPrice: tr.h, commercialBuildingPrice: tr.c, landPricePerSqm: tr.p, housingBuildingPrice: tr.n },
    acquisitionStandardPrice: { housingPrice: acq.h, commercialBuildingPrice: acq.c, landPricePerSqm: acq.p, housingBuildingPrice: acq.n },
    residencePeriodYears: 0,
    isMetropolitanArea: true,
    zoneType: "general_residential",
    isOneHouseExempt: false,
    ...over,
  } as unknown as MixedUseAssetInput;
}

// ── A5 양도: 총 양도가액을 양도시 기준시가(주택 : 상가) 비율로 안분 (helpers.ts:127) ──────────
describe("A5 양도가액 안분 — apportionTransferPrice", () => {
  const A = asset({ h: 820_000_000, p: 1_400_000, c: 50_000_000, n: 150_000_000 }, { h: 900_000_000, p: 6_000_000, c: 250_000_000, n: 500_000_000 });
  const TOTAL = 2_800_000_000;
  // 주택 900,000,000 : (상가토지 6,000,000 × 100㎡ + 상가건물 250,000,000) = 900,000,000 : 850,000,000
  it("전제 · 엔진 경유 주택분 양도가액 1,440,000,000 · 상가분 1,360,000,000", () => {
    premise("A5 양도", TOTAL, 900_000_000, 1_750_000_000, 1_440_000_000);
    const r = calcMixedUseTransferTax(TOTAL, TD, A, rates);
    expect(r.apportionment.housingTransferPrice).toBe(1_440_000_000);
    expect(r.apportionment.commercialTransferPrice).toBe(1_360_000_000);
    expect(r.apportionment.housingRatio).toBeCloseTo(900 / 1750, 12); // 표시용 비율은 그대로
  });
  it("함수 직접 호출 — 합계 보존(상가분은 잔액)", () => {
    const derived = { residentialRatio: 0.5, residentialLandArea: 100, commercialLandArea: 100, residentialFootprintArea: 50 } as MixedUseDerivedAreas;
    const r = apportionTransferPrice(TOTAL, A, derived);
    expect(r.housingTransferPrice).toBe(1_440_000_000);
    expect(r.housingTransferPrice + r.commercialTransferPrice).toBe(TOTAL);
  });
  it("양도시 기준시가 합이 0이면 상가분이 전액 — 기존 방어선 유지", () => {
    const zero = asset({ h: 1, p: 1, c: 1, n: 1 }, { h: 0, p: 0, c: 0, n: 0 });
    const derived = { residentialRatio: 0.5, residentialLandArea: 100, commercialLandArea: 100, residentialFootprintArea: 50 } as MixedUseDerivedAreas;
    expect(apportionTransferPrice(1_000, zero, derived)).toMatchObject({ housingTransferPrice: 0, commercialTransferPrice: 1_000 });
  });
});

// ── A5 취득: 공통 자본적지출·실가 취득가액을 취득시 기준시가 비율로 안분 (helpers.ts:183) ──────
describe("A5 취득가액 안분 — apportionAcquisitionPrice", () => {
  const derived = { residentialRatio: 0.5, residentialLandArea: 100, commercialLandArea: 100, residentialFootprintArea: 50 } as MixedUseDerivedAreas;
  const A = asset({ h: 700_000_000, p: 1_000_000, c: 200_000_000, n: 100_000_000 }, { h: 900_000_000, p: 6_000_000, c: 250_000_000, n: 500_000_000 });
  it("주택 700,000,000 : 상가 300,000,000 (상가 = 토지 1,000,000×100㎡ + 건물 200,000,000 중 주입값) → 700,000,000 × 7/10 = 490,000,000", () => {
    premise("A5 취득", 700_000_000, 700_000_000, 1_000_000_000, 490_000_000);
    const r = apportionAcquisitionPrice(700_000_000, A, derived, { housingStd: 700_000_000, commercialStd: 300_000_000 });
    expect(r.housingAcqPrice).toBe(490_000_000);
    expect(r.commercialAcqPrice).toBe(210_000_000);
  });
  it("취득시 기준시가 합이 0이면 균등 1/2 — 도달 불가 방어선 유지", () => {
    const zero = asset({ h: 0, p: 0, c: 0, n: 0 }, { h: 1, p: 1, c: 1, n: 1 });
    const r = apportionAcquisitionPrice(1_001, zero, derived, { housingStd: 0, commercialStd: 0 });
    expect(r.housingAcqPrice).toBe(500);
    expect(r.commercialAcqPrice).toBe(501);
    expect(r.housingRatio).toBe(0.5);
  });
});

// ── A3 겸용주택 주택분: 토지·건물 안분 (housing.ts:406·415) ───────────────────────────────
describe("A3 주택분 토지·건물 안분", () => {
  it("취득 — 환산취득가액 880,000,000 · 취득시 토지분 기준시가 249,333,333 : 건물 630,666,667 → 토지 취득가 249,333,333 (옛 …332)", () => {
    const A = asset({ h: 880_000_000, p: 1_700_000, c: 80_000_000, n: 430_000_000 }, { h: 1_000_000_000, p: 7_000_000, c: 100_000_000, n: 500_000_000 });
    const r = calcMixedUseTransferTax(1_800_000_000, TD, A, rates);
    const hp = r.housingPart;
    const landStd = hp.landStdPriceAtAcq!;
    const buildingStd = hp.buildingStdPriceAtAcq!;
    expect(hp.estimatedAcquisitionPrice).toBe(880_000_000);
    expect(landStd + buildingStd).toBe(880_000_000);
    premise("A3 취득", hp.estimatedAcquisitionPrice, landStd, landStd + buildingStd, 249_333_333);
    expect(hp.landAcqPrice).toBe(249_333_333);
    expect(hp.buildingAcqPrice).toBe(880_000_000 - 249_333_333);
  });

  it("양도 — 주택분 양도가액 875,000,000 · 양도시 토지분 : 건물분 → 토지 양도가액 468,023,255 (옛 …254)", () => {
    const A = asset({ h: 430_000_000, p: 1_700_000, c: 80_000_000, n: 410_000_000 }, { h: 900_000_000, p: 11_500_000, c: 110_000_000, n: 1_000_000_000 });
    const r = calcMixedUseTransferTax(2_100_000_000, TD, A, rates);
    const hp = r.housingPart;
    const st = hp.housingStdSplit!.transfer!;
    expect(r.apportionment.housingTransferPrice).toBe(875_000_000);
    premise("A3 양도", 875_000_000, st.landBasis, st.landBasis + st.buildingBasis, 468_023_255);
    expect(hp.landTransferPrice).toBe(468_023_255);
    expect(hp.buildingTransferPrice).toBe(875_000_000 - 468_023_255);
  });
});

// ── A2 겸용주택 상가분: 토지·건물 안분 (commercial.ts:243·257) ────────────────────────────
describe("A2 상가분 토지·건물 안분", () => {
  it("취득 — 환산취득가액 220,000,000 · 취득시 토지 60,000,000 : 건물 50,000,000 → 토지 취득가 120,000,000 (옛 …999)", () => {
    const A = asset({ h: 500_000_000, p: 600_000, c: 50_000_000, n: 110_000_000 }, { h: 900_000_000, p: 5_500_000, c: 300_000_000, n: 700_000_000 });
    const r = calcMixedUseTransferTax(3_500_000_000, TD, A, rates);
    const cp = r.commercialPart;
    expect(cp.estimatedAcquisitionPrice).toBe(220_000_000);
    premise("A2 취득", 220_000_000, cp.acqStandardLand!, cp.acqStandardLand! + cp.acqStandardBuilding!, 120_000_000);
    expect(cp.landAcqPrice).toBe(120_000_000);
    expect(cp.buildingAcqPrice).toBe(100_000_000);
  });

  it("양도 — 상가분 양도가액 1,450,000,000 · 양도시 상가토지 700,000,000 : 상가건물 300,000,000 → 토지 양도가액 1,015,000,000 (옛 …999)", () => {
    const A = asset({ h: 830_000_000, p: 1_100_000, c: 40_000_000, n: 410_000_000 }, { h: 1_000_000_000, p: 7_000_000, c: 300_000_000, n: 900_000_000 });
    const r = calcMixedUseTransferTax(2_900_000_000, TD, A, rates);
    const cp = r.commercialPart;
    expect(r.apportionment.commercialTransferPrice).toBe(1_450_000_000);
    premise("A2 양도", 1_450_000_000, 700_000_000, 1_000_000_000, 1_015_000_000);
    expect(cp.landTransferPrice).toBe(1_015_000_000);
    expect(cp.buildingTransferPrice).toBe(1_450_000_000 - 1_015_000_000);
  });
});

// ── B1 용도변경(상가→주택): 취득시 상가 기준시가를 면적 비율로 안분 (housing.ts:308 · housing-acq.ts:221) ──
describe("B1 면적 비율 — 0.01㎡ 정수로 올려 안분", () => {
  // 주택 55.93㎡ · 상가 195.99㎡ · 토지 128.65㎡ · 취득시 상가건물 270,000,000 + 공시지가 1,000,000×128.65㎡
  const C2H = (over: Record<string, unknown> = {}) =>
    asset(
      { h: 0, p: 1_000_000, c: 270_000_000, n: 0 },
      { h: 1_600_000_000, p: 12_000_000, c: 100_000_000, n: 800_000_000 },
      {
        residentialFloorArea: 55.93,
        nonResidentialFloorArea: 195.99,
        totalLandArea: 128.65,
        acquisitionStandardPrice: { housingPrice: undefined, commercialBuildingPrice: 270_000_000, landPricePerSqm: 1_000_000 },
        partialUsageChange: { direction: "commercial_to_house", usageChangeDate: D("2018-01-01") },
        ...over,
      },
    );

  it("취득시 주택분 기준시가 88,506,250 = 상가 398,650,000 × 5,593 ÷ 25,192 (옛 …249) — housing.ts·housing-acq.ts 공통", () => {
    const acqComm = 270_000_000 + multiplyByArea(1_000_000, 128.65);
    expect(acqComm).toBe(398_650_000);
    expect(big(acqComm, 5_593, 25_192)).toBe(88_506_250);
    expect(Math.floor(acqComm * (55.93 / (55.93 + 195.99)))).toBe(88_506_249); // 옛 식 — 전제 고정
    const r = calcMixedUseTransferTax(2_500_000_000, TD, C2H(), rates);
    const hp = r.housingPart;
    // housing.ts:308 — 취득시 토지·건물 기준시가 분할의 총액
    expect(hp.landStdPriceAtAcq! + hp.buildingStdPriceAtAcq!).toBe(88_506_250);
    // housing-acq.ts:221 — 환산취득가액 분자
    expect(hp.acqHousingStandardPrice).toBe(88_506_250);
  });

  it("상가 면적이 0이면 주택 전체 — 비율 1", () => {
    const r = calcMixedUseTransferTax(2_500_000_000, TD, C2H({ nonResidentialFloorArea: 0 }), rates);
    expect(r.housingPart.acqHousingStandardPrice).toBe(398_650_000);
  });
});

// ── A4 겸용 상속·증여 PHD: 주택분 취득가액 토지·건물 안분 (inheritance.ts:320) ────────────────
describe("A4 상속 PHD 주택분 토지·건물 안분", () => {
  it("신고가액 300,000,000(≥ 추정 P_A_est 250,000,000) × 취득시 토지 71,000,000 ÷ 250,000,000 = 85,200,000 (옛 …199)", () => {
    premise("A4", 300_000_000, 71_000_000, 250_000_000, 85_200_000);
    const phd = { estimatedHousingPriceAtAcquisition: 250_000_000, landHousingAtAcquisition: 71_000_000 } as PreHousingDisclosureResult;
    const r = resolveHousingInheritedAcqPhd({ housingInheritedValue: 300_000_000 } as MixedUseAssetInput, phd);
    expect(r.estimatedAcq).toBe(300_000_000);
    expect(r.landAcqPrice).toBe(85_200_000);
    expect(r.buildingAcqPrice).toBe(214_800_000);
  });
  it("추정 P_A_est가 0이면 균등 1/2 — 도달 불가 방어선 유지", () => {
    const phd = { estimatedHousingPriceAtAcquisition: 0, landHousingAtAcquisition: 0 } as PreHousingDisclosureResult;
    const r = resolveHousingInheritedAcqPhd({ housingInheritedValue: 101 } as MixedUseAssetInput, phd);
    expect(r.landAcqPrice).toBe(50);
    expect(r.buildingAcqPrice).toBe(51);
  });
});

// ── A6 사이드바(calc-wizard-store.ts:469) — 엔진 A5 양도 안분과 같은 값 ───────────────────────
describe("A6 사이드바 겸용 양도가액 안분은 엔진과 같다", () => {
  it("주택분 양도가액 1,440,000,000 · 상가분 1,360,000,000", () => {
    const a = {
      ...makeDefaultAsset(1),
      assetKind: "housing",
      isMixedUseHouse: true,
      acquisitionCause: "purchase",
      acquisitionDate: "2010-03-15",
      residentialFloorArea: "100",
      nonResidentialFloorArea: "100",
      buildingFootprintArea: "100",
      mixedUseTotalLandArea: "200",
      actualSalePrice: "2,800,000,000",
      mixedTransferHousingPrice: "900,000,000",
      mixedTransferLandPricePerSqm: "6,000,000",
      mixedTransferCommercialBuildingPrice: "250,000,000",
    } as unknown as AssetForm;
    const form = { ...createDefaultTransferFormData(), transferDate: "2024-08-20", assets: [a] } as unknown as TransferFormData;
    const m = computeTransferSummary(form, null).mixedUse!;
    expect(m.housingTransferPrice).toBe(1_440_000_000);
    expect(m.commercialTransferPrice).toBe(1_360_000_000);
    // 엔진과 일치
    const eng = calcMixedUseTransferTax(2_800_000_000, TD, asset({ h: 820_000_000, p: 1_400_000, c: 50_000_000, n: 150_000_000 }, { h: 900_000_000, p: 6_000_000, c: 250_000_000, n: 500_000_000 }), rates);
    expect(m.housingTransferPrice).toBe(eng.apportionment.housingTransferPrice);
  });
});
