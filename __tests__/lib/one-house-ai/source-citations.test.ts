/**
 * 원문 속 인용 대조 — 조문(양도일 시행본 / 현행) · 해석례 번호(국세청·기재부). 「환각」이라 부르지 않는다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/one-house-ai/verify/verify", async (orig) => ({
  ...(await orig<typeof import("@/lib/one-house-ai/verify/verify")>()),
  checkStatute: vi.fn(),
}));
vi.mock("@/lib/korean-law/client-cgm-expc", () => ({ findInterpretationByDocNo: vi.fn() }));
vi.mock("@/lib/korean-law/applicable-law", async (orig) => ({
  ...(await orig<typeof import("@/lib/korean-law/applicable-law")>()),
  resolveCitationEraDate: vi.fn(),
}));

import { findInterpretationByDocNo } from "@/lib/korean-law/client-cgm-expc";
import { checkSourceCitations } from "@/lib/one-house-ai/source-citations";
import { checkStatute } from "@/lib/one-house-ai/verify/verify";
import { resolveCitationEraDate } from "@/lib/korean-law/applicable-law";

const m = <T>(f: T) => f as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
});

const TEXT = "소득세법 시행령 제155조 제20항에 따라 장기임대주택… 서면-2016-부동산-2944 및 기획재정부 재산세제과-906 참조. 조심-2020-서-1 결정.";

describe("checkSourceCitations", () => {
  it("양도일이 있으면 그 날 시행본으로 조문을 보고, 해석례 번호는 국세청·기재부만 찾는다", async () => {
    m(checkStatute).mockResolvedValue({ status: "verified", url: "https://www.law.go.kr/x" });
    m(findInterpretationByDocNo).mockImplementation(async (d: string) =>
      d.includes("2944") ? { docNo: "서면-2016-부동산-2944[부동산납세과-425]", url: "https://taxlaw.nts.go.kr/qt/x" } : null,
    );
    const r = await checkSourceCitations(TEXT, "2016-03-01");
    expect(checkStatute).toHaveBeenCalledWith({ law: "소득세법 시행령", article: 155, paragraph: 20 }, "2016-03-01");
    expect(m(findInterpretationByDocNo).mock.calls.map((c: unknown[]) => c[0])).toEqual(["서면-2016-부동산-2944", "기획재정부 재산세제과-906"]);
    expect(r).toEqual([
      { kind: "statute", raw: "소득세법 시행령 제155조 제20항", status: "found", basis: "transfer_date", url: "https://www.law.go.kr/x" },
      { kind: "doc", raw: "서면-2016-부동산-2944", status: "found", docNo: "서면-2016-부동산-2944[부동산납세과-425]", url: "https://taxlaw.nts.go.kr/qt/x" },
      { kind: "doc", raw: "기획재정부 재산세제과-906", status: "not_found", note: "법제처 해석 목록에서 찾지 못함 — 표기가 다를 수 있음" },
    ]);
  });

  it("양도일이 없으면 현행 기준 — 「찾지 못함」에 과거 조문일 수 있다고 붙인다", async () => {
    m(checkStatute).mockResolvedValue({ status: "not_found", reason: "소득세법 시행령 제155조에 제20항이 없습니다." });
    m(findInterpretationByDocNo).mockResolvedValue(null);
    const [s] = await checkSourceCitations("소득세법 시행령 제155조 제20항", null);
    expect(checkStatute).toHaveBeenCalledWith({ law: "소득세법 시행령", article: 155, paragraph: 20 }, null);
    expect(s).toMatchObject({ status: "not_found", basis: "current", note: expect.stringContaining("현행에 없음 — 과거 조문일 수 있음") });
  });

  it("조회 실패는 「확인 불가」(failed) — 찾지 못함으로 바꾸지 않는다", async () => {
    m(checkStatute).mockResolvedValue({ status: "failed", reason: "fetch failed" });
    m(findInterpretationByDocNo).mockRejectedValue(new Error("법제처 API 오류 (503)"));
    const r = await checkSourceCitations("소득세법 제89조 · 서면-2016-부동산-2944", null);
    expect(r.map((c) => c.status)).toEqual(["failed", "failed"]);
  });

  // 상한을 넘은 인용은 버리지 않는다 — 조문은 법제처 링크를, 해석례는 문서번호를 남겨 사용자가 직접 확인한다(2026-10-22 사용자 요청)
  it("확인 상한(조문 20 · 해석례 10)을 넘은 인용은 「unchecked」로 남기고 조회하지 않는다", async () => {
    m(checkStatute).mockResolvedValue({ status: "verified", url: "https://www.law.go.kr/x" });
    m(findInterpretationByDocNo).mockResolvedValue(null);
    const statutes = Array.from({ length: 22 }, (_, i) => `소득세법 제${i + 1}조`).join(", ");
    const docs = Array.from({ length: 12 }, (_, i) => `서면-2016-부동산-${1000 + i}`).join(" ");
    const r = await checkSourceCitations(`${statutes}. ${docs}`, null);
    expect(checkStatute).toHaveBeenCalledTimes(20);
    expect(findInterpretationByDocNo).toHaveBeenCalledTimes(10);
    const unchecked = r.filter((c) => c.status === "unchecked");
    expect(unchecked).toEqual([
      { kind: "statute", raw: "소득세법 제21조", status: "unchecked", url: "https://www.law.go.kr/법령/" + encodeURIComponent("소득세법") + "/" + encodeURIComponent("제21조"), note: undefined },
      { kind: "statute", raw: "소득세법 제22조", status: "unchecked", url: "https://www.law.go.kr/법령/" + encodeURIComponent("소득세법") + "/" + encodeURIComponent("제22조"), note: undefined },
      { kind: "doc", raw: "서면-2016-부동산-1010", status: "unchecked" },
      { kind: "doc", raw: "서면-2016-부동산-1011", status: "unchecked" },
    ]);
    expect(r.length).toBe(34);
  });

  // 계획서 law-citation-residuals Q-3 b — 원문이 괄호로 시대를 밝히면 양도일이 아니라 그 시행본으로 본다
  it("개정 괄호가 붙은 인용은 그 시대 시행본(cited_era) — 시대를 못 정하면 「확인 불가」", async () => {
    m(checkStatute).mockResolvedValue({ status: "verified", url: "https://www.law.go.kr/x" });
    m(resolveCitationEraDate).mockResolvedValueOnce("2020-02-10");
    const text = "소득세법 시행령(2020. 2. 11. 대통령령 제30395호로 개정되기 전의 것) 제155조 제20항과 소득세법 제89조";
    const r = await checkSourceCitations(text, "2016-03-01");
    expect(checkStatute).toHaveBeenCalledWith({ law: "소득세법 시행령", article: 155, paragraph: 20 }, "2020-02-10");
    expect(checkStatute).toHaveBeenCalledWith({ law: "소득세법", article: 89 }, "2016-03-01");
    expect(r.map((c) => [c.status, c.basis])).toEqual([["found", "cited_era"], ["found", "transfer_date"]]);

    m(resolveCitationEraDate).mockRejectedValueOnce(new Error("소득세법 시행령 연혁 목록에서 제30395호 개정을 찾지 못했습니다."));
    const r2 = await checkSourceCitations(text.replace("개정되기 전의 것", "개정된 것"), null);
    expect(r2[0]).toMatchObject({ status: "failed", basis: "cited_era" });
  });
});
