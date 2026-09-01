/**
 * 조특법 §98의8 — 준공후미분양주택 취득자 양도소득세 과세특례 (5년 발생분 50% 공제)
 *
 * 효과: 취득일부터 5년간 발생한 양도소득금액의 50%를 과세대상소득금액에서 공제 (단일 경로 —
 *       5년 내 세액감면 없음). 초과금액은 없는 것으로 한다 (법 ① 후단).
 *       농특세 = 감면 전후 산출세액 차 × 20% (농특세법 §2①1호 소득공제 — §99의3 선례).
 *       모드 1 중과 배제: 소령 §167의3①5호·§167의10①2호 (income-deduction-router에서 자동 주입).
 *
 * 요건 (law.go.kr 2026-06-11 원문 — 법 §98의8 ①~③ + 령 §98의7 ①~⑭.
 *       ⚠️ 법 §98의8의 위임 시행령은 조번호가 어긋난 령 §98의7):
 * - 거주자 · 2015.1.1~2015.12.31 사업주체등과 최초 매매계약
 * - 취득가 6억 이하 **이고** 연면적(전용) 135㎡ 이하 (AND — 령 ②1호는 "초과하거나" 제외형)
 * - 준공후미분양: 사용검사·사용승인 후 2014.12.31까지 분양계약 미체결 + 2015.1.1 이후 선착순 (령 ①)
 * - 5년 이상 임대 — 사업자등록(소법 §168) + 임대사업자등록(민특법 §5) 후 임대 개시일부터 기산,
 *   상속 시 피상속인 임대기간 합산 (령 §98의7⑤ → 령 §98의5⑤ 준용)
 * - 계약 해제 후 본인·배우자·직계존비속·형제자매 재계약분 제외 (령 ②2·3호)
 *
 * 5년 발생분 산식 = 령 §40① 준용 (령 §98의7④) — §99의3 calcSignedAllocation 재사용.
 */

import { applyRate } from "../tax-utils";
import { TRANSFER_REDUCTION_ARTICLE } from "../legal-codes/transfer";
import {
  calcSignedAllocation,
  isWithin5YearsCheck,
  type New993FormulaStep,
  type New993SignCase,
} from "./new-99-3";

// UTC 자정 파싱 (T suffix 없음) — §98의9 선례. JSON 경유 입력(new Date("YYYY-MM-DD"))과 동일 기준.
export const UNSOLD_98_8_CONTRACT_FROM = new Date("2015-01-01");
export const UNSOLD_98_8_CONTRACT_TO = new Date("2015-12-31");
/** 법 §98의8① — 취득가액 한도 (6억) */
export const UNSOLD_98_8_PRICE_LIMIT = 600_000_000;
/** 법 §98의8① — 연면적(공동주택 전용면적) 한도 (㎡) */
export const UNSOLD_98_8_AREA_LIMIT_SQM = 135;
/** 법 §98의8① — 공제율 (5년 발생분의 50%) */
export const UNSOLD_98_8_DEDUCTION_RATE = 0.5;
/** 임대 의무기간 (5년 = 60개월) */
export const UNSOLD_98_8_RENTAL_MONTHS = 60;
/**
 * 법 §98의8① 괄호 — 임대계약 체결 시한.
 *
 * 「…5년 이상 임대한 주택(거주자가 「소득세법」 제168조에 따른 사업자등록과 「민간임대주택에
 * 관한 특별법」 제5조에 따른 임대사업자등록을 하고 **2015년 12월 31일 이전에 임대계약을
 * 체결한 경우로 한정한다**)을 양도하는 경우」 — 「…한 경우로 한정한다」는 요건이다.
 * 위임 시행령(령 §98의7⑤ → 령 §98의5⑤)은 임대기간 **계산**만 정하고 이 시한을 대체하지 않는다.
 * §98의6①2호의 `UNSOLD_98_6_RENTAL_CONTRACT_TO`(2011.12.31)와 같은 층위.
 */
export const UNSOLD_98_8_RENTAL_CONTRACT_TO = new Date("2015-12-31");

