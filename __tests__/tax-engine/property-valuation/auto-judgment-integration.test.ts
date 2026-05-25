/**
 * UI 통합 anchor — PR-E §22② 자동 판정 헬퍼가 UI Toggle 컴포넌트와 정합 동작 검증
 *
 * 본 anchor는 MajorShareholderStockToggle의 appliedIsMajor 로직과 동일 의사결정 트리를 검증한다.
 *
 * 검증 대상 (UI 통합 디자인 v3 §6 + plan v3 §5-0):
 *   UI-E-1: §22② auto 모드 — 사례 6 52% → ON
 *   UI-E-2: §22② manual_off override
 *
 * §54⑤ 부동산과다보유 판정은 사용자 ON/OFF 직접 지정 (UI ToggleCard) — 자동 판정 헬퍼 제거.
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-ui-integration.plan.md §5-0
 * Design: docs/02-design/features/inheritance-unlisted-stock-valuation-ui-integration.design.md §6
 */

import { describe, it, expect } from "vitest";
import { deriveSection22MajorShareholder } from "@/lib/tax-engine/property-valuation/auto-judgment";

type Section22Mode = "auto" | "manual_on" | "manual_off";

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
