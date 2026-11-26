/**
 * anchor — 가업상속공제 자산 §95④ 후단 「부분별 양도차익」 슬라이스의 전제 가드 · 양도차익 상한 · 파트 분할 echo
 *
 * 계획서: docs/02-design/features/transfer-fb-lthd-portion-gain.engine.plan.md (맨 끝 「사용자 결정」 표)
 * 리뷰: PR #3678 동기화 점검 — H-1 (부담부증여) · M-1 (양도차익 상한) · M-2 (부분 비사업용 토지) · M-3 (지분 모드)
 *
 * 슬라이스는 `X = G + tD + tH − dep`가 `양도가액 − 필요경비`라는 전제 위에서만 성립한다 — 실제 계산에 쓰인 취득가액이 의제 취득가액이 아니거나
 * 양도가액이 물건 전체가 아니면 가짜 차손 부분이 생긴다. 그 입력은 PR 전 비례 안분 경로로 후퇴한다(echo 없음 · PR 전과 비트 동일).
 *
 * 기대값은 손계산이다(엔진 출력 복사 금지). 공통: 토지 · 상속 2022-04-10 · 양도 2026-10-15 · 피상속인 취득 2012-03-08(14년 → mock 28%) ·
 *   상속인 4년 → 8% · mock 세율(표1 연 2%).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { withFbSliceGains } from "@/lib/tax-engine/family-business-lthd-slices";
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
  house?: boolean;
  acq?: string;
  td?: string;
  extra?: Partial<TransferTaxInput>;
}

function run(s: Sample): TransferTaxResult {
  const acq = s.acq ?? "2022-04-10";
  const input = baseTransferInput({
    propertyType: s.house ? "housing" : "land",
    transferPrice: s.p,
    acquisitionPrice: s.v,
    acquisitionDate: new Date(acq),
    transferDate: new Date(s.td ?? "2026-10-15"),
    acquisitionCause: "inheritance",
    decedentAcquisitionDate: new Date("2012-03-08"),
    isOneHousehold: !!s.house,
    householdHousingCount: s.house ? 1 : 0,
    residencePeriodMonths: s.house ? 48 : 0,
    expenses: 0,
    transferExpense: s.e,
    reductions: [],
    annualBasicDeductionUsed: 0,
    ...(s.extra ?? {}),
    familyBusinessInheritance: {
      decedentAcquisitionPrice: s.ad,
      inheritanceMarketValue: s.v,
      fbDeductionAppliedRate: s.n / s.d,
      inheritanceDate: acq,
      fbRateBasis: { kind: "deduction_ratio", deductionAmount: s.n * 100_000_000, businessEstateValue: s.d * 100_000_000 },
    },
  } as Partial<TransferTaxInput>);
  return calculateTransferTax(input, R);
}

const lthdStep = (r: TransferTaxResult) => r.steps.find((s) => s.label.includes("장기보유") && !s.sub);
const hasLossNotice = (r: TransferTaxResult): boolean => (r.warnings ?? []).some((w) => w.includes("양도차손") && w.includes("확인 필요"));

/** 교재 S1 — r=7/10 · A_d 5억 · V 15억 · P 18억 · 양도비 3천만 → tD 3.5억 · tH 4.5억 */
const S1: Sample = { n: 7, d: 10, ad: 500_000_000, v: 1_500_000_000, p: 1_800_000_000, e: 30_000_000 };

