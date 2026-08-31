/**
 * 주식 부담부증여 §159 경로 — 대주주 실입력 축 · 상장 환산 종가평균 · 개산공제 B/C 안분
 *
 * 리뷰 2026-08-28 #4 (critical).
 *
 * 결함 셋이 같은 body 빌더의 같은 전제 오류에서 나온다.
 *   (1) 대주주 판정 근거(지분율·시총)를 전부 0으로 하드코딩 → 자동 판정이 **항상 비대주주**.
 *       UI의 「대주주」 토글은 ④⑫⑭를 다 통과하고도 세액에 닿지 않는 dead input이었다.
 *   (2) 상장 환산(estimated)에 1개월 종가평균을 한 번도 보내지 않아
 *       `calcListedValuation`의 0-가드에 걸려 취득가액·개산공제가 **둘 다 0**.
 *   (3) 상장 estimated 분기가 §159 채무비율을 개산공제 base에 적용하지 않는다
 *       (비상장 분기는 이미 적용 — 비대칭).
 *
 * 법 근거: 소득세법 §94①3가목 · §104①11호 · 같은 법 시행령 §157①(대주주 범위 — **양도일**이
 *          속하는 사업연도의 직전 사업연도 종료일 기준) · §167의8①2호(비상장) ·
 *          §159①(부담부증여 안분 A×B/C) · §163⑥4호(개산공제) · §176의2②1호(환산취득가).
 */

