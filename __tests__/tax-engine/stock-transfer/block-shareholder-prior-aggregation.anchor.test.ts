/**
 * 영 §158②·§168② — **기신고분 합산**(당회차와 별도 축) anchor
 *
 * 계획서: `docs/00-pm/stock-prior-aggregation-overwrite.plan.md`
 * 교재:   『2026 양도·상속·증여세 이론 및 계산실무』 **사례 50**(pp.623~629)
 *
 * ## 왜 생겼나 — 종전 구현은 「폼 칸 덮어쓰기」였다
 *
 * 2026-09-14 이전에는 UI 모달이 **기신고분 + 당회차분을 더해 당회차 입력칸에 되썼다**.
 * 당회차분과 기신고분이 **같은 칸을 공유**하니 폼이 그 경계를 기억하지 못했고, 그래서
 * ⓐ 마법사 단계 순서(모달은 Step1 · 금액칸은 Step2·3)에 따라 합산분이 **덮어써져 사라지고**
 * ⓑ 모달을 두 번 확인하면 **이중합산**되고
 * ⓒ 결과가 총액으로 이력에 저장돼 **다음 회차가 또 더하고**
 * ⓓ 로트·환산 모드에서는 엔진이 `perShareAcquisitionPrice`를 읽지 않아 **통째로 무시**됐다.
 *
 * 제보 케이스에서 총 납부세액이 **70,009,500 과소**였다(411,383,500 → 341,374,000).
 *
 * ⇒ 기신고분을 `prior*` **별도 입력 축**으로 받고 **엔진이 STEP 4.5 에서 더한다**.
 *
 * | ID | 무엇을 고정하는가 |
 * |---|---|
 * | PA-1 | 교재 사례 50 정본 — 당회차 + 기신고 → 403,185,000 → §168② 후 **373,985,000** |
 * | PA-2 | `prior*` 가 없으면 **원 단위까지 종전과 동일**(회귀 0) |
 * | PA-3 | `own*` echo 가 **당회차분**이다 (이력 재선택 시 이중합산 차단) |
 * | A-1 | `①4다` 가 **아니면**(라목·`①3나`) 합산하지 않는다 — §168② 차감과 같은 술어 |
 * | A-2 | **비과세** 분기에서 합산하지 않는다 |
 * | A-3 | **환산** 모드: 환산 분자는 «당회차» 양도가액이다 (seam 위치 고정) |
 * | A-4 | **로트** 모드: 취득가액 = lot 합계 **+ 기신고분** (D-6 해소) |
 * | A-5 | **증권거래세**는 «당회차» 양도가액에만 부과된다 |
 * | A-6 | `priorAggregation` echo 는 합산이 **있을 때만** 실린다 |
 * | A-7 | 음수·소수 입력 방어 |
 * | A-8 | **swap**(§97②2호 단서) 은 «당회차» 취득가액만 지운다 |
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

// ============================================================
// 픽스처 — 교재 사례 50 (2차 양도 = 당회차)
// ============================================================

/** 당회차(2차): 40,000주 · 양도 1,500,000,000 · 취득 600,000,000 · 필요경비 3,500,000 */
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
    shareCount: 40_000,
    totalIssuedShares: 100_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 37_500,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 15_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual",
    actualExpenses: 3_500_000,
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

/** 다목 3요건 + 합산창 **통과** */
const GATE_PASS = {
  isQualifyingBlockShareholder: true,
  blockShareholderRealEstateRatio: 0.65,
  blockShareholderOwnershipRatio: 0.7,
  cumulativeTransferRatio: 0.7,
  aggregationFirstTransferDate: new Date("2023-06-20"),
} as const;

/** 1차 양도(2023-06-20) 기신고분 — 30,000주 · 600,000,000 / 450,000,000 / 1,500,000 */
const PRIOR = {
  priorTransferPrice: 600_000_000,
  priorAcquisitionPrice: 450_000_000,
  priorExpenses: 1_500_000,
  priorShareCount: 30_000,
  priorAggregationSourceCount: 1,
} as const;

// ============================================================
// PA-1 — 교재 사례 50 정본
// ============================================================

