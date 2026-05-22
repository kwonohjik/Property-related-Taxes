/**
 * UI 통합 anchor — PR-E·F 자동 판정 헬퍼가 UI Toggle 컴포넌트와 정합 동작 검증
 *
 * 본 anchor는 UnlistedStockV2Card의 handleRealEstateHeavyChange / handleSection22ModeChange
 * 로직과 동일 의사결정 트리를 검증한다 (UI useMemo 호출 + 모드별 도출).
 *
 * 검증 대상 (UI 통합 디자인 v3 §6 + plan v3 §5-0):
 *   UI-EF-1: realEstateHeavyMode="auto" + 자산 50% 정확 → isRealEstateHeavy=true 자동 도출
 *   UI-EF-2: realEstateHeavyMode="manual_on" → true override (자산 입력 무시)
 *   UI-EF-3: realEstateHeavyMode="manual_off" → false override
 *   UI-E-1: §22② auto 모드 — 사례 6 52% → ON
 *   UI-E-2: §22② manual_off override
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-ui-integration.plan.md §5-0
 * Design: docs/02-design/features/inheritance-unlisted-stock-valuation-ui-integration.design.md §6
 */

import { describe, it, expect } from "vitest";
import {
  deriveSection22MajorShareholder,
  judgeIsRealEstateHeavy,
} from "@/lib/tax-engine/property-valuation/auto-judgment";

type RealEstateHeavyMode = "auto" | "manual_on" | "manual_off";
type Section22Mode = "auto" | "manual_on" | "manual_off";

// UI Toggle 의사결정 트리 (UnlistedStockV2Card.handleRealEstateHeavyChange 정합)
function deriveAppliedRealEstateHeavy(input: {
  mode: RealEstateHeavyMode;
  totalAssets: number;
  realEstateAssets: number;
}): boolean {
  if (input.mode === "manual_on") return true;
  if (input.mode === "manual_off") return false;
  return judgeIsRealEstateHeavy({
    totalAssets: input.totalAssets,
    realEstateAssets: input.realEstateAssets,
  }).isRealEstateHeavy;
}

// UI Toggle 의사결정 트리 (MajorShareholderStockToggle appliedIsMajor 정합)
function deriveAppliedSection22Major(input: {
  mode: Section22Mode;
  ownedShares: number;
  totalShares: number;
}): boolean {
  if (input.mode === "manual_on") return true;
  if (input.mode === "manual_off") return false;
  return deriveSection22MajorShareholder({
    ownedShares: input.ownedShares,
    totalShares: input.totalShares,
  }).isSection22Major;
}

// ============================================================
// UI-EF-1·2·3: PR-F §54⑤ 3-state 모드별 도출
// ============================================================

describe("[UI-EF-1] PR-F auto 모드 — 자산 50% → isRealEstateHeavy=true", () => {
  it("UI-EF-1: 50% 정확 경계 → true", () => {
    expect(
      deriveAppliedRealEstateHeavy({
        mode: "auto",
        totalAssets: 1_000_000_000,
        realEstateAssets: 500_000_000,
      }),
    ).toBe(true);
  });

  it("UI-EF-1b: 49% → false (경계 미달)", () => {
    expect(
      deriveAppliedRealEstateHeavy({
        mode: "auto",
        totalAssets: 1_000_000_000,
        realEstateAssets: 490_000_000,
      }),
    ).toBe(false);
  });
});

describe("[UI-EF-2] PR-F manual_on → true override (자산 무시)", () => {
  it("UI-EF-2: 자산 입력 0이라도 manual_on 시 true", () => {
    expect(
      deriveAppliedRealEstateHeavy({
        mode: "manual_on",
        totalAssets: 0,
        realEstateAssets: 0,
      }),
    ).toBe(true);
  });

  it("UI-EF-2b: 부동산 80%지만 manual_off → false (auto 결과 무시)", () => {
    expect(
      deriveAppliedRealEstateHeavy({
        mode: "manual_off",
        totalAssets: 1_000_000_000,
        realEstateAssets: 800_000_000,
      }),
    ).toBe(false);
  });
});

// ============================================================
// UI-E-1·2: PR-E §22② 3-state 모드별 도출
// ============================================================

describe("[UI-E-1] PR-E §22② auto 모드 — 사례 6 52% → ON", () => {
  it("UI-E-1: 사례 6 26,000/50,000 = 52% → §22② 최대주주 ON", () => {
    expect(
      deriveAppliedSection22Major({
        mode: "auto",
        ownedShares: 26_000,
        totalShares: 50_000,
      }),
    ).toBe(true);
  });

  it("UI-E-1b: 20% → 미달", () => {
    expect(
      deriveAppliedSection22Major({
        mode: "auto",
        ownedShares: 10_000,
        totalShares: 50_000,
      }),
    ).toBe(false);
  });
});

describe("[UI-E-2] PR-E manual override", () => {
  it("UI-E-2: 20% + manual_on → true (자동 판정 우회)", () => {
    expect(
      deriveAppliedSection22Major({
        mode: "manual_on",
        ownedShares: 10_000,
        totalShares: 50_000,
      }),
    ).toBe(true);
  });

  it("UI-E-2b: 80% + manual_off → false", () => {
    expect(
      deriveAppliedSection22Major({
        mode: "manual_off",
        ownedShares: 40_000,
        totalShares: 50_000,
      }),
    ).toBe(false);
  });
});
