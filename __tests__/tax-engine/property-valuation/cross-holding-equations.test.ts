import { describe, it, expect } from "vitest";
// Pre-Do anchor — 모듈 미구현 시 import 실패(red). Do 단계에서 구현 후 green.
// 출처: 교재 8장 6절 상호출자 평가사례 Ⅰ·Ⅱ·Ⅲ.
// ⚠️ 기대값은 BigInt 유리수 정확연산 기준(교재 중간 반올림 artifact 배제). 상세: engine.design.md §6.
import {
  solveCrossHolding,
  evaluateCrossHoldingReflection,
  type CrossHoldingNode,
} from "@/lib/tax-engine/property-valuation/cross-holding-equations";
import type { OtherUnlistedHolding } from "@/lib/tax-engine/property-valuation/other-unlisted-holdings";

/** weighted 일반법인 노드 헬퍼 (할증無·부동산과다無 기본) */
function node(
  corpId: string,
  P: number,
  d: number,
  eta: number,
  rho: number,
  heldShares: Record<string, number>,
  opts: Partial<CrossHoldingNode> = {},
): CrossHoldingNode {
  return {
    corpId,
    corpName: corpId,
    netAssetExStock: P,
    totalLiabilities: d,
    issuedShares: eta,
    netIncomePerShare: rho,
    isRealEstateHeavy: false,
    valuationBasis: "weighted",
    heldShares,
    premiumOnHeld: false,
    premiumRate: 0,
    ...opts,
  };
}

describe("solveCrossHolding — 상호출자 다원일차연립방정식", () => {
  // ── 사례 Ⅲ ⭐ 교재 완전일치 (계수 exact) — 1차 anchor ──
  it("cross-holding-case3: 사례Ⅲ α=111,191 β=234,781 (교재 완전일치)", () => {
    const A = node("A", 150_000_000, 50_000_000, 1_000, 40_000, { B: 100 });
    const B = node("B", 100_000_000, 10_000_000, 500, 30_000, { A: 400 });
    const sol = solveCrossHolding([A, B]);
    expect(sol.perShareNetAsset.A).toBe(111_191);
    expect(sol.perShareNetAsset.B).toBe(234_781);
    expect(sol.perShareSupplementary.A).toBe(68_476); // (2×111,191+3×40,000)/5
    expect(sol.perShareSupplementary.B).toBe(111_912); // (2×234,781+3×30,000)/5
    // 자산반영 Max(장부, 보충적시가)
    const aHoldsB = sol.heldValuation.find((h) => h.holderId === "A" && h.issuerId === "B")!;
    const bHoldsA = sol.heldValuation.find((h) => h.holderId === "B" && h.issuerId === "A")!;
    expect(Math.max(25_000_000, aHoldsB.supplementaryValue)).toBe(25_000_000); // 장부 채택 (100×111,912=11,191,200)
    expect(Math.max(15_000_000, bHoldsA.supplementaryValue)).toBe(27_390_400); // 400×68,476
  });

  // ── 사례 Ⅱ ⚠️ 교재 반올림 artifact → 엔진정확값 동결 ──
  it("cross-holding-case2: 사례Ⅱ 엔진정확 α=17,576 β=10,338 (교재 17,575/10,333은 반올림오차)", () => {
    const A = node("A", 1_000_000_000, 200_000_000, 50_000, 25_000, { B: 6_000 });
    const B = node("B", 400_000_000, 200_000_000, 30_000, 15_000, { A: 5_000 });
    const sol = solveCrossHolding([A, B]);
    expect(sol.perShareNetAsset.A).toBe(17_576);
    expect(sol.perShareNetAsset.B).toBe(10_338);
    expect(sol.perShareSupplementary.A).toBe(22_030);
    expect(sol.perShareSupplementary.B).toBe(13_135); // 교재 13,133 (반올림 artifact)
    const aHoldsB = sol.heldValuation.find((h) => h.holderId === "A" && h.issuerId === "B")!;
    expect(Math.max(60_000_000, aHoldsB.supplementaryValue)).toBe(78_810_000); // 6,000×13,135
  });

  // ── 사례 Ⅰ net_asset_only + 할증 1.3 (ρ=0) — α만 동결(β 교재 quirk) ──
  it("cross-holding-case1: 사례Ⅰ α=173,170 (순자산단독·1차분 할증)", () => {
    const A = node("A", 80_000_000, 22_000_000, 1_000, 0, { B: 280 }, {
      valuationBasis: "net_asset_only",
      premiumOnHeld: true,
      premiumRate: 0.3,
    });
    const B = node("B", 17_000_000, 3_000_000, 400, 0, { A: 500 }, {
      valuationBasis: "net_asset_only",
      premiumOnHeld: true,
      premiumRate: 0.3,
    });
    const sol = solveCrossHolding([A, B]);
    expect(sol.perShareNetAsset.A).toBe(173_170); // β=316,401(엔진정확)은 교재 301,401과 상이 — 미동결
  });

  // ── 게이트: 양방 ≤10% 상호출자 → 연립 미발동은 orchestrator 책임. 여기선 산식만 검증 ──
});

