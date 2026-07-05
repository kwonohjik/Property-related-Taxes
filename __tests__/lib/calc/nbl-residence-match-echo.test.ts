/**
 * NBL 재촌 인정 근거 echo — computeResidenceMatchSummary + judge 전파
 *
 * 재촌 판정 방법(동일/연접/직선거리 30km + 거리)을 결과 카드 표시용 echo로 노출.
 * 판정 로직 무영향(echo-field-pattern). 법령: 소득세법 시행령 §153③.
 */
import { describe, it, expect } from "vitest";
import {
  computeResidenceMatchSummary,
  type ResidenceMatchType,
} from "@/lib/tax-engine/non-business-land/residence";
import type { OwnerResidenceHistory, LocationInfo } from "@/lib/tax-engine/non-business-land/types";

const land: LocationInfo = { sigunguCode: "11110", lat: 37.5665, lng: 126.978 };

function hist(over: Partial<OwnerResidenceHistory>): OwnerResidenceHistory {
  return {
    sigunguCode: "99999",
    sigunguName: "타지역",
    sidoName: "",
    startDate: new Date("2000-01-01"),
    endDate: new Date("2010-01-01"),
    hasResidentRegistration: true,
    ...over,
  };
}

describe("[NBL-RES-ECHO] 재촌 인정 근거 요약", () => {
  it("E1: 동일 시군구 → same", () => {
    const s = computeResidenceMatchSummary([hist({ sigunguCode: "11110" })], land, { adjacentSigunguCodes: [] });
    expect(s?.matchType).toBe<ResidenceMatchType>("same");
  });

  it("E2: 연접 시군구 → adjacent", () => {
    const s = computeResidenceMatchSummary([hist({ sigunguCode: "11140" })], land, {
      adjacentSigunguCodes: ["11140"],
    });
    expect(s?.matchType).toBe("adjacent");
  });

  it("E3: 비연접 + 좌표 ≤30km → within_30km + 실측 거리", () => {
    const s = computeResidenceMatchSummary([hist({ lat: 37.4563, lng: 126.7052 })], land, {
      adjacentSigunguCodes: [],
    });
    expect(s?.matchType).toBe("within_30km");
    expect(s?.distanceKm).toBeGreaterThan(20);
    expect(s?.distanceKm).toBeLessThanOrEqual(30);
  });

  it("E4: 우선순위 same > within_30km (동일 시군구 이력이 30km 이력보다 우선)", () => {
    const s = computeResidenceMatchSummary(
      [hist({ lat: 37.4563, lng: 126.7052 }), hist({ sigunguCode: "11110" })],
      land,
      { adjacentSigunguCodes: [] },
    );
    expect(s?.matchType).toBe("same");
  });

  it("E5: 재촌 이력 없음(>30km, 비연접) → undefined", () => {
    const s = computeResidenceMatchSummary([hist({ lat: 35.1796, lng: 129.0756 })], land, {
      adjacentSigunguCodes: [],
    });
    expect(s).toBeUndefined();
  });

  it("E6: 임야 requireResidentRegistration — 주민등록 없으면 제외", () => {
    const s = computeResidenceMatchSummary([hist({ sigunguCode: "11110", hasResidentRegistration: false })], land, {
      adjacentSigunguCodes: [],
      requireResidentRegistration: true,
    });
    expect(s).toBeUndefined();
  });
});
