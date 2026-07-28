/**
 * 조특법 §99 — 신축주택의 취득자에 대한 양도소득세의 감면 (IMF 1차)
 *
 * 효과: 5년 내 양도 = 취득~양도일 발생 양도소득금액 전액 / 5년 후 양도 = 5년간 발생분을
 *       과세대상소득금액에서 차감 (§99의3 동형 — 령 §99① 수식 텍스트 원문 확정).
 *       농특세 = 감면 전후 산출세액 차 × 20% (농특세법 §2①1호 소득공제 — §99의3 선례).
 *       모드 1 중과 배제: 소령 §167의3①5호·§167의10①2호.
 *
 * 요건 (law.go.kr 2026-06-11 원문 — 법 §99 ①~④ + 령 §99 ①~④):
 * - 거주자 (주택건설사업자 제외) · 신축주택 + 연면적 2배 이내 부수토지
 * - 1호 자기건설(조합원 취득 포함): 신축주택취득기간 내 사용승인·사용검사(임시 포함)
 * - 2호 주건업 취득: 신축주택취득기간 내 최초 매매계약 + 계약금 납부.
 *   단서: 매매계약일 현재 다른 자 입주 사실 / 령 ② 재계약·대체취득 배제
 * - 신축주택취득기간: 1998.5.22~1999.6.30 (국민주택은 ~1999.12.31 — 정의가 1호 괄호에 있으나
 *   "이하 이 조에서 같다"로 1·2호 공통)
 * - 고가주택(소법 §89①3호 비과세 제외 대상) 단서 배제 — 판정 기준일은 §99의3 선례
 *   (isHighValueHouseUnder993 — 계약·승인·취득 중 우선일 기준 4단계 정의. D-9)
 *
 * 재개발·재건축 변형 (령 §99①1호 단서·2호 괄호):
 * - 종전주택을 재개발·재건축하여 취득한 신축주택(법 §98의3② 각 호 유형)은
 *   5년 내에도 안분: 양도소득금액 × (양도시 − 신축취득시) ÷ (양도시 − 종전주택 취득시)
 *   5년 후: 분자 = 5년시점 − 신축취득시 / 분모 = 양도시 − 종전주택 취득시
 */

import { TRANSFER_REDUCTION_ARTICLE } from "../legal-codes/transfer";
import {
  calcSignedAllocation,
  isHighValueHouseUnder993,
  isWithin5YearsCheck,
  type New993FormulaStep,
  type New993SignCase,
} from "./new-99-3";

// UTC 자정 파싱 (T suffix 없음) — §98의9 선례. JSON 경유 입력과 동일 기준.
export const NEW_99_PERIOD_START = new Date("1998-05-22");
export const NEW_99_PERIOD_END = new Date("1999-06-30");
/** 국민주택 — 신축주택취득기간 연장 종기 (법 §99①1호 괄호) */
export const NEW_99_PERIOD_END_NATIONAL = new Date("1999-12-31");

export interface New99Input {
  transferDate: Date;
  acquisitionDate: Date;
  /** 최초 매매계약일 (2호 — 주건업 취득) */
  contractDate?: Date;
  /** 사용승인·사용검사일 (1호 — 자기건설) */
  usageApprovalDate?: Date;
  /** 양도소득금액 (양도차익 − 장특공제) */
  transferIncome: number;
  standardPriceAtAcquisition?: number;
  standardPriceAt5Years?: number;
  standardPriceAtTransfer?: number;
  /** 양도가액 — 고가주택 판정 */
  /**
   * **물건 전체(100%) 양도가액** — 고가주택 가액 요건(§99의3·§99) 판정 전용.
   *
   * ⚠️ 지분 스케일된 `transferPrice`를 넣지 말 것. 감면 가액 요건은 **물건 전체 가액** 기준이라
   *    지분분을 쓰면 문턱이 1/지분율만큼 올라가 판정이 뒤집힌다 — 지분 50%면 물건 전체 24억까지
   *    12억 고가주택 배제를 피해 간다(실측, 2026-07-28 정정).
   *    §89 12억 안분은 이미 `totalPropertyTransferPrice`(100% echo)로 처리돼 있었고
   *    (`transfer-tax.ts:447-465`), 같은 고가주택 개념인 이 경로만 남아 있었다.
   */
  wholePropertyTransferPrice: number;
  /** 전용면적 (㎡) — 고가주택 면적 기준 (~2002.12.31 정의) */
  exclusiveAreaSqm?: number;
  isResident?: boolean;
  isHousingConstructionBusiness?: boolean;
  acquisitionType?: "from_builder" | "self_built";
  /** 국민주택 — 기간 종기 1999.12.31 연장 */
  isNationalHousing?: boolean;
  /** (2호) 매매계약일 현재 다른 자 입주 사실 — 단서 배제 */
  hasOccupancyAtContract?: boolean;
  /** 령 §99② — 1998.5.21 이전 분양계약 해제 후 본인·배우자 등 재계약·대체취득 (true = 배제) */
  isRecontractExcluded?: boolean;
  /** 재개발·재건축 변형 (령 §99①1호 단서) */
  isRedevelopedNewHouse?: boolean;
  /** 종전주택 취득 당시 기준시가 — 변형 분모 (변형 ON 시 필수) */
  previousHouseStdPriceAtAcquisition?: number;
}

