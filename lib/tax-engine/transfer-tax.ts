/**
 * 양도소득세 순수 계산 엔진
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음.
 * 모든 세율 데이터는 TaxRatesMap으로 주입받아 순수 함수로 계산.
 *
 * P0-2 원칙: 세율 × 금액 곱셈은 반드시 applyRate() 사용.
 */
import { TRANSFER } from "./legal-codes";
import { buildLossTransferTaxResult } from "./transfer-tax-loss-return";
import { buildNormalTransferTaxResult } from "./transfer-tax-normal-return";
import { applyRate } from "./tax-utils";
import { resolveSurchargeApplication } from "./transfer-tax-surcharge-predicate";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import { runPreCalculationSteps, runSurchargeAndLandSteps } from "./transfer-tax-precalc";
import { resolveInheritedRedevelopmentAcqPrice } from "./inheritance-acquisition-helpers";
// 공개 타입 — ./types/transfer.types 참조
import type {
  TransferTaxInput,
  TransferReduction,
  CalculationStep,
  TransferTaxResult,
} from "./types/transfer.types";
export type { TransferTaxInput, TransferReduction, CalculationStep, TransferTaxResult };
import { runRentalHousingExceptionStep, isPrhpScenarioB, canEarlyReturnPrhp } from "./transfer-tax-rental-housing-step";
import type { New993Result } from "./transfer-reductions/new-99-3";
import {
  resolveIncomeDeduction,
  buildIncomeDeductionStep,
  RATE_SPECIAL_REDUCTION_IDS,
} from "./transfer-reductions/income-deduction-router";
import { runHouseCountExclusionStep } from "./transfer-tax-house-exclusion-step";
import { pushLongTermHoldingSteps } from "./transfer-tax-lthd-steps";

import {
  checkExemption,
  resolveExemptionResidenceMonths,
  calcTransferGain,
  calcLongTermHoldingDeduction,
  calcBasicDeduction,
  applyCommercialBuildingStep,
  presaleRightStartDate,
} from "./transfer-tax-helpers";
import { handleMultiParcelBranch } from "./transfer-tax-multi-parcel-branch";
import { resolveSplitAwareTax, buildCalculatedTaxStep, hasHousingLandExemptExclusion } from "./transfer-tax-split-rate";
import { resolveTaxableGain, buildGainFormula } from "./transfer-tax-taxable-gain";
import { buildExemptEarlyResult } from "./transfer-tax-finalize";
import { isRedevelopmentActive, calculateRedevelopmentTax } from "./transfer-tax-redevelopment";
import type { TransferTaxAcquisitionOptions } from "./transfer-tax-acquisition-override";
export type { TransferTaxAcquisitionOptions } from "./transfer-tax-acquisition-override";
export { parseRatesFromMap } from "./transfer-tax-helpers";
export { calcTax } from "./transfer-tax-rate-calc";

