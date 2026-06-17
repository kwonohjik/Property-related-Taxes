/**
 * 조정대상지역 지정·해제 이력 — 정적 단일 소스 (Layer 2 data)
 *
 * 주택법 §63조의2 기반 국토교통부 고시(주거정책심의위원회 심의)를 코드화한다.
 * 시군구 법정동코드(앞 5자리) 기준 지정 + 하위(읍·면·동/택지지구) 예외를 표현.
 *
 * 단일 진실(single source) 정책:
 *   - 엔진(multi-house-surcharge)·클라이언트 판별이 이 모듈의 데이터·헬퍼를 **공유**한다.
 *     별도 매칭/판정 함수 재정의 금지 (dual-truth 회피).
 *   - 과거 고시는 불변(역사적 상수) → 정적 배치. 신규 지정·해제만 append.
 *
 * 지정 단위 3종 (주택법 §63조의2 — 시·군·구 또는 읍·면·동 단위):
 *   1. 시군구 전역      — excludedSubCodes/includedSubCodes 모두 없음
 *   2. 시군구 − 읍면제외 — excludedSubCodes (그 접두 제외하고 지정)
 *   3. 특정 지구만 지정   — includedSubCodes (택지지구 등, 그 접두만 지정)
 *   ※ 서울 전역 지정은 code "11"(시도 2자리)로 표현. 그 외 시도 전역은 없음.
 *
 * 판정 시점 구분(엔진 사용처):
 *   - 다주택 중과세: 양도일 기준 / 1세대1주택 비과세 거주요건: 취득일 기준
 *
 * ⚠️ 데이터 미입력 상태:
 *   REGULATED_REGIONS는 사용자 확정 데이터(수도권 우선) 수령 후 채운다
 *   (계획서: docs/02-design/features/regulated-area-bjd-history.plan.md §5).
 *   현재는 빈 배열 — 판정/변환 로직만 완성하고 fixture로 검증한다.
 */

import type {
  RegulatedAreaDesignation,
  RegulatedAreaHistory,
  RegulatedAreaInfo,
} from "../types/multi-house-surcharge.types";

// ============================================================
// 타입
// ============================================================

/** 시군구 지정에서 제외된 하위 읍·면·동 (제외 목록) */
export interface ExcludedSubArea {
  /** 제외 지역의 법정동코드 접두. 양도주택 코드(10자리)가 이 접두로 시작하면 제외(미지정). */
  codePrefix: string;
  /** 표시용 명칭 (예: "통진읍") */
  name: string;
  /** 제외 적용 시작일 (시점별로 범위가 달랐던 경우). 생략 시 전 기간 */
  appliesFrom?: string;
  /** 제외 적용 종료일. 생략 시 현재까지 */
  appliesTo?: string;
}

/** 시군구 지정 중 이 하위 동·지구만 조정대상 (택지개발지구 등). excludedSubCodes와 배타. */
export interface IncludedSubArea {
  /** 포함 지역의 법정동코드 접두. 양도주택 코드(10자리)가 이 접두로 시작할 때만 지정. */
  codePrefix: string;
  /** 표시용 명칭 (예: "동탄2택지 반송동") */
  name: string;
  /** 포함 적용 시작일 (시점별로 포함 지구가 달랐던 경우). 생략 시 전 기간 */
  appliesFrom?: string;
  /** 포함 적용 종료일. 생략 시 현재까지 */
  appliesTo?: string;
}

/**
 * 시군구 단위 조정대상지역 + 하위 예외.
 * 엔진의 RegulatedAreaInfo(code·name·designations)에 sub-area 규칙을 더한 상위집합.
 * code = 시군구 법정동코드 5자리 (예외: 시도 전역 지정인 서울은 시도 2자리 "11").
 */
export interface RegulatedRegion extends RegulatedAreaInfo {
  /** 시군구 지정에서 빠지는 하위 읍·면·동 (제외 목록) */
  excludedSubCodes?: ExcludedSubArea[];
  /** 이 하위 동·지구만 지정 (포함 목록, 택지지구). excludedSubCodes와 배타. 둘 다 없으면 전역 */
  includedSubCodes?: IncludedSubArea[];
}

