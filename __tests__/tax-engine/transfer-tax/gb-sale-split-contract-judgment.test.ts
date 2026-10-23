/**
 * 공유지분 §100③ — 계약서(100%) 금액으로 판정 (엔진 단위 · 증축 3-way 경로 포함).
 *
 * 계획서: `docs/00-pm/sale-split-100-3-share-scale-judgment.plan.md` (Q-1 a · Q-2 a).
 * route anchor(`__tests__/components/gb-sale-split-contract-judgment.anchor.test.tsx`)는 2-way(환산·실가)를 잡는다.
 * 증축 3-way(`general-building-extension.ts`)는 환산 경로에서만 판정하므로 여기서 엔진을 직접 부른다.
 */
import { describe, it, expect } from "vitest";
import { buildGeneralBuildingAssetCards, type GeneralBuildingInput } from "@/lib/tax-engine/general-building-valuation";
import { judgeSaleSplitByContract } from "@/lib/tax-engine/sale-split-contract-judgment";
import { applyRatio } from "@/lib/tax-engine/tax-utils";

const TOTAL = 925_000_000;
const BASE: GeneralBuildingInput = {
  totalTransferPrice: TOTAL,
  transferDate: new Date("2026-02-16"),
  acquisitionDate: new Date("1999-05-24"),
  landArea: 85,
  buildingArea: 180.96,
  buildingFootprintArea: 90.48,
  transferLandPricePerSqm: 10_830_000,
  transferBuildingStdPrice: 20_629_440,
  acquisitionLandPricePerSqm: 2_800_000,
  acquisitionBuildingStdPrice: 28_144_700,
  zoneType: "commercial",
  isMetropolitan: true,
  buildingAcquisitionCause: "purchase",
  buildingAcquisitionDate: new Date("1999-05-24"),
  extensionInfo: {
    extensionDate: new Date("2010-05-01"),
    extensionAcquisitionCause: "newConstruction",
    transferExtensionBuildingStdPrice: 5_000_000,
    acquisitionExtensionBuildingStdPrice: 4_000_000,
  },
};

/** 계약서 건물 구분 기재 → 100% 판정 · 지분 몫 판정(종전) · 계약서 판정(지금). 지분 몫은 ④·route와 같은 규칙(토지만 버림 축소). */
function judgeAt(building: number, r: number) {
  const land = TOTAL - building;
  const full = buildGeneralBuildingAssetCards({ ...BASE, landTransferPrice: land, buildingTransferPrice: building });
  const share = { ...BASE, totalTransferPrice: applyRatio(TOTAL, r), landTransferPrice: applyRatio(land, r) };
  const legacy = buildGeneralBuildingAssetCards(share);
  const now = buildGeneralBuildingAssetCards({ ...share, saleSplitContract: { land, building, ownershipRatio: r } });
  return { full: full.saleSplitJudgment!, legacy: legacy.saleSplitJudgment!, now: now.saleSplitJudgment!, nowAlloc: now.allocation, legacyOut: legacy };
}

describe("증축 3-way — 지분 판정 = 100% 판정", () => {
  it("30% 경계 근처에서 지분 몫 판정이 갈리던 값을 찾아, 계약서 판정이 100% 결론과 같은지 본다", () => {
    const apportionedBuilding = buildGeneralBuildingAssetCards({ ...BASE, landTransferPrice: TOTAL - 1, buildingTransferPrice: 1 })
      .saleSplitJudgment!.apportioned!.building;
    let diverged = 0;
    // 건물 +30%·−30% 두 경계 모두 본다.
    for (const boundary of [Math.floor((apportionedBuilding * 13) / 10), Math.floor((apportionedBuilding * 7) / 10)])
    for (const r of [1 / 3, 2 / 3, 1 / 7]) {
      for (let b = boundary - 30; b <= boundary + 30; b++) {
        const j = judgeAt(b, r);
        expect(j.now.deemedUnclear, `r=${r} b=${b}`).toBe(j.full.deemedUnclear);
        expect(j.now.declared).toEqual(j.full.declared);
        expect(j.now.share!.ownershipRatio).toBe(r);
        if (j.legacy.deemedUnclear !== j.full.deemedUnclear) diverged++;
      }
    }
    // 이 구간에 종전 결함(지분 몫 판정이 100%와 갈림)이 실제로 있어야 이 테스트가 의미 있다.
    expect(diverged).toBeGreaterThan(0);
  });

  it("결론이 같으면 적용 가액(지분 몫)은 종전과 원 단위까지 같다(Q-2 a)", () => {
    for (const b of [20_000_000, 25_000_000, 40_000_000]) {
      const j = judgeAt(b, 1 / 3);
      expect(j.now.deemedUnclear).toBe(j.legacy.deemedUnclear);
      expect(j.nowAlloc).toEqual(j.legacyOut.allocation);
    }
  });
});

describe("judgeSaleSplitByContract — 결론은 계약서, 금액은 지분 몫", () => {
  const share = { shareDeclared: { land: 433_333_333, building: 100_000_000 }, shareApportioned: { land: 400_000_000, building: 133_333_333 } };
  it("계약서가 정확히 30% 차이면 불분명 — 지분 안분 가액 적용", () => {
    const c = judgeSaleSplitByContract({
      contract: { land: 1_300_000_000, building: 300_000_000, ownershipRatio: 1 / 3 },
      contractApportioned: { land: 1_200_000_000, building: 400_000_000 },
      ...share,
      era: "body_and_proviso",
    });
    // 건물 25% · 토지 8.3% 차이 — 30% 미만이라 구분 기재
    expect(c.deemedUnclear).toBe(false);
    expect(c.shareApplied).toEqual(share.shareDeclared);
    const d = judgeSaleSplitByContract({
      contract: { land: 1_320_000_000, building: 280_000_000, ownershipRatio: 1 / 3 },
      contractApportioned: { land: 1_200_000_000, building: 400_000_000 },
      ...share,
      era: "body_and_proviso",
    });
    // 건물 |280 − 400| = 120 = 400 × 30% — 정확히 30%도 발동
    expect(d.deemedUnclear).toBe(true);
    expect(d.shareApplied).toEqual(share.shareApportioned);
    expect(d.contract.applied).toEqual({ land: 1_200_000_000, building: 400_000_000 });
  });
});
