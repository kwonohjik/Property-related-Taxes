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
import { applyRate, safeMultiplyThenDivide } from "../tax-utils";

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
  /**
   * 조특령 §99의3④ — 2001년 5월 23일 **전에** 주택건설사업자와 분양계약을 체결한 분양계약자가
   * 그 계약을 해제하고, 분양계약자 또는 그 배우자(직계존비속·형제자매 포함)가
   * ⓐ 당초 주택을 **다시 분양**받아 취득했거나 ⓑ 당해 주택건설사업자로부터 **대체하여 다른 주택**을
   * 분양받아 취득한 주택 → 법 §99의3①1호 적용 배제. 자기선언.
   */
  isRecontractExcluded?: boolean;
  /**
   * 조특칙 §44의4 **카브백** — 배제 사유에 해당해도 감면을 유지하는 예외.
   *
   * 「영 제99조제2항 단서 **및** 영 제99조의3제4항 단서에서 "재정경제부령이 정하는 사유에
   *  해당하는 주택"이라 함은 「소득세법 시행규칙」 **제71조제3항**의 규정에 의한 사유로
   *  **당해주택건설업자로부터 다른 주택을 분양받아 취득하는 경우**의 주택을 말한다.」
   *
   * 소칙 §71③ 사유 = 취학 · 근무상 형편(전근 등) · 1년 이상 치료·요양을 요하는 질병 ·
   * 학교폭력으로 인한 전학. **대체취득(다른 주택 분양) 갈래에만** 대응한다
   * (당초 주택을 다시 분양받은 경우는 카브백 대상이 아니다).
   *
   * 🔴 이 카브백이 없으면 부득이한 사유로 대체취득한 정상 대상자를 **법 근거 없이 배제**한다.
   */
  recontractUnavoidableCause?: boolean;
  /**
   * 종전주택을 **재개발·재건축하여 취득한** 신축주택인가 (조특령 §99의3② 1호 단서·2호 괄호).
   *
   * 대상 범위는 「법 §98의3② **각 호**에 따른 신축주택」 —
   *   1호 정비사업조합(재개발·재건축·소규모재건축)의 조합원이 **관리처분계획에 따라 취득**하는 주택
   *   2호 거주·보유 중 **소실·붕괴·노후 등으로 멸실되어 재건축**한 주택
   * 자기선언(§99 선례 `isRedevelopedNewHouse99`와 동일 패턴).
   */
  isRedevelopedNewHouse?: boolean;
  /**
   * 종전주택 취득 당시 기준시가 — 위 변형의 **분모 차감항**.
   * 미입력이면 안분이 불가하므로 차단한다(자동 안분 fallback 금지).
   */
  previousHouseStdPriceAtAcquisition?: number;
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
 * §99·§99의3의 **조항 기준일**을 취득유형으로 가른다 — 기간 게이트와 고가주택 단서가 **같은 축**을 써야 한다.
 *
 * §99①·§99의3①은 1호가 **매매계약 체결·계약금 납부일**, 2호가 **사용승인·사용검사일**을
 * 기준일로 삼는다. 고가주택 단서도 같은 조항의 단서이므로 같은 기준일을 쓴다.
 *
 * 🔴 종전에는 기간 게이트만 취득유형으로 분기하고 고가주택 기준일은
 *   `contractDate ?? usageApprovalDate ?? acquisitionDate`로 **분기하지 않았다**(코드리뷰 D3-09).
 *   `contractDate993`에 전용 위젯이 없어 자산-수준 `assetContractDate`가 공급되는데
 *   그 위젯은 취득유형과 무관하게 항상 렌더되므로, 2호(자기건설)에서 계약일이 사용승인일을
 *   밀어내 고가주택 임계(165/149㎡ · 6억/9억/12억)가 갈렸다 — 감면 전액 ↔ 0.
 *   같은 식이 `new-99.ts`에도 복제돼 있어 헬퍼로 단일화한다.
 *
 * anchor: `__tests__/tax-engine/transfer/new99-high-value-base-date-axis.anchor.test.ts`
 */
export function resolveNew99BaseDate(
  acquisitionType: "from_builder" | "self_built",
  contractDate: Date | undefined,
  usageApprovalDate: Date | undefined,
  acquisitionDate: Date,
): Date {
  return acquisitionType === "from_builder"
    ? contractDate ?? acquisitionDate
    : usageApprovalDate ?? acquisitionDate;
}

/**
 * 고가주택 여부 판정 — 기준일은 `resolveNew99BaseDate`가 정한다(취득유형 축).
 *
 * - ~2002.9.30: 면적 165㎡ 이상 AND 양도가 6억 초과 (고급주택)
 * - 2002.10.1~2002.12.31: 면적 149㎡ 이상 AND 양도가 6억 초과 (고급주택)
 * - 2003.1.1~2008.10.5: 양도가 6억 초과 (고가주택)
 * - 2008.10.6~2021.12.7: 양도가 9억 초과 (고가주택)
 * - 2021.12.8~: 양도가 12억 초과 (고가주택)
 */
