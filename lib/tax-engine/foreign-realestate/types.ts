/**
 * 국외자산 부동산 양도소득세(소득세법 §118의2~§118의8) 순수 엔진 — 입력·결과 타입.
 *
 * 처음부터 `assets[]` 배열 + 자산별 `rows[]`다. PR-3부터 같은 과세기간(양도일 연도) 여러 건 + 외국납부세액(§118의6)을 받는다.
 * 계획서: docs/02-design/features/transfer-foreign-realestate.engine.plan.md §3 · 색인 §2 결정(C-1 다건 · C-2 거주 연수 정수 · C-3 미등기 칸 없음)
 */

/** 외화 금액 1항목 — 각 항목이 자기 일자·환율을 가진다(영 §178의5① 수령·지출일 현재 기준환율). 양도일 환율 fallback 없음. */
export interface ForeignMoneyItem {
  /** 외화액(≥ 0, 소수 4자리 이하) */
  amountForeign: number;
  /** 통화 코드(표시용 — 계산에 영향 없음) */
  currency: string;
  /** 수령 또는 지출한 날 */
  date: Date;
  /** 그날 기준환율 또는 재정환율(원/외화 1단위, > 0, 소수 4자리 이하) */
  exchangeRate: number;
}

export interface ForeignRealEstateAssetInput {
  id: string;
  /** 법 §118의2 1호 토지·건물 */
  kind: "land" | "building";
  transferDate: Date;
  acquisitionDate: Date;
  /** 양도가액(실지거래가액) */
  transfer: ForeignMoneyItem;
  /** 취득가액(실지거래가액 · 매매 취득) */
  acquisition: ForeignMoneyItem;
  /** 자본적지출액 — 항목마다 지출일·환율 */
  capitalExpenditures: ForeignMoneyItem[];
  /** 양도비 — 항목마다 지출일·환율 */
  transferCosts: ForeignMoneyItem[];
}

/** 외국납부세액 1건 — 영 §178의7① 외국정부가 개인의 양도소득금액을 과세표준으로 과세한 세액(부가세액 포함). `date`·`exchangeRate`는 필수 입력(양도일 환율 대체 없음). */
export interface ForeignTaxItemInput extends ForeignMoneyItem {
  /** 어느 자산의 양도소득에 대한 외국세인지(`assets[].id`) */
  assetId: string;
}

/** 법 §118의6① — 두 방법 중 하나를 선택(둘 동시 적용 없음) */
export type ForeignTaxMethod = "credit" | "expense";

export interface ForeignRealEstateForeignTaxInput {
  method: ForeignTaxMethod;
  items: ForeignTaxItemInput[];
}

export interface ForeignRealEstateInput {
  /** 해당 자산의 양도일까지 계속 국내에 주소·거소를 둔 연수(정수, 폼 전역 1칸 — 색인 C-2). 5 미만이면 과세대상 아님. */
  domesticResidenceYears: number;
  /** 같은 과세기간(양도일의 연도)에 양도한 국외 부동산 1건 이상. 연도가 다르면 거부. */
  assets: ForeignRealEstateAssetInput[];
  /** 외국납부세액 — 없거나 `items`가 비면 §118의6 미적용 */
  foreignTax?: ForeignRealEstateForeignTaxInput;
}

/** 누진세율 구간 — `calculateProgressiveTax`가 읽는 최소 구조(`TaxBracket`과 구조 호환). */
export interface ForeignRealEstateBracket {
  max?: number | null;
  rate: number;
  deduction: number;
}

/** 순수 엔진이 받는 세율 — 호출자(route/테스트)가 `parseRatesFromMap` 결과에서 만든다(`rates.ts`). DB 호출 없음. */
export interface ForeignRealEstateRates {
  /** 소득세법 §55① 구간 (양도일 시점 행 — 법 §118의5①이 §55①을 가리킨다) */
  brackets: readonly ForeignRealEstateBracket[];
  /** 법 §118의7① 연 기본공제 한도(원) */
  basicDeductionAnnualLimit: number;
}

/** 환산 1항목 echo — 결과 카드가 「외화 × 환율 = 원화」를 그대로 보여준다. */
export interface ForeignRealEstateConvertedItem {
  amountForeign: number;
  currency: string;
  /** yyyy-MM-dd (UTC 달력일) */
  date: string;
  exchangeRate: number;
  amountKrw: number;
}

/** 자산 1건의 외국납부세액 echo(원화) */
export interface ForeignRealEstateRowForeignTax {
  items: ForeignRealEstateConvertedItem[];
  /** 외국납부세액 원화 합 */
  paidKrw: number;
  /** 필요경비 산입방법으로 양도차익에서 뺀 금액(세액공제방법·미적용이면 0) */
  expenseKrw: number;
  /** 세액공제 한도 A × B / C (세액공제방법이 아니면 0) */
  limit: number;
  /** 공제액 = min(외국납부세액, 한도) */
  applied: number;
  /** 한도 초과 등으로 공제받지 못한 외국납부세액 — §118의6에 이월 규정 없음 */
  unappliedKrw: number;
}

