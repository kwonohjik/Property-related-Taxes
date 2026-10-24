/**
 * §155⑳ 장기임대주택 보유자 거주주택 특례 — **요건 판정·조기반환 게이트** (계산기·판정 메뉴 공용)
 *
 * `transfer-tax-rental-housing-step.ts`에서 분리(800줄 정책, OH-13~OH-41 작업 2026-09-26).
 * 옮긴 것은 위치뿐이다 — step 파일이 같은 이름으로 재export한다(기존 import 경로 무변경).
 */

import { calculateHoldingPeriod } from "./tax-utils";
import { TRANSFER_RENTAL_HOUSING } from "./legal-codes/transfer";
import { MULTI_HOUSE } from "./legal-codes/transfer-house";
import { rentalUnitLowPriceFacts } from "./rental-card-surcharge-rows";
import {
  checkEligibility,
  type EligibilityContext,
} from "./transfer-tax/rental-housing-exception/eligibility";
import type { EligibilityResult } from "./transfer-tax/rental-housing-exception/types";
import {
  meetsTable2ResidenceRequirement,
  qualifiesWinWinRental,
  resolveWasRegulatedAtAcquisition,
} from "./transfer-tax-exemption-requirements";
import { resolveExemptionRequirementResidenceMonths } from "./one-house/residence-months";
import { resolveLthdTable2Era } from "./data/lthd-table2-era";
import type { TransferTaxInput } from "./types/transfer.types";
import type { ParsedRates } from "./transfer-tax-helpers";
import { isSurchargeSuspended } from "./tax-utils";
import type { OneHouseJudgment } from "./one-house/types";
import { revokeOneHouseExemption } from "./one-house/revoke-exemption";
import { resolveRentalResidenceComposition, type RentalResidenceComposition } from "./transfer-tax-rental-residence-composition";
import { isAddendumTransitionEffective } from "./data/rental-155-20-era";

/**
 * §155⑳ 시나리오 B(임대→거주 전환 PHRP) 여부 — STEP 1a 전액 비과세 조기 반환 억제 게이트.
 * B는 §161①(직전거주주택 양도일 이후 기간분만 비과세) 안분이 필요하므로 일반 1세대1주택
 * 요건 충족이어도 조기 반환하면 안분 미도달 오답. 특례가 **불성립**이면 §161 안분 대상이 아니다(`canEarlyReturnPrhp`).
 */
export function isPrhpScenarioB(effectiveInput: TransferTaxInput): boolean {
  return (
    effectiveInput.rentalHousingException?.applyException === true &&
    effectiveInput.rentalHousingException.scenario === "B"
  );
}

/**
 * `checkEligibility`에 넘길 거주주택·양도 시점 사실 — 판정(`judgeRentalHousingEligibility`)과
 * 세액(`runRentalHousingExceptionStep`) 두 경로가 **같은 함수로** 조립한다(D-1 「엔진은 하나」).
 */
export function buildEligibilityContext(effectiveInput: TransferTaxInput): EligibilityContext {
  const rhe = effectiveInput.rentalHousingException!;
  return {
    scenario: rhe.scenario,
    transferDate: effectiveInput.transferDate,
    residenceAcquisitionDate: effectiveInput.acquisitionDate,
    postRegistrationResidenceMonths: rhe.postRegistrationResidenceMonths,
    priorRentalExemptionHistory: rhe.priorRentalExemptionHistory,
    residenceTransitionUnderAddendum: rhe.residenceTransitionUnderAddendum,
    residenceTransitionBasis: rhe.residenceTransitionBasis,
    // §154⑩ 표준 경로(I-5) — rentalUnits 0호일 때만 checkEligibility가 참조한다.
    priorResidenceTransferDate: rhe.priorResidenceTransferDate,
    wasRegisteredRentalOrChildcare: rhe.wasRegisteredRentalOrChildcare,
    // 거주주택 §154① 취득 당시 조정대상지역 판정과 같은 단일 소스(일반 1세대1주택 흐름과 동일 술어).
    wasRegulatedAtAcquisition: resolveWasRegulatedAtAcquisition(effectiveInput),
  };
}

/**
 * §155⑳ **요건 판정만** — 세액 산식과 무관한 순수 판정 (P4-3a).
 *
 * ## 왜 따로 뺐는가
 *
 * 이 파일 안에서 같은 네 인자 도출(`holdYears`·`liveYears`·`winWin`)이 **이미 두 벌**이었고
 * (`isPrhpScenarioAIneligible` · 종전 `rentalPeriodPendingNoticeForEarlyReturn`), 판정 메뉴
 * (`/api/calc/one-house-exemption`)가 **세 번째 사본**을 만들 참이었다. 인자 하나가 어긋나면
 * 계산기와 판정 메뉴가 같은 입력에 다른 답을 낸다(D-1 「엔진은 하나」).
 *
 * 🔑 **§161 안분 입력(`priorResidenceTransferDate`·`standardPriceAt*`)을 보지 않는다.**
 *    그것이 Q-7의 분할선이다 — 판정 사실은 판정 메뉴, 세액 산식 입력은 계산기.
 *
 * @returns 특례를 선언하지 않았으면 `null`(「판정할 것이 없다」 — 미충족과 구별된다).
 */
