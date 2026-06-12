/**
 * 국외전출세 — 입력·결과 타입 (PR-4B)
 *
 * 법령: 소득세법 §118의9~§118의16 (2026.4.21. 시행)
 * 시행령: §178의8, §178의9, §178의10, §167의8
 *
 * 설계 근거: docs/02-design/features/stock-transfer-exit-tax.engine.design.md §5.4~§5.5
 */

// ============================================================
// 국외전출세 보유 종목 (1건 단위)
// ============================================================

export type ExitTaxHolding = {
  /** UI key (nanoid 또는 uuid) */
  id: string;
  /** 종목명 (표시용) */
  stockName: string;
  /**
   * 시장 분류. §118의9① 범위 = §94①3가·나목(상장·비상장 주식) + §94①4다·라목(기타자산: 과점주주·부동산과다보유법인).
   * 기타자산 다·라목은 §94①4의 주식이므로 "unlisted"로 입력 — 출국일 시가 × 주수 − 취득가 + §118의11 동일 세율(별도 분기 불요).
   */
  marketType: "kospi" | "kosdaq" | "konex" | "unlisted";
  /** 보유 주식 수 (정수) */
  shareCount: number;
  /**
   * 취득일
   * 주의: route handler에서 holdings[] 배열 map toDate() 필수
   * (평면 coerceDates로 배열 내부 미변환 — 디자인 §6.2 R2-04)
   */
  acquisitionDate: Date;
  /** 1주당 취득가액 (원화) */
  perShareAcquisitionPrice: number;

  // ── 출국일 시가 산정 모드 (§178의9) ──
  /**
   * "market_price"    → §178의9① 출국일 거래가액 (직접 입력)
   * "prior_year_std"  → §99①3 기준시가 (상장: 1개월 종가평균)
   * "unlisted_sample" → §178의9②2호가목 전후 각 3개월 매매사례가액
   * "unlisted_std"    → §99①4 비상장 기준시가 (매매사례 없음)
   */
  departureDayValuationMode:
    | "market_price"
    | "prior_year_std"
    | "unlisted_sample"
    | "unlisted_std";

  /** §178의9① 출국일 거래가액 1주당 (market_price 모드) */
  departureDayMarketPrice?: number;
  /** §99①3 기준시가 — 1개월 종가평균 1주당 (prior_year_std 모드) */
  priorYearEndMonthAvg?: number;
  /** 전후 각 3개월 매매사례가액 1주당 (unlisted_sample 모드) */
  unlistedSamplePrice?: number;
  /** §99①4 비상장 기준시가 1주당 (unlisted_std 모드) */
  unlistedStdPricePerShare?: number;
};

// ============================================================
// 국외전출세 Input (PR-4B)
// ============================================================

export type ExitTaxInput = {
  /** 도메인 식별자 */
  marketType: "exit_tax";

  // ── 거주자 요건 §118의9①1호 ──
  /** 출국일 전 10년 중 국내 주소·거소 합계 (만 년 수) — 5년 이상 필수 */
  yearsResidentLast10: number;
  /** 출국일 */
  departureDate: Date;

  // ── 대주주 요건 §178의8 → §167의8 준용 ──
  /** 직전 연도말 대주주 여부 (사용자 직접 판정 입력) */
  isMajorShareholder: boolean;

  // ── 보유 주식 (종목별 다건) ──
  /** 최소 1건 이상 필수 */
  holdings: ExitTaxHolding[];

  // ── 납부유예 §118의16 ──
  /** 납부유예 신청 여부 */
  deferralRequested: boolean;
  /**
   * 납부유예 사유 (5년 또는 10년 연장 분기)
   * "none"           → 납부유예 미신청 (deferralRequested=false 시)
   * "study_abroad"   → 국외유학 등 대통령령 사유 → 10년 유예
   * "other_10yr"     → 기타 10년 연장 사유
   * 그 외            → 기본 5년 유예
   */
  deferralReason: "none" | "study_abroad" | "other_10yr";

  // ── 납부유예 후 실제 양도 (경정청구 §118의15⑤) ──
  /** 실제 양도일 (납부유예 + 실양도 완료 시) */
  actualTransferDate?: Date;
  /** 실제 양도 1주당 단가 (원화) — 조정공제 §118의12 계산용 */
  actualTransferPricePerShare?: number;

  // ── 외국납부세액 §118의13 ──
  /** 외국 실양도 후 납부한 세액 (원화 환산) */
  foreignTaxPaid?: number;
  /**
   * §118의13② 적용 배제 사유 (3값 enum — 디자인 R2-02 정정)
   * "none"            → 배제 사유 없음 → §118의13①공제 적용
   * "credit_allowed"  → 1호: 외국정부가 산출세액에 대해 공제 허용
   * "step_up"         → 2호: 외국정부가 취득가액을 출국일 시가로 조정
   */
  foreignTaxExclusionReason: "none" | "credit_allowed" | "step_up";

  // ── §118의14 비거주자 세액공제 ──
  /** §156①7 원천징수액 (원화) — 실양도 후 비거주자 과세 시 */
  domesticSourceTaxWithheld?: number;

  // ── 보유현황 신고 §118의15 ──
  /** 출국일 전날까지 보유현황 신고 여부 */
  hasFiledHoldingsReport: boolean;
  /**
   * 보유현황 미신고 가산세 계산용 액면금액 합계 (원화)
   * §118의15: 출국일 전날 액면금액(무액면: 자본금÷발행총수) × 주수 × 2%
   * 사용자 입력 — 엔진은 totalFaceValue × 0.02 계산
   */
  totalFaceValue?: number;

  // ── 재전입 환급 §118의17①1호 ──
  /**
   * 출국일부터 5년 이내 미양도 + 국내 재입국하여 거주자가 된 경우 (§118의17①1호).
   * true 시 납부세액 환급(납부 완료) 또는 납부유예 취소(유예 중) 예정액 정보성 산출.
   */
  reenteredWithin5Years: boolean;

  // ── 납부유예 이자상당액 §118의16④·시행령 §178의12③ ──
  /**
   * 납부유예 일수 (유예 시작 ~ 실제 납부일). 미입력 시 이자상당액 미산출(안내만).
   * §178의12③ 계산식: 이자상당액 = 유예세액 × 일수 × 1일당 이자율.
   */
  deferralInterestDays?: number;
  /**
   * 1일당 이자율 (소수 — 예: 0.000022 = 1일 10만분의 22). 국세기본법 시행령 §43의3②(연도별 변동) — 사용자 입력.
   * deferralInterestDays와 함께 입력 시 이자상당액 산출.
   */
  deferralInterestDailyRate?: number;
};

