/**
 * NBL 재촌 30km 직선거리 판정 + 토지 소재지 자동연동 — end-to-end anchor
 *
 * A2: 30km flip — 비연접 시군구 거주지 + 좌표 ≤30km → 재촌 인정; 좌표 결측 → 재촌 아님.
 * A4: 토지 소재지 fallback — nblLandSigunguCode="" + acquisitionSigunguCode(10자리)
 *     → raw에서 5자리 정규화 + 농지 좌표 운반 → landLocation 반영.
 *
 * 법령: 소득세법 시행령 §153③(§168의8② 준용) 3호 직선거리 30km.
 * 계획: docs/00-pm/transfer-nbl-residence-judgment-ui.plan.md §5
 */
import { describe, it, expect } from "vitest";
import { computeResidencePeriods } from "@/lib/tax-engine/non-business-land/residence";
import { buildNonBusinessLandRaw, buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { OwnerResidenceHistory, LocationInfo } from "@/lib/tax-engine/non-business-land/types";

describe("[NBL-30KM] 재촌 직선거리 30km 판정 (A2)", () => {
  const land: LocationInfo = { sigunguCode: "11110", lat: 37.5665, lng: 126.978 }; // 종로구/서울시청

  function hist(over: Partial<OwnerResidenceHistory>): OwnerResidenceHistory {
    return {
      sigunguCode: "99999", // 비동일·비연접
      sigunguName: "타지역",
      sidoName: "",
      startDate: new Date("2000-01-01"),
      endDate: new Date("2010-01-01"),
      hasResidentRegistration: true,
      ...over,
    };
  }

  it("A2-1: 비연접 시군구 + 거주지 좌표 ≤30km(인천 ≈27km) → 재촌 인정", () => {
    const r = computeResidencePeriods([hist({ lat: 37.4563, lng: 126.7052 })], land, {
      adjacentSigunguCodes: [],
    });
    expect(r.length).toBe(1); // 30km 이내 → 재촌 구간 산출
  });

  it("A2-2: 비연접 + 좌표 결측 → 재촌 아님 (동일/연접만, 판정 축소 아님)", () => {
    const r = computeResidencePeriods([hist({ lat: undefined, lng: undefined })], land, {
      adjacentSigunguCodes: [],
    });
    expect(r.length).toBe(0);
  });

  it("A2-3: 비연접 + 좌표 >30km(부산) → 재촌 아님", () => {
    const r = computeResidencePeriods([hist({ lat: 35.1796, lng: 129.0756 })], land, {
      adjacentSigunguCodes: [],
    });
    expect(r.length).toBe(0);
  });

  it("A2-4: 동일 시군구는 좌표 없어도 재촌 (기존 로직 불변)", () => {
    const r = computeResidencePeriods([hist({ sigunguCode: "11110", lat: undefined, lng: undefined })], land, {
      adjacentSigunguCodes: [],
    });
    expect(r.length).toBe(1);
  });
});

describe("[NBL-LAND-SYNC] 토지 소재지 자동연동 + 좌표 운반 (A4)", () => {
  function urbanLandAsset(over: Record<string, unknown>) {
    return {
      ...makeDefaultAsset(1),
      assetKind: "land",
      nblUseDetailedJudgment: true,
      nblLandType: "farmland",
      nblZoneType: "general_residential",
      acquisitionArea: "1000",
      acquisitionDate: "1985-01-01",
      ...over,
    } as unknown as Parameters<typeof buildNonBusinessLandRaw>[0];
  }

  it("A4-1: nblLandSigunguCode 미입력 + acquisitionSigunguCode 10자리 → raw 5자리 정규화", () => {
    const asset = urbanLandAsset({
      nblLandSigunguCode: "",
      acquisitionSigunguCode: "1111000000", // 10자리
      latitude: "37.5665",
      longitude: "126.978",
    });
    const raw = buildNonBusinessLandRaw(asset, "2026-01-12");
    expect(raw!.nblLandSigunguCode).toBe("11110"); // slice(0,5) 정규화
    expect(raw!.nblLandLat).toBe("37.5665");
    expect(raw!.nblLandLng).toBe("126.978");

    const input = buildNblEngineInput(raw as never);
    expect(input!.landLocation?.sigunguCode).toBe("11110");
    expect(input!.landLocation?.lat).toBeCloseTo(37.5665, 3);
    expect(input!.landLocation?.lng).toBeCloseTo(126.978, 3);
  });

  it("A4-2: nblLandSigunguCode 직접 입력 시 우선 (fallback 안 함)", () => {
    const asset = urbanLandAsset({
      nblLandSigunguCode: "11680",
      acquisitionSigunguCode: "1111000000",
      latitude: "37.5",
      longitude: "127.0",
    });
    const raw = buildNonBusinessLandRaw(asset, "2026-01-12");
    expect(raw!.nblLandSigunguCode).toBe("11680");
  });
});
