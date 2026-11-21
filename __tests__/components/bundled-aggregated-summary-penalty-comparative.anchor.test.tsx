/**
 * 일괄 「합산 과세 내역」(`AggregatedTaxSummary`) — 결과뷰 리뷰 2026-11-21 R-c01-01 · R-c01-02.
 *
 * R-c01-01: 엔진 `totalTax`에는 농어촌특별세 납부지연가산세(`ruralSurtaxDelayedPenalty`)와
 *   지방소득세 가산세(`localIncomePenalty`, 지방세기본법 §53~§55)가 들어 있다
 *   (`transfer-tax-aggregate-once.ts` totalTax 식). 카드가 두 행을 그리지 않으면 행 합이 총납부세액과
 *   그 두 가산세만큼 어긋난다. 형제 `MultiTransferTaxSummaryCard`는 두 행과 고지를 그린다.
 *
 * R-c01-02: §104⑤ 비교과세에서 전체 누진(방법 A)이 채택되면(`comparedTaxApplied === "general"`)
 *   세율군별 세율 행(방법 B의 근거)은 산출세액의 근거가 아니다. 군별 세율로 검산하면
 *   방법 B 385,410,000이 나와 표시된 산출세액 391,935,000과 6,525,000 어긋난다.
 *
 * 세율표는 mock(`makeMockRates`) — 정본 세액이 아니다.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { AggregatedTaxSummary } from "@/components/calc/results/BundledAllocationSubCards";

afterEach(cleanup);

const D = (s: string) => new Date(s);
const rates = makeMockRates();

/** 무신고(20%) — determinedTax는 aggregate가 주입한다(route가 보내는 형태). */
const FILING = {
  determinedTax: 0, reductionAmount: 0, priorPaidTax: 0, originalFiledTax: 0, excessRefundAmount: 0,
  interestSurcharge: 0, filingType: "none" as const, penaltyReason: "normal" as const,
};
const LATE = { unpaidTax: 0, unpaidTaxMode: "manual" as const, paymentDeadline: D("2024-05-31"), actualPaymentDate: D("2024-12-31") };
const EXPROPRIATION = [{ type: "public_expropriation", cashCompensation: 1_000_000_000, bondCompensation: 0, businessApprovalDate: D("2023-01-01") }];

function penaltyFixture(withPenalty: boolean) {
  const common = {
    isOneHousehold: false, householdHousingCount: 2, propertyType: "land" as const,
    transferDate: D("2024-03-01"), acquisitionDate: D("2010-01-15"), transferPrice: 1_000_000_000,
  };
  return calculateTransferTaxAggregate(
    {
      taxYear: 2024,
      properties: [
        { ...baseTransferInput({ ...common, reductions: EXPROPRIATION as never }), propertyId: "primary", propertyLabel: "주 자산" },
        { ...baseTransferInput(common), propertyId: "c1", propertyLabel: "함께 양도" },
      ] as TransferTaxItemInput[],
      annualBasicDeductionUsed: 0,
      ...(withPenalty ? { filingPenaltyDetails: { ...FILING }, delayedPaymentDetails: LATE as never } : {}),
    },
    rates,
  );
}

const land = (id: string, tp: number, ap: number, acq: string): TransferTaxItemInput =>
  ({
    ...baseTransferInput({
      isOneHousehold: false, householdHousingCount: 0, propertyType: "land",
      transferDate: D("2024-06-01"), acquisitionDate: D(acq), transferPrice: tp, acquisitionPrice: ap,
    }),
    propertyId: id, propertyLabel: id,
  }) as TransferTaxItemInput;

const aggregateOf = (props: TransferTaxItemInput[]) =>
  calculateTransferTaxAggregate({ taxYear: 2024, properties: props, annualBasicDeductionUsed: 0 }, rates);

function parseAmount(raw: string): number | null {
  if (!/^[△+-]?\s?[\d,]+$/.test(raw)) return null;
  const n = Number(raw.replace(/[△+,\s-]/g, ""));
  return raw.startsWith("△") || raw.startsWith("-") ? -n : n;
}

function summary(aggregated: ReturnType<typeof aggregateOf>) {
  const { container } = render(<AggregatedTaxSummary aggregated={aggregated} />);
  const cells = new Map<string, number>();
  const rowTexts: string[] = [];
  for (const tr of container.querySelectorAll("tr")) {
    rowTexts.push(tr.textContent ?? "");
    const tds = [...tr.querySelectorAll("td")];
    if (tds.length < 2) continue;
    const n = parseAmount(tds[1].textContent?.trim() ?? "");
    if (n !== null) cells.set(tds[0].textContent?.trim() ?? "", n);
  }
  return { container, cells, rowTexts, text: container.textContent ?? "" };
}

/** 라벨로 금액 하나 — 없거나 둘 이상 걸리면 실패한다(`?? 0` 폴백은 「행 없음」을 삼킨다). */
function get(m: Map<string, number>, label: string): number {
  const hits = [...m.entries()].filter(([k]) => k.startsWith(label));
  expect(hits.length, `행 「${label}」 ${hits.length}개 (라벨: ${[...m.keys()].join(" · ")})`).toBe(1);
  return hits[0][1];
}

