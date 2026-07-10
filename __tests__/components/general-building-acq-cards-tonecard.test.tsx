/**
 * @vitest-environment jsdom
 *
 * anchor: GeneralBuildingAcquisitionCards(일반건물 토지·건물 취득 2카드) → <ToneCard noDark> 전환(회귀 0). 색상 ToneCard 점진 채택 19호.
 *   헤더가 emoji 아이콘(📌/🏗) + 제목이라 sectionNum 배지 패턴 아님 → **순수-박스 전환**(emoji 헤더 div 인라인 유지).
 *   카드 wrapper만 <ToneCard tone bodyClassName="space-y-3" noDark>로 교체. class-equivalence로 검증.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ToneCard } from "@/components/calc/shared/ToneCard";

afterEach(cleanup);

describe("GeneralBuildingAcquisitionCards emoji-header 순수-박스 <ToneCard> 전환 회귀 0", () => {
  it("sky 순수 박스 + space-y-3 = 전환 전 인라인과 1:1 (emoji 헤더는 body 자식)", () => {
    const { container } = render(
      <ToneCard tone="sky" bodyClassName="space-y-3" noDark>
        <div className="flex items-center gap-2">
          <span className="text-base">📌</span>
          <p className="text-xs font-semibold text-sky-700">토지 취득</p>
        </div>
      </ToneCard>,
    );
    const box = container.firstChild as HTMLElement;
    expect(box.className).toContain("border-sky-200");
    expect(box.className).toContain("bg-sky-50/40");
    expect(box.className).toContain("space-y-3");
    expect(box.className).toContain("p-3");
    expect(box.className).not.toContain("dark:");
    // ToneCard 자체 헤더(번호배지) 없음 — emoji 헤더는 body 첫 자식으로 보존
    expect(box.querySelector("span.rounded-full")).toBeNull();
    expect(container.querySelector("p.text-sky-700")?.textContent).toBe("토지 취득");
  });
});
