/**
 * 가업상속공제 사후관리 추징 + 이자상당액 산식 (Phase F)
 *
 * 법령: 상증법 §18의2⑤⑨ + 상증령 §15⑩⑮⑯⑰⑱
 *
 * KoreanLaw MCP 검증 2026-05-21:
 *   - §18의2⑤ 4호 위반 (5년 내):
 *     1호 가업용 자산 100분의 40 이상 처분 (자산처분비율 추가 곱)
 *     2호 가업 미종사 (상증령 §15⑪ — 대표이사 미종사·업종 변경·1년 휴/폐업)
 *     3호 지분 감소 (상증령 §15⑫)
 *     4호 5년 평균 정규직&총급여 모두 직전 2개 평균의 100분의 90 미달 (AND)
 *   - §15⑮ 추징율 — "대통령령으로 정하는 율" = 100분의 100 일률
 *   - §15⑩ 자산처분비율 = 처분자산 가액 / 전체 가업용자산 가액
 *   - §15⑯ 이자상당액 = 결정상속세액 × 일수 × (국세기본법 §43의3② 이자율 / 365)
 *
 * scope: 산식 헬퍼만 — 실 사용자 시뮬레이터 UI/시간경과 추적은 별도 PR.
 */

/** 사후관리 위반 유형 (상증법 §18의2⑤ 1~4호) */
export type FamilyBusinessViolationType =
  | "asset_disposal"      // 1호 — 자산처분비율 추가 곱
  | "business_cessation"  // 2호 — 가업 미종사
  | "share_decrease"      // 3호 — 지분 감소
  | "employment_drop";    // 4호 — 정규직&총급여 AND 미달

export interface FamilyBusinessRecaptureInput {
  /** 가업상속공제 적용액 (추징 대상 원금) */
  appliedDeduction: number;
  /** 위반 유형 */
  violationType: FamilyBusinessViolationType;
  /** [1호 한정] 자산처분비율 (0~1, §15⑩) — disposed_asset_value / total_business_asset_value */
  assetDisposalRatio?: number;
}

export interface FamilyBusinessInterestInput {
  /** 결정상속세액 (§15⑯ 1호) */
  determinedTax: number;
  /** 신고기한 다음날부터 사유 발생일까지 일수 (§15⑯ 2호) */
  daysFromFilingDeadlineToViolation: number;
  /** 국세기본법 시행령 §43의3② 이자율 (예: 0.022 = 연 2.2%) */
  annualInterestRate: number;
}

export interface FamilyBusinessRecaptureResult {
  /**
   * 과세가액 산입액 (§18의2⑤ = 적용공제 × 100% × 자산처분비율).
   * 이 금액을 상속개시 당시 과세가액에 산입해 상속세를 재계산한 '증가분'이 추징세액이다
   * (공제액 자체가 세액이 아님 — orchestrator가 재계산). C-2 수정.
   */
  taxableAmountAddback: number;
  /** 적용 추징율 (100분의 100 일률) */
  recaptureRate: number;
  /** 자산처분비율 (1호 한정, 그 외 1.0) */
  effectiveRatio: number;
  /** breakdown */
  breakdown: Array<{ label: string; amount: number; lawRef?: string }>;
}

export interface FamilyBusinessInterestResult {
  /** 이자상당액 (원, floor) */
  interestAmount: number;
  /** 일별 이자율 (annualInterestRate / 365) */
  dailyRate: number;
  /** breakdown */
  breakdown: Array<{ label: string; amount: number; lawRef?: string }>;
}

/**
 * 사후관리 추징세액 (상증령 §15⑮ + §15⑩).
 *
 * 산식:
 *   추징세액 = appliedDeduction × 100% × (자산처분 시 assetDisposalRatio, 그 외 1.0)
 *
 * 추징율은 100분의 100 일률 (영농 §16⑦과 동일 구조 — 기간경과별 차등 아님).
 */
