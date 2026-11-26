/**
 * @vitest-environment jsdom
 *
 * §101② 이력 불러오기(P4) — 모달 후보 표시 · 선택 시 칸 채움·배지 · 칸 수정 시 배지 제거 · 빈 이력 안내
 * (출처 id는 `GiftResaleFormState`에 없고 `toGiftResaleRequestBody`는 수정하지 않았다 — body 미포함은 구조로 보장되며 이 파일은 body를 단언하지 않는다)
 */
import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import type { CalculationRecord } from "@/lib/storage/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const records = vi.hoisted(() => ({ value: [] as unknown[] }));
vi.mock("@/lib/storage/calculation-repository", () => ({
  calculationRepository: { list: vi.fn(async () => records.value) },
}));

import GiftResaleClient from "@/app/calc/gift-resale-101-2/GiftResaleClient";
import { calculationRepository } from "@/lib/storage/calculation-repository";

function rec(id: string, title: string, createdAt: string, resultData: Record<string, unknown>): CalculationRecord {
  return {
    id,
    userId: "u1",
    taxType: "transfer",
    title,
    inputData: {},
    resultData,
    taxLawVersion: "2026-01-01",
    linkedCalculationId: null,
    clientId: null,
    createdAt,
    updatedAt: createdAt,
  } as CalculationRecord;
}
const single = (tax: number) => ({ mode: "single", result: { determinedTax: tax, penaltyTax: 999 } });

beforeEach(() => {
  records.value = [
    rec("a", "양도세 — 수증자 서울", "2026-03-10T03:00:00.000Z", single(36_250_000)),
    rec("b", "양도세 — 일괄", "2026-04-01T03:00:00.000Z", { mode: "bundled", aggregated: {}, apportionment: {} }),
    rec("c", "양도세 — 증여자 서울", "2026-05-20T03:00:00.000Z", single(5_000_000)),
  ];
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(calculationRepository.list).mockClear();
});

const input = (id: string) => screen.getByTestId(id) as HTMLInputElement;

