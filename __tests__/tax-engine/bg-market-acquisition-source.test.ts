/**
 * `assertBgMarketAcquisitionSource` — 시가 평가 부담부증여의 §159①1호 A 원천이 없으면 막는다
 * (계획서 `inheritance-pre-deemed-bg-pr7b.plan.md` B-1 — 원천 없이 legacy 분기로 떨어지면 취득가액 0).
 * route 경로는 `__tests__/api/transfer.route.bg-pre-deemed-12-scope.routes.anchor.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { assertBgMarketAcquisitionSource } from "@/lib/tax-engine/burdened-gift-valuation";
import { runBurdenedGiftStep } from "@/lib/tax-engine/transfer-tax-burdened-gift-step";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const market: BurdenedGiftInfo = {
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

const assert = (info: BurdenedGiftInfo, hasPreDeemed = false) => () => assertBgMarketAcquisitionSource(info, undefined, hasPreDeemed);

describe("시가 평가 원천 확인", () => {
  it("A-1 산정방식·의제취득일 전 3자 max·취득시 시가가 모두 없으면 막는다", () => {
    expect(assert(market)).toThrow(/취득가액 산정방식/);
  });

  it("A-2 원천이 하나라도 있으면 통과 — 산정방식 · 3자 max · legacy 취득시 시가 · 조합원입주권(K-4 고정)", () => {
    expect(assert({ ...market, acquisitionMethod: "converted" })).not.toThrow();
    expect(assert(market, true)).not.toThrow();
    expect(assert({ ...market, marketValueAtAcquisition: 0 })).not.toThrow();
    expect(assert({ ...market, rightValuation: { memberRightsValue: 300_000_000, paidInstallments: 0, premium: 0 } })).not.toThrow();
  });

  it("A-3 기준시가 평가는 대상이 아니다 — 괄호가 발동하지 않는 조합원입주권도(산정방식 없이 실지취득가액 K-4)", () => {
    expect(assert({ ...market, valuationMode: "sangjeungbeop_standard" })).not.toThrow();
    const right = { memberRightsValue: 300_000_000, paidInstallments: 0, premium: 0 };
    expect(assert({ ...market, valuationMode: "sangjeungbeop_standard", rightValuation: right })).not.toThrow();
  });

  it("A-4 시가 모드라도 담보 평가가 이겨 괄호가 발동하면 통과(취득시 기준시가 강제)", () => {
    // 시가 1억 < 담보 채권액 4.6억 → 증여가액 = 담보 평가(상증법 §66) → 소령 §159①1호 괄호
    expect(assert({ ...market, marketValueAtTransfer: 100_000_000 })).not.toThrow();
  });

  it("A-5 단건 STEP 0.48이 부른다 — §159 분해 전에 막힌다", () => {
    const input = {
      transferType: "burdened_gift",
      propertyType: "land",
      transferDate: new Date("2023-02-16"),
      burdenedGiftInfo: market,
    } as unknown as TransferTaxInput;
    expect(() => runBurdenedGiftStep(input, input, [])).toThrow(/취득가액 산정방식/);
  });
});
