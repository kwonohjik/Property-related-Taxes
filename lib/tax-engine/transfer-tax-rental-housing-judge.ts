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
  qualifiesWinWinRental,
  resolveWasRegulatedAtAcquisition,
} from "./transfer-tax-exemption-requirements";
import type { TransferTaxInput } from "./types/transfer.types";
import type { ParsedRates } from "./transfer-tax-helpers";
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
 * §155⑳ 시나리오 A **미충족** — 「임대주택을 주택 수에서 뺀」 입력 전제를 되돌린다 (E-1 한계 G5, 2026-09-29).
 *
 * 영 §155⑳: 「장기임대주택 … 과 그 밖의 1주택을 국내에 소유하고 있는 1세대가 … 거주주택을 양도하는 경우에는 국내에
 * 1개의 주택을 소유하고 있는 것으로 보아 제154조제1항을 적용한다」(MST 286211 실독). 계산기·판정 메뉴 카드는 A를
 * 「임대주택 주택수 제외」로 안내하고 사용자는 거주주택만 센 세대 주택 수 **1**을 넣는다. 특례가 불성립하면 그 「보아」가
 * 없으므로 임대주택은 주택 수에 들어가고 세대는 1주택이 아니다 ⇒ §154① 비과세도, 12억 초과분 안분(법 §95③ ·
 * 영 §160①)도, 표2(영 §159의4 「1세대가 양도일 현재 국내에 1주택(제155조 … 에 따라 1세대 1주택으로 보는 주택을
 * 포함한다)을 보유」)도 적용할 수 없다.
 *
 * 🔴 종전: F3가 STEP 1a 조기반환만 막았다(`isPrhpScenarioAIneligible`). 하류는 여전히 주택 수 1을 봐 과세하면서도
 *    표2 장특(보유+거주)·「1세대1주택 비과세」 사유를 그대로 냈다 — 실측 증여 2026-06-01 결정세액 2,730,000(표2 60%),
 *    같은 사실을 주택 수 2로 넣으면 7,608,000(표1 20%). 비과세 판정 **전에** 주택 수를 되돌려 판정·장특·결과가 한
 *    전제를 보게 한다.
 *
 * 🔑 주택 수가 **정확히 1**일 때만 되돌린다 — 1이면 거주주택만 센 값이 분명하다(임대주택을 넣었다면 최소 2).
 *    2 이상이면 사용자가 임대주택을 이미 센 것일 수 있어 건드리지 않는다(이중 계상 방지 — 종전 동작).
 * 🔑 시나리오 B(직전거주주택보유주택)는 §161① 안분 구조라 별도다 — 종전 고지(주택수 재확인)를 유지한다.
 */
export function restoreRentalUnitsToHouseCount<T extends TransferTaxInput>(
  judgeInput: T,
  effectiveInput: TransferTaxInput,
): { input: T; notice?: string } {
  if (judgeInput.householdHousingCount !== 1 || !isPrhpScenarioAIneligible(effectiveInput)) {
    return { input: judgeInput };
  }
  const units = effectiveInput.rentalHousingException?.rentalUnits.length ?? 0;
  if (units === 0) return { input: judgeInput };
  return {
    input: { ...judgeInput, householdHousingCount: 1 + units },
    notice:
      `장기임대주택 거주주택 특례(${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20}) 요건을 충족하지 못해 임대주택 ${units}호를 ` +
      `세대 주택 수에 넣어(${1 + units}주택) 계산했습니다 — 1세대1주택 비과세·12억 초과분 안분·장기보유특별공제 표2를 ` +
      `적용하지 않습니다. 임대주택이 다른 특례(일시적 2주택 등)에 해당하면 임대주택을 포함한 주택 수로 다시 입력하세요.`,
  };
}

/**
 * D12 — STEP 1 직후: §155⑳ A의 세대 구성이 불성립(`exceeded` — 다른 특례 둘을 겹쳐야 하는 3중첩 등)이면
 * 「임대주택 제외」 전제로 낸 비과세를 거둔다(사전-2016-법령해석재산-0584 · 조심-2021-중-5977).
 *
 * 🔴 종전: STEP 2.5가 ⑳만 끄고 일반 경로로 넘겨, STEP 1이 이미 낸 다른 특례(§155①·③) 비과세가 그대로 남았다 —
 *    호별·거주 요건을 충족하면 STEP 1a 조기반환으로 STEP 2.5에 닿지도 않았다. 판정 메뉴
 *    (`applyRentalHousingVerdict`)와 같은 불변식이다. 구성 판정·사유 고지는 STEP 2.5가 그대로 한다.
 * 🔑 B(§161 안분)는 STEP 2.5 뒤 종전 고지를 유지한다.
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
  // 명부에 장기임대주택 행이 없으면 중과 주택 수에서도 임대주택이 빠진다 — 세액이 과소일 수 있음을 알린다.
  const rentalRowMissing = !(effectiveInput.houses ?? []).some((h) => h.isLongTermRental);
  return {
    judgment: revokeOneHouseExemption(exemption),
    ...(rentalRowMissing
      ? {
          notice:
            `장기임대주택 거주주택 특례(${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20})가 세대 구성 요건을 충족하지 못해 ` +
            "임대주택을 주택 수에서 뺀 전제의 1세대1주택 비과세를 적용하지 않았습니다. 세대 보유 주택 목록에 임대주택이 " +
            "없어 다주택 중과 판정에서도 빠져 있으므로, 임대주택을 목록에 「장기임대」로 넣어 다시 계산하세요.",
        }
      : {}),
  };
}