/** 판정 결과 (lib/regulated-area.ts RegulatedAreaResult와 동일 형태 — 통합 시 공유) */
export interface RegulatedAreaJudgment {
  isRegulated: boolean;
  confidence: "high" | "medium" | "low";
  basis: string;
}

// ============================================================
// 데이터 (사용자 확정분으로 채움 — 현재 placeholder)
// ============================================================

/**
 * 조정대상지역 지정·해제 이력 — 수도권(서울·경기·인천).
 * 출처: 양도소득세 2026 교재 변천표 + 주석 + 국토부 대책 교차검증, 법정동코드는 행안부 표준.
 *
 * ⚠️ 잔여 근사:
 *   - 광교택지/택지지구 included는 동(洞) 단위 근사 — 동 내 비택지 부분 존재 가능.
 *   - 지방(부산·대전·대구·세종 등)은 본 단계(수도권) 범위 밖.
 */
export const REGULATED_REGIONS: RegulatedRegion[] = [
  // ══════ 서울특별시 (전역 11 + 강남3구·용산 개별) ══════
  { code: "11", name: "서울특별시", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-04" }, { designatedDate: "2025-10-16", releasedDate: null }] },
  { code: "11680", name: "서울특별시 강남구", designations: [{ designatedDate: "2017-08-03", releasedDate: null }] },
  { code: "11650", name: "서울특별시 서초구", designations: [{ designatedDate: "2017-08-03", releasedDate: null }] },
  { code: "11710", name: "서울특별시 송파구", designations: [{ designatedDate: "2017-08-03", releasedDate: null }] },
  { code: "11170", name: "서울특별시 용산구", designations: [{ designatedDate: "2017-08-03", releasedDate: null }] },

  // ══════ 경기도 — 2025.10.16 재지정 그룹 (2023.1.5 해제 후 재지정) ══════
  { code: "41290", name: "경기도 과천시", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-04" }, { designatedDate: "2025-10-16", releasedDate: null }] },
  { code: "41210", name: "경기도 광명시", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-04" }, { designatedDate: "2025-10-16", releasedDate: null }] },
  { code: "41450", name: "경기도 하남시", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-04" }, { designatedDate: "2025-10-16", releasedDate: null }] },
  { code: "41131", name: "경기도 성남시 수정구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-04" }, { designatedDate: "2025-10-16", releasedDate: null }] },
  { code: "41135", name: "경기도 성남시 분당구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-04" }, { designatedDate: "2025-10-16", releasedDate: null }] },
  { code: "41133", name: "경기도 성남시 중원구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2022-11-13" }, { designatedDate: "2025-10-16", releasedDate: null }] },

  // ── 수원시 (광교택지 → 구별 전역 전환 → 2022.11.14 해제 → 2025 영통·장안·팔달 재지정) ──
  { code: "41117", name: "경기도 수원시 영통구",
    designations: [{ designatedDate: "2018-08-28", releasedDate: "2022-11-13" }, { designatedDate: "2025-10-16", releasedDate: null }],
    includedSubCodes: [
      { codePrefix: "41117101", name: "광교택지 매탄동", appliesFrom: "2018-08-28", appliesTo: "2020-02-20" },
      { codePrefix: "41117102", name: "광교택지 원천동", appliesFrom: "2018-08-28", appliesTo: "2020-02-20" },
      { codePrefix: "41117103", name: "광교택지 이의동", appliesFrom: "2018-08-28", appliesTo: "2020-02-20" },
      { codePrefix: "41117104", name: "광교택지 하동", appliesFrom: "2018-08-28", appliesTo: "2020-02-20" },
    ] },
  { code: "41115", name: "경기도 수원시 팔달구",
    designations: [{ designatedDate: "2018-08-28", releasedDate: "2022-11-13" }, { designatedDate: "2025-10-16", releasedDate: null }],
    includedSubCodes: [{ codePrefix: "41115140", name: "광교택지 우만동", appliesFrom: "2018-08-28", appliesTo: "2018-12-30" }] },
  { code: "41111", name: "경기도 수원시 장안구",
    designations: [{ designatedDate: "2018-08-28", releasedDate: "2022-11-13" }, { designatedDate: "2025-10-16", releasedDate: null }],
    includedSubCodes: [{ codePrefix: "41111137", name: "광교택지 연무동", appliesFrom: "2018-08-28", appliesTo: "2020-02-20" }] },
  { code: "41113", name: "경기도 수원시 권선구", designations: [{ designatedDate: "2020-02-21", releasedDate: "2022-11-13" }] },

  // ── 안양·용인·의왕 ──
  { code: "41173", name: "경기도 안양시 동안구", designations: [{ designatedDate: "2018-08-28", releasedDate: "2022-11-13" }, { designatedDate: "2025-10-16", releasedDate: null }] },
  { code: "41171", name: "경기도 안양시 만안구", designations: [{ designatedDate: "2020-02-21", releasedDate: "2022-11-13" }] },
  { code: "41465", name: "경기도 용인시 수지구",
    designations: [{ designatedDate: "2018-08-28", releasedDate: "2022-11-13" }, { designatedDate: "2025-10-16", releasedDate: null }],
    includedSubCodes: [{ codePrefix: "41465107", name: "광교택지 상현동", appliesFrom: "2018-08-28", appliesTo: "2018-12-30" }] },
  { code: "41463", name: "경기도 용인시 기흥구",
    designations: [{ designatedDate: "2018-08-28", releasedDate: "2022-11-13" }],
    includedSubCodes: [{ codePrefix: "41463111", name: "광교택지 영덕동", appliesFrom: "2018-08-28", appliesTo: "2018-12-30" }] },
  { code: "41461", name: "경기도 용인시 처인구",
    designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-11-13" }],
    excludedSubCodes: [
      { codePrefix: "41461250", name: "포곡읍" }, { codePrefix: "41461310", name: "모현면" },
      { codePrefix: "41461350", name: "백암면" }, { codePrefix: "41461360", name: "양지면" },
      // 원삼면은 6개 리만 제외 (나머지 원삼면 리는 지정)
      { codePrefix: "4146134022", name: "원삼면 사암리" },
      { codePrefix: "4146134023", name: "원삼면 좌항리" },
      { codePrefix: "4146134024", name: "원삼면 맹리" },
      { codePrefix: "4146134025", name: "원삼면 미평리" },
      { codePrefix: "4146134026", name: "원삼면 두창리" },
      { codePrefix: "4146134032", name: "원삼면 가재월리" },
    ] },
  { code: "41430", name: "경기도 의왕시", designations: [{ designatedDate: "2020-02-21", releasedDate: "2022-11-13" }, { designatedDate: "2025-10-16", releasedDate: null }] },

  // ── 구리 ──
  { code: "41310", name: "경기도 구리시", designations: [{ designatedDate: "2018-08-28", releasedDate: "2022-11-13" }] },

  // ── 고양시 (2017.8.3 전역 → 2019.11.8~2020.6.18 택지지구만 → 2020.6.19 전역 → 2022.11.14 해제) ──
  { code: "41281", name: "경기도 고양시 덕양구",
    designations: [{ designatedDate: "2017-08-03", releasedDate: "2022-11-13" }],
    includedSubCodes: [
      { codePrefix: "41281111", name: "삼송동", appliesFrom: "2019-11-08", appliesTo: "2020-06-18" },
      { codePrefix: "41281104", name: "원흥동", appliesFrom: "2019-11-08", appliesTo: "2020-06-18" },
      { codePrefix: "41281109", name: "지축동", appliesFrom: "2019-11-08", appliesTo: "2020-06-18" },
      { codePrefix: "41281132", name: "향동동", appliesFrom: "2019-11-08", appliesTo: "2020-06-18" },
      { codePrefix: "41281131", name: "덕은동", appliesFrom: "2019-11-08", appliesTo: "2020-06-18" },
      { codePrefix: "41281112", name: "동산동", appliesFrom: "2019-11-08", appliesTo: "2020-06-18" },
    ] },
  { code: "41285", name: "경기도 고양시 일산동구",
    designations: [{ designatedDate: "2017-08-03", releasedDate: "2022-11-13" }],
    includedSubCodes: [{ codePrefix: "41285104", name: "장항동(한류월드)", appliesFrom: "2019-11-08", appliesTo: "2020-06-18" }] },
  { code: "41287", name: "경기도 고양시 일산서구",
    designations: [{ designatedDate: "2017-08-03", releasedDate: "2022-11-13" }],
    includedSubCodes: [{ codePrefix: "41287104", name: "대화동(킨텍스1단계)", appliesFrom: "2019-11-08", appliesTo: "2020-06-18" }] },

  // ── 남양주 (2017.8.3 전역 → 2019.11.8~2020.6.18 다산·별내만 → 2020.6.19 전역[화도·수동·조안 제외] → 2022.11.14 해제) ──
  { code: "41360", name: "경기도 남양주시",
    designations: [{ designatedDate: "2017-08-03", releasedDate: "2022-11-13" }],
    includedSubCodes: [
      { codePrefix: "41360109", name: "지금동(다산)", appliesFrom: "2019-11-08", appliesTo: "2020-06-18" },
      { codePrefix: "41360110", name: "도농동(다산)", appliesFrom: "2019-11-08", appliesTo: "2020-06-18" },
      { codePrefix: "41360111", name: "별내동", appliesFrom: "2019-11-08", appliesTo: "2020-06-18" },
    ],
    excludedSubCodes: [
      { codePrefix: "41360256", name: "화도읍", appliesFrom: "2020-06-19" },
      { codePrefix: "41360340", name: "수동면", appliesFrom: "2020-06-19" },
      { codePrefix: "41360360", name: "조안면", appliesFrom: "2020-06-19" },
    ] },

  // ── 2020.6.19 신규 (전역) — 2022.11.14 해제 ──
  { code: "41370", name: "경기도 오산시", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-11-13" }] },
  { code: "41390", name: "경기도 시흥시", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-11-13" }] },
  { code: "41410", name: "경기도 군포시", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-11-13" }] },
  { code: "41190", name: "경기도 부천시", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-11-13" }] },
  { code: "41271", name: "경기도 안산시 상록구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-11-13" }] },
  { code: "41273", name: "경기도 안산시 단원구",
    designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-11-13" }],
    excludedSubCodes: [
      { codePrefix: "41273110", name: "대부동동" }, { codePrefix: "41273111", name: "대부북동" },
      { codePrefix: "41273112", name: "대부남동" }, { codePrefix: "41273113", name: "선감동" },
      { codePrefix: "41273114", name: "풍도동" },
    ] },
  { code: "41150", name: "경기도 의정부시", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-11-13" }] },

  // ── 화성 (동탄2택지만 줄곧 — 2017.8.3~2022.11.14) ──
  { code: "41590", name: "경기도 화성시",
    designations: [{ designatedDate: "2017-08-03", releasedDate: "2022-11-13" }],
    includedSubCodes: [
      { codePrefix: "41590127", name: "동탄2 반송동" },
      { codePrefix: "41590128", name: "동탄2 석우동" },
      { codePrefix: "41590420", name: "동탄2 동탄면" },
    ] },

  // ── 김포 (2020.11.20~2022.11.14, 통진·대곶·월곶·하성면 제외) ──
  { code: "41570", name: "경기도 김포시",
    designations: [{ designatedDate: "2020-11-20", releasedDate: "2022-11-13" }],
    excludedSubCodes: [
      { codePrefix: "41570250", name: "통진읍" }, { codePrefix: "41570340", name: "대곶면" },
      { codePrefix: "41570350", name: "월곶면" }, { codePrefix: "41570360", name: "하성면" },
    ] },

  // ── 광주 (2020.6.19~2022.11.14, 읍면 제외) ──
  { code: "41610", name: "경기도 광주시",
    designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-11-13" }],
    excludedSubCodes: [
      { codePrefix: "41610253", name: "초월읍" }, { codePrefix: "41610259", name: "곤지암읍" },
      { codePrefix: "41610330", name: "도척면" }, { codePrefix: "41610340", name: "퇴촌면" },
      { codePrefix: "41610350", name: "남종면" }, { codePrefix: "41610370", name: "남한산성면" },
    ] },

  // ── 2022.9.26 해제 그룹 (평택·양주·안성·동두천·파주) ──
  { code: "41220", name: "경기도 평택시", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-25" }] },
  { code: "41630", name: "경기도 양주시",
    designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-25" }],
    excludedSubCodes: [
      { codePrefix: "41630250", name: "백석읍", appliesFrom: "2020-12-18" },
      { codePrefix: "41630310", name: "은현면", appliesFrom: "2020-12-18" },
      { codePrefix: "41630320", name: "남면", appliesFrom: "2020-12-18" },
      { codePrefix: "41630330", name: "광적면", appliesFrom: "2020-12-18" },
    ] },
  { code: "41550", name: "경기도 안성시",
    designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-25" }],
    excludedSubCodes: [
      // 2020.6.19~12.17: 일죽면(전체) + 죽산면 7리 + 삼죽면 5리
      { codePrefix: "41550390", name: "일죽면", appliesFrom: "2020-06-19" },
      { codePrefix: "4155040021", name: "죽산면 죽산리", appliesFrom: "2020-06-19", appliesTo: "2020-12-17" },
      { codePrefix: "4155040022", name: "죽산면 매산리", appliesFrom: "2020-06-19", appliesTo: "2020-12-17" },
      { codePrefix: "4155040023", name: "죽산면 장원리", appliesFrom: "2020-06-19", appliesTo: "2020-12-17" },
      { codePrefix: "4155040024", name: "죽산면 두현리", appliesFrom: "2020-06-19", appliesTo: "2020-12-17" },
      { codePrefix: "4155040025", name: "죽산면 장능리", appliesFrom: "2020-06-19", appliesTo: "2020-12-17" },
      { codePrefix: "4155040026", name: "죽산면 장계리", appliesFrom: "2020-06-19", appliesTo: "2020-12-17" },
      { codePrefix: "4155040027", name: "죽산면 용설리", appliesFrom: "2020-06-19", appliesTo: "2020-12-17" },
      { codePrefix: "4155041021", name: "삼죽면 내장리", appliesFrom: "2020-06-19", appliesTo: "2020-12-17" },
      { codePrefix: "4155041022", name: "삼죽면 율곡리", appliesFrom: "2020-06-19", appliesTo: "2020-12-17" },
      { codePrefix: "4155041023", name: "삼죽면 용월리", appliesFrom: "2020-06-19", appliesTo: "2020-12-17" },
      { codePrefix: "4155041024", name: "삼죽면 덕산리", appliesFrom: "2020-06-19", appliesTo: "2020-12-17" },
      { codePrefix: "4155041025", name: "삼죽면 배태리", appliesFrom: "2020-06-19", appliesTo: "2020-12-17" },
      // 2020.12.18~: 죽산·삼죽면 전체 + 미양·대덕·양성·고삼·보개·서운·금광면 추가 제외
      { codePrefix: "41550400", name: "죽산면", appliesFrom: "2020-12-18" },
      { codePrefix: "41550410", name: "삼죽면", appliesFrom: "2020-12-18" },
      { codePrefix: "41550340", name: "미양면", appliesFrom: "2020-12-18" },
      { codePrefix: "41550350", name: "대덕면", appliesFrom: "2020-12-18" },
      { codePrefix: "41550360", name: "양성면", appliesFrom: "2020-12-18" },
      { codePrefix: "41550420", name: "고삼면", appliesFrom: "2020-12-18" },
      { codePrefix: "41550310", name: "보개면", appliesFrom: "2020-12-18" },
      { codePrefix: "41550330", name: "서운면", appliesFrom: "2020-12-18" },
      { codePrefix: "41550320", name: "금광면", appliesFrom: "2020-12-18" },
    ] },
  { code: "41250", name: "경기도 동두천시",
    designations: [{ designatedDate: "2021-08-30", releasedDate: "2022-09-25" }],
    excludedSubCodes: [
      { codePrefix: "41250104", name: "광암동" }, { codePrefix: "41250105", name: "걸산동" },
      { codePrefix: "41250108", name: "안흥동" }, { codePrefix: "41250109", name: "상봉암동" },
      { codePrefix: "41250110", name: "하봉암동" }, { codePrefix: "41250111", name: "탑동동" },
    ] },
  { code: "41480", name: "경기도 파주시",
    // 읍·면은 2020.12.18 지정 시부터 제외(동 지역만 지정), 2022.9.26 전체 해제.
    designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-09-25" }],
    excludedSubCodes: [
      { codePrefix: "41480250", name: "문산읍" }, { codePrefix: "41480253", name: "파주읍" },
      { codePrefix: "41480256", name: "법원읍" }, { codePrefix: "41480262", name: "조리읍" },
      { codePrefix: "41480310", name: "월롱면" }, { codePrefix: "41480320", name: "탄현면" },
      { codePrefix: "41480350", name: "광탄면" }, { codePrefix: "41480360", name: "파평면" },
      { codePrefix: "41480370", name: "적성면" }, { codePrefix: "41480380", name: "군내면" },
      { codePrefix: "41480390", name: "장단면" }, { codePrefix: "41480400", name: "진동면" },
      { codePrefix: "41480410", name: "진서면" },
    ] },

  // ══════ 인천광역시 (2020.6.19~2022.11.14, 강화·옹진 상시 미지정) ══════
  { code: "28110", name: "인천광역시 중구",
    designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-11-13" }],
    excludedSubCodes: [
      { codePrefix: "28110149", name: "을왕동", appliesFrom: "2020-12-18" },
      { codePrefix: "28110150", name: "남북동", appliesFrom: "2020-12-18" },
      { codePrefix: "28110151", name: "덕교동", appliesFrom: "2020-12-18" },
      { codePrefix: "28110152", name: "무의동", appliesFrom: "2020-12-18" },
    ] },
  { code: "28140", name: "인천광역시 동구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-11-13" }] },
  { code: "28177", name: "인천광역시 미추홀구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-11-13" }] },
  { code: "28185", name: "인천광역시 연수구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-11-13" }] },
  { code: "28200", name: "인천광역시 남동구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-11-13" }] },
  { code: "28237", name: "인천광역시 부평구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-11-13" }] },
  { code: "28245", name: "인천광역시 계양구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-11-13" }] },
  { code: "28260", name: "인천광역시 서구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-11-13" }] },
];

