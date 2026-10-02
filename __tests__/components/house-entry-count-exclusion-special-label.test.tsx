/**
 * @vitest-environment jsdom
 *
 * 명부 행 ⑥ 「주택 수 제외(조특법)」의 `special` 항목 — 화면에 적힌 조문이 엔진이 실제로 빼 주는 조문과 같은가.
 *
 * 각 조문의 효과 규정(「「소득세법」 제89조제1항제3호를 적용할 때 … 소유주택으로 보지 아니한다」, §98은
 * 조특령 §98②·⑥ 「다른 주택만을 기준으로 하여」)을 2026-10-02 실독했다(MST 284389·288915). 종전 설명
 * 「§98·§98의2~§98의8·§99·§99의2·§99의3」은 그 효과 규정이 없는 §98의4(비거주자 주택취득 10% 감면)를 범위에
 * 넣었고, 엔진 선택지(`SPECIAL_HOUSE_EXCLUSION_WINDOWS`)에는 §98의4가 없다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HouseEntryCountExclusionSection } from "@/components/calc/transfer/HouseEntryCountExclusionSection";
import { SPECIAL_HOUSE_EXCLUSION_WINDOWS } from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p5";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const house: HouseEntry = {
  id: "h1",
  region: "capital",
  acquisitionDate: "2015-01-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
};

function specialOptionText(): string {
  render(<HouseEntryCountExclusionSection house={house} onUpdate={() => {}} />);
  const opt = screen.getByTestId("house-row-count-exclusion-special");
  // 라디오 카드 라벨·설명은 옵션 컨테이너(라벨 요소) 안에 있다
  return (opt.closest("label") ?? opt.parentElement ?? opt).textContent ?? "";
}

describe("special 항목 라벨·설명 = 엔진 판정 조문", () => {
  it("엔진이 빼 주는 조문(legalBasis)이 설명에 하나도 빠짐없이 적혀 있다", () => {
    const text = specialOptionText();
    for (const w of Object.values(SPECIAL_HOUSE_EXCLUSION_WINDOWS)) {
      // 「조특법 §98의2④」 → 「§98의2④」, 「조특령 §98②·⑥」 → 「시행령 §98②·⑥」
      const cite = w.legalBasis.replace(/^조특법 /, "").replace(/^조특령 /, "시행령 ");
      expect(text, w.legalBasis).toContain(cite);
    }
  });

  it("효과 규정이 없는 §98의4는 범위로도 포함하지 않는다 · 「감면주택」이라 부르지 않는다", () => {
    const text = specialOptionText();
    expect(text).not.toContain("§98의4");
    expect(text).not.toContain("§98의2~");
    expect(text).not.toContain("감면주택");
    expect(text).toContain("조특법 미분양주택·신축주택 특례");
  });
});
