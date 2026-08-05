/**
 * anchor — 건물 부수토지 배율 조문 정정 (Phase D)
 *
 * 설계: docs/02-design/features/nbl-building-site-local-tax-multiplier.engine.design.md (rev.2)
 *
 * ## 법령 구조 (KoreanLaw 실측)
 *
 * | 자산 | 근거 | 배율 |
 * |---|---|---|
 * | **주택** 부수토지 | 「소득세법」 제104조의3 제1항 5호 ("주택이 정착된 면적"×배율) | 「소득세법 시행령」 제168조의12 |
 * | **건물**(비주택) 부수토지 | 「소득세법」 제104조의3 제1항 4호 나목 → 「지방세법」 제106조 제1항 2호 | 「지방세법 시행령」 제101조 제1항 2호·**제2항** |
 *
 * MST: 소득세법 280405 · 소득세법 시행령 286211 · 지방세법 시행령 287223 (모두 시행 2026-07-01).
 * 「소득세법 시행령」 제168조의11은 4호 **다목** 위임(체육시설·주차장 등)이며 건물 부수토지 일반 규정이 없다.
 *
 * ## 해소한 결함
 *
 * 종전 `getLandFootprintMultiplier(zone, metro, kind)`는 `kind` 무관하게
 * `getHousingMultiplier`(「소득세법 시행령」 제168조의12)를 반환했다. 주석은 "두 조문의
 * 배율표는 현재 동일"이라 했으나 **사실이 아니었고 22개 조합 중 19개가 어긋났다**.
 *
 * 호출부는 NBL이 아니라 **일반건물(GB) 경로 3곳**이었다:
 *   general-building-valuation.ts     — 환산 모드 GB 부수토지 판정
 *   general-building-extension.ts     — 증축 GB
 *   general-building-route-helper.ts  — 실거래가 모드 GB (Pre-Do 조사 누락분)
 *
 * Do(2026-07-30): `getBuildingSiteMultiplier(zone)`으로 교체. `getLandFootprintMultiplier` 폐지.
 */
import { describe, it, expect } from "vitest";
import {
  getHousingMultiplier,
  getBuildingSiteMultiplier,
  LOCAL_TAX_ZONE_AREA_MULTIPLIER,
} from "@/lib/tax-engine/non-business-land/urban-area";
import { getLandCategoryGroup } from "@/lib/tax-engine/non-business-land/land-category";
import { judgeBuildingSiteLand } from "@/lib/tax-engine/non-business-land/building-site-land";
import { DEFAULT_NON_BUSINESS_LAND_RULES as RULES } from "@/lib/tax-engine/non-business-land/types";
import { NBL_UI_LAND_TYPE_VALUES } from "@/lib/api/transfer-tax-schema-nbl";
import type { ZoneType } from "@/lib/tax-engine/non-business-land/types";

/**
 * 「지방세법 시행령」 제101조 제2항 용도지역별 적용배율 — 기대값 사본.
 * 정본은 `urban-area.ts` `LOCAL_TAX_ZONE_AREA_MULTIPLIER`이며, 여기 사본은
 * 정본이 조용히 바뀌는 것을 잡는 드리프트 가드다(A-BS-8).
 * 법제처 API는 조문 내 표를 반환하지 않으므로 코드 정본이 유일 확인 경로다.
 * **수도권 축 없음** — 「소득세법 시행령」 제168조의12와 결정적으로 다른 점.
 */
const LOCAL_TAX_101_2: Record<string, number> = {
  exclusive_residential: 5,
  semi_residential: 3,
  commercial: 3,
  general_residential: 4,
  industrial: 4,
  green: 7,
  unplanned: 4,
  management: 7,
  agriculture_forest: 7,
  natural_env: 7,
  undesignated: 7,
};

/** 건물 부수토지 배율 — 표에 없으면 테스트 실패로 드러나게 한다. */
const gb = (z: ZoneType): number => {
  const r = getBuildingSiteMultiplier(z);
  if (!r) throw new Error(`배율 미정의: ${z}`);
  return r.multiplier;
};

