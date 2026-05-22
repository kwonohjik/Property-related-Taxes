/**
 * UI 통합 anchor — Phase E validate refines (PR-E·F·N)
 *
 * 검증 대상 (UI 통합 plan v3 §5-0 + design v3 §6):
 *   UI-VAL-1: realEstateHeavyMode="auto" + 자산 미입력 → 차단
 *   UI-VAL-2: realEstateHeavyMode="auto" + realEstateAssetsForJudgment undefined → 차단
 *   UI-VAL-3: realEstateHeavyMode="manual_on" + 자산 미입력 → 통과 (manual은 자산 검증 X)
 *   UI-VAL-4: PR-N 행 단위 입력 + accountName 빈 문자열 → 차단
 *   UI-VAL-5: PR-N 행 수 초과 (자산 51행) → 차단
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-ui-integration.plan.md §5-0
 * Design: docs/02-design/features/inheritance-unlisted-stock-valuation-ui-integration.design.md §3-2·§6
 */

import { describe, it, expect } from "vitest";
import { validateUnlistedStockV2 } from "@/lib/calc/inheritance-validate";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type {
  UnlistedNetAssetCalculation,
  FiscalYearAdjustment,
} from "@/lib/tax-engine/types/unlisted-stock-valuation.types";
import type { EvaluationDeltaRow } from "@/lib/tax-engine/property-valuation/evaluation-delta";

