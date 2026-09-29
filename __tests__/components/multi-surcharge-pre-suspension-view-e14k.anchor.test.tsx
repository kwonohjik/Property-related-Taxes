/**
 * E-14k 결과뷰 관측 — 다건 결과(`MultiTransferTaxResultView`)가 2022.5.10. 전 양도분의 다주택 중과를 그린다.
 *
 * 다건 route와 같은 세율(과세기간 말일 2022-12-31 fallback — 2022-05-10 유예 행)로 집계를 돌린다.
 * 수정 전에는 자산이 `progressive` 그룹 · 세율 45% · 장특 238,000,000으로 그려졌다(중과 표시 없음).
 * 엔진 결과만 바뀌므로 뷰 코드는 그대로다 — 이 anchor는 그 배선이 끝까지 닿는지만 본다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { MultiTransferTaxResultView } from "@/components/calc/results/MultiTransferTaxResultView";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { baseTransferInput } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);

function aggregate() {
  return calculateTransferTaxAggregate(
    {
      taxYear: 2022,
      annualBasicDeductionUsed: 0,
      properties: [
        {
          ...baseTransferInput({
            transferPrice: 2_000_000_000,
            acquisitionPrice: 300_000_000,
            acquisitionDate: new Date("2015-01-01"),
            transferDate: new Date("2022-03-15"),
            householdHousingCount: 3,
            residencePeriodMonths: 0,
            isRegulatedArea: true,
          }),
          propertyId: "A",
          propertyLabel: "A",
        },
      ],
    },
    // 다건 route `rateDate`와 같은 날짜
    loadFallbackTransferRates(new Date("2022-12-31")),
  );
}

describe("E-14k 다건 결과뷰 — 2022.3.15. 양도 3주택", () => {
  it("V-1 집계 자산이 다주택 중과 그룹 · 세율 75%(중과 30%p) · 장특 0 (수정 전 progressive · 45% · 238,000,000)", () => {
    const agg = aggregate();
    const p = agg.properties[0];
    expect(p).toMatchObject({ rateGroup: "multi_house_surcharge", appliedRate: 0.75, surchargeRate: 0.3, longTermHoldingDeduction: 0 });
    expect(agg.totalTax).toBe(1_328_497_500);

    const properties = [{ propertyId: "A", propertyLabel: "A" }] as unknown as PropertyItem[];
    const { container } = render(<MultiTransferTaxResultView result={agg} properties={properties} taxYear={2022} />);
    const text = container.textContent ?? "";
    expect(text).toContain("다주택 중과");
    expect(text).toContain("중과 30%p 포함");
  });
});
