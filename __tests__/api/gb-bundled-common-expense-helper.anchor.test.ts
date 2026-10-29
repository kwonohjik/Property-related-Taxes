/**
 * anchor — `withBundledCommonExpense` (계획서 gb-total-transfer-expense-loss §5.2)
 * 폼 경로로는 닿지 않는 분기(기존 선언 양도비가 있을 때 · 부담부증여 · 몫 0)를 단위로 고정한다.
 */
import { describe, it, expect } from "vitest";
import { withBundledCommonExpense } from "@/app/api/calc/transfer/general-building-part-cards";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

const same = <T extends object>(g: T, c: number, bg?: BurdenedGiftInfo) => expect(withBundledCommonExpense(g, c, bg)).toBe(g);

describe("withBundledCommonExpense", () => {
  it("환산·혼합(actualPriceMode 아님) → 선언 채널 transferExpense 에 합산", () => {
    expect(withBundledCommonExpense({ landArea: 1 }, 400, undefined)).toEqual({ landArea: 1, transferExpense: 400 });
  });

  it("기존 선언 양도비가 있으면 덮어쓰지 않고 더한다 (100 + 400)", () => {
    expect(withBundledCommonExpense({ actualPriceMode: true, transferExpense: 100 }, 400, undefined)).toEqual({ actualPriceMode: true, transferExpense: 500 });
  });

  it("실가 경로 + 선언 채널(자본적지출) → 합산 (legacy 가 후퇴하는 경로)", () => {
    expect(withBundledCommonExpense({ actualPriceMode: true, capitalExpenditure: 10 }, 400, undefined)).toEqual({ actualPriceMode: true, capitalExpenditure: 10, transferExpense: 400 });
  });

  it("실가 경로 + 선언 채널 없음 → 그대로 (legacy 채널이 직접분과 함께 파트로 나눈다)", () => {
    same({ actualPriceMode: true }, 400);
  });

  it("몫 0 → 그대로", () => {
    same({ landArea: 1 }, 0);
  });

  it("부담부증여(§159) → 그대로 (별도 안분 — 미검증)", () => {
    same({ landArea: 1 }, 400, {} as BurdenedGiftInfo);
  });

  it("증축 일괄 이전 형식 직접분(bundledExpenses > 0) → 그대로 / 0 이면 합산", () => {
    same({ extensionInfo: {}, bundledExpenses: 3 }, 400);
    expect(withBundledCommonExpense({ extensionInfo: {}, bundledExpenses: 0 }, 400, undefined)).toEqual({ extensionInfo: {}, bundledExpenses: 0, transferExpense: 400 });
  });
});
