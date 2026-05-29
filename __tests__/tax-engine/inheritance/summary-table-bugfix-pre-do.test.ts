/**
 * Pre-Do anchor — 상속인별 집계표 버그 수정 (AN-1~AN-5)
 *
 * 계획서: docs/01-plan/inheritance-summary-table-bugfix.plan.md
 * 정책: [[feedback_pre_anchor_verification]] — RED 확보 후 수정 진행
 *
 * AN-1   : listed_stock + marketValue 명시 → grossEstate·categoryTotals.stock 누락 (수정 전 RED)
 * AN-1b  : categoryTotals.stock === Σ perHeir.categoryBreakdown.stock (자기일관성, 협의분할 시)
 * AN-1c  : marketValue < csv(avg×shares) 케이스 → 1-A+1-B 수정 후 3자 모두 명시값으로 일치
 * AN-2   : V2 비상장 기존 valuatedAmount 무변동 (범위 격리)
 * AN-3   : doneeId 없는 priorGift → ② 합계열 = priorGiftAggregated (수정 전 RED)
 * AN-5   : §13 도과 증여 + 유효 증여 → 도과분 제외 (수정 전 RED)
 */

import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import { buildSummaryTable } from "@/lib/calc/heir-allocation-summary";
import { computeStockValuation } from "@/lib/tax-engine/valuation/resolve-estate-item-value";
import type {
  InheritanceTaxInput,
  Heir,
  EstateItem,
  PriorGift,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// 공통 헬퍼
// ============================================================

const HEIRS_2: Heir[] = [
  { id: "h1", relation: "spouse", name: "배우자", isHeir: true },
  { id: "h2", relation: "child", name: "자녀", isHeir: true },
];

function baseInput(
  overrides: Partial<InheritanceTaxInput> = {},
): InheritanceTaxInput {
  return {
    decedentType: "resident",
    deathDate: "2026-01-01",
    estateItems: [],
    funeralExpense: 0,
    funeralIncludesBongan: false,
    debts: 0,
    preGiftsWithin10Years: [],
    heirs: HEIRS_2,
    deductionInput: { heirs: HEIRS_2 },
    creditInput: { isFiledOnTime: true },
    isGenerationSkip: false,
    ...overrides,
  };
}

// ============================================================
// AN-1 / AN-1b / AN-1c: Bug #1 — 주식 명시 평가액 누락
// ============================================================

describe("AN-1: listed_stock + marketValue 명시 → grossEstate·categoryTotals.stock 포함", () => {
  /**
   * listed_stock 2건:
   *   - 주식 A: marketValue=100M, 주식수/시세 미입력(computeStockValuation=0)
   *     → 수정 전: 엔진은 computeStockValuation=0 → grossEstate에서 100M 누락
   *     → 수정 후: resolveEstateItemValue=100M → 포함
   *   - 주식 B: listedStockAvgPrice=5,000 × 주식수=20,000 = 100M (csv)
   *     → 수정 전후 동일
   */
  const stockA: EstateItem = {
    id: "stockA",
    category: "listed_stock",
    name: "H사(명시 시가)",
    marketValue: 100_000_000,
    // listedStockShares·listedStockAvgPrice 미입력 → computeStockValuation=0
  };

  const stockB: EstateItem = {
    id: "stockB",
    category: "listed_stock",
    name: "삼성전자(avg×shares)",
    listedStockAvgPrice: 5_000,
    listedStockShares: 20_000,
    heirAllocations: [{ heirId: "h2", amount: 100_000_000 }],
  };

  const csvB = computeStockValuation(stockB);
  // stockB의 csv 확인
  expect(csvB).toBe(100_000_000);

  const r = calcInheritanceTax(baseInput({ estateItems: [stockA, stockB] }));
  const expectedStockTotal = 100_000_000 + csvB; // 200M

  it("grossEstateValue = 200M (명시 100M + csv 100M)", () => {
    expect(r.grossEstateValue).toBe(expectedStockTotal);
  });

  it("summaryTable.categoryTotals.stock = 200M", () => {
    expect(r.summaryTable?.categoryTotals.stock).toBe(expectedStockTotal);
  });

  it("grossEstateValue > csvB (명시값 포함 증명)", () => {
    // 수정 전: grossEstate=100M(stockB만) / 수정 후: 200M
    expect(r.grossEstateValue).toBeGreaterThan(csvB);
  });
});

describe("AN-1b: categoryTotals.stock === Σ perHeir.categoryBreakdown.stock (자기일관성)", () => {
  /**
   * 협의분할 입력 시 합계열↔인별열 항등식 검증
   * stockA: marketValue=100M, 협의분할 배우자 100%
   * stockB: csv=100M, 협의분할 자녀 100%
   */
  const stockA: EstateItem = {
    id: "stockA",
    category: "listed_stock",
    name: "H사(명시)",
    marketValue: 100_000_000,
    heirAllocations: [{ heirId: "h1", amount: 100_000_000 }],
  };

  const stockB: EstateItem = {
    id: "stockB",
    category: "listed_stock",
    name: "삼성(csv)",
    listedStockAvgPrice: 5_000,
    listedStockShares: 20_000,
    heirAllocations: [{ heirId: "h2", amount: 100_000_000 }],
  };

  const r = calcInheritanceTax(baseInput({ estateItems: [stockA, stockB] }));

  it("categoryTotals.stock === Σ perHeir.categoryBreakdown.stock", () => {
    const totalFromSummary = r.summaryTable?.categoryTotals.stock ?? -1;
    const perHeir = r.heirAllocationResult?.perHeir ?? {};
    const sumFromPerHeir = Object.values(perHeir).reduce(
      (s, h) => s + (h?.categoryBreakdown?.stock ?? 0),
      0,
    );
    expect(totalFromSummary).toBe(sumFromPerHeir);
  });
});

describe("AN-1c: marketValue < csv 케이스 → 1-A+1-B 수정 후 합계열·인별열·validate 일치", () => {
  /**
   * stockA: marketValue=80M, csv(avg×shares)=200M
   *   → 수정 전 1-A만: 엔진=80M(explicit-first), validate=max=200M
   *     → validate가 협의분할 200M 강제 → 인별=200M > 합계=80M (역방향 갭)
   *   → 수정 후 1-A+1-B: 엔진=validate=80M(explicit-first) → 3자 일치
   *
   * 협의분할 80M(=명시값)으로 입력 → validate 통과 확인
   */
  const stockA: EstateItem = {
    id: "stockA",
    category: "listed_stock",
    name: "X사(명시<csv)",
    marketValue: 80_000_000,
    listedStockAvgPrice: 10_000,
    listedStockShares: 20_000, // csv=200M > marketValue=80M
    // 명시값 80M으로 협의분할
    heirAllocations: [
      { heirId: "h1", amount: 48_000_000 }, // 60%
      { heirId: "h2", amount: 32_000_000 }, // 40%
    ],
  };

  const r = calcInheritanceTax(baseInput({ estateItems: [stockA] }));
  const perHeir = r.heirAllocationResult?.perHeir ?? {};

  it("grossEstateValue = 80M (명시값 우선, csv 200M 아님)", () => {
    expect(r.grossEstateValue).toBe(80_000_000);
  });

  it("categoryTotals.stock = 80M", () => {
    expect(r.summaryTable?.categoryTotals.stock).toBe(80_000_000);
  });

  it("인별 categoryBreakdown.stock 합 = 80M (협의분할 합산)", () => {
    const sumStock = Object.values(perHeir).reduce(
      (s, h) => s + (h?.categoryBreakdown?.stock ?? 0),
      0,
    );
    expect(sumStock).toBe(80_000_000);
  });

  it("합계열·인별열 일치 (역방향 갭 없음)", () => {
    const totalFromSummary = r.summaryTable?.categoryTotals.stock ?? -1;
    const sumFromPerHeir = Object.values(perHeir).reduce(
      (s, h) => s + (h?.categoryBreakdown?.stock ?? 0),
      0,
    );
    expect(totalFromSummary).toBe(sumFromPerHeir);
  });
});

// ============================================================
// AN-2: V2 비상장 범위 격리 (수정 전후 valuatedAmount 동일)
// ============================================================

describe("AN-2: V2 비상장 범위 격리 — 수정 영향 없음", () => {
  /**
   * V2 비상장은 evaluateAllEstateItems(:373)에서 evaluateUnlistedStockV2AsPropertyResult로
   * 별도 라우팅되므로 1-A(evaluateStockAsPropertyResult 수정)의 영향을 받지 않는다.
   * V1 간편 비상장으로 동일 범위 격리 검증:
   *   - unlistedValuationMode: "simple" → evaluateStockAsPropertyResult 경로
   *   - 명시 marketValue 없이 computeStockValuation 결과 사용
   *   → 수정 전후 동일값 (V1에 명시값이 없으므로 영향 없음)
   */
  const v1Stock: EstateItem = {
    id: "v1stock",
    category: "unlisted_stock",
    name: "V1간편비상장",
    unlistedValuationMode: "simple",
    unlistedStockData: {
      totalShares: 10_000,
      ownedShares: 5_000,
      weightedNetIncome: 200_000_000,
      netAssetValue: 1_000_000_000,
      capitalizationRate: 0.1,
      isRealEstateHeavy: false,
    },
    // marketValue 미입력 → resolveEstateItemValue가 computeStockValuation으로 fallback
  };

  const csvVal = computeStockValuation(v1Stock);
  const r = calcInheritanceTax(baseInput({ estateItems: [v1Stock] }));

  it("V1 간편: grossEstateValue = computeStockValuation 결과 (명시값 없으면 동일)", () => {
    expect(csvVal).toBeGreaterThan(0);
    expect(r.grossEstateValue).toBe(csvVal);
  });

  it("V1 간편: 수정 영향 없음 — marketValue 없으면 resolveEstateItemValue = computeStockValuation", () => {
    // resolveEstateItemValue: marketValue 없으면 computeStockValuation fallback
    // 따라서 수정 전(computeStockValuation)과 수정 후(resolveEstateItemValue) 동일값
    expect(r.grossEstateValue).toBe(csvVal);
  });
});

// ============================================================
// AN-3: Bug #2-A — doneeId 없는 priorGift → ② 합계열 = priorGiftAggregated
// ============================================================

describe("AN-3: doneeId 없는 priorGift 3건 → ② 합계열 = priorGiftAggregated", () => {
  /**
   * doneeId 미입력 사전증여 3건(합계 2,960M — 실제 cutoff 내 기준)
   * 수정 전: ② total = Σ perHeir.priorGiftAmount = 0 (doneeId skip)
   * 수정 후: ② total = result.priorGiftAggregated > 0
   */
  const priorGifts: PriorGift[] = [
    {
      // doneeId 없음
      giftDate: "2024-01-01",
      isHeir: true,
      giftAmount: 760_000_000,
      giftTaxPaid: 22_000_000,
    },
    {
      // doneeId 없음
      giftDate: "2023-01-01",
      isHeir: true,
      giftAmount: 1_500_000_000,
      giftTaxPaid: 420_000_000,
    },
    {
      // doneeId 없음 (비상속인, 5년 이내)
      giftDate: "2024-06-01",
      isHeir: false,
      giftAmount: 700_000_000,
      giftTaxPaid: 0,
    },
  ];

  const r = calcInheritanceTax(
    baseInput({
      deathDate: "2026-01-01",
      preGiftsWithin10Years: priorGifts,
    }),
  );

  const summaryRows = buildSummaryTable(r, HEIRS_2);
  const row2 = summaryRows.rows.find((row) => row.rowId === "row-2-priorGift");

  it("result.priorGiftAggregated > 0 (엔진 정상 합산)", () => {
    expect(r.priorGiftAggregated).toBeGreaterThan(0);
  });

  it("② 행 total === result.priorGiftAggregated (수정 전 RED: 0 또는 null)", () => {
    // 수정 전: priorGiftTotal = Σ perHeir.priorGiftAmount = 0 → total = null
    // 수정 후: total = priorGiftAggregated > 0
    const rowTotal = row2?.total ?? 0;
    expect(rowTotal).toBe(r.priorGiftAggregated);
  });

  it("② 인별 셀 모두 0 (doneeId 미지정 — 인별 배부 생략)", () => {
    // 수정 2-A는 합계열 표시 전용; 인별 배부는 2-B(Heir select) 구현 후
    for (const heirId of ["h1", "h2"]) {
      const cellVal = row2?.perHeir[heirId] ?? 0;
      expect(cellVal ?? 0).toBe(0);
    }
  });
});

// ============================================================
// AN-5: §13 도과(cutoff 초과) 증여 + 유효 증여 → cutoff 정합
// ============================================================

describe("AN-5: §13 도과 증여 제외 — ② total = priorGiftAggregated (도과분 제외)", () => {
  /**
   * deathDate: 2026-01-01
   * 상속인(isHeir=true) 증여: 10년 초과(도과) + 10년 이내(유효)
   * 비상속인(isHeir=false) 증여: 5년 초과(도과) + 5년 이내(유효)
   *
   * isWithin13Cutoff: elapsedYears <= limitYears(10 or 5)
   *   - 상속인 2014-12-31 증여: differenceInYears(2026-01-01, 2014-12-31) = 11년 → 도과
   *   - 상속인 2016-02-01 증여: differenceInYears(2026-01-01, 2016-02-01) = 9년 → 유효
   *   - 비상속인 2020-06-01 증여: differenceInYears(2026-01-01, 2020-06-01) = 5년 → 유효(=5)
   *   - 비상속인 2019-12-31 증여: differenceInYears(2026-01-01, 2019-12-31) = 6년 → 도과
   *
   * doneeId 지정 + cutoff 2-C 수정 후:
   *   - priorGiftAggregated = 유효분만 합산
   *   - calcHeirAllocation도 유효분만 수신 → 인별 priorGiftAmount = 유효분
   *   - ② total = priorGiftAggregated (도과분 제외)
   */

  const priorGifts: PriorGift[] = [
    {
      // 상속인 도과 (11년) — 합산 제외
      giftDate: "2014-12-31",
      isHeir: true,
      giftAmount: 300_000_000, // 도과분
      giftTaxPaid: 50_000_000,
      doneeId: "h2",
      beneficiaryType: "heir",
    },
    {
      // 상속인 유효 (9년)
      giftDate: "2016-02-01",
      isHeir: true,
      giftAmount: 500_000_000, // 유효분
      giftTaxPaid: 80_000_000,
      doneeId: "h2",
      beneficiaryType: "heir",
    },
    {
      // 비상속인 유효 (=5년, 포함)
      giftDate: "2020-06-01",
      isHeir: false,
      giftAmount: 200_000_000,
      giftTaxPaid: 0,
      doneeId: "h1",
      beneficiaryType: "heir",
    },
    {
      // 비상속인 도과 (6년)
      giftDate: "2019-12-31",
      isHeir: false,
      giftAmount: 400_000_000, // 도과분
      giftTaxPaid: 0,
      doneeId: "h1",
      beneficiaryType: "heir",
    },
  ];

  const r = calcInheritanceTax(
    baseInput({
      deathDate: "2026-01-01",
      preGiftsWithin10Years: priorGifts,
    }),
  );

  // 유효 합산: 500M(상속인) + 200M(비상속인) = 700M
  const expectedAggregated = 500_000_000 + 200_000_000;

  const summaryRows = buildSummaryTable(r, HEIRS_2);
  const row2 = summaryRows.rows.find((row) => row.rowId === "row-2-priorGift");

  it("priorGiftAggregated = 700M (도과분 제외)", () => {
    expect(r.priorGiftAggregated).toBe(expectedAggregated);
  });

  it("② total = priorGiftAggregated = 700M (수정 전 RED: 도과분 포함)", () => {
    const rowTotal = row2?.total ?? 0;
    expect(rowTotal).toBe(expectedAggregated);
  });

  it("② Σ 인별 = priorGiftAggregated (cutoff 2-C 적용 후 인별도 도과분 제외)", () => {
    // 2-C 수정 후: calcHeirAllocation이 cutoff-filtered 증여만 수신
    // h2(자녀): 유효 500M만 / h1(배우자): 유효 200M만
    const perHeir = r.heirAllocationResult?.perHeir ?? {};
    const sumPerHeir = Object.values(perHeir).reduce(
      (s, h) => s + (h?.priorGiftAmount ?? 0),
      0,
    );
    expect(sumPerHeir).toBe(expectedAggregated);
  });

  it("인별 ④ 과다 계상 없음 — Σ priorGiftAmount ≤ priorGiftAggregated (도과분 미포함 증명)", () => {
    // 도과분(도과 상속인 300M + 도과 비상속인 400M = 700M)이 포함되면
    // Σ perHeir.priorGiftAmount = 1,400M > priorGiftAggregated(700M) → 과다
    // 2-C 수정 후: cutoffFilteredGifts만 calcHeirAllocation 전달 → 유효분(700M)만 배부
    const perHeir = r.heirAllocationResult?.perHeir ?? {};
    const sumPerHeirGift = Object.values(perHeir).reduce(
      (s, h) => s + (h?.priorGiftAmount ?? 0),
      0,
    );
    // 유효분 합계(700M)와 동일 — 도과분(700M) 과다 계상 없음
    expect(sumPerHeirGift).toBe(expectedAggregated);
    // priorGiftAggregated와 동일 (cutoff 집합 일치)
    expect(sumPerHeirGift).toBe(r.priorGiftAggregated);
  });
});