export type New99IneligibleCode =
  | "NOT_RESIDENT"
  | "HOUSING_CONSTRUCTION_BUSINESS"
  | "OUT_OF_ACQUISITION_PERIOD"
  | "OCCUPANCY_AT_CONTRACT"
  | "RECONTRACT_EXCLUDED"
  | "HIGH_VALUE_HOUSE"
  | "MISSING_STD_PRICE"
  | "MISSING_PREVIOUS_STD_PRICE"
  | "TRANSFER_BEFORE_ACQUISITION";

export interface New99IneligibleReason {
  code: New99IneligibleCode;
  message: string;
  legalBasis: string;
}

export interface New99Result {
  id: "new_99";
  isEligible: boolean;
  ineligibleReasons: New99IneligibleReason[];
  isWithin5Years: boolean;
  reducibleTransferIncome: number;
  fiveYearRatio: number;
  signCase: New993SignCase;
  /** 재개발·재건축 변형 적용 여부 (산식 표시 분기) */
  redevelopedVariantApplied: boolean;
  formulaSteps: New993FormulaStep[];
  taxReductionForRuralSurtax: number;
  ruralSurtax: number;
  legalBasis: string;
}

function ineligible(reasons: New99IneligibleReason[]): New99Result {
  return {
    id: "new_99",
    isEligible: false,
    ineligibleReasons: reasons,
    isWithin5Years: false,
    reducibleTransferIncome: 0,
    fiveYearRatio: 0,
    signCase: "ineligible",
    redevelopedVariantApplied: false,
    formulaSteps: [],
    taxReductionForRuralSurtax: 0,
    ruralSurtax: 0,
    legalBasis: TRANSFER_REDUCTION_ARTICLE.NEW_99,
  };
}

