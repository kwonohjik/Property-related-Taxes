/**
 * anchor: 다건에서 **자산별 신고서와 합산 신고서가 같은 자산을 같게 표시한다**
 * (결과탭 코드리뷰 Lane 3 · V3 — #019).
 *
 * ## 축
 *
 * 12억 초과 고가주택은 양도차익이 12억 안분으로 갈린다. 엔진 breakdown은 그 결과를
 * `income`(양도소득금액)으로만 남기므로 표시부가 역산해야 한다:
 *   과세대상 = min(gross, max(0, income) + 장특공제)
 *
 * 🔴 합산 서식은 정확히 역산했지만, 「건별 상세」의 자산별 신고서 어댑터는
 *   `Math.max(0, b.transferGain)` — **안분 전** 값을 그대로 썼다. 같은 화면의 두 표가
 *   같은 자산에 다른 과세대상·양도소득금액을 표시했다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { breakdownToFilingResult } from "@/components/calc/results/MultiTransferPropertyBreakdown";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const D = (s: string) => new Date(s);
const rates = makeMockRates();

/** 1세대1주택 **20억** — 12억 초과분만 과세된다(안분). */
function expensiveHouse(): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    acquisitionDate: D("2012-01-01"),
    transferDate: D("2026-03-01"),
    transferPrice: 2_000_000_000,
    acquisitionPrice: 600_000_000,
    expenses: 0,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 120,
    annualBasicDeductionUsed: 0,
    isNonBusinessLand: false,
  } as Partial<TransferTaxInput>);
}

function agg() {
  return calculateTransferTaxAggregate(
    {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      properties: [
        { ...expensiveHouse(), propertyId: "p1", propertyLabel: "고가주택" } as never,
        {
          ...baseTransferInput({
            propertyType: "land",
            acquisitionDate: D("2015-06-01"),
            transferDate: D("2026-03-01"),
            transferPrice: 500_000_000,
            acquisitionPrice: 200_000_000,
            expenses: 0,
            isOneHousehold: false,
            householdHousingCount: 0,
            annualBasicDeductionUsed: 0,
            isNonBusinessLand: false,
          } as Partial<TransferTaxInput>),
          propertyId: "p2",
          propertyLabel: "토지",
        } as never,
      ],
    },
    rates,
  );
}

// ── AT-0 격자 구별력 ─────────────────────────────────────────────────
describe("AT-0 격자 — 12억 안분이 실제로 일어난다", () => {
  it("고가주택의 과세대상이 전체 양도차익보다 작다", () => {
    const a = agg();
    const house = a.properties.find((p) => p.propertyId === "p1")!;
    expect(house.isExempt, "전액 비과세면 안분 축이 성립하지 않는다").toBeFalsy();
    expect(house.transferGain).toBeGreaterThan(0);
    const taxable = Math.min(
      house.transferGain,
      Math.max(0, house.income) + house.longTermHoldingDeduction,
    );
    expect(
      taxable,
      "과세대상 == 전체 차익이면 안분이 없어 이 anchor는 아무것도 구별하지 못한다",
    ).toBeLessThan(house.transferGain);
  });
});

// ── AT-1 두 표가 같은 값을 말한다 (#019) ──────────────────────────────
describe("AT-1 자산별 신고서 ↔ 합산 신고서", () => {
  it("🔴 과세대상 양도차익이 자산별 열과 자산별 신고서에서 같다", () => {
    const a = agg();
    const rows = buildAggregateRows(
      aggregateToFilingResult(a),
      { properties: a.properties, aggregated: a } as never,
      createDefaultTransferFormData(),
    ) as never as {
      label: string;
      values: Record<string, number | string | null>;
    }[];
    const cell = (label: string, col: string) => {
      const row = rows.find((x) => x.label === label);
      expect(row, `행 「${label}」이 없다`).toBeDefined();
      return (row!.values[col] as number) ?? 0;
    };

    for (const p of a.properties) {
      const perAsset = breakdownToFilingResult(p);
      expect(
        perAsset.taxableGain,
        `${p.propertyLabel}: 자산별 신고서의 과세대상이 합산 서식 열과 다르다`,
      ).toBe(cell("과세대상 양도차익", p.propertyId));
    }
  });

  it("🔴 고가주택의 과세대상이 안분 전 값이 아니다", () => {
    const a = agg();
    const house = a.properties.find((p) => p.propertyId === "p1")!;
    const perAsset = breakdownToFilingResult(house);
    expect(perAsset.taxableGain).toBeLessThan(house.transferGain);
    expect(perAsset.taxableGain).toBe(
      Math.min(house.transferGain, Math.max(0, house.income) + house.longTermHoldingDeduction),
    );
  });
});
