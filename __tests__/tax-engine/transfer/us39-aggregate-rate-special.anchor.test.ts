/**
 * anchor: 일괄양도·다건 집계가 조특법 §98 시리즈 세율 특칙을 잃지 않는다 — 리뷰 US-39 · 사용자 결정 Q-9 (b)
 *
 * ── 무엇을 잠그나 ───────────────────────────────────────────────
 * 1) §98의3④·§98의5③·§98의6③ 단기세율 배제(`suppressShortTermRate`) — 단건 STEP 7이 세율 입력에만 주입하는 내부
 *    플래그라, 집계가 그룹 세액을 다시 구할 때 소실됐다. 단건 결과 echo(`rateSpecialInjected`)로 되살린다.
 *    이 플래그는 감면율 100% 미만 조문에서는 **과대**, 100%에서는 **과소**로 갈렸다(주택만 단기 군에 떨어져 전액 감면되고
 *    나머지 자산만 낮은 구간으로 과세).
 * 2) §98①1호 20% — Q-9 (b): 「제104조제1항에도 불구하고 100분의 20」을 적용받는 자산에는 §104⑤ 비교과세가 미치지 않는다.
 *    §98 주택분은 20%로 따로 과세하고, 전체 누진 쪽 비교는 그 자산을 뺀 나머지에서만 한다.
 *
 * 값은 mock 세율(`makeMockRates` — 양도 연도의 실제 세율표가 아니다) 기준이다. 방향과 구조만 법령 일반에 대응한다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

const RED_985 = {
  type: "unsold_98_5" as const,
  contractDate985: D("2010-06-01"),
  priceReductionRatePct985: 5, // 감면 60%
  isNonCapitalUnsoldAtCutoff985: true,
  isFirstContract985: true,
  isNotOccupiedAtContract985: true,
  isNotRecontract985: true,
};
const RED_983 = {
  type: "unsold_98_3" as const,
  residencyType983: "resident" as const,
  houseType983: "self_built" as const,
  constructionStartDate983: D("2009-03-01"),
  usageApprovalDate983: D("2009-12-01"),
  isOutsideSeoulNotDesignated983: true,
  isOverconcentration983: false,
  isNotExcludedSelfBuilt983: true,
  standardPriceAtAcquisition983: 200_000_000,
  standardPriceAt5Years983: 300_000_000,
  standardPriceAtTransfer983: 400_000_000,
};
const R98 = {
  type: "unsold_98" as const,
  contractDate98: D("1996-06-01"),
  isResident98: true,
  isNationalScale98: true,
  isOutsideSeoul98: true,
  isUnsoldConfirmed98: true,
  isNotRentalHousing98: true,
  isFirstBuyerNoOccupancy98: true,
  rentedFor5Years98: true,
};

function prop(id: string, o: Record<string, unknown>) {
  return {
    ...baseTransferInput({ householdHousingCount: 2, isOneHousehold: false, ...o } as never),
    propertyId: id,
    propertyLabel: id,
  } as never;
}
function landOf(year: string) {
  return prop("L", {
    propertyType: "land",
    transferPrice: 200_000_000,
    acquisitionPrice: 150_000_000,
    acquisitionDate: D("2005-01-01"),
    transferDate: D(year),
    householdHousingCount: 0,
  });
}
function agg(taxYear: number, properties: unknown[]) {
  return calculateTransferTaxAggregate({ taxYear, annualBasicDeductionUsed: 0, properties: properties as never }, rates);
}

describe("US-39 §98 20% (Q-9 b) — 주택분은 20%로 따로, 나머지만 §104⑤ 비교", () => {
  const house = (reductions: unknown[]) =>
    prop("H", {
      transferPrice: 900_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: D("1996-06-01"),
      transferDate: D("2024-06-01"),
      reductions,
    });

  it("U39-1: 🔁 §98 주택 + 토지 — 주택 83,500,000(과세표준 417,500,000 × 20%) + 토지 3,990,000 = 87,490,000 (종전 155,060,000)", () => {
    const r = agg(2024, [house([R98]), landOf("2024-06-01")]);
    // 손계산: 주택 양도차익 600,000,000 − 장특 30% 420,000,000(−) → 기본공제 2,500,000 → 과세표준 417,500,000 × 20% = 83,500,000
    //         토지 양도차익 50,000,000 − 장특 30%(15,000,000) = 35,000,000 × 15% − 1,260,000 = 3,990,000
    expect(r.calculatedTax).toBe(87_490_000);
    expect(r.localIncomeTax).toBe(8_749_000);
    expect(r.totalTax).toBe(96_239_000);
  });

  it("U39-2: 대조 — §98을 고르지 않으면 종전과 같은 누진 합산(155,060,000 · 총부담 170,566,000)", () => {
    const r = agg(2024, [house([]), landOf("2024-06-01")]);
    expect(r.calculatedTax).toBe(155_060_000);
    expect(r.totalTax).toBe(170_566_000);
  });

  it("U39-3: 단건 주택만이면 단건 엔진과 같다 (집계 1건 = 단건 91,850,000) — 종전 집계는 155,166,000", () => {
    const single = calculateTransferTax(house([R98]) as never, rates);
    const r = agg(2024, [house([R98])]);
    expect(single.totalTax).toBe(91_850_000);
    expect(r.totalTax).toBe(91_850_000);
    expect(r.calculatedTax).toBe(83_500_000);
  });

  it("U39-4: 20% 자산은 전체 누진 비교(byGeneral)에서 빠진다 — byGeneral = 토지 누진 + 주택 20%", () => {
    const r = agg(2024, [house([R98]), landOf("2024-06-01")]);
    expect(r.calculatedTaxByGroups).toBe(87_490_000);
    expect(r.calculatedTaxByGeneral).toBe(87_490_000);
  });
});

describe("US-39 단기세율 배제 — 감면율 100% 미만(과대)과 100%(과소) 두 방향", () => {
  it("U39-5: 🔁 §98의5 60% (보유 10개월) + 토지 — 세율 특칙이 살아 총부담 55,786,712 (종전 71,296,500 과대 — 종전값은 #3068 표1 연혁 전 측정)", () => {
    const h = prop("H", {
      transferPrice: 800_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: D("2011-03-15"),
      transferDate: D("2012-01-20"),
      reductions: [RED_985],
    });
    const r = agg(2012, [h, landOf("2012-01-20")]);
    // 주택 단기 군이 아니라 §104①1호 누진 — 합산 누진세액 108,860,000(= 세율군별 = 전체누진)
    // 토지(2005 취득 · 보유 7년)는 #3068 표1 연혁으로 2012 양도 21%(종전 연 2% 14%) — mock 누진표는 2024 시행본이다.
    expect(r.calculatedTaxByGroups).toBe(108_860_000);
    expect(r.calculatedTax).toBe(108_860_000);
    expect(r.groupTaxes.map((g) => g.group)).toEqual(["progressive"]); // 종전: short_term + progressive 두 군
    expect(r.determinedTax).toBe(50_715_193);
    expect(r.totalTax).toBe(55_786_712);
  });

  it("U39-6: 🔁 §98의3 100% (5년 내) + 토지 — 총부담 14,243,059 (종전 5,626,500 과소 — 종전값은 #3068 표1 연혁 전 측정: 주택만 단기 군으로 전액 감면되고 토지만 낮은 구간)", () => {
    const h = prop("H", {
      transferPrice: 800_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: D("2009-12-01"),
      transferDate: D("2010-06-01"),
      reductions: [RED_983],
    });
    const r = agg(2010, [h, landOf("2010-06-01")]);
    // 토지(보유 5년)는 #3068 표1 연혁으로 2010 양도 15%(종전 10%)
    expect(r.calculatedTax).toBe(110_060_000);
    expect(r.determinedTax).toBe(12_948_236);
    expect(r.totalTax).toBe(14_243_059);
  });
});
