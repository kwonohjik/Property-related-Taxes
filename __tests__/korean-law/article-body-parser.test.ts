/**
 * article-body-parser 단위 테스트 — 박스 드로잉 표 → 구조화 테이블.
 * 실 데이터(소득세법 §55 세율표) 구조 기반.
 */

import { describe, it, expect } from "vitest";
import { parseArticleBody } from "@/lib/korean-law/article-body-parser";

const SEC55 = [
  "제55조(세율)",
  "①거주자의 종합소득에 대한 소득세는 다음의 세율을 적용한다.",
  "┌────────┬──────────────────────────┐",
  "│종합소득        │세   율                                             │",
  "│과세표준        │                                                    │",
  "├────────┼──────────────────────────┤",
  "│1,400만원 이하  │과세표준의 6퍼센트                                  │",
  "├────────┼──────────────────────────┤",
  "│1,400만원 초과  │84만원 + (1,400만원을 초과하는 금액의 15퍼센트)     │",
  "│5,000만원 이하  │                                                    │",
  "├────────┼──────────────────────────┤",
  "│10억원 초과     │3억8,406만원 + (10억원을 초과하는 금액의 45퍼센트)  │",
  "└────────┴──────────────────────────┘",
  "② 거주자의 퇴직소득에 대한 소득세는 ...",
].join("\n");

describe("article-body-parser", () => {
  it("텍스트/표/텍스트 세그먼트 분리", () => {
    const segs = parseArticleBody(SEC55);
    expect(segs.map((s) => s.type)).toEqual(["text", "table", "text"]);
  });

  it("표 헤더 + 행 — 여러 줄 셀 병합", () => {
    const segs = parseArticleBody(SEC55);
    const table = segs.find((s) => s.type === "table");
    expect(table).toBeDefined();
    if (table?.type !== "table") return;
    expect(table.headers).toEqual(["종합소득 과세표준", "세 율"]);
    expect(table.rows[0]).toEqual(["1,400만원 이하", "과세표준의 6퍼센트"]);
    // 여러 줄 셀 병합
    expect(table.rows[1]).toEqual([
      "1,400만원 초과 5,000만원 이하",
      "84만원 + (1,400만원을 초과하는 금액의 15퍼센트)",
    ]);
    expect(table.rows[2][0]).toBe("10억원 초과");
  });

  it("앞뒤 텍스트 보존", () => {
    const segs = parseArticleBody(SEC55);
    expect(segs[0].type === "text" && segs[0].content).toContain("제55조(세율)");
    expect(segs[2].type === "text" && segs[2].content).toContain("퇴직소득");
  });

  it("표 없는 본문 → 단일 텍스트", () => {
    const segs = parseArticleBody("제1조(목적) 이 법은 ...\n① 일반 조문 본문");
    expect(segs).toHaveLength(1);
    expect(segs[0].type).toBe("text");
  });

  it("논리 행 부족(헤더만) → 텍스트 폴백", () => {
    const onlyHeader = "┌──┬──┐\n│a│b│\n└──┴──┘";
    const segs = parseArticleBody(onlyHeader);
    // 행 < 2 → table 아님 → 텍스트
    expect(segs.every((s) => s.type === "text")).toBe(true);
  });

  it("빈 입력 → 빈 배열", () => {
    expect(parseArticleBody("")).toEqual([]);
  });
});
