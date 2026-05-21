/**
 * PropertyValuationForm 협의분할 토글 UI anchor (메인 PR 2)
 *
 * C7: mode="gift" 시 협의분할 토글이 렌더되지 않음을 검증.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PropertyValuationForm } from "@/components/calc/PropertyValuationForm";
import type { EstateItem, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

afterEach(() => cleanup());

function makeItem(id: string): EstateItem {
  return {
    id,
    category: "real_estate_apartment",
    name: "테스트 아파트",
    marketValue: 1_000_000_000,
  };
}

function makeHeirs(): Heir[] {
  return [
    { id: "h1", relation: "spouse", name: "배우자" },
    { id: "h2", relation: "child", name: "장남" },
  ];
}

describe("[C7] PropertyValuationForm 협의분할 토글 — 모드별 분기", () => {
  it("[C7] mode='gift' 시 협의분할 토글 미렌더", () => {
    render(
      <PropertyValuationForm
        items={[makeItem("a1")]}
        onChange={() => {}}
        mode="gift"
      />,
    );
    // 토글 타이틀 미존재
    const toggle = screen.queryByText(/협의분할 입력/);
    expect(toggle).toBeNull();
  });

  it("[C7-반례] mode='inheritance' + heirs 있음 시 협의분할 토글 노출", () => {
    render(
      <PropertyValuationForm
        items={[makeItem("a1")]}
        onChange={() => {}}
        mode="inheritance"
        heirs={makeHeirs()}
      />,
    );
    const toggle = screen.queryByText(/협의분할 입력/);
    expect(toggle).not.toBeNull();
  });

  it("[C7-누락] mode='inheritance'이나 heirs 미전달 시 토글 미렌더", () => {
    render(
      <PropertyValuationForm
        items={[makeItem("a1")]}
        onChange={() => {}}
        mode="inheritance"
        // heirs 미전달
      />,
    );
    const toggle = screen.queryByText(/협의분할 입력/);
    expect(toggle).toBeNull();
  });
});
