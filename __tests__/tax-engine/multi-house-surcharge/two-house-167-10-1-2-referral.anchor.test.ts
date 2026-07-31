/**
 * anchor: 영 §167의10①2호 준용 — 2주택에도 §167의3①2호~8호·8호의2 배제가 적용되는가.
 *
 * 계획서: docs/02-design/features/transfer-surcharge-155-deeming-coverage.plan.md §9.2 (F-7 / D-2)
 *
 * [법령 — 「소득세법 시행령」 MST 286211 · 시행 2026-07-01 · 법제처 실측]
 *   §167의10① 2. **제167조의3제1항제2호부터 제8호까지 및 제8호의2** 중 어느 하나에 해당하는 주택
 *
 * 🔴 결함이었던 것: 엔진의 해당 배제 블록이 통째로 `effectiveHouseCount >= 3` 게이트 안에 있어
 *    **2주택에서는 하나도 적용되지 않았다**. 3주택이면 배제되는데 2주택이면 중과 —
 *    주택을 적게 가진 쪽이 불리해지는 역전이며 과다과세다.
 *
 * 2호(장기임대)·7호(상속 5년)는 `countEffectiveHouses`가 주택 수에서 빼므로 결과적으로 커버된다.
 * 여기서 고정하는 것은 **양도 주택 자체**가 각 호에 해당하는 경우다.
 */
import { describe, it, expect } from "vitest";
import { determineMultiHouseSurcharge } from "@/lib/tax-engine/multi-house-surcharge";
import {
  defaultRules,
  mockRegulatedHistory,
  suspensionNone,
  makeHouse,
  makeInput,
} from "../_helpers/multi-house-mock";

/** 양도 주택(h1)이 각 호에 해당 + 일반주택 n채 추가 보유 */
function judge(sellingOver: Record<string, unknown>, extraHouses: number) {
  const houses = [
    makeHouse("h1", { regionCode: "11680", ...sellingOver }),
    ...Array.from({ length: extraHouses }, (_, i) =>
      makeHouse(`x${i}`, { regionCode: "11680", acquisitionDate: new Date("2015-01-01") }),
    ),
  ];
  return determineMultiHouseSurcharge(
    makeInput(houses, { sellingHouseId: "h1", transferDate: new Date("2026-06-01") }),
    defaultRules,
    mockRegulatedHistory,
    suspensionNone, // 유예 없음 — 배제가 아니라 유예로 통과하는 침묵 GREEN 방지
    true,
  );
}

const CASES: Array<{ label: string; ho: string; over: Record<string, unknown>; type: string }> = [
  {
    label: "3호 조특법 감면 장기임대주택",
    ho: "§167의3①3호",
    over: { isTaxIncentiveRental: true, rentalStartDate: new Date("2015-01-01"), rentalEndDate: new Date("2021-01-01"), isNationalSizeHousing: true },
    type: "tax_incentive_rental",
  },
  {
    label: "4호 사원용 주택 10년",
    ho: "§167의3①4호",
    over: { isEmployeeHousing: true, freeProvisionYears: 12 },
    type: "employee_housing_10years",
  },
  {
    label: "5호 조특법 감면주택",
    ho: "§167의3①5호",
    over: { isTaxSpecialExemption: true },
    type: "tax_special_exemption",
  },
  {
    label: "6호 국가유산주택",
    ho: "§167의3①6호",
    over: { isCulturalHeritage: true },
    type: "cultural_heritage",
  },
  {
    label: "8호 저당권 실행 3년 이내",
    ho: "§167의3①8호",
    over: { isMortgageExecution: true, acquisitionDate: new Date("2025-01-01") },
    type: "mortgage_execution_3years",
  },
  {
    label: "8호의2 어린이집 5년",
    ho: "§167의3①8호의2",
    over: { isDayCareCenter: true, dayCareOperationYears: 7 },
    type: "daycare_center_5years",
  },
];

describe("D-2 — §167의10①2호 준용 (2주택 배제)", () => {
  it.each(CASES)("🔴 2주택 · $label($ho) → 배제 ($type)", ({ over, type }) => {
    const r = judge(over, 1); // 양도주택 + 일반 1채 = 2주택
    expect(r.effectiveHouseCount).toBe(2);
    expect(r.exclusionReasons[0]?.type).toBe(type);
    expect(r.surchargeApplicable).toBe(false);
    expect(r.surchargeType).toBe("none");
  });

  it.each(CASES)("3주택 · $label → 배제 유지 (회귀)", ({ over, type }) => {
    const r = judge(over, 2);
    expect(r.effectiveHouseCount).toBe(3);
    expect(r.exclusionReasons[0]?.type).toBe(type);
    expect(r.surchargeApplicable).toBe(false);
  });

  it("대조군: 일반주택은 2주택·3주택 모두 중과 (배제가 무차별 적용되지 않는다)", () => {
    const two = judge({}, 1);
    expect(two.exclusionReasons).toHaveLength(0);
    expect(two.surchargeType).toBe("multi_house_2");

    const three = judge({}, 2);
    expect(three.exclusionReasons).toHaveLength(0);
    expect(three.surchargeType).toBe("multi_house_3plus");
  });

  it("1주택은 애초에 중과 대상이 아니다 (게이트 하향이 1주택까지 번지지 않는다)", () => {
    const r = judge({ isCulturalHeritage: true }, 0);
    expect(r.effectiveHouseCount).toBe(1);
    expect(r.surchargeApplicable).toBe(false);
  });
});
