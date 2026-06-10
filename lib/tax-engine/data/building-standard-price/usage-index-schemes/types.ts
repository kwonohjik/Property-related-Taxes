/**
 * D3 용도지수 — 스킴 공통 타입
 *
 * 번호 체계가 동일한 연도 묶음 = 하나의 `UsageScheme`. 레지스트리(usage-index.ts)에서 연도로 디스패치.
 * 시대별 번호 체계 상이 — 같은 용도라도 연도에 따라 번호·항목 수가 다름. 상세: usage-index.ts 상단 주석.
 */

/** 번호 체계가 동일한 연도 묶음 = 하나의 용도지수 스킴 */
export interface UsageScheme {
  /** 적용 연도 집합 */
  years: ReadonlySet<number>;
  /** 일반 용도 최대 번호(이 + 1 = 기계식주차, D9에서 처리) */
  maxGeneralNo: number;
  /** 용도 번호 → 표시명 (이 스킴 공통, baseYear 기준 라벨) */
  labels: Readonly<Record<number, string>>;
  /** BASE 연도 용도지수 */
  baseIndex: Readonly<Record<number, number>>;
  /** 연도별 override (BASE 대비 변경 번호만). BASE 연도는 없음 */
  overrides: Readonly<Record<number, Readonly<Record<number, number>>>>;
}
