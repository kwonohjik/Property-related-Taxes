/**
 * Pre-Do anchor — 가업상속공제 자산 §95④ 후단 장기보유특별공제 「부분별 양도차익」
 *
 * 계획서: docs/02-design/features/transfer-fb-lthd-portion-gain.engine.plan.md (맨 끝 「사용자 결정」 표가 최종)
 * 법령: 「소득세법」 §95②·④ 후단 · §97의2④ · §97② · 「소득세법 시행령」 §160①
 *
 * 결함: 의제 §97의2④ 재귀가 **전체 양도차익**을 적용률 r로 안분해 LTHD 부분 차익을 만들었다. 교재는
 *       양도가액·양도비를 r로 나눠 **부분별 양도차익**을 구하고(적용분 = 피상속인 취득가액 base · 비적용분 = 상속개시일
 *       평가액 base) 부분마다 제 공제율을 곱한다.
 *
 * 사용자 결정(2026-11-26): Q-1 필요경비 r 안분 · **Q-2 (a) 차손 부분 공제 0 + 양수 부분 전액 공제** ·
 *   Q-3 감가상각비 취득가액 두 항 비율 안분 · Q-4 일반 §97 재귀 현행 비례 유지(비트 동일).
 *
 * 기대값은 **엔진 미사용 손계산**(스크래치 `hand2.py` — 정수 산식 + 2026 누진세율표)이다. 엔진 출력 복사 금지.
 *   기호: tD = ⌊A_d·n/d⌋ · tH = ⌊V·(d−n)/d⌋ · X = P − E = G + tD + tH − dep · depD = ⌊dep·tD/(tD+tH)⌋
 *         gD = ⌊X·n/d⌋ − (tD − depD) · gH = G − gD · tD' = ⌊T·max(gD,0)/G⌋ · tH'(양수 부분이 둘이면 T − tD')
 *
 * 공통 조건: 토지(S5만 주택) · 상속 2022-04-10 · 양도 2026-10-15 · 피상속인 취득 2012-03-08(14년 → mock 28%) ·
 *   상속인 4년 → 8% · 기본공제 250만원 · mock 세율(표1 연 2%·30% 상한).
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { splitFbSliceGains, splitFbTaxableGains } from "@/lib/tax-engine/family-business-lthd-slices";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import type { TransferTaxInput, TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

const R = makeMockRates();

interface Sample {
  n: number;
  d: number;
  ad: number;
  v: number;
  p: number;
  e: number;
  cap?: number;
  decCap?: number;
  dep?: number;
  house?: boolean;
}

/** 적용률은 정수 분수(법정량)로 싣는다 — 1/3 같은 비율도 정확하다(F-3). */
function run(s: Sample): TransferTaxResult {
  const input = baseTransferInput({
    propertyType: s.house ? "housing" : "land",
    transferPrice: s.p,
    acquisitionPrice: s.v,
    acquisitionDate: new Date("2022-04-10"),
    transferDate: new Date("2026-10-15"),
    acquisitionCause: "inheritance",
    decedentAcquisitionDate: new Date("2012-03-08"),
    isOneHousehold: !!s.house,
    householdHousingCount: s.house ? 1 : 0,
    residencePeriodMonths: s.house ? 48 : 0,
    expenses: 0,
    transferExpense: s.e,
    ...(s.cap ? { capitalExpenditure: s.cap } : {}),
    ...(s.dep ? { depreciationAmount: s.dep } : {}),
    reductions: [],
    annualBasicDeductionUsed: 0,
    familyBusinessInheritance: {
      decedentAcquisitionPrice: s.ad,
      inheritanceMarketValue: s.v,
      fbDeductionAppliedRate: s.n / s.d,
      inheritanceDate: "2022-04-10",
      ...(s.decCap ? { decedentCapitalExpenditure: s.decCap } : {}),
      fbRateBasis: { kind: "deduction_ratio", deductionAmount: s.n * 100_000_000, businessEstateValue: s.d * 100_000_000 },
    },
  } as Partial<TransferTaxInput>);
  return calculateTransferTax(input, R);
}

const lthd = (r: TransferTaxResult): number => r.steps.find((s) => s.label.includes("장기보유"))?.amount ?? -1;

