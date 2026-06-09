/**
 * substitute-group-id.ts — 대습상속인 그룹 ID 생성 공용 헬퍼
 *
 * SubstituteHeirPanel.tsx와 HeirComposition.tsx 양쪽에서 공용으로 사용.
 * single-source 원칙: `subst-` 컨벤션은 이 모듈에서만 정의.
 */

let _nextSubstGroup = 1;

/**
 * 대습상속인 그룹 식별자 생성.
 * 같은 피대습자를 갈음하는 대습상속인들을 묶는 그룹 ID.
 * `subst-${Date.now()}-${n}` 컨벤션 — `generateHeirId()`(heir- 형식)과 명확히 구분.
 */
export function generateSubstituteGroupId(): string {
  return `subst-${Date.now()}-${_nextSubstGroup++}`;
}
