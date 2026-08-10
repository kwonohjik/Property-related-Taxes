/**
 * 공익법인등 출연재산 사후관리 추징 — 「상속세 및 증여세법」 §48②1호 (3년 추징)
 *
 * ## ⚠️ 영농(§18의3④)·가업(§18의2⑤) 사후관리와 **구조가 다르다**
 *
 * | | 영농·가업 | **공익법인 §48②1호** |
 * |---|---|---|
 * | 부과 세목 | **상속세** | **증여세** |
 * | 납세의무자 | 상속인 | **공익법인등 본인** |
 * | 산정 방식 | 과세가액에 **산입**해 상속세 재계산 → **marginal 차액** | 「그 가액을 **증여받은 것으로 보아**」 **독립 계산** |
 * | 이자상당액 | **있다**(법에 명시) | **없다** — §48②·상증령 §40 어디에도 규정이 없다 |
 *
 * 그래서 이 엔진은 marginal 재계산을 하지 않는다. 추징 대상 가액에 §56 누진세율을
 * 그대로 적용한다.
 */

/** §48②1호 위반 유형 — 상증령 §40①1호 각 목과 1:1 */
export type PublicInterestViolation =
  /** 가목 — 직접 공익목적사업등 **외에** 사용 */
  | "used_outside_purpose"
  /** 나목 — 출연받은 날부터 **3년 이내**에 사용하지 아니하거나 **미달** 사용 */
  | "unused_within_3y"
  /** 다목 — **3년 이후** 계속하여 사용하지 아니함 */
  | "discontinued_after_3y";

export interface PublicInterestPostMgmtInput {
  /** 출연받은 재산가액 (원) — 판정 모집단. */
  donatedValue: number;
  /** 출연받은 날 (ISO yyyy-MM-dd) — 3년 기산점. */
  donationDate: string;
  /** 판정 기준일 (ISO) — 위반 사유가 발생한 날. */
  assessmentDate: string;
  /** 위반 유형 (상증령 §40①1호 가·나·다). */
  violation: PublicInterestViolation;
  /**
   * 추징 대상 가액 (원) — 목별로 의미가 다르다:
   *   · 가목 → **그 사용한** 재산의 가액
   *   · 나목 → **사용하지 아니하거나 미달하게 사용한** 재산의 가액
   *   · 다목 → **사용하지 않는** 재산의 가액
   * 출연가액을 넘을 수 없다(엔진에서 상한 적용).
   */
  violatedValue: number;
  /**
   * §48②1호 **단서** — 부득이한 사유를 보고(§48⑤ 보고서)하고 사유가 없어진 날부터
   * **1년 이내**에 직접 공익목적사업등에 사용했는가. 충족 시 추징에서 **제외**된다.
   */
  justifiedException?: {
    /** 사유를 관할세무서장에게 보고했는가 (§48②1호 단서 「보고하고」). */
    reported: boolean;
    /** 사유가 없어진 날 (ISO). */
    reasonEndDate: string;
    /** 실제로 직접 공익목적사업등에 사용한 날 (ISO). 미사용이면 undefined. */
    usedDate?: string;
  };
}

export interface PublicInterestPostMgmtResult {
  /** 추징 사유가 발생했는가 — 단서 충족 시 false. */
  isClawback: boolean;
  /** 과세표준이 §55② 과세최저한(50만원) 미만이라 세액이 0인가. */
  belowMinimumTaxBase: boolean;
  /** 단서로 제외된 경우의 사유 문구. 추징이면 undefined. */
  exemptReason?: string;
  /** 출연일부터 3년이 되는 날 (ISO) — 나목·다목 판정 경계. */
  threeYearDeadline: string;
  /** 판정 기준일이 3년을 지났는가. */
  isAfterThreeYears: boolean;
  /** 추징 대상 가액 = min(violatedValue, donatedValue). 단서 충족 시 0. */
  clawbackBase: number;
  /** 증여세 과세표준 — 공익법인은 §53 증여재산공제 대상이 아니므로 과세가액과 같다. */
  taxBase: number;
  /** 추징 증여세 (§56 누진세율). */
  giftTax: number;
  /** 적용 한계세율 (표시용). */
  appliedRate: number;
  /** 누진공제 (표시용). */
  progressiveDeduction: number;
  /** 산식·근거 단계. */
  steps: Array<{ label: string; formula: string; amount: number; legalBasis: string }>;
  /** 실무 주의 안내. */
  warnings: string[];
}

/** 세 엔진이 공유하는 산출 근거 한 줄. */
export interface PublicInterestStep {
  label: string;
  formula: string;
  amount: number;
  legalBasis: string;
}

// ============================================================
// §48②4호 — 출연재산 **매각대금** 3년 사후관리
// ============================================================

