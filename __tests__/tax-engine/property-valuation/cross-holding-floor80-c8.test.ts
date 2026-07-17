/**
 * C-8 anchor — §54① 단서(순자산가치 80% 하한) 비순환 노드 적용
 *
 * 법령(KoreanLaw MCP 상증령 mst 283637 §54①):
 *   "…가중평균한 가액이 1주당 순자산가치에 100분의 80을 곱한 금액보다 낮은 경우에는
 *    1주당 순자산가치에 100분의 80을 곱한 금액을 비상장주식등의 가액으로 한다."
 *   §54④(순자산단독)은 대상 아님.
 *
 * 재현: 보유 B사 순손익가치 0·순자산 10,000/주 → 가중평균 (2×10,000+3×0)/5=4,000.
 *   정답 max(4,000, 10,000×80%=8,000)=8,000. 종전 4,000 (하한 미적용).
 *
 * 범위: §54① 단서는 **비순환(단방향) 노드**에만 적용. 상호출자(순환) 노드는 α(선형해)와
 *   출력 하한의 정합을 위해 현행 유지(반복 solver 별도 범위) — 사용자 결정.
 */
import { describe, it, expect } from "vitest";
import {
  solveCrossHolding,
  evaluateCrossHoldingReflection,
  type CrossHoldingNode,
} from "@/lib/tax-engine/property-valuation/cross-holding-equations";
import type { OtherUnlistedHolding } from "@/lib/tax-engine/property-valuation/other-unlisted-holdings";

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

describe("C-8 §54① 단서 80% 하한 (비순환)", () => {
  it("비순환 ρ=0·순자산 10,000 → 하한 8,000 (종전 4,000)", () => {
    // heldShares 없음 = 단방향(비순환). α=10,000, 가중평균 4,000 < 8,000 → 하한.
    const B = node("B", 10_000_000, 0, 1_000, 0, {});
    const sol = solveCrossHolding([B]);
    expect(sol.perShareNetAsset.B).toBe(10_000);
    expect(sol.perShareSupplementary.B).toBe(8_000);
  });

  it("비순환 가중평균 ≥ 80% → 하한 미발동 (불변)", () => {
    // ρ 충분히 커 가중평균 > 순자산×80%.
    const B = node("B", 10_000_000, 0, 1_000, 20_000, {});
    // 가중평균 = (2×10,000+3×20,000)/5 = 16,000 > 8,000 → 하한 미발동
    const sol = solveCrossHolding([B]);
    expect(sol.perShareSupplementary.B).toBe(16_000);
  });

  it("§54④ 순자산단독은 하한 대상 아님 (α 그대로)", () => {
    const B = node("B", 10_000_000, 0, 1_000, 0, {}, { valuationBasis: "net_asset_only" });
    const sol = solveCrossHolding([B]);
    expect(sol.perShareSupplementary.B).toBe(10_000); // α, 80% 미적용
  });

  it("순환(상호출자)은 현행 유지 — 하한 미적용", () => {
    // A↔B 상호출자. A: α=111,191·ρ=40,000 → 가중평균 68,476 < 80%(88,952)이나 순환이라 미적용.
    const A = node("A", 150_000_000, 50_000_000, 1_000, 40_000, { B: 100 });
    const B = node("B", 100_000_000, 10_000_000, 500, 30_000, { A: 400 });
    const sol = solveCrossHolding([A, B]);
    expect(sol.perShareSupplementary.A).toBe(68_476); // 하한 미적용(순환)
    expect(sol.perShareSupplementary.B).toBe(111_912);
  });

  it("통합 evaluateCrossHoldingReflection: 비순환 10%초과 보유 → 하한 반영액 주입", () => {
    const holdings: OtherUnlistedHolding[] = [
      {
        rowId: "B",
        issuerCorpName: "B법인",
        holdingShares: 200, // 200/1000 = 20% > 10%
        totalShares: 1_000,
        bookValue: 0,
        counterparty: {
          netAssetExStock: 10_000_000,
          totalLiabilities: 0,
          issuedShares: 1_000,
          netIncomePerShare: 0,
          isRealEstateHeavy: false,
          netAssetOnly: false,
          crossHeldOfTarget: 0, // 비순환
        },
      },
    ];
    const r = evaluateCrossHoldingReflection(
      { netAssetExStock: 100_000_000, totalLiabilities: 0, issuedShares: 1_000, netIncomePerShare: 40_000, isRealEstateHeavy: false, valuationBasis: "weighted" },
      holdings,
    )!;
    expect(r.solution.perShareSupplementary.B).toBe(8_000); // 하한
    // 반영액 = 200주 × 8,000 = 1,600,000 (종전 4,000×200=800,000)
    expect(r.appliedHoldings[0].appliedValue).toBe(1_600_000);
    expect(r.assetValuationDeltaInjection).toBe(1_600_000);
  });
});
