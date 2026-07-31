/**
 * 1세대1주택 비과세 판단 (소득세법 §89①3호·시행령 §154)
 *
 * transfer-tax-helpers.ts H-2 블록을 800줄 정책 준수를 위해 분리.
 * 하위 호환: transfer-tax-helpers.ts 가 checkExemption·meetsOneHouseHoldingResidence·
 * resolveExemptionProviso 를 재수출하므로 기존 import 경로 무변경.
 *
 *   E-3: 일시적 2주택 비과세 (부칙 양도일 분기 포함)
 *   E-4: §154① 보유·거주 요건 (단서 각호 면제 포함)
 *   E-1: 전액 비과세 (양도가 12억 이하) / E-2: 고가주택 부분과세
 */

import { addYears, format } from "date-fns";
import { calculateHoldingPeriod } from "./tax-utils";
import { EXEMPTION_PROVISO_CONST, TEMP_TWO_HOUSE_PROVISO_REASONS } from "./legal-codes";
import { isRegulatedByBjdCode } from "./data/regulated-areas";
import type { TransferTaxInput, TemporaryTwoHouseDelayReason } from "./types/transfer.types";
import type { OneHouseSpecialRulesData } from "./schemas/rate-table.schema";

// §156의2⑤ 대체주택 특례 — 신축주택 완성 후 대체주택 양도 기한.
// 2023.01.12 이후 양도분부터 3년(구 2년). 소득세법 시행령 부칙(대통령령 제33267호).
const REPLACEMENT_HOUSE_3YR_TRANSFER_START = new Date("2023-01-12");
const REPLACEMENT_HOUSE_DEADLINE_YEARS_NEW = 3;
const REPLACEMENT_HOUSE_DEADLINE_YEARS_OLD = 2;
// §155④⑤ 합가·혼인 1세대1주택 비과세 처분기한 — 합가·혼인일부터 10년.
const MERGE_EXEMPTION_YEARS = 10;
// §155⑯ 공공기관·법인 지방이전 — §155① 본문의 "3년"을 "5년"으로 치환.
const PUBLIC_INSTITUTION_RELOCATION_DEADLINE_YEARS = 5;

/**
 * 거주요건 판정 입력 — TransferTaxInput의 부분집합. UI(Step4 안내 메시지)와 엔진이 공용.
 * resolveExemptionProviso·resolveWasRegulatedAtAcquisition·meetsOneHouseResidenceRequirement 입력.
 */
export type ResidenceReqInput = Pick<
  TransferTaxInput,
  | "acquisitionDate"
  | "transferDate"
  | "residencePeriodMonths"
  | "oneHouseExemptionProviso"
  | "regionCode"
  | "wasRegulatedAtAcquisition"
  | "residenceTransitionAcquisitionDate"
  | "acquisitionCause"
  | "decedentSameHouseholdBeforeInheritance"
  | "decedentCohabitationResidenceMonths"
>;

/**
 * §154① **보유·거주 통합** 요건 판정 입력 — `ResidenceReqInput` + 보유 기산일 backdate 1필드.
 *
 * `meetsOneHouseHoldingResidence`가 `TransferTaxInput` 전체를 요구하면 겸용주택 서브엔진처럼
 * 전체를 구성할 수 없는 호출부가 정본을 재사용하지 못한다(그 결과가 계획서 E-3 —
 * P3a가 보유 판정을 따로 구현했다가 단서 면제를 놓친 과다과세 결함).
 * **타입 전용 narrowing이며 동작은 불변**이다. 단건 엔진이 넘기는 `TransferTaxInput`은
 * 구조적으로 이 타입을 만족한다.
 */
export type ExemptionReqInput = ResidenceReqInput &
  Pick<TransferTaxInput, "decedentCohabitationHoldingStartDate">;

/**
 * §155① 의제 성립 판정 입력 — `ExemptionReqInput` + 일시적 2주택 3필드.
 *
 * `ExemptionReqInput`과 같은 이유로 narrowing한다: 겸용주택 서브엔진은 `TransferTaxInput`
 * 전체를 구성할 수 없으므로, 전체를 요구하면 정본을 재사용하지 못하고 규칙을 재구현하게 된다
 * (그 결과가 계획서 F-2 — 중과 배제가 §155① 기한을 자체 계산해 비과세와 어긋난 것).
 * **타입 전용 narrowing이며 동작은 불변**이다.
 */