/** 교재(이월과세5) — 乙 2012.3.8. 5억 취득 → 2022.4.10. 상속(평가 15억 · 적용률 70%) → 2026.10.15. 18억 양도 · 양도비 3천만 */
const S1: Sample = { n: 7, d: 10, ad: 500_000_000, v: 1_500_000_000, p: 1_800_000_000, e: 30_000_000 };
const S2: Sample = { ...S1, n: 1, d: 3 };
const S3: Sample = { ...S1, n: 1, d: 1 };
/** 비적용분 차손 — r=1/2 · A_d 1억 · V 20억 · P 16억 */
const S4: Sample = { n: 1, d: 2, ad: 100_000_000, v: 2_000_000_000, p: 1_600_000_000, e: 0 };
/** 고가주택 표2 — 거주 4년 · r=1/2 · A_d 3억 · V 12억 · P 20억 */
const S5: Sample = { n: 1, d: 2, ad: 300_000_000, v: 1_200_000_000, p: 2_000_000_000, e: 0, house: true };
const S6: Sample = { ...S1, cap: 20_000_000, decCap: 10_000_000 };
const S8: Sample = { ...S1, dep: 50_000_000 };
const S9: Sample = { n: 1, d: 3, ad: 700_000_003, v: 900_000_007, p: 2_000_000_001, e: 12_345_679 };

describe("SL-1 교재 사례 — 부분별 양도차익", () => {
  it("S1: 장기보유특별공제 255,400,000 · 과세표준 712,100,000 · 산출세액 263,142,000 · credit 204,004,000", () => {
    const r = run(S1);
    expect(r.transferGain).toBe(970_000_000);
    expect(lthd(r)).toBe(255_400_000); // 889,000,000 × 28% + 81,000,000 × 8%
    expect(r.taxBase).toBe(712_100_000);
    expect(r.calculatedTax).toBe(263_142_000);
    expect(r.familyBusinessDetail!.cgtUnderSection97).toBe(59_138_000);
    expect(r.familyBusinessDetail!.creditAmount).toBe(204_004_000);
  });

  it("S1 echo: 부분별 양도차익·취득가액 두 항·공제액", () => {
    const d = run(S1).fbLthdDetail!;
    expect(d.basis).toBe("slice_gain");
    expect(d.appliedRateFraction).toEqual({ numerator: 700_000_000, denominator: 1_000_000_000 });
    expect(d.decedentSlice.netTransferShare).toBe(1_239_000_000); // (18억 − 3천만) × 7/10
    expect(d.decedentSlice.acquisitionTerm).toBe(350_000_000);
    expect(d.decedentSlice.gain).toBe(889_000_000);
    expect(d.decedentSlice.taxableGain).toBe(889_000_000);
    expect(d.decedentSlice.holdingYears).toBe(14);
    expect(d.decedentSlice.holdingRate).toBe(0.28);
    expect(d.decedentSlice.deduction).toBe(248_920_000);
    expect(d.heirSlice.netTransferShare).toBe(531_000_000);
    expect(d.heirSlice.acquisitionTerm).toBe(450_000_000);
    expect(d.heirSlice.gain).toBe(81_000_000);
    expect(d.heirSlice.holdingYears).toBe(4);
    expect(d.heirSlice.deduction).toBe(6_480_000);
    expect(d.residenceDeduction).toBe(0);
    expect(d.lossSlice).toBeUndefined();
  });
});

describe("SL-2 회귀선 — r=1 (비적용분 없음)", () => {
  it("S3: 현행과 동일 (장특 355,600,000 · 산출세액 347,058,000 · credit 294,076,000)", () => {
    const r = run(S3);
    expect(lthd(r)).toBe(355_600_000);
    expect(r.calculatedTax).toBe(347_058_000);
    expect(r.familyBusinessDetail!.creditAmount).toBe(294_076_000);
  });
});

describe("SL-3 분수 1/3", () => {
  it("S2: 장특 132,933,333 · 산출세액 161,220,000 · credit 94,558,000", () => {
    const r = run(S2);
    expect(r.fbLthdDetail!.decedentSlice.gain).toBe(423_333_334);
    expect(r.fbLthdDetail!.heirSlice.gain).toBe(180_000_000);
    expect(lthd(r)).toBe(132_933_333);
    expect(r.taxBase).toBe(467_900_001); // 양도소득 과세표준은 천원 미만 절사 없음(엔진 규칙) — 손계산 467,900,001
    expect(r.calculatedTax).toBe(161_220_000);
    expect(r.familyBusinessDetail!.creditAmount).toBe(94_558_000);
  });
});

