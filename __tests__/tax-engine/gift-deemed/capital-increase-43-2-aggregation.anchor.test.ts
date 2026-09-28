import { describe, it, expect } from "vitest";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed/router";
import { calcCapitalIncreaseAllocation } from "@/lib/tax-engine/gift-deemed/capital-increase-allocation";
import type { DeemedGiftInput } from "@/lib/tax-engine/gift-deemed/types";

type CapitalIncreaseInput = Extract<DeemedGiftInput, { type: "capital_increase" }>;

// #19 — 「상증법」§43② · 「상증령」§32의4 두문·4호: 1년 이내 **같은 호** 증자 이익을 합산해 **금액기준(3억)** 을 판정한다.
//   · 합산은 금액기준 판정에만 쓴다 — 과세하는 증여재산가액은 **당해 건 이익** 그대로(사용자 결정 (a) · 설계서 §3 Q1).
//   · 「100분의 30」 비율기준은 합산 대상이 아니다 — 건별 판정 유지(영 §32의4 두문은 「금액기준」만 말한다).
//   · 합산 단위는 호 — 저가(§39①1호)와 고가(2호)를 섞지 않는다(영 §32의4 4호 괄호).

/** 리뷰 G-2 실측 — 저가 나목 base 199,992,000 (비율 미충족) */
const LOW_NR: CapitalIncreaseInput = {
  type: "capital_increase", direction: "low", subType: "no_realloc",
  preIssuePrice: 100_000, preIssueShares: 1_000_000, newSharePrice: 90_000, issuedShares: 200_000, forfeitedShares: 24_000,
  giftDate: new Date("2026-03-02"),
};

describe("#19 §43② 1년 합산 — 단건", () => {
  it("[AG-1] 짝 — 선행 건이 없으면 199,992,000은 금액기준 미달로 0", () => {
    const r = calcDeemedGift(LOW_NR);
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
  });

  it("[AG-2] 🔴 1년 이내 같은 호 선행 이익 199,992,000을 합산하면 금액기준 충족 — 과세는 **당해 199,992,000만**", () => {
    const r = calcDeemedGift({ ...LOW_NR, priorSameClauseGains: [{ date: "2025-09-01", gain: 199_992_000 }] });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(199_992_000); // 합계 399,984,000이 아니다 — (a)
    const row = r.breakdown.find((b) => b.label.includes("§43②"));
    expect(row?.amount).toBe(399_984_000);
  });

  it("[AG-3] 윈도 밖(증여일 − 1년 전날) 선행 건은 합산하지 않는다 — 윈도 첫날은 포함", () => {
    const out = calcDeemedGift({ ...LOW_NR, priorSameClauseGains: [{ date: "2025-03-01", gain: 199_992_000 }] });
    expect(out.applied).toBe(false);
    const edge = calcDeemedGift({ ...LOW_NR, priorSameClauseGains: [{ date: "2025-03-02", gain: 199_992_000 }] });
    expect(edge.applied).toBe(true);
  });

  it("[AG-4] 합산해도 3억 미만이면 여전히 0 — 사유 유지", () => {
    const r = calcDeemedGift({ ...LOW_NR, priorSameClauseGains: [{ date: "2025-09-01", gain: 100_000_007 }] });
    expect(r.applied).toBe(false); // 199,992,000 + 100,000,007 = 299,992,007 < 3억
    expect(r.exclusionReason).toContain("3억");
  });

  it("[AG-5] 고가 나목도 같은 방식 — 가중 이익으로 금액기준을 합산 판정", () => {
    const high: CapitalIncreaseInput = {
      type: "capital_increase", direction: "high", subType: "no_realloc",
      preIssuePrice: 10_000, preIssueShares: 100_000, newSharePrice: 12_000, issuedShares: 50_000, forfeitedShares: 30_000,
      relatedAcquiredShares: 50_000, ratioDenomShares: 50_000, giftDate: new Date("2026-03-02"),
    };
    const alone = calcDeemedGift(high);
    // ㉯ = (10,000×100,000 + 12,000×50,000) ÷ 150,000 = 10,666 · 차액 1,334 < 30%(3,199.8) · 이익 1,334×30,000 = 40,020,000 < 3억
    expect(alone.applied).toBe(false);
    const agg = calcDeemedGift({ ...high, priorSameClauseGains: [{ date: "2026-01-10", gain: 280_000_000 }] });
    expect(agg.applied).toBe(true);
    expect(agg.deemedGiftValue).toBe(40_020_000); // 당해 가중 이익 — 40,020,000 + 280,000,000 ≥ 3억
  });

  it("[AG-6] 기준금액이 없는 목(가·다·라목)은 선행 건과 무관 — 값·행 모두 불변", () => {
    const realloc: CapitalIncreaseInput = { ...LOW_NR, subType: "forfeited_realloc" };
    const a = calcDeemedGift(realloc);
    const b = calcDeemedGift({ ...realloc, priorSameClauseGains: [{ date: "2025-09-01", gain: 199_992_000 }] });
    expect(b.deemedGiftValue).toBe(a.deemedGiftValue);
    expect(b.breakdown.some((x) => x.label.includes("§43②"))).toBe(false);
  });

  it("[AG-8] 증여일보다 **뒤**의 건은 합산하지 않는다 — 「소급하여」 1년(⑧이 먼저 막지만 엔진도 지킨다)", () => {
    const r = calcDeemedGift({ ...LOW_NR, priorSameClauseGains: [{ date: "2026-03-03", gain: 199_992_000 }] });
    expect(r.applied).toBe(false);
  });

  it("[AG-7] 증여일이 없으면 윈도를 정할 수 없어 합산하지 않는다", () => {
    const r = calcDeemedGift({ ...LOW_NR, giftDate: undefined, priorSameClauseGains: [{ date: "2025-09-01", gain: 199_992_000 }] });
    expect(r.applied).toBe(false);
  });
});

