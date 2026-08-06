/**
 * anchor — 기타토지 **건물 부수토지 §101①2호 배율 검증** (Step 0.6 / 3-1-2)
 *
 * # 결함 (정정 전)
 *
 * 「지방세법 시행령」 §101①2호 본문은 별도합산 대상을 "건축물의 바닥면적…에 제2항에 따른
 * 용도지역별 적용배율을 곱하여 산정한 면적 **범위의 토지**"로 한정한다.
 *
 * 그런데 `other-land.ts`는 사용자가 고른 `propertyTaxType: "special_sum"`(별도합산)을
 * **그대로 신뢰**하고 배율을 검증하지 않았다 — 배율을 아무리 초과해도 전량 사업용이었다.
 * 목장용지·공장용지에서 고친 것과 같은 「사용자 선언을 검증 없이 수용」 패턴이다.
 *
 * > ⚠️ **기존 테스트는 하나도 깨지지 않았다**(2026-08-06 실측: NBL 384건 GREEN).
 * > 이 분기를 타는 케이스가 없었다는 뜻이므로, 아래 anchor가 **유일한 도달 증명**이다.
 *
 * # 🔴 확정을 미루는 것이 핵심이다
 *
 * §104의3①4호는 "가·나·다목을 **제외한** 토지"를 비사업용으로 규정한다. 나목(배율)을
 * 넘어도 **다목**(§168의11② 수입금액비율, ① 호별 기준면적, ⑥ 복합용도 안분)에 해당하면
 * 여전히 사업용이다.
 *
 * ⇒ Step 0.6은 **판정만** 하고, 다목이 모두 미해당일 때 Step 3-1-2가 비로소 적용한다.
 *   같은 이유로 공장(Step 0.5)도 판정/적용을 분리해 두었다 — `other-land.ts:287` 주석 참조.
 *
 * ## 왜 `building_site` 지목을 UI에 노출하지 않았는가
 *
 * `judgeBuildingSiteLand`(별도 모듈)는 배율은 계산하지만 **다목 기계가 전혀 없어**
 * 배율 초과 시 곧바로 비사업용으로 확정한다. 형제 선택지로 노출하면 같은 토지가
 * 어느 입구를 고르냐에 따라 다른 답을 받는다 ⇒ 노출 대신 `other_land`의 갭을 메웠다.
 */
import { describe, it, expect } from "vitest";
import { judgeOtherLand } from "@/lib/tax-engine/non-business-land/other-land";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";

const R = DEFAULT_NON_BUSINESS_LAND_RULES;
const d = (iso: string) => new Date(iso);

/**
 * 일반주거지역 = §101② 4배. 바닥면적 100㎡ → 허용 400㎡.
 * 건축물 시가표준액을 토지의 2% 이상으로 두어 **나대지 간주(Step 0)를 피한다** —
 * 그래야 Step 0.6에 도달한다.
 */