export type DeemedOneHouseReqInput = ExemptionReqInput &
  Pick<TransferTaxInput, "isRegulatedArea" | "isOneHousehold" | "temporaryTwoHouse">;

interface ExemptionResult {
  isExempt: boolean;
  isPartialExempt: boolean;
  exemptReason?: string;
}

/** §155⑱ 각 호 라벨 (exemptReason 표시용) — 내부 id 노출 금지 원칙에 따라 한국어로 환원 */
const DISPOSAL_DELAY_REASON_LABEL: Record<TemporaryTwoHouseDelayReason, string> = {
  kamco: "1호 한국자산관리공사 매각 의뢰",
  auction: "2호 법원 경매 신청",
  public_sale: "3호 공매 진행 중",
  cash_settlement_suit: "4호 현금청산금 지급 소송",
  expropriation_suit: "5호 수용재결·매도청구소송",
};

/** §154① 단서 각호 면제 범위 라벨 (exemptReason 표시용) — 모듈 스코프 (per-call 재생성 금지) */
const PROVISO_LABEL: Record<
  NonNullable<TransferTaxInput["oneHouseExemptionProviso"]>["reason"],
  string
> = {
  rental_5yr_residence: "1호 임대주택 거주5년",
  expropriation: "2호가 수용",
  overseas_migration: "2호나 해외이주",
  overseas_residence: "2호다 국외거주",
  unavoidable: "3호 부득이",
  pre_designation_contract: "5호 공고전계약",
};

/**
 * §154① 단서 각호 — 보유·거주 요건 면제 범위 판정 (소득세법 시행령 §154 ① 단서).
 * 반환: "both"(보유+거주 면제 — 1·2·3호) / "residence_only"(거주만 — 5호) / null(미선택 또는 요건 미충족).
 * 시한 상수: EXEMPTION_PROVISO_CONST (가목 5년·나다목 2년·1호 거주5년·3호 거주1년).
 */
export function resolveExemptionProviso(
  input: ResidenceReqInput,
): "both" | "residence_only" | null {
  const p = input.oneHouseExemptionProviso;
  if (!p) return null;
  const C = EXEMPTION_PROVISO_CONST;
  // §154⑧3호: 단서 각호 거주요건(3호 부득이 1년·1호 임대 5년)도 "제1항에 따른 거주기간"이므로
  // 동일세대 상속 통산을 반영 (favorable-only — 통산은 거주연수를 늘려 비과세 요건 충족 방향, 불리 없음).
  const residenceYears = Math.floor(resolveExemptionResidenceMonths(input) / 12);
  switch (p.reason) {
    case "expropriation":
      // 2호 가목: 사업인정 고시일 전 취득 + 양도일·수용일부터 5년 이내
      if (p.businessApprovalDate && input.acquisitionDate >= p.businessApprovalDate) return null;
      // 2026-07-29 정정(#591 감사 R7 — **세액 변경**): `?? input.transferDate` fallback은
      //   fail-open이었다. 수용일 미입력 시 `transferDate <= transferDate + 5년`이 **항상 참**이라
      //   5년 요건을 검증하지 않고 무조건 "both"(보유·거주 면제)를 줬다 → 비과세 과다.
      //   §154①2호가목의 5년은 **수용일 기산**이므로, 수용일을 모르면 요건을 판정할 수 없다
      //   → 특례 미적용(null)이 맞다. 미입력을 유리하게 추정할 근거가 없다.
      if (!p.expropriationDate) return null;
      return input.transferDate <= addYears(p.expropriationDate, C.EXPROPRIATION_TRANSFER_YEARS)
        ? "both"
        : null;
    case "overseas_migration":
    case "overseas_residence":
      // 2호 나·다목: 출국일부터 2년 이내
      return p.departureDate && input.transferDate <= addYears(p.departureDate, C.OVERSEAS_TRANSFER_YEARS)
        ? "both"
        : null;
    case "unavoidable":
      // 3호: 1년 이상 거주
      return residenceYears >= C.UNAVOIDABLE_RESIDENCE_YEARS ? "both" : null;
    case "rental_5yr_residence":
      // 1호: 세대전원 거주 5년 이상
      return residenceYears >= C.RENTAL_RESIDENCE_YEARS ? "both" : null;
    case "pre_designation_contract":
      // 5호: 거주만 면제 (계약금일 무주택은 UI validation으로 담보)
      return "residence_only";
    default:
      return null;
  }
}

