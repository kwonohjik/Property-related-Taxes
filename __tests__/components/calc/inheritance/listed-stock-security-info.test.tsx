/**
 * Phase 1 anchor — ListedStockSecurityInfoSection
 *
 * UX 개편: 종목명·종목코드·보유 주식수 sky 카드 묶음 + §63②3호 라벨 동적 변경
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import { ListedStockSecurityInfoSection } from "@/components/calc/inheritance/listed-stock/ListedStockSecurityInfoSection";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

function buildItem(patch?: Partial<EstateItem>): EstateItem {
  return {
    id: "test-1",
    category: "listed_stock",
    name: "삼성전자",
    listedStockCode: "005930",
    listedStockShares: 100,
    listedStockAvgPrice: 50000,
    ...patch,
  };
}

describe("ListedStockSecurityInfoSection", () => {
  it("종목명·종목코드·보유 주식수 3 필드 렌더 (testid 안정성)", () => {
    const item = buildItem();
    const { getByTestId } = render(
      <ListedStockSecurityInfoSection item={item} onUpdate={() => {}} />,
    );
    expect((getByTestId("ls-security-info-name") as HTMLInputElement).value).toBe("삼성전자");
    expect((getByTestId("ls-security-info-code") as HTMLInputElement).value).toBe("005930");
    expect((getByTestId("ls-security-info-shares") as HTMLInputElement).value).toBe("100");
  });

  it("§63②3호 OFF → 보유 주식 수 라벨 = '보유 주식 수 (주)'", () => {
    const item = buildItem({ isCapitalIncreaseUnlistedShare: undefined });
    const { container } = render(
      <ListedStockSecurityInfoSection item={item} onUpdate={() => {}} />,
    );
    expect(container.textContent).toContain("보유 주식 수 (주)");
    expect(container.textContent).not.toContain("증자 신주(미상장) 보유 수");
  });

  it("§63②3호 ON → 라벨 = '증자 신주(미상장) 보유 수 (주)'", () => {
    const item = buildItem({ isCapitalIncreaseUnlistedShare: true });
    const { container } = render(
      <ListedStockSecurityInfoSection item={item} onUpdate={() => {}} />,
    );
    expect(container.textContent).toContain("증자 신주(미상장) 보유 수 (주)");
  });

  it("종목명 입력 → onUpdate({ name }) 호출", () => {
    const item = buildItem({ name: "" });
    const onUpdate = vi.fn();
    const { getByTestId } = render(
      <ListedStockSecurityInfoSection item={item} onUpdate={onUpdate} />,
    );
    fireEvent.change(getByTestId("ls-security-info-name"), {
      target: { value: "현대차" },
    });
    expect(onUpdate).toHaveBeenCalledWith({ name: "현대차" });
  });

  it("종목코드 입력 — 영문 소문자 → 대문자 변환·6자리 제한·non-alnum 제거", () => {
    const item = buildItem({ listedStockCode: "" });
    const onUpdate = vi.fn();
    const { getByTestId } = render(
      <ListedStockSecurityInfoSection item={item} onUpdate={onUpdate} />,
    );
    fireEvent.change(getByTestId("ls-security-info-code"), {
      target: { value: "abc-123def" },
    });
    // toUpperCase → "ABC-123DEF" → non-alnum 제거 → "ABC123DEF" → slice(0,6) → "ABC123"
    expect(onUpdate).toHaveBeenCalledWith({ listedStockCode: "ABC123" });
  });

  it("보유 주식수 입력 — 콤마 파싱", () => {
    const item = buildItem({ listedStockShares: 0 });
    const onUpdate = vi.fn();
    const { getByTestId } = render(
      <ListedStockSecurityInfoSection item={item} onUpdate={onUpdate} />,
    );
    fireEvent.change(getByTestId("ls-security-info-shares"), {
      target: { value: "1,000" },
    });
    expect(onUpdate).toHaveBeenCalledWith({ listedStockShares: 1000 });
  });
});
