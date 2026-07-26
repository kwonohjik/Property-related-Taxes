/**
 * 조특법 §99의3 — 신축주택의 취득자에 대한 양도소득세의 과세특례
 *
 * Phase 2 본격 구현 (2026-05-06).
 *
 * 산식 (Design doc §"핵심 산식"):
 *   - 5년 내 양도: 취득~양도일까지 발생한 양도소득금액 전체 차감
 *   - 5년 후 양도: 양도소득금액 × (5년시점 기준시가 - 취득시 기준시가) / (양도시 기준시가 - 취득시 기준시가)
 *
 * 부호별 처리 (PDF 사례 26 부호 표):
 *   - (+,+): 안분 비율 적용
 *   - (-,+): 감면 0  (부동산-136, 2012.3.6.)
 *   - (+,-): 양도소득금액 전체 감면 (부동산-525, 2010.4.7.)
 *   - (-,-): 감면 0  (재산 2014-2035, 2014.11.20.)
 *
 * 적용 배제 (우선순위 순):
 *   1. 거주자 아님
 *   2. 본인이 주택건설사업자
 *   3. 가격 급등 지역(서울·과천·5대 신도시) 내
 *   4. 신축주택취득기간(2001.5.23~2003.6.30) 외
 *   5. 1호 단서: 매매계약일 입주사실 있는 주택
 *   6. 고가주택 (4단계 정의)
 *
 * 농특세: 양도세 감면세액 × 20% (감면세액 = 감면 전 산출세액 - 감면 후 산출세액)
 *
 * 설계 문서: docs/02-design/features/transfer-reduction-99-3.engine.design.md
 * anchor: docs/02-design/features/anchors/reduction-99-3-case-2023.md
 */

import { addYears } from "date-fns";
import { TRANSFER_REDUCTION_ARTICLE } from "../legal-codes/transfer";
import { applyRate } from "../tax-utils";

// ============================================================================
// 타입 정의
// ============================================================================

export interface New993Input {
  /** 양도일 */
  transferDate: Date;
  /** 취득일 */
  acquisitionDate: Date;
  /** 분양계약일 (1호 적용) — 시한 검증 + 고가주택 적용기준일 */
  contractDate?: Date;
  /** 사용승인일 (2호 적용 — 자기건설) */
  usageApprovalDate?: Date;
  /** 양도소득금액 (양도차익 - 장특공제) */
  transferIncome: number;
  /** 취득시 기준시가 — PHD 환산 후 값 (호출자가 사전 처리) */
  standardPriceAtAcquisition: number;
  /** 5년 시점 기준시가 (취득일 + 5년 인접 고시일 가격) */
  standardPriceAt5Years: number;
  /** 양도시 기준시가 */
  standardPriceAtTransfer: number;
  /** 양도가액 (고가주택 판정용) */
  transferPrice: number;
  /** 전용면적 (㎡) — 고가주택 면적 기준 (2002.12.31 이전) */
  exclusiveAreaSqm: number;
  /** 지역 — 가격 급등 지역(speculation) 내/외 */
  region: "outside_speculation" | "speculation";
  /** 거주자 여부 */
  isResident: boolean;
  /** 본인이 주택건설사업자인 경우 적용 배제 */
  isHousingConstructionBusiness: boolean;
  /** 취득 유형 — 1호(주건업 취득) | 2호(자기건설) */
  acquisitionType: "from_builder" | "self_built";
  /** (1호만) 매매계약일 입주사실 있는 주택 — 적용 배제 */
  hasOccupancyAtContract?: boolean;
  /** 감면 전 산출세액 (농특세 산정용) — STEP 7에서 양도소득금액 차감 전 산출세액 */
  calculatedTaxBeforeReduction: number;
  /** 감면 후 산출세액 (농특세 산정용) — 양도소득금액 차감 후 산출세액 */
  calculatedTaxAfterReduction: number;
  /**
   * §99의3 ②항: 신축주택 외 다른 주택의 양도일 (선택).
   * 2007.12.31 이전 양도 시 신축주택을 1세대1주택 비과세 판정에서 주택수 제외.
   * 미입력 시 ②항 적용 안 함 (false).
   */
  otherHouseTransferDate?: Date;
}

export interface New993FormulaStep {
  label: string;
  value: number;
  formula?: string;
}

export interface New993IneligibleReason {
  code: string;
  message: string;
  legalBasis: string;
}