describe("PG-1 부담부증여 (H-1) — 취득가액이 채무비율로 다시 정해지면 슬라이스를 만들지 않는다", () => {
  /**
   * 부담부증여 채무 9억 · 증여가액(기준시가) 18억 · 취득시 기준시가 10억 → STEP 0.48이 취득가액을 다시 정한다.
   * 양도차익 G = 385,000,000. 슬라이스를 만들면 취득가액이 아닌 의제 취득가액 8억으로 X를 역산해 적용분 479,500,000 · 비적용분 −94,500,000이라는
   * 거짓 차손이 생기고 장특 134,260,000으로 부풀었다(PR 전 84,700,000).
   *
   * 손계산(PR 전 비례 안분): 385,000,000 × 70% = 269,500,000 × 28%(14년) = 75,460,000 + 115,500,000 × 8%(4년) = 9,240,000 → 84,700,000.
   *   과세표준 = 385,000,000 − 84,700,000 − 2,500,000 = 297,800,000 · 산출세액 = 297,800,000 × 38% − 19,940,000 = 93,224,000.
   */
  const bgSample = (): TransferTaxResult =>
    run({
      ...S1,
      p: 1_800_000_000,
      e: 0,
      extra: {
        transferType: "burdened_gift",
        burdenedGiftInfo: {
          valuationMode: "sangjeungbeop_standard",
          lendingDepositTotal: 0,
          mortgageDebtAmount: 900_000_000,
          annualRentTotal: 0,
          donorRelation: "lineal_descendant",
          landStdPriceAtTransfer: 1_800_000_000,
          buildingStdPriceAtTransfer: 0,
          landStdPriceAtAcquisition: 1_000_000_000,
          buildingStdPriceAtAcquisition: 0,
        },
      } as Partial<TransferTaxInput>,
    });

  it("PR 전과 비트 동일 — 장특 84,700,000 · 과세표준 297,800,000 · 산출세액 93,224,000 · echo·차손 고지 없음", () => {
    const r = bgSample();
    expect(r.transferGain).toBe(385_000_000);
    expect(lthdStep(r)?.amount).toBe(84_700_000);
    expect(r.longTermHoldingDeduction).toBe(84_700_000);
    expect(r.taxBase).toBe(297_800_000);
    expect(r.calculatedTax).toBe(93_224_000);
    expect(r.fbLthdDetail).toBeUndefined();
    expect(hasLossNotice(r)).toBe(false);
  });

  it("leaf — 취득가액이 의제 취득가액과 다르면 입력 그대로, 같으면 슬라이스를 싣는다(가드 경계)", () => {
    const base = {
      fbLthdLatter: {
        appliedRate: 0.7,
        appliedRateFraction: { numerator: 7, denominator: 10 },
        decedentAcquisitionDate: new Date("2012-03-08"),
        imputedTerms: { decedentTerm: 350_000_000, heirTerm: 450_000_000 },
      },
    } as unknown as TransferTaxInput;
    const premise = { transferPrice: 1_800_000_000 };
    expect(withFbSliceGains(base, 385_000_000, 0, { ...premise, acquisitionUsed: 800_000_001 })).toBe(base);
    expect(withFbSliceGains(base, 385_000_000, 0, { ...premise, acquisitionUsed: undefined })).toBe(base);
    expect(withFbSliceGains(base, 385_000_000, 0, { ...premise, acquisitionUsed: 800_000_000 }).fbLthdLatter?.sliceGains).toBeDefined();
  });
});

