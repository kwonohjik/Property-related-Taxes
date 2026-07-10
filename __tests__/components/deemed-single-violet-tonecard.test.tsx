/**
 * anchor: 단일 violet 순수-박스 섹션카드 → <ToneCard noDark> 전환(회귀 0). 색상 ToneCard 점진 채택 8호.
 *   - FreeRealEstateFields(부동산 무상사용·담보 §37, violet)
 *   - ContributionFields(현물출자 §39의3, violet)
 *   둘 다 헤더 없는 순수 톤 박스(RadioCardGroup이 첫 자식) → container.firstChild = ToneCard 루트.
 *   deemed-gift 계열 dark:0 → noDark. 내부 chip-style 박스(bg-white·bg-amber-50/60 rounded-md)는 인라인 유지.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { FreeRealEstateFields } from "@/components/calc/deemed-gift/free-realestate-form";
import { ContributionFields } from "@/components/calc/deemed-gift/contribution-form";
import { INITIAL_DEEMED } from "@/components/calc/deemed-gift/deemed-form-state";

afterEach(cleanup);

describe("deemed-gift 단일 violet 카드 <ToneCard> 전환 (회귀 0)", () => {
  it("FreeRealEstateFields: violet 순수 박스 + noDark", () => {
    const { container } = render(
      <FreeRealEstateFields form={{ ...INITIAL_DEEMED }} set={() => {}} />,
    );
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("border-violet-200");
    expect(card.className).toContain("bg-violet-50/40");
    expect(card.className).toContain("rounded-lg");
    expect(card.className).not.toContain("dark:");
  });

  it("ContributionFields: violet 순수 박스 + noDark", () => {
    const { container } = render(
      <ContributionFields form={{ ...INITIAL_DEEMED }} set={() => {}} />,
    );
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("border-violet-200");
    expect(card.className).toContain("bg-violet-50/40");
    expect(card.className).toContain("rounded-lg");
    expect(card.className).not.toContain("dark:");
  });
});