export interface Unsold988Input {
  transferDate: Date;
  /** 미분양주택 취득일 (= 양도 자산 취득일 — 모드 1) */
  acquisitionDate: Date;
  /** 최초 매매계약일 — 시한 판정 (2015.1.1~12.31) */
  contractDate?: Date;
  /** 취득가액 (원) — 6억 한도, 취득세·부대비용 제외 (령 ②1호 후단) */
  acquisitionPrice?: number;
  /** 연면적(공동주택은 전용면적, ㎡) — 135 한도 */
  exclusiveAreaSqm?: number;
  /** 임대계약 체결일 — 2015.12.31 이전 체결에 한정 (법 §98의8① 괄호) */
  rentalContractDate?: Date;
  /** 임대개시일 — 사업자등록+임대사업자등록 후 개시한 날 (령 §98의5⑤1호 기산) */
  rentalStartDate?: Date;
  /** 임대종료일 — 미입력 시 양도일까지 임대 계속으로 봄 */
  rentalEndDate?: Date;
  /** 상속으로 합산하는 피상속인 임대기간 (개월 — 령 §98의5⑤2호) */
  inheritedRentalMonths?: number;
  isResident?: boolean;
  /** 준공후미분양 확인 — 사용검사 후 2014.12.31까지 미계약 + 2015.1.1 이후 선착순 (령 ①) */
  isUnsoldAfterCompletion?: boolean;
  /** 사업주체등과 최초 매매계약 (령 ③ — 사업주체·주택도시보증공사·시공자·기업구조조정리츠·신탁업자) */
  isFirstContract?: boolean;
  /** 계약 해제 후 본인·배우자 등 재계약 아님 (령 ②2·3호) — true = 재계약 아님(적격) */
  isNotRecontract?: boolean;
  /** 양도소득금액 (양도차익 − 장특공제) */
  transferIncome: number;
  /** 취득시 기준시가 */
  standardPriceAtAcquisition?: number;
  /** 취득일 + 5년 시점 기준시가 (5년 후 양도 시 필수) */
  standardPriceAt5Years?: number;
  /** 양도시 기준시가 */
  standardPriceAtTransfer?: number;
}

export type Unsold988IneligibleCode =
  | "NOT_RESIDENT"
  | "MISSING_CONTRACT_DATE"
  | "OUT_OF_CONTRACT_PERIOD"
  | "MISSING_PRICE"
  | "PRICE_LIMIT_EXCEEDED"
  | "MISSING_AREA"
  | "AREA_LIMIT_EXCEEDED"
  | "NOT_UNSOLD_AFTER_COMPLETION"
  | "NOT_FIRST_CONTRACT"
  | "RECONTRACT_EXCLUDED"
  | "MISSING_RENTAL_CONTRACT_DATE"
  | "RENTAL_CONTRACT_TOO_LATE"
  | "MISSING_RENTAL_START"
  | "RENTAL_PERIOD_SHORT"
  | "MISSING_STD_PRICE"
  | "TRANSFER_BEFORE_ACQUISITION";

export interface Unsold988IneligibleReason {
  code: Unsold988IneligibleCode;
  message: string;
  legalBasis: string;
}

export interface Unsold988Result {
  id: "unsold_98_8";
  isEligible: boolean;
  ineligibleReasons: Unsold988IneligibleReason[];
  isWithin5Years: boolean;
  /** 과세대상소득금액에서 공제할 금액 (5년 발생분 × 50%, 소득금액 한도) */
  reducibleTransferIncome: number;
  /** 5년 안분 비율 (5년 내 = 1) */
  fiveYearRatio: number;
  signCase: New993SignCase;
  /** 공제율 echo (0.5) */
  deductionRate: number;
  /** 인정 임대기간 (개월 — 상속 합산 포함) */
  rentalMonths: number;
  formulaSteps: New993FormulaStep[];
  /**
   * [echo] 3단계 상세명세 「소득금액 감면대상」 행의 Frac 분수 산식 표시용.
   * §99의3(`New993Result`)과 같은 이름·같은 의미 — 공용 빌더가 한 계약을 본다.
   */
  transferIncomeApplied?: number;
  standardPriceAtAcquisition?: number;
  standardPriceAt5Years?: number;
  standardPriceAtTransfer?: number;
  /** 농특세 (finalize 2-pass에서 채움) */
  taxReductionForRuralSurtax: number;
  ruralSurtax: number;
  legalBasis: string;
}

