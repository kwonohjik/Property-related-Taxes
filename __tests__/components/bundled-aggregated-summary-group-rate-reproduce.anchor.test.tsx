/**
 * 일괄 「합산 과세 내역」(`AggregatedTaxSummary`) 세율 행 — 결과뷰 리뷰 2026-11-21 R-c01-02 형제
 * (리뷰 지적 R-c01-02-sibling-single-group).
 *
 * 한 세율군 안에 호(버킷)가 둘 이상이면(단기 1년 미만 50% + 1~2년 40%) 군 메타 `appliedRate`는
 * 표시용 최고세율이라 「과세표준 × 세율 − 누진공제」가 군 산출세액을 재현하지 못한다. 형제
 * `MultiTransferTaxResultView` 세율군 카드는 `groupRateText`로 검산해 「(호별 합계)」를 적는데,
 * 일괄 카드는 검산 없이 최고세율을 산출세액의 근거처럼 적었다.
 *
 * 실측(이 수정 전, mock 세율표 · 양도일 2024-06-01):
 *   P2 단기 토지 2필지(2023-12-01·2022-12-01 취득, 각 800,000,000/500,000,000) — groups 채택 · 군 하나
 *      과세표준 597,500,000 · 산출세액 268,750,000 · 「세율 50%」 (597,500,000 × 50% = 298,750,000)
 *   P4 장기 토지 + 단기 2필지 — groups 채택 · 「· 단기보유 (과표 197,500,000) 50%」 · 군 세액 88,750,000
 * 세율표는 mock(`makeMockRates`) — 정본 세액이 아니다.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { AggregatedTaxSummary } from "@/components/calc/results/BundledAllocationSubCards";

afterEach(cleanup);

const land = (id: string, acq: string, tp: number, ap: number): TransferTaxItemInput =>
  ({
    ...baseTransferInput({
      isOneHousehold: false, householdHousingCount: 0, propertyType: "land",
      acquisitionDate: new Date(acq), transferDate: new Date("2024-06-01"), transferPrice: tp, acquisitionPrice: ap,
    }),
    propertyId: id, propertyLabel: id,
  }) as TransferTaxItemInput;

const run = (props: TransferTaxItemInput[]) =>
  calculateTransferTaxAggregate({ taxYear: 2024, properties: props, annualBasicDeductionUsed: 0 }, makeMockRates());

/** 세율 행(라벨이 「세율」로 시작하거나 「· 」 세율군 행)의 [라벨, 값] */
function rateRows(r: ReturnType<typeof run>): [string, string][] {
  const { container } = render(<AggregatedTaxSummary aggregated={r} />);
  return [...container.querySelectorAll("tr")]
    .map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent?.trim() ?? ""))
    .filter((tds) => tds.length >= 2 && (tds[0].startsWith("세율") || tds[0].startsWith("· ")))
    .map((tds) => [tds[0], tds[1]] as [string, string]);
}

const P2 = () => run([land("A", "2023-12-01", 800_000_000, 500_000_000), land("B", "2022-12-01", 800_000_000, 500_000_000)]);
const P4 = () =>
  run([
    land("A", "2010-01-01", 800_000_000, 500_000_000),
    land("B", "2023-12-01", 400_000_000, 300_000_000),
    land("C", "2022-12-01", 400_000_000, 300_000_000),
  ]);

describe("전제 — 격자", () => {
  it("P2: groups 채택 · 단기 군 하나 · 과세표준 597,500,000 · 세액 268,750,000 · 메타 50%/0 (재현 안 됨)", () => {
    const r = P2();
    expect(r.comparedTaxApplied).toBe("groups");
    expect(r.groupTaxes.map((g) => [g.group, g.groupTaxBase, g.groupCalculatedTax, g.appliedRate, g.progressiveDeduction])).toEqual([
      ["short_term", 597_500_000, 268_750_000, 0.5, 0],
    ]);
    expect(r.calculatedTax).toBe(268_750_000);
  });

  it("P4: groups 채택 · 일반 누진 216,000,000/62,140,000(38%·19,940,000 재현) · 단기 197,500,000/88,750,000(50% 재현 안 됨)", () => {
    const r = P4();
    expect(r.comparedTaxApplied).toBe("groups");
    expect(r.groupTaxes.map((g) => [g.group, g.groupTaxBase, g.groupCalculatedTax, g.appliedRate, g.progressiveDeduction])).toEqual([
      ["progressive", 216_000_000, 62_140_000, 0.38, 19_940_000],
      ["short_term", 197_500_000, 88_750_000, 0.5, 0],
    ]);
  });
});

describe("🔑 재현하지 못하는 세율은 산출세액의 근거로 적지 않는다", () => {
  it("P2 단일 군 — 「세율 호별 합계」 · 「50%」를 적지 않는다", () => {
    expect(rateRows(P2())).toEqual([["세율", "호별 합계"]]);
  });

  it("P4 세율군별 — 일반 누진은 38% 그대로, 단기보유는 「호별 합계」", () => {
    expect(rateRows(P4())).toEqual([
      ["세율", "세율군별 복합"],
      ["· 일반 누진 (과표 216,000,000)", "38%"],
      ["· 단기보유 (과표 197,500,000)", "호별 합계"],
    ]);
  });
});

describe("대조군 — 재현되는 단일 군은 종전 표시", () => {
  it("단기 1필지(1년 미만) — 「세율 50%」", () => {
    expect(rateRows(run([land("A", "2023-12-01", 400_000_000, 300_000_000)]))).toEqual([["세율", "50%"]]);
  });

  it("일반 누진 2필지(과세표준 140,000,000) — 「세율 35%」", () => {
    expect(
      rateRows(run([land("A", "2022-01-01", 395_000_000, 300_000_000), land("B", "2022-01-01", 347_500_000, 300_000_000)])),
    ).toEqual([["세율", "35%"]]);
  });
});