export type New993SignCase =
  | "all_positive"     // (+,+) 안분 적용
  | "neg_pos"          // (-,+) 감면 0
  | "pos_neg"          // (+,-) 전액 감면
  | "all_negative"     // (-,-) 감면 0
  | "within_5_years"   // 5년 내 — 부호 분기 없음
  | "ineligible";      // 적용 배제

export interface New993Result {
  isEligible: boolean;
  ineligibleReasons: New993IneligibleReason[];
  /** 5년 이내 양도 여부 */
  isWithin5Years: boolean;
  /** 감면 대상 양도소득금액 (= 양도소득금액에서 차감할 금액) */
  reducibleTransferIncome: number;
  /** 5년 안분 비율 (5년 후 양도 시) — UI 표시용 */
  fiveYearRatio: number;
  /** [echo] 감면대상 산식 구성값 — 결과뷰 Frac 산식 표시용(값 인라인). 5년 후 안분 케이스에서 세팅. */
  transferIncomeApplied?: number;
  standardPriceAtAcquisition?: number;
  standardPriceAt5Years?: number;
  standardPriceAtTransfer?: number;
  /** 부호 케이스 분류 */
  signCase: New993SignCase;
  /** 산식 단계 (UI 표시용) */
  formulaSteps: New993FormulaStep[];
  /** 양도세 감면세액 = 감면 전 산출세액 - 감면 후 산출세액 (농특세 기준) */
  taxReductionForRuralSurtax: number;
  /** 농어촌특별세 (감면세액 × 20%) — 농특세법 §3·§5 */
  ruralSurtax: number;
  /**
   * §99의3 ②항: 1세대1주택 비과세 적용 시 신축주택을 소유주택 아닌 것으로 보는지 여부.
   * 조건: 신축주택 외 다른 주택을 2007.12.31까지 양도하는 경우에만 true.
   * 본 필드가 true면 호출자(메인 엔진)가 1세대1주택 비과세 판정 시 신축을 주택수에서 제외.
   */
  isExcludedFromHouseCountFor1H1H: boolean;
  /** 법적 근거 */
  legalBasis: string;
}

/** §99의3 ②항 입력 (선택) — 호출자가 1세대1주택 비과세 판정 시 사용 */
export interface New993HouseCountExclusionInput {
  /** 신축주택 외 다른 주택의 양도일 (있는 경우) — 2007.12.31 이전 양도 시에만 ②항 적용 */
  otherHouseTransferDate?: Date;
}

// ============================================================================
// 시기 상수 (조특법 §99의3 ① 본문 + 1호)
// ============================================================================

// UTC 자정 파싱 — API 경유 입력(new Date("YYYY-MM-DD") = UTC midnight)과 동일 기준.
// "T00:00:00" 로컬 자정은 KST 서버에서 9시간 어긋나 경계일 오판 (unsold-hybrid-p5 D()와 통일).
const D = (s: string) => new Date(s);

const PERIOD_START = D("2001-05-23");
const PERIOD_END = D("2003-06-30");

// 고가주택 적용기준일 분기점
const HV_2002_09_30 = D("2002-09-30");
const HV_2002_12_31 = D("2002-12-31");
const HV_2008_10_05 = D("2008-10-05");
const HV_2021_12_07 = D("2021-12-07");

// ============================================================================
// 헬퍼: 고가주택 판정 (분양계약일 기준 4단계 정의)
// ============================================================================

/**
 * 분양계약일·사용승인일·취득일 중 가장 빠른 시점을 기준으로 고가주택 여부 판정.
 *
 * - ~2002.9.30: 면적 165㎡ 이상 AND 양도가 6억 초과 (고급주택)
 * - 2002.10.1~2002.12.31: 면적 149㎡ 이상 AND 양도가 6억 초과 (고급주택)
 * - 2003.1.1~2008.10.5: 양도가 6억 초과 (고가주택)
 * - 2008.10.6~2021.12.7: 양도가 9억 초과 (고가주택)
 * - 2021.12.8~: 양도가 12억 초과 (고가주택)
 */
export function isHighValueHouseUnder993(
  baseDate: Date,
  transferPrice: number,
  exclusiveAreaSqm: number,
): boolean {
  if (baseDate <= HV_2002_09_30) {
    return exclusiveAreaSqm >= 165 && transferPrice > 600_000_000;
  }
  if (baseDate <= HV_2002_12_31) {
    return exclusiveAreaSqm >= 149 && transferPrice > 600_000_000;
  }
  if (baseDate <= HV_2008_10_05) {
    return transferPrice > 600_000_000;
  }
  if (baseDate <= HV_2021_12_07) {
    return transferPrice > 900_000_000;
  }
  return transferPrice > 1_200_000_000;
}

