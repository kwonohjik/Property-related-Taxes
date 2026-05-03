/**
 * 세대 별도 인정 4종 판정 모듈 (P3-6)
 *
 * 지방세법 시행령 §28의3② — 별도 세대 인정 4종:
 * 1. 30세 미만 자녀 + 12개월 소득 ≥ 기준중위소득 40% + 독립 생계 (미성년 제외)
 * 2. 65세 이상 직계존속 동거봉양 합가
 * 3. 90일 이상 해외 출국
 * 4. 취득 후 60일 이내 주소 이전(분리)
 *
 * [v4 D7] 미성년 예외 강조:
 * 30세 미만이더라도 미성년(만 19세 미만)이면 1호 별도 세대 인정 불가.
 */

import { ACQUISITION, ACQUISITION_CONST } from "../legal-codes";
import type { Household, HouseholdMember, SeparateHouseholdInfo, SeparateHouseholdReason } from "./types";

// ============================================================
// 세대 별도 인정 4종 판정 함수
// ============================================================

/**
 * [P3-6] 1세대 별도 인정 여부 판정
 *
 * 동일 주소에 거주하더라도 다음 4가지 사유 중 하나라도 해당하면
 * 별도 세대로 인정되어 주택 수가 분리 계산됨.
 *
 * @param household 1세대 정보
 * @returns 별도 세대 인정 여부 + 사유
 */
export function isSeparateHousehold(
  household: Household | undefined
): SeparateHouseholdInfo {
  if (!household || household.members.length === 0) {
    return {
      isSeparate: false,
    };
  }

  for (const member of household.members) {
    const result = checkMemberSeparateEligibility(member);
    if (result.isSeparate) {
      return result;
    }
  }

  return { isSeparate: false };
}

/**
 * 개별 구성원에 대한 별도 세대 인정 사유 판정
 */
function checkMemberSeparateEligibility(member: HouseholdMember): SeparateHouseholdInfo {
  // ── 사유 1: 30세 미만 자녀 소득 조건 (§28의3② 1호) ──
  // [v4 D7] 미성년(만 19세 미만) 제외
  if (
    member.relation === "child" &&
    member.age < ACQUISITION_CONST.SEPARATE_HOUSEHOLD_AGE_LIMIT &&
    !member.isMinor
  ) {
    // 소득 조건: 12개월 소득 ≥ 기준중위소득 40%
    const income = member.income12Months ?? 0;
    const threshold = (member.medianIncome ?? 0) * ACQUISITION_CONST.SEPARATE_HOUSEHOLD_INCOME_RATIO;

    if (income >= threshold && threshold > 0 && member.hasIndependentLivelihood) {
      const reason: SeparateHouseholdReason = "under30_income";
      return {
        isSeparate: true,
        reason,
        description: `30세 미만 자녀(${member.age}세) — 12개월 소득(${income.toLocaleString()} ≥ 기준중위소득 40%(${threshold.toLocaleString()} + 독립 생계 유지 → 별도 세대 인정`,
        legalBasis: ACQUISITION.SEPARATE_HOUSEHOLD_INCOME,
      };
    }

    // 30세 미만이지만 미성년인 경우 경고: 해당 없음 (예외 명시)
    // (미성년은 function 외부에서 isMinor 체크로 이미 필터됨)
  }

  // ── 사유 2: 65세 이상 직계존속 동거봉양 합가 (§28의3② 2호) ──
  if (
    (member.relation === "parent" || member.relation === "grandparent") &&
    member.age >= ACQUISITION_CONST.SEPARATE_HOUSEHOLD_ELDER_AGE &&
    member.isElderlyCohabitation
  ) {
    const reason: SeparateHouseholdReason = "over65_cohabitation";
    return {
      isSeparate: true,
      reason,
      description: `65세 이상 직계존속(${member.age}세) 동거봉양 합가 → 별도 세대 인정`,
      legalBasis: ACQUISITION.SEPARATE_HOUSEHOLD_ELDER,
    };
  }

  // ── 사유 3: 90일 이상 해외 출국 (§28의3② 3호) ──
  if (member.overseasMoreThan90Days) {
    const reason: SeparateHouseholdReason = "overseas_90days";
    return {
      isSeparate: true,
      reason,
      description: `90일 이상 해외 출국 중 → 별도 세대 인정`,
      legalBasis: ACQUISITION.SEPARATE_HOUSEHOLD_OVERSEAS,
    };
  }

  // ── 사유 4: 취득 후 60일 이내 주소 이전(분리) (§28의3② 4호) ──
  if (member.relocateWithin60Days) {
    const reason: SeparateHouseholdReason = "relocate_60days";
    return {
      isSeparate: true,
      reason,
      description: `취득 후 60일 이내 주소 이전(분리) → 별도 세대 인정`,
      legalBasis: ACQUISITION.SEPARATE_HOUSEHOLD_RELOCATE,
    };
  }

  return { isSeparate: false };
}

// ============================================================
// 미성년 경고 헬퍼
// ============================================================

/**
 * 미성년 자녀가 30세 미만 소득 조건을 충족하는 것처럼 보이는지 확인
 * (UI 경고 표시용 — 실제 인정은 되지 않음)
 */
export function hasMinorWithApparentIncomeCondition(household: Household | undefined): boolean {
  if (!household) return false;
  return household.members.some(
    (m) =>
      m.relation === "child" &&
      m.age < ACQUISITION_CONST.SEPARATE_HOUSEHOLD_AGE_LIMIT &&
      m.isMinor === true &&
      (m.income12Months ?? 0) > 0
  );
}
