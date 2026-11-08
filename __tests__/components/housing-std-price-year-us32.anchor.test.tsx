// US-32 — 주택 기준시가 자동조회 추천 연도: 주택가격 공시(4/30)를 따른다. 토지 추천(5/31)은 그대로.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { HousingStdPriceLookupField } from "@/components/calc/inputs/HousingStdPriceLookupField";
import { recommendHousingPriceYear, recommendLandPriceYear } from "@/lib/utils/land-price-year";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("[US-32] recommendHousingPriceYear 경계", () => {
  it.each([
    ["2009-04-29", 2008],
    ["2009-04-30", 2008],
    ["2009-05-01", 2009],
    ["2009-05-31", 2009],
    ["2009-06-01", 2009],
    ["2026-05-11", 2026],
    ["2026-01-10", 2025],
  ])("%s -> %i", (d, y) => {
    expect(recommendHousingPriceYear(d)).toBe(y);
  });
  it("토지 추천은 바뀌지 않는다 (5/31 이하 전년도)", () => {
    expect(recommendLandPriceYear("2009-05-31")).toBe(2008);
    expect(recommendLandPriceYear("2009-06-01")).toBe(2009);
  });
});

describe("[US-32] HousingStdPriceLookupField 렌더 — 5월 기준일", () => {
  it("2026-05-20 기준일: 자동 연도 2026 으로 조회 요청", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ price: 700000000, priceType: "apart_housing_price" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <HousingStdPriceLookupField label="양도시 기준시가" value="" onChange={() => {}} jibun="서울 어딘가 1" referenceDate="2026-05-20" testidPrefix="t" />,
    );
    const btn = screen.getAllByRole("button").find((b) => /조회/.test(b.textContent ?? ""));
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain("year=2026");
  });
});
