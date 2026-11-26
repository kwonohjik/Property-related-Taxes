/**
 * F-3 — 가업상속공제적용률 법정량(분수) 정확 연산 anchor
 *
 * 「소득세법」 §97의2④ · 「소득세법 시행령」 §163의2③(공제금액 ÷ 가업상속 재산가액)
 * 계획서: docs/02-design/features/fb-97-2-4-fixes.plan.md §5
 *
 * 종전 엔진은 적용률을 소수 6자리로 반올림한 뒤 곱했다(`round(r × 1e6)`). 이력 불러오기가 넘기는
 * 400/1200 같은 값에서 의제 취득가액이 법문(항별 절사)보다 크게 나왔다. 법정량(`fbRateBasis`)이
 * 있으면 정수 분수로 곱한다. 없으면 종전 경로 그대로(비트 동일).
 *
 * 공통 조건: 토지 · 양도가 = 상속평가 × 2 · 상속 2024-01-01 · 양도 2026-01-01 · mock 세율.
 * 기대값은 엔진 독립 계산(BigInt 항별 절사)과 대조해 고정했다.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { calcFamilyBusinessImputedAcquisitionPrice } from "@/lib/tax-engine/family-business-imputed-acquisition";
import {
  familyBusinessRateBasisError,
  resolveFamilyBusinessRateFraction,
  type FamilyBusinessRateBasis,
} from "@/lib/tax-engine/family-business-applied-rate";

const R = makeMockRates();

function input(
  c: { dec: number; mv: number; n: number; d: number },
  opts: { basis: boolean; decedentDate?: boolean },
) {
  return baseTransferInput({
    propertyType: "land",
    transferPrice: c.mv * 2,
    acquisitionPrice: c.mv,
    acquisitionDate: new Date("2024-01-01"),
    transferDate: new Date("2026-01-01"),
    isOneHousehold: false,
    householdHousingCount: 0,
    expenses: 0,
    reductions: [],
    annualBasicDeductionUsed: 0,
    ...(opts.decedentDate ? { decedentAcquisitionDate: new Date("2005-01-01") } : {}),
    familyBusinessInheritance: {
      decedentAcquisitionPrice: c.dec,
      inheritanceMarketValue: c.mv,
      fbDeductionAppliedRate: c.n / c.d,
      inheritanceDate: "2024-01-01",
      ...(opts.basis
        ? { fbRateBasis: { kind: "deduction_ratio" as const, deductionAmount: c.n, businessEstateValue: c.d } }
        : {}),
    },
  });
}

const lthdAmount = (r: ReturnType<typeof calculateTransferTax>) =>
  r.steps.find((s) => s.label.includes("장기보유"))?.amount;

/** 공제 400억 ÷ 가업상속 재산가액 1,200억 (= 1/3) · 피상속인 2억 · 평가 10억 */
const ONE_THIRD = { dec: 200_000_000, mv: 1_000_000_000, n: 40_000_000_000, d: 120_000_000_000 };
/** 공제 100억 ÷ 700억 (= 1/7) · 피상속인 300억 · 평가 900억 */
const ONE_SEVENTH = { dec: 30_000_000_000, mv: 90_000_000_000, n: 10_000_000_000, d: 70_000_000_000 };
/** 80억 ÷ 100억 (= 0.8) · 피상속인 1억 · 평가 3억 — double로도 정확한 비율 */
const FOUR_FIFTHS = { dec: 100_000_000, mv: 300_000_000, n: 8_000_000_000, d: 10_000_000_000 };

