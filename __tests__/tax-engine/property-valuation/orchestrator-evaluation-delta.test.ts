/**
 * PR-N UI 통합 anchor — 엔진 진입점 resolveEvaluationDelta 통합 검증
 *
 * 검증 대상 (UI 통합 디자인 v3 §6 + plan v3 §5-0):
 *   UI-N-1: 행 단위 입력 → 평가차액 자동 도출 (자산 합 − 부채 합)
 *   UI-N-2: 행 미입력 시 총액 assetValuationDelta fallback (회귀, 사례 6 동일 결과)
 *
 * 본 anchor는 `unlisted-orchestrator.ts:113` 엔진 진입점에서 `resolveEvaluationDelta()`를
 * 호출하여 행 단위 입력 시 평가차액을 자동 도출하는 통합 동작 검증.
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-ui-integration.plan.md §5-0
 * Design: docs/02-design/features/inheritance-unlisted-stock-valuation-ui-integration.design.md §6
 */

import { describe, it, expect } from "vitest";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import type {
  UnlistedStockValuationInput,
  UnlistedNetAssetCalculation,
  FiscalYearAdjustment,
} from "@/lib/tax-engine/types/unlisted-stock-valuation.types";
import type { EvaluationDeltaRow } from "@/lib/tax-engine/property-valuation/evaluation-delta";

// ============================================================
// 사례 6 기본 입력 헬퍼
// ============================================================

const CASE_6_NET_ASSET_BASE: UnlistedNetAssetCalculation = {
  bsTotalAssets: 2_476_889_520,
  assetValuationDelta: 91_548_350, // 총액 fallback 기본값
  corpTaxReservedAmount: 0,
  paidInCapitalIncrease: 0,
  otherEarnedRights: 0,
  prepaidExpenses: 65_400_500,
  preGiftRetainedEarnings: 0,
  bsTotalLiabilities: 1_833_780_000,
  corporateTaxPayable: 32_627_890,
  farmingSurtax: 0,
  localIncomeTax: 3_262_780,
  dividendPayable: 0,
  retirementProvision: 445_785_000,
  otherProvision: 0,
  reserveExcluded: 0,
  allowanceExcluded: 301_770_000,
  deferredTaxAdjustment: 0,
};

// 사례 6 3쪽 5.평가차액 행 (자산 8행 + 부채 3행)
const CASE_6_DELTA_ROWS: EvaluationDeltaRow[] = [
  { rowId: "a1", category: "asset", accountName: "미수이자", evaluationAmount: 5_744_770, bookAmount: 5_300_000 },
  { rowId: "a2", category: "asset", accountName: "매출채권", evaluationAmount: 299_050_000, bookAmount: 298_534_500 },
  { rowId: "a3", category: "asset", accountName: "단기대여금", evaluationAmount: 493_000_000, bookAmount: 495_000_000 },
  { rowId: "a4", category: "asset", accountName: "상품및제품", evaluationAmount: 49_527_500, bookAmount: 55_027_500 },
  { rowId: "a5", category: "asset", accountName: "투자유가증권", evaluationAmount: 275_554_500, bookAmount: 250_887_000 },
  { rowId: "a6", category: "asset", accountName: "외화채권", evaluationAmount: 145_300_200, bookAmount: 150_670_350 },
  { rowId: "a7", category: "asset", accountName: "토지", evaluationAmount: 400_550_000, bookAmount: 330_500_000 },
  { rowId: "a8", category: "asset", accountName: "기계장치", evaluationAmount: 334_410_000, bookAmount: 309_893_470 },
  { rowId: "l1", category: "liability", accountName: "외화채무", evaluationAmount: 185_335_800, bookAmount: 200_560_000 },
  { rowId: "l2", category: "liability", accountName: "손해배상금", evaluationAmount: 26_000_000, bookAmount: 0 },
  { rowId: "l3", category: "liability", accountName: "보증채무", evaluationAmount: 5_000_000, bookAmount: 0 },
];

function emptyFY(label: string, endDate: Date, taxableIncome = 0): FiscalYearAdjustment {
  return { fiscalYearLabel: label, fiscalYearEndDate: endDate, taxableIncome };
}

