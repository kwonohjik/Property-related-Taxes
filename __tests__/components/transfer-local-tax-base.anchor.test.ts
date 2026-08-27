/**
 * anchor: 지방소득세 과세표준 축 — 엔진 정본 ↔ 결과탭 표시 일치.
 *
 * 지방세법 §103의3 양도소득분 지방소득세의 과세표준은 **결정세액 + 「소득세법」 §114조의2
 * 환산가액적용가산세**다. 국세기본법 §47의2~§47의4 신고불성실·납부지연 가산세는 base에서
 * 제외된다. 엔진 3종이 모두 이 축이고, 각각 주석으로 명시돼 있다:
 *   · 단건   `transfer-tax-finalize.ts:428`      applyRate(determinedTax + penaltyTax, 0.1)
 *   · 집계   `transfer-tax-aggregate.ts:444`     applyRate(determinedTax + perAssetBuildingPenalty, 0.1)
 *   · 겸용   `transfer-tax-mixed-use-totals.ts:229` applyRate(determinedTax, 0.10)  (§114조의2 없음)
 *   · 차손   `transfer-tax-loss-return.ts:94`    같은 취지 경고 주석
 *
 * 🔴 그런데 **표시층이 그 값을 다시 계산**했고, 4벌 중 3벌이 국기법 가산세를 base에 넣었다.
 *   ① `DetailedStatementFormulaBuilders.ts:206` — (determinedTax + totalPenalty) × 10%
 *   ② `FilingFormTableAggregateHelpers.ts:341`  — (determinedTax + aggregated.penaltyTax) × 10%
 *   ③ `MultiTransferPropertyBreakdown.ts:40`    — (determinedTax + totalPenalty) × 10%
 *   ④ `FilingFormTableHelpers.ts:753`           — (determinedTax + result.penaltyTax) × 10%  ← 축은 옳으나
 *      어댑터 경유 result는 `penaltyTax` 슬롯 자체가 오염돼 있어 결과가 틀린다.
 *
 * 증상: 「지방소득세 산출세액」 > 「지방세 결정세액」인데 사이의 「지방세 감면세액」은 0.
 * 화면이 스스로 반증하는 등식을 출력한다.
 *
 * 이 anchor가 고정하는 것 — **지방세 감면세액은 전 경로에서 0 하드코딩이므로
 * 「산출세액 ≡ 결정세액 ≡ 엔진 localIncomeTax」가 항상 성립해야 한다.**
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { breakdownToFilingResult } from "@/components/calc/results/MultiTransferPropertyBreakdown";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import {
  localCalculatedTaxFormula,
  localTaxablePenaltyOf,
} from "@/components/calc/results/transfer/local-income-tax-display";
import type { AggregateMeta } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";

const ROW_CALC = "지방소득세 산출세액";
const ROW_REDUCTION = "지방세 감면세액";
const ROW_DETERMINED = "지방세 결정세액";

const rowTotal = (rows: { label: string; values: Record<string, number | string | null> }[], label: string) => {
  const r = rows.find((x) => x.label === label);
  expect(r, `행 「${label}」이 없다`).toBeDefined();
  return r!.values.total as number;
};

// ── 국기법 가산세(무신고 + 납부지연)를 만드는 단건 시나리오 ────────────────
function singleWithFilingPenalty() {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "land",
      transferPrice: 1_000_000_000,
      acquisitionPrice: 400_000_000,
      acquisitionDate: new Date("2015-03-01"),
      transferDate: new Date("2026-03-01"),
      householdHousingCount: 0,
      isOneHousehold: false,
      filingPenaltyDetails: {
        determinedTax: 0,
        reductionAmount: 0,
        priorPaidTax: 0,
        originalFiledTax: 0,
        excessRefundAmount: 0,
        interestSurcharge: 0,
        filingType: "none",
        penaltyReason: "normal",
      },
      delayedPaymentDetails: {
        unpaidTax: 100_000_000,
        paymentDeadline: new Date("2026-05-31"),
        actualPaymentDate: new Date("2026-12-31"),
      },
    }),
    makeMockRates(),
  );
}

function aggregateWithFilingPenalty() {
  return calculateTransferTaxAggregate(
    {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      properties: [
        {
          ...baseTransferInput({
            propertyType: "land",
            transferPrice: 1_000_000_000,
            acquisitionPrice: 400_000_000,
            acquisitionDate: new Date("2015-03-01"),
            transferDate: new Date("2026-03-01"),
            householdHousingCount: 0,
            isOneHousehold: false,
          }),
          propertyId: "primary",
          propertyLabel: "primary",
        } as never,
        {
          ...baseTransferInput({
            propertyType: "land",
            transferPrice: 300_000_000,
            acquisitionPrice: 150_000_000,
            acquisitionDate: new Date("2016-01-01"),
            transferDate: new Date("2026-03-01"),
            householdHousingCount: 0,
            isOneHousehold: false,
          }),
          propertyId: "land2",
          propertyLabel: "land2",
        } as never,
      ],
      // 신고서 단위 납부지연 가산세(F17) — base는 집계 결정세액. 국기법 §47의4.
      delayedPaymentDetails: {
        unpaidTax: 0, // 0 = 결정세액 전액 미납 (집계 엔진 규약)
        paymentDeadline: new Date("2026-05-31"),
        actualPaymentDate: new Date("2026-12-31"),
      },
    } as never,
    makeMockRates(),
  );
}

/**
 * **자산별** 국기법 가산세를 만드는 집계 — L-5 전용.
 * 위 `aggregateWithFilingPenalty`는 **신고서 단위** 가산세(F17)라 `properties[i]
 * .filingDelayedPenaltyTax`가 0이 되고, 그러면 건별 어댑터의 base 오류가
 * 관측되지 않는다(뮤테이션 구별력 0). 두 경로는 상호배타라 픽스처를 나눈다.
 */
