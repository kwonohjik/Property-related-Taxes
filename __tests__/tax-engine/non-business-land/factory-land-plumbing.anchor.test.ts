/**
 * anchor — 공장용지 입력의 **배관 라운드트립** (Phase B, 14 동기화 지점 ⑫⑬⑭)
 *
 * 계획: docs/02-design/features/factory-site-standard-area-nbl.plan.md
 *
 * ## 왜 별도 테스트인가
 *
 * ⑫(Zod 입력 객체)·⑬(body spread)·⑭(Route 엔진 input 매핑)는 **TypeScript가 잡지 못한다**.
 * Zod `z.object`는 스키마에 없는 키를 **조용히 strip**하므로, 필드를 엔진 타입에만 추가하고
 * 스키마 등록을 잊으면 컴파일도 되고 테스트도 통과하는데 **엔진에는 값이 도달하지 않는다**.
 * 공장 판정에서는 그 결과가 "한도 판정 자체가 사라짐"(초과분 중과 미발동)이라 눈에 띄지 않는다.
 *
 * ⇒ 폼(AssetForm) → 빌더 → Zod → form-mapper → 엔진 input 까지 **실제로 흘려보고** 단언한다.
 *
 * ## 이 경로의 특이점
 *
 * `buildNonBusinessLandRaw`는 필드를 하나씩 나열하지 않고 **prefix-pick**(`k.startsWith("nbl")`)
 * 으로 운반한다. 그래서 ⑬은 필드명이 `nbl`로 시작하기만 하면 자동으로 통과하고,
 * **실질 관문은 ⑫(Zod)뿐**이다 — 아래 STRIP-1이 그 관문을 지킨다.
 */
import { describe, it, expect } from "vitest";
import { nonBusinessLandRawSchema } from "@/lib/api/transfer-tax-schema-nbl";
import { buildFactory } from "@/lib/tax-engine/non-business-land/form-mapper-helpers";
import { judgeFactoryLandExcess } from "@/lib/tax-engine/non-business-land/factory-land-standard-area";

/** UI가 보내는 평면 raw (store `nbl*` 필드 그대로) */
const RAW_FORM = {
  nblUseDetailedJudgment: true,
  nblLandType: "other_land" as const,
  nblZoneType: "general_residential",
  acquisitionArea: "5000",
  acquisitionDate: "2014-01-01",
  transferDate: "2024-01-01",
  // 공장 입력
  nblFactoryEnabled: true,
  nblFactoryLocationCategory: "eup_myeon_or_complex",
  nblFactoryTotalLandArea: "20000",
  nblFactorySegments: [{ id: "s1", floorArea: "1200", ratePercent: "12", industryLabel: "합성섬유 제조업" }],
  nblFactoryIsRestrictedZone: false,
  nblFactoryAdditionalRecognizedArea: "0",
  nblFactorySportsEmployeeCount: "",
  nblFactorySportsEntityType: "",
  nblFactorySportsPlaygroundArea: "",
  nblFactorySportsCourtArea: "",
  nblFactorySportsIndoorFloorArea: "",
  nblFactoryFootprintArea: "",
  nblFactoryIsUnregistered: false,
};

const parseNumber = (v: string) => {
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && String(v).trim() !== "" ? n : undefined;
};

describe("⑫ Zod — 공장 필드가 strip되지 않는다", () => {
  it("STRIP-1: 13개 공장 필드가 모두 파싱 결과에 남는다", () => {
    const parsed = nonBusinessLandRawSchema.parse(RAW_FORM);
    // 필드 하나라도 스키마에서 빠지면 여기서 undefined가 되어 실패한다
    expect(parsed.nblFactoryEnabled).toBe(true);
    expect(parsed.nblFactoryLocationCategory).toBe("eup_myeon_or_complex");
    expect(parsed.nblFactoryTotalLandArea).toBe("20000");
    expect(parsed.nblFactorySegments).toEqual([
      { id: "s1", floorArea: "1200", ratePercent: "12", industryLabel: "합성섬유 제조업" },
    ]);
    expect(parsed.nblFactoryIsRestrictedZone).toBe(false);
    expect(parsed.nblFactoryAdditionalRecognizedArea).toBe("0");
    expect(parsed.nblFactorySportsEmployeeCount).toBe("");
    expect(parsed.nblFactorySportsPlaygroundArea).toBe("");
    expect(parsed.nblFactoryFootprintArea).toBe("");
    expect(parsed.nblFactoryIsUnregistered).toBe(false);
  });

  it("STRIP-2: 공장 필드 계약 개수 가드 — 필드를 늘리면 이 숫자도 갱신할 것", () => {
    const keys = Object.keys(nonBusinessLandRawSchema.shape).filter((k) => k.startsWith("nblFactory"));
    expect(keys.sort()).toEqual([
      "nblFactoryAdditionalRecognizedArea",
      "nblFactoryEnabled",
      "nblFactoryFootprintArea",
      "nblFactoryIsRestrictedZone",
      "nblFactoryIsUnregistered",
      "nblFactoryLocationCategory",
      "nblFactorySegments",
      // E4-06(2026-09-02 → 표 자동화 2026-09-03) — 별표6 3호바만 「기준면적의 10% 이내」 상한이
      // 있어 상한 없는 나·다·라와 분리했고, 표(비고 2-나·다·라)도 엔진이 산출하므로
      // 종업원수·사업주체·시설별 면적을 각각 받는다. 한 칸이면 둘 다 강제할 수 없다.
      "nblFactorySportsCourtArea",
      "nblFactorySportsEmployeeCount",
      "nblFactorySportsEntityType",
      "nblFactorySportsIndoorFloorArea",
      "nblFactorySportsPlaygroundArea",
      "nblFactoryTotalLandArea",
    ]);
  });

  it("STRIP-3: ⑬은 prefix-pick이라 `nbl` 접두어가 계약이다", () => {
    const keys = Object.keys(nonBusinessLandRawSchema.shape).filter((k) => k.includes("Factory"));
    expect(keys.every((k) => k.startsWith("nbl"))).toBe(true);
  });
});

