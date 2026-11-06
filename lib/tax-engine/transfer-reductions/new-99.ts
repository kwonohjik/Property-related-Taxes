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
 *   기준일(1998~1999)은 모두 종전 «고급주택» 시기다 — 기준일 당시 소득세법 시행령 §156(공동·단독·시설) 판정은
 *   `judgePriorLuxuryHouse`(리뷰 NH-02·NH-15). 기준일은 resolveNew99BaseDate가 취득유형으로 가른다(D-9·D3-09).
 *
 * 재개발·재건축 변형 (령 §99①1호 단서·2호 괄호):
 * - 종전주택을 재개발·재건축하여 취득한 신축주택(법 §98의3② 각 호 유형)은
 *   5년 내에도 안분: 양도소득금액 × (양도시 − 신축취득시) ÷ (양도시 − 종전주택 취득시)
 *   5년 후: 분자 = 5년시점 − 신축취득시 / 분모 = 양도시 − 종전주택 취득시
 */

import { NEW_HOUSING_SUB_ARTICLE, TRANSFER_REDUCTION_ARTICLE } from "../legal-codes/transfer";
import { LAND_ONLY_OWNER_CODE, landOnlyOwnerMessage } from "./new-99-land-only-owner";
import { judgePriorLuxuryHouse, isPriorLuxuryStandardDate, type New99HouseType, type TriStateAnswer } from "./new-99-luxury-house";
import { evaluateNew99AcquisitionGate, type New99AcquisitionCause } from "./new-99-acquisition-cause";
import { pre2016RuleNotice, isHighValueHouseAtDate } from "./new-99-3-era";
import { judgeRedevMemberPeriod, type RedevMemberPeriodReason } from "./new-99-redev-member";
import {
  allocationDenominatorZeroMessage,
  calcSignedAllocation,
  resolveNew99BaseDate,
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
  /** 주택 유형 — 고급주택 판정(소득세법 시행령 §156 1호 단독 / 2호 공동). 미입력은 공동주택 기준 (NH-02) */
  houseType?: New99HouseType;
  /** (단독) 연면적(㎡) */
  grossFloorAreaSqm?: number;
  /** (단독) 딸린 토지 면적(㎡) */
  attachedLandAreaSqm?: number;
  /** (단독) 취득세 시가표준액 2천만원(2001.1.1.부터 기준시가 4천만원) 이상 */
  stdPriceFloorMet?: TriStateAnswer;
  /** (단독) 엘리베이터·에스컬레이터·67㎡ 이상 수영장 중 1개 이상 설치 */
  luxuryFacility?: TriStateAnswer;
  /** 자산 취득 원인 — 상속·증여는 불성립 (NH-03 · NH-40) */
  acquisitionCause?: New99AcquisitionCause;
  /** (2호 · 매매) 주택건설업자와 최초로 매매계약을 체결하고 계약금을 납부한 사람이 본인인가 (NH-03) */
  firstContract?: TriStateAnswer;
  /** 소유자 분리 — 토지만 본인 소유인가(true면 적용 배제). `New993Input.isLandOnlyOwner`와 같은 의미 (NH-08) */
  isLandOnlyOwner?: boolean;
  isResident?: boolean;
  isHousingConstructionBusiness?: boolean;
  acquisitionType?: "from_builder" | "self_built";
  /** 국민주택 — 기간 종기 1999.12.31 연장 */
  isNationalHousing?: boolean;
  /** (2호) 매매계약일 현재 다른 자 입주 사실 — 단서 배제 */
  hasOccupancyAtContract?: boolean;
  /** 령 §99② — 1998.5.21 이전 분양계약 해제 후 본인·배우자 등 재계약·대체취득 (true = 배제) */
  isRecontractExcluded?: boolean;
  /**
   * 조특칙 §44의4 **카브백** — 배제 사유에 해당해도 감면을 유지하는 예외.
   *
   * 「영 제99조제2항 단서 **및** 영 제99조의3제4항 단서에서 "재정경제부령이 정하는 사유에
   *  해당하는 주택"이라 함은 「소득세법 시행규칙」 **제71조제3항**의 규정에 의한 사유로
   *  **당해주택건설업자로부터 다른 주택을 분양받아 취득하는 경우**의 주택을 말한다.」
   *
   * 소칙 §71③ 사유 = 취학 · 근무상 형편(전근 등) · 1년 이상 치료·요양을 요하는 질병 ·
   * 학교폭력으로 인한 전학 — **그 사유로 다른 시·군으로 주거를 이전하는 경우**에 한한다(1998.8.11.·2002.1.1.·현행
   * 시행본 모두 같은 요건, 리뷰 NH-42·NH-45). **대체취득(다른 주택 분양) 갈래에만** 대응한다
   * (당초 주택을 다시 분양받은 경우는 카브백 대상이 아니다).
   *
   * 🔴 이 카브백이 없으면 부득이한 사유로 대체취득한 정상 대상자를 **법 근거 없이 배제**한다.
   */
  recontractUnavoidableCause?: boolean;
  /** 재개발·재건축 변형 (령 §99①1호 단서) */
  isRedevelopedNewHouse?: boolean;
  /** 종전주택 취득 당시 기준시가 — 변형 분모 (변형 ON 시 필수) */
  previousHouseStdPriceAtAcquisition?: number;
  /**
   * 재개발·재건축 완공 아파트 조합원 갈래 — 기간은 준공일(사용승인·사용검사일) 축이고, 기간 경과 후 사용승인이면
   * 조합의 기간 내 잔여주택 직접 계약 사실(3-state)을 본다 (조특령 §99③2호 · `new-99-redev-member.ts` · NH-36 · NH-27).
   * 호출자(라우터)가 이 갈래이면 `acquisitionType`을 자기건설·`usageApprovalDate`·`acquisitionDate`를 준공일로 넘긴다.
   */
  redevMember?: { completionDate?: Date; remainderContract?: TriStateAnswer };
}