describe("SL-4 한 부분 차손 — Q-2 (a): 차손 부분 공제 0 + 양수 부분 전액 공제", () => {
  it("S4: 장특 210,000,000(= 750,000,000 × 28%) · 산출세액 109,060,000 · 비적용분 차손", () => {
    const r = run(S4);
    expect(r.transferGain).toBe(550_000_000);
    expect(lthd(r)).toBe(210_000_000);
    expect(r.taxBase).toBe(337_500_000);
    expect(r.calculatedTax).toBe(109_060_000);
    expect(r.familyBusinessDetail!.cgtUnderSection97).toBe(0);
    expect(r.familyBusinessDetail!.creditAmount).toBe(109_060_000);
    const d = r.fbLthdDetail!;
    expect(d.decedentSlice.gain).toBe(750_000_000);
    expect(d.heirSlice.gain).toBe(-200_000_000);
    expect(d.heirSlice.taxableGain).toBe(0);
    expect(d.heirSlice.deduction).toBe(0);
    expect(d.lossSlice).toBe("heir");
  });

  it("S4: «확인 필요» 고지가 warnings에 실린다", () => {
    expect((run(S4).warnings ?? []).some((w) => w.includes("양도차손") && w.includes("확인 필요"))).toBe(true);
    expect((run(S1).warnings ?? []).some((w) => w.includes("확인 필요") && w.includes("양도차손 부분"))).toBe(false);
  });
});

describe("SL-4b 적용분 차손 (반대쪽)", () => {
  /**
   * r=1/2 · A_d 14억 · V 2억 · P 10억 · 양도비 0 — tD 7억 · tH 1억 · G = 10억 − 8억 = 2억 · X = 10억
   *   gD = ⌊10억 × 1/2⌋ − 7억 = −2억(차손) · gH = 2억 − (−2억) = 4억
   *   Q-2 (a): tD' = 0(차손 부분 공제 0) · tH' = ⌊T × 4억 ÷ 2억⌋ = 4억 → 4억 × 8%(상속개시일 4년) = 32,000,000
   */
  it("S4b: 장특 32,000,000 · 적용분 차손(lossSlice = decedent) · 고지", () => {
    const r = run({ n: 1, d: 2, ad: 1_400_000_000, v: 200_000_000, p: 1_000_000_000, e: 0 });
    expect(r.transferGain).toBe(200_000_000);
    const d = r.fbLthdDetail!;
    expect(d.decedentSlice.gain).toBe(-200_000_000);
    expect(d.decedentSlice.taxableGain).toBe(0);
    expect(d.heirSlice.gain).toBe(400_000_000);
    expect(d.heirSlice.taxableGain).toBe(400_000_000);
    expect(d.lossSlice).toBe("decedent");
    expect(lthd(r)).toBe(32_000_000);
    expect((r.warnings ?? []).some((w) => w.includes("양도차손") && w.includes("확인 필요"))).toBe(true);
  });
});

describe("SL-5 고가주택 표2 — 12억 초과 안분 · 거주분은 전체 과세 양도차익", () => {
  it("S5: 장특 241,600,000 · 거주분 80,000,000 · 일반 §97 세액 47,206,000 불변", () => {
    const r = run(S5);
    expect(r.taxableGain).toBe(500_000_000);
    expect(lthd(r)).toBe(241_600_000); // 340,000,000 × 40% + 160,000,000 × 16% + 500,000,000 × 16%
    expect(r.taxBase).toBe(255_900_000);
    expect(r.calculatedTax).toBe(77_302_000);
    expect(r.familyBusinessDetail!.cgtUnderSection97).toBe(47_206_000);
    expect(r.familyBusinessDetail!.creditAmount).toBe(30_096_000);
    const d = r.fbLthdDetail!;
    expect(d.decedentSlice.gain).toBe(850_000_000);
    expect(d.decedentSlice.taxableGain).toBe(340_000_000);
    expect(d.heirSlice.taxableGain).toBe(160_000_000);
    expect(d.residenceDeduction).toBe(80_000_000);
  });
});

