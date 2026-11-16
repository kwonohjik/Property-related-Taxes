/**
 * anchor — 겸용주택 × 부담부증여 × 공유지분 단건 (MB-6 중 `ownershipRatio < 1` 해제 · PR-A · S안).
 *
 * 계획서: docs/00-pm/bg-mixed-use-m2-bundle-share.plan.md (Q-1 S안 · Q-2 12억 판정 가액).
 * 규약(비겸용 `scaleBurdenedGiftInfo`와 같다): 평가·취득 입력(기준시가·시가·취득총액)은 **물건 전체(100%)** 로 받아 엔진이 ×r하고,
 * 채무·귀속 3칸은 **지분 인수분** 그대로다. C = 지분 증여가액. 12억 판정 가액만 물건 전체다(보충 승 = 물건 전체 보충적평가액, 담보·임대 승 = ceil(C_s/r)).
 *
 * 기대값 출처: 설계 probe의 R2(= 기준시가·시가·취득을 ×r로 줄인 단독 소유 + 12억 훅을 물건 전체로 올린 계산)이고,
 * 오라클 R4(채무를 ÷r로 환산한 100% 단독 소유)의 4부분 금액·양도차익 ÷ 2와 대조한다.
 *
 * 시료: F2 = 주택 150㎡·상가 50㎡(§154③ 본문) / F1 = 주택 100㎡·상가 100㎡(단서) · 양도시 기준시가 합 12억 · 1세대1주택(거주 10년)
 *       증여일 2024-03-01 · 증여자 취득 2010-03-15 · 지분 1/2.
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import { makeMockRates } from "../_helpers/mock-rates";

const RATES = makeMockRates() as never;
const TD = new Date("2024-03-01");
const ACQ = new Date("2010-03-15");
const F2 = { res: 150, non: 50, T: { H: 900e6, hb: 150e6, cb: 50e6 }, A: { H: 450e6, hb: 75e6, cb: 25e6 }, sigmaT: 1_200_000_000 };
const F1 = { res: 100, non: 100, T: { H: 600e6, hb: 100e6, cb: 100e6 }, A: { H: 300e6, hb: 50e6, cb: 50e6 }, sigmaT: 1_200_000_000 };
type Fx = typeof F2;
const R = 0.5;

function asset(fx: Fx, over: Partial<MixedUseAssetInput> = {}): MixedUseAssetInput {
  return {
    isMixedUseHouse: true, residentialFloorArea: fx.res, nonResidentialFloorArea: fx.non, buildingFootprintArea: 100, totalLandArea: 200,
    landAcquisitionDate: ACQ, buildingAcquisitionDate: ACQ,
    transferStandardPrice: { housingPrice: fx.T.H, commercialBuildingPrice: fx.T.cb, landPricePerSqm: 5_000_000, housingBuildingPrice: fx.T.hb },
    acquisitionStandardPrice: { housingPrice: fx.A.H, commercialBuildingPrice: fx.A.cb, landPricePerSqm: 2_500_000, housingBuildingPrice: fx.A.hb },
    residencePeriodYears: 10, isMetropolitanArea: true, zoneType: "residential", isOneHouseExempt: true, acquisitionCause: "purchase",
    ...over,
  } as MixedUseAssetInput;
}
interface Spec {
  std?: boolean;
  market: number;
  mortgage: number;
  lending?: number;
  /** 지분 인수분(귀속) — 오라클은 ÷r */
  attr: { housing: number; commercial: number; unallocated: number };
  acq: number;
}
function bg(fx: Fx, o: Spec, debtDivR = 1): BurdenedGiftInfo {
  const d = (v: number) => v / debtDivR;
  return {
    valuationMode: o.std ? "sangjeungbeop_standard" : "sangjeungbeop_market", lendingDepositTotal: d(o.lending ?? 0), mortgageDebtAmount: d(o.mortgage), annualRentTotal: 0,
    marketValueAtTransfer: o.std ? undefined : o.market, acquisitionMethod: o.std ? undefined : "actual", actualAcquisitionTotal: o.std ? undefined : o.acq,
    landStdPriceAtTransfer: 0, buildingStdPriceAtTransfer: fx.sigmaT, landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: fx.A.H + 2_500_000 * fx.non + fx.A.cb,
    donorRelation: "lineal_descendant",
    debtAttribution: { housing: d(o.attr.housing), commercial: d(o.attr.commercial), unallocated: d(o.attr.unallocated) },
    ...(o.std ? {} : { housingAppraisal: { exists: false } }),
  } as BurdenedGiftInfo;
}
const share = (fx: Fx, o: Spec, over: Partial<MixedUseAssetInput> = {}) =>
  calcMixedUseTransferTax(1, TD, { ...asset(fx, { ownershipRatio: R, ...over }), burdenedGift: bg(fx, o) }, RATES);
