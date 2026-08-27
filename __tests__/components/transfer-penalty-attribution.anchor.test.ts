/**
 * anchor: 상세명세서 「가산세액」 행의 **귀속 표시** — 어느 가산세가 어느 조문인가.
 *
 * 가산세는 두 축이다.
 *   · 「소득세법」 §114조의2 환산가액적용가산세  = 환산취득가액(또는 감정가액) × 5%
 *   · 국세기본법 §47의2~§47의4 신고불성실·납부지연 가산세
 *
 * 🔴 종전에는 그 구분을 **`penaltyTax` 슬롯의 존재 여부**로 판정했다:
 *     if (result.penaltyTax > 0) → 「§114조의2 환산취득가액 가산세 X (= penaltyBase × 5%)」
 *   그런데 그 슬롯의 의미는 **생산자마다 다르다**(`transfer-result.types.ts` localTaxPenalty 주석):
 *     · 단건 엔진           → §114조의2분
 *     · 집계·건별 어댑터    → §114조의2 + 국기법 **총액**
 *     · 겸용 어댑터         → 국기법분 **그 자체**(겸용 경로엔 §114조의2가 없다)
 *   그래서 겸용·집계·건별에서 국기법 가산세가 「§114조의2 환산취득가액 가산세」로 이름이 바뀌고,
 *   `penaltyBase`는 어댑터가 0을 넣으므로 「= 0 × 5%」라는 성립 불가능한 산식이 함께 나왔다.
 *
 * 판정은 슬롯이 아니라 **축**으로 한다 — `localTaxablePenaltyOf`가 §114조의2분의 정본이고,
 * 나머지가 국기법분이다. 두 항의 합은 언제나 「가산세액」 표시값과 같아야 한다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { breakdownToFilingResult } from "@/components/calc/results/MultiTransferPropertyBreakdown";
import type { AggregateMeta } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";

const S114 = "§114조의2";
const STATUTORY = "신고불성실·납부지연 가산세";

const formulaOf = (r: TransferTaxResult, aggregate?: AggregateMeta) => {
  const items = buildStatementItems(
    r,
    createDefaultTransferFormData(),
    undefined,
    aggregate,
    undefined,
  );
  const item = items.get("penaltyTax");
  expect(item, "「가산세액」 항목이 없다").toBeDefined();
  return { text: item!.formula as string, value: item!.value };
};

/**
 * 산식 문자열 안의 **가산세 금액만** 더한다 — 두 항의 합이 표시값과 같은지 검산용.
 * 「(= 225,000,000 × 5%)」 같은 산정기준액 꼬리는 가산세가 아니므로 먼저 걷어낸다.
 */
const sumAmounts = (f: string) =>
  [...f.replace(/\(=[^)]*\)/g, "").matchAll(/([\d,]{4,})/g)]
    .map((m) => Number(m[1].replace(/,/g, "")))
    .reduce((a, b) => a + b, 0);

// ── 실엔진: §114조의2 + 국기법이 **동시에** 있는 단건 ──────────────────
/** 토지 실가(2015) + 건물 신축 환산(2021) 별개취득 — F25와 같은 형상. §114조의2 발동. */
const SEPARATE_NEW_BUILDING: Partial<TransferTaxInput> = {
  propertyType: "building",
  transferPrice: 1_000_000_000,
  transferDate: new Date("2024-06-01"),
  acquisitionDate: new Date("2021-03-10"),
  landAcquisitionDate: new Date("2015-05-01"),
  isSeparateAcquisition: true,
  landAcqMode: "actual",
  buildingAcqMode: "estimated",
  landAcquisitionPrice: 200_000_000,
  acquisitionPrice: 200_000_000,
  landTransferPrice: 700_000_000,
  buildingTransferPrice: 300_000_000,
  saleSplitMode: "actual",
  buildingStandardPriceAtAcquisition: 225_000_000,
  standardPricePerSqmAtAcquisition: 3_000_000,
  acquisitionArea: 100,
  landStandardPriceAtTransfer: 700_000_000,
  buildingStandardPriceAtTransfer: 300_000_000,
  isSelfBuilt: true,
  constructionDate: new Date("2021-03-10"),
  buildingType: "new",
  isOneHousehold: false,
  householdHousingCount: 0,
};

