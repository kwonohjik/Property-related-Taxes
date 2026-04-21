/**
 * 비사업용 토지 판정 — 진입점 wrapper.
 *
 * 실제 구현은 `lib/tax-engine/non-business-land/` 모듈에 있다.
 * 하위 호환을 위해 이 파일은 얇은 re-export layer로 동작한다.
 *
 * PDF "비사토 판정 흐름도" (세법 실무교재 p.1695~1707) + 소령 §168-6~14 기준.
 * 상세 판정 로직: `./non-business-land/engine.ts`
 *
 * QA 검증 완료 (2026-04-21): 7건 결함 일괄 수정 반영.
 *   - Bug-01 REDIRECT isNonBusinessLand 오조립 수정
 *   - Bug-02 inheritedForestWithin3Years 정명화
 *   - Bug-04 편입유예 "연속 1년" 해석 교정
 *   - Bug-05~07 주석·미사용 import 정리
 */

export * from "./non-business-land/index";
