/**
 * 꺾쇠 주석 보존 anchor — 계획서 docs/00-pm/one-house-ai-recorded-leftovers.plan.md §3.2 (F-1).
 *
 * 종전 `cleanHtml`의 `/<[^>]+>/g`는 마크업이 아닌 꺾쇠 글까지 지웠다:
 *   · 시행본 조문의 「<개정 2023.2.28, 2026.9.30>」「삭제<2008.2.22>」 — 현행 경로(`getLawText`)는 남기므로 두 경로가 달랐다
 *   · 결정례 본문의 「<별지 1>」
 *   · 「양도가액 < 취득가액 … >」 사이 글자
 * fixture는 실응답 원문이다(소득세법 시행령 §155 시행 2026.10.1. · 공정위 의결서).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/korean-law/client-core", async (orig) => {
  const actual = await orig<typeof import("@/lib/korean-law/client-core")>();
  return {
    ...actual,
    fetchJson: vi.fn(),
    readCache: vi.fn(async () => null),
    writeCache: vi.fn(async () => undefined),
    readCacheNonEmpty: vi.fn(async () => null),
    writeCacheNonEmpty: vi.fn(async () => undefined),
  };
});

import { fetchJson } from "@/lib/korean-law/client-core";
import { fetchEflawArticle, isSameArticleText } from "@/lib/korean-law/applicable-law";
import { cleanHtml } from "@/lib/korean-law/article-parser";
import { getDecisionText } from "@/lib/korean-law/client-decisions-text";
import decree155 from "./fixtures/eflaw-income-tax-decree-155-20261001.json";
import remaining from "./fixtures/drf-body-remaining-domains.json";

const mockFetch = fetchJson as ReturnType<typeof vi.fn>;
beforeEach(() => {
  mockFetch.mockReset();
});

describe("꺾쇠 주석 보존", () => {
  it("시행본 §155 — 「<개정 …>」「<신설 …>」「삭제<…>」가 본문에 남는다", async () => {
    mockFetch.mockResolvedValue(decree155);
    const text = (await fetchEflawArticle("290841", "20261001", "제155조"))!.fullText;
    expect(text).toContain("<개정 2023.2.28, 2026.9.30>");
    expect(text).toContain("<신설 2008.11.28, 2012.2.2, 2025.12.30>");
    expect(text).toMatch(/삭제\s*<2008\.2\.22>/);
  });

  it("결정례 본문 — 「<별지 1>」이 남는다", async () => {
    mockFetch.mockResolvedValue(remaining.ftc);
    const t = await getDecisionText("1", "ftc");
    expect(JSON.stringify(t)).toContain("<별지 1>");
  });

  it("마크업 태그·주석은 지우고, 부등호 사이 글자는 남긴다", () => {
    expect(cleanHtml('가<br/>나<P style="x">다</P><!-- 메모 -->라')).toBe("가나다라");
    expect(cleanHtml("양도가액 < 취득가액이고 차액 > 0")).toBe("양도가액 < 취득가액이고 차액 > 0");
    expect(cleanHtml('<img src="a.png">본문')).toBe("본문");
  });
});

describe("「현행과 같음」은 주석을 빼고 비교한다", () => {
  it("주석만 다르면 같다 · 본문이 다르면 다르다", () => {
    expect(isSameArticleText("① 본문이다. <개정 2020.2.11>", "① 본문이다. <개정 2020.2.11, 2026.9.30>")).toBe(true);
    expect(isSameArticleText("① 본문이다. <개정 2020.2.11>", "① 본문이 바뀌었다. <개정 2026.9.30>")).toBe(false);
  });
});
