/**
 * 영농상속공제 거주지 자동 검증 — anchor 테스트 (PR-E F-10)
 *
 * 법령: 시행령 §16②1호나 (KoreanLaw MCP 검증 2026-05-21)
 * 계획서: docs/00-pm/inheritance-farming-remaining-prs.plan.md §5
 */

import { describe, expect, it } from "vitest";

import { haversineKm, isWithin30Km } from "@/lib/geo/haversine";
import { checkFarmingResidenceCompliance } from "@/lib/calc/farming-residence-check";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { FarmingInheritanceInput } from "@/lib/tax-engine/types/inheritance-farming.types";

// 참조 좌표
const SEOUL = { lat: 37.5665, lng: 126.978 }; // 서울시청
const BUSAN = { lat: 35.1796, lng: 129.0756 }; // 부산시청

// ============================================================
// FR-1: Haversine 정확성 — 서울→부산 약 325km
// ============================================================

describe("haversineKm — WGS84 직선거리 (km)", () => {
  it("FR-1: 서울→부산 약 325km", () => {
    const d = haversineKm(SEOUL, BUSAN);
    expect(d).toBeGreaterThan(320);
    expect(d).toBeLessThan(335);
  });

  it("동일 좌표 → 0", () => {
    expect(haversineKm(SEOUL, SEOUL)).toBe(0);
  });

  it("FR-2: 30km 경계 — isWithin30Km", () => {
    // 1도 위도 ≈ 111km. 0.25도 ≈ 27.8km / 0.30도 ≈ 33.4km
    const within = { lat: SEOUL.lat + 0.25, lng: SEOUL.lng };
    const outside = { lat: SEOUL.lat + 0.3, lng: SEOUL.lng };
    expect(isWithin30Km(SEOUL, within)).toBe(true);
    expect(isWithin30Km(SEOUL, outside)).toBe(false);
  });

  it("FR-2b: 동일 좌표 30km 경계 포함", () => {
    expect(isWithin30Km(SEOUL, SEOUL)).toBe(true);
  });
});

// ============================================================
// FR-3 ~ FR-8: checkFarmingResidenceCompliance
// ============================================================

function farmlandItem(
  id: string,
  latLng: { lat: number; lng: number },
): EstateItem {
  return {
    id,
    category: "real_estate_land",
    name: `농지 ${id}`,
    farmingCategory: "farmland",
    estateLatLng: latLng,
    marketValue: 100_000_000,
  };
}

function fishingItem(
  id: string,
  latLng: { lat: number; lng: number },
): EstateItem {
  return {
    id,
    category: "other",
    name: `어선 ${id}`,
    farmingCategory: "fishing_vessel",
    fishingAnchorLatLng: latLng,
    marketValue: 50_000_000,
  };
}

function baseFarming(
  over: Partial<FarmingInheritanceInput> = {},
): FarmingInheritanceInput {
  return {
    type: "personal",
    decedentEightYearFarming: true,
    decedentResidenceMet: false,
    heirIsAdult: true,
    heirTwoYearFarming: true,
    heirResidenceMet: false,
    ...over,
  };
}