describe("PA-1 — 기신고 합산 정본 (교재 사례 50)", () => {
  it("당회차 + 기신고 1건 → 양도차익 1,045,000,000 · 산출 403,185,000 · §168② 후 373,985,000", () => {
    const r = calculateStockTransferTax(
      base({ ...GATE_PASS, ...PRIOR, priorMajorShareholderTax: 29_200_000 }),
    );

    // 합산 총액 — 신고서 07·11·14행이 읽는 값
    expect(r.transferPrice).toBe(2_100_000_000);
    expect(r.acquisitionPrice).toBe(1_050_000_000);
    expect(r.expenses).toBe(5_000_000);

    expect(r.transferIncome).toBe(1_045_000_000);
    expect(r.basicDeduction).toBe(2_500_000);
    expect(r.taxBase).toBe(1_042_500_000);
    // §55① 최고구간 45% — 합산 «전»이라면 42% 구간이라 세액이 크게 갈린다
    expect(r.appliedRate).toBe(0.45);
    expect(r.calculatedTax).toBe(373_985_000);
    expect(r.clause168_2Credit).toEqual({
      grossCalculatedTax: 403_185_000,
      deducted: 29_200_000,
      localDeducted: 2_920_000,
    });
    expect(r.localIncomeTax).toBe(37_398_500);
    expect(r.appliedRules).toContain("§158②기신고합산");
  });

  it("PA-1b: 합산이 «없으면» 제보 화면의 과소 세액이 그대로 나온다 (대조군)", () => {
    const r = calculateStockTransferTax(
      base({ ...GATE_PASS, priorMajorShareholderTax: 29_200_000 }),
    );
    expect(r.transferIncome).toBe(896_500_000);
    expect(r.appliedRate).toBe(0.42);
    expect(r.calculatedTax).toBe(310_340_000);
    expect(r.appliedRules).not.toContain("§158②기신고합산");
  });
});

// ============================================================
// PA-2 — 회귀 0
// ============================================================

describe("PA-2 — `prior*` 미입력이면 종전과 동일", () => {
  it("prior* 를 0으로 «명시»해도 미입력과 원 단위까지 같다", () => {
    const without = calculateStockTransferTax(base({ ...GATE_PASS }));
    const zeros = calculateStockTransferTax(
      base({
        ...GATE_PASS,
        priorTransferPrice: 0,
        priorAcquisitionPrice: 0,
        priorExpenses: 0,
        priorShareCount: 0,
      }),
    );
    expect(zeros.calculatedTax).toBe(without.calculatedTax);
    expect(zeros.transferIncome).toBe(without.transferIncome);
    expect(zeros.priorAggregation).toBeUndefined();
    expect(without.priorAggregation).toBeUndefined();
  });
});

// ============================================================
// PA-3 — own* echo (이력 재선택 이중합산 차단)
// ============================================================

describe("PA-3 — `own*` 는 당회차분이다", () => {
  it("합산이 있어도 own* 는 당회차 값 그대로다", () => {
    const r = calculateStockTransferTax(base({ ...GATE_PASS, ...PRIOR }));
    expect(r.ownTransferPrice).toBe(1_500_000_000);
    expect(r.ownAcquisitionPrice).toBe(600_000_000);
    expect(r.ownExpenses).toBe(3_500_000);
    // 총액과 «다르다» — 같으면 이력 소비자가 총액을 읽는 것과 구별되지 않는다
    expect(r.ownTransferPrice).not.toBe(r.transferPrice);
    expect(r.ownAcquisitionPrice).not.toBe(r.acquisitionPrice);
    expect(r.ownExpenses).not.toBe(r.expenses);
  });

  it("PA-3b: `shareCount` echo 는 «당회차» 주식수다 — 기신고분을 더하지 않는다", () => {
    const r = calculateStockTransferTax(base({ ...GATE_PASS, ...PRIOR }));
    expect(r.shareCount).toBe(40_000);
    expect(r.priorAggregation?.shareCount).toBe(30_000);
  });

  it("PA-3c: 합산이 없으면 own* 와 총액이 같다", () => {
    const r = calculateStockTransferTax(base({ ...GATE_PASS }));
    expect(r.ownTransferPrice).toBe(r.transferPrice);
    expect(r.ownAcquisitionPrice).toBe(r.acquisitionPrice);
    expect(r.ownExpenses).toBe(r.expenses);
  });
});

// ============================================================
// A-1 · A-2 — 적용 술어
// ============================================================