describe("PG-2 지분 모드 — STEP 0.42가 가업상속 입력도 지분분으로 줄이므로 슬라이스를 만든다 (transfer-fb-share Q-4)", () => {
  /**
   * 반전(공유 단언 반전 — 근거 남김): #3678 M-3은 가업상속 입력(피상속인 취득가 5억 · 평가액 15억)이 물건 전체 값 그대로라
   * 지분 1/2 양도가액 9억과 스케일이 달라 거짓 차손이 생기므로 후퇴(장특 18,700,000)했다. transfer-fb-share 계획(최종 결정 Q-2·Q-4)으로
   * STEP 0.42가 세 금액을 지분율로 줄이게 되어 전제가 성립한다 → 가드를 풀고 슬라이스를 만든다.
   *
   * 손계산(계획서 §3.4): A' 250,000,000 · V' 750,000,000 → tD 175,000,000 · tH 225,000,000 → 의제 400,000,000.
   *   G = 900,000,000 − 400,000,000 − 15,000,000 = 485,000,000 · X = 885,000,000 → ⌊X × 7/10⌋ = 619,500,000
   *   gD = 444,500,000 × 28% = 124,460,000 · gH = 40,500,000 × 8% = 3,240,000 → 장특 127,700,000.
   * 짝(후퇴 유지): 지분 없이 총 물건가만 다른 둘째 it · 부담부증여 PG-1.
   */
  const shareSample = (): TransferTaxResult =>
    run({ ...S1, p: 900_000_000, e: 15_000_000, extra: { ownershipRatio: 0.5, totalPropertyTransferPrice: 1_800_000_000 } });

  it("지분 1/2 — 장특 127,700,000 · 슬라이스 echo · 차손 고지 없음", () => {
    const r = shareSample();
    expect(r.transferGain).toBe(485_000_000);
    expect(lthdStep(r)?.amount).toBe(127_700_000);
    expect(r.fbLthdDetail?.basis).toBe("slice_gain");
    expect(hasLossNotice(r)).toBe(false);
  });

  it("총 물건가 분모(12억 안분)만 실려도 양도가액이 전체가 아니므로 후퇴한다", () => {
    const r = run({ ...S1, p: 900_000_000, e: 15_000_000, extra: { totalPropertyTransferPrice: 1_800_000_000 } });
    expect(r.fbLthdDetail).toBeUndefined();
    expect(lthdStep(r)?.amount).toBe(18_700_000);
  });

  it("짝 — 단독 양도(지분 아님)는 종전대로 슬라이스: 교재 S1 장특 255,400,000 · 과세표준 712,100,000", () => {
    const r = run(S1);
    expect(r.fbLthdDetail?.basis).toBe("slice_gain");
    expect(lthdStep(r)?.amount).toBe(255_400_000);
    expect(r.taxBase).toBe(712_100_000);
  });
});

describe("PG-3 부분 비사업용 토지 (M-2) — 파트 분할 경로는 사업용 파트만 담은 echo를 싣지 않는다", () => {
  /**
   * 상속 2014-04-10 · 양도 2016-10-15 · 비사업용 50%(2016년 양도는 두 파트의 장특 규칙이 갈린다 — 파트별 장특 경로).
   * 교재 S1 금액 — G = 970,000,000 · 파트 485,000,000씩. 적용분 889,000,000 × 50% = 444,500,000 × 12%(피상속인 4년·2016년 표) = 53,340,000 ·
   * 비적용분 상속인 2년 → 0%. 두 파트 모두 53,340,000 → 합 106,680,000(세액·공제액은 echo를 빼도 불변).
   */
  it("장특 합계 106,680,000 · 비사업용 파트 53,340,000 + 사업용 파트 53,340,000 · fbLthdDetail 없음", () => {
    const r = run({ ...S1, acq: "2014-04-10", td: "2016-10-15", extra: { isNonBusinessLand: true, nonBusinessLandAreaRatio: 0.5 } });
    expect(r.transferGain).toBe(970_000_000);
    expect(r.longTermHoldingDeduction).toBe(106_680_000);
    expect(r.nblPartLthd?.nonBusinessDeduction).toBe(53_340_000);
    expect(r.nblPartLthd?.businessDeduction).toBe(53_340_000);
    expect(r.fbLthdDetail).toBeUndefined();
  });
});

