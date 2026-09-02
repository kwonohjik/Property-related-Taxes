/**
 * 양도소득세 다건 합산(Aggregate) 공개 타입 정의
 *
 * `../transfer-tax-aggregate.ts` 엔진 본체가 커져 800줄 정책을 초과하여
 * 타입 인터페이스만 이 파일로 분리한다. import 소비자들은 동일 경로(`../transfer-tax-aggregate`)
 * 에서 re-export된 타입을 계속 사용할 수 있으므로 하위 호환은 barrel 수준에서 유지된다.
 *
 * 근거 조문:
 *   - 소득세법 §92 — 동일 과세기간 양도소득금액 합산
 *   - 소득세법 §102 ② + 시행령 §167의2 — 양도차손 통산
 *   - 소득세법 §103 — 연 250만원 기본공제
 *   - 소득세법 §104⑤ — 비교과세
 *   - 조특법 §127⑦ — 감면 중복배제 (자산 내)
 *   - 조특법 §133 — 감면 종합한도 (자경 1억 / 수용 2억)
 */

import type { RateClause } from "../transfer-tax-rate-clause";
import type { TransferTaxPenaltyResult } from "../transfer-tax-penalty";
import type {
  TransferTaxInput,
  CalculationStep,
  AmendmentInput,
  AmendmentDetail,
} from "./transfer.types";
import type {
  TransferReductionDetailSource,
  TransferValuationDetailSource,
} from "./transfer-result.types";

/** 세율군 (소득세법 §102 ① 각 호 구분) */
export type RateGroup =
  | "progressive"              // 일반 누진 6~45% (보유 2년+, 중과·특례 해당 없음)
  | "short_term"               // 단기보유 단일세율 (보유 2년 미만)
  | "multi_house_surcharge"    // 다주택 중과 (+20%p / +30%p)
  | "non_business_land"        // 비사업용 토지 (+10%p)
  | "unregistered";            // 미등기 70% 단일

/**
 * 자산 단위 입력 — TransferTaxInput에서 공통 필드 제외 + 식별자 추가.
 * `filingPenaltyDetails`/`delayedPaymentDetails`는 자산별로 입력 가능 (단건 엔진이 자산별 결정세액 기준 계산).
 * `priorReductionUsage`는 인별 이력이므로 AggregateTransferInput top-level 전용 —
 * 자산 단위에 허용하면 단건 STEP 8.5와 aggregate M-8이 이중 capping되어 자산별 표시값이 어긋난다.
 */
export type TransferTaxItemInput = Omit<
  TransferTaxInput,
  | "annualBasicDeductionUsed"
  | "skipBasicDeduction"
  | "skipLossFloor"
  | "priorReductionUsage"
> & {
  propertyId: string;
  propertyLabel: string;
};

