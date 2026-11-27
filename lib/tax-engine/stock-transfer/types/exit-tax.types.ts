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
   *
   * 2027.1.1. 이후 출국분부터 `"foreign_stock"`(§94①3다목 국외주식등)이 추가된다 — 기존 국외주식 트랙
   * (`ForeignStockInput.marketType`)과 같은 값. 2026.12.31. 이전 출국분에서는 과세 대상이 아니라 **제외·echo**한다.
   */
  marketType: "kospi" | "kosdaq" | "konex" | "unlisted" | "foreign_stock";
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
   * "foreign_market_price" → 국외주식 출국일 외화 거래가액(1주당) × 출국일 기준환율 — 외화 경로
   * "foreign_decree_178_3"  → 국외주식 시행령 §178의3 시가(외화 1주당, 직접 입력) × 출국일 기준환율 — 외화 경로
   * 두 외화 모드는 `marketType: "foreign_stock"` 종목에서만 쓴다(아래 「외화 환산」).
   */
  departureDayValuationMode:
    | "market_price"
    | "prior_year_std"
    | "unlisted_sample"
    | "unlisted_std"
    | "foreign_market_price"
    | "foreign_decree_178_3";

  /** §178의9① 출국일 거래가액 1주당 (market_price 모드) */
  departureDayMarketPrice?: number;
  /** §99①3 기준시가 — 1개월 종가평균 1주당 (prior_year_std 모드) */
  priorYearEndMonthAvg?: number;
  /** 전후 각 3개월 매매사례가액 1주당 (unlisted_sample 모드) */
  unlistedSamplePrice?: number;
  /** §99①4 비상장 기준시가 1주당 (unlisted_std 모드) */
  unlistedStdPricePerShare?: number;

  // ── 국외주식(`marketType: "foreign_stock"`) 전용 — 소득세법 §94①3다목 · 시행령 §157의3 ──
  /**
   * §157의3 자산 분류 — `ForeignStockInput.isListedForeignCorp`와 **같은 이름·의미**.
   *   true  = 1호 외국법인 발행 주식등 / false = 2호 내국법인 발행 해외 증권시장 상장 주식등.
   * 미입력은 **true**(외국법인)다(3중 패턴 default — ④·⑧·엔진 동일). 외국법인 발행은 중소기업 가목이 불가하다.
   */
  isListedForeignCorp?: boolean;
  /**
   * 중소기업 해당 여부 — §118의11 2호**가목**(10%) / 나목(그 밖 20%). `isListedForeignCorp`가 true(기본)면 무시(false 취급).
   * 미입력은 나목 20% — 중소기업 여부는 납세자만 아는 사실이라 추정하지 않는다.
   */
  isSmallMediumEnterprise?: boolean;
  /** ISO 2자리 국가코드 (표시용 — 계산 무영향) */
  countryCode?: string;
  /** 통화 코드 (표시용 — 계산 무영향) */
  foreignCurrencyCode?: string;

  // ── 외화 환산 (2027.1.1. 이후 출국 · 국외주식) ──
  // 외화 시가 모드(`foreign_market_price` · `foreign_decree_178_3`)를 고르면 아래 4개가 **모두** 필요하고,
  // 원화 단가(`departureDayMarketPrice`·`perShareAcquisitionPrice`)는 비워 둔다(섞으면 `INVALID_INPUT`).
  // 환산: 종목당 총액에서 1회만 절사 — `exit-tax-fx.ts`의 `toKrwExact`.
  /** 1주당 외화 출국일 시가 */
  departureDayPriceForeign?: number;
  /** 출국일 기준환율 (원/외화, 소수 4자리까지) */
  departureExchangeRate?: number;
  /** 1주당 외화 취득가액 */
  perShareAcquisitionPriceForeign?: number;
  /** 취득일 기준환율 (원/외화, 소수 4자리까지) */
  acquisitionExchangeRate?: number;
};

/** 시행령 §178의8② 국외주식등 제외 사유 + 2026 이전 출국 미적용 */
export type ExitTaxExcludedReason =
  | "foreign_total_le_500m"
  | "foreign_worker_owned"
  | "foreign_worker_family_pre_work"
  | "pre2027_foreign_not_covered";

/** §118의11 세율 구분 — 1호(3호 가·나목, 4호 다·라목) / 2호가목(중소기업) / 2호나목(그 밖) */
export type ExitTaxRateBucket = "clause1" | "clause2a" | "clause2b";

