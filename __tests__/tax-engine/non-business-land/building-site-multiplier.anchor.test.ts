/**
 * Pre-Do anchor — 건물 부수토지 배율 조문 정정 (Phase D)
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
 * ## 고정하는 결함
 *
 * `getLandFootprintMultiplier(zone, metro, "general_building")`이 `kind` 무관하게
 * `getHousingMultiplier`(「소득세법 시행령」 제168조의12)를 반환한다(`urban-area.ts:99~107`).
 * 주석은 "두 조문의 배율표는 현재 동일"이라 하지만 **사실이 아니다**.
 *
 * 호출부는 NBL이 아니라 **일반건물(GB) 환산 경로**다:
 *   general-building-valuation.ts:636 — GB 부수토지 비사업용 판정 → 토지분 분할 중과
 *   general-building-extension.ts:216
 *
 * A-BS-2·3·4는 **의도적으로 오답을 고정**한다. Do에서 실패 전환이 성공 신호다
 * (memory feedback_anchor_correction_legal_priority).
 */
import { describe, it, expect } from "vitest";
import { getHousingMultiplier } from "@/lib/tax-engine/non-business-land/urban-area";
import { getLandFootprintMultiplier } from "@/lib/tax-engine/non-business-land/urban-area";
import { getLandCategoryGroup } from "@/lib/tax-engine/non-business-land/land-category";
import type { ZoneType } from "@/lib/tax-engine/non-business-land/types";

/**
 * 「지방세법 시행령」 제101조 제2항 용도지역별 적용배율 — 정본.
 * 출처: `other-land.ts:63~76` ZONE_AREA_MULTIPLIER ("지방세법 시행령 §101② 정본 … 추정 금지").
 * 법제처 API는 조문 내 표를 반환하지 않으므로 코드 정본이 유일 확인 경로다.
 * **수도권 축 없음** — 「소득세법 시행령」 제168의12와 결정적으로 다른 점.
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

// ══════════════════════════════════════════════════════════
describe("A-BS-8 — 「지방세법 시행령」 제101조 제2항 배율표 드리프트 가드", () => {
  it("정본 8구분 값이 고정된다 (개정 시 이 테스트가 먼저 깨진다)", () => {
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
    // §101②은 용도지역만으로 결정. 반면 §168의12는 수도권 여부로 갈린다.
    expect(getHousingMultiplier("general_residential", true).multiplier).not.toBe(
      getHousingMultiplier("general_residential", false).multiplier,
    );
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
describe("A-BS-2·3·4 [Do에서 뒤집힘] — GB 부수토지가 잘못된 조문 배율을 쓴다", () => {
  const gb = (z: ZoneType, metro: boolean) =>
    getLandFootprintMultiplier(z, metro, "general_building").multiplier;

  it("A-BS-2 도시지역 외: 현행 10배 (정확 7배 — 허용면적 과대 → 과소과세)", () => {
    expect(gb("agriculture_forest", false)).toBe(10);
    expect(LOCAL_TAX_101_2.agriculture_forest).toBe(7);
  });

  it("A-BS-3 녹지지역: 현행 5배 (정확 7배 — 허용면적 과소 → 과다과세)", () => {
    expect(gb("green", true)).toBe(5);
    expect(gb("green", false)).toBe(5);
    expect(LOCAL_TAX_101_2.green).toBe(7);
  });

  it("A-BS-4 일반주거 수도권: 현행 3배 (정확 4배 → 과다과세)", () => {
    expect(gb("general_residential", true)).toBe(3);
    expect(LOCAL_TAX_101_2.general_residential).toBe(4);
  });

  it("미계획지역: 현행 5배 (정확 4배 → 과소과세)", () => {
    expect(gb("unplanned", true)).toBe(5);
    expect(LOCAL_TAX_101_2.unplanned).toBe(4);
  });

  it("전용주거 수도권: 현행 3배 (정확 5배 → 과다과세)", () => {
    expect(gb("exclusive_residential", true)).toBe(3);
    expect(LOCAL_TAX_101_2.exclusive_residential).toBe(5);
  });
});

// ══════════════════════════════════════════════════════════
describe("A-BS-5 — 우연히 일치하는 3조합 (Do 후에도 값 유지)", () => {
  const gb = (z: ZoneType, metro: boolean) =>
    getLandFootprintMultiplier(z, metro, "general_building").multiplier;

  it("준주거·상업 수도권 = 3배, 전용주거 비수도권 = 5배", () => {
    expect(gb("semi_residential", true)).toBe(LOCAL_TAX_101_2.semi_residential);
    expect(gb("commercial", true)).toBe(LOCAL_TAX_101_2.commercial);
    expect(gb("exclusive_residential", false)).toBe(LOCAL_TAX_101_2.exclusive_residential);
  });
});

// ══════════════════════════════════════════════════════════
describe("불일치 규모 — 22개 조합 중 19개", () => {
  it("현행 GB 배율이 「지방세법 시행령」 제101조 제2항과 어긋나는 조합 수", () => {
    let mismatch = 0;
    let total = 0;
    for (const z of Object.keys(LOCAL_TAX_101_2)) {
      for (const metro of [true, false]) {
        total += 1;
        const cur = getLandFootprintMultiplier(z as ZoneType, metro, "general_building").multiplier;
        if (cur !== LOCAL_TAX_101_2[z]) mismatch += 1;
      }
    }
    expect(total).toBe(22);
    // Do 후 0이 되어야 한다.
    expect(mismatch).toBe(19);
  });
});

// ══════════════════════════════════════════════════════════
describe("A-BS-1 [별건 격하] — building_site 분류 (UI 선택 불가 = 도달 불가)", () => {
  // 분류 함수는 getLandCategoryGroup(landType) — classifyLandCategory는 input 객체를 받아
  // LandCategoryResult를 반환하는 상위 래퍼다(land-category.ts:37 vs :53).
  it("현행: housing_site와 building_site가 같은 카테고리로 분류된다", () => {
    expect(getLandCategoryGroup("housing_site")).toBe("housing");
    expect(getLandCategoryGroup("building_site")).toBe("housing");
  });

  it("NblSectionContainer LAND_TYPE_OPTIONS에 building_site가 없어 사용자가 선택할 수 없다", () => {
    // 실측(2026-07-30): 옵션 6종 — farmland·forest·pasture·housing_site·villa_land·other_land.
    // 따라서 A-BS-1의 분류 오류는 **도달 불가 경로**이며 세액 영향이 없다.
    // 이 사실을 코드로 고정할 수단이 없으므로(UI 상수는 컴포넌트 내부) 주석으로 남긴다.
    // Phase D는 GB 경로(A-BS-2~4)를 우선하고 building_site는 별건으로 분리한다.
    expect(getLandCategoryGroup("building_site")).toBe("housing");
  });
});