/** 다건 입력 (건별 + 공통) */
export interface AggregateTransferInput {
  /** 과세기간 (YYYY) */
  taxYear: number;
  /** 건별 양도 자산 목록 (1..20건) — 자산별 가산세 입력은 각 item의 filingPenaltyDetails/delayedPaymentDetails. */
  properties: TransferTaxItemInput[];
  /** 당해 연도에 이미 사용한 기본공제액 (타 계산 건 포함) */
  annualBasicDeductionUsed: number;
  /** 기본공제 배분 전략 (기본 MAX_BENEFIT) */
  basicDeductionAllocation?: "MAX_BENEFIT" | "FIRST" | "EARLIEST_TRANSFER";
  /** 과거 4개 과세연도 감면 이력 (§133 5년 누적 한도 계산용, 사용자 직접 입력) */
  priorReductionUsage?: { year: number; type: string; amount: number }[];
  /**
   * 신고서 단위 수정신고·경정청구 (국세기본법 §45·§45의2).
   * 다자산은 합산 결정세액 1개에 대해 정정하므로 filing-level. 단건 AmendmentInput 재사용.
   * 미지정 시 amendmentDetail 미생성(기존 동작 불변).
   */
  amendment?: AmendmentInput;
  /**
   * 예정신고 기납부세액 총액 (양도소득세 국세분, 원). 확정신고 정산 시 결정세액에서 공제(§111③).
   * 미지정 시 0 — 자동 안분·추정 없음. 명칭은 transfer-tax-penalty.ts priorPaidTax와 일관.
   * ⚠️ amendment 와 동시 지정은 validate/UI 상호배타 가드(엔진은 항상 처리).
   */
  priorPaidTax?: number;
  /** 예정신고 기납부 지방소득세 (원). 미지정 0. */
  priorPaidLocalTax?: number;
  /**
   * **신고서 단위** 신고불성실·납부지연 가산세 (국세기본법 §47의2·§47의3·§47의4).
   *
   * ## 자산별 입력(`properties[].filingPenaltyDetails`)과 무엇이 다른가
   *
   * 다건 신고(여러 자산을 각각 예정신고)는 **자산별**이 맞다 — 국세기본법 §47의2①의 base가
   * 「그 신고로 납부하여야 할 세액」이고 ⑤이 예정신고분·확정신고분을 분리하기 때문이다(F03).
   *
   * 그러나 **일반건물처럼 하나의 자산이 내부적으로 여러 카드로 쪼개지는 경우**는 다르다.
   * 카드마다 실으면 같은 신고 1건의 가산세가 **카드 수만큼 배가된다**. 이 필드는 그런 경로가
   * 「신고 1건 = 가산세 1회」를 표현하기 위한 것이다.
   *
   * ⚠️ 자산별 입력과 **동시에 쓰지 않는다** — 쓰면 같은 신고에 두 번 부과된다.
   *
   * 🔑 `determinedTax`·`reductionAmount`·`unpaidTax`는 **엔진이 집계값으로 덮어쓴다**
   *    (단건 route의 2-pass와 같은 규약 — 호출부가 미리 알 수 없는 값이다).
   */
  filingPenaltyDetails?: TransferTaxInput["filingPenaltyDetails"];
  delayedPaymentDetails?: TransferTaxInput["delayedPaymentDetails"];
}

/**
 * 자산별 breakdown.
 *
 * 두 계약 타입을 extends해 상세를 승계한다:
 *   - `TransferReductionDetailSource` — 감면·취득가액 24종(§77 계열·신축주택·미분양·장기임대·자경농지 등)
 *   - `TransferValuationDetailSource` — 평가·판정 11종(상가 환산·비사업용토지·다주택 중과·PHD 등)
 * 덕분에 상세 카드를 단건·일괄 양쪽에서 **같은 컴포넌트로** 렌더한다.
 *
 * 그 상세들은 **echo 전용**이다 — 최종 감면세액은 합산 재계산(`reductionAggregated`·
 * `ReductionBreakdownEntry`)이 담당하고, 상세는 자산별 **산출근거 표시**에만 쓴다.
 * 값 주입은 `pickReductionDetails()`(transfer-tax-aggregate.ts)가 단일 지점에서 한다.
 */
