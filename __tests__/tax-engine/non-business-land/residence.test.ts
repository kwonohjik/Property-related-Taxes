/**
 * Phase B-3 유닛 테스트 — residence.ts
 */
import { describe, it, expect } from "vitest";
import {
  computeResidencePeriods,
  fallbackResidenceFromDistance,
} from "@/lib/tax-engine/non-business-land/residence";
import type { OwnerResidenceHistory } from "@/lib/tax-engine/non-business-land/types";

const d = (iso: string) => new Date(iso);

function h(opts: Partial<OwnerResidenceHistory>): OwnerResidenceHistory {
  return {
    sidoName: "서울특별시",
    sigunguName: "강남구",
    startDate: d("2020-01-01"),
    endDate: d("2023-01-01"),
    hasResidentRegistration: true,
    ...opts,
  };
}

describe("computeResidencePeriods", () => {
  it("시·군·구 코드 일치 — 전체 기간 재촌 인정", () => {
    const periods = computeResidencePeriods(
      [h({ sigunguCode: "11680", startDate: d("2020-01-01"), endDate: d("2023-01-01") })],
      { sigunguCode: "11680" },
    );
    expect(periods).toHaveLength(1);
    expect(periods[0].start.toISOString().slice(0, 10)).toBe("2020-01-01");
    expect(periods[0].end.toISOString().slice(0, 10)).toBe("2023-01-01");
  });

  it("연접 시·군·구 — 재촌 인정", () => {
    const periods = computeResidencePeriods(
      [h({ sigunguCode: "11650" })], // 서초
      { sigunguCode: "11680" }, // 강남 (landLocation)
      { adjacentSigunguCodes: ["11650", "11545"] },
    );
    expect(periods).toHaveLength(1);
  });

  it("시·군·구 불일치 + 연접 아님 + 거리 정보 없음 → 재촌 미인정", () => {
    const periods = computeResidencePeriods(
      [h({ sigunguCode: "26440" })], // 부산 해운대
      { sigunguCode: "11680" }, // 서울 강남
      { adjacentSigunguCodes: ["11650"] },
    );
    expect(periods).toHaveLength(0);
  });

  it("거리 fallback — landLocation.distanceKm <= 30 → 모든 이력 인정", () => {
    const periods = computeResidencePeriods(
      [h({ sigunguCode: "26440" })], // 부산이지만 거리 fallback
      { sigunguCode: "11680", distanceKm: 15 }, // 15km 이내
    );
    expect(periods).toHaveLength(1);
  });

  it("임야 옵션 — 주민등록 없는 이력 제외", () => {
    const periods = computeResidencePeriods(
      [
        h({
          sigunguCode: "11680",
          hasResidentRegistration: false,
          startDate: d("2020-01-01"),
          endDate: d("2022-01-01"),
        }),
        h({
          sigunguCode: "11680",
          hasResidentRegistration: true,
          startDate: d("2022-01-01"),
          endDate: d("2023-01-01"),
        }),
      ],
      { sigunguCode: "11680" },
      { requireResidentRegistration: true },
    );
    expect(periods).toHaveLength(1);
    expect(periods[0].start.toISOString().slice(0, 10)).toBe("2022-01-01");
  });

  it("복수 이력 중 일부는 재촌, 일부는 비재촌 → 재촌만 합산", () => {
    const periods = computeResidencePeriods(
      [
        h({ sigunguCode: "11680", startDate: d("2019-01-01"), endDate: d("2020-06-01") }), // 재촌
        h({ sigunguCode: "26440", startDate: d("2020-06-01"), endDate: d("2021-06-01") }), // 비재촌
        h({ sigunguCode: "11680", startDate: d("2021-06-01"), endDate: d("2023-01-01") }), // 재촌
      ],
      { sigunguCode: "11680" },
    );
    // 두 재촌 구간이 분리되어 있으므로 2개
    expect(periods).toHaveLength(2);
  });
});

describe("fallbackResidenceFromDistance", () => {
  it("ownerDistanceKm <= limit → 전체 보유 구간 반환", () => {
    const periods = fallbackResidenceFromDistance(d("2020-01-01"), d("2023-01-01"), 25);
    expect(periods).toHaveLength(1);
  });

  it("ownerDistanceKm > limit → 빈 배열", () => {
    const periods = fallbackResidenceFromDistance(d("2020-01-01"), d("2023-01-01"), 50);
    expect(periods).toHaveLength(0);
  });

  it("ownerDistanceKm undefined → 빈 배열", () => {
    const periods = fallbackResidenceFromDistance(d("2020-01-01"), d("2023-01-01"), undefined);
    expect(periods).toHaveLength(0);
  });
});
