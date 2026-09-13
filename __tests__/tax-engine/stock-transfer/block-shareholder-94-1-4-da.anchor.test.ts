/**
 * §94①4 다목(과점주주 특정주식) — 요건 게이트 + 영 §168② 차감 anchor
 *
 * 계획서: `docs/00-pm/stock-block-shareholder-94-1-4-da.plan.md`
 * 교재: 『2026 양도·상속·증여세 이론 및 계산실무』 **사례 50**(pp.623~629)
 *
 * ## 고정하는 것
 *
 * | 축 | anchor |
 * |---|---|
 * | 교재 재현 | A-1(1차) · A-2(2차 차감 전) · A-3(정본) · A-3b(교재 입력) |
 * | 게이트 | A-4(차단) · A-5(폴백) · A-7a/b/c(요건② 시기 분기) · A-8 · A-16(3년 창) |
 * | §168② | A-10(9호) · A-11(상한) · A-12(`priorPaidTax` 무간섭) · A-13(floorTen) · A-14·A-18(라목 배제) |
 * | 다건 | A-15(§104⑤ × §168②) · A-19(차감 0이면 무변경) |
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { calculateStockTransferTaxAggregate } from "@/lib/tax-engine/stock-transfer/stock-transfer-aggregate";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

// ============================================================
// 픽스처 — 교재 사례 50
// ============================================================

function base(o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: 0.7,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: new Date("2025-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: true,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    acquisitionDate: new Date("2003-02-17"),
    transferDate: new Date("2026-02-26"),
    shareCount: 70_000,
    totalIssuedShares: 100_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 30_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 15_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual",
    actualExpenses: 5_000_000, // Q-2 확정 — 1·2차 합산
    filingType: "preliminary",
    filingDate: new Date("2026-04-30"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...o,
  };
}

/** 다목 3요건 + 합산창을 **통과**시키는 입력 */
const GATE_PASS = {
  isQualifyingBlockShareholder: true,
  blockShareholderRealEstateRatio: 0.65,
  blockShareholderOwnershipRatio: 0.7,
  cumulativeTransferRatio: 0.7,
  aggregationFirstTransferDate: new Date("2023-06-20"),
} as const;

// ============================================================
// A-1~A-3b — 교재 사례 50 재현
// ============================================================

describe("A-1~A-3b — 교재 사례 50", () => {
  it("A-1: 1차 양도(2023.06.20.) 비상장 중소 대주주 — 과세표준 146,000,000 · 산출 29,200,000", () => {
    const r = calculateStockTransferTax(
      base({
        transferDate: new Date("2023-06-20"),
        priorYearEndDate: new Date("2022-12-31"),
        filingDate: new Date("2023-08-31"),
        shareCount: 30_000,
        perShareTransferPrice: 20_000,
        actualExpenses: 1_500_000,
      }),
    );
    expect(r.taxCategory).toBe("unlisted_major");
    expect(r.appliedSection94).toBe("①3나_본문");
    expect(r.taxBase).toBe(146_000_000);
    expect(r.calculatedTax).toBe(29_200_000);
    expect(r.localIncomeTax).toBe(2_920_000);
  });

  it("A-2: 2차 재계산 — 차감 «전» 산출세액 403,185,000 (Q-2 합산 필요경비)", () => {
    const r = calculateStockTransferTax(base({ marketType: "other_asset", ...GATE_PASS }));
    expect(r.taxCategory).toBe("other_asset_block_shareholder");
    expect(r.appliedSection94).toBe("①4다");
    expect(r.taxBase).toBe(1_042_500_000);
    expect(r.appliedRate).toBe(0.45);
    expect(r.progressiveDeduction).toBe(65_940_000);
    expect(r.calculatedTax).toBe(403_185_000);
    // 차감 입력이 없으면 echo 자체가 없다 (0 을 채우지 않는다)
    expect(r.clause168_2Credit).toBeUndefined();
  });

  it("A-3 🔴 정본: §168② 차감 후 373,985,000 · 지방 37,398,500", () => {
    const r = calculateStockTransferTax(
      base({ marketType: "other_asset", ...GATE_PASS, priorMajorShareholderTax: 29_200_000 }),
    );
    expect(r.clause168_2Credit).toEqual({
      grossCalculatedTax: 403_185_000,
      deducted: 29_200_000,
      localDeducted: 2_920_000,
    });
    expect(r.calculatedTax).toBe(373_985_000);
    expect(r.localIncomeTax).toBe(37_398_500);
    expect(r.finalTax + r.localIncomeTax).toBe(411_383_500);
    expect(r.appliedRules).toContain("§168②대주주기납부차감");
  });

  it("A-3b: 교재 «입력 그대로»(필요경비 3,500,000) — 374,660,000 · 지방 37,466,000", () => {
    const r = calculateStockTransferTax(
      base({
        marketType: "other_asset",
        ...GATE_PASS,
        actualExpenses: 3_500_000,
        priorMajorShareholderTax: 29_200_000,
      }),
    );
    expect(r.taxBase).toBe(1_044_000_000);
    expect(r.clause168_2Credit?.grossCalculatedTax).toBe(403_860_000);
    expect(r.calculatedTax).toBe(374_660_000);
    expect(r.localIncomeTax).toBe(37_466_000);
    // 교재 p.629 의 「40,386,000 − 2,920,000 = 37,466,000」과 같은 수
    expect(403_860_000 * 0.1 - 2_920_000).toBe(37_466_000);
  });
});

