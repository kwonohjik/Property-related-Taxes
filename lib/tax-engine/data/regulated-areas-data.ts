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
 *
 * ⚠️ 2026-08-01 분리(800줄 정책): 판정 헬퍼는 `regulated-areas.ts`로 옮겼고 이 파일은
 *    **타입 + 데이터**만 담는다. 외부는 계속 `regulated-areas.ts`에서 import하면 된다 —
 *    그쪽이 여기 export를 전부 re-export한다.
 */

import type { RegulatedAreaInfo } from "../types/multi-house-surcharge.types";

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
  /**
   * 시 전역 지정으로 코드화했으나 실제로는 일부 구역(예: 세종 행정중심복합도시 예정지역)만 지정 —
   * 동 단위 목록이 확정되지 않아 정밀 판정 불가. 설정 시 지정 판정을 medium으로 강등하고 사유를 basis에 표기.
   */
  coarseNote?: string;
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
 * ⚠️ releasedDate 규약 (검증 완료, 절대 변경 금지):
 *   releasedDate = "효력발생일 − 1일 = 마지막 규제일"로 저장한다(해제 효력일 자체 아님).
 *   판정은 폐구간 포함 비교 `designatedDate <= date <= releasedDate`.
 *   예: 서울 해제 효력 2023-01-05 0시 → 저장값 releasedDate "2023-01-04".
 *       2023-01-04 양도 = 규제(마지막 규제일), 2023-01-05 양도 = 비규제(효력일). ✅
 *   ⛔ 포함 비교(`<=`)를 배제(`<`)로 "고치지" 말 것 — 효력일 당일을 규제로 오판하는 off-by-one 주입.
 *   근거: 국토부 고시(2023.1.5 효력) 교차검증 + 경계 anchor(regulated-area-release-boundary.test.ts).
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
    designations: [{ designatedDate: "2018-08-28", releasedDate: "2022-11-13" }, { designatedDate: "2026-07-01", releasedDate: null }],
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
  { code: "41310", name: "경기도 구리시", designations: [{ designatedDate: "2018-08-28", releasedDate: "2022-11-13" }, { designatedDate: "2026-07-01", releasedDate: null }] },

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
  // 부천 일반구 신설(원미·소사·오정) — 구 `41190`은 **소멸**했다(Vworld `emd_cd:like:41190` 0건).
  //   현행 주소검색은 41192·41194·41196을 주므로 구 코드만 두면 조정지역 이력이 통째로
  //   매칭 실패한다(계획서 D-8). 부천은 **시 전역 지정**이었으므로 3개 구가 같은 이력을
  //   그대로 물려받는다 — 별칭(1:1)으로는 1:N을 표현할 수 없어 엔트리를 함께 둔다.
  //   구 엔트리는 저장된 이력·수동 입력을 위해 유지한다.
  { code: "41192", name: "경기도 부천시 원미구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-11-13" }] },
  { code: "41194", name: "경기도 부천시 소사구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-11-13" }] },
  { code: "41196", name: "경기도 부천시 오정구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-11-13" }] },
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

  // 화성 일반구 신설(만세·효행·병점·동탄) — 구 `41590`도 **소멸**했다(계획서 D-9).
  //
  //   부천(D-8)과 결정적으로 다른 점: 화성은 **시 전역이 아니라 동탄2 지구 한정** 지정이었다.
  //   신설 구 전역으로 넓히면 지정된 적 없는 지역까지 조정대상지역이 되어 **근거 없이
  //   납세자에게 불리**해진다. 따라서 구 `includedSubCodes`가 가리키던 **같은 지리적 범위**만
  //   현행 코드로 옮긴다.
  //
  //   지정 범위가 시기마다 다르다(2017 지구 한정 → 2026 전역). 엔트리를 둘로 나눌 수는 없다 —
  //   `isRegulatedByBjdCodeIn`은 시·군·구가 일치하는 **첫 엔트리만** 집으므로 뒤 엔트리가
  //   조용히 죽는다. 대신 `includedSubCodes`의 `appliesFrom`/`appliesTo`로 과거 이력에만
  //   지구 한정을 걸어 둔다(`activeSubRules`가 날짜로 거른다).
  //
  //   ## 과거 이력(2017~2022) 범위는 **지리 실측**으로 정했다 (Y-13, 2026-08-01)
  //
  //   구 `41590420 동탄면`은 폐지돼 현행 어디에도 없다(Vworld 전국 검색 0건). 그래서
  //   「동탄2택지개발지구」 자체를 지리로 재구성했다 — Vworld `LT_C_LHBLPN`(LH 지구 블록)의
  //   **「화성동탄2 택지개발사업」 폴리곤 2,040건**과 현행 법정동 폴리곤을 turf로 교차해
  //   법정동별 지구 포함 면적비를 실측했다:
  //
  //     동탄2 : 산척 98.7 · 송동 99.2 · 여울 99.2 · 영천 91.0 · 목동 89.1 ·
  //             청계 50.5 · 신동 41.9 · 장지 40.6 (%)
  //     동탄1 : 능동 95.4 · 반송동 99.8 · 석우동 99.9 (%)   ← 「화성동탄지구」 955건
  //     양쪽 모두 아님 : 중동 · 방교동 · 금곡동
  //
  //   ⚠️ 이 실측은 **종전 데이터의 오류도 함께 드러냈다**: 종전 `41590127`·`41590128`은
  //   「동탄2 반송동/석우동」이라 라벨돼 있었으나 두 동은 동탄1이 99.8%이고 동탄2와는
  //   **전혀 겹치지 않는다**. 2017-08-03 국토부 고시는 「동탄2택지개발지구에 한함」이었다.
  //
  //   2026-08-01 세무 판단 — **합집합**을 택한다: 종전에 적용되던 반송·석우동을 유지하되
  //   (빼면 기존 판정이 축소돼 이력과 어긋난다), 확대는 **지리 근거가 있는 동탄2 지구**로만
  //   한정한다. 능동(동탄1)·중동·방교동·금곡동은 어느 쪽 근거도 없어 제외한다 —
  //   근거 없이 넓히면 납세자에게 불리해진다.
  { code: "41597", name: "경기도 화성시 동탄구",
    designations: [
      // 과거 이력 — 동탄2 지구 한정(아래 includedSubCodes가 기간과 함께 좁힌다)
      { designatedDate: "2017-08-03", releasedDate: "2022-11-13" },
      // 신규 지정 — 동탄구 **전역**. 국토교통부공고 제2026-882호(2026-07-01),
      //   「주택법」 §63의2④. 대상: 화성시 동탄구·용인시 기흥구·구리시.
      { designatedDate: "2026-07-01", releasedDate: null },
    ],
    includedSubCodes: [
      // 종전 적용분 유지 (구 41590127·41590128)
      { codePrefix: "41597102", name: "반송동", appliesFrom: "2017-08-03", appliesTo: "2022-11-13" },
      { codePrefix: "41597103", name: "석우동", appliesFrom: "2017-08-03", appliesTo: "2022-11-13" },
      // 동탄2택지개발지구 실측 편입 (구 41590420 동탄면 대응)
      { codePrefix: "41597105", name: "동탄2 청계동", appliesFrom: "2017-08-03", appliesTo: "2022-11-13" },
      { codePrefix: "41597106", name: "동탄2 영천동", appliesFrom: "2017-08-03", appliesTo: "2022-11-13" },
      { codePrefix: "41597108", name: "동탄2 신동", appliesFrom: "2017-08-03", appliesTo: "2022-11-13" },
      { codePrefix: "41597109", name: "동탄2 목동", appliesFrom: "2017-08-03", appliesTo: "2022-11-13" },
      { codePrefix: "41597110", name: "동탄2 산척동", appliesFrom: "2017-08-03", appliesTo: "2022-11-13" },
      { codePrefix: "41597111", name: "동탄2 장지동", appliesFrom: "2017-08-03", appliesTo: "2022-11-13" },
      { codePrefix: "41597112", name: "동탄2 송동", appliesFrom: "2017-08-03", appliesTo: "2022-11-13" },
      { codePrefix: "41597115", name: "동탄2 여울동", appliesFrom: "2017-08-03", appliesTo: "2022-11-13" },
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

  // ══════ 인천광역시 — 2026-07-01 자치구 재편 후 신 코드 ══════
  //
  //   「인천광역시 제물포구ㆍ영종구 및 검단구 설치 등에 관한 법률」(법령ID 014604 ·
  //   공포 2025-12-30 · **시행 2026-07-01**) §2①이 **중구·동구를 폐지**하고 §2②가
  //   제물포구·영종구·검단구를 설치했다. 서구는 같은 날 **서해구**로 개칭됐다.
  //
  //   지정 이력은 지정 당시(2020~2022) 구 코드로 작성돼 있는데 주소검색 PNU는 신 코드를 준다.
  //   전남·광주(코드만 바뀐 1:1)와 달리 **구역이 N:M으로 분할·병합**돼 시·군·구 별칭으로는
  //   표현할 수 없다 → 신 코드 엔트리를 별도로 둔다(계획서 D-5 — 실측 −337,386,500 과소과세).
  //   구 엔트리(28110·28140·28260)는 **그대로 유지**한다 — 저장된 이력·수동 입력이 계속 인식돼야 한다.
  //
  //   ⚠️ 영종구가 까다롭다: 조정지역에서 빠졌던 4개 동(을왕·남북·덕교·무의)이 **영종구로 이동**했다.
  //      법정동코드도 재부여됐다 — `28110149~152` → `28155105~108`(Vworld `LT_C_ADEMD_INFO` 실측).
  { code: "28125", name: "인천광역시 제물포구",
    // 종전 중구 도심 법정동 + 종전 동구 전역. 제외 4개 동은 영종구로 갔으므로 여기엔 없다.
    designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-11-13" }] },
  { code: "28155", name: "인천광역시 영종구",
    designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-11-13" }],
    excludedSubCodes: [
      { codePrefix: "28155105", name: "을왕동", appliesFrom: "2020-12-18" },
      { codePrefix: "28155106", name: "남북동", appliesFrom: "2020-12-18" },
      { codePrefix: "28155107", name: "덕교동", appliesFrom: "2020-12-18" },
      { codePrefix: "28155108", name: "무의동", appliesFrom: "2020-12-18" },
    ] },
  { code: "28275", name: "인천광역시 서해구",
    designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-11-13" }] },
  { code: "28290", name: "인천광역시 검단구",
    designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-11-13" }] },

  // ══════ 인천광역시 — 재편 전 구 코드 (2020.6.19~2022.11.14, 강화·옹진 상시 미지정) ══════
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

  // ══════ 부산광역시 (26) — 2017.8.3 일부 구 → 2019.11.8 전부해제 → 2020.11.20·12.18 재확대 → 2022.9.26 전부해제 ══════
  // 1차: 해운대·동래·수영(2019.11.7까지), 부산진·남·연제(2018.12.30까지·주4), 기장(주3·주4)
  { code: "26350", name: "부산광역시 해운대구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2019-11-07" }, { designatedDate: "2020-11-20", releasedDate: "2022-09-25" }] },
  { code: "26260", name: "부산광역시 동래구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2019-11-07" }, { designatedDate: "2020-11-20", releasedDate: "2022-09-25" }] },
  { code: "26500", name: "부산광역시 수영구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2019-11-07" }, { designatedDate: "2020-11-20", releasedDate: "2022-09-25" }] },
  { code: "26470", name: "부산광역시 연제구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2018-12-30" }, { designatedDate: "2020-11-20", releasedDate: "2022-09-25" }] },
  { code: "26290", name: "부산광역시 남구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2018-12-30" }, { designatedDate: "2020-11-20", releasedDate: "2022-09-25" }] },
  { code: "26230", name: "부산광역시 부산진구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2018-12-30" }, { designatedDate: "2020-12-18", releasedDate: "2022-09-25" }] },
  // 기장군: 2017.8.3 전역 → 2018.8.28 일광면만(주3) → 2018.12.31 전부해제(주4). 2020.12.18~ '기장군 제외'로 재지정 없음.
  { code: "26710", name: "부산광역시 기장군",
    designations: [{ designatedDate: "2017-08-03", releasedDate: "2018-12-30" }],
    includedSubCodes: [{ codePrefix: "26710310", name: "일광면", appliesFrom: "2018-08-28", appliesTo: "2018-12-30" }] },
  // 2020.12.18~2022.9.25 '기장군·중구 제외' 전역 재지정 구 (2020.11.20 5개구에는 미포함)
  { code: "26140", name: "부산광역시 서구", designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-09-25" }] },
  { code: "26170", name: "부산광역시 동구", designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-09-25" }] },
  { code: "26200", name: "부산광역시 영도구", designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-09-25" }] },
  { code: "26320", name: "부산광역시 북구", designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-09-25" }] },
  { code: "26380", name: "부산광역시 사하구", designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-09-25" }] },
  { code: "26410", name: "부산광역시 금정구", designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-09-25" }] },
  { code: "26440", name: "부산광역시 강서구", designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-09-25" }] },
  { code: "26530", name: "부산광역시 사상구", designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-09-25" }] },
  // (부산 중구 26110은 전 기간 미지정)

  // ══════ 대구광역시 (27) — 2020.11.20 수성 → 2020.12.18 확대 → 2022.7.5 수성만 → 2022.9.26 해제 ══════
  { code: "27260", name: "대구광역시 수성구", designations: [{ designatedDate: "2020-11-20", releasedDate: "2022-09-25" }] },
  // 수성 외 구: 2020.12.18~2022.7.4 (2022.7.5부터 수성구만 유지)
  { code: "27110", name: "대구광역시 중구", designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-07-04" }] },
  { code: "27140", name: "대구광역시 동구", designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-07-04" }] },
  { code: "27170", name: "대구광역시 서구", designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-07-04" }] },
  { code: "27200", name: "대구광역시 남구", designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-07-04" }] },
  { code: "27230", name: "대구광역시 북구", designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-07-04" }] },
  { code: "27290", name: "대구광역시 달서구", designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-07-04" }] },
  // 달성군: 7개 읍면 제외(주9) → 화원·다사읍만 지정
  { code: "27710", name: "대구광역시 달성군",
    designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-07-04" }],
    excludedSubCodes: [
      { codePrefix: "27710310", name: "가창면" }, { codePrefix: "27710380", name: "구지면" },
      { codePrefix: "27710330", name: "하빈면" }, { codePrefix: "27710253", name: "논공읍" },
      { codePrefix: "27710340", name: "옥포읍" }, { codePrefix: "27710370", name: "유가읍" },
      { codePrefix: "27710360", name: "현풍읍" },
    ] },

  // ══════ 대전광역시 (30) — 전역(표 표기대로), 2020.6.19~2022.9.25 ══════
  { code: "30110", name: "대전광역시 동구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-25" }] },
  { code: "30140", name: "대전광역시 중구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-25" }] },
  { code: "30170", name: "대전광역시 서구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-25" }] },
  { code: "30200", name: "대전광역시 유성구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-25" }] },
  { code: "30230", name: "대전광역시 대덕구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-25" }] },

  // ══════ 광주광역시 (29) — 전역(표 표기대로), 2020.12.18~2022.9.25 ══════
  { code: "29110", name: "광주광역시 동구", designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-09-25" }] },
  { code: "29140", name: "광주광역시 서구", designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-09-25" }] },
  { code: "29155", name: "광주광역시 남구", designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-09-25" }] },
  { code: "29170", name: "광주광역시 북구", designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-09-25" }] },
  { code: "29200", name: "광주광역시 광산구", designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-09-25" }] },

  // ══════ 울산광역시 (31) — 중·남구, 2020.12.18~2022.9.25 ══════
  { code: "31110", name: "울산광역시 중구", designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-09-25" }] },
  { code: "31140", name: "울산광역시 남구", designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-09-25" }] },

  // ══════ 세종특별자치시 (36110) — 행정중심복합도시 예정지역(동지역)만 지정, 2017.8.3~2022.11.13 ══════
  // 동(洞)지역 23개(반곡동 101 ~ 용호동 123)만 조정대상. 읍·면(조치원읍 250·연기면 등 1읍9면)은
  //   비예정지역으로 미지정. 행안부 법정동코드 기준 includedSubCodes로 정밀화(전역 coarseNote 폐지).
  //   10자리 코드면 동/읍면 정밀(high), 5자리(36110)만이면 medium("10자리 확인 필요").
  { code: "36110", name: "세종특별자치시",
    designations: [{ designatedDate: "2017-08-03", releasedDate: "2022-11-13" }],
    includedSubCodes: [
      { codePrefix: "36110101", name: "반곡동" }, { codePrefix: "36110102", name: "소담동" },
      { codePrefix: "36110103", name: "보람동" }, { codePrefix: "36110104", name: "대평동" },
      { codePrefix: "36110105", name: "가람동" }, { codePrefix: "36110106", name: "한솔동" },
      { codePrefix: "36110107", name: "나성동" }, { codePrefix: "36110108", name: "새롬동" },
      { codePrefix: "36110109", name: "다정동" }, { codePrefix: "36110110", name: "어진동" },
      { codePrefix: "36110111", name: "종촌동" }, { codePrefix: "36110112", name: "고운동" },
      { codePrefix: "36110113", name: "아름동" }, { codePrefix: "36110114", name: "도담동" },
      { codePrefix: "36110115", name: "산울동" }, { codePrefix: "36110116", name: "해밀동" },
      { codePrefix: "36110117", name: "합강동" }, { codePrefix: "36110118", name: "집현동" },
      { codePrefix: "36110119", name: "세종동" }, { codePrefix: "36110120", name: "누리동" },
      { codePrefix: "36110121", name: "한별동" }, { codePrefix: "36110122", name: "다솜동" },
      { codePrefix: "36110123", name: "용호동" },
    ] },

  // ══════ 충북 청주 (43111~43114) — 동지역 + 오창·오송읍 지정, 그 외 읍·면 제외. 2020.6.19~2022.9.25 ══════
  { code: "43111", name: "충청북도 청주시 상당구",
    designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-25" }],
    excludedSubCodes: [
      { codePrefix: "43111310", name: "낭성면" }, { codePrefix: "43111320", name: "미원면" },
      { codePrefix: "43111330", name: "가덕면" }, { codePrefix: "43111340", name: "남일면" },
      { codePrefix: "43111350", name: "문의면" },
    ] },
  { code: "43112", name: "충청북도 청주시 서원구",
    designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-25" }],
    excludedSubCodes: [
      { codePrefix: "43112310", name: "남이면" }, { codePrefix: "43112320", name: "현도면" },
    ] },
  { code: "43113", name: "충청북도 청주시 흥덕구",
    designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-25" }],
    excludedSubCodes: [
      { codePrefix: "43113310", name: "강내면" }, { codePrefix: "43113320", name: "옥산면" },
    ] }, // 오송읍(43113250)은 지정 유지
  { code: "43114", name: "충청북도 청주시 청원구",
    designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-25" }],
    excludedSubCodes: [
      { codePrefix: "43114250", name: "내수읍" }, { codePrefix: "43114310", name: "북이면" },
    ] }, // 오창읍(43114253)은 지정 유지

  // ══════ 충남 천안 (동남·서북) — 동지역만, 2020.12.18~2022.9.25 ══════
  { code: "44131", name: "충청남도 천안시 동남구",
    designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-09-25" }],
    excludedSubCodes: [
      { codePrefix: "44131250", name: "목천읍" }, { codePrefix: "44131310", name: "풍세면" },
      { codePrefix: "44131320", name: "광덕면" }, { codePrefix: "44131330", name: "북면" },
      { codePrefix: "44131340", name: "성남면" }, { codePrefix: "44131350", name: "수신면" },
      { codePrefix: "44131360", name: "병천면" }, { codePrefix: "44131370", name: "동면" },
    ] },
  { code: "44133", name: "충청남도 천안시 서북구",
    designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-09-25" }],
    excludedSubCodes: [
      { codePrefix: "44133250", name: "성환읍" }, { codePrefix: "44133253", name: "성거읍" },
      { codePrefix: "44133256", name: "직산읍" }, { codePrefix: "44133310", name: "입장면" },
    ] },

  // ══════ 충남 공주 (44150) — 동지역만, 2020.12.18~2022.9.25 ══════
  { code: "44150", name: "충청남도 공주시",
    designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-09-25" }],
    excludedSubCodes: [
      { codePrefix: "44150250", name: "유구읍" }, { codePrefix: "44150310", name: "이인면" },
      { codePrefix: "44150320", name: "탄천면" }, { codePrefix: "44150330", name: "계룡면" },
      { codePrefix: "44150340", name: "반포면" }, { codePrefix: "44150360", name: "의당면" },
      { codePrefix: "44150370", name: "정안면" }, { codePrefix: "44150380", name: "우성면" },
      { codePrefix: "44150390", name: "사곡면" }, { codePrefix: "44150400", name: "신풍면" },
    ] },

  // ══════ 충남 논산 (44230) — 동지역만, 2020.12.18~2022.9.25 ══════
  { code: "44230", name: "충청남도 논산시",
    designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-09-25" }],
    excludedSubCodes: [
      { codePrefix: "44230250", name: "강경읍" }, { codePrefix: "44230253", name: "연무읍" },
      { codePrefix: "44230310", name: "성동면" }, { codePrefix: "44230320", name: "광석면" },
      { codePrefix: "44230330", name: "노성면" }, { codePrefix: "44230340", name: "상월면" },
      { codePrefix: "44230350", name: "부적면" }, { codePrefix: "44230360", name: "연산면" },
      { codePrefix: "44230380", name: "벌곡면" }, { codePrefix: "44230390", name: "양촌면" },
      { codePrefix: "44230400", name: "가야곡면" }, { codePrefix: "44230410", name: "은진면" },
      { codePrefix: "44230420", name: "채운면" },
    ] },

  // ══════ 전북 전주 (완산·덕진) — 동만 있는 구(읍면 없음) 전역, 2020.12.18~2022.9.25 ══════
  { code: "45111", name: "전라북도 전주시 완산구", designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-09-25" }] },
  { code: "45113", name: "전라북도 전주시 덕진구", designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-09-25" }] },

  // ══════ 경남 창원 성산구 (48123) — 동만 있는 구 전역, 2020.12.18~2022.9.25 ══════
  { code: "48123", name: "경상남도 창원시 성산구", designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-09-25" }] },

  // ══════ 경북 포항 남구 (47111) — 동지역만, 2020.12.18~2022.9.25 ══════
  { code: "47111", name: "경상북도 포항시 남구",
    designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-09-25" }],
    excludedSubCodes: [
      { codePrefix: "47111250", name: "구룡포읍" }, { codePrefix: "47111253", name: "연일읍" },
      { codePrefix: "47111256", name: "오천읍" }, { codePrefix: "47111310", name: "대송면" },
      { codePrefix: "47111320", name: "동해면" }, { codePrefix: "47111330", name: "장기면" },
      { codePrefix: "47111350", name: "호미곶면" },
    ] },

  // ══════ 경북 경산 (47290) — 동지역만, 2020.12.18~2022.7.4 (2022.7.5 해제) ══════
  { code: "47290", name: "경상북도 경산시",
    designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-07-04" }],
    excludedSubCodes: [
      { codePrefix: "47290250", name: "하양읍" }, { codePrefix: "47290253", name: "진량읍" },
      { codePrefix: "47290310", name: "와촌면" }, { codePrefix: "47290330", name: "자인면" },
      { codePrefix: "47290340", name: "용성면" }, { codePrefix: "47290350", name: "남산면" },
      { codePrefix: "47290360", name: "압량면" }, { codePrefix: "47290370", name: "남천면" },
    ] },

  // ══════ 전남 여수 (46130) — 동지역 + 소라면 지정, 그 외 읍면 제외. 2020.12.18~2022.7.4 ══════
  { code: "46130", name: "전라남도 여수시",
    designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-07-04" }],
    excludedSubCodes: [
      { codePrefix: "46130250", name: "돌산읍" }, { codePrefix: "46130320", name: "율촌면" },
      { codePrefix: "46130330", name: "화양면" }, { codePrefix: "46130340", name: "남면" },
      { codePrefix: "46130350", name: "화정면" }, { codePrefix: "46130360", name: "삼산면" },
    ] }, // 소라면(46130310)은 지정 유지

  // ══════ 전남 순천 (46150) — 동지역 + 해룡·서면 지정, 그 외 읍면 제외. 2020.12.18~2022.7.4 ══════
  { code: "46150", name: "전라남도 순천시",
    designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-07-04" }],
    excludedSubCodes: [
      { codePrefix: "46150250", name: "승주읍" }, { codePrefix: "46150330", name: "황전면" },
      { codePrefix: "46150340", name: "월등면" }, { codePrefix: "46150350", name: "주암면" },
      { codePrefix: "46150360", name: "송광면" }, { codePrefix: "46150370", name: "외서면" },
      { codePrefix: "46150380", name: "낙안면" }, { codePrefix: "46150390", name: "별량면" },
      { codePrefix: "46150400", name: "상사면" },
    ] }, // 해룡면(46150310)·서면(46150320)은 지정 유지

  // ══════ 전남 광양 (46230) — 동지역 + 광양읍 지정, 그 외 면 제외. 2020.12.18~2022.7.4 ══════
  { code: "46230", name: "전라남도 광양시",
    designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-07-04" }],
    excludedSubCodes: [
      { codePrefix: "46230310", name: "봉강면" }, { codePrefix: "46230320", name: "옥룡면" },
      { codePrefix: "46230330", name: "옥곡면" }, { codePrefix: "46230340", name: "진상면" },
      { codePrefix: "46230350", name: "진월면" }, { codePrefix: "46230360", name: "다압면" },
    ] }, // 광양읍(46230250)은 지정 유지
];
