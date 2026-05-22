/**
 * PNU(필지고유번호) ↔ 행정안전부 표준 시·군·구 코드 매핑 헬퍼.
 *
 * PNU 19자리 구조: 시·군·구5 + 읍·면·동3 + 리2 + 산여부1 + 본번4 + 부번4
 * 행안부 표준 10자리: 시·군·구5 + 읍·면·동5(0 패딩)
 *
 * 관련 PRD/디자인:
 *   - docs/00-pm/inheritance-farming-residence-data-infra.plan.md v1.2
 *   - docs/02-design/features/inheritance-farming-residence-data-infra.engine.design.md v1.2 §3-5 (M1)
 *
 * v4.1.1 Phase 5 (`3098d95`)에서 `components/calc/inheritance/FarmingEligibilitySection.tsx` 내부
 * 비-export 함수로 작성되었던 것을 본 모듈로 추출·export (PR-4a · M1 정정).
 *
 * 가설: PNU 앞 5자리 = 행안부 표준 10자리 앞 5자리 (Phase 3 PR-4에서 anchor 10건 검증).
 */

/**
 * PNU 5자리 → 행안부 표준 10자리 (앞 5자리 + "00000").
 *
 * - pnu가 undefined 또는 5자리 미만이면 undefined 반환
 * - 5자리 이상이면 앞 5자리만 사용 + 끝 5자리는 0 패딩
 *
 * 예:
 *   "1168010100" → "1168000000"  (강남구)
 *   "1165010600100040000" → "1165000000"  (서초구, 19자리 PNU)
 *   "11680" → "1168000000"  (5자리 시·군·구 코드 단독)
 */
export function extractSigunguCodeFromPnu(pnu: string | undefined): string | undefined {
  if (!pnu || pnu.length < 5) return undefined;
  return pnu.slice(0, 5) + "00000";
}
