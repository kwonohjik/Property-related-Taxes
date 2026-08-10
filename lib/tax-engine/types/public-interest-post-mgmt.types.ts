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
// §48②3호 — **운용소득**을 직접 공익목적사업 **외**에 사용
// ============================================================

/**
 * ## ⚠️ 5호(가산세)와 사유가 다르다
 *
 * | | **3호 (이 타입)** | 5호 전단 |
 * |---|---|---|
 * | 사유 | 운용소득을 공익목적사업 **외**에 사용 | 운용소득을 사용기준금액(80%)에 **미달** 사용 |
 * | 세목 | **증여세** | **가산세**(§78⑨1호) |
 * | 과세가액 | 출연재산 **평가가액** × (외부사용액 ÷ 운용소득) | 미달사용액 × 10% |
 *
 * ⚠️ 3호의 과세가액은 **운용소득이 아니라 출연재산 평가가액**에 비율을 곱한다 — 운용소득의
 * 몇 배가 과세될 수 있다.
 */
export interface PublicInterestOperatingIncomeInput {
  /** 운용소득 (원) — 상증령 §38⑤. 산식 분모. */
  operatingIncome: number;
  /** 운용소득 중 직접 공익목적사업 **외**에 사용한 금액 (원). 산식 분자. */
  outsideUseAmount: number;
  /**
   * 출연재산의 **재무상태표상 가액** (원) — 상증칙 §13②.
   *
   * 「운용소득을 사용하여야 할 과세기간·사업연도의 **직전** 과세기간·사업연도 **말 현재**
   * 수익용이나 수익사업용으로 운용하는 …출연받은 재산」의 가액. **1년 이상 보유 주식등은
   * 제외**하고 아래 `longHeldStockParValue`에 액면가액으로 넣는다(§13③).
   */
  bookValue: number;
  /**
   * 같은 범위 재산의 **법 제4장 평가액** (원) — 상증칙 §13② **단서** 비교용.
   *
   * `bookValue`가 이 값의 **100분의 70 이하**이면 이 값으로 대체한다. 모르면 생략하되,
   * 단서가 적용되지 않았다는 경고가 붙는다(추정 대체 금지).
   */
  chapter4Value?: number;
  /**
   * 공익법인등이 **1년 이상 보유한 주식등**의 **액면가액** (원) — 상증칙 §13③.
   *
   * ⚠️ 시가·장부가가 아니라 **액면가액**이다. §13②을 명시적으로 배제한다("제2항에도 불구하고").
   */
  longHeldStockParValue?: number;
}

export interface PublicInterestOperatingIncomeResult {
  /** 추징 사유가 발생했는가 (과세가액 > 0). */
  isClawback: boolean;
  /** 과세표준이 §55② 과세최저한(50만원) 미만이라 세액이 0인가. */
  belowMinimumTaxBase: boolean;
  /** 상증칙 §13② 단서(제4장 평가액 대체)가 발동했는가. */
  chapter4ClauseApplied: boolean;
  /** 단서 적용 후 비(非)주식분 가액. */
  nonStockValue: number;
  /** 1년 이상 보유 주식등의 액면가액 (§13③). */
  longHeldStockParValue: number;
  /** 산식의 평가가액 = nonStockValue + longHeldStockParValue. */
  assetValue: number;
  /** 운용소득 상한을 적용한 외부사용액. */
  cappedOutsideUse: number;
  /** 과세가액 = 평가가액 × (외부사용액 ÷ 운용소득). */
  clawbackBase: number;
  /** 증여세 과세표준 — §55② 미달 시 0. */
  taxBase: number;
  /** 추징 증여세 (§56 누진세율). */
  giftTax: number;
  /** 적용 한계세율 (표시용). */
  appliedRate: number;
  /** 누진공제 (표시용). */
  progressiveDeduction: number;
  steps: PublicInterestStep[];
  warnings: string[];
}

// ============================================================
// §48②6호 — 출연받은 주식등의 **의결권 행사**
// ============================================================

/**
 * ## ⭐ 한도는 20%인데 과세 기준선은 **10%**다
 *
 * §16②2호**가목** 요건(1 의결권 미행사 · 2 자선·장학·사회복지 목적)을 갖춘 공익법인등은
 * **20%까지** 출연받아도 과세가액에 산입되지 않는다. 그런데 1)을 위반해 의결권을 행사하면
 * 상증령 §40①3의2호가 정한 과세가액은 「의결권을 행사한 날에 발행주식총수등의 **100분의
 * 10을 초과**하여 보유하고 있는 주식등의 가액」이다 — 「20% 초과분」이 아니다.
 *
 * ## ⭐ 나목·다목 공익법인등은 대상이 **아니다**
 *
 * 상호출자제한기업집단 특수관계(나목)·§48⑪ 요건 미충족(다목)은 애초에 5% 한도라 가목이
 * 적용되지 않는다. §48②6호가 괄호로 명시적으로 뺐다.
 */