describe("⑭ form-mapper — Zod 통과값이 엔진 input으로 변환된다", () => {
  it("MAP-1: 평면 문자열 → FactoryLandUsage (숫자 파싱·용도지역 승계)", () => {
    const parsed = nonBusinessLandRawSchema.parse(RAW_FORM);
    const f = buildFactory(parsed as Record<string, unknown>, parseNumber, "general_residential");
    expect(f).toEqual({
      locationCategory: "eup_myeon_or_complex",
      totalAppurtenantLandArea: 20000,
      segments: [{ floorArea: 1200, ratePercent: 12, industryLabel: "합성섬유 제조업" }],
      isRestrictedZone: false,
      additionalRecognizedArea: 0,
      // 별표6 3호바 — 값이 비어 있어도 **용도지역 배율은 자산에서 도출**되므로 객체는 존재한다.
      employeeSportsFacility: {
        employeeCount: undefined,
        entityType: undefined,
        playgroundArea: undefined,
        tennisCourtArea: undefined,
        indoorFloorArea: undefined,
        indoorZoneMultiplier: 4,
      },
      totalFootprintArea: undefined,
      zoneType: "general_residential",
      isUnregistered: false,
    });
  });

  it("MAP-2: 토글 OFF면 undefined — 다른 필드가 남아 있어도 공장이 아니다", () => {
    const off = { ...RAW_FORM, nblFactoryEnabled: false };
    const parsed = nonBusinessLandRawSchema.parse(off);
    expect(buildFactory(parsed as Record<string, unknown>, parseNumber, "general_residential")).toBeUndefined();
  });

  it("MAP-3: 토글 ON + 값 누락은 undefined로 삼키지 않는다 (엔진이 던지게 둔다)", () => {
    const partial = { ...RAW_FORM, nblFactorySegments: [] };
    const parsed = nonBusinessLandRawSchema.parse(partial);
    const f = buildFactory(parsed as Record<string, unknown>, parseNumber, "general_residential");
    expect(f).toBeDefined(); // 조용히 사라지지 않는다
    expect(() => judgeFactoryLandExcess(f!, "기타토지(공장)")).toThrow(/연면적과 업종별 기준공장면적률/);
  });
});

describe("전체 경로 — raw 폼이 엔진 판정까지 도달한다", () => {
  it("E2E-1: 폼 → Zod → mapper → 엔진에서 초과비율 40%가 나온다", () => {
    const parsed = nonBusinessLandRawSchema.parse(RAW_FORM);
    const f = buildFactory(parsed as Record<string, unknown>, parseNumber, "general_residential")!;
    const r = judgeFactoryLandExcess(f, "기타토지(공장)");
    // 연면적 1,200 ÷ 12% = 10,000 + 3호가2 인정 2,000 = 12,000. 전체 20,000 → 초과 8,000
    expect(r.route).toBe("separate_taxation");
    expect(r.standardArea).toBe(12000);
    expect(r.nonBusinessArea).toBe(8000);
    expect(r.nonBusinessRatio).toBeCloseTo(0.4, 10);
  });

  it("E2E-2: 지역을 바꾸면 산식이 바뀐다 (§101①1호 — 바닥면적 × 배율)", () => {
    const urban = {
      ...RAW_FORM,
      nblFactoryLocationCategory: "urban_other",
      nblFactoryFootprintArea: "1000",
    };
    const parsed = nonBusinessLandRawSchema.parse(urban);
    const f = buildFactory(parsed as Record<string, unknown>, parseNumber, "general_residential")!;
    const r = judgeFactoryLandExcess(f, "기타토지(공장)");
    expect(r.route).toBe("aggregate_taxation");
    expect(r.standardArea).toBe(4000); // 1,000 × 4배(일반주거)
    expect(r.nonBusinessArea).toBe(16000);
  });

  it("E2E-3: 지역 미선택은 조용히 한쪽 경로로 흘리지 않고 던진다", () => {
    const noLoc = { ...RAW_FORM, nblFactoryLocationCategory: "" };
    const parsed = nonBusinessLandRawSchema.parse(noLoc);
    const f = buildFactory(parsed as Record<string, unknown>, parseNumber, "general_residential")!;
    expect(() => judgeFactoryLandExcess(f, "기타토지(공장)")).toThrow(/공장 소재 지역/);
  });
});