/**
 * 취득 당시 조정대상지역 여부 — 거주요건(§154① 본문) 판정 입력.
 *
 * regionCode(법정동코드)가 있으면 취득일 기준 isRegulatedByBjdCode로 정밀 판정
 * (읍·면·동/택지지구 예외까지 반영). 없으면 wasRegulatedAtAcquisition boolean fallback (회귀 0 보장).
 * 다주택 중과(multi-house-surcharge: 양도일 기준)와 대칭 — 여기서는 취득일 기준.
 */
export function resolveWasRegulatedAtAcquisition(input: ResidenceReqInput): boolean {
  if (input.regionCode) {
    return isRegulatedByBjdCode(
      input.regionCode,
      format(input.acquisitionDate, "yyyy-MM-dd"),
    ).isRegulated;
  }
  return input.wasRegulatedAtAcquisition === true;
}

/**
 * §154⑧3호 통산 거주 개월 규칙 코어 — 최소입력 pure 헬퍼 (client·engine 공용 단일 소스).
 * 동일세대 상속이면 상속개시일 이후 실거주 + 상속개시 전 동일세대 통산 거주, 그 외에는 실거주만.
 * 겸용주택 API 어댑터(`transfer-tax-api-mixed-use.ts`)도 이 함수를 재사용해 규칙 중복을 없앤다
 * (`resolveExemptionResidenceMonths`가 10-필드 Pick 인자라 어댑터에서 직접 호출 불가한 것을 우회).
 */
export function consolidateResidenceMonths(
  residencePeriodMonths: number,
  opts: {
    acquisitionCause?: TransferTaxInput["acquisitionCause"];
    decedentSameHouseholdBeforeInheritance?: boolean;
    decedentCohabitationResidenceMonths?: number;
  },
): number {
  if (
    opts.acquisitionCause === "inheritance" &&
    opts.decedentSameHouseholdBeforeInheritance === true
  ) {
    return residencePeriodMonths + (opts.decedentCohabitationResidenceMonths ?? 0);
  }
  return residencePeriodMonths;
}

/**
 * §154⑧3호 — 상속주택 자체 양도 시 (비과세 거주요건·§95② 표2 대상 판정용) 통산 거주 개월.
 * 동일세대 상속이면 상속개시일 이후 실거주(residencePeriodMonths) + 상속개시 전 동일세대 통산 거주
 * (decedentCohabitationResidenceMonths). 그 외에는 실거주만.
 * ⚠️ 대상 판정 전용 — 표2 "거주분 공제율"은 residencePeriodMonths(상속개시일부터 실거주)를 별도 사용
 *    (사전법령해석재산 2021-202: 통산은 표2 대상 판정 한정, 공제율은 상속개시일 기산).
 * 두 기간은 disjoint(상속개시 이전/이후)라 단순 합산이 정확.
 */
export function resolveExemptionResidenceMonths(input: ResidenceReqInput): number {
  return consolidateResidenceMonths(input.residencePeriodMonths, input);
}

/**
 * §154① 본문 거주요건 단독 판정 (보유요건 제외) — Step4 거주요건 안내 메시지와 엔진 공용(단일 진실).
 * true = 거주요건 충족 또는 면제. 단서면제(both·residence_only)·취득시 비조정·
 * 2017.8.3 이전 취득(경과규정)·거주 2년 이상(§154⑧3호 동일세대 상속 통산 포함) 중 하나라도 해당하면 충족.
 */
