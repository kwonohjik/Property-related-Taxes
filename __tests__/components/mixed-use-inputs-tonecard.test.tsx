/**
 * anchor: mixed-use 입력 섹션카드 → <ToneCard noDark> 전환(회귀 0). 색상 ToneCard 점진 채택 6호.
 *   - MixedUseResidencyInput(거주기간, violet): 헤더 우측 pill = titleExtra
 *   - PartialUsageChangeInputs(용도변경, amber): badge+title
 *   비-std-price mixed-use 파일 선택(사용자 std-price 작업 충돌 회피). dark:0 → noDark.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MixedUseResidencyInput } from "@/components/calc/transfer/mixed-use/MixedUseResidencyInput";
import { PartialUsageChangeInputs } from "@/components/calc/transfer/mixed-use/PartialUsageChangeInputs";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

afterEach(cleanup);

const asset = makeDefaultAsset(1);

describe("mixed-use 입력 섹션카드 <ToneCard> 전환 (회귀 0)", () => {
  it("MixedUseResidencyInput: violet 카드 + titleExtra(pill) + noDark", () => {
    const { getByText } = render(
      <MixedUseResidencyInput asset={asset} onChange={() => {}} sectionNum={1} />,
    );
    const title = getByText("거주 기간 입력");
    expect(title.className).toContain("text-violet-700");
    // titleExtra(우측 pill) 보존
    expect(getByText("1세대1주택 비과세·표2 공제 판정에 사용")).toBeTruthy();
    const card = title.parentElement?.parentElement as HTMLElement; // p → header → ToneCard
    expect(card.className).toContain("border-violet-200");
    expect(card.className).toContain("bg-violet-50/40");
    expect(card.className).not.toContain("dark:");
  });

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