export interface ForeignRealEstateAssetRow {
  id: string;
  kind: "land" | "building";
  transferDate: string;
  acquisitionDate: string;
  transfer: ForeignRealEstateConvertedItem;
  acquisition: ForeignRealEstateConvertedItem;
  capitalExpenditures: ForeignRealEstateConvertedItem[];
  transferCosts: ForeignRealEstateConvertedItem[];
  /** 양도가액(원) */
  transferValueKrw: number;
  /** 취득가액(원) */
  acquisitionValueKrw: number;
  capitalExpenditureKrw: number;
  transferCostKrw: number;
  /** 양도차익 = 양도가액 − 취득가액 − 자본적지출 − 양도비 − 필요경비 산입한 외국납부세액. 음수면 양도차손. */
  capitalGain: number;
  /** 양도차손 echo(양수, 차익이면 0) */
  lossAmount: number;
  /** 장기보유특별공제 — 법 §118의8 단서로 항상 0 */
  longTermDeduction: 0;
  /** 양도소득금액 = max(0, 양도차익 − 장특 0) — 기본공제 전 */
  incomeAmount: number;
  /** 법 §118의7② 순서(먼저 양도한 자산부터)로 이 자산에서 공제된 기본공제 */
  basicDeductionAllocated: number;
  /** 이 자산 몫의 과세표준 = 양도소득금액 − 배분된 기본공제 (합은 결과 `taxBase`) */
  taxBaseAllocated: number;
  foreignTax: ForeignRealEstateRowForeignTax;
}

/** 세액이 아니라 사용자가 확인해야 할 미결 사항 코드(계획서 V-n) */
export type ForeignRealEstateConfirmationCode =
  /** 지방세법 §103의3⑨(제3항 세율의 §103의3⑤ 준용 가중) · ④(조례 가감)는 지정지역 등 자료가 없어 평가하지 않았다 */
  | "LOCAL_TAX_WEIGHTING_NOT_EVALUATED"
  /**
   * 외국납부세액 세액공제방법(§118의6①1호)의 원화 환산 기준일 — 영 §178의5①은 「양도가액 및 필요경비」의 환산만 정하고
   * 세액공제 대상 외국세의 환산일을 정한 조문을 찾지 못했다. 사용자가 입력한 납부일·환율을 그대로 쓴다.
   */
  | "FOREIGN_TAX_CREDIT_FX_DATE_NOT_STATUTORY";

export type ForeignRealEstateNotLiableReason = "RESIDENCE_UNDER_5_YEARS";

export interface ForeignRealEstateResult {
  taxCategory: "foreign_realestate" | "not_liable";
  /** 법 §118의2 요건 충족(거주 5년 이상) */
  isLiable: boolean;
  notLiableReason?: ForeignRealEstateNotLiableReason;
  ineligibleReason?: string;

  domesticResidenceYears: number;
  rows: ForeignRealEstateAssetRow[];

  /** Σ 양도차익(차손 포함) */
  capitalGainTotal: number;
  /** 장기보유특별공제 — 법 §118의8 단서로 항상 0 */
  longTermDeduction: 0;
  /** 양도소득금액(차손 자산은 0으로 본 합) */
  incomeAmountTotal: number;
  /** 법 §118의7① 기본공제 = min(양도소득금액, 연 한도) — 미등기 배제 단서 없음 */
  basicDeduction: number;
  /** 과세표준 = 양도소득금액 − 기본공제 (천원 절사 없음) */
  taxBase: number;
  /** 법 §118의5① §55① 적용 구간의 세율(소수, 0.4 = 40%) — 과세표준 0이면 0 */
  appliedRate: number;
  progressiveDeduction: number;
  /** 산출세액 */
  calculatedTax: number;
  /** 외국납부세액 방법(입력이 있을 때만) */
  foreignTaxMethod?: ForeignTaxMethod;
  /** 외국납부세액 원화 합 */
  foreignTaxPaidKrwTotal: number;
  /** 세액공제방법 공제액 합(소득세) */
  foreignTaxCreditApplied: number;
  /** 한도 초과 등으로 공제받지 못한 외국납부세액 합 */
  foreignTaxUnappliedKrw: number;
  /** 결정세액 = 산출세액 − 외국납부세액 공제 */
  determinedTax: number;
  /** 지방세법 §103③ 과세표준(= 소득세 과세표준) */
  localIncomeTaxBase: number;
  /** 지방세특례제한법 §97③ — 세액공제방법 공제금액의 100분의 10(원 미만 절사, 지방소득세 산출세액 한도) */
  localForeignTaxCredit: number;
  /** 지방소득세 끝수 처리 전 금액 = 지방세법 §92① 산출세액 − 지방세특례제한법 §97③ 공제 */
  localIncomeTaxBeforeRounding: number;
  /** 개인지방소득세 — 지방세법 §92① 세율, 지방세기본법 §59→국고금 관리법 §47① 10원 미만 절사 */
  localIncomeTax: number;
  totalTax: number;

  /** 지원 개시 양도일(yyyy-MM-dd) */
  supportedFrom: string;
  /** 가장 늦은 양도일(yyyy-MM-dd) */
  appliedLawDate: string;
  /** 코드(`confirmationNeeded`)로 표현되지 않는 주의 문구만 — 같은 취지를 코드와 문구로 이중 발행하지 않는다(화면에 «확인 필요» 카드가 겹친다) */
  warnings: string[];
  /** 적용한 법령 조문 상수(`TRANSFER_FOREIGN_RE.*`) */
  appliedRules: string[];
  confirmationNeeded: ForeignRealEstateConfirmationCode[];
}
