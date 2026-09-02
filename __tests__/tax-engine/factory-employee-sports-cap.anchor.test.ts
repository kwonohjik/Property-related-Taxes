/**
 * anchor — 별표6 3호**바**목 「공장입지기준면적의 100분의 10 이내」 상한 (E4-06, 2026-09-02 코드리뷰)
 *
 * ## 무엇이 틀렸었나
 *
 * 「지방세법 시행규칙」 [별표 6] 3호는 추가 인정기준 여섯 목을 두는데 **바목에만 비율 상한이 있다**
 * (verbatim 실측, 개정 2025.10.31.):
 *
 * > 바. 공장입지기준면적을 산출할 때 다음 표의 기준면적에 해당하는 종업원용 체육시설용지
 * >    (**공장입지기준면적의 100분의 10 이내에 해당하는 토지에 한정한다**)는 공장입지기준면적에
 * >    포함되는 것으로 한다.
 *
 * 나·다·라목(녹지·활주로·철로·6m 도로·접도구역 / 저수지·침전지 / 30도 사면용지)에는 이런 상한이 없다.
 * 그런데 종전 구현은 넷을 **한 입력**(`additionalRecognizedArea`)으로 받아 그대로 더했다.
 * 상한을 강제할 수단 자체가 없었던 것이다 ⇒ 기준면적이 부풀어 초과분(= 비사업용 면적)이
 * **과소** 산출된다(납세자 유리 방향).
 *
 * `computeFactoryStandardArea`는 **공용 leaf**라 같은 결함이 두 세목에 동시에 있었다:
 *   · 양도세 §104의3①4호나목 비사업용 판정 (`non-business-land/factory-land-standard-area.ts`)
 *   · 재산세 §106①3호가목 분리과세      (`separate-taxation.ts`)
 *
 * ## 10%의 분모
 *
 * 조문이 두 표현을 구분해 쓴다 — 가목은 「**제1호 및 제2호에 따라 산출된 면적**의 100분의 10/20」,
 * 바목은 「**공장입지기준면적**의 100분의 10」. 가목이 좁은 표현을 명시했는데 바목은 정의된 최종
 * 용어를 썼으므로 분모는 **바목을 제외한 공장입지기준면적**(1호·2호 + 가 + 나·다·라)으로 읽는다.
 * 바목 자신을 포함하면 순환하고, 「1호·2호만」으로 읽으면 분모가 작아 납세자에게 불리하다.
 */
import { describe, it, expect } from "vitest";
import {
  computeFactoryStandardArea,
  EMPLOYEE_SPORTS_FACILITY_CAP_RATE,
} from "@/lib/tax-engine/factory-standard-area";
import { judgeFactoryLandExcess } from "@/lib/tax-engine/non-business-land/factory-land-standard-area";

/** 리뷰 재현 시나리오 — 읍·면 공장, 연면적 2,000㎡ · 면적률 20% → 산출면적 10,000㎡ */
const SEGMENTS = [{ floorArea: 2000, ratePercent: 20 }];
const LAND = 30000;

