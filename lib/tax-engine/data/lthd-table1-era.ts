/**
 * 「소득세법」 §95② **표1**(일반 장기보유특별공제)의 연혁 (리뷰 US-11 · 0-B 원문 대조 2026-11-09)
 * (개정 없는 확정 역사 데이터. 정적 상수. 표2 연혁은 `lthd-table2-era.ts`.)
 *
 * | 양도일 | 표1 공제율 | 근거 |
 * |---|---|---|
 * | < 2008-01-01 | **미지원**(원문 미확인) — 종전 식(연 2%·30% 한도)을 유지하고 호출부가 고지 | — |
 * | 2008-01-01 ~ 2018-12-31 | 3년 10 · 4년 12 · 5년 15 · 6년 18 · 7년 21 · 8년 24 · 9년 27 · 10년 이상 30 (%) | 시행본 MST 93521·131405·109450·120527·149361·170924·177202·199742·202803 |
 * | ≥ 2019-01-01 | 보유 3년 이상 연 2%, 15년 이상 30% | 법률 제15225호 부칙 제1조 3호(2019-01-01 시행)·제2조② |
 *
 * 2008.1.1~3.20 일반 자산이 같은 값이라는 점은 0-B 기록이다(원문 재독 안 함 — 확인 필요).
 */
import { TRANSFER } from "../legal-codes";

/** 법률 제15225호 부칙 제1조 3호 — 표1이 연 2%로 바뀌는 첫 양도일. 이 날 전은 단계표. */
export const LTHD_TABLE1_ANNUAL_2PCT_TRANSFER_START = new Date("2019-01-01");
/** 단계표를 원문 대조한 첫 양도일. 이 날 전은 미지원(종전 식을 유지하고 고지). */
export const LTHD_TABLE1_STEP_TRANSFER_START = new Date("2008-01-01");

/** 2008-01-01~2018-12-31 표1 단계표(정수 %). 보유 3년 미만 0, 10년 이상 30. */
const TABLE1_STEP_PCT: ReadonlyArray<readonly [number, number]> = [
  [10, 30], [9, 27], [8, 24], [7, 21], [6, 18], [5, 15], [4, 12], [3, 10],
];

/** 2018-12-31 이전 양도분 표1 공제율(보유 정수 연수 기준). */
export function table1StepRate(holdingYears: number): number {
  const y = Math.floor(holdingYears);
  for (const [minYears, pct] of TABLE1_STEP_PCT) {
    if (y >= minYears) return pct / 100;
  }
  return 0;
}

/** 2019-01-01 이후 표1 — 보유 3년 이상 연 2%, 30% 한도(정수 %로 계산해 부동소수 누적을 피한다 — 종전 식과 같은 입력 해석). */
export function table1AnnualRate(holdingYears: number): number {
  if (holdingYears < 3) return 0;
  return Math.min(holdingYears * 2, 30) / 100;
}

/** 양도일이 2008-01-01~2018-12-31(단계표 시행본)인가. 양도일이 없으면 현행(연 2%). */
export function isTable1StepEra(transferDate?: Date): boolean {
  if (!transferDate) return false;
  const t = transferDate.getTime();
  return t >= LTHD_TABLE1_STEP_TRANSFER_START.getTime() && t < LTHD_TABLE1_ANNUAL_2PCT_TRANSFER_START.getTime();
}

/**
 * 표1 공제율 — **양도일 시행본** 기준. `transferDate`를 생략하면 현행(연 2%).
 * 정수 연수로 판정한다(세법상 보유기간 「3년 이상 4년 미만」 구간 — 소수 연수는 내림).
 */
export function table1RateAt(holdingYears: number, transferDate?: Date): number {
  if (holdingYears < 3) return 0;
  return isTable1StepEra(transferDate) ? table1StepRate(holdingYears) : table1AnnualRate(holdingYears);
}

/** 표1 연혁 원문 미확인 구간(2008-01-01 전 양도)인가 — 호출부가 고지한다. */
export function isTable1EraUnsupported(transferDate?: Date): boolean {
  return !!transferDate && transferDate.getTime() < LTHD_TABLE1_STEP_TRANSFER_START.getTime();
}

export const LTHD_TABLE1_UNSUPPORTED_NOTICE =
  `2008년 1월 1일 전에 양도한 자산의 장기보유특별공제 표1 연혁은 지원하지 않습니다 — 현행 식(보유 연 2%, 30% 한도)으로 계산했습니다. ` +
  `양도 당시 ${TRANSFER.LONG_TERM_DEDUCTION} 표1을 직접 확인하세요(확인 필요).`;
