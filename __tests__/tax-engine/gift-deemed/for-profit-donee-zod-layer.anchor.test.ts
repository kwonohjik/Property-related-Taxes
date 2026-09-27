/**
 * ⑫ 「상증법」§4의2①·③ 공통 축 — Zod 층 양방향 고정 (7-12).
 *
 * leaf 엔진 anchor는 Zod를 지나가지 않는다 — 스키마에서 필드를 빼도 엔진 anchor는 초록이다.
 * 그 상태면 화면에서 켠 토글이 **침묵 strip**되어 엔진에 닿지 않고, TypeScript도 모른다.
 * 반대로 명부형·§45의2 스키마에 이 필드를 붙이면 계산 단위 토글이 그 유형까지 새어 든다.
 */
import { describe, it, expect } from "vitest";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { FOR_PROFIT_DONEE_APPLIED as APPLIED } from "./for-profit-donee-applied.fixture";

const parse = (v: object) => deemedGiftInputSchema.safeParse({ ...v, doneeIsForProfitCorp: true });

describe("⑫ Zod — 영리법인 수증자 공통 축", () => {
  it.each(Object.keys(APPLIED))("[FPZ-1] %s — 필드가 통과해 엔진에 닿는다", (type) => {
    const r = parse(APPLIED[type]);
    expect(r.success).toBe(true);
    expect((r.data as Record<string, unknown>).doneeIsForProfitCorp).toBe(true);
  });

  it("[FPZ-2] 긍정 짝: §45의2 명의신탁 — 필드가 strip된다 (§4의2② 실제소유자)", () => {
    const r = parse({ type: "nominee_trust", hasTaxAvoidancePurpose: true, propertyValue: 1_000_000_000 });
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty("doneeIsForProfitCorp");
  });

  it("[FPZ-3] 긍정 짝: §38 합병(명부형) — 필드가 strip된다", () => {
    const r = parse({ type: "merger", caseType: "non_stock", overvaluedSharePrice: 10_000, majorShares: 100_000 });
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty("doneeIsForProfitCorp");
  });
});
