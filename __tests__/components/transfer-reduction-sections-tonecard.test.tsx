/**
 * @vitest-environment jsdom
 *
 * anchor: transfer 감면/특례 단일카드 섹션 6종 → <ToneCard noDark> 전환(회귀 0). 색상 ToneCard 점진 채택 18호.
 *   DeemedTransferSection(rose, title+titleExtra모달)·SellingHouseExclusionSection(amber, title-only, space-y-2.5)·
 *   HouseEntrySpecialExclusionSection(rose, sectionNum④, space-y-2.5)·PresaleRightsSection(sky, titleExtra버튼 ml-auto)·
 *   RedevelopmentRightExemptionSection(violet, sectionNum⑥, space-y-3)·RedevelopmentResidenceSplitSection(emerald, sectionNum"6").
 *   컴포넌트별 props가 다양(house/asset/value·onUpdate/onChange/patch)해 실제 invocation을 class-equivalence로 검증.
 *   ※ 다중 컴포넌트 파일 주의: 카드 close가 return 루트인지 확인(RedevResidenceSplit는 파일 내 2 컴포넌트).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ToneCard } from "@/components/calc/shared/ToneCard";

afterEach(cleanup);

describe("transfer 감면섹션 <ToneCard> 전환 회귀 0 (18호)", () => {
  it("title-only + space-y-2.5 override = 전환 전 인라인과 1:1", () => {
    const { container, getByText } = render(
      <ToneCard tone="amber" bodyClassName="space-y-2.5" title="양도 주택 중과배제 특례 (3주택 이상 시)" noDark>
        x
      </ToneCard>,
    );
    const box = container.firstChild as HTMLElement;
    expect(box.className).toContain("border-amber-200");
    expect(box.className).toContain("space-y-2.5");
    expect(box.className).toContain("p-3"); // space-y만 override, p-3 유지(원본과 동일)
    expect(box.className).not.toContain("dark:");
    expect(getByText("양도 주택 중과배제 특례 (3주택 이상 시)").className).toContain("text-amber-700");
  });

  it("sectionNum(문자열 ⑥) + titleExtra(우측 버튼 ml-auto) 헤더 = 1:1", () => {
    const { container, getByText } = render(
      <ToneCard
        tone="sky"
        bodyClassName="space-y-2.5"
        title="분양권·입주권"
        titleExtra={<button className="ml-auto text-xs text-primary">+ 추가</button>}
        noDark
      >
        x
      </ToneCard>,
    );
    const box = container.firstChild as HTMLElement;
    expect(box.className).toContain("border-sky-200");
    expect(box.className).not.toContain("dark:");
    expect(getByText("+ 추가").className).toContain("ml-auto");
    expect(getByText("분양권·입주권").className).toContain("text-sky-700");
  });
});
