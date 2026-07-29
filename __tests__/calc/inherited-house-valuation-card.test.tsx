/**
 * anchor: 상속주택 환산취득가액 카드 표시 — §164⑦ 신 모델(이중계상 제거).
 *
 * (A) §164⑦ 추정표: 취득·최초공시 2행 = 토지 + 건물 = 합계기준시가(Sum) 자기일관.
 * (B) 환산 산식: 취득 개별주택가격 ÷ 양도 개별주택가격 P_T (토지 별도 가산 없음).
 * 인용 §164⑦·제164조 제4항. 하드코딩 "—"·토지+개별주택가격 이중계상 부재.
 *
 * 계획서: docs/02-design/features/inheritance-house-valuation-detail-card-display-fix.plan.md
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { InheritedHouseValuationDetailCard } from "../../components/calc/results/transfer/InheritedHouseValuationDetailCard";
import type { InheritanceHouseValuationResult } from "../../lib/tax-engine/types/inheritance-house-valuation.types";

afterEach(cleanup);

// Excel 13 시나리오 결과값 (probe 실측)
const DETAIL: InheritanceHouseValuationResult = {
  sumAtInheritance: 148_382_411, // 토지 110,246,831 + 건물 38,135,580
  sumAtFirstDisclosure: 329_982_000, // 토지 287,352,000 + 건물 42,630,000
  landStdAtInheritance: 110_246_831,
  landStdAtTransfer: 1_243_350_000,
  landStdAtFirstDisclosure: 287_352_000,
  buildingStdAtInheritance: 38_135_580,
  buildingStdAtFirstDisclosure: 42_630_000,
  housePriceAtFirstDisclosure: 341_000_000,
  housePriceAtInheritanceUsed: 153_336_855, // est (§164⑦)
  housePriceAtTransfer: 1_287_000_000, // P_T
  estimationMethod: "estimated_phd",
  formula: "취득당시 개별주택가격 추정 (§164⑦ · ⑤ 준용)",
  legalBasis: "소득세법 시행령 §164⑦",
  warnings: [],
};

describe("InheritedHouseValuationDetailCard — §164⑦ 신 모델", () => {
  it("A2: 추정표 자기일관(토지+건물=합계) + 환산 개별주택가격 비율 + 인용 §164⑦", () => {
    render(<InheritedHouseValuationDetailCard detail={DETAIL} />);

    // 배지 §164⑦ (구 §164⑤ 아님)
    expect(screen.getByText(/§164⑦ 개별주택가격 추정/)).toBeInTheDocument();
    expect(screen.queryByText(/§164⑤ 토지비율/)).toBeNull();

    // (A) 합계기준시가(토지+건물) 자기일관: Sum_A·Sum_F 표시
    expect(screen.getAllByText(/148,382,411/).length).toBeGreaterThan(0); // Sum_A
    expect(screen.getAllByText(/329,982,000/).length).toBeGreaterThan(0); // Sum_F
    expect(screen.getAllByText(/38,135,580/).length).toBeGreaterThan(0);  // 건물(취득)

    // (B) 환산 분모 = 양도 개별주택가격 P_T (토지+건물 합계 1,270M/1,269M 아님)
    expect(screen.getAllByText(/1,287,000,000/).length).toBeGreaterThan(0); // P_T
    expect(screen.getAllByText(/153,336,855/).length).toBeGreaterThan(0);   // est 취득 개별주택가격

    // 이중계상(토지+개별주택가격 263,583,686) 부재
    expect(screen.queryByText(/263,583,686/)).toBeNull();
    // 하드코딩 "—" 부재
    expect(screen.queryByText(/^—$/)).toBeNull();
  });

  it("A2b: pre1990 인용 = 제164조 제4항 (구 제11항 아님)", () => {
    render(
      <InheritedHouseValuationDetailCard
        detail={{
          ...DETAIL,
          pre1990Result: {
            caseLabel: "CASE-1",
            pricePerSqmAtAcquisition: 598_517,
            standardPriceAtAcquisition: 110_246_831,
            breakdown: {
              formula: "m²당 = 1,100,000 × 77,100 / 141,700 = 598,517",
              gradeValueAtAcquisition: 77_100,
              gradeValue_1990_0830: 185_000,
              gradeValuePrev_1990_0830: 98_400,
              appliedDenominator: 141_700,
              appliedRatio: 0.5441,
            },
            warnings: [],
          } as unknown as InheritanceHouseValuationResult["pre1990Result"],
        }}
      />,
    );
    expect(screen.getByText(/제164조 제4항/)).toBeInTheDocument();
    expect(screen.queryByText(/제164조 제11항/)).toBeNull();
  });
});