/** 두 일자 사이 만(滿) 개월 수 — 일 단위 미달 월 절사 */
export function fullMonthsBetween(from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) return 0;
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

function ineligible(reasons: Unsold988IneligibleReason[], rentalMonths: number): Unsold988Result {
  return {
    id: "unsold_98_8",
    isEligible: false,
    ineligibleReasons: reasons,
    isWithin5Years: false,
    reducibleTransferIncome: 0,
    fiveYearRatio: 0,
    signCase: "ineligible",
    deductionRate: UNSOLD_98_8_DEDUCTION_RATE,
    rentalMonths,
    formulaSteps: [],
    taxReductionForRuralSurtax: 0,
    ruralSurtax: 0,
    legalBasis: TRANSFER_REDUCTION_ARTICLE.UNSOLD_98_8,
  };
}

export function evaluateUnsold988(input: Unsold988Input): Unsold988Result {
  const legalBasis = TRANSFER_REDUCTION_ARTICLE.UNSOLD_98_8;
  const reasons: Unsold988IneligibleReason[] = [];

  // 1) 거주자 (법 ① — "거주자가")
  if (input.isResident === false) {
    reasons.push({
      code: "NOT_RESIDENT",
      message: "거주자가 아닌 경우 §98의8이 적용되지 않습니다 (법 ① 본문).",
      legalBasis,
    });
  }

  // 2) 최초 매매계약 시한 (2015.1.1~12.31)
  if (!input.contractDate) {
    reasons.push({
      code: "MISSING_CONTRACT_DATE",
      message: "최초 매매계약일이 입력되지 않았습니다 (2015.1.1~2015.12.31 시한 판정에 필요).",
      legalBasis,
    });
  } else if (
    input.contractDate.getTime() < UNSOLD_98_8_CONTRACT_FROM.getTime() ||
    input.contractDate.getTime() > UNSOLD_98_8_CONTRACT_TO.getTime()
  ) {
    reasons.push({
      code: "OUT_OF_CONTRACT_PERIOD",
      message: "최초 매매계약일이 2015.1.1~2015.12.31 시한 외입니다 (법 §98의8①).",
      legalBasis,
    });
  }

  // 3) 가액·면적 — 6억 이하 AND 135㎡ 이하 (한쪽 초과도 배제 — 령 §98의7②1호 "초과하거나")
  if (input.acquisitionPrice === undefined || input.acquisitionPrice <= 0) {
    reasons.push({
      code: "MISSING_PRICE",
      message: "취득가액이 입력되지 않았습니다 (6억 한도 검증 — 취득세·부대비용 제외 금액).",
      legalBasis,
    });
  } else if (input.acquisitionPrice > UNSOLD_98_8_PRICE_LIMIT) {
    reasons.push({
      code: "PRICE_LIMIT_EXCEEDED",
      message: "취득가액이 6억원을 초과합니다 (법 §98의8① · 령 §98의7②1호).",
      legalBasis: "조특령 §98의7②1호",
    });
  }
  if (input.exclusiveAreaSqm === undefined || input.exclusiveAreaSqm <= 0) {
    reasons.push({
      code: "MISSING_AREA",
      message: "연면적(공동주택은 전용면적)이 입력되지 않았습니다 (135㎡ 한도 검증).",
      legalBasis,
    });
  } else if (input.exclusiveAreaSqm > UNSOLD_98_8_AREA_LIMIT_SQM) {
    reasons.push({
      code: "AREA_LIMIT_EXCEEDED",
      message: "연면적(전용면적)이 135㎡를 초과합니다 — 취득가액과 면적 요건을 모두 충족해야 합니다 (법 §98의8① · 령 §98의7②1호).",
      legalBasis: "조특령 §98의7②1호",
    });
  }

  // 4) 양도 시점 — 취득한 후 양도 (§98의9·§99의4 선례)
  if (input.transferDate.getTime() <= input.acquisitionDate.getTime()) {
    reasons.push({
      code: "TRANSFER_BEFORE_ACQUISITION",
      message: "준공후미분양주택을 취득한 후에 양도하는 경우에만 적용됩니다 (법 §98의8①).",
      legalBasis,
    });
  }

  // 5) 자격 토글 3종
  if (input.isUnsoldAfterCompletion !== true) {
    reasons.push({
      code: "NOT_UNSOLD_AFTER_COMPLETION",
      message:
        "준공후미분양 요건(사용검사·사용승인 후 2014.12.31까지 분양계약 미체결 + 2015.1.1 이후 선착순 공급)이 확인되지 않았습니다 (조특령 §98의7①).",
      legalBasis: "조특령 §98의7①",
    });
  }
  if (input.isFirstContract !== true) {
    reasons.push({
      code: "NOT_FIRST_CONTRACT",
      message: "사업주체등과 최초로 매매계약을 체결한 요건이 확인되지 않았습니다 (법 §98의8① · 령 §98의7③).",
      legalBasis,
    });
  }
  if (input.isNotRecontract !== true) {
    reasons.push({
      code: "RECONTRACT_EXCLUDED",
      message:
        "계약 해제 후 본인·배우자(직계존비속·형제자매 포함)가 다시 계약한 주택이 아님이 확인되지 않았습니다 (조특령 §98의7②2·3호).",
      legalBasis: "조특령 §98의7②2·3호",
    });
  }

  // 6) 임대계약 체결 시한 — 2015.12.31 이전 (법 §98의8① 괄호)
  if (!input.rentalContractDate) {
    reasons.push({
      code: "MISSING_RENTAL_CONTRACT_DATE",
      message: "임대계약 체결일이 입력되지 않았습니다 (2015.12.31 이전 체결에 한정 — 법 §98의8① 괄호).",
      legalBasis,
    });
  } else if (input.rentalContractDate.getTime() > UNSOLD_98_8_RENTAL_CONTRACT_TO.getTime()) {
    reasons.push({
      code: "RENTAL_CONTRACT_TOO_LATE",
      message: "임대계약 체결일이 2015.12.31 이후입니다 (법 §98의8① — 사업자등록·임대사업자등록을 하고 2015.12.31 이전에 임대계약을 체결한 경우로 한정).",
      legalBasis,
    });
  }

  // 7) 임대 5년 — 등록 후 임대개시일 기산 + 상속 합산 (령 §98의5⑤ 준용)
  let rentalMonths = 0;
  if (!input.rentalStartDate) {
    reasons.push({
      code: "MISSING_RENTAL_START",
      message:
        "임대개시일이 입력되지 않았습니다 (사업자등록과 임대사업자등록 후 임대를 개시한 날부터 기산 — 조특령 §98의5⑤1호 준용).",
      legalBasis: "조특령 §98의7⑤",
    });
  } else {
    const rentalEnd = input.rentalEndDate ?? input.transferDate;
    rentalMonths = fullMonthsBetween(input.rentalStartDate, rentalEnd) + (input.inheritedRentalMonths ?? 0);
    if (rentalMonths < UNSOLD_98_8_RENTAL_MONTHS) {
      reasons.push({
        code: "RENTAL_PERIOD_SHORT",
        message: `임대기간이 5년(60개월) 미만입니다 (인정 임대기간 ${rentalMonths}개월 — 등록 후 임대개시일부터 기산${input.inheritedRentalMonths ? `, 피상속인 ${input.inheritedRentalMonths}개월 합산` : ""}).`,
        legalBasis: "조특령 §98의7⑤",
      });
    }
  }

  if (reasons.length > 0) return ineligible(reasons, rentalMonths);

  // 8) 공제액 산출 — 5년 내 = §95① 전액 기준 / 5년 후 = 기준시가 안분 (령 §40① 준용)
  const isWithin5Years = isWithin5YearsCheck(input.acquisitionDate, input.transferDate);
  const formulaSteps: New993FormulaStep[] = [];
  let base: number;
  let fiveYearRatio: number;
  let signCase: New993SignCase;
  // [echo] 안분 경로에서만 채워지는 3시점 기준시가 (5년 내 전액 경로는 안분이 없어 undefined)
  let echoStdAcq: number | undefined;
  let echoStd5Y: number | undefined;
  let echoStdTransfer: number | undefined;

  if (isWithin5Years) {
    base = Math.max(0, input.transferIncome);
    fiveYearRatio = 1;
    signCase = "within_5_years";
    formulaSteps.push({
      label: "5년 이내 양도 — 양도소득금액 전액 기준",
      value: base,
      formula: `취득일부터 5년 이내 양도 — 양도소득금액 ${input.transferIncome.toLocaleString()} 전액이 5년간 발생분`,
    });
  } else {
    const stdAtAcq = input.standardPriceAtAcquisition ?? 0;
    const stdAt5Y = input.standardPriceAt5Years ?? 0;
    const stdAtTransfer = input.standardPriceAtTransfer ?? 0;
    if (stdAtAcq <= 0 || stdAt5Y <= 0 || stdAtTransfer <= 0) {
      return ineligible(
        [{
          code: "MISSING_STD_PRICE",
          message: "5년 후 양도 안분에 필요한 기준시가(취득시·5년시점·양도시)가 입력되지 않았습니다 (조특령 §40① 준용 — 자동 안분 불가).",
          legalBasis: "조특령 §98의7④",
        }],
        rentalMonths,
      );
    }
    const allocation = calcSignedAllocation(input.transferIncome, stdAt5Y - stdAtAcq, stdAtTransfer - stdAtAcq);
    echoStdAcq = stdAtAcq;
    echoStd5Y = stdAt5Y;
    echoStdTransfer = stdAtTransfer;
    base = allocation.reducibleIncome;
    fiveYearRatio = allocation.ratio;
    signCase = allocation.signCase;
    formulaSteps.push({
      label: "5년간 발생 양도소득금액 (기준시가 안분)",
      value: base,
      formula: `양도소득금액 ${input.transferIncome.toLocaleString()} × (5년시점 기준시가 ${stdAt5Y.toLocaleString()} − 취득시 기준시가 ${stdAtAcq.toLocaleString()}) ÷ (양도시 기준시가 ${stdAtTransfer.toLocaleString()} − 취득시 기준시가 ${stdAtAcq.toLocaleString()})`,
    });
  }

  // 50% 공제 + "초과금액은 없는 것" (법 ① 후단)
  const reducible = Math.min(applyRate(base, UNSOLD_98_8_DEDUCTION_RATE), Math.max(0, input.transferIncome));
  formulaSteps.push({
    label: "공제할 양도소득금액 (50%)",
    value: reducible,
    formula: `5년간 발생분 ${base.toLocaleString()} × 50% = ${reducible.toLocaleString()}`,
  });

  return {
    id: "unsold_98_8",
    isEligible: true,
    ineligibleReasons: [],
    isWithin5Years,
    reducibleTransferIncome: reducible,
    fiveYearRatio,
    signCase,
    deductionRate: UNSOLD_98_8_DEDUCTION_RATE,
    rentalMonths,
    formulaSteps,
    // [echo] 3단계 명세 Frac 산식 표시용 — 안분에 쓰인 값 그대로(계산 무관)
    transferIncomeApplied: input.transferIncome,
    standardPriceAtAcquisition: echoStdAcq,
    standardPriceAt5Years: echoStd5Y,
    standardPriceAtTransfer: echoStdTransfer,
    taxReductionForRuralSurtax: 0,
    ruralSurtax: 0,
    legalBasis,
  };
}
