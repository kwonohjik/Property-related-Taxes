/**
 * §34의3⑬ — 「간접보유비율이 1천분의 1 미만인 경우의 해당 출자관계는 제외한다」 (W10 · RC-K).
 *
 * 종전에는 이 하한이 코드 어디에도 없었고, `computeIndirectRatio`가 경유들을 곧바로 한 분수로
 * 합산해 버려 **관계별 판정 자체가 불가능**했다. 방향은 과세제외 누락 = **과대과세**다.
 *
 * ⚠️ 이 제외는 **증여의제이익 계산에만** 걸린다 — §⑧의 수증자 판정(직접+간접이 한계보유비율
 *    초과)에는 같은 카브아웃이 없다. 섞으면 법령상 수증자인 사람이 대상에서 빠진다([S13-5]).
 */
import { describe, it, expect } from "vitest";
import { calcRelatedCorpGift } from "@/lib/tax-engine/gift-deemed/related-corp";
import { partitionSec13Paths } from "@/lib/tax-engine/gift-deemed/related-corp-helpers";
import type { RelatedCorpInput } from "@/lib/tax-engine/gift-deemed/types";

const R = (pct: number) => ({ numer: Math.round(pct * 100), denom: 10_000 });

describe("§⑬ 1천분의 1 미만 출자관계 제외 — 경계", () => {
  const path = (numer: bigint, denom: bigint) => ({ corpShareholderId: "C", numer, denom });

  it("[S13-0] 정확히 1천분의 1은 「미만」이 아니므로 남는다", () => {
    const { kept, excluded } = partitionSec13Paths([path(1n, 1000n)]);
    expect(kept).toHaveLength(1);
    expect(excluded).toHaveLength(0);
  });

  it("[S13-1] 1천분의 1 바로 아래는 제외된다 (지정값 ±1 동등성)", () => {
    expect(partitionSec13Paths([path(999n, 1_000_000n)]).excluded).toHaveLength(1);
    expect(partitionSec13Paths([path(1000n, 1_000_000n)]).kept).toHaveLength(1);
  });

  it("[S13-2] 관계별로 판정한다 — 합계가 0.1%를 넘어도 각 관계는 따로 본다", () => {
    const { kept, excluded } = partitionSec13Paths([
      path(5n, 10_000n), // 0.05% → 제외
      path(6n, 10_000n), // 0.06% → 제외 (합하면 0.11%지만 관계별 판정이다)
      path(20n, 10_000n), // 0.2% → 유지
    ]);
    expect(excluded).toHaveLength(2);
    expect(kept).toHaveLength(1);
  });
});

