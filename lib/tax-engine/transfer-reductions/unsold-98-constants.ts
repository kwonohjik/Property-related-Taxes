/**
 * §98 (미분양 국민주택 세율 20%) 상수 단일 소스 — 의존이 없는 리프 파일.
 *
 * 세율 계산(`transfer-tax-rate-calc.ts`)·적격 평가(`unsold-hybrid-p5.ts`)·결과 카드가 모두 여기서 읽는다.
 * (US-49: 종전에는 상수가 따로 있고 계산 경로는 리터럴 0.2·5를 써 상수를 고쳐도 세액이 바뀌지 않았다.)
 */

/** 법 §98①1호 — 양도소득세 세율 (§104① 불구) */
export const UNSOLD_98_FLAT_RATE = 0.2;

/** 법 §98① — 「5년 이상 보유ㆍ임대」의 연수 */
export const UNSOLD_98_HOLDING_YEARS = 5;

/** 화면·산식 문구용 백분율 표기 (예: 「20%」) — 부동소수 오차 방지를 위해 반올림 */
export const UNSOLD_98_FLAT_RATE_LABEL = `${Math.round(UNSOLD_98_FLAT_RATE * 100)}%`;
