/**
 * ⑫ 명부형 행별 축 — Zod 층 왕복 고정 (7-13).
 *
 * 행 스키마(`z.object`)는 모르는 키를 **침묵 strip**한다. 엔진 anchor는 Zod를 지나가지 않으므로
 * 스키마에 필드가 없어도 초록이다 — 그래서 여기서는 **파싱한 결과를 그대로 엔진에** 넣는다.
 */
import { describe, it, expect } from "vitest";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed/router";
import type { DeemedGiftInput } from "@/lib/tax-engine/gift-deemed/gift-deemed-input-types";
import { mergerInput, cdInput, conInput } from "./for-profit-donee-roster.fixture";

const through = (v: object) => {
  const r = deemedGiftInputSchema.safeParse(v);
  expect(r.success).toBe(true);
  return r.data as DeemedGiftInput & Record<string, unknown>;
};

describe("⑫ Zod — 명부형 수증자 행의 영리법인 표지", () => {
  it("[RFZ-1] §38 과대평가(수증자) 행 — 표지가 통과해 그 행이 제외된다", () => {
    const parsed = through(mergerInput(["gap"]));
    const r = calcDeemedGift(parsed);
    expect(r.deemedGiftValue).toBe(600_000_000);
  });

  it("[RFZ-2] 긍정 짝: §38 과소평가(증여자) 행 — 표지가 strip된다", () => {
    const parsed = through(mergerInput([], ["eul"])) as unknown as {
      shareholders: { undervalued: Record<string, unknown>[] };
    };
    expect(parsed.shareholders.undervalued.every((u) => !("isForProfitCorp" in u))).toBe(true);
  });

  it("[RFZ-3] §39의2 감자 멀티 행 — 표지가 통과해 그 수증자가 제외된다", () => {
    const r = calcDeemedGift(through(cdInput(["병"])));
    const byeong = r.capitalDecreaseMulti!.donees.find((d) => d.name === "병")!;
    expect(byeong.isTaxable).toBe(false);
  });

  it("[RFZ-4] §39의3 고가 명부 행 — 표지가 통과해 그 수증자가 제외된다", () => {
    const r = calcDeemedGift(through(conInput("high", ["을"])));
    expect(r.deemedGiftValue).toBe(2_500_000);
  });

  it("[RFZ-5] 긍정 짝: 표지 없는 입력은 Zod를 지나도 종전 금액", () => {
    expect(calcDeemedGift(through(mergerInput())).deemedGiftValue).toBe(1_000_000_000);
    expect(calcDeemedGift(through(conInput("high"))).deemedGiftValue).toBe(7_500_000);
  });
});
