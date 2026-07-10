/**
 * anchor: presumption-forms 인라인 톤 섹션카드 → <ToneCard noDark> 전환(회귀 0). 색상 ToneCard 점진 채택 7호.
 *   - AcquisitionFundFields(재산취득자금 §45, sky): 순수 톤 박스
 *   - NomineeTrustFields(명의신탁 §45의2, rose): 순수 톤 박스 + per_share 시 중첩 emerald 박스
 *   deemed-gift 계열은 전부 dark:0 → noDark. 3카드 모두 헤더 없는 순수 박스라 container.firstChild = ToneCard.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import {
  AcquisitionFundFields,
  NomineeTrustFields,
} from "@/components/calc/deemed-gift/presumption-forms";
import { INITIAL_DEEMED } from "@/components/calc/deemed-gift/deemed-form-state";

afterEach(cleanup);

describe("presumption-forms 섹션카드 <ToneCard> 전환 (회귀 0)", () => {
  it("AcquisitionFundFields: sky 순수 박스 + noDark", () => {
    const { container } = render(
      <AcquisitionFundFields form={{ ...INITIAL_DEEMED }} set={() => {}} />,
    );
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("border-sky-200");
    expect(card.className).toContain("bg-sky-50/40");
    expect(card.className).toContain("rounded-lg");
    expect(card.className).not.toContain("dark:");
  });

  it("NomineeTrustFields: rose 순수 박스 + noDark", () => {
    const { container } = render(
      <NomineeTrustFields
        form={{ ...INITIAL_DEEMED, ntValuationMode: "total" }}
        set={() => {}}
      />,
    );
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("border-rose-200");
    expect(card.className).toContain("bg-rose-50/40");
    expect(card.className).not.toContain("dark:");
  });

  it("NomineeTrustFields per_share: 중첩 emerald 카드 + noDark", () => {
    const { container } = render(
      <NomineeTrustFields
        form={{ ...INITIAL_DEEMED, ntValuationMode: "per_share" }}
        set={() => {}}
      />,
    );
    // bg-emerald-50/40 = ToneCard(중첩), bg-white = 참고 입력 박스(인라인 유지)
    const emeraldCard = container.querySelector(
      '[class*="bg-emerald-50/40"]',
    ) as HTMLElement;
    expect(emeraldCard).toBeTruthy();
    expect(emeraldCard.className).toContain("border-emerald-200");
    expect(emeraldCard.className).not.toContain("dark:");
  });
});
