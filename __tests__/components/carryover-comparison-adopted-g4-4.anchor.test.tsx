/**
 * G4-4 — 비교 없이 B를 채택한 이월과세(「소득세법」 제97조의2제2항제2호·제1항 본문·제3항)는 ②3호의 세액 비교와
 * 독립된 배제 사유다. 카드가 「신고세액 = 시나리오 A·B 중 큰 금액」·「✓ 채택 (더 큰 세액)」을 적으면 결정세액과 다른 금액을
 * 거짓 근거로 보이게 한다.
 *
 * detail은 **실제 엔진**(`calculateTransferTax`)이 낸 값이다 — 손으로 만든 detail은 빈 시나리오와 계산된 시나리오를 구별하지 못한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CarryoverComparisonCard } from "@/components/calc/results/transfer/CarryoverComparisonCard";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

afterEach(cleanup);
const rates = makeMockRates();
const fmt = (n: number) => n.toLocaleString("ko-KR");

function run(carryoverOver: Record<string, unknown> = {}, over: Record<string, unknown> = {}) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "housing",
      transferPrice: 1_500_000_000,
      transferDate: new Date("2026-02-16"),
      acquisitionPrice: 0,
      acquisitionDate: new Date("2025-06-01"),
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 0,
      isRegulatedArea: false,
      acquisitionCause: "carryover_gift",
      carryoverTaxation: {
        giftRegistryDate: new Date("2025-06-01"),
        donorAcquisitionDate: new Date("2000-06-01"),
        donorAcquisitionPrice: 10_000_000,
        useEstimatedAcquisition: false,
        giftTaxAmount: 0,
        giftDateValuation: 1_500_000_000,
        ...carryoverOver,
      },
      ...over,
    } as Partial<TransferTaxInput>),
    rates,
  );
}

function summaryOf(): string {
  return screen.getByText(/채택 시나리오:/).parentElement!.textContent!;
}

describe("G4-4 이월과세 비교 카드 — 채택 사유별 요약·배지", () => {
  it("②2호 자동 배제(A가 비싼 채로 비과세): 신고세액 = 시나리오 B 결정세액, 「더 큰 세액」 없음", () => {
    const r = run();
    const d = r.carryoverTaxationDetail!;
    // 전제: 비교(②3호)가 아니라 ②2호이고 A가 B보다 비싸다 — 종전 카드는 max(A,B)=A를 신고세액으로 적었다.
    expect(d.exclusionReason).toBe("one_house_exemption");
    expect(d.scenarioA.determinedTax).toBeGreaterThan(0);
    expect(d.scenarioB.determinedTax).toBe(0);
    expect(r.determinedTax).toBe(0);

    const { container } = render(<CarryoverComparisonCard detail={d} />);
    const tax = screen.getByTestId("carryover-filing-tax").textContent!;
    expect(tax).toBe("신고세액 = 시나리오 B(이월과세 미적용) 결정세액 = 0");
    expect(tax).not.toContain(fmt(d.scenarioA.determinedTax));
    expect(summaryOf()).not.toContain("큰 금액");
    expect(container.textContent).not.toContain("더 큰 세액");
    expect(container.textContent).toContain("✓ 채택");
  });

  it("기간 초과(빈 시나리오로 끝난 배제): 비교 컬럼·0원 신고세액을 그리지 않는다", () => {
    const r = run({ giftRegistryDate: new Date("2012-06-01") }, { acquisitionDate: new Date("2012-06-01") });
    const d = r.carryoverTaxationDetail!;
    expect(d.exclusionReason).toBe("period_exceeded");
    const { container } = render(<CarryoverComparisonCard detail={d} />);
    expect(screen.queryByTestId("carryover-filing-tax")).toBeNull();
    expect(container.textContent).not.toContain("[A] 이월과세 적용");
    expect(container.textContent).not.toContain("더 큰 세액");
    expect(summaryOf()).not.toContain("큰 금액");
    // 사유 문구: ③ 단독이 아니라 ① 본문·③
    expect(container.textContent).toContain("§97조의2 ① 본문·③ — 적용기간 초과");
  });

  it("긍정 짝 — ②3호 비교가 수행된 경우: 신고세액 = A·B 중 큰 금액 = 엔진 채택값, 배지 「더 큰 세액」 유지", () => {
    // B도 1세대1주택(증여 2023-06-01)이라 ②2호가 발동하지 않고 ②3호 비교로 간다.
    const r = run({ giftRegistryDate: new Date("2023-06-01") }, { acquisitionDate: new Date("2023-06-01") });
    const d = r.carryoverTaxationDetail!;
    expect(d.exclusionReason === undefined || d.exclusionReason === "tax_comparison").toBe(true);
    const adopted = d.adoptedScenario === "A" ? d.scenarioA.determinedTax : d.scenarioB.determinedTax;
    expect(adopted).toBe(Math.max(d.scenarioA.determinedTax, d.scenarioB.determinedTax));

    const { container } = render(<CarryoverComparisonCard detail={d} />);
    expect(screen.getByTestId("carryover-filing-tax").textContent).toBe(
      `신고세액 = 시나리오 A·B 중 큰 금액 = ${fmt(adopted)}`,
    );
    expect(container.textContent).toContain("✓ 채택 (더 큰 세액)");
  });
});