describe("이력 불러오기 모달", () => {
  it("열기 전에는 이력을 읽지 않는다", () => {
    render(<GiftResaleClient />);
    expect(calculationRepository.list).not.toHaveBeenCalled();
  });

  it("후보만 최신순으로 표시 · 일괄은 제외 · 안내 한 줄", async () => {
    render(<GiftResaleClient />);
    fireEvent.click(screen.getByTestId("gr-donee-history-launch"));
    await screen.findByTestId("gr-history-list");
    expect(calculationRepository.list).toHaveBeenCalledWith({ taxType: "transfer", clientId: null });
    const items = screen.getAllByTestId(/^gr-history-item-/);
    expect(items.map((i) => i.getAttribute("data-testid"))).toEqual(["gr-history-item-c", "gr-history-item-a"]);
    expect(items[0].textContent).toContain("양도세 — 증여자 서울");
    expect(items[0].textContent).toContain("2026-05-20");
    expect(items[0].textContent).toContain("5,000,000");
    expect(screen.queryByText(/일괄$/)).toBeNull();
    expect(screen.getByTestId("gr-history-notice").textContent).toBe(
      "일괄양도·다건·겸용주택 계산 이력은 목록에 없습니다 — 결정세액을 직접 입력하세요.",
    );
  });

  it("1호 칸: 선택 → 결정세액 채움 + 배지 · 모달 닫힘", async () => {
    render(<GiftResaleClient />);
    fireEvent.click(screen.getByTestId("gr-donee-history-launch"));
    fireEvent.click(await screen.findByTestId("gr-history-item-a"));
    await waitFor(() => expect(screen.queryByTestId("gr-history-modal")).toBeNull());
    expect(input("gr-donee-transfer-tax").value).toBe("36,250,000");
    expect(screen.getByTestId("gr-donee-history-badge").textContent).toBe("이력에서 불러옴: 양도세 — 수증자 서울");
    // 2호 칸은 그대로
    expect(input("gr-donor-transfer-tax").value).toBe("");
    expect(screen.queryByTestId("gr-donor-history-badge")).toBeNull();
  });

  it("2호 칸도 같은 모달로 채운다 — 두 칸의 출처가 따로 남는다", async () => {
    render(<GiftResaleClient />);
    fireEvent.click(screen.getByTestId("gr-donee-history-launch"));
    fireEvent.click(await screen.findByTestId("gr-history-item-a"));
    await waitFor(() => expect(screen.queryByTestId("gr-history-modal")).toBeNull());
    fireEvent.click(screen.getByTestId("gr-donor-history-launch"));
    fireEvent.click(await screen.findByTestId("gr-history-item-c"));
    await waitFor(() => expect(screen.queryByTestId("gr-history-modal")).toBeNull());
    expect(input("gr-donor-transfer-tax").value).toBe("5,000,000");
    expect(screen.getByTestId("gr-donor-history-badge").textContent).toContain("양도세 — 증여자 서울");
    expect(screen.getByTestId("gr-donee-history-badge").textContent).toContain("양도세 — 수증자 서울");
  });

  it("칸을 직접 고치면 그 칸의 배지만 지운다", async () => {
    render(<GiftResaleClient />);
    fireEvent.click(screen.getByTestId("gr-donee-history-launch"));
    fireEvent.click(await screen.findByTestId("gr-history-item-a"));
    await waitFor(() => expect(screen.queryByTestId("gr-history-modal")).toBeNull());
    fireEvent.click(screen.getByTestId("gr-donor-history-launch"));
    fireEvent.click(await screen.findByTestId("gr-history-item-c"));
    await waitFor(() => expect(screen.queryByTestId("gr-history-modal")).toBeNull());

    fireEvent.change(input("gr-donee-transfer-tax"), { target: { value: "36,250,001" } });
    expect(screen.queryByTestId("gr-donee-history-badge")).toBeNull();
    expect(screen.getByTestId("gr-donor-history-badge")).toBeTruthy();
  });

  it("후보가 없으면 빈 이력 안내(안내 한 줄은 그대로)", async () => {
    records.value = [rec("b", "일괄", "2026-04-01T03:00:00.000Z", { mode: "bundled", aggregated: {} })];
    render(<GiftResaleClient />);
    fireEvent.click(screen.getByTestId("gr-donor-history-launch"));
    const empty = await screen.findByTestId("gr-history-empty");
    expect(empty.textContent).toBe("저장된 단건 양도세 계산 이력이 없습니다");
    expect(screen.getByTestId("gr-history-notice")).toBeTruthy();
  });

  it("이력 조회가 실패해도 빈 이력 안내로 흡수한다", async () => {
    vi.mocked(calculationRepository.list).mockRejectedValueOnce(new Error("idb"));
    render(<GiftResaleClient />);
    fireEvent.click(screen.getByTestId("gr-donee-history-launch"));
    await screen.findByTestId("gr-history-empty");
  });

  it("런처는 modalLauncher 변형 버튼이다(native 아님)", () => {
    render(<GiftResaleClient />);
    const btn = screen.getByTestId("gr-donee-history-launch");
    expect(btn.className).toContain("bg-green-100");
  });

  it("불러온 값은 폼 칸에 숫자로만 들어간다 — 나머지 칸이 비면 ⑧이 막아 fetch 없음", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: { message: "x" } }) }));
    vi.stubGlobal("fetch", fetchMock);
    render(<GiftResaleClient />);
    fireEvent.click(screen.getByTestId("gr-donee-history-launch"));
    fireEvent.click(await screen.findByTestId("gr-history-item-a"));
    await waitFor(() => expect(screen.queryByTestId("gr-history-modal")).toBeNull());
    fireEvent.click(screen.getByTestId("gr-judge"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(input("gr-donee-transfer-tax").value).toBe("36,250,000");
  });
});