function makeCase6Input(
  netAssetOverride: Partial<UnlistedNetAssetCalculation>,
): UnlistedStockValuationInput {
  return {
    corpName: "(주)향기**",
    businessStartDate: new Date("2010-01-01"),
    evaluationDate: new Date("2024-01-20"),
    faceValuePerShare: 5_000,
    totalShares: 50_000,
    ownedShares: 26_000,
    isRealEstateHeavy: false,
    fiscalYears: [
      emptyFY("2023", new Date("2023-12-31")),
      emptyFY("2022", new Date("2022-12-31")),
      emptyFY("2021", new Date("2021-12-31")),
    ],
    capitalChanges: [],
    netAssetValueRaw: { ...CASE_6_NET_ASSET_BASE, ...netAssetOverride },
    isContinuousLossLastThreeYears: false,
    capitalizationRate: 0.10,
    goodwillRate: 0.10,
    isMaxShareholder: false,
    companySize: "large",
  };
}

// ============================================================
// UI-N-1: 행 단위 입력 → 평가차액 자동 도출
// ============================================================

describe("[UI-N-1] 엔진 진입점 — 행 단위 평가차액 입력 자동 도출", () => {
  it("UI-N-1: 사례 6 행 단위 입력 (8자산+3부채) → assetValuationDelta=91,548,350 자동 도출", () => {
    const input = makeCase6Input({
      assetValuationDelta: 0, // 총액 0 — 행 단위가 우선되어야 함
      evaluationDeltaRows: CASE_6_DELTA_ROWS,
    });

    const result = evaluateUnlistedStockV2(input);

    // 행 단위 입력 → 자산 합 107,324,150 − 부채 합 15,775,800 = 91,548,350
    // 이 값이 assetValuationDelta에 주입되어 자산총액 계산에 사용됨
    // 자산총액 = bsTotalAssets(2,476,889,520) + assetValuationDelta(91,548,350) − prepaidExpenses(65,400,500)
    //          = 2,503,037,370 (사례 6 정합)
    // 부채총액 = 사례 6 동일 = 2,013,685,670
    // 영업권 포함 전 순자산 = 489,351,700
    expect(result.netAssetTotal).toBe(489_351_700); // 영업권 0 포함
    expect(result.netAssetPerShare).toBe(9_787);
  });
});

// ============================================================
// UI-N-2: 총액 fallback (행 미입력)
// ============================================================

describe("[UI-N-2] 엔진 진입점 — 행 미입력 시 총액 fallback (회귀 보호)", () => {
  it("UI-N-2a: evaluationDeltaRows 미입력 + assetValuationDelta 총액 → 사례 6 동일 결과", () => {
    const input = makeCase6Input({
      assetValuationDelta: 91_548_350, // 총액 직접 입력
      // evaluationDeltaRows 미입력
    });

    const result = evaluateUnlistedStockV2(input);

    // 사례 6 anchor U-15·U-12 정합 (case-3-net-asset-goodwill.test.ts)
    expect(result.netAssetTotal).toBe(489_351_700);
    expect(result.netAssetPerShare).toBe(9_787);
  });

  it("UI-N-2b: 행 빈 배열 + 총액 → 총액 fallback (행 길이 0 = 미입력 취급)", () => {
    const input = makeCase6Input({
      assetValuationDelta: 91_548_350,
      evaluationDeltaRows: [], // 빈 배열
    });

    const result = evaluateUnlistedStockV2(input);

    expect(result.netAssetTotal).toBe(489_351_700);
    expect(result.netAssetPerShare).toBe(9_787);
  });

  it("UI-N-2c: 행 입력 우선 — 총액 9,999,999,999와 동시 입력 시 행 단위 사용", () => {
    const input = makeCase6Input({
      assetValuationDelta: 9_999_999_999, // 의도적 큰 값
      evaluationDeltaRows: CASE_6_DELTA_ROWS, // 행 단위 우선
    });

    const result = evaluateUnlistedStockV2(input);

    // 행 단위 우선 → 사례 6 동일 결과 (총액 9,999,999,999 무시)
    expect(result.netAssetPerShare).toBe(9_787);
  });

  it("UI-N-2d: 자산 행만 있고 부채 행 없음 → 자산 합 그대로 평가차액", () => {
    const assetOnly = CASE_6_DELTA_ROWS.filter((r) => r.category === "asset");
    const input = makeCase6Input({
      assetValuationDelta: 0,
      evaluationDeltaRows: assetOnly,
    });

    const result = evaluateUnlistedStockV2(input);

    // 자산 합 107,324,150 − 부채 합 0 = 107,324,150
    // 자산총액 = 2,476,889,520 + 107,324,150 − 65,400,500 = 2,518,813,170
    // 부채총액 = 2,013,685,670 (동일)
    // 순자산 = 505,127,500
    expect(result.netAssetTotal).toBe(505_127_500);
  });
});