// ============================================================================
// 헬퍼: 5년 시점 판정
// ============================================================================

/**
 * 취득일 + 5년 시점이 양도일보다 이전이면 "5년 후 양도".
 * 동일 일자는 "5년 내" (취득일 + 5년 = 양도일).
 */
export function isWithin5YearsCheck(acquisitionDate: Date, transferDate: Date): boolean {
  // date-fns addYears — 윤년(2/29 취득) 응당일 없으면 말일(2/28)로 만료(민법 §160③).
  // setFullYear는 2/29+5년을 3/1로 롤오버해 1일 밀림 → 코드베이스 date-fns 관례로 통일.
  const fiveYearMark = addYears(acquisitionDate, 5);
  return transferDate <= fiveYearMark;
}

// ============================================================================
// 헬퍼: 적용 배제 검증 (우선순위 순)
// ============================================================================

function checkIneligibility(input: New993Input): New993IneligibleReason[] {
  const reasons: New993IneligibleReason[] = [];
  const legalBasis = TRANSFER_REDUCTION_ARTICLE.NEW_99_3;

  // 1. 거주자 아님
  if (!input.isResident) {
    reasons.push({
      code: "NOT_RESIDENT",
      message: "거주자가 아닌 자에게는 §99의3이 적용되지 않습니다 (대통령령으로 정하는 거주자 한정)",
      legalBasis,
    });
    return reasons; // 즉시 반환 (다른 사유는 무의미)
  }

  // 2. 본인이 주택건설사업자
  if (input.isHousingConstructionBusiness) {
    reasons.push({
      code: "HOUSING_CONSTRUCTION_BUSINESS",
      message: "본인이 주택건설사업자인 경우 §99의3이 적용되지 않습니다 (조문 본문 괄호)",
      legalBasis,
    });
    return reasons;
  }

  // 3. 가격 급등 지역
  if (input.region === "speculation") {
    reasons.push({
      code: "SPECULATION_AREA",
      message: "가격 급등 지역(서울·과천·5대 신도시) 내 신축주택은 §99의3이 적용되지 않습니다",
      legalBasis,
    });
    return reasons;
  }

  // 4. 신축주택취득기간 외
  const periodTarget =
    input.acquisitionType === "from_builder"
      ? input.contractDate ?? input.acquisitionDate
      : input.usageApprovalDate ?? input.acquisitionDate;
  if (periodTarget < PERIOD_START || periodTarget > PERIOD_END) {
    const targetLabel =
      input.acquisitionType === "from_builder" ? "매매계약일" : "사용승인일";
    reasons.push({
      code: "OUT_OF_ACQUISITION_PERIOD",
      message: `신축주택취득기간(2001.5.23~2003.6.30) 외 — 기준일(${targetLabel})이 시한 외입니다`,
      legalBasis,
    });
    return reasons;
  }

  // 5. 1호 단서: 매매계약일 입주사실 있는 주택
  if (input.acquisitionType === "from_builder" && input.hasOccupancyAtContract) {
    reasons.push({
      code: "OCCUPANCY_AT_CONTRACT",
      message: "매매계약일 현재 다른 자가 입주한 사실이 있는 주택은 §99의3 ① 1호 단서로 적용 배제됩니다",
      legalBasis,
    });
    return reasons;
  }

  // 6. 고가주택 (단서)
  const hvBaseDate =
    input.contractDate ?? input.usageApprovalDate ?? input.acquisitionDate;
  if (isHighValueHouseUnder993(hvBaseDate, input.transferPrice, input.exclusiveAreaSqm)) {
    reasons.push({
      code: "HIGH_VALUE_HOUSE",
      message: `고가주택(소득세법 §89①3호)은 §99의3 ① 단서로 적용 배제됩니다 (적용기준일 ${hvBaseDate.toISOString().split("T")[0]} 기준)`,
      legalBasis,
    });
    return reasons;
  }

  return reasons; // 빈 배열 = 적용 가능
}

// ============================================================================
// 헬퍼: 5년 안분 비율 계산 (부호 4가지 케이스 처리)
// ============================================================================

export interface FiveYearAllocation {
  ratio: number;
  signCase: New993SignCase;
  reducibleIncome: number;
}

/**
 * 기준시가 안분 공통 — 분자·분모를 직접 받는 저수준 형태 (P1 일반화, 2026-06-11).
 * §99의3 산식(분자 = 5년시점 − 취득시 / 분모 = 양도시 − 취득시)과
 * §99 재개발·재건축 변형(령 §99① — 분모 = 양도시 − 종전주택 취득시)이 공유.
 * 부호 4케이스 정책(부동산-136·525·재산2014-2035)은 동일 적용.
 */