describe("SL-6 필요경비 — Q-1 r 안분 · 피상속인 자본적지출은 취득가액 1호 base", () => {
  it("S6: 장특 249,040,000 · 산출세액 254,473,200 · credit 201,263,200", () => {
    const r = run(S6);
    expect(r.transferGain).toBe(943_000_000);
    expect(r.fbLthdDetail!.decedentSlice.acquisitionTerm).toBe(357_000_000);
    expect(r.fbLthdDetail!.decedentSlice.gain).toBe(868_000_000);
    expect(lthd(r)).toBe(249_040_000);
    expect(r.calculatedTax).toBe(254_473_200);
    expect(r.familyBusinessDetail!.creditAmount).toBe(201_263_200);
  });
});

describe("SL-7 감가상각비 §97③ — Q-3 (1) 취득가액 두 항 비율 안분", () => {
  it("S8: depD = ⌊50,000,000 × 350/800⌋ = 21,875,000 → gD 910,875,000 · 장특 263,775,000", () => {
    const r = run(S8);
    expect(r.transferGain).toBe(1_020_000_000);
    expect(r.fbLthdDetail!.decedentSlice.gain).toBe(910_875_000);
    expect(r.fbLthdDetail!.heirSlice.gain).toBe(109_125_000);
    expect(lthd(r)).toBe(263_775_000);
    expect(r.taxBase).toBe(753_725_000);
    expect(r.calculatedTax).toBe(280_624_500);
    expect(r.familyBusinessDetail!.cgtUnderSection97).toBe(73_958_000);
    expect(r.familyBusinessDetail!.creditAmount).toBe(206_666_500);
  });
});

describe("SL-8 홀수 금액 — Σ 불변식", () => {
  it("S9: 장특 178,189,299 · gD + gH = G · 산출세액 372,985,307", () => {
    const r = run(S9);
    const d = r.fbLthdDetail!;
    expect(d.decedentSlice.gain).toBe(429_218_106);
    expect(d.heirSlice.gain).toBe(725_102_878);
    expect(d.decedentSlice.gain + d.heirSlice.gain).toBe(r.transferGain);
    expect(d.decedentSlice.taxableGain + d.heirSlice.taxableGain).toBe(r.taxableGain);
    expect(lthd(r)).toBe(178_189_299);
    expect(r.taxBase).toBe(973_631_685); // 천원 미만 절사 없음 — 손계산 973,631,685
    expect(r.calculatedTax).toBe(372_985_307); // 973,631,685 × 42% − 35,940,000
    expect(r.familyBusinessDetail!.creditAmount).toBe(20_160_001); // 372,985,307 − 일반 §97 352,825,306
  });
});

describe("SL-9 일반 §97 재귀 불변 (Q-4 (a) — 현행 비례 안분, 비트 동일)", () => {
  it("일반 §97 세액: S1 59,138,000 · S5 47,206,000 · S2 66,662,000 · S6 53,210,000 · S3 52,982,000 · S9 352,825,306", () => {
    expect(run(S1).familyBusinessDetail!.cgtUnderSection97).toBe(59_138_000);
    expect(run(S5).familyBusinessDetail!.cgtUnderSection97).toBe(47_206_000);
    expect(run(S2).familyBusinessDetail!.cgtUnderSection97).toBe(66_662_000);
    expect(run(S6).familyBusinessDetail!.cgtUnderSection97).toBe(53_210_000);
    expect(run(S3).familyBusinessDetail!.cgtUnderSection97).toBe(52_982_000);
    expect(run(S9).familyBusinessDetail!.cgtUnderSection97).toBe(352_825_306);
  });
});

