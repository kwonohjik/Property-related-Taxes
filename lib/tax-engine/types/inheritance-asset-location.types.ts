/**
 * 자산 위치 타입 (좌표·주소) — PR-E F-10 + C2 좌표 휘발 버그 수정
 *
 * 800줄 정책으로 inheritance-gift.types.ts에서 분리 (2026-05-22).
 */

/** WGS84 좌표 */
export interface LatLng {
  lat: number;
  lng: number;
}

/** Vworld AddressSearch 결과 영속화용 — sessionStorage 복원 가능 */
export interface EstateAddress {
  road?: string;
  jibun?: string;
  building?: string;
  detail?: string;
  pnu?: string;
}