function aggregateWithPerAssetPenalty() {
  return calculateTransferTaxAggregate(
    {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      properties: [
        {
          ...baseTransferInput({
            propertyType: "land",
            transferPrice: 1_000_000_000,
            acquisitionPrice: 400_000_000,
            acquisitionDate: new Date("2015-03-01"),
            transferDate: new Date("2026-03-01"),
            householdHousingCount: 0,
            isOneHousehold: false,
            delayedPaymentDetails: {
              unpaidTax: 100_000_000,
              paymentDeadline: new Date("2026-05-31"),
              actualPaymentDate: new Date("2026-12-31"),
            },
          }),
          propertyId: "primary",
          propertyLabel: "primary",
        } as never,
      ],
    },
    makeMockRates(),
  );
}

// ── L-0 엔진 축 계약 (지금도 통과해야 한다 — 이후 엔진 변경을 막는 잠금) ──────
describe("L-0 엔진 축 계약 — 국기법 가산세는 지방소득세 base에서 제외된다", () => {
  it("단건: localIncomeTax = (결정세액 + §114조의2분) × 10%, 국기법분 제외", () => {
    const r = singleWithFilingPenalty();
    expect(r.penaltyDetail?.totalPenalty ?? 0).toBeGreaterThan(0); // 국기법 가산세가 실재한다
    expect(r.localIncomeTax).toBe(Math.floor((r.determinedTax + r.penaltyTax) * 0.1));
    expect(r.localIncomeTax).not.toBe(
      Math.floor((r.determinedTax + r.penaltyTax + (r.penaltyDetail?.totalPenalty ?? 0)) * 0.1),
    );
  });

  it("집계: localIncomeTax는 penaltyTax(총액)가 아니라 §114조의2분만 base에 넣는다", () => {
    const a = aggregateWithFilingPenalty();
    expect(a.penaltyTax).toBeGreaterThan(0); // 총액에는 국기법분이 들어 있다
    expect(a.localIncomeTax).toBeLessThan(Math.floor((a.determinedTax + a.penaltyTax) * 0.1));
  });
});

// ── L-1 단건 상세명세서 ──────────────────────────────────────────────
describe("L-1 단건 상세명세서 — 산출세액 ≡ 결정세액", () => {
  it("localCalculatedTax가 엔진 localIncomeTax와 같다", () => {
    const r = singleWithFilingPenalty();
    const items = buildStatementItems(r, createDefaultTransferFormData(), undefined, undefined, undefined);
    expect(items.get("localCalculatedTax")?.value).toBe(r.localIncomeTax);
    expect(items.get("localDeterminedTax")?.value).toBe(r.localIncomeTax);
  });
});