export function isHighValueHouseUnder993(
  baseDate: Date,
  /** **물건 전체(100%) 양도가액**. 지분분을 넘기면 판정이 뒤집힌다 — New993Input 주석 참조. */
  wholePropertyTransferPrice: number,
  exclusiveAreaSqm: number,
): boolean {
  if (baseDate <= HV_2002_09_30) {
    return exclusiveAreaSqm >= 165 && wholePropertyTransferPrice > 600_000_000;
  }
  if (baseDate <= HV_2002_12_31) {
    return exclusiveAreaSqm >= 149 && wholePropertyTransferPrice > 600_000_000;
  }
  if (baseDate <= HV_2008_10_05) {
    return wholePropertyTransferPrice > 600_000_000;
  }
  if (baseDate <= HV_2021_12_07) {
    return wholePropertyTransferPrice > 900_000_000;
  }
  return wholePropertyTransferPrice > 1_200_000_000;
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
  const periodTarget = resolveNew99BaseDate(
    input.acquisitionType,
    input.contractDate,
    input.usageApprovalDate,
    input.acquisitionDate,
  );
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

  // 5-a. 재계약·대체취득 배제 (조특령 §99의3④) — 단, 조특칙 §44의4 카브백이 있으면 유지.
  if (input.isRecontractExcluded === true && input.recontractUnavoidableCause !== true) {
    reasons.push({
      code: "RECONTRACT_EXCLUDED",
      message:
        "2001.5.23 전 분양계약을 해제하고 본인·배우자(직계존비속·형제자매 포함)가 당초 주택을 다시 분양받거나 대체하여 다른 주택을 분양받아 취득한 주택은 적용 배제됩니다 (조특령 §99의3④).",
      legalBasis: "조특령 §99의3 ④",
    });
    return reasons;
  }

  // 5-b. 재개발·재건축 변형 — 종전주택 기준시가 필수 (자동 안분 fallback 금지). §99 선례와 동일.
  if (
    input.isRedevelopedNewHouse === true &&
    (input.previousHouseStdPriceAtAcquisition === undefined ||
      input.previousHouseStdPriceAtAcquisition <= 0)
  ) {
    reasons.push({
      code: "MISSING_PREVIOUS_STD_PRICE",
      message:
        "재개발·재건축 신축주택의 안분에는 종전주택 취득 당시 기준시가가 필요합니다 (조특령 §99의3② 1호 단서·2호 괄호).",
      legalBasis: "조특령 §99의3 ②",
    });
    return reasons;
  }

  // 6. 고가주택 (단서)
  // 기간 게이트(:위)와 **같은 축**이어야 한다 — 두 판정이 갈리면 임계가 뒤집힌다 (D3-09).
  const hvBaseDate = resolveNew99BaseDate(
    input.acquisitionType,
    input.contractDate,
    input.usageApprovalDate,
    input.acquisitionDate,
  );
  if (isHighValueHouseUnder993(hvBaseDate, input.wholePropertyTransferPrice, input.exclusiveAreaSqm)) {
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
    // (+,+) 정상 안분 — 감면대상 = 양도소득금액 × (5년시점 − 취득시) ÷ (양도시 − 취득시)
    const ratio = numerator / denominator;

    // ① 정수 분수연산 (2026-07-29 정정, #591 감사 R7 — **1원 과소산정**)
    //    종전 주석은 "분자·분모 정수 → BigInt 우회 불필요"라고 단정했으나, 문제는 크기가 아니라
    //    **중간 비율이 부동소수**라는 점이었다: 70,000,000 ÷ 100,000,000 = 0.7 은 2진수로
    //    정확히 표현되지 않아 700,000,000 × 0.7 = 489,999,999.99999994 → floor 489,999,999.
    //    곱셈을 먼저 하고 나누는 safeMultiplyThenDivide로 정확값 490,000,000을 얻는다
    //    (memory `feedback_safemul_decimal_apportion_precision` · `feedback_applyrate_fractional_rate_one_won_error`).
    const raw = safeMultiplyThenDivide(transferIncome, numerator, denominator);

    // ② 양도소득금액 상한 클램프 (조특법 §99의3① — "5년간 발생한 양도소득금액")
    //    5년시점 기준시가 > 양도시 기준시가면 numerator > denominator 라 ratio > 1이 되어
    //    감면 대상 소득금액이 실제 양도소득금액을 넘어섰다. 형제 조문은 이미 같은 상한을 둔다:
    //    `new-99.ts:267` · `unsold-98-8.ts:302` (둘 다 Math.min(…, max(0, transferIncome))).
    const reducible = Math.min(raw, Math.max(0, transferIncome));
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

  const variant = input.isRedevelopedNewHouse === true;
  const stdAtPrev = input.previousHouseStdPriceAtAcquisition ?? 0;

  if (isWithin5Years && !variant) {
    // 5년 내 양도 — 양도소득금액 전액 차감 (조특령 §99의3②1호 **본문**)
    reducibleTransferIncome = Math.max(0, input.transferIncome);
    fiveYearRatio = 1;
    signCase = "within_5_years";
    formulaSteps.push({
      label: "5년 이내 양도 — 양도소득금액 전액 차감",
      value: reducibleTransferIncome,
      formula: `양도소득금액 ${input.transferIncome.toLocaleString()} 전체를 양도소득세 과세대상소득금액에서 차감`,
    });
  } else {
    // 안분 산식 — 조특령 §99의3② (KoreanLaw 원문 실측)
    //   1호 단서(5년 이내 + 재개발변형): 분자 = 양도시 − 신축취득시 / 분모 = 양도시 − **종전주택**취득시
    //   2호(5년 후):                     분자 = 5년시점 − 신축취득시 / 분모 = 양도시 − 신축취득시
    //                                    (재개발변형이면 분모 차감항만 **종전주택**취득시로 치환)
    //   ⇒ §99(`new-99.ts:264-265`)와 **완전히 같은 구조**다 — 그 구현을 그대로 옮긴다.
    //
    // 🔴 안분에 쓰는 기준시가 3종이 하나라도 미입력(0 이하)이면 차단한다.
    //    분모(양도시 − 취득시)가 미입력 때문에 음수가 되면 `pos_neg`로 떨어져
    //    **양도소득금액 전액 감면**으로 오분류되고, 결과 화면이 그것을
    //    「부동산-525(2010.4.7.) 해석」으로 제시한다(코드리뷰 D3-01).
    //    형제 조문은 모두 같은 가드를 갖고 있다 — `new-99.ts:257` · `unsold-98-8.ts` ·
    //    `unsold-hybrid.ts` · `new-99-4.ts`. §99의3만 예외였다.
    //    ⚠️ 기준시가가 **실제로 하락**한 경우(양도시 > 0 이면서 취득시보다 작음)는
    //       조특령 §99의3②2호에 대한 부동산-525 해석이 전액 감면을 인정하므로 차단하지 않는다.
    //    anchor: `__tests__/tax-engine/transfer/new-99-3-missing-std-price.anchor.test.ts`
    // 5년 **이내** 변형은 분자에 양도시 기준시가를 쓰므로 5년시점 기준시가가 불요하다.
    const needs5Y = !isWithin5Years;
    if (
      input.standardPriceAtAcquisition <= 0 ||
      (needs5Y && input.standardPriceAt5Years <= 0) ||
      input.standardPriceAtTransfer <= 0
    ) {
      return {
        isEligible: false,
        ineligibleReasons: [
          {
            code: "MISSING_STD_PRICE",
            message:
              "5년 후 양도 안분 계산에 필요한 기준시가(취득시·5년시점·양도시)가 입력되지 않았습니다 (조특령 §99의3②2호).",
            legalBasis: "조특령 §99의3 ② 2호",
          },
        ],
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
    const numerator = isWithin5Years
      ? input.standardPriceAtTransfer - input.standardPriceAtAcquisition
      : input.standardPriceAt5Years - input.standardPriceAtAcquisition;
    const denominator = variant
      ? input.standardPriceAtTransfer - stdAtPrev
      : input.standardPriceAtTransfer - input.standardPriceAtAcquisition;
    const allocation = calcSignedAllocation(input.transferIncome, numerator, denominator);
    reducibleTransferIncome = allocation.reducibleIncome;
    fiveYearRatio = allocation.ratio;
    signCase = allocation.signCase;

    // ⚠️ 표시용으로 분자·분모를 **다시 계산하지 않는다** — 위에서 실제 쓴 값을 그대로 쓴다
    //   (dual truth 회피. 종전에는 여기서 5년시점·취득시로 재계산해 재개발 변형과 어긋났다).
    const numerLabel = isWithin5Years
      ? "분자 (양도시 기준시가 − 신축주택 취득시 기준시가)"
      : "분자 (5년시점 기준시가 − 신축주택 취득시 기준시가)";
    const numerLhs = isWithin5Years ? input.standardPriceAtTransfer : input.standardPriceAt5Years;
    const denomLabel = variant
      ? "분모 (양도시 기준시가 − 종전주택 취득시 기준시가)"
      : "분모 (양도시 기준시가 − 신축주택 취득시 기준시가)";
    const denomRhs = variant ? stdAtPrev : input.standardPriceAtAcquisition;
    formulaSteps.push({
      label: numerLabel,
      value: numerator,
      formula: `${numerLhs.toLocaleString()} − ${input.standardPriceAtAcquisition.toLocaleString()} = ${numerator.toLocaleString()}`,
    });
    formulaSteps.push({
      label: denomLabel,
      value: denominator,
      formula: `${input.standardPriceAtTransfer.toLocaleString()} − ${denomRhs.toLocaleString()} = ${denominator.toLocaleString()}`,
    });
    if (variant) {
      formulaSteps.push({
        label: "재개발·재건축 신축주택 변형 적용",
        value: stdAtPrev,
        formula:
          "종전주택을 재개발·재건축하여 취득한 신축주택(법 §98의3② 각 호)이므로 분모의 차감항에 종전주택 취득 당시 기준시가를 적용 (조특령 §99의3② 1호 단서·2호 괄호)",
      });
    }
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