export function meetsOneHouseResidenceRequirement(
  input: ResidenceReqInput,
  rule: Pick<
    OneHouseSpecialRulesData["one_house_exemption"],
    "regulatedAreaMinResidenceYears" | "prePolicyDate" | "prePolicyExemptResidence"
  >,
): boolean {
  const proviso = resolveExemptionProviso(input);
  // §154① 거주요건 경과규정 — 2017.8.3(prePolicyDate) 이전 취득은 조정지역이라도 거주요건 면제.
  // 이월과세 시 acquisitionDate는 증여자(보유 기산)로 교체되므로(§95④), 경과규정 판정은
  // 수증자 실제 취득일(residenceTransitionAcquisitionDate) 사용 — §97의2는 필요경비 계산 특례에 한정.
  const residenceTransitionDate =
    input.residenceTransitionAcquisitionDate ?? input.acquisitionDate;
  const isPrePolicy = residenceTransitionDate < new Date(rule.prePolicyDate);
  // §154⑧3호: 동일세대 상속이면 상속개시 전 동일세대 통산 거주분을 거주요건 판정에 합산.
  const residenceYears = Math.floor(resolveExemptionResidenceMonths(input) / 12);
  // 취득 당시 조정대상지역 — regionCode 있으면 취득일 기준 정밀 판정, 없으면 boolean fallback
  const wasRegulated = resolveWasRegulatedAtAcquisition(input);
  return (
    proviso === "both" ||
    proviso === "residence_only" ||
    !wasRegulated ||
    // §154① 부칙(대통령령 제28293호) 적용례 — prePolicy 취득은 조정지역이라도 거주요건 면제
    (rule.prePolicyExemptResidence && isPrePolicy) ||
    residenceYears >= rule.regulatedAreaMinResidenceYears
  );
}

/**
 * §154① 보유·거주 요건 (단서 각호 면제 포함).
 * 본문: 보유 2년(rule.minHoldingYears) + 취득 당시 조정대상지역이면 거주 2년(거주요건은 위 헬퍼 재사용).
 * 단서: resolveExemptionProviso "both"=보유+거주 면제 / "residence_only"=거주만 면제 (소령 §154① 단서).
 * §155⑤(혼인 합가) 1세대1주택 의제 중과배제(§167의10①15호) 게이트에 재사용 — checkExemption과 단일 진실.
 */
/**
 * §154⑧3호 — 상속주택 자체 양도 시 비과세 보유기간 기산일.
 * 상속개시 당시 상속인·피상속인 동일세대이고 통산 기산일(동일세대 보유 개시)이 상속개시일보다 이르면
 * 그 날부터 통산 → backdate. 그 외에는 acquisitionDate(상속개시일 등) 그대로.
 * ⚠️ §154① 요건 판정 전용 — meetsOneHouseHoldingResidence 경유 소비처 전반에 적용:
 *    (1) 1세대1주택 비과세(checkExemption E-4), (2) §155⑤ 혼인·합가 1세대1주택 의제 중과배제 게이트.
 *    둘 다 §154① 보유·거주 요건 판정이라 §154⑧ 통산이 정합(먼저양도 상속주택도 §154① 적용).
 *    단 LTHD(resolveLTHDStartDate)·단기세율(decedentAcquisitionDate)에는 적용하지 않는다.
 */
export function resolveExemptionHoldingStartDate(input: ExemptionReqInput): Date {
  if (
    input.acquisitionCause === "inheritance" &&
    input.decedentSameHouseholdBeforeInheritance === true &&
    input.decedentCohabitationHoldingStartDate &&
    input.decedentCohabitationHoldingStartDate < input.acquisitionDate
  ) {
    return input.decedentCohabitationHoldingStartDate;
  }
  return input.acquisitionDate;
}

export function meetsOneHouseHoldingResidence(
  input: ExemptionReqInput,
  rule: OneHouseSpecialRulesData["one_house_exemption"],
): boolean {
  const proviso = resolveExemptionProviso(input);
  const holding = calculateHoldingPeriod(resolveExemptionHoldingStartDate(input), input.transferDate);
  const meetsHolding = proviso === "both" || holding.years >= rule.minHoldingYears;
  return meetsHolding && meetsOneHouseResidenceRequirement(input, rule);
}

/**
 * §155① 일시적 2주택 타이밍 요건 판정 (순수 — rule·waiver는 caller 주입).
 *
 * - 요건 A(1년): 신규취득일 ≥ 종전취득일 + 1년. 단 oneYearWaived(§154①1·2가·3호) 시 면제.
 * - 요건 B(3년): 양도일 ≤ 신규취득일 + deadlineYears(조정지역 부칙은 caller가 반영해 주입).
 *
 * 엔진 E-3·UI 판정 카드 공용(single-source). UI는 waiver를 resolveExemptionProviso로 별도 산출해 주입.
 */
