/**
 * @vitest-environment jsdom
 *
 * 조문 팝업은 «실패 후 재시도»가 가능해야 한다.
 *
 * 종전 가드는 `state.status !== "idle"` 이라, 일시적 네트워크 오류가 한 번 나면
 * 그 배지는 리마운트 전까지 영영 "조회 실패" 로 남았다(성공분 재조회 방지와 같은 취급).
 */
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { LawArticleModal } from "@/components/ui/law-article-modal";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LawArticleModal — 재시도", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("RETRY-1: 실패 후 다시 열면 재조회한다", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ content: "제89조 본문" }) });
    vi.stubGlobal("fetch", fetchMock);

    const { getByRole } = render(<LawArticleModal legalBasis="소득세법 §89" label="§89" />);
    const trigger = getByRole("button", { name: /§89/ });

    fireEvent.click(trigger);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(trigger);
    // 수정 전: 2회차 클릭이 status!=="idle" 가드에 막혀 재조회하지 않았다.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("RETRY-2(긍정 짝): 성공분은 다시 열어도 재조회하지 않는다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ content: "제89조 본문" }) });
    vi.stubGlobal("fetch", fetchMock);

    const { getByRole } = render(<LawArticleModal legalBasis="소득세법 §89" label="§89" />);
    const trigger = getByRole("button", { name: /§89/ });

    fireEvent.click(trigger);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
