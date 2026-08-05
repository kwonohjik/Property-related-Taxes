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
  extractUnitText,
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

/**
 * 회귀: 법제처가 **목을 항 바로 아래에 평탄화**해 내려주는 응답 (2026-08-05 실측)
 *
 * 종전 파서는 `호.목`만 읽어서 이 형태의 목을 **통째로 버렸다**. 조문 본문에 목이
 * 없으니 목에 들어 있는 표현을 키워드로 쓴 검증 규칙은 **절대 통과할 수 없었다** —
 * `npm run verify:legal` 19건 실패(기존 규칙 11건 포함)가 전부 이 원인이었다.
 * 캐시가 실패를 오래 가려왔기 때문에 회귀 테스트를 남긴다.
 */
describe("korean-law-client — extractUnitText (항 아래 평탄화된 목)", () => {
  it("호 안에 중첩된 목을 읽는다", () => {
    const text = extractUnitText({
      조문번호: "168",
      조문키: "x",
      조문내용: "제168조의6(비사업용 토지의 기간기준) 본문",
      항: { 호: [{ 호번호: "1.", 호내용: "1. 첫째 호", 목: [{ 목번호: "가.", 목내용: "가. 중첩된 목" }] }] },
    });
    expect(text).toContain("가. 중첩된 목");
  });

  it("항 바로 아래에 평탄화된 목도 읽는다 (소득세법 시행령 §168의6 실제 형태)", () => {
    const text = extractUnitText({
      조문번호: "168",
      조문키: "0168061",
      조문내용: "제168조의6(비사업용 토지의 기간기준) 본문",
      항: {
        호: [
          { 호번호: "1.", 호내용: "1. 토지의 소유기간이 5년 이상인 경우에는 다음 각 목의 모두에 해당하는 기간" },
        ],
        목: [
          { 목번호: "가.", 목내용: "가. 양도일 직전 5년 중 2년을 초과하는 기간" },
          { 목번호: "나.", 목내용: "나. 양도일 직전 3년 중 1년을 초과하는 기간" },
          { 목번호: "다.", 목내용: "다. 토지의 소유기간의 100분의 40에 상당하는 기간을 초과하는 기간" },
        ],
      },
    });
    expect(text).toContain("양도일 직전 5년 중 2년을 초과하는 기간");
    expect(text).toContain("양도일 직전 3년 중 1년을 초과하는 기간");
    expect(text).toContain("토지의 소유기간의 100분의 40에 상당하는 기간을 초과하는 기간");
  });

  it("목이 없는 조문은 종전과 동일하게 조문내용·항·호만 반환", () => {
    const text = extractUnitText({
      조문번호: "1",
      조문키: "y",
      조문내용: "제1조(목적) 본문",
      항: [{ 항번호: "①", 항내용: "① 항 본문", 호: { 호번호: "1.", 호내용: "1. 호 본문" } }],
    });
    expect(text).toBe("제1조(목적) 본문\n① 항 본문\n1. 호 본문");
  });
});