/**
 * ## ⚠️ 1호와 **세 축이 다르다** — 1호 코드를 복사하면 조용히 틀린다
 *
 * | | §48②1호 (출연재산) | **§48②4호 (매각대금)** |
 * |---|---|---|
 * | 3년 기산점 | 출연받은 **날** | 매각한 날이 속하는 **과세기간·사업연도 종료일** (상증령 §38④) |
 * | 판정 기준 | 「사용하지 아니한」 (정성) | 사용실적이 **매각대금의 90%에 미달** (정량) |
 * | 부득이한 사유 단서 | **있다** (§48②1호 단서·상증령 §38③) | **없다** — 단서·시행령 모두 「제1호」에 한정 |
 *
 * 기산점 차이는 12월 결산 법인에서 최대 1년 가까이 벌어진다.
 */
export type SaleProceedsViolation =
  /** 가목 — 매각대금을 직접 공익목적사업 **외**에 사용 */
  | "used_outside_purpose"
  /** 나목 — 3년 이내 사용실적이 사용기준금액(90%)에 **미달** */
  | "under_use_threshold";

export interface PublicInterestSaleProceedsInput {
  /**
   * 매각대금 (원).
   *
   * 법 §48②1호 본문 괄호(「이하 이 조에서 같다」)에 따라 **매각에 따라 부담하는 국세 및
   * 지방세를 뺀** 금액이다(상증령 §38 — 「대통령령으로 정하는 공과금 등」).
   */
  saleProceeds: number;
  /** 매각한 날 (ISO yyyy-MM-dd) — 표시용. 3년 기산점은 아래 `fiscalYearEndDate`다. */
  saleDate: string;
  /**
   * 매각한 날이 속하는 **과세기간 또는 사업연도의 종료일** (ISO) — 상증령 §38④ 3년 기산점.
   *
   * ⚠️ 자동 도출하지 않는다. 공익법인마다 사업연도가 다르고(12월 결산이 다수이나 학교법인 등은
   * 2월 말), 매각일만으로는 결정할 수 없다 — 추정 fallback은 세액을 조용히 바꾼다.
   */
  fiscalYearEndDate: string;
  /** 판정 기준일 (ISO). */
  assessmentDate: string;
  /** 위반 유형 (상증령 §40①3호 가·나목). */
  violation: SaleProceedsViolation;
  /**
   * 나목 — 3년 이내 **직접 공익목적사업에 사용한 실적** 누계 (원).
   *
   * 상증령 §38④: 매각대금으로 직접 공익목적사업용·수익용·수익사업용 재산을 취득한 경우를
   * 포함하되, ① 공시대상기업집단 동일인관련자 관계인 공익법인이 그 기업집단 소속 법인의
   * 의결권 있는 주식등을 취득한 경우와 ② 일시 취득한 재산은 **제외**한다.
   */
  directUseAmount?: number;
  /** 가목 — 직접 공익목적사업 **외**에 사용한 금액 (원). */
  outsideUseAmount?: number;
}

export interface PublicInterestSaleProceedsResult {
  /** 추징 사유가 발생했는가 (과세가액 > 0). */
  isClawback: boolean;
  /** 과세표준이 §55② 과세최저한(50만원) 미만이라 세액이 0인가. */
  belowMinimumTaxBase: boolean;
  /** 상증령 §38④ — 과세기간 종료일부터 3년이 되는 날 (ISO). */
  threeYearDeadline: string;
  /** 판정 기준일이 위 기한을 지났는가. */
  isAfterThreeYears: boolean;
  /** 사용기준금액 = 매각대금 × 90% (상증령 §38④). */
  useThreshold: number;
  /** 매각대금 상한을 적용한 사용실적. */
  cappedDirectUse: number;
  /** 매각대금 상한을 적용한 공익목적사업 외 사용금액. */
  cappedOutsideUse: number;
  /** 나목 — 미달사용금액 = max(0, 사용기준금액 − 사용실적). */
  shortfall: number;
  /** 가목 — 사용기준금액 × (외부사용액 / 매각대금). */
  outsideUseTaxable: number;
  /** 선택한 목에 따른 과세가액. */
  clawbackBase: number;
  /** 증여세 과세표준 — §55② 미달 시 0. */
  taxBase: number;
  /** 추징 증여세 (§56 누진세율). */
  giftTax: number;
  /** 적용 한계세율 (표시용). */
  appliedRate: number;
  /** 누진공제 (표시용). */
  progressiveDeduction: number;
  /** 산식·근거 단계. */
  steps: Array<{ label: string; formula: string; amount: number; legalBasis: string }>;
  /** 실무 주의 안내. */
  warnings: string[];
}

// ============================================================
// §48②5호·7호 — **가산세** (§78⑨)
// ============================================================

