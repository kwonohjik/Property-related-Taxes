/**
 * B — 상속세 모드 giftTaxBase 직접 입력(manual) anchor (GTB-01·02·04)
 *
 * Plan:   docs/00-pm/inheritance-prior-gift-followup-3items.plan.md (항목 B)
 * Design: docs/02-design/features/inheritance-prior-gift-followup-3items.engine.design.md
 *
 * manual 모드 = giftTaxBase 명시 → derivePriorGiftTaxBase가 branch 1(① 보존)로 그대로 통과.
 * §53·§53의2·perspective·캡 모두 우회(과세표준에 이미 반영). auto 모드 = giftTaxBase undefined → §53 도출.
 */
import { describe, it, expect } from "vitest";
import { derivePriorGiftTaxBase } from "@/lib/tax-engine/inheritance-prior-gift-taxbase";
import type { PriorGift, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

const heirs: Heir[] = [{ id: "child-1", relation: "child", birthDate: "1990-01-01" }];

describe("B 상속세 giftTaxBase 직접 입력(manual) — anchor GTB", () => {
  it("GTB-01 manual: giftTaxBase=3천 명시 → branch 1 보존(§53 미적용)", () => {
    const gifts: PriorGift[] = [
      {
        giftDate: "2023-08-10",
        isHeir: true,
        doneeId: "child-1",
        giftAmount: 100_000_000,
        giftTaxPaid: 0,
        giftTaxBase: 30_000_000, // 직접 입력 → 그대로 보존
        priorGiftTaxBaseInputMode: "manual",
      } as PriorGift,
    ];
    expect(derivePriorGiftTaxBase(gifts, heirs)[0].giftTaxBase).toBe(30_000_000);
  });

  it("GTB-02 auto(기본): giftTaxBase 미설정 → §53 직계존속 5천 도출 → 5천 (회귀)", () => {
    const gifts: PriorGift[] = [
      {
        giftDate: "2023-08-10",
        isHeir: true,
        doneeId: "child-1",
        giftAmount: 100_000_000,
        giftTaxPaid: 0,
        // giftTaxBase 미설정 = auto
      } as PriorGift,
    ];
    expect(derivePriorGiftTaxBase(gifts, heirs)[0].giftTaxBase).toBe(50_000_000);
  });

  it("GTB-04 manual: giftTaxBase=0 명시 → branch 1 보존(0)", () => {
    const gifts: PriorGift[] = [
      {
        giftDate: "2023-08-10",
        isHeir: true,
        doneeId: "child-1",
        giftAmount: 100_000_000,
        giftTaxPaid: 0,
        giftTaxBase: 0, // 0도 명시값 — branch 1
        priorGiftTaxBaseInputMode: "manual",
      } as PriorGift,
    ];
    expect(derivePriorGiftTaxBase(gifts, heirs)[0].giftTaxBase).toBe(0);
  });
});