export function judgeRentalHousingEligibility(
  effectiveInput: TransferTaxInput,
): EligibilityResult | null {
  const rhe = effectiveInput.rentalHousingException;
  if (rhe?.applyException !== true) return null;
  const holdYears = calculateHoldingPeriod(
    effectiveInput.acquisitionDate,
    effectiveInput.transferDate,
  ).years;
  // §155⑳1호 「거주기간 2년」 — 증여·상속 전 동일세대로 거주한 기간을 통산한다(별건 ⑥ · 서면-2022-부동산-2643 · 서면-2016-부동산-3992).
  // §154① 거주요건·표2 대상 판정과 같은 leaf다. 보유기간은 통산하지 않는다(사용자 결정 2026-10-19 — 거주만).
  const liveYears = Math.floor(resolveExemptionRequirementResidenceMonths(effectiveInput) / 12);
  // 거주주택 보유·거주 연수 = holdYears·liveYears (runRentalHousingExceptionStep의 요건 인자와 같은 값)
  return checkEligibility(
    rhe.rentalUnits,
    holdYears,
    liveYears,
    qualifiesWinWinRental(effectiveInput),
    buildEligibilityContext(effectiveInput),
  );
}

/**
 * §155㉒ 사후 추징 안내 — ㉑(임대기간요건 충족 전 양도)로 특례를 받은 호가 있을 때만.
 * 계산은 ㉑대로 비과세하고, 이후 요건을 못 채우면 차액을 신고·납부해야 한다는 사실을 알린다.
 */
export function buildRentalPeriodPendingNotice(unitIndexes: number[] | undefined): string | undefined {
  if (!unitIndexes || unitIndexes.length === 0) return undefined;
  const units = unitIndexes.map((i) => `${i + 1}호`).join("·");
  return (
    `장기임대주택 ${units}가 임대기간요건을 채우기 전에 거주주택을 양도해 특례를 적용했습니다` +
    `(${TRANSFER_RENTAL_HOUSING.PIT_RD_155_21}). 이후 임대기간요건을 충족하지 못하게 되면(임대의무호수를 ` +
    `임대하지 않은 기간이 6개월을 지난 경우 포함) 그 사유가 발생한 날이 속하는 달의 말일부터 2개월 이내에 ` +
    `특례가 없었다면 납부했을 세액과의 차액을 신고·납부해야 합니다(${TRANSFER_RENTAL_HOUSING.PIT_RD_155_22}).`
  );
}

/**
 * RH-B2 2호 부분의 장기보유특별공제 표 독법 고지 (#15 — S06-5).
 *
 * 「소득세법 시행령」 §161④는 2호 부분에 표2를 적용한다고 정한다. 계산은 그 문언대로 거주 2년 미만이어도 표2의
 * 보유분을 적용한다. 반면 §159의4는 표2 대상을 「보유기간 중 거주기간이 2년 이상인 것」으로 정하므로, 그 요건을
 * 2호에도 적용하는 견해에서는 2호가 표1로 계산된다 — 정면 해석례를 확인하지 못했다.
 *
 * 두 독법이 **실제로 갈리는 경우에만** 단다: 2호 금액이 있고(RH-B2), 보유 3년 이상이며, 표2 거주 2년 요건
 * (§154⑧3호 통산·상생임대 면제 반영 — 일반 경로와 같은 술어)을 못 채운 경우. 2019년 이전 양도는 표2에 거주 요건이
 * 없고(`data/lthd-table2-era.ts`) 상생임대는 요건이 면제되므로 이 조건에서 저절로 빠진다.
 */
export function buildPrhpTable2ReadingNotice(
  effectiveInput: TransferTaxInput,
  scenarioId: string,
  part2: number | undefined,
  holdYears: number,
): string | undefined {
  if (scenarioId !== "RH-B2" || !part2 || part2 <= 0 || holdYears < 3) return undefined;
  const era = resolveLthdTable2Era(effectiveInput.transferDate);
  if (era !== "holding_8pct_residence_2y" && era !== "holding_residence_split") return undefined;
  const table2ResidenceYears = Math.floor(resolveExemptionRequirementResidenceMonths(effectiveInput) / 12);
  if (meetsTable2ResidenceRequirement(effectiveInput, table2ResidenceYears)) return undefined;
  return (
    "직전거주주택보유주택 양도의 §161②2호 부분은 소득세법 시행령 §161④ 문언대로 장기보유특별공제 표2(보유기간분)를 " +
    "적용해 계산했습니다. 표2 거주 2년 요건(소득세법 시행령 §159의4)을 이 부분에도 적용하는 견해에 따르면 " +
    "2호 부분의 장기보유특별공제는 표1로 계산됩니다 — 정면 해석례가 없어 확인이 필요합니다."
  );
}

