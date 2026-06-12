/**
 * 레거시 korean-law-client 조문 본문 정규화 단위 테스트
 *
 * 회귀: 법인세법 §55(세율) 표 — 호내용 중첩배열 + <img> 인라인 →
 *   ① 콤마 뭉갬(String(array)) ② <img> 노출 ③ title 헤더 중복 버그 수정.
 */

import { describe, it, expect } from "vitest";
import {
  normalizeContent,
  stripImgTags,
  parseTitleFromHeader,
} from "@/lib/legal-verification/korean-law-client";

describe("korean-law-client — stripImgTags", () => {
  it("인라인 <img> / </img> 제거", () => {
    expect(stripImgTags('앞<img src="http://x/flDownload.do?flSeq=1" alt="a" >뒤')).toBe("앞뒤");
    expect(stripImgTags("표</img>끝")).toBe("표끝");
  });
  it("박스 표 문자는 보존", () => {
    expect(stripImgTags("┌──┬──┐│과세표준│세율│")).toBe("┌──┬──┐│과세표준│세율│");
  });
});

describe("korean-law-client — parseTitleFromHeader", () => {
  it("헤더 괄호 안 제목 추출", () => {
    expect(parseTitleFromHeader("제55조(세율)")).toBe("세율");
    expect(parseTitleFromHeader("제18조의2(가업상속공제) ① ...")).toBe("가업상속공제");
  });
  it("괄호 없으면 빈 문자열", () => {
    expect(parseTitleFromHeader("제55조 본문만")).toBe("");
  });
});

describe("korean-law-client — normalizeContent (호내용 중첩배열·img)", () => {
  it("중첩배열을 콤마 아닌 줄바꿈으로 평탄화 + img 제거", () => {
    // §55 호내용 실제 형태: [[ "1. ...", " ", "<img ...>", "표행1", "표행2" ]]
    const hoContent = [
      [
        "1.  내국법인의 경우",
        " ",
        '<img src="http://www.law.go.kr/flDownload.do?flSeq=147242997" alt="img" >',
        "┌───────┬─────┐",
        "│과세표준│세율│",
      ],
    ];
    const out = normalizeContent(hoContent);
    expect(out).not.toContain("<img");
    expect(out).not.toContain(","); // 콤마 뭉갬 없음
    expect(out).toContain("1.  내국법인의 경우");
    expect(out).toContain("│과세표준│세율│"); // 표는 보존
    // 줄바꿈으로 구분
    expect(out.split("\n").length).toBeGreaterThan(1);
  });

  it("순수 <img> 배열 항목은 필터", () => {
    expect(normalizeContent(['<img src="x">', "본문"])).toBe("본문");
  });

  it("문자열 인라인 img 제거", () => {
    expect(normalizeContent('본문<img src="x">계속')).toBe("본문계속");
  });
});
