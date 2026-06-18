/**
 * ComprehensiveTaxResultView — 주택 0채(토지전용 사례10) 시 주택분 섹션 숨김 RTL.
 *
 * Plan: docs/00-pm/comprehensive-land-only-zero-house.plan.md §D
 * - 0채 + 토지: 주택분 과세표준·납부할세액 카드 미렌더, 토지분 렌더.
 * - 저가 1주택(taxBase 0이지만 properties.length 1): 주택분 과세표준 섹션 "납세의무 없음" 유지(회귀).
 *   → 게이트가 isSubjectToHousingTax가 아니라 properties.length임을 고정.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ComprehensiveTaxResultView } from "../../components/calc/results/ComprehensiveTaxResultView";
import { calculateComprehensiveTax } from "../../lib/tax-engine/comprehensive-tax";
import type {
  ComprehensiveTaxInput,
  LandParcelInput,
} from "../../lib/tax-engine/types/comprehensive.types";

afterEach(cleanup);

const AGG: LandParcelInput[] = [
  { parcelId: "s1", jurisdiction: "서초구", area: 200, shareRatio: 0.5, officialPricePerSqm: 4_300_000, priorOfficialPricePerSqm: 3_200_000 },
  { parcelId: "p1", jurisdiction: "송파구", name: "송파구-1", area: 100, shareRatio: 1, officialPricePerSqm: 3_700_000, priorOfficialPricePerSqm: 3_300_000 },
];

describe("토지전용(0채) 결과 뷰 — 주택분 섹션 숨김", () => {
  it("0채 + 종합합산 토지: 주택분 과세표준·납부할세액 카드 미렌더, 토지분 렌더", () => {
    const input: ComprehensiveTaxInput = {
      assessmentYear: 2022,
      isOneHouseOwner: false,
      properties: [],
      landAggregateParcels: AGG,
    };
    const result = calculateComprehensiveTax(input);
    expect(result.properties.length).toBe(0); // 전제
    expect(result.aggregateLandTax).toBeDefined();

    render(<ComprehensiveTaxResultView result={result} />);

    // 주택분 과세표준 섹션 헤더 미렌더
    expect(screen.queryByText("주택분 과세표준 계산")).toBeNull();
    // 주택분 납부할세액 산출근거 카드 미렌더 (고유 testid — 토지분 카드/패널 라벨과 구분)
    expect(screen.queryByTestId("housing-payable-calc")).toBeNull();
    // 토지분 섹션은 표시
    expect(screen.getByText(/토지분 — 종합합산/)).toBeInTheDocument();
  });

  it("저가 1주택(과세표준 0): 주택분 과세표준 섹션 유지 (회귀 — 0채 숨김과 구분)", () => {
    const input: ComprehensiveTaxInput = {
      assessmentYear: 2022,
      isOneHouseOwner: false,
      // 5억 < 기본공제 9억 → taxBase 0 → isSubjectToHousingTax false, 그러나 properties.length 1
      properties: [{ propertyId: "p1", assessedValue: 500_000_000, exclusionType: "none" }],
    };
    const result = calculateComprehensiveTax(input);
    expect(result.properties.length).toBe(1); // 전제
    expect(result.isSubjectToHousingTax).toBe(false);

    render(<ComprehensiveTaxResultView result={result} />);

    // properties.length 게이트이므로 과세표준 섹션은 유지
    expect(screen.getByText("주택분 과세표준 계산")).toBeInTheDocument();
  });
});