export function evaluateNew99(input: New99Input): New99Result {
  const legalBasis = TRANSFER_REDUCTION_ARTICLE.NEW_99;
  const reasons: New99IneligibleReason[] = [];

  // 1) 거주자·주건업 (법 ① 본문 괄호)
  if (input.isResident === false) {
    reasons.push({
      code: "NOT_RESIDENT",
      message: "거주자가 아닌 경우 §99가 적용되지 않습니다 (법 ① 본문).",
      legalBasis,
    });
    return ineligible(reasons);
  }
  if (input.isHousingConstructionBusiness === true) {
    reasons.push({
      code: "HOUSING_CONSTRUCTION_BUSINESS",
      message: "본인이 주택건설사업자인 경우 §99가 적용되지 않습니다 (법 ① 본문 괄호).",
      legalBasis,
    });
    return ineligible(reasons);
  }

  // 2) 신축주택취득기간 — 유형별 기준일 (1호 사용승인 / 2호 매매계약)
  const acquisitionType = input.acquisitionType ?? "from_builder";
  const periodTarget =
    acquisitionType === "from_builder"
      ? input.contractDate ?? input.acquisitionDate
      : input.usageApprovalDate ?? input.acquisitionDate;
  const periodEnd = input.isNationalHousing ? NEW_99_PERIOD_END_NATIONAL : NEW_99_PERIOD_END;
  if (periodTarget.getTime() < NEW_99_PERIOD_START.getTime() || periodTarget.getTime() > periodEnd.getTime()) {
    const targetLabel = acquisitionType === "from_builder" ? "매매계약일" : "사용승인일";
    reasons.push({
      code: "OUT_OF_ACQUISITION_PERIOD",
      message: `신축주택취득기간(1998.5.22~${input.isNationalHousing ? "1999.12.31 — 국민주택" : "1999.6.30"}) 외 — 기준일(${targetLabel})이 시한 외입니다 (법 §99①).`,
      legalBasis,
    });
    return ineligible(reasons);
  }

  // 3) 2호 단서 — 입주 사실 / 령 ② 재계약·대체취득
  if (acquisitionType === "from_builder" && input.hasOccupancyAtContract === true) {
    reasons.push({
      code: "OCCUPANCY_AT_CONTRACT",
      message: "매매계약일 현재 다른 자가 입주한 사실이 있는 주택은 적용 배제됩니다 (법 §99①2호 단서).",
      legalBasis,
    });
    return ineligible(reasons);
  }
  if (input.isRecontractExcluded === true) {
    reasons.push({
      code: "RECONTRACT_EXCLUDED",
      message: "1998.5.21 이전 분양계약을 해제하고 본인·배우자(직계존비속·형제자매 포함)가 다시 분양받거나 대체 취득한 주택은 적용 배제됩니다 (조특령 §99②).",
      legalBasis: "조특령 §99②",
    });
    return ineligible(reasons);
  }

  // 4) 고가주택 단서 (D-9: §99의3 선례 — 계약·승인·취득 중 우선일 기준 4단계 정의)
  const hvBaseDate = input.contractDate ?? input.usageApprovalDate ?? input.acquisitionDate;
  if (isHighValueHouseUnder993(hvBaseDate, input.wholePropertyTransferPrice, input.exclusiveAreaSqm ?? 0)) {
    reasons.push({
      code: "HIGH_VALUE_HOUSE",
      message: `고가주택(소득세법 §89①3호 비과세 제외 대상)은 §99 ① 단서로 적용 배제됩니다 (적용기준일 ${hvBaseDate.toISOString().split("T")[0]} 기준).`,
      legalBasis,
    });
    return ineligible(reasons);
  }

  // 5) 양도 시점 (§99의4·§98의9 선례)
  if (input.transferDate.getTime() <= input.acquisitionDate.getTime()) {
    reasons.push({
      code: "TRANSFER_BEFORE_ACQUISITION",
      message: "신축주택을 취득한 후에 양도하는 경우에만 적용됩니다 (법 §99①).",
      legalBasis,
    });
    return ineligible(reasons);
  }

  // 6) 재개발·재건축 변형 — 종전주택 기준시가 필수 (자동 안분 fallback 금지)
  const variant = input.isRedevelopedNewHouse === true;
  if (variant && (input.previousHouseStdPriceAtAcquisition === undefined || input.previousHouseStdPriceAtAcquisition <= 0)) {
    reasons.push({
      code: "MISSING_PREVIOUS_STD_PRICE",
      message: "재개발·재건축 신축주택의 안분에는 종전주택 취득 당시 기준시가가 필요합니다 (조특령 §99①1호 단서).",
      legalBasis: "조특령 §99①",
    });
    return ineligible(reasons);
  }

  // 7) 차감액 산출 (령 §99①)
  const isWithin5Years = isWithin5YearsCheck(input.acquisitionDate, input.transferDate);
  const formulaSteps: New993FormulaStep[] = [];
  const stdAtAcq = input.standardPriceAtAcquisition ?? 0;
  const stdAt5Y = input.standardPriceAt5Years ?? 0;
  const stdAtTransfer = input.standardPriceAtTransfer ?? 0;
  const stdAtPrev = input.previousHouseStdPriceAtAcquisition ?? 0;

  let reducible: number;
  let fiveYearRatio: number;
  let signCase: New993SignCase;

  if (isWithin5Years && !variant) {
    // 1호 본문 — §95① 양도소득금액 전액
    reducible = Math.max(0, input.transferIncome);
    fiveYearRatio = 1;
    signCase = "within_5_years";
    formulaSteps.push({
      label: "5년 이내 양도 — 양도소득금액 전액 차감",
      value: reducible,
      formula: `취득일부터 양도일까지 발생한 양도소득금액 ${input.transferIncome.toLocaleString()} 전체를 과세대상소득금액에서 차감 (조특령 §99①1호)`,
    });
  } else {
    // 안분 — 필요 기준시가 검증
    const needs5Y = !isWithin5Years; // 5년 내 변형은 분자에 양도시 기준시가 사용 — 5년시점 불요
    if (stdAtAcq <= 0 || stdAtTransfer <= 0 || (needs5Y && stdAt5Y <= 0)) {
      return ineligible([{
        code: "MISSING_STD_PRICE",
        message: "안분 계산에 필요한 기준시가(취득시·양도시" + (needs5Y ? "·5년시점" : "") + ")가 입력되지 않았습니다 (조특령 §99①).",
        legalBasis: "조특령 §99①",
      }]);
    }
    const numerator = isWithin5Years ? stdAtTransfer - stdAtAcq : stdAt5Y - stdAtAcq;
    const denominator = variant ? stdAtTransfer - stdAtPrev : stdAtTransfer - stdAtAcq;
    const allocation = calcSignedAllocation(input.transferIncome, numerator, denominator);
    reducible = allocation.reducibleIncome;
    fiveYearRatio = allocation.ratio;
    signCase = allocation.signCase;
    const denomLabel = variant ? "종전주택 취득 당시 기준시가" : "취득 당시 기준시가";
    const numerLabel = isWithin5Years ? "양도 당시 기준시가 − 신축주택 취득 당시 기준시가" : "취득일부터 5년이 되는 날의 기준시가 − 취득 당시 기준시가";
    formulaSteps.push({
      label: variant ? "재개발·재건축 신축주택 안분 (조특령 §99①)" : "5년간 발생 양도소득금액 안분 (조특령 §99①2호)",
      value: reducible,
      formula: `양도소득금액 ${input.transferIncome.toLocaleString()} × (${numerLabel} ${numerator.toLocaleString()}) ÷ (양도 당시 기준시가 − ${denomLabel} ${denominator.toLocaleString()})`,
    });
  }

  // "초과금액 없는 것" 정합 — 차감액은 양도소득금액 한도
  reducible = Math.min(reducible, Math.max(0, input.transferIncome));

  return {
    id: "new_99",
    isEligible: true,
    ineligibleReasons: [],
    isWithin5Years,
    reducibleTransferIncome: reducible,
    fiveYearRatio,
    signCase,
    redevelopedVariantApplied: variant,
    formulaSteps,
    taxReductionForRuralSurtax: 0,
    ruralSurtax: 0,
    legalBasis,
  };
}