export type New99IneligibleCode =
  | "NOT_RESIDENT"
  | "HOUSING_CONSTRUCTION_BUSINESS"
  | "OUT_OF_ACQUISITION_PERIOD"
  | "OCCUPANCY_AT_CONTRACT"
  | "RECONTRACT_EXCLUDED"
  | typeof LAND_ONLY_OWNER_CODE
  | "HIGH_VALUE_HOUSE"
  | "ACQUIRED_BY_INHERITANCE_OR_GIFT"
  | "NOT_FIRST_CONTRACT"
  | "FIRST_CONTRACT_UNCONFIRMED"
  | "NOT_MEMBER_AT_APPROVAL"
  | "MISSING_STD_PRICE"
  | "ALLOCATION_DENOMINATOR_ZERO"
  | "MISSING_PREVIOUS_STD_PRICE"
  | "TRANSFER_BEFORE_ACQUISITION"
  | RedevMemberPeriodReason["code"];

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
  /**
   * [echo] 3단계 상세명세 「소득금액 감면대상」 행의 Frac 분수 산식 표시용.
   * §99의3(`New993Result`)과 같은 이름·같은 의미 — 공용 빌더가 한 계약을 본다.
   */
  transferIncomeApplied?: number;
  standardPriceAtAcquisition?: number;
  standardPriceAt5Years?: number;
  standardPriceAtTransfer?: number;
  /**
   * [echo] 재개발·재건축 변형 전용 — 분모가 「양도시 − **종전주택** 취득시」다.
   * `redevelopedVariantApplied === true`일 때만 세팅.
   */
  previousHouseStdPriceApplied?: number;
  taxReductionForRuralSurtax: number;
  ruralSurtax: number;
  legalBasis: string;
  /** 확인 필요 고지 — 「모름」을 불리하게 처리한 판정·2015.12.31. 이전 양도 종전 규정(NH-49) 등. 계산에는 쓰지 않는다. */
  warnings?: string[];
}

function ineligible(reasons: New99IneligibleReason[], warnings?: string[]): New99Result {
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
    ...(warnings && warnings.length > 0 ? { warnings } : {}),
  };
}