describe("#19 §43② 1년 합산 — cap-table", () => {
  // 리뷰 G-2 실증 렌즈: A 90% 전부 실권 · B 10% 자기분 인수(100,000 → 90,000) — 수증자 B 이익이 기준금액 미달로 0
  const base = (prior?: number) =>
    calcCapitalIncreaseAllocation({
      direction: "low", preIssuePrice: 100_000, newSharePrice: 90_000, giftDate: new Date("2026-03-02"),
      shareholders: [
        { id: "A", name: "A", preShares: 900_000, entitledShares: 180_000, subscribedShares: 0, reallocatedShares: 0 },
        { id: "B", name: "B", preShares: 100_000, entitledShares: 20_000, subscribedShares: 20_000, reallocatedShares: 0, relatedTo: ["A"],
          ...(prior != null ? { priorSameClauseGain: prior } : {}) },
      ],
    });
  const total = (r: ReturnType<typeof base>) => r.perBeneficiary.find((p) => p.beneficiaryId === "B")?.total;

  it("[AGC-1] 짝 — 선행 이익이 없으면 B는 금액기준 미달로 0", () => {
    const r = base();
    expect(total(r)).toBe(0);
    expect(r.byShareholder.find((s) => s.id === "B")!.delta).toBeGreaterThan(0);
  });

  it("[AGC-2] 🔴 B의 1년 내 같은 호 선행 이익을 더해 3억을 넘으면 과세 — 금액은 당해 이익", () => {
    const delta = base().byShareholder.find((s) => s.id === "B")!.delta;
    const r = base(300_000_000 - delta);
    expect(total(r)).toBe(delta);
  });

  it("[AGC-3] 합산해도 1원 모자라면 0", () => {
    const delta = base().byShareholder.find((s) => s.id === "B")!.delta;
    expect(total(base(300_000_000 - delta - 1))).toBe(0);
  });
});
