/**
 * LandPayableTaxCalcCard — 교재 사례10(종합합산)·사례11(별도합산) 카드 RTL 테스트.
 * Design: comprehensive-land-payable-calc.ui.design.md §6
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LandPayableTaxCalcCard } from "../../components/calc/results/comprehensive-payable-calc";
import { calculateComprehensiveTax } from "../../lib/tax-engine/comprehensive-tax";
import type {
  ComprehensiveTaxInput,
  LandParcelInput,
} from "../../lib/tax-engine/types/comprehensive.types";

afterEach(cleanup);

const BASE = { assessmentYear: 2022, isOneHouseOwner: false, properties: [] };
const AGG: LandParcelInput[] = [
  { parcelId: "s1", jurisdiction: "서초구", area: 200, shareRatio: 0.5, officialPricePerSqm: 4_300_000, priorOfficialPricePerSqm: 3_200_000 },
  { parcelId: "p1", jurisdiction: "송파구", name: "송파구-1", area: 100, shareRatio: 1, officialPricePerSqm: 3_700_000, priorOfficialPricePerSqm: 3_300_000 },
  { parcelId: "p2", jurisdiction: "송파구", name: "송파구-2", area: 200, shareRatio: 1, officialPricePerSqm: 5_000_000, priorOfficialPricePerSqm: 4_000_000 },
];
const SEP: LandParcelInput[] = [
  { parcelId: "pc1", jurisdiction: "강원 평창군", area: 100_000, shareRatio: 0.5, officialPricePerSqm: 180_000, priorOfficialPricePerSqm: 160_000 },
  { parcelId: "y1", jurisdiction: "경기 용인시", name: "용인-1", area: 100_000, shareRatio: 1, officialPricePerSqm: 140_000, priorOfficialPricePerSqm: 130_000 },
  { parcelId: "y2", jurisdiction: "경기 용인시", name: "용인-2", area: 200_000, shareRatio: 1, officialPricePerSqm: 140_000, priorOfficialPricePerSqm: 130_000 },
];

function aggResult() {
  return calculateComprehensiveTax({ ...BASE, landAggregateParcels: AGG } as ComprehensiveTaxInput).aggregateLandTax!;
}
function sepResult() {
  return calculateComprehensiveTax({ ...BASE, landSeparateParcels: SEP } as ComprehensiveTaxInput).separateLandTax!;
}

describe("LandPayableTaxCalcCard — 사례10 종합합산", () => {
  function renderExpanded() {
    render(<LandPayableTaxCalcCard kind="aggregate" result={aggResult()} assessmentYear={2022} />);
    fireEvent.click(screen.getByRole("button", { name: /종합합산토지분 종합부동산세 납부할세액의 계산/ }));
  }

  it("기본 접힘 → 토글 버튼", () => {
    render(<LandPayableTaxCalcCard kind="aggregate" result={aggResult()} assessmentYear={2022} />);
    expect(screen.getByRole("button", { name: /종합합산토지분/ })).toBeTruthy();
  });

  it("①~⑤ 칸 값 + 농특세 미표기", () => {
    renderExpanded();
    expect(screen.getByTestId("land-agg-payable-step1").textContent).toContain("13,000,000원");
    expect(screen.getByTestId("land-agg-payable-step2").textContent).toContain("4,361,983원");
    expect(screen.getByTestId("land-agg-payable-step2-a").textContent).toContain("5,800,000원");
    expect(screen.getByTestId("land-agg-payable-step3").textContent).toContain("8,638,017원");
    expect(screen.getByTestId("land-agg-payable-step4").textContent).toContain("0원");
    expect(screen.getByTestId("land-agg-payable-step4-na").textContent).toContain("10,604,916원");
    expect(screen.getByTestId("land-agg-payable-step4-da").textContent).toContain("15,907,374원");
    expect(screen.getByTestId("land-agg-payable-step5").textContent).toContain("8,638,017원");
    const card = screen.getByTestId("land-agg-payable-calc");
    expect(card.textContent).not.toContain("농어촌특별세");
    // ②ⓐ ≪지역≫ 블록 — 서초구 Min·송파구 표기
    expect(card.textContent).toContain("≪서초구 토지≫");
    expect(card.textContent).toContain("≪송파구 토지≫");
    expect(card.textContent).toContain("1,305,000원"); // 서초 상한액
    expect(card.textContent).toContain("× 50%(지분율)"); // 서초 지분율
  });

  it("④나② 직전연도 분해 (513,000 패턴 — 종부세상당 6,029,916)", () => {
    renderExpanded();
    expect(screen.getByTestId("land-agg-payable-step4-na-1").textContent).toContain("4,575,000원");
    expect(screen.getByTestId("land-agg-payable-step4-na-2").textContent).toContain("6,029,916원");
  });
});

describe("LandPayableTaxCalcCard — 사례11 별도합산", () => {
  it("①~⑤ 칸 값", () => {
    render(<LandPayableTaxCalcCard kind="separate" result={sepResult()} assessmentYear={2022} />);
    fireEvent.click(screen.getByRole("button", { name: /별도합산토지분/ }));
    expect(screen.getByTestId("land-sep-payable-step1").textContent).toContain("241,000,000원");
    expect(screen.getByTestId("land-sep-payable-step2").textContent).toContain("119,379,661원");
    expect(screen.getByTestId("land-sep-payable-step3").textContent).toContain("121,620,339원");
    expect(screen.getByTestId("land-sep-payable-step4-na").textContent).toContain("228,714,663원");
    expect(screen.getByTestId("land-sep-payable-step4-da").textContent).toContain("343,071,994원");
    expect(screen.getByTestId("land-sep-payable-step5").textContent).toContain("121,620,339원");
  });
});

describe("LandPayableTaxCalcCard — 분기", () => {
  it("집계 직접입력(축약): ②ⓐ ≪지역≫·④나 분해 없음", () => {
    const r = calculateComprehensiveTax({
      ...BASE,
      landAggregate: { totalOfficialValue: 1_800_000_000, propertyTaxBase: 1_260_000_000, propertyTaxAmount: 5_800_000 },
    } as ComprehensiveTaxInput).aggregateLandTax!;
    render(<LandPayableTaxCalcCard kind="aggregate" result={r} assessmentYear={2022} />);
    fireEvent.click(screen.getByRole("button", { name: /종합합산토지분/ }));
    const card = screen.getByTestId("land-agg-payable-calc");
    expect(card.textContent).not.toContain("≪");
    expect(screen.queryByTestId("land-agg-payable-step4-na-1")).toBeNull();
    // 직전연도 미입력 → ④ 생략 문구
    expect(screen.getByTestId("land-agg-payable-step4").textContent).toContain("미입력");
  });

  it("비대상(공시 80억 이하 별도합산): 납세의무 없음 단축", () => {
    const r = calculateComprehensiveTax({
      ...BASE,
      landSeparate: [{ landId: "x", publicPrice: 5_000_000_000, propertyTaxBase: 3_500_000_000, propertyTaxAmount: 10_000_000 }],
    } as ComprehensiveTaxInput).separateLandTax!;
    render(<LandPayableTaxCalcCard kind="separate" result={r} assessmentYear={2022} />);
    fireEvent.click(screen.getByRole("button", { name: /별도합산토지분/ }));
    expect(screen.getByTestId("land-sep-payable-calc").textContent).toContain("납세의무가 없습니다");
    expect(screen.queryByTestId("land-sep-payable-step1")).toBeNull();
  });
});