// ============================================================
// 판정 헬퍼 (순수 — 데이터 주입형)
// ============================================================

/** 특정 날짜에 활성(지정 유지 중)인 designation 반환. 없으면 null. */
function findActiveDesignation(
  designations: RegulatedAreaDesignation[],
  date: string,
): RegulatedAreaDesignation | null {
  for (const d of designations) {
    const active = d.designatedDate <= date && (d.releasedDate === null || date <= d.releasedDate);
    if (active) return d;
  }
  return null;
}

/** 날짜에 활성인 하위규칙(포함/제외)만 필터. */
function activeSubRules<T extends { appliesFrom?: string; appliesTo?: string }>(
  rules: T[] | undefined,
  date: string,
): T[] {
  return (rules ?? []).filter(
    (r) => (!r.appliesFrom || r.appliesFrom <= date) && (!r.appliesTo || date <= r.appliesTo),
  );
}

/**
 * 법정동코드 + 날짜 → 조정대상지역 판정 (순수, 데이터 주입).
 *
 * @param regions 조정대상지역 이력 데이터 (REGULATED_REGIONS 또는 테스트 fixture)
 * @param bjdCode 법정동코드. 10자리(시군구5+동5)면 읍면/지구 예외까지 정밀, 5자리면 시군구 단위만.
 * @param date    YYYY-MM-DD (양도일 또는 취득일)
 */
