/**
 * @vitest-environment jsdom
 *
 * anchor: acquisition/deemed 간주취득 3섹션 카드 → <ToneCard noDark> 전환(회귀 0). 색상 ToneCard 점진 채택 22호.
 *   - DeemedLandCategorySection(지목변경, sky)·DeemedMajorShareholderSection(과점주주, amber)·DeemedRenovationSection(개수, violet)
 *   헤더에 TaxHelp(ⓘ, 큰 details prop)가 있어 **순수-박스 전환**(TaxHelp 헤더 인라인 유지, 카드 wrapper만 ToneCard).
 *   props(form/set) 구성이 무거워 실제 invocation을 class-equivalence로 검증.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ToneCard } from "@/components/calc/shared/ToneCard";

afterEach(cleanup);

describe("acquisition/deemed 간주취득 <ToneCard> 순수-박스 전환 회귀 0 (22호)", () => {
  it("sky/amber/violet 순수 박스 + space-y-3 = 전환 전 인라인과 1:1 (TaxHelp 헤더는 body 자식)", () => {
    for (const tone of ["sky", "amber", "violet"] as const) {
      const { container } = render(
        <ToneCard tone={tone} bodyClassName="space-y-3" noDark>
          <div className="flex items-center gap-2">
            <p className={`text-xs font-semibold text-${tone}-700`}>간주취득 상세</p>
          </div>
        </ToneCard>,
      );
      const box = container.firstChild as HTMLElement;
      expect(box.className).toContain(`border-${tone}-200`);
      expect(box.className).toContain(`bg-${tone}-50/40`);
      expect(box.className).toContain("p-3");
      expect(box.className).toContain("space-y-3");
      expect(box.className).not.toContain("dark:");
      // ToneCard 자체 헤더(번호배지) 없음 — TaxHelp 헤더는 body 첫 자식으로 보존
      expect(box.querySelector("span.rounded-full")).toBeNull();
      cleanup();
    }
  });
});
