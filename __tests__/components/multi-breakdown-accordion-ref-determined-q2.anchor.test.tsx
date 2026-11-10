/**
 * 다건 건별 아코디언 — «감면세액»·«결정세액 (참고)»가 배분 감면(reductionAggregated)으로 그려진다.
 * 계획서 docs/00-pm/multi-per-asset-reduction-display.plan.md (Q-1 a · Q-2 a).
 *
 * 종전에는 감면 행·산식이 건별 단독 감면(reductionAmount — 기본공제 전 소득 기준)이었고 값은 `refDeterminedTax`(같은 기준)였다.
 * Q-1 a로 `refDeterminedTax`가 배분 기준이 되면서 아코디언만 단독값을 그리면 «산출세액 − 감면 ≠ 결정세액»이 새로 생긴다.
 * 시료: F44와 같은 자경농지 §69 2건(§133 종합한도로 합산 재계산 발동) — A는 단독 100,000,000 ≠ 배분 61,013,645라 두 기준이 갈린다.
 * 건별 단독감면 열(표)은 의도된 설계(`MultiTransferTaxResultView.tsx` 재계산 표)라 이 파일이 건드리지 않는다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { PropertyBreakdownAccordion } from "@/components/calc/results/MultiTransferPropertyBreakdown";
import { buildDeterminedTaxFormula } from "@/components/calc/results/transfer/DetailedStatementFormulaBuilders";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);

const farm = (id: string, over: Record<string, unknown>) => ({
  ...baseTransferInput({ propertyType: "land", isOneHousehold: false, householdHousingCount: 0, ...over }),
  propertyId: id,
  propertyLabel: id,
});

function aggregate() {
  return calculateTransferTaxAggregate(
    {
      taxYear: 2023,
      annualBasicDeductionUsed: 0,
      properties: [
        farm("A", {
          transferPrice: 826_000_000, acquisitionPrice: 200_000_000,
          acquisitionDate: new Date("1995-05-24"), transferDate: new Date("2023-05-01"),
          reductions: [{ type: "self_farming", farmingYears: 30 }],
        }) as never,
        farm("B", {
          transferPrice: 500_000_000, acquisitionPrice: 100_000_000,
          acquisitionDate: new Date("2005-02-18"), transferDate: new Date("2023-05-01"),
          reductions: [{ type: "self_farming", farmingYears: 15 }],
        }) as never,
      ],
    },
    makeMockRates(),
  );
}

/** 라벨 문단이 속한 DetailRow 한 줄의 텍스트 */
function rowText(container: HTMLElement, label: string): string {
  const p = [...container.querySelectorAll("p")].find((el) => el.textContent?.trim() === label);
  expect(p, `「${label}」 행이 없다`).toBeTruthy();
  return p!.closest("div.flex")?.textContent ?? "";
}

describe("건별 refDeterminedTax = 산출세액(참고) − 배분 감면", () => {
  it("엔진 관측값 (A: 산출 148,340,000 · 단독 100,000,000 · 배분 61,013,645)", () => {
    const a = aggregate().properties.find((p) => p.propertyId === "A")!;
    expect(a.refCalculatedTax).toBe(148_340_000);
    expect(a.reductionAmount).toBe(100_000_000);
    expect(a.reductionAggregated).toBe(61_013_645);
    expect(a.refDeterminedTax).toBe(87_326_355); // 종전 48,340,000(= 148,340,000 − 단독)
  });

  it("상세명세서 산식이 등식이다", () => {
    const a = aggregate().properties.find((p) => p.propertyId === "A")!;
    expect(buildDeterminedTaxFormula(a)).toBe("148,340,000 - 61,013,645 = 87,326,355");
  });
});

describe("아코디언 — 감면 행·결정세액(참고) 산식이 배분 감면이다 (Q-2 a)", () => {
  it("A", () => {
    const a = aggregate().properties.find((p) => p.propertyId === "A")!;
    const { container } = render(<PropertyBreakdownAccordion breakdown={a} />);
    const reduction = rowText(container, "감면세액");
    expect(reduction).toContain("-61,013,645");
    // 산식 문구는 단건 엔진 단계의 단독값을 담으므로 «배분»을 덧붙여 값과 어긋나 보이지 않게 한다
    expect(reduction).toContain("자경농지 (§69) 감면 100,000,000 → 합산 재계산 후 배분 61,013,645");
    const determined = rowText(container, "결정세액 (참고)");
    expect(determined).toContain("산출세액 148,340,000 - 감면 61,013,645");
    expect(determined).toContain("87,326,355");
  });

  it("옛 이력(refDeterminedTax 없음)의 대체 계산도 같은 규칙이다", () => {
    const a = aggregate().properties.find((p) => p.propertyId === "A")!;
    const stale = { ...a } as Record<string, unknown>;
    delete stale.refDeterminedTax;
    const { container } = render(
      <PropertyBreakdownAccordion breakdown={stale as unknown as typeof a} />,
    );
    const determined = rowText(container, "결정세액 (참고)");
    expect(determined).toContain("87,326,355");
  });
});
