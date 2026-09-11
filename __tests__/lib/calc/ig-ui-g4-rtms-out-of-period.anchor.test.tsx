/**
 * @vitest-environment jsdom
 *
 * IG-047 — 평가기간 외 유사매매사례 행은 «선택 대상이 아니다».
 *
 * 종전에는 기간 외 행도 기간 내 행과 똑같이 클릭·체크가 됐는데, 선택 집계
 * (`selectedCandidates`)는 기간 내 배열만 필터해서 선택 건수·평균·「이 금액으로 채우기」
 * 어디에도 반영되지 않았다 — 체크는 켜지는데 침묵 제외되는 상태.
 * 목록 헤더가 「참고용 — 시가 불인정 가능」이라 적으므로 «선택 불가»가 정본이다.
 *
 * 모듈 전체를 mock한다 — 이 anchor가 재는 것은 RTMS 조회·필터가 아니라
 * «기간 내/기간 외 행의 상호작용 차이»뿐이다.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

const mk = (dealDate: string, amount: number, isWithinPeriod: boolean) => ({
  trade: {
    aptName: "테스트아파트",
    aptNameNormalized: "테스트아파트",
    dealDate,
    exclusiveAreaM2: 84.97,
    dealAmountWon: amount,
    floor: 10,
    buildYear: 2015,
    jibun: "1",
    umdNm: "테스트동",
    lawdCd: "41463",
    dealingType: "중개거래",
  },
  daysFromValuationDate: isWithinPeriod ? 10 : 400,
  areaDiffRatePct: 0,
  isWithinPeriod,
  isRecommended: false,
});

const IN_PERIOD = mk("2024-05-20", 900_000_000, true);
const OUT_OF_PERIOD = mk("2022-01-10", 500_000_000, false);

vi.mock("@/lib/calc/rtms-similar-sales-lookup", () => ({
  fetchRtmsSimilarSales: vi.fn(async () => ({ records: [] })),
  isRtmsLookupError: () => false,
  filterSimilarSales: () => ({
    candidates: [IN_PERIOD],
    outOfPeriod: [OUT_OF_PERIOD],
    recommendedValue: 900_000_000,
    appliedCriteria: { areaMin: 80, areaMax: 90, periodStart: "2024-01-01", periodEnd: "2024-12-31" },
    warnings: [],
    stdPriceApplied: false,
  }),
  rankByClosestDate: <T,>(xs: T[]) => xs,
  averageAmount: (xs: Array<{ trade: { dealAmountWon: number } }>) =>
    Math.floor(xs.reduce((s, c) => s + c.trade.dealAmountWon, 0) / xs.length),
}));

const { RtmsSimilarSalesModal } = await import(
  "@/components/calc/inheritance/estate-card/variants/RtmsSimilarSalesModal"
);

afterEach(cleanup);

const props = {
  open: true,
  onOpenChange: vi.fn(),
  aptName: "테스트아파트",
  sigunguCode: "41463",
  targetExclusiveAreaM2: 84.97,
  valuationDate: "2024-06-01",
  onSelect: vi.fn(),
  taxType: "inheritance" as const,
};

async function search() {
  render(<RtmsSimilarSalesModal {...props} />);
  fireEvent.click(screen.getByText(/조회 시작/));
  await screen.findByText(/평가기간 외 거래 1건/);
}

describe("IG-047 — 기간 외 행은 체크가 켜지지 않는다", () => {
  it("A-1 (양성·대조군): 기간 내 행을 클릭하면 선택 건수·평균이 잡힌다", async () => {
    await search();
    const rows = screen.getAllByRole("checkbox");
    expect(rows).toHaveLength(1); // 기간 외 행은 checkbox 역할 자체가 아니다
    fireEvent.click(rows[0]);
    expect(screen.getByText(/선택 1건 평균:/)).toBeTruthy();
  });

  it("A-2 (음성): 기간 외 행을 클릭해도 선택 집계가 움직이지 않는다", async () => {
    await search();
    fireEvent.click(screen.getByText(/평가기간 외 거래 1건/)); // 접힌 목록 펼치기

    const badge = screen.getByText("평가기간 외 · 선택 불가");
    const row = badge.closest('[aria-disabled="true"]') as HTMLElement;
    expect(row).toBeTruthy();
    fireEvent.click(row);

    expect(screen.getByText(/행을 선택하면 평균 금액이 표시됩니다/)).toBeTruthy();
    expect(within(row).queryByText("✓")).toBeNull();
  });
});
