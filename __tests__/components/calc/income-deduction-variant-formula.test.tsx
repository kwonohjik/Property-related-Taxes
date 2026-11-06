/**
 * @vitest-environment jsdom
 *
 * anchor — 상세명세 「소득금액 감면대상」 산식의 재개발 변형 표시 (리뷰 NH-66 · NH-67).
 *
 * - NH-66: 변형 + 5년 이내는 엔진이 안분하는데(조특령 §99①1호 단서 · §99의3②1호 단서) 화면은 「전액 차감」으로 그렸다.
 * - NH-67: §99의3 변형 5년 후 분모가 종전주택이 아니라 신축 취득시 기준시가로 그려졌다 — §99의3 상세에 종전주택 기준시가 echo가 없었다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { buildIncomeDeductionReducibleFormula } from "@/components/calc/results/transfer/DetailedStatementFormulaBuilders";
import { evaluateNew993 } from "@/lib/tax-engine/transfer-reductions/new-99-3";

afterEach(cleanup);
const text = (node: ReturnType<typeof buildIncomeDeductionReducibleFormula>) =>
  typeof node === "string" ? node : (render(<>{node}</>).container.textContent ?? "");

const base993 = {
  transferDate: new Date("2006-03-01"),
  acquisitionDate: new Date("2002-06-30"),
  usageApprovalDate: new Date("2002-06-30"),
  transferIncome: 353_857_143,
  standardPriceAtAcquisition: 200_000_000,
  standardPriceAt5Years: 300_000_000,
  standardPriceAtTransfer: 350_000_000,
  wholePropertyTransferPrice: 600_000_000,
  exclusiveAreaSqm: 84,
  luxuryFacts: { houseType: "apartment" as const },
  region: "outside_speculation" as const,
  isResident: true,
  isHousingConstructionBusiness: false,
  acquisitionType: "self_built" as const,
  isRedevelopedNewHouse: true,
  previousHouseStdPriceAtAcquisition: 100_000_000,
  calculatedTaxBeforeReduction: 0,
  calculatedTaxAfterReduction: 0,
};

describe("재개발 변형 산식 표시", () => {
  it("NH-66 — 5년 이내 변형: 「전액 차감」이 아니라 (양도시 − 취득시) ÷ (양도시 − 종전주택 취득시) 안분", () => {
    const d = evaluateNew993(base993);
    expect(d.isWithin5Years).toBe(true);
    expect(d.previousHouseStdPriceApplied).toBe(100_000_000);
    const t = text(buildIncomeDeductionReducibleFormula({ ...d, articleLabel: "§99의3" }, 353_857_143));
    expect(t).not.toContain("전액 차감");
    expect(t).toContain("양도시 기준시가 350,000,000 − 취득시 200,000,000 = 150,000,000");
    expect(t).toContain("종전주택 취득시 100,000,000 = 250,000,000");
    expect(t).toContain(d.reducibleTransferIncome.toLocaleString());
  });
  it("NH-67 — §99의3 5년 후 변형: 분모가 종전주택 취득시 기준시가", () => {
    const d = evaluateNew993({ ...base993, transferDate: new Date("2012-03-01"), standardPriceAtTransfer: 500_000_000 });
    expect(d.isWithin5Years).toBe(false);
    const t = text(buildIncomeDeductionReducibleFormula({ ...d, articleLabel: "§99의3" }, 353_857_143));
    expect(t).toContain("5년시점 기준시가 300,000,000 − 취득시 200,000,000");
    expect(t).toContain("양도시 기준시가 500,000,000 − 종전주택 취득시 100,000,000 = 400,000,000");
  });
  it("변형이 아닌 5년 이내는 종전과 같이 전액 차감", () => {
    const d = evaluateNew993({ ...base993, isRedevelopedNewHouse: false });
    expect(text(buildIncomeDeductionReducibleFormula({ ...d, articleLabel: "§99의3" }, 353_857_143))).toContain("전액 차감");
  });
});
