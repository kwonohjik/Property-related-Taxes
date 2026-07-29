/**
 * @vitest-environment jsdom
 *
 * anchor: transfer 다중카드 섹션 → <ToneCard noDark> 전환(회귀 0). 색상 ToneCard 점진 채택 20호.
 *   - NewConstructionFootprintSection: 외곽 sky(§) 카드 안에 내부 sky(①②) 카드 중첩(ToneCard 중첩 OK)
 *   - VillaLandDetailSection: sky(1)·emerald(2)·rose(3) 표준 badge+title 3카드
 *   props(asset/onChange) 구성이 무거워 실제 invocation을 class-equivalence로 검증. 중첩 ToneCard도 정상.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ToneCard } from "@/components/calc/shared/ToneCard";

afterEach(cleanup);

describe("transfer 다중카드 <ToneCard> 전환 회귀 0 (20호)", () => {
  it("중첩 ToneCard(외곽 § + 내부 ①) 정상 렌더 + 각 톤·배지 보존", () => {
    const { getByText } = render(
      <ToneCard tone="sky" sectionNum="§" bodyClassName="space-y-3" title="부수토지 한도 산정 (소득세법 시행령 §154⑦)" noDark>
        <ToneCard tone="sky" sectionNum="①" title="건물 정착면적 (㎡)" noDark>
          <span>x</span>
        </ToneCard>
      </ToneCard>,
    );
    expect(getByText("§").className).toContain("bg-sky-200");
    expect(getByText("①").className).toContain("bg-sky-200");
    expect(getByText("부수토지 한도 산정 (소득세법 시행령 §154⑦)").className).toContain("text-sky-700");
    expect(getByText("건물 정착면적 (㎡)").className).toContain("text-sky-700");
  });

  it("VillaLandDetail 3톤 badge+title = 전환 전 인라인과 1:1", () => {
    const { container, getByText } = render(
      <ToneCard tone="rose" sectionNum="3" title="지역 요건 (①3호)" noDark>
        x
      </ToneCard>,
    );
    const box = container.firstChild as HTMLElement;
    expect(box.className).toContain("border-rose-200");
    expect(box.className).not.toContain("dark:");
    expect(getByText("3").className).toContain("bg-rose-200");
    expect(getByText("지역 요건 (①3호)").className).toContain("text-rose-700");
  });
});