/**
 * STEP 1a 조기반환에 실을 §155⑳ 안내 전부 — ㉒ 사후 추징 안내 + 판정 보류·확인 필요 고지(OH-40·§7-5).
 * 조기반환은 STEP 2.5를 건너뛰므로 특례 경로의 안내가 여기서만 닿는다.
 */
export function rentalNoticesForEarlyReturn(effectiveInput: TransferTaxInput, unmet: PrhpUnmet | undefined): string[] {
  if (effectiveInput.rentalHousingException?.scenario !== "A") return [];
  const eligibility = judgeRentalHousingEligibility(effectiveInput);
  if (!eligibility) return [];
  // 불성립(F-1 D-2)이면 ㉒ 사후 추징 안내(「…특례를 적용했습니다」)만 사실이 아니다 — 싣지 않는다. 판정 보류·확인 필요 고지(`notices`)와
  // 거주 통산 문장은 불성립에서도 싣는다: 「모름」이 불성립의 원인일 수 있고, STEP 2.5 「적용 불가」 경로도 싣는다. 불성립 사실은 `prhpUnmetOtherExemptionNotice`가 단다.
  // 세대 구성 불성립(composition)도 「특례를 적용했습니다」가 사실이 아니다(composition-revoke D-2).
  const pending = unmet ? undefined : buildRentalPeriodPendingNotice(eligibility.periodPendingUnitIndexes);
  const consolidation = rentalResidenceConsolidationText(effectiveInput);
  return [...(pending ? [pending] : []), ...(consolidation ? [consolidation] : []), ...(eligibility.notices ?? [])];
}

/**
 * 별건 ⑥ — §155⑳1호 「거주기간 2년」에 통산한 증여·상속 전 동일세대 거주 내역(결과 표시용). 통산분이 없거나 A가 아니면 undefined
 * (B의 거주요건은 등록 이후 거주기간이라 이 통산을 쓰지 않는다). 정면 회신이 있어 확인 필요 고지가 아니다(사용자 결정 2026-10-19 Q-1).
 * 세액 경로(STEP 2.5 계산 단계)와 전액 비과세 조기반환(안내)이 같은 문장을 쓴다.
 */
export function rentalResidenceConsolidationText(effectiveInput: TransferTaxInput): string | undefined {
  if (effectiveInput.rentalHousingException?.scenario !== "A") return undefined;
  const own = effectiveInput.residencePeriodMonths;
  const total = resolveExemptionRequirementResidenceMonths(effectiveInput);
  if (total <= own) return undefined;
  const before = effectiveInput.acquisitionCause === "inheritance" ? "상속개시" : "증여";
  return (
    `장기임대주택 보유자 거주주택 특례의 거주기간 — 본인 거주 ${own}개월 + ${before} 전 같은 세대 거주 ${total - own}개월 = ${total}개월을 ` +
    "「거주기간 2년」 요건 판정에 통산했습니다(장기보유특별공제 거주기간 공제율에는 넣지 않습니다 · 서면-2022-부동산-2643 · 서면-2016-부동산-3992)."
  );
}

/**
 * STEP 1a 전액 비과세 조기반환 허용 여부 — §161① 안분이 필요한가(B 성립) 하나만 막는다.
 *
 * 🔴 F-1(2026-10-24 · `docs/00-pm/rental-155-20-unmet-blocks-155-1.plan.md` Q-1·Q-2 (a)): 종전에는 A·B **불성립**도 막았다.
 *    그 비과세는 판정 엔진이 임대주택을 센 결과다 — 「주택 수 1(임대 제외)」 입력은 STEP 0.96(`restoreRentalUnitsToHouseCount`)이
 *    판정 **전에** 되돌리고, 남은 입력(명부의 장기임대 행 · 명부 없음 + 주택 수 2 이상)은 이미 센 값이다. 임대주택이 일시적 2주택의
 *    신규 주택(영 §155①)이면 그 비과세는 정당한데, 정상 경로는 전액 비과세를 처리하지 않아(`resolveTaxableGain`) 10억은 전액 과세,
 *    15억은 12억 초과분만 과세로 역전했다. 영 §155⑳은 불성립이면 「…보아」가 없을 뿐 다른 특례를 배제하지 않는다.
 */
export function canEarlyReturnPrhp(effectiveInput: TransferTaxInput, unmet: PrhpUnmet | undefined): boolean {
  if (unmet) return true;
  return !isPrhpScenarioB(effectiveInput);
}

