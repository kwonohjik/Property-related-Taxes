/**
 * date-parser 테스트 — 네트워크 없음
 *
 * 주의: "올해"/"작년" 같은 상대 키워드는 Date.now() 의존 → mock 필요.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseDateRange } from "@/lib/korean-law/date-parser";

describe("date-parser: parseDateRange", () => {
  describe("범위 형식 (YYYY년부터 YYYY년)", () => {
    it("'2020년부터 2023년' → 전체 범위", () => {
      const r = parseDateRange("2020년부터 2023년 종부세");
      expect(r.fromDate).toBe("20200101");
      expect(r.toDate).toBe("20231231");
      expect(r.cleanedQuery).toBe("종부세");
    });

    it("'2020~2023' 범위", () => {
      const r = parseDateRange("2020~2023 판례");
      expect(r.fromDate).toBe("20200101");
      expect(r.toDate).toBe("20231231");
      expect(r.cleanedQuery).toBe("판례");
    });

    it("'2020-2023' 대시 범위", () => {
      const r = parseDateRange("2020-2023 양도세");
      expect(r.fromDate).toBe("20200101");
      expect(r.toDate).toBe("20231231");
    });
  });

  describe("이후/이전", () => {
    it("'2020년 이후' → fromDate만", () => {
      const r = parseDateRange("2020년 이후 양도세");
      expect(r.fromDate).toBe("20200101");
      expect(r.toDate).toBeUndefined();
      expect(r.cleanedQuery).toBe("양도세");
    });

    it("'2023년 이전' → toDate만", () => {
      const r = parseDateRange("2023년 이전 상속");
      expect(r.fromDate).toBeUndefined();
      expect(r.toDate).toBe("20231231");
      expect(r.cleanedQuery).toBe("상속");
    });

    it("'2020년부터' 단독", () => {
      const r = parseDateRange("2020년부터 취득세");
      expect(r.fromDate).toBe("20200101");
      expect(r.toDate).toBeUndefined();
    });

    it("'2023년까지' 단독", () => {
      const r = parseDateRange("2023년까지 증여");
      expect(r.toDate).toBe("20231231");
    });
  });

  describe("최근 N년 / N개월", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-18T00:00:00Z"));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("'최근 3년' → 2024~오늘", () => {
      const r = parseDateRange("최근 3년 양도세 중과");
      expect(r.fromDate).toBe("20240101");
      expect(r.toDate).toBe("20260418");
      expect(r.cleanedQuery).toBe("양도세 중과");
    });

    it("'최근 1년'", () => {
      const r = parseDateRange("최근 1년 판례");
      expect(r.fromDate).toBe("20260101");
      expect(r.toDate).toBe("20260418");
    });

    it("'최근 6개월'", () => {
      const r = parseDateRange("최근 6개월 취득세");
      expect(r.fromDate).toBe("20251018");
      expect(r.toDate).toBe("20260418");
      expect(r.cleanedQuery).toBe("취득세");
    });
  });

  describe("시기 키워드", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-18T00:00:00Z"));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("'올해' → 올해 1월 1일 ~ 오늘", () => {
      const r = parseDateRange("올해 증여세");
      expect(r.fromDate).toBe("20260101");
      expect(r.toDate).toBe("20260418");
    });

    it("'작년' → 작년 전체", () => {
      const r = parseDateRange("작년 양도세");
      expect(r.fromDate).toBe("20250101");
      expect(r.toDate).toBe("20251231");
    });

    it("'재작년' → 재작년 전체", () => {
      const r = parseDateRange("재작년 상속");
      expect(r.fromDate).toBe("20240101");
      expect(r.toDate).toBe("20241231");
    });

    it("'올해 상반기' → 1~6월", () => {
      const r = parseDateRange("올해 상반기 종부세");
      expect(r.fromDate).toBe("20260101");
      expect(r.toDate).toBe("20260630");
      expect(r.cleanedQuery).toBe("종부세");
    });

    it("'올해 하반기' → 7~12월", () => {
      const r = parseDateRange("올해 하반기 취득");
      expect(r.fromDate).toBe("20260701");
      expect(r.toDate).toBe("20261231");
    });

    it("'지난달' → 전월 전체", () => {
      const r = parseDateRange("지난달 판례");
      expect(r.fromDate).toBe("20260301");
      expect(r.toDate).toBe("20260331");
    });

    it("'이번달' → 이달 1일 ~ 오늘", () => {
      const r = parseDateRange("이번달 결정");
      expect(r.fromDate).toBe("20260401");
      expect(r.toDate).toBe("20260418");
    });
  });

  describe("단일 연도", () => {
    it("'2020년 양도세' → 2020년 전체", () => {
      const r = parseDateRange("2020년 양도세");
      expect(r.fromDate).toBe("20200101");
      expect(r.toDate).toBe("20201231");
      expect(r.cleanedQuery).toBe("양도세");
    });
  });

  describe("날짜 없는 쿼리", () => {
    it("날짜 표현 없으면 cleanedQuery == query", () => {
      const r = parseDateRange("소득세법 제89조");
      expect(r.fromDate).toBeUndefined();
      expect(r.toDate).toBeUndefined();
      expect(r.cleanedQuery).toBe("소득세법 제89조");
    });

    it("빈 쿼리 → 빈 결과", () => {
      const r = parseDateRange("");
      expect(r.fromDate).toBeUndefined();
      expect(r.toDate).toBeUndefined();
      expect(r.cleanedQuery).toBe("");
    });

    it("범위 + 키워드 조합 (범위 우선)", () => {
      const r = parseDateRange("2020년부터 2023년 양도세 판례 다수");
      expect(r.fromDate).toBe("20200101");
      expect(r.toDate).toBe("20231231");
      expect(r.cleanedQuery).toBe("양도세 판례 다수");
    });
  });

  describe("엣지 케이스", () => {
    it("유효하지 않은 연도는 추출 안함", () => {
      const r = parseDateRange("1800년 양도");
      // 1800은 범위 밖 → 단일 연도 매칭 실패 / 다른 로직에서 제외
      expect(r.fromDate).toBeUndefined();
    });

    it("'최근 0년' / '최근 100년'은 범위 벗어나 매칭 안함", () => {
      const r = parseDateRange("최근 100년 양도세");
      expect(r.fromDate).toBeUndefined();
    });

    it("중첩 공백은 정리", () => {
      const r = parseDateRange("올해   양도세   판례");
      expect(r.cleanedQuery).toBe("양도세 판례");
    });
  });
});
