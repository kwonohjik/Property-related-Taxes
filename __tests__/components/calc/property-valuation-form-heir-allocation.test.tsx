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

describe("[C7] PropertyValuationForm 협의분할 진입점 — 모드별 분기", () => {
  // 2026-05-28 estate-item-card-compaction v4 이후:
  //   협의분할 입력은 헤더 칩 `chip-heir-allocation` 인라인 펼침 안에 위치.
  //   따라서 본 anchor는 카드 진입점(칩)의 노출 여부로 검증.

  it("[C7] mode='gift' 시 협의분할 칩 미렌더", () => {
    render(
      <PropertyValuationForm
        items={[makeItem("a1")]}
        onChange={() => {}}
        mode="gift"
      />,
    );
    const chip = screen.queryByTestId("estate-chip-heir-allocation-a1");
    expect(chip).toBeNull();
  });

  it("[C7-반례] mode='inheritance' + heirs 있음 시 협의분할 칩 노출", () => {
    render(
      <PropertyValuationForm
        items={[makeItem("a1")]}
        onChange={() => {}}
        mode="inheritance"
        heirs={makeHeirs()}
      />,
    );
    const chip = screen.queryByTestId("estate-chip-heir-allocation-a1");
    expect(chip).not.toBeNull();
  });

  it("[C7-누락] mode='inheritance'이나 heirs 미전달 시 칩 미렌더", () => {
    render(
      <PropertyValuationForm
        items={[makeItem("a1")]}
        onChange={() => {}}
        mode="inheritance"
        // heirs 미전달
      />,
    );
    const chip = screen.queryByTestId("estate-chip-heir-allocation-a1");
    expect(chip).toBeNull();
  });
});