/**
 * §118의10④ 기본공제 250만원의 세율 구분별 배분 — 과세 구분이 **둘 이상**일 때 사용자가 직접 입력한다.
 *
 * 소득세법 §118의10③④는 「양도소득금액에서 연 250만원을 공제」라고만 하고 구분별 배분 규정이 없다
 * (§103①의 「소득별로 각각」과 다르다). 그래서 자동 안분 fallback 없이 입력값 기준으로 계산한다(사용자 결정 C-1).
 * 과세 구분의 값은 **명시**해야 한다(0 포함). 과세 구분이 아닌 쪽은 비우거나 0이어야 한다.
 */
export type ExitTaxBasicDeductionAllocation = {
  /** 1호(3호 가·나목, 4호 다·라목) */
  clause1?: number;
  /** 2호가목(국외주식 중 중소기업) */
  clause2a?: number;
  /** 2호나목(국외주식 그 밖) */
  clause2b?: number;
};

/** 영 §178의8②2·3호 외국인근로자 요건 4개 (사용자 선언 — 엔진은 자동 판정하지 않는다) */
export type ForeignWorkerChecks = {
  /** 외국인인 임원 또는 사용인 */
  isOfficerOrEmployee: boolean;
  /** 일용근로자가 아님 */
  isNotDailyWorker: boolean;
  /** 출국일 10년 전부터 출국일까지 국내 거소·주소 기간의 100분의 80 이상 국내 근로 */
  domesticWorkRatioAtLeast80: boolean;
  /** 국내 근로 제공 종료일부터 6개월 이내 출국 */
  departedWithin6MonthsOfWorkEnd: boolean;
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
  /**
   * 직전 연도말 대주주 여부 (사용자 직접 판정 입력).
   * 2027.1.1. 이후 출국분은 §118의9①2호 괄호에 따라 **국외주식등(§94①3다목) 보유분을 판정에서 제외**한다
   * — 엔진은 boolean을 그대로 받고 안내 문구만 더한다(계획 Q-9).
   */
  isMajorShareholder: boolean;

  // ── 보유 주식 (종목별 다건) ──
  /** 최소 1건 이상 필수 */
  holdings: ExitTaxHolding[];

  // ── 영 §178의8②2·3호 외국인근로자 제외 (2027.1.1. 이후 출국분) ──
  /**
   * 외국인근로자 구분. 미입력은 `"none"`(3중 패턴 default).
   * "foreign_worker"        → ②2호 본인 소유 국외주식 전부 제외 (요건 4개 모두 true)
   * "foreign_worker_family" → ②3호 배우자·20세 이하 직계비속이 근로 개시일 **전에 취득**한 종목만 제외
   */
  foreignWorkerStatus?: "none" | "foreign_worker" | "foreign_worker_family";
  /** status ≠ none 일 때 필수. 4개 **모두** true여야 제외한다(하나라도 false면 과세). */
  foreignWorkerChecks?: ForeignWorkerChecks;
  /** status = foreign_worker_family 일 때 필수. 20세 이하 여부는 문언에 기준 시점이 없어 선언으로 받는다. */
  foreignWorkerFamilyKind?: "spouse" | "child_20_or_under";
  /**
   * 외국인근로자가 국내에서 근로를 제공하기 시작한 날 — status = foreign_worker_family 일 때 필수.
   * 엔진이 `취득일 < 근로 개시일`로 종목별 판정한다(같은 날 취득은 「전」이 아니다).
   */
  foreignWorkerStartDate?: Date;

  /**
   * §118의10④ 기본공제 250만원 구분별 배분 — 과세 구분이 둘 이상이면 **필수**(합계 = 공제액, 각 값 ≤ 그 구분 양도소득금액).
   * 구분이 하나이면 법문대로 자동이며, 입력이 있으면 그 값이 자동값과 같은지 검증한다(무시하지 않는다).
   */
  basicDeductionAllocation?: ExitTaxBasicDeductionAllocation;

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
  /**
   * 외국 실양도 후 납부한 세액 (**원화**). 외화로 넣으려면 아래 3필드를 쓴다.
   * ⚠️ 외화·환율이 **둘 다** 있으면 그쪽이 우선한다.
   */
  foreignTaxPaid?: number;
  /**
   * 외국납부세액 — **외화 금액**. 해외주식(PR-4A)과 **같은 이름·같은 구조**다.
   *
   * §118의13 의 외국납부세액은 본래 외국에서 낸 세금이라 외화다. 종전에는 원화 환산액만
   * 받아 **사용자가 스스로 곱해** 넣어야 했고, 어떤 환율을 썼는지 화면에 남지 않아 검산이
   * 불가능했다. 소령 §178의5 는 「수령·지출일 현재 외국환거래법 **기준환율 또는 재정환율**」을
   * 정한다 — 그 환율을 사용자가 직접 넣게 하고, 환산은 엔진이 한다.
   */
  foreignTaxPaidForeign?: number;
  /** 외국납부세액 통화 코드 (표시용 — 계산에는 쓰지 않는다) */
  foreignTaxCurrencyCode?: string;
  /** 납세일 기준환율 (원/외화) — 소령 §178의5 */
  foreignTaxExchangeRate?: number;
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
  /**
   * 과세 여부. `"excluded"`는 합계·세액·서식 값에서 **빠진** 종목이다(값은 echo용으로만 남는다).
   * 2027.1.1. 개정 전 결과(저장 이력)에는 없다 — 없으면 `"taxed"`로 읽는다.
   */
  scope?: "taxed" | "excluded";
  /** scope = "excluded" 일 때의 사유 */
  excludedReason?: ExitTaxExcludedReason;
  /** scope = "taxed" 일 때의 §118의11 세율 구분 */
  rateBucket?: ExitTaxRateBucket;
  /**
   * 외화 경로(`foreign_*` 시가 모드) 종목의 환산 echo — 원화 단가 경로·국내 종목에는 없다.
   * 환율 기준일(취득일·출국일)은 법령에 명시가 없어 입력값을 그대로 쓴 것이며 결과 warnings가 «확인 필요»를 고지한다.
   */
  fx?: {
    /** 통화 코드 (입력했을 때만 · 표시용) */
    currency?: string;
    /** 1주당 외화 출국일 시가 */
    departureForeign: number;
    /** 출국일 기준환율 (원/외화) */
    departureRate: number;
    /** 출국일 시가 총액(원화, 외화 단가 × 주수 × 환율을 1회 절사) */
    departureValueKrw: number;
    /** 1주당 외화 취득가액 */
    acquisitionForeign: number;
    /** 취득일 기준환율 (원/외화) */
    acquisitionRate: number;
    /** 취득가액 총액(원화, 1회 절사) */
    acquisitionCostKrw: number;
  };
};