const EMPTY_NET_ASSET: UnlistedNetAssetCalculation = {
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

function emptyFY(label: string, endDate: Date): FiscalYearAdjustment {
  return { fiscalYearLabel: label, fiscalYearEndDate: endDate, taxableIncome: 0 };
}

function makeItem(
  overrides: Partial<EstateItem["unlistedStockValuationV2"]> = {},
  deltaRows?: EvaluationDeltaRow[],
): EstateItem {
  return {
    id: "test-stock",
    category: "unlisted_stock",
    name: "테스트 비상장주식",
    unlistedStockValuationV2: {
      corpName: "테스트법인",
      businessStartDate: new Date("2010-01-01"),
      evaluationDate: new Date("2024-01-20"),
      faceValuePerShare: 5_000,
      totalShares: 10_000,
      ownedShares: 5_000,
      isRealEstateHeavy: false,
      fiscalYears: [
        emptyFY("2023", new Date("2023-12-31")),
        emptyFY("2022", new Date("2022-12-31")),
        emptyFY("2021", new Date("2021-12-31")),
      ],
      capitalChanges: [],
      netAssetValueRaw: deltaRows
        ? { ...EMPTY_NET_ASSET, evaluationDeltaRows: deltaRows }
        : { ...EMPTY_NET_ASSET },
      isContinuousLossLastThreeYears: false,
      capitalizationRate: 0.10,
      isMaxShareholder: false,
      companySize: "large",
      ...overrides,
    } as EstateItem["unlistedStockValuationV2"],
  };
}

// ============================================================
// UI-VAL-1·2·3: PR-F auto 모드 자산 필수
// ============================================================

describe("[UI-VAL-1] PR-F auto 모드 — 자산총액 미입력 차단", () => {
  it("UI-VAL-1: realEstateHeavyMode='auto' + totalAssetsForJudgment 미입력 → 차단", () => {
    const item = makeItem({
      realEstateHeavyMode: "auto",
      // totalAssetsForJudgment 미입력
      realEstateAssetsForJudgment: 100_000_000,
    });
    const err = validateUnlistedStockV2(item);
    expect(err).toContain("§54⑤ 자동 판정 모드에서는 자산총액 입력이 필수");
  });

  it("UI-VAL-2: realEstateHeavyMode='auto' + realEstateAssetsForJudgment undefined → 차단", () => {
    const item = makeItem({
      realEstateHeavyMode: "auto",
      totalAssetsForJudgment: 1_000_000_000,
      // realEstateAssetsForJudgment undefined
    });
    const err = validateUnlistedStockV2(item);
    expect(err).toContain("부동산 자산 합계 입력이 필수");
  });

  it("UI-VAL-2b: realEstateHeavyMode='auto' + realEstateAssetsForJudgment=0 명시 → 통과 (전부 비부동산)", () => {
    const item = makeItem({
      realEstateHeavyMode: "auto",
      totalAssetsForJudgment: 1_000_000_000,
      realEstateAssetsForJudgment: 0,
    });
    const err = validateUnlistedStockV2(item);
    expect(err).toBeNull();
  });

  it("UI-VAL-3: manual_on 모드 시 자산 미입력 → 통과 (수동은 자산 검증 X)", () => {
    const item = makeItem({
      realEstateHeavyMode: "manual_on",
      // 자산 미입력
    });
    const err = validateUnlistedStockV2(item);
    expect(err).toBeNull();
  });

  it("UI-VAL-3b: manual_off 모드 시 자산 미입력 → 통과", () => {
    const item = makeItem({
      realEstateHeavyMode: "manual_off",
    });
    const err = validateUnlistedStockV2(item);
    expect(err).toBeNull();
  });

  it("UI-VAL-3c: 모드 미지정 (undefined) → 통과 (default 비활성)", () => {
    const item = makeItem({
      // realEstateHeavyMode undefined → default 동작 검증 X
    });
    const err = validateUnlistedStockV2(item);
    expect(err).toBeNull();
  });
});

// ============================================================
// UI-VAL-4·5: PR-N 평가차액 행 단위 검증
// ============================================================

describe("[UI-VAL-4] PR-N 행 단위 — accountName 빈 문자열 차단", () => {
  it("UI-VAL-4: accountName 빈 → 차단", () => {
    const item = makeItem(
      {},
      [
        {
          rowId: "a1",
          category: "asset",
          accountName: "", // 빈 문자열
          evaluationAmount: 100_000_000,
          bookAmount: 90_000_000,
        },
      ],
    );
    const err = validateUnlistedStockV2(item);
    expect(err).toContain("계정과목이 비어");
  });

  it("UI-VAL-4b: accountName 공백만 → 차단", () => {
    const item = makeItem(
      {},
      [
        {
          rowId: "a1",
          category: "asset",
          accountName: "   ",
          evaluationAmount: 100_000_000,
          bookAmount: 90_000_000,
        },
      ],
    );
    const err = validateUnlistedStockV2(item);
    expect(err).toContain("계정과목이 비어");
  });

  it("UI-VAL-4c: accountName 정상 입력 → 통과", () => {
    const item = makeItem(
      {},
      [
        {
          rowId: "a1",
          category: "asset",
          accountName: "미수이자",
          evaluationAmount: 100_000_000,
          bookAmount: 90_000_000,
        },
      ],
    );
    const err = validateUnlistedStockV2(item);
    expect(err).toBeNull();
  });
});

describe("[UI-VAL-5] PR-N 행 수 초과 차단", () => {
  it("UI-VAL-5: 자산 51행 → 차단", () => {
    const rows: EvaluationDeltaRow[] = Array.from({ length: 51 }, (_, i) => ({
      rowId: `a${i}`,
      category: "asset" as const,
      accountName: `계정${i}`,
      evaluationAmount: 1_000_000,
      bookAmount: 900_000,
    }));
    const item = makeItem({}, rows);
    const err = validateUnlistedStockV2(item);
    expect(err).toContain("자산 평가차액 행은 50개를 초과");
  });

  it("UI-VAL-5b: 부채 31행 → 차단", () => {
    const rows: EvaluationDeltaRow[] = Array.from({ length: 31 }, (_, i) => ({
      rowId: `l${i}`,
      category: "liability" as const,
      accountName: `부채${i}`,
      evaluationAmount: 1_000_000,
      bookAmount: 900_000,
    }));
    const item = makeItem({}, rows);
    const err = validateUnlistedStockV2(item);
    expect(err).toContain("부채 평가차액 행은 30개를 초과");
  });
});
