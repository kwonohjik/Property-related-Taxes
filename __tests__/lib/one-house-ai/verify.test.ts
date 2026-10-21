/**
 * 원문 검증 결정론 단계 — 조문 3분류(verified·not_found·failed) · 해석례 fetched·mismatch·failed.
 * 조회 실패는 통과로 치지 않는다(안전망 P-5) · id 어긋남은 mismatch(P-6). 법령 모듈은 모의한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/korean-law/applicable-law", () => ({ getApplicableLaw: vi.fn() }));
vi.mock("@/lib/korean-law/client-law", () => ({ getLawText: vi.fn() }));
vi.mock("@/lib/korean-law/client-taxlaw", () => ({ getTaxlawDocument: vi.fn() }));
vi.mock("@/lib/korean-law/client-decisions-text", () => ({ getDecisionText: vi.fn() }));

import { getApplicableLaw } from "@/lib/korean-law/applicable-law";
import { LawApiError } from "@/lib/korean-law/client-core";
import { getLawText } from "@/lib/korean-law/client-law";
import { getTaxlawDocument } from "@/lib/korean-law/client-taxlaw";
import type { OneHouseCard } from "@/lib/one-house-ai/opinion/cards";
import { checkDoc, checkStatute } from "@/lib/one-house-ai/verify/verify";

const m = <T>(f: T) => f as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
});

const DECREE = "제155조(1세대1주택의 특례) ① 첫째\n⑳ 스무째\n㉑ 1세대가 장기임대주택의";
const applicable = (fullText: string | null) => ({
  lawName: "소득세법 시행령",
  articleNo: "제155조",
  article: fullText ? { title: "특례", fullText } : null,
  version: { efYd: "20240229" },
  sameAsCurrentText: false,
  sourceUrl: "https://www.law.go.kr/x",
});

describe("checkStatute", () => {
  it("양도일 시행본에 그 항이 있으면 verified + 그 항 발췌", async () => {
    m(getApplicableLaw).mockResolvedValue(applicable(DECREE));
    const r = await checkStatute({ law: "소득세법 시행령", article: 155, paragraph: 21 }, "2024-04-30");
    expect(getApplicableLaw).toHaveBeenCalledWith("소득세법 시행령", "제155조", "2024-04-30");
    expect(r).toMatchObject({ status: "verified", baseDate: "2024-04-30", versionEfYd: "20240229", sameAsCurrent: false, excerpt: "㉑ 1세대가 장기임대주택의" });
  });

  it("항·조가 없으면 not_found · 법령·버전 없음 응답도 not_found", async () => {
    m(getApplicableLaw).mockResolvedValue(applicable(DECREE));
    expect((await checkStatute({ law: "소득세법 시행령", article: 155, paragraph: 30 }, "2024-04-30")).status).toBe("not_found");
    m(getApplicableLaw).mockResolvedValue(applicable(null));
    expect((await checkStatute({ law: "소득세법 시행령", article: 999 }, "2024-04-30")).status).toBe("not_found");
    m(getApplicableLaw).mockRejectedValue(new LawApiError("법령 연혁을 찾을 수 없습니다", "NOT_FOUND"));
    expect((await checkStatute({ law: "없는법", article: 1 }, "2024-04-30")).status).toBe("not_found");
  });

  it("조회 실패는 failed — verified로 바꾸지 않는다", async () => {
    m(getApplicableLaw).mockRejectedValue(new LawApiError("fetch failed", "UPSTREAM"));
    expect(await checkStatute({ law: "소득세법 시행령", article: 155, paragraph: 21 }, "2024-04-30")).toMatchObject({ status: "failed", reason: "fetch failed" });
  });

  it("양도일이 없으면 현행으로 — baseDate null", async () => {
    m(getLawText).mockResolvedValue({ title: "특례", fullText: DECREE, lawName: "소득세법 시행령", articleNo: "제155조" });
    expect(await checkStatute({ law: "소득세법 시행령", article: 155, paragraph: 20 }, null)).toMatchObject({ status: "verified", baseDate: null, excerpt: "⑳ 스무째" });
    expect(getApplicableLaw).not.toHaveBeenCalled();
  });
});

const card: OneHouseCard = {
  id: "E1",
  docNo: "서면-2016-부동산-2944 [부동산납세과-425]",
  kind: "해석",
  date: "2016.03.31.",
  url: "https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=010000000000215643&wnKey=",
  title: "제목",
  lawAxis: [],
  topic: "기타",
  facts: [],
  question: "",
  answer: "",
  verdict: "",
};
const doc = (over: object = {}) => ({
  ntstDcmId: "010000000000215643",
  kind: "interpretation",
  docNo: "서면-2016-부동산-2944",
  title: "제목",
  date: "2016.03.31.",
  gist: "요지",
  answer: "회신",
  body: "본문",
  relatedStatutes: [],
  url: "https://taxlaw.nts.go.kr/qt/x",
  ...over,
});

describe("checkDoc", () => {
  it("카드 — 서버 카드 저장소의 id로 원문을 다시 받고 번호·일자가 맞으면 fetched", async () => {
    m(getTaxlawDocument).mockResolvedValue(doc());
    const r = await checkDoc({ docNo: "서면-2016-부동산-2944 [부동산납세과-425]", origin: "card" }, [card]);
    expect(getTaxlawDocument).toHaveBeenCalledWith("010000000000215643");
    expect(r).toMatchObject({ status: "fetched", excerpt: "요지: 요지\n회신·주문: 회신\n본문: 본문" });
  });

  it("받은 문서의 번호나 일자가 다르면 mismatch(2차 대조에 보내지 않는다)", async () => {
    m(getTaxlawDocument).mockResolvedValue(doc({ date: "2016.04.01." }));
    expect((await checkDoc({ docNo: card.docNo, origin: "card" }, [card])).status).toBe("mismatch");
    m(getTaxlawDocument).mockResolvedValue(doc({ docNo: "서면-2016-부동산-9999" }));
    expect((await checkDoc({ docNo: card.docNo, origin: "card" }, [card])).status).toBe("mismatch");
    m(getTaxlawDocument).mockResolvedValue(null);
    expect((await checkDoc({ docNo: card.docNo, origin: "card" }, [card])).status).toBe("mismatch");
  });

  it("카드 저장소에 없는 카드 인용·조회 실패는 failed", async () => {
    expect((await checkDoc({ docNo: "서면-0000", origin: "card" }, [card])).status).toBe("failed");
    m(getTaxlawDocument).mockRejectedValue(new LawApiError("국세법령정보시스템 오류 (500)", "UPSTREAM"));
    expect(await checkDoc({ docNo: card.docNo, origin: "card" }, [card])).toMatchObject({ status: "failed", reason: "국세법령정보시스템 오류 (500)" });
  });

  it("실시간 문서 — 의견 응답이 준 출처·id로 다시 받는다", async () => {
    m(getTaxlawDocument).mockResolvedValue(doc({ docNo: "서면-2026-법규재산-0109" }));
    expect((await checkDoc({ docNo: "서면-2026-법규재산-0109", origin: "live", source: "nts", id: "2000" }, [])).status).toBe("fetched");
    expect(getTaxlawDocument).toHaveBeenCalledWith("2000");
    expect((await checkDoc({ docNo: "서면-2026-법규재산-0109", origin: "live" }, [])).status).toBe("failed");
  });
});
