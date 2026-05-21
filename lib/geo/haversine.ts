/**
 * WGS84 좌표 두 점 사이 직선거리 (km) — Haversine 공식.
 *
 * 사용처:
 *   - 영농상속공제 §16②1호나 거주지 30km 자동 검증 (PR-E F-10)
 *   - 추후 부동산 위치 기반 다른 세법 요건 검증 확장 가능
 *
 * 정밀도: 지구를 완전 구형(R=6371km)으로 가정. 한국 내 30km 판정에 충분.
 */

/** WGS84 좌표 */
export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Haversine 직선거리 (km).
 * 두 좌표가 동일하면 0. 좌표 범위 검증은 호출자 책임.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * 30km 이내 판정 (§16②1호나 거주지 직선거리 요건).
 * 경계 30.0km는 포함 (≤).
 */
export function isWithin30Km(a: LatLng, b: LatLng): boolean {
  return haversineKm(a, b) <= 30;
}