/**
 * §155⑳ **불성립 원인** — 호별·거주 요건(`requirement`) 또는 세대 구성(`composition` — 「장기임대주택과 그 밖의 1주택」 · 3중첩 ·
 * ⑳과 겹친 해석 미확보). 호별·거주가 먼저다(사유 문장이 더 구체적이다). 선언하지 않았거나 성립하면 `undefined`.
 *
 * 🔑 조기 반환(`canEarlyReturnPrhp`)·㉒ 안내(`rentalNoticesForEarlyReturn`)·불성립 고지(`prhpUnmetOtherExemptionNotice`)가 이 한 판정을 본다
 *    (계획서 `rental-155-20-composition-revoke.plan.md` D-2). 세대 구성은 임대 1호 이상일 때만 본다 — §154⑩ 표준 경로(B · 0호)는
 *    `revokeExemptionOnStandardPathUnmet`이 따로 다룬다(`judgeRentalHousingUnmet`과 같은 범위).
 */
export type PrhpUnmet =
  | { kind: "requirement"; eligibility: EligibilityResult }
  | { kind: "composition"; reason: string };

export function resolvePrhpUnmet(
  effectiveInput: TransferTaxInput,
  composition: RentalResidenceComposition | undefined,
): PrhpUnmet | undefined {
  const eligibility = judgeRentalHousingEligibility(effectiveInput);
  if (!eligibility) return undefined;
  if (!eligibility.passed) return { kind: "requirement", eligibility };
  if ((effectiveInput.rentalHousingException?.rentalUnits?.length ?? 0) === 0) return undefined;
  return composition?.status === "exceeded" ? { kind: "composition", reason: composition.reason } : undefined;
}

/** §155⑳ 불성립 사유 한 줄 — STEP 2.5 「적용 불가」 단계와 불성립 고지가 같은 문장을 쓴다. */
export function rentalUnmetReasonText(eligibility: EligibilityResult): string {
  const reasons = [...eligibility.residenceFailReasons, ...eligibility.failReasons.map((r) => r.message)];
  return reasons.length > 0 ? reasons.join(" · ") : "장기임대주택 거주주택 비과세 특례 요건 미충족";
}

/**
 * F-1 D-2·D-3 — §155⑳이 **불성립**인데 판정 엔진이 임대주택을 센 채 다른 특례(일시적 2주택 등)로 비과세·부분 비과세를 낸 경우의 고지.
 * 전액 비과세 조기반환과 12억 초과 정상 경로가 같은 문장을 쓴다. 이 고지가 서면 STEP 0.96 고지(「…적용하지 않습니다」)는 싣지 않는다.
 */
export function prhpUnmetOtherExemptionNotice(
  effectiveInput: TransferTaxInput,
  exemption: Pick<OneHouseJudgment, "isExempt" | "isPartialExempt" | "exemptReason">,
  unmet: PrhpUnmet | undefined,
): string | undefined {
  if (!unmet || (!exemption.isExempt && !exemption.isPartialExempt)) return undefined;
  const b = effectiveInput.rentalHousingException?.scenario === "B";
  const head =
    unmet.kind === "requirement"
      ? `장기임대주택 거주주택 특례(${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20})는 요건을 충족하지 못해 적용하지 않았습니다`
      : `장기임대주택 거주주택 특례(${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20})는 세대 구성 요건(「장기임대주택과 그 밖의 1주택」)을 충족하지 못했습니다`;
  const reason = unmet.kind === "requirement" ? rentalUnmetReasonText(unmet.eligibility) : unmet.reason;
  return (
    head +
    (b ? `(${TRANSFER_RENTAL_HOUSING.PIT_RD_161_1} 안분도 적용하지 않았습니다)` : "") +
    ` — ${reason}. 임대주택을 세대 주택 수에 넣어 판정했고, 적용한 비과세는 「${exemption.exemptReason ?? "1세대1주택 비과세"}」입니다.`
  );
}

/**
 * §155⑳ 특례가 **불성립**하는가 — 요건(호별·거주 — A·B 공통) 또는 세대 구성(「그 밖의 1주택」 — 3중첩 등)이 미충족이다.
 *
 * 판정 메뉴 `buildRentalHousingVerdict`의 `passed`(= `eligibility.passed && 구성 exceeded 아님`)와 **같은 술어**다 —
 * 비과세(STEP 0.96)·중과 배제 ①(STEP 0.5)·판정 메뉴가 한 규칙을 본다(결정 #19 X1-1 · #20 G8-1). 선언하지 않았거나(`null`)
 * 1세대가 아니거나 미등기면(STEP 2.5가 어차피 적용 불가로 돌린다) 「불성립으로 되돌릴 대상」이 아니다.
 */
export function judgeRentalHousingUnmet(
  effectiveInput: TransferTaxInput,
  parsedRates: ParsedRates,
  generalHouseAcquisitionDate?: Date,
): { cause: "unit_or_residence" | "composition"; scenario: "A" | "B"; units: number } | undefined {
  const rhe = effectiveInput.rentalHousingException;
  if (rhe?.applyException !== true || !effectiveInput.isOneHousehold || effectiveInput.isUnregistered) return undefined;
  const units = rhe.rentalUnits?.length ?? 0;
  if (units === 0) return undefined; // §154⑩ 표준 경로(임대 0호)는 되돌릴 임대주택이 없다
  const eligibility = judgeRentalHousingEligibility(effectiveInput);
  if (!eligibility) return undefined;
  if (!eligibility.passed) return { cause: "unit_or_residence", scenario: rhe.scenario, units };
  const composition = resolveRentalResidenceComposition(effectiveInput, parsedRates, generalHouseAcquisitionDate);
  return composition.status === "exceeded" ? { cause: "composition", scenario: rhe.scenario, units } : undefined;
}

