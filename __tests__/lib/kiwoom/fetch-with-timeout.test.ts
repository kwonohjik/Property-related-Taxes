/**
 * fetchKiwoomWithTimeout 계약 테스트.
 *
 * 이 저장소에서 timeout·abort 계약을 단언하는 첫 테스트다 — 착수 전 실측 결과
 * `__tests__/`·`e2e/` 전역에서 `AbortError`·`controller.abort`를 단언하는 것이 0건이었다
 * (검색 히트는 전부 `{ timeout: 2000 }` 같은 **단언 대기 옵션**이라 계약과 무관하다).
 *
 * ⚠️ **무응답(hang) mock을 쓴다.** 거부(reject) mock은 제보 증상을 보지 못한다 —
 * 거부는 catch·finally에 도달해 loading이 풀리지만, 멈춤은 어디에도 도달하지 않는다.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchKiwoomWithTimeout,
  KiwoomTimeoutError,
  KIWOOM_FETCH_TIMEOUT_MS,
} from "@/lib/kiwoom/fetch-with-timeout";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** 영원히 resolve/reject 하지 않되, abort 시에만 거부하는 fetch — 실제 fetch의 abort 거동. */
function stubHangingFetch() {
  const calls: { signal?: AbortSignal | null }[] = [];
  vi.stubGlobal("fetch", (_input: unknown, init?: RequestInit) => {
    calls.push({ signal: init?.signal });
    return new Promise<Response>((_resolve, reject) => {
      const fail = () => reject(new DOMException("The operation was aborted.", "AbortError"));
      // 실제 fetch는 **이미** abort된 signal을 받으면 즉시 거부한다. 리스너만 걸면
      // 이벤트가 다시 발생하지 않아 stub이 영원히 매듭지어지지 않는다(= 거짓 실패).
      if (init?.signal?.aborted) fail();
      else init?.signal?.addEventListener("abort", fail);
    });
  });
  return calls;
}

describe("fetchKiwoomWithTimeout", () => {
  it("T-01 무응답 요청은 timeoutMs 경과 시 KiwoomTimeoutError로 거부된다", async () => {
    stubHangingFetch();
    const p = fetchKiwoomWithTimeout("/api/kiwoom/daily-close", { method: "POST" }, 15_000);
    const assertion = expect(p).rejects.toBeInstanceOf(KiwoomTimeoutError);
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
  });

  it("T-02 타임아웃 직전(−1ms)에는 아직 거부되지 않는다 — 경계", async () => {
    stubHangingFetch();
    let settled = false;
    const p = fetchKiwoomWithTimeout("/api/kiwoom/daily-close", undefined, 15_000).catch(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(14_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(settled).toBe(true);
  });

  it("T-03 오류 문구가 사용자 문구로 그대로 쓸 수 있는 형태다 (호출부가 message를 표시한다)", async () => {
    stubHangingFetch();
    const p = fetchKiwoomWithTimeout("/api/kiwoom/search", undefined, 15_000);
    const assertion = expect(p).rejects.toThrow("조회 시간 초과 (15초)");
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
  });

  it("T-04 fetch에 AbortSignal이 실제로 전달된다", async () => {
    const calls = stubHangingFetch();
    const p = fetchKiwoomWithTimeout("/api/kiwoom/search", undefined, 1_000).catch(() => {});
    expect(calls).toHaveLength(1);
    expect(calls[0].signal).toBeInstanceOf(AbortSignal);
    expect(calls[0].signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls[0].signal?.aborted).toBe(true);
    await p;
  });

  it("T-05 정상 응답 시 타이머를 해제한다 — 누수 0", async () => {
    const res = new Response(JSON.stringify({ ok: true }), { status: 200 });
    vi.stubGlobal("fetch", () => Promise.resolve(res));
    const out = await fetchKiwoomWithTimeout("/api/kiwoom/search", undefined, 15_000);
    expect(out.status).toBe(200);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("T-06 timeout이 아닌 네트워크 오류는 원래 오류 그대로 전파된다", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    await expect(
      fetchKiwoomWithTimeout("/api/kiwoom/search", undefined, 15_000),
    ).rejects.toThrow("Failed to fetch");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("T-07 기본 timeout 상수는 15초다", () => {
    expect(KIWOOM_FETCH_TIMEOUT_MS).toBe(15_000);
  });

  it("T-08 호출부가 넘긴 signal이 **이미** abort돼 있으면 요청을 내보내지 않는다", async () => {
    const calls = stubHangingFetch();
    const ac = new AbortController();
    ac.abort();
    await expect(
      fetchKiwoomWithTimeout("/api/kiwoom/search", { signal: ac.signal }, 15_000),
    ).rejects.toThrow();
    expect(calls[0].signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("T-09 호출부 signal이 나중에 abort되면 KiwoomTimeoutError가 아니라 원래 abort로 전파된다", async () => {
    stubHangingFetch();
    const ac = new AbortController();
    const p = fetchKiwoomWithTimeout("/api/kiwoom/search", { signal: ac.signal }, 15_000);
    const assertion = expect(p).rejects.not.toBeInstanceOf(KiwoomTimeoutError);
    ac.abort();
    await assertion;
  });
});