const DELAYED = {
  unpaidTax: 100_000_000,
  paymentDeadline: new Date("2024-08-31"),
  actualPaymentDate: new Date("2024-12-31"),
};

function singleBothPenalties() {
  return calculateTransferTax(
    baseTransferInput({
      ...SEPARATE_NEW_BUILDING,
      delayedPaymentDetails: DELAYED,
    } as Partial<TransferTaxInput>),
    makeMockRates(),
  );
}

describe("P-1 단건 — 두 가산세를 각자의 조문으로 나눠 적는다", () => {
  it("§114조의2와 국기법이 동시에 있으면 두 항이 모두 나오고 합이 표시값이다", () => {
    const r = singleBothPenalties();
    expect(r.penaltyTax, "§114조의2 가산세가 실재해야 이 anchor가 구별력을 갖는다").toBeGreaterThan(0);
    expect(r.penaltyDetail?.totalPenalty ?? 0, "국기법 가산세도 실재해야 한다").toBeGreaterThan(0);

    const { text, value } = formulaOf(r);
    expect(text).toContain(S114);
    expect(text).toContain(STATUTORY);
    expect(value).toBe(r.penaltyTax + (r.penaltyDetail?.totalPenalty ?? 0));
    expect(sumAmounts(text)).toBe(value); // 두 항의 합 = 표시값
  });

  it("§114조의2 산정기준액이 있으면 「= base × 5%」를 붙인다", () => {
    const r = singleBothPenalties();
    expect(r.penaltyBase).toBeGreaterThan(0);
    const { text } = formulaOf(r);
    expect(text).toContain(`= ${r.penaltyBase.toLocaleString()} × 5%`);
  });
});

// ── 겸용 어댑터 형상 — 슬롯에 국기법분이 들어 있다 ─────────────────────
/** `MixedUseResultCardAdapter`가 만드는 형상: penaltyTax = 국기법분, penaltyBase = 0, localTaxPenalty = 0. */
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
    penaltyTax: 30_896_000,
    penaltyBase: 0,
    localTaxPenalty: 0,
    localIncomeTax: Math.floor(determinedTax * 0.1),
    totalTax: determinedTax + 30_896_000 + Math.floor(determinedTax * 0.1),
    steps: [],
  } as unknown as TransferTaxResult;
}

describe("P-2 겸용 — 국기법 가산세를 §114조의2로 이름 바꾸지 않는다", () => {
  it("§114조의2 항이 없고, 「= 0 × 5%」도 없다", () => {
    const { text, value } = formulaOf(mixedUseShapedResult());
    expect(text).not.toContain(S114);
    expect(text).not.toContain("0 × 5%");
    expect(text).toContain(STATUTORY);
    expect(text).toContain("30,896,000");
    expect(sumAmounts(text)).toBe(value);
  });
});

// ── 집계(일괄·다건) 어댑터 — 슬롯이 총액이다 ───────────────────────────
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
      ],
      delayedPaymentDetails: {
        unpaidTax: 0,
        paymentDeadline: new Date("2026-05-31"),
        actualPaymentDate: new Date("2026-12-31"),
      },
    } as never,
    makeMockRates(),
  );
}

describe("P-3 집계 — 총액 슬롯을 §114조의2로 오인하지 않는다", () => {
  it("§114조의2가 없는 집계는 국기법 항만 적는다", () => {
    const a = aggregateWithFilingPenalty();
    expect(a.penaltyTax, "국기법 가산세가 실재해야 구별력이 있다").toBeGreaterThan(0);
    expect(a.buildingPenaltyTax ?? 0, "이 케이스엔 §114조의2가 없다").toBe(0);

    const meta: AggregateMeta = { properties: a.properties, aggregated: a };
    const { text, value } = formulaOf(aggregateToFilingResult(a), meta);
    expect(text).not.toContain(S114);
    expect(text).toContain(STATUTORY);
    expect(value).toBe(a.penaltyTax);
    expect(sumAmounts(text)).toBe(value);
  });
});