describe("checkFarmingResidenceCompliance — 거주지 자동 검증", () => {
  it("FR-3: 다중 자산 — minDistance 검증 (가장 가까운 자산 거리)", () => {
    const within = { lat: SEOUL.lat + 0.1, lng: SEOUL.lng }; // ≈ 11km
    const items = [farmlandItem("a1", within), farmlandItem("a2", BUSAN)];
    const r = checkFarmingResidenceCompliance(
      items,
      baseFarming({
        decedentResidenceLatLng: SEOUL,
        decedentResidenceMet: true,
      }),
    );
    expect(r.decedentMinDistanceKm).not.toBeNull();
    expect(r.decedentMinDistanceKm!).toBeLessThan(15);
    expect(r.decedentAutoMet).toBe(true);
    expect(r.decedentMet).toBe(true); // 사용자 명시
  });

  it("FR-4: estateLatLng 미입력 자산 자동 검증 무시", () => {
    const items: EstateItem[] = [
      {
        id: "a1",
        category: "real_estate_land",
        name: "농지 좌표 미입력",
        farmingCategory: "farmland",
        // estateLatLng 미입력
      },
    ];
    const r = checkFarmingResidenceCompliance(
      items,
      baseFarming({ decedentResidenceLatLng: SEOUL }),
    );
    expect(r.decedentMinDistanceKm).toBeNull();
    expect(r.decedentAutoMet).toBeNull();
    expect(r.decedentMet).toBe(false); // 사용자 명시 false
  });

  it("FR-5: 어선·어업권 — fishingAnchorLatLng 사용 분기", () => {
    const within = { lat: SEOUL.lat + 0.1, lng: SEOUL.lng };
    const items = [fishingItem("a1", within)];
    const r = checkFarmingResidenceCompliance(
      items,
      baseFarming({
        decedentResidenceLatLng: SEOUL,
        decedentResidenceMet: true,
      }),
    );
    expect(r.decedentMinDistanceKm).not.toBeNull();
    expect(r.decedentAutoMet).toBe(true);
    expect(r.decedentMet).toBe(true); // 사용자 명시
  });

  it("FR-5b: 어업권 자산이지만 fishingAnchorLatLng 미입력 + estateLatLng 입력 → 자동 검증 무시", () => {
    // farmingCategory='fishing_vessel'에서는 estateLatLng가 아닌 fishingAnchorLatLng만 사용
    const items: EstateItem[] = [
      {
        id: "a1",
        category: "other",
        name: "어선 잘못된 좌표 필드",
        farmingCategory: "fishing_vessel",
        estateLatLng: { lat: SEOUL.lat + 0.1, lng: SEOUL.lng }, // 무시됨
      },
    ];
    const r = checkFarmingResidenceCompliance(
      items,
      baseFarming({ decedentResidenceLatLng: SEOUL }),
    );
    expect(r.decedentMinDistanceKm).toBeNull();
  });

  it("FR-6: decedent/heir 양쪽 자동 검증 통과 + 사용자 명시 → 양쪽 met=true / autoMet=true", () => {
    const within = { lat: SEOUL.lat + 0.1, lng: SEOUL.lng };
    const items = [farmlandItem("a1", within)];
    const r = checkFarmingResidenceCompliance(
      items,
      baseFarming({
        decedentResidenceLatLng: SEOUL,
        heirResidenceLatLng: SEOUL,
        decedentResidenceMet: true,
        heirResidenceMet: true,
      }),
    );
    expect(r.decedentMet).toBe(true);
    expect(r.heirMet).toBe(true);
    expect(r.decedentAutoMet).toBe(true);
    expect(r.heirAutoMet).toBe(true);
  });

  it("FR-7 (옵션 A): 사용자 명시 true + 자동 false → met=true / autoMet=false (모순 안내용)", () => {
    const items = [farmlandItem("a1", BUSAN)];
    const r = checkFarmingResidenceCompliance(
      items,
      baseFarming({
        decedentResidenceLatLng: SEOUL,
        decedentResidenceMet: true, // 사용자 명시 통과
      }),
    );
    // 자동: 서울→부산 ≈ 325km > 30km → false
    // 사용자 명시 true → 최종 met=true (사용자 명시 우선)
    // autoMet=false는 UI 안내용으로 노출
    expect(r.decedentMet).toBe(true);
    expect(r.decedentAutoMet).toBe(false);
    expect(r.decedentMinDistanceKm!).toBeGreaterThan(300);
  });

  it("FR-8 (옵션 A): 자동 true + 사용자 명시 false → met=false (사용자 명시 우선) / autoMet=true", () => {
    // 옵션 A 정책 — 자동이 사용자 명시를 덮어쓰지 않음. UI는 차이를 안내
    const within = { lat: SEOUL.lat + 0.1, lng: SEOUL.lng };
    const items = [farmlandItem("a1", within)];
    const r = checkFarmingResidenceCompliance(
      items,
      baseFarming({
        decedentResidenceLatLng: SEOUL,
        decedentResidenceMet: false,
      }),
    );
    expect(r.decedentMet).toBe(false); // 사용자 명시 우선
    expect(r.decedentAutoMet).toBe(true);
  });

  it("좌표 미입력 — 사용자 boolean 그대로 (자동 검증 무동작)", () => {
    const items = [farmlandItem("a1", SEOUL)];
    const r = checkFarmingResidenceCompliance(
      items,
      baseFarming({
        // decedentResidenceLatLng 미입력
        decedentResidenceMet: true,
      }),
    );
    expect(r.decedentMinDistanceKm).toBeNull();
    expect(r.decedentAutoMet).toBeNull();
    expect(r.decedentMet).toBe(true); // 사용자 명시 그대로
  });

  it("farming undefined → 모든 false / null", () => {
    const items = [farmlandItem("a1", SEOUL)];
    const r = checkFarmingResidenceCompliance(items, undefined);
    expect(r.decedentMet).toBe(false);
    expect(r.heirMet).toBe(false);
    expect(r.decedentAutoMet).toBeNull();
    expect(r.heirAutoMet).toBeNull();
    expect(r.decedentMinDistanceKm).toBeNull();
    expect(r.heirMinDistanceKm).toBeNull();
  });
});
