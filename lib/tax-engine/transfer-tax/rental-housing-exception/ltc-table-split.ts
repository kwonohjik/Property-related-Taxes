/**
 * 장기보유특별공제 표1·표2 동시 산출
 *
 * §161④ 규정에 따라 §161①·②1호는 표1(일반), §161②2호는 표2(1세대1주택)를
 * 각각 적용하므로, 동일한 양도차익에 대해 두 표를 모두 계산해야 함.
 *
 * 표1 (일반 장기보유공제): 보유연수 × 2%, 최대 30%
 * 표2 (1세대1주택 특례):   보유연수 × 4% + 거주연수 × 4%, 최대 80%
 *
 * 법령 근거: 소득세법 §95② 별표, 소득세법 시행령 §161④
 */

import { applyRate } from "../../tax-utils";

// ============================================================
// 공제율 계산 함수
// ============================================================

/**
 * 표1 — 일반 장기보유공제율
 * 보유연수 × 2%, 최대 30%, 최소 보유기간 3년
 */
export function calcTable1Rate(holdYears: number): number {
  if (holdYears < 3) return 0;
  return Math.min(holdYears * 0.02, 0.30);
}

/**
 * 표2 — 1세대1주택 특례 장기보유공제율
 * 보유연수 × 4% + 거주연수 × 4%, 최대 80%
 * 각 파트는 40% 캡 적용 후 합산
 * 최소 보유기간 3년, 거주기간 2년
 */
export function calcTable2Rate(holdYears: number, liveYears: number): number {
  if (holdYears < 3) return 0;
  if (liveYears < 2) return 0;
  const holdPart = Math.min(holdYears * 0.04, 0.40);
  const livePart = Math.min(liveYears * 0.04, 0.40);
  return Math.min(holdPart + livePart, 0.80);
}

// ============================================================
// 메인 계산 함수
// ============================================================

export type Gain95BothTables = {
  /** 표1 장기보유공제액 (원, floor) */
  ltcTable1: number;
  /** 표2 장기보유공제액 (원, floor) */
  ltcTable2: number;
  /** gain95(표1) = gain − ltcTable1 */
  gain95Table1: number;
  /** gain95(표2) = gain − ltcTable2 */
  gain95Table2: number;
  /** 표1 공제율 */
  rateTable1: number;
  /** 표2 공제율 */
  rateTable2: number;
};

/**
 * 동일 양도차익에 대해 표1·표2 장기보유공제를 동시 산출
 *
 * B1 케이스: gain95T1 사용 (§161① + §161④)
 * B2 케이스: gain95T1(1호) + gain95T2(2호) 각각 사용 (§161②1호·2호 + §161④)
 * A1 케이스: 특례 전액 비과세이므로 gain95T1 참조용으로만 반환
 * A2 케이스: gain95T2 사용 (1세대1주택 고가주택 분기 — 표2)
 *
 * 정수 연산: applyRate() = Math.floor(gain × rate)
 * Math.round() 절대 금지
 *
 * @param gain 양도차익 (원)
 * @param holdYears 보유연수 (정수)
 * @param liveYears 거주연수 (정수)
 */
export function calculateGain95BothTables(
  gain: number,
  holdYears: number,
  liveYears: number,
): Gain95BothTables {
  const rateTable1 = calcTable1Rate(holdYears);
  const rateTable2 = calcTable2Rate(holdYears, liveYears);

  // applyRate = Math.floor(gain * rate) — 세율×금액은 반드시 이 함수 사용
  const ltcTable1 = applyRate(gain, rateTable1);
  const ltcTable2 = applyRate(gain, rateTable2);

  const gain95Table1 = gain - ltcTable1;
  const gain95Table2 = gain - ltcTable2;

  return {
    ltcTable1,
    ltcTable2,
    gain95Table1,
    gain95Table2,
    rateTable1,
    rateTable2,
  };
}