// ============================================================
// 국외전출세 종목별 결과
// ============================================================

export type ExitTaxHoldingResult = {
  /** ExitTaxHolding.id 참조 */
  id: string;
  /** 종목명 */
  stockName: string;
  /** 출국일 시가 × 주수 (총 간주양도가액) */
  departureDayValue: number;
  /** 1주당 출국일 시가 */
  departureDayValuePerShare: number;
  /** 취득가액 합계 (1주당 취득가액 × 주수) */
  acquisitionCost: number;
  /** 종목별 양도차익 (음수 가능) */
  transferGain: number;
  /** 적용된 시가 산정 모드 */
  valuationMode: ExitTaxHolding["departureDayValuationMode"];
};

// ============================================================
// 국외전출세 Result (PR-4B)
// ============================================================

export type ExitTaxResult = {
  /**
   * 과세 분류
   * "exit_tax"    → §118의9 요건 충족, 정상 과세
   * "not_liable"  → 요건 미충족 (거주기간 미달 또는 대주주 미해당)
   */
  taxCategory: "exit_tax" | "not_liable";
  /** §118의9 요건 충족 여부 */
  isLiable: boolean;
  /** 비해당 사유 설명 */
  ineligibleReason?: string;

  // ── 거주자 요건 판정 결과 ──
  residencyEligible: boolean;
  majorShareholderEligible: boolean;

  // ── 종목별 계산 결과 ──
  holdingDetails: ExitTaxHoldingResult[];

  // ── 합산 양도차익 ──
  /** 전체 종목 양도차익 합산 */
  totalTransferGain: number;
  /** §118의10④ 기본공제 250만원 */
  basicDeduction: number;
  /** 과세표준 = max(0, totalTransferGain − basicDeduction) */
  taxBase: number;

  // ── §118의11 → §104①11가목2) 산출세액 ──
  /** 산출세액 (3억 이하 20% / 초과 25% 누진공제 15,000,000) */
  incomeTax: number;
  /** 지방소득세 (10원 미만 절사) */
  localIncomeTax: number;

  // ── 납부유예 §118의16 ──
  /** 유예 연수 (5년 또는 10년) */
  deferralYears: number;
  /** 유예 세액 (납부유예 신청 시 = incomeTax) */
  deferredTaxAmount: number;
  /** 이자상당액 안내 메시지 (일수·이자율 미입력 시) */
  deferralInterestNote: string;
  /**
   * [B-1②a] 납부유예 이자상당액 (§118의16④·시행령 §178의12③) — 일수·1일당 이자율 입력 시 산출.
   * = floor(유예세액 × 일수 × 1일당 이자율). 미입력 시 undefined(안내만).
   */
  deferralInterest?: number;

  // ── 경정청구 계산 (납부유예 후 실양도 시) ──
  /** §118의12 조정공제액 (실양도가 < 출국일 시가 시) */
  adjustmentDeduction?: number;
  /** §118의13 외국납부세액공제액 */
  foreignTaxCreditApplied?: number;
  /** §118의14 비거주자 세액공제액 */
  domesticTaxCreditApplied?: number;
  /** 경정 후 최종 세액 (incomeTax − 조정공제 − 외국납부세액공제 − 비거주자공제) */
  finalTaxAfterAdjustment?: number;

  // ── 가산세 ──
  /** §118의15 보유현황 미신고 가산세 */
  holdingsReportPenalty?: number;

  // ── 재전입 환급 §118의17①1호 ──
  /**
   * 재입국(5년 이내 미양도 거주자) 시 환급/취소 정보성 산출 (reenteredWithin5Years=true 시).
   * §118의17③: §118의15④ 미신고 가산세(holdingsReportPenalty)는 환급 제외.
   */
  reentryRefund?: {
    /** 납부유예 중 → true(취소) / 납부 완료 → false(환급) */
    isDeferralCancel: boolean;
    /** 환급예정액 또는 취소액 (소득세 + 지방소득세 — 미신고 가산세 제외) */
    amount: number;
    /** 안내 (1년 이내 신청 §118의17①·가산세 환급 제외 ③) */
    note: string;
  };

  // ── 디버그 ──
  warnings: string[];
  appliedRules: string[];
};
