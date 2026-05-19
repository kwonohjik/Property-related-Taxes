/**
 * 해외주식 양도소득세 — 입력·결과 타입 (PR-4A)
 *
 * 법령: 소득세법 §94①3다목 + §118의2~§118의8 (2026.4.21. 시행)
 * 시행령: §157의3, §178의3, §178의5, §178의7
 */

// ============================================================
// 해외주식 Input (PR-4A)
// ============================================================

export type ForeignStockInput = {
  /** 도메인 식별자 */
  marketType: "foreign_stock";

  // ── 납세의무 요건 §118의2 ──
  /** 국내 주소·거소 거주 연수 (만 년 수) — 5년 이상 시 납세의무 충족 */
  yearsResidentInKorea: number;

  // ── 자산 분류 §157의3 ──
  /** §157의3①1호: 외국법인 발행 주식 (true) / 해외상장 내국법인 DR (false — 후속 PR) */
  isListedForeignCorp: boolean;
  /** 종목명 (표시용) */
  stockName: string;
  /** ISO 2자리 국가코드 */
  countryCode: string;

  // ── 양도 정보 ──
  /** 주식 수 (정수) */
  shareCount: number;
  transferDate: Date;
  /** 양도가액 입력 방식: 1주당 단가 또는 총액 */
  transferPriceMode: "per_share" | "total";
  /** 1주당 외화 양도단가 (transferPriceMode="per_share" 시) */
  perShareTransferPriceForeign?: number;
  /** 총 외화 양도가액 (transferPriceMode="total" 시) */
  totalTransferPriceForeign?: number;
  /** 양도 통화코드: "USD" | "JPY" | "EUR" | "HKD" | "CNY" | "GBP" | "OTHER" */
  transferCurrencyCode: string;
  /** 양도일 기준환율 (원/외화). §178의5 */
  transferExchangeRate: number;

  // ── 취득 정보 ──
  acquisitionDate: Date;
  /** "actual": 실지거래가액, "market_price": §178의3 시가 산정 */
  acquisitionMode: "actual" | "market_price";
  /** 1주당 외화 취득단가 (acquisitionMode="actual" 시) */
  perShareAcquisitionPriceForeign?: number;
  acquisitionCurrencyCode: string;
  /** 취득일 기준환율. §178의5 */
  acquisitionExchangeRate: number;

  // ── 필요경비 (외화) §118의4 ──
  /** 자본적지출액 (외화) */
  capitalExpenditureForeign: number;
  /** 양도비 (외화, 수수료 포함) */
  transferCostForeign: number;

  // ── 외국납부세액 §118의6 ──
  hasForeignTax: boolean;
  /** 외국에서 납부한 세액 (외화) */
  foreignTaxPaidForeign?: number;
  foreignTaxCurrencyCode?: string;
  /** 납세일 기준환율 */
  foreignTaxExchangeRate?: number;
  /**
   * §118의6 선택: 세액공제 또는 필요경비 산입
   * "credit": 세액공제 (한도 = 산출세액 × B/C — 단일 자산 시 산출세액 전액)
   * "expense": 필요경비 산입
   */
  foreignTaxMethod: "credit" | "expense";

  // ── 기타 ──
  isElectronicFiling: boolean;
};

// ============================================================
// 해외주식 Result (PR-4A)
// ============================================================

export type ForeignStockResult = {
  /**
   * 과세 분류
   * "foreign_stock": 납세의무 충족 정상 과세
   * "not_liable": §118의2 요건 미충족 (5년 미만 거주)
   */
  taxCategory: "foreign_stock" | "not_liable";
  isLiable: boolean;
  /** 비해당 사유 설명 (not_liable 시 */
  ineligibleReason?: string;

  // ── 양도가액 (원화 환산) §178의5 ──
  /** 양도가액 원화 */
  transferPriceKrw: number;
  /** 취득가액 원화 */
  acquisitionPriceKrw: number;
  /** 자본적지출 + 양도비 원화 (외국납부세액 필요경비 산입 선택 시 포함) */
  necessaryExpensesKrw: number;
  /** 양도차익 (음수 가능) */
  transferGain: number;

  /** §118의7 기본공제 250만원 (§103①·§118의10④와 별도 그룹) */
  basicDeduction: number;
  /** 과세표준 (LTHD 미적용 — §118의8 단서) */
  taxBase: number;

  // ── §118의5 → §55① 6~45% 8구간 누진 ──
  /** 적용 세율 (최고 구간 세율) */
  appliedRate: number;
  /** 누진공제액 */
  progressiveDeduction: number;
  /** 산출세액 */
  incomeTax: number;
  /** 지방소득세 (10원 미만 절사) */
  localIncomeTax: number;

  // ── §118의6 외국납부세액공제 ──
  /** 공제한도 (세액공제 선택 시: 단일 자산 = 산출세액 전액) */
  foreignTaxCreditLimit?: number;
  /** 실제 공제액 */
  foreignTaxCreditApplied?: number;
  /** 외국납부세액 원화 환산액 */
  foreignTaxPaidKrw?: number;
  /** 필요경비 산입액 (expense 선택 시) */
  foreignTaxExpenseApplied?: number;

  // ── 최종 ──
  /** 최종 납부세액 = 산출세액 - 외국납부세액공제 */
  finalTax: number;
  finalLocalTax: number;
  /** 총 납부액 = finalTax + finalLocalTax */
  totalTax: number;

  // ── 산식 echo (결과 카드 표시용) ──
  transferExchangeRate: number;
  acquisitionExchangeRate: number;
  foreignTaxExchangeRate?: number;
  shareCount: number;

  // ── 디버그·경고 ──
  warnings: string[];
  appliedRules: string[];
};