export function judgeTemporaryTwoHouseTiming(p: {
  previousAcquisitionDate: Date;
  newAcquisitionDate: Date;
  transferDate: Date;
  deadlineYears: number;
  oneYearWaived: boolean;
  /** §155⑯ 후단 — 공공기관 지방이전 시 1년 요건 면제 */
  publicInstitutionRelocation?: boolean;
  /** §155⑱ — 해당 시 처분기한 초과여도 요건 B 충족 */
  disposalDelayReason?: TemporaryTwoHouseDelayReason;
}): {
  oneYearThreshold: Date;
  oneYearMet: boolean;
  deadline: Date;
  threeYearMet: boolean;
  overall: boolean;
} {
  const oneYearThreshold = addYears(p.previousAcquisitionDate, 1);
  // §155⑯ 후단: "…종전의 주택을 취득한 날부터 1년 이상이 지난 후 다른 주택을 취득하는 요건을
  //   적용하지 아니한다." — 기한 5년(전단)과 **별개의 두 번째 효과**다.
  const oneYearMet =
    p.oneYearWaived || p.publicInstitutionRelocation === true || p.newAcquisitionDate >= oneYearThreshold;
  const deadline = addYears(p.newAcquisitionDate, p.deadlineYears);
  // §155① 본문 괄호 "(제18항에 따른 사유에 해당하는 경우를 포함한다)" — 기한 초과를 치유한다.
  //   ⑱ 각 호는 「다른 주택을 취득한 날부터 3년이 되는 날 현재」 해당 여부이므로 양도일과 무관하다.
  //   ⑱은 **요건 B(기한)만** 치유한다 — 요건 A(1년)는 그대로다(본문 괄호가 3년 절에만 붙어 있다).
  const threeYearMet = p.disposalDelayReason !== undefined || p.transferDate <= deadline;
  return { oneYearThreshold, oneYearMet, deadline, threeYearMet, overall: oneYearMet && threeYearMet };
}

/**
 * §155① 처분기한(년) 산정 — 조정대상지역 부칙 완화 반영.
 *
 * 비과세 판정(`checkExemption` E-3)과 중과 배제(§167의10①15호) **양쪽이 같은 값을 써야** 한다.
 * 중과 배제가 이 규칙을 자체 재구현했다가 「비과세 O / 중과배제 X」 모순을 만든 것이
 * 계획서 F-2다. 인라인이던 것을 추출만 했으며 **동작은 불변**이다.
 */
export function resolveTemporaryTwoHouseDeadlineYears(
  p: Pick<TransferTaxInput, "isRegulatedArea" | "transferDate" | "temporaryTwoHouse">,
  twoHouseRule: NonNullable<OneHouseSpecialRulesData["temporary_two_house"]>,
): number {
  // §155⑯ 전단: "제1항 중 '3년'을 '5년'으로 본다."
  //   🔶 조정대상지역 단축 기한(DB 2년)과의 우선순위는 명문이 없다(계획서 W-4).
  //   법문이 §155① 본문의 "3년"을 직접 치환하므로 5년이 덮는 것으로 구현한다.
  if (p.temporaryTwoHouse?.publicInstitutionRelocation) {
    return PUBLIC_INSTITUTION_RELOCATION_DEADLINE_YEARS;
  }
  if (!p.isRegulatedArea) return twoHouseRule.disposalDeadlineYears;
  // 부칙: 양도일이 완화 시행일(2022-05-10) 이후이면 완화 기한 적용
  const relaxDate = twoHouseRule.regulatedAreaRelaxDate
    ? new Date(twoHouseRule.regulatedAreaRelaxDate)
    : null;
  if (relaxDate && p.transferDate >= relaxDate) {
    return twoHouseRule.regulatedAreaRelaxDeadlineYears ?? twoHouseRule.regulatedAreaDeadlineYears;
  }
  return twoHouseRule.regulatedAreaDeadlineYears;
}