/** §118의11 세율 구분별 계산 분해 (구분이 둘 이상이면 canonical 순서 clause1 → clause2a → clause2b) */
export type ExitTaxBucketDetail = {
  bucket: ExitTaxRateBucket;
  /** 구분 내 종목 양도차익 합산(구분 안 손실 통산) */
  transferGain: number;
  /** 이 구분에서 공제한 §118의10④ 기본공제 */
  basicDeductionAllocated: number;
  taxBase: number;
  appliedRate: number;
  progressiveDeduction: number;
  calculatedTax: number;
};

// ============================================================
// 국외전출세 Result (PR-4B)
// ============================================================

export type ExitTaxResult = {
  /**
   * 출국일 기준 적용 규정 — "pre2027"(~2026.12.31. 출국) / "from2027"(2027.1.1.~ 출국).
   * 소득세법 부칙(법률 제21221호) 제8조 — 기준은 실제 양도일이 아니라 **출국일**이다.
   * 요건 미충족으로 조기 반환된 결과에도 담긴다. 이 필드가 생기기 전의 저장 이력에는 없다.
   */
  exitTaxRegime?: "pre2027" | "from2027";
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

  /** §118의11 세율 구분별 분해 — 과세 종목이 있을 때만 */
  bucketDetails?: ExitTaxBucketDetail[];
  /**
   * 국외주식등 제외 판정(영 §178의8②) echo — 국외 종목이 하나라도 있을 때만.
   * `applied`는 국외 종목이 하나라도 제외됐는지, `reason`은 그 사유다.
   */
  foreignExclusion?: {
    applied: boolean;
    reason?: ExitTaxExcludedReason;
    /** 출국 당시 소유한 국외주식등 전부의 §118의10① 양도가액 합계(원화) */
    foreignDepartureValueTotal: number;
    /** 영 §178의8②1호 「5억원 이하」 */
    threshold: number;
  };

  // ── 합산 양도차익 ──
  /** 전체 종목 양도차익 합산 */
  totalTransferGain: number;
  /** §118의10④ 기본공제 250만원 */
  basicDeduction: number;
  /** 과세표준 = max(0, totalTransferGain − basicDeduction). 구분이 둘 이상이면 구분별 과세표준의 합 */
  taxBase: number;
  /**
   * 기본공제 배분 근거 — 과세 구분이 둘 이상일 때만 `"user_allocation"`(법령에 배분 규정이 없어 입력값 기준).
   * 구분이 하나이면 법문 직접 적용이라 없다.
   */
  basicDeductionBasis?: "user_allocation";

  // ── §118의11 → §104①11가목2) 산출세액 ──
  /** 산출세액 (3억 이하 20% / 초과 25% 누진공제 15,000,000) */
  incomeTax: number;
  /**
   * 적용 세율·누진공제 **echo** (산식 무영향 — 별지 제84호서식 23·24행 표시용).
   *
   * 🔑 엔진은 이미 `applyExitTaxRate`에서 둘을 계산하고 **버리고 있었다**(`{ tax }`만 구조분해).
   *   서식이 이 값을 얻지 못하면 `incomeTax / taxBase`로 역산해야 하는데, 그것은 엔진 산식을
   *   표시 계층에서 다시 쓰는 일이라 누진공제가 있는 구간에서 조용히 갈린다
   *   (memory `feedback_aggregate_display_rederives_engine_value`).
   *
   * 과세표준 0이면 `applyExitTaxRate`가 rate 0을 돌려주므로 0이 실린다.
   * 과세 구분이 둘 이상이면 단일 세율이 성립하지 않아 0이고, 구분별 값은 `bucketDetails`를 읽는다(PR-4).
   */
  appliedRate: number;
  /** 누진공제액 (3억 초과 구간 15,000,000 / 그 외 0) */
  progressiveDeduction: number;
  /**
   * 지방소득세 (10원 미만 절사). 2호(국외주식)는 지방세법 §103의3⑧ 표를 과세표준에 직독한 값이다.
   * 구분이 둘 이상이면 구분별로 계산해 더한다(1호 구분은 소득세 산출세액의 10%, 2호 구분은 표 직독).
   */
  localIncomeTax: number;
  /**
   * 참고값 — 2호(국외주식) 과세 시에만. 소득세 산출세액의 10%(10원 미만 절사. 구분이 둘 이상이면 구분별 절사의 합).
   * 지방세법 §103의3⑧은 호 구분 없는 단일표라 2호 세율(10%/20%)과 어긋날 수 있어(계획 V-3) 두 값을 병기한다 — 확인 필요.
   * 1호만이면 두 값이 같아 없다.
   */
  localIncomeTaxAlternative?: number;

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
  /**
   * 외국납부세액 **원화 환산액** — 공제 계산에 실제로 쓰인 금액.
   * 외화·환율을 넣었으면 `외화 × 환율`(원 미만 절사), 아니면 `foreignTaxPaid` 그대로다.
   */
  foreignTaxPaidKrw?: number;
  /** §118의14 비거주자 세액공제액 */
  domesticTaxCreditApplied?: number;
  /** 경정 후 최종 세액 (incomeTax − 조정공제 − 외국납부세액공제 − 비거주자공제) */
  finalTaxAfterAdjustment?: number;

  // ── 가산세 ──
  /** §118의15 보유현황 미신고 가산세 */
  holdingsReportPenalty?: number;

  // ── 총계 ──
  /**
   * 결정세액 = (경정 후 세액 ?? 산출세액) + §118의15④ 보유현황 미신고 가산세.
   *
   * §118의15④가 「… 100분의 2에 상당하는 금액을 **산출세액에 더한다**」이므로 여기서 더한다.
   * ⚠️ `incomeTax`에 직접 더하면 안 된다 — 조정공제·§118의13·§118의14 한도·`deferredTaxAmount`·
   *    지방소득세·§118의17③ 환급 제외가 전부 `incomeTax`에 종속되고, 특히 마지막은 가산세가
   *    산출세액과 **분리돼 있어야** 성립한다(형제 `foreign-stock.ts`와 같은 구조).
   */
  finalTax: number;
  /** 총 납부세액 = finalTax + 지방소득세. 사이드바·결과 요약의 단일 소스. */
  totalTax: number;

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
