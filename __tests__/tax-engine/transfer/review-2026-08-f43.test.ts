/**
 * F43 — 합산 신고서 양식의 농어촌특별세 행이 `0` 리터럴이라 실제 부과되는 농특세가 사라졌다.
 *
 * 엔진은 소득금액차감 감면(조특법 §99의3 등) 적용 시 농특세를 2-pass로 산정해
 * `AggregateTransferResult.ruralSurtax`로 노출하고 `totalTax`에도 합산한다
 * (`transfer-tax-aggregate.ts` — 농어촌특별세법 §3·§5). 그런데
 * `FilingFormTableAggregateHelpers.buildAggregateRows`가 `setNum("ruralSurtax","total", 0)`으로
 * 하드코딩해, 서식 행의 합이 같은 화면의 총 납부세액과 농특세 전액만큼 어긋났다.
 *
 * 같은 화면의 **상세명세서**도 같은 값을 잃고 있었다 — 집계 어댑터(`aggregateToFilingResult`)가
 * 단건 detail(`new993Detail` 등)을 담지 않아 `incomeDeductionRuralSurtax(result)`가 0을 낸다.
 * 서식만 고치면 「서식 ≠ 명세서」 새 불일치가 생기므로 두 지점을 함께 고정한다.
 *
 * 기대값은 전부 엔진(`calculateTransferTaxAggregate`)을 실제로 호출해 관측한 값이다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import type { AggregateMeta } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const R993 = {
  type: "new_99_3" as const,
  contractDate993: "2002-01-01",
  standardPriceAtAcquisition993: 100_000_000,
  standardPriceAt5Years: 160_000_000,
  standardPriceAtTransfer993: 250_000_000,
  region993: "outside_speculation" as const,
  acquisitionType993: "from_builder" as const,
};

/** 주택(§99의3 소득금액차감 감면) + 토지 — 일괄·다건 공용 집계 경로 */
function aggregate() {
  return calculateTransferTaxAggregate(
    {
      taxYear: 2022,
      annualBasicDeductionUsed: 0,
      properties: [
        {
          ...baseTransferInput({
            transferPrice: 800_000_000,
            acquisitionPrice: 500_000_000,
            acquisitionDate: new Date("2015-07-01"),
            transferDate: new Date("2022-08-01"),
            householdHousingCount: 2,
            reductions: [R993],
          }),
          propertyId: "primary",
          propertyLabel: "primary",
        } as never,
        {
          ...baseTransferInput({
            propertyType: "land",
            householdHousingCount: 2,
            transferPrice: 200_000_000,
            acquisitionPrice: 120_000_000,
            acquisitionDate: new Date("2016-01-01"),
            transferDate: new Date("2022-08-01"),
          }),
          propertyId: "land2",
          propertyLabel: "land2",
        } as never,
      ],
    },
    makeMockRates(),
  );
}

const RURAL_SURTAX_ROW = "농어촌특별세 (§99의3 등)";

describe("F43 — 합산 신고서 양식·상세명세서의 농어촌특별세", () => {
  it("엔진 관측값 고정 (집계 농특세 7,946,800)", () => {
    const agg = aggregate();
    expect(agg.ruralSurtax).toBe(7_946_800);
    expect(agg.determinedTax).toBe(64_686_000);
    expect(agg.penaltyTax).toBe(0);
    expect(agg.localIncomeTax).toBe(6_468_600);
    // 농특세는 totalTax에 이미 합산돼 있다 — 서식이 0이면 화면 합계와 어긋난다.
    expect(agg.totalTax).toBe(79_101_400);
    expect(agg.totalTax).toBe(
      agg.determinedTax + agg.penaltyTax + agg.localIncomeTax + agg.ruralSurtax,
    );
  });

  it("합산 신고서 표의 농특세 행이 엔진 값을 싣는다 (종전 0)", () => {
    const agg = aggregate();
    const meta: AggregateMeta = { properties: agg.properties, aggregated: agg };
    const rows = buildAggregateRows(
      aggregateToFilingResult(agg),
      meta,
      createDefaultTransferFormData(),
    );
    const row = rows.find((r) => r.label === RURAL_SURTAX_ROW);
    expect(row, `행 「${RURAL_SURTAX_ROW}」이 없다`).toBeDefined();
    expect(row!.values.total).toBe(7_946_800);
    expect(row!.values.total).toBe(agg.ruralSurtax);
    // 농특세는 자산별로 나뉘지 않는다 — 자산 열은 합산-only(null) 유지.
    expect(row!.values.primary).toBeNull();
    expect(row!.values.land2).toBeNull();
  });

  it("서식 행 합 = 엔진 totalTax (누락 0 검산)", () => {
    const agg = aggregate();
    const meta: AggregateMeta = { properties: agg.properties, aggregated: agg };
    const rows = buildAggregateRows(
      aggregateToFilingResult(agg),
      meta,
      createDefaultTransferFormData(),
    );
    const total = (label: string) => rows.find((r) => r.label === label)!.values.total as number;
    expect(total("총결정세액") + total("지방세 결정세액") + total(RURAL_SURTAX_ROW)).toBe(
      agg.totalTax,
    );
  });

  it("같은 화면 상세명세서의 농특세도 같은 값이다 (서식↔명세서 일치)", () => {
    const agg = aggregate();
    const meta: AggregateMeta = { properties: agg.properties, aggregated: agg };
    const items = buildStatementItems(
      aggregateToFilingResult(agg),
      createDefaultTransferFormData(),
      undefined,
      meta,
      undefined,
    );
    expect(items.get("ruralSurtax")?.value).toBe(7_946_800);
    expect(items.get("ruralSurtax")?.value).toBe(agg.ruralSurtax);
  });

  it("소득금액차감 감면이 없는 집계는 종전과 동일하게 0 (회귀 0)", () => {
    const agg = calculateTransferTaxAggregate(
      {
        taxYear: 2022,
        annualBasicDeductionUsed: 0,
        properties: [
          {
            ...baseTransferInput({
              householdHousingCount: 2,
              transferPrice: 600_000_000,
              acquisitionPrice: 400_000_000,
              acquisitionDate: new Date("2016-01-01"),
              transferDate: new Date("2022-06-01"),
            }),
            propertyId: "pa",
            propertyLabel: "pa",
          } as never,
        ],
      },
      makeMockRates(),
    );
    expect(agg.ruralSurtax).toBe(0);
    const meta: AggregateMeta = { properties: agg.properties, aggregated: agg };
    const rows = buildAggregateRows(
      aggregateToFilingResult(agg),
      meta,
      createDefaultTransferFormData(),
    );
    expect(rows.find((r) => r.label === RURAL_SURTAX_ROW)!.values.total).toBe(0);
  });
});
