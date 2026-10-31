/**
 * §164④ 칸 「공시가격 조회」 — 1990년분이 없을 때 1991년분을 1990.1.1. 칸에 채우지 않는다(사용자 결정 2026-10-31 a).
 * 계획서 `docs/02-design/features/successor-right-carryover-contribution.plan.md` §18 Vworld 실호출 — 1990년분 유무는 필지마다 다르다
 * (역삼동 737 = 1990 있음 · 광복동1가 1 = 1991부터 · 인계동 1111 = 1992부터).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Pre1990LandValuationInput, type Pre1990FormSlice } from "@/components/calc/inputs/Pre1990LandValuationInput";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FORM: Pre1990FormSlice = {
  pre1990Enabled: false, pre1990PricePerSqm_1990: "", pre1990PricePerSqm_atTransfer: "",
  pre1990Grade_current: "", pre1990Grade_prev: "", pre1990Grade_atAcq: "", pre1990GradeMode: "value",
};

/** 연도별 응답 — 값이 없으면 라우트처럼 404 `PRICE_NOT_FOUND`. */
function stubLookup(byYear: Record<string, number>) {
  const fetchMock = vi.fn(async (url: string) => {
    const year = new URL(url, "http://localhost").searchParams.get("year") ?? "";
    const price = byYear[year];
    return price
      ? ({ ok: true, json: async () => ({ year, price }) } as unknown as Response)
      : ({ ok: false, json: async () => ({ error: { code: "PRICE_NOT_FOUND" } }) } as unknown as Response);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function lookup() {
  const onChange = vi.fn();
  render(<Pre1990LandValuationInput form={FORM} onChange={onChange} jibun="부산광역시 중구 광복동1가 1" acquisitionDate="1987-06-01" alwaysOpen />);
  fireEvent.click(screen.getByRole("button", { name: "공시가격 조회" }));
  return onChange;
}

describe("§164④ 1990.1.1. 기준 개별공시지가 조회", () => {
  it("1990년분이 있으면 그 값을 칸에 채운다", async () => {
    stubLookup({ "1990": 10_000_000, "1991": 16_800_000 });
    const onChange = lookup();
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ pre1990PricePerSqm_1990: "10000000" }));
    expect(screen.getByText(/1990년 개별공시지가: 10,000,000/)).toBeTruthy();
  });

  it("1990년분이 없고 1991년분만 있으면 칸을 채우지 않고 1991년 값은 참고로만 안내한다", async () => {
    const fetchMock = stubLookup({ "1991": 5_820_000 });
    const onChange = lookup();
    await waitFor(() => expect(screen.getByText(/칸을 채우지 않았습니다/)).toBeTruthy());
    expect(screen.getByText(/참고: 1991년 공시분 5,820,000/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("1990·1991년분이 모두 없으면 직접 입력 안내", async () => {
    stubLookup({});
    const onChange = lookup();
    await waitFor(() => expect(screen.getByText(/1990~1991년 가격 정보 없음/)).toBeTruthy());
    expect(onChange).not.toHaveBeenCalled();
  });
});
