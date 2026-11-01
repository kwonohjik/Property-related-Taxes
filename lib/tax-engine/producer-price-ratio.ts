/**
 * 생산자물가상승 배율 — 영 §176의2④2호 공용 leaf (주식 Z-1 · 부동산 매수 pre-deemed)
 *
 * 재산46014-10094: ② = 취득 당시 실가 × (의제취득일의 직전일이 속하는 달 지수) ÷ (취득월 지수).
 * 지수 표는 `data/producer-price-index.ts`(ECOS 404Y014 · 1965.01~1985.12) — 표 이전 취득은 직접 입력 배율.
 * 정수 연산: 지수 ×100 고정소수 · BigInt 총액 1회 절사.
 *
 * 주식 모듈(`stock-transfer/stock-pre-deemed-acquisition.ts`)에 있던 유틸을 그대로 옮겼다
 * (계획서 `docs/02-design/features/realestate-pre-deemed-purchase-176-2-4.plan.md` Q-13 a).
 */

import {
  PRODUCER_PRICE_INDEX_MONTHLY,
  PPI_MONTHLY_FIRST_YEAR,
  PPI_MONTHLY_LAST_YEAR,
} from "./data/producer-price-index";

/** 취득월이 PPI 계열(1965.01~) 이전인가 — 이때만 직접 입력 배율이 필요하다(계획서 Q-4) */
export function isBeforePpiSeries(date: Date | string | undefined): boolean {
  if (!date) return false;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  return d.getUTCFullYear() < PPI_MONTHLY_FIRST_YEAR;
}

/** "YYYY-MM" — 날짜의 UTC 연월 */
export function monthKey(d: Date): { year: number; month: number; key: string } {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  return { year, month, key: `${year}-${String(month).padStart(2, "0")}` };
}

/** 월간 지수 ×100 고정소수 — 표 밖이면 undefined. 표는 ECOS 소수 2자리라 ×100이 정수다. */
export function ppiMonthlyX100(year: number, month: number): number | undefined {
  if (year < PPI_MONTHLY_FIRST_YEAR || year > PPI_MONTHLY_LAST_YEAR) return undefined;
  const v = PRODUCER_PRICE_INDEX_MONTHLY[year]?.[month - 1];
  // 소수 2자리 데이터의 정수화 — 세액 반올림이 아니라 부동소수 표현(17.61 → 1761.0000000000002) 제거다.
  return v === undefined ? undefined : Math.round(v * 100);
}

/** floor(base × num ÷ den) — BigInt, 총액 1회 절사 */
export function mulDivFloor(base: number, num: bigint, den: bigint): number {
  return Number((BigInt(base) * num) / den);
}

/** 사용자 직접 입력 배율(소수) → 10^-6 고정소수. 6자리 문자열 변환이라 부동소수 곱셈 오차가 없다. */
export function ratioToScaled6(ratio: number): bigint {
  return BigInt(ratio.toFixed(6).replace(".", ""));
}