import { describe, it, expect } from "vitest";
import { buildGiftStockBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
import { addStockRefines, stockTransferInputSchema } from "@/lib/api/stock-transfer-tax-schema";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { coerceDates } from "@/lib/api/date-coerce";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { FormState } from "@/components/calc/gift-tax-form-shared";
import { INITIAL_FORM } from "@/components/calc/gift-tax-form-shared";
import { validateStep } from "@/components/calc/gift-tax-form-validate";
import type { BurdenedGiftStockTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

const DATE_FIELDS = [
  "transferDate",
  "acquisitionDate",
  "filingDate",
  "priorYearEndDate",
  "listingDate",
] as const;

/** ④ → ⑫ → ⑭ → 엔진 전 계층을 그대로 태운다 (leaf 직접호출 금지 — ⑫를 건너뛰면 사각지대). */
function runFullStack(item: EstateItem, giftDate: string) {
  const body = buildGiftStockBurdenedTransferBody(item, { giftDate } as unknown as FormState);
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(body);
  if (!parsed.success) {
    return {
      blocked: true as const,
      body,
      issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }
  const coerced = coerceDates(
    parsed.data as Record<string, unknown>,
    DATE_FIELDS as unknown as string[],
  );
  return {
    blocked: false as const,
    body,
    result: calculateStockTransferTax(buildEngineInput(coerced)),
  };
}

function listedItem(bgt: Partial<BurdenedGiftStockTransferTaxInput>): EstateItem {
  return {
    id: "s1",
    name: "삼성전자",
    category: "listed_stock",
    marketValue: 100_000_000,
    listedStockShares: 1000,
    assumedDebtForGift: 10_000_000,
    burdenedGiftStockTransferTax: {
      marketType: "kospi",
      acquisitionDate: "2015-03-02",
      acquisitionMode: "estimated",
      ...bgt,
    },
  } as unknown as EstateItem;
}

describe("BG-AVG — 상장 환산 1개월 종가평균 입력 경로 (§176의2②1호 · §99①3)", () => {
  it("BG-AVG-1: 종가평균을 입력하면 환산취득가·개산공제가 산출된다", () => {
    const out = runFullStack(
      listedItem({
        transferDatePriceAvg1Month: 100_000,
        acquisitionDatePriceAvg1Month: 50_000,
      }),
      "2025-06-02",
    );
    expect(out.blocked).toBe(false);
    if (out.blocked) return;
    // 환산취득가 = 양도가액(채무 10,000,000) × 50,000/100,000
    expect(out.result.acquisitionPrice).toBe(5_000_000);
    // 개산공제 = 취득시 기준시가 총액(50,000 × 1,000) × 1% × 채무비율 0.1
    expect(out.result.estimatedDeduction).toBe(50_000);
    expect(out.result.calculatedTax).toBe(490_000);
  });

  it("BG-AVG-2: ④가 종가평균 2필드를 body에 싣는다 (침묵 strip 차단)", () => {
    const out = runFullStack(
      listedItem({
        transferDatePriceAvg1Month: 100_000,
        acquisitionDatePriceAvg1Month: 50_000,
      }),
      "2025-06-02",
    );
    expect(out.body.transferDatePriceAvg1Month).toBe(100_000);
    expect(out.body.acquisitionDatePriceAvg1Month).toBe(50_000);
  });

  it("BG-AVG-3: 종가평균 미입력이면 ⑫가 차단한다 (0-가드 침묵 통과 금지)", () => {
    const out = runFullStack(listedItem({}), "2025-06-02");
    expect(out.blocked).toBe(true);
    if (!out.blocked) return;
    expect(out.issues.join(" ")).toMatch(/종가\s*평균/);
  });

  it("BG-AVG-4: 실지취득가 모드는 종가평균 없이도 통과한다 (과다 차단 금지)", () => {
    const out = runFullStack(
      listedItem({ acquisitionMode: "actual", actualAcquisitionPrice: 40_000_000 }),
      "2025-06-02",
    );
    expect(out.blocked).toBe(false);
  });
});

describe("BG-MJ — §157 대주주 판정 실입력 축", () => {
  const majorFixture = (over: Partial<BurdenedGiftStockTransferTaxInput>) =>
    ({
      id: "s2",
      name: "삼성전자",
      category: "listed_stock",
      marketValue: 5_000_000_000,
      listedStockShares: 10_000,
      assumedDebtForGift: 1_000_000_000,
      burdenedGiftStockTransferTax: {
        marketType: "kospi",
        acquisitionDate: "2015-03-02",
        acquisitionMode: "actual",
        actualAcquisitionPrice: 500_000_000,
        ...over,
      },
    }) as unknown as EstateItem;

  it("BG-MJ-1: 지분율 실입력이 세율을 가른다 (하드코딩 0 제거)", () => {
    const nonMajor = runFullStack(majorFixture({}), "2025-06-02");
    const major = runFullStack(majorFixture({ selfShareRatioPercent: 2 }), "2025-06-02");
    expect(nonMajor.blocked).toBe(false);
    expect(major.blocked).toBe(false);
    if (nonMajor.blocked || major.blocked) return;
    expect(nonMajor.result.taxCategory).toBe("listed_off_market_non_major");
    expect(nonMajor.result.calculatedTax).toBe(179_500_000);
    expect(major.result.taxCategory).toBe("listed_major");
    expect(major.result.appliedRate).toBe(0.25);
    expect(major.result.calculatedTax).toBe(209_375_000);
  });

  it("BG-MJ-2: 시가총액 실입력만으로도 대주주가 된다 (§157①2호 OR 조건)", () => {
    const out = runFullStack(
      majorFixture({ selfMarketCap: 6_000_000_000 }),
      "2025-06-02",
    );
    expect(out.blocked).toBe(false);
    if (out.blocked) return;
    expect(out.result.taxCategory).toBe("listed_major");
  });

  it("BG-MJ-3: 판정기준일은 **양도일(증여일)** 축이다 (§157① — 취득연도 아님)", () => {
    // KOSPI 지분율 임계: 2013-01-01~ 2% / 2024-01-01~ 1%.
    // 취득일 2015 축이면 2014-12-31 → 2% → 1.5%는 비대주주(구 동작).
    // 양도일 2025 축이면 2024-12-31 → 1% → 1.5%는 대주주(정본).
    const out = runFullStack(majorFixture({ selfShareRatioPercent: 1.5 }), "2025-06-02");
    expect(out.blocked).toBe(false);
    if (out.blocked) return;
    expect(out.body.priorYearEndDate).toBe("2024-12-31");
    expect(out.result.taxCategory).toBe("listed_major");
  });

  it("BG-MJ-4: 판정기준일 직접 입력이 파생값을 이긴다 (사업연도 ≠ 12/31)", () => {
    const out = runFullStack(
      majorFixture({ selfShareRatioPercent: 1.5, majorJudgmentDate: "2015-03-31" }),
      "2025-06-02",
    );
    expect(out.blocked).toBe(false);
    if (out.blocked) return;
    expect(out.body.priorYearEndDate).toBe("2015-03-31");
    // 2013-01-01 행(2%)이 걸려 1.5%는 임계 미달 → 비대주주
    expect(out.result.taxCategory).toBe("listed_off_market_non_major");
  });

  it("BG-MJ-5: 비상장도 자동 판정 대상이다 (§167의8①2호 — 4% / 10억)", () => {
    const base = {
      id: "s3",
      name: "비상장",
      category: "unlisted_stock",
      marketValue: 5_000_000_000,
      assumedDebtForGift: 1_000_000_000,
      unlistedStockData: { totalShares: 100_000, ownedShares: 10_000 },
    };
    const mk = (over: Partial<BurdenedGiftStockTransferTaxInput>) =>
      ({
        ...base,
        burdenedGiftStockTransferTax: {
          marketType: "unlisted",
          acquisitionDate: "2015-03-02",
          acquisitionMode: "actual",
          actualAcquisitionPrice: 500_000_000,
          ...over,
        },
      }) as unknown as EstateItem;
    const nonMajor = runFullStack(mk({}), "2025-06-02");
    const major = runFullStack(mk({ selfShareRatioPercent: 5 }), "2025-06-02");
    expect(nonMajor.blocked).toBe(false);
    expect(major.blocked).toBe(false);
    if (nonMajor.blocked || major.blocked) return;
    expect(nonMajor.result.taxCategory).not.toBe("unlisted_major");
    expect(major.result.taxCategory).toBe("unlisted_major");
    expect(major.result.calculatedTax).not.toBe(nonMajor.result.calculatedTax);
  });

  it("BG-MJ-6: 합산 축은 최대주주그룹 ON일 때만 판정에 들어간다", () => {
    // 본인 0.5%(임계 1% 미달)를 함께 넣어 F-24 강제합산(본인 미보유 시 자동 합산) 분기를 피한다 —
    // 본인이 0/0이면 합산값만으로도 엔진이 강제로 합산 판정하므로 토글 축이 관측되지 않는다.
    const off = runFullStack(
      majorFixture({ selfShareRatioPercent: 0.5, combinedShareRatioPercent: 5 }),
      "2025-06-02",
    );
    const on = runFullStack(
      majorFixture({
        selfShareRatioPercent: 0.5,
        isLargestShareholderGroup: true,
        combinedShareRatioPercent: 5,
      }),
      "2025-06-02",
    );
    expect(off.blocked).toBe(false);
    expect(on.blocked).toBe(false);
    if (off.blocked || on.blocked) return;
    expect(off.result.taxCategory).toBe("listed_off_market_non_major");
    expect(on.result.taxCategory).toBe("listed_major");
  });
});

describe("BG-DR — §159 채무비율이 개산공제 base에 적용된다 (상장·비상장 대칭)", () => {
  it("BG-DR-1: ④가 상장 환산에도 burdenedGiftDebtRatio를 싣는다", () => {
    const out = runFullStack(
      listedItem({
        transferDatePriceAvg1Month: 100_000,
        acquisitionDatePriceAvg1Month: 50_000,
      }),
      "2025-06-02",
    );
    expect(out.body.burdenedGiftDebtRatio).toBeCloseTo(0.1, 10);
  });

  it("BG-DR-2: 채무비율이 개산공제를 실제로 움직인다 (엔진 상장 분기 도달)", () => {
    // 채무비율 0.1 → 개산공제 500,000 × 0.1 = 50,000
    const tenth = runFullStack(
      listedItem({
        transferDatePriceAvg1Month: 100_000,
        acquisitionDatePriceAvg1Month: 50_000,
      }),
      "2025-06-02",
    );
    // 채무 = 평가액 전액(비율 1) → 안분 없음 → 개산공제 500,000
    const whole = runFullStack(
      {
        ...listedItem({
          transferDatePriceAvg1Month: 100_000,
          acquisitionDatePriceAvg1Month: 50_000,
        }),
        assumedDebtForGift: 100_000_000,
      } as EstateItem,
      "2025-06-02",
    );
    expect(tenth.blocked).toBe(false);
    expect(whole.blocked).toBe(false);
    if (tenth.blocked || whole.blocked) return;
    expect(tenth.result.estimatedDeduction).toBe(50_000);
    expect(whole.result.estimatedDeduction).toBe(500_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⑧ validate — ⑫ Zod와 3중 패턴 (UI 통과 ↔ 서버 차단 모순 금지)
// ─────────────────────────────────────────────────────────────────────────────

describe("BG-VAL — 주식 부담부증여 ⑧ validate", () => {
  const baseItem = (bgt: Partial<BurdenedGiftStockTransferTaxInput>) => ({
    id: "s1",
    name: "삼성전자",
    category: "listed_stock",
    marketValue: 100_000_000,
    listedStockShares: 1000,
    assumedDebtForGift: 10_000_000,
    burdenedGiftStockTransferTax: {
      marketType: "kospi",
      acquisitionDate: "2015-03-02",
      acquisitionMode: "estimated",
      ...bgt,
    },
  });

  const formWith = (bgt: Partial<BurdenedGiftStockTransferTaxInput>) =>
    ({
      ...INITIAL_FORM,
      giftDate: "2025-06-02",
      stockItems: [baseItem(bgt)],
    }) as unknown as FormState;

  it("BG-VAL-1: 상장 환산 + 종가평균 미입력 → 차단 (분모)", () => {
    const err = validateStep(1, formWith({}));
    expect(err).toContain("양도일(증여일) 직전 1개월 종가평균");
  });

  it("BG-VAL-2: 분모만 입력해도 분자 미입력이면 차단", () => {
    const err = validateStep(1, formWith({ transferDatePriceAvg1Month: 100_000 }));
    expect(err).toContain("증여자 취득일 직전 1개월 종가평균");
  });

  it("BG-VAL-3: 둘 다 입력하면 통과한다 (과다 차단 금지)", () => {
    const err = validateStep(
      1,
      formWith({
        transferDatePriceAvg1Month: 100_000,
        acquisitionDatePriceAvg1Month: 50_000,
      }),
    );
    expect(err).toBeNull();
  });

  it("BG-VAL-4: 실지취득가 모드는 종가평균을 요구하지 않는다", () => {
    const err = validateStep(
      1,
      formWith({ acquisitionMode: "actual", actualAcquisitionPrice: 40_000_000 }),
    );
    expect(err).toBeNull();
  });

  it("BG-VAL-5: 비상장 환산은 §165④ 보충평가 경로라 종가평균을 요구하지 않는다", () => {
    const err = validateStep(1, formWith({ marketType: "unlisted" }));
    expect(err).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 엔진 방어 — ⑫를 우회해 직접 호출됐을 때도 0-반환이 침묵하지 않는다
// ─────────────────────────────────────────────────────────────────────────────

describe("BG-ENG — 상장 환산 0-가드가 경고를 남긴다", () => {
  /** ⑫가 막으므로 UI 경로로는 도달하지 않는다 — 엔진 직접 호출(외부 연동) 방어를 고정한다. */
  const engineInput = (over: Record<string, unknown>) =>
    buildEngineInput(
      coerceDates(
        {
          ...(buildGiftStockBurdenedTransferBody(
            listedItem({
              transferDatePriceAvg1Month: 100_000,
              acquisitionDatePriceAvg1Month: 50_000,
            }),
            { giftDate: "2025-06-02" } as unknown as FormState,
          ) as Record<string, unknown>),
          ...over,
        },
        DATE_FIELDS as unknown as string[],
      ),
    );

  it("BG-ENG-1: 분모 누락 → 취득가액 0 + 사유 경고 (형제 분기와 대칭)", () => {
    const r = calculateStockTransferTax(
      engineInput({ transferDatePriceAvg1Month: undefined }),
    );
    expect(r.acquisitionPrice).toBe(0);
    expect(r.warnings.join(" ")).toContain("양도일 직전 1개월 종가평균이 0 이하");
  });

  it("BG-ENG-2: 분자 누락 → 취득가액 0 + 사유 경고", () => {
    const r = calculateStockTransferTax(
      engineInput({ acquisitionDatePriceAvg1Month: undefined }),
    );
    expect(r.acquisitionPrice).toBe(0);
    expect(r.warnings.join(" ")).toContain("취득일 직전 1개월 종가평균이 0 이하");
  });

  it("BG-ENG-3: 정상 입력에는 그 경고가 붙지 않는다 (오탐 금지)", () => {
    const r = calculateStockTransferTax(engineInput({}));
    expect(r.acquisitionPrice).toBe(5_000_000);
    expect(r.warnings.join(" ")).not.toContain("종가평균이 0 이하");
  });
});
