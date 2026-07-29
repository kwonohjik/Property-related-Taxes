/**
 * 감사 확정 결함 회귀 테스트
 * findingRef: multi-house-surcharge-count.ts:61
 *
 * 결함: 대구 군위군(법정동코드 27720, 2023.7.1 대구광역시 편입)이
 *   classifyRegionCriteriaByCode 대구 분기의 VALUE 예외에서 누락 →
 *   REGION(지역기준)으로 오분류. 광역시 소속 군인데도 가액 불문 주택 수 산입되어
 *   1주택↔2주택 전환, 다주택 중과(+20%p) on/off가 뒤바뀔 수 있었음(납세자 불리).
 *
 * 법령 근거: 소득세법 시행령 §167의3① — 지역기준(가액 불문 산입)에서
 *   '광역시에 소속된 군'을 제외 → 가액기준(VALUE, 양도 공시가 3억 초과만 산입).
 *   ∴ 군위군(광역시 소속 군)은 VALUE 여야 하며, 공시가 2억(≤3억)이면 주택 수 배제.
 *   (형제 광역시 군: 부산 기장 26710·대구 달성 27710·울산 울주 31710·
 *    인천 강화 28710·옹진 28720이 모두 VALUE로 구현된 원칙과 동일.)
 *
 * 기대값은 위 조문에서 독립 도출(엔진 수정 출력 복사 금지).
 */

import { describe, it, expect } from "vitest";
import {
  classifyRegionCriteriaByCode,
  countEffectiveHouses,
  type HouseCountExclusionRules,
} from "@/lib/tax-engine/multi-house-surcharge";
import { defaultRules, makeHouse } from "../_helpers/multi-house-mock";

describe("audit-fix: 대구 군위군 지역/가액 기준 분류 (소령 §167의3①)", () => {
  it("군위군(27720)은 광역시 소속 군 → VALUE(가액기준)", () => {
    // 소령 §167의3① 광역시 소속 군 제외 → 가액기준(VALUE)
    expect(classifyRegionCriteriaByCode("27720")).toBe("VALUE"); // 5자리 시군구
    expect(classifyRegionCriteriaByCode("2772011000")).toBe("VALUE"); // 10자리 법정동(PNU 앞10)
  });

  it("회귀 무변: 달성군(27710) VALUE 유지·대구 자치구(중구 27110·동구 27200) REGION 유지", () => {
    expect(classifyRegionCriteriaByCode("27710")).toBe("VALUE"); // 달성군(기존 VALUE)
    expect(classifyRegionCriteriaByCode("27110")).toBe("REGION"); // 대구 중구(자치구)
    expect(classifyRegionCriteriaByCode("27200")).toBe("REGION"); // 대구 동구(자치구)
  });

  it("서울 양도주택 + 군위군(양도 공시가 2억) → 군위군 주택 수 배제 → 유효 주택 수 1", () => {
    // 표준 다주택 rules: 지방(VALUE) 3억 이하 저가주택 배제 임계(local=3억)
    const rulesWithLocal: HouseCountExclusionRules = {
      ...defaultRules,
      lowPriceThreshold: { capital: null, non_capital: 100_000_000, local: 300_000_000 },
    };

    // 서울 강남구(11680) — REGION → 가액 불문 산입
    const seoul = makeHouse("seoul", { region: "capital", regionCode: "1168010100" });
    // 대구 군위군(27720) — VALUE → 양도 공시가 2억(≤3억) → 배제
    const gunwi = makeHouse("gunwi", {
      region: "non_capital",
      regionCode: "2772011000",
      regionCriteria: undefined,
      transferOfficialPrice: 200_000_000,
    });

    const { count, excluded } = countEffectiveHouses(
      [seoul, gunwi],
      new Date("2026-05-10"),
      [],
      rulesWithLocal,
    );

    // 법령상 올바른 값: 군위군은 VALUE·2억≤3억 배제 → 서울 1주택만 유효
    expect(count).toBe(1);
    expect(
      excluded.some((e) => e.houseId === "gunwi" && e.reason === "low_price_local_300"),
    ).toBe(true);
  });
});
