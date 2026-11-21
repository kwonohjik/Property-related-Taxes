/**
 * anchor — 공익수용 §164⑨ 1호 카드 첫 후보 라벨(결과뷰 리뷰 R-c05-12). 표시 전용 — min 선택·분모는 바뀌지 않는다.
 *
 * 종전: 첫 행 라벨이 「공시지가」로 고정돼 상업용 건물(호별 ㎡당 고시가 · 법 §99①1호 다목)·건물(나목)에도 개별공시지가처럼 적혔다.
 * 지금: 엔진 echo `standardKind`로 가·나·다목 라벨을 고른다. echo가 없는 옛 결과는 종전 「공시지가」.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { applyExpropriationValuation } from "@/lib/tax-engine/transfer-tax-expropriation-valuation";
import { ExpropriationValuationCard } from "@/components/calc/results/transfer/ExpropriationValuationCard";

afterEach(cleanup);

const detailOf = (propertyType: "land" | "building" | "commercial_building" | "general_building") =>
  applyExpropriationValuation({
    propertyType,
    useEstimatedAcquisition: true,
    transferCause: "public_expropriation",
    transferDate: new Date("2024-03-01"),
    standardPricePerSqmAtTransfer: 2_500_000,
    transferArea: 200,
    compensationPerSqm: 1_500_000,
    compensationBasisStdPrice: 2_000_000,
  })!.detail;

const firstLabel = (d: ReturnType<typeof detailOf>) =>
  render(<ExpropriationValuationCard detail={d} />).container.querySelector("tbody tr td")?.textContent;

describe("R-c05-12 첫 후보 라벨 — 기준시가 종류", () => {
  it.each([
    ["land", "land", "개별공시지가"],
    ["general_building", "land", "개별공시지가"],
    ["building", "building", "건물 기준시가 (국세청 고시)"],
    ["commercial_building", "commercial_building", "오피스텔·상업용 건물 기준시가 (국세청 고시 ㎡당)"],
  ] as const)("%s → %s", (pt, kind, label) => {
    const d = detailOf(pt);
    expect(d.standardKind).toBe(kind);
    expect(d.chosenPerSqm).toBe(1_500_000);
    expect(d.denominator).toBe(300_000_000);
    expect(firstLabel(d)).toBe(label);
  });

  it("echo가 없는 옛 결과 — 종전 「공시지가」", () => {
    const { standardKind: _drop, ...legacy } = detailOf("commercial_building");
    void _drop;
    expect(firstLabel(legacy)).toBe("공시지가");
  });
});
