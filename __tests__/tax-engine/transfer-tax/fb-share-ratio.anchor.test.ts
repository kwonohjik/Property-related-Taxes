/**
 * anchor — 지분 양도 × 가업상속공제 자산(「소득세법」 §97의2④): 엔진 STEP 0.42가 물건 전체 기준 세 금액을 지분율로 줄인다.
 *
 * 계획서: docs/02-design/features/transfer-fb-share.engine.plan.md (맨 끝 «최종 결정» 표 · §3.4 손계산 · §7.1 FS-n)
 * 기대값은 손계산이다(엔진 출력 복사 금지). 공통: 토지 · 상속 2022-04-10 · 양도 2026-10-15 · 피상속인 취득 2012-03-08(14년 → mock 28%) ·
 *   상속인 4년 → 8% · mock 세율. 교재 이월과세5 S1: A_d 5억 · V 15억 · P 18억 · 양도비 3천만 · 적용률 7/10.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { scaleFamilyBusinessInheritanceByShare, FB_SHARE_SCALE_NOTICE } from "@/lib/tax-engine/family-business-share";
import { applyRatio } from "@/lib/tax-engine/tax-utils";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import type { TransferTaxInput, TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

const R = makeMockRates();
const AD = 500_000_000;
const V = 1_500_000_000;
const P = 1_800_000_000;
const E = 30_000_000;

interface Sample {
  /** 엔진 최상위 금액(④가 이미 지분분으로 줄인 값) */
  p: number;
  e: number;
  acq: number;
  /** 가업상속 입력 */
  ad: number;
  v: number;
  capex?: number;
  ownershipRatio?: number;
  totalPropertyTransferPrice?: number;
}

function run(s: Sample): TransferTaxResult {
  const input = baseTransferInput({
    propertyType: "land",
    transferPrice: s.p,
    acquisitionPrice: s.acq,
    acquisitionDate: new Date("2022-04-10"),
    transferDate: new Date("2026-10-15"),
    acquisitionCause: "inheritance",
    decedentAcquisitionDate: new Date("2012-03-08"),
    isOneHousehold: false,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    expenses: 0,
    transferExpense: s.e,
    reductions: [],
    annualBasicDeductionUsed: 0,
    ...(s.ownershipRatio !== undefined ? { ownershipRatio: s.ownershipRatio } : {}),
    ...(s.totalPropertyTransferPrice !== undefined ? { totalPropertyTransferPrice: s.totalPropertyTransferPrice } : {}),
    familyBusinessInheritance: {
      decedentAcquisitionPrice: s.ad,
      inheritanceMarketValue: s.v,
      fbDeductionAppliedRate: 0.7,
      inheritanceDate: "2022-04-10",
      fbRateBasis: { kind: "deduction_ratio", deductionAmount: 700_000_000, businessEstateValue: 1_000_000_000 },
      ...(s.capex ? { decedentCapitalExpenditure: s.capex } : {}),
    },
  } as Partial<TransferTaxInput>);
  return calculateTransferTax(input, R);
}

/** 지분 r 카드 — ④가 최상위 금액만 줄이고 가업상속 입력은 물건 전체 값 그대로 보낸다 */
const shareCard = (r: number, capex?: number): TransferTaxResult =>
  run({ p: applyRatio(P, r), e: applyRatio(E, r), acq: applyRatio(V, r), ad: AD, v: V, capex, ownershipRatio: r, totalPropertyTransferPrice: P });
/** 오라클 — 입력을 전부 applyRatio(·, r)한 100% 단건 */
const oracle = (r: number, capex?: number): TransferTaxResult =>
  run({
    p: applyRatio(P, r),
    e: applyRatio(E, r),
    acq: applyRatio(V, r),
    ad: applyRatio(AD, r),
    v: applyRatio(V, r),
    capex: capex ? applyRatio(capex, r) : undefined,
  });

const lthd = (r: TransferTaxResult) => r.longTermHoldingDeduction;
const hasShareNotice = (r: TransferTaxResult) => (r.warnings ?? []).includes(FB_SHARE_SCALE_NOTICE);

describe("FS-1 교재 × 지분 1/2", () => {
  /**
   * A' 250,000,000 · V' 750,000,000 → tD 175,000,000 · tH 225,000,000 → 의제 400,000,000 · G 485,000,000
   * 장특 444,500,000 × 28% + 40,500,000 × 8% = 127,700,000 · 과세표준 354,800,000 · 산출세액 354,800,000 × 40% − 25,940,000 = 115,980,000
   * 일반 §97(V' 750,000,000): G 135,000,000 · 장특 29,700,000 · 과세표준 102,800,000 → 20,540,000 · creditAmount 95,440,000
   */
  const r = shareCard(0.5);
  it("세액·장특·슬라이스", () => {
    expect(r.transferGain).toBe(485_000_000);
    expect(lthd(r)).toBe(127_700_000);
    expect(r.taxBase).toBe(354_800_000);
    expect(r.calculatedTax).toBe(115_980_000);
    expect(r.fbLthdDetail?.basis).toBe("slice_gain");
  });
  it("familyBusinessDetail — 지분분 echo + ownershipRatio·wholeInput", () => {
    const d = r.familyBusinessDetail!;
    expect(d.imputedAcquisitionPrice).toBe(400_000_000);
    expect(d.cgtUnderSection97).toBe(20_540_000);
    expect(d.creditAmount).toBe(95_440_000);
    expect(d.decedentAcquisitionPrice).toBe(250_000_000);
    expect(d.inheritanceMarketValue).toBe(750_000_000);
    expect(d.ownershipRatio).toBe(0.5);
    expect(d.wholeInput).toEqual({ decedentAcquisitionPrice: AD, inheritanceMarketValue: V });
  });
  it("FS-13 확인 필요 고지(지분일 때만)", () => {
    expect(hasShareNotice(r)).toBe(true);
    expect(FB_SHARE_SCALE_NOTICE).toContain("확인이 필요");
  });
});