export interface PublicInterestVotingRightsInput {
  /** 의결권을 행사한 날 (ISO yyyy-MM-dd) — 상증령 §40①3의2호의 평가·판정 기준일. */
  exerciseDate: string;
  /** 발행주식총수등 (주) — 자기주식·자기출자지분 제외(법 §16② 괄호). */
  totalShares: number;
  /** 공익법인등이 보유한 주식등 (주) — 의결권을 행사한 날 현재. */
  heldShares: number;
  /** 의결권을 행사한 날 현재 1주당 평가액 (원). */
  pricePerShare: number;
  /** §16②2호가목 1) 위반 — 실제로 출연받은 주식등의 의결권을 행사했는가. */
  exercisedVotingRights: boolean;
  /** §16②2호가목 2) — 자선ㆍ장학 또는 사회복지를 목적으로 하는가. */
  isCharityPurpose: boolean;
  /**
   * §48②6호 괄호 — §16②2호 **나목**(상호출자제한기업집단과 특수관계) 또는 **다목**
   * (§48⑪ 각 호의 요건 미충족)에 해당하는가. 해당하면 6호 대상에서 **제외**된다.
   */
  isNaDaMokCorp: boolean;
}

export interface PublicInterestVotingRightsResult {
  /** §48②6호 요건이 성립하는가. */
  applies: boolean;
  /** 미적용 사유 (applies=false일 때). 세 사유를 구분해 담는다. */
  nonApplicableReason?: string;
  /** 추징 사유가 발생했는가 (과세가액 > 0). */
  isClawback: boolean;
  /** 과세표준이 §55② 과세최저한(50만원) 미만이라 세액이 0인가. */
  belowMinimumTaxBase: boolean;
  /** 의결권을 행사한 날 (ISO) — echo. */
  exerciseDate: string;
  /** 발행주식총수등의 10%에 해당하는 주식 수 (표시용 — 정수가 아닐 수 있다). */
  tenPercentShares: number;
  /** 10%를 초과해 보유한 주식 수. */
  excessShares: number;
  /** 과세가액 = 초과 주식수 × 1주당 평가액 (상증령 §40①3의2호). */
  clawbackBase: number;
  /** 증여세 과세표준 — §55② 미달 시 0. */
  taxBase: number;
  /** 추징 증여세 (§56 누진세율). */
  giftTax: number;
  /** 적용 한계세율 (표시용). */
  appliedRate: number;
  /** 누진공제 (표시용). */
  progressiveDeduction: number;
  steps: PublicInterestStep[];
  warnings: string[];
}

// ============================================================
// §48②8호 — 출연재산·직접 공익목적사업의 **운용 의무 위반**
// ============================================================

/** 상증령 §38⑧ 각 호 — 8호가 지시하는 「대통령령으로 정하는 바」 두 갈래. */
export type OperationViolationKind =
  /** 1호 — 사업을 종료한 때의 **잔여재산**을 국가·지자체·동일·유사 공익법인등에 귀속시키지 아니한 때 */
  | "residual_not_transferred"
  /** 2호 — 직접 공익목적사업 사용이 사회적 지위·직업·근무처·출생지 등에 의해 **일부에게만 혜택** */
  | "benefit_to_limited_group";

/** 상증령 §38⑧2호 **단서** 조건 유형 — 가목·나목. */
export type BeneficiaryScopeCondition =
  /** 가목 — 해당 공익법인등의 **설립허가의 조건**으로 붙인 경우 */
  | "establishment_permit"
  /** 나목 — 재산 추가출연에 따른 **정관 변경허가 조건**으로 붙인 경우 */
  | "articles_amendment_permit"
  /** 어느 조건으로도 붙이지 않음 — 단서 불성립 */
  | "none";

export interface PublicInterestOperationViolationInput {
  /** 위반 유형 (상증령 §38⑧1호·2호). 과세가액은 **택일**이다. */
  violation: OperationViolationKind;
  /** 1호 — 귀속시키지 아니한 잔여재산가액 (원) — 상증령 §40①4호. */
  unTransferredResidualValue?: number;
  /**
   * 2호 — 혜택을 받은 일부에게만 제공된 **재산가액 또는 경제적 이익에 상당하는 가액** (원)
   * — 상증령 §40①5호.
   */
  limitedBenefitValue?: number;
  /**
   * 2호 **단서** — 세 요건을 **모두** 갖추면 8호에서 제외된다.
   *
   * ⚠️ 단서는 **2호에만** 붙는다. §40①5호가 「제38조제8항제2호 **본문**의 규정에 해당하게 되는
   * 경우」라고 못박았고, 1호(잔여재산)에는 단서 자체가 없다 — 근거 없이 넓히지 않는다.
   */
  approvedBeneficiaryScope?: {
    /** 주무부장관이 재정경제부장관과 **협의**했는가(권한 위임 시 위임기관과 관할세무서장의 협의). */
    consulted: boolean;
    /** 따로 **수혜자의 범위를 정했는가**. */
    scopeDefined: boolean;
    /** 가목(설립허가) 또는 나목(정관 변경허가) **조건으로 붙였는가**. */
    conditionType: BeneficiaryScopeCondition;
  };
}

export interface PublicInterestOperationViolationResult {
  /** 추징 사유가 발생했는가 (단서 충족 시 false). */
  isClawback: boolean;
  /** 2호 단서로 제외된 경우의 사유 문구. */
  exemptReason?: string;
  /** 과세표준이 §55② 과세최저한(50만원) 미만이라 세액이 0인가. */
  belowMinimumTaxBase: boolean;
  /** 선택한 유형의 과세가액 (상증령 §40①4호·5호). 단서 충족 시 0. */
  clawbackBase: number;
  /** 증여세 과세표준 — §55② 미달 시 0. */
  taxBase: number;
  /** 추징 증여세 (§56 누진세율). */
  giftTax: number;
  /** 적용 한계세율 (표시용). */
  appliedRate: number;
  /** 누진공제 (표시용). */
  progressiveDeduction: number;
  steps: PublicInterestStep[];
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