// ============================================================
// A-5·A-7·A-8·A-16 — 요건 게이트
// ============================================================

describe("A-5·A-7·A-8·A-16 — 다목 요건 게이트", () => {
  it("A-5 🔴 §94①3호 시장 + 누적 30% → 폴백(`unlisted_major` 25%) · 그룹 stock", () => {
    const r = calculateStockTransferTax(
      base({ ...GATE_PASS, cumulativeTransferRatio: 0.3 }),
    );
    expect(r.taxCategory).toBe("unlisted_major");
    expect(r.appliedSection94).toBe("①3나_본문");
    expect(r.basicDeductionGroup).toBe("stock");
    expect(r.appliedRate).toBe(0.25);
    expect(r.progressiveDeduction).toBe(15_000_000);
    expect(r.calculatedTax).toBe(245_625_000);
    expect(r.appliedRules).toContain("다목요건미충족폴백");
    expect(r.blockShareholderGate?.failed).toEqual(["transfer_ratio"]);
  });

  it("A-7a: 요건②만 경계 — 소유 50.0% 정확히 · 양도일 2026 → **미달**(「초과」)", () => {
    const r = calculateStockTransferTax(
      base({ ...GATE_PASS, blockShareholderOwnershipRatio: 0.5 }),
    );
    expect(r.blockShareholderGate?.ownershipThresholdIsExclusive).toBe(true);
    expect(r.blockShareholderGate?.failed).toEqual(["ownership_ratio"]);
    expect(r.appliedSection94).toBe("①3나_본문");
  });

  it("A-7b 🔴 같은 입력 · 양도일 2020-02-10(개정 전날) → **통과**(「이상」)", () => {
    const r = calculateStockTransferTax(
      base({
        ...GATE_PASS,
        blockShareholderOwnershipRatio: 0.5,
        transferDate: new Date("2020-02-10"),
        aggregationFirstTransferDate: new Date("2019-06-20"),
        priorYearEndDate: new Date("2019-12-31"),
        filingDate: new Date("2020-04-30"),
      }),
    );
    expect(r.blockShareholderGate?.ownershipThresholdIsExclusive).toBe(false);
    expect(r.blockShareholderGate?.passed).toBe(true);
    expect(r.appliedSection94).toBe("①4다");
  });

  it("A-7c: 시행일 «당일»(2020-02-11) → **미달** — 부칙 §41 은 「시행 전에」만 구법", () => {
    const r = calculateStockTransferTax(
      base({
        ...GATE_PASS,
        blockShareholderOwnershipRatio: 0.5,
        transferDate: new Date("2020-02-11"),
        aggregationFirstTransferDate: new Date("2019-06-20"),
        priorYearEndDate: new Date("2019-12-31"),
        filingDate: new Date("2020-04-30"),
      }),
    );
    expect(r.blockShareholderGate?.ownershipThresholdIsExclusive).toBe(true);
    expect(r.blockShareholderGate?.failed).toEqual(["ownership_ratio"]);
  });

  it("A-8: 요건①만 미달(부동산 49.9%) → 폴백", () => {
    const r = calculateStockTransferTax(
      base({ ...GATE_PASS, blockShareholderRealEstateRatio: 0.499 }),
    );
    expect(r.blockShareholderGate?.failed).toEqual(["real_estate_ratio"]);
    expect(r.appliedSection94).toBe("①3나_본문");
  });

  it("A-16 🔴 3년 창 초과(최초 양도일이 3년 1일 전) → 비율이 70%여도 **미성립**", () => {
    const r = calculateStockTransferTax(
      base({ ...GATE_PASS, aggregationFirstTransferDate: new Date("2023-02-25") }),
    );
    expect(r.blockShareholderGate?.failed).toEqual(["transfer_window"]);
    expect(r.appliedSection94).toBe("①3나_본문");
  });

  it("A-16b 🟢 경계: 정확히 3년 전 당일은 창 **안**", () => {
    const r = calculateStockTransferTax(
      base({ ...GATE_PASS, aggregationFirstTransferDate: new Date("2023-02-26") }),
    );
    expect(r.blockShareholderGate?.passed).toBe(true);
  });

  it("A-9 🟢 회귀: 라목 단독(다목 OFF)은 누적비율과 무관 — 요건 없음", () => {
    const r = calculateStockTransferTax(
      base({ marketType: "other_asset", isHeavyRealEstateForRate: true }),
    );
    expect(r.appliedSection94).toBe("①4라");
    expect(r.blockShareholderGate).toBeUndefined();
  });
});