/**
 * ## ⚠️ 세목이 다르다 — 1호·4호는 **증여세**, 5호·7호는 **가산세**
 *
 * §48② 본문이 갈라 놓았다: 「제1호부터 제4호까지, 제6호 및 제8호」는 「증여받은 것으로 보아
 * 즉시 **증여세**를 부과」하고, 「제5호 및 제7호」는 「제78조제9항에 따른 **가산세**를 부과」한다.
 * 그래서 §55② 과세최저한(50만원)·§56 누진세율이 여기엔 걸리지 않는다.
 *
 * ## ⚠️ 매각대금은 기간별로 세목이 갈린다 (집행기준 48-38-7)
 *
 * | 사용기간 | 최소사용실적 | 미달 시 |
 * |---|---|---|
 * | 1년 이내 | 30% | **가산세**(미달사용액 × 10%) ← 이 엔진 |
 * | 2년 이내 | 60% | **가산세**(미달사용액 × 10%) ← 이 엔진 |
 * | 3년 이내 | 90% | **증여세**(미달사용액) ← `calcPublicInterestSaleProceeds` |
 */
export interface PublicInterestPenaltyInput {
  /** §78⑨1호 — 운용소득(§48②5호 전단). 해당 없으면 생략. */
  operatingIncome?: {
    /**
     * 운용소득 (원) — 상증령 §38⑤ 「제1호 − 제2호」.
     *
     * 집행기준 48-38-6 산식: ①차가감 소득금액 − ②법인세등·이월결손금 + ③직전 사업연도
     * 미달사용액(가산세 차감). 음수면 0으로 본다(서면-2021-법규법인-7926).
     */
    income: number;
    /**
     * 사용실적 (원) — 상증령 §38⑥ 「그 소득이 발생한 과세기간·사업연도 종료일부터 **1년 이내**」.
     * 사업개시 5년 경과 시 당해 + 직전 4개 = **5년 평균**으로 계산할 수 있다.
     */
    usedAmount: number;
  };

  /** §78⑨2호 — 매각대금(§48②5호 후단). 해당 없으면 생략. */
  saleProceeds?: {
    /** 매각대금 (원) — 매각에 따라 부담한 국세·지방세 차감 후(상증령 §38⑰). */
    proceeds: number;
    /** 과세기간·사업연도 종료일부터 **1년 이내** 직접 공익목적사업 사용실적. */
    usedWithin1y: number;
    /** 같은 기산점부터 **2년 이내** 사용실적 **누계**. */
    usedWithin2y: number;
  };

  /** §78⑨3호 — 의무지출(§48②7호). 해당 없으면 생략. */
  mandatoryDistribution?: {
    /**
     * 「출연받은 재산의 가액」 (원) — 상증령 §38⑱.
     *
     * 직전 과세기간·사업연도 종료일 현재 재무상태표·운영성과표 기준, 수익용 또는 수익사업용으로
     * 운용하는 재산(직접 공익목적사업용 재산 제외)의 **총자산가액 − (부채가액 + 당기순이익)**.
     * 3년 이상 5년 미만 보유 상장주식은 직전 3개, 5년 이상은 직전 5개 종료일 평균액으로 한다.
     */
    assetBase: number;
    /**
     * §16②2호가목 공익법인등이 발행주식총수등의 **10%를 초과** 보유하는가.
     * 참이면 기준금액 비율이 1% → **3%**가 된다(법 §48②7호 괄호).
     */
    exceedsTenPercentHolding: boolean;
    /**
     * §48②7호 **가목**의 공익법인등인가(주식등 보유비율 5% 초과 — 상증령 §38⑳).
     * 참이면 §78⑨3호 가산세율이 10% → **200%**가 된다.
     */
    isClauseGaCorp: boolean;
    /** 직접 공익목적사업에 사용한 금액 (원) — 상증령 §38⑲. */
    usedAmount: number;
  };
}

/** 호별 공통 — 기준금액·사용액·미달액·가산세. */
export interface PenaltyClauseResult {
  threshold: number;
  used: number;
  shortfall: number;
  penalty: number;
}

export interface PublicInterestPenaltyResult {
  /** §78⑨1호 — 운용소득. 입력이 없으면 undefined. */
  operatingIncome?: PenaltyClauseResult;
  /** §78⑨2호 — 매각대금. 1년·2년은 **별개 사업연도에 각각** 부과된다. */
  saleProceeds?: {
    threshold1y: number;
    used1y: number;
    shortfall1y: number;
    penalty1y: number;
    threshold2y: number;
    used2y: number;
    shortfall2y: number;
    penalty2y: number;
    /** penalty1y + penalty2y. */
    penalty: number;
  };
  /** §78⑨3호 — 의무지출. */
  mandatoryDistribution?: PenaltyClauseResult & {
    /** 기준금액 비율의 분자 — 1 또는 3 (%). */
    rateNumer: number;
    /** 가산세율 — 10 또는 200 (%). */
    penaltyRatePercent: number;
  };
  /** §78⑨ 후단 택일 결과 — 1호·3호 중 더 큰 쪽. */
  clause1And3Applied: "clause1" | "clause3" | "none";
  /** 택일 후 채택된 금액. */
  clause1And3Penalty: number;
  /** clause1And3Penalty + 2호 가산세. */
  totalPenalty: number;
  steps: PublicInterestStep[];
  warnings: string[];
}
