/**
 * anchor — F28 · §101①2호 배율 게이트는 「별도합산」 선언에 건다 (enum 반전 정정)
 *
 * # 결함 (정정 전)
 *
 * `other-land.ts` Step 0.6의 게이트가 `effectiveTaxType === "special_sum"`이었다.
 * 그런데 이 저장소의 `PropertyTaxType` 정본 매핑은
 *
 *   `separate` = **별도합산** · `special_sum` = **분리과세**
 *
 * 이다 — UI Select(`OtherLandDetailSection.tsx`), 같은 함수의 factory route 매핑
 * (`separate_taxation`(분리과세) → `"special_sum"`), NBL 상수 인용
 * (`FACTORY_LAND_SEPARATE` = 영 §102①1호 = 분리과세 / `BUILDING_SITE_MULTIPLIER` =
 * 영 §101①2호 = 별도합산)이 모두 이 매핑을 쓴다.
 *
 * ⇒ 게이트가 **정확히 반대로** 걸려 있었다: 「별도합산」을 고르면 검증이 사라지고,
 *   「분리과세」를 고르면 법에 없는 한도가 적용됐다.
 *
 * # 법령 축은 하나뿐이다
 *
 * 「지방세법 시행령」 **§101**(제목 "**별도합산**과세대상 토지의 범위") ①2호 본문이 배율
 * 조항이고, ②의 용도지역별 배율표도 "제1항에 적용할" 배율이라고 명시한다.
 * **분리과세**(「지방세법」 §106①3호 → 영 §102)에는 일반건축물에 대한 용도지역별 적용배율이
 * **존재하지 않는다**(분리과세 공장용지의 한도는 영 §102①1호 → 「지방세법 시행규칙」 §50
 * [별표 6] 공장입지기준면적이며, 그 경로는 Step 0.5가 담당한다).
 *
 * 나아가 「소득세법」 §104의3①4호나목은 「지방세법」 §106①**2호 및 3호**에 따른 별도합산
 * **또는 분리과세** 대상을 **둘 다** 제외한다 — 분리과세 선언 토지는 나목만으로 이미
 * 사업용이므로, 거기에 별도합산 전용 한도를 걸어 비사업용으로 떨어뜨릴 근거가 이중으로 없다.
 *
 * # 시나리오 (엔진 실측값)
 *
 * 일반주거지역(§101② 4배) 나대지 2,000㎡ · 건축물 바닥 100㎡(→ 허용 400㎡) ·
 * 건물 시가표준 5억 / 토지 10억(2% 기준 통과 — 나대지 간주 회피).
 */
import { describe, it, expect } from "vitest";
import { judgeOtherLand } from "@/lib/tax-engine/non-business-land/other-land";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";

const R = DEFAULT_NON_BUSINESS_LAND_RULES;
const d = (iso: string) => new Date(iso);

/** `separate`=별도합산 · `special_sum`=분리과세 · `comprehensive`=종합합산 · `exempt`=비과세 */
type TaxTypeLiteral = "separate" | "special_sum" | "comprehensive" | "exempt";

const nblInput = (propertyTaxType: TaxTypeLiteral): NonBusinessLandInput =>
  ({
    landType: "other_land",
    landArea: 2000,
    zoneType: "general_residential", // §101② 4배
    acquisitionDate: d("2014-01-01"),
    transferDate: d("2024-01-01"),
    otherLand: {
      propertyTaxType,
      hasBuilding: true,
      buildingFloorArea: 100, // × 4배 = 허용 400㎡
      buildingStandardValue: 500_000_000,
      landStandardValue: 1_000_000_000, // 건물이 토지의 50% → 2% 기준 통과
      isRelatedToResidenceOrBusiness: false,
    },
    businessUsePeriods: [],
    gracePeriods: [],
  }) as unknown as NonBusinessLandInput;

describe("F28 · 배율 게이트는 별도합산 축에만 걸린다", () => {
  it("F28-1: 🔴 「별도합산」(separate) 선언이 배율 검증을 받는다 — 초과 1,600㎡ 비사업용", () => {
    // 정정 전에는 이 선언에서 Step 0.6이 **실행조차 되지 않아** 전량 사업용이었다.
    const r = judgeOtherLand(nblInput("separate"), R);
    expect(r.isBusiness).toBe(false); // 정정 전 true
    expect(r.steps.find((s) => s.id === "other_building_multiplier")?.status).toBe("FAIL");
    expect(r.steps.find((s) => s.id === "other_building_multiplier_apply")?.status).toBe("FAIL");
    expect(r.areaProportioning?.businessArea).toBe(400);
    expect(r.areaProportioning?.nonBusinessArea).toBe(1600);
    expect(r.areaProportioning?.nonBusinessRatio).toBe(0.8);
  });

  it("F28-2: 🔴 「분리과세」(special_sum) 선언엔 배율을 걸지 않는다 — 법에 없는 한도다", () => {
    // 정정 전에는 여기에 별도합산 전용 한도가 걸려 비사업용(비율 0.8)으로 떨어졌다.
    const r = judgeOtherLand(nblInput("special_sum"), R);
    expect(r.isBusiness).toBe(true); // 정정 전 false
    expect(r.steps.find((s) => s.id === "other_building_multiplier")).toBeUndefined();
    expect(r.areaProportioning).toBeUndefined();
    expect(r.reason).toContain("special_sum");
  });

  it("F28-3: 🛡️ 종합합산·비과세는 어느 방향으로도 게이트를 타지 않는다 (대조군)", () => {
    // 이 두 축은 정정 전후 모두 Step 0.6 미실행 — 게이트를 「전 축 적용」으로 잘못 넓히면 깨진다.
    const comp = judgeOtherLand(nblInput("comprehensive"), R);
    expect(comp.steps.find((s) => s.id === "other_building_multiplier")).toBeUndefined();
    expect(comp.isBusiness).toBe(false); // 종합합산 + 거주·사업관련 미해당

    const exempt = judgeOtherLand(nblInput("exempt"), R);
    expect(exempt.steps.find((s) => s.id === "other_building_multiplier")).toBeUndefined();
    expect(exempt.isBusiness).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
describe("F28 · 세액 — 두 선택지의 효과가 뒤바뀌어 있었다", () => {
  const tax = (propertyTaxType: TaxTypeLiteral) =>
    calculateTransferTax(
      baseTransferInput({
        propertyType: "land",
        transferPrice: 1_000_000_000,
        acquisitionPrice: 300_000_000,
        acquisitionDate: d("2014-01-01"),
        transferDate: d("2024-01-01"),
        isOneHousehold: false,
        nonBusinessLandDetails: nblInput(propertyTaxType),
      }),
      makeMockRates(),
    ).calculatedTax;

  it("F28-4: 별도합산 227,225,000원 · 분리과세 204,090,000원 (정정 전 정확히 반대)", () => {
    expect(tax("separate")).toBe(227_225_000); // 정정 전 204,090,000
    expect(tax("special_sum")).toBe(204_090_000); // 정정 전 227,225,000
  });
});