export interface PerPropertyBreakdown
  extends TransferReductionDetailSource,
    TransferValuationDetailSource {
  propertyId: string;
  propertyLabel: string;
  isExempt: boolean;
  exemptReason?: string;
  /** 양도가액 (입력값) */
  transferPrice: number;
  /** 취득가액 (환산취득가 사용 시 환산 후 값) */
  acquisitionPrice: number;
  /** 필요경비 (엔진 산식 = 자본적지출 + 양도비). 신고서 양식 표시 시 자본적지출은 취득가액으로 분류 */
  necessaryExpense: number;
  /**
   * 자본적 지출 (소득세법 §97① 가목) — 신고서 양식상 취득가액에 합산되어 표시.
   * `necessaryExpense - capitalExpenditureForDisplay = 양도비(§97① 나목)`로 도출 가능.
   */
  capitalExpenditureForDisplay: number;
  /** 건별 결정세액 (단건 엔진 결과) */
  determinedTax: number;
  /** 양도차익 (skipLossFloor=true → 음수 가능) */
  transferGain: number;
  /** [echo] 전액 비과세 자산 gross 양도차익 (표시 전용). result.exemptGrossGain 패스스루. */
  exemptGrossGain?: number;
  /** 장기보유특별공제 */
  longTermHoldingDeduction: number;
  /**
   * 원시 양도소득금액 = taxableGain - longTermHoldingDeduction (음수 가능)
   * §102② 차손 통산의 입력값.
   */
  income: number;
  /** 세율군 */
  rateGroup: RateGroup;
  /** 같은 그룹에서 받은 차손 공제 (양수) */
  lossOffsetFromSameGroup: number;
  /** 타군에서 안분 받은 차손 공제 (양수) */
  lossOffsetFromOtherGroup: number;
  /** 통산 후 소득금액 (≥ 0) — income-deduction 감면 前(양도소득금액 표시 기준) */
  incomeAfterOffset: number;
  /** §99의3 등 소득금액차감 감면대상 양도소득금액(§90②) — incomeAfterOffset에서 차감되어 과세 */
  incomeDeductionReducible?: number;
  /** 배분된 기본공제액 */
  allocatedBasicDeduction: number;
  /** 그룹 과세표준 중 본 자산 기여분 */
  taxBaseShare: number;
  /** 자산별 적용 세율 (단건 엔진 결과) — 자산별 산출세액 재계산용 */
  appliedRate: number;
  /** 자산별 누진 차감액 */
  progressiveDeduction: number;
  /** 자산별 중과세율 (해당 시) */
  surchargeRate?: number;
  /** 엔진이 적용한 §104① 호 — 신고서 ③ 세율구분 코드의 단일 소스. */
  rateClause?: RateClause;
  /** 부칙 <제9270호> §14① 비사업용 +10%p 배제 — 정본 ⑮가 일반세율 코드로 분류한다. */
  nblSurchargeExcluded?: boolean;
  /**
   * 자산별 산출세액 (다건 컨텍스트, 참고).
   * = max(0, floor(taxBaseShare × appliedRate) - progressiveDeduction)
   *   (`appliedRate`가 이미 중과 포함 실효세율이다 — `surchargeRate`를 더하면 이중 계상. 2026-09-02 정정)
   * 자산이 1건일 때 합산 산출세액과 일치. 비교과세 적용 시 합산값과 차이 가능.
   */
  refCalculatedTax: number;
  /**
   * 파트가 있는 자산(토지·건물 분리취득 · 한 필지 중 일부만 비사업용)의 **파트별 산식 문구**.
   * `resolveSplitAwareTax`가 낸 `shortTermNote`를 그대로 echo한다 — 그 자산에서는
   * 「과세표준 기여분 × 세율」 산식이 성립하지 않기 때문이다(계획서 §4.12).
   * 파트가 없는 자산은 `undefined`(UI가 종전 산식을 쓴다).
   */
  refCalculatedTaxNote?: string;
  /**
   * [echo] 재개발·재건축 §166 분할 detail (**표시 전용** — 세액 불변).
   *
   * 🔴 자산별 신고서 양식의 열 구성은 `deriveColumns`가 `result.redevelopmentDetail` **하나로**
   *   게이트한다. 이 필드가 없으면 어댑터(`breakdownToFilingResult`)가 채울 소스가 없어
   *   `hasRedev`가 **항상 false**가 되고, 재개발 자산의 §166 분할 열이 다건 「건별 상세」에서
   *   통째로 사라진다 — 실측: 같은 입주권이 단건에서는 3열
   *   (합계 · ① 인가전 분 · ② 인가후 분(청산금 납부), mode=`redev-right-pay`)인데
   *   다건 자산별에서는 **1열(합계)**, mode=`single`이었다 (결과탭 코드리뷰 #080 ③).
   *
   * ⚠️ `TransferValuationDetailSource`가 이 필드를 제외한 것은 **일괄(bundled)** 축이다
   *   (그 경로는 재개발 자산을 차단한다 — PR #854). **다건(multi)** 은 차단하지 않아
   *   엔진이 정상으로 detail을 만든다.
   */
  redevelopmentDetail?: import("./transfer-redevelopment.types").RedevelopmentResult;
  /**
   * 자산별 결정세액 (다건 컨텍스트, 참고).
   * = max(0, refCalculatedTax - reductionAmount)
   * 기납부세액 자동 계산(앞 자산들의 결정세액 합) 등에 사용된다.
   */
  refDeterminedTax: number;
  /**
   * 건별 단독 감면액 (단건 엔진이 이미 중복배제 적용).
   * 합산 재계산 전의 값으로 비교·디버깅용.
   */
  reductionAmount: number;
  /** 적용된 감면 유형 식별자 (self_farming·public_expropriation 등) */
  reductionType?: string;
  /**
   * 건별 감면대상 양도소득금액 (조특령 §66 비율 적용 후).
   * 합산 재계산의 분자로 사용된다.
   */
  reducibleIncome: number;
  /**
   * 합산 재계산 후 이 건에 배분된 감면세액.
   * = `유형별 총감면세액 × (이 건 reducibleIncome / 유형별 총 reducibleIncome)`
   */
  reductionAggregated: number;
  /** 배분 비율 (= 이 건 reducibleIncome / 유형별 총 reducibleIncome) */
  reductionAllocationRatio: number;
  /** §114조의2 건별 환산가액적용가산세 */
  penaltyTax: number;
  /**
   * §114조의2 건별 가산세 산정 기준액 (= 가산세 ÷ 0.05).
   * 환산취득가액 모드 = 건물 환산취득가액, 감정가액 모드 = 감정가액. 가산세 미발동 시 0.
   * BundledAllocationCard 등 결과 카드의 "건물 환산취득가 X × 5%" 산식 표시용.
   */
  penaltyBase: number;
  /** 건별 신고불성실·납부지연 가산세 합계 */
  filingDelayedPenaltyTax: number;
  /** 건별 신고불성실·납부지연 가산세 상세 (입력 시) */
  penaltyDetail?: TransferTaxPenaltyResult;
  /** 건별 세부 계산 steps (단건 엔진에서 생성) */
  steps: CalculationStep[];
  /**
   * 세율 적용 주석 — 부수토지 일체과세(§89①3호·영§154⑦) 등 특수 세율 분기 시 한국어 주석.
   * 신고서 양식 표의 세율 행 아래에 자산별로 다르게 표시 (한도 내·한도 초과 케이스).
   * 일반 누진세율 케이스는 undefined.
   */
  shortTermNote?: string;
}

