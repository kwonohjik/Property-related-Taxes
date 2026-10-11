/**
 * §155⑳ 장기임대주택 보유자 거주주택 특례 — **요건 판정·조기반환 게이트** (계산기·판정 메뉴 공용)
 *
 * `transfer-tax-rental-housing-step.ts`에서 분리(800줄 정책, OH-13~OH-41 작업 2026-09-26).
 * 옮긴 것은 위치뿐이다 — step 파일이 같은 이름으로 재export한다(기존 import 경로 무변경).
 */

import { calculateHoldingPeriod } from "./tax-utils";
import { TRANSFER_RENTAL_HOUSING } from "./legal-codes/transfer";
import {
  checkEligibility,
  type EligibilityContext,
} from "./transfer-tax/rental-housing-exception/eligibility";
import type { EligibilityResult } from "./transfer-tax/rental-housing-exception/types";
import {
  meetsTable2ResidenceRequirement,
  qualifiesWinWinRental,
  resolveExemptionResidenceMonths,
  resolveWasRegulatedAtAcquisition,
} from "./transfer-tax-exemption-requirements";
import { resolveLthdTable2Era } from "./data/lthd-table2-era";
import type { TransferTaxInput } from "./types/transfer.types";
import type { ParsedRates } from "./transfer-tax-helpers";
import { isSurchargeSuspended } from "./tax-utils";
import type { OneHouseJudgment } from "./one-house/types";
import { revokeOneHouseExemption } from "./one-house/revoke-exemption";
import { resolveRentalResidenceComposition } from "./transfer-tax-rental-residence-composition";

/**
 * §155⑳ 시나리오 B(임대→거주 전환 PHRP) 여부 — STEP 1a 전액 비과세 조기 반환 억제 게이트.
 * B는 §161①(직전거주주택 양도일 이후 기간분만 비과세) 안분이 필요하므로 일반 1세대1주택
 * 요건 충족이어도 조기 반환하면 안분 미도달 오답. A(거주주택 양도)는 eligibility 충족 시 전액 비과세가
 * 정답이므로 조기반환 가능하나, **미충족 시엔 조기반환하면 안 됨**(아래 isPrhpScenarioAIneligible).
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
  const liveYears = Math.floor(effectiveInput.residencePeriodMonths / 12);
  // 거주주택 보유·거주 연수 = holdYears·liveYears (runRentalHousingExceptionStep와 동일 인자 관례)
  return checkEligibility(
    rhe.rentalUnits,
    holdYears,
    liveYears,
    qualifiesWinWinRental(effectiveInput),
    buildEligibilityContext(effectiveInput),
  );
}

/**
 * §155⑳ 시나리오 A(거주주택 양도) + 임대주택 eligibility 미충족 여부 — STEP 1a 조기반환 억제 게이트.
 * A는 사용자가 householdHousingCount=1(임대주택 제외 전제)을 입력하면 checkExemption이 isExempt=true를
 * 내주는데, STEP 1a가 그대로 조기반환하면 STEP 2.5의 checkEligibility가 우회되어 임대 요건 미충족인데도
 * 전액 비과세되는 over-exemption 버그. 미충족 시 조기반환을 억제하면 STEP 2.5가 "적용 불가"(null)로
 * 정상 과세 경로에 넘긴다. eligible 케이스는 false 반환 → 현행 조기반환 유지(무변경).
 */
