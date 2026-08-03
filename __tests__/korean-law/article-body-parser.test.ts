/**
 * article-body-parser 단위 테스트 — 박스 드로잉 표 → 구조화 테이블.
 * 실 데이터(소득세법 §55 세율표) 구조 기반.
 */

import { describe, it, expect } from "vitest";
import { parseArticleBody, restoreBoxTableLines } from "@/lib/korean-law/article-body-parser";

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

/**
 * 🔴 회귀 anchor — 법제처 API가 박스 표를 **개행 없이 한 줄로** 내려주는 응답 형태.
 *
 * 2026-08-03 실측: 소득세법 §55 실시간 조회 응답의 개행은 **5개**뿐인 반면
 * 2026-06 캐시본(`.legal-cache/article_*_제55조_v2.json`)은 **27개**였다. 파서가 줄 단위로
 * 표를 감지하므로 실시간 응답에서는 `parseArticleBody`가 `text,text`만 내고
 * **table 세그먼트가 0개**가 되어, 화면에 `┌───┬───┐`가 raw로 노출됐다.
 *
 * `.legal-cache/`는 `.gitignore` 대상이라 **캐시가 있는 개발 환경에서는 재현되지 않고**
 * 신규 배포·새 사용자·CI에서만 발현했다. CI E2E(`law-article-table-html` HTML-1)가 이것을
 * 잡아냈다.
 *
 * ⭐ 핵심은 단일 값이 아니라 **등식**이다 — 개행이 있든 없든 같은 결과여야 한다.
 */
describe("article-body-parser — 개행 없는 박스 표 (실시간 API 응답 형태)", () => {
  /**
   * 실시간 응답 형태 — **표 내부만** 개행이 없고 항 구분에는 남아 있다.
   * (`extractUnitText`가 항·호·목을 `join("\n")`으로 합치므로 항 경계 개행은 살아 있고,
   *  한 항 안의 박스 표가 통째로 한 줄이 된다. 실측 개행 5개.)
   */
  const LINES = SEC55.split("\n");
  const TOP = LINES.findIndex((l) => l.startsWith("┌"));
  const BOTTOM = LINES.findIndex((l) => l.startsWith("└"));
  const SEC55_PACKED = [
    ...LINES.slice(0, TOP - 1),
    LINES[TOP - 1] + LINES.slice(TOP, BOTTOM + 1).join(""),
    ...LINES.slice(BOTTOM + 1),
  ].join("\n");

  it("PACKED-1: 개행이 없어도 표를 인식한다 (종전에는 table 0개)", () => {
    const segs = parseArticleBody(SEC55_PACKED);
    expect(segs.filter((s) => s.type === "table")).toHaveLength(1);
  });

  it("PACKED-2: ⭐개행 유무와 무관하게 **같은 결과** (핵심 등식)", () => {
    expect(parseArticleBody(SEC55_PACKED)).toEqual(parseArticleBody(SEC55));
  });

  it("PACKED-3: 여러 줄 셀 병합·앞뒤 텍스트가 그대로 보존된다", () => {
    const segs = parseArticleBody(SEC55_PACKED);
    expect(segs.map((s) => s.type)).toEqual(["text", "table", "text"]);
    const table = segs.find((s) => s.type === "table");
    if (table?.type !== "table") throw new Error("table 세그먼트 없음");
    expect(table.headers).toEqual(["종합소득 과세표준", "세 율"]);
    expect(table.rows[1]).toEqual([
      "1,400만원 초과 5,000만원 이하",
      "84만원 + (1,400만원을 초과하는 금액의 15퍼센트)",
    ]);
    expect(segs[0].type === "text" && segs[0].content).toContain("제55조(세율)");
    expect(segs[2].type === "text" && segs[2].content).toContain("퇴직소득");
  });

  it("PACKED-4: 복원 함수는 개행이 이미 있는 본문에 대해 항등이다 (회귀 0)", () => {
    expect(restoreBoxTableLines(SEC55)).toBe(SEC55);
  });

  it("PACKED-5: 표가 없으면 원본 그대로", () => {
    const plain = "제1조(목적) 이 법은 ...\n① 일반 조문 본문";
    expect(restoreBoxTableLines(plain)).toBe(plain);
  });

  it("PACKED-6: 셀 수가 맞지 않는 줄은 뭉개지 않고 원본을 유지한다", () => {
    // 열 2개 테두리인데 데이터가 3셀 → 분할 포기(원본 유지) → 표로 파싱되지 않아야 한다
    const broken = "┌──┬──┐│a│b│c│└──┴──┘";
    const segs = parseArticleBody(broken);
    expect(segs.every((s) => s.type === "text")).toBe(true);
  });
});
