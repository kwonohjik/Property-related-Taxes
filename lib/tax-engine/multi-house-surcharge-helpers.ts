/**
 * 다주택 중과세 헬퍼 — 800줄 정책 분할 배럴 (하위호환 re-export, 2026-06)
 *
 * 798줄 → 2분할. 실제 구현:
 *   - multi-house-surcharge-count.ts     (주택 수 산정군: 지역분류·임대 A~I·소형신축·countEffectiveHouses)
 *   - multi-house-surcharge-exclusion.ts (중과 배제·유예군: 그룹배제·유예·determineSurchargeExclusion)
 *
 * 기존 소비자의 "./multi-house-surcharge-helpers" import 경로를 그대로 보존한다.
 * 의존: 배럴 → count·exclusion / exclusion → count (단방향, 순환 0).
 */

export * from "./multi-house-surcharge-count";
export * from "./multi-house-surcharge-exclusion";