export function isRegulatedByBjdCodeIn(
  regions: RegulatedRegion[],
  bjdCode: string,
  date: string,
): RegulatedAreaJudgment {
  if (!bjdCode || !date) {
    return { isRegulated: false, confidence: "low", basis: "법정동코드 또는 날짜 누락" };
  }

  const sigunguCode = bjdCode.slice(0, 5);
  const sidoCode = bjdCode.slice(0, 2);
  // 시군구(5자리) 매칭 우선 → 없으면 시도 전역(2자리) 폴백.
  // 시도 전역 지정은 서울(코드 "11")만 해당. 전역 해제기간에도 개별 지정으로 남는 구
  // (강남3구·용산)는 시군구 엔트리가 우선 매칭되어 정확히 처리된다.
  const region =
    regions.find((r) => r.code === sigunguCode) ?? regions.find((r) => r.code === sidoCode);
  if (!region) {
    // 데이터 수록 시도 내 미매칭 = 진짜 미지정(high). 미수록 시도(데이터 범위 밖)는
    // "미지정"으로 단정하지 않고 low(직접 확인) — 주소 경로(isRegulatedByAddressIn)와 대칭.
    const sidoCovered = regions.some((r) => r.code.slice(0, 2) === sidoCode);
    return sidoCovered
      ? { isRegulated: false, confidence: "high", basis: `${date} 기준 미지정 지역(${sigunguCode})` }
      : { isRegulated: false, confidence: "low", basis: `데이터 미수록 시도(${sidoCode}) — 직접 확인 필요` };
  }

  const active = findActiveDesignation(region.designations, date);
  if (!active) {
    return {
      isRegulated: false,
      confidence: "high",
      basis: `${region.name} — ${date} 기준 미지정(지정 이력 없음 또는 해제됨)`,
    };
  }

  // 10자리 코드: 포함 지구(includedSubCodes) / 읍면 예외(excludedSubCodes) 정밀 판정
  if (bjdCode.length >= 10) {
    // (1) 포함 목록: 해당 날짜에 활성인 "지구만 지정" 규칙이 있으면 그 안에서만 지정
    const included = activeSubRules(region.includedSubCodes, date);
    if (included.length > 0) {
      const hit = included.find((inc) => bjdCode.startsWith(inc.codePrefix));
      return hit
        ? {
            isRegulated: true,
            confidence: "high",
            basis: `${active.designatedDate} 고시 — ${region.name} ${hit.name} 지정`,
          }
        : {
            isRegulated: false,
            confidence: "high",
            basis: `${active.designatedDate} 고시 — ${region.name} 지정 지구 외 지역`,
          };
    }
    // (2) 제외 목록: 읍·면 제외
    const excluded = activeSubRules(region.excludedSubCodes, date).find((ex) =>
      bjdCode.startsWith(ex.codePrefix),
    );
    if (excluded) {
      return {
        isRegulated: false,
        confidence: "high",
        basis: `${active.designatedDate} 고시 — ${region.name} 중 ${excluded.name} 제외`,
      };
    }
    return {
      isRegulated: true,
      confidence: "high",
      basis: `${active.designatedDate} 고시 — ${region.name} 지정`,
    };
  }

  // 5자리만: 동·지구 단위 하위규칙이 있는 시군구는 정밀 판정 불가 → confidence medium
  const hasSubRules =
    (region.excludedSubCodes?.length ?? 0) > 0 || (region.includedSubCodes?.length ?? 0) > 0;
  return {
    isRegulated: true,
    confidence: hasSubRules ? "medium" : "high",
    basis:
      `${active.designatedDate} 고시 — ${region.name} 지정` +
      (hasSubRules ? " (동·지구 단위 지정/제외 — 10자리 코드 확인 필요)" : ""),
  };
}