// ── L-2 단건 신고서 (이미 옳다 — 회귀 방지) ──────────────────────────
describe("L-2 단건 신고서 양식 — 산출 − 감면 = 결정", () => {
  it("세 행이 산술적으로 맞는다", () => {
    const r = singleWithFilingPenalty();
    const rows = buildRows(r, "single", createDefaultTransferFormData()) as never as {
      label: string;
      values: Record<string, number | string | null>;
    }[];
    expect(rowTotal(rows, ROW_CALC) - (rowTotal(rows, ROW_REDUCTION) ?? 0)).toBe(
      rowTotal(rows, ROW_DETERMINED),
    );
    expect(rowTotal(rows, ROW_DETERMINED)).toBe(r.localIncomeTax);
  });
});

// ── L-3 집계 신고서 + 상세명세서 ────────────────────────────────────
describe("L-3 집계(일괄·다건) — 신고서·명세서 모두 엔진 축", () => {
  it("신고서 양식: 산출 − 감면 = 결정 = 엔진 localIncomeTax", () => {
    const a = aggregateWithFilingPenalty();
    const meta: AggregateMeta = { properties: a.properties, aggregated: a };
    const rows = buildAggregateRows(
      aggregateToFilingResult(a),
      meta,
      createDefaultTransferFormData(),
    ) as never as { label: string; values: Record<string, number | string | null> }[];
    expect(rowTotal(rows, ROW_DETERMINED)).toBe(a.localIncomeTax);
    expect(rowTotal(rows, ROW_CALC) - (rowTotal(rows, ROW_REDUCTION) ?? 0)).toBe(
      rowTotal(rows, ROW_DETERMINED),
    );
  });

  it("상세명세서: 같은 화면 신고서와 같은 값", () => {
    const a = aggregateWithFilingPenalty();
    const meta: AggregateMeta = { properties: a.properties, aggregated: a };
    const items = buildStatementItems(
      aggregateToFilingResult(a),
      createDefaultTransferFormData(),
      undefined,
      meta,
      undefined,
    );
    expect(items.get("localCalculatedTax")?.value).toBe(a.localIncomeTax);
    expect(items.get("localDeterminedTax")?.value).toBe(a.localIncomeTax);
  });
});

// ── L-4 어댑터 경유 result (겸용) ───────────────────────────────────
/**
 * 겸용 어댑터(`MixedUseResultCardAdapter.ts:80`)는 `penaltyTax` 슬롯에 **국기법분**을 싣는다
 * — 겸용 경로에는 §114조의2가 존재하지 않기 때문이다(`transfer-tax-mixed-use-totals.ts:384`
 * `penaltyTax: penalty?.totalPenalty ?? 0`). 그 형상을 그대로 재현한 픽스처로,
 * 신고서 빌더가 슬롯을 §114조의2로 오인해 base를 부풀리지 않는지 본다.
 */
function mixedUseShapedResult(): TransferTaxResult {
  const determinedTax = 141_060_000;
  return {
    isExempt: false,
    transferGain: 600_000_000,
    taxableGain: 600_000_000,
    usedEstimatedAcquisition: false,
    longTermHoldingDeduction: 0,
    longTermHoldingRate: 0,
    basicDeduction: 2_500_000,
    taxBase: 597_500_000,
    appliedRate: 0.42,
    progressiveDeduction: 35_940_000,
    calculatedTax: determinedTax,
    isSurchargeSuspended: false,
    reductionAmount: 0,
    determinedTax,
    // 겸용 어댑터가 넣는 값 = 국기법 신고불성실·납부지연 가산세
    penaltyTax: 30_896_000,
    penaltyBase: 0,
    // 겸용 엔진: applyRate(determinedTax, 0.10) — 가산세는 base에 없다
    localIncomeTax: Math.floor(determinedTax * 0.1),
    totalTax: determinedTax + 30_896_000 + Math.floor(determinedTax * 0.1),
    steps: [],
  } as unknown as TransferTaxResult;
}

describe("L-4 겸용 어댑터 형상 — 슬롯을 §114조의2로 오인하지 않는다", () => {
  it("신고서 양식: 산출 − 감면 = 결정 = 엔진 localIncomeTax", () => {
    const r = mixedUseShapedResult();
    const rows = buildRows(r, "single", createDefaultTransferFormData()) as never as {
      label: string;
      values: Record<string, number | string | null>;
    }[];
    expect(rowTotal(rows, ROW_DETERMINED)).toBe(r.localIncomeTax);
    expect(rowTotal(rows, ROW_CALC) - (rowTotal(rows, ROW_REDUCTION) ?? 0)).toBe(
      rowTotal(rows, ROW_DETERMINED),
    );
  });

  it("상세명세서도 같은 값", () => {
    const r = mixedUseShapedResult();
    const items = buildStatementItems(r, createDefaultTransferFormData(), undefined, undefined, undefined);
    expect(items.get("localCalculatedTax")?.value).toBe(r.localIncomeTax);
  });
});