describe("A-1·A-2 — `①4다` 이고 비과세가 아닐 때만 합산한다", () => {
  it("A-1a: 다목 요건 «미충족» → `①3나` 폴백 → 합산하지 않는다", () => {
    const r = calculateStockTransferTax(
      base({ ...GATE_PASS, cumulativeTransferRatio: 0.3, ...PRIOR }),
    );
    expect(r.appliedSection94).not.toBe("①4다");
    expect(r.priorAggregation).toBeUndefined();
    expect(r.transferPrice).toBe(1_500_000_000);
    expect(r.appliedRules).not.toContain("§158②기신고합산");
  });

  it("A-1b: 라목 단독(부동산과다보유법인) → `①4라` → 합산하지 않는다", () => {
    const r = calculateStockTransferTax(
      base({
        isHeavyRealEstateForRate: true,
        nblRatioOfCorpAssets: 0.85,
        ...PRIOR,
      }),
    );
    expect(r.appliedSection94).toBe("①4라");
    expect(r.priorAggregation).toBeUndefined();
    expect(r.transferPrice).toBe(1_500_000_000);
  });

  it("A-1c: 다목 토글 OFF(일반 비상장 대주주) → 합산하지 않는다", () => {
    const r = calculateStockTransferTax(base({ ...PRIOR }));
    expect(r.appliedSection94).not.toBe("①4다");
    expect(r.priorAggregation).toBeUndefined();
  });

  /**
   * ⚠️ **다목과 비과세는 공존하지 않는다** — §94② 가 기타자산을 우선시켜 K-OTC 비과세가
   *    밀려난다(다목 ON + K-OTC 로는 `isExempt` 가 서지 않는다 — 실측).
   *    그래서 이 anchor 는 **비과세 조립 지점**(`stock-transfer-exempt-result.ts`)이
   *    `own*` 을 빠뜨리지 않았는지를 고정한다. 합산 술어의 `!isExempt` 항은
   *    **이 경로로는 구별력을 얻을 수 없다**([[feedback_safety_attribution_in_compound_gate]]).
   */
  it("A-2: K-OTC 벤처 비과세 — 합산하지 않고, own* 는 총액과 같다", () => {
    const r = calculateStockTransferTax(
      base({
        ...PRIOR,
        isKOTCTrading: true,
        isVentureCompany: true,
        // 조특법 §14①7호 비과세는 **비대주주** 전제다 (`classification-94-2-venture-kotc.anchor.test.ts:158`)
        isMajorShareholder: false,
        selfShareRatio: 0.01,
      }),
    );
    expect(r.isExempt).toBe(true);
    expect(r.priorAggregation).toBeUndefined();
    expect(r.finalTax).toBe(0);
    expect(r.ownTransferPrice).toBe(r.transferPrice);
    expect(r.ownAcquisitionPrice).toBe(r.acquisitionPrice);
    expect(r.ownExpenses).toBe(r.expenses);
  });
});

// ============================================================
// A-3 · A-4 — seam 위치 (환산·로트)
// ============================================================

describe("A-3·A-4 — seam 은 STEP 4 «뒤»다", () => {
  const ESTIMATED = {
    acquisitionMode: "estimated" as const,
    acquisitionYearNetIncomePerShare: 900,
    acquisitionYearNetAssetPerShare: 5_000,
    transferYearNetIncomePerShare: 4_500,
    transferYearNetAssetPerShare: 25_000,
  };

  it("A-3: 환산 모드 — 기신고분을 더해도 «환산취득가액 자체»는 변하지 않는다", () => {
    const withoutPrior = calculateStockTransferTax(base({ ...GATE_PASS, ...ESTIMATED }));
    const withPrior = calculateStockTransferTax(base({ ...GATE_PASS, ...ESTIMATED, ...PRIOR }));

    // 당회차 환산 결과는 동일 — seam 이 STEP 3 «앞»에 있었다면 여기가 달라진다
    expect(withPrior.ownAcquisitionPrice).toBe(withoutPrior.acquisitionPrice);
    expect(withPrior.estimatedBase).toBe(withoutPrior.estimatedBase);
    // 총액에는 기신고분이 더해져 있다
    expect(withPrior.acquisitionPrice).toBe(withoutPrior.acquisitionPrice + 450_000_000);
  });

  it("A-4: 로트 모드 — 취득가액 = lot 합계 + 기신고분 (종전에는 통째로 무시됐다)", () => {
    const LOTS: Partial<StockTransferInput> = {
      costAllocationMethod: "fifo",
      acquisitionLots: [
        {
          id: "L1",
          acquisitionDate: new Date("2003-02-17"),
          shareCount: 40_000,
          perShareAcquisitionPrice: 15_000,
          acquisitionCause: "purchase",
        },
      ],
      transferLots: [
        {
          id: "T1",
          transferDate: new Date("2026-02-26"),
          shareCount: 40_000,
          perShareTransferPrice: 37_500,
        },
      ],
    };
    const r = calculateStockTransferTax(base({ ...GATE_PASS, ...LOTS, ...PRIOR }));
    expect(r.ownAcquisitionPrice).toBe(600_000_000); // lot 합계
    expect(r.acquisitionPrice).toBe(1_050_000_000); // + 기신고분
    expect(r.transferPrice).toBe(2_100_000_000);
  });
});

