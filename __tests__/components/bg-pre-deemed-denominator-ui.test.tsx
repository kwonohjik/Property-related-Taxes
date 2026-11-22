/**
 * RTL — 부담부증여 의제취득일 전 ③ 산식의 분모 금액 (NIT R-c03-11).
 * 분모는 엔진 echo(`preDeemed.convertedDenominator`) 그대로다 — 증여가액·perAsset 합으로 재구성하지 않는다.
 * 구 이력(echo 없음)은 라벨만 있는 종전 문구로 떨어진다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { BurdenedGiftDetailCard } from "@/components/calc/results/transfer/BurdenedGiftDetailCard";
import { buildBurdenedGiftBreakdown } from "@/lib/tax-engine/burdened-gift-apportionment";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

afterEach(cleanup);

const info = {
  valuationMode: "sangjeungbeop_market",
  lendingDepositTotal: 0,
  mortgageDebtAmount: 460_000_000,
  annualRentTotal: 0,
  marketValueAtTransfer: 920_000_000,
  landStdPriceAtTransfer: 1_243_350_000,
  buildingStdPriceAtTransfer: 0,
  landStdPriceAtAcquisition: 202_620_000,
  buildingStdPriceAtAcquisition: 0,
} as BurdenedGiftInfo;
const breakdown = (convertedDenominator?: number) =>
  buildBurdenedGiftBreakdown({
    landStdPriceAtTransfer: 1_243_350_000,
    buildingStdPriceAtTransfer: 0,
    landStdPriceAtAcquisition: 202_620_000,
    buildingStdPriceAtAcquisition: 0,
    info,
    preDeemed: {
      stdAtDeemed: 202_620_000, acquisition: 300_000_000, selected: "reported", reported: 300_000_000, sec164: null, converted: 149_925_925,
      ...(convertedDenominator !== undefined ? { convertedDenominator } : {}),
    },
  });
const converted = () => screen.getAllByTestId("bg-pre-deemed-candidate").find((r) => r.getAttribute("data-candidate") === "converted")!.textContent ?? "";

describe("③ 산식 분모", () => {
  it("echo 있음 → 분모에 금액이 적힌다 (수용 등으로 입력값과 다른 분모도 엔진 값 그대로)", () => {
    expect(breakdown(1_243_350_000).preDeemed?.convertedDenominator).toBe(1_243_350_000);
    render(<BurdenedGiftDetailCard breakdown={breakdown(1_243_350_000)} propertyType="land" />);
    expect(converted()).toContain("의제취득일 기준시가 202,620,000");
    expect(converted()).toContain("양도시 기준시가 1,243,350,000");
    cleanup();
    render(<BurdenedGiftDetailCard breakdown={breakdown(736_800_000)} propertyType="land" />);
    expect(converted()).toContain("양도시 기준시가 736,800,000");
    expect(converted()).not.toContain("1,243,350,000");
  });

  it("echo 없음(구 이력) → 종전 문구 — 라벨만, 금액·NaN 없음", () => {
    expect(breakdown().preDeemed?.convertedDenominator).toBeUndefined();
    render(<BurdenedGiftDetailCard breakdown={breakdown()} propertyType="land" />);
    expect(converted()).toContain("양도시 기준시가");
    expect(converted()).not.toMatch(/양도시 기준시가\s*[\d,]/);
    expect(converted()).not.toContain("NaN");
    expect(converted()).not.toContain("undefined");
  });
});
