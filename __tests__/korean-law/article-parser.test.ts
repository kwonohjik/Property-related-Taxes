/**
 * 조문 파서 테스트 — 네트워크 호출 없음
 *
 * 검증 대상:
 *  - parseHangNumber: ①②③…⑳ 원숫자 및 일반 숫자 파싱
 *  - toCircledDigit: 숫자 → 원숫자 역변환
 *  - cleanHtml: HTML 엔티티 디코딩 순서(&amp; 마지막)
 *  - flattenContent: 중첩 배열/문자열/객체 평탄화
 *  - formatArticleUnit: 조문 헤더 파싱 + 본문 분리
 *  - buildJoCode: "제38조" → "003800"
 */

import { describe, it, expect } from "vitest";
import {
  parseHangNumber,
  toCircledDigit,
  cleanHtml,
  flattenContent,
  formatArticleUnit,
  buildJoCode,
} from "@/lib/korean-law/article-parser";

describe("article-parser: parseHangNumber", () => {
  it("원숫자 ① → 1", () => {
    expect(parseHangNumber("①")).toBe(1);
  });

  it("원숫자 ⑩ → 10", () => {
    expect(parseHangNumber("⑩")).toBe(10);
  });

  it("원숫자 ⑳ → 20", () => {
    expect(parseHangNumber("⑳")).toBe(20);
  });

  it("모든 원숫자 1~20 매핑", () => {
    const circled = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
    for (let i = 0; i < circled.length; i++) {
      expect(parseHangNumber(circled[i])).toBe(i + 1);
    }
  });

  it("일반 숫자 문자열 \"3\" → 3", () => {
    expect(parseHangNumber("3")).toBe(3);
  });

  it('"제3항" → 3', () => {
    expect(parseHangNumber("제3항")).toBe(3);
  });

  it('"3항" → 3', () => {
    expect(parseHangNumber("3항")).toBe(3);
  });

  it("공백 트림 후 매칭", () => {
    expect(parseHangNumber("  ②  ")).toBe(2);
  });

  it("undefined → NaN", () => {
    expect(parseHangNumber(undefined)).toBeNaN();
  });

  it("빈 문자열 → NaN", () => {
    expect(parseHangNumber("")).toBeNaN();
  });

  it("비숫자 문자열 → NaN", () => {
    expect(parseHangNumber("abc")).toBeNaN();
  });

  it("혼합: 원숫자 우선 적용", () => {
    expect(parseHangNumber("⑦ 항")).toBe(7);
  });
});

describe("article-parser: toCircledDigit", () => {
  it("1 → ①", () => {
    expect(toCircledDigit(1)).toBe("①");
  });

  it("20 → ⑳", () => {
    expect(toCircledDigit(20)).toBe("⑳");
  });

  it("범위 밖(21) → \"21\"", () => {
    expect(toCircledDigit(21)).toBe("21");
  });

  it("0 → \"0\"", () => {
    expect(toCircledDigit(0)).toBe("0");
  });
});

describe("article-parser: cleanHtml", () => {
  it("태그 제거", () => {
    expect(cleanHtml("<p>본문</p>")).toBe("본문");
  });

  it("&amp; 는 마지막에 처리(&amp;lt; → &lt;)", () => {
    expect(cleanHtml("&amp;lt;body&amp;gt;")).toBe("&lt;body&gt;");
  });

  it("&lt; &gt; 디코딩", () => {
    expect(cleanHtml("&lt;span&gt;")).toBe("<span>");
  });

  it("&nbsp; → 공백", () => {
    expect(cleanHtml("A&nbsp;B")).toBe("A B");
  });

  it("&quot; &#39; 디코딩", () => {
    expect(cleanHtml("&quot;hello&#39;s&quot;")).toBe('"hello\'s"');
  });

  it("img 태그 제거", () => {
    expect(cleanHtml('앞<img src="x">뒤')).toBe("앞뒤");
  });
});

describe("article-parser: flattenContent", () => {
  it("null → 빈 문자열", () => {
    expect(flattenContent(null)).toBe("");
  });

  it("문자열 → trim", () => {
    expect(flattenContent("  텍스트  ")).toBe("텍스트");
  });

  it("문자열 배열 → 줄바꿈 결합", () => {
    expect(flattenContent(["첫째", "둘째"])).toBe("첫째\n둘째");
  });

  it("중첩 배열 재귀 평탄화", () => {
    expect(flattenContent([["a", "b"], "c"])).toBe("a\nb\nc");
  });

  it("<img 포함 문자열은 제외", () => {
    expect(flattenContent(["<img src>", "본문"])).toBe("본문");
  });

  it("객체에서 조문내용 필드 추출", () => {
    expect(flattenContent({ 조문내용: "내용" })).toBe("내용");
  });
});

describe("article-parser: formatArticleUnit", () => {
  it("조문 헤더 + 본문 분리", () => {
    const unit = {
      조문내용: "제89조(양도소득세 비과세) 다음 각 호의 소득에 대해서는 ...",
      조문번호: "89",
    };
    const result = formatArticleUnit(unit);
    expect(result.articleNo).toBe("제89조");
    expect(result.title).toBe("양도소득세 비과세");
    expect(result.body.startsWith("다음 각 호")).toBe(true);
  });

  it("조문 헤더 괄호 없음", () => {
    const unit = { 조문내용: "제18조의2 본문만", 조문번호: "18의2" };
    const result = formatArticleUnit(unit);
    expect(result.articleNo).toBe("제18조의2");
    expect(result.title).toBe("");
  });

  it("항 배열 파싱 (①②③)", () => {
    const unit = {
      조문내용: "제95조(장기보유특별공제)",
      항: [
        { 항번호: "①", 항내용: "3년 이상 보유한 자산" },
        { 항번호: "②", 항내용: "공제액은 다음 각 호에 따라" },
      ],
    };
    const result = formatArticleUnit(unit);
    expect(result.hangs).toHaveLength(2);
    expect(result.hangs[0]).toEqual({ no: 1, text: "3년 이상 보유한 자산" });
    expect(result.hangs[1]).toEqual({ no: 2, text: "공제액은 다음 각 호에 따라" });
  });

  it("항·호·목까지 fullText 에 포함", () => {
    const unit = {
      조문내용: "제104조(세율)",
      항: [
        {
          항번호: "①",
          항내용: "양도소득세의 세율은",
          호: [
            { 호번호: "1", 호내용: "일반세율" },
            { 호번호: "2", 호내용: "중과세율" },
          ],
        },
      ],
    };
    const result = formatArticleUnit(unit);
    expect(result.fullText).toContain("일반세율");
    expect(result.fullText).toContain("중과세율");
  });
});

describe("article-parser: buildJoCode", () => {
  it("\"제38조\" → \"003800\"", () => {
    expect(buildJoCode("제38조")).toBe("003800");
  });

  it("\"제10조의2\" → \"001002\"", () => {
    expect(buildJoCode("제10조의2")).toBe("001002");
  });

  it("\"제104조\" → \"010400\"", () => {
    expect(buildJoCode("제104조")).toBe("010400");
  });

  it("숫자만 입력", () => {
    expect(buildJoCode("89")).toBe("008900");
  });

  it("파싱 실패 → null", () => {
    expect(buildJoCode("abc")).toBeNull();
  });

  it("범위 초과 조 → null", () => {
    expect(buildJoCode("제99999조")).toBeNull();
  });
});
