/**
 * StandardPriceInput — 공동주택 공시가격 조회 시 동·호(dong/ho) API 전달 회귀 anchor
 *
 * 버그: dong/ho 미전달 시 서버 pickUnit이 건물 전체 중 임의의 첫 세대 가격 반환.
 *   (기흥역센트럴푸르지오 201동 3204호 2025년 정답 518,000,000 → 동/호 없으면 465,000,000 등 오답)
 *
 * 이 테스트는 "조회 버튼 클릭 → /api/address/standard-price 요청 URL에 dong·ho 포함"을 잠근다.
 * 계획: docs/00-pm/standard-price-dong-ho-fix.plan.md
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockFetchCapture() {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string) => {
    calls.push(String(url));
    return {
      ok: true,
      json: async () => ({
        price: 518000000,
        announcedDate: "20250429",
        priceType: "apart_housing_price",
        year: "2025",
      }),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

describe("[DONGHO] StandardPriceInput 공동주택 조회 동·호 전달", () => {
  it("DH-1: house_apart 조회 시 요청 URL에 dong·ho 쿼리 포함", async () => {
    const calls = mockFetchCapture();
    render(
      <StandardPriceInput
        propertyKind="house_apart"
        totalPrice=""
        onTotalPriceChange={() => {}}
        jibun="경기도 용인시 기흥구 구갈동 662"
        dong="201동"
        ho="3204"
        referenceDate="2025-06-01"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /공시가격 조회/ }));

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const url = calls[0];
    const qs = new URLSearchParams(url.split("?")[1] ?? "");
    expect(qs.get("dong")).toBe("201동");
    expect(qs.get("ho")).toBe("3204");
    expect(qs.get("propertyType")).toBe("housing");
  });

  it("DH-2: dong/ho 미전달이면 URL에 dong·ho 쿼리 없음 (기존 동작 보존)", async () => {
    const calls = mockFetchCapture();
    render(
      <StandardPriceInput
        propertyKind="house_apart"
        totalPrice=""
        onTotalPriceChange={() => {}}
        jibun="경기도 용인시 기흥구 구갈동 662"
        referenceDate="2025-06-01"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /공시가격 조회/ }));

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const qs = new URLSearchParams(calls[0].split("?")[1] ?? "");
    expect(qs.has("dong")).toBe(false);
    expect(qs.has("ho")).toBe(false);
  });
});