/** REGULATED_REGIONS(모듈 데이터) 기준 판정 편의 래퍼. */
export function isRegulatedByBjdCode(bjdCode: string, date: string): RegulatedAreaJudgment {
  return isRegulatedByBjdCodeIn(REGULATED_REGIONS, bjdCode, date);
}

/**
 * 데이터에 수록된 시도명 집합 — 등장하는 region.name의 첫 어절(시도명).
 * 정적 리스트 대신 REGULATED_REGIONS에서 동적 도출 → 지방 데이터 추가 시 자동 반영(드리프트 0).
 * 수록 시도 내 미매칭은 "진짜 미지정"(high), 미수록 시도는 판정 불가(low, 직접 확인 유도).
 */
function coveredSidoNamesOf(regions: RegulatedRegion[]): Set<string> {
  return new Set(regions.map((r) => r.name.split(/\s+/)[0]));
}

/**
 * 시도·시군구명 + 날짜 → 조정대상지역 판정 (주소 기반, 순수·데이터 주입).
 *
 * 법정동코드(regionCode)가 없을 때의 보조 경로. 시군구명으로 매칭하므로
 * 읍·면·동/택지지구 예외는 판정 불가 → 하위규칙이 있는 시군구는 confidence "medium"
 * (정확한 동 단위 판정은 isRegulatedByBjdCodeIn 사용).
 *
 * @param regions 조정대상지역 이력 데이터 (REGULATED_REGIONS 또는 fixture)
 * @param sido    시도 전체명 (예: "서울특별시", "경기도")
 * @param sigungu 시군구명 (예: "강남구", "성남시 수정구"). 생략 시 시도 전역 엔트리만 조회.
 * @param date    YYYY-MM-DD (양도일 또는 취득일)
 */
