/**
 * verify-citations 테스트 — 네트워크 호출 mocked
 *
 * 검증 대상:
 *  - extractCitations: 법령명 역추적 + stopword 제거 + dedup
 *  - verifyCitations: ✓/✗/⚠ 3분류 + [HALLUCINATION_DETECTED] 헤더
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── client 모킹 (네트워크 호출 차단) ─────────────────────────────────────
vi.mock("@/lib/korean-law/client", () => ({
  searchLaw: vi.fn(),
  getLawText: vi.fn(),
}));

import { extractCitations, verifyCitations } from "@/lib/korean-law/verify-citations";
import { getLawText, searchLaw } from "@/lib/korean-law/client";

const mockGetLawText = getLawText as ReturnType<typeof vi.fn>;
const mockSearchLaw = searchLaw as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockGetLawText.mockReset();
  mockSearchLaw.mockReset();
});

describe("verify-citations: extractCitations", () => {
  it("단순 인용 1건 추출", () => {
    const text = "소득세법 제89조에 따라 비과세입니다.";
    const citations = extractCitations(text);
    expect(citations).toHaveLength(1);
    expect(citations[0].lawName).toBe("소득세법");
    expect(citations[0].articleNo).toBe("제89조");
  });

  it("조의N 형식", () => {
    const text = "상속세및증여세법 제18조의2 동거주택 공제";
    const citations = extractCitations(text);
    expect(citations[0].articleNo).toBe("제18조의2");
  });

  it("항·호 포함", () => {
    const text = "소득세법 제104조 제7항 제2호 중과세";
    const citations = extractCitations(text);
    expect(citations[0].hang).toBe(7);
    expect(citations[0].ho).toBe(2);
  });

  it("stopword 접두사 제거 — \"또한 소득세법\"", () => {
    const text = "또한 소득세법 제89조에 따라";
    const citations = extractCitations(text);
    expect(citations).toHaveLength(1);
    expect(citations[0].lawName).toBe("소득세법");
  });

  it("stopword 접두사 제거 — \"따라서 지방세법\"", () => {
    const text = "따라서 지방세법 제111조의 취득세율이 적용됩니다.";
    const citations = extractCitations(text);
    expect(citations[0].lawName).toBe("지방세법");
  });

  it("dedup — 동일 인용 중복 제거", () => {
    const text =
      "소득세법 제89조에 따라 비과세입니다. 또한 소득세법 제89조 규정에 따라 추가로 ...";
    const citations = extractCitations(text);
    expect(citations).toHaveLength(1);
  });

  it("여러 인용 동시 추출", () => {
    const text =
      "소득세법 제89조와 지방세법 제111조 및 종합부동산세법 제8조에 따라";
    const citations = extractCitations(text);
    expect(citations).toHaveLength(3);
    expect(citations.map((c) => c.lawName)).toEqual([
      "소득세법",
      "지방세법",
      "종합부동산세법",
    ]);
  });

  it("법령명 없이 조문만 있으면 추출 제외", () => {
    const text = "제89조에 따라 처리합니다.";
    const citations = extractCitations(text);
    expect(citations).toHaveLength(0);
  });

  it("빈 텍스트 → 빈 배열", () => {
    expect(extractCitations("")).toEqual([]);
  });
});

describe("verify-citations: verifyCitations (mocked)", () => {
  it("모든 인용 실존 → [VERIFIED]", async () => {
    mockGetLawText.mockResolvedValue({
      title: "양도소득세 비과세",
      fullText: "제89조 ① 다음 각 호의 소득 ...",
      lawName: "소득세법",
      articleNo: "제89조",
      sourceUrl: "https://www.law.go.kr/법령/소득세법",
    });

    const result = await verifyCitations("소득세법 제89조에 따라 비과세입니다.");
    expect(result.header).toBe("[VERIFIED]");
    expect(result.isError).toBe(false);
    expect(result.verifiedCount).toBe(1);
    expect(result.hallucinationCount).toBe(0);
    expect(result.citations[0].status).toBe("verified");
  });

  it("조문 미존재 → [HALLUCINATION_DETECTED]", async () => {
    mockGetLawText.mockResolvedValue(null);
    mockSearchLaw.mockResolvedValue({
      lawName: "소득세법",
      lawId: "001",
      mst: "000",
      promulgationDate: "20240101",
    });

    const result = await verifyCitations("소득세법 제9999조에 따라");
    expect(result.header).toBe("[HALLUCINATION_DETECTED]");
    expect(result.isError).toBe(true);
    expect(result.hallucinationCount).toBe(1);
    expect(result.citations[0].status).toBe("not_found");
    expect(result.citations[0].reason).toContain("제9999조");
  });

  it("법령 자체가 없음 → [HALLUCINATION_DETECTED] + 법령 없음 메시지", async () => {
    mockGetLawText.mockResolvedValue(null);
    mockSearchLaw.mockResolvedValue(null);

    const result = await verifyCitations("허구의법 제1조에 따라");
    expect(result.isError).toBe(true);
    expect(result.citations[0].reason).toContain("찾지 못했습니다");
  });

  it("API 호출 실패 → [PARTIAL_VERIFIED]", async () => {
    mockGetLawText.mockRejectedValue(new Error("upstream 502"));

    const result = await verifyCitations("소득세법 제89조에 따라");
    expect(result.header).toBe("[PARTIAL_VERIFIED]");
    expect(result.isError).toBe(false); // 환각 아님
    expect(result.failedCount).toBe(1);
    expect(result.citations[0].status).toBe("failed");
  });

  it("인용 없음 → [VERIFIED] + 빈 배열", async () => {
    const result = await verifyCitations("일반 세무 안내 텍스트입니다.");
    expect(result.header).toBe("[VERIFIED]");
    expect(result.totalCount).toBe(0);
    expect(result.citations).toEqual([]);
  });

  it("혼합: 1건 실존 + 1건 환각 → [HALLUCINATION_DETECTED]", async () => {
    mockGetLawText.mockImplementation(async (lawName, articleNo) => {
      if (articleNo === "제89조") {
        return {
          title: "비과세",
          fullText: "제89조 본문",
          lawName,
          articleNo,
          sourceUrl: "",
        };
      }
      return null;
    });
    mockSearchLaw.mockResolvedValue({
      lawName: "소득세법",
      lawId: "001",
      mst: "000",
      promulgationDate: "20240101",
    });

    const result = await verifyCitations(
      "소득세법 제89조와 소득세법 제9999조"
    );
    expect(result.header).toBe("[HALLUCINATION_DETECTED]");
    expect(result.verifiedCount).toBe(1);
    expect(result.hallucinationCount).toBe(1);
  });

  it("항 검증 — 존재하는 항은 verified", async () => {
    mockGetLawText.mockResolvedValue({
      title: "양도소득세 비과세",
      fullText: "제89조 ① 다음 각 호의 소득 ② 해외 ③ 기타",
      lawName: "소득세법",
      articleNo: "제89조",
      sourceUrl: "",
    });

    const result = await verifyCitations("소득세법 제89조 제2항에 따라");
    expect(result.verifiedCount).toBe(1);
    expect(result.citations[0].hang).toBe(2);
  });

  it("항 검증 — 존재하지 않는 항은 환각", async () => {
    mockGetLawText.mockResolvedValue({
      title: "양도소득세 비과세",
      fullText: "제89조 ① 다음 각 호의 소득 ② 해외", // 3항 없음
      lawName: "소득세법",
      articleNo: "제89조",
      sourceUrl: "",
    });

    const result = await verifyCitations("소득세법 제89조 제99항에 따라");
    expect(result.hallucinationCount).toBe(1);
    expect(result.citations[0].reason).toContain("제99항");
  });

  it("maxCitations 제한 + 안내 메시지", async () => {
    mockGetLawText.mockResolvedValue({
      title: "",
      fullText: "",
      lawName: "",
      articleNo: "",
      sourceUrl: "",
    });

    const text = Array.from({ length: 30 }, (_, i) => `소득세법 제${i + 1}조`).join(" ");
    const result = await verifyCitations(text, { maxCitations: 5 });
    expect(result.citations).toHaveLength(5);
    expect(result.totalCount).toBe(30);
    expect(result.summary).toContain("최대 5건만 검증");
  });
});
