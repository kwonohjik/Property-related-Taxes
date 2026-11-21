/**
 * 지분 규약 `applyRatio` — 순환 소수 지분(3/11 · 6/11 …) 1원 과소 anchor (2026-11-21 사용자 결정: 분수 복원으로 고친다)
 *
 * 계획: docs/00-pm/share-ratio-apply-float-precision.plan.md (2026-10-21 Q1 (a) «순환 소수는 옛 식» 결정을 뒤집음)
 *
 * 레거시 분자/분모 지분(분모 ≤ 1000 — `ownershipRatioError`)은 `3/11`처럼 순환 소수라 십진화(`decimalizeRatio`)가 못 잡고
 * 옛 식 `Math.floor(amount × ratio)`로 떨어졌다. double(3/11) < 3/11이라 참값이 정수인 곱에서 1원이 깎인다
 * (880,000,000 × 3/11 → 239,999,999). 부담부증여에서는 그 1원이 증여가액 C를 채무(담보평가)보다 작게 만들어
 * 평가 방법 자체가 바뀌기도 한다(아래 동률 사례).
 *
 * 기대값은 리터럴 + BigInt 오라클(분자·분모를 정수로 직접 곱·나눗셈 — 엔진 구현과 겹치지 않는다)로 고정한다.
 */
import { describe, it, expect } from "vitest";
import { applyRatio } from "@/lib/tax-engine/tax-utils";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

/** 참값 floor(amount × n / d) — BigInt (음수는 floor 보정) */
function exactFrac(amount: number, n: number, d: number): number {
  const num = BigInt(amount) * BigInt(n);
  const den = BigInt(d);
  const q = num / den;
  return Number(num < 0n && q * den !== num ? q - 1n : q);
}
const oldApply = (amount: number, ratio: number) => Math.floor(amount * ratio);