// ── L-5 다건 「건별 상세」 어댑터 ────────────────────────────────────
/**
 * `breakdownToFilingResult`는 자산별 지방소득세를 **직접 계산**한다(엔진에 자산별
 * localIncomeTax가 없다). 그 base도 §114조의2분(`b.penaltyTax`)만이어야 한다 —
 * `filingDelayedPenaltyTax`(국기법분)를 넣으면 자산별 지방세가 합계 카드와 어긋난다.
 */
describe("L-5 다건 건별 어댑터 — 자산별 지방소득세 base", () => {
  it("국기법 가산세를 base에서 제외한다", () => {
    const a = aggregateWithPerAssetPenalty();
    const p0 = a.properties[0];
    // 가드: 자산별 국기법 가산세가 실재해야 이 anchor가 구별력을 갖는다.
    expect(p0.filingDelayedPenaltyTax).toBeGreaterThan(0);
    const r = breakdownToFilingResult(p0);
    expect(r.localIncomeTax).toBe(Math.floor((p0.refDeterminedTax + p0.penaltyTax) * 0.1));
    expect(r.localTaxPenalty).toBe(p0.penaltyTax);
  });

  it("자산별 신고서 양식: 산출 − 감면 = 결정", () => {
    const a = aggregateWithPerAssetPenalty();
    expect(a.properties[0].filingDelayedPenaltyTax).toBeGreaterThan(0);
    const r = breakdownToFilingResult(a.properties[0]);
    const rows = buildRows(r, "single", createDefaultTransferFormData()) as never as {
      label: string;
      values: Record<string, number | string | null>;
    }[];
    expect(rowTotal(rows, ROW_CALC) - (rowTotal(rows, ROW_REDUCTION) ?? 0)).toBe(
      rowTotal(rows, ROW_DETERMINED),
    );
    expect(rowTotal(rows, ROW_DETERMINED)).toBe(r.localIncomeTax);
  });
});

// ── L-6 산식 문구가 표시값을 실제로 만들어내는가 ──────────────────────
/**
 * 「산식은 적혀 있는데 그 산식으로 그 값이 안 나온다」는 이 결과탭의 반복 결함이다.
 * 산식 문자열이 base를 정확히 적고, 그 base × 10% 절사가 표시값과 같은지 고정한다.
 */
describe("L-6 산식 자기일관성", () => {
  const parseBase = (f: string) =>
    [...f.matchAll(/([\d,]{4,})/g)].map((m) => Number(m[1].replace(/,/g, ""))).reduce((a, b) => a + b, 0);

  it("§114조의2 가산세가 없으면 가산세 항을 적지 않는다", () => {
    const f = localCalculatedTaxFormula(165_060_000, 0);
    expect(f).toContain("결정세액 165,060,000");
    expect(f).not.toContain("§114조의2");
    expect(Math.floor(parseBase(f) * 0.1)).toBe(16_506_000);
  });

  it("§114조의2 가산세가 있으면 두 항을 모두 적고, 그 합 × 10%가 표시값이 된다", () => {
    const f = localCalculatedTaxFormula(100_000_000, 5_000_000);
    expect(f).toContain("결정세액 100,000,000");
    expect(f).toContain("§114조의2 가산세 5,000,000");
    expect(Math.floor(parseBase(f) * 0.1)).toBe(10_500_000);
  });

  it("실엔진 단건: 산식의 base × 10% = 표시값", () => {
    const r = singleWithFilingPenalty();
    const items = buildStatementItems(r, createDefaultTransferFormData(), undefined, undefined, undefined);
    const f = items.get("localCalculatedTax")!.formula as string;
    expect(Math.floor(parseBase(f) * 0.1)).toBe(items.get("localCalculatedTax")!.value);
  });

  it("localTaxablePenaltyOf: 어댑터 필드가 penaltyTax보다 우선한다", () => {
    expect(localTaxablePenaltyOf({ penaltyTax: 30_896_000, localTaxPenalty: 0 })).toBe(0);
    expect(localTaxablePenaltyOf({ penaltyTax: 5_000_000 })).toBe(5_000_000);
  });
});
