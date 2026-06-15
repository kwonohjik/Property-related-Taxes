/**
 * HousingPayableTaxCalcCard — 교재 p.186~187 "납부할세액의 계산" 카드 RTL 테스트.
 *
 * 사례12 실결과(calculateComprehensiveTax)로 칸별 값 anchor + 전 시나리오 분기.
 * Design: docs/01-plan/features/comprehensive-housing-payable-tax-calc-card.plan.md §7-2
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { HousingPayableTaxCalcCard } from "../../components/calc/results/comprehensive-payable-calc";

afterEach(cleanup);
import { calculateComprehensiveTax } from "../../lib/tax-engine/comprehensive-tax";
import type {
  ComprehensiveTaxInput,
  PreviousYearAutoInput,
} from "../../lib/tax-engine/types/comprehensive.types";

function priorAuto(): PreviousYearAutoInput {
  return {
    assessedValue: 1_400_000_000,
    isOneHouseOwner: true,
    birthDate: new Date("1955-03-01"),
    acquisitionDate: new Date("2012-01-01"),
  };
}
function case12(extra: Partial<ComprehensiveTaxInput> = {}): ComprehensiveTaxInput {
  return {
    assessmentYear: 2022,
    isOneHouseOwner: true,
    birthDate: new Date("1955-03-01"),
    acquisitionDate: new Date("2012-01-01"),
    properties: [{ propertyId: "p1", assessedValue: 1_500_000_000, exclusionType: "none" }],
    previousYearAuto: priorAuto(),
    ...extra,
  };
}

function renderExpanded(input: ComprehensiveTaxInput) {
  const result = calculateComprehensiveTax(input);
  render(<HousingPayableTaxCalcCard result={result} />);
  // 기본 접힘 → 헤더 클릭 펼침
  fireEvent.click(screen.getByRole("button", { name: /종합부동산세 납부할 세액 산출 근거/ }));
  return result;
}

describe("HousingPayableTaxCalcCard — 사례12 칸별 anchor", () => {
  it("기본 접힘 상태 — 토글 버튼 존재", () => {
    const result = calculateComprehensiveTax(case12());
    render(<HousingPayableTaxCalcCard result={result} />);
    expect(
      screen.getByRole("button", { name: /종합부동산세 납부할 세액 산출 근거/ }),
    ).toBeTruthy();
  });

  it("① 재산세공제전 종부세액 1,440,000원 / 과표 2.4억", () => {
    renderExpanded(case12());
    const step1 = screen.getByTestId("payable-step1");
    expect(step1.textContent).toContain("1,440,000원");
    // 과세표준 2.4억 — ① bullet에 표기 (카드 본문 단위로 확인)
    expect(screen.getByTestId("housing-payable-calc").textContent).toContain("2.4억원");
  });

  it("② 공제할 재산세 432,000 / ⓐ 2,070,000 / 6.75억 / ⓑ 432,000 / ⓒ 2,070,000", () => {
    renderExpanded(case12());
    expect(screen.getByTestId("payable-step2").textContent).toContain("432,000원");
    expect(screen.getByTestId("payable-step2-a").textContent).toContain("2,070,000원");
    expect(screen.getByTestId("payable-step2-b").textContent).toContain("432,000원");
    expect(screen.getByTestId("payable-step2-c").textContent).toContain("2,070,000원");
    expect(screen.getByTestId("payable-step2-d").textContent).toContain("432,000원");
    // ②ⓐ 재산세 과표 6.75억 + 세부담상한액 3,549,000
    const body = screen.getByTestId("housing-payable-calc");
    expect(body.textContent).toContain("6.75억원");
    expect(body.textContent).toContain("3,549,000원"); // 직전 재산세 2,730,000 × 130%
    expect(body.textContent).toContain("× 45%"); // 재산세 FMR echo
  });

  it("③ 세액공제 705,600 (고령자 30% + 장기보유 40%)", () => {
    renderExpanded(case12());
    const step3 = screen.getByTestId("payable-step3");
    expect(step3.textContent).toContain("705,600원");
    expect(step3.textContent).toContain("70%");
  });

  it("④ 세부담상한전 302,400 / ⑤ 초과 0 / ⑥ 결정 302,400", () => {
    renderExpanded(case12());
    expect(screen.getByTestId("payable-step4").textContent).toContain("302,400원");
    expect(screen.getByTestId("payable-step5").textContent).toContain("0원");
    expect(screen.getByTestId("payable-step6").textContent).toContain("302,400원");
  });

  it("⑤가 2,372,400 / ⑤나 3,243,000 / ⑤다 4,864,500 + 직전연도 분해 513,000", () => {
    renderExpanded(case12());
    expect(screen.getByTestId("payable-step5-ga").textContent).toContain("2,372,400원");
    expect(screen.getByTestId("payable-step5-na").textContent).toContain("3,243,000원");
    expect(screen.getByTestId("payable-step5-da").textContent).toContain("4,864,500원");
    expect(screen.getByTestId("payable-step5-na-1").textContent).toContain("2,730,000원");
    expect(screen.getByTestId("payable-step5-na-2").textContent).toContain("513,000원");
    // 직전연도 재산세 과표 8.4억 (× 60% echo)
    const body = screen.getByTestId("housing-payable-calc");
    expect(body.textContent).toContain("8.4억원");
  });

  it("⑥에 농특세(60,480) 미표기 — 교재 1~6 범위 외", () => {
    renderExpanded(case12());
    const step6 = screen.getByTestId("payable-step6");
    expect(step6.textContent).not.toContain("60,480");
    // 카드 전체에도 농특세 라벨 없음
    expect(screen.getByTestId("housing-payable-calc").textContent).not.toContain("농어촌특별세");
  });
});

describe("HousingPayableTaxCalcCard — 전 시나리오 분기", () => {
  it("일반(비1주택): ③ 세액공제 '해당 없음'", () => {
    // 일반 9.5억 단일주택(비1주택) — 사례1류
    renderExpanded({
      assessmentYear: 2022,
      isOneHouseOwner: false,
      properties: [{ propertyId: "p1", assessedValue: 2_000_000_000, exclusionType: "none" }],
    });
    expect(screen.getByTestId("payable-step3").textContent).toContain("해당 없음");
  });

  it("법인(특례): ② 단일세율 누진공제 없음 · ⑤ 미적용 · ③ 해당 없음", () => {
    renderExpanded({
      assessmentYear: 2022,
      isOneHouseOwner: false,
      taxpayerType: "corporate_special",
      properties: [{ propertyId: "p1", assessedValue: 2_000_000_000, exclusionType: "none" }],
    });
    expect(screen.getByTestId("payable-step3").textContent).toContain("해당 없음");
    expect(screen.getByTestId("payable-step5").textContent).toMatch(/미적용/);
    // ① 종부세액 산식에 누진공제 미표기
    expect(screen.getByTestId("payable-step1").parentElement?.textContent).not.toContain("누진공제액");
  });

  it("직접입력 모드: ②ⓐ Min 행 없음 · ⑤나 총액만(분해 부재)", () => {
    renderExpanded({
      assessmentYear: 2022,
      isOneHouseOwner: true,
      birthDate: new Date("1955-03-01"),
      acquisitionDate: new Date("2012-01-01"),
      properties: [{ propertyId: "p1", assessedValue: 1_500_000_000, exclusionType: "none" }],
      previousYearTotalTax: 3_243_000,
    });
    const body = screen.getByTestId("housing-payable-calc");
    // 자동모드 전용 직전연도 분해 testid 부재
    expect(screen.queryByTestId("payable-step5-na-1")).toBeNull();
    // ②ⓐ Min 표기 부재
    expect(body.textContent).not.toContain("재산세 세부담 상한액");
  });

  it("M-04(상한액<재산세): ⑤ 초과=2,147,400(별지㉑) · ⑥=0(엔진 클램프)", () => {
    renderExpanded({
      assessmentYear: 2022,
      isOneHouseOwner: true,
      birthDate: new Date("1955-03-01"),
      acquisitionDate: new Date("2012-01-01"),
      properties: [{ propertyId: "p1", assessedValue: 1_500_000_000, exclusionType: "none" }],
      previousYearTotalTax: 150_000, // capAmount 225,000 < 부과재산세 2,070,000
    });
    expect(screen.getByTestId("payable-step5").textContent).toContain("2,147,400원");
    expect(screen.getByTestId("payable-step6").textContent).toContain("0원");
  });

  it("과세표준 0(비대상): '납세의무 없음' 단축", () => {
    const result = calculateComprehensiveTax({
      assessmentYear: 2022,
      isOneHouseOwner: true,
      properties: [{ propertyId: "p1", assessedValue: 1_000_000_000, exclusionType: "none" }],
    });
    render(<HousingPayableTaxCalcCard result={result} />);
    fireEvent.click(screen.getByRole("button", { name: /납부할 세액 산출 근거/ }));
    expect(screen.getByTestId("housing-payable-calc").textContent).toContain("납세의무가 없습니다");
    expect(screen.queryByTestId("payable-step1")).toBeNull();
  });
});
