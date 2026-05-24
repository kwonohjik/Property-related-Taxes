/**
 * VM-1 ~ VM-8 — verify-matrix.ts 자기검증 anchor.
 *
 * 계획서: docs/00-pm/inheritance-farming-build-scripts-prefab.plan.md v2 §5·§7-2
 */

import { describe, it, expect } from "vitest";
import {
  verifyMatrix,
  KNOWN_ADJACENT,
  KNOWN_NON_ADJACENT,
  ISOLATED_WHITELIST,
} from "../../scripts/verify-matrix-helpers";
import type { SigunguEntry } from "@/lib/geo/sigungu-code-list";

const ANY: SigunguEntry["kind"] = "city";

function makeEntry(code: string): SigunguEntry {
  return { code, fullName: `자산 ${code}`, sidoName: "X", sigunguName: "Y", kind: ANY };
}

describe("VM: verifyMatrix", () => {
  it("VM-0: 빈 adjacency (Phase 1·2 미완) → ok=true (V-1·V-4 skip)", () => {
    const result = verifyMatrix({}, [], "0000-00-00");
    expect(result.ok).toBe(true);
    expect(result.summary.entryCount).toBe(0);
  });

  it("VM-1: entry 수 불일치 → V-1 결함", () => {
    const result = verifyMatrix(
      { "1168000000": [], "1165000000": [] },
      [makeEntry("1168000000")],
      "2026-05-24",
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("V-1"))).toBe(true);
  });

  it("VM-2: 비대칭 → V-2 결함", () => {
    const adj: Record<string, string[]> = {
      "1168000000": ["1165000000"],
      "1165000000": [], // 비대칭
    };
    const result = verifyMatrix(
      adj,
      [makeEntry("1168000000"), makeEntry("1165000000")],
      "2026-05-24",
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("V-2"))).toBe(true);
  });

  it("VM-3: 자기-인접 → V-3 결함", () => {
    const adj: Record<string, string[]> = {
      "1168000000": ["1168000000"],
    };
    const result = verifyMatrix(
      adj,
      [makeEntry("1168000000")],
      "2026-05-24",
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("V-3"))).toBe(true);
  });

  it("VM-4: 240 미만 entry → V-4 경고", () => {
    const adj: Record<string, string[]> = { "1111000000": [] };
    const list = [makeEntry("1111000000")];
    // entry 1건 → 240 미만 + 1건 < ISOLATED_WHITELIST 아닐 시 V-7
    const result = verifyMatrix(adj, list, "2026-05-24");
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("V-4"))).toBe(true);
  });

  it("VM-5: known 인접 미적용 → V-5 결함", () => {
    const adj: Record<string, string[]> = {};
    for (const code of [
      "1168000000", "1165000000", "1171000000", "1174000000",
      "2611000000", "2614000000", "4111000000", "4113000000", "4119000000",
    ]) {
      adj[code] = [];
    }
    const list = Object.keys(adj).map(makeEntry);
    const result = verifyMatrix(adj, list, "2026-05-24");
    // 강남↔서초 등 known 인접이 빠져있으므로 V-5 결함
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("V-5"))).toBe(true);
  });

  it("VM-6: known 비인접 false positive → V-6 결함", () => {
    // 서울 강남 ↔ 부산 중구를 잘못 인접 등록
    const adj: Record<string, string[]> = {
      "1168000000": ["2611000000"],
      "2611000000": ["1168000000"],
    };
    const list = [makeEntry("1168000000"), makeEntry("2611000000")];
    const result = verifyMatrix(adj, list, "2026-05-24");
    expect(result.errors.some((e) => e.includes("V-6"))).toBe(true);
  });

  it("VM-7: 비-화이트리스트 고립 → V-7 결함", () => {
    const adj: Record<string, string[]> = { "1111000000": [] }; // 종로구가 고립?
    const list = [makeEntry("1111000000")];
    const result = verifyMatrix(adj, list, "2026-05-24");
    expect(result.errors.some((e) => e.includes("V-7"))).toBe(true);
  });

  it("VM-7b: 화이트리스트 고립 (제주시) → V-7 통과", () => {
    const adj: Record<string, string[]> = { "5011000000": [] };
    const list = [makeEntry("5011000000")];
    const result = verifyMatrix(adj, list, "2026-05-24");
    // V-7 결함 없음
    expect(result.errors.filter((e) => e.includes("V-7"))).toEqual([]);
  });

  it("VM-8: MATRIX_VERSION='0000-00-00' + entry > 0 → V-8 결함", () => {
    const adj: Record<string, string[]> = { "5011000000": [] };
    const result = verifyMatrix(adj, [makeEntry("5011000000")], "0000-00-00");
    expect(result.errors.some((e) => e.includes("V-8"))).toBe(true);
  });

  it("VM-meta: KNOWN_ADJACENT·KNOWN_NON_ADJACENT·ISOLATED_WHITELIST 메타데이터 sanity check", () => {
    expect(KNOWN_ADJACENT.length).toBeGreaterThanOrEqual(5);
    expect(KNOWN_NON_ADJACENT.length).toBeGreaterThanOrEqual(5);
    expect(ISOLATED_WHITELIST.length).toBeGreaterThanOrEqual(5);
    expect(ISOLATED_WHITELIST).toContain("5011000000"); // 제주시
    expect(ISOLATED_WHITELIST).toContain("4794000000"); // 울릉군
  });
});
