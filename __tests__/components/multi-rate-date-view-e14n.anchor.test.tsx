/**
 * E-14n 결과뷰 관측 — 다건 결과(`MultiTransferTaxResultView`)가 자산마다 **그 양도일의 세율**로 낸 값을 그린다.
 *
 * 다건 route와 같은 인자(신고 단위 = 과세기간 말일 · 자산별 = 양도일)로 집계를 돌린다. 시료는 legacy 신축주택 감면
 * (`newHousingDetails`) 두 건 — 2001.3.2.(`new_housing_matrix` 행 시작 2001-05-23 전) · 2001.6.1.
 * 수정 전(E-14n)에는 둘 다 과세기간 말일 행으로 계산돼 감면 적격이 같았다.
 * 뷰 코드는 그대로다 — 엔진 breakdown이 뷰까지 닿는지만 본다(단건·일괄·겸용 뷰는 단건 route의 양도일 세율이라 무관).
 * V-6(2026-11-05): 종전 시료(legacy 장기임대 `rentalReductionDetails`)는 경로가 닫혀 날짜별로 갈리지 않으므로 바꿨다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { rateDateKey } from "@/lib/tax-engine/transfer-tax-item-rates";
import { MultiTransferTaxResultView } from "@/components/calc/results/MultiTransferTaxResultView";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { baseTransferInput } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);

const d = (s: string) => new Date(s);
const asset = (id: string, td: string) => ({
  ...baseTransferInput({
    transferPrice: 2_000_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: d("1999-01-15"),
    transferDate: d(td),
    isOneHousehold: true,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    newHousingDetails: {
      acquisitionDate: d("1999-01-15"),
      transferDate: d(td),
      region: "nationwide" as const,
      acquisitionPrice: 300_000_000,
      exclusiveAreaSquareMeters: 84,
      isFirstSale: true,
      hasUnsoldCertificate: false,
      totalCapitalGain: 0,
      calculatedTax: 0,
    },
  }),
  propertyId: id,
  propertyLabel: id,
});

describe("E-14n 다건 결과뷰 — 2001 신축주택 legacy 두 건(행 시작 전 · 후)", () => {
  it("V-1 자산별 감면이 각 양도일 세율로 갈린다 — 0 · 654,600,000 (수정 전 둘 다 과세기간 말일 행)", () => {
    const yearEnd = d("2001-12-31");
    const byDate = new Map([
      [rateDateKey(yearEnd), loadFallbackTransferRates(yearEnd)],
      ["2001-03-02", loadFallbackTransferRates(d("2001-03-02"))],
      ["2001-06-01", loadFallbackTransferRates(d("2001-06-01"))],
    ]);
    const agg = calculateTransferTaxAggregate(
      { taxYear: 2001, annualBasicDeductionUsed: 0, properties: [asset("A", "2001-03-02"), asset("B", "2001-06-01")] },
      loadFallbackTransferRates(yearEnd),
      byDate,
    );
    expect(agg.properties.map((p) => p.reductionAmount)).toEqual([0, 654_600_000]);

    const properties = [
      { propertyId: "A", propertyLabel: "A" },
      { propertyId: "B", propertyLabel: "B" },
    ] as unknown as PropertyItem[];
    const { container } = render(<MultiTransferTaxResultView result={agg} properties={properties} taxYear={2001} />);
    const text = container.textContent ?? "";
    expect(text).toContain("654,600,000");
  });
});
