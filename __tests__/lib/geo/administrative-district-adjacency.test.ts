/**
 * lib/geo/administrative-district-adjacency.ts — 매트릭스 골격 anchor
 *
 * Phase 1-C PR-2 미완 = 빈 매트릭스. resolver 동작은 정상.
 * 데이터 주입 후 ADJ-1~10 본격 anchor 활성 (계획서 §4-C.3).
 */

import { describe, expect, it } from "vitest";
import {
  getAdjacentSigunguCodes,
  getSigunguCount,
  isMatrixEmpty,
  MATRIX_VERSION,
} from "@/lib/geo/administrative-district-adjacency";

describe("[ADJ] 행정구역 인접 매트릭스 — Phase 1-C 진입 전 골격", () => {
  it("ADJ-skeleton-1: 빈 매트릭스 — 모든 코드 조회 시 빈 배열", () => {
    expect(getAdjacentSigunguCodes("1168000000")).toEqual([]);
    expect(getAdjacentSigunguCodes("9999999999")).toEqual([]);
  });

  it("ADJ-skeleton-2: getSigunguCount() === 0", () => {
    expect(getSigunguCount()).toBe(0);
  });

  it("ADJ-skeleton-3: isMatrixEmpty() === true (Phase 1-C 미완 신호)", () => {
    expect(isMatrixEmpty()).toBe(true);
  });

  it("ADJ-skeleton-4: MATRIX_VERSION placeholder = '0000-00-00'", () => {
    expect(MATRIX_VERSION).toBe("0000-00-00");
  });

  // Phase 1-C 완료 후 활성 anchor 예시 (계획서 §4-C.3 ADJ-1~10)
  // 현재는 skeleton 상태로 자동 skip되지 않음 — 데이터 주입 후 it.skip 해제
  it.skip("ADJ-1: 강남(1168) ↔ 서초(1165) — Phase 1-C 데이터 주입 후 활성", () => {
    expect(getAdjacentSigunguCodes("1168000000")).toContain("1165000000");
  });
});
