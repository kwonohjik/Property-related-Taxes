/**
 * 간접보유비율 BigInt→Number 복원 정밀도 (W10 · 리뷰 RC-2-f · RC-5-h).
 *
 * `related-corp-helpers.ts` 헤더는 「분수 곱은 BigInt(2^53 초과 방지)」라고 선언하는데,
 * 종전에는 **복원 지점이 곧 손실 지점**이었다. ④ 변환이 비율을 분모 10,000으로 만들어
 * 경유 1개마다 분모가 1e8배씩 커지므로 경유 3개면 분모 1e24·분자 1.2e23이 되어
 * 둘 다 안전정수 범위를 벗어나고, 최종 floor 경계를 넘겨 증여의제이익이 1원 과소가 됐다.
 */
import { describe, it, expect } from "vitest";
import { calcRelatedCorpGift } from "@/lib/tax-engine/gift-deemed/related-corp";
import {
  computeIndirectRatio,
  fracMaxZeroSub,
} from "@/lib/tax-engine/gift-deemed/related-corp-helpers";
import type { RelatedCorpInput } from "@/lib/tax-engine/gift-deemed/types";

/** 갑 직접 20% · 간접출자법인 k개(각 갑→법인 `ownerPct`%, 법인→수혜법인 `stakePct`%) */
function inp(k: number, ownerPct: number, stakePct: number, size: "small" | "large"): RelatedCorpInput {
  const corps = Array.from({ length: k }, (_, i) => ({
    corpShareholderId: `C${i}`,
    stakeInBeneficiary: { numer: stakePct * 100, denom: 10_000 },
    owners: [{ individualId: "gap", ratio: { numer: ownerPct * 100, denom: 10_000 } }],
  }));
  return {
    enterpriseSize: size,
    totalSales: 20_000_000_000,
    preTaxAdjOperatingIncome: 2_500_000_000,
    taxableIncome: 1_800_000_000,
    corporateTaxNet: 340_000_000,
    shareholders: [
      { id: "gap", name: "갑", relation: "self", directRatio: { numer: 2000, denom: 10_000 }, isCorporate: false },
      ...corps.map((c) => ({
        id: c.corpShareholderId, name: c.corpShareholderId, relation: "other" as const,
        directRatio: { numer: stakePct * 100, denom: 10_000 }, isCorporate: true,
      })),
    ],
    intermediaryCorps: corps,
    salesPartners: [
      { id: "D", name: "D법인", salesAmount: 13_000_000_000, isRelated: true },
      { id: "E", name: "기타", salesAmount: 7_000_000_000, isRelated: false },
    ],
  };
}

describe("간접출자 분수 복원 — 약분으로 안전정수 범위 유지", () => {
  it("[P-0] 경유 3개 — 414,720,000원 (종전 414,719,999원, 1원 과소)", () => {
    expect(calcRelatedCorpGift(inp(3, 40, 10, "large")).deemedGiftValue).toBe(414_720_000);
  });

  it("[P-1] RC-5-h 재현 — 중소·경유 5개(40%×5%) 64,800,000원 (종전 64,799,999원)", () => {
    const r = calcRelatedCorpGift(inp(5, 40, 5, "small"));
    expect(r.deemedGiftValue).toBe(64_800_000);
    expect(r.recipientBreakdown?.[0]?.directGain).toBe(64_800_000);
  });

  it("[P-2] 경유 4·5개도 정확해진다", () => {
    expect(calcRelatedCorpGift(inp(4, 40, 10, "large")).deemedGiftValue).toBe(466_560_000);
    expect(calcRelatedCorpGift(inp(5, 40, 10, "large")).deemedGiftValue).toBe(518_400_000);
  });

  it("[P-3] 경유 1·2개는 종전에도 정확했다 — 회귀 0 (긍정 짝)", () => {
    expect(calcRelatedCorpGift(inp(1, 40, 10, "large")).deemedGiftValue).toBe(311_040_000);
    expect(calcRelatedCorpGift(inp(2, 40, 10, "large")).deemedGiftValue).toBe(362_880_000);
  });

  it("[P-4] 경유 38개에서 분모가 Infinity로 발산하지 않는다 — 조용한 0원 차단", () => {
    // 종전: 분모가 Infinity가 되어 수증자 필터 `totalNumer*100 > totalDenom*marginal`이
    //       `Infinity > Infinity` = false로 떨어지며 세액이 **조용히 0**이 됐다.
    const r = calcRelatedCorpGift(inp(38, 40, 10, "large"));
    expect(r.deemedGiftValue).toBeGreaterThan(0);
    expect(r.recipientBreakdown).toHaveLength(1);
  });

  it("[P-5] computeIndirectRatio가 약분된 분수를 돌려준다 — 3경유 = 3/25", () => {
    const f = computeIndirectRatio("gap", inp(3, 40, 10, "large").intermediaryCorps!, "recipient", ["gap"]);
    expect(f).toEqual({ numer: 3, denom: 25 }); // 종전 1.2e23 / 1e24 (둘 다 unsafe)
    expect(Number.isSafeInteger(f.numer)).toBe(true);
    expect(Number.isSafeInteger(f.denom)).toBe(true);
  });

  it("[P-6] fracMaxZeroSub도 약분해서 돌려준다", () => {
    // 20/100 − 10/100 = 1000/10000 → 1/10
    expect(fracMaxZeroSub({ numer: 20, denom: 100 }, { numer: 10, denom: 100 })).toEqual({ numer: 1, denom: 10 });
    // 음수는 0/1 (분모가 부풀지 않는다)
    expect(fracMaxZeroSub({ numer: 5, denom: 100 }, { numer: 10, denom: 100 })).toEqual({ numer: 0, denom: 1 });
  });
});