export function calcSignedAllocation(
  transferIncome: number,
  numerator: number,
  denominator: number,
): FiveYearAllocation {
  // 부호 4가지 케이스 (PDF 부호 표)
  if (numerator > 0 && denominator > 0) {
    // (+,+) 정상 안분
    const ratio = numerator / denominator;
    // 양도소득금액 × 비율 (정수 차감, 원 미만 절사)
    // 원 단위 정확성: 분자·분모 정수 → BigInt 우회 불필요 (값이 커도 Number 충분)
    const reducible = Math.floor(transferIncome * ratio);
    return { ratio, signCase: "all_positive", reducibleIncome: reducible };
  }
  if (numerator < 0 && denominator > 0) {
    // (-,+) 감면 0 (부동산-136)
    return { ratio: 0, signCase: "neg_pos", reducibleIncome: 0 };
  }
  if (numerator > 0 && denominator < 0) {
    // (+,-) 전액 감면 (부동산-525)
    return {
      ratio: 1,
      signCase: "pos_neg",
      reducibleIncome: Math.max(0, transferIncome),
    };
  }
  // 그 외: 분자/분모 동시 음수, 분자 0, 분모 0 등 → 감면 0
  return { ratio: 0, signCase: "all_negative", reducibleIncome: 0 };
}

/** §99의3 5년 안분 — 기존 시그니처 보존 (anchor 호환) */
function calc5YearAllocation(
  transferIncome: number,
  stdAtAcq: number,
  stdAt5Y: number,
  stdAtTransfer: number,
): FiveYearAllocation {
  return calcSignedAllocation(transferIncome, stdAt5Y - stdAtAcq, stdAtTransfer - stdAtAcq);
}

// ============================================================================
// 헬퍼: §99의3 ②항 판정 — 1세대1주택 신축 주택수 제외
// ============================================================================

const OTHER_HOUSE_DEADLINE = D("2007-12-31");

/**
 * §99의3 ②항: 신축주택 외 다른 주택을 2007.12.31까지 양도하는 경우에만
 * 신축주택을 거주자의 소유주택으로 보지 아니한다 (1세대1주택 §89①3호 비과세 판정).
 */
function checkHouseCountExclusion993(otherHouseTransferDate?: Date): boolean {
  if (!otherHouseTransferDate) return false;
  return otherHouseTransferDate <= OTHER_HOUSE_DEADLINE;
}

// ============================================================================
// 메인 함수: evaluateNew993
// ============================================================================

