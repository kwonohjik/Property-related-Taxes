/**
 * normalizeArticleNo — 사용자 입력 조문번호 정규화
 */

import { describe, it, expect } from "vitest";
import { normalizeArticleNo } from "@/lib/korean-law/client";

describe("normalizeArticleNo", () => {
  it("숫자만 입력 → 제N조", () => {
    expect(normalizeArticleNo("21")).toBe("제21조");
    expect(normalizeArticleNo("89")).toBe("제89조");
    expect(normalizeArticleNo("104")).toBe("제104조");
  });

  it("조 접미사 → 제N조", () => {
    expect(normalizeArticleNo("21조")).toBe("제21조");
  });

  it("이미 완전한 형태 → 그대로", () => {
    expect(normalizeArticleNo("제21조")).toBe("제21조");
    expect(normalizeArticleNo("제89조")).toBe("제89조");
  });

  it("의N 접미사 포함", () => {
    expect(normalizeArticleNo("21의2")).toBe("제21조의2");
    expect(normalizeArticleNo("21조의2")).toBe("제21조의2");
    expect(normalizeArticleNo("제21조의2")).toBe("제21조의2");
    expect(normalizeArticleNo("제18조의3")).toBe("제18조의3");
  });

  it("공백 허용", () => {
    expect(normalizeArticleNo("제 21 조")).toBe("제21조");
    expect(normalizeArticleNo(" 89 ")).toBe("제89조");
  });

  it("파싱 불가한 입력은 원문 반환 (호출부에서 not-found 처리)", () => {
    expect(normalizeArticleNo("abc")).toBe("abc");
    expect(normalizeArticleNo("")).toBe("");
  });
});