// ============================================================
// A-10~A-14·A-18 — 영 §168② 차감 경계
// ============================================================

describe("A-10~A-18 — 영 §168② 차감", () => {
  it("A-10 ✅Q-1: §104①9호(비사업용토지 60%)에도 차감한다 — 507,435,000 → 478,235,000", () => {
    const r = calculateStockTransferTax(
      base({
        marketType: "other_asset",
        ...GATE_PASS,
        nblRatioOfCorpAssets: 0.6,
        priorMajorShareholderTax: 29_200_000,
      }),
    );
    expect(r.taxCategory).toBe("other_asset_block_shareholder_nbl");
    expect(r.appliedRate).toBe(0.55);
    expect(r.clause168_2Credit?.grossCalculatedTax).toBe(507_435_000);
    expect(r.calculatedTax).toBe(478_235_000);
    expect(r.localIncomeTax).toBe(47_823_500);
  });

  it("A-11: 차감액 > 산출세액 → 0 에서 멈춘다(음수 금지)", () => {
    const r = calculateStockTransferTax(
      base({
        marketType: "other_asset",
        ...GATE_PASS,
        priorMajorShareholderTax: 999_999_999_999,
      }),
    );
    expect(r.calculatedTax).toBe(0);
    expect(r.clause168_2Credit?.deducted).toBe(403_185_000);
    expect(r.localIncomeTax).toBe(0);
  });

  it("A-12 🔴 `priorPaidTax` 와 «간섭하지 않는다» — 가산세 base ↔ 산출세액", () => {
    const withBoth = calculateStockTransferTax(
      base({
        marketType: "other_asset",
        ...GATE_PASS,
        priorMajorShareholderTax: 29_200_000,
        priorPaidTax: 10_000_000,
      }),
    );
    const only168 = calculateStockTransferTax(
      base({ marketType: "other_asset", ...GATE_PASS, priorMajorShareholderTax: 29_200_000 }),
    );
    // 정상신고(가산세 0)라 `priorPaidTax` 는 산출세액에 닿지 않는다.
    expect(withBoth.calculatedTax).toBe(only168.calculatedTax);
    expect(withBoth.clause168_2Credit).toEqual(only168.clause168_2Credit);
  });

  it("A-13 🔴 차감액이 10의 배수가 아니면 `floorTen` 재적용", () => {
    const r = calculateStockTransferTax(
      base({ marketType: "other_asset", ...GATE_PASS, priorMajorShareholderTax: 29_200_005 }),
    );
    // 403,185,000 − 29,200,005 = 373,984,995 → floorTen → 373,984,990
    expect(r.calculatedTax).toBe(373_984_990);
    expect(r.calculatedTax % 10).toBe(0);
  });

  it("A-14 🔴 라목 «단독»(다목 OFF) + 차감 입력 → 차감 0 (영 §168② 은 다목만 열거)", () => {
    const r = calculateStockTransferTax(
      base({
        marketType: "other_asset",
        isHeavyRealEstateForRate: true,
        priorMajorShareholderTax: 29_200_000,
      }),
    );
    expect(r.appliedSection94).toBe("①4라");
    expect(r.clause168_2Credit).toBeUndefined();
    expect(r.calculatedTax).toBe(403_185_000);
  });

  it("A-18 🔴 다목 ON + 게이트 **실패** + 라목 ON + 차감 입력 → `①4라` · 차감 0", () => {
    const r = calculateStockTransferTax(
      base({
        marketType: "other_asset",
        ...GATE_PASS,
        cumulativeTransferRatio: 0.3, // 게이트 실패
        isHeavyRealEstateForRate: true,
        priorMajorShareholderTax: 29_200_000,
      }),
    );
    expect(r.appliedSection94).toBe("①4라");
    expect(r.clause168_2Credit).toBeUndefined();
    expect(r.calculatedTax).toBe(403_185_000);
  });
});