describe("R-c01-01 — 가산세가 있는 일괄 합산 과세 내역: 행 합 = 총납부세액", () => {
  it("격자: 엔진 totalTax에 농특세 납부지연가산세 181,580 · 지방소득세 가산세 7,343,203이 들어 있다", () => {
    const a = penaltyFixture(true);
    expect([a.determinedTax, a.penaltyTax, a.localIncomeTax, a.ruralSurtax]).toEqual([367_160_198, 73_432_039, 36_716_019, 3_874_960]);
    expect(a.ruralSurtaxDelayedPenalty).toBe(181_580);
    expect(a.localIncomePenalty).toBe(7_343_203);
    expect(a.totalTax).toBe(488_707_999);
  });

  it("🔑 두 가산세 행을 그리고, 국세 + 지방세 + 농특세 + 두 가산세 = 총납부세액", () => {
    const a = penaltyFixture(true);
    const { cells } = summary(a);
    expect(get(cells, "농어촌특별세 납부지연가산세")).toBe(181_580);
    expect(get(cells, "지방소득세 가산세")).toBe(7_343_203);
    const sum =
      get(cells, "국세 납부세액") +
      get(cells, "지방세 납부세액") +
      get(cells, "농어촌특별세 (") +
      get(cells, "농어촌특별세 납부지연가산세") +
      get(cells, "지방소득세 가산세");
    expect(sum).toBe(get(cells, "총납부세액"));
    expect(get(cells, "총납부세액")).toBe(a.totalTax);
  });

  it("지방소득세 가산세 행에 「포함됨 + 가정·확인 필요」 고지가 함께 붙는다(형제 다건 카드와 같은 leaf)", () => {
    const { container } = summary(penaltyFixture(true));
    expect(container.querySelector('[data-testid="local-income-penalty-notice"]')).not.toBeNull();
  });

  it("대조군 — 가산세가 없으면 두 행도 고지도 없다", () => {
    const a = penaltyFixture(false);
    expect(a.ruralSurtaxDelayedPenalty ?? 0).toBe(0);
    expect(a.localIncomePenalty ?? 0).toBe(0);
    const { cells, container } = summary(a);
    expect([...cells.keys()].some((k) => k.startsWith("농어촌특별세 납부지연가산세") || k.startsWith("지방소득세 가산세"))).toBe(false);
    expect(container.querySelector('[data-testid="local-income-penalty-notice"]')).toBeNull();
    expect(get(cells, "국세 납부세액") + get(cells, "지방세 납부세액") + get(cells, "농어촌특별세 (")).toBe(get(cells, "총납부세액"));
  });
});

describe("R-c01-02 — §104⑤ 전체 누진(방법 A) 채택 시 세율군별 세율을 산출세액 근거로 보이지 않는다", () => {
  // 장기 보유 토지(일반 누진) + 보유 1.5년 토지(단기 40%)
  const general = () =>
    aggregateOf([land("A", 1_500_000_000, 500_000_000, "2010-01-01"), land("B", 800_000_000, 500_000_000, "2022-12-01")]);

  it("격자: 방법 A 391,935,000 > 방법 B 385,410,000 → general 채택 · 세율군 2개", () => {
    const a = general();
    expect([a.comparedTaxApplied, a.calculatedTaxByGeneral, a.calculatedTaxByGroups, a.calculatedTax]).toEqual([
      "general", 391_935_000, 385_410_000, 391_935_000,
    ]);
    expect(a.groupTaxes).toHaveLength(2);
    // 군별 세율로 검산하면 방법 B다 — 산출세액과 6,525,000 어긋난다
    const [p, s] = a.groupTaxes;
    expect(Math.floor(p.groupTaxBase * p.appliedRate) - p.progressiveDeduction + s.groupCalculatedTax).toBe(385_410_000);
  });

  it("🔑 「세율군별 복합」과 군별 세율 행 대신 전체 누진세율 채택과 방법 A·B 두 금액을 적는다", () => {
    const { cells, rowTexts, text } = summary(general());
    expect(text).not.toContain("세율군별 복합");
    expect(rowTexts.some((r) => r.startsWith("· 일반 누진 (과표"))).toBe(false);
    expect(rowTexts.some((r) => r.startsWith("· 단기보유 (과표"))).toBe(false);
    expect(rowTexts.find((r) => r.startsWith("세율"))).toContain("전체 누진세율");
    expect(get(cells, "· 방법 A")).toBe(391_935_000);
    expect(get(cells, "· 방법 B")).toBe(385_410_000);
    expect(get(cells, "산출세액")).toBe(391_935_000);
    expect(text).toContain("두 금액 중 큰 금액인 전체 누진세율 391,935,000을(를) 산출세액으로 결정했습니다");
  });

  it("대조군 — 세율군별(방법 B)이 채택되면 종전대로 군별 세율 행을 그린다", () => {
    const a = aggregateOf([land("A", 400_000_000, 300_000_000, "2010-01-01"), land("B", 400_000_000, 300_000_000, "2022-12-01")]);
    expect(a.comparedTaxApplied).toBe("groups");
    const { rowTexts, text } = summary(a);
    expect(text).toContain("세율군별 복합");
    expect(rowTexts.some((r) => r.startsWith("· 일반 누진 (과표 72,000,000)"))).toBe(true);
    expect(text).not.toContain("전체 누진세율");
  });
});
