/**
 * 휴면법인 판정 헬퍼 — 지방세법 §13② 해석
 *
 * [P2-3] 휴면법인 취득세 중과 기산점 판정
 *
 * 지방세법 §13②는 "대도시에서의 법인의 설립(설치 또는 전입) 후 5년 이내" 부동산 취득에 중과.
 * 휴면법인 인수의 경우 과점주주 도달 시점을 "법인 설립 시점"으로 간주하여 5년 기산.
 *
 * 6가지 휴면법인 유형:
 *   1. 해산 법인 (청산 중)
 *   2. 해산간주 법인 (사업 실질 없음)
 *   3. 폐업 법인 (사업자등록 폐업)
 *   4. 재사업자등록 법인 (폐업 후 1년 이내 재등록)
 *   5. 계속등기 미이행 (1년 이상 미등기)
 *   6. 임원 50% 이상 교체 (실질 경영권 변경)
 */

// ============================================================
// 휴면법인 유형 열거
// ============================================================

/**
 * 휴면법인 6가지 유형
 * 지방세법 §13② 해석 기준 (행안부 유권해석 포함)
 */
export type DormantCorpType =
  | "dissolved"           // 1. 해산 법인 (청산 중)
  | "deemed_dissolved"    // 2. 해산간주 법인 (상법 §520의2)
  | "closed"              // 3. 폐업 법인 (사업자등록 폐업)
  | "re_registered_1yr"   // 4. 재사업자등록 (폐업 후 1년 이내 재등록)
  | "no_continue_reg_1yr" // 5. 계속등기 미이행 (1년 이상)
  | "officer_50pct_change";// 6. 임원 50% 이상 교체

// ============================================================
// 판정 입력 타입
// ============================================================

export interface DormantCorpAssessInput {
  /** 법인 인수 취득 여부 (과점주주 방식 취득) */
  isDormantCorpAcquisition?: boolean;
  /** 휴면법인 유형 (선택 — 없으면 '기타 휴면' 처리) */
  dormantCorpType?: DormantCorpType;
  /** 법인 설립일 (YYYY-MM-DD) */
  corpEstablishmentDate?: string;
  /** 과점주주 도달일 (YYYY-MM-DD) — 기산 시점 결정 */
  majorShareholderDate?: string;
  /** 기준일 (오늘 또는 취득일 — YYYY-MM-DD) */
  referenceDate?: string;
}

// ============================================================
// 판정 결과 타입
// ============================================================

export interface DormantCorpAssessResult {
  /** 휴면법인 중과 기산 적용 여부 */
  isDormantCorp: boolean;
  /** 5년 기산 시점 (YYYY-MM-DD) — 과점주주 도달일 */
  surchargeStartDate?: string;
  /** 5년 만료일 (YYYY-MM-DD) */
  surchargeEndDate?: string;
  /** 기준일 현재 5년 이내인지 */
  isWithin5Years?: boolean;
  /** 유형별 판정 근거 */
  dormantType?: DormantCorpType;
  /** 안내 메시지 */
  message: string;
  /** 경고 */
  warnings: string[];
}

// ============================================================
// 유형별 안내 메시지
// ============================================================

const DORMANT_TYPE_LABEL: Record<DormantCorpType, string> = {
  dissolved:            "해산 법인",
  deemed_dissolved:     "해산간주 법인 (상법 §520의2)",
  closed:               "폐업 법인 (사업자등록 폐업)",
  re_registered_1yr:    "재사업자등록 법인 (폐업 후 1년 이내 재등록)",
  no_continue_reg_1yr:  "계속등기 미이행 법인 (1년 이상)",
  officer_50pct_change: "임원 50% 이상 교체 법인",
};

// ============================================================
// 메인 함수: assessDormantCorp
// ============================================================

/**
 * 휴면법인 판정 — 5년 기산 시점 결정
 *
 * 순수 함수 — DB 직접 호출 없음.
 *
 * 과점주주 도달로 법인을 인수하는 경우:
 * - 휴면법인에 해당하면 과점주주 도달일을 "법인 설립 시점"으로 간주
 * - 5년 기산점이 과점주주 도달일로 소급됨
 * - 결과적으로 인수 직후부터 5년간 대도시 내 부동산 취득 시 §13② 중과 위험
 *
 * @param input 판정 입력 (isDormantCorpAcquisition, dormantCorpType, majorShareholderDate 등)
 * @returns 판정 결과 (5년 기산 여부 + 만료일)
 */
export function assessDormantCorp(input: DormantCorpAssessInput): DormantCorpAssessResult {
  const warnings: string[] = [];

  // 휴면법인 취득 아닌 경우
  if (!input.isDormantCorpAcquisition) {
    return {
      isDormantCorp: false,
      message: "휴면법인 인수 아님 — §13② 기산 소급 미적용",
      warnings,
    };
  }

  // 과점주주 도달일 기준 5년 기산
  const startDateStr = input.majorShareholderDate;
  if (!startDateStr) {
    warnings.push(
      "과점주주 도달일 미입력 — 법인 설립일로 기산. 정확한 판정을 위해 도달일 입력 권장."
    );
    const fallbackStart = input.corpEstablishmentDate;
    if (!fallbackStart) {
      return {
        isDormantCorp: true,
        message: "휴면법인 취득 — 법인 설립일·과점주주 도달일 미입력으로 5년 기산 불명확",
        warnings: [...warnings, "법인 설립일 및 과점주주 도달일 입력 필요 (세무사 확인 권장)"],
      };
    }
    return build5YearResult(fallbackStart, input.referenceDate, input.dormantCorpType, warnings);
  }

  const dormantTypeLabel = input.dormantCorpType
    ? DORMANT_TYPE_LABEL[input.dormantCorpType]
    : "휴면법인 (유형 미분류)";

  warnings.push(
    `${dormantTypeLabel} 인수 확인 — 과점주주 도달일(${startDateStr})부터 5년간 대도시 내 부동산 취득 시 §13② 중과 위험.`
  );

  return build5YearResult(startDateStr, input.referenceDate, input.dormantCorpType, warnings);
}

// ============================================================
// 내부 헬퍼
// ============================================================

function build5YearResult(
  startDateStr: string,
  referenceDateStr: string | undefined,
  dormantType: DormantCorpType | undefined,
  warnings: string[]
): DormantCorpAssessResult {
  const startDate = new Date(startDateStr);
  const endDate = new Date(startDate);
  endDate.setFullYear(endDate.getFullYear() + 5);
  const surchargeEndDate = endDate.toISOString().slice(0, 10);

  const refDate = referenceDateStr ? new Date(referenceDateStr) : new Date();
  const isWithin5Years = refDate <= endDate;

  const dormantLabel = dormantType ? DORMANT_TYPE_LABEL[dormantType] : "휴면법인";

  return {
    isDormantCorp: true,
    surchargeStartDate: startDateStr,
    surchargeEndDate,
    isWithin5Years,
    dormantType,
    message: isWithin5Years
      ? `${dormantLabel} 인수 — 과점주주 도달일(${startDateStr})부터 5년 이내 (만료: ${surchargeEndDate}). §13② 중과 위험`
      : `${dormantLabel} 인수 — 과점주주 도달일(${startDateStr})부터 5년 경과 (만료: ${surchargeEndDate}). §13② 중과 불해당`,
    warnings,
  };
}
