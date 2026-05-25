/**
 * PR-E 후속 anchor — §22② 최대주주 자동 판정
 *
 * 검증 대상 (계획서 §3 PR-E + 디자인 §1 E-1·E-2):
 *
 *   E-1: 사례 6 26,000/50,000 (52%) → §22② 최대주주 자동 ON
 *   E-2: 10,000/50,000 (20%) → §22② 미달
 *   E-3: threshold override (50% → 30%) — 사용자 친족 합산 시나리오
 *
 * 본 헬퍼는 §22②와 §63③ 개념 분리를 명확히 한다:
 *   §22②: 추가공제 제외 (본 PR-E)
 *   §63③: 할증평가 (선행 PR max-shareholder-premium 별도 모듈)
 *
 * §54⑤ 부동산과다보유 판정은 사용자 ON/OFF 직접 지정 (UI ToggleCard) — 자동 판정 헬퍼 제거.
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-followup.plan.md §3 PR-E
 * Design: docs/02-design/features/inheritance-unlisted-stock-valuation-followup.design.md §1·§6-3
 */

import { describe, it, expect } from "vitest";
import { deriveSection22MajorShareholder } from "@/lib/tax-engine/property-valuation/auto-judgment";

// ============================================================
// PR-E — §22② 최대주주 자동 도출
// ============================================================

describe("[E-1·E-2] §22② 최대주주 자동 도출 (보유지분 기준)", () => {
  it("E-1: 사례 6 26,000/50,000 = 52% → §22② 최대주주 자동 ON", () => {
    const result = deriveSection22MajorShareholder({
      ownedShares: 26_000,
      totalShares: 50_000,
    });

    expect(result.isSection22Major).toBe(true);
    expect(result.ownershipRatio).toBeCloseTo(0.52, 4);
    expect(result.source).toBe("auto");
  });

  it("E-2: 10,000/50,000 = 20% → 미달 (false)", () => {
    const result = deriveSection22MajorShareholder({
      ownedShares: 10_000,
      totalShares: 50_000,
    });

    expect(result.isSection22Major).toBe(false);
    expect(result.ownershipRatio).toBeCloseTo(0.2, 4);
  });

  it("E-3: 50% 정확 경계 → true (≥ 50%)", () => {
    const result = deriveSection22MajorShareholder({
      ownedShares: 25_000,
      totalShares: 50_000,
    });
    expect(result.isSection22Major).toBe(true);
    expect(result.ownershipRatio).toBe(0.5);
  });

  it("E-4: threshold override (30%) — 사용자 친족 합산 시나리오", () => {
    const result = deriveSection22MajorShareholder({
      ownedShares: 15_000,
      totalShares: 50_000,
      threshold: 0.3,
    });

    expect(result.ownershipRatio).toBeCloseTo(0.3, 4);
    expect(result.isSection22Major).toBe(true); // 30% 임계
  });

  it("E-5: totalShares=0 안전 처리 → false (0 division 가드)", () => {
    const result = deriveSection22MajorShareholder({
      ownedShares: 1_000,
      totalShares: 0,
    });

    expect(result.isSection22Major).toBe(false);
    expect(result.ownershipRatio).toBe(0);
  });
});

