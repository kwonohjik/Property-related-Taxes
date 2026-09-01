/**
 * @vitest-environment jsdom
 *
 * 키움 자동조회 무한 「조회 중…」 회귀 anchor (TS-01~TS-06).
 *
 * 제보(2026-09-01): 「시가총액 자동 산정」 버튼이 `🔄 조회 중...`에서 영구 고착.
 * 원인은 dev 서버 OOM으로 응답이 끊겼는데 클라이언트에 timeout·abort가 없어
 * Promise가 영구 pending → `finally { setLoading(false) }` 미도달.
 * 계획서: docs/00-pm/dev-server-oom-kiwoom-spinner.plan.md D-2
 *
 * ⚠️ **무응답(hang) mock을 쓴다.** 착수 전 실측에서 기존 최근접 테스트
 * (`inheritance-stock-name-autocomplete.test.tsx:131` T-05)는 `mockFetchReject()` —
 * **거부**이지 **멈춤**이 아니라 제보 증상을 덮지 못했다. 둘은 실패 모드가 반대다:
 *   reject → catch·finally 도달 → loading 해제 ✅
 *   hang   → 어디에도 미도달 → loading 영구 고착 ❌
 *
 * 대상 3곳은 착수 전 실측에서 **테스트 0건**이었다(안전망 0 ⇒ 신규 anchor 필수).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { KiwoomMarketCapHelper } from "@/components/calc/stock-transfer/KiwoomMarketCapHelper";
import { KiwoomPostListingAutoFetchButton } from "@/components/calc/stock-transfer/KiwoomPostListingAutoFetchButton";
import { useKiwoomValuationFetch } from "@/components/calc/inheritance/listed-stock/useKiwoomValuationFetch";
import { KIWOOM_FETCH_TIMEOUT_MS } from "@/lib/kiwoom/fetch-with-timeout";

/** 영원히 매듭짓지 않되 abort 시에만 거부하는 fetch — 죽은 서버의 실제 거동. */
function stubHangingFetch() {
  vi.stubGlobal("fetch", (_input: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("The operation was aborted.", "AbortError"));
      });
    }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  stubHangingFetch();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** 타임아웃까지 타이머를 진행시키고 pending microtask를 비운다. */
async function advancePastTimeout() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(KIWOOM_FETCH_TIMEOUT_MS);
  });
}

// ─────────────────────────────────────────────────────────────
// 1) KiwoomMarketCapHelper — 제보된 바로 그 버튼
// ─────────────────────────────────────────────────────────────

function renderMarketCapHelper() {
  return render(
    <KiwoomMarketCapHelper
      securityCode="005930"
      priorYearEndDate="2025-12-31"
      marketType="kospi"
      tradingHalt={false}
      selfOwnedShares="1000"
      combinedOwnedShares="0"
      isLargestShareholderGroup={false}
      onFill={() => {}}
    />,
  );
}

describe("키움 자동조회 무한 스피너 anchor", () => {
  it("TS-01 시가총액 자동 산정 — 무응답 시 타임아웃 전까지는 「조회 중...」이다", async () => {
    renderMarketCapHelper();
    fireEvent.click(screen.getByRole("button", { name: /시총 자동 계산/ }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(KIWOOM_FETCH_TIMEOUT_MS - 1);
    });
    expect(screen.getByRole("button").textContent).toContain("조회 중");
  });

  it("TS-02 시가총액 자동 산정 — 타임아웃 후 스피너가 풀리고 오류가 표시된다", async () => {
    renderMarketCapHelper();
    fireEvent.click(screen.getByRole("button", { name: /시총 자동 계산/ }));
    await advancePastTimeout();

    // 스피너 해제 — 제보 증상의 정확한 반대
    expect(screen.getByRole("button").textContent).not.toContain("조회 중");
    expect(screen.getByRole("button").textContent).toContain("시총 자동 계산");
    // 원인이 화면에 드러난다 (조용한 실패 금지)
    expect(screen.getByText(/조회 시간 초과 \(15초\)/)).toBeTruthy();
  });

  it("TS-03 시가총액 자동 산정 — 타임아웃 후 버튼이 다시 눌리는 상태로 복귀한다", async () => {
    renderMarketCapHelper();
    const btn = () => screen.getByRole("button");
    fireEvent.click(btn());
    expect(btn()).toBeDisabled(); // loading 중 canFetch=false
    await advancePastTimeout();
    expect(btn()).not.toBeDisabled();
  });

  // ───────────────────────────────────────────────────────────
  // 2) KiwoomPostListingAutoFetchButton — 취득 후 상장 환산
  // ───────────────────────────────────────────────────────────

  it("TS-04 취득 후 상장 자동조회 — 타임아웃 후 스피너 해제 + 오류 표시", async () => {
    render(
      <KiwoomPostListingAutoFetchButton
        securityCode="005930"
        listingDate="2025-06-30"
        marketType="kospi"
        tradingHalt={false}
        onFill={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /키움 자동조회/ }));
    await advancePastTimeout();

    expect(screen.getByRole("button").textContent).not.toContain("조회 중");
    expect(screen.getByText(/조회 시간 초과 \(15초\)/)).toBeTruthy();
  });

  // ───────────────────────────────────────────────────────────
  // 3) useKiwoomValuationFetch — 상속·증여 상장주식 §63①1가목
  // ───────────────────────────────────────────────────────────

  it("TS-05 상장주식 평가 자동조회 — 타임아웃 후 loading 해제 + error 세팅", async () => {
    function Harness() {
      const { loading, error, fetch: doFetch } = useKiwoomValuationFetch({
        stockCode: "005930",
        valuationDate: "2025-06-30",
      });
      return (
        <div>
          <button type="button" onClick={() => void doFetch()}>
            조회
          </button>
          <span data-testid="loading">{loading ? "loading" : "idle"}</span>
          <span data-testid="error">{error ?? ""}</span>
        </div>
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "조회" }));
    expect(screen.getByTestId("loading").textContent).toBe("loading");

    await advancePastTimeout();

    expect(screen.getByTestId("loading").textContent).toBe("idle");
    expect(screen.getByTestId("error").textContent).toMatch(/조회 시간 초과 \(15초\)/);
  });

  it("TS-06 자동 채움은 일어나지 않는다 — 타임아웃 시 onFill 미호출 (자동 fallback 0건 정책)", async () => {
    const onFill = vi.fn();
    render(
      <KiwoomMarketCapHelper
        securityCode="005930"
        priorYearEndDate="2025-12-31"
        marketType="kospi"
        tradingHalt={false}
        selfOwnedShares="1000"
        combinedOwnedShares="0"
        isLargestShareholderGroup={false}
        onFill={onFill}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /시총 자동 계산/ }));
    await advancePastTimeout();
    expect(onFill).not.toHaveBeenCalled();
  });
});