/** 오라클 R4 — 채무를 ÷r로 환산한 100% 단독 소유. */
const oracle = (fx: Fx, o: Spec) => calcMixedUseTransferTax(1, TD, { ...asset(fx), burdenedGift: bg(fx, o, R) }, RATES);

const A: Spec = { market: 2.0e9, mortgage: 5e8, attr: { housing: 0, commercial: 0, unallocated: 5e8 }, acq: 9e8 };
const B: Spec = { market: 2.0e9, mortgage: 3.5e8, lending: 1.5e8, attr: { housing: 0, commercial: 1.5e8, unallocated: 3.5e8 }, acq: 9e8 };
const C: Spec = { market: 2.0e9, mortgage: 8e8, attr: { housing: 8e8, commercial: 0, unallocated: 0 }, acq: 9e8 };
const D2: Spec = { market: 3.0e9, mortgage: 6e8, attr: { housing: 0, commercial: 0, unallocated: 6e8 }, acq: 9e8 };
const E: Spec = { std: true, market: 0, mortgage: 7e8, attr: { housing: 0, commercial: 0, unallocated: 7e8 }, acq: 0 };

const det = (r: ReturnType<typeof calcMixedUseTransferTax>) => r.total.determinedTax;
const halves = (r: ReturnType<typeof calcMixedUseTransferTax>, o: ReturnType<typeof calcMixedUseTransferTax>) => {
  // 4부분 양도가액·취득가액은 오라클(100%)의 절반(±1원 — 오라클의 홀수 절사)
  const close = (a: number, b: number) => expect(Math.abs(a - b / 2)).toBeLessThanOrEqual(1);
  close(r.housingPart.landTransferPrice, o.housingPart.landTransferPrice);
  close(r.housingPart.buildingTransferPrice, o.housingPart.buildingTransferPrice);
  close(r.housingPart.landAcqPrice, o.housingPart.landAcqPrice);
  close(r.housingPart.buildingAcqPrice, o.housingPart.buildingAcqPrice);
  close(r.commercialPart.landTransferPrice, o.commercialPart.landTransferPrice);
  close(r.commercialPart.landAcqPrice, o.commercialPart.landAcqPrice);
  close(r.housingPart.transferGain, o.housingPart.transferGain);
  close(r.commercialPart.transferGain, o.commercialPart.transferGain);
};

