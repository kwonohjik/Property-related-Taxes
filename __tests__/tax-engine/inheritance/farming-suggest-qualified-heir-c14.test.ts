/**
 * C-14 anchor — 영농상속공제 §16⑤ 자격자 분배분만 합산 (suggest 부록A 자동도출)
 *
 * 법령(KoreanLaw MCP 상증령 §16⑤): "제3항 요건을 갖춘 상속인이 받거나 받을 상속재산의 가액".
 *   요건 미충족 상속인 분배분 제외.
 *
 * 버그: suggestFarmingAssetValue가 `farming.qualifiedHeirIds`(명시값)만 참조 → 부록A 자동도출
 *   모드(heirAssessments 입력·qualifiedHeirIds 미입력)에서 미자격 상속인 분배분이 그대로 합산.
 *   엔진이 이 suggest 값을 그대로 영농공제 base로 사용 → 과대공제·과소과세.
 * 수정: resolveEffectiveQualifiedHeirIds(엔진 단일진실)로 자격자 도출(자동도출·명시 override 모두).
 */
import { describe, it, expect } from "vitest";
import { suggestFarmingAssetValue } from "@/lib/calc/inheritance-deduction-suggest";
import type {
  EstateItem,
  FarmingInheritanceInput,
} from "@/lib/tax-engine/types/inheritance-gift.types";

const farmItem: EstateItem = {
  id: "farm",
  category: "real_estate_land",
  name: "농지",
  farmingCategory: "farmland",
  marketValue: 1_000_000_000,
  heirAllocations: [
    { heirId: "h1", amount: 500_000_000 },
    { heirId: "h2", amount: 500_000_000 },
  ],
};

const base: Omit<FarmingInheritanceInput, "heirAssessments" | "qualifiedHeirIds"> = {
  type: "personal",
  decedentEightYearFarming: true,
  decedentResidenceMet: true,
  heirIsAdult: true,
  heirTwoYearFarming: true,
  heirResidenceMet: true,
};

describe("C-14 영농 §16⑤ 자격자 분배분 (부록A 자동도출)", () => {
  it("자동도출: h1 충족·h2 미충족(2년 미영농) → h1 분배분 5억만 (종전 10억 버그)", () => {
    const farming: FarmingInheritanceInput = {
      ...base,
      heirAssessments: [
        { heirId: "h1", heirIsAdult: true, heirTwoYearFarming: true, heirResidenceMet: true },
        { heirId: "h2", heirIsAdult: true, heirTwoYearFarming: false, heirResidenceMet: true },
      ],
      // qualifiedHeirIds 미입력 → 자동도출
    };
    expect(suggestFarmingAssetValue([farmItem], farming, "2024-03-01").value).toBe(500_000_000);
  });

  it("자동도출: 전원 충족 → 전액 10억 (회귀)", () => {
    const farming: FarmingInheritanceInput = {
      ...base,
      heirAssessments: [
        { heirId: "h1", heirIsAdult: true, heirTwoYearFarming: true, heirResidenceMet: true },
        { heirId: "h2", heirIsAdult: true, heirTwoYearFarming: true, heirResidenceMet: true },
      ],
    };
    expect(suggestFarmingAssetValue([farmItem], farming, "2024-03-01").value).toBe(1_000_000_000);
  });

  it("명시 override: qualifiedHeirIds=['h1'] → 5억 (기존 동작 유지)", () => {
    const farming: FarmingInheritanceInput = { ...base, qualifiedHeirIds: ["h1"] };
    expect(suggestFarmingAssetValue([farmItem], farming, "2024-03-01").value).toBe(500_000_000);
  });

  it("legacy: farming 미입력 → 필터 없이 전액 10억 (분배정보 無)", () => {
    expect(suggestFarmingAssetValue([farmItem], undefined, "2024-03-01").value).toBe(1_000_000_000);
  });
});
