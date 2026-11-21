/**
 * 다건·일괄 산출세액 닫힌 산식 검산 — 결과뷰 리뷰 2026-11-21 R-c05-02.
 *
 * 엔진은 「세율 × 금액」을 `applyRate`(백만분율 정수 연산 · `tax-utils.ts`)로 계산한다. 검산이
 * `Math.floor(과세표준 × 세율)`(double 곱)이면 경계 바로 아래로 떨어지는 값에서 1원 어긋나
 * 「산식이 값을 재현하지 못한다」로 오판한다:
 *   95,000,000 × 0.35 = 33,249,999.999999996 → floor 33,249,999 (applyRate는 33,250,000)
 *
 * 실측(이 수정 전, mock 세율표 · 일반 누진 토지 2건 과세표준 50,000,000 + 45,000,000):
 *   · 엔진 `metaReproducesTax`가 실패 → 군 메타 appliedRate 0.15(파트 standalone 최고세율) · 누진공제 0
 *   · 상세명세서 산출세액 근거 「적용 호가 둘 이상이라 단일 산식으로 표시할 수 없습니다(최고세율 15%)」
 *   실제는 호 하나 · 95,000,000 × 35% − 15,440,000 = 17,810,000.
 * 세액은 바뀌지 않는다 — 표시 메타·검산만 고친다.
 */
import { describe, expect, it } from "vitest";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer-result.types";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { groupRateText } from "@/components/calc/results/transfer/comparative-tax-display";
import type { AggregateMeta } from "@/components/calc/results/transfer/FilingFormTableHelpers";

/** 보유 2.4년 토지(일반 누진 · 장특공제 없음) — 양도차익 = gain */
const land = (id: string, gain: number): TransferTaxItemInput =>
  ({
    ...baseTransferInput({
      isOneHousehold: false, householdHousingCount: 0, propertyType: "land",
      acquisitionDate: new Date("2022-01-01"), transferDate: new Date("2024-06-01"),
      transferPrice: 300_000_000 + gain, acquisitionPrice: 300_000_000,
    }),
    propertyId: id, propertyLabel: id,
  }) as TransferTaxItemInput;

/** 과세표준 50,000,000 + 45,000,000 = 95,000,000 (기본공제 2,500,000은 첫 자산에서) */
const run = () =>
  calculateTransferTaxAggregate(
    { taxYear: 2024, properties: [land("A", 50_000_000), land("B", 47_500_000)], annualBasicDeductionUsed: 0 },
    makeMockRates(),
  );

describe("R-c05-02 전제 — double 곱 검산은 이 값에서 1원 어긋난다", () => {
  it("Math.floor(95,000,000 × 0.35) = 33,249,999", () => {
    expect(Math.floor(95_000_000 * 0.35)).toBe(33_249_999);
  });

  it("격자: 세율군 하나(일반 누진) · 과세표준 95,000,000 · 산출세액 17,810,000 = 95,000,000 × 35% − 15,440,000", () => {
    const r = run();
    expect(r.groupTaxes).toHaveLength(1);
    expect([r.groupTaxes[0].group, r.groupTaxes[0].groupTaxBase, r.groupTaxes[0].groupCalculatedTax]).toEqual([
      "progressive", 95_000_000, 17_810_000,
    ]);
    expect(r.calculatedTax).toBe(17_810_000);
  });
});

describe("R-c05-02 엔진 — 군 메타는 합산에 실제 적용된 세율·누진공제다", () => {
  it("🔑 appliedRate 0.35 · progressiveDeduction 15,440,000 (파트 standalone 15% · 0이 아니다)", () => {
    const g = run().groupTaxes[0];
    expect(g.appliedRate).toBe(0.35);
    expect(g.progressiveDeduction).toBe(15_440_000);
  });

  it("🔒 세액은 그대로다", () => {
    const r = run();
    expect([r.calculatedTax, r.determinedTax]).toEqual([17_810_000, 17_810_000]);
  });
});

describe("R-c05-02 표시 — 상세명세서 산출세액 근거", () => {
  it("🔑 결선(엔진 → 어댑터 → 명세서): 닫힌 산식을 적고 「적용 호가 둘 이상」·「최고세율 15%」를 적지 않는다", () => {
    const r = run();
    const items = buildStatementItems(
      aggregateToFilingResult(r),
      undefined,
      undefined,
      { properties: r.properties, aggregated: r } as unknown as AggregateMeta,
      undefined,
    );
    const f = String(items.get("calculatedTax")?.formula ?? "");
    expect(f).toContain("과세표준 × 세율(35%) − 누진공제 15,440,000");
    expect(f).not.toContain("적용 호가 둘 이상");
    expect(f).not.toContain("15%)");
  });

  it("🔑 명세서 검산 단독 — 엔진 메타가 맞아도 double 곱 검산이면 닫힌 산식을 버린다", () => {
    const result = {
      isExempt: false, transferGain: 97_500_000, taxableGain: 97_500_000, longTermHoldingDeduction: 0, longTermHoldingRate: 0,
      basicDeduction: 2_500_000, taxBase: 95_000_000, appliedRate: 0.35, progressiveDeduction: 15_440_000,
      calculatedTax: 17_810_000, reductionAmount: 0, determinedTax: 17_810_000, penaltyTax: 0,
      localIncomeTax: 1_781_000, ruralSurtax: 0, totalTax: 19_591_000, steps: [],
    } as unknown as TransferTaxResult;
    const meta = {
      properties: [{ propertyId: "A", label: "A" }, { propertyId: "B", label: "B" }],
      aggregated: { ruralSurtax: 0, localIncomeTax: 1_781_000, properties: [], comparedTaxApplied: "none" },
    } as unknown as AggregateMeta;
    const f = String(buildStatementItems(result, undefined, undefined, meta, undefined).get("calculatedTax")?.formula ?? "");
    expect(f).toContain("과세표준 × 세율(35%) − 누진공제 15,440,000");
    expect(f).not.toContain("단일 산식으로 표시할 수 없습니다");
  });

  it("🔑 세율군 카드 문구(groupRateText) — 「(호별 합계)」가 아니라 「(35.0%)」", () => {
    expect(
      groupRateText({ groupTaxBase: 95_000_000, groupCalculatedTax: 17_810_000, appliedRate: 0.35, surchargeRate: undefined, progressiveDeduction: 15_440_000 }),
    ).toBe("(35.0%)");
  });

  it("대조군 — 값을 재현하지 못하는 메타는 종전대로 「(호별 합계)」", () => {
    expect(
      groupRateText({ groupTaxBase: 700_000_000, groupCalculatedTax: 398_120_000, appliedRate: 0.68, surchargeRate: 0.3, progressiveDeduction: 0 }),
    ).toBe("(호별 합계)");
  });
});