describe("F-3 의제 취득가액 — 법정량 분수 (소법 §97의2④ · 소령 §163의2③)", () => {
  it("F3-1: 법정량 없음 → 종전 6자리 basis 그대로 (r=0.8 · 140,000,000)", () => {
    expect(calcFamilyBusinessImputedAcquisitionPrice(100_000_000, 300_000_000, 0.8)).toBe(140_000_000);
    expect(resolveFamilyBusinessRateFraction(0.8)).toEqual({ numerator: 800_000, denominator: 1_000_000 });
  });

  it("F3-2: 1/3 — 의제 733,333,332 (종전 733,333,600) · 결정세액 502,935,000 (종전 502,934,880)", () => {
    const legacy = calculateTransferTax(input(ONE_THIRD, { basis: false }), R);
    const exact = calculateTransferTax(input(ONE_THIRD, { basis: true }), R);
    expect(legacy.familyBusinessDetail!.imputedAcquisitionPrice).toBe(733_333_600);
    expect(exact.familyBusinessDetail!.imputedAcquisitionPrice).toBe(733_333_332);
    expect(legacy.determinedTax).toBe(502_934_880);
    expect(exact.determinedTax).toBe(502_935_000);
    expect(exact.familyBusinessDetail!.cgtUnderSection97).toBe(383_010_000);
    expect(exact.familyBusinessDetail!.creditAmount).toBe(119_925_000);
    expect(exact.familyBusinessDetail!.appliedRateBasis).toEqual({
      kind: "deduction_ratio",
      deductionAmount: 40_000_000_000,
      businessEstateValue: 120_000_000_000,
    });
  });

  it("F3-3: 1/7 — 의제 81,428,571,427 (종전 81,428,580,000) · 결정세액 44,290,077,857 (종전 44,290,074,000)", () => {
    const legacy = calculateTransferTax(input(ONE_SEVENTH, { basis: false }), R);
    const exact = calculateTransferTax(input(ONE_SEVENTH, { basis: true }), R);
    expect(legacy.familyBusinessDetail!.imputedAcquisitionPrice).toBe(81_428_580_000);
    expect(exact.familyBusinessDetail!.imputedAcquisitionPrice).toBe(81_428_571_427);
    expect(legacy.determinedTax).toBe(44_290_074_000);
    expect(exact.determinedTax).toBe(44_290_077_857);
  });

  it("F3-4: 4/5 법정량 ≡ 0.8 — 의제·세액 동일", () => {
    const legacy = calculateTransferTax(input(FOUR_FIFTHS, { basis: false }), R);
    const exact = calculateTransferTax(input(FOUR_FIFTHS, { basis: true }), R);
    expect(exact.familyBusinessDetail!.imputedAcquisitionPrice).toBe(140_000_000);
    expect(exact.determinedTax).toBe(legacy.determinedTax);
    expect(exact.determinedTax).toBe(157_060_000);
  });
});

