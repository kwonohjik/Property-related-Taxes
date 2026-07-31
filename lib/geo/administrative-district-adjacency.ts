/**
 * 행정안전부 표준 시·군·구 인접 매트릭스 (10자리 코드 → 인접 코드 배열).
 *
 * 관련 PRD/디자인:
 *   - docs/00-pm/inheritance-farming-residence-data-infra.plan.md v1.2 §6 (PR-3)
 *   - docs/02-design/features/inheritance-farming-residence-data-infra.engine.design.md v1.2 §3-3
 *
 * **현재 상태**: **채워짐** (2026-07-31) — 시·군·구 256건 · 인접 관계 654건.
 *
 * 생성: `scripts/build-sigungu-adjacency.ts` (turf `booleanIntersects` + bbox 사전 필터).
 * 소스: **Vworld `LT_C_ADSIGG_INFO`** — 계획서가 상정한 공공데이터포털 Shapefile(~50MB) 수동
 * 다운로드 대신 API가 전국 256건을 한 번에 준다(프로젝트가 이미 쓰는 `VWORLD_API_KEY` 재사용).
 *
 * ⚠️ **코드 체계 주의**: Vworld는 **전남·광주 통합**(시도코드 `12`)을 이미 반영한다 —
 *    구 광주 `29`·전남 `46` 코드는 존재하지 않는다. 프로덕션 주소검색이 반환하는 PNU도
 *    동일 체계(`1285…` 완도군)이므로 본 매트릭스는 **현행 PNU와 정합**하다.
 *    반면 `population-decline-areas.ts`·`regulated-areas.ts`는 아직 구 코드(46·29)를 쓴다 —
 *    별건 드리프트로 조사·보고됨.
 *
 * 고립(인접 0) 8건은 전부 **도서**다: 완도군·영도구·영종구·강화군·옹진군·울릉군·거제시·남해군.
 * 교량 연결(거가대교·강화대교 등)은 육지 경계 접함이 아니므로 인접으로 잡히지 않는다 —
 * 「연접」의 법적 정의가 교량 연결을 포함하는지는 미확정(계획서 Phase 1-D 해상 경계 정책).
 */

import adjacencyData from "./administrative-district-adjacency.json";

const ADJACENCY: Record<string, string[]> = adjacencyData as Record<string, string[]>;

/**
 * 인접 시·군·구 코드 목록.
 * - 미등록 코드 (Phase 1-C 미완 시 모든 코드) → 빈 배열
 * - 반환값은 호출자가 변형 금지 (frozen 참조 권장)
 */
export function getAdjacentSigunguCodes(sigunguCode: string): string[] {
  return ADJACENCY[sigunguCode] ?? [];
}

/**
 * 매트릭스에 등록된 시·군·구 수.
 * Phase 1-C 미완 = 0, 완료 = 240~260 예상.
 */
export function getSigunguCount(): number {
  return Object.keys(ADJACENCY).length;
}

/**
 * 매트릭스 데이터 버전 (CI cron 갱신 추적).
 * Phase 1-C 빌드 시점 ISO date로 갱신.
 * 현재 = "0000-00-00" (빈 매트릭스 placeholder).
 */
export const MATRIX_VERSION = "2026-07-31";

/**
 * 매트릭스 비어있는지 여부 (Phase 1-C 진행 여부 빠른 확인).
 * UI에서 "adjacent_district 분기 미활성" 안내에 활용 가능.
 */
export function isMatrixEmpty(): boolean {
  return getSigunguCount() === 0;
}