describe("applyRatio — 순환 소수 지분(분모 ≤ 1000)은 참값", () => {
  it("전제: 옛 식은 880,000,000 × 3/11 · 6/11에서 1원 과소다", () => {
    expect(exactFrac(880_000_000, 3, 11)).toBe(240_000_000);
    expect(exactFrac(880_000_000, 6, 11)).toBe(480_000_000);
    expect(oldApply(880_000_000, 3 / 11)).toBe(239_999_999);
    expect(oldApply(880_000_000, 6 / 11)).toBe(479_999_999);
  });
  it("🔴 880,000,000 × 3/11 = 240,000,000", () => {
    expect(applyRatio(880_000_000, 3 / 11)).toBe(240_000_000);
  });
  it("🔴 880,000,000 × 6/11 = 480,000,000", () => {
    expect(applyRatio(880_000_000, 6 / 11)).toBe(480_000_000);
  });
  it("🔴 440,000,000 × 3/11 = 120,000,000 · 110,000,000 × 3/11 = 30,000,000 · 55,000,000 × 3/11 = 15,000,000", () => {
    expect(applyRatio(440_000_000, 3 / 11)).toBe(120_000_000);
    expect(applyRatio(110_000_000, 3 / 11)).toBe(30_000_000);
    expect(applyRatio(55_000_000, 3 / 11)).toBe(15_000_000);
  });
  it("🔑 음수 금액 — floor(−880,000,000 × 3/11) = −240,000,000 · floor(−10 × 3/11) = −3 · floor(−1 × 3/11) = −1", () => {
    expect(applyRatio(-880_000_000, 3 / 11)).toBe(-240_000_000);
    expect(applyRatio(-10, 3 / 11)).toBe(-3);
    expect(applyRatio(-1, 3 / 11)).toBe(-1);
    expect(applyRatio(-880_000_001, 6 / 11)).toBe(exactFrac(-880_000_001, 6, 11));
  });
  it("1/3 · 2/3 · 1/7 — 참값과 같고 옛 식과도 같다(변화 없음)", () => {
    expect(applyRatio(300_000_000, 1 / 3)).toBe(100_000_000);
    expect(applyRatio(900_000_000, 2 / 3)).toBe(600_000_000);
    expect(applyRatio(700_000_000, 1 / 7)).toBe(100_000_000);
    for (const x of [1, 100, 999_999_999, 5_000_000_000]) {
      expect(applyRatio(x, 1 / 3)).toBe(oldApply(x, 1 / 3));
      expect(applyRatio(x, 2 / 3)).toBe(oldApply(x, 2 / 3));
      expect(applyRatio(x, 1 / 7)).toBe(oldApply(x, 1 / 7));
    }
  });
  it("🔑 기약분수 p/q (q ≤ 60) × 금액 격자 전수 — 참값과 1건도 다르지 않다", () => {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const amounts = [1, 7, 110_000_000, 880_000_000, 1_518_341_200, 4_999_999_999];
    let n = 0;
    const bad: string[] = [];
    for (let q = 2; q <= 60; q++) {
      for (let p = 1; p < q; p++) {
        if (gcd(p, q) !== 1) continue;
        for (const base of amounts) {
          const x = base * q; // 참값이 정수가 되는 금액(옛 식이 1원 과소가 나는 자리)
          if (!Number.isSafeInteger(x)) continue;
          n++;
          if (applyRatio(x, p / q) !== exactFrac(x, p, q)) bad.push(`${x}×${p}/${q}`);
          if (applyRatio(base, p / q) !== exactFrac(base, p, q)) bad.push(`${base}×${p}/${q}`);
        }
      }
    }
    expect(n).toBeGreaterThan(5000);
    expect(bad.slice(0, 5), `${bad.length}건 불일치`).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 엔진 풀 파이프라인 — 부담부증여 · 주택 · 2주택(비조정) · 지분 3/11
// ──────────────────────────────────────────────────────────────────────────────
const rates = makeMockRates();

function bgInput(info: Partial<BurdenedGiftInfo>) {
  return baseTransferInput({
    propertyType: "housing",
    transferType: "burdened_gift",
    acquisitionDate: new Date("2015-03-01"),
    transferDate: new Date("2024-03-01"),
    transferPrice: 0,
    acquisitionPrice: 0,
    isOneHousehold: false,
    householdHousingCount: 2,
    ownershipRatio: 3 / 11,
    burdenedGiftInfo: {
      valuationMode: "sangjeungbeop_standard",
      lendingDepositTotal: 0,
      mortgageDebtAmount: 150_000_000,
      annualRentTotal: 0,
      donorRelation: "lineal_descendant",
      landStdPriceAtTransfer: 0,
      buildingStdPriceAtTransfer: 880_000_000,
      landStdPriceAtAcquisition: 0,
      buildingStdPriceAtAcquisition: 440_000_000,
      ...info,
    } as BurdenedGiftInfo,
  } as never);
}

describe("부담부증여 지분 3/11 — 기준시가 평가 (calculateTransferTax)", () => {
  /*
   * 손 계산:
   *  C = 880,000,000 × 3/11 = 240,000,000 (보충적) · B = 150,000,000 · B/C = 5/8
   *  양도가액 = C × B/C = 150,000,000
   *  취득가액 = 440,000,000 × 3/11 × 5/8 = 120,000,000 × 5/8 = 75,000,000
   *  개산공제 = 75,000,000 × 3% = 2,250,000
   *  양도차익 = 150,000,000 − 75,000,000 − 2,250,000 = 72,750,000
   *  장기보유 9년 × 2% = 18% → 13,095,000 · 양도소득금액 59,655,000 · 기본공제 2,500,000
   *  과세표준 = 57,155,000 · 산출세액 = 57,155,000 × 24% − 5,760,000 = 7,957,200 · 지방 795,720 · 합계 8,752,920
   */
  const r = calculateTransferTax(bgInput({}), rates);
  const bg = r.transferBurdenedGiftBreakdown!;

  it("🔴 증여가액 C(보충적) = 240,000,000 (옛 239,999,999)", () => {
    expect(bg.sangjeungbeopValuation.supplementary).toBe(240_000_000);
    expect(bg.sangjeungbeopValuation.selectedMode).toBe("supplementary");
    expect(bg.sangjeungbeopValuation.max).toBe(240_000_000);
  });
  it("🔴 양도차익 72,750,000 (옛 72,750,002) · 과세표준 57,155,000 (옛 57,155,002)", () => {
    expect(r.transferGain).toBe(72_750_000);
    expect(r.taxBase).toBe(57_155_000);
  });
  it("세액은 절사로 같다 — 결정세액 7,957,200 · 지방 795,720 · 합계 8,752,920", () => {
    expect(r.determinedTax).toBe(7_957_200);
    expect(r.localIncomeTax).toBe(795_720);
    expect(r.totalTax).toBe(8_752_920);
  });
});

describe("부담부증여 지분 3/11 — 시가 = 채무 동률 (평가 방법이 1원에 뒤집히지 않는다)", () => {
  /*
   * 시가 110,000,000 × 3/11 = 30,000,000 = 채무(담보평가) 30,000,000 → 동률이면 담보가 «크지» 않으므로 시가 채택(엄격 >).
   * 옛 식은 시가가 29,999,999라 담보평가가 이겨 취득가액이 기준시가(+개산공제)로 강제됐다(총세액 622,446).
   * 손 계산(시가 채택):
   *  B/C = 1 · 양도가액 30,000,000 · 취득가액 = 실지취득가액 55,000,000 × 3/11 × B/C = 15,000,000 (K-4 실가 — 개산공제 없음)
   *  양도차익 15,000,000 · 장특 18% 2,700,000 → 12,300,000 · 기본공제 2,500,000 → 과세표준 9,800,000
   *  산출세액 9,800,000 × 6% = 588,000 · 지방 58,800 · 합계 646,800
   */
  const r = calculateTransferTax(
    bgInput({
      valuationMode: "sangjeungbeop_market",
      buildingStdPriceAtTransfer: 110_000_000,
      buildingStdPriceAtAcquisition: 55_000_000,
      marketValueAtTransfer: 110_000_000,
      acquisitionMethod: "actual",
      actualAcquisitionTotal: 55_000_000,
      mortgageDebtAmount: 30_000_000,
    }),
    rates,
  );
  const bg = r.transferBurdenedGiftBreakdown!;

  it("🔴 시가 30,000,000 = 담보 30,000,000 → 시가(supplementary) 채택 · 기준시가 강제 없음", () => {
    expect(bg.sangjeungbeopValuation.supplementary).toBe(30_000_000);
    expect(bg.sangjeungbeopValuation.mortgage).toBe(30_000_000);
    expect(bg.sangjeungbeopValuation.selectedMode).toBe("supplementary");
    expect(bg.acquisitionStdForcedByCollateral).toBeUndefined();
  });
  it("🔴 양도차익 15,000,000 · 과세표준 9,800,000 · 합계 646,800 (옛 622,446)", () => {
    expect(r.transferGain).toBe(15_000_000);
    expect(r.taxBase).toBe(9_800_000);
    expect(r.determinedTax).toBe(588_000);
    expect(r.localIncomeTax).toBe(58_800);
    expect(r.totalTax).toBe(646_800);
  });
});