export function isRegulatedByAddressIn(
  regions: RegulatedRegion[],
  sido: string,
  sigungu: string,
  date: string,
): RegulatedAreaJudgment {
  if (!sido || !date) {
    return { isRegulated: false, confidence: "low", basis: "시도 또는 날짜 누락" };
  }

  const fullName = sigungu ? `${sido} ${sigungu}` : sido;
  // 1. 시군구 정확 매칭 (일반구 포함: "경기도 성남시 수정구")
  //    2. 시도 전역 폴백 (서울 전역 "11" — name이 시도명과 동일)
  const region =
    regions.find((r) => r.name === fullName) ??
    regions.find((r) => r.code.length === 2 && r.name === sido);

  if (!region) {
    const covered = coveredSidoNamesOf(regions).has(sido);
    return {
      isRegulated: false,
      confidence: covered ? "high" : "low",
      basis: covered
        ? `${fullName} — ${date} 기준 미지정`
        : `${sido}는 데이터 미수록 — 직접 확인 필요`,
    };
  }

  const active = findActiveDesignation(region.designations, date);
  if (!active) {
    return {
      isRegulated: false,
      confidence: "high",
      basis: `${region.name} — ${date} 기준 미지정(지정 이력 없음 또는 해제됨)`,
    };
  }

  // 시군구명만으로는 동·지구 단위 예외(읍면 제외/택지지구 한정)를 판정할 수 없다.
  const hasSubRules =
    (region.excludedSubCodes?.length ?? 0) > 0 || (region.includedSubCodes?.length ?? 0) > 0;
  return {
    isRegulated: true,
    confidence: hasSubRules ? "medium" : "high",
    basis:
      `${active.designatedDate} 고시 — ${region.name} 지정` +
      (hasSubRules ? " (동·지구 단위 지정/제외 — 정확한 소재지 확인 필요)" : ""),
  };
}

