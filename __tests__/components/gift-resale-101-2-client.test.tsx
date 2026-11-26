/**
 * @vitest-environment jsdom
 *
 * §101② 판정 화면 — 빈 입력으로 「판정하기」를 누르면 ⑧이 칸별 오류를 내고 API는 부르지 않는다.
 * 증여세에 다른 재산이 포함된 토글을 켜면 두 증여세 칸 라벨에 «(이 자산 몫)»이 붙는다.
 */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import GiftResaleClient from "@/app/calc/gift-resale-101-2/GiftResaleClient";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GiftResaleClient", () => {
  it("빈 입력 → 오류 목록 · fetch 미호출 · 결과 없음", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<GiftResaleClient />);
    fireEvent.click(screen.getByTestId("gr-judge"));
    const errors = screen.getByTestId("gr-errors");
    expect(errors.textContent).toContain("증여자와 수증자의 관계를 고르세요.");
    expect(errors.textContent).toContain("«예» 또는 «아니오»");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("gr-result")).toBeNull();
  });

  it("실질 귀속 선택지는 예·아니오 2개뿐이다(«모름» 없음)", () => {
    render(<GiftResaleClient />);
    const radios = screen.getByTestId("gr-attribution").querySelectorAll("input[type=radio]");
    expect(Array.from(radios).map((r) => (r as HTMLInputElement).value)).toEqual(["yes", "no"]);
  });

  it("다른 증여재산 포함 토글 ON → 증여세 두 칸 라벨에 «(이 자산 몫)» + 확인 필요 hint", () => {
    render(<GiftResaleClient />);
    expect(screen.queryByText(/이 자산 몫을 나누는 방법/)).toBeNull();
    fireEvent.click(screen.getByTestId("gr-gift-includes-others").querySelector("button, [role=switch]") as HTMLElement);
    expect(screen.getAllByText(/\(이 자산 몫\)/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/이 자산 몫을 나누는 방법은 §101②에 명문이 없습니다 — 확인 필요/).length).toBe(2);
  });
});
