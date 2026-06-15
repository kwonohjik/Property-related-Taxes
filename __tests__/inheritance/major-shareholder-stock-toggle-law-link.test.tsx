/**
 * MajorShareholderStockToggle — §22②·§63③ 법조문 링크 배지 (Phase 3 시범)
 *
 * 첨부 이미지의 도움말 카드 인용을 클릭 → 조문 팝업으로 띄우는 링크 검증.
 * 배지는 <button>이므로 getByRole로 특정 (도움말 <p> 본문과 텍스트 중복 회피).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MajorShareholderStockToggle } from "@/components/calc/inheritance/unlisted-stock-v2/MajorShareholderStockToggle";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MajorShareholderStockToggle — 법조문 링크", () => {
  it("§22②·§63③ 링크 배지(버튼)를 렌더한다", () => {
    render(<MajorShareholderStockToggle checked={false} onCheckedChange={() => {}} />);
    expect(screen.getByRole("button", { name: /§22② 금융재산 상속공제/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /§63③ 할증평가/ })).toBeInTheDocument();
  });

  it("§22② 배지 클릭 시 상속세및증여세법 제22조 팝업을 연다", () => {
    // fetch는 pending — 본문 로딩 중에도 제목은 parseLawRef로 즉시 표시
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    render(<MajorShareholderStockToggle checked={false} onCheckedChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /§22② 금융재산 상속공제/ }));
    expect(screen.getByText("상속세및증여세법 제22조")).toBeInTheDocument();
  });

  it("§63③ 배지 클릭 시 상속세및증여세법 제63조 팝업을 연다", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    render(<MajorShareholderStockToggle checked={false} onCheckedChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /§63③ 할증평가/ }));
    expect(screen.getByText("상속세및증여세법 제63조")).toBeInTheDocument();
  });
});