export function calcFamilyBusinessRecapture(
  input: FamilyBusinessRecaptureInput,
  lawRef: string,
): FamilyBusinessRecaptureResult {
  const { appliedDeduction, violationType, assetDisposalRatio } = input;
  const recaptureRate = 1.0; // 상증령 §15⑮ "100분의 100"

  // 1호 자산처분 한정 — assetDisposalRatio 추가 곱
  const effectiveRatio = violationType === "asset_disposal" && assetDisposalRatio !== undefined
    ? Math.max(0, Math.min(1, assetDisposalRatio))
    : 1.0;

  const taxableAmountAddback = Math.floor(appliedDeduction * recaptureRate * effectiveRatio);

  const violationLabel: Record<FamilyBusinessViolationType, string> = {
    asset_disposal: "1호 가업용 자산 40% 이상 처분",
    business_cessation: "2호 가업 미종사",
    share_decrease: "3호 지분 감소",
    employment_drop: "4호 정규직&총급여 AND 미달",
  };

  const breakdown: Array<{ label: string; amount: number; lawRef?: string }> = [
    { label: "가업상속공제 적용액 (추징 원금)", amount: appliedDeduction },
    { label: `위반 유형 — ${violationLabel[violationType]}`, amount: 0 },
    { label: "추징율 100분의 100 일률 (상증령 §15⑮)", amount: Math.floor(recaptureRate * 1_000_000) },
  ];

  if (violationType === "asset_disposal") {
    breakdown.push({
      label: `자산처분비율 (상증령 §15⑩, ${(effectiveRatio * 100).toFixed(2)}%)`,
      amount: Math.floor(effectiveRatio * 1_000_000),
    });
  }

  breakdown.push({ label: "과세가액 산입액 (§18의2⑤)", amount: taxableAmountAddback, lawRef });

  return {
    taxableAmountAddback,
    recaptureRate,
    effectiveRatio,
    breakdown,
  };
}

/**
 * 이자상당액 (상증령 §15⑯).
 *
 * 산식:
 *   이자상당액 = determinedTax × daysFromFilingDeadlineToViolation × (annualInterestRate / 365)
 *
 * @param input 결정세액 + 일수 + 연이자율 (예 0.022 = 2.2%)
 */
export function calcFamilyBusinessInterest(
  input: FamilyBusinessInterestInput,
  lawRef: string,
): FamilyBusinessInterestResult {
  const { determinedTax, daysFromFilingDeadlineToViolation, annualInterestRate } = input;
  const dailyRate = annualInterestRate / 365;
  const interestAmount = Math.max(
    0,
    Math.floor(determinedTax * daysFromFilingDeadlineToViolation * dailyRate),
  );

  return {
    interestAmount,
    dailyRate,
    breakdown: [
      { label: "결정상속세액 (§15⑯ 1호)", amount: determinedTax },
      { label: `경과 일수 — 신고기한 다음날~사유발생일 (${daysFromFilingDeadlineToViolation}일)`, amount: daysFromFilingDeadlineToViolation },
      { label: `일별 이자율 (연 ${(annualInterestRate * 100).toFixed(2)}% / 365)`, amount: Math.floor(dailyRate * 1_000_000_000) },
      { label: "이자상당액 (§15⑯)", amount: interestAmount, lawRef },
    ],
  };
}

/**
 * §15⑩ 자산처분비율 산정 헬퍼.
 *
 * 산식: disposed / total. 결과 0~1.
 *
 * §15⑩ 단서 — 동일 호 재차 부과 시 종전 처분 자산 가액을 분모·분자에서 제외.
 * 본 PR은 사용자 입력값 (총자산·처분자산) 그대로 사용. 재차 부과 처리는 후속 PR.
 */
export function calcAssetDisposalRatio(disposedValue: number, totalBusinessAssetValue: number): number {
  if (totalBusinessAssetValue <= 0) return 0;
  return Math.max(0, Math.min(1, disposedValue / totalBusinessAssetValue));
}