/** 감면 유형별 합산 재계산 내역 (UI 표시용) */
export interface ReductionBreakdownEntry {
  /** 감면 유형 식별자 */
  type: string;
  /** 법령 근거 (표시용) */
  legalBasis: string;
  /** 유형별 총 감면대상 양도소득금액 */
  totalReducibleIncome: number;
  /**
   * M-8이 `totalReducibleIncome` 지분세액에 **추가로 곱한** 감면율 (1 = 이미 반영됨).
   * §97 계열·legacy 장기임대·legacy 신축·하이브리드는 별지84호 부표1 ⑲ 표시 계약 때문에
   * `reducibleIncome`이 「감면율 前」 금액이라 여기서 곱한다 (코드리뷰 D8-01).
   */
  appliedReductionRate: number;
  /** 재계산 분모 (합산 과세표준) */
  aggregateTaxBase: number;
  /** 재계산 기준 세액 (비교과세 MAX 결과) */
  aggregateCalculatedTax: number;
  /** 재계산 원시 감면세액 (한도 적용 전) */
  rawAggregateReduction: number;
  /** §133 유형별 연간 한도 (없으면 0) */
  annualLimit: number;
  /** 연간 한도 적용 후 금액 */
  annuallyCappedReduction: number;
  /** 한도 적용 후 최종 감면세액 (연간 + 5년 한도 모두 적용) */
  cappedAggregateReduction: number;
  /** 연간 한도에 걸려 절사된 경우 true */
  cappedByLimit: boolean;
  /** §133 5년 누적 한도 (없으면 0) */
  fiveYearLimit: number;
  /** 과거 4개 연도 그룹 누적 감면액 */
  priorGroupSum: number;
  /** 5년 한도 잔여액 */
  fiveYearRemaining: number;
  /** 5년 한도에 걸려 추가 절사된 경우 true */
  cappedByFiveYearLimit: boolean;
  /** 이 유형에 속한 자산 식별자 목록 */
  assetIds: string[];
}

/** 세율군별 집계 */
export interface GroupTaxResult {
  group: RateGroup;
  /** 그룹 내 자산 IDs */
  assetIds: string[];
  /** 그룹 차익 합 (양수 자산만) */
  groupGrossGain: number;
  /** 그룹 차손 합 (음수 자산만, 절댓값) */
  groupGrossLoss: number;
  /** 통산 후 그룹 소득금액 (≥ 0) */
  groupIncomeAmount: number;
  /** 그룹 배분 기본공제 */
  groupBasicDeduction: number;
  /** 그룹 과세표준 = max(0, groupIncomeAmount - groupBasicDeduction) */
  groupTaxBase: number;
  /** 그룹 산출세액 */
  groupCalculatedTax: number;
  appliedRate: number;
  surchargeRate?: number;
  progressiveDeduction: number;
}

export interface LossOffsetRow {
  fromPropertyId: string;
  toPropertyId: string;
  amount: number;
  scope: "same_group" | "other_group";
}

export interface AggregateTransferResult {
  properties: PerPropertyBreakdown[];

