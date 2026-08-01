/**
 * 시·군·구 테이블 (5자리계) — 2026-08-01 전면 재생성 후 정합성 고정.
 *
 * 계획서: docs/02-design/features/sigungu-code-system-drift.plan.md (D-3 / X-3)
 *
 * 🔴 재생성 이전 결함: 하드코딩된 154건이 구 체계라 **43건이 다른 지역으로 매칭**됐다.
 *    서울은 도봉구부터 한 칸씩 밀려 `11680`이 「서초구」(현행 강남구)였다.
 *    조회 실패보다 오매칭이 위험했다 — 재촌 연접 판정이 엉뚱한 집합으로 이뤄졌다.
 */
import { describe, it, expect } from "vitest";
import { SIGUNGU_CODES, lookupSigungu, searchSigungu } from "@/lib/korean-law/sigungu-codes";
import { getAdjacentSigunguCodes } from "@/lib/geo/administrative-district-adjacency";

describe("[SGG] 시·군·구 테이블 — 현행 체계", () => {
  it("SGG-1: 전국 256건 (인접 매트릭스와 동수 — 같은 원본에서 생성)", () => {
    expect(SIGUNGU_CODES).toHaveLength(256);
  });

  it("🔴 SGG-2: 서울 코드가 밀려 있지 않다", () => {
    // 종전에는 11650→관악, 11680→서초, 11710→강남으로 한 칸씩 어긋나 있었다.
    expect(lookupSigungu("11650")?.fullName).toBe("서울특별시 서초구");
    expect(lookupSigungu("11680")?.fullName).toBe("서울특별시 강남구");
    expect(lookupSigungu("11710")?.fullName).toBe("서울특별시 송파구");
    expect(lookupSigungu("11740")?.fullName).toBe("서울특별시 강동구");
  });

  it("🔴 SGG-3: 검색 결과가 실제 코드와 일치한다 (사용자 오도 방지)", () => {
    // 「강남구」를 고르면 강남구 코드가 저장돼야 한다 — 종전엔 11710(현행 송파)이 나왔다.
    expect(searchSigungu("강남구").map((s) => s.code)).toEqual(["11680"]);
    expect(searchSigungu("서초구").map((s) => s.code)).toEqual(["11650"]);
  });

  it("SGG-4: 자치구 있는 시는 코드가 개별로 존재한다", () => {
    expect(lookupSigungu("41117")?.fullName).toBe("경기도 수원시 영통구");
    expect(lookupSigungu("41463")?.fullName).toBe("경기도 용인시 기흥구");
    expect(lookupSigungu("48123")?.fullName).toBe("경상남도 창원시 성산구");
  });

  it("SGG-5: 세종은 시·도 자체가 시·군·구다", () => {
    const sejong = lookupSigungu("36110");
    expect(sejong?.fullName).toBe("세종특별자치시");
    expect(sejong?.sidoName).toBe("세종특별자치시");
    expect(sejong?.name).toBe("세종특별자치시");
  });

  it("🔴 SGG-6: 전남·광주 통합 코드(12) — 구 46·29는 없다", () => {
    expect(lookupSigungu("12850")?.fullName).toBe("전남광주통합특별시 완도군");
    expect(lookupSigungu("46890")).toBeUndefined();
    expect(lookupSigungu("29110")).toBeUndefined();
  });

  it("SGG-7: 코드·이름 중복이 없다 (종전 광명시 41194·41285 중복 회귀)", () => {
    const codes = SIGUNGU_CODES.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
    const names = SIGUNGU_CODES.map((s) => s.fullName);
    expect(new Set(names).size).toBe(names.length);
  });

  it("SGG-8: 모든 코드가 5자리 숫자다 (NBL 5자리계 규약)", () => {
    for (const s of SIGUNGU_CODES) expect(s.code).toMatch(/^\d{5}$/);
  });

  it("🔴 SGG-9: adjacentCodes가 인접 매트릭스와 일치한다 (두 테이블 재드리프트 방지)", () => {
    for (const s of SIGUNGU_CODES) {
      const fromMatrix = getAdjacentSigunguCodes(`${s.code}00000`).map((c) => c.slice(0, 5));
      expect(new Set(s.adjacentCodes)).toEqual(new Set(fromMatrix));
    }
  });

  it("SGG-10: adjacentCodes는 전부 실재 코드이고 자기 자신을 포함하지 않는다", () => {
    for (const s of SIGUNGU_CODES) {
      expect(s.adjacentCodes).not.toContain(s.code);
      for (const a of s.adjacentCodes) expect(lookupSigungu(a)).toBeDefined();
    }
  });

  it("SGG-11: 인접은 대칭이다", () => {
    for (const s of SIGUNGU_CODES) {
      for (const a of s.adjacentCodes) {
        expect(lookupSigungu(a)!.adjacentCodes).toContain(s.code);
      }
    }
  });
});
