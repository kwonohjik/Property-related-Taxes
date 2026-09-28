/**
 * §41의2 1인 단위 — ④ API 변환 · ⑫ Zod 왕복 (EDP 엔진 anchor의 짝).
 *
 * 행 스키마·객체 스키마는 모르는 키를 **침묵 strip**한다. 엔진 anchor는 Zod를 지나가지 않으므로
 * `targetDoneeId`·`isForProfitCorp`가 스키마에 없어도 초록이다 — 폼에서 고른 수증자가 엔진에 닿지 않으면
 * 조용히 **첫 수증자**가 계산된다(= 다른 사람의 증여세).
 */
import { describe, it, expect } from "vitest";
import { buildDeemedGiftInput } from "@/lib/calc/gift-deemed-api";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed/router";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";
import type { DeemedGiftInput } from "@/lib/tax-engine/gift-deemed/gift-deemed-input-types";
import type { EdShareholderRow } from "@/components/calc/deemed-gift/deemed-form-rows";

const row = (id: string, role: EdShareholderRow["role"], pct: string, amt: string, corp?: boolean): EdShareholderRow => ({
  id, name: id, role, ownershipRatioPctStr: pct, actualDividendStr: amt, ...(corp && { isForProfitCorp: true }),
});
/** A 50% 0 · B 25% 7억 · C 25% 3억 → B 4.5억 · C 5천만 초과 */
const form = (f: Partial<DeemedFormState> = {}) =>
  ({
    ...INITIAL_DEEMED,
    type: "excess_dividend",
    giftDate: "2025-06-30",
    edShareholders: [row("A", "major_shareholder", "50", "0"), row("B", "related_party", "25", "700000000"), row("C", "related_party", "25", "300000000")],
    ...f,
  }) as DeemedFormState;
/** 폼 → API 변환 → JSON(fetch body) → Zod → 엔진 */
const e2e = (f: DeemedFormState) => {
  const body = JSON.parse(JSON.stringify(buildDeemedGiftInput(f)));
  const parsed = deemedGiftInputSchema.safeParse(body);
  expect(parsed.success).toBe(true);
  const data = parsed.data as Record<string, unknown>;
  // JSON 경유로 Date가 문자열이 된다 — 라우트가 하는 변환을 재현
  return calcDeemedGift({ ...data, dividendDate: new Date(String(data.dividendDate)) } as unknown as DeemedGiftInput);
};

describe("④⑫ §41의2 계산 대상 수증자", () => {
  it("[EDW-1] 폼에서 C를 고르면 Zod를 지나 엔진이 C 1인분(43,000,000)을 계산한다", () => {
    const r = e2e(form({ edTargetDoneeId: "C" }));
    expect(r.excessDividendDetail!.targetDoneeId).toBe("C");
    expect(r.deemedGiftValue).toBe(43_000_000);
  });

  it("[EDW-2] 긍정 짝: 고르지 않으면 첫 수증자 B(295,940,000)", () => {
    const r = e2e(form());
    expect(r.deemedGiftValue).toBe(295_940_000);
  });

  it("[EDW-3] 긍정 짝: 고른 행을 특수관계인이 아닌 역할로 바꾼 stale id는 싣지 않는다", () => {
    const f = form({
      edTargetDoneeId: "C",
      edShareholders: [row("A", "major_shareholder", "50", "0"), row("B", "related_party", "25", "700000000"), row("C", "other", "25", "300000000")],
    });
    expect(buildDeemedGiftInput(f)).not.toHaveProperty("targetDoneeId");
  });
});

describe("④⑫ §41의2 영리법인 특수관계인 행", () => {
  it("[EDW-4] 특수관계인 행 표지가 Zod를 지나 엔진에 닿는다 — B 제외, 기본 대상은 C", () => {
    const f = form({
      edShareholders: [row("A", "major_shareholder", "50", "0"), row("B", "related_party", "25", "700000000", true), row("C", "related_party", "25", "300000000")],
    });
    const r = e2e(f);
    expect(r.excessDividendDetail!.targetDoneeId).toBe("C");
    expect(r.excessDividendDetail!.donees!.find((d) => d.id === "B")!.isForProfitCorp).toBe(true);
  });

  it("[EDW-5] 긍정 짝: 최대주주·기타 행의 표지(역할을 바꿔 남은 stale)는 싣지 않는다", () => {
    const f = form({
      edShareholders: [row("A", "major_shareholder", "50", "0", true), row("B", "related_party", "25", "700000000"), row("C", "other", "25", "300000000", true)],
    });
    const sh = (buildDeemedGiftInput(f) as unknown as { shareholders: Record<string, unknown>[] }).shareholders;
    expect(sh.filter((s) => "isForProfitCorp" in s)).toEqual([]);
  });
});