  totalTransferGain: number;
  totalLongTermHoldingDeduction: number;
  totalIncomeBeforeOffset: number;
  totalLoss: number;

  lossOffsetTable: LossOffsetRow[];
  /** 통산 후에도 남아 소멸된 차손 (이월 불인정) */
  unusedLoss: number;
  totalIncomeAfterOffset: number;

  basicDeduction: number;
  taxBase: number;

  groupTaxes: GroupTaxResult[];

  /** 방법 B: 세율군별 분리 산출세액 합 */
  calculatedTaxByGroups: number;
  /** 방법 A: 전체 누진세율 적용 산출세액 */
  calculatedTaxByGeneral: number;
  /** 비교과세(§104⑤) 적용 결과 */
  comparedTaxApplied: "groups" | "general" | "none";
  /**
   * §104⑤ **크로스 조정**(부동산 §104①8호 ↔ 주식 §104①9호)용 echo — 본문 후단
   * 「제2호의 금액을 계산할 때 **제1항제8호 및 제9호의 자산은 동일한 자산으로 보고**」.
   *
   * 주식 엔진의 `otherAssetComparativeTax.clause9TaxBase`·`clause9Tax`와 **대칭**이며,
   * 조정 레이어 `comparative-104-5-cross.ts`가 두 값을 한 버킷으로 재합산한다.
   *
   * 🔒 후보 집합이 **정확히 `{104-1-8}`인 버킷**만이다(좁은 해석 — 단기 비사토 제외).
   * ⚠️ `groupTaxes`의 `non_business_land` 그룹으로 대신할 수 없다 — **부분 비사업용 토지**는
   *   한 그룹 안에서 8호 파트/1호 파트로 갈린다. 8호 자산이 없으면 둘 다 0.
   */
  clause8TaxBase: number;
  clause8Tax: number;
  /**
   * §104⑤ **크로스 조정**(부동산 §104①**1호** ↔ 기타자산 §104①1호)용 echo — 2호의 「자산별」이
   * 예규상 「**각 호별로 합산한 자산**」이므로 **1호끼리도 합산 대상**이다(기재부 재산세제과-536).
   *
   * 🔒 후보 집합이 **정확히 `{104-1-1}`인 버킷**만이다 — 8호와 같은 좁은 규약.
   * 🔒 **분양권은 포함되지 않는다.** 호는 1호이나 세율이 단일 60%라 `classifyRateGroup`이
   *   `short_term`으로 분리해 두고, 이 echo는 누진 호 분기에서만 누적되기 때문이다.
   *   제외 근거는 **현행 규약 승계**이지 새 법령 해석이 아니다
   *   (계획서 `cross-104-5-c3-ui-design.plan.md` · 가드 `presale-clause-1-bucket-guard`).
   * ⚠️ 조합원입주권 2년+는 1호 누진이라 **포함**된다. 1호 버킷이 없으면 둘 다 0.
   */
  clause1BucketTaxBase: number;
  clause1BucketTax: number;
  /** MAX(byGroups, byGeneral) */
  calculatedTax: number;

  /**
   * 총 감면세액 (합산 재계산 + §133 한도 적용 후).
   * 유형이 지정된 감면은 유형별 비율 재계산을 적용하고, 유형 미지정 감면(레거시 경로)은 건별 단순합.
   */
  reductionAmount: number;
  /**
   * 감면 유형별 합산 재계산 내역 (UI 표시·디버깅용).
   * self_farming·public_expropriation 등 reducibleIncome을 노출하는 감면에 대해 세부 항목 포함.
   */
  reductionBreakdown: ReductionBreakdownEntry[];
  /** 결정세액 = max(0, calculatedTax - reductionAmount) */
  determinedTax: number;

  /** [echo] 예정신고 기납부세액 (국세, §111③). 미지정 0 */
  priorPaidTax: number;
  /** [echo] 예정신고 기납부 지방소득세. 미지정 0 */
  priorPaidLocalTax: number;
  /** 국세 이번 납부할세액 = max(0, (determinedTax + penaltyTax) − priorPaidTax) */
  settlementAdditionalPayable: number;
  /** 국세 환급 = max(0, priorPaidTax − (determinedTax + penaltyTax)) */
  settlementRefund: number;
  /** 지방 이번 납부할세액 = max(0, localIncomeTax − priorPaidLocalTax) */
  settlementLocalPayable: number;
  /** 최종 납부할세액 = settlementAdditionalPayable + settlementLocalPayable */
  settlementTotalDue: number;

