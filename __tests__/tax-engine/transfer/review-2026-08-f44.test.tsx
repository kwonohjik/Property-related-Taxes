/**
 * F44 — 다건 「감면세액 합산 재계산」 표의 **「건별 산출세액」 열이 감면세액을 그렸다**.
 *
 * 셀이 `{p.reductionAmount} → {/* standaloneTax 필드는 미노출 *​/}` 였다:
 *   · 옆 「건별 단독감면」 열과 **같은 숫자**가 나란히 떠 감면율(감면 ÷ 산출) 검산이 불가능
 *   · 목적지 없는 화살표가 행마다 남음
 * 주석과 달리 `PerPropertyBreakdown.refCalculatedTax`는 필수 필드로 실재한다
 * (`types/transfer-aggregate.types.ts`).
 *
 * 🔴 결과는 IndexedDB에 저장·복원되므로 옛 저장 결과에는 그 필드가 없을 수 있다 —
 *    그대로 `.toLocaleString()`을 부르면 결과 페이지 전체가 `TypeError`로 죽는다.
 *    아코디언(`PropertyBreakdownAccordion`)이 이미 쓰던 가드를 `resolveRefCalculatedTax`로
 *    단일 소스화해 양쪽이 같은 값을 내도록 했다.
 *
 * 기대값은 엔진(`calculateTransferTaxAggregate`)을 실제로 호출해 관측한 값이다. 세액 불변.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { MultiTransferTaxResultView } from "@/components/calc/results/MultiTransferTaxResultView";
import { resolveRefCalculatedTax } from "@/components/calc/results/MultiTransferPropertyBreakdown";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

afterEach(cleanup);

const farm = (id: string, over: Record<string, unknown>) => ({
  ...baseTransferInput({
    propertyType: "land",
    isOneHousehold: false,
    householdHousingCount: 0,
    ...over,
  }),
  propertyId: id,
  propertyLabel: id,
});

/** 자경농지 감면(조특법 §69) 2건 — §133 종합한도로 합산 재계산이 발동한다. */
function aggregate() {
  return calculateTransferTaxAggregate(
    {
      taxYear: 2023,
      annualBasicDeductionUsed: 0,
      properties: [
        farm("A", {
          transferPrice: 826_000_000,
          acquisitionPrice: 200_000_000,
          acquisitionDate: new Date("1995-05-24"),
          transferDate: new Date("2023-05-01"),
          reductions: [{ type: "self_farming", farmingYears: 30 }],
        }) as never,
        farm("B", {
          transferPrice: 500_000_000,
          acquisitionPrice: 100_000_000,
          acquisitionDate: new Date("2005-02-18"),
          transferDate: new Date("2023-05-01"),
          reductions: [{ type: "self_farming", farmingYears: 15 }],
        }) as never,
      ],
    },
    makeMockRates(),
  );
}

function renderRows(agg: ReturnType<typeof aggregate>) {
  const properties = agg.properties.map((p) => ({
    propertyId: p.propertyId,
    propertyLabel: p.propertyLabel,
  })) as unknown as PropertyItem[];
  const { container } = render(
    <MultiTransferTaxResultView result={agg} properties={properties} taxYear={2023} />,
  );
  const section = container.querySelector('[data-print-id="reduction-recalc"]');
  expect(section, "감면 재계산 섹션이 없다").not.toBeNull();
  return {
    section: section!,
    rows: [...section!.querySelectorAll("tbody tr")].map((tr) =>
      [...tr.querySelectorAll("td")].map((td) => td.textContent?.trim() ?? ""),
    ),
  };
}

describe("F44 — 다건 감면 재계산 표의 「건별 산출세액」", () => {
  it("엔진 관측값 고정 (A: 산출 148,340,000 ≠ 단독감면 100,000,000)", () => {
    const agg = aggregate();
    const a = agg.properties.find((p) => p.propertyId === "A")!;
    const b = agg.properties.find((p) => p.propertyId === "B")!;
    expect(a.refCalculatedTax).toBe(148_340_000);
    expect(a.reductionAmount).toBe(100_000_000);
    expect(a.reductionAggregated).toBe(61_013_645);
    // B는 전액 감면이라 두 값이 우연히 같다 — 결함이 안 보이는 케이스라 A로 판별한다.
    expect(b.refCalculatedTax).toBe(86_460_000);
    expect(b.reductionAmount).toBe(86_460_000);
  });

  it("「건별 산출세액」 열이 refCalculatedTax를 그린다 (종전: 감면세액)", () => {
    const agg = aggregate();
    const { rows } = renderRows(agg);
    // [자산, 건별 산출세액, 건별 단독감면, 감면대상소득, 배분 감면]
    const rowA = rows.find((r) => r[0] === "A")!;
    expect(rowA[1]).toBe("148,340,000");
    expect(rowA[2]).toBe("100,000,000");
    // 두 열이 같은 숫자면 감면율 검산이 불가능하다 — 그것이 종전 동작이었다.
    expect(rowA[1]).not.toBe(rowA[2]);
    expect(rowA[3]).toBe("438,200,000");
    expect(rowA[4]).toBe("61,013,645");
  });

  it("목적지 없는 화살표가 남지 않는다", () => {
    const agg = aggregate();
    const { section } = renderRows(agg);
    expect(section.querySelector("tbody")?.textContent ?? "").not.toContain("→");
  });

  it("옛 저장 결과(refCalculatedTax 누락)에서도 죽지 않고 인라인 재계산한다", () => {
    const stale = {
      isExempt: false,
      taxBaseShare: 100_000_000,
      appliedRate: 0.35,
      surchargeRate: 0,
      progressiveDeduction: 15_440_000,
    } as unknown as PerPropertyBreakdown;
    expect(() => resolveRefCalculatedTax(stale)).not.toThrow();
    expect(resolveRefCalculatedTax(stale)).toBe(19_560_000);
  });

  it("아코디언과 재계산 표가 같은 값을 쓴다 (단일 소스)", () => {
    const agg = aggregate();
    for (const p of agg.properties) {
      expect(resolveRefCalculatedTax(p)).toBe(p.refCalculatedTax);
    }
  });
});
