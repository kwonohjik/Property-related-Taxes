/**
 * HousingStdPriceLookupField anchor — 주택 기준시가 Vworld 조회
 *
 * 핵심 가드: 주택 응답 price는 **총액(원)** → 직접 세팅(면적곱 금지). 공동/개별 배지.
 */

import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { HousingStdPriceLookupField } from "@/components/calc/inputs/HousingStdPriceLookupField";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockFetch(body: unknown, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe("HousingStdPriceLookupField — Vworld 주택 조회", () => {
  it("공동주택 조회 성공 → 총액(원) 직접 세팅(면적곱 아님) + 공동주택 배지", async () => {
    const onChange = vi.fn();
    // area가 응답에 있어도 price×area 하지 않고 price(총액)를 직접 세팅해야 함
    mockFetch({ price: 400_000_000, priceType: "apart_housing_price", area: 84.5 });
    render(
      <HousingStdPriceLookupField
        label="기준시가"
        value=""
        onChange={onChange}
        jibun="서울특별시 강남구 역삼동 1-1"
        referenceDate="2016-08-12"
        testidPrefix="t"
      />,
    );
    fireEvent.click(screen.getByTestId("t-lookup-btn"));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("400000000"));
    // 면적곱이었다면 400000000×84.5=33,800,000,000 → 아님을 확정
    expect(onChange).not.toHaveBeenCalledWith(String(400_000_000 * 84.5));
    expect(await screen.findByTestId("t-pricetype-badge")).toHaveTextContent("공동주택");
  });

  it("개별주택 조회(fallback) → 개별주택 배지", async () => {
    const onChange = vi.fn();
    mockFetch({ price: 250_000_000, priceType: "indvd_housing_price" });
    render(
      <HousingStdPriceLookupField
        label="기준시가"
        value=""
        onChange={onChange}
        jibun="경기도 어딘가 100"
        referenceDate="2019-03-01"
        testidPrefix="t"
      />,
    );
    fireEvent.click(screen.getByTestId("t-lookup-btn"));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("250000000"));
    expect(await screen.findByTestId("t-pricetype-badge")).toHaveTextContent("개별주택");
  });

  it("조회 실패(데이터 없음) → 에러 메시지·onChange 미호출", async () => {
    const onChange = vi.fn();
    mockFetch({ error: { message: "공시가격 없음" } }, false);
    render(
      <HousingStdPriceLookupField
        label="기준시가"
        value=""
        onChange={onChange}
        jibun="서울 어딘가 1"
        referenceDate="2016-08-12"
        testidPrefix="t"
      />,
    );
    fireEvent.click(screen.getByTestId("t-lookup-btn"));
    await waitFor(() => expect(screen.getByTestId("t-status")).toHaveTextContent("공시가격 없음"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("지번 미입력 → 조회 버튼 비활성 + 안내", () => {
    const onChange = vi.fn();
    render(
      <HousingStdPriceLookupField
        label="기준시가"
        value=""
        onChange={onChange}
        jibun=""
        referenceDate="2016-08-12"
        testidPrefix="t"
      />,
    );
    expect(screen.getByTestId("t-lookup-btn")).toBeDisabled();
    expect(screen.getByText("지번 주소 입력 후 조회 가능합니다.")).toBeTruthy();
  });
});
