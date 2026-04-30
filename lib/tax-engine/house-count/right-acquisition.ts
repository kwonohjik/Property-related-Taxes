/**
 * 분양권·입주권 권리취득일 기준 소급 산정 모듈 (P3-9)
 *
 * 지방세법 시행령 §28의4① — 분양권·입주권으로 주택 취득 시:
 *   주택 수 산정 기준일 = 권리취득일 (분양사업자 분양권: 분양계약일)
 *
 * 핵심 로직:
 *   일반 매매: 잔금지급일(balancePaymentDate) 기준
 *   분양권·입주권으로 취득: rightAcquisitionDate(권리취득일) 기준으로 소급
 *
 * 1세대 내 다회 취득 시: 가장 빠른 권리취득일 적용.
 *
 * 실무 예시:
 *   2023년 분양권 취득 + 2024년 주택 매수 + 2026년 분양권→아파트 등기
 *   → 등기일(2026) 기준이 아닌 권리취득일(2023) 기준으로 보유 주택 수 산정
 *   → 2023년 기준으로 다른 주택 1채 보유 → 취득 후 2주택 → 1+1 = 2주택 판정
 */

import { ACQUISITION } from "../legal-codes";

// ============================================================
// 권리취득일 기준 산정
// ============================================================

export interface RightAcquisitionDateInput {
  /**
   * 분양권·입주권으로 주택을 취득하는지
   * §28의4①: 해당 시 rightAcquisitionDate를 기준일로 사용
   */
  acquiredViaRight?: boolean;
  /**
   * 권리취득일 (YYYY-MM-DD)
   * 분양사업자 분양권: 분양계약일
   * 입주권: 조합원 입주권 취득일
   */
  rightAcquisitionDate?: string;
  /** 일반 취득 시 잔금지급일 (YYYY-MM-DD) */
  balancePaymentDate?: string;
}

export interface RightAcquisitionDateResult {
  /** 주택 수 산정 기준일 (YYYY-MM-DD) */
  referenceDate: string;
  /** 권리취득일 소급 여부 */
  isRightAcquisitionSoGup: boolean;
  /** 법적 근거 */
  legalBasis: string;
  /** 설명 */
  description: string;
}

/**
 * [P3-9] 주택 수 산정 기준일 결정
 *
 * 분양권·입주권으로 취득하는 경우 권리취득일을 기준일로 소급 적용.
 * 일반 매매는 잔금지급일(또는 오늘) 기준.
 *
 * @param input 취득 방식 및 날짜 정보
 * @param today 오늘 날짜 (기본값: 현재 날짜, 테스트 시 주입)
 */
export function getHouseCountReferenceDate(
  input: RightAcquisitionDateInput,
  today: string = new Date().toISOString().slice(0, 10)
): RightAcquisitionDateResult {
  // 분양권·입주권으로 취득하는 경우 권리취득일 소급
  if (input.acquiredViaRight && input.rightAcquisitionDate) {
    return {
      referenceDate: input.rightAcquisitionDate,
      isRightAcquisitionSoGup: true,
      legalBasis: ACQUISITION.HOUSE_COUNT_RIGHT_ACQUISITION_DATE,
      description: `분양권·입주권으로 취득 → 권리취득일(${input.rightAcquisitionDate}) 기준으로 보유 주택 수 소급 산정 (${ACQUISITION.HOUSE_COUNT_RIGHT_ACQUISITION_DATE})`,
    };
  }

  // 일반 취득: 잔금지급일 기준
  const referenceDate = input.balancePaymentDate ?? today;
  return {
    referenceDate,
    isRightAcquisitionSoGup: false,
    legalBasis: ACQUISITION.HOUSE_COUNT_CALC,
    description: `일반 취득 → 잔금지급일(${referenceDate}) 기준 보유 주택 수 산정`,
  };
}

// ============================================================
// 1세대 내 다회 취득 — 가장 빠른 권리취득일
// ============================================================

/**
 * 1세대 내 다회 취득 시 가장 빠른 권리취득일 선택
 *
 * §28의4①: 1세대 내 매매·교환·증여로 동일 분양권 취득일 둘 이상 → 가장 빠른 날
 *
 * @param rightDates 권리취득일 배열 (YYYY-MM-DD)
 * @returns 가장 빠른 날짜 (YYYY-MM-DD)
 */
export function getEarliestRightAcquisitionDate(rightDates: string[]): string {
  if (rightDates.length === 0) {
    return new Date().toISOString().slice(0, 10);
  }
  return rightDates.reduce((earliest, date) => {
    return date < earliest ? date : earliest;
  }, rightDates[0]);
}
