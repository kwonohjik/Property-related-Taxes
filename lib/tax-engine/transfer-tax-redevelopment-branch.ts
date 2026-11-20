/**
 * STEP 0.65 재개발·재건축 분기 (시행령 §166) — `transfer-tax.ts`에서 닫힌 조기 반환으로 추출(2026-11 리뷰 I-17 · 800줄 정책).
 * `handleMultiParcelBranch`와 같은 꼴이다: 분기에 들지 않으면 `null`, 들면 결과를 돌려준다. 본문은 옮기기만 했다(동작 불변).
 */
import { resolveInheritedRedevelopmentAcqPrice } from "./inheritance-acquisition-helpers";
import { mergeRentalCarveoutSurchargeNotice } from "./one-house/merge-rental-carveout";
import { oneHouseJudgmentWarnings } from "./transfer-tax-one-house-warnings";
import { meetsOneHouseHoldingResidence } from "./transfer-tax-exemption";
import { isRedevelopmentActive, calculateRedevelopmentTax } from "./transfer-tax-redevelopment";
import { judgeRedevAptOneHouseExemption } from "./transfer-tax-redevelopment-apt-exemption";
import { detectRedevelopmentBurdenedGiftNotice } from "./redevelopment-burdened-gift";
import type { MultiHouseSurchargeResult } from "./multi-house-surcharge";
import type { PreCalcResult } from "./transfer-tax-precalc";
import type { TransferTaxAcquisitionOptions } from "./transfer-tax-acquisition-override";
import type { CalculationStep, TransferTaxInput, TransferTaxResult } from "./types/transfer.types";

export interface RedevelopmentBranchContext {
  effectiveInput: TransferTaxInput;
  pre: Pick<
    PreCalcResult,
    "parsedRates" | "input" | "inheritedAcquisitionStep" | "carryoverDetail" | "transferBurdenedGiftBreakdown" | "hceGeneralHouseAcquisitionDate"
  >;
  options: TransferTaxAcquisitionOptions | undefined;
  multiHouseSurchargeResult: MultiHouseSurchargeResult | undefined;
  steps: CalculationStep[];
  warnings: string[];
}