/**
 * §155① 일시적 2주택 **타이밍 요건(A·B)** 판정 — 비과세(E-3)와 중과 배제(§167의10①15호) 공용.
 *
 * `provisoRelaxesHolding`(§154① 단서 화이트리스트 → 1년 요건 면제)까지 함께 산출해
 * 두 호출부가 **같은 규칙**을 쓰게 한다. 15호 ② 요소(§154① 보유·거주 충족)는 여기서 보지 않는다 —
 * 비과세는 `meetsOneHouseHoldingResidence`가, 중과는 `sellingHouseMeetsOneHouseRequirements`가 담당.
 */
function evaluateTemporaryTwoHouseTiming(
  input: DeemedOneHouseReqInput,
  twoHouseRule: NonNullable<OneHouseSpecialRulesData["temporary_two_house"]>,
): {
  provisoRelaxesHolding: boolean;
  timing: ReturnType<typeof judgeTemporaryTwoHouseTiming>;
} {
  const { previousAcquisitionDate, newAcquisitionDate } = input.temporaryTwoHouse!;

  // §155①→§154①1·2가·3호 준용: 종전주택이 §154① 단서(both, 화이트리스트) 해당 시 보유 2년 요건 면제.
  // 나·다목(출국일 1주택)·5호(무주택·residence_only)는 일시적 2주택과 양립 불가라 화이트리스트로 제외.
  // resolveExemptionProviso는 input.acquisitionDate(=종전주택 취득일, previousAcquisitionDate와 동일 의도) 기준.
  const provisoReason = input.oneHouseExemptionProviso?.reason;
  const provisoRelaxesHolding =
    resolveExemptionProviso(input) === "both" &&
    provisoReason !== undefined &&
    TEMP_TWO_HOUSE_PROVISO_REASONS.has(provisoReason);

  // §155① 요건 A(1년 경과)·B(3년 내) 판정 — 1년 요건은 보유면제 화이트리스트(§154①1·2가·3호) 시 면제.
  const timing = judgeTemporaryTwoHouseTiming({
    previousAcquisitionDate,
    newAcquisitionDate,
    transferDate: input.transferDate,
    deadlineYears: resolveTemporaryTwoHouseDeadlineYears(input, twoHouseRule),
    oneYearWaived: provisoRelaxesHolding,
    // §155⑯ 후단(1년 면제) · §155⑱(기한 예외) — 정본 한 곳에서 전달해 비과세·중과가 같은 값을 쓴다.
    publicInstitutionRelocation: input.temporaryTwoHouse!.publicInstitutionRelocation,
    disposalDelayReason: input.temporaryTwoHouse!.disposalDelayReason,
  });

  return { provisoRelaxesHolding, timing };
}

/**
 * 영 §167의10①15호(·§167의3①13호) **① 요소** — §155에 따른 1세대1주택 의제 성립 여부.
 *
 * 중과 판정(STEP 0.5)이 비과세 판정(STEP 1)보다 먼저 실행되므로 `checkExemption` 결과를 넘길 수
 * 없다. 그래서 §155① 타이밍만 **선판정**해 `MultiHouseSurchargeInput.deemedOneHouseBy155`로 넘긴다.
 *
 * ② 요소(§154① 요건 모두 충족)는 중과 엔진이 `sellingHouseMeetsOneHouseRequirements`로 AND한다.
 * 현재 채우는 항은 ①(일시적 2주택)뿐 — 나머지 §155 각 항은 계획서 Phase C·D.
 */
export function resolveDeemedOneHouseBy155(
  input: DeemedOneHouseReqInput,
  oneHouseRules: OneHouseSpecialRulesData | undefined,
): "temporary_two_house" | undefined {
  const twoHouseRule = oneHouseRules?.temporary_two_house;
  if (!input.isOneHousehold || !input.temporaryTwoHouse || !twoHouseRule) return undefined;
  return evaluateTemporaryTwoHouseTiming(input, twoHouseRule).timing.overall
    ? "temporary_two_house"
    : undefined;
}

