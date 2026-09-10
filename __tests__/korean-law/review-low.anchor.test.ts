/**
 * 1차 코드리뷰 «낮음» 항목 수정의 회귀 anchor.
 *
 * 정책: [[feedback_negative_anchor_needs_positive_twin]]
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/korean-law/client", () => ({
  getLawText: vi.fn(),
  searchLaw: vi.fn(),
}));
vi.mock("@/lib/korean-law/client-law", async (orig) => ({
  ...(await orig<typeof import("@/lib/korean-law/client-law")>()),
  getLawText: vi.fn(),
}));

import { getLawText, searchLaw } from "@/lib/korean-law/client";
import { getLawText as routeGetLawText } from "@/lib/korean-law/client-law";
import { normalizeLawSearchText } from "@/lib/korean-law/search-normalizer";
import { routeQuery } from "@/lib/korean-law/router/query-router";
import { verifyCitations } from "@/lib/korean-law/verify-citations";

const mockGetLawText = getLawText as ReturnType<typeof vi.fn>;
const mockSearchLaw = searchLaw as ReturnType<typeof vi.fn>;

// ────────────────────────────────────────────────────────────────────────────

describe("TYPO — 오타 보정이 정상 한글을 훼손하지 않는다", () => {
  it("TYPO-1: 일상 어휘가 그대로 남는다", () => {
    // 수정 전 실측: 업격해석 원칙 · 관재우 판례 · 존업사
    expect(normalizeLawSearchText("엄격해석 원칙")).toBe("엄격해석 원칙");
    expect(normalizeLawSearchText("곽재우 판례")).toBe("곽재우 판례");
    expect(normalizeLawSearchText("존엄사")).toBe("존엄사");
  });

  it("TYPO-2(긍정 짝): 「법」의 인접 오타 보정은 살아 있다", () => {
    expect(normalizeLawSearchText("소득세벚")).toBe("소득세법");
    expect(normalizeLawSearchText("지방세뻡")).toBe("지방세법");
  });
});

describe("SEC — § 표기가 조문 조회로 라우팅된다", () => {
  it("SEC-1: 저장소 자체 인용 표기(§)로 검색해도 조문 팝업으로 간다", () => {
    // 수정 전: "소득세법 제89"(조 없음) → 패턴 미매칭 → fallback_search_law
    expect(normalizeLawSearchText("소득세법 §89")).toBe("소득세법 제89조");
    const r = routeQuery("소득세법 §89");
    expect(r.tool).toBe("get_law_text");
    expect(r.params.articleNo).toBe("제89조");
  });

  it("SEC-2: 가지번호 §18의2 도 조문번호로 복원된다", () => {
    expect(routeQuery("상증법 §18의2").params.articleNo).toBe("제18조의2");
  });

  it("SEC-3(긍정 짝): 기존 「제N조」 표기 라우팅은 불변", () => {
    const r = routeQuery("소득세법 제89조");
    expect(r.tool).toBe("get_law_text");
    expect(r.params.articleNo).toBe("제89조");
  });
});

describe("HANG — 항 검증이 «다른 조문의 상호참조»를 인정하지 않는다", () => {
  beforeEach(() => {
    mockGetLawText.mockReset();
    mockSearchLaw.mockReset();
  });

  it("HANG-1: 본문의 「제94조제3항」 인용 때문에 없는 제3항이 실존 처리되면 안 된다", async () => {
    // ⚠ hang===1 은 「항 번호 없는 단일 문단」 예외에 먼저 걸려 구별력이 없다 —
    //   상호참조 오탐만 남기려면 그 예외를 타지 않는 항 번호를 써야 한다.
    mockGetLawText.mockResolvedValue({
      title: "테스트",
      // 자기 항 마커는 없고, 타 조문 상호참조만 있는 본문
      fullText: "제89조(비과세) 제94조제3항에 따른 자산의 양도로 발생하는 소득",
      lawName: "소득세법",
      articleNo: "제89조",
      sourceUrl: "https://www.law.go.kr/x",
    });
    const r = await verifyCitations("소득세법 제89조 제3항에 따라");
    expect(r.citations[0].status).toBe("not_found");
  });

  it("HANG-2(긍정 짝): 자기 항 마커(원숫자)가 있으면 실존 처리", async () => {
    mockGetLawText.mockResolvedValue({
      title: "테스트",
      fullText: "제89조(비과세) ① 다음 각 호의 소득 ② 그 밖의 소득",
      lawName: "소득세법",
      articleNo: "제89조",
      sourceUrl: "https://www.law.go.kr/x",
    });
    const r = await verifyCitations("소득세법 제89조 제2항에 따라");
    expect(r.citations[0].status).toBe("verified");
  });
});

describe("CONC — 인용 검증의 동시 upstream 호출에 상한이 있다", () => {
  beforeEach(() => {
    mockGetLawText.mockReset();
    mockSearchLaw.mockReset();
  });

  it("CONC-1: 20건을 넘겨도 동시 호출이 5건 미만으로 유지된다", async () => {
    let inflight = 0;
    let peak = 0;
    mockGetLawText.mockImplementation(async () => {
      inflight++;
      peak = Math.max(peak, inflight);
      await new Promise((r) => setTimeout(r, 5));
      inflight--;
      return {
        title: "t", fullText: "① 본문", lawName: "소득세법",
        articleNo: "제1조", sourceUrl: "https://www.law.go.kr/x",
      };
    });
    const text = Array.from({ length: 20 }, (_, i) => `소득세법 제${i + 1}조`).join(" 및 ");
    const r = await verifyCitations(text);
    expect(r.totalCount).toBeGreaterThanOrEqual(20);
    // 수정 전: Promise.all 로 20건을 한꺼번에 던졌다(내부 2회 호출까지 치면 최대 40 동시).
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1); // 직렬로 퇴화하지도 않았다
  });
});

describe("ART404 — 조문 없음 메시지가 가지번호를 망가뜨리지 않는다", () => {
  it("ART404-1: 「제168의14조」가 아니라 「제168조의14」", async () => {
    (routeGetLawText as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { GET } = await import("@/app/api/law/article/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(
      new NextRequest("http://localhost/api/law/article?law=소득세법&articleNum=168의14"),
    );
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error.message).toContain("제168조의14");
    expect(body.error.message).not.toContain("제168의14조");
  });
});