/** REGULATED_REGIONS(모듈 데이터) 기준 주소 판정 편의 래퍼. */
export function isRegulatedByAddress(
  sido: string,
  sigungu: string,
  date: string,
): RegulatedAreaJudgment {
  return isRegulatedByAddressIn(REGULATED_REGIONS, sido, sigungu, date);
}

// ============================================================
// 엔진 주입용 변환 (RegulatedAreaHistory)
// ============================================================

/**
 * 정적 데이터 → 엔진(multi-house-surcharge) 주입용 RegulatedAreaHistory 변환.
 * 하위규칙(included/excluded)은 엔진 스키마에 없으므로 code/name/designations만 추출.
 * (동·지구 단위 정밀 판정은 isRegulatedByBjdCode 단일 헬퍼에서 처리 — 엔진 연결 시 P3.)
 */
export function toRegulatedAreaHistoryFrom(regions: RegulatedRegion[]): RegulatedAreaHistory {
  return {
    type: "regulated_area_history",
    regions: regions.map((r) => ({
      code: r.code,
      name: r.name,
      designations: r.designations,
    })),
  };
}

/** REGULATED_REGIONS(모듈 데이터) 변환 편의 래퍼. */
export function toRegulatedAreaHistory(): RegulatedAreaHistory {
  return toRegulatedAreaHistoryFrom(REGULATED_REGIONS);
}
