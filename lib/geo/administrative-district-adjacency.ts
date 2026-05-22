/**
 * 행정안전부 표준 시·군·구 인접 매트릭스 (10자리 코드 → 인접 코드 배열).
 *
 * 관련 PRD/디자인:
 *   - docs/00-pm/inheritance-farming-residence-data-infra.plan.md v1.2 §6 (PR-3)
 *   - docs/02-design/features/inheritance-farming-residence-data-infra.engine.design.md v1.2 §3-3
 *
 * **현재 상태**: 빈 매트릭스 골격 (PR-3 골격).
 * **Phase 1-C PR-2 미완**: turf.js + LSMD_ADM_SECT_RGN.geojson 자동 인접 계산 후
 * `administrative-district-adjacency.json`에 1,250+ 엔트리 주입.
 *
 * Phase 1-C 완료 전 동작:
 *   - getAdjacentSigunguCodes(code) 항상 빈 배열 반환
 *   - classifyMatch에서 adjacent_district 분기 미활성 (within_30km로 fallback)
 *   - residence echo는 정상 동작 — adjacent_district matchKind만 비활성
 *
 * Phase 1-C 완료 후 동작:
 *   - JSON 파일만 교체 → TypeScript 변경 0, 즉시 활성
 *   - MATRIX_VERSION 갱신 후 CI cron 분기별 자동 PR
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
export const MATRIX_VERSION = "0000-00-00";

/**
 * 매트릭스 비어있는지 여부 (Phase 1-C 진행 여부 빠른 확인).
 * UI에서 "adjacent_district 분기 미활성" 안내에 활용 가능.
 */
export function isMatrixEmpty(): boolean {
  return getSigunguCount() === 0;
}