describe("[E4-06] 별표6 3호바 — 종업원용 체육시설용지 10% 상한", () => {
  it("상한 비율은 10%다 (별표6 3호바 괄호)", () => {
    expect(EMPLOYEE_SPORTS_FACILITY_CAP_RATE).toBe(0.1);
  });

  it("리뷰 재현: 체육시설 5,000㎡ 입력 → 1,200㎡로 제한, 기준면적 13,200㎡", () => {
    const r = computeFactoryStandardArea(SEGMENTS, LAND, { employeeSportsFacilityArea: 5000 });
    expect(r.baseArea).toBe(10000);
    // 제한지역 아님 → 3호가2) 20% = 2,000㎡ (초과분 20,000㎡ 이내라 전액 인정)
    expect(r.additionalAllowanceApplied).toBe(2000);
    // 분모 = 10,000 + 2,000 + 0(나·다·라) = 12,000 → 10% = 1,200
    expect(r.employeeSportsFacilityCap).toBe(1200);
    expect(r.employeeSportsFacilityApplied).toBe(1200);
    expect(r.standardArea).toBe(13200);
  });

  it("종전 구현(무클램프)이라면 17,000㎡ — 3,800㎡ 차이가 곧 결함 규모다", () => {
    // 나·다·라 칸에 바목분을 그대로 넣던 종전 경로를 재현한다(입력 채널이 하나였다).
    const old = computeFactoryStandardArea(SEGMENTS, LAND, { additionalRecognizedArea: 5000 });
    expect(old.standardArea).toBe(17000);
    const fixed = computeFactoryStandardArea(SEGMENTS, LAND, { employeeSportsFacilityArea: 5000 });
    expect(old.standardArea - fixed.standardArea).toBe(3800);
  });

  it("한도 이내 입력은 전액 인정된다 (과차단 방지)", () => {
    const r = computeFactoryStandardArea(SEGMENTS, LAND, { employeeSportsFacilityArea: 800 });
    expect(r.employeeSportsFacilityApplied).toBe(800);
    expect(r.standardArea).toBe(12800);
  });

  it("미입력이면 0 — 기준면적이 달라지지 않는다", () => {
    const none = computeFactoryStandardArea(SEGMENTS, LAND);
    const zero = computeFactoryStandardArea(SEGMENTS, LAND, { employeeSportsFacilityArea: 0 });
    expect(none.standardArea).toBe(12000);
    expect(zero.standardArea).toBe(12000);
    expect(none.employeeSportsFacilityCap).toBe(1200);
  });

  it("나·다·라 인정분은 분모에 들어가 한도를 키운다 (바목 자신은 들어가지 않는다)", () => {
    const r = computeFactoryStandardArea(SEGMENTS, LAND, {
      additionalRecognizedArea: 3000,
      employeeSportsFacilityArea: 5000,
    });
    // 분모 = 10,000 + 2,000 + 3,000 = 15,000 → 10% = 1,500
    expect(r.employeeSportsFacilityCap).toBe(1500);
    expect(r.employeeSportsFacilityApplied).toBe(1500);
    expect(r.standardArea).toBe(16500);
    // 바목이 분모에 들어갔다면 한도가 1,500보다 커진다 — 순환 방지 확인
    expect(r.employeeSportsFacilityCap).toBeLessThan(r.standardArea * 0.1);
  });

  it("제한지역(3호가1 · 10%·3,000㎡ 한도)에서도 분모는 가목 인정분까지만이다", () => {
    const r = computeFactoryStandardArea(SEGMENTS, LAND, {
      isRestrictedZone: true,
      employeeSportsFacilityArea: 5000,
    });
    // 가목 한도 = min(10,000 × 10%, 3,000) = 1,000 → 분모 11,000 → 10% = 1,100
    expect(r.additionalAllowanceApplied).toBe(1000);
    expect(r.employeeSportsFacilityCap).toBeCloseTo(1100, 10);
    expect(r.standardArea).toBeCloseTo(12100, 10);
  });
});

describe("[E4-06] 양도세 NBL 판정에 상한이 실제로 반영된다", () => {
  it("비사업용 면적이 13,000㎡ → 16,800㎡ (3,800㎡ 과소 산출이 사라진다)", () => {
    const r = judgeFactoryLandExcess(
      {
        locationCategory: "eup_myeon_or_complex",
        segments: SEGMENTS,
        totalAppurtenantLandArea: LAND,
        employeeSportsFacilityArea: 5000,
      },
      "test",
    );
    expect(r.standardArea).toBe(13200);
    expect(r.nonBusinessArea).toBe(16800);
    expect(r.nonBusinessRatio).toBeCloseTo(0.56, 10);
  });

  it("한도로 잘린 사실이 detail에 드러난다 (조용히 깎지 않는다)", () => {
    const r = judgeFactoryLandExcess(
      {
        locationCategory: "eup_myeon_or_complex",
        segments: SEGMENTS,
        totalAppurtenantLandArea: LAND,
        employeeSportsFacilityArea: 5000,
      },
      "test",
    );
    expect(r.detail).toContain("종업원 체육시설");
    expect(r.detail).toContain("별표6 3호바 10% 한도");
  });

  it("한도 이내면 「제한」 문구 없이 그대로 표시된다", () => {
    const r = judgeFactoryLandExcess(
      {
        locationCategory: "eup_myeon_or_complex",
        segments: SEGMENTS,
        totalAppurtenantLandArea: LAND,
        employeeSportsFacilityArea: 800,
      },
      "test",
    );
    expect(r.detail).toContain("종업원 체육시설 800.00㎡");
    expect(r.detail).not.toContain("한도");
  });
});
