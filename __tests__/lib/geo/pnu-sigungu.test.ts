/**
 * lib/geo/pnu-sigungu.ts — PNU 5자리 ↔ 행안부 10자리 매핑 anchor
 *
 * 디자인 §3-5 PNU-1~10 (M1 정정 — vitest 형식).
 * 가설: PNU 앞 5자리 = 행안부 10자리 앞 5자리.
 * Phase 1-A KOEDB 수신 후 SIGUNGU_LIST에 등록 여부 동시 검증.
 */

import { describe, expect, it } from "vitest";
import { extractSigunguCodeFromPnu } from "@/lib/geo/pnu-sigungu";
import { findSigungu } from "@/lib/geo/sigungu-code-list";

const TEST_CASES = [
  { pnu5: "11680", expected: "1168000000", note: "서울 강남구" },
  { pnu5: "11650", expected: "1165000000", note: "서울 서초구" },
  { pnu5: "36110", expected: "3611000000", note: "세종특별자치시" },
  { pnu5: "50110", expected: "5011000000", note: "제주시" },
  { pnu5: "26260", expected: "2626000000", note: "부산 동래구" },
  { pnu5: "41117", expected: "4111700000", note: "수원 영통구 (일반구)" },
  { pnu5: "41463", expected: "4146300000", note: "용인 기흥구 (일반구)" },
  { pnu5: "11500", expected: "1150000000", note: "서울 강서구" },
  { pnu5: "41570", expected: "4157000000", note: "김포시" },
  { pnu5: "28710", expected: "2871000000", note: "인천 강화군" },
];

describe("[PNU] PNU 5자리 → 행안부 10자리", () => {
  TEST_CASES.forEach((c, i) => {
    it(`PNU-${i + 1}: ${c.note}`, () => {
      // pnu 19자리 시뮬: 앞 5자리 + 14자리 dummy
      const pnu19 = c.pnu5 + "10010001000" + "1234";
      expect(extractSigunguCodeFromPnu(pnu19)).toBe(c.expected);
      // 5자리 입력 직접 — pnu5만 입력해도 동작
      expect(extractSigunguCodeFromPnu(c.pnu5)).toBe(c.expected);
      // sigungu-code-list 등록 여부 (시드 entry 범위 내)
      const entry = findSigungu(c.expected);
      if (entry) {
        expect(entry.code).toBe(c.expected);
      }
    });
  });

  it("PNU-edge-1: undefined → undefined", () => {
    expect(extractSigunguCodeFromPnu(undefined)).toBeUndefined();
  });

  it("PNU-edge-2: 5자리 미만 → undefined", () => {
    expect(extractSigunguCodeFromPnu("1168")).toBeUndefined();
    expect(extractSigunguCodeFromPnu("")).toBeUndefined();
  });
});