function base(landArea: number, over: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput {
  return {
    landType: "other_land",
    landArea,
    zoneType: "general_residential",
    acquisitionDate: d("2014-01-01"),
    transferDate: d("2024-01-01"),
    otherLand: {
      propertyTaxType: "special_sum", // 사용자가 「별도합산」을 선언한다
      hasBuilding: true,
      buildingFloorArea: 100,
      buildingStandardValue: 100_000_000,
      landStandardValue: 200_000_000, // 건축물이 토지의 50% → 2% 기준 통과
      isRelatedToResidenceOrBusiness: false,
    },
    businessUsePeriods: [],
    gracePeriods: [],
    ...over,
  } as NonBusinessLandInput;
}

describe("§101①2호 배율 — 사용자의 「별도합산」 선언을 검증한다", () => {
  it("BM-1: 배율 이내면 별도합산 유지 → 전량 사업용", () => {
    const r = judgeOtherLand(base(400), R); // 100㎡ × 4배 = 400㎡
    expect(r.isBusiness).toBe(true);
    expect(r.steps.find((s) => s.id === "other_building_multiplier")?.status).toBe("PASS");
  });

  it("BM-2: 🔴 배율 초과분이 비사업용이 된다 — 정정 전에는 전량 사업용이었다", () => {
    const r = judgeOtherLand(base(1000), R); // 허용 400 · 초과 600
    expect(r.isBusiness).toBe(false);
    expect(r.areaProportioning?.nonBusinessArea).toBe(600);
    expect(r.areaProportioning?.businessArea).toBe(400);
    expect(r.reason).toContain("배율(4배) 초과");
  });

  it("BM-3: 용도지역이 바뀌면 배율이 바뀐다 (녹지 7배 · 상업 3배)", () => {
    expect(judgeOtherLand(base(700, { zoneType: "green" }), R).isBusiness).toBe(true);
    const commercial = judgeOtherLand(base(700, { zoneType: "commercial" }), R);
    expect(commercial.isBusiness).toBe(false);
    expect(commercial.areaProportioning?.nonBusinessArea).toBe(400); // 700 - 300
  });
});

// ────────────────────────────────────────────────────────────
describe("🔴 다목이 우선한다 — 배율 초과라고 곧바로 확정하지 않는다", () => {
  it("BM-4: §168의11② 수입금액비율을 충족하면 배율을 초과해도 사업용이다", () => {
    // 이 단언이 깨지면 Step 0.6이 판정/적용 분리를 잃고 조기 확정한 것이다.
    const r = judgeOtherLand(
      base(1000, {
        revenueTest: {
          businessType: "parking_operation",
          currentRevenue: 100_000_000,
          currentLandValue: 100_000_000, // 비율 100% → 충족
        },
      } as Partial<NonBusinessLandInput>),
      R,
    );
    expect(r.isBusiness).toBe(true);
    expect(r.reason).toContain("수입금액비율");
    // 배율 판정 자체는 기록에 남아 있어야 한다(판정은 했고 적용만 안 한 것)
    expect(r.steps.find((s) => s.id === "other_building_multiplier")?.status).toBe("FAIL");
    expect(r.steps.find((s) => s.id === "other_building_multiplier_apply")).toBeUndefined();
  });

  it("BM-5: 거주·사업관련 토지면 배율을 초과해도 사업용이다 (§168의11①)", () => {
    const r = judgeOtherLand(
      base(1000, {
        otherLand: { ...base(1000).otherLand!, isRelatedToResidenceOrBusiness: true },
      }),
      R,
    );
    expect(r.isBusiness).toBe(true);
    expect(r.steps.find((s) => s.id === "other_building_multiplier_apply")).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────
describe("적용 범위 — 겹치거나 엉뚱한 곳에 걸지 않는다", () => {
  it("BM-6: 공장이 입력되면 건너뛴다 (Step 0.5가 이미 §101①1호/§102①1호로 판정)", () => {
    const input = base(20000);
    input.otherLand!.factory = {
      locationCategory: "eup_myeon_or_complex",
      totalAppurtenantLandArea: 20000,
      segments: [{ floorArea: 1200, ratePercent: 12 }],
    };
    const r = judgeOtherLand(input, R);
    // 같은 토지에 두 배율을 겹쳐 적용하지 않는다
    expect(r.steps.find((s) => s.id === "other_building_multiplier")).toBeUndefined();
    expect(r.steps.find((s) => s.id === "other_factory_area")).toBeDefined();
  });

  it("BM-7: 나대지 간주(2% 미달)면 건너뛴다 — Step 3-2 carve-out이 담당", () => {
    const input = base(1000);
    input.otherLand!.buildingStandardValue = 1_000_000; // 토지 2억의 0.5% → 2% 미달
    const r = judgeOtherLand(input, R);
    expect(r.steps.find((s) => s.id === "other_building_multiplier")).toBeUndefined();
    expect(r.steps.find((s) => s.id === "other_footprint_carveout")).toBeDefined();
  });

  it("BM-8: 종합합산 선언이면 걸지 않는다 (별도합산 선언을 검증하는 게이트다)", () => {
    const input = base(1000);
    input.otherLand!.propertyTaxType = "comprehensive";
    const r = judgeOtherLand(input, R);
    expect(r.steps.find((s) => s.id === "other_building_multiplier")).toBeUndefined();
  });

  it("BM-9: 바닥면적 미입력이면 걸지 않는다 (근거 없이 불리하게 판정하지 않는다)", () => {
    const input = base(1000);
    input.otherLand!.buildingFloorArea = undefined;
    const r = judgeOtherLand(input, R);
    expect(r.steps.find((s) => s.id === "other_building_multiplier")).toBeUndefined();
    expect(r.isBusiness).toBe(true); // 종전 동작 유지
  });

  it("BM-10: 건물이 없으면 걸지 않는다", () => {
    const input = base(1000);
    input.otherLand!.hasBuilding = false;
    const r = judgeOtherLand(input, R);
    expect(r.steps.find((s) => s.id === "other_building_multiplier")).toBeUndefined();
  });
});
