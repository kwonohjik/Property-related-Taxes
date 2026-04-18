/**
 * chains.ts secOrSkip 부분 실패 처리 테스트 — 네트워크 mocked
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/korean-law/client", () => ({
  searchLaw: vi.fn(),
  searchLawMany: vi.fn(),
  searchDecisions: vi.fn(),
  getAnnexes: vi.fn(),
}));

vi.mock("@/lib/korean-law/verify-citations", () => ({
  verifyCitations: vi.fn(),
}));

import { runChain } from "@/lib/korean-law/chains";
import {
  searchLaw,
  searchLawMany,
  searchDecisions,
  getAnnexes,
} from "@/lib/korean-law/client";
import { verifyCitations } from "@/lib/korean-law/verify-citations";

const mockSearchLaw = searchLaw as ReturnType<typeof vi.fn>;
const mockSearchLawMany = searchLawMany as ReturnType<typeof vi.fn>;
const mockSearchDecisions = searchDecisions as ReturnType<typeof vi.fn>;
const mockGetAnnexes = getAnnexes as ReturnType<typeof vi.fn>;
const mockVerifyCitations = verifyCitations as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockSearchLaw.mockReset();
  mockSearchLawMany.mockReset();
  mockSearchDecisions.mockReset();
  mockGetAnnexes.mockReset();
  mockVerifyCitations.mockReset();
});

describe("chains: full_research secOrSkip", () => {
  it("모두 성공 → 3개 섹션 정상 반환", async () => {
    mockSearchLawMany.mockResolvedValue([
      { lawName: "소득세법", lawId: "1", mst: "001", promulgationDate: "20240101" },
    ]);
    mockSearchDecisions.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 5 });

    const result = await runChain({ type: "full_research", query: "양도세" });
    expect(result.sections).toHaveLength(3);
    // 결정례 2개는 items 비어있으므로 NOT_FOUND 마커
    const lawsSection = result.sections[0];
    expect(lawsSection.kind).toBe("laws");
    expect(lawsSection.laws).toHaveLength(1);
  });

  it("일부 실패 → [FAILED] 마커 섹션으로 대체", async () => {
    mockSearchLawMany.mockRejectedValue(new Error("법령 API 장애"));
    mockSearchDecisions.mockResolvedValue({
      items: [{ id: "1", domain: "prec", caseNo: "1", title: "T", court: "대법원", date: "2024" }],
      totalCount: 1,
      page: 1,
      pageSize: 5,
    });

    const result = await runChain({ type: "full_research", query: "양도세" });
    expect(result.sections).toHaveLength(3);
    const lawsSection = result.sections[0];
    expect(lawsSection.kind).toBe("note");
    expect(lawsSection.note).toContain("[FAILED]");
    expect(lawsSection.note).toContain("추측/생성하지 마세요");
  });

  it("결과 빈 배열 → [NOT_FOUND] 마커", async () => {
    mockSearchLawMany.mockResolvedValue([]);
    mockSearchDecisions.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 5 });

    const result = await runChain({ type: "full_research", query: "없는법령" });
    const lawsSection = result.sections[0];
    expect(lawsSection.kind).toBe("note");
    expect(lawsSection.note).toContain("[NOT_FOUND]");
  });

  it("모든 섹션 실패해도 runChain 자체는 정상 완료", async () => {
    mockSearchLawMany.mockRejectedValue(new Error("err1"));
    mockSearchDecisions.mockRejectedValue(new Error("err2"));

    const result = await runChain({ type: "full_research", query: "양도세" });
    expect(result.sections).toHaveLength(3);
    result.sections.forEach((sec) => {
      expect(sec.kind).toBe("note");
      expect(sec.note).toMatch(/\[(FAILED|NOT_FOUND)\]/);
    });
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});

describe("chains: law_system", () => {
  it("본법 없음 → NOT_FOUND + 추측 금지 배너", async () => {
    mockSearchLaw.mockResolvedValue(null);

    const result = await runChain({ type: "law_system", query: "허구의법" });
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].kind).toBe("note");
    expect(result.sections[0].note).toContain("[NOT_FOUND]");
  });

  it("본법은 성공하되 시행령 조회 실패 → 본법은 정상, 시행령은 FAILED", async () => {
    mockSearchLaw.mockResolvedValue({
      lawName: "소득세법",
      lawId: "1",
      mst: "001",
      promulgationDate: "20240101",
    });
    mockSearchLawMany
      .mockResolvedValueOnce([]) // 시행령 조회 빈 결과 (NOT_FOUND)
      .mockRejectedValueOnce(new Error("시행규칙 API 장애")); // 시행규칙 실패

    const result = await runChain({ type: "law_system", query: "소득세법" });
    expect(result.sections[0].kind).toBe("laws");
    expect(result.sections[0].laws?.[0].lawName).toBe("소득세법");
    expect(result.sections[1].kind).toBe("note"); // 시행령 NOT_FOUND
    expect(result.sections[1].note).toContain("[NOT_FOUND]");
    expect(result.sections[2].kind).toBe("note"); // 시행규칙 FAILED
    expect(result.sections[2].note).toContain("[FAILED]");
  });
});

describe("chains: document_review → verify-citations 위임", () => {
  it("rawText 없음 → 안내 섹션", async () => {
    const result = await runChain({ type: "document_review", query: "체크" });
    expect(result.sections[0].kind).toBe("note");
    expect(result.sections[0].heading).toBe("입력 필요");
  });

  it("verify-citations 결과 전달", async () => {
    mockVerifyCitations.mockResolvedValue({
      header: "[HALLUCINATION_DETECTED]",
      isError: true,
      totalCount: 2,
      verifiedCount: 1,
      hallucinationCount: 1,
      failedCount: 0,
      citations: [
        { raw: "소득세법 제89조", status: "verified", lawName: "소득세법", articleNo: "제89조" },
        { raw: "소득세법 제9999조", status: "not_found", lawName: "소득세법", articleNo: "제9999조" },
      ],
      summary: "테스트",
    });

    const result = await runChain({
      type: "document_review",
      query: "체크",
      rawText: "소득세법 제89조와 제9999조",
    });
    expect(result.sections[0].note).toContain("[HALLUCINATION_DETECTED]");
    expect(result.sections[0].note).toContain("⚠️");
    expect(result.sections[1].kind).toBe("citations");
    expect(result.sections[1].citations).toHaveLength(2);
    expect(result.sections[1].citations?.[0].valid).toBe(true);
    expect(result.sections[1].citations?.[1].valid).toBe(false);
  });
});