describe("F-3 §95④ 후단 — 가업상속공제 적용 비율분 양도차익도 같은 분수 (transfer-tax-lthd.ts)", () => {
  /**
   * 1/3 · 피상속인 취득 2005-01-01(21년 → 표1 30%) · 상속인분 2년(0%).
   * 🔄 2026-11-26 부분별 양도차익(transfer-fb-lthd-portion-gain) — 손계산(엔진 미사용):
   *   tD = ⌊2억 × 1/3⌋ = 66,666,666 · tH = ⌊10억 × 2/3⌋ = 666,666,666 · 양도차익 20억 − 733,333,332 = 1,266,666,668
   *   적용분 양도차익 gD = ⌊20억 × 1/3⌋ − tD = 666,666,666 − 66,666,666 = 600,000,000 → × 30% = 180,000,000 (비적용분 0%)
   *   과세표준 = 1,266,666,668 − 180,000,000 − 2,500,000 = 1,084,166,668 → 산출 ×45% − 65,940,000 = 421,935,000
   * 종전(전체 양도차익 ⌊× 1/3⌋ = 422,222,222 × 30%): 공제 126,666,666 · 결정세액 445,935,000.
   * 법정량 없음(6자리 반올림 333,333/1,000,000): tD = 66,666,600 · dX = 666,666,000 · gD = 599,999,400 → 179,999,820 ·
   *   양도차익 1,266,666,400 → 과세표준 1,084,166,580 → 421,934,961.
   */
  it("F3-6a: 1/3 — 장기보유특별공제 180,000,000 (6자리 반올림 179,999,820) · 결정세액 421,935,000 (421,934,961)", () => {
    const legacy = calculateTransferTax(input(ONE_THIRD, { basis: false, decedentDate: true }), R);
    const exact = calculateTransferTax(input(ONE_THIRD, { basis: true, decedentDate: true }), R);
    expect(lthdAmount(legacy)).toBe(179_999_820);
    expect(lthdAmount(exact)).toBe(180_000_000);
    expect(legacy.determinedTax).toBe(421_934_961);
    expect(exact.determinedTax).toBe(421_935_000);
  });

  /**
   * 1/7 · 🔄 2026-11-26 부분별 양도차익 — 손계산(엔진 미사용):
   *   tD = ⌊300억 × 1/7⌋ = 4,285,714,285 · tH = ⌊900억 × 6/7⌋ = 77,142,857,142 · 양도차익 1,800억 − 81,428,571,427 = 98,571,428,573
   *   gD = ⌊1,800억 × 1/7⌋ − tD = 25,714,285,714 − 4,285,714,285 = 21,428,571,429 → × 30% = 6,428,571,428
   *   과세표준 = 98,571,428,573 − 6,428,571,428 − 2,500,000 = 92,140,357,145 → ×45% − 65,940,000 = 41,397,220,715
   * 종전(전체 양도차익 ⌊÷ 7⌋ × 30%): 4,224,489,795 · 결정세액 42,389,057,450.
   * 법정량 없음(142,857/1,000,000): tD = 4,285,710,000 · gD = 21,428,550,000 → 6,428,565,000 · 과세표준 92,140,355,000 → 41,397,219,750.
   */
  it("F3-6b: 1/7 — 장기보유특별공제 6,428,571,428 (6자리 반올림 6,428,565,000)", () => {
    const legacy = calculateTransferTax(input(ONE_SEVENTH, { basis: false, decedentDate: true }), R);
    const exact = calculateTransferTax(input(ONE_SEVENTH, { basis: true, decedentDate: true }), R);
    expect(lthdAmount(legacy)).toBe(6_428_565_000);
    expect(lthdAmount(exact)).toBe(6_428_571_428);
    expect(legacy.determinedTax).toBe(41_397_219_750);
    expect(exact.determinedTax).toBe(41_397_220_715);
  });
});

describe("F-3 법정량 술어 — ⑧·⑫ 공용 (familyBusinessRateBasisError)", () => {
  const basis = (deductionAmount: number, businessEstateValue: number): FamilyBusinessRateBasis => ({
    kind: "deduction_ratio",
    deductionAmount,
    businessEstateValue,
  });

  it("F3-5: 법정량과 적용률이 다르면 차단 · 같으면 통과", () => {
    expect(familyBusinessRateBasisError(basis(400, 1200), 400 / 1200)).toBeNull();
    expect(familyBusinessRateBasisError(basis(400, 1200), 0.333333)).toMatch(/적용률이 입력한 금액으로 계산한 비율과 다릅니다/);
  });

  it("F3-7: 분모 0 · 분자 > 분모 · 소수 금액 · 음수 차단", () => {
    expect(familyBusinessRateBasisError(basis(0, 0), undefined)).toMatch(/가업상속 재산가액을 입력하세요/);
    expect(familyBusinessRateBasisError(basis(1300, 1200), undefined)).toMatch(/클 수 없습니다/);
    expect(familyBusinessRateBasisError(basis(400.5, 1200), undefined)).toMatch(/원 단위 금액/);
    expect(familyBusinessRateBasisError(basis(-1, 1200), undefined)).toMatch(/원 단위 금액/);
    expect(familyBusinessRateBasisError(undefined, 0.5)).toBeNull();
  });

  it("법인 ③2호 법정량 — (총자산 − 사업무관) ÷ 총자산", () => {
    const corp: FamilyBusinessRateBasis = { kind: "corporate_business_assets", totalAssets: 5_000_000_000, nonBusinessAssets: 1_000_000_000 };
    expect(resolveFamilyBusinessRateFraction(0, corp)).toEqual({ numerator: 4_000_000_000, denominator: 5_000_000_000 });
    expect(familyBusinessRateBasisError(corp, 0.8)).toBeNull();
    expect(
      familyBusinessRateBasisError({ kind: "corporate_business_assets", totalAssets: 1, nonBusinessAssets: 2 }, undefined),
    ).toMatch(/사업무관자산가액이 법인 총자산가액보다 클 수 없습니다/);
  });
});
