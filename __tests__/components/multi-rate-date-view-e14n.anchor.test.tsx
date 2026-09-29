/**
 * E-14n 결과뷰 관측 — 다건 결과(`MultiTransferTaxResultView`)가 자산마다 **그 양도일의 세율**로 낸 값을 그린다.
 *
 * 다건 route와 같은 인자(신고 단위 = 과세기간 말일 · 자산별 = 양도일)로 집계를 돌린다. 시료는 legacy 장기임대
 * (`rentalReductionDetails` · 장기일반) 두 건 — 2020.3.2.(`long_term_rental_v2` 행 시작 2020-08-18 전) · 2020.9.1.
 * 수정 전에는 둘 다 과세기간 말일 행으로 계산돼 장특이 850,000,000(특례율 50%)으로 같았다.
 * 뷰 코드는 그대로다 — 엔진 breakdown이 뷰까지 닿는지만 본다(단건·일괄·겸용 뷰는 단건 route의 양도일 세율이라 무관).
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
    acquisitionDate: d("2009-06-01"),
    transferDate: d(td),
    isOneHousehold: true,
    householdHousingCount: 3,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    rentalReductionDetails: {
      isRegisteredLandlord: true,
      isTaxRegistered: true,
      registrationDate: d("2010-01-01"),
      rentalHousingType: "long_term_private" as const,
      propertyType: "apartment" as const,
      region: "capital" as const,
      officialPriceAtStart: 200_000_000,
      rentalStartDate: d("2010-01-01"),
      transferDate: d(td),
      vacancyPeriods: [],
      rentHistory: [],
      calculatedTax: 0,
    },
  }),
  propertyId: id,
  propertyLabel: id,
});

describe("E-14n 다건 결과뷰 — 2020 장기임대 legacy 두 건(행 시작 전 · 후)", () => {
  it("V-1 자산별 장특이 각 양도일 세율로 갈린다 — 340,000,000 · 850,000,000 (수정 전 둘 다 850,000,000)", () => {
    const yearEnd = d("2020-12-31");
    const byDate = new Map([
      [rateDateKey(yearEnd), loadFallbackTransferRates(yearEnd)],
      ["2020-03-02", loadFallbackTransferRates(d("2020-03-02"))],
      ["2020-09-01", loadFallbackTransferRates(d("2020-09-01"))],
    ]);
    const agg = calculateTransferTaxAggregate(
      { taxYear: 2020, annualBasicDeductionUsed: 0, properties: [asset("A", "2020-03-02"), asset("B", "2020-09-01")] },
      loadFallbackTransferRates(yearEnd),
      byDate,
    );
    expect(agg.properties.map((p) => p.longTermHoldingDeduction)).toEqual([340_000_000, 850_000_000]);

    const properties = [
      { propertyId: "A", propertyLabel: "A" },
      { propertyId: "B", propertyLabel: "B" },
    ] as unknown as PropertyItem[];
    const { container } = render(<MultiTransferTaxResultView result={agg} properties={properties} taxYear={2020} />);
    const text = container.textContent ?? "";
    expect(text).toContain("340,000,000");
    expect(text).toContain("850,000,000");
  });
});
