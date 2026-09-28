/**
 * §43② 1년 합산 — 자본거래 4축(§38·§39의2·§39의3·§40) 엔진 anchor. 설계 `docs/00-pm/gift43-2-capital-axes.plan.md`.
 *
 * 「상증령」§32의4 두문: 「해당 이익별로 합산하여 각각의 **금액기준**을 계산한다」. #19(§39)와 같은 정책 (a):
 * 합산은 금액 leg(3억·1억) 판정에만 쓰고, 비율 leg는 건별이며, 과세액은 당해 건 이익이다.
 *
 * 모든 픽스처는 당해 이익이 금액기준 **바로 아래**다(실측). 윈도 안 선행 이익을 더하면 넘고, 윈도 밖이면 못 넘는다.
 */
import { describe, it, expect } from "vitest";
import { calcMergerGift } from "@/lib/tax-engine/gift-deemed/merger";
import { calcCapitalDecreaseGift } from "@/lib/tax-engine/gift-deemed/capital-decrease";
import { calcContributionGift } from "@/lib/tax-engine/gift-deemed/contribution-in-kind";
import { calcConvertibleBondGift } from "@/lib/tax-engine/gift-deemed/convertible-bond";
import type {
  MergerInput,
  CapitalDecreaseInput,
  ContributionInput,
  ConvertibleBondInput,
} from "@/lib/tax-engine/gift-deemed/types";
import type { DeemedGiftResult } from "@/lib/tax-engine/gift-deemed/types";

const GIFT_DATE = new Date("2025-06-30");
/** 윈도 = 2024-06-30 ~ 2025-06-30 (양끝 포함) */
const IN = (gain: number) => [{ date: "2025-01-15", gain }];
const EDGE = (gain: number) => [{ date: "2024-06-30", gain }];
const OUT = (gain: number) => [{ date: "2024-06-29", gain }];
const AGG_LABEL = "§43② 1년 합산 금액기준";
const hasAggRow = (r: DeemedGiftResult) => r.breakdown.some((s) => s.label === AGG_LABEL);

// ── §38 합병 ──
const MERGER_STOCK: MergerInput = {
  caseType: "stock", mergedPriceMode: "auto", overvaluedSharePrice: 30_000, preMergerShares: 100_000,
  exchangedShares: 100_000, underSharePrice: 40_000, underPreShares: 200_000, postMergerTotalShares: 300_000,
  majorShares: 30_000,
} as MergerInput; // 이익 199,980,000 · 기준 min(329,994,000, 3억)=3억
const MERGER_NS: MergerInput = { caseType: "non_stock", faceValue: 5_000, overvaluedSharePrice: 3_000, majorShares: 100_000 } as MergerInput; // 2억 · 3억
const MERGER_MATRIX: MergerInput = {
  caseType: "stock", mergedSharePrice: 15_000, overvaluedSharePrice: 12_000, preMergerShares: 100, exchangedShares: 100, majorShares: 0,
  shareholders: {
    overvalued: [{ id: "a", name: "갑", shares: 80_000 }, { id: "b", name: "병", shares: 200_000 }],
    undervalued: [{ id: "u", name: "을", shares: 100_000 }],
    exchangeRatio: { numer: 1, denom: 1 },
  },
} as MergerInput; // 갑 240,000,000 < 3억(미적용) · 병 600,000,000(적용)

