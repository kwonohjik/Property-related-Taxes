/**
 * 판례 생사 확인(cite-check) — 30초 라우트 안에서 끝나고, 못 읽은 본문을 「신호 미감지」로 말하지 않는다.
 *
 * 2026-10-04 실측(한국 IP, 캐시 없음): 후속 인용 검색 147~221ms · 본문 1건 145~342ms → 전체 0.15~1.1초.
 * 평소엔 넉넉하다. 문제는 법제처가 **응답 없이 매달릴 때**다 — 호출 1건의 재시도 예산은
 * 5s + 0.6s + 5s ≈ 10.6s(client-core fetchJson)이고 검색 1 + 본문 최대 6건이 **직렬**이라
 * 최악 ≈ 74s. 라우트 maxDuration 30s 에서 잘리면 그때까지 읽은 결과도 버려지고 오류만 뜬다.
 *
 * ⇒ 본문 스캔은 시작 후 17s 가 지나면 새로 시작하지 않는다(17 + 10.6 ≈ 27.6s < 30s).
 *
 * 함께 고친 것 — 「못 읽음」이 「읽었는데 신호 없음」으로 보이던 경로 2개:
 *   · 본문 조회가 실패(또는 시간 예산 초과)해도 상태가 no_signal(초록 「변경·폐기 신호 미감지」)이었다.
 *     ⇒ 스캔하려던 대법원 판례를 다 못 읽었으면 scan_incomplete(확인 미완료).
 *   · 전원합의체 본문 조회가 실패해도 「스캔한 것」으로 쳐서 enBancUnscanned(수동 확인 권장)에서 빠졌다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
import { checkPrecedentStatus, decideStatus } from "@/lib/korean-law/cite-check";

const mockFetch = fetchJson as ReturnType<typeof vi.fn>;
const mockText = getDecisionText as ReturnType<typeof vi.fn>;

let clock = 0;
beforeEach(() => {
  vi.clearAllMocks();
  clock = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => clock);
});
afterEach(() => vi.restoreAllMocks());

/** 대법원 본문 제공 후속 판례 n건 (enBanc 지정 가능) */
function citing(n: number, enBancIdx: number[] = []) {
  mockFetch.mockResolvedValue({
    PrecSearch: {
      prec: Array.from({ length: n }, (_, i) => ({
        사건번호: `2023두${i + 1}`,
        사건명: enBancIdx.includes(i) ? "법인세 [전원합의체]" : "단순 인용",
        데이터출처명: "대법원",
        선고일자: "2025.01.01",
        판례일련번호: String(i + 1),
      })),
    },
  });
}
const plain = { reasoning: "2018두100 판결의 법리에 따른다.", holdings: "", summary: "" };

describe("DEADLINE — 본문 스캔은 시간 예산 안에서만", () => {
  it("DL-1: 본문 1건이 10s 씩 걸리면 17s 를 넘긴 뒤로는 새로 읽지 않는다", async () => {
    citing(6);
    mockText.mockImplementation(async () => {
      clock += 10_000;
      return plain;
    });
    const r = await checkPrecedentStatus("2018두100");
    // 0s 시작 → 1건(10s) → 2건(20s) → 17s 초과라 3건째부터 시작하지 않는다
    expect(mockText).toHaveBeenCalledTimes(2);
    expect(r.scannedCount).toBe(2);
    expect(clock - 1_000_000).toBeLessThan(30_000);
  });

  it("DL-2(긍정 짝): 빠르면 상한(6건)까지 다 읽는다", async () => {
    citing(6);
    mockText.mockImplementation(async () => {
      clock += 300;
      return plain;
    });
    const r = await checkPrecedentStatus("2018두100");
    expect(r.scannedCount).toBe(6);
    expect(r.status).toBe("no_signal");
  });
});

describe("INCOMPLETE — 못 읽은 본문을 「신호 미감지」로 말하지 않는다", () => {
  it("INC-1: 시간 예산으로 일부만 읽었으면 scan_incomplete", async () => {
    citing(6);
    mockText.mockImplementation(async () => {
      clock += 10_000;
      return plain;
    });
    const r = await checkPrecedentStatus("2018두100");
    expect(r.status).toBe("scan_incomplete");
    expect(r.unscannedCount).toBe(4);
  });

  it("INC-2: 본문 조회가 실패하면 scan_incomplete (종전: no_signal)", async () => {
    citing(2);
    mockText.mockRejectedValueOnce(new Error("UPSTREAM")).mockResolvedValueOnce(plain);
    const r = await checkPrecedentStatus("2018두100");
    expect(r.scannedCount).toBe(1);
    expect(r.unscannedCount).toBe(1);
    expect(r.status).toBe("scan_incomplete");
  });

  it("INC-3: 전원합의체 본문 조회가 실패하면 수동 확인 목록에 남는다 (종전: 스캔한 것으로 쳐서 빠졌다)", async () => {
    citing(2, [0]);
    mockText.mockRejectedValueOnce(new Error("UPSTREAM")).mockResolvedValueOnce(plain);
    const r = await checkPrecedentStatus("2018두100");
    expect(r.enBancUnscanned.map((c) => c.caseNo)).toEqual(["2023두1"]);
    expect(r.status).toBe("review_needed");
  });

  it("INC-4: 변경 신호를 찾았으면 일부를 못 읽었어도 review_needed 가 앞선다", async () => {
    citing(2);
    mockText
      .mockResolvedValueOnce({ reasoning: "대법원 2018두100 판결은 이를 변경하기로 한다.", holdings: "", summary: "" })
      .mockRejectedValueOnce(new Error("UPSTREAM"));
    const r = await checkPrecedentStatus("2018두100");
    expect(r.status).toBe("review_needed");
    expect(r.unscannedCount).toBe(1);
  });

  it("INC-5(긍정 짝): 상한(6건)을 넘는 나머지는 미완료로 치지 않는다 — 종전 설계 그대로", async () => {
    citing(9);
    mockText.mockResolvedValue(plain);
    const r = await checkPrecedentStatus("2018두100");
    expect(r.scannedCount).toBe(6);
    expect(r.unscannedCount).toBe(0);
    expect(r.status).toBe("no_signal");
  });

  it("INC-6: decideStatus 위계 — 신호 > 전합 미확인 > 미완료 > 신호 없음 > 인용 없음", () => {
    const sig = [{ citingCaseNo: "a", citingDate: "", label: "x", excerpt: "" }];
    const eb = [{ caseNo: "b", title: "", court: "", date: "", isEnBanc: true, id: "1", hasFullText: true }];
    expect(decideStatus(sig, eb, 3, 1)).toBe("review_needed");
    expect(decideStatus([], eb, 3, 1)).toBe("review_needed");
    expect(decideStatus([], [], 3, 1)).toBe("scan_incomplete");
    expect(decideStatus([], [], 3, 0)).toBe("no_signal");
    expect(decideStatus([], [], 0, 0)).toBe("no_citations");
  });
});
