/**
 * 환산주식수(§17의3⑤) 충실도·견고성 anchor
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-share-conversion-robustness.plan.md
 * Design: docs/02-design/features/inheritance-unlisted-stock-share-conversion.engine.design.md
 *
 * Pre-Do(P1·P2): SC-2/SC-4 현행 PASS 기준선 + SC-6b 정밀도 현행 동작 관찰
 */

import { describe, it, expect } from "vitest";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import { applyShareConversion, calcConvertedShares } from "@/lib/tax-engine/property-valuation/converted-shares";
import type {
  UnlistedStockValuationInput,
  UnlistedNetAssetCalculation,
  FiscalYearAdjustment,
  UnlistedCapitalChange,
} from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

const ZERO_NET_ASSET: UnlistedNetAssetCalculation = {
  bsTotalAssets: 0,
  assetValuationDelta: 0,
  corpTaxReservedAmount: 0,
  paidInCapitalIncrease: 0,
  otherEarnedRights: 0,
  prepaidExpenses: 0,
  preGiftRetainedEarnings: 0,
  bsTotalLiabilities: 0,
  corporateTaxPayable: 0,
  farmingSurtax: 0,
  localIncomeTax: 0,
  dividendPayable: 0,
  retirementProvision: 0,
  otherProvision: 0,
  reserveExcluded: 0,
  allowanceExcluded: 0,
  deferredTaxAdjustment: 0,
};

const FY_ENDS_2021: [Date, Date, Date] = [
  new Date("2021-12-31"), // 1년전
  new Date("2020-12-31"), // 2년전
  new Date("2019-12-31"), // 3년전
];

function makeInput(
  totalShares: number,
  capitalChanges: UnlistedCapitalChange[],
  opts: { fyEnds?: [Date, Date, Date]; evalDate?: Date } = {},
): UnlistedStockValuationInput {
  const fyEnds = opts.fyEnds ?? FY_ENDS_2021;
  const fy = (label: string, end: Date): FiscalYearAdjustment => ({
    fiscalYearLabel: label,
    fiscalYearEndDate: end,
    taxableIncome: 0,
  });
  return {
    corpName: "T",
    businessStartDate: new Date("2000-01-01"),
    evaluationDate: opts.evalDate ?? new Date("2022-06-30"),
    faceValuePerShare: 5_000,
    totalShares,
    ownedShares: totalShares,
    isRealEstateHeavy: false,
    fiscalYears: [fy("1년전", fyEnds[0]), fy("2년전", fyEnds[1]), fy("3년전", fyEnds[2])],
    capitalChanges,
    netAssetValueRaw: ZERO_NET_ASSET,
    isContinuousLossLastThreeYears: false,
    capitalizationRate: 0.1,
    isMaxShareholder: false,
    companySize: "small",
  };
}

function convShares(input: UnlistedStockValuationInput): [number, number, number] {
  const r = evaluateUnlistedStockV2(input);
  return [
    r.fiscalYearBreakdowns[0].convertedShares,
    r.fiscalYearBreakdowns[1].convertedShares,
    r.fiscalYearBreakdowns[2].convertedShares,
  ];
}

// pricePerShare=0 → §56⑤ 순손익 조정 비활성(주식수만 검증 격리)
const paidIn = (date: string, shares: number): UnlistedCapitalChange => ({
  changeType: "paid_in",
  changeDate: new Date(date),
  sharesIssued: shares,
  pricePerShare: 0,
});
const freeIssue = (date: string, shares: number): UnlistedCapitalChange => ({
  changeType: "free_issue",
  changeDate: new Date(date),
  sharesIssued: shares,
});
const reduction = (date: string, shares: number): UnlistedCapitalChange => ({
  changeType: "capital_reduction",
  changeDate: new Date(date),
  sharesIssued: shares,
});

// ============================================================
// Pre-Do(P1): 현행 PASS 기준선 — 다년도·감자
// ============================================================
describe("[SC-2] 다년도 분산 증자 — telescoping 균등", () => {
  it("2020 +50k, 2021 +30k → [180k,180k,180k]", () => {
    expect(convShares(makeInput(180_000, [paidIn("2020-06-30", 50_000), paidIn("2021-06-30", 30_000)]))).toEqual([
      180_000, 180_000, 180_000,
    ]);
  });
});

describe("[SC-4] 감자 — §17의3⑤ 2호", () => {
  it("2021 −40k → [60k,60k,60k]", () => {
    expect(convShares(makeInput(60_000, [reduction("2021-06-30", 40_000)]))).toEqual([60_000, 60_000, 60_000]);
  });
});