// ── 다건 건별 어댑터 ─────────────────────────────────────────────────
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
            delayedPaymentDetails: DELAYED,
          }),
          propertyId: "primary",
          propertyLabel: "primary",
        } as never,
      ],
    },
    makeMockRates(),
  );
}

describe("P-4 다건 건별 — 자산별 신고서도 축으로 가른다", () => {
  it("§114조의2가 없는 자산은 국기법 항만 적는다", () => {
    const a = aggregateWithPerAssetPenalty();
    const p0 = a.properties[0];
    expect(p0.filingDelayedPenaltyTax).toBeGreaterThan(0);
    expect(p0.penaltyTax).toBe(0);

    const { text, value } = formulaOf(breakdownToFilingResult(p0));
    expect(text).not.toContain(S114);
    expect(text).toContain(STATUTORY);
    expect(sumAmounts(text)).toBe(value);
  });
});

// ── 항등식: 두 항의 합 ≡ 「가산세액」 값 ≡ 총결정세액 − 결정세액 ──────────
describe("P-5 항등식 — 귀속을 나눠도 합계는 불변", () => {
  it("§114조의2분 + 국기법분 = 가산세액 = 총결정세액 − 결정세액", () => {
    for (const r of [singleBothPenalties(), mixedUseShapedResult()]) {
      const items = buildStatementItems(
        r,
        createDefaultTransferFormData(),
        undefined,
        undefined,
        undefined,
      );
      const penalty = items.get("penaltyTax")!.value as number;
      const total = items.get("totalDeterminedTax")!.value as number;
      expect(total - r.determinedTax).toBe(penalty);
      expect(sumAmounts(items.get("penaltyTax")!.formula as string)).toBe(penalty);
    }
  });
});

// ── P-6 §114조의2가 **실재하는** 집계 — 산정기준액 없이도 이름은 지킨다 ──
/**
 * 어댑터는 `penaltyBase`에 0을 넣는다(자산별 산정기준액이 합쳐지지 않는다).
 * 그 상태에서 §114조의2 가산세 자체는 실재할 수 있다 — 일괄양도 건물이 환산취득인 경우다.
 * 이때 「(= 0 × 5%)」를 적으면 또 성립 불가능한 산식이 된다: 이름은 남기고 꼬리만 생략해야 한다.
 */
function aggregateWith114_2() {
  return calculateTransferTaxAggregate(
    {
      taxYear: 2024,
      annualBasicDeductionUsed: 0,
      properties: [
        {
          ...baseTransferInput({
            ...SEPARATE_NEW_BUILDING,
            delayedPaymentDetails: DELAYED,
          } as Partial<TransferTaxInput>),
          propertyId: "primary",
          propertyLabel: "primary",
        } as never,
      ],
    },
    makeMockRates(),
  );
}

describe("P-6 집계 + 실제 §114조의2 — 이름은 남기고 「= 0 × 5%」만 없앤다", () => {
  it("§114조의2 항이 나오되 산정기준액 꼬리는 붙지 않는다", () => {
    const a = aggregateWith114_2();
    expect(a.buildingPenaltyTax ?? 0, "§114조의2가 실재해야 구별력이 있다").toBeGreaterThan(0);

    const r = aggregateToFilingResult(a);
    expect(r.penaltyBase, "어댑터는 산정기준액을 합치지 않는다").toBe(0);

    const meta: AggregateMeta = { properties: a.properties, aggregated: a };
    const { text, value } = formulaOf(r, meta);
    expect(text).toContain(S114);
    expect(text).not.toContain("× 5%"); // 기준액이 없으면 꼬리를 적지 않는다
    expect(text).toContain(STATUTORY);
    expect(sumAmounts(text)).toBe(value);
    expect(value).toBe(a.penaltyTax);
  });
});