/**
 * ⑳ 선언 + 불성립 때 **주택 수에 더할 임대 호수** — 비과세(STEP 0.96 A·B)와 중과 배제 ① 요소(STEP 0.5 A)가 하나의 규칙을 쓴다.
 *
 * 입력 전제: 카드는 임대주택을 주택 수에서 뺀 채로 입력받는다(명부에도 넣지 않는다 — 판정 메뉴 ⑧ 안내). 특례가 불성립하면 임대주택은 그냥
 * 주택이라 세대의 주택 수에 들어간다(영 §155⑳ 「…것으로 보아」가 없다). 이중 계상을 막는 조건:
 *  · 명부(`houses[]`)가 있으면 「장기임대로 표시한 행이 없을 때」만 더한다(`rosterCountsRentalUnits` — 표시한 행이 있으면 이미 센 것).
 *  · 명부가 없으면 판정 주택 수가 **정확히 1**일 때만 더한다(1이면 거주주택만 센 값이 분명하다 — 2 이상은 임대주택을 이미 센 입력으로 본다).
 * @param judgeHouseCount 호출 지점이 보는 주택 수(제외 후)
 * @param scenarios 되돌릴 시나리오 — 비과세·중과 ① 요소·중과 주택 수 모두 A·B(결정 #20 C — 불성립이면 B도 ⑳이 서지 않는 일반 주택이다)
 */
export function rentalUnitsToRestore(args: {
  effectiveInput: TransferTaxInput;
  parsedRates: ParsedRates;
  generalHouseAcquisitionDate?: Date;
  judgeHouseCount: number;
  scenarios: readonly ("A" | "B")[];
}): { units: number; cause: "unit_or_residence" | "composition"; scenario: "A" | "B"; hasRoster: boolean } | undefined {
  const { effectiveInput, parsedRates, generalHouseAcquisitionDate, judgeHouseCount, scenarios } = args;
  const unmet = judgeRentalHousingUnmet(effectiveInput, parsedRates, generalHouseAcquisitionDate);
  if (!unmet || !scenarios.includes(unmet.scenario)) return undefined;
  const hasRoster = (effectiveInput.houses ?? []).length > 0;
  if (hasRoster ? rosterCountsRentalUnits(effectiveInput) : judgeHouseCount !== 1) return undefined;
  return { units: unmet.units, cause: unmet.cause, scenario: unmet.scenario, hasRoster };
}

/**
 * 명부에 「장기임대」로 표시한 행이 있는가 — 있으면 판정 엔진의 주택 수가 임대주택을 이미 센 것으로 본다.
 * 계산기 STEP 0.96(되돌림 생략)과 판정 메뉴 `applyRentalHousingVerdict`(불성립이어도 비과세 유지 — F-1 Q-3)가 같은 술어를 쓴다.
 */
export function rosterCountsRentalUnits(input: Pick<TransferTaxInput, "houses">): boolean {
  return (input.houses ?? []).some((h) => h.isLongTermRental === true);
}

/** 다주택 중과가 이 계산에서 실제로 걸릴 수 있는가 — 양도일 조정대상지역이고 한시 배제(데이터 `surcharge_suspended`) 밖. 고지 문장 게이트 전용. */
function surchargeSentenceApplies(effectiveInput: TransferTaxInput, parsedRates: ParsedRates): boolean {
  if (effectiveInput.isRegulatedArea !== true) return false;
  return !isSurchargeSuspended(parsedRates.surchargeSpecialRules, effectiveInput.transferDate, "multi_house_2");
}

