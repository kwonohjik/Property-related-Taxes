/**
 * 구조화 조문 인용 — 화면 표기 · 조회용 조문 번호 · 항 자르기(원숫자 ①~㉟와 현행 경로의 꺾쇠 `<16>` 둘 다).
 */
import { describe, it, expect } from "vitest";
import { articleNoOf, formatStatuteRef, sliceParagraph } from "@/lib/one-house-ai/statute-ref";

describe("formatStatuteRef · articleNoOf", () => {
  it.each([
    [{ law: "소득세법 시행령", article: 155, paragraph: 20 }, "소득세법 시행령 §155⑳"],
    [{ law: "소득세법 시행령", article: 155, paragraph: 21 }, "소득세법 시행령 §155㉑"],
    [{ law: "소득세법", article: 89, paragraph: 1, item: 3 }, "소득세법 §89①3호"],
    [{ law: "소득세법 시행령", article: 156, articleSub: 2 }, "소득세법 시행령 §156의2"],
    [{ law: "소득세법 시행령", article: 155, paragraph: 40 }, "소득세법 시행령 §155제40항"],
  ])("%j → %s", (ref, text) => expect(formatStatuteRef(ref)).toBe(text));

  it("조회용 번호", () => {
    expect(articleNoOf({ law: "소득세법 시행령", article: 156, articleSub: 2 })).toBe("제156조의2");
    expect(articleNoOf({ law: "소득세법", article: 89 })).toBe("제89조");
  });
});

describe("sliceParagraph", () => {
  const circled = "제155조(1세대1주택의 특례) ① 첫째 항\n② 둘째 항\n⑳ 스무째 항\n㉑ 1세대가 장기임대주택의\n㉒ 다음 항";
  const angle = "제155조(1세대1주택의 특례) ① 첫째 항\n⑮ 열다섯째\n<16>제1항을 적용할 때\n<21> 1세대가 장기임대주택의\n<22> 다음 항";

  it("원숫자 경계 — 그 항부터 다음 항 직전까지", () => {
    expect(sliceParagraph(circled, 21)).toBe("㉑ 1세대가 장기임대주택의");
    expect(sliceParagraph(circled, 2)).toBe("② 둘째 항");
    expect(sliceParagraph(circled, 22)).toBe("㉒ 다음 항");
  });

  it("현행 경로의 꺾쇠 표기도 같은 경계로 본다", () => {
    expect(sliceParagraph(angle, 21)).toBe("<21> 1세대가 장기임대주택의");
    expect(sliceParagraph(angle, 15)).toBe("⑮ 열다섯째");
    expect(sliceParagraph(angle, 16)).toBe("<16>제1항을 적용할 때");
  });

  it("없는 항은 null · 항 표지가 없는 단일 문단 조문의 1항은 본문 전체", () => {
    expect(sliceParagraph(circled, 30)).toBeNull();
    expect(sliceParagraph("제1조(목적) 이 법은 …", 1)).toBe("제1조(목적) 이 법은 …");
    expect(sliceParagraph("제1조(목적) 이 법은 …", 2)).toBeNull();
  });
});