/**
 * E4-06 (2026-09-02 코드리뷰) — 별표6 3호**바** 종업원용 체육시설용지 전용 채널.
 *
 * ⑫에 등록하지 않으면 `z.object`가 조용히 strip해 **10% 상한 판정 자체가 엔진에 도달하지 않는다**.
 * 그 결과는 「기준면적이 커져 비사업용 면적이 줄어드는」 유리한 방향의 오류라 눈에 띄지 않는다.
 * ⇒ 폼 → Zod → mapper → 엔진까지 실제로 흘려보고 **판정 수치**로 확인한다.
 */
describe("[E4-06] 종업원용 체육시설(3호바) 전용 채널의 라운드트립", () => {
  /** 종업원 500명 — 운동장 표값 4,600㎡라 5,000㎡ 입력은 표에서 4,600으로 깎이고 10% 상한이 최종 */
  const withSports = (playground: string, employees = "500") => ({
    ...RAW_FORM,
    nblFactorySportsEmployeeCount: employees,
    nblFactorySportsPlaygroundArea: playground,
  });

  it("SPORTS-1: Zod → mapper → FactoryLandUsage까지 5필드가 살아 있다", () => {
    const parsed = nonBusinessLandRawSchema.parse({
      ...withSports("5000"),
      nblFactorySportsEntityType: "corporation",
      nblFactorySportsCourtArea: "800",
      nblFactorySportsIndoorFloorArea: "200",
    });
    expect(parsed.nblFactorySportsEmployeeCount).toBe("500");
    expect(parsed.nblFactorySportsEntityType).toBe("corporation");
    expect(parsed.nblFactorySportsPlaygroundArea).toBe("5000");
    expect(parsed.nblFactorySportsCourtArea).toBe("800");
    expect(parsed.nblFactorySportsIndoorFloorArea).toBe("200");

    const f = buildFactory(parsed as Record<string, unknown>, parseNumber, "general_residential");
    expect(f?.employeeSportsFacility).toEqual({
      employeeCount: 500,
      entityType: "corporation",
      playgroundArea: 5000,
      tennisCourtArea: 800,
      indoorFloorArea: 200,
      // 일반주거지역 4배 (「지방세법 시행령」 §101②) — 자산 용도지역에서 도출한다(단일 소스)
      indoorZoneMultiplier: 4,
    });
  });

  it("SPORTS-2: 엔진 판정에서 표 상한 → 10% 상한 순으로 적용된다 (5,000 → 4,600 → 1,200)", () => {
    const parsed = nonBusinessLandRawSchema.parse(withSports("5000"));
    const f = buildFactory(parsed as Record<string, unknown>, parseNumber, "general_residential");
    const r = judgeFactoryLandExcess(f!, "test");
    // 별표6 3호바 표 — 종업원 500명 운동장 = 1,000 + 400×9 = 4,600
    expect(r.standardAreaDetail?.employeeSportsFacilityArea).toBe(4600);
    // 산출 10,000(=1,200 ÷ 12%) + 가목 20% 2,000 = 12,000 → 바목 한도 1,200
    expect(r.standardAreaDetail?.employeeSportsFacilityCap).toBe(1200);
    expect(r.standardAreaDetail?.employeeSportsFacilityApplied).toBe(1200);
    expect(r.standardArea).toBe(13200);
  });

  it("SPORTS-3: 미입력이면 기준면적이 달라지지 않는다 (전용 채널이 부작용을 내지 않는다)", () => {
    const parsedEmpty = nonBusinessLandRawSchema.parse(withSports("", ""));
    const fEmpty = buildFactory(parsedEmpty as Record<string, unknown>, parseNumber, "general_residential");
    expect(judgeFactoryLandExcess(fEmpty!, "test").standardArea).toBe(12000);
  });

  it("SPORTS-4: 종업원수만 없으면 표를 적용할 수 없어 인정면적이 0이다 (⑧이 먼저 차단한다)", () => {
    const parsed = nonBusinessLandRawSchema.parse(withSports("5000", ""));
    const f = buildFactory(parsed as Record<string, unknown>, parseNumber, "general_residential");
    const r = judgeFactoryLandExcess(f!, "test");
    expect(r.standardAreaDetail?.employeeSportsFacilityArea).toBe(0);
    expect(r.standardArea).toBe(12000);
  });
});
