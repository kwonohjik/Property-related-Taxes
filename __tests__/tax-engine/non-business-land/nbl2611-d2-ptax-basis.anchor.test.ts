/**
 * NBL2611-V1-A (R19 · Q-1 (가)) Pre-Do anchor — 재산세 분류 «근거» 모델.
 *
 * 종전: 건축물이 없으면(`hasBuilding` 거짓) 사용자가 비종합합산(비과세·분리과세·별도합산)을 골라도 PR#291 override가
 * 종합합산으로 덮어 비사업용(+10%p)이 됐다. 그 override의 법적 근거는 「지방세법 시행령」 §101①2호나목(건축물 부속토지 범위)뿐이었다.
 * 법 §104의3①4호 가목(「지방세법」 또는 관계 법률에 따라 재산세가 비과세되거나 면제되는 토지)·나목(「지방세법」 제106조제1항제2호 및 제3호에 따른
 * 재산세 별도합산과세대상 또는 분리과세대상이 되는 토지)은 건축물을 요건으로 하지 않는다.
 *
 * 신: «근거» 하위 선택 — 근거가 있는 선언은 존중하고, 근거 미선택·모름·호환 불가는 엔진이 종합합산 + 확인 필요로 접는다(역버그 방지 유지, ⑧ 차단 아님).
 *   · 가목(§109·관계 법률)·분리과세(영 §102): 전량 사업용
 *   · 공지상태 별도합산(영 §101③): 전량 사업용 + 호별 면적 한도 확인 필요
 *   · 철거·멸실(영 §103의2): 종전 바닥면적 × 영 §101② 적용배율 이내만 사업용 + 한시 지위 확인 필요
 *   · 2% 강등·배율 게이트는 건축물 부속토지 근거(별도합산 + 건축물 있음)에만
 */
import { describe, it, expect } from "vitest";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES, type NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const R = DEFAULT_NON_BUSINESS_LAND_RULES;
const rates = makeMockRates();
const d = (s: string) => new Date(`${s}T00:00:00Z`);

type OL = NonNullable<NonBusinessLandInput["otherLand"]>;
// `propertyTaxBasis`·`demolishedFloorArea`는 이 PR이 신설한 칸이다(Pre-Do 시점의 master에는 없어 값이 무시돼 FAIL이었다).
type OLWithBasis = OL;