export function calculateTransferTax(
  rawInput: TransferTaxInput,
  rates: TaxRatesMap,
  options?: TransferTaxAcquisitionOptions,
): TransferTaxResult {
  const steps: CalculationStep[] = [];
  const warnings: string[] = []; // F-2: 케이스 12 등 비차단 안내

  // STEP 0 ~ 0.48: 취득가액·입력 정규화 전처리 — 별도 파일로 분리 (800줄 정책, CB-08).
  //   순서가 곧 규약이라 한 덩어리로 옮겼다. `steps`·`warnings`는 참조로 넘겨 그대로 push된다.
  const pre = runPreCalculationSteps(rawInput, rates, options, steps, warnings, calculateTransferTax);
  if (pre.earlyReturn) return pre.earlyReturn;
  const {
    parsedRates,
    input,
    pre1990LandResult,
    inheritedAcquisitionStep,
    carryoverDetail,
    transferBurdenedGiftBreakdown,
    hceGeneralHouseAcquisitionDate,
  } = pre;
  const workingInput = pre.workingInput;


  // STEP 0.45~0.62: 중과·비사업용 판정 전처리 — 별도 파일로 분리 (800줄 정책, CB-08)
  const surchargeAndLand = runSurchargeAndLandSteps(input, workingInput, parsedRates, steps);
  const { surchargeExclusionByReduction, multiHouseSurchargeResult, nonBusinessLandJudgment } =
    surchargeAndLand;
  // effectiveInput만 후속 STEP(0.35 환산 등)에서 파생 입력으로 재할당된다.
  let effectiveInput = surchargeAndLand.effectiveInput;

  // STEP 0.65: 재개발/재건축 분기 — 시행령 §166. STEP 1: 비과세 판단
  if (
    isRedevelopmentActive(
      effectiveInput.propertyType,
      effectiveInput.redevelopment,
      // 승계조합원 입주권은 §166①의 「조합에 기존건물을 제공하고 취득한 조합원」이 아니다 —
      // 일반 분기(§97①1호 가목)로 내려보낸다. 근거는 `redevelopment-dispatch.ts` 주석.
      effectiveInput.isSuccessorRightToMoveIn,
    )
  ) {
    // 상속 종전자산: §163⑨ 상속개시일 평가액이 확인되면 취득가액이 "확인 가능"하므로 §166③ 환산·
    // §163⑥ 개산공제를 배제하고 실가(상속평가액)를 종전자산 취득가액으로 사용한다(§166③은 취득가액
    // 확인 불가 시에만 적용). 미확인 시 override 미발동 → 현행 §166③ 유지.
    //
    // 🔴 **`options.acquisitionOverride`가 있으면 발동하지 않는다** (R-15 · 2026-08-23).
    //
    //   `resolveAcquisitionOverride`(STEP 0.46)의 계약은 「STEP 2 결정 결과를 무시하고 본 값 강제」다.
    //   그런데 이 블록이 그 뒤에 돌면서 취득가액을 §163⑨ 평가액으로 **되돌리고 있었다**.
    //
    //   실제 발동 경로는 **가업상속공제 §97의2④**다 — `applyFamilyBusinessCgtStep`이
    //   `{ acquisitionOverride: imputedAcquisitionPrice }`로 재귀 호출하는데, 그 재귀 입력에는
    //   `inheritedAcquisition`이 그대로 남아 있고 `acquisitionCause`도 `"inheritance"`라 여기 걸린다.
    //
    //   실측 (재개발APT · 양도 9억 · 피상속인 취득가 5억 · 상속개시일 평가액 1억 · 적용률 0.5):
    //
    //   | | 의제세액 | 일반세액 |
    //   |---|---|---|
    //   | `inheritedAcquisition` 없음 | 135,133,664 | 211,178,735 |
    //   | 있음 (종전) | **211,178,735** | 211,178,735 |  ← 의제 산식이 일반과 같아졌다
    //
    //   의제세액 **76,045,071원 과대**. ⑤ UI가 assetKind 분기 없이 렌더되고 ④⑫⑭ 배관도 모두
    //   있어 **도달 가능한 활성 결함**이었다(⑧ validate 통과 실측).
    //
    //   법령상으로도 override가 이긴다 — 「소득세법」 §97의2④는 **법률 단서**로
    //   「가업상속공제가 적용된 자산 … **다만, 취득가액은 다음 각 호의 금액을 합한 금액으로 한다**
    //    (1호 피상속인 취득가액 × 적용률 + 2호 상속개시일 자산가액 × (1−적용률))」이라고 정한다.
    //   §163⑨은 시행령이고 「§97①1호 가목을 적용할 때」의 규정이라 이 특례를 덮을 수 없다.
    //
    // 📌 **override가 없을 때 이 블록은 no-op이다** (코드 분석 · R-15).
    //   `resolveInheritedRedevelopmentAcqPrice`가 반환하는 값은 STEP 0.45가 이미
    //   `input.acquisitionPrice`에 넣은 값과 항상 같다:
    //     · post-deemed → `r.acquisitionPrice` 그대로
    //     · pre-deemed  → `max(reported, sec164)` = `clauseA`이고,
    //       `calcPreDeemed`의 `acquisitionPrice`도 `clauseA > 0 ? clauseA : converted`다.
    //       `selectedMethod === "converted"`는 `clauseA === 0`일 때뿐이라 그때는 여기서 null을 반환한다.
    //   그래서 뮤테이션으로 이 블록을 통째로 무력화해도 회귀가 0건이었다(R-10 M-4).
    //   ⛔ 그렇다고 **지우지는 말 것** — 위 override 가드가 이 블록의 유일한 실효 동작이고,
    //      `resolveInheritedRedevelopmentAcqPrice`의 「채택 여부가 아니라 확인 가능 여부」 계약을
    //      명시적으로 표현하는 지점이기도 하다.
    let redevInput = effectiveInput;
    if (
      effectiveInput.acquisitionCause === "inheritance" &&
      options?.acquisitionOverride === undefined
    ) {
      const inhAcqPrice = resolveInheritedRedevelopmentAcqPrice(inheritedAcquisitionStep);
      if (inhAcqPrice !== null) {
        redevInput = { ...effectiveInput, acquisitionPrice: inhAcqPrice, useEstimatedAcquisition: false };
      }
    }
    /**
     * 🔴 **§89①3호가목 비과세 판정 — 2026-08-25 추가 (E3-01).**
     *
     * 이 분기는 STEP 1(`checkExemption`)보다 **먼저** return하므로 비과세 판정을 통째로
     * 건너뛰고 있었다. 그런데 `calculateRedevelopmentTax`는 §95③ **12억 초과 안분만** 구현해
     * 두어, 1세대1주택 요건을 갖춘 완공 신축주택이 양도가액 **12억 이하**면 전액 과세되고
     * 12억을 1원 넘기면 안분으로 세액이 0에 수렴하는 **불연속**이 생겼다
     * (실측: 12억 98,241,000원 → 12억+1원 0원).
     *
     * ⚠️ **subject="apt"(완공 신축주택) 전용이다.** 조합원입주권(subject="right") 양도의
     *    비과세는 §89①**4호**이고 그 경로는 `applyOneRightExemption`이 이미 담당한다 —
     *    여기서 §89①3호를 함께 태우면 근거가 다른 두 규정이 겹친다.
     *
     * 주택수 제외 스텝을 함께 태우는 이유: §99의4·§98의9·감면주택 제외가 반영된
     * `exemptionJudgeInput`이라야 일반 주택 경로와 **같은 판정**이 나온다. steps에도 그대로
     * 쌓여 근거가 보인다(일반 경로와 동일한 additive 동작).
     */
    /** STEP 0.9+0.95 산출물 — IIFE 안에서 채워 `calculateRedevelopmentTax`로 넘긴다 (D4-08). */
    let redevHouseExclusion:
      | Pick<TransferTaxResult, "new994Detail" | "unsold989Detail" | "specialHouseExclusionDetail">
      | undefined;
    const redevExemption =
      redevInput.redevelopment?.subject === "apt" &&
      // ⚠️ **청산금 「수령」 축은 제외한다.** 그 경우 양도 대상에 종전 부동산 일부(청산금 상당분)가
      //    섞이고, 비과세 판정 축도 「양도일 현재 신축주택」이 아니라 **「관리처분 인가일 현재
      //    종전주택이 §89①3호가목 요건을 충족했는지」**다(서면-2016-법령해석재산-2705).
      //    그 사실은 `exemptionEligibleAtApproval` 자기선언이 담고 있고, 전용 규칙
      //    `applySettlementExemption`(Step A.6)이 이미 그 축으로 판정한다.
      //    여기서 양도일 기준 판정을 겹치면 **근거가 다른 두 규정이 충돌**한다
      //    (실측: 사례 46 — 사용자가 「인가일 현재 요건 미충족」을 선언했는데 양도일 기준으로는
      //     충족이라 전액 비과세가 되어 안내와 계산이 어긋났다).
      redevInput.redevelopment.settlementDirection !== "receive"
        ? (() => {
            const {
              exemptionJudgeInput,
              new994Detail: redevNew994,
              unsold989Detail: redevUnsold989,
              specialHouseExclusionDetail: redevSpecialHouse,
            } = runHouseCountExclusionStep(redevInput, steps, hceGeneralHouseAcquisitionDate);
            // 🔴 종전에는 `exemptionJudgeInput`만 꺼내고 나머지 셋을 버렸다 — 결과에 실리지 않아
            //   §99의4⑥ 3년 미보유 **추징 경고**(`clawbackWarning`)·농어촌주택 보유기간·
            //   §98의9 `dualExclusionWarning`이 통째로 사라졌다(코드리뷰 D4-08).
            //   적격 미달(isEligible=false)이면 step조차 push되지 않아 근거가 아예 안 남는다.
            //   실측: 같은 사실관계에서 §99의4가 세액을 111,228,857 → 0으로 바꾸는데 카드가 없다.
            //   ⚠️ 바로 아래 주석이 기록한 `multiHouseSurchargeResult`·`carryoverDetail`에 이은
            //     **같은 결함의 세 번째 재발**이다 — 조기이탈 분기가 상류 산출물을 버리는 패턴.
            redevHouseExclusion = {
              new994Detail: redevNew994,
              unsold989Detail: redevUnsold989,
              specialHouseExclusionDetail:
                redevSpecialHouse.entries.length > 0 ? redevSpecialHouse : undefined,
            };
            /**
             * `checkExemption`의 유일한 자산 게이트는 `propertyType !== "housing"`이다
             * (`transfer-tax-exemption.ts:613` — 파일 전체에서 `propertyType`을 쓰는 곳은 그 한 줄뿐).
             * 재개발로 **완공된 신축주택**은 소득세법 §94①1호 「건물」이자 §89①3호가목의 「주택」이므로
             * 그 게이트를 통과해야 한다. `redevelopment_apt`는 이 저장소가 §166 분기 라우팅을 위해
             * 쓰는 **내부 자산종류 태그**이지 법령상 자산 구분이 아니다.
             * ⇒ 판정 경계에서만 `housing`으로 번역한다(게이트 자체를 넓히면 §166 데이터가 없는
             *   다른 경로까지 함께 바뀌므로 이 배치의 범위를 넘는다).
             */
            /**
             * 🔑 **승계조합원 신축주택의 취득시기는 준공일이다** — 「소득세법 시행령」 §162①4호
             * 「자기가 건설한 건축물에 있어서는 **사용승인서 교부일**」(+ 사전-2019-법령해석재산-0649).
             * 원조합원(종전주택 제공)은 소유권의 연장이라 종전주택 취득일이 그대로 취득시기지만,
             * 승계조합원은 입주권을 취득한 것이라 신축주택 취득시기가 따로 정해진다.
             *
             * 엔진은 이미 이 규칙을 쓰고 있다 — `runSuccessorMember`의 보유기간·`§104②` 세율 기산
             * 모두 `completionDate`다. 비과세(§154① 보유 2년) 판정만 원래 취득일을 쓰면 **한 계산
             * 안에서 취득시기가 두 개**가 된다(실측: 사례 48 — 준공 2.5개월인데 비과세로 판정됐다).
             */
            const exemptionAcquisitionDate =
              redevInput.redevelopment?.isSuccessorMember === true &&
              redevInput.redevelopment.completionDate
                ? redevInput.redevelopment.completionDate
                : exemptionJudgeInput.acquisitionDate;
            return checkExemption(
              {
                ...exemptionJudgeInput,
                propertyType: "housing",
                acquisitionDate: exemptionAcquisitionDate,
              },
              parsedRates.oneHouseSpecialRules,
              presaleRightStartDate(parsedRates),
            );
          })()
        : undefined;

    // 🔴 종전에는 `multiHouseSurchargeResult`를 **넘기지 않았다** — STEP 0.5(`:219`)에서
    //    판정해 놓고 이 분기가 버렸다. 형제 경로 둘(`buildExemptEarlyResult` ·
    //    `handleMultiParcelBranch`)은 처음부터 넘기고 있었다.
    //
    // 🔴 `carryoverDetail`도 같은 이유로 버려지고 있었다 (E3-06) — STEP 0.475가 §97의2
    //    A/B를 판정해 `workingInput`까지 교체해 놓고 그 근거가 결과에 실리지 않아
    //    ① 결과 화면 A/B 비교 카드 미표시 ② 다건 §97의2②3호 신고단위 비교에서 자산 누락
    //    ③ 신고서 표시 취득가액이 수증자 것으로 되돌아감 — 셋이 함께 발생했다.
    return calculateRedevelopmentTax(redevInput, parsedRates, steps, multiHouseSurchargeResult, {
      exemptionResult: redevExemption,
      carryoverDetail,
      warnings,
      houseCountExclusion: redevHouseExclusion,
    });
  }

  // STEP 0.9 + 0.95: 주택수 제외(§99의4·§98의9·보유 감면주택·상속주택) → 비과세 판정용 유효 주택수 산정.
  // 800줄 정책 분리 — runHouseCountExclusionStep (transfer-tax-house-exclusion-step.ts).
  const { exemptionJudgeInput, new994Detail, unsold989Detail, specialHouseExclusionDetail } =
    runHouseCountExclusionStep(effectiveInput, steps, hceGeneralHouseAcquisitionDate);

  const exemptionResult = checkExemption(
    exemptionJudgeInput,
    parsedRates.oneHouseSpecialRules,
    presaleRightStartDate(parsedRates),
  );

  /**
   * §89② — 세대가 주택과 조합원입주권·분양권을 함께 보유하는데, 단서의 예외(시행령 §156의2③~⑪ ·
   * §156의3②~⑧) 중 **판정에 필요한 사실을 입력받을 경로가 없는 항**이 남아 있는 경우.
   *
   * 배제를 켜면 그 예외에 해당하는 세대가 법 근거 없이 불리해지므로 종전 동작을 유지하고,
   * 대신 어느 항을 직접 확인해야 하는지 그대로 알린다(자동 판정 대신 **판정 불가 고지** —
   * §155⑦3호 귀농주택 경고와 같은 층위다).
   */
  /**
   * §156의2⑬ · §156의3⑩ **사후관리(추징)** — 자기선언으로 인정한 예외는 요건이 깨지면
   * 「사유가 발생한 날이 속하는 달의 말일부터 **2개월 이내**에 … 신고·납부」 대상이다.
   *
   * 🔴 2026-08-26 신설: `transfer-tax-exemption.ts`의 E-5 주석이 「사후관리(§156의2⑬) 경고는
   *    결과 warnings에서 별도 처리」라고 적어 두었지만 **그 경고가 없었다**(주석·구현 드리프트).
   *    ④(Phase 2 신설)와 ⑤(기존 대체주택)를 함께 배선한다.
   */
  const clause2Exception = exemptionResult.article89Clause2?.exception;
  if (
    exemptionResult.article89Clause2?.status === "exception_met" &&
    // 🔑 추징 리스크는 **특례가 실제로 적용돼 비과세를 받은 경우**에만 있다.
    //    ⑤는 선언만으로 `exception_met`이 되고 요건 판정은 E-5가 하므로 그 결과를 함께 본다.
    (exemptionResult.isExempt || exemptionResult.isPartialExempt) &&
    (clause2Exception === "소득세법 시행령 §156의2 ④" ||
      clause2Exception === "소득세법 시행령 §156의3 ③" ||
      clause2Exception === "소득세법 시행령 §156의2 ⑤")
  ) {
    /**
     * §156의2⑬은 「**제7항·제10항 또는 제11항의 규정에 따라** 제4항 또는 제5항을 적용받은
     * 1세대를 **포함한다**」라 준용 경로도 추징 대상이다 ⇒ 준용 근거를 함께 알린다.
     */
    const via = exemptionResult.article89Clause2?.viaArticle;
    warnings.push(
      `1세대1주택 비과세를 「${clause2Exception}${via ? ` (${via} 준용)` : ""}」의 자기선언 요건(신축주택 완성 후 3년 이내 ` +
        "세대전원 이사 + 1년 이상 계속 거주)으로 인정했습니다. 그 요건을 갖추지 못하게 되면 " +
        "「소득세법 시행령」 §156의2⑬(분양권은 §156의3⑩)에 따라 사유 발생일이 속하는 달의 " +
        "말일부터 2개월 이내에 이 특례를 적용받지 않았을 경우의 세액을 신고·납부해야 합니다(추징).",
    );
  }

  if (exemptionResult.article89Clause2?.status === "undetermined") {
    warnings.push(
      "세대가 주택과 조합원입주권·분양권을 함께 보유한 상태에서 그 주택을 양도했습니다. " +
        "「소득세법」 §89②은 이 경우 1세대1주택 비과세(§89①3호)를 적용하지 않되, 시행령이 정하는 " +
        "예외에 해당하면 그대로 적용합니다. 아래 조문의 요건 충족 여부를 직접 확인하세요 — " +
        "이 계산에는 §89② 배제를 적용하지 않았습니다: " +
        (exemptionResult.article89Clause2.openArticles ?? []).join(" · "),
    );
  }

  // §155⑦3호 귀농주택 — ⑪(귀농 후 최초 1개 일반주택 한정)·⑫(귀농일부터 3년 영농·거주 사후관리)는
  //   과거·미래 양도 이력이 있어야 판정할 수 있어 엔진이 결론 낼 수 없다. 자동 판정 대신 경고로 노출한다
  //   (자동 안분 fallback 금지 원칙과 다른 층위 — 임의 배분이 아니라 **판정 불가 고지**다).
  if (exemptionResult.exemptReason?.includes("§155⑦3호") ) {
    warnings.push(
      "귀농주택 특례(§155⑦3호) — ⑪ 귀농 후 **최초로 양도하는 1개** 일반주택에만 적용됩니다. " +
        "또한 §155⑫에 따라 귀농일부터 3년 이상 영농·영어에 종사하지 않거나 그 기간 거주하지 않으면 " +
        "사유 발생일이 속하는 달의 말일부터 2개월 이내에 감면세액을 신고·납부해야 합니다(추징).",
    );
  }

  // STEP 1a: 전액 비과세 조기 반환. §155⑳ B(→STEP 2.5 §161 안분)·A eligibility 미충족(→STEP 2.5 정상과세)은 억제.
  // G-2·G-3: 부수토지 중 배율 초과분(비사업용 토지)·보유 2년 미만분은 비과세 대상이 아니다 —
  //      조기 반환하면 과세할 토지분이 사라지므로 정상 경로로 흘려 STEP 3에서 분리한다(§5.2·§5.4).
  if (exemptionResult.isExempt && canEarlyReturnPrhp(effectiveInput) && !hasHousingLandExemptExclusion(effectiveInput)) {
    steps.push({
      label: "1세대1주택 비과세",
      formula: exemptionResult.exemptReason ?? "비과세",
      amount: 0,
      legalBasis: TRANSFER.ONE_HOUSE_EXEMPT,
    });
    return buildExemptEarlyResult({
      input,
      effectiveInput,
      steps,
      exemptReason: exemptionResult.exemptReason,
      new994Detail,
      unsold989Detail,
      specialHouseExclusionDetail:
        specialHouseExclusionDetail.entries.length > 0 ? specialHouseExclusionDetail : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      multiHouseSurchargeResult,
      nonBusinessLandJudgment,
      pre1990LandResult,
      carryoverDetail,
      inheritedAcquisitionStep,
    });
  }

  // STEP 0.35: 상업용건물·오피스텔 환산취득가 (소령 §164⑥ + §176조의2②2호 + §164⑨ 수용 특례).
  // 성공 시 effectiveInput을 실가 경로로 교체 (helpers로 추출 — 800줄 정책).
  const cbApplied = applyCommercialBuildingStep(effectiveInput);
  effectiveInput = cbApplied.effectiveInput;
  const cbStep = cbApplied.cbStep;

  // STEP 1.5: 다필지 분리 계산 (환지·합병 등)
  const mpBranchResult = handleMultiParcelBranch(
    { rawInput, effectiveInput, input, parsedRates, multiHouseSurchargeResult, pre1990LandResult, carryoverDetail, options },
    steps,
  );
  if (mpBranchResult) return mpBranchResult;
  // STEP 2: 양도차익 계산
  const { gain: rawGain, usedEstimated, estimatedBase, estimatedDeduction, expenses: appliedExpenses, splitDetail, swapApplied: gainSwapApplied, swapComparison: gainSwapComparison, expropriationValuationDetail: gainExprDetail, auctionValuationDetail, housingExpropriationValuationDetail } = calcTransferGain(effectiveInput);
  // 상가(CB) swap은 STEP 0.35 재구성 지점(단건 엔진 밖)에서 판정 → cbStep에서 result로 승격.
  // (calcTransferGain은 CB를 실가 모드로 보므로 swapApplied를 내지 않는다.)
  const swapApplied = gainSwapApplied || cbStep?.swapApplied;
  const swapComparison = gainSwapComparison ?? cbStep?.swapComparison;
  // 상가(CB) 경로는 STEP 0.35에서 useEstimatedAcquisition=false로 교체돼 calcTransferGain이
  // 특례 detail을 내지 않는다 → cbStep의 산출근거를 result로 승격(§164⑨ CB 배선, D16).
  const expropriationValuationDetail = gainExprDetail ?? cbStep?.expropriationValuationDetail;
  // 소유자 분리: 본인 신고분 양도차익만 추출 (소령 §166⑥, §168②)
  // splitDetail이 있고 selfOwns !== "both" 이면 본인 소유 파트의 gain만 사용
  const selfOwns = effectiveInput.selfOwns ?? "both";
  const ownerRawGain = splitDetail && selfOwns !== "both"
    ? (selfOwns === "building_only" ? splitDetail.building.gain : splitDetail.land.gain)
    : rawGain;

  // STEP 2a: 손실 → 0 (aggregate 엔진에서 skipLossFloor=true 시 음수 허용 — §102② 통산용)
  const transferGain = input.skipLossFloor ? ownerRawGain : Math.max(0, ownerRawGain);
  // 양도차익 산출근거 — 파생 입력(effectiveInput) 기준 통일. 경비는 실제 적용 필요경비(appliedExpenses).
  // (원본 input 기준 시 CB 환산은 취득가·개산공제가 0, §97② swap은 개산공제가 실제 경비와 어긋나 산식 불일치.)
  const gainFormula = buildGainFormula({
    swapApplied,
    useEstimatedAcquisition: effectiveInput.useEstimatedAcquisition,
    transferPrice: effectiveInput.transferPrice,
    acquisitionPrice: effectiveInput.acquisitionPrice,
    estimatedBase,
    appliedExpenses,
  });
  if (selfOwns !== "both" && splitDetail) {
    const selfLabel = selfOwns === "building_only" ? "건물" : "토지";
    steps.push({
      label: `본인 신고분: ${selfLabel} (소령 §166⑥, §168②)`,
      formula: `일괄양도가액 ${input.transferPrice.toLocaleString()} 중 ${selfLabel} 분만 신고 — 나머지는 타인 소유`,
      amount: transferGain,
      legalBasis: TRANSFER.TRANSFER_GAIN,
    });
  }
  steps.push({
    label: "양도차익 계산",
    formula: gainFormula,
    amount: transferGain,
    legalBasis: TRANSFER.TRANSFER_GAIN,
  });

  // 양도 손실(또는 0): 가산세는 §114조의2 ②에 따라 산출세액 없어도 부과.
  // aggregate 엔진에서 skipLossFloor=true로 호출 시 음수 차익도 이 분기로 흡수된다.
  // 결과 조립은 `transfer-tax-loss-return.ts` (파일 크기 정책 분리 — 동작 무변경).
  if (transferGain <= 0) {
    return buildLossTransferTaxResult({
      input,
      effectiveInput,
      estimatedBase,
      steps,
      warnings,
      // D4-08 — 비과세 조기반환(`buildExemptEarlyResult`)은 처음부터 넘기고 있었는데
      //   차손 경로만 빠져 있었다. 산출세액이 0이어도 §99의4⑥ 추징 경고는 남아야 한다.
      new994Detail,
      unsold989Detail,
      specialHouseExclusionDetail:
        specialHouseExclusionDetail.entries.length > 0 ? specialHouseExclusionDetail : undefined,
      transferGain,
      usedEstimated,
      exemptionResult,
      transferBurdenedGiftBreakdown,
      multiHouseSurchargeResult,
      nonBusinessLandJudgment,
      pre1990LandResult,
      carryoverDetail,
      inheritedAcquisitionStep,
      cbStep,
      splitDetail,
    });
  }

  // STEP 2.5: 장기임대주택 보유자 거주주택 비과세 특례 (소령 §155⑳ + §161)
  // gain 계산 완료 후 실행. applied=true 시 특례 결과로 즉시 반환(STEP 3 이후 생략),
  // false 시 미적용 사유만 steps에 기록하고 일반 경로 계속. (구현: transfer-tax-rental-housing-step.ts)
  if (effectiveInput.rentalHousingException?.applyException) {
    const rheResult = runRentalHousingExceptionStep({
      effectiveInput,
      input,
      transferGain,
      usedEstimated,
      estimatedBase,
      estimatedDeduction,
      parsedRates,
      multiHouseSurchargeResult,
      splitDetail,
      steps,
    });
    if (rheResult) return rheResult;
    // B + applied=false: 특례 부존재면 임대주택 주택수 산입으로 "1채" 전제 무효 가능 — 침묵 비과세 소급 금지.
    if (isPrhpScenarioB(effectiveInput) && exemptionResult.isExempt) {
      warnings.push("장기임대주택 거주주택 특례(§155⑳) 요건 미충족 — 임대주택이 주택수에 산입될 수 있어 1세대1주택 전제(주택수 입력)를 재확인하세요. 일반 과세 경로로 계산되었습니다.");
    }
  }

  // STEP 3: 과세 양도차익 (12억 초과분 안분 — 부분과세인 경우)
  // 우선순위: burdenedGiftDenominator (부담부증여 — 해석 B) > totalPropertyTransferPrice (지분) > transferPrice (단독)
  // F-1 (2026-05-12): effectiveInput 사용 — STEP 0.48 burdenedGiftDenominator 오버라이드 반영.
  const taxableGain = resolveTaxableGain({
    effectiveInput,
    splitDetail,
    transferGain,
    isExempt: exemptionResult.isExempt,
    isPartialExempt: exemptionResult.isPartialExempt,
    steps,
  });

  // 중과세 여부 판단 (장기보유공제·세액 결정에 공통 사용)
  // houses[] 제공 시: determineMultiHouseSurcharge 결과 사용
  // 미제공 시: householdHousingCount + isRegulatedArea 플래그 기반 (하위 호환)
  // 입력 참조는 effectiveInput으로 통일 — 최종 파생 입력(carryover·부담부·NBL·상업용 반영).
  // 현재 8필드(propertyType·지역·주택수·1주택·거주·기본공제)는 파생 STEP이 불변이라 동치이나,
  // 향후 파생 STEP이 주택수·지역을 바꿔도 silent 오류가 없도록 effectiveInput 고정.
  // 술어는 `transfer-tax-surcharge-predicate.ts` **단일 소스**다 — 종전에는 이 자리와
  // `calcTax`(rate-calc)에 같은 판정이 복제돼 있었고, 두 복제본 모두 `redevelopment_apt`를
  // 빠뜨려 재개발 신축주택에 중과가 통째로 미적용됐다(§104⑦·영 §167의3①12의2).
  const { isSurchargeCase, isSuspended: suspendedResult } = resolveSurchargeApplication(
    {
      propertyType: effectiveInput.propertyType,
      isRegulatedArea: effectiveInput.isRegulatedArea,
      householdHousingCount: effectiveInput.householdHousingCount,
      transferDate: input.transferDate,
    },
    multiHouseSurchargeResult,
    parsedRates.surchargeSpecialRules,
  );

  // STEP 4: 장기보유특별공제 (장기임대 특례율 포함 — §97의3·§97의4는 L-2' 블록)
  // §99의4 eligible 시 exemptionJudgeInput(유효 주택수) 전달 — 표2 판정도 §89①3호 의제 체인
  // (소령 §159의4 "그 밖의 규정에 따라 1세대 1주택으로 보는 주택 포함"). 중과 isSurchargeCase는 원본(R-D).
  /**
   * 「소득세법 시행령」 §159의4 표2 대상 축 — **§155 각 항 의제를 포함한 「1주택」** (2026-08-13 F10).
   *
   * `runHouseCountExclusionStep`이 §99의4·§98의9·감면주택·§155②③ 상속주택을 이미 주택수에서
   * 차감하지만, §155①(일시적 2주택)·④⑤(합가)·⑦(농어촌)·⑧(수도권 밖 부득이)은 주택수를 깎지 않고
   * `checkExemption` 내부 분기로만 판정한다. 그래서 12억 초과 고가주택 과세분에 표1(최대 30%)이
   * 적용됐다(실측: 표1 16% 총세액 23,633,500 ↔ 표2 64% 총세액 5,838,642).
   *
   * 술어는 **`checkExemption`의 판정 결과 하나**다 — 주택수를 깎는 방식은 `checkExemption`이
   * `householdHousingCount === 2`로 의제 분기를 게이팅하므로 의제 판정 자체를 도달 불가로 만든다.
   * 표2 **대상** 축에만 쓰고 중과·12억 안분 축은 불변이다.
   */
  const deemedOneHouseBy155 = exemptionResult.deemedOneHouseBy155 === true;
  // eslint-disable-next-line prefer-const -- deduction·rate는 STEP 4.05 §98의2 특칙에서 재할당
  let { deduction: longTermHoldingDeduction, rate: longTermHoldingRate, holdingPeriod, rental97LthdDetail, usageConversionDetail, exclusionReason: lthdExclusionReason, fbLthdFormula, appurtenantTable1Applied } =
    calcLongTermHoldingDeduction(taxableGain, exemptionJudgeInput, parsedRates.longTermHoldingRules, isSurchargeCase, suspendedResult, parsedRates.longTermRentalRules, splitDetail, deemedOneHouseBy155);
  // §154⑧3호: 표2 "대상 판정"용 통산 거주연수 (동일세대 상속 통산 반영) — rate calc와 동일 exemptionJudgeInput.
  // 거주분 공제율 표시는 실거주(residenceYearsForStep) 유지 — 대상판정/공제율 분리 (rate↔display drift 방지).
  const table2ResidenceYearsForStep = Math.floor(resolveExemptionResidenceMonths(exemptionJudgeInput) / 12);
  // STEP 4.05: §98의2 특칙 — 장특 = 양도차익 × §95② 표2 보유기간별 공제율 강제 (법 ①1호, P4).
  // 적격 선판정은 STEP 0.45 (중과 배제 5호 열거 — 동일 신호). 1세대1주택 표2(보유+거주)는
  // ①의 "각 표 외의 부분 본문 불구" 범위 밖 — 특례 적용 시 유지 (항상 ≥ 표2 보유 단독).
  let lthd982Applied = false;
  if (surchargeExclusionByReduction.appliedId === "unsold_98_2") {
    // 표2 대상 축은 위 STEP 4와 **같은 술어**를 쓴다 — 여기만 실제 주택수를 보면 §155 의제
    // 자산에서 「STEP 4는 표2인데 §98의2 특칙은 표2가 아니라고 본다」는 세 번째 진실이 생긴다.
    const isOneHouseSpecial982 =
      exemptionJudgeInput.isOneHousehold &&
      (exemptionJudgeInput.householdHousingCount === 1 || deemedOneHouseBy155) &&
      table2ResidenceYearsForStep >= 2 &&
      longTermHoldingDeduction > 0;
    if (!isOneHouseSpecial982) {
      const rate982 = holdingPeriod.years >= 3 ? Math.min(holdingPeriod.years * 0.04, 0.4) : 0;
      longTermHoldingDeduction = applyRate(taxableGain, rate982);
      longTermHoldingRate = rate982;
      lthd982Applied = true;
    }
  }
  pushLongTermHoldingSteps({
    steps,
    taxableGain,
    holdingPeriod,
    longTermHoldingRate,
    longTermHoldingDeduction,
    residenceYearsForStep: Math.floor(effectiveInput.residencePeriodMonths / 12),
    table2ResidenceYearsForStep,
    isOneHousehold: exemptionJudgeInput.isOneHousehold,
    // 표시 축도 계산 축과 맞춘다 — §159의4 의제 1세대1주택은 표2를 적용받으므로 산식 문구도
    // 표2(보유 4% + 거주 4%)여야 한다. 어긋나면 「공제율 64%인데 문구는 표1」 drift가 난다.
    householdHousingCount: deemedOneHouseBy155 ? 1 : exemptionJudgeInput.householdHousingCount,
    lthd982Applied,
    lthdExclusionReason,
    // §95⑤ 적용 시 보유분을 표1+표2로 나눠 표시한다 — 없으면 종전 표2 문구 그대로.
    usageConversionDetail,
    // §95④ 후단(가업상속) 적용 시 공제율 분해 문구로 대체한다.
    fbLthdFormula,
    appurtenantTable1Applied,
  });

  // STEP 4.5: 양도소득금액 = 양도차익 − 장기보유특별공제 (소득세법 §95 ①)
  const transferIncomeBefore993 = Math.max(0, taxableGain - longTermHoldingDeduction);
  steps.push({
    label: "양도소득금액",
    formula: `양도차익 ${taxableGain.toLocaleString()} - 장기보유특별공제 ${longTermHoldingDeduction.toLocaleString()}`,
    amount: transferIncomeBefore993,
    legalBasis: TRANSFER.LONG_TERM_DEDUCTION,
  });

  // STEP 4.6: 차감형 감면(§99의3·§99·§98의8) — 양도소득금액 차감 방식 (income-deduction-router)
  // 5년 내 = 발생분 전액(§98의8은 50%) / 5년 후 = 기준시가 안분. 농특세는 finalize 2-pass.
  let transferIncome = transferIncomeBefore993;
  const incomeDeduction = resolveIncomeDeduction(input.reductions, {
    transferDate: input.transferDate,
    acquisitionDate: input.acquisitionDate,
    assetContractDate: input.assetContractDate,
    transferPrice: input.transferPrice,
    // 고가주택 가액 요건은 물건 전체 기준 — §89 12억 안분(:447-465)과 같은 소스를 쓴다.
    totalPropertyTransferPrice: input.totalPropertyTransferPrice,
    standardPriceAtTransfer: input.standardPriceAtTransfer,
    transferIncome: transferIncomeBefore993,
  });
  const new993PreliminaryResult: New993Result | undefined = incomeDeduction.new993Detail;
  if (incomeDeduction.appliedId) {
    transferIncome = Math.max(0, transferIncomeBefore993 - incomeDeduction.reducible);
  }
  if (incomeDeduction.stepLabel) {
    steps.push(buildIncomeDeductionStep(incomeDeduction, transferIncomeBefore993, transferIncome));
  }

  // STEP 5: 기본공제 (aggregate 엔진에서 호출 시 skipBasicDeduction=true로 스킵)
  const basicDeduction = effectiveInput.skipBasicDeduction
    ? 0
    : calcBasicDeduction(
        taxableGain,
        longTermHoldingDeduction,
        effectiveInput.annualBasicDeductionUsed,
        effectiveInput.isUnregistered,
        parsedRates.basicDeductionRules,
      );
  if (!effectiveInput.skipBasicDeduction) {
    steps.push({
      label: "기본공제",
      formula: `연 한도 ${parsedRates.basicDeductionRules.annualLimit.toLocaleString()} - 기사용 ${effectiveInput.annualBasicDeductionUsed.toLocaleString()}`,
      amount: basicDeduction,
      legalBasis: TRANSFER.BASIC_DEDUCTION,
    });
  }

  // STEP 6: 과세표준 = 양도소득금액 − 기본공제 (소득세법 §92 — 원 단위, 절사 규정 없음)
  const taxBase = Math.max(0, transferIncome - basicDeduction);
  steps.push({
    label: "과세표준",
    formula: `양도소득금액 ${transferIncome.toLocaleString()} - 기본공제 ${basicDeduction.toLocaleString()}`,
    amount: taxBase,
    legalBasis: TRANSFER.TAX_BASE_CALC,
  });

  // STEP 7: 산출세액
  // selfOwns="land_only" 시 단기/장기 세율 판정은 토지 취득일 기준 (소령 §166⑥)
  // P3 특칙: §98의3④·§98의5③·§98의6③ — 적격 시 단기세율(§104①2·3호) 배제 (세율 §104①1호 강제)
  const rateSpecialActive =
    incomeDeduction.eligibleId !== undefined &&
    RATE_SPECIAL_REDUCTION_IDS.includes(incomeDeduction.eligibleId);
  const taxRateInputBase = selfOwns === "land_only" && effectiveInput.landAcquisitionDate
    ? { ...effectiveInput, acquisitionDate: effectiveInput.landAcquisitionDate }
    : effectiveInput;
  // P5: §98①1호 — 세율 20% 단일 강제 (§104① 불구)
  const flatRate20Active = incomeDeduction.eligibleId === "unsold_98";
  const taxRateInput = flatRate20Active
    ? { ...taxRateInputBase, forceFlatRate20: true }
    : rateSpecialActive
      ? { ...taxRateInputBase, suppressShortTermRate: true }
      : taxRateInputBase;
  // 토지·건물 취득일이 다른 split 자산은 파트별 세율 + §104⑤ 비교과세 (transfer-tax-split-rate.ts)
  const taxResult = resolveSplitAwareTax({ taxBase, transferIncome, basicDeduction, splitDetail, parsedRates, taxRateInput, multiHouseSurchargeResult });
  steps.push(buildCalculatedTaxStep(taxResult, taxBase));

  // STEP 7.5 ~ 11/12: 산출세액 이후 단계 + 결과 조립 (transfer-tax-normal-return.ts)
  return buildNormalTransferTaxResult({
    input,
    effectiveInput,
    rawInput,
    steps,
    taxResult,
    taxRateInput,
    parsedRates,
    multiHouseSurchargeResult,
    taxableGain,
    longTermHoldingDeduction,
    longTermHoldingRate,
    basicDeduction,
    taxBase,
    estimatedBase,
    transferIncomeBefore993,
    splitDetailForRate: splitDetail,
    new993PreliminaryResult,
    new99PreliminaryResult: incomeDeduction.new99Detail,
    unsold988PreliminaryResult: incomeDeduction.unsold988Detail,
    unsold987PreliminaryResult: incomeDeduction.unsold987Detail,
    unsold992PreliminaryResult: incomeDeduction.unsold992Detail,
    unsold983PreliminaryResult: incomeDeduction.unsold983Detail,
    unsold985PreliminaryResult: incomeDeduction.unsold985Detail,
    unsold986PreliminaryResult: incomeDeduction.unsold986Detail,
    unsold982PreliminaryResult: incomeDeduction.unsold982Detail,
    unsold984PreliminaryResult: incomeDeduction.unsold984Detail,
    unsold98PreliminaryResult: incomeDeduction.unsold98Detail,
    exemptionResult,
    warnings,
    transferGain,
    usedEstimated,
    estimatedDeduction,
    appliedExpenses,
    swapApplied,
    swapComparison,
    expropriationValuationDetail,
    auctionValuationDetail,
    housingExpropriationValuationDetail,
    nonBusinessLandJudgment,
    pre1990LandResult,
    carryoverDetail,
    inheritedAcquisitionStep,
    cbStep,
    rental97LthdDetail,
    usageConversionDetail,
    lthdExclusionReason,
    new994Detail,
    unsold989Detail,
    specialHouseExclusionDetail,
    transferBurdenedGiftBreakdown,
  });
}
