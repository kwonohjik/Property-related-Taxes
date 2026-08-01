/**
 * 행정안전부 표준 시·군·구 테이블 (5자리계) — NBL 재촌 판정·`SigunguSelect` 자동완성 공용.
 *
 * **데이터는 `sigungu-codes.json`이 단일 소스**이며 `scripts/build-sigungu-adjacency.ts`가
 * 인접 매트릭스(`lib/geo/administrative-district-adjacency.json`)와 **같은 원본**
 * (Vworld `LT_C_ADSIGG_INFO`)에서 함께 생성한다 — 따로 관리하면 다시 어긋난다.
 *
 * ⚠️ 2026-08-01 전면 재생성 이전에는 이 파일이 코드를 **하드코딩**하고 있었고,
 *    그 값이 구 체계라 현행과 광범위하게 어긋났다(계획서 D-3 실측):
 *      · 154건 중 코드·이름 모두 일치 **31건뿐**
 *      · **43건이 다른 지역으로 매칭** — 서울은 도봉구부터 한 칸씩 밀려 `11680`이 「서초구」
 *        (현행 강남구)였다. 사용자가 「서초구」를 고르면 강남구 코드가 저장됐다.
 *      · 현행 256건 중 **182건 미수록**
 *    조회 실패보다 **오매칭**이 위험했다 — 재촌 연접 판정이 엉뚱한 시·군·구 집합으로 이뤄졌다.
 *    실측 세액 영향 **+102,685,000**(좌표 없이 코드만 입력 + 연접 시·군 거주 조합).
 *
 * 코드 체계 주의: **전남·광주 통합**(시도코드 `12`, 시행 2026-07-01)이 반영돼 있다 —
 * 구 광주 `29`·전남 `46` 코드는 없다. 프로덕션 주소검색 PNU와 같은 체계다.
 *
 * `adjacentCodes`는 **경계 공유**만이다(turf `booleanIntersects`). 도서는 `[]` —
 * 교량 연결(거가대교·강화대교 등)은 포함하지 않는다. 30km 판정은 재촌 3호가 좌표로 별도 수행한다.
 *
 * 재생성: `npx tsx --env-file=.env.local scripts/build-sigungu-adjacency.ts`
 * 계획서: docs/02-design/features/sigungu-code-system-drift.plan.md (D-3 / X-3)
 */

import tableData from "./sigungu-codes.json";

export interface SigunguCode {
  code: string;       // 5자리 행정표준코드
  sidoName: string;   // 시도명
  name: string;       // 시군구명 (자치구가 있는 시는 "수원시 영통구")
  fullName: string;   // 전체명 (시도 + 시군구)
  adjacentCodes: string[];  // 경계 공유 시군구 코드 (5자리)
}

export const SIGUNGU_CODES: readonly SigunguCode[] = Object.freeze(
  tableData as SigunguCode[],
);

/** 코드 → 레코드 (O(1)). 5자리 기준 — 10자리는 호출부가 `slice(0, 5)`로 정규화한다. */
const BY_CODE = new Map(SIGUNGU_CODES.map((s) => [s.code, s]));

/** 시군구 코드로 SigunguCode 조회 */
export function lookupSigungu(code: string): SigunguCode | undefined {
  return BY_CODE.get(code);
}

/** 이름 또는 코드로 시군구 자동완성 검색 (대소문자 무관) */
export function searchSigungu(query: string): SigunguCode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return SIGUNGU_CODES.filter(
    (s) =>
      s.fullName.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      s.code.startsWith(q),
  ).slice(0, 20);
}
