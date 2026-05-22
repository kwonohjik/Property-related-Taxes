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

// ============================================================
// FR-9~12: v3 Phase 0 — sigunguCode 동일/연접 OR 분기 (2026-05-22)
// ============================================================

describe("[FR-v3] 시·군·구 동일/연접 OR 자동 판정", () => {
  const farmlandSeoul: EstateItem = {
    id: "land-seoul",
    category: "real_estate_land",
    name: "강남 농지",
    farmingCategory: "farmland",
    estateLatLng: SEOUL,
    estateSigunguCode: "1168000000", // 강남구
  };

  const baseFarming = (
    extra: Partial<FarmingInheritanceInput>,
  ): FarmingInheritanceInput => ({
    type: "personal",
    decedentEightYearFarming: true,
    decedentResidenceMet: false,
    heirIsAdult: true,
    heirTwoYearFarming: true,
    heirResidenceMet: false,
    ...extra,
  });

  it("FR-9: 거주지 코드 == 자산 코드 → same_district + autoMet=true (좌표 300km 떨어져도)", () => {
    const r = checkFarmingResidenceCompliance(
      [farmlandSeoul],
      baseFarming({
        decedentResidenceLatLng: BUSAN,
        decedentResidenceSigunguCode: "1168000000",
      }),
    );
    expect(r.decedentMatchKind).toBe("same_district");
    expect(r.decedentAutoMet).toBe(true);
  });

  it("FR-10: 연접 매트릭스 매칭 → adjacent_district", () => {
    const r = checkFarmingResidenceCompliance(
      [farmlandSeoul],
      baseFarming({
        decedentResidenceLatLng: BUSAN,
        decedentResidenceSigunguCode: "1165000000",
      }),
      {
        adjacentSigunguCodes: (code) =>
          code === "1168000000" ? ["1165000000", "1171000000"] : [],
      },
    );
    expect(r.decedentMatchKind).toBe("adjacent_district");
    expect(r.decedentAutoMet).toBe(true);
  });

  it("FR-11: 코드 불일치·매트릭스 미주입 → 거리 30km fallback (within_30km)", () => {
    const r = checkFarmingResidenceCompliance(
      [farmlandSeoul],
      baseFarming({
        decedentResidenceLatLng: { lat: 37.6, lng: 127.0 },
        decedentResidenceSigunguCode: "1111000000",
      }),
    );
    expect(r.decedentMatchKind).toBe("within_30km");
    expect(r.decedentAutoMet).toBe(true);
  });

  it("FR-12: 코드 불일치 + 거리 초과 → fail", () => {
    const r = checkFarmingResidenceCompliance(
      [farmlandSeoul],
      baseFarming({
        decedentResidenceLatLng: BUSAN,
        decedentResidenceSigunguCode: "2611000000",
      }),
    );
    expect(r.decedentMatchKind).toBe("fail");
    expect(r.decedentAutoMet).toBe(false);
  });
});

// ============================================================
// FR-13~21: v4 Phase 0-Fix (C1·C13, 2026-05-22)
//   - LAND_BASED 5종 → 3종 정정 (agricultural_building·salt_field 제외)
//   - 산림지 단서 forest_manageable_area
//   - heir 분리, 다자산 best, 코드만/좌표만 fallback
// ============================================================

