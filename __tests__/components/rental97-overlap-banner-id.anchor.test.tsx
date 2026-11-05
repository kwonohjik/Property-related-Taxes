/**
 * anchor — §97 세액감면 카드의 §127⑦ 배제 배너는 **이 카드의 조문 id**로 판정한다.
 *
 * 결함: `ReductionDetailCards`가 `rental97TaxDetail` 배너를 `excludedByOverlap("long_term_rental")`로 걸었다.
 * `calcReductions`의 §97 후보 type은 `rental97TaxDetail.id`(`rental_97_main`·`rental_97_proviso`·`rental_97_2`·`rental_97_5`)라
 * 승자 id(`reductionTypeApplied`)가 `"long_term_rental"`과 같을 수 없다 — §97이 **실제로 적용돼도** 「적용되지 않았습니다」 배너가 붙었다.
 *
 * 시료는 엔진 실측(T-45 — `edge-and-overlap.test.ts`)을 그대로 돌려 결과를 카드에 넣는다(id 배선까지 고정).
 *   B-1 §97 단서 100% vs 신축 50% → §97 승자 → 배너 없음
 *   B-2 §97 본문 50% vs 신축 80% → 신축 승자 → §97 카드에 배너
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ReductionDetailCards } from "@/components/calc/results/transfer/ReductionDetailCards";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import type { TaxRateKey } from "@/lib/tax-engine/types";
import { makeMockRates, baseTransferInput as baseInput } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);

const newHousingMatrix = (reductionRate: number) => ({
  "transfer:deduction:new_housing_matrix": {
    taxType: "transfer",
    category: "deduction",
    subCategory: "new_housing_matrix",
    rateTable: null,
    deductionRules: {
      type: "new_housing_matrix",
      articles: [
        {
          code: "99-2",
          article: "§99 ②",
          acquisitionPeriod: { start: "2009-02-12", end: "2010-02-11" },
          region: "nationwide",
          maxAcquisitionPrice: 600_000_000,
          maxArea: 85,
          requiresFirstSale: false,
          requiresUnsoldCertificate: false,
          reductionScope: "tax_amount",
          reductionRate,
          fiveYearWindowRule: false,
          isExcludedFromHouseCount: false,
          isExcludedFromMultiHouseSurcharge: false,
        },
      ],
    },
    specialRules: null,
    effectiveDate: "2009-02-12",
    isActive: true,
  },
});

function run(type: "rental_97_main" | "rental_97_proviso", newRate: number) {
  const rates = makeMockRates(newHousingMatrix(newRate) as Partial<Record<TaxRateKey, object>>);
  return calculateTransferTax(
    baseInput({
      transferPrice: 600_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2009-06-01"),
      transferDate: new Date("2024-06-01"),
      isOneHousehold: false,
      householdHousingCount: 3,
      reductions: [
        {
          type,
          ...(type === "rental_97_proviso" ? { provisoCase: "c_10years" } : {}),
          constructionYear: 1990,
          isNationalHousing: true,
          rentalStartDate: new Date("1998-04-01"),
          isTaxRegistered: true,
          hasMin5RentalUnits: true,
        },
      ],
      newHousingDetails: {
        acquisitionDate: new Date("2009-06-01"),
        transferDate: new Date("2024-06-01"),
        region: "non_metropolitan",
        acquisitionPrice: 400_000_000,
        exclusiveAreaSquareMeters: 84,
        isFirstSale: false,
        hasUnsoldCertificate: false,
        totalCapitalGain: 0,
        calculatedTax: 0,
      },
    } as Partial<TransferTaxInput>),
    rates,
  );
}

/** §97 카드(「장기임대주택 세액감면」) 바로 앞에 배너가 붙었는가 — 신축 카드의 배너와 구별한다 */
function bannerBeforeRental97Card(result: ReturnType<typeof run>): boolean {
  const { container } = render(
    <ReductionDetailCards
      result={result}
      calculatedTax={result.calculatedTax}
      taxBase={result.taxBase}
      longTermHoldingDeduction={result.longTermHoldingDeduction}
      appliedReductionType={result.reductionTypeApplied}
    />,
  );
  // 배너는 자기 카드 바로 앞 형제로 렌더된다(`ReductionDetailCards`) — 그 형제가 §97 카드인 배너만 센다.
  const banners = [...container.querySelectorAll("div")].filter((d) => d.textContent?.startsWith("⚠ 조세특례제한법 §127⑦ 중복배제"));
  expect(container.textContent, "§97 카드가 렌더되지 않았다").toContain("장기임대주택 세액감면");
  return banners.some((b) => b.nextElementSibling?.textContent?.includes("장기임대주택 세액감면"));
}

describe("§97 세액감면 카드 §127⑦ 배너 — 승자 id = rental97TaxDetail.id", () => {
  it("🔑 B-1 §97 단서가 승자 → §97 카드에 배제 배너가 없다", () => {
    const r = run("rental_97_proviso", 0.5);
    expect(r.reductionTypeApplied).toBe("rental_97_proviso");
    expect(r.rental97TaxDetail?.id).toBe("rental_97_proviso");
    expect(bannerBeforeRental97Card(r)).toBe(false);
  });

  it("B-2 신축이 승자 → §97 카드에 배제 배너가 붙는다(구별력)", () => {
    const r = run("rental_97_main", 0.8);
    expect(r.reductionType).toBe("신축주택");
    expect(r.rental97TaxDetail?.id).toBe("rental_97_main");
    expect(bannerBeforeRental97Card(r)).toBe(true);
  });
});