describe("PG-4 양도차익 상한 (M-1) — 부분별 공제액 합이 과세 양도차익을 넘으면 양도차익으로 제한", () => {
  /**
   * r=1/2 · A_d 1,000,000 · V 1,980,000,000 · P 10억 · 양도비 0 — tD 500,000 · tH 990,000,000 · G = 10억 − 990,500,000 = 9,500,000
   *   X = 10억 · gD = 5억 − 500,000 = 499,500,000 · gH = 9,500,000 − 499,500,000 = −490,000,000(차손)
   *   Q-2 (a)만 적용하면 적용분 499,500,000 × 28% = 139,860,000(= 양도차익의 14.7배, 실효율 1472%) → 양도차익 9,500,000으로 제한.
   */
  const M1: Sample = { n: 1, d: 2, ad: 1_000_000, v: 1_980_000_000, p: 1_000_000_000, e: 0 };

  it("장특 = 양도차익 9,500,000(제한 전 139,860,000) · 실효율 1 · 과세표준 0 · cappedToGain", () => {
    const r = run(M1);
    expect(r.transferGain).toBe(9_500_000);
    const d = r.fbLthdDetail!;
    expect(d.decedentSlice.gain).toBe(499_500_000);
    expect(d.decedentSlice.deduction).toBe(139_860_000); // 부분 공제액은 제한 전 값 그대로
    expect(d.heirSlice.gain).toBe(-490_000_000);
    expect(d.lossSlice).toBe("heir");
    expect(d.cappedToGain).toBe(true);
    expect(lthdStep(r)?.amount).toBe(9_500_000);
    expect(r.longTermHoldingDeduction).toBe(9_500_000);
    expect(d.effectiveRate).toBe(1);
    expect(r.longTermHoldingRate).toBe(1);
    expect(r.taxBase).toBe(0);
    expect(r.calculatedTax).toBe(0);
  });

  it("고지 — 차손 확인 필요 + «양도차익 범위로 제한» 문장 · 산식에도 제한을 쓴다", () => {
    const r = run(M1);
    expect((r.warnings ?? []).some((w) => w.includes("양도차손") && w.includes("양도차익 범위로 제한") && w.includes("확인 필요"))).toBe(true);
    expect(lthdStep(r)?.formula).toContain("양도차익 범위로 제한");
  });

  it("실효율은 어떤 격자에서도 1을 넘지 않는다(공제액 ≤ 과세 양도차익)", () => {
    for (const v of [1_980_000_000, 1_500_000_000, 1_200_000_000]) {
      for (const ad of [1_000_000, 100_000_000, 400_000_000]) {
        for (const p of [1_000_000_000, 1_400_000_000]) {
          const r = run({ n: 1, d: 2, ad, v, p, e: 0 });
          if (r.transferGain <= 0) continue;
          expect(r.longTermHoldingDeduction).toBeLessThanOrEqual(r.taxableGain);
          if (r.fbLthdDetail) expect(r.fbLthdDetail.effectiveRate).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("제한이 걸리지 않는 사례는 불변 — S4(비적용분 차손) 210,000,000 · cappedToGain 없음 · 고지에 제한 문장 없음", () => {
    const r = run({ n: 1, d: 2, ad: 100_000_000, v: 2_000_000_000, p: 1_600_000_000, e: 0 });
    expect(lthdStep(r)?.amount).toBe(210_000_000);
    expect(r.fbLthdDetail?.lossSlice).toBe("heir");
    expect(r.fbLthdDetail?.cappedToGain).toBeUndefined();
    expect((r.warnings ?? []).some((w) => w.includes("양도차익 범위로 제한"))).toBe(false);
  });

  /**
   * 고가주택 표2(거주 4년·16%) — r=1/2 · A_d 1,000,000 · V 3,900,000,000 · P 20억 · 양도비 0 — tD 500,000 · tH 1,950,000,000 · G = 49,500,000
   *   12억 초과분 안분 T = 49,500,000 × 8억 / 20억 = 19,800,000 · 거주분 = T × 16% = 3,168,000
   *   gD = 10억 − 500,000 = 999,500,000 · gH = −950,000,000 → 적용분 기준액 = ⌊T × 999,500,000 / G⌋ = 399,800,000 × 28% = 111,944,000 > T → T로 제한
   */
  it("표2 — 보유분 = 총 공제 − 거주분, 두 sub-step 합이 총 공제와 같다", () => {
    const r = run({ n: 1, d: 2, ad: 1_000_000, v: 3_900_000_000, p: 2_000_000_000, e: 0, house: true });
    expect(r.taxableGain).toBe(19_800_000);
    expect(r.fbLthdDetail?.cappedToGain).toBe(true);
    expect(r.longTermHoldingDeduction).toBe(19_800_000);
    expect(r.fbLthdDetail?.residenceDeduction).toBe(3_168_000);
    const subs = r.steps.filter((s) => s.sub && (s.label.includes("보유") || s.label.includes("거주")));
    expect(subs.map((s) => s.amount)).toEqual([19_800_000 - 3_168_000, 3_168_000]);
    expect(subs.reduce((a, s) => a + s.amount, 0)).toBe(r.longTermHoldingDeduction);
  });
});