// ============================================================
// Pre-Do(P2): 대용량 정밀도 — 현행 동작 관찰
// ============================================================
describe("[SC-6b] 대용량 odd-product 정밀도", () => {
  it("applyShareConversion(99,999,999, +33,333,332) === 133,333,331 (현행 동작 관찰)", () => {
    // priorEnd=99,999,999(홀,≡3 mod4) / total=133,333,331(홀,≡3 mod4)
    // 곱 99,999,999 × 133,333,331 ≡ 1 mod4 → round-half-to-even 하향 → FAIL 예상
    expect(applyShareConversion(99_999_999, 33_333_332)).toBe(133_333_331);
  });
  it("[SC-6] clean 대용량 — applyShareConversion(1억, +5천만) === 1.5억", () => {
    expect(applyShareConversion(100_000_000, 50_000_000)).toBe(150_000_000);
  });
  it("[SC-6b] 오케스트레이터 경유 환산주식수 = 133,333,331 (수정 검증)", () => {
    expect(convShares(makeInput(133_333_331, [paidIn("2021-06-30", 33_333_332)]))).toEqual([
      133_333_331, 133_333_331, 133_333_331,
    ]);
  });
});

// ============================================================
// PR-3(A1): 나머지 환산 케이스
// ============================================================
describe("[SC-1] PDF 사례 1 — 직전연도 단일 증자", () => {
  it("2021 +80k → [180k,180k,180k]", () => {
    expect(convShares(makeInput(180_000, [paidIn("2021-06-30", 80_000)]))).toEqual([180_000, 180_000, 180_000]);
  });
});

describe("[SC-3] 무상증자만", () => {
  it("2021 무상 +50k → [150k,150k,150k]", () => {
    expect(convShares(makeInput(150_000, [freeIssue("2021-06-30", 50_000)]))).toEqual([150_000, 150_000, 150_000]);
  });
});

describe("[SC-5] 증자+감자 혼합", () => {
  it("2020 +100k, 2021 −50k → [150k,150k,150k]", () => {
    expect(
      convShares(makeInput(150_000, [paidIn("2020-06-30", 100_000), reduction("2021-06-30", 50_000)])),
    ).toEqual([150_000, 150_000, 150_000]);
  });
});

describe("[SC-7] 윈도우 밖 변동 — 값 정확 + 제외 경고", () => {
  it("2018(밖) +100k, 윈도우 내 0 → [200k,200k,200k] + 제외 경고", () => {
    const r = calcConvertedShares({
      totalShares: 200_000,
      fiscalYearEndDates: FY_ENDS_2021,
      evaluationDate: new Date("2022-06-30"),
      capitalChanges: [paidIn("2018-06-30", 100_000)],
    });
    expect(r.convertedShares).toEqual([200_000, 200_000, 200_000]);
    expect(r.windowChangeCount).toBe(0);
    expect(r.warnings.some((w) => w.includes("밖") && w.includes("제외"))).toBe(true);
  });
});

describe("[SC-8] 결산 후~평가일 사이 변동", () => {
  it("2022.3 +80k (평가 2022.6.30) → [180k,180k,180k]", () => {
    expect(
      convShares(makeInput(180_000, [paidIn("2022-03-31", 80_000)], { evalDate: new Date("2022-06-30") })),
    ).toEqual([180_000, 180_000, 180_000]);
  });
});

