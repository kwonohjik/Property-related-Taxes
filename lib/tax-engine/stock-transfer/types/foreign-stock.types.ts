/**
 * 해외주식 양도소득세 — 입력·결과 타입 (PR-4A + FS-09)
 *
 * 법령: 소득세법 §94①3다목 + §118의2~§118의8 (2026.4.21. 시행)
 * 시행령: §157의3, §178의3, §178의5, §178의7
 *
 * FS-09 §178의5② 장기할부 분할 수령 정식 구현 (2026-05-19):
 *   장기할부조건 양도 시 각 수령일의 기준환율을 개별 적용하여 합산 (시행령 §162①3호 준용)
 */

// ============================================================
// FS-09 장기할부 분할 수령 — 시점별 수령 항목
// 법령: 소득세법 시행령 §178의5② (2026.4.21. 시행)
// "장기할부조건의 경우 양도일을 수령한 날로 본다 → 수령일 기준환율 각 적용"
// ============================================================

/**
 * §178의5② 장기할부 시점별 수령 항목
 *
 * 각 수령일의 기준환율(원/외화)을 수령액에 곱하여 원화 환산.
 * route handler에서 receiptDate는 toDate() 개별 변환 필수 (배열 내 Date 침묵 stripping 방지).
 */
export type InstallmentReceipt = {
  /** 수령일 (§178의5② — 이 날짜의 기준환율 적용) */
  receiptDate: Date;
  /** 수령액 (외화) */
  amountForeign: number;
  /** 수령일 기준환율 (원/외화) — 외국환거래법 기준환율 또는 재정환율 */
  exchangeRate: number;
};

/**
 * §178의5② 분할 수령 결과 detail (결과 카드 표시용)
 */
export type InstallmentReceiptDetail = {
  /** 수령 모드 */
  mode: "installments";
  /** 시점별 환산 내역 */
  receipts: Array<{
    receiptDate: Date;
    amountForeign: number;
    exchangeRate: number;
    /** 원화 환산액 = floor(amountForeign × exchangeRate) */
    amountKrw: number;
  }>;
  /** 원화 합계 */
  totalKrw: number;
};

// ============================================================
// 해외주식 Input (PR-4A + FS-09)
// ============================================================

export type ForeignStockInput = {
  /** 도메인 식별자 */
  marketType: "foreign_stock";

  // ── 납세의무 요건 §118의2 ──
  /** 국내 주소·거소 거주 연수 (만 년 수) — 5년 이상 시 납세의무 충족 */
  yearsResidentInKorea: number;

  // ── 자산 분류 §157의3 ──
  /**
   * §157의3 자산 분류 (분류 라벨 — 계산 무영향: 1·2호 모두 §94①3다목 국외주식 동일 과세).
   *   true  = 1호 외국법인 발행 주식등
   *   false = 2호 내국법인 발행 주식등(국외 예탁기관 DR §152의2 증권예탁증권 포함)으로서 해외 증권시장 상장
   */
  isListedForeignCorp: boolean;
  /** 종목명 (표시용) */
  stockName: string;
  /** ISO 2자리 국가코드 */
  countryCode: string;

  // ── 양도 정보 ──
  /** 주식 수 (정수) */
  shareCount: number;
  transferDate: Date;
  /** 양도가액 입력 방식: 1주당 단가, 총액, 또는 분할 수령 */
  transferPriceMode: "per_share" | "total";
  /** 1주당 외화 양도단가 (transferPriceMode="per_share" 시) */
  perShareTransferPriceForeign?: number;
  /** 총 외화 양도가액 (transferPriceMode="total" 시) */
  totalTransferPriceForeign?: number;
  /** 양도 통화코드: "USD" | "JPY" | "EUR" | "HKD" | "CNY" | "GBP" | "OTHER" */
  transferCurrencyCode: string;
  /** 양도일 기준환율 (원/외화). §178의5① — single 모드에서 사용 */
  transferExchangeRate: number;

  // ── FS-09 §178의5② 장기할부 분할 수령 ──
  /**
   * 양도가액 수령 방식 (§178의5②)
   * "single": 단일 수령 — transferExchangeRate 적용 (기존 동작 유지)
   * "installments": 장기할부 분할 수령 — transferInstallmentReceipts[] 각 수령일 환율 적용
   */
  transferReceiptMode?: "single" | "installments";
  /**
   * §178의5② 장기할부 분할 수령 배열 (transferReceiptMode="installments" 시)
   * 각 수령일의 기준환율로 원화 환산 후 합산.
   * route handler에서 receiptDate를 배열 map으로 개별 toDate() 변환 필수.
   */
  transferInstallmentReceipts?: InstallmentReceipt[];

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

  // ── FS-09 §178의5② 장기할부 분할 수령 detail ──
  /**
   * 분할 수령 모드(installments) 시 시점별 환산 내역.
   * single 모드에서는 undefined.
   */
  transferReceiptDetail?: InstallmentReceiptDetail;

  // ── 디버그·경고 ──
  warnings: string[];
  appliedRules: string[];
};