export function evaluateNew993(input: New993Input): New993Result {
  const legalBasis = TRANSFER_REDUCTION_ARTICLE.NEW_99_3;
  const formulaSteps: New993FormulaStep[] = [];

  // STEP 1: 적용 배제 검증
  const ineligibleReasons = checkIneligibility(input);
  if (ineligibleReasons.length > 0) {
    return {
      isEligible: false,
      ineligibleReasons,
      isWithin5Years: false,
      reducibleTransferIncome: 0,
      fiveYearRatio: 0,
      signCase: "ineligible",
      formulaSteps: [],
      taxReductionForRuralSurtax: 0,
      ruralSurtax: 0,
      isExcludedFromHouseCountFor1H1H: false,
      legalBasis,
    };
  }

  // STEP 2: 5년 내/후 판정
  const isWithin5Years = isWithin5YearsCheck(input.acquisitionDate, input.transferDate);

  // STEP 3: 감면 양도소득금액 산출
  let reducibleTransferIncome: number;
  let fiveYearRatio: number;
  let signCase: New993SignCase;

  if (isWithin5Years) {
    // 5년 내 양도 — 양도소득금액 전액 차감
    reducibleTransferIncome = Math.max(0, input.transferIncome);
    fiveYearRatio = 1;
    signCase = "within_5_years";
    formulaSteps.push({
      label: "5년 이내 양도 — 양도소득금액 전액 차감",
      value: reducibleTransferIncome,
      formula: `양도소득금액 ${input.transferIncome.toLocaleString()} 전체를 양도소득세 과세대상소득금액에서 차감`,
    });
  } else {
    // 5년 후 양도 — 안분 산식
    const allocation = calc5YearAllocation(
      input.transferIncome,
      input.standardPriceAtAcquisition,
      input.standardPriceAt5Years,
      input.standardPriceAtTransfer,
    );
    reducibleTransferIncome = allocation.reducibleIncome;
    fiveYearRatio = allocation.ratio;
    signCase = allocation.signCase;

    const numerator = input.standardPriceAt5Years - input.standardPriceAtAcquisition;
    const denominator = input.standardPriceAtTransfer - input.standardPriceAtAcquisition;
    formulaSteps.push({
      label: "분자 (5년시점 기준시가 − 취득시 기준시가)",
      value: numerator,
      formula: `${input.standardPriceAt5Years.toLocaleString()} − ${input.standardPriceAtAcquisition.toLocaleString()} = ${numerator.toLocaleString()}`,
    });
    formulaSteps.push({
      label: "분모 (양도시 기준시가 − 취득시 기준시가)",
      value: denominator,
      formula: `${input.standardPriceAtTransfer.toLocaleString()} − ${input.standardPriceAtAcquisition.toLocaleString()} = ${denominator.toLocaleString()}`,
    });
    if (signCase === "all_positive") {
      formulaSteps.push({
        label: "5년 안분 비율",
        value: fiveYearRatio,
        formula: `${numerator.toLocaleString()} / ${denominator.toLocaleString()} = ${(fiveYearRatio * 100).toFixed(4)}%`,
      });
      formulaSteps.push({
        label: "감면 양도소득금액",
        value: reducibleTransferIncome,
        formula: `${input.transferIncome.toLocaleString()} × ${(fiveYearRatio * 100).toFixed(4)}% = ${reducibleTransferIncome.toLocaleString()}`,
      });
    } else if (signCase === "neg_pos") {
      formulaSteps.push({
        label: "감면 양도소득금액 = 0 (부호 음수/양수)",
        value: 0,
        formula: "분자 음수·분모 양수 — 부동산-136(2012.3.6.) 해석으로 감면 0",
      });
    } else if (signCase === "pos_neg") {
      formulaSteps.push({
        label: "감면 양도소득금액 = 양도소득금액 전액 (부호 양수/음수)",
        value: reducibleTransferIncome,
        formula: "분자 양수·분모 음수 — 부동산-525(2010.4.7.) 해석으로 양도소득금액 전체 감면",
      });
    } else {
      formulaSteps.push({
        label: "감면 양도소득금액 = 0 (부호 음수/음수)",
        value: 0,
        formula: "분자·분모 동시 음수(또는 0) — 재산 2014-2035(2014.11.20.) 해석으로 감면 0",
      });
    }
  }

  // STEP 4: 농특세 산정 — 감면세액 × 20%
  const taxReductionForRuralSurtax = Math.max(
    0,
    input.calculatedTaxBeforeReduction - input.calculatedTaxAfterReduction,
  );
  const ruralSurtax = applyRate(taxReductionForRuralSurtax, 0.2);
  formulaSteps.push({
    label: "양도세 감면세액 (농특세 기준)",
    value: taxReductionForRuralSurtax,
    formula: `감면 전 산출세액 ${input.calculatedTaxBeforeReduction.toLocaleString()} − 감면 후 산출세액 ${input.calculatedTaxAfterReduction.toLocaleString()}`,
  });
  formulaSteps.push({
    label: "농어촌특별세 (20%)",
    value: ruralSurtax,
    formula: `감면세액 ${taxReductionForRuralSurtax.toLocaleString()} × 20%`,
  });

  // STEP 5: §99의3 ②항 1세대1주택 비과세 시 주택수 제외 판정
  const isExcludedFromHouseCountFor1H1H = checkHouseCountExclusion993(input.otherHouseTransferDate);
  if (isExcludedFromHouseCountFor1H1H) {
    formulaSteps.push({
      label: "§99의3 ②항: 1세대1주택 비과세 시 신축주택 주택수 제외",
      value: 1,
      formula: `다른 주택 양도일 ${input.otherHouseTransferDate!.toISOString().split("T")[0]} ≤ 2007.12.31 → 신축주택을 소유주택 아닌 것으로 봄`,
    });
  }

  return {
    isEligible: true,
    ineligibleReasons: [],
    isWithin5Years,
    reducibleTransferIncome,
    fiveYearRatio,
    // 결과뷰 Frac 산식 표시용 echo (계산 미사용 — 표시 전용)
    transferIncomeApplied: input.transferIncome,
    standardPriceAtAcquisition: input.standardPriceAtAcquisition,
    standardPriceAt5Years: input.standardPriceAt5Years,
    standardPriceAtTransfer: input.standardPriceAtTransfer,
    signCase,
    formulaSteps,
    taxReductionForRuralSurtax,
    ruralSurtax,
    isExcludedFromHouseCountFor1H1H,
    legalBasis,
  };
}