describe("[SC-9] 체인 모순 방어 — 자동 보정 금지", () => {
  it("윈도우 변동합 > totalShares → conv[0]=50k 유지 + 경고 (throw 금지)", () => {
    const r = calcConvertedShares({
      totalShares: 50_000,
      fiscalYearEndDates: FY_ENDS_2021,
      evaluationDate: new Date("2022-06-30"),
      capitalChanges: [paidIn("2021-06-30", 100_000)],
    });
    expect(r.convertedShares[0]).toBe(50_000);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe("[SC-10] 동일 사업연도 복수 증자 — running 잔고 분모 (Q4)", () => {
  it("2021 유상 +50k + 2021 무상 +30k → [180k,180k,180k] (FY말 고정분모면 195k 오류)", () => {
    expect(
      convShares(makeInput(180_000, [paidIn("2021-06-30", 50_000), freeIssue("2021-10-30", 30_000)])),
    ).toEqual([180_000, 180_000, 180_000]);
  });
});

// ============================================================
// PR-3(A2): EQ — 재구현 결과 = 현행 totalShares (complete-chain 회귀 보존)
// ============================================================
describe("[EQ] complete-chain 결과동일성 (재구현 회귀 0 증명)", () => {
  it("SC-1·2·3·4·5·8 모두 [totalShares×3] (구 구현과 bit-identical)", () => {
    expect(convShares(makeInput(180_000, [paidIn("2021-06-30", 80_000)]))).toEqual([180_000, 180_000, 180_000]);
    expect(convShares(makeInput(180_000, [paidIn("2020-06-30", 50_000), paidIn("2021-06-30", 30_000)]))).toEqual([
      180_000, 180_000, 180_000,
    ]);
    expect(convShares(makeInput(150_000, [freeIssue("2021-06-30", 50_000)]))).toEqual([150_000, 150_000, 150_000]);
    expect(convShares(makeInput(60_000, [reduction("2021-06-30", 40_000)]))).toEqual([60_000, 60_000, 60_000]);
    expect(
      convShares(makeInput(150_000, [paidIn("2020-06-30", 100_000), reduction("2021-06-30", 50_000)])),
    ).toEqual([150_000, 150_000, 150_000]);
  });
});

// ============================================================
// PR-3(A3): INT — downstream 1주당 순손익가치 ⑤ 연동 검증
// ============================================================
describe("[INT] 통합 — 환산주식수 → 1주당 순손익액 downstream", () => {
  it("total 180k + 1년전 순손익 1,800,000 → perShareNetIncome[0] = floor(1,800,000/180,000) = 10", () => {
    const input = makeInput(180_000, [paidIn("2020-06-30", 50_000), paidIn("2021-06-30", 30_000)]);
    input.fiscalYears[0].taxableIncome = 1_800_000; // pricePerShare=0 → §56⑤ 조정 없음
    const r = evaluateUnlistedStockV2(input);
    expect(r.fiscalYearBreakdowns[0].convertedShares).toBe(180_000);
    expect(r.fiscalYearBreakdowns[0].finalNetIncome).toBe(1_800_000);
    expect(r.fiscalYearBreakdowns[0].perShareNetIncome).toBe(10);
  });
});

// ============================================================
// 무상감자(free_reduction) — §17의3⑤ 2호 환산식은 유·무상 공통,
//   §56⑤ 순손익액 조정은 무상이므로 미적용. (교재 계산사례 ③-사례2·⑤)
// ============================================================
const freeReduction = (date: string, shares: number): UnlistedCapitalChange => ({
  changeType: "free_reduction",
  changeDate: new Date(date),
  sharesIssued: shares,
});

describe("[SC-11] 무상감자 단건 — 유상감자와 환산 동일", () => {
  it("2021 무상 −40k → [60k,60k,60k]", () => {
    expect(convShares(makeInput(60_000, [freeReduction("2021-06-30", 40_000)]))).toEqual([60_000, 60_000, 60_000]);
  });
});

describe("[SC-12] 교재 ③-사례2 — 무상감자 2건", () => {
  // 평가기준일 발행주식총수 3,000 / 무상감자 2020.5.1 −1,000 · 2022.3.1 −2,000
  // 교재(이미지 8): 2021·2020·2019 각 사업연도말 환산 = 3,000주
  it("total 3,000, 2020.5.1 −1,000 · 2022.3.1 −2,000 → [3000,3000,3000]", () => {
    expect(
      convShares(makeInput(3_000, [freeReduction("2020-05-01", 1_000), freeReduction("2022-03-01", 2_000)])),
    ).toEqual([3_000, 3_000, 3_000]);
  });
});

describe("[SC-13] 교재 ⑤ — 무상감자+무상증자 2단계 환산", () => {
  // 2004말 1,000,000 / 2005 무상감자 200,000 / 2006 무상증자 500,000 / 평가 2007.5.31
  // 교재(이미지 9~10): 2004년도 1차 감자환산(800,000)→2차 증자환산(1,300,000). 3개년 모두 1,300,000
  const FY_ENDS_2006: [Date, Date, Date] = [
    new Date("2006-12-31"),
    new Date("2005-12-31"),
    new Date("2004-12-31"),
  ];
  it("total 1,300,000, 2005 −200k · 2006 +500k → [1.3M,1.3M,1.3M]", () => {
    expect(
      convShares(
        makeInput(1_300_000, [freeReduction("2005-06-01", 200_000), freeIssue("2006-06-01", 500_000)], {
          fyEnds: FY_ENDS_2006,
          evalDate: new Date("2007-05-31"),
        }),
      ),
    ).toEqual([1_300_000, 1_300_000, 1_300_000]);
  });
});

describe("[SC-14] 무상감자 §56⑤ 순손익조정 미적용 (유상감자와 대비)", () => {
  it("무상감자는 finalNetIncome 무변동 / 유상감자는 −조정", () => {
    // 무상감자: pricePerShare 없음 → 순손익 조정 0
    const free = makeInput(60_000, [freeReduction("2021-06-30", 40_000)]);
    free.fiscalYears[0].taxableIncome = 6_000_000;
    const rf = evaluateUnlistedStockV2(free);
    expect(rf.fiscalYearBreakdowns[0].capitalIncreaseAdjustment).toBe(0);
    expect(rf.fiscalYearBreakdowns[0].finalNetIncome).toBe(6_000_000);

    // 유상감자: 1주당 5,000 지급 → §56⑤ −조정 발생 (대비 검증, 부호만 확인)
    const paid = makeInput(60_000, [
      { changeType: "capital_reduction", changeDate: new Date("2021-06-30"), sharesIssued: 40_000, pricePerShare: 5_000 },
    ]);
    paid.fiscalYears[0].taxableIncome = 6_000_000;
    const rp = evaluateUnlistedStockV2(paid);
    expect(rp.fiscalYearBreakdowns[0].capitalIncreaseAdjustment).toBeLessThan(0);
  });
});
