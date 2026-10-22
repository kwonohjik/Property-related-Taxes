/**
 * 결정례 검색 제목 `strip` — 마크업만 지우고 꺾쇠 글은 남긴다(계획서 law-citation-residuals F-7 · P-12).
 * 종전 `/<[^>]+>/g`는 해석례 제목 맨 앞의 「<○○법 시행령>」을 지웠다. 착수 전 이 동작을 지키는 테스트가 없었다(P0-3).
 */
import { describe, it, expect } from "vitest";
import { strip } from "@/lib/korean-law/client-core";

describe("strip — 결정례 검색 제목", () => {
  it("꺾쇠 글(법령명)은 제목의 일부로 남긴다", () => {
    expect(strip("<공중위생관리법 시행령> 제3조제1호의 해석")).toBe("<공중위생관리법 시행령> 제3조제1호의 해석");
  });

  it("마크업 태그·주석·&nbsp;는 지운다", () => {
    expect(strip("<strong>양도소득세</strong>&nbsp;부과처분<!-- x --> 취소 </b>")).toBe("양도소득세 부과처분 취소");
  });
});
