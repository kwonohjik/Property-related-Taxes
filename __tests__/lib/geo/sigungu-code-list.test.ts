/**
 * lib/geo/sigungu-code-list.ts — 시드 entry anchor
 *
 * 디자인 §5-1 SCL-1~5 kind 5종 검증.
 * Phase 1-A PR-1 골격 — KOEDB 전체 데이터 수신 후 entry 250+ 확장.
 */

import { describe, expect, it } from "vitest";
import {
  SIGUNGU_LIST,
  findSigungu,
  getSigunguListSize,
} from "@/lib/geo/sigungu-code-list";

describe("[SCL] 시·군·구 시드 entry — 5 kind 검증", () => {
  it("SCL-1: 광역시 자치구 — 강남구(1168000000) autonomous_district", () => {
    const e = findSigungu("1168000000");
    expect(e).toBeDefined();
    expect(e!.kind).toBe("autonomous_district");
    expect(e!.sidoName).toBe("서울특별시");
  });

  it("SCL-2: 일반시 — 수원시(4111000000) city", () => {
    const e = findSigungu("4111000000");
    expect(e).toBeDefined();
    expect(e!.kind).toBe("city");
  });

  it("SCL-3: 일반시 산하 일반구 — 수원 영통구(4111700000) general_district (광역시 일반구 없음)", () => {
    const e = findSigungu("4111700000");
    expect(e).toBeDefined();
    expect(e!.kind).toBe("general_district");
    // 광역시(서울·부산 등)는 모두 자치구 — 일반구는 일반시 산하만
    const generalDistricts = SIGUNGU_LIST.filter((s) => s.kind === "general_district");
    for (const gd of generalDistricts) {
      expect(gd.sidoName).not.toMatch(/특별시|광역시/);
    }
  });

  it("SCL-4: 특별자치시 — 세종(3611000000) special_self_governing_city", () => {
    const e = findSigungu("3611000000");
    expect(e).toBeDefined();
    expect(e!.kind).toBe("special_self_governing_city");
  });

  it("SCL-5: 행정시 — 제주시(5011000000)·서귀포시(5013000000) administrative_city", () => {
    const jeju = findSigungu("5011000000");
    const seogwipo = findSigungu("5013000000");
    expect(jeju!.kind).toBe("administrative_city");
    expect(seogwipo!.kind).toBe("administrative_city");
  });

  it("SCL-size: 시드 entry 10건+ (PR-1 KOEDB 전체 수신 시 240+ 확장)", () => {
    expect(getSigunguListSize()).toBeGreaterThanOrEqual(10);
  });

  it("SCL-code-format: 모든 entry 10자리 코드", () => {
    for (const e of SIGUNGU_LIST) {
      expect(e.code).toHaveLength(10);
      expect(e.code).toMatch(/^\d{10}$/);
    }
  });
});
