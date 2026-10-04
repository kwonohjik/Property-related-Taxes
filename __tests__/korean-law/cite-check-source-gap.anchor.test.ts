/**
 * 판례 생사 확인 — 출처 때문에 대법원 후속 판결이 확인에서 조용히 빠지던 것.
 *
 * 2026-10-04 실측(대법원 세무 판례 60건 표본, search=2 후속 인용 485행): 후속 **대법원** 판결 33건 중
 * 9건이 데이터출처 「대법원」 사본 없이 다른 출처로만 잡혔다.
 *   · 지방세법령정보시스템 3건 — DRF 가 **본문을 준다**(2,292~26,169자). 그런데 hasFullTextSource 가
 *     /대법원/ 만 봐서 스캔에서 빠졌다. 근로복지공단산재판례도 본문을 준다(사건번호가 비어 목록엔 안 온다).
 *   · 국세법령정보시스템 6건 — 대법원 출처 사본 없음(nb= 조회 6/6), 본문 「제공 불가」. 사건번호는
 *     `대법원-2024-두-34092`, 법원명·판결유형 빈 값. 앱 안에서는 읽을 수 없다 ⇒ **원문 링크와 함께 목록으로** 띄운다
 *     (종전엔 아무 표시 없이 빠지고 초록 「신호 미감지」만 보였다).
 * 판례 변경은 전원합의체 사항이다(법원조직법 제7조 제1항 제3호). 「전원합의체」 25그룹 중 국세청 출처뿐인
 * 대법원 전합은 0건이었지만, 국세청 출처는 판결유형이 비어 전합 여부를 알 수 없으므로 목록을 숨기지 않는다.
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
vi.mock("@/lib/korean-law/client", () => ({ getDecisionText: vi.fn() }));

import { fetchJson } from "@/lib/korean-law/client-core";
import { getDecisionText } from "@/lib/korean-law/client";
import { checkPrecedentStatus, hasFullTextSource } from "@/lib/korean-law/cite-check";

const mockFetch = fetchJson as ReturnType<typeof vi.fn>;
const mockText = getDecisionText as ReturnType<typeof vi.fn>;
beforeEach(() => vi.clearAllMocks());

const plain = { reasoning: "2018두100 판결의 법리에 따른다.", holdings: "", summary: "" };
const search = (prec: object[]) => mockFetch.mockResolvedValue({ PrecSearch: { prec } });

// 실응답 모양(표본에서 그대로): 지방세 출처는 법원명이 있고, 국세청 출처는 법원명·판결유형이 비어 있다.
const LOCAL_SC = { 사건번호: "2018두65934", 법원명: "대법원", 데이터출처명: "지방세법령정보시스템", 판결유형: "처분청 승소", 선고일자: "2019.04.11", 판례일련번호: "422760", 사건명: "판결에 영향을 미칠 중요한 사항" };
const NTS_SC = { 사건번호: "대법원-2024-두-34092", 법원명: "", 데이터출처명: "국세법령정보시스템", 판결유형: "", 선고일자: "2024.05.30", 판례일련번호: "351052", 사건명: "(심리불속행) 비사업용토지 제외사유" };
const NTS_HIGH = { 사건번호: "서울고등법원-2024-누-41306", 법원명: "", 데이터출처명: "국세법령정보시스템", 판결유형: "", 선고일자: "2024.10.01", 판례일련번호: "360001", 사건명: "하급심" };
const drfLower = (i: number) => ({ 사건번호: `2024누${i}`, 법원명: "서울고등법원", 데이터출처명: "대법원", 선고일자: "2024.01.01", 판례일련번호: `9${i}`, 사건명: "하급심 인용" });

describe("SRC — 본문을 주는 출처는 스캔한다", () => {
  it("SRC-1: hasFullTextSource — 대법원·지방세법령정보시스템·근로복지공단 = 본문 있음, 국세법령정보시스템 = 없음", () => {
    expect(hasFullTextSource("대법원")).toBe(true);
    expect(hasFullTextSource("지방세법령정보시스템")).toBe(true);
    expect(hasFullTextSource("근로복지공단산재판례")).toBe(true);
    expect(hasFullTextSource("국세법령정보시스템")).toBe(false);
  });

  it("SRC-2: 지방세 출처 대법원 판결의 변경 신호를 잡는다 (종전: 스캔 대상에서 빠져 no_citations/no_signal)", async () => {
    search([LOCAL_SC]);
    mockText.mockResolvedValue({ reasoning: "대법원 2018두100 판결은 이를 변경하기로 한다.", holdings: "", summary: "" });
    const r = await checkPrecedentStatus("2018두100");
    expect(mockText).toHaveBeenCalledWith("422760", "prec", { full: true });
    expect(r.status).toBe("review_needed");
  });

  it("SRC-3: 스캔 상한(6건) 안에서 대법원 판결을 하급심보다 먼저 읽는다", async () => {
    search([...[1, 2, 3, 4, 5, 6, 7].map(drfLower), LOCAL_SC]);
    mockText.mockResolvedValue(plain);
    await checkPrecedentStatus("2018두100");
    expect(mockText.mock.calls[0][0]).toBe("422760");
  });
});

describe("NOTEXT — 본문을 못 주는 대법원 판결은 원문 링크와 함께 목록으로", () => {
  it("NT-1: 국세청 출처 대법원 판결 → supremeNoText (원문 링크 포함), 하급심은 넣지 않는다", async () => {
    search([NTS_SC, NTS_HIGH]);
    const r = await checkPrecedentStatus("2018두100");
    expect(r.supremeNoText.map((c) => c.caseNo)).toEqual(["대법원-2024-두-34092"]);
    expect(r.supremeNoText[0].sourceUrl).toBe("https://www.law.go.kr/LSW/precInfoP.do?precSeq=351052");
    expect(mockText).not.toHaveBeenCalled();
  });

  it("NT-2: 전원합의체로 보이면 수동 확인(enBancUnscanned) 쪽에만 — 두 목록에 겹치지 않는다", async () => {
    search([{ ...NTS_SC, 사건명: "법인세 [전원합의체]" }]);
    const r = await checkPrecedentStatus("2018두100");
    expect(r.enBancUnscanned).toHaveLength(1);
    expect(r.supremeNoText).toHaveLength(0);
  });

  it("NT-3(긍정 짝): 대법원 출처로 읽은 판결은 목록에 없다", async () => {
    search([{ ...LOCAL_SC, 데이터출처명: "대법원" }]);
    mockText.mockResolvedValue(plain);
    const r = await checkPrecedentStatus("2018두100");
    expect(r.supremeNoText).toHaveLength(0);
    expect(r.status).toBe("no_signal");
  });
});
