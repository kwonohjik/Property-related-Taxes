/**
 * Zod 스키마 검증 테스트 — 입력 유효성 경계값
 */

import { describe, it, expect } from "vitest";
import {
  searchLawInputSchema,
  lawTextInputSchema,
  searchDecisionsInputSchema,
  chainInputSchema,
  DECISION_DOMAINS,
  CHAIN_TYPES,
} from "@/lib/korean-law/types";

describe("lib/korean-law/types — Zod 스키마", () => {
  describe("searchLawInputSchema", () => {
    it("기본 limit=5", () => {
      const parsed = searchLawInputSchema.parse({ q: "소득세법" });
      expect(parsed.limit).toBe(5);
    });

    it("빈 문자열 거부", () => {
      expect(() => searchLawInputSchema.parse({ q: "" })).toThrow();
    });

    it("limit 초과 거부", () => {
      expect(() => searchLawInputSchema.parse({ q: "소득세법", limit: "100" })).toThrow();
    });

    it("limit 문자열 자동 변환", () => {
      const parsed = searchLawInputSchema.parse({ q: "소득세법", limit: "10" });
      expect(parsed.limit).toBe(10);
    });
  });

  describe("lawTextInputSchema", () => {
    it("필수 필드 모두 요구", () => {
      expect(() => lawTextInputSchema.parse({ lawName: "소득세법" })).toThrow();
      expect(() => lawTextInputSchema.parse({ articleNo: "제89조" })).toThrow();
    });

    it("정상 입력 통과", () => {
      const parsed = lawTextInputSchema.parse({ lawName: "소득세법", articleNo: "제89조" });
      expect(parsed.lawName).toBe("소득세법");
      expect(parsed.articleNo).toBe("제89조");
    });
  });

  describe("searchDecisionsInputSchema", () => {
    it("domain 기본값 prec", () => {
      const parsed = searchDecisionsInputSchema.parse({ q: "양도세" });
      expect(parsed.domain).toBe("prec");
    });

    it("유효 도메인만 허용", () => {
      for (const d of DECISION_DOMAINS) {
        expect(() => searchDecisionsInputSchema.parse({ q: "x", domain: d })).not.toThrow();
      }
      expect(() => searchDecisionsInputSchema.parse({ q: "x", domain: "invalid" })).toThrow();
    });

    it("page/pageSize 기본값", () => {
      const parsed = searchDecisionsInputSchema.parse({ q: "x" });
      expect(parsed.page).toBe(1);
      expect(parsed.pageSize).toBe(10);
    });

    it("page 문자열 자동 변환", () => {
      const parsed = searchDecisionsInputSchema.parse({ q: "x", page: "3", pageSize: "20" });
      expect(parsed.page).toBe(3);
      expect(parsed.pageSize).toBe(20);
    });

    it("page 범위 벗어나면 거부", () => {
      expect(() => searchDecisionsInputSchema.parse({ q: "x", page: "0" })).toThrow();
      expect(() => searchDecisionsInputSchema.parse({ q: "x", page: "501" })).toThrow();
      expect(() => searchDecisionsInputSchema.parse({ q: "x", pageSize: "51" })).toThrow();
    });
  });

  describe("chainInputSchema", () => {
    it("8종 chain type 모두 허용", () => {
      for (const t of CHAIN_TYPES) {
        expect(() => chainInputSchema.parse({ type: t, query: "test" })).not.toThrow();
      }
    });

    it("미지원 type 거부", () => {
      expect(() => chainInputSchema.parse({ type: "unknown", query: "x" })).toThrow();
    });

    it("rawText 옵셔널", () => {
      const parsed = chainInputSchema.parse({ type: "document_review", query: "x" });
      expect(parsed.rawText).toBeUndefined();
    });
  });
});