// STEP 0.65: 재개발/재건축 분기 — 시행령 §166. STEP 1: 비과세 판단
export function handleRedevelopmentBranch(ctx: RedevelopmentBranchContext): TransferTaxResult | null {
  const { effectiveInput, options, multiHouseSurchargeResult, steps, warnings } = ctx;
  const { parsedRates, input, inheritedAcquisitionStep, carryoverDetail, transferBurdenedGiftBreakdown, hceGeneralHouseAcquisitionDate } = ctx.pre;
  if (
    !isRedevelopmentActive(
      effectiveInput.propertyType,
      effectiveInput.redevelopment,
      // 승계조합원 입주권은 §166①의 「조합에 기존건물을 제공하고 취득한 조합원」이 아니다 —
      // 일반 분기(§97①1호 가목)로 내려보낸다. 근거는 `redevelopment-dispatch.ts` 주석.
      effectiveInput.isSuccessorRightToMoveIn,
    )
  )
    return null;
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
  //     · pre-deemed  → ①②가 이기면 `clauseA`(STEP 0.45가 실가로 이미 넣음), ③(§166③ — STEP 0.45가 같은 산식으로
  //       비교)이 이기면 null이라 재개발 분기가 §166③을 계산한다(계획서 inheritance-pre-deemed-clause-b-revisit.plan.md §12).
  //   그래서 뮤테이션으로 이 블록을 통째로 무력화해도 회귀가 0건이었다(R-10 M-4).
  //   ⛔ 그렇다고 **지우지는 말 것** — 위 override 가드가 이 블록의 유일한 실효 동작이고,
  //      post-deemed의 「채택 여부가 아니라 확인 가능 여부」 계약을 명시적으로 표현하는 지점이기도 하다.
  let redevInput = effectiveInput;
  if (
    effectiveInput.acquisitionCause === "inheritance" && !transferBurdenedGiftBreakdown /* 부담부증여는 §159 채무비율 안분값을 덮지 않는다(계획서 inheritance-pre-deemed-clause-b-revisit.plan.md §18 결함 R) */ &&
    options?.acquisitionOverride === undefined
  ) {
    const inhAcqPrice = resolveInheritedRedevelopmentAcqPrice(inheritedAcquisitionStep);
    if (inhAcqPrice !== null) {
      redevInput = { ...effectiveInput, acquisitionPrice: inhAcqPrice, useEstimatedAcquisition: false };
    }
  }
  // STEP 0.65a: 완공 신축주택(subject="apt") §89①3호가목 비과세 판정 + 주택수 제외 산출물.
  //   근거·게이트(청산금 수령 단독신고 제외 — OH-19)·거주월수 단일 소스(OH-48)는 분리 파일 주석.
  const {
    exemptionResult: redevExemption,
    houseCountExclusion: redevHouseExclusion,
    oneHouseTable2Axis: redevOneHouseTable2Axis,
    judgeInput: redevJudgeInput,
  } = judgeRedevAptOneHouseExemption(redevInput, steps, hceGeneralHouseAcquisitionDate, parsedRates, warnings);
  // 일반 주택 경로와 같은 판정 안내(미충족 특례 · 판정 보류 · 재기산 등) — 종전엔 하나도 옮기지 않았다(계획서 redev-apt-one-house-warning-parity.plan.md).
  if (redevExemption && redevJudgeInput) {
    warnings.push(
      ...oneHouseJudgmentWarnings(redevExemption, {
        input,
        judgeInput: redevJudgeInput,
        surchargeApplicable: multiHouseSurchargeResult?.surchargeApplicable,
        oneHouseRules: parsedRates.oneHouseSpecialRules,
      }),
    );
  }

  // 🔴 종전에는 `multiHouseSurchargeResult`를 **넘기지 않았다** — STEP 0.5(`:219`)에서
  //    판정해 놓고 이 분기가 버렸다. 형제 경로 둘(`buildExemptEarlyResult` ·
  //    `handleMultiParcelBranch`)은 처음부터 넘기고 있었다.
  //
  // 🔴 `carryoverDetail`도 같은 이유로 버려지고 있었다 (E3-06) — STEP 0.475가 §97의2
  //    A/B를 판정해 `workingInput`까지 교체해 놓고 그 근거가 결과에 실리지 않아
  //    ① 결과 화면 A/B 비교 카드 미표시 ② 다건 §97의2②3호 신고단위 비교에서 자산 누락
  //    ③ 신고서 표시 취득가액이 수증자 것으로 되돌아감 — 셋이 함께 발생했다.
  /**
   * β 적용 고지 (§159 × §166 결합에 명문·해석례 없음) — `warnings`에 push한다.
   * `detectBurdenedGiftMultiHouseWarning` 선례와 같은 배선이다(별도 컴포넌트 없음).
   * 근거·문구는 `redevelopment-burdened-gift.ts`.
   */
  const redevBgNotice = detectRedevelopmentBurdenedGiftNotice({
    propertyType: redevInput.propertyType,
    hasRedevelopment: redevInput.redevelopment !== undefined,
    isBurdenedGift: transferBurdenedGiftBreakdown !== undefined,
  });
  if (redevBgNotice) warnings.push(redevBgNotice);
  if (redevInput.mergeRentalCarveout && multiHouseSurchargeResult?.surchargeApplicable) {
    warnings.push(
      mergeRentalCarveoutSurchargeNotice(
        redevInput,
        multiHouseSurchargeResult.effectiveHouseCount,
        !!redevJudgeInput && meetsOneHouseHoldingResidence(redevJudgeInput, parsedRates.oneHouseSpecialRules.one_house_exemption),
      ),
    );
  }

  return calculateRedevelopmentTax(redevInput, parsedRates, steps, multiHouseSurchargeResult, {
    exemptionResult: redevExemption,
    oneHouseTable2Axis: redevOneHouseTable2Axis,
    carryoverDetail,
    warnings,
    houseCountExclusion: redevHouseExclusion,
    inheritedAcquisitionStep,
    burdenedGift: transferBurdenedGiftBreakdown,
  });
}
