/**
 * 16항 이상 항 번호 보존 — 시행본 경로(`fetchEflawArticle` → `formatArticleUnit`) anchor.
 *
 * 법제처 DRF는 16항부터 항번호를 `<16>`·`<21>`처럼 꺾쇠로 준다. 종전 `cleanHtml`의 태그 제거가 이것을
 * HTML 태그로 보고 지워 `fullText`에서 ⑮ 다음 항 번호가 모두 사라졌다(/law 행위시법 패널에 그대로 노출).
 *
 * fixture는 **실응답 원문**이다 — 소득세법 시행령 §155(MST 290841 · 시행 2026.10.1.) `lawService.do?target=eflaw&JO=015500`.
 * 손으로 만든 JSON을 넣으면 꺾쇠 표기 회귀를 지키지 못한다.
 */
import { describe, it, expect, vi } from "vitest";
import fixture from "./fixtures/eflaw-income-tax-decree-155-20261001.json";

vi.mock("@/lib/korean-law/client-core", async (orig) => {
  const actual = await orig<typeof import("@/lib/korean-law/client-core")>();
  return {
    ...actual,
    fetchJson: vi.fn(async () => fixture),
    readCache: vi.fn(async () => null),
    writeCache: vi.fn(async () => undefined),
    readCacheNonEmpty: vi.fn(async () => null),
    writeCacheNonEmpty: vi.fn(async () => undefined),
  };
});

import { fetchEflawArticle } from "@/lib/korean-law/applicable-law";
import { circledHangMark, formatArticleUnit } from "@/lib/korean-law/article-parser";

describe("16항 이상 항 번호 — 시행본 경로", () => {
  it("실응답 §155의 ⑯~㉕ 항 번호가 fullText에 원숫자로 남는다", async () => {
    const article = await fetchEflawArticle("290841", "20261001", "제155조");
    const text = article!.fullText;
    for (let n = 1; n <= 25; n++) expect(text, `${n}항`).toContain(circledHangMark(n)!);
    // 장기임대주택 항은 현행 ㉑ — 그 항 본문 앞에 번호가 붙는다
    expect(text).toMatch(/㉑\s*1세대가 장기임대주택의 임대기간요건/);
    // 꺾쇠 항번호가 글자로 남지도 않는다
    expect(text).not.toMatch(/<(1[6-9]|2\d)>/);
  });

  it("항내용이 배열로 와도 첫 줄의 꺾쇠 항번호를 원숫자로 바꾼다", () => {
    const unit = formatArticleUnit({ 조문내용: "제155조(1세대1주택의 특례)", 항: [{ 항번호: "<16>", 항내용: ["<16>제1항을 적용할 때", "둘째 줄"] }] });
    expect(unit.fullText).toContain("⑯제1항을 적용할 때\n둘째 줄");
  });

  it("circledHangMark: 1~35는 원숫자, 그 밖은 null", () => {
    expect(circledHangMark(1)).toBe("①");
    expect(circledHangMark(20)).toBe("⑳");
    expect(circledHangMark(21)).toBe("㉑");
    expect(circledHangMark(35)).toBe("㉟");
    expect(circledHangMark(36)).toBeNull();
    expect(circledHangMark(0)).toBeNull();
  });
});