  /**
   * 신고서 단위 수정신고·경정청구 정정 상세 (input.amendment 지정 시).
   * = computeAmendment(input.amendment, determinedTax). refund 필드(refundTax·claimDeadline 등) 포함.
   * 미지정 시 undefined (기존 동작 불변). 단건 AmendmentDetail 재사용 — JSON 안전(Record/원시값).
   */
  amendmentDetail?: AmendmentDetail;

  /**
   * 자산별 §114의2 + 자산별 신고불성실/납부지연 + **신고서 단위** 가산세 합계
   * (자산별 상세는 `properties[i].penaltyDetail`, 신고서 단위 상세는 아래 `filingUnitPenaltyDetail`).
   */
  penaltyTax: number;

  /**
   * 신고서 단위 신고불성실·납부지연 가산세 상세 (F17 — 입력 `filingPenaltyDetails`가 있을 때만).
   * 결과 화면이 「신고불성실 얼마 · 납부지연 얼마」를 풀어 쓰는 데 쓴다.
   */
  filingUnitPenaltyDetail?: TransferTaxPenaltyResult;

  /**
   * **부담부증여 × 배우자등 이월과세** 판정 명세 (F27 — 일반건물 §159 분기 전용).
   *
   * 단건 경로의 `carryoverTaxationDetail`과 **다른 축**이다: 저쪽은 자산 1건의 A/B이고,
   * 이쪽은 카드 여러 장이 이루는 **신고 전체**의 A/B다(§97의2②3호가 「양도소득 **결정세액**」을
   * 비교하므로 카드 단위로는 판정할 수 없다).
   */
  burdenedGiftCarryoverDetail?: {
    isEligible: boolean;
    applicablePeriodYears: 5 | 10;
    /** 채택 시나리오 — A: §97의2① 적용 · B: 미적용(②3호로 되돌아간 경우 포함) */
    adoptedScenario: "A" | "B";
    /** 신고단위 결정세액 — ②3호 비교의 두 항 */
    determinedTaxA: number;
    determinedTaxB: number;
    /** §95④ 단서 보유기간 기산일 */
    donorAcquisitionDate: Date;
    /** §97의2①3호 증여세 상당액 (§159 안분 단계가 한도까지 처리) */
    giftTaxAmount: number;
  };

  /**
   * [echo] 지방소득세 과세표준에 산입되는 가산세 = 자산별 **§114조의2분 합계만**.
   *
   * 위 `penaltyTax`는 국기법 §47의2~§47의4 신고불성실·납부지연분까지 합한 **총액**이라
   * 지방소득세 base로 쓸 수 없다. 표시부가 base를 재현해야 할 때는 이 필드를 쓴다.
   */
  buildingPenaltyTax?: number;
  /**
   * 지방소득세 = (결정세액 + **§114조의2분만**) × 10%, 원 미만 절사 (지방세법 §103의3).
   * 국기법 신고불성실·납부지연 가산세는 과세표준에서 제외된다 — `transfer-tax-aggregate.ts` STEP M-10.
   */
  localIncomeTax: number;
  /** 농어촌특별세 = §99의3 등 소득금액차감 감면세액 × 20% (농특세법 §3·§5). 감면 없으면 0. */
  ruralSurtax: number;
  totalTax: number;

  steps: CalculationStep[];
  warnings: string[];

  /**
   * 일반건물(토지+건물 일괄) 환산 산정 상세 (사례 31·33 일괄 모드만 채워짐).
   * UI 자산별 산식 인라인 표시(`DetailedCalculationStatementCard`)에서 분모/분자 변수로 사용.
   * `landStdTotal`·`buildingStdTotal`·`extensionStdTotal`·`acqLandStdTotal` 등 §166⑥·§176의2② 안분 변수 포함.
   */
  generalBuildingValuationDetail?: import("../general-building-valuation").GeneralBuildingOutput;
  /**
   * §97②2호 단서 swap 발동 여부 (일반건물 환산 자산총액 판정 — 안 A).
   * 나목(자본적지출+양도비) > 가목(환산취득가+개산공제 합) 시 true. 결과뷰 표시용.
   */
  swapApplied?: boolean;
  /** §97②2호 단서 swap 비교 (자산총액). */
  swapComparison?: { estimatedSide: number; directSide: number; chosen: "estimated" | "direct" };
}
