/**
 * anchor — 일괄양도(집계) 경로의 하이브리드 5년 이내 세액감면 농어촌특별세 (2026-11-09)
 *
 * 결함: 집계 `computeAggregateTaxCreditRuralSurtax`가 세액감면 농특세를 `RURAL_SURTAX_TABLE`로만 판정했다.
 * 하이브리드(§98의3·§98의5·§98의6·§98의7·§99의2·§98의4)는 단건 STEP 8.7(`mergeHybridTaxDetail`)이 따로 계산하므로
 * 그 표에 일부러 없다 → 집계에서는 「미판정 → 0」이 되어 과세 조문(§98의6·§98의7 등)의 농특세가 통째로 빠졌다.
 * (§98 시리즈 리뷰 2단계 O #3084 「남은 확인 필요」에서 발견 — 리뷰 문서 §0-4 2단계 결과)
 *
 * 수정: 단건과 같은 술어(`isHybridRuralSurtaxExempt` — evaluator의 `ruralSurtaxExempt`, 농특세령 §4⑦1호 §98의3·§98의5만 비과세).
 *
 * 수정 전 실측(mock 세율): §98의6 1호 50% 단건 농특세 8,171,000 → 집계 0(총부담 53,111,500 → 44,940,500),
 *                          §98의7 100% 단건 16,342,000 → 집계 0(총부담 16,342,000 → 0).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { applyRate } from "@/lib/tax-engine/tax-utils";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
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
const R983 = {
  type: "unsold_98_3", residencyType983: "resident", houseType983: "self_built",
  constructionStartDate983: D("2009-03-01"), usageApprovalDate983: D("2009-12-01"),
  isOutsideSeoulNotDesignated983: true, isOverconcentration983: false, isNotExcludedSelfBuilt983: true,
  standardPriceAtAcquisition983: 200_000_000, standardPriceAt5Years983: 300_000_000, standardPriceAtTransfer983: 400_000_000,
};

const house = (red: unknown, acq: string, tr: string) => ({
  transferPrice: 800_000_000, acquisitionPrice: 500_000_000, acquisitionDate: D(acq), transferDate: D(tr), reductions: [red],
});
const prop = (id: string, o: Record<string, unknown>) =>
  ({ ...baseTransferInput({ householdHousingCount: 2, isOneHousehold: false, ...o } as never), propertyId: id, propertyLabel: id }) as never;
const land = (tr: string) =>
  prop("L", { propertyType: "land", transferPrice: 200_000_000, acquisitionPrice: 150_000_000, acquisitionDate: D("2005-01-01"), transferDate: D(tr), householdHousingCount: 0 });
const single = (h: Record<string, unknown>): Any =>
  calculateTransferTax(baseTransferInput({ householdHousingCount: 2, isOneHousehold: false, ...h } as never), rates);
const agg = (tr: string, props: unknown[]): Any =>
  calculateTransferTaxAggregate({ taxYear: Number(tr.slice(0, 4)), annualBasicDeductionUsed: 0, properties: props } as never, rates);

describe("집계 경로 하이브리드 5년 이내 세액감면 농특세 — 단건과 같다", () => {
  it.each([
    ["§98의6 1호 50%", R986, "2011-06-01", "2014-06-01", 8_171_000, 53_111_500],
    ["§98의7 100%", R987, "2012-11-01", "2016-06-01", 16_342_000, 16_342_000],
  ])("%s — 자산 1건 집계 = 단건 (농특세 · 총부담)", (_n, red, acq, tr, rural, total) => {
    const h = house(red, acq, tr);
    const s = single(h);
    const a = agg(tr, [prop("H", h)]);
    expect(s.ruralSurtax).toBe(rural);
    expect(a.ruralSurtax).toBe(rural);
    expect(a.totalTax).toBe(total);
    expect(s.totalTax).toBe(total);
  });

  it.each([
    ["§98의6 1호 50% + 토지", R986, "2011-06-01", "2014-06-01", 8_496_118],
    ["§98의7 100% + 토지", R987, "2012-11-01", "2016-06-01", 16_969_388],
  ])("%s — 농특세 = 배분된 감면세액 × 20%", (_n, red, acq, tr, rural) => {
    const a = agg(tr, [prop("H", house(red, acq, tr)), land(tr)]);
    expect(a.ruralSurtax).toBe(rural);
    expect(a.ruralSurtax).toBe(applyRate(a.reductionAmount, 0.2));
  });

  it("비과세 하이브리드(§98의3 — 농특세령 §4⑦1호)는 집계에서도 0", () => {
    const h = house(R983, "2009-12-01", "2010-06-01");
    const s = single(h);
    expect(s.reductionAmount).toBeGreaterThan(0);
    expect(s.ruralSurtax).toBe(0);
    expect(agg("2010-06-01", [prop("H", h)]).ruralSurtax).toBe(0);
    expect(agg("2010-06-01", [prop("H", h), land("2010-06-01")]).ruralSurtax).toBe(0);
  });
});
