/**
 * @vitest-environment jsdom
 *
 * NBL 토지가액·도시지역 여부 자동조회 버튼 (NblLandAutoFetch)
 *  - 비활성화 사유(주소·면적·양도일 누락)
 *  - 클릭 → standard-price 2회(당해·직전) → 토지가액 = 공시지가 × 면적 × 지분
 *  - 도시지역 여부 안내 (용도지역명 → 도시/비도시)
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import {
  NblLandValueAutoFetchButton,
  NblUrbanZoneCheckButton,
} from "@/components/calc/transfer/nbl/NblLandAutoFetch";

afterEach(() => cleanup());

// year별 공시지가·용도지역 mock — /api/address/standard-price?...&year=YYYY
function mockFetch(byYear: Record<string, { price: number; zoneName?: string }>) {
  return vi.fn(async (url: string) => {
    const year = new URL(url, "http://localhost").searchParams.get("year") ?? "";
    const hit = byYear[year];
    if (!hit) {
      return { ok: true, json: async () => ({ error: { message: `${year} 없음` } }) } as Response;
    }
    return {
      ok: true,
      json: async () => ({ price: hit.price, year, zoneName: hit.zoneName }),
    } as Response;
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("NblLandValueAutoFetchButton — 비활성화 사유", () => {
  it("주소 없음 → 버튼 disabled + 사유", () => {
    render(
      <NblLandValueAutoFetchButton jibun="" area={100} ratio={1} transferDate="2026-02-18" onResult={() => {}} />,
    );
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByText(/소재지.*입력/)).toBeTruthy();
  });

  it("면적 없음 → disabled", () => {
    render(
      <NblLandValueAutoFetchButton jibun="서울 강남구 역삼동 737" area={0} ratio={1} transferDate="2026-02-18" onResult={() => {}} />,
    );
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByText(/취득 면적/)).toBeTruthy();
  });

  it("양도일 없음 → disabled", () => {
    render(
      <NblLandValueAutoFetchButton jibun="서울 강남구 역삼동 737" area={100} ratio={1} transferDate="" onResult={() => {}} />,
    );
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByText(/양도일/)).toBeTruthy();
  });
});

describe("NblLandValueAutoFetchButton — 자동조회 산식", () => {
  it("당해(2026)·직전(2025) 공시지가 × 면적 × 지분 — 양도일 6~12월", async () => {
    // 양도일 2026-08-10 → 5/31 지남 → 당해=2026, 직전(= 2025.12.31. 기준시가)=2025
    vi.stubGlobal("fetch", mockFetch({ "2026": { price: 1000, zoneName: "일반상업지역" }, "2025": { price: 900 } }));
    const onResult = vi.fn();
    render(
      <NblLandValueAutoFetchButton
        jibun="서울 강남구 역삼동 737"
        area={100}
        ratio={0.5}
        transferDate="2026-08-10"
        onResult={onResult}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(onResult).toHaveBeenCalled());
    // 당해 = floor(1000×100×0.5)=50000, 직전 = floor(900×100×0.5)=45000
    expect(onResult).toHaveBeenCalledWith("50000", "45000");
  });

  it("NBL2611-V6-PU07: 양도일 1~5월 — 직전도 전년(2025) 공시지가(종전: 전전년 2024를 채움)", async () => {
    // 2024가 mock에 있으면 종전 동작(직전=2024)이 값을 채우므로, 2025만 두어 2024 조회 시 실패하게 한다.
    vi.stubGlobal("fetch", mockFetch({ "2025": { price: 1000 } }));
    const onResult = vi.fn();
    render(
      <NblLandValueAutoFetchButton
        jibun="서울 강남구 역삼동 737"
        area={100}
        ratio={0.5}
        transferDate="2026-02-18"
        onResult={onResult}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(onResult).toHaveBeenCalled());
    expect(onResult).toHaveBeenCalledWith("50000", "50000");
  });

  it("지분 미지정(1) → 전체 가액", async () => {
    vi.stubGlobal("fetch", mockFetch({ "2026": { price: 637000 }, "2025": { price: 600000 } }));
    const onResult = vi.fn();
    render(
      <NblLandValueAutoFetchButton
        jibun="인천 중구 내동 6-20"
        area={314.1}
        ratio={1}
        transferDate="2026-08-10"
        onResult={onResult}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(onResult).toHaveBeenCalled());
    // 당해 = floor(637000×314.1)=200,081,700
    expect(onResult).toHaveBeenCalledWith(String(Math.floor(637000 * 314.1)), String(Math.floor(600000 * 314.1)));
  });
});

describe("NblUrbanZoneCheckButton — 도시지역 여부", () => {
  it("주소 없음 → disabled", () => {
    render(<NblUrbanZoneCheckButton jibun="" transferDate="2026-02-18" />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("도시지역(일반상업지역) 안내", async () => {
    vi.stubGlobal("fetch", mockFetch({ "2025": { price: 1000, zoneName: "일반상업지역" } }));
    render(<NblUrbanZoneCheckButton jibun="서울 강남구 역삼동 737" transferDate="2026-02-18" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText(/일반상업지역/)).toBeTruthy());
    expect(screen.getByText(/편입일을 확인해/)).toBeTruthy();
  });

  it("비도시지역(보전관리지역) 안내", async () => {
    vi.stubGlobal("fetch", mockFetch({ "2025": { price: 50900, zoneName: "보전관리지역" } }));
    render(<NblUrbanZoneCheckButton jibun="평창군 횡계리 1" transferDate="2026-02-18" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText(/보전관리지역/)).toBeTruthy());
    expect(screen.getByText(/유예 대상 아님/)).toBeTruthy();
  });
});