export function checkExemption(
  input: TransferTaxInput,
  oneHouseRules: OneHouseSpecialRulesData,
): ExemptionResult {
  const { one_house_exemption: rule, temporary_two_house: twoHouseRule } = oneHouseRules;

  if (!input.isOneHousehold || input.propertyType !== "housing") {
    return { isExempt: false, isPartialExempt: false };
  }

  // E-5: §156의2⑤ 대체주택 특례 — 재개발·재건축 시행기간 중 거주 목적 대체주택.
  // 신축주택+대체주택 2주택이나 대체주택 양도를 1세대1주택으로 의제(§154① 보유·거주 요건 면제).
  // 요건 미충족 시 fall through(일반 과세). 사후관리(§156의2⑬) 경고는 결과 warnings에서 별도 처리.
  if (input.replacementHouse) {
    const rh = input.replacementHouse;
    // ① 사업시행인가일 이후 대체주택 취득 + 1년 이상 거주
    const meetsAcquisition =
      input.acquisitionDate >= rh.businessApprovalDate &&
      Math.floor(rh.replacementResidenceMonths / 12) >= 1;
    // ④ 신축주택 완성 전 또는 완성 후 3년(2023.01.12 이후 양도분; 구 2년)내 대체주택 양도
    const deadlineYears =
      input.transferDate >= REPLACEMENT_HOUSE_3YR_TRANSFER_START
        ? REPLACEMENT_HOUSE_DEADLINE_YEARS_NEW
        : REPLACEMENT_HOUSE_DEADLINE_YEARS_OLD;
    const meetsTransferTiming =
      input.transferDate < rh.completionDate ||
      input.transferDate <= addYears(rh.completionDate, deadlineYears);
    // ③ 신축주택 1년 이상 거주 (전제 — 자기선언, 미충족 시 §156의2⑬ 추징)
    const meetsNewHouseResidence = rh.willResideNewHouse === true;

    if (meetsAcquisition && meetsTransferTiming && meetsNewHouseResidence) {
      const priceCheck =
        input.burdenedGiftDenominator ??
        input.totalPropertyTransferPrice ??
        input.transferPrice;
      if (priceCheck <= rule.maxExemptPrice) {
        return {
          isExempt: true,
          isPartialExempt: false,
          exemptReason: "대체주택 특례 비과세 (§156의2⑤)",
        };
      }
      return {
        isExempt: false,
        isPartialExempt: true,
        exemptReason: "대체주택 특례 고가주택 (§156의2⑤)",
      };
    }
  }

  // E-3: 일시적 2주택
  if (input.householdHousingCount === 2 && input.temporaryTwoHouse && twoHouseRule) {
    const provisoReason = input.oneHouseExemptionProviso?.reason;
    const { provisoRelaxesHolding, timing } = evaluateTemporaryTwoHouseTiming(input, twoHouseRule);

    const prevHolding = calculateHoldingPeriod(
      input.temporaryTwoHouse.previousAcquisitionDate,
      input.transferDate,
    );
    if (!provisoRelaxesHolding && prevHolding.years < rule.minHoldingYears) {
      return { isExempt: false, isPartialExempt: false };
    }

    // 2026-07-29 정정(#591 감사 R7 — **세액 변경**): 종전에는 타이밍(요건 A·B)만 보고
    //   비과세를 줬다. §155①은 "…국내에 1주택을 소유한 것으로 **보아 제154조제1항을 적용**한다"이므로
    //   종전주택 자체가 **§154①의 보유 2년 + (취득 당시 조정대상지역이면) 거주 2년**을 충족해야 한다.
    //   검증이 없어 거주 0년인 조정지역 취득 종전주택도 비과세됐다(비과세 과다 → 세액 과소).
    //   `meetsOneHouseHoldingResidence`가 §154① 단서(보유·거주 면제 사유)까지 함께 처리하므로
    //   `provisoRelaxesHolding` 케이스는 종전대로 통과한다.
    //   바로 아래 E-3.5(합가 §155④⑤)는 이미 "§154① 보유·거주"를 요건으로 명시하고 있어
    //   같은 조 구조에서 E-3만 빠져 있던 내부 불일치였다.
    if (timing.overall && meetsOneHouseHoldingResidence(input, rule)) {
      // 적용된 특례 근거를 결과에 남긴다 — 어느 조항으로 요건이 완화됐는지 납세자가 확인할 수 있어야 한다.
      const basisParts: string[] = [];
      if (provisoRelaxesHolding) basisParts.push(`§154① 단서 ${PROVISO_LABEL[provisoReason!]}`);
      if (input.temporaryTwoHouse.publicInstitutionRelocation) {
        basisParts.push("§155⑯ 지방이전 처분기한 5년·1년요건 면제");
      }
      if (input.temporaryTwoHouse.disposalDelayReason) {
        basisParts.push(`§155⑱ ${DISPOSAL_DELAY_REASON_LABEL[input.temporaryTwoHouse.disposalDelayReason]}`);
      }
      const provisoLabel = basisParts.length > 0 ? ` (${basisParts.join(" · ")})` : "";
      // §155①은 "1세대1주택으로 보아 §154①을 적용" — 고가주택 배제(§89①3괄호)·12억 초과분
      // 안분(§95③·§160)도 동일 적용. E-1/E-3.5/E-5와 같은 priceCheck 패턴.
      const priceCheck =
        input.burdenedGiftDenominator ?? input.totalPropertyTransferPrice ?? input.transferPrice;
      if (priceCheck <= rule.maxExemptPrice) {
        return { isExempt: true, isPartialExempt: false, exemptReason: `일시적 2주택 비과세${provisoLabel}` };
      }
      return { isExempt: false, isPartialExempt: true, exemptReason: `일시적 2주택 고가주택${provisoLabel}` };
    }
  }

  // E-3.5: 합가 비과세 (§155④⑤ 혼인·동거봉양) — 합가일부터 10년 내 "먼저 양도" 주택 1세대1주택 의제.
  // 요건: 2주택 + (marriageMerge | parentalCareMerge) + 선양도 + 양도주택 합가 전 취득 + §154① 보유·거주.
  if (
    input.householdHousingCount === 2 &&
    (input.marriageMerge || input.parentalCareMerge) &&
    input.isFirstTransferredInMerge === true
  ) {
    const mergeDate = input.marriageMerge?.marriageDate ?? input.parentalCareMerge?.mergeDate;
    if (
      mergeDate &&
      input.acquisitionDate < mergeDate && // 합가·혼인 전 취득
      input.transferDate <= addYears(mergeDate, MERGE_EXEMPTION_YEARS) && // 합가일부터 10년 내
      meetsOneHouseHoldingResidence(input, rule) // §154① 보유·거주 요건
    ) {
      const mergeLabel = input.marriageMerge ? "혼인 합가 (§155⑤)" : "동거봉양 합가 (§155④)";
      const priceCheck =
        input.burdenedGiftDenominator ?? input.totalPropertyTransferPrice ?? input.transferPrice;
      if (priceCheck <= rule.maxExemptPrice) {
        return { isExempt: true, isPartialExempt: false, exemptReason: `${mergeLabel} 1세대1주택 비과세` };
      }
      return { isExempt: false, isPartialExempt: true, exemptReason: `${mergeLabel} 고가주택` };
    }
  }

  if (input.householdHousingCount !== 1) {
    return { isExempt: false, isPartialExempt: false };
  }

  // E-4: §154① 보유·거주 요건 (2017.8.3 이전 경과규정 포함) — meetsOneHouseHoldingResidence로 단일화
  if (!meetsOneHouseHoldingResidence(input, rule)) {
    return { isExempt: false, isPartialExempt: false };
  }

  // E-1: 전액 비과세 (양도가 12억 이하)
  // 우선순위:
  //   1) burdenedGiftDenominator (부담부증여 — D-0-2 해석 B: 분모 = giftValuation C)
  //   2) totalPropertyTransferPrice (지분 모드 — 총 물건가)
  //   3) transferPrice (단독 모드 fallback)
  const exemptionPriceCheck =
    input.burdenedGiftDenominator ?? input.totalPropertyTransferPrice ?? input.transferPrice;
  // §154① 단서 각호 적용 시 비과세 사유에 호 라벨 부가 (result detail·PDF·step formula 자동 노출)
  const provisoReason = input.oneHouseExemptionProviso?.reason;
  const provisoLabel = provisoReason ? ` (§154① 단서 ${PROVISO_LABEL[provisoReason]})` : "";
  if (exemptionPriceCheck <= rule.maxExemptPrice) {
    return { isExempt: true, isPartialExempt: false, exemptReason: `1세대1주택 비과세${provisoLabel}` };
  }

  // E-2: 부분과세 (양도가 12억 초과)
  return { isExempt: false, isPartialExempt: true, exemptReason: `1세대1주택 고가주택${provisoLabel}` };
}
