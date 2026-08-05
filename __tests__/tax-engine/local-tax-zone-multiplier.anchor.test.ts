/**
 * anchor — 「지방세법 시행령」 제101조 제2항 [표] 단일 정본 가드
 *
 * ## 배경
 *
 * 같은 배율표가 코드에 **4벌** 따로 있었고 값이 서로 달랐다(2026-08-05 실측):
 *
 * | 위치 | 일반주거 | 준주거 | 미계획 | 관리지역 |
 * |---|---|---|---|---|
 * | 법정(§101② 표) | 4 | 3 | 4 | 7 |
 * | `non-business-land/urban-area.ts` (양도세) | 4 | 3 | 4 | 7 |
 * | `legal-codes/property.ts` (재산세 별도·종합합산) | **5** | **5** | **5**(`?? 5`) | 7 |
 * | `property-land-classification.ts` (재산세 3분류) | **5** | **5** | **5**(`?? 5`) | **5** |
 * | `types/property-object.types.ts` (주석) | — | — | — | **5** |
 *
 * 재산세 두 경로는 주거지역을 `residential` 하나로만 받아 전용(5배)·일반(4배)·준주거(3배)를
 * 구분하지 못했고, 미계획지역은 키가 아예 없어 `?? 5` 추정 배율이 적용됐다.
 * 실측(바닥 200㎡·토지 1,200㎡): 일반주거 상가 부속토지의 종합합산 이관 면적이
 * 200㎡로 산정됐으나 법정은 400㎡ — **2배 차이**.
 *
 * ⇒ `lib/tax-engine/local-tax-zone-multiplier.ts`를 전 세목 단일 정본으로 통일했다.
 *
 * ## 이 테스트의 역할
 *
 * 법제처 Open API는 조문 안에 삽입된 표를 반환하지 않으므로 코드 정본이 유일한 확인 경로다.
 * 아래 기대값은 **법령 원문 표의 사본**이며, 정본이 조용히 바뀌면 여기가 먼저 깨진다.
 */
import { describe, it, expect } from "vitest";
import {
  LOCAL_TAX_ZONE_AREA_MULTIPLIER,
  getZoneAreaMultiplier,
  normalizeLocalTaxZoneKey,
} from "@/lib/tax-engine/local-tax-zone-multiplier";
import { getBuildingSiteMultiplier } from "@/lib/tax-engine/non-business-land/urban-area";
import { calculateBaseArea } from "@/lib/tax-engine/separate-aggregate-land";
import { isSeparateAggregate } from "@/lib/tax-engine/property-tax-comprehensive-aggregate";
import { classifySeparateAggregate } from "@/lib/tax-engine/property-land-classification";

/**
 * 「지방세법 시행령」 제101조 제2항 [표] 원문 사본.
 *
 * | 구분 | 용도지역별 | 적용배율 |
 * |---|---|---|
 * | 도시지역 | 1. 전용주거지역 | 5배 |
 * | 도시지역 | 2. 준주거지역·상업지역 | 3배 |
 * | 도시지역 | 3. 일반주거지역·공업지역 | 4배 |
 * | 도시지역 | 4. 녹지지역 | 7배 |
 * | 도시지역 | 5. 미계획지역 | 4배 |
 * | — | 도시지역 외의 용도지역 | 7배 |
 */