// ============================================================
// A-15·A-19 — 다건 × §104⑤
// ============================================================

describe("A-15·A-19 — 다건에서 차감이 소실되지 않는다", () => {
  const oa = (o: Partial<StockTransferInput> = {}) =>
    base({
      marketType: "other_asset",
      ...GATE_PASS,
      shareCount: 10_000,
      perShareTransferPrice: 50_000,
      perShareAcquisitionPrice: 20_000,
      actualExpenses: 0,
      ...o,
    });

  it("A-19 🟢 차감 «없이» 기타자산 2건 — §104⑤ 결정액이 그대로", () => {
    const r = calculateStockTransferTaxAggregate([oa(), oa()]);
    expect(r.otherAssetComparativeTax).toBeDefined();
    expect(r.totalCalculatedTax).toBe(r.otherAssetComparativeTax!.aggregatedTax);
    expect(r.totalClause168_2Deducted).toBeUndefined();
  });

  it("A-15 🔴 차감 입력이 있으면 §104⑤ MAX «이후»에 빠진다", () => {
    const noCredit = calculateStockTransferTaxAggregate([oa(), oa()]);
    const withCredit = calculateStockTransferTaxAggregate([
      oa({ priorMajorShareholderTax: 5_000_000 }),
      oa(),
    ]);
    expect(withCredit.totalClause168_2Deducted).toBe(5_000_000);
    // 비교과세가 상쇄해 버리지 않는다 — 정확히 차감액만큼 줄어든다.
    expect(withCredit.totalCalculatedTax).toBe(noCredit.totalCalculatedTax - 5_000_000);
    // 지방소득세도 따라간다.
    expect(withCredit.totalLocalIncomeTax).toBe(
      Math.floor((withCredit.totalCalculatedTax * 0.1) / 10) * 10,
    );
  });
});