describe("§38 합병 — 영 §28④ · §32의4 3호", () => {
  it("[AX-M1] 주식교부: 윈도 안 선행 1.5억 → 합산 3.5억 ≥ 3억 → 과세, 과세액은 당해 199,980,000", () => {
    const r = calcMergerGift({ ...MERGER_STOCK, giftDate: GIFT_DATE, priorSameClauseGains: IN(150_000_000) });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(199_980_000);
    expect(hasAggRow(r)).toBe(true);
  });
  it("[AX-M1+] 윈도 밖(2024-06-29)이면 미적용 · 윈도 시작일(2024-06-30)은 포함", () => {
    expect(calcMergerGift({ ...MERGER_STOCK, giftDate: GIFT_DATE, priorSameClauseGains: OUT(150_000_000) }).applied).toBe(false);
    expect(calcMergerGift({ ...MERGER_STOCK, giftDate: GIFT_DATE, priorSameClauseGains: EDGE(150_000_000) }).applied).toBe(true);
  });
  it("[AX-M1-] 증여일이 없으면 합산하지 않는다", () => {
    const r = calcMergerGift({ ...MERGER_STOCK, priorSameClauseGains: IN(150_000_000) });
    expect(r.applied).toBe(false);
    expect(hasAggRow(r)).toBe(false);
  });
  it("[AX-M2] 주식 외 재산 교부: 2억 + 선행 1.2억 → 과세 2억", () => {
    const r = calcMergerGift({ ...MERGER_NS, giftDate: GIFT_DATE, priorSameClauseGains: IN(120_000_000) });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(200_000_000);
  });
  it("[AX-M2+] 합계가 3억 미만(2억 + 0.9억)이면 미적용", () => {
    expect(calcMergerGift({ ...MERGER_NS, giftDate: GIFT_DATE, priorSameClauseGains: IN(90_000_000) }).applied).toBe(false);
  });
  it("[AX-M3] 매트릭스: 갑 행 선행 1억 → 갑 2.4억 과세, 병 불변 → 합계 840,000,000", () => {
    const sh = MERGER_MATRIX.shareholders!;
    const r = calcMergerGift({
      ...MERGER_MATRIX,
      shareholders: { ...sh, overvalued: [{ ...sh.overvalued[0], priorSameClauseGain: 100_000_000 }, sh.overvalued[1]] },
    });
    const gap = r.mergerMatrix!.recipients.find((x) => x.id === "a")!;
    expect(gap.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(840_000_000);
  });
  it("[AX-M3+] 매트릭스 선행이 없으면 갑 미적용(600,000,000)", () => {
    expect(calcMergerGift(MERGER_MATRIX).deemedGiftValue).toBe(600_000_000);
  });
});

// ── §39의2 감자 ──
const DEC_LOW: CapitalDecreaseInput = { caseType: "low", sharePrice: 10_000, redemptionPrice: 8_000, totalRedeemedShares: 200_000, majorPostRatio: { numer: 1, denom: 2 }, relatedRedeemedShares: 200_000 };
const DEC_HIGH: CapitalDecreaseInput = { caseType: "high", sharePrice: 3_000, redemptionPrice: 3_500, faceValue: 5_000, ownRedeemedShares: 400_000 };
const DEC_MULTI: CapitalDecreaseInput = {
  caseType: "low", sharePrice: 10_000, preTotalShares: 1_000_000, faceValue: 5_000,
  shareholders: [
    { id: "a", name: "갑", preShares: 300_000, redeemedShares: 200_000, redemptionPricePerShare: 8_000, relationGroup: "g" },
    { id: "b", name: "을", preShares: 400_000, redeemedShares: 0, relationGroup: "g" },
    { id: "c", name: "병", preShares: 300_000, redeemedShares: 0 },
  ],
}; // 을 잠재 2억 · 기준 3억

describe("§39의2 감자 — 영 §29의2② · §32의4 5호", () => {
  it("[AX-D1] 저가소각 2억 + 선행 1.5억 → 과세 2억", () => {
    const r = calcCapitalDecreaseGift({ ...DEC_LOW, giftDate: GIFT_DATE, priorSameClauseGains: IN(150_000_000) });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(200_000_000);
    expect(hasAggRow(r)).toBe(true);
  });
  it("[AX-D1+] 윈도 밖이면 미적용", () => {
    expect(calcCapitalDecreaseGift({ ...DEC_LOW, giftDate: GIFT_DATE, priorSameClauseGains: OUT(150_000_000) }).applied).toBe(false);
  });
  it("[AX-D2] 고가소각 2억 + 선행 1.5억 → 과세 2억", () => {
    const r = calcCapitalDecreaseGift({ ...DEC_HIGH, giftDate: GIFT_DATE, priorSameClauseGains: IN(150_000_000) });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(200_000_000);
  });
  it("[AX-D3] 멀티: 을 행 선행 1.5억 → 을 2억 과세", () => {
    const rows = DEC_MULTI.shareholders!.map((s) => (s.id === "b" ? { ...s, priorSameClauseGain: 150_000_000 } : s));
    const r = calcCapitalDecreaseGift({ ...DEC_MULTI, shareholders: rows });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(200_000_000);
  });
  it("[AX-D3+] 멀티: 선행 없으면 을 기준금액 미달(0)", () => {
    expect(calcCapitalDecreaseGift(DEC_MULTI).deemedGiftValue).toBe(0);
  });
});

// ── §39의3 현물출자 ──
const CON_HIGH: ContributionInput = { caseType: "high", preContribPrice: 10_000, preContribShares: 100_000, newSharePrice: 12_000, contributedShares: 100_000, allocatedShares: 200_000, relatedRatio: { numer: 1, denom: 1 } }; // 2억 · 3억
const CON_LOW: ContributionInput = { caseType: "low", preContribPrice: 10_000, preContribShares: 100_000, newSharePrice: 9_000, contributedShares: 100_000, allocatedShares: 100_000 }; // 5천만 · 기준 없음

describe("§39의3 현물출자 — 영 §29의3② · §32의4 6호", () => {
  it("[AX-C1] 고가(명부 없음) 2억 + 선행 1.5억 → 과세 2억", () => {
    const r = calcContributionGift({ ...CON_HIGH, giftDate: GIFT_DATE, priorSameClauseGains: IN(150_000_000) });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(200_000_000);
    expect(hasAggRow(r)).toBe(true);
  });
  it("[AX-C1+] 윈도 밖이면 미적용", () => {
    expect(calcContributionGift({ ...CON_HIGH, giftDate: GIFT_DATE, priorSameClauseGains: OUT(150_000_000) }).applied).toBe(false);
  });
  it("[AX-C2] 고가 명부: 갑 행 선행 2억 → 갑 1.2억 과세, 을 0", () => {
    const r = calcContributionGift({ ...CON_HIGH, relatedRatio: undefined, parties: [{ name: "갑", preShares: 60_000, priorSameClauseGain: 200_000_000 }, { name: "을", preShares: 40_000 }] });
    expect(r.deemedGiftValue).toBe(120_000_000);
    expect(r.contributionBreakdown!.map((b) => b.value)).toEqual([120_000_000, 0]);
  });
  it("[AX-C3] 저가(1호)는 금액기준이 없어 선행 이익이 결과를 바꾸지 않고 합산 행도 없다", () => {
    const base = calcContributionGift(CON_LOW);
    const r = calcContributionGift({ ...CON_LOW, giftDate: GIFT_DATE, priorSameClauseGains: IN(150_000_000) });
    expect(r.deemedGiftValue).toBe(base.deemedGiftValue);
    expect(hasAggRow(r)).toBe(false);
  });
});

// ── §40 전환사채 ──
const CB_ACQ = { caseType: "acquisition", bondMarketValue: 1_000_000_000, acquisitionPrice: 950_000_000 } as ConvertibleBondInput; // 5천만 · 1억
const CB_CONV = { caseType: "conversion", bondMarketValue: 0, conversionPrice: 10_000, increasedShares: 10_000, preConvPrice: 20_000, preConvShares: 100_000 } as ConvertibleBondInput; // 90,900,000 · 1억
const CB_REV = { caseType: "conversion_reverse", bondMarketValue: 0, conversionPrice: 20_000, increasedShares: 10_000, preConvPrice: 10_000, preConvShares: 100_000, relatedPreRatio: { numer: 1, denom: 2 } } as ConvertibleBondInput; // 45,455,000 · 기준 0
const CB_TR = { caseType: "transfer", bondMarketValue: 1_000_000_000, transferPrice: 1_050_000_000 } as ConvertibleBondInput; // 5천만 · 1억

describe("§40 전환사채 — 영 §30② · §32의4 7호", () => {
  it("[AX-B1] 1호 인수 5천만 + 선행 6천만 → 과세 5천만", () => {
    const r = calcConvertibleBondGift({ ...CB_ACQ, giftDate: GIFT_DATE, priorSameClauseGains: IN(60_000_000) });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(50_000_000);
    expect(hasAggRow(r)).toBe(true);
  });
  it("[AX-B1+] 합계 1억 미만(5천만 + 4천만)이면 미적용 · 윈도 밖도 미적용", () => {
    expect(calcConvertibleBondGift({ ...CB_ACQ, giftDate: GIFT_DATE, priorSameClauseGains: IN(40_000_000) }).applied).toBe(false);
    expect(calcConvertibleBondGift({ ...CB_ACQ, giftDate: GIFT_DATE, priorSameClauseGains: OUT(60_000_000) }).applied).toBe(false);
  });
  it("[AX-B2] 2호 가·나·다 전환 90,900,000 + 선행 2천만 → 과세 90,900,000", () => {
    const r = calcConvertibleBondGift({ ...CB_CONV, giftDate: GIFT_DATE, priorSameClauseGains: IN(20_000_000) });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(90_900_000);
  });
  it("[AX-B3] 3호 양도 5천만 + 선행 6천만 → 과세 5천만", () => {
    const r = calcConvertibleBondGift({ ...CB_TR, giftDate: GIFT_DATE, priorSameClauseGains: IN(60_000_000) });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(50_000_000);
  });
  it("[AX-B4] 2호 라목은 기준 0원 — 선행 이익이 결과를 바꾸지 않고 합산 행도 없다", () => {
    const base = calcConvertibleBondGift(CB_REV);
    const r = calcConvertibleBondGift({ ...CB_REV, giftDate: GIFT_DATE, priorSameClauseGains: IN(60_000_000) });
    expect(r.deemedGiftValue).toBe(base.deemedGiftValue);
    expect(r.deemedGiftValue).toBe(45_455_000);
    expect(hasAggRow(r)).toBe(false);
  });
});