/**
 * §155⑳ **불성립** — 「임대주택을 주택 수에서 뺀」 입력 전제를 되돌린다 (E-1 한계 G5 → 결정 #19 X1-1로 A·B·명부 경로 확장).
 *
 * 영 §155⑳: 「장기임대주택 … 과 그 밖의 1주택을 국내에 소유하고 있는 1세대가 … 거주주택을 양도하는 경우에는 국내에
 * 1개의 주택을 소유하고 있는 것으로 보아 제154조제1항을 적용한다」(MST 286211 · 290841 원문). 특례가 불성립하면 그 「보아」가
 * 없으므로 임대주택은 주택 수에 들어가고 세대는 1주택이 아니다 ⇒ §154① 비과세도, 12억 초과분 안분(법 §95③ · 영 §160①)도,
 * 표2(영 §159의4 「1세대가 양도일 현재 국내에 1주택(제155조 … 에 따라 1세대 1주택으로 보는 주택을 포함한다)을 보유」)도 적용할 수 없다.
 *
 * 🔴 종전: A이고 주택 수가 정확히 1일 때만 되돌렸다. B(직전거주주택보유주택)는 고지만 두고(12억 초과에는 고지조차 없이) 부분 비과세·표2를
 *    그대로 냈고, 명부에 다른 주택이 있는 A(주택 수 2 이상)도 일시적 2주택 비과세·표2가 남았다 — 불충족 세액(12,840,000)이
 *    요건을 충족한 경우보다도 적었고 판정 메뉴(과세)와 갈렸다. 판정·장특·결과가 한 전제를 보도록 **판정 전에** 주택 수를 되돌린다.
 *
 * 🔑 이 함수는 비과세 판정의 주택 수만 되돌린다. 중과는 STEP 0.5가 같은 규칙으로 따로 정정한다 — ① 요소(`surchargeDeemingHouseCount`)와
 *    중과 판정 명부에 카드 행 합성(`unmetRentalSurchargeHouses`, 결정 #20 C). §161 안분은 적용하지 않는다(B).
 */
export function restoreRentalUnitsToHouseCount<T extends TransferTaxInput>(
  judgeInput: T,
  effectiveInput: TransferTaxInput,
  parsedRates: ParsedRates,
  generalHouseAcquisitionDate: Date | undefined,
): { input: T; notice?: string } {
  const restore = rentalUnitsToRestore({
    effectiveInput,
    parsedRates,
    generalHouseAcquisitionDate,
    judgeHouseCount: judgeInput.householdHousingCount,
    scenarios: ["A", "B"],
  });
  if (!restore) return { input: judgeInput };
  const restored = judgeInput.householdHousingCount + restore.units;
  // 중과 판정 명부에 카드 행을 더한 경우(`unmetRentalSurchargeHouses` — 명부 있음, 또는 명부 없음 + 세대 주택 수 1)만 그 사실을 적는다.
  const surcharge =
    surchargeSentenceApplies(effectiveInput, parsedRates) &&
    (restore.hasRoster || effectiveInput.householdHousingCount === 1);
  const cause =
    restore.cause === "composition"
      ? `세대 구성 요건(「장기임대주택과 그 밖의 1주택」)을 충족하지 못해`
      : `요건을 충족하지 못해`;
  const notice =
    `장기임대주택 거주주택 특례(${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20})가 ${cause} 임대주택 ${restore.units}호를 ` +
    `세대 주택 수에 넣어(${restored}주택) 계산했습니다 — 1세대1주택 비과세·12억 초과분 안분·장기보유특별공제 표2를 적용하지 않습니다` +
    (restore.scenario === "B" ? `(${TRANSFER_RENTAL_HOUSING.PIT_RD_161_1} 안분도 적용하지 않았습니다)` : "") +
    // F-1 Q-4 — 주택 수만으로는 일시적 2주택 등의 사실(신규 주택 취득일)이 실리지 않는다(명부 없음 + 주택 수 2 → 과세 그대로).
    `. 임대주택이 다른 특례(일시적 2주택 등)에 해당하는지는 「보유 주택 목록」에 임대주택을 취득일과 함께 넣어야 판정합니다.` +
    (surcharge
      ? ` 다주택 중과 판정의 주택 수에도 임대주택 ${restore.units}호를 넣었습니다 — 임대주택이 중과에서 빠지는 장기임대주택인지는 ` +
        `${MULTI_HOUSE.LONG_TERM_RENTAL_EXCLUSION_BASIS} 요건으로 따로 판정했습니다.` +
        lowPriceUnknownSentence(effectiveInput)
      : "");
  return { input: { ...judgeInput, householdHousingCount: restored }, notice };
}

/**
 * 영 §167의3①1호(지방 3억 이하 주택 수 불산입) 해당 여부를 몰라 중과 주택 수에 넣은 임대 호 — 확인 필요 문장(없으면 "").
 * 소재지 주소가 없는 비수도권 호, 가액기준 지역인데 거주주택 양도 당시 기준시가가 없는 호가 대상이다(`rentalUnitLowPriceFacts`).
 */
function lowPriceUnknownSentence(effectiveInput: TransferTaxInput): string {
  const unknown = (effectiveInput.rentalHousingException?.rentalUnits ?? [])
    .map((u, i) => (rentalUnitLowPriceFacts(u).known ? undefined : `${i + 1}호`))
    .filter((x): x is string => x !== undefined);
  if (unknown.length === 0) return "";
  return (
    ` 임대주택 ${unknown.join("·")}는 소재지 주소 또는 거주주택 양도일 현재 기준시가를 입력하지 않아 주택 수에 넣었습니다 — ` +
    `수도권·광역시 등 밖의 지방 주택으로서 그 기준시가가 3억원 이하이면 주택 수에서 빠집니다(${MULTI_HOUSE.LOW_PRICE_LOCAL_BASIS}, 확인 필요).`
  );
}

