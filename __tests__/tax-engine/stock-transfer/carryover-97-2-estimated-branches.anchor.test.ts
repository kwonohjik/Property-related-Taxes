/**
 * anchor: 주식 이월과세 §97의2① × **환산 5분기** (계획서 §3.3 P-3 · Phase 3)
 *
 * 계획서: docs/02-design/features/stock-carryover-97-2-necessary-expense.plan.md
 *
 * §97의2①1호는 「증여자가 취득할 당시의 **§97①1호에 따른 금액**」이고, 그 나목은
 * **환산취득가액**이다. 환산의 분자는 「취득 당시 기준시가」이므로 이월과세면
 * **증여자 취득 당시**의 것이어야 한다. 분모(양도측)는 이월과세와 무관하다.
 *
 * 엔진의 환산 경로는 **5분기**이고 취득측 산정이 각각 다르다. 그래서 오버라이드
 * (`acquisitionStdPriceOverridePerShare`)를 **취득측 1주당 값이 확정되는 지점마다** 건다:
 *
 * | # | 분기 | 진입 조건 | 오버라이드 지점 |
 * |---|---|---|---|
 * | 1 | 상장 1개월 종가평균 | (기본) | `acquisitionDatePriceAvg1Month` **입력 치환** |
 * | 2 | 취득 후 상장 | `acquiredBeforeListing` | `stock-transfer-tax.ts` `acqStdPerShare` |
 * | 3 | 비상장 보충평가 | `marketType: "unlisted"` | `stock-valuation-unlisted.ts` 2곳 |
 * | 4 | 거래정지(양도) | `tradingHaltAtTransfer` | 〃 (같은 함수) |
 * | 5 | 취득일 거래정지 | `tradingHaltAtAcquisition` | `stock-transfer-tax.ts` `acqSide.perShare` |
 *
 * 관측 지점은 **`estimatedBase`(= 취득기준시가 총액)** 다 — 오버라이드가 먹으면
 * `증여자 1주당 기준시가 × 주식수`가 된다. 개산공제(영 §163⑥4호 1%)도 그 위에서 나온다.
 *
 * ⚠️ **②3호가 앞서 개입한다** — A가 배제되면 오버라이드는 관측되지 않는다. 그래서 각
 *    케이스는 증여자 기준시가를 수증자보다 **낮게** 두어 A가 채택되게 한다(취득가액↓ ⇒ 세액↑).
 *    각 케이스에 **B 대조군**을 붙여 「오버라이드가 실제로 값을 바꿨다」를 증명한다.
 *
 * 1분기(상장)는 `carryover-97-2-necessary-expense.anchor` N-5·N-6이 담당한다.
 */
import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { D, carryover, SHARE_COUNT } from "./carryover-97-2-fixtures";

/** 증여자 취득 당시 1주당 기준시가 — 수증자 취득 당시보다 낮게 두어 A가 채택되게 한다. */
const DONOR_STD = 10_000;
const DONOR_STD_TOTAL = DONOR_STD * SHARE_COUNT; // 100,000,000

/** 이월과세 환산 픽스처 — 실가 승계는 쓰지 않는다(나목 경로). */
function estimated(o: Partial<StockTransferInput>): StockTransferInput {
  return carryover({
    acquisitionMode: "estimated",
    donorAcquisitionPrice: undefined,
    donorAcquisitionStdPrice: DONOR_STD,
    ...o,
  });
}

/** 같은 픽스처의 **미적용(B) 대조군** — 승계 입력을 걷어낸 단순 취득 */
function control(o: Partial<StockTransferInput>): StockTransferInput {
  return carryover({
    acquisitionMode: "estimated",
    acquisitionCause: "purchase",
    donorAcquisitionPrice: undefined,
    donorAcquisitionStdPrice: undefined,
    donorAcquisitionDate: undefined,
    ...o,
  });
}

