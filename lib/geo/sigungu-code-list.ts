/**
 * 행정안전부 표준 시·군·구 코드 목록 (10자리 + 명칭 매핑).
 *
 * 관련 PRD/디자인:
 *   - docs/00-pm/inheritance-farming-residence-data-infra.plan.md v1.2 §1 산출물 #2
 *   - docs/02-design/features/inheritance-farming-residence-data-infra.engine.design.md v1.2 §3-1·§5-1
 *
 * **현재 상태**: Phase 1-A PR-1 골격 (시드 entry 10건+).
 * **Phase 1-A 미완**: KOEDB 법정동코드 TXT 파싱 후 전체 250+ entry 채움.
 *
 * 시드 entry 선정 기준 (디자인 §5-1 SCL-1~5):
 *   - SCL-1: 광역시 자치구 (kind="autonomous_district")
 *   - SCL-2: 일반시 (kind="city")
 *   - SCL-3: 일반시 산하 일반구 (kind="general_district") — 광역시에는 일반구 없음
 *   - SCL-4: 특별자치시 (kind="special_self_governing_city")
 *   - SCL-5: 행정시 (kind="administrative_city") — 제주 특별법
 *
 * 검증·디버깅 용도. Phase 2 매트릭스 빌드 시 KOEDB 전체 데이터 import로 대체.
 */

export interface SigunguEntry {
  /** 행안부 표준 10자리 (앞 5자리 = 시·군·구, 뒤 5자리 = 0 패딩) */
  code: string;
  /** 정식 명칭 (예: "서울특별시 강남구") */
  fullName: string;
  /** 시·도 명 (예: "서울특별시") */
  sidoName: string;
  /** 시·군·구 명 (예: "강남구") */
  sigunguName: string;
  /** 자치권·시·군·자치시·행정시 구분 */
  kind:
    | "autonomous_district"           // 광역시 자치구 (서울 25 + 5대 광역시)
    | "general_district"              // 일반시 산하 일반구 (수원·성남·고양·용인 등)
    | "city"                          // 일반 시
    | "county"                        // 군
    | "administrative_city"           // 행정시 (제주 — 특별법)
    | "special_self_governing_city";  // 특별자치시 (세종)
}

/**
 * 시드 entry — 디자인 §5-1 SCL-1~5 + 추가 5건 (PR-4 PNU 매핑 anchor 호환).
 * Phase 1-A KOEDB 파싱 완료 시 본 시드는 자동 import 또는 별도 모듈에 보존.
 */
export const SIGUNGU_LIST: SigunguEntry[] = [
  // SCL-1: 광역시 자치구
  { code: "1168000000", fullName: "서울특별시 강남구", sidoName: "서울특별시", sigunguName: "강남구", kind: "autonomous_district" },
  { code: "1165000000", fullName: "서울특별시 서초구", sidoName: "서울특별시", sigunguName: "서초구", kind: "autonomous_district" },
  { code: "1150000000", fullName: "서울특별시 강서구", sidoName: "서울특별시", sigunguName: "강서구", kind: "autonomous_district" },
  { code: "2626000000", fullName: "부산광역시 동래구", sidoName: "부산광역시", sigunguName: "동래구", kind: "autonomous_district" },

  // SCL-2: 일반 시·군
  { code: "4111000000", fullName: "경기도 수원시", sidoName: "경기도", sigunguName: "수원시", kind: "city" },
  { code: "4157000000", fullName: "경기도 김포시", sidoName: "경기도", sigunguName: "김포시", kind: "city" },
  { code: "2871000000", fullName: "인천광역시 강화군", sidoName: "인천광역시", sigunguName: "강화군", kind: "county" },

  // SCL-3: 일반시 산하 일반구 (광역시에는 없음 — L12)
  { code: "4111700000", fullName: "경기도 수원시 영통구", sidoName: "경기도", sigunguName: "수원시 영통구", kind: "general_district" },
  { code: "4146300000", fullName: "경기도 용인시 기흥구", sidoName: "경기도", sigunguName: "용인시 기흥구", kind: "general_district" },

  // SCL-4: 특별자치시
  { code: "3611000000", fullName: "세종특별자치시", sidoName: "세종특별자치시", sigunguName: "세종", kind: "special_self_governing_city" },

  // SCL-5: 행정시 (제주 특별법)
  { code: "5011000000", fullName: "제주특별자치도 제주시", sidoName: "제주특별자치도", sigunguName: "제주시", kind: "administrative_city" },
  { code: "5013000000", fullName: "제주특별자치도 서귀포시", sidoName: "제주특별자치도", sigunguName: "서귀포시", kind: "administrative_city" },
];

/**
 * 행안부 10자리 코드로 entry 검색.
 * 미등록 코드 시 undefined.
 */
export function findSigungu(code: string): SigunguEntry | undefined {
  return SIGUNGU_LIST.find((s) => s.code === code);
}

/**
 * 시드 entry 개수 (검증·디버깅용).
 * Phase 1-A 완료 시 250+ 예상.
 */
export function getSigunguListSize(): number {
  return SIGUNGU_LIST.length;
}