/**
 * STEP 0.5 ① 요소(영 §167의10①15호·§167의3①13호의 「제155조 … 에 따라 … 제154조제1항이 적용되는 주택」)용 — 비과세와 **같은 규칙**으로
 * 임대 호수를 더한 의제용 주택 수를 돌려준다(결정 #20 G8-1). 불성립이면 §155①·②·조특법 의제가 서지 않는다(조심 2021서1571).
 * A·B 모두(결정 #20 C, 사용자 결정 2026-10-12) — 불성립이면 B도 ⑳이 서지 않으므로 일반 주택과 같다. 해석을 확보하지 못한 것은
 * ⑳이 **성립**한 B의 과세 기간분 중과 여부이고(`qualifiesRentalResidenceDeeming`가 A만 연다), 이 함수와는 축이 다르다.
 */
export function surchargeDeemingHouseCount(
  workingInput: TransferTaxInput,
  parsedRates: ParsedRates,
  generalHouseAcquisitionDate: Date | undefined,
  count: number,
): number {
  const restore = rentalUnitsToRestore({
    effectiveInput: workingInput,
    parsedRates,
    generalHouseAcquisitionDate,
    judgeHouseCount: count,
    scenarios: ["A", "B"],
  });
  return restore ? count + restore.units : count;
}

/**
 * §154⑩ 표준 경로(B · 임대 0호)에서 특례 요건이 불성립하면 고지 문장을 돌려준다(아니면 `undefined`).
 * 호출부가 비과세를 거둔다 — 판정 메뉴(`applyRentalHousingVerdict`)와 같은 불변식.
 *
 * 🔴 종전: 불성립 입력이 STEP 2.5에서 「미적용」으로 일반 경로에 흘렀다. 전액 비과세(`isExempt`)는 STEP 3가 전액 과세하지만
 *    12억 초과 부분 비과세(`isPartialExempt`)는 안분·표2가 그대로 남아 세액이 8억 사례와 반대로 **줄었다**(13억 162,273,691→5,512,268 ·
 *    충족이 불충족보다 많음). 12억 초과도 전액 과세한다.
 * 🔑 #21(S16-5)은 「경과조치 선언 + 사유 불성립」만 고쳤고, 경과조치를 선언하지 않은 입력은 결정 #19 범위 밖이라 남겼다 —
 *    2026-10-12 사용자 결정으로 미선언도 같은 규칙을 따른다. 「확인 필요」는 사유 해석이 결론을 가르는 선언 입력에만 붙인다.
 */
function prhpStandardPathTransitionUnmetNotice(effectiveInput: TransferTaxInput): string | undefined {
  const rhe = effectiveInput.rentalHousingException;
  if (
    rhe?.applyException !== true ||
    rhe.scenario !== "B" ||
    (rhe.rentalUnits?.length ?? 0) !== 0 ||
    !effectiveInput.isOneHousehold ||
    effectiveInput.isUnregistered
  ) {
    return undefined;
  }
  const eligibility = judgeRentalHousingEligibility(effectiveInput);
  if (!eligibility || eligibility.passed) return undefined;
  const transitionUnmet =
    rhe.residenceTransitionUnderAddendum === true && !isAddendumTransitionEffective(true, rhe.residenceTransitionBasis);
  return (
    `영 §154⑩ 거주요건 특례가 요건을 충족하지 못해` +
    (transitionUnmet ? `(부칙 제7조② 경과조치 사유가 종전 규정을 주지 않음 — 확인 필요) ` : ` `) +
    `1세대1주택 비과세·12억 초과분 안분·장기보유특별공제 표2를 적용하지 않고 전액 과세로 계산했습니다 — ` +
    `${TRANSFER_RENTAL_HOUSING.PIT_RD_161_1} 안분도 적용하지 않았습니다.`
  );
}

/**
 * §154⑩ 표준 경로(B · 임대 0호) 불성립이면 판정 결과 비과세를 거둔다 — 판정 메뉴(`applyRentalHousingVerdict`)와 같은 불변식.
 *
 * 🔴 종전(D12 · cf221aedf)에는 여기서 A의 **세대 구성 불성립**(3중첩 등)도 거뒀다. 그 뒤 STEP 0.96이 세대 구성 불성립에도 임대 호수를
 *    판정 **전에** 되돌리게 넓어져(결정 #19 X1-1 · #20 G8-1), 이 단계에 남는 입력의 비과세는 판정이 임대주택을 **센** 결론이 됐다 —
 *    임대주택이 일시적 2주택의 신규 주택이면 그 비과세는 정당하다(영 §155⑳은 불성립이면 「…보아」가 없을 뿐). 그런데도 거둬
 *    ⑳을 선언하지 않은 같은 사실보다 과세됐다(10억 0 → 124,366,000 · 15억 14,124,000 → 282,711,000). 원래 사례(0584형 4주택)는
 *    판정 엔진이 임대주택을 센 채 과세로 낸다. 계획서 `rental-155-20-composition-revoke.plan.md` Q-1 (a) — 세대 구성 회수를 없앴다.
 */
