/**
 * G2 렌더 anchor — «컴포넌트가 평가기준일을 실제로 넘기는가».
 *
 * G2의 결함은 대부분 「헬퍼는 맞는데 호출부가 인자를 안 넘긴다」이므로, 헬퍼만 단언하는
 * anchor는 구별력이 0이다(G1 IG-141에서 실측). 이 파일이 그 짝이다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EstateItemTableView } from "@/components/calc/EstateItemTableView";
import { TotalEstimatedValue, EstimatedValuePreview } from "@/components/calc/property-valuation-preview";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

afterEach(cleanup);

/** 지상권 — 잔존연수가 평가기준일에서 파생되므로 날짜가 없으면 값이 무너진다. */
const SUPERFICIES: EstateItem = {
  id: "sf-1",
  category: "superficies",
  name: "지상권",
  superficiesLandStandardPrice: 1_000_000,
  superficiesLandArea: 300,
  superficiesStructureType: "solid_building", // 최단 30년
  superficiesSetDate: "2020-01-01",
} as unknown as EstateItem;

describe("IG-083 · 재산 목록 표가 평가기준일을 넘긴다", () => {
  it("R-1 날짜를 주면 지상권 평가액이 0이 아니다", () => {
    render(
      <EstateItemTableView
        items={[SUPERFICIES]}
        selectedItemId={null}
        onSelect={() => {}}
        mode="inheritance"
        heirsCount={1}
        ariaLabel="상속재산 목록"
        valuationDate="2024-01-01"
      />,
    );
    const row = screen.getByRole("button", { name: /지상권/ });
    expect(row.textContent).not.toMatch(/(^|\D)0(\D|$)/);
    expect(row.textContent).toMatch(/[1-9][\d,]{5,}/); // 6자리 이상 금액
  });

  it("R-2 구별력 — 날짜를 빼면 같은 자산이 0원이 된다", () => {
    render(
      <EstateItemTableView
        items={[SUPERFICIES]}
        selectedItemId={null}
        onSelect={() => {}}
        mode="inheritance"
        heirsCount={1}
        ariaLabel="상속재산 목록"
      />,
    );
    const row = screen.getByRole("button", { name: /지상권/ });
    expect(row.textContent).not.toMatch(/[1-9][\d,]{5,}/);
  });
});

describe("IG-085 · 「재산 합계 (예상)」가 평가기준일을 넘긴다", () => {
  it("R-3 날짜가 있으면 합계가 0이 아니라 렌더된다", () => {
    render(<TotalEstimatedValue items={[SUPERFICIES]} valuationDate="2024-01-01" />);
    expect(screen.getByText(/[1-9][\d,]{5,}/)).toBeDefined();
  });

  it("R-4 구별력 — 날짜가 없으면 합계가 0이라 카드 자체가 렌더되지 않는다", () => {
    const { container } = render(<TotalEstimatedValue items={[SUPERFICIES]} />);
    expect(container.textContent).toBe("");
  });
});

describe("IG-088 · 미리보기 §66 담보채권액이 신용보증기관 보증액을 뺀다", () => {
  /** 시가 5억 · 저당 3억 · 보증 1억 · 임대보증금 5천만 → 담보채권액 2.5억 (3.5억 아님) */
  const LAND = {
    id: "ld-1",
    category: "real_estate_land",
    name: "토지",
    marketValue: 500_000_000,
    mortgageAmount: 300_000_000,
    creditGuaranteeAmount: 100_000_000,
    leaseDeposit: 50_000_000,
  } as unknown as EstateItem;

  it("R-5 화면 담보채무 금액이 엔진 computeSecuredClaim과 같다", () => {
    render(<EstimatedValuePreview item={LAND} />);
    expect(screen.getByText(/담보채무 250,000,000/)).toBeDefined();
  });

  it("R-6 구별력 — 로컬 재계산(단순 합)이면 350,000,000이 뜬다", () => {
    render(<EstimatedValuePreview item={LAND} />);
    expect(screen.queryByText(/담보채무 350,000,000/)).toBeNull();
  });
});