describe("FS-2 지분 33%", () => {
  /** A' 165,000,000 · V' 495,000,000 → 의제 264,000,000 · G 594,000,000 − 264,000,000 − 9,900,000 = 320,100,000
   *  X 584,100,000 → ⌊×7/10⌋ 408,870,000 · gD 293,370,000 × 28% = 82,143,600 · gH 26,730,000 × 8% = 2,138,400 → 84,282,000
   *  과세표준 233,318,000 × 38% − 19,940,000 = 68,720,840 */
  it("값", () => {
    const r = shareCard(0.33);
    expect(r.transferGain).toBe(320_100_000);
    expect(lthd(r)).toBe(84_282_000);
    expect(r.taxBase).toBe(233_318_000);
    expect(r.calculatedTax).toBe(68_720_840);
    expect(r.familyBusinessDetail?.imputedAcquisitionPrice).toBe(264_000_000);
  });
});

describe("FS-3 지분 1/2 + 피상속인 자본적지출 4천만", () => {
  /** c' 20,000,000 → tD ⌊270,000,000 × 7/10⌋ 189,000,000 + tH 225,000,000 = 414,000,000 · G 900,000,000 − 414,000,000 − 15,000,000 = 471,000,000 */
  it("값 · echo의 자본적지출도 지분분", () => {
    const r = shareCard(0.5, 40_000_000);
    expect(r.familyBusinessDetail?.imputedAcquisitionPrice).toBe(414_000_000);
    expect(r.transferGain).toBe(471_000_000);
    expect(r.familyBusinessDetail?.decedentCapitalExpenditure).toBe(20_000_000);
    expect(r.familyBusinessDetail?.wholeInput?.decedentCapitalExpenditure).toBe(40_000_000);
  });
});

describe("FS-4 불변식 — 지분 r 카드 ≡ 입력을 applyRatio(·, r)한 100% 단건", () => {
  for (const r of [0.5, 0.33, 0.7, 1 / 3]) {
    it(`r = ${r}`, () => {
      const a = shareCard(r, 40_000_000);
      const b = oracle(r, 40_000_000);
      expect(a.transferGain).toBe(b.transferGain);
      expect(lthd(a)).toBe(lthd(b));
      expect(a.taxBase).toBe(b.taxBase);
      expect(a.determinedTax).toBe(b.determinedTax);
      expect(a.familyBusinessDetail?.imputedAcquisitionPrice).toBe(b.familyBusinessDetail?.imputedAcquisitionPrice);
      expect(a.familyBusinessDetail?.creditAmount).toBe(b.familyBusinessDetail?.creditAmount);
      expect(a.fbLthdDetail?.basis).toBe(b.fbLthdDetail?.basis);
    });
  }
});

describe("FS-5 지분 아님 — 교재 S1 불변 · 새 echo·고지 없음", () => {
  it("값", () => {
    const r = run({ p: P, e: E, acq: V, ad: AD, v: V });
    expect(lthd(r)).toBe(255_400_000);
    expect(r.taxBase).toBe(712_100_000);
    expect(r.calculatedTax).toBe(263_142_000);
    expect(r.familyBusinessDetail?.creditAmount).toBe(204_004_000);
    expect(r.familyBusinessDetail?.ownershipRatio).toBeUndefined();
    expect(r.familyBusinessDetail?.wholeInput).toBeUndefined();
    expect(hasShareNotice(r)).toBe(false);
  });
  it("ownershipRatio 1이면 입력 객체 그대로", () => {
    const fb = { decedentAcquisitionPrice: AD, inheritanceMarketValue: V, fbDeductionAppliedRate: 0.7, inheritanceDate: "2022-04-10" };
    expect(scaleFamilyBusinessInheritanceByShare(fb, 1).fb).toBe(fb);
    expect(scaleFamilyBusinessInheritanceByShare(fb, undefined).fb).toBe(fb);
  });
});

describe("FS-7 정확 규약 — applyRatio(BigInt), Math.floor(x × r) 아님", () => {
  /** 1,518,341,200 × 7/10 = 1,062,838,840 (부동소수 곱은 1,062,838,839.99… → 839) */
  it("r = 0.7", () => {
    const s = scaleFamilyBusinessInheritanceByShare(
      { decedentAcquisitionPrice: AD, inheritanceMarketValue: 1_518_341_200, fbDeductionAppliedRate: 0.7, inheritanceDate: "2022-04-10" },
      0.7,
    );
    expect(s.fb.inheritanceMarketValue).toBe(1_062_838_840);
    expect(s.fb.decedentAcquisitionPrice).toBe(350_000_000);
  });
});

describe("FS-8 적용률은 상속인 단위 — 지분율을 곱하지 않는다", () => {
  for (const r of [0.5, 0.33]) {
    it(`r = ${r}`, () => {
      const res = shareCard(r);
      expect(res.familyBusinessDetail?.appliedRate).toBe(0.7);
      expect(res.familyBusinessDetail?.appliedRateBasis).toEqual({
        kind: "deduction_ratio",
        deductionAmount: 700_000_000,
        businessEstateValue: 1_000_000_000,
      });
    });
  }
});