describe("§⑬ 제외가 세액에 도달한다", () => {
  it("[S13-3] 일반기업 — 갑의 0.05% 출자관계 제외 → 총액 1,319,760,000원 (종전 1,320,462,000원)", () => {
    const inp: RelatedCorpInput = {
      enterpriseSize: "large", totalSales: 20_000_000_000,
      preTaxAdjOperatingIncome: 2_500_000_000, taxableIncome: 1_800_000_000, corporateTaxNet: 340_000_000,
      shareholders: [
        { id: "gap", name: "갑", relation: "self", directRatio: R(5), isCorporate: false },
        { id: "eul", name: "을", relation: "relative", directRatio: R(85), isCorporate: false },
        { id: "B", name: "B법인", relation: "other", directRatio: R(10), isCorporate: true },
      ],
      intermediaryCorps: [{ corpShareholderId: "B", stakeInBeneficiary: R(10),
        owners: [{ individualId: "gap", ratio: R(0.5) }, { individualId: "eul", ratio: R(40) }] }],
      salesPartners: [
        { id: "D", name: "D", salesAmount: 14_000_000_000, isRelated: true },
        { id: "E", name: "기타", salesAmount: 6_000_000_000, isRelated: false },
      ],
    };
    const r = calcRelatedCorpGift(inp);
    expect(r.deemedGiftValue).toBe(1_319_760_000); // 702,000원 과대였다
    const gap = r.recipientBreakdown?.find((b) => b.recipientName === "갑");
    expect(gap?.subtotal).toBe(70_200_000); // 종전 70,902,000
    expect(gap?.indirectGain).toBe(0);
    expect(gap?.sec13ExcludedCount).toBe(1);
    // 을의 0.30% 관계는 살아 있다 (긍정 짝 — 하한이 전부를 죽이지 않는다)
    const eul = r.recipientBreakdown?.find((b) => b.recipientName === "을");
    expect(eul?.indirectGain).toBeGreaterThan(0);
    expect(eul?.sec13ExcludedCount).toBeUndefined();
  });

  it("[S13-4] 중소기업 채널 — 미소 관계가 한계보유비율 차감분을 흡수하던 것도 함께 막힌다", () => {
    // `OWNERSHIP_RATIO_DEDUCTION`을 간접에서 먼저 빼므로, 미소 관계가 살아 있으면
    // 차감분 일부를 흡수해 **직접초과가 커진다** — 일반기업과 다른 두 번째 과다 채널이다.
    const inp: RelatedCorpInput = {
      enterpriseSize: "small", totalSales: 100_000_000_000,
      preTaxAdjOperatingIncome: 10_000_000_000, taxableIncome: 10_000_000_000, corporateTaxNet: 2_000_000_000,
      shareholders: [
        { id: "gap", name: "갑", relation: "self", directRatio: R(15), isCorporate: false },
        { id: "eul", name: "을", relation: "relative", directRatio: R(25), isCorporate: false },
        { id: "A", name: "A법인", relation: "other", directRatio: R(30), isCorporate: true },
        { id: "x", name: "기타", relation: "other", directRatio: R(30), isCorporate: false },
      ],
      intermediaryCorps: [{ corpShareholderId: "A", stakeInBeneficiary: R(30),
        owners: [{ individualId: "gap", ratio: R(0.05) }, { individualId: "eul", ratio: R(40) }] }],
      salesPartners: [
        { id: "D", name: "D", salesAmount: 70_000_000_000, isRelated: true },
        { id: "E", name: "기타", salesAmount: 30_000_000_000, isRelated: false },
      ],
    };
    const gap = calcRelatedCorpGift(inp).recipientBreakdown?.find((b) => b.recipientName === "갑");
    expect(gap?.subtotal).toBe(80_000_000); // 종전 80,240,000 (+240,000원 과다)
  });

  it("[S13-5] 수증자 판정에는 §⑬ 카브아웃이 없다 — 두 축을 섞지 않는다", () => {
    // 갑: 직접 2.95% + 간접 0.06% = 3.01% > 한계 3% ⇒ **수증자다**.
    // 단, 그 0.06% 관계는 §⑬으로 이익 계산에서만 빠지므로 간접이익은 0이다.
    const inp: RelatedCorpInput = {
      enterpriseSize: "large", totalSales: 100_000_000_000,
      preTaxAdjOperatingIncome: 10_000_000_000, taxableIncome: 10_000_000_000, corporateTaxNet: 2_000_000_000,
      shareholders: [
        { id: "gap", name: "갑", relation: "self", directRatio: R(2.95), isCorporate: false },
        { id: "eul", name: "을", relation: "relative", directRatio: R(37.05), isCorporate: false },
        { id: "A", name: "A법인", relation: "other", directRatio: R(30), isCorporate: true },
        { id: "x", name: "기타", relation: "other", directRatio: R(30), isCorporate: false },
      ],
      intermediaryCorps: [{ corpShareholderId: "A", stakeInBeneficiary: R(30),
        owners: [{ individualId: "gap", ratio: R(0.2) }, { individualId: "eul", ratio: R(40) }] }],
      salesPartners: [
        { id: "D", name: "D", salesAmount: 70_000_000_000, isRelated: true },
        { id: "E", name: "기타", salesAmount: 30_000_000_000, isRelated: false },
      ],
    };
    const gap = calcRelatedCorpGift(inp).recipientBreakdown?.find((b) => b.recipientName === "갑");
    expect(gap).toBeDefined(); // 판정에서 빠지면 undefined — 두 축을 섞었다는 뜻이다
    expect(gap!.indirectGain).toBe(0);
    expect(gap!.directGain).toBeGreaterThan(0);
    expect(gap!.sec13ExcludedCount).toBe(1);
  });
});

describe("§⑱2호·3호 미구현 고지 (RC-I)", () => {
  /** A법인: 지배주주등 지분 `pct`% (30% 이상이면 §⑱1호 충족) */
  const withCorp = (pct: number): RelatedCorpInput => ({
    enterpriseSize: "large", totalSales: 100_000_000_000,
    preTaxAdjOperatingIncome: 10_000_000_000, taxableIncome: 10_000_000_000, corporateTaxNet: 2_000_000_000,
    shareholders: [
      { id: "gap", name: "갑", relation: "self", directRatio: R(40), isCorporate: false },
      { id: "A", name: "A법인", relation: "other", directRatio: R(30), isCorporate: true },
      { id: "x", name: "기타", relation: "other", directRatio: R(30), isCorporate: false },
    ],
    intermediaryCorps: [
      { corpShareholderId: "A", stakeInBeneficiary: R(30), owners: [{ individualId: "gap", ratio: R(pct) }] },
    ],
    salesPartners: [
      { id: "D", name: "D", salesAmount: 70_000_000_000, isRelated: true },
      { id: "E", name: "기타", salesAmount: 30_000_000_000, isRelated: false },
    ],
  });

  it("[S18-0] §⑱1호 미충족 법인이 있으면 고지한다 — 그 간접분이 통째로 빠졌기 때문", () => {
    const r = calcRelatedCorpGift(withCorp(25)); // 25% < 30%
    expect(r.sec18ScopeNotice).toContain("§34의3⑱1호");
    expect(r.sec18ScopeNotice).toContain("2호");
    expect(r.sec18ScopeNotice).toContain("3호");
    expect(r.sec18ScopeNotice).toContain("1곳");
    // 방향 확인 — 미구현은 «과소과세»다(간접분이 0이 되므로)
    expect(r.recipientBreakdown?.[0]?.indirectGain).toBe(0);
  });

  it("[S18-1] 전부 §⑱1호를 충족하면 빠진 것이 없으므로 고지가 사라진다", () => {
    const r = calcRelatedCorpGift(withCorp(30)); // 정확히 30% → 「이상」이라 충족
    expect(r.sec18ScopeNotice).toBeUndefined();
    expect(r.recipientBreakdown?.[0]?.indirectGain).toBeGreaterThan(0);
  });

  it("[S18-2] 간접출자법인이 없으면 고지하지 않는다 — 상시 노출 금지", () => {
    const base = withCorp(25);
    base.intermediaryCorps = [];
    expect(calcRelatedCorpGift(base).sec18ScopeNotice).toBeUndefined();
  });
});
