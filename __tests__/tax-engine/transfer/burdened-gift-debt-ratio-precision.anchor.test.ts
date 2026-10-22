/**
 * anchor BD-1 ~ BD-6 · BD-9 — 부담부증여 채무비율(B/C) 소수 곱 부동소수 1원 과소 (재개발·재건축 β 스케일 · 개산공제 base).
 *
 * 계획: docs/00-pm/burdened-gift-debt-ratio-precision.plan.md §4 표 F(F1·F2) · §9.1
 *
 * 소령 §159①은 부담부증여 양도 부분을 `A × B/C`로 계산하라고 한다. 정본 경로는 정수 `safeMultiplyThenDivide(A, B, C)`로
 * 이미 정확한데, 재개발 β 스케일과 §163⑥ 개산공제 base는 **소수 비율 `debtRatio = B/C`를 곱했다** —
 * 순환 소수 비율(14/110 등)에서 `applyRatio`가 옛 식(`Math.floor(amount × ratio)`)으로 넘어가 참값이 정수인 곱이 1원 모자랐다.
 *
 * 참값은 **BigInt `X × B / C`의 floor**로 독립 계산한다(구현의 `safeMultiplyThenDivide`를 쓰지 않는다).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { scaleRedevelopmentForBurdenedGift } from "@/lib/tax-engine/redevelopment-burdened-gift";
import { computeRedevelopmentSplit } from "@/lib/tax-engine/redevelopment-split";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { TransferTaxInput, TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const rates = makeMockRates();

/** 참값 floor(x × b / c) — BigInt 독립 계산 */
const truth = (x: number, b: number, c: number): number => Number((BigInt(x) * BigInt(b)) / BigInt(c));

/** β 스케일 호출 — 채무 B · 증여가액 C 원값 */
const scale = (info: RedevelopmentInfo, debt: number, valuation: number) =>
  scaleRedevelopmentForBurdenedGift(info, { debt, valuation });

/** F2 split 입력의 채무 분수 */
const debtOf = (debt: number, valuation: number) => ({ debtFraction: { debt, valuation } });

const REDEV: RedevelopmentInfo = {
  subject: "apt",
  approvalLawBasis: "urban_renovation_art_74",
  approvalDate: new Date("2018-06-01"),
  rightsValue: 660_000_000,
  settlementDirection: "pay",
  settlementAmount: 330_000_000,
  preApprovalExpenses: 55_000_000,
  postApprovalExpenses: 110_000_000,
  completionDate: new Date("2021-09-01"),
} as RedevelopmentInfo;

