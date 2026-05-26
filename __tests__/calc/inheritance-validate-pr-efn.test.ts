/**
 * UI 통합 anchor — Phase E·N validate refines (PR-E·N)
 *
 * 검증 대상 (UI 통합 plan v3 §5-0 + design v3 §6):
 *   UI-VAL-4: PR-N 행 단위 입력 + accountName 빈 문자열 → 차단
 *   UI-VAL-5: PR-N 행 수 초과 (자산 51행) → 차단
 *
 * §54① 본문 괄호 부동산과다보유 판정은 사용자 ON/OFF 직접 지정 (UI ToggleCard) — auto 모드 검증 제거.
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-ui-integration.plan.md §5-0
 * Design: docs/02-design/features/inheritance-unlisted-stock-valuation-ui-integration.design.md §3-2
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

// ============================================================
// UI-VAL-6~12: 사업연도 종료일·자본금 변동 신규 검증 (이번 PR)
// ============================================================

describe("[UI-VAL-6] 사업연도 종료일 미입력 차단", () => {
  it("UI-VAL-6a: 1년전 종료일 undefined → 차단", () => {
    const item = makeItem({
      fiscalYears: [
        // @ts-expect-error 의도적 invalid — 검증 대상
        { fiscalYearLabel: "2023", fiscalYearEndDate: undefined, taxableIncome: 0 },
        emptyFY("2022", new Date("2022-12-31")),
        emptyFY("2021", new Date("2021-12-31")),
      ],
    });
    const err = validateUnlistedStockV2(item);
    expect(err).toContain("1년전 사업연도 종료일을 입력해야 합니다");
  });

  it("UI-VAL-6b: 2년전 종료일 Invalid Date → 차단", () => {
    const item = makeItem({
      fiscalYears: [
        emptyFY("2023", new Date("2023-12-31")),
        { fiscalYearLabel: "2022", fiscalYearEndDate: new Date("invalid"), taxableIncome: 0 },
        emptyFY("2021", new Date("2021-12-31")),
      ],
    });
    const err = validateUnlistedStockV2(item);
    expect(err).toContain("2년전 사업연도 종료일을 입력해야 합니다");
  });

  it("UI-VAL-6c: 3년전 종료일 undefined → 차단", () => {
    const item = makeItem({
      fiscalYears: [
        emptyFY("2023", new Date("2023-12-31")),
        emptyFY("2022", new Date("2022-12-31")),
        // @ts-expect-error 의도적 invalid
        { fiscalYearLabel: "2021", fiscalYearEndDate: undefined, taxableIncome: 0 },
      ],
    });
    const err = validateUnlistedStockV2(item);
    expect(err).toContain("3년전 사업연도 종료일을 입력해야 합니다");
  });

  it("UI-VAL-6d: 3개 모두 정상 입력 → 통과", () => {
    const item = makeItem({});
    const err = validateUnlistedStockV2(item);
    expect(err).toBeNull();
  });
});

describe("[UI-VAL-7] 자본금 변동 — 변동일 미입력 차단", () => {
  it("UI-VAL-7a: 유상증자 변동일 undefined → 차단", () => {
    const item = makeItem({
      capitalChanges: [
        { changeType: "paid_in", changeDate: undefined, sharesIssued: 1_000, pricePerShare: 10_000 },
      ],
    });
    const err = validateUnlistedStockV2(item);
    expect(err).toContain("변동일을 입력해야 합니다");
  });

  it("UI-VAL-7b: 무상증자 변동일 Invalid Date → 차단", () => {
    const item = makeItem({
      capitalChanges: [
        { changeType: "free_issue", changeDate: new Date("invalid"), sharesIssued: 1_000 },
      ],
    });
    const err = validateUnlistedStockV2(item);
    expect(err).toContain("변동일을 입력해야 합니다");
  });
});

describe("[UI-VAL-8] 자본금 변동 — 주식수 0 차단", () => {
  it("UI-VAL-8a: 유상증자 sharesIssued=0 → 차단", () => {
    const item = makeItem({
      capitalChanges: [
        { changeType: "paid_in", changeDate: new Date("2023-06-01"), sharesIssued: 0, pricePerShare: 10_000 },
      ],
    });
    const err = validateUnlistedStockV2(item);
    expect(err).toContain("주식수를 1 이상 입력해야 합니다");
  });

  it("UI-VAL-8b: 무상증자 sharesIssued 미설정(0) → 차단", () => {
    const item = makeItem({
      capitalChanges: [
        { changeType: "free_issue", changeDate: new Date("2023-06-01"), sharesIssued: 0 },
      ],
    });
    const err = validateUnlistedStockV2(item);
    expect(err).toContain("주식수를 1 이상 입력해야 합니다");
  });
});

describe("[UI-VAL-9] 유상감자 1주당 지급금액 필수", () => {
  it("UI-VAL-9a: 유상감자 pricePerShare 미입력(0) → 차단", () => {
    const item = makeItem({
      capitalChanges: [
        { changeType: "capital_reduction", changeDate: new Date("2023-06-01"), sharesIssued: 500, pricePerShare: 0 },
      ],
    });
    const err = validateUnlistedStockV2(item);
    expect(err).toContain("유상감자");
    expect(err).toContain("1주당 지급금액");
  });

  it("UI-VAL-9b: 유상감자 pricePerShare=undefined → 차단", () => {
    const item = makeItem({
      capitalChanges: [
        { changeType: "capital_reduction", changeDate: new Date("2023-06-01"), sharesIssued: 500, pricePerShare: undefined },
      ],
    });
    const err = validateUnlistedStockV2(item);
    expect(err).toContain("유상감자");
    expect(err).toContain("1주당 지급금액");
  });

  it("UI-VAL-9c: 유상감자 pricePerShare 정상 입력 → 통과", () => {
    const item = makeItem({
      capitalChanges: [
        { changeType: "capital_reduction", changeDate: new Date("2023-06-01"), sharesIssued: 500, pricePerShare: 8_000 },
      ],
    });
    const err = validateUnlistedStockV2(item);
    expect(err).toBeNull();
  });
});

describe("[UI-VAL-10] 무상증자 pricePerShare 검증 제외 (§56⑤ 미적용)", () => {
  it("UI-VAL-10: 무상증자 pricePerShare 없어도 통과", () => {
    const item = makeItem({
      capitalChanges: [
        { changeType: "free_issue", changeDate: new Date("2023-06-01"), sharesIssued: 2_000 },
      ],
    });
    const err = validateUnlistedStockV2(item);
    expect(err).toBeNull();
  });
});