describe("evaluateCrossHoldingReflection — C2 자산반영 (②평가차액 주입)", () => {
  it("사례Ⅲ: 보충적<장부 → Max=장부 → 주입 0", () => {
    const holdings: OtherUnlistedHolding[] = [
      {
        rowId: "B",
        issuerCorpName: "B법인",
        holdingShares: 100,
        totalShares: 500,
        bookValue: 25_000_000,
        counterparty: {
          netAssetExStock: 100_000_000,
          totalLiabilities: 10_000_000,
          issuedShares: 500,
          netIncomePerShare: 30_000,
          isRealEstateHeavy: false,
          netAssetOnly: false,
          crossHeldOfTarget: 400,
        },
      },
    ];
    const r = evaluateCrossHoldingReflection(
      { netAssetExStock: 100_000_000, totalLiabilities: 0, issuedShares: 1_000, netIncomePerShare: 40_000, isRealEstateHeavy: false, valuationBasis: "weighted" },
      holdings,
    )!;
    expect(r.solution.perShareSupplementary.B).toBe(111_912);
    expect(r.appliedHoldings[0].appliedValue).toBe(25_000_000); // Max(25M, 11,191,200)
    expect(r.assetValuationDeltaInjection).toBe(0);
  });

  it("사례Ⅱ: 보충적>장부 → 주입 = 78,810,000 − 60,000,000 = 18,810,000", () => {
    const holdings: OtherUnlistedHolding[] = [
      {
        rowId: "B",
        issuerCorpName: "B법인",
        holdingShares: 6_000,
        totalShares: 30_000,
        bookValue: 60_000_000,
        counterparty: {
          netAssetExStock: 400_000_000,
          totalLiabilities: 200_000_000,
          issuedShares: 30_000,
          netIncomePerShare: 15_000,
          isRealEstateHeavy: false,
          netAssetOnly: false,
          crossHeldOfTarget: 5_000,
        },
      },
    ];
    const r = evaluateCrossHoldingReflection(
      { netAssetExStock: 800_000_000, totalLiabilities: 0, issuedShares: 50_000, netIncomePerShare: 25_000, isRealEstateHeavy: false, valuationBasis: "weighted" },
      holdings,
    )!;
    expect(r.solution.perShareSupplementary.B).toBe(13_135);
    expect(r.appliedHoldings[0].appliedValue).toBe(78_810_000);
    expect(r.assetValuationDeltaInjection).toBe(18_810_000);
  });

  it("H-2: counterparty 있어도 보유 ≤10%면 연립 미발동 (undefined)", () => {
    const holdings: OtherUnlistedHolding[] = [
      {
        rowId: "B",
        issuerCorpName: "B법인",
        holdingShares: 50, // 50/1000 = 5% ≤ 10%
        totalShares: 1_000,
        bookValue: 1_000_000,
        counterparty: {
          netAssetExStock: 100_000_000,
          totalLiabilities: 10_000_000,
          issuedShares: 500,
          netIncomePerShare: 30_000,
          isRealEstateHeavy: false,
          netAssetOnly: false,
          crossHeldOfTarget: 400,
        },
      },
    ];
    const r = evaluateCrossHoldingReflection(
      { netAssetExStock: 100_000_000, totalLiabilities: 0, issuedShares: 1_000, netIncomePerShare: 40_000, isRealEstateHeavy: false, valuationBasis: "weighted" },
      holdings,
    );
    expect(r).toBeUndefined();
  });

  it("counterparty 없으면 undefined (10%↓는 기존 evaluateOtherUnlistedHoldings 경로)", () => {
    const r = evaluateCrossHoldingReflection(
      { netAssetExStock: 1, totalLiabilities: 0, issuedShares: 1, netIncomePerShare: 0, isRealEstateHeavy: false, valuationBasis: "weighted" },
      [{ rowId: "x", issuerCorpName: "x", holdingShares: 1, totalShares: 100 }],
    );
    expect(r).toBeUndefined();
  });
});