const DECREE_101_2: Record<string, number> = {
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
describe("Z-1 — 정본 표가 법령 원문과 일치한다", () => {
  it("11개 키 전건이 §101② 표와 같다 (개정 시 이 테스트가 먼저 깨진다)", () => {
    expect(LOCAL_TAX_ZONE_AREA_MULTIPLIER).toEqual(DECREE_101_2);
  });

  it("도시지역 5구분 — 표의 행 순서대로 5·3·3·4·4·7·4", () => {
    expect(LOCAL_TAX_ZONE_AREA_MULTIPLIER.exclusive_residential).toBe(5); // 1. 전용주거
    expect(LOCAL_TAX_ZONE_AREA_MULTIPLIER.semi_residential).toBe(3); //     2. 준주거
    expect(LOCAL_TAX_ZONE_AREA_MULTIPLIER.commercial).toBe(3); //           2. 상업
    expect(LOCAL_TAX_ZONE_AREA_MULTIPLIER.general_residential).toBe(4); //  3. 일반주거
    expect(LOCAL_TAX_ZONE_AREA_MULTIPLIER.industrial).toBe(4); //           3. 공업
    expect(LOCAL_TAX_ZONE_AREA_MULTIPLIER.green).toBe(7); //                4. 녹지
    expect(LOCAL_TAX_ZONE_AREA_MULTIPLIER.unplanned).toBe(4); //            5. 미계획
  });

  it("도시지역 외의 용도지역 4종은 전부 7배", () => {
    for (const zone of ["management", "agriculture_forest", "natural_env", "undesignated"]) {
      expect(LOCAL_TAX_ZONE_AREA_MULTIPLIER[zone as never]).toBe(7);
    }
  });

  it("재산세 레거시 키는 별칭으로 같은 행에 매핑된다", () => {
    expect(normalizeLocalTaxZoneKey("agricultural")).toBe("agriculture_forest");
    expect(normalizeLocalTaxZoneKey("nature_preserve")).toBe("natural_env");
    expect(getZoneAreaMultiplier("agricultural")?.multiplier).toBe(7);
    expect(getZoneAreaMultiplier("nature_preserve")?.multiplier).toBe(7);
  });

  it("세분 전 주거지역(residential)은 미등재 — 추정 배율 금지", () => {
    // 전용 5 / 일반 4 / 준주거 3 — 통합 키로는 배율을 결정할 수 없다.
    expect(getZoneAreaMultiplier("residential")).toBeUndefined();
    expect(normalizeLocalTaxZoneKey("residential")).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════
describe("Z-2 — 전 세목이 같은 표를 쓴다 (4벌 분기 재발 방지)", () => {
  /** 바닥 200㎡ / 토지 1,200㎡ — 배율이 다르면 별도합산·종합합산 면적이 갈린다. */
  const FLOOR = 200;
  const LAND = 1200;

  const CASES: Array<{ zone: string; multiplier: number }> = [
    { zone: "exclusive_residential", multiplier: 5 },
    { zone: "semi_residential", multiplier: 3 },
    { zone: "commercial", multiplier: 3 },
    { zone: "general_residential", multiplier: 4 },
    { zone: "industrial", multiplier: 4 },
    { zone: "green", multiplier: 7 },
    { zone: "unplanned", multiplier: 4 },
    { zone: "management", multiplier: 7 },
  ];

  CASES.forEach(({ zone, multiplier }) => {
    it(`${zone} — 양도세·재산세 3경로가 모두 ${multiplier}배`, () => {
      // 양도세: 건축물(비주택) 부수토지 비사업용 판정
      expect(getBuildingSiteMultiplier(zone as never)?.multiplier).toBe(multiplier);

      // 재산세: 별도합산 기준면적
      expect(
        calculateBaseArea({
          id: "L1",
          jurisdictionCode: "11680",
          landArea: LAND,
          officialLandPrice: 1_000_000,
          zoningDistrict: zone as never,
          buildingFloorArea: FLOOR,
        }).multiplier,
      ).toBe(multiplier);

      // 재산세: 종합합산 전환 판정
      const separate = isSeparateAggregate({
        id: "L1",
        address: "x",
        jurisdictionCode: "11680",
        landCategory: "대",
        useZone: zone as never,
        area: LAND,
        officialLandPrice: 1_000_000,
        hasBuilding: true,
        buildingFloorArea: FLOOR,
        buildingUsage: "commercial",
      });
      expect(separate.separateArea).toBe(Math.min(LAND, FLOOR * multiplier));
      expect(separate.comprehensiveArea).toBe(Math.max(0, LAND - FLOOR * multiplier));

      // 재산세: 토지 3분류
      expect(
        classifySeparateAggregate({
          landArea: LAND,
          landUse: "대",
          zoningDistrict: zone as never,
          isFarmland: false,
          buildingFloorArea: FLOOR,
        } as never).multiplier,
      ).toBe(multiplier);
    });
  });

  it("일반주거지역 회귀 — 종전 5배 오류였다면 종합합산 200㎡로 나온다", () => {
    const separate = isSeparateAggregate({
      id: "L1",
      address: "x",
      jurisdictionCode: "11680",
      landCategory: "대",
      useZone: "general_residential",
      area: LAND,
      officialLandPrice: 1_000_000,
      hasBuilding: true,
      buildingFloorArea: FLOOR,
      buildingUsage: "commercial",
    });
    // 법정 4배 → 기준면적 800㎡ → 종합합산 이관 400㎡ (종전 5배는 200㎡였다)
    expect(separate.separateArea).toBe(800);
    expect(separate.comprehensiveArea).toBe(400);
  });

  it("미계획지역 회귀 — 종전 `?? 5` fallback이었다면 기준면적 1,000㎡로 나온다", () => {
    expect(
      calculateBaseArea({
        id: "L1",
        jurisdictionCode: "11680",
        landArea: LAND,
        officialLandPrice: 1_000_000,
        zoningDistrict: "unplanned",
        buildingFloorArea: FLOOR,
      }).baseArea,
    ).toBe(800); // 4배 (종전 fallback 5배는 1,000㎡였다)
  });

  it("관리지역 회귀 — 3분류 경로가 종전 5배였다", () => {
    expect(
      classifySeparateAggregate({
        landArea: LAND,
        landUse: "대",
        zoningDistrict: "management",
        isFarmland: false,
        buildingFloorArea: FLOOR,
      } as never).multiplier,
    ).toBe(7); // 종전 5배 → 기준면적 1,000㎡로 과소 산정됐다
  });
});

// ══════════════════════════════════════════════════════════
describe("Z-3 — 표 미등재 용도지역은 추정하지 않고 차단한다", () => {
  it("재산세 별도합산 — residential 입력 시 예외", () => {
    expect(() =>
      calculateBaseArea({
        id: "L1",
        jurisdictionCode: "11680",
        landArea: 1200,
        officialLandPrice: 1_000_000,
        zoningDistrict: "residential" as never,
        buildingFloorArea: 200,
      }),
    ).toThrow(/제101조 제2항/);
  });

  it("재산세 종합합산 전환 — residential 입력 시 예외", () => {
    expect(() =>
      isSeparateAggregate({
        id: "L1",
        address: "x",
        jurisdictionCode: "11680",
        landCategory: "대",
        useZone: "residential" as never,
        area: 1200,
        officialLandPrice: 1_000_000,
        hasBuilding: true,
        buildingFloorArea: 200,
        buildingUsage: "commercial",
      }),
    ).toThrow(/제101조 제2항/);
  });

  it("재산세 3분류 — residential 입력 시 예외", () => {
    expect(() =>
      classifySeparateAggregate({
        landArea: 1200,
        landUse: "대",
        zoningDistrict: "residential" as never,
        isFarmland: false,
        buildingFloorArea: 200,
      } as never),
    ).toThrow(/제101조 제2항/);
  });

  it("양도세 건축물 부수토지 — residential은 undefined (호출부가 차단)", () => {
    expect(getBuildingSiteMultiplier("residential")).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════
describe("Z-4 — 공장용 건축물 부속토지는 §101①1호 본칙을 따른다", () => {
  const mk = (overrides: Record<string, unknown>) =>
    calculateBaseArea({
      id: "L1",
      jurisdictionCode: "11680",
      landArea: 1200,
      officialLandPrice: 1_000_000,
      zoningDistrict: "general_residential",
      buildingFloorArea: 200,
      isFactory: true,
      ...overrides,
    } as never);

  it("공장입지기준면적 입력 시 그 면적을 기준면적으로 쓴다", () => {
    expect(mk({ factoryStandardArea: 700 }).baseArea).toBe(700);
  });

  it("미입력 시 바닥면적 × 해당 용도지역 배율 (종전에는 공업지역 4배 고정이었다)", () => {
    // 일반주거지역 4배 — 공업지역과 배율이 같아 값은 같지만, 근거가 용도지역으로 바뀌었다.
    expect(mk({}).multiplier).toBe(4);
    // 상업지역이면 3배 — 종전 고정 4배와 갈린다.
    expect(mk({ zoningDistrict: "commercial" }).multiplier).toBe(3);
    expect(mk({ zoningDistrict: "commercial" }).baseArea).toBe(600);
  });
});
