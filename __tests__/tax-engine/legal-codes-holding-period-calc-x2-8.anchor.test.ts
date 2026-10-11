/**
 * X2-8 anchor — `TRANSFER.HOLDING_PERIOD_CALC`는 보유기간 기산 근거다. 「소득세법 시행령」 §159의 표제는 「부담부증여에 대한
 * 양도차익의 계산」이라 보유기간 근거가 될 수 없다(MST 290841). 보유기간은 「소득세법」 §95④(취득일부터 양도일까지 — 초일 산입)이고
 * 비과세 보유기간은 시행령 §154⑤가 그 항에 위임한다.
 */
import { describe, it, expect } from "vitest";
import { TRANSFER } from "@/lib/tax-engine/legal-codes/transfer";
import { calculateHoldingPeriod } from "@/lib/tax-engine/tax-utils";

describe("X2-8 HOLDING_PERIOD_CALC", () => {
  it("영 §159(부담부증여)를 가리키지 않는다", () => {
    expect(TRANSFER.HOLDING_PERIOD_CALC).not.toMatch(/§159/);
  });
  it("보유기간의 법 근거 §95④를 가리킨다", () => {
    expect(TRANSFER.HOLDING_PERIOD_CALC).toBe("소득세법 §95 ④");
  });
  it("긍정 짝: 부담부증여 상수는 §159를 그대로 가리킨다", async () => {
    const { TRANSFER_DECREE_ADDITIONS } = await import("@/lib/legal-verification/manifest/additions-transfer-decree");
    const rule = TRANSFER_DECREE_ADDITIONS.find((r) => r.id === "TRANSFER_DECREE.BURDENED_GIFT_GAIN");
    expect(rule?.citation).toBe("소득세법 시행령 §159");
  });
  it("엔진 기산은 초일 산입이다 — 상수 설명(취득일 다음날 기산)이 틀렸던 근거", () => {
    // 2024-01-01 취득 · 2025-12-31 양도: 초일 산입이면 만 2년(1일 당겨짐)이 되고, 다음날 기산이면 1년 11개월 30일이다.
    const p = calculateHoldingPeriod(new Date("2024-01-01"), new Date("2025-12-31"));
    expect(p.years).toBe(2);
  });
});