describe("[FR-v4] §16②1호나 정정 — 자산 카테고리·산림지 단서·heir 분리", () => {
  const baseFarming = (
    extra: Partial<FarmingInheritanceInput>,
  ): FarmingInheritanceInput => ({
    type: "personal",
    decedentEightYearFarming: true,
    decedentResidenceMet: false,
    heirIsAdult: true,
    heirTwoYearFarming: true,
    heirResidenceMet: false,
    ...extra,
  });

  it("FR-13: agricultural_building은 거주지 OR 대상 아님 → matchKind null (좌표·코드 입력해도 무시)", () => {
    const item: EstateItem = {
      id: "barn",
      category: "real_estate_building",
      name: "축사",
      farmingCategory: "agricultural_building",
      estateLatLng: SEOUL,
      estateSigunguCode: "1168000000",
    };
    const r = checkFarmingResidenceCompliance(
      [item],
      baseFarming({
        decedentResidenceLatLng: SEOUL,
        decedentResidenceSigunguCode: "1168000000",
      }),
    );
    expect(r.decedentMatchKind).toBeNull();
    expect(r.decedentAutoMet).toBeNull();
  });

  it("FR-14: salt_field도 거주지 OR 대상 아님 → matchKind null", () => {
    const item: EstateItem = {
      id: "salt",
      category: "real_estate_land",
      name: "염전",
      farmingCategory: "salt_field",
      estateLatLng: SEOUL,
      estateSigunguCode: "1168000000",
    };
    const r = checkFarmingResidenceCompliance(
      [item],
      baseFarming({ decedentResidenceLatLng: SEOUL, decedentResidenceSigunguCode: "1168000000" }),
    );
    expect(r.decedentMatchKind).toBeNull();
  });

  it("FR-15: forest_land + decedentForestManageableArea=true 단독 → forest_manageable_area", () => {
    const forest: EstateItem = {
      id: "forest",
      category: "real_estate_land",
      name: "보전산지",
      farmingCategory: "forest_land",
      estateLatLng: SEOUL,
      estateSigunguCode: "4111000000", // 수원시
    };
    const r = checkFarmingResidenceCompliance(
      [forest],
      baseFarming({
        decedentResidenceLatLng: BUSAN, // 거리 초과
        decedentResidenceSigunguCode: "2611000000", // 코드 불일치
        decedentForestManageableArea: true,
      }),
    );
    expect(r.decedentMatchKind).toBe("forest_manageable_area");
    expect(r.decedentAutoMet).toBe(true);
  });

  it("FR-16: forest_land + manageable=false + 코드/거리 fail → fail (단서 미적용)", () => {
    const forest: EstateItem = {
      id: "forest",
      category: "real_estate_land",
      name: "산림지",
      farmingCategory: "forest_land",
      estateLatLng: SEOUL,
      estateSigunguCode: "4111000000",
    };
    const r = checkFarmingResidenceCompliance(
      [forest],
      baseFarming({
        decedentResidenceLatLng: BUSAN,
        decedentResidenceSigunguCode: "2611000000",
      }),
    );
    expect(r.decedentMatchKind).toBe("fail");
  });

  it("FR-17: farmland(농지)는 단서 미적용 — manageable=true여도 코드/거리 fail이면 fail", () => {
    const farmland: EstateItem = {
      id: "land",
      category: "real_estate_land",
      name: "농지",
      farmingCategory: "farmland",
      estateLatLng: SEOUL,
      estateSigunguCode: "4111000000",
    };
    const r = checkFarmingResidenceCompliance(
      [farmland],
      baseFarming({
        decedentResidenceLatLng: BUSAN,
        decedentResidenceSigunguCode: "2611000000",
        decedentForestManageableArea: true, // 단서 농지에 무효
      }),
    );
    expect(r.decedentMatchKind).toBe("fail");
  });

  it("FR-18: heir 분리 평가 — decedent fail / heir same_district", () => {
    const land: EstateItem = {
      id: "land",
      category: "real_estate_land",
      name: "농지",
      farmingCategory: "farmland",
      estateLatLng: SEOUL,
      estateSigunguCode: "1168000000",
    };
    const r = checkFarmingResidenceCompliance(
      [land],
      baseFarming({
        decedentResidenceLatLng: BUSAN,
        decedentResidenceSigunguCode: "2611000000",
        heirResidenceLatLng: SEOUL,
        heirResidenceSigunguCode: "1168000000",
      }),
    );
    expect(r.decedentMatchKind).toBe("fail");
    expect(r.heirMatchKind).toBe("same_district");
  });

  it("FR-19: 다자산 best 선정 — 자산 A(fail) + 자산 B(same) → best=same_district", () => {
    const items: EstateItem[] = [
      {
        id: "a",
        category: "real_estate_land",
        name: "원거리 농지",
        farmingCategory: "farmland",
        estateLatLng: BUSAN,
        estateSigunguCode: "2611000000",
      },
      {
        id: "b",
        category: "real_estate_land",
        name: "근거리 농지",
        farmingCategory: "farmland",
        estateLatLng: SEOUL,
        estateSigunguCode: "1168000000",
      },
    ];
    const r = checkFarmingResidenceCompliance(
      items,
      baseFarming({
        decedentResidenceLatLng: SEOUL,
        decedentResidenceSigunguCode: "1168000000",
      }),
    );
    expect(r.decedentMatchKind).toBe("same_district");
  });

  it("FR-20: 코드만 입력(좌표 없음) → same_district (거리 fallback 무시)", () => {
    const land: EstateItem = {
      id: "land",
      category: "real_estate_land",
      name: "농지",
      farmingCategory: "farmland",
      estateSigunguCode: "1168000000",
      // estateLatLng 없음
    };
    const r = checkFarmingResidenceCompliance(
      [land],
      baseFarming({
        decedentResidenceSigunguCode: "1168000000",
        // decedentResidenceLatLng 없음
      }),
    );
    expect(r.decedentMatchKind).toBe("same_district");
    expect(r.decedentMinDistanceKm).toBeNull();
  });

  it("FR-21: 어선 fishing_vessel — fishingAnchorSigunguCode/LatLng 기준", () => {
    const vessel: EstateItem = {
      id: "boat",
      category: "real_estate_building",
      name: "어선",
      farmingCategory: "fishing_vessel",
      fishingAnchorLatLng: BUSAN,
      fishingAnchorSigunguCode: "2611000000",
    };
    const r = checkFarmingResidenceCompliance(
      [vessel],
      baseFarming({
        decedentResidenceLatLng: BUSAN,
        decedentResidenceSigunguCode: "2611000000",
      }),
    );
    expect(r.decedentMatchKind).toBe("same_district");
    expect(r.decedentAutoMet).toBe(true);
  });
});