// ──────────────────────────────────────────────────────────────────────────────
// BD-2 · F1 4항 각각 — 순환 소수 B/C(14/110)
// ──────────────────────────────────────────────────────────────────────────────
describe("BD-2 · β 스케일 4항 — 순환 소수 B/C = 140,000,000 / 1,100,000,000", () => {
  const B = 140_000_000;
  const C = 1_100_000_000;

  it("평가액(rightsValue) 660,000,000 × B/C = 84,000,000 (옛 식은 83,999,999)", () => {
    expect(scale(REDEV, B, C).rightsValue).toBe(84_000_000);
  });
  it("청산금(settlementAmount) 330,000,000 × B/C = 42,000,000", () => {
    expect(scale(REDEV, B, C).settlementAmount).toBe(truth(330_000_000, B, C));
  });
  it("인가전 필요경비(preApprovalExpenses) 55,000,000 × B/C = 7,000,000", () => {
    expect(scale(REDEV, B, C).preApprovalExpenses).toBe(truth(55_000_000, B, C));
  });
  it("인가후 필요경비(postApprovalExpenses) 110,000,000 × B/C = 14,000,000", () => {
    expect(scale(REDEV, B, C).postApprovalExpenses).toBe(truth(110_000_000, B, C));
  });
  it("postApprovalExpenses가 없으면 키도 만들지 않는다 (M9 구별력)", () => {
    const rest: Record<string, unknown> = { ...REDEV };
    delete rest.postApprovalExpenses;
    const scaled = scale(rest as unknown as RedevelopmentInfo, B, C);
    expect("postApprovalExpenses" in scaled).toBe(false);
  });
  it("금액항이 아닌 필드(날짜·방향·기준시가)는 건드리지 않는다", () => {
    const scaled = scale({ ...REDEV, managementDisposalHousingPrice: 400_000_000 } as RedevelopmentInfo, B, C);
    expect(scaled.settlementDirection).toBe("pay");
    expect(scaled.approvalDate).toBe(REDEV.approvalDate);
    expect(scaled.managementDisposalHousingPrice).toBe(400_000_000);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// BD-3 · 가드 보존
// ──────────────────────────────────────────────────────────────────────────────
describe("BD-3 · 가드 보존 — (0, 1] 범위 · r = 1 · 미전달", () => {
  it("undefined → 원본 동일 참조", () => {
    expect(scaleRedevelopmentForBurdenedGift(REDEV, undefined)).toBe(REDEV);
  });
  it("r = 1 (B = C) → 원본 동일 참조 (no-op)", () => {
    expect(scale(REDEV, 1_500_000_000, 1_500_000_000)).toBe(REDEV);
  });
  it("B > C → 기존 Error ((0, 1] 범위 밖)", () => {
    expect(() => scale(REDEV, 1_600_000_000, 1_500_000_000)).toThrow(/\[redev-burdened-gift\].*\(0, 1\] 범위를 벗어났다/);
  });
  it("B = 0 → 기존 Error", () => {
    expect(() => scale(REDEV, 0, 1_500_000_000)).toThrow(/\[redev-burdened-gift\].*\(0, 1\] 범위를 벗어났다/);
  });
  it("C = 0 → 기존 Error", () => {
    expect(() => scale(REDEV, 100, 0)).toThrow(/\[redev-burdened-gift\].*\(0, 1\] 범위를 벗어났다/);
  });
  it("B < 0 → 기존 Error", () => {
    expect(() => scale(REDEV, -1, 1_500_000_000)).toThrow(/\[redev-burdened-gift\].*\(0, 1\] 범위를 벗어났다/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// BD-4 · 짧은 소수 회귀 (기존 계측 56건의 비율)
// ──────────────────────────────────────────────────────────────────────────────
describe("BD-4 · 짧은 소수 비율 회귀 — 0.4 · 0.25 · 0.8", () => {
  const cases: Array<[number, number, string]> = [
    [600_000_000, 1_500_000_000, "0.4"],
    [250_000_000, 1_000_000_000, "0.25"],
    [800_000_000, 1_000_000_000, "0.8"],
    [200_000_000, 500_000_000, "0.4 (2억/5억)"],
    [400_000_000, 1_000_000_000, "0.4 (4억/10억)"],
  ];
  for (const [B, C, label] of cases) {
    it(`r = ${label}: 4항이 참값과 같다`, () => {
      const s = scale(REDEV, B, C);
      expect(s.rightsValue).toBe(truth(660_000_000, B, C));
      expect(s.settlementAmount).toBe(truth(330_000_000, B, C));
      expect(s.preApprovalExpenses).toBe(truth(55_000_000, B, C));
      expect(s.postApprovalExpenses).toBe(truth(110_000_000, B, C));
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// BD-9 · 결정적 격자 — 구현 vs BigInt 참값 전수 일치
// ──────────────────────────────────────────────────────────────────────────────
describe("BD-9 · 결정적 격자 — 둥근 금액 × 순환·짧은 소수 비율 (과소·과대 0)", () => {
  it("β 4항: X ∈ 천만 단위 · B ∈ 천만 단위 · C ∈ 천만 단위 — 불일치 0", () => {
    const bad: string[] = [];
    let n = 0;
    for (let C = 300_000_000; C <= 3_000_000_000; C += 70_000_000) {
      for (let B = 10_000_000; B < C; B += 130_000_000) {
        for (let X = 110_000_000; X <= 990_000_000; X += 110_000_000) {
          const s = scale({ ...REDEV, rightsValue: X, settlementAmount: X, preApprovalExpenses: X, postApprovalExpenses: X } as RedevelopmentInfo, B, C);
          const t = truth(X, B, C);
          n++;
          for (const k of ["rightsValue", "settlementAmount", "preApprovalExpenses", "postApprovalExpenses"] as const) {
            if (s[k] !== t) bad.push(`${k} X=${X} B=${B} C=${C} got=${s[k]} truth=${t}`);
          }
        }
      }
    }
    expect(n).toBeGreaterThan(1000);
    expect(bad.slice(0, 5), `${bad.length}건 불일치`).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// BD-5 · F2 — 개산공제 base (지분 × 채무비율) — Q2 (a) 순차 floor
// ──────────────────────────────────────────────────────────────────────────────
describe("BD-5 · 개산공제 base — 지분 기준시가 확정 후 × B/C (순차 floor)", () => {
  const K5_REDEV = {
    subject: "apt",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2018-06-01"),
    rightsValue: 500_000_000,
    settlementDirection: "pay",
    settlementAmount: 200_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    completionDate: new Date("2021-09-01"),
    managementDisposalHousingPrice: 400_000_000,
    acquisitionHousingPrice: 308_000_000,
  } as unknown as RedevelopmentInfo;

  const split = (extra: Record<string, unknown>, redev: RedevelopmentInfo = K5_REDEV) =>
    computeRedevelopmentSplit({
      redevelopment: redev,
      acquisitionDate: new Date("2009-03-01"),
      transferDate: new Date("2024-03-01"),
      transferPrice: 1,
      useEstimatedAcquisition: true,
      ...extra,
    } as never);

  it("🔴 지분 70% × B/C = 140,000,000/1,100,000,000 — base = floor(3.08억 × 70%) × B/C = 27,440,000 (옛 곱비율은 27,439,999)", () => {
    const r = split({ ownershipRatio: 0.7, ...debtOf(140_000_000, 1_100_000_000) });
    expect(r.valuationMeta?.lumpDeductionBase).toBe(27_440_000);
    expect(r.estimatedLumpDeduction).toBe(823_200); // 27,440,000 × 3%
  });

  it("🔴 지분 70% × B/C = 150,000,000/1,100,000,000 — 29,400,000 (옛 29,399,999)", () => {
    const r = split({ ownershipRatio: 0.7, ...debtOf(150_000_000, 1_100_000_000) });
    expect(r.valuationMeta?.lumpDeductionBase).toBe(29_400_000);
  });

  it("지분 57% × B/C = 200,000,000/700,000,000 — 순차 floor 참값 (옛 49,019,999)", () => {
    const r = split({ ownershipRatio: 0.57, ...debtOf(200_000_000, 700_000_000) });
    expect(r.valuationMeta?.lumpDeductionBase).toBe(truth(Math.floor((308_000_000 * 57) / 100), 200_000_000, 700_000_000));
  });

  it("지분 100%(미전달) × 채무 — base = P_A × B/C 참값", () => {
    const r = split({ ...debtOf(140_000_000, 1_100_000_000) });
    expect(r.valuationMeta?.lumpDeductionBase).toBe(truth(308_000_000, 140_000_000, 1_100_000_000));
  });

  it("채무 없음(debtFraction 미전달) — 지분 기준시가 그대로(종전 동일)", () => {
    const r = split({ ownershipRatio: 0.7 });
    expect(r.valuationMeta?.lumpDeductionBase).toBe(215_600_000);
    expect(r.estimatedLumpDeduction).toBe(6_468_000);
  });

  it("채무 없음 · 지분 100% — numerator 그대로", () => {
    const r = split({});
    expect(r.valuationMeta?.lumpDeductionBase).toBe(308_000_000);
  });

  it("B = C (r = 1) — 채무 축소 없음(가드 재현: r < 1일 때만 줄인다)", () => {
    const r = split({ ownershipRatio: 0.7, ...debtOf(1_100_000_000, 1_100_000_000) });
    expect(r.valuationMeta?.lumpDeductionBase).toBe(215_600_000);
  });

  it("짧은 소수(0.4) 불변 — 지분 50% × 0.8 (기존 K5-1c)", () => {
    const r = split({ ownershipRatio: 0.5, ...debtOf(600_000_000, 750_000_000) }, {
      ...K5_REDEV,
      acquisitionHousingPrice: 300_000_000,
    } as RedevelopmentInfo);
    expect(r.valuationMeta?.lumpDeductionBase).toBe(120_000_000);
  });

  it("격자 — P_A(백만 단위) × 지분(정수 %) × B/C: 순차 floor 참값과 전건 일치", () => {
    const bad: string[] = [];
    let n = 0;
    for (const own of [0.7, 0.35, 0.57, 0.5, 0.33]) {
      const pct = Math.round(own * 100);
      for (let pa = 301_000_000; pa <= 340_000_000; pa += 3_000_000) {
        for (const [B, C] of [
          [140_000_000, 1_100_000_000],
          [200_000_000, 700_000_000],
          [150_000_000, 1_100_000_000],
          [600_000_000, 1_500_000_000],
        ]) {
          const r = split({ ownershipRatio: own, ...debtOf(B, C) }, { ...K5_REDEV, acquisitionHousingPrice: pa } as RedevelopmentInfo);
          const expected = truth(Math.floor((pa * pct) / 100), B, C);
          n++;
          if (r.valuationMeta?.lumpDeductionBase !== expected) {
            bad.push(`own=${own} pa=${pa} B=${B} C=${C} got=${r.valuationMeta?.lumpDeductionBase} truth=${expected}`);
          }
        }
      }
    }
    expect(n).toBeGreaterThan(200);
    expect(bad.slice(0, 5), `${bad.length}건 불일치`).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// BD-1 · BD-6 · 엔진 풀 파이프라인 (calculateTransferTax)
// ──────────────────────────────────────────────────────────────────────────────
function makeInput(overrides: Record<string, unknown> = {}): TransferTaxInput {
  return {
    ...baseTransferInput(),
    propertyType: "redevelopment_apt",
    transferType: "burdened_gift",
    acquisitionDate: new Date("2009-03-01"),
    transferDate: new Date("2024-03-01"),
    transferPrice: 0,
    acquisitionPrice: 0,
    isOneHousehold: false,
    householdHousingCount: 2,
    reductions: [],
    redevelopment: {
      subject: "apt",
      approvalLawBasis: "urban_renovation_art_74",
      approvalDate: new Date("2018-06-01"),
      rightsValue: 660_000_000,
      settlementDirection: "pay",
      settlementAmount: 200_000_000,
      preApprovalExpenses: 10_000_000,
      postApprovalExpenses: 5_000_000,
      completionDate: new Date("2021-09-01"),
    },
    burdenedGiftInfo: {
      valuationMode: "sangjeungbeop_standard",
      lendingDepositTotal: 0,
      mortgageDebtAmount: 140_000_000,
      annualRentTotal: 0,
      donorRelation: "lineal_descendant",
      landStdPriceAtTransfer: 0,
      buildingStdPriceAtTransfer: 1_100_000_000,
      landStdPriceAtAcquisition: 0,
      buildingStdPriceAtAcquisition: 300_000_000,
    },
    ...overrides,
  } as unknown as TransferTaxInput;
}
const run = (o: Record<string, unknown> = {}) => calculateTransferTax(makeInput(o), rates) as TransferTaxResult;

describe("BD-1 · 재개발 APT × 부담부증여 풀 파이프라인 — C 11억 · B 1.4억 · 권리가액 6.6억", () => {
  it("🔴 인가전 의제 양도가 = 권리가액 × B/C = 84,000,000 (옛 83,999,999)", () => {
    const r = run();
    const bg = r.transferBurdenedGiftBreakdown!;
    expect(bg.assumedDebtAmount).toBe(140_000_000);
    expect(bg.giftValuation.max).toBe(1_100_000_000);
    expect(r.redevelopmentDetail!.preApproval.apportionedTransfer).toBe(truth(660_000_000, 140_000_000, 1_100_000_000));
    expect(r.redevelopmentDetail!.preApproval.apportionedTransfer).toBe(84_000_000);
  });

  it("🔴 분양가 합 = (평가액 + 납부 청산금) × B/C 참값 — 두 항을 따로 줄인 합과 같다", () => {
    const r = run();
    const d = r.redevelopmentDetail!;
    expect(d.salePriceTotal).toBe(truth(660_000_000, 140_000_000, 1_100_000_000) + truth(200_000_000, 140_000_000, 1_100_000_000));
  });

  /**
   * 시가 · 실지(K-4) — 인가전 실비 1천만 × B/C(1,272,727)가 쓰이는 경로. 기준시가 모드는 인가전 필요경비가 개산공제라
   * 실비 β 스케일이 세액에 닿지 않는다(계획서 bg-redev-apt-pre-approval-lump-deduction.plan.md) — 그래서 이 세액 감시는 K-4로 둔다.
   * 실지 3억 = 취득시 기준시가 3억이라 취득가액·나머지 항은 기준시가 모드와 같고, 종전(기준시가 모드 · 실비) 기대값과 같은 수치다.
   */
  const k4 = () =>
    run({
      burdenedGiftInfo: {
        ...(makeInput().burdenedGiftInfo as unknown as Record<string, unknown>),
        valuationMode: "sangjeungbeop_market",
        marketValueAtTransfer: 1_100_000_000,
        acquisitionMethod: "actual",
        actualAcquisitionTotal: 300_000_000,
      },
    });

  it("🔴 결정세액이 바뀐다(K-4) — 산출세액 6,482,233 · 총납부세액 7,130,456 (mock 세율표 실측 · 옛 6,482,232 / 7,130,455)", () => {
    const r = k4();
    expect(r.redevelopmentDetail!.preApproval.expenses).toBe(truth(10_000_000, 140_000_000, 1_100_000_000));
    expect(r.calculatedTax).toBe(6_482_233);
    expect(r.totalTax).toBe(7_130_456);
  });

  it("기준시가 모드 — 인가전 필요경비 = 개산공제 floor(취득가 × B/C 참값 × 3%) = 1,145,454 · 산출세액 6,503,615", () => {
    const r = run();
    const d = r.redevelopmentDetail!;
    const base = truth(300_000_000, 140_000_000, 1_100_000_000);
    expect(d.valuationMeta?.lumpDeductionBase).toBe(base);
    expect(d.preApproval.expenses).toBe(Math.floor((base * 3) / 100));
    expect(r.calculatedTax).toBe(6_503_615);
    expect(r.totalTax).toBe(7_153_976);
  });
});

describe("BD-6 · K-5 완공 아파트 × 부담부증여 풀 파이프라인 — 지분 × 순환 B/C의 개산공제", () => {
  /** 시가 mv에 지분 own을 곱한 값이 증여가액 C가 된다 — C = mv × own */
  const K5 = (own: number, mv: number) => ({
    ownershipRatio: own,
    burdenedGiftInfo: {
      valuationMode: "sangjeungbeop_market",
      marketValueAtTransfer: mv,
      acquisitionMethod: "converted",
      lendingDepositTotal: 0,
      mortgageDebtAmount: 140_000_000,
      annualRentTotal: 0,
      donorRelation: "lineal_descendant",
      landStdPriceAtTransfer: 0,
      buildingStdPriceAtTransfer: mv,
      landStdPriceAtAcquisition: 0,
      buildingStdPriceAtAcquisition: 300_000_000,
    },
    redevelopment: {
      ...(makeInput().redevelopment as unknown as Record<string, unknown>),
      rightsValue: 500_000_000,
      settlementAmount: 200_000_000,
      preApprovalExpenses: 0,
      postApprovalExpenses: 0,
      managementDisposalHousingPrice: 400_000_000,
      acquisitionHousingPrice: 308_000_000,
    },
  });

  // [지분, 시가] — C = 시가 × 지분 = 11억 (B/C = 14/110 순환 소수)
  const CASES: Array<[number, number]> = [
    [0.5, 2_200_000_000],
    [0.2, 5_500_000_000],
    [1, 1_100_000_000],
  ];
  for (const [own, mv] of CASES) {
    it(`지분 ${own * 100}% · C = ${(mv * own).toLocaleString()} — 개산공제 base·개산공제가 «지분 기준시가 → × B/C»로 재현된다 (순차 floor)`, () => {
      const r = run(K5(own, mv));
      const bg = r.transferBurdenedGiftBreakdown!;
      const B = bg.assumedDebtAmount;
      const C = bg.giftValuation.max;
      expect(B).toBe(140_000_000);
      expect(C).toBe(1_100_000_000);
      const expectedBase = truth(Math.floor((308_000_000 * Math.round(own * 100)) / 100), B, C);
      const d = r.redevelopmentDetail!;
      expect(d.valuationMeta?.lumpDeductionBase).toBe(expectedBase);
      expect(d.estimatedLumpDeduction).toBe(Math.floor((expectedBase * 3) / 100));
    });
  }
});
