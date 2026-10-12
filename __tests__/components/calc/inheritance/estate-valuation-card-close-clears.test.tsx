/**
 * 평가액 카드(시가·감정평가액·매매사례가액)를 닫으면 그 값을 평가에 쓰지 않는다 — 확인 Dialog 후 값을 지운다 (2026-10-12).
 *
 * 종전에는 닫아도 값이 남아(비파괴) 접힌 시가 카드의 값으로 시가 평가가 유지됐다(AM-E2E-1 포크 지적).
 *
 * 검증:
 *   VC-1 값 있는 시가 카드 닫기 → Dialog → 「지우고 닫기」 → marketValue undefined
 *   VC-2 「취소」 → onUpdate 미호출 · 카드 펼침 유지(값 노출)
 *   VC-3 매매사례가액 닫기 → similarSalesValue·similarSalesSource 함께 지움
 *   VC-4 감정평가액 닫기 → appraisedValue만 지움(시가는 그대로)
 *   VC-5 값 없는 카드 닫기 → Dialog 없이 닫힘 · onUpdate 미호출
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { EstateBodyRealEstate } from "@/components/calc/inheritance/estate-card/variants/EstateBodyRealEstate";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

afterEach(() => cleanup());

const item = (over: Partial<EstateItem> = {}): EstateItem =>
  ({ id: "re1", category: "real_estate_apartment", name: "테스트 아파트", ...over }) as EstateItem;

const renderBody = (it: EstateItem, onUpdate = vi.fn()) => {
  render(<EstateBodyRealEstate item={it} onUpdate={onUpdate} showCollateralDeductToggle={false} mode="gift" />);
  return onUpdate;
};

const MARKET = /시가 \(매매·수용·경매가액\)/;
const APPRAISED = /^감정평가액/;
const SIMILAR = /매매사례가액 \(유사매매사례\)/;

describe("[VC] 평가액 카드 닫기 = 값 지움(확인 후)", () => {
  it("VC-1 값 있는 시가 카드 닫기 → 확인 → marketValue 삭제", () => {
    const onUpdate = renderBody(item({ marketValue: 800_000_000 }));
    fireEvent.click(screen.getByRole("switch", { name: MARKET }));
    expect(screen.getByText("시가 입력을 닫을까요?")).toBeTruthy();
    expect(screen.getByText(/800,000,000이 지워지고 평가에 쓰이지 않습니다/)).toBeTruthy();
    expect(onUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "지우고 닫기" }));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0].marketValue).toBeUndefined();
  });

  it("VC-2 취소 → 값·펼침 유지", () => {
    const onUpdate = renderBody(item({ marketValue: 800_000_000 }));
    fireEvent.click(screen.getByRole("switch", { name: MARKET }));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getAllByDisplayValue("800,000,000").length).toBeGreaterThan(0);
    expect(screen.getByRole("switch", { name: MARKET }).getAttribute("aria-checked")).toBe("true");
  });

  it("VC-3 매매사례가액 닫기 → 값과 RTMS 출처 함께 삭제", () => {
    const onUpdate = renderBody(item({ similarSalesValue: 700_000_000, similarSalesSource: "rtms_auto" }));
    fireEvent.click(screen.getByRole("switch", { name: SIMILAR }));
    fireEvent.click(screen.getByRole("button", { name: "지우고 닫기" }));
    const patched = onUpdate.mock.calls[0][0] as EstateItem;
    expect(patched.similarSalesValue).toBeUndefined();
    expect(patched.similarSalesSource).toBeUndefined();
  });

  it("VC-4 감정평가액 닫기 → appraisedValue만 삭제(시가 유지)", () => {
    const onUpdate = renderBody(item({ marketValue: 800_000_000, appraisedValue: 750_000_000 }));
    fireEvent.click(screen.getByRole("switch", { name: APPRAISED }));
    fireEvent.click(screen.getByRole("button", { name: "지우고 닫기" }));
    const patched = onUpdate.mock.calls[0][0] as EstateItem;
    expect(patched.appraisedValue).toBeUndefined();
    expect(patched.marketValue).toBe(800_000_000);
  });

  it("VC-5 값 없는 카드는 확인 없이 닫힌다", () => {
    const onUpdate = renderBody(item());
    const sw = screen.getByRole("switch", { name: MARKET });
    fireEvent.click(sw); // 열기
    expect(sw.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(sw); // 닫기
    expect(screen.queryByText("시가 입력을 닫을까요?")).toBeNull();
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
