/**
 * anchor — R-c11-01 다건 감면 재계산 표(`MultiTransferTaxResultView` 「건별 배분」)의 「감면대상소득」 열
 *
 * §77 파트별 감면(5B `partWise`)이면 이 열도 신고서 ⑲와 같은 값 = 엔진 `partWise.eligibleIncome`이어야 한다.
 * 화면 렌더가 필요해 `.tsx`(jsdom)로 둔다 — 나머지 ⑲ 경로(신고서 표·상세명세서·PDF)는
 * `transfer-77-partwise-eligible-income.anchor.test.ts`. 시료는 그 파일의 다건 시료(F2-1과 같은 입력)와 같다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { MultiTransferTaxResultView } from "@/components/calc/results/MultiTransferTaxResultView";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { baseTransferInput, makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";

afterEach(cleanup);

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const E77 = (cash: number) => ({ type: "public_expropriation", cashCompensation: cash, bondCompensation: 0, businessApprovalDate: D("2013-01-01") });
const split = () =>
  baseTransferInput({
    propertyType: "building", transferPrice: 1_550_000_000, transferDate: D("2023-03-20"),
    acquisitionPrice: 500_000_000, acquisitionDate: D("2008-03-20"), landAcquisitionDate: D("2021-09-20"),
    isOneHousehold: false, householdHousingCount: 1, isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    landTransferPrice: 250_000_000, buildingTransferPrice: 1_300_000_000, landStandardPriceAtTransfer: 250_000_000, buildingStandardPriceAtTransfer: 1_300_000_000,
    landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 300_000_000, expenses: 0, annualBasicDeductionUsed: 0,
    reductions: [E77(1_550_000_000)],
  } as Partial<TransferTaxInput>);
const nbl = () =>
  baseTransferInput({
    propertyType: "land", transferPrice: 1_200_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2017-02-20"), transferDate: D("2023-03-20"),
    isOneHousehold: false, householdHousingCount: 0, isNonBusinessLand: true, expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>);
const asItem = (i: TransferTaxInput, id: string) => ({ ...i, propertyId: id, propertyLabel: id }) as unknown as TransferTaxItemInput;

describe("R-c11-01 다건 감면 재계산 표 — 건별 「감면대상소득」 = 엔진 partWise.eligibleIncome", () => {
  it("split 자산(건물분만 충족) 행이 감면대상 파트 소득을 보인다 (종전 자산 전체 양도소득금액)", () => {
    const agg = calculateTransferTaxAggregate(
      { taxYear: 2023, properties: [asItem(split(), "A0"), asItem(nbl(), "A1")], annualBasicDeductionUsed: 0 },
      rates,
    );
    const p0 = agg.properties[0];
    const pw = p0.publicExpropriationDetail?.partWise;
    expect(pw?.eligiblePart).toBe("building");
    expect(pw!.eligibleIncome).toBeLessThan(p0.income);

    const properties = agg.properties.map((p) => ({ propertyId: p.propertyId, propertyLabel: p.propertyLabel })) as unknown as PropertyItem[];
    const { container } = render(<MultiTransferTaxResultView result={agg} properties={properties} taxYear={2023} />);
    const section = container.querySelector('[data-print-id="reduction-recalc"]');
    expect(section, "감면 재계산 섹션이 없다").not.toBeNull();
    const rows = [...section!.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent?.trim() ?? ""));
    // [자산, 건별 산출세액, 건별 단독감면, 감면대상소득, 배분 감면]
    const rowA0 = rows.find((r) => r[0] === "A0");
    expect(rowA0?.[3]).toBe(pw!.eligibleIncome.toLocaleString());
  });
});