export function revokeExemptionOnStandardPathUnmet(
  exemption: OneHouseJudgment,
  effectiveInput: TransferTaxInput,
): { judgment: OneHouseJudgment; notice?: string } {
  if (!exemption.isExempt && !exemption.isPartialExempt) return { judgment: exemption };
  const standardPathNotice = prhpStandardPathTransitionUnmetNotice(effectiveInput);
  if (standardPathNotice) return { judgment: revokeOneHouseExemption(exemption), notice: standardPathNotice };
  return { judgment: exemption };
}

/**
 * B(직전거주주택보유주택)인데 특례(§161 안분)를 적용하지 못하고 일반 경로로 흘러 **비과세·부분 비과세가 남는** 경우의 확인 고지.
 *
 * 임대주택을 되돌릴 수 있는 불성립(`restoreRentalUnitsToHouseCount`)은 비과세 자체를 거두므로 여기 오지 않는다 — 남는 입력은 임대 0호
 * (§154⑩ 경로)와 요건은 충족했는데 §161 기준시가 입력이 부실한 경우뿐이다(후자는 API가 임대 1호 이상 B에 기준시가 3개를 필수로 받는다).
 * 종전에는 전액 비과세(`isExempt`)에만 고지해 12억 초과(`isPartialExempt`)는 고지 없이 부분 비과세·표2가 나갔다(X1-1).
 */
export function prhpUnappliedExemptionNotice(
  effectiveInput: TransferTaxInput,
  exemption: Pick<OneHouseJudgment, "isExempt" | "isPartialExempt">,
  unmet: PrhpUnmet | undefined,
): string | undefined {
  if (!isPrhpScenarioB(effectiveInput) || !(exemption.isExempt || exemption.isPartialExempt)) return undefined;
  // 불성립(호별·거주 · 세대 구성)은 `prhpUnmetOtherExemptionNotice`가 사유와 함께 단다 — 여기는 그 밖의 미적용 B만.
  if (unmet) return undefined;
  return (
    "장기임대주택 거주주택 특례(§155⑳) 요건 미충족 — 임대주택이 주택수에 산입될 수 있어 1세대1주택 전제(주택수 입력)를 재확인하세요. " +
    (exemption.isPartialExempt
      ? "특례의 §161 안분을 적용하지 않고 12억 초과분만 과세하는 일반 1세대1주택 고가주택 규칙으로 계산되었습니다."
      : "일반 과세 경로로 계산되었습니다.")
  );
}

/**
 * §155⑳ 시나리오 B(직전거주주택보유주택)가 성립했는데 다주택 중과가 붙은 경우의 확인 필요 (결정 #20 성립 B — 2026-10-14 사용자: 현행 유지).
 *
 * B의 과세 기간분(직전거주주택 양도일 전 기간분과 12억 초과분 안분)에 중과를 붙이는지는 정면 해석을 확보하지 못했다 —
 * §154⑩이 그 기간분은 1주택을 보유한 것으로 보지 않으므로 15호(§167의10①15호) 요건이 서지 않는다고 읽어 중과를 유지했다
 * (시나리오 A는 `qualifiesRentalResidenceDeeming`이 15호를 열어 중과를 배제한다). 고가주택 12억 초과분에 중과를 배제한
 * 서면-2021-법규재산-8497·사전-2021-법령해석재산-1719는 A·① 겹침 사안이라 B에 그대로 옮기지 않았다.
 */
export const PRHP_SURCHARGE_UNVERIFIED_NOTICE =
  "직전거주주택보유주택 특례(소득세법 시행령 §155⑳ 후단 · §154⑩)가 성립했지만, 임대주택을 포함한 주택 수로 다주택 중과를 적용했습니다. " +
  "비과세에서 제외되는 기간분(직전거주주택 양도일 전 기간분 · 12억 초과분)에 중과세율을 적용하는지를 정면으로 다룬 해석은 확인하지 못했으니 확인이 필요합니다.";

export function prhpSurchargeUnverifiedNotice(
  effectiveInput: TransferTaxInput,
  surchargeType: string | undefined,
): string | undefined {
  // 시나리오 B·요건 통과 검사는 방어 조건이다 — 시나리오 A는 15호(`qualifiesRentalResidenceDeeming`)가 중과를 배제해 이 함수에 중과 유형으로 오지 않는다.
  // 세액을 낸 `calcTax`의 중과 유형으로 판정한다 — 명부가 없으면 중과 판정 결과(`multiHouseSurchargeResult`)가 없고 원시 플래그로 붙는다.
  if (!surchargeType?.startsWith("multi_house") || !isPrhpScenarioB(effectiveInput)) return undefined;
  if (judgeRentalHousingEligibility(effectiveInput)?.passed !== true) return undefined;
  return PRHP_SURCHARGE_UNVERIFIED_NOTICE;
}
