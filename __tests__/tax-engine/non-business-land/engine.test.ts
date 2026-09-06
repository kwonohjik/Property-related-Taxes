/**
 * Phase D-1 통합 테스트 — engine.ts (PDF 4단계 총괄 흐름)
 */
import { describe, it, expect } from "vitest";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";

const d = (iso: string) => new Date(iso);

describe("D-1 총괄 엔진 통합", () => {
  it("무조건 의제 (8년 재촌자경 상속 + 비도시) → 즉시 사업용", () => {
    const input: NonBusinessLandInput = {
      landType: "farmland",
      landArea: 2000,
      zoneType: "agriculture_forest",
      acquisitionDate: d("2018-01-01"),
      transferDate: d("2024-01-01"),
      businessUsePeriods: [],
      gracePeriods: [],
      unconditionalExemption: { isAncestor8YearFarming: true },
    };
    const r = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.isNonBusinessLand).toBe(false);
    expect(r.judgmentReason).toContain("무조건 의제");
    expect(r.unconditionalExemption?.isApplied).toBe(true);
    expect(r.surcharge.additionalRate).toBe(0);
  });

  it("농지 완전 사업용 (재촌자경 전체 + 비도시) → 사업용 + 장기공제 적용", () => {
    const input: NonBusinessLandInput = {
      landType: "farmland",
      landArea: 1000,
      zoneType: "agriculture_forest",
      acquisitionDate: d("2015-01-01"),
      transferDate: d("2024-01-01"),
      farmingSelf: true,
      landLocation: { sigunguCode: "11680" },
      ownerProfile: {
        residenceHistories: [
          {
            sidoName: "서울",
            sigunguName: "강남구",
            sigunguCode: "11680",
            startDate: d("2015-01-01"),
            endDate: d("2024-01-01"),
            hasResidentRegistration: true,
          },
        ],
      },
      businessUsePeriods: [{ startDate: d("2015-01-02"), endDate: d("2024-01-01"), usageType: "자경" }],
      gracePeriods: [],
    };
    const r = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.isNonBusinessLand).toBe(false);
    expect(r.surcharge.additionalRate).toBe(0);
    expect(r.surcharge.longTermDeductionExcluded).toBe(false);
  });

  it("도시지역 內 농지 + 편입유예 외 → 비사업용 + 중과세", () => {
    const input: NonBusinessLandInput = {
      landType: "farmland",
      landArea: 1000,
      zoneType: "general_residential",
      acquisitionDate: d("2010-01-01"),
      transferDate: d("2024-01-01"),
      urbanIncorporationDate: d("2015-01-01"), // 편입 후 9년 경과
      farmingSelf: true,
      landLocation: { sigunguCode: "11680" },
      ownerProfile: {
        residenceHistories: [
          {
            sidoName: "서울",
            sigunguName: "강남구",
            sigunguCode: "11680",
            startDate: d("2010-01-01"),
            endDate: d("2024-01-01"),
            hasResidentRegistration: true,
          },
        ],
      },
      businessUsePeriods: [{ startDate: d("2010-01-02"), endDate: d("2024-01-01"), usageType: "자경" }],
      gracePeriods: [],
    };
    const r = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.isNonBusinessLand).toBe(true);
    expect(r.surcharge.additionalRate).toBe(0.10);
    // 🔴 현행 「소득세법」 §95② 괄호의 제외 열거는 「미등기양도자산(§104③)과 같은 조 **제7항**
    //    각 호에 따른 자산」뿐이고 비사업용 토지는 §104**①8호**라 열거에 없다 — 표1 공제가 적용된다.
    //    종전 단언(true)은 현행법과 어긋난 echo를 고정하고 있었다 (E6-04, 2026-09-02 코드리뷰).
    //    2016.1.1. 전 양도분은 실제로 배제였고 그 축은 `nbl-lthd-era.anchor.test.ts`가 덮는다.
    expect(r.surcharge.longTermDeductionExcluded).toBe(false);
    expect(r.judgmentReason).toContain("편입유예");
  });

  it("별장 → REDIRECT 자동 재분류 (P5-B: 엔진 내부 처리)", () => {
    // 2026-04-25 P5-B 변경: villa REDIRECT를 엔진 내부에서 housing으로 자동 재분류
    // needsRedirect=false, 결과는 housing_site 기준으로 판정됨
    const input: NonBusinessLandInput = {
      landType: "villa_land",
      landArea: 500,
      zoneType: "agriculture_forest",
      acquisitionDate: d("2014-01-01"),
      transferDate: d("2024-01-01"),
      villa: {
        villaUsePeriods: [],
        isEupMyeon: false,
        isRuralHousing: false,
      },
      businessUsePeriods: [],
      gracePeriods: [],
    };
    const r = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);
    // 자동 재분류 후 needsRedirect=false, isNonBusinessLand는 housing 판정 결과
    expect(r.needsRedirect).toBe(false);
    expect(typeof r.isNonBusinessLand).toBe("boolean");
  });

  /**
   * ⭐ REDIRECT 경로에서 **수도권 여부가 중과를 켜고 끈다** (2026-09-06 UI 리뷰).
   *
   * 재분류 후 인정면적 = 정착면적 × `getHousingMultiplier(zoneType, isMetropolitan)`.
   * 도시지역 주·상·공은 수도권 3배 / 수도권 밖 5배로 갈리는데, 종전에는 별장 화면에
   * 수도권 입력이 없어 항상 `undefined` → 엔진의 「보수적 기본값(수도권)」 3배가 걸렸다
   * (`housing-land.ts:68`). 아래 세 케이스는 그 축만 다르다.
   */
  it("🔑 별장 REDIRECT — 수도권 여부가 배율(3배/5배)을 갈라 중과가 켜지고 꺼진다", () => {
    const mk = (isMetropolitanArea: boolean | undefined): NonBusinessLandInput =>
      ({
        landType: "villa_land",
        landArea: 500,
        zoneType: "residential",
        housingFootprint: 100,
        isMetropolitanArea,
        acquisitionDate: d("2014-01-01"),
        transferDate: d("2024-01-01"),
        villa: { villaUsePeriods: [], isEupMyeon: false, isRuralHousing: false },
        businessUsePeriods: [],
        gracePeriods: [],
      }) as unknown as NonBusinessLandInput;

    // 미지정 = 엔진이 수도권으로 대체 → 3배(300㎡) → 초과 200㎡ 비사업용 + 10%p
    const unset = judgeNonBusinessLand(mk(undefined), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(unset.isNonBusinessLand).toBe(true);
    expect(unset.surcharge.additionalRate).toBe(0.1);
    expect(unset.judgmentReason).toContain("3배");

    // 수도권 명시 = 같은 결과 (미지정의 실질이 「수도권」임을 고정)
    const metro = judgeNonBusinessLand(mk(true), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(metro.isNonBusinessLand).toBe(true);

    // 🔑 비수도권 = 5배(500㎡) → 배율 이내 → 사업용, 중과 0
    const outside = judgeNonBusinessLand(mk(false), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(outside.isNonBusinessLand).toBe(false);
    expect(outside.surcharge.additionalRate).toBe(0);
  });
});