describe("겸용 × 부담부증여 × 공유지분 1/2 — 시가 모드 (보충 승)", () => {
  it("[S-A] 시가 20억 · 불분명 5억 → 7,830,000 · 12억 판정 20억(물건 전체) · 오라클 ÷2 일치", () => {
    const r = share(F2, A);
    expect(det(r)).toBe(7_830_000);
    expect(r.total.taxBase).toBe(56_625_001);
    expect(r.housingPart.isExempt).toBe(false);
    expect(r.housingPart.transferGain).toBe(206_250_000);
    expect(r.commercialPart.transferGain).toBe(68_750_000);
    // C = 지분 증여가액(10억) · 무상이전분 = C − B = 5억 · 채무비율 B/C_part = 0.5
    expect(r.burdenedGift?.giftValuation.max).toBe(1_000_000_000);
    expect(r.burdenedGift?.gratuitousPortion).toBe(500_000_000);
    expect(r.burdenedGift?.debtAttribution.housingRatio).toBe(0.5);
    // 12억 판정·안분 분모는 물건 전체(§156①) — 지분분 10억이 아니다
    expect(r.burdenedGift?.highValue.judgmentBase).toBe(2_000_000_000);
    expect(r.burdenedGift?.highValue.prorationBase).toBe(1_500_000_000);
    halves(r, oracle(F2, A));
  });

  it("[S-B] 상가 보증금 1.5억 귀속 + 담보 3.5억 불분명 → 19,538,125 · 채무비율 0.35 / 0.95", () => {
    const r = share(F2, B);
    expect(det(r)).toBe(19_538_125);
    expect(r.total.taxBase).toBe(99_937_501);
    expect(r.housingPart.transferGain).toBe(144_375_000);
    expect(r.commercialPart.transferGain).toBe(130_625_000);
    expect(r.burdenedGift?.debtAttribution.housingRatio).toBeCloseTo(0.35, 12);
    expect(r.burdenedGift?.debtAttribution.commercialRatio).toBeCloseTo(0.95, 12);
    halves(r, oracle(F2, B));
  });

  it("[S-C] 주택 귀속 담보 8억 — 지분분 C_h(7.5억)보다 커서 부분 하한(결정 5) 발동 → 1,833,750 (물건 전체로 비교하면 1,005,000)", () => {
    const r = share(F2, C);
    expect(det(r)).toBe(1_833_750);
    expect(r.total.taxBase).toBe(20_625_001);
    expect(r.housingPart.landAcqPrice).toBe(281_250_000);
    expect(r.housingPart.transferGain).toBe(462_500_000);
    expect(r.burdenedGift?.debtAttribution.housingRatio).toBe(1);
    halves(r, oracle(F2, C));
  });

  it("[S-D2] 단서(F1) · 시가 30억 — 주택분 C_h 물건 전체 15억 > 12억이라 주택분 과세 → 41,354,000", () => {
    const r = share(F1, D2);
    expect(det(r)).toBe(41_354_000);
    expect(r.total.taxBase).toBe(161_300_000);
    expect(r.housingPart.isExempt).toBe(false);
    expect(r.burdenedGift?.highValue.judgmentBase).toBe(1_500_000_000);
    halves(r, oracle(F1, D2));
  });
});

describe("겸용 × 부담부증여 × 공유지분 1/2 — 기준시가 모드 (지분 기준 담보 승)", () => {
  it("[S-E] 보충 12억(지분분 6억) < 담보 7억 → 담보 승 · 12억 훅 ceil(7억/0.5)=14억 → 11,000,400", () => {
    const r = share(F2, E);
    expect(r.burdenedGift?.giftValuation.selectedMode).toBe("mortgage");
    expect(det(r)).toBe(11_000_400);
    expect(r.total.taxBase).toBe(69_835_001);
    expect(r.housingPart.transferGain).toBe(293_250_000);
    expect(r.commercialPart.transferGain).toBe(97_750_000);
    expect(r.burdenedGift?.highValue.judgmentBase).toBe(1_400_000_000);
    expect(r.burdenedGift?.gratuitousPortion).toBe(0);
    halves(r, oracle(F2, E));
  });

  it("[S-E2] 단서(F1) 담보 승 → 34,319,500", () => {
    const r = share(F1, E);
    expect(det(r)).toBe(34_319_500);
    expect(r.total.taxBase).toBe(142_170_001);
    halves(r, oracle(F1, E));
  });
});

describe("겸용 × 부담부증여 × 공유지분 1/2 — 비1세대1주택 (화면 경로 anchor와 같은 시료)", () => {
  const SF: Spec = { market: 1.5e9, mortgage: 3e8, attr: { housing: 0, commercial: 0, unallocated: 3e8 }, acq: 7e8 };
  it("[S-F] 시가 15억 · 지분 인수 채무 3억 불분명 · 취득 7억 → 25,125,001 · 단독 M-0(채무 6억 69,094,001)의 절반 규모", () => {
    const r = share(F1, SF, { isOneHouseExempt: false, residencePeriodYears: 0 });
    expect(det(r)).toBe(25_125_001);
    expect(r.housingPart.landTransferPrice).toBe(125_000_000);
    expect(r.housingPart.landAcqPrice).toBe(58_333_333);
    const o = calcMixedUseTransferTax(1, TD, { ...asset(F1, { isOneHouseExempt: false, residencePeriodYears: 0 }), burdenedGift: bg(F1, SF, R) }, RATES);
    expect(det(o)).toBe(69_094_001);
    halves(r, o);
  });
});

describe("지분율 1·미입력은 종전과 같다", () => {
  it("ownershipRatio 1 = 미입력 (회귀)", () => {
    const a = calcMixedUseTransferTax(1, TD, { ...asset(F2, { ownershipRatio: 1 }), burdenedGift: bg(F2, A, R) }, RATES);
    const b = oracle(F2, A);
    expect(det(a)).toBe(det(b));
    expect(det(b)).toBe(25_072_500);
  });
});
