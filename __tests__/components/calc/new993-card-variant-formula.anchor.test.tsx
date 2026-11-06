/**
 * @vitest-environment jsdom
 *
 * anchor — §99의3 결과 카드의 재개발 변형 표시 (리뷰 NH-66 · NH-68). 표시만 바뀌고 세액은 불변이다.
 *
 * - NH-66: 변형 + 5년 이내는 엔진이 안분하는데 카드 머리말은 「전액 차감」이라 적었다.
 * - NH-68: 카드가 내부 부호 케이스 enum(`all_positive` 등)을 화면에 노출하고, 안분 비율을 「/」 글자로 적었다.
 *
 * 상세명세(`buildIncomeDeductionReducibleFormula`)와 같은 분자·분모·감면액을 카드가 보여야 한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { New993DetailCard } from "@/components/calc/results/transfer/TransferReductionRows";
import { buildIncomeDeductionReducibleFormula } from "@/components/calc/results/transfer/DetailedStatementFormulaBuilders";
import { evaluateNew993 } from "@/lib/tax-engine/transfer-reductions/new-99-3";

afterEach(cleanup);

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

const cardText = (d: ReturnType<typeof evaluateNew993>) =>
  render(<New993DetailCard detail={d} />).container;

describe("§99의3 결과 카드 — 재개발 변형 5년 이내 (NH-66)", () => {
  it("머리말이 「전액 차감」이 아니라 종전주택 기준시가 분모 안분이고, 감면액은 엔진 값 그대로(세액 불변)", () => {
    const d = evaluateNew993(base993);
    expect(d.isWithin5Years).toBe(true);
    // 세액 불변 앵커 — 표시 변경 전후 같은 엔진 값: 양도소득금액 × (350M−200M) ÷ (350M−100M)
    expect(d.reducibleTransferIncome).toBe(Math.floor((353_857_143 * 150_000_000) / 250_000_000));
    const c = cardText(d);
    const t = c.textContent ?? "";
    expect(t).not.toContain("전액 차감");
    expect(t).toContain("5년 이내 양도 — 재개발·재건축 신축주택은 종전주택 취득 당시 기준시가를 분모에 써서 안분");
    expect(t).toContain("1호 단서");
    expect(t).toContain("350,000,000 − 200,000,000 = 150,000,000");
    expect(t).toContain("350,000,000 − 100,000,000 = 250,000,000");
    expect(t).toContain(`감면 양도소득금액 = ${d.reducibleTransferIncome.toLocaleString()}`);
  });

  it("상세명세 산식과 같은 분자·분모·감면액", () => {
    const d = evaluateNew993(base993);
    const stmt = render(<>{buildIncomeDeductionReducibleFormula({ ...d, articleLabel: "§99의3" }, 353_857_143)}</>).container.textContent ?? "";
    const card = cardText(d).textContent ?? "";
    for (const piece of ["150,000,000", "250,000,000", d.reducibleTransferIncome.toLocaleString()]) {
      expect(stmt).toContain(piece);
      expect(card).toContain(piece);
    }
  });

  it("변형이 아닌 5년 이내는 종전과 같이 전액 차감", () => {
    const d = evaluateNew993({ ...base993, isRedevelopedNewHouse: false });
    expect(cardText(d).textContent).toContain("5년 이내 양도 — 양도소득금액 전액 차감");
  });
});

describe("§99의3 결과 카드 — 내부 id·「/」 미노출 (NH-68)", () => {
  it("5년 후 안분: 부호 케이스 enum 없음 · 안분 비율은 분수(Frac)로 표시", () => {
    const d = evaluateNew993({ ...base993, transferDate: new Date("2012-03-01"), standardPriceAtTransfer: 500_000_000 });
    expect(d.isWithin5Years).toBe(false);
    expect(d.signCase).toBe("all_positive");
    const c = cardText(d);
    const t = c.textContent ?? "";
    expect(t).not.toContain("all_positive");
    expect(t).not.toContain("부호 케이스");
    expect(t).toContain("5년 후 양도 — 5년간 발생분 안분 산식");
    // 비율 단계: 「분자 / 분모」 글자가 남지 않고 세로 분수로 렌더된다
    expect(t).not.toMatch(/\d\s\/\s\d/);
    expect(c.querySelector("span.inline-flex.flex-col")).not.toBeNull();
  });
});
