/**
 * 행위시법 — 버전 목록(eflaw 연혁)은 30일이 아니라 1일 캐시. 만료돼도 법제처가 막히면 stale 로 답한다.
 *
 * 종전: 버전 목록을 공용 30일 TTL 로 캐시했다. 목록이 캐시된 뒤 공포된 개정은 최대 30일간 목록에 없어
 *   ① 그 시행일 이후를 기준일로 물으면 **옛 버전 조문**을 「당시 시행 조문」으로 답하고
 *   ② 현행 라벨·「이후 개정」 목록·부칙 발췌 대상(공포번호)도 함께 틀린다.
 * 실례(2026-10-04 실측): 「소득세법 시행령」 제36737호 — 2026-09-30 공포, 2026-10-01 시행.
 *   9월 하순에 목록이 캐시됐다면 10월 내내 10-01 이후 기준일이 직전 버전으로 답해진다.
 *   같은 기간 조세특례제한법도 09-08·09-15 공포 2건이 새로 생겼다.
 *
 * 조문 본문(eflaw_article_{MST}_{efYd})·부칙(law_addenda_{MST})은 버전이 확정된 키라 30일 그대로 둔다.
 * 30일 TTL 의 본래 이유(주말·야간 법제처 차단)는 「만료 캐시라도 반환」 fallback 으로 지킨다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";

vi.mock("@/lib/korean-law/client-core", async (orig) => {
  const actual = await orig<typeof import("@/lib/korean-law/client-core")>();
  return { ...actual, fetchJson: vi.fn() };
});

import { fetchJson } from "@/lib/korean-law/client-core";
import { fetchLawVersions, getApplicableLaw } from "@/lib/korean-law/applicable-law";

const mockFetch = fetchJson as ReturnType<typeof vi.fn>;
const LAW = "테스트버전법";
const FILE = path.resolve(process.cwd(), ".legal-cache", `eflaw_versions_${LAW}.json`);
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const OLD = { mst: "900001", efYd: "20250101", ancYd: "20241231", ancNo: "100", rrCls: "일부개정", statusLabel: "현행" };
const NEW = { 법령명한글: LAW, 법령일련번호: "900002", 시행일자: "20261001", 공포일자: "20260930", 공포번호: "101", 제개정구분명: "일부개정", 현행연혁코드: "현행" };
const OLD_LIVE = { 법령명한글: LAW, 법령일련번호: "900001", 시행일자: "20250101", 공포일자: "20241231", 공포번호: "100", 제개정구분명: "일부개정", 현행연혁코드: "연혁" };

async function writeCachedList(ageMs: number) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify({ lawName: LAW, versions: [OLD] }), "utf-8");
  const t = new Date(Date.now() - ageMs);
  await fs.utimes(FILE, t, t);
}

/** eflaw 검색 → 새 버전 포함 목록, 조문 본문 → MST 별로 다른 텍스트 */
function liveApi() {
  mockFetch.mockImplementation(async (endpoint: string, params: Record<string, string>) => {
    if (endpoint === "lawSearch.do") return { LawSearch: { law: [NEW, OLD_LIVE] } };
    if (params.target === "eflaw") {
      return { 법령: { 조문: { 조문단위: [{ 조문여부: "조문", 조문번호: "1", 조문제목: "목적", 조문내용: `제1조(목적) 본문 MST=${params.MST}` }] } } };
    }
    return { 법령: { 부칙: { 부칙단위: [] } } };
  });
}

beforeEach(() => vi.clearAllMocks());
afterEach(async () => {
  await fs.unlink(FILE).catch(() => {});
});

describe("TTL — 버전 목록 캐시는 1일", () => {
  it("TTL-1: 2일 지난 목록은 다시 받아 새 개정(10-01 시행)을 본다", async () => {
    await writeCachedList(2 * DAY);
    liveApi();
    const { versions } = await fetchLawVersions(LAW);
    expect(versions.map((v) => v.efYd)).toEqual(["20261001", "20250101"]);
  });

  it("TTL-2(긍정 짝): 1시간 된 목록은 그대로 쓴다 (법제처 호출 없음)", async () => {
    await writeCachedList(HOUR);
    const { versions } = await fetchLawVersions(LAW);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(versions).toEqual([OLD]);
  });

  it("APP-1: 기준일 10-02 행위시법 — 옛 목록이 캐시돼 있어도 10-01 시행본 조문으로 답한다", async () => {
    await writeCachedList(2 * DAY);
    liveApi();
    const r = await getApplicableLaw(LAW, "제1조", "20261002");
    expect(r.version.mst).toBe("900002");
    expect(r.article?.fullText).toContain("MST=900002");
  });
});

describe("STALE — 법제처가 막히면 만료 목록이라도", () => {
  it.each([2 * DAY, 60 * DAY])("STALE-1: %d ms 지난 목록 + 법제처 실패 → 그 목록을 반환 (throw 안 함)", async (age) => {
    await writeCachedList(age);
    mockFetch.mockRejectedValue(new Error("fetch failed"));
    const { versions } = await fetchLawVersions(LAW);
    expect(versions).toEqual([OLD]);
  });

  it("STALE-2: 캐시도 없고 법제처도 실패하면 그대로 throw", async () => {
    mockFetch.mockRejectedValue(new Error("fetch failed"));
    await expect(fetchLawVersions(LAW)).rejects.toThrow("fetch failed");
  });
});
