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

/**
 * 시·군·구 매칭 종류 (영농상속공제 §16②1호나 OR 조건).
 *
 * 우선순위 (비사업용 토지 `lib/tax-engine/non-business-land/residence.ts` 패턴 재사용):
 *   1. same_district     — 자산 소재 시·군·구 = 거주지 시·군·구 (정확 일치)
 *   2. adjacent_district — 거주지가 자산 소재지의 연접 시·군·구 (외부 매트릭스 주입)
 *   3. within_30km       — 직선거리 30km 이내 (Haversine fallback)
 *   4. fail              — 위 모두 미충족
 *   5. null              — 평가 데이터 부족 (좌표·코드 미입력)
 *
 * v3 Phase 0 (2026-05-22) 추가. 옵션 A 정책: matchKind는 안내용. 최종 met는 사용자 boolean.
 */
export type SigunguMatchKind =
  | "same_district"
  | "adjacent_district"
  | "within_30km"
  | "forest_manageable_area"
  | "fail";

/**
 * EstateItem에 mixin되는 위치 필드 묶음 (F-10 §16②1호나 + v3 Phase 0).
 * 좌표 + 주소 + 시·군·구 코드. 모두 optional — 영농 자산이 아니면 미입력.
 */
export interface EstateLocationFields {
  /** 자산 소재지 좌표 — 농지 그룹용 (F-10 §16②1호나) */
  estateLatLng?: LatLng;
  /** 어선·어업권 자산 선적지·어장 연안 좌표 (§16②1호나 후단) */
  fishingAnchorLatLng?: LatLng;
  /** AddressSearch 영속화 (C2 휘발 버그 수정 2026-05-22) */
  estateAddress?: EstateAddress;
  /** 자산 소재지 시·군·구 코드 (행안부 10자리, v3 Phase 0 2026-05-22) — 농지 그룹 */
  estateSigunguCode?: string;
  /** 어선·어업권 선적지·어장 연안 시·군·구 코드 */
  fishingAnchorSigunguCode?: string;
}
