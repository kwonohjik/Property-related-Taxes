/**
 * Pre-Do anchor — NBL 재촌 30km 판정 설계 전제 검증
 *
 * A1: haversineKm 기존 재사용 동작 (신규 구현 금지 근거)
 * A3: 시군구 자릿수 정규화 필요성 — geocode 10자리 vs NBL 5자리
 *
 * 계획: docs/00-pm/transfer-nbl-residence-judgment-ui.plan.md §5
 */
import { describe, it, expect } from "vitest";
import { haversineKm } from "@/lib/geo/haversine";
import { lookupSigungu } from "@/lib/korean-law/sigungu-codes";

describe("[PREDO] NBL 재촌 30km — 설계 전제", () => {
  // A1 — haversineKm 재사용
  it("A1: haversineKm(서울시청↔인천시청) ≈ 27km ≤ 30, 먼 지점 > 30", () => {
    const seoul = { lat: 37.5665, lng: 126.978 }; // 서울시청
    const incheon = { lat: 37.4563, lng: 126.7052 }; // 인천시청
    const d = haversineKm(seoul, incheon);
    expect(d).toBeGreaterThan(20);
    expect(d).toBeLessThanOrEqual(30); // 재촌 인정 경계
    // 부산(먼 지점) > 30km
    const busan = { lat: 35.1796, lng: 129.0756 };
    expect(haversineKm(seoul, busan)).toBeGreaterThan(30);
  });

  // A3 — 자릿수 정규화 (Critical 전제 재현)
  it("A3: geocode 10자리는 lookupSigungu 실패, slice(0,5) 정규화 후 성공", () => {
    const geocode10 = "11110" + "00000"; // acquisitionSigunguCode = 10자리
    expect(lookupSigungu(geocode10)).toBeUndefined(); // ← 정규화 안 하면 undefined(판정 파손)
    const normalized5 = geocode10.slice(0, 5);
    const hit = lookupSigungu(normalized5);
    expect(hit).toBeDefined();
    expect(hit!.name).toBe("종로구");
    expect(hit!.adjacentCodes.length).toBeGreaterThan(0); // 연접 조회도 정상
  });
});