function other(ol: Partial<OLWithBasis> = {}, over: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput {
  return {
    landType: "other_land",
    landArea: 500,
    zoneType: "general_residential",
    acquisitionDate: d("2008-01-01"),
    transferDate: d("2024-06-01"),
    otherLand: { propertyTaxType: "comprehensive", hasBuilding: false, isRelatedToResidenceOrBusiness: false, ...ol } as OL,
    businessUsePeriods: [],
    gracePeriods: [],
    ...over,
  };
}

const ratioOf = (j: ReturnType<typeof judgeNonBusinessLand>) => j.surcharge.nonBusinessAreaRatio;
const echoOf = (j: ReturnType<typeof judgeNonBusinessLand>) => (j as unknown as { propertyTaxBasis?: Record<string, unknown> }).propertyTaxBasis;

describe("V1-A 근거 있음 — 건축물 없는 토지의 비종합합산 선언을 존중한다", () => {
  it("가목 비과세·면제 선언 + 근거 statutory_exempt → 전량 사업용", () => {
    const j = judgeNonBusinessLand(other({ propertyTaxType: "exempt", propertyTaxBasis: "statutory_exempt" }), R);
    expect(j.isNonBusinessLand).toBe(false);
    expect(ratioOf(j)).toBe(0);
    expect(echoOf(j)).toMatchObject({ declared: "exempt", basis: "statutory_exempt", outcome: "accepted", effective: "exempt" });
  });

  it("분리과세 선언 + 근거 separate_taxation → 전량 사업용", () => {
    const j = judgeNonBusinessLand(other({ propertyTaxType: "special_sum", propertyTaxBasis: "separate_taxation" }), R);
    expect(j.isNonBusinessLand).toBe(false);
    expect(ratioOf(j)).toBe(0);
  });

  it("공지상태 별도합산 + 근거 vacant_state → 전량 사업용 + 호별 한도 확인 필요 고지", () => {
    const j = judgeNonBusinessLand(other({ propertyTaxType: "separate", propertyTaxBasis: "vacant_state" }), R);
    expect(j.isNonBusinessLand).toBe(false);
    expect(j.warnings.some((w) => w.includes("§101 ③") && w.includes("확인 필요"))).toBe(true);
  });

  it("철거·멸실 별도합산 — 종전 바닥면적 125㎡ × 일반주거 4배 = 500㎡ ≥ 토지 500㎡ → 전량 사업용 + 한시 지위 확인 필요", () => {
    const j = judgeNonBusinessLand(other({ propertyTaxType: "separate", propertyTaxBasis: "demolished", demolishedFloorArea: 125 }), R);
    expect(j.isNonBusinessLand).toBe(false);
    expect(j.warnings.some((w) => w.includes("§103의2") && w.includes("확인 필요"))).toBe(true);
  });

  it("철거·멸실 별도합산 — 종전 바닥면적 100㎡ × 4배 = 400㎡ → 초과 100㎡(0.2) 비사업용 면적 안분", () => {
    const j = judgeNonBusinessLand(other({ propertyTaxType: "separate", propertyTaxBasis: "demolished", demolishedFloorArea: 100 }), R);
    expect(j.isNonBusinessLand).toBe(true);
    expect(ratioOf(j)).toBe(0.2);
    expect(j.areaProportioning?.nonBusinessArea).toBe(100);
    expect(j.areaProportioning?.businessArea).toBe(400);
  });

  it("공장 입력 + 가목 비과세 근거 → 공장 경로가 가목을 덮지 않는다(가목을 먼저 본다)", () => {
    const j = judgeNonBusinessLand(
      other({
        propertyTaxType: "exempt",
        propertyTaxBasis: "statutory_exempt",
        hasBuilding: true,
        factory: {
          locationCategory: "eup_myeon_or_complex",
          totalAppurtenantLandArea: 100_000,
          segments: [{ floorArea: 1200, ratePercent: 12 }],
        },
      }),
      R,
    );
    expect(j.isNonBusinessLand).toBe(false);
    expect(ratioOf(j)).toBe(0);
  });

  it("건축물 있음 + 2% 미달 + 가목 비과세 근거 → 2% 강등은 별도합산 범위 규정이라 적용하지 않는다(전량 사업용)", () => {
    const j = judgeNonBusinessLand(
      other({
        propertyTaxType: "exempt",
        propertyTaxBasis: "statutory_exempt",
        hasBuilding: true,
        buildingStandardValue: 1_000_000,
        landStandardValue: 1_000_000_000,
        buildingFloorArea: 25,
      }),
      R,
    );
    expect(j.isNonBusinessLand).toBe(false);
    expect(ratioOf(j)).toBe(0);
  });
});

describe("V1-A 근거 없음 — 역버그 방지(종합합산 + 확인 필요)는 엔진에 남는다", () => {
  const unconfirmedCases: ReadonlyArray<readonly [string, Partial<OLWithBasis>]> = [
    ["근거 미선택", {}],
    ["모름", { propertyTaxBasis: "unknown" }],
    ["호환 불가(비과세 선언 + 공지상태 근거)", { propertyTaxType: "exempt", propertyTaxBasis: "vacant_state" }],
    ["철거·멸실이나 종전 바닥면적 미입력", { propertyTaxBasis: "demolished" }],
  ];
  it.each(unconfirmedCases)("%s → 종합합산으로 판정(비사업용) + 확인 필요", (_label, ol) => {
    const j = judgeNonBusinessLand(other({ propertyTaxType: "separate", ...ol }), R);
    expect(j.isNonBusinessLand).toBe(true);
    expect(ratioOf(j)).toBe(1);
    expect(j.warnings.some((w) => w.includes("재산세 분류") && w.includes("확인 필요"))).toBe(true);
    expect(echoOf(j)).toMatchObject({ outcome: "unconfirmed", effective: "comprehensive" });
  });

  it("종합합산 선언은 근거와 무관하게 그대로(추가 고지 없음)", () => {
    const j = judgeNonBusinessLand(other({ propertyTaxType: "comprehensive", propertyTaxBasis: "statutory_exempt" }), R);
    expect(j.isNonBusinessLand).toBe(true);
    expect(echoOf(j)).toBeUndefined();
  });
});

describe("V1-A 불변 — 건축물 부속토지 경로(건축물 있음 + 별도합산)는 종전 그대로", () => {
  it("건축물 있음 + 별도합산 + 2% 이상 + 배율 이내 → 사업용(근거 칸 없이도)", () => {
    const j = judgeNonBusinessLand(
      other({ propertyTaxType: "separate", hasBuilding: true, buildingStandardValue: 50_000_000, landStandardValue: 100_000_000, buildingFloorArea: 125 }),
      R,
    );
    expect(j.isNonBusinessLand).toBe(false);
    expect(echoOf(j)).toBeUndefined();
  });

  it("건축물 있음 + 별도합산 + 배율 초과 → 면적 안분(0.2)", () => {
    const j = judgeNonBusinessLand(
      other({ propertyTaxType: "separate", hasBuilding: true, buildingStandardValue: 50_000_000, landStandardValue: 100_000_000, buildingFloorArea: 100 }),
      R,
    );
    expect(ratioOf(j)).toBe(0.2);
  });

  it("건축물 있음 + 별도합산 + 근거(공지상태)를 골라도 건축물 부속토지 규칙(2% 강등)이 우선 — 근거는 건축물 없는 토지에만", () => {
    const j = judgeNonBusinessLand(
      other({ propertyTaxType: "separate", propertyTaxBasis: "vacant_state", hasBuilding: true, buildingStandardValue: 1_000_000, landStandardValue: 1_000_000_000, buildingFloorArea: 25 }),
      R,
    );
    // 2% 미달 → 종합합산 + 바닥면적 25㎡만 별도합산 유지 → 비율 475/500 = 0.95
    expect(ratioOf(j)).toBe(0.95);
  });

  it("건축물 있음 + 비과세 선언 + 근거 없음 + 2% 미달 → 종전 동작(0.95) 유지", () => {
    const j = judgeNonBusinessLand(
      other({ propertyTaxType: "exempt", hasBuilding: true, buildingStandardValue: 1_000_000, landStandardValue: 1_000_000_000, buildingFloorArea: 25 }),
      R,
    );
    expect(ratioOf(j)).toBe(0.95);
  });
});

describe("V1-A 세액 — 같은 세율 출처로 독립 검산", () => {
  /**
   * 시료: 양도 1,000,000,000 · 취득 300,000,000 · 2013-06-03 취득 → 2020-06-01 양도(보유 6년·장특 12% — factory-land-interaction.anchor와 같은 축).
   *   일반: 양도차익 700,000,000 − 장특 84,000,000 − 기본공제 2,500,000 = 613,500,000 × 42% − 35,940,000 = 221,730,000
   *   비사업용 전량: 613,500,000 × (42% + 10%p = 52%) − 35,940,000 = 283,080,000 (2016.1.1. 이후 양도는 장특 표1 적용 — 배제 아님)
   */
  const TRANSFER_DATE = new Date("2020-06-01");
  const ACQ_DATE = new Date("2013-06-03");
  const BASELINE = 221_730_000;
  const FULL_NBL = 283_080_000;

  function land(ol: Partial<OLWithBasis>): TransferTaxInput {
    return baseTransferInput({
      propertyType: "land",
      transferPrice: 1_000_000_000,
      acquisitionPrice: 300_000_000,
      transferDate: TRANSFER_DATE,
      acquisitionDate: ACQ_DATE,
      isOneHousehold: false,
      householdHousingCount: 0,
      residencePeriodMonths: 0,
      transferCause: "general",
      nonBusinessLandDetails: {
        landType: "other_land" as const,
        landArea: 1000,
        zoneType: "general_residential" as const,
        acquisitionDate: ACQ_DATE,
        transferDate: TRANSFER_DATE,
        otherLand: { propertyTaxType: "comprehensive", hasBuilding: false, isRelatedToResidenceOrBusiness: false, ...ol } as OL,
        businessUsePeriods: [],
        gracePeriods: [],
      },
    } as Partial<TransferTaxInput>);
  }

  it.each([
    ["가목 비과세·면제", { propertyTaxType: "exempt", propertyTaxBasis: "statutory_exempt" }],
    ["분리과세", { propertyTaxType: "special_sum", propertyTaxBasis: "separate_taxation" }],
    ["공지상태 별도합산", { propertyTaxType: "separate", propertyTaxBasis: "vacant_state" }],
  ] as const)("%s — 근거 있음 → 일반세액 221,730,000", (_l, ol) => {
    expect(calculateTransferTax(land(ol), rates).calculatedTax).toBe(BASELINE);
  });

  it.each([
    ["근거 미선택", { propertyTaxType: "separate" }],
    ["모름", { propertyTaxType: "separate", propertyTaxBasis: "unknown" }],
    ["종합합산 선언", { propertyTaxType: "comprehensive" }],
  ] as const)("%s — 종합합산 + 확인 필요 → 비사업용 전량 283,080,000(역버그 방지 불변)", (_l, ol) => {
    expect(calculateTransferTax(land(ol), rates).calculatedTax).toBe(FULL_NBL);
  });

  it("차이 = 61,350,000 (= 613,500,000 × 10%p)", () => {
    expect(FULL_NBL - BASELINE).toBe(61_350_000);
  });
});

// ─────────────────────────────────────────────────────────────
// 해석 술어 격자 — 화면 선택지·⑧·⑫·매퍼·엔진이 읽는 단일 술어
// ─────────────────────────────────────────────────────────────
import { propertyTaxBasisOptions, resolvePropertyTaxBasis, requiresDemolishedFloorArea } from "@/lib/tax-engine/non-business-land/property-tax-basis";

describe("V1-A 술어 격자 (propertyTaxBasisOptions · resolvePropertyTaxBasis)", () => {
  it.each([
    ["comprehensive", false, []],
    ["comprehensive", true, []],
    ["exempt", false, ["statutory_exempt", "unknown"]],
    ["exempt", true, ["statutory_exempt", "unknown"]],
    ["special_sum", false, ["separate_taxation", "unknown"]],
    ["special_sum", true, ["separate_taxation", "unknown"]],
    ["separate", false, ["vacant_state", "demolished", "unknown"]],
    ["separate", true, []],
  ] as const)("선택지 %s · 건축물 %s → %j", (declared, hasBuilding, expected) => {
    expect(propertyTaxBasisOptions(declared, hasBuilding)).toEqual(expected);
  });

  it("철거 바닥면적 칸은 별도합산 + 건축물 없음 + 철거·멸실 근거에만 열린다", () => {
    expect(requiresDemolishedFloorArea("separate", false, "demolished")).toBe(true);
    expect(requiresDemolishedFloorArea("separate", true, "demolished")).toBe(false);
    expect(requiresDemolishedFloorArea("exempt", false, "demolished")).toBe(false);
    expect(requiresDemolishedFloorArea("separate", false, "vacant_state")).toBe(false);
  });

  it("해석: 건축물 있음 + 비과세 + 근거 미선택 → 근거 모델 비개입(종전 흐름)", () => {
    expect(resolvePropertyTaxBasis({ propertyTaxType: "exempt", hasBuilding: true })).toEqual({ kind: "not_applicable" });
    expect(resolvePropertyTaxBasis({ propertyTaxType: "exempt", hasBuilding: true, propertyTaxBasis: "unknown" })).toEqual({ kind: "not_applicable" });
  });

  it("해석: 철거·멸실 + 바닥면적 0·음수·미입력 → unconfirmed(demolished_area_missing)", () => {
    for (const a of [undefined, 0, -5]) {
      expect(resolvePropertyTaxBasis({ propertyTaxType: "separate", hasBuilding: false, propertyTaxBasis: "demolished", demolishedFloorArea: a })).toEqual({
        kind: "unconfirmed",
        reason: "demolished_area_missing",
      });
    }
  });
});
