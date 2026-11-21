/**
 * 결과뷰 리뷰 2026-11-21 R-c07-02 (MAJOR) — 함께 양도·다건의 하이브리드 5년 이내 세액감면 카드(`IncomeDeductionDetailCard` tax_amount 모드).
 *
 * 종전: 카드가 `aggregatedContext`를 받지 않아 자산 단독 값으로 「산출세액 × 감면율 = 감면세액」과 단건 농어촌특별세 줄을 찍었다.
 *   §98의7 1건: 카드 「81,710,000 × 100% = 82,660,000」·농특세 16,532,000 / 합산 실제 81,710,000·16,342,000
 *   §98의7 + 토지: 카드 82,660,000·16,532,000 / 합산 실제 84,846,942·16,969,388
 *   §98의6 50% 1건: 카드 41,330,000·8,266,000 / 합산 실제 40,855,000·8,171,000
 * (NH-64는 income_deduction 경로만 고쳤다.) 엔진 합산 결과 → 호출부(`BundledAllocationSubCards`·`MultiTransferPropertyBreakdown`)와 같은 props로 렌더.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { ReductionDetailCards } from "@/components/calc/results/transfer/ReductionDetailCards";

afterEach(cleanup);

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const R986 = {
  type: "unsold_98_6", hoType986: "seller_rented", isEligibleSubject986: true, stdPriceSumAtBase986: 500_000_000, floorAreaSqm986: 84,
  isUnsoldAfterCompletion986: true, isFirstContract986: true, isNotOccupiedAfterCompletion986: true, isNotRecontract986: true, sellerRented2Years986: true,
  standardPriceAtAcquisition986: 200_000_000, standardPriceAt5Years986: 300_000_000, standardPriceAtTransfer986: 400_000_000,
};
const R987 = {
  type: "unsold_98_7", contractDate987: D("2012-10-15"), acquisitionPrice987: 550_000_000,
  isUnsoldAtCutoff987: true, isFirstContract987: true, isNotOccupiedAtContract987: true, isNotRecontract987: true,
  standardPriceAtAcquisition987: 200_000_000, standardPriceAt5Years987: 300_000_000, standardPriceAtTransfer987: 400_000_000,
};
const house = (red: unknown, acq: string, tr: string) => ({
  transferPrice: 800_000_000, acquisitionPrice: 500_000_000, acquisitionDate: D(acq), transferDate: D(tr), reductions: [red],
});
const prop = (id: string, o: Record<string, unknown>) =>
  ({ ...baseTransferInput({ householdHousingCount: 2, isOneHousehold: false, ...o } as never), propertyId: id, propertyLabel: id }) as never;
const land = (tr: string) =>
  prop("L", { propertyType: "land", transferPrice: 200_000_000, acquisitionPrice: 150_000_000, acquisitionDate: D("2005-01-01"), transferDate: D(tr), householdHousingCount: 0 });

function card(red: unknown, acq: string, tr: string, withLand: boolean, aggregatedContext = true) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a: any = calculateTransferTaxAggregate(
    { taxYear: Number(tr.slice(0, 4)), annualBasicDeductionUsed: 0, properties: withLand ? [prop("H", house(red, acq, tr)), land(tr)] : [prop("H", house(red, acq, tr))] } as never,
    rates,
  );
  const b = a.properties[0];
  const { container } = render(
    <ReductionDetailCards
      result={b}
      calculatedTax={b.refCalculatedTax}
      taxBase={b.taxBaseShare}
      longTermHoldingDeduction={b.longTermHoldingDeduction}
      aggregatedContext={aggregatedContext}
      appliedReductionType={b.reductionType}
      incomeDeductionApplied={b.isExempt ? undefined : b.incomeDeductionReducible}
    />,
  );
  return { text: container.textContent ?? "", reduction: a.reductionAmount as number, rural: a.ruralSurtax as number };
}

const AGG_REDUCTION = "감면세액은 여러 건을 합산한 산출세액으로 다시 계산해 확정합니다 — 합산 결과의 감면세액 참조";
const AGG_RURAL = `농어촌특별세는 합산 결과에서 확정한 감면세액 × 20%로 산정합니다(${TRANSFER.RURAL_SURTAX_REDUCTION}).`;

describe("R-c07-02 — 합산 경로 세액감면 카드는 자산 단독 감면세액·농특세를 찍지 않는다", () => {
  it.each([
    ["§98의7 1건", R987, "2012-11-01", "2016-06-01", false, 81_710_000, 16_342_000, ["81,710,000 × 100% = 82,660,000", "82,660,000", "16,532,000"]],
    ["§98의7 + 토지", R987, "2012-11-01", "2016-06-01", true, 84_846_942, 16_969_388, ["82,660,000 × 100% = 82,660,000", "82,660,000", "16,532,000"]],
    ["§98의6 50% 1건", R986, "2011-06-01", "2014-06-01", false, 40_855_000, 8_171_000, ["81,710,000 × 50% = 41,330,000", "41,330,000", "8,266,000"]],
  ] as const)("%s — 합산 실제 감면세액·농특세(엔진) 확인 · 카드는 합산 안내", (_n, red, acq, tr, withLand, reduction, rural, stale) => {
    const r = card(red, acq, tr, withLand);
    expect([r.reduction, r.rural]).toEqual([reduction, rural]);
    for (const s of stale) expect(r.text).not.toContain(s);
    expect(r.text).not.toContain("총 납부세액에 합산");
    expect(r.text).toContain(AGG_REDUCTION);
    expect(r.text).toContain(AGG_RURAL);
  });

  it("(긍정 짝) 합산 경로가 아니면 종전 단건 산식·농특세 줄 그대로", () => {
    const r = card(R987, "2012-11-01", "2016-06-01", false, false);
    expect(r.text).toContain("감면세액 = 산출세액 × 감면율");
    expect(r.text).toContain("총 납부세액에 합산");
    expect(r.text).not.toContain(AGG_REDUCTION);
  });
});
