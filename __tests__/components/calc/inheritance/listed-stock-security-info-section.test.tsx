/**
 * ListedStockSecurityInfoSection — 종목 정보 카드 순서·필수 라벨·trailing 슬롯 anchor.
 *
 * Plan: docs/00-pm/listed-stock-security-info-layout-reorder.plan.md §3 Step A-1
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { ListedStockSecurityInfoSection } from "@/components/calc/inheritance/listed-stock/ListedStockSecurityInfoSection";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

const BASE_ITEM: EstateItem = {
  id: "ls-sec-info-anchor",
  category: "listed_stock",
  name: "",
  listedStockCode: "005930",
  listedStockShares: 30_000,
  listedStockAvgPrice: 0,
  stockClass: "common",
};

afterEach(() => cleanup());

describe("ListedStockSecurityInfoSection — 순서·라벨·trailing 슬롯", () => {
  it("A-1 DOM 순서: 종목코드 → 종목명 → 보유 주식 수", () => {
    render(
      <ListedStockSecurityInfoSection item={BASE_ITEM} onUpdate={vi.fn()} />,
    );
    const code = screen.getByTestId("ls-security-info-code");
    const name = screen.getByTestId("ls-security-info-name-input");
    const shares = screen.getByTestId("ls-security-info-shares");
    // DOM 순서 검증 — compareDocumentPosition 비트마스크 4 = following
    expect(code.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(name.compareDocumentPosition(shares) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("A-1 종목코드 FieldCard 가 required *(별표) 표시 (FieldCard.required prop)", () => {
    const { container } = render(
      <ListedStockSecurityInfoSection item={BASE_ITEM} onUpdate={vi.fn()} />,
    );
    // FieldCard 의 required 별표는 text-destructive 클래스의 * 문자
    const code = screen.getByTestId("ls-security-info-code");
    // input 이 속한 FieldCard wrapper 까지 거슬러 올라가 별표 존재 검증
    const fieldCard = code.closest('[data-slot="field-card"]');
    expect(fieldCard).not.toBeNull();
    const required = fieldCard!.querySelector("span.text-destructive");
    expect(required?.textContent).toContain("*");

    // 종목명 FieldCard 는 required 없음 (별표 없음)
    const nameInput = screen.getByTestId("ls-security-info-name-input");
    const nameField = nameInput.closest('[data-slot="field-card"]');
    expect(nameField).not.toBeNull();
    expect(nameField!.querySelector("span.text-destructive")).toBeNull();
    void container; // unused
  });

  it("A-1 종목코드 trailing 슬롯에 자동조회 버튼 렌더", () => {
    render(
      <ListedStockSecurityInfoSection
        item={BASE_ITEM}
        onUpdate={vi.fn()}
        autoFetchSlot={
          <button type="button" data-testid="mock-fetch-btn">
            🔍 키움 자동조회
          </button>
        }
      />,
    );
    // 종목코드 input 의 같은 FieldCard 안에 mock 버튼 존재
    const code = screen.getByTestId("ls-security-info-code");
    const fieldCard = code.closest('[data-slot="field-card"]');
    expect(fieldCard).not.toBeNull();
    const btn = within(fieldCard as HTMLElement).getByTestId("mock-fetch-btn");
    expect(btn.textContent).toContain("키움 자동조회");
  });

  it("A-1 autoFetchWarning prop 으로 disabled 사유 노출 (FieldCard.warning 슬롯)", () => {
    render(
      <ListedStockSecurityInfoSection
        item={BASE_ITEM}
        onUpdate={vi.fn()}
        autoFetchWarning="⚠️ 평가기준일 입력 필요"
      />,
    );
    expect(screen.getByText(/평가기준일 입력 필요/)).toBeTruthy();
  });

  it("A-1 종목명 input 은 read-only 아님 — 사용자 수정 가능 (placeholder 에 '자동 입력' 포함)", () => {
    render(
      <ListedStockSecurityInfoSection item={BASE_ITEM} onUpdate={vi.fn()} />,
    );
    const name = screen.getByTestId("ls-security-info-name-input") as HTMLInputElement;
    expect(name.readOnly).toBe(false);
    expect(name.disabled).toBe(false);
    expect(name.placeholder).toContain("자동 입력");
  });
});
