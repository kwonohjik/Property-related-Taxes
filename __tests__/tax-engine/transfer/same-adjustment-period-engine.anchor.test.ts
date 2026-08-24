/**
 * anchor — STEP 0.47 배선 (동일조정기간 양도당시 기준시가 환산이 **엔진에 도달**하는가)
 *
 * leaf anchor(`same-adjustment-period-std-price.anchor.test.ts`)는 산식만 본다.
 * 이 파일은 `calculateTransferTax` 진입점에서 `standardPriceAtTransfer`가 실제로 치환되어
 * **환산취득가액 → 양도차익 → 세액**까지 흐르는지를 고정한다.
 *
 * 🔑 각 케이스는 **구별력**을 함께 단언한다 — 신규 입력을 빼면 값이 달라져야 한다.
 *    달라지지 않으면 「배선했다」가 아니라 「아무 데도 안 닿았다」는 뜻이다.
 *
 * 계획: docs/00-pm/transfer-same-adjustment-period-std-price.plan.md §5-2
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateEstimatedAcquisitionPrice } from "@/lib/tax-engine/tax-utils";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

/** 교재 사례1 — 공동주택. §164③ 결과 취득·양도 기준시가가 동일(161,000,000)한 상태 */
const STD = 161_000_000;
const PRIOR = 149_000_000;
const SALE = 1_000_000_000;

function caseOne(overrides?: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    transferPrice: SALE,
    acquisitionPrice: 0,
    useEstimatedAcquisition: true,
    acquisitionDate: new Date("2005-07-28"),
    transferDate: new Date("2006-03-24"),
    standardPriceAtAcquisition: STD,
    standardPriceAtTransfer: STD, // §164⑧ 트리거 — 두 시점 기준시가 동일
    ...overrides,
  });
}

const SAP_PREV = {
  formula: "prev" as const,
  priorStandardPrice: PRIOR,
  adjustmentMonths: 12,
};

describe("STEP 0.47 — §164⑧ 엔진 배선", () => {
  it("미제공이면 no-op — §164⑧ 없이는 환산 분자=분모라 양도차익이 0이 된다", () => {
    const r = calculateTransferTax(caseOne(), rates);
    // 🔑 이 조문이 존재하는 이유가 여기 보인다 — 취득·양도 기준시가가 같으면
    //    환산취득가액 = 양도가액 × (161,000,000 ÷ 161,000,000) = 양도가액 → 차익 0.
    expect(r.transferGain).toBe(0);
    expect(r.totalTax).toBe(0);
    expect(r.steps.find((s) => s.label.includes("동일조정기간"))).toBeUndefined();
  });

  it("★ A-1e 가목 적용 — 양도당시 기준시가 169,000,000으로 치환되어 환산취득가액이 내려간다", () => {
    const r = calculateTransferTax(caseOne({ sameAdjustmentPeriod: SAP_PREV }), rates);
    // 보유월수 8(§80⑤) / 조정월수 12 → 161,000,000 + 12,000,000 × 8/12 = 169,000,000
    expect(r.estimatedStdPriceAtTransfer).toBe(169_000_000);
    expect(r.estimatedBase).toBe(calculateEstimatedAcquisitionPrice(SALE, STD, 169_000_000));
    // 구별력 — 미적용 대비 환산취득가액이 실제로 줄어야 한다
    expect(r.estimatedBase!).toBeLessThan(SALE);
  });

  it("★ A-7 구별력 — 신규 입력이 세액을 움직인다", () => {
    const off = calculateTransferTax(caseOne(), rates);
    const on = calculateTransferTax(caseOne({ sameAdjustmentPeriod: SAP_PREV }), rates);
    expect(on.transferGain).toBeGreaterThan(off.transferGain);
    expect(on.totalTax).toBeGreaterThan(off.totalTax);
  });

  it("산출근거 step이 남는다 (§80①1호가목)", () => {
    const r = calculateTransferTax(caseOne({ sameAdjustmentPeriod: SAP_PREV }), rates);
    const step = r.steps.find((s) => s.label.includes("동일조정기간"));
    expect(step).toBeDefined();
    expect(step!.amount).toBe(169_000_000);
    expect(step!.legalBasis).toContain("§164 ⑧");
    expect(step!.formula).toContain("보유월수 8");
  });

  it("A-2e 나목 적용 — 새 기준시가 대비 환산", () => {
    // 취득 2005-09-07 → 양도 2006-06-10 = 보유월수 10 · 새 220,000,000
    // 210,000,000 + 10,000,000 × 10/12 = 218,333,333
    const r = calculateTransferTax(
      caseOne({
        acquisitionDate: new Date("2005-09-07"),
        transferDate: new Date("2006-06-10"),
        standardPriceAtAcquisition: 210_000_000,
        standardPriceAtTransfer: 210_000_000,
        sameAdjustmentPeriod: {
          formula: "new",
          newStandardPrice: 220_000_000,
          adjustmentMonths: 12,
        },
      }),
      rates,
    );
    expect(r.estimatedStdPriceAtTransfer).toBe(218_333_333);
    expect(r.estimatedBase).toBe(
      calculateEstimatedAcquisitionPrice(SALE, 210_000_000, 218_333_333),
    );
  });

  it("A-5 트리거 미성립(두 기준시가 상이) — 입력값 무변경", () => {
    const r = calculateTransferTax(
      caseOne({ standardPriceAtTransfer: 200_000_000, sameAdjustmentPeriod: SAP_PREV }),
      rates,
    );
    expect(r.estimatedStdPriceAtTransfer).toBe(200_000_000); // 입력값 그대로
    expect(r.estimatedBase).toBe(calculateEstimatedAcquisitionPrice(SALE, STD, 200_000_000));
    expect(r.steps.find((s) => s.label.includes("동일조정기간"))).toBeUndefined();
  });

  it("A-4 기간요건 미충족 → §80①2호 · 값 불변 + 안내 step만", () => {
    const r = calculateTransferTax(
      caseOne({
        acquisitionDate: new Date("2005-03-01"),
        transferDate: new Date("2007-06-01"),
        sameAdjustmentPeriod: SAP_PREV,
      }),
      rates,
    );
    expect(r.transferGain).toBe(0); // 취득당시 기준시가 그대로 → 분자=분모 → 차익 0
    const step = r.steps.find((s) => s.label.includes("환산 미적용"));
    expect(step).toBeDefined();
    expect(step!.legalBasis).toContain("§80 ① 2호");
  });

  it("A-3e 하락장 하한 — 전기 > 취득당시면 취득당시 유지(값 불변)", () => {
    const r = calculateTransferTax(
      caseOne({ sameAdjustmentPeriod: { formula: "prev", priorStandardPrice: 170_000_000 } }),
      rates,
    );
    expect(r.transferGain).toBe(0); // 하한으로 취득당시 유지 → 분자=분모 → 차익 0
    const step = r.steps.find((s) => s.label.includes("동일조정기간"));
    expect(step!.amount).toBe(STD);
    expect(step!.formula).toContain("§80①1호 단서");
  });

  it("상대 기준시가 미제공이면 산정 불가 → no-op (조용히 틀린 값을 만들지 않는다)", () => {
    const r = calculateTransferTax(
      caseOne({ sameAdjustmentPeriod: { formula: "prev" } }),
      rates,
    );
    expect(r.transferGain).toBe(0);
    expect(r.steps.find((s) => s.label.includes("동일조정기간"))).toBeUndefined();
  });
});
