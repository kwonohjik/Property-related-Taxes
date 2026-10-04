/**
 * 판례 탭 결과 목록의 출처 배지 — 본문을 주는 출처는 「본문 전문 조회 가능」(초록)으로.
 * 종전엔 `source === "대법원"` 만 봐서 본문이 있는 지방세 출처 판결이 「원문 링크에서 확인」으로 안내됐다.
 * 판정은 cite-check 와 같은 hasFullTextSource(decision-source.ts). 근거: cite-check-source-gap.anchor.test.ts
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DecisionSearchTab } from "@/app/law/_components/DecisionSearchTab";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const item = (id: string, source: string) => ({ id, title: `판결 ${id}`, caseNo: `2024두${id}`, court: "대법원", date: "2024.01.01", source });

it.each([
  ["대법원", "본문 전문 조회 가능"],
  ["지방세법령정보시스템", "본문 전문 조회 가능"],
  ["국세법령정보시스템", "본문은 법제처 원문 링크에서 확인"],
])("BADGE: %s → %s", async (source, title) => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ items: [item("1", source)], totalCount: 1, page: 1, pageSize: 10 }), { status: 200 })
  );
  render(<DecisionSearchTab initialQuery="양도소득세" initialDomain="prec" autoSearch={1} />);
  const badge = await screen.findByTestId("decision-source-badge");
  expect(badge.textContent).toBe(source);
  expect(badge.getAttribute("title")).toBe(title);
});

describe("BADGE — 판정 단일 소스", () => {
  it("cite-check 의 hasFullTextSource 는 decision-source 의 것과 같은 함수다", async () => {
    const a = await import("@/lib/korean-law/cite-check");
    const b = await import("@/lib/korean-law/decision-source");
    expect(a.hasFullTextSource).toBe(b.hasFullTextSource);
  });
});