export function isPrhpScenarioAIneligible(effectiveInput: TransferTaxInput): boolean {
  if (effectiveInput.rentalHousingException?.scenario !== "A") return false;
  const eligibility = judgeRentalHousingEligibility(effectiveInput);
  // 특례 미선언(null)은 억제 대상이 아니다 — 종전 `applyException !== true → false`와 같다.
  if (!eligibility) return false;
  return !eligibility.passed;
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
  const table2ResidenceYears = Math.floor(resolveExemptionResidenceMonths(effectiveInput) / 12);
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
export function rentalNoticesForEarlyReturn(effectiveInput: TransferTaxInput): string[] {
  if (effectiveInput.rentalHousingException?.scenario !== "A") return [];
  const eligibility = judgeRentalHousingEligibility(effectiveInput);
  if (!eligibility) return [];
  const pending = buildRentalPeriodPendingNotice(eligibility.periodPendingUnitIndexes);
  return [...(pending ? [pending] : []), ...(eligibility.notices ?? [])];
}

/**
 * STEP 1a 전액 비과세 조기반환 허용 여부 — §155⑳ 두 억제 게이트를 결합(orchestrator 800줄 정책).
 * B 시나리오(§161 안분 필요)·A 시나리오 eligibility 미충족(over-exemption 차단) 시 false → STEP 2.5 위임.
 */
export function canEarlyReturnPrhp(effectiveInput: TransferTaxInput): boolean {
  return !isPrhpScenarioB(effectiveInput) && !isPrhpScenarioAIneligible(effectiveInput);
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
 *  · 명부(`houses[]`)가 있으면 「장기임대로 표시한 행이 없을 때」만 더한다(D12 술어 — 표시한 행이 있으면 이미 센 것).
 *  · 명부가 없으면 판정 주택 수가 **정확히 1**일 때만 더한다(1이면 거주주택만 센 값이 분명하다 — 2 이상은 임대주택을 이미 센 입력으로 본다).
 * @param judgeHouseCount 호출 지점이 보는 주택 수(제외 후)
 * @param scenarios 되돌릴 시나리오 — 비과세는 A·B, 중과 ① 요소는 A만(B의 중과는 해석 미확보라 열지 않는다)
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
  const roster = effectiveInput.houses ?? [];
  const hasRoster = roster.length > 0;
  if (hasRoster ? roster.some((h) => h.isLongTermRental) : judgeHouseCount !== 1) return undefined;
  return { units: unmet.units, cause: unmet.cause, scenario: unmet.scenario, hasRoster };
}

/** 다주택 중과가 이 계산에서 실제로 걸릴 수 있는가 — 양도일 조정대상지역이고 한시 배제(데이터 `surcharge_suspended`) 밖. 고지 문장 게이트 전용. */
function surchargeSentenceApplies(
  effectiveInput: TransferTaxInput,
  parsedRates: ParsedRates,
  surchargeHouseCount: number,
): boolean {
  if (effectiveInput.isRegulatedArea !== true || surchargeHouseCount >= 3) return false;
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
 * 🔑 되돌림은 비과세 판정에만 쓴다 — 중과는 다시 판정하지 않는다(B는 해석 미확보, A의 ① 요소만 STEP 0.5가 같은 규칙으로 정정).
 *    고지는 이 사실을 말한다. §161 안분은 적용하지 않는다(B).
 */
export function restoreRentalUnitsToHouseCount<T extends TransferTaxInput>(
  judgeInput: T,
  effectiveInput: TransferTaxInput,
  parsedRates: ParsedRates,
  generalHouseAcquisitionDate: Date | undefined,
  /** 고지의 중과 문장 게이트용 — 정밀 판정이 있으면 그 산입 주택 수, 없으면 undefined(= 세대 주택 수) */
  surchargeEffectiveHouseCount?: number,
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
  const surcharge = surchargeSentenceApplies(
    effectiveInput,
    parsedRates,
    surchargeEffectiveHouseCount ?? effectiveInput.householdHousingCount,
  );
  const cause =
    restore.cause === "composition"
      ? `세대 구성 요건(「장기임대주택과 그 밖의 1주택」)을 충족하지 못해`
      : `요건을 충족하지 못해`;
  const notice =
    `장기임대주택 거주주택 특례(${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20})가 ${cause} 임대주택 ${restore.units}호를 ` +
    `세대 주택 수에 넣어(${restored}주택) 계산했습니다 — 1세대1주택 비과세·12억 초과분 안분·장기보유특별공제 표2를 적용하지 않습니다` +
    (restore.scenario === "B" ? `(${TRANSFER_RENTAL_HOUSING.PIT_RD_161_1} 안분도 적용하지 않았습니다)` : "") +
    `. 임대주택이 다른 특례(일시적 2주택 등)에 해당하면 임대주택을 포함한 주택 수로 직접 입력해야 판정합니다.` +
    (surcharge
      ? ` 다주택 중과 판정의 주택 수에는 임대주택이 들어가지 않았습니다(중과를 다시 판정하지 않았습니다) — ` +
        (restore.hasRoster
          ? "임대주택을 세대 보유 주택 목록에 「장기임대」로 넣어 다시 계산하세요."
          : "세대 보유 주택 수에 임대주택을 포함해 다시 입력하세요.")
      : "");
  return { input: { ...judgeInput, householdHousingCount: restored }, notice };
}

/**
 * STEP 0.5 ① 요소(영 §167의10①15호·§167의3①13호의 「제155조 … 에 따라 … 제154조제1항이 적용되는 주택」)용 — 비과세와 **같은 규칙**으로
 * 임대 호수를 더한 의제용 주택 수를 돌려준다(결정 #20 G8-1). 불성립이면 §155①·②·조특법 의제가 서지 않는다(조심 2021서1571).
 * A만 — B의 과세 기간분이 중과되는지는 해석을 확보하지 못했다(열지 않는다, 확인 필요).
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
    scenarios: ["A"],
  });
  return restore ? count + restore.units : count;
}

/**
 * D12 — STEP 1 직후: §155⑳ A의 세대 구성이 불성립(`exceeded` — 다른 특례 둘을 겹쳐야 하는 3중첩 등)이면
 * 「임대주택 제외」 전제로 낸 비과세를 거둔다(사전-2016-법령해석재산-0584 · 조심-2021-중-5977).
 *
 * 🔴 종전: STEP 2.5가 ⑳만 끄고 일반 경로로 넘겨, STEP 1이 이미 낸 다른 특례(§155①·③) 비과세가 그대로 남았다 —
 *    호별·거주 요건을 충족하면 STEP 1a 조기반환으로 STEP 2.5에 닿지도 않았다. 판정 메뉴
 *    (`applyRentalHousingVerdict`)와 같은 불변식이다. 구성 판정·사유 고지는 STEP 2.5가 그대로 한다.
 * 🔑 임대 호수를 되돌릴 수 있는 입력(명부에 장기임대 행 없음 · 명부 없음 + 주택 수 1)은 STEP 0.96(`restoreRentalUnitsToHouseCount`)이
 *    판정 **전에** 이미 되돌려 비과세가 서지 않는다 — 여기서는 되돌릴 수 없는 입력(임대 행이 명부에 있음 · 명부 없음 + 주택 수 2 이상)만 거둔다.
 * 🔑 B(§161 안분)는 STEP 0.96이 같은 규칙으로 되돌린다.
 */
export function revokeExemptionOnRentalCompositionExceeded(
  exemption: OneHouseJudgment,
  effectiveInput: TransferTaxInput,
  parsedRates: ParsedRates,
  generalHouseAcquisitionDate?: Date,
): { judgment: OneHouseJudgment; notice?: string } {
  const rhe = effectiveInput.rentalHousingException;
  if (rhe?.applyException !== true || rhe.scenario !== "A") return { judgment: exemption };
  if (!exemption.isExempt && !exemption.isPartialExempt) return { judgment: exemption };
  const composition = resolveRentalResidenceComposition(effectiveInput, parsedRates, generalHouseAcquisitionDate);
  if (composition.status !== "exceeded") return { judgment: exemption };
  return {
    judgment: revokeOneHouseExemption(exemption),
    notice:
      `장기임대주택 거주주택 특례(${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20})가 세대 구성 요건을 충족하지 못해 ` +
      "임대주택을 주택 수에서 뺀 전제의 1세대1주택 비과세와 장기보유특별공제 표2(보유+거주)를 적용하지 않았습니다.",
  };
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
): string | undefined {
  if (!isPrhpScenarioB(effectiveInput) || !(exemption.isExempt || exemption.isPartialExempt)) return undefined;
  return (
    "장기임대주택 거주주택 특례(§155⑳) 요건 미충족 — 임대주택이 주택수에 산입될 수 있어 1세대1주택 전제(주택수 입력)를 재확인하세요. " +
    (exemption.isPartialExempt
      ? "특례의 §161 안분을 적용하지 않고 12억 초과분만 과세하는 일반 1세대1주택 고가주택 규칙으로 계산되었습니다."
      : "일반 과세 경로로 계산되었습니다.")
  );
}