// ══════════════════════════════════════════════════════════
describe("A-BS-8 — 「지방세법 시행령」 제101조 제2항 배율표 드리프트 가드", () => {
  it("정본 상수가 기대값 사본과 일치한다 (개정 시 이 테스트가 먼저 깨진다)", () => {
    expect(LOCAL_TAX_ZONE_AREA_MULTIPLIER).toEqual(LOCAL_TAX_101_2);
  });

  it("정본 8구분 값이 고정된다", () => {
    expect(LOCAL_TAX_101_2.exclusive_residential).toBe(5);
    expect(LOCAL_TAX_101_2.semi_residential).toBe(3);
    expect(LOCAL_TAX_101_2.commercial).toBe(3);
    expect(LOCAL_TAX_101_2.general_residential).toBe(4);
    expect(LOCAL_TAX_101_2.industrial).toBe(4);
    expect(LOCAL_TAX_101_2.green).toBe(7);
    expect(LOCAL_TAX_101_2.unplanned).toBe(4);
    // 도시지역 외 4종 전부 7배
    for (const z of ["management", "agriculture_forest", "natural_env", "undesignated"]) {
      expect(LOCAL_TAX_101_2[z]).toBe(7);
    }
  });

  it("수도권 축이 없다 — 「소득세법 시행령」 제168의12와의 결정적 차이", () => {
    // 제101조 제2항은 용도지역만으로 결정 → 시그니처에 수도권 인자가 아예 없다.
    expect(getBuildingSiteMultiplier.length).toBe(1);
    // 반면 「소득세법 시행령」 제168조의12는 수도권 여부로 갈린다.
    expect(getHousingMultiplier("general_residential", true).multiplier).not.toBe(
      getHousingMultiplier("general_residential", false).multiplier,
    );
  });

  it("세분 전 주거지역(residential)은 표 미등재 → undefined (추정 배율 금지)", () => {
    expect(getBuildingSiteMultiplier("residential")).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════
describe("A-BS-6 — 주택 부수토지는 「소득세법 시행령」 제168의12 유지 (회귀 가드)", () => {
  it("수도권 주·상·공 3배 / 수도권 녹지 5배 / 수도권 밖 도시 5배 / 도시지역 외 10배", () => {
    expect(getHousingMultiplier("general_residential", true).multiplier).toBe(3);
    expect(getHousingMultiplier("commercial", true).multiplier).toBe(3);
    expect(getHousingMultiplier("industrial", true).multiplier).toBe(3);
    expect(getHousingMultiplier("green", true).multiplier).toBe(5);
    expect(getHousingMultiplier("general_residential", false).multiplier).toBe(5);
    expect(getHousingMultiplier("agriculture_forest", false).multiplier).toBe(10);
  });
});

// ══════════════════════════════════════════════════════════
describe("A-BS-2·3·4 — GB 부수토지가 「지방세법 시행령」 제101조 제2항을 쓴다", () => {
  it("A-BS-2 도시지역 외: 7배 (종전 「소득세법 시행령」 제168의12 10배 → 허용면적 과대였다)", () => {
    expect(gb("agriculture_forest")).toBe(7);
    expect(gb("management")).toBe(7);
    expect(gb("natural_env")).toBe(7);
    expect(gb("undesignated")).toBe(7);
  });

  it("A-BS-3 녹지지역: 7배 (종전 5배 → 허용면적 과소였다)", () => {
    expect(gb("green")).toBe(7);
  });

  it("A-BS-4 일반주거: 4배 (종전 수도권 3배)", () => {
    expect(gb("general_residential")).toBe(4);
  });

  it("공업지역: 4배 (종전 수도권 3배)", () => {
    expect(gb("industrial")).toBe(4);
  });

  it("미계획지역: 4배 (종전 5배)", () => {
    expect(gb("unplanned")).toBe(4);
  });

  it("전용주거: 5배 (종전 수도권 3배)", () => {
    expect(gb("exclusive_residential")).toBe(5);
  });
});

// ══════════════════════════════════════════════════════════
describe("A-BS-5 — 종전 배율과 우연히 일치했던 조합 (값 유지)", () => {
  it("준주거 3배 · 상업 3배", () => {
    expect(gb("semi_residential")).toBe(3);
    expect(gb("commercial")).toBe(3);
  });
});

// ══════════════════════════════════════════════════════════
describe("불일치 규모 — Do 후 0", () => {
  it("전 용도지역에서 「지방세법 시행령」 제101조 제2항과 일치한다", () => {
    let mismatch = 0;
    let total = 0;
    for (const z of Object.keys(LOCAL_TAX_101_2)) {
      total += 1;
      if (gb(z as ZoneType) !== LOCAL_TAX_101_2[z]) mismatch += 1;
    }
    expect(total).toBe(11);
    // 종전 구현은 수도권 축까지 22조합 중 19개가 어긋났다.
    expect(mismatch).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════
describe("경계 케이스 — 배율 교체로 판정이 실제로 뒤집히는 면적 구간", () => {
  /**
   * 기존 GB 테스트 코퍼스는 `landArea`가 종전·정정 배율 양쪽 허용면적 이내여서
   * 이 결함을 잡지 못했다(사례 33: 토지 57㎡ ≤ 171 ≤ 228). 그 구멍을 메운다.
   *
   * 허용면적 = 바닥면적 × 배율. 두 배율 사이 구간의 토지는 판정이 뒤집힌다.
   */
  const FOOTPRINT = 100;

  it("녹지: 종전 5배(500㎡) 초과 · 정정 7배(700㎡) 이내 → 사업용으로 뒤집힘", () => {
    const landArea = 600;
    const allowedOld = FOOTPRINT * getHousingMultiplier("green", true).multiplier;
    const allowedNew = FOOTPRINT * gb("green");
    expect(allowedOld).toBe(500);
    expect(allowedNew).toBe(700);
    expect(landArea > allowedOld).toBe(true); // 종전: 초과분 100㎡ 비사업용 (과다과세)
    expect(landArea <= allowedNew).toBe(true); // 정정: 전체 사업용
  });

  it("도시지역 외: 종전 10배(1000㎡) 이내 · 정정 7배(700㎡) 초과 → 비사업용으로 뒤집힘", () => {
    const landArea = 800;
    const allowedOld = FOOTPRINT * getHousingMultiplier("agriculture_forest", false).multiplier;
    const allowedNew = FOOTPRINT * gb("agriculture_forest");
    expect(allowedOld).toBe(1000);
    expect(allowedNew).toBe(700);
    expect(landArea <= allowedOld).toBe(true); // 종전: 전체 사업용 (과소과세)
    expect(landArea - allowedNew).toBe(100); // 정정: 초과분 100㎡ 비사업용
  });

  it("일반주거 수도권: 종전 3배(300㎡) 초과 · 정정 4배(400㎡) 이내 → 사업용으로 뒤집힘", () => {
    const landArea = 350;
    expect(FOOTPRINT * getHousingMultiplier("general_residential", true).multiplier).toBe(300);
    expect(FOOTPRINT * gb("general_residential")).toBe(400);
    expect(landArea > 300).toBe(true);
    expect(landArea <= 400).toBe(true);
  });

  it("수도권 여부는 GB 판정에 영향을 주지 않는다 (제101조 제2항에 수도권 축 없음)", () => {
    // 종전에는 수도권 토글이 배율을 바꿨다. 정정 후에는 같은 용도지역이면 동일하다.
    for (const z of Object.keys(LOCAL_TAX_101_2)) {
      expect(gb(z as ZoneType)).toBe(LOCAL_TAX_101_2[z]);
    }
  });
});

// ══════════════════════════════════════════════════════════
describe("A-BS-1 ✅ 해소 — building_site는 §101①2호로 분류된다 (2026-08-05)", () => {
  // 종전: getLandCategoryGroup("building_site") === "housing" → judgeHousingLand →
  //       getHousingMultiplier(§168의12 주택 배율, 수도권 축 3/5/10배) 적용.
  // 정정: 전용 그룹 "building_site" → judgeBuildingSiteLand → judgeAppurtenantLandExcess
  //       (정본 §101② 배율표, 수도권 축 없음).
  it("주택과 건물은 서로 다른 그룹으로 분류된다", () => {
    expect(getLandCategoryGroup("housing_site")).toBe("housing");
    expect(getLandCategoryGroup("building_site")).toBe("building_site");
  });

  it("두 조문의 배율표는 실제로 다르다 — 22개 조합 중 19개 상이", () => {
    // 이 수치가 A-BS-1이 「법령상 오류」인 근거다. 같으면 애초에 문제가 아니었다.
    const zones: ZoneType[] = [
      "exclusive_residential", "general_residential", "semi_residential",
      "commercial", "industrial", "green", "management",
      "agriculture_forest", "natural_env", "unplanned", "undesignated",
    ];
    let differ = 0;
    let total = 0;
    for (const z of zones) {
      const bs = getBuildingSiteMultiplier(z);
      if (!bs) continue;
      for (const metro of [true, false]) {
        total++;
        const hs = getHousingMultiplier(z, metro, new Date("2024-01-01"));
        if (hs.multiplier !== bs.multiplier) differ++;
      }
    }
    expect(total).toBe(22);
    expect(differ).toBe(19);
  });

  it("건물 부수토지 판정은 수도권 여부와 무관하다 (§101②에 수도권 축이 없다)", () => {
    const base = {
      landType: "building_site" as const,
      landArea: 1000,
      zoneType: "general_residential" as const, // §101② 4배 · §168의12는 수도권 3배/그 밖 5배
      acquisitionDate: new Date("2014-01-01"),
      transferDate: new Date("2024-01-01"),
      buildingFootprint: 200,
      businessUsePeriods: [],
      gracePeriods: [],
    };
    const metro = judgeBuildingSiteLand({ ...base, isMetropolitanArea: true }, RULES);
    const nonMetro = judgeBuildingSiteLand({ ...base, isMetropolitanArea: false }, RULES);

    // 200㎡ × 4배 = 800㎡ → 1,000㎡ 중 200㎡(20%) 비사업용
    expect(metro.areaProportioning?.buildingMultiplier).toBe(4);
    expect(metro.areaProportioning?.nonBusinessArea).toBe(200);
    expect(nonMetro.areaProportioning).toEqual(metro.areaProportioning);
  });

  it("주택 배율을 썼다면 결과가 달랐다 (수도권 3배 → 600㎡ 허용)", () => {
    // 회귀 방향 고정 — 정정 전 구현은 수도권에서 3배를 적용해 초과분이 400㎡였다.
    expect(getHousingMultiplier("general_residential", true, new Date("2024-01-01")).multiplier).toBe(3);
    expect(getBuildingSiteMultiplier("general_residential")?.multiplier).toBe(4);
  });

  it("바닥면적 미입력을 「비사업용」으로 삼키지 않는다 (근거 없는 불리 적용 금지)", () => {
    expect(() =>
      judgeBuildingSiteLand(
        {
          landType: "building_site",
          landArea: 1000,
          zoneType: "general_residential",
          acquisitionDate: new Date("2014-01-01"),
          transferDate: new Date("2024-01-01"),
          businessUsePeriods: [],
          gracePeriods: [],
        },
        RULES,
      ),
    ).toThrow(/바닥면적/);
  });

  it("§101② 표에 없는 용도지역은 차단한다 (추정 배율 금지)", () => {
    expect(() =>
      judgeBuildingSiteLand(
        {
          landType: "building_site",
          landArea: 1000,
          zoneType: "residential", // 세분 전
          acquisitionDate: new Date("2014-01-01"),
          transferDate: new Date("2024-01-01"),
          buildingFootprint: 200,
          businessUsePeriods: [],
          gracePeriods: [],
        },
        RULES,
      ),
    ).toThrow(/적용배율표/);
  });

  it("여전히 UI·API로는 도달할 수 없다 (Zod enum 6종에 없음) — 조문만 바로잡아 둔 상태", () => {
    expect(NBL_UI_LAND_TYPE_VALUES).not.toContain("building_site");
    expect(NBL_UI_LAND_TYPE_VALUES).toHaveLength(6);
  });
});
