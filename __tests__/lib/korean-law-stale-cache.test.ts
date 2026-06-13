/**
 * 법제처 주말·공휴일 접속 차단 시 stale 캐시 fallback 검증.
 *
 * 법제처 DRF API는 주말/야간에 TCP 연결을 거부(fetch failed) → 만료(TTL) 캐시라도 반환해
 * 한 번이라도 조회된 조문·법령은 계속 표시되도록 한 동작을 anchor한다.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import {
  fetchArticle,
  searchLaw,
  ARTICLE_CACHE_VERSION,
} from "../../lib/legal-verification/korean-law-client";

const CACHE_DIR = path.resolve(process.cwd(), ".legal-cache");
const MST = "TESTSTALE99";
// fetchArticle 캐시 키는 파서 버전 suffix(_v{ARTICLE_CACHE_VERSION})를 포함한다.
// suffix를 빠뜨리면 stale fallback이 캐시를 못 찾아 OC 미설정 throw로 떨어진다.
const articleFile = path.join(
  CACHE_DIR,
  `article_${MST}_제1조_v${ARTICLE_CACHE_VERSION}.json`
);
const searchFile = path.join(CACHE_DIR, "search_테스트스테일법.json");

const cleanup = async () => {
  await fs.unlink(articleFile).catch(() => {});
  await fs.unlink(searchFile).catch(() => {});
};

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanup();
});

/** 60일 전 mtime으로 만료된 캐시 작성 (TTL 30일 초과) */
async function writeExpired(file: string, data: unknown): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data), "utf-8");
  const old = new Date(Date.now() - 60 * 24 * 3600 * 1000);
  await fs.utimes(file, old, old);
}

describe("법제처 접속 차단 시 stale 캐시 fallback", () => {
  it("fetchArticle: 만료 캐시 + fetch 실패 → stale 반환(throw 안 함)", async () => {
    await writeExpired(articleFile, {
      title: "테스트조문",
      fullText: "제1조 본문 내용",
      lawName: "테스트스테일법",
      articleNo: "제1조",
    });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fetch failed"));

    const result = await fetchArticle(MST, "테스트스테일법", "제1조");
    expect(result?.fullText).toBe("제1조 본문 내용");
  });

  it("searchLaw: 만료 캐시 + fetch 실패 → stale 반환", async () => {
    await writeExpired(searchFile, {
      lawName: "테스트스테일법",
      lawId: "999999",
      mst: MST,
      promulgationDate: "20240101",
    });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fetch failed"));

    const result = await searchLaw("테스트스테일법");
    expect(result?.mst).toBe(MST);
  });

  it("fetchArticle: 캐시 없음 + fetch 실패 → 그대로 throw (stale 없으면 fallback 불가)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fetch failed"));
    await expect(fetchArticle("NOCACHE_MST_X", "없는법", "제1조")).rejects.toThrow();
  });
});
