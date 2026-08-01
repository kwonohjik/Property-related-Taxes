/**
 * 시·군·구 코드 별칭 (X-1) — 전남·광주 통합 2026-07-01.
 *
 * 계획서: docs/02-design/features/sigungu-code-system-drift.plan.md
 *
 * 별칭이 필요한 이유는 「과거 양도」다 — 주소검색은 항상 현행 코드를 주는데
 * 판정 집합(조정지역 이력·인구감소지역)은 그 시점 기준 구 코드로 남아 있다.
 */
import { describe, it, expect } from "vitest";
import {
  JEONNAM_GWANGJU_ALIASES,
  normalizeSigunguCode,
  expandSigunguAliases,
  hasAnySigunguAlias,
} from "@/lib/geo/sigungu-code-alias";
import { lookupSigungu } from "@/lib/korean-law/sigungu-codes";

describe("[ALIAS] 시·군·구 코드 별칭", () => {
  it("🔴 ALIAS-1: 매핑이 현행 테이블 이름과 일치한다 (손으로 적은 매핑 오류 방지)", () => {
    for (const a of JEONNAM_GWANGJU_ALIASES) {
      const cur = lookupSigungu(a.current);
      expect(cur, `현행 코드 ${a.current}(${a.name})가 테이블에 없다`).toBeDefined();
      expect(cur!.name, `${a.legacy}→${a.current} 매핑`).toBe(a.name);
    }
  });

  it("ALIAS-2: 구 코드는 현행 테이블에 없다 (개편 전 코드임을 확인)", () => {
    for (const a of JEONNAM_GWANGJU_ALIASES) {
      expect(lookupSigungu(a.legacy), `${a.legacy}는 구 코드여야 한다`).toBeUndefined();
    }
  });

  it("ALIAS-3: legacy·current 모두 중복이 없다", () => {
    const legacy = JEONNAM_GWANGJU_ALIASES.map((a) => a.legacy);
    const current = JEONNAM_GWANGJU_ALIASES.map((a) => a.current);
    expect(new Set(legacy).size).toBe(legacy.length);
    expect(new Set(current).size).toBe(current.length);
  });

  it("normalizeSigunguCode: 구 → 현행", () => {
    expect(normalizeSigunguCode("46890")).toBe("12850"); // 완도군
    expect(normalizeSigunguCode("29110")).toBe("12210"); // 광주 동구
  });

  it("normalizeSigunguCode: 현행은 그대로 · 미개편 지역도 그대로", () => {
    expect(normalizeSigunguCode("12850")).toBe("12850");
    expect(normalizeSigunguCode("11680")).toBe("11680"); // 서울 강남구
  });

  it("normalizeSigunguCode: 10자리(행안부 표준·PNU 앞10)도 받는다", () => {
    expect(normalizeSigunguCode("4689010100")).toBe("12850");
    expect(normalizeSigunguCode("1285025022100010000")).toBe("12850"); // PNU 19자리
  });

  it("normalizeSigunguCode: 5자리 미만·빈값은 null (판정 불가를 코드로 표현)", () => {
    expect(normalizeSigunguCode("1168")).toBeNull();
    expect(normalizeSigunguCode("")).toBeNull();
    expect(normalizeSigunguCode(undefined)).toBeNull();
  });

  it("🔴 expandSigunguAliases: 어느 쪽을 넣어도 양쪽이 나온다", () => {
    expect(expandSigunguAliases("46890")).toEqual(["12850", "46890"]);
    expect(expandSigunguAliases("12850")).toEqual(["12850", "46890"]);
  });

  it("expandSigunguAliases: 미개편 지역은 자기 자신만", () => {
    expect(expandSigunguAliases("11680")).toEqual(["11680"]);
  });

  it("hasAnySigunguAlias: 집합이 어느 체계로 적혀 있든 매칭된다", () => {
    const legacySet = new Set(["46890"]); // 구 코드로 작성된 판정 집합
    const currentSet = new Set(["12850"]); // 현행 코드로 작성된 집합
    for (const set of [legacySet, currentSet]) {
      expect(hasAnySigunguAlias(set, "46890")).toBe(true);
      expect(hasAnySigunguAlias(set, "12850")).toBe(true);
      expect(hasAnySigunguAlias(set, "1285010100")).toBe(true); // 10자리
    }
    expect(hasAnySigunguAlias(legacySet, "11680")).toBe(false); // 무차별 매칭 아님
    expect(hasAnySigunguAlias(legacySet, undefined)).toBe(false);
  });
});
