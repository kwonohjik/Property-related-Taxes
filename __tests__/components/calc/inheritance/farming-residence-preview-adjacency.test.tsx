/**
 * anchor: 거주지 자동 검증 미리보기가 **엔진과 같은** 연접 매트릭스를 쓴다
 *
 * 발견 V3-d (docs/reviews/nbl-code-review-2026-09.md)
 *
 * 같은 함수를 두 곳이 호출하는데 옵션이 달랐다 — 엔진
 * (`deductions/inheritance-farming-deduction.ts`)은 `{ adjacentSigunguCodes: getAdjacentSigunguCodes }`를
 * 주입하는 반면 이 섹션은 옵션 없이 불러, 기본값 `() => []` 때문에 adjacent_district 분기가
 * 통째로 죽었다. 결과적으로 같은 입력에 입력 화면은 rose 「fail」을, 결과 화면은
 * 「연접 시·군·구」 충족을 표시했다.
 *
 * 법령: 「상속세 및 증여세법 시행령」 §16②1호나 「…그와 연접한 시ㆍ군ㆍ구 또는…」 —
 * 연접은 법령상 실재하는 OR 조건이므로 UI에서 비활성인 것은 법령 반영 누락이다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FarmingEligibilitySection } from "@/components/calc/inheritance/FarmingEligibilitySection";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { FarmingInheritanceInput } from "@/lib/tax-engine/types/inheritance-farming.types";

afterEach(cleanup);

/** 서울 강남구(11680) 농지 — 좌표 없음이라 30km 분기는 열리지 않는다 */
const items: EstateItem[] = [
  {
    id: "a1",
    category: "real_estate_land",
    name: "농지",
    farmingCategory: "farmland",
    estateSigunguCode: "1168000000",
    marketValue: 100_000_000,
  },
];

/** 서초구(11650) 거주 — 강남구와 연접(자치구라 동일 단위는 아니다) */
const farming: FarmingInheritanceInput = {
  type: "personal",
  decedentEightYearFarming: true,
  decedentResidenceMet: true,
  decedentResidenceSigunguCode: "1165000000",
  heirIsAdult: true,
  heirTwoYearFarming: true,
  heirResidenceMet: true,
  heirResidenceSigunguCode: "1165000000",
};

describe("[V3-d] 미리보기 카드 — 연접 매트릭스 주입", () => {
  it("🔴 연접 시·군·구 거주가 「연접 시·군·구」로 표시된다 (옵션 미주입 시 「미충족」)", () => {
    render(
      <FarmingEligibilitySection farming={farming} estateItems={items} onChange={() => {}} />,
    );
    expect(screen.getByText(/연접 시·군·구/)).toBeTruthy();
    expect(screen.queryByText(/4가지 조건 모두 미충족/)).toBeNull();
  });
});
