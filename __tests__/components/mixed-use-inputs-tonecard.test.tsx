/**
 * anchor: mixed-use 입력 섹션카드 → <ToneCard noDark> 전환(회귀 0). 색상 ToneCard 점진 채택 6호.
 *   - PartialUsageChangeInputs(용도변경, amber): badge+title
 *   (MixedUseResidencyInput 케이스는 겸용 거주기간 단일 소스화로 위젯 제거되어 삭제.)
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { PartialUsageChangeInputs } from "@/components/calc/transfer/mixed-use/PartialUsageChangeInputs";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

afterEach(cleanup);

const asset = makeDefaultAsset(1);

describe("mixed-use 입력 섹션카드 <ToneCard> 전환 (회귀 0)", () => {
  it("PartialUsageChangeInputs: amber 카드 + noDark", () => {
    const { getByText } = render(
      <PartialUsageChangeInputs asset={asset} onChange={() => {}} sectionNum={2} />,
    );
    const title = getByText("취득시점 자산 구성 (보유 중 일부 용도변경)");
    expect(title.className).toContain("text-amber-700");
    const card = title.parentElement?.parentElement as HTMLElement;
    expect(card.className).toContain("border-amber-200");
    expect(card.className).toContain("bg-amber-50/40");
    expect(card.className).not.toContain("dark:");
  });
});