export function evaluateNew99(input: New99Input): New99Result {
  const legalBasis = TRANSFER_REDUCTION_ARTICLE.NEW_99;
  const reasons: New99IneligibleReason[] = [];

  // 0) 소유자 분리(토지만 본인) — 신축주택(건물)을 취득한 자가 아니다. 정면 해석례 없음 → 확인 필요 고지 (NH-08 · Q-28).
  if (input.isLandOnlyOwner === true) {
    reasons.push({ code: LAND_ONLY_OWNER_CODE, message: landOnlyOwnerMessage("new_99"), legalBasis });
    return ineligible(reasons);
  }

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

  // 1-2) 취득 원인 — 상속·증여(지분 포함)·분양권 승계 취득은 불성립 (NH-03 · NH-40 · 공용 leaf)
  const acquisitionTypeForGate = input.acquisitionType ?? "from_builder";
  const causeGate = evaluateNew99AcquisitionGate({
    article: "new_99",
    acquisitionType: acquisitionTypeForGate,
    acquisitionCause: input.acquisitionCause,
    firstContract: input.firstContract,
  });
  if (causeGate) {
    reasons.push(causeGate);
    return ineligible(reasons);
  }

  // 2) 신축주택취득기간 — 유형별 기준일 (1호 사용승인 / 2호 매매계약)
  const acquisitionType = input.acquisitionType ?? "from_builder";
  const periodTarget =
    acquisitionType === "from_builder"
      ? input.contractDate ?? input.acquisitionDate
      : input.usageApprovalDate ?? input.acquisitionDate;
  const periodEnd = input.isNationalHousing ? NEW_99_PERIOD_END_NATIONAL : NEW_99_PERIOD_END;
  // 재개발 완공 아파트 조합원 — 준공일 축 + 조특령 §99③2호 잔여주택 계약 사실 (NH-36 · NH-27)
  if (input.redevMember) {
    const memberReason = judgeRedevMemberPeriod({
      article: "new_99",
      completionDate: input.redevMember.completionDate,
      periodStart: NEW_99_PERIOD_START,
      periodEnd,
      periodLabel: input.isNationalHousing ? "1998.5.22.~1999.12.31. — 국민주택" : "1998.5.22.~1999.6.30.",
      remainderContract: input.redevMember.remainderContract,
    });
    if (memberReason) {
      reasons.push(memberReason);
      return ineligible(reasons);
    }
  } else if (periodTarget.getTime() < NEW_99_PERIOD_START.getTime() || periodTarget.getTime() > periodEnd.getTime()) {
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
  // 조특칙 §44의4 카브백 — 소칙 §71③ 부득이한 사유로 «다른 주택»을 분양받은 경우는 배제하지 않는다.
  // 🔴 종전에는 카브백 없이 무조건 배제해 법 근거 없는 불리 적용이었다(조문 실측 2026-08-31).
  // 조특령 §99②는 «법 제99조제1항제2호 단서»의 사유다 — 2호(주택건설사업자로부터 취득)에만 건다.
  //   1호(자기건설)에 남은 선언으로 배제하지 않는다 (리뷰 NH-57).
  if (
    acquisitionType === "from_builder" &&
    input.isRecontractExcluded === true &&
    input.recontractUnavoidableCause !== true
  ) {
    reasons.push({
      code: "RECONTRACT_EXCLUDED",
      message: "1998.5.21 이전 분양계약을 해제하고 본인·배우자(직계존비속·형제자매 포함)가 다시 분양받거나 대체 취득한 주택은 적용 배제됩니다 (조특령 §99②).",
      legalBasis: NEW_HOUSING_SUB_ARTICLE.NEW_99_RECONTRACT,
    });
    return ineligible(reasons);
  }

  // 4) 고가주택 단서 (D-9: §99의3 선례 — 계약·승인·취득 중 우선일 기준 4단계 정의)
  // 기간 게이트(:167)와 **같은 축**을 쓴다 — 종전에는 여기만 분기하지 않았다 (D3-09).
  const hvBaseDate = resolveNew99BaseDate(
    acquisitionType,
    input.contractDate,
    input.usageApprovalDate,
    input.acquisitionDate,
  );
  // 기준일이 모두 2002.12.31. 이전(종전 «고급주택») — 당시 소득세법 시행령 §156 공동·단독·시설 기준 (NH-02 · NH-15).
  // 조합원 주택이 기간 경과 후 2003.1.1. 이후 사용승인(조특령 §99③2호)이면 종전 «고급주택» 시기가 아니다 — 법률 제6762호 부칙 §29①의
  //   종전 규정 대상(2003.1.1. 전 계약·사용승인)이 아니라 양도 당시 소득세법 §89①3호 고가주택으로 본다(§99의3 개정규정 축과 같다 · NH-27).
  const priorEra = isPriorLuxuryStandardDate(hvBaseDate);
  const luxury = priorEra
    ? judgePriorLuxuryHouse(hvBaseDate, input.wholePropertyTransferPrice, {
        houseType: input.houseType,
        exclusiveAreaSqm: input.exclusiveAreaSqm ?? 0,
        grossFloorAreaSqm: input.grossFloorAreaSqm,
        attachedLandAreaSqm: input.attachedLandAreaSqm,
        stdPriceFloorMet: input.stdPriceFloorMet,
        luxuryFacility: input.luxuryFacility,
      })
    : { isLuxury: isHighValueHouseAtDate(input.transferDate, input.wholePropertyTransferPrice), confirmations: [] as string[] };
  if (luxury.isLuxury) {
    reasons.push({
      code: "HIGH_VALUE_HOUSE",
      message: priorEra
        ? `고급주택(기준일 ${hvBaseDate.toISOString().split("T")[0]} 당시 소득세법 시행령 §156)은 §99 ① 단서로 적용 배제됩니다.`
        : `고가주택(양도일 ${input.transferDate.toISOString().split("T")[0]} 당시 소득세법 §89①3호)은 §99 ① 단서로 적용 배제됩니다.`,
      legalBasis,
    });
    return ineligible(reasons, luxury.confirmations);
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
      legalBasis: NEW_HOUSING_SUB_ARTICLE.NEW_99_INCOME,
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
        legalBasis: NEW_HOUSING_SUB_ARTICLE.NEW_99_INCOME,
      }]);
    }
    const numerator = isWithin5Years ? stdAtTransfer - stdAtAcq : stdAt5Y - stdAtAcq;
    const denominator = variant ? stdAtTransfer - stdAtPrev : stdAtTransfer - stdAtAcq;
    // NH-76 · Q-20 — 분모 0(양도시 = 취득시 기준시가): 안분 비율 미정의 → 계산 불가 + 확인 필요 (§99의3과 같은 문구)
    if (denominator === 0) {
      return ineligible([{
        code: "ALLOCATION_DENOMINATOR_ZERO",
        message: allocationDenominatorZeroMessage(variant ? "종전주택 취득 당시" : "신축주택 취득 당시"),
        legalBasis: NEW_HOUSING_SUB_ARTICLE.NEW_99_INCOME,
      }]);
    }
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
    // [echo] 3단계 명세 Frac 산식 표시용 — 안분에 쓰인 값 그대로(계산 무관).
    // 5년 이내 전액 차감 경로(안분 없음)에서는 기준시가가 0일 수 있어 표시측이 판별한다.
    transferIncomeApplied: input.transferIncome,
    standardPriceAtAcquisition: stdAtAcq,
    standardPriceAt5Years: stdAt5Y,
    standardPriceAtTransfer: stdAtTransfer,
    ...(variant ? { previousHouseStdPriceApplied: stdAtPrev } : {}),
    taxReductionForRuralSurtax: 0,
    ruralSurtax: 0,
    legalBasis,
    ...withPre2016Notice(input.transferDate),
  };
}

/** 2015.12.31. 이전 양도 — 종전 규정 적용 대상 고지(계산 불변, NH-49) */
function withPre2016Notice(transferDate: Date): { warnings?: string[] } {
  const notice = pre2016RuleNotice(transferDate, "new_99");
  return notice ? { warnings: [notice] } : {};
}