describe("2분기 — 취득 후 상장 (§165⑤ × 영 §176의2②1호)", () => {
  const branch = {
    acquiredBeforeListing: true,
    listingDate: D("2020-06-01"),
    listingDatePriceAvg1Month: 60_000,
    listingYearNetIncomePerShare: 30_000,
    listingYearNetAssetPerShare: 40_000,
    acquisitionYearNetIncomePerShare: 25_000,
    acquisitionYearNetAssetPerShare: 35_000,
    transferDatePriceAvg1Month: 100_000,
  } as Partial<StockTransferInput>;

  it("E-2 증여자 취득 당시 기준시가가 분자가 된다", () => {
    const r = calculateStockTransferTax(estimated(branch));
    expect(r.estimatedBase).toBe(DONOR_STD_TOTAL);
    expect(r.estimatedDeduction).toBe(DONOR_STD_TOTAL / 100); // §163⑥4호 1%
    // 환산취득가 = 양도가 10억 × 10,000 / 100,000
    expect(r.acquisitionPrice).toBe(100_000_000);
  });

  it("E-2 대조군 — 승계가 없으면 §165⑤ 산정값이 그대로 쓰인다", () => {
    const r = calculateStockTransferTax(control(branch));
    // `not.toBe`만으로는 **분기 미도달(0)** 도 통과한다 — 양수까지 단언해 도달을 증명한다.
    expect(r.estimatedBase).toBeGreaterThan(0);
    expect(r.estimatedBase).not.toBe(DONOR_STD_TOTAL);
  });
});

describe("3분기 — 비상장 보충평가 (§165④1)", () => {
  const branch = {
    marketType: "unlisted" as const,
    transferYearNetIncomePerShare: 30_000,
    transferYearNetAssetPerShare: 200_000,
    acquisitionYearNetIncomePerShare: 20_000,
    acquisitionYearNetAssetPerShare: 150_000,
  };

  it("E-3 취득측만 증여자 값으로 대체된다 (분모는 양도측 그대로)", () => {
    const r = calculateStockTransferTax(estimated(branch));
    expect(r.estimatedBase).toBe(DONOR_STD_TOTAL);
    expect(r.estimatedDeduction).toBe(DONOR_STD_TOTAL / 100);
    // 취득측 80% 하한은 증여자 값에 다시 걸지 않는다(이미 확정된 사실이다)
    expect(r.valuationDetail?.acquisitionNetAssetFloorApplied).toBeFalsy();
  });

  it("E-3 대조군 — 승계가 없으면 수증자 취득연도 보충평가액이 쓰인다", () => {
    const r = calculateStockTransferTax(control(branch));
    expect(r.estimatedBase).not.toBe(DONOR_STD_TOTAL);
    expect(r.estimatedBase).toBeGreaterThan(0);
  });
});

describe("4분기 — 거래정지(양도) 우회 (§165③)", () => {
  const branch = {
    tradingHaltAtTransfer: true,
    transferYearNetIncomePerShare: 30_000,
    transferYearNetAssetPerShare: 200_000,
    acquisitionYearNetIncomePerShare: 20_000,
    acquisitionYearNetAssetPerShare: 150_000,
  } as Partial<StockTransferInput>;

  it("E-4 비상장 보충평가와 같은 함수를 타므로 오버라이드가 함께 걸린다", () => {
    const r = calculateStockTransferTax(estimated(branch));
    expect(r.estimatedBase).toBe(DONOR_STD_TOTAL);
  });

  it("E-4 대조군", () => {
    const r = calculateStockTransferTax(control(branch));
    expect(r.estimatedBase).toBeGreaterThan(0);
    expect(r.estimatedBase).not.toBe(DONOR_STD_TOTAL);
  });
});

describe("5분기 — 취득일 거래정지 (§165③ 후문)", () => {
  const branch = {
    tradingHaltAtAcquisition: true,
    acquisitionYearNetIncomePerShare: 20_000,
    acquisitionYearNetAssetPerShare: 150_000,
    transferDatePriceAvg1Month: 100_000,
  } as Partial<StockTransferInput>;

  it("E-5 취득측 보충평가를 증여자 기준시가가 대체한다", () => {
    const r = calculateStockTransferTax(estimated(branch));
    expect(r.estimatedBase).toBe(DONOR_STD_TOTAL);
    expect(r.valuationDetail?.conversionAcqStdPerShare).toBe(DONOR_STD);
    // 분모(양도측 1개월 종가평균)는 이월과세와 무관하므로 그대로다
    expect(r.valuationDetail?.conversionTransferStd).toBe(100_000);
  });

  it("E-5 대조군", () => {
    const r = calculateStockTransferTax(control(branch));
    expect(r.valuationDetail?.conversionAcqStdPerShare).toBeGreaterThan(0);
    expect(r.valuationDetail?.conversionAcqStdPerShare).not.toBe(DONOR_STD);
  });
});
