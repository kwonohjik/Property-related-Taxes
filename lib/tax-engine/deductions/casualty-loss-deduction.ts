/**
 * §23 재해손실공제 계산 엔진 (상증법 §23 + 상증령 §20)
 *
 * 법령 근거:
 *   상증법 §23① 거주자 상속개시 + §67 신고기한 이내 + 대통령령 재난으로
 *              상속재산이 멸실·훼손 → 손실가액을 과세가액에서 공제.
 *              단서: 보험금 수령·구상권 행사로 보전 가능 금액은 제외.
 *   상증령 §20① 재난 = 화재·붕괴·폭발·환경오염사고·자연재해 등.
 *   상증령 §20② 공제 손실가액 = 재난으로 인하여 손실된 상속재산의 가액.
 *   상증통 23-20…1 보전 가능 가액 미확정 시 재난 종류·보험금·구상권 진상 참작.
 *
 * §24 한도: §23은 §24 본문 열거 공제("§19부터 §23까지")에 포함 →
 *            rawTotal 합산 후 applyDeductionLimit() 자동 capping.
 *
 * ⚠️ 혼동 금지:
 *   - 이 파일의 §23 = 상속세 재해손실공제 (casualtyLoss / casualtyLossDeduction)
 *   - inheritance-deductions.ts의 disasterLossDeduction = §24③ 분자 보정용 (§54 증여세 재해손실공제)
 *
 * 정수 연산: max(0, lossValue − compensatedValue) — floor 불요 (정수 입력 보장)
 * Date 직접 비교 금지: parseISO → format → YYYY-MM-DD string 비교 (CLAUDE.md date-coerce 정책)
 */

import { addMonths, endOfMonth, format, parseISO } from "date-fns";
import type { CasualtyLossInput } from "../types/inheritance-gift.types";
import type { CasualtyLossDeductionDetail } from "../types/inheritance-deduction-detail.types";
import { INH } from "../legal-codes/inheritance-gift";

// ============================================================
// 반환 타입
// ============================================================

export interface CasualtyLossDeductionResult {
  /** §23 공제액 = max(0, lossValue − compensatedValue). 기한 외 → 0. */
  deduction: number;
  /** 상세 계산 근거 (casualtyLoss 미제공 시 undefined) */
  detail?: CasualtyLossDeductionDetail;
}

// ============================================================
// 신고기한 산정 헬퍼 (§67)
// ============================================================

/**
 * §67 상속세 신고기한 산정.
 * 거주자: 상속개시일이 속하는 달의 말일부터 6개월.
 * 비거주자: 9개월 (현재 v1은 거주자 기준만 — 비거주자는 isWithinFilingDeadline override로 처리).
 *
 * date-fns: endOfMonth(사망일) + 6개월 → YYYY-MM-DD string 반환.
 * Date 직접 비교 금지 (CLAUDE.md date-coerce 정책).
 */
function calcFilingDeadline(deathDate: string, monthsToAdd: number): string {
  return format(addMonths(endOfMonth(parseISO(deathDate)), monthsToAdd), "yyyy-MM-dd");
}

/**
 * §67 신고기한 내 재난 발생 여부 판정 (자동 판정 — string 비교).
 *
 * §23 조건: 상속개시일(deathDate) ≤ disasterDate ≤ 신고기한.
 * 양방향 검사:
 *   - 하한: disasterDate >= deathDate (재난이 상속개시 이후)
 *   - 상한: disasterDate <= filingDeadline (신고기한 이내)
 *
 * @param deathDate    사망일 (YYYY-MM-DD)
 * @param disasterDate 재난 발생일 (YYYY-MM-DD)
 * @param isResident   거주자 여부 (true=6개월 / false=9개월), 기본 true
 */
function isDisasterWithinFilingDeadline(
  deathDate: string,
  disasterDate: string,
  isResident = true,
): boolean {
  const months = isResident ? 6 : 9;
  const filingDeadline = calcFilingDeadline(deathDate, months);
  // YYYY-MM-DD string 사전식 비교 (Date 변환 금지)
  return disasterDate >= deathDate && disasterDate <= filingDeadline;
}

// ============================================================
// 메인 계산 함수
// ============================================================

/**
 * §23 재해손실공제 계산.
 *
 * 알고리즘:
 *   1. casualtyLoss 미제공 → deduction: 0, detail: undefined
 *   2. 신고기한 내 발생 판정:
 *      a. isWithinFilingDeadline 명시 → 그 값 사용
 *      b. disasterDate + deathDate 제공 시 자동 (양방향 경계 검사)
 *      c. 둘 다 미제공 → true (기한 내 가정; 입력 강제는 validate ⑧ 담당)
 *   3. 기한 외 → deduction: 0
 *   4. deduction = Math.max(0, lossValue − (compensatedValue ?? 0))  [정수]
 *
 * @param casualtyLoss  §23 재해손실공제 입력 (미제공 시 undefined)
 * @param deathDate     사망일 (YYYY-MM-DD) — 신고기한 자동 판정용
 * @param isResident    거주자 여부 (true=6개월 / false=9개월, 기본 true)
 */
export function calcCasualtyLossDeduction(
  casualtyLoss: CasualtyLossInput | undefined,
  deathDate: string | undefined,
  isResident = true,
): CasualtyLossDeductionResult {
  // ① casualtyLoss 미제공 → 공제 없음
  if (!casualtyLoss) {
    return { deduction: 0, detail: undefined };
  }

  const { lossValue, compensatedValue, disasterType, disasterDate, isWithinFilingDeadline } =
    casualtyLoss;

  // ② 신고기한 내 발생 판정
  let withinDeadline: boolean;

  if (isWithinFilingDeadline !== undefined) {
    // a. 명시 override 우선
    withinDeadline = isWithinFilingDeadline;
  } else if (disasterDate && deathDate) {
    // b. 자동 판정 (양방향 — 상속개시 이후 + 신고기한 이내)
    withinDeadline = isDisasterWithinFilingDeadline(deathDate, disasterDate, isResident);
  } else {
    // c. 둘 다 미제공 → 기한 내 가정 (validate ⑧에서 disasterDate 필수 검증)
    withinDeadline = true;
  }

  // ③ 신고기한 외 → 공제 0
  if (!withinDeadline) {
    return {
      deduction: 0,
      detail: {
        lossValue,
        compensatedValue: compensatedValue ?? 0,
        netDeduction: 0,
        isWithinFilingDeadline: false,
        disasterType,
        disasterDate,
      },
    };
  }

  // ④ §23 공제액 = max(0, lossValue − compensatedValue) — 정수 연산
  const netDeduction = Math.max(0, lossValue - (compensatedValue ?? 0));

  return {
    deduction: netDeduction,
    detail: {
      lossValue,
      compensatedValue: compensatedValue ?? 0,
      netDeduction,
      isWithinFilingDeadline: true,
      disasterType,
      disasterDate,
    },
  };
}

// ============================================================
// 법령 상수 re-export (사용처 편의)
// ============================================================

/** 상증법 §23 재해손실공제 법령 상수 */
export const CASUALTY_LOSS_LAW_REF = INH.DISASTER_DEDUCTION;