describe("SL-10 leaf 격자 — Σ 불변식 · 경계", () => {
  const fracs = [
    [0, 1],
    [1, 7],
    [1, 3],
    [1, 2],
    [7, 10],
    [1, 1],
  ] as const;
  const bases = [
    { x: 1_999_999_999, ad: 700_000_003, v: 900_000_007 },
    { x: 1_234_567_891, ad: 300_000_001, v: 1_700_000_009 },
    { x: 987_654_321, ad: 123_456_789, v: 456_789_123 },
  ];

  it("gD + gH = G · 양수 부분 둘이면 tD' + tH' = T · 0 ≤ tD' ≤ T · T=G이면 tD' = gD", () => {
    for (const [n, d] of fracs) {
      for (const b of bases) {
        // 정수 오차 없이 BigInt로 기대 항을 구한다
        const tDb = Number((BigInt(b.ad) * BigInt(n)) / BigInt(d));
        const tHb = Number((BigInt(b.v) * BigInt(d - n)) / BigInt(d));
        const G = b.x - tDb - tHb;
        if (G <= 0) continue;
        const s = splitFbSliceGains({
          transferGain: G,
          depreciationAmount: 0,
          terms: { decedentTerm: tDb, heirTerm: tHb },
          fraction: { numerator: n, denominator: d },
        })!;
        expect(s.decedent + s.heir).toBe(G);
        for (const T of [G, Math.floor(G * 0.4), 1]) {
          const t = splitFbTaxableGains(T, s.decedent, s.heir);
          if (s.decedent > 0 && s.heir > 0) {
            expect(t.decedent + t.heir).toBe(T);
            expect(t.decedent).toBeGreaterThanOrEqual(0);
            expect(t.decedent).toBeLessThanOrEqual(T);
          }
          if (T === G) expect(t.decedent).toBe(Math.max(s.decedent, 0));
        }
      }
    }
  });

  it("G ≤ 0 → 주입 없음(undefined) · 취득가액 두 항이 0이면 감가상각비 안분 분모 0 없음", () => {
    expect(
      splitFbSliceGains({ transferGain: 0, depreciationAmount: 0, terms: { decedentTerm: 1, heirTerm: 1 }, fraction: { numerator: 1, denominator: 2 } }),
    ).toBeUndefined();
    expect(
      splitFbSliceGains({ transferGain: 10, depreciationAmount: 0, terms: { decedentTerm: 0, heirTerm: 0 }, fraction: { numerator: 1, denominator: 2 } }),
    ).toEqual({ decedent: 5, heir: 5, decedentNetShare: 5, heirNetShare: 5 });
  });
});

describe("SL-12 스케일 프리 — 금액이 절반이어도 부분 몫 비율 동일", () => {
  it("S1의 모든 금액 절반: Σ 유지 · 장특 정확히 절반", () => {
    const r = run({ ...S1, p: 900_000_000, e: 15_000_000, v: 750_000_000, ad: 250_000_000 });
    const d = r.fbLthdDetail!;
    expect(d.decedentSlice.gain + d.heirSlice.gain).toBe(r.transferGain);
    // 절반 스케일이라 S1의 정확히 1/2
    expect(lthd(r)).toBe(127_700_000);
  });
});

describe("SL-13 산식 문구·sub-step — 부분별 공제와 자기모순 없음 (UQ-5 동행 정정)", () => {
  it("S1 장특 step: 부분별 양도차익 × 부분별 공제율 = 합계 (실효율 head 없음)", () => {
    const step = run(S1).steps.find((x) => x.label === "장기보유특별공제")!;
    expect(step.formula).toBe(
      "적용분(가업상속공제적용률 70%) 양도차익 889,000,000 × 28% (피상속인 취득일부터 14년)" +
        " + 비적용분 양도차익 81,000,000 × 8% (상속개시일부터 4년) = 255,400,000 (소득세법 §95④ 후단)",
    );
    expect(step.amount).toBe(255_400_000);
  });

  it("S4 장특 step: 차손 부분은 0%로 쓴다", () => {
    const step = run(S4).steps.find((x) => x.label === "장기보유특별공제")!;
    expect(step.formula).toContain("비적용분 양도차손 -200,000,000 × 0% (차손 부분은 공제하지 않음)");
  });

  it("S5 표2 sub-step: 보유분 = 부분별 보유분 공제 합 161,600,000 · 거주분 80,000,000 (합 = 총 공제)", () => {
    const r = run(S5);
    const sub = r.steps.filter((x) => x.sub && x.legalBasis === r.steps.find((y) => y.label === "장기보유특별공제")!.legalBasis);
    const holding = sub.find((x) => x.label.includes("보유"));
    const residence = sub.find((x) => x.label.includes("거주"));
    expect(holding?.amount).toBe(161_600_000); // 340,000,000 × 40% + 160,000,000 × 16%
    expect(residence?.amount).toBe(80_000_000); // 500,000,000 × 16%
    expect(holding!.amount + residence!.amount).toBe(lthd(r));
  });
});