// ============================================================
// A-5 — 증권거래세는 당회차 전용
// ============================================================

describe("A-5 — 증권거래세는 «이번 거래»에만 부과된다", () => {
  it("기신고분을 더해도 증권거래세 과세표준은 당회차 양도가액이다", () => {
    const withoutPrior = calculateStockTransferTax(base({ ...GATE_PASS }));
    const withPrior = calculateStockTransferTax(base({ ...GATE_PASS, ...PRIOR }));
    // 비상장 장외 35/10000 — 당회차 1,500,000,000 기준 5,250,000.
    // 총액 2,100,000,000 을 넣었다면 7,350,000 이 된다(구별력 확보).
    expect(withoutPrior.securitiesTransactionTax?.securitiesTransactionTax).toBe(5_250_000);
    expect(withPrior.securitiesTransactionTax?.securitiesTransactionTax).toBe(5_250_000);
  });
});

// ============================================================
// A-6 · A-7 — echo 규약 · 방어
// ============================================================

describe("A-6·A-7 — echo 규약과 입력 방어", () => {
  it("A-6: 네 값이 모두 0이면 `priorAggregation` 을 싣지 않는다 (0원 행 방지)", () => {
    const r = calculateStockTransferTax(
      base({
        ...GATE_PASS,
        priorTransferPrice: 0,
        priorAcquisitionPrice: 0,
        priorExpenses: 0,
        priorShareCount: 0,
        priorAggregationSourceCount: 3,
      }),
    );
    expect(r.priorAggregation).toBeUndefined();
  });

  it("A-6b: 한 값이라도 있으면 싣는다", () => {
    const r = calculateStockTransferTax(base({ ...GATE_PASS, priorExpenses: 1 }));
    expect(r.priorAggregation).toEqual({
      transferPrice: 0,
      acquisitionPrice: 0,
      expenses: 1,
      shareCount: 0,
      sourceCount: 0,
    });
  });

  it("A-7: 음수는 0으로, 소수는 절사한다", () => {
    const r = calculateStockTransferTax(
      base({
        ...GATE_PASS,
        priorTransferPrice: -500_000,
        priorAcquisitionPrice: 1_000.9,
        priorExpenses: 0,
        priorShareCount: -3,
      }),
    );
    expect(r.priorAggregation).toEqual({
      transferPrice: 0,
      acquisitionPrice: 1_000,
      expenses: 0,
      shareCount: 0,
      sourceCount: 0,
    });
  });
});

// ============================================================
// A-8 — swap (§97②2호 단서)
// ============================================================

describe("A-8 — swap 은 «당회차» 취득가액만 지운다", () => {
  it("환산 + swap 발동 시에도 기신고분 취득가액은 남는다", () => {
    const SWAP = {
      acquisitionMode: "estimated" as const,
      acquisitionYearNetIncomePerShare: 10,
      acquisitionYearNetAssetPerShare: 50,
      transferYearNetIncomePerShare: 4_500,
      transferYearNetAssetPerShare: 25_000,
      capitalExpenditure: 900_000_000,
      transferExpense: 1_000_000,
    };
    const r = calculateStockTransferTax(base({ ...GATE_PASS, ...SWAP, ...PRIOR }));
    expect(r.swapApplied).toBe(true);
    // 양도차익 = 합산 양도가액 − «기신고분» 취득가액 − 합산 필요경비
    //   (당회차 환산취득가액만 나목으로 대체돼 사라진다)
    expect(r.transferIncome).toBe(
      r.transferPrice - 450_000_000 - r.expenses,
    );
    // 기신고분이 «지워지지 않았음»을 양수 차감으로 확인한다 (구별력 확보)
    const noPrior = calculateStockTransferTax(base({ ...GATE_PASS, ...SWAP }));
    expect(noPrior.transferIncome).toBe(noPrior.transferPrice - noPrior.expenses);
  });
});
