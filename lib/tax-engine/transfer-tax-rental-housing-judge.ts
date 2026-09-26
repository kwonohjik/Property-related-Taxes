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
import { qualifiesWinWinRental } from "./transfer-tax-exemption-requirements";
import type { TransferTaxInput } from "./types/transfer.types";

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
