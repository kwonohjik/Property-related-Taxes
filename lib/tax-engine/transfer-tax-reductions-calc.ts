/**
 * H-8: calcReductions — 감면 계산 (R-1 ~ R-5 + R-2-97, 조특법 §127⑦ 중복배제)
 *
 * transfer-tax-rate-calc.ts 800줄 정책 분리 (2026-06-11).
 * 외부 import 호환을 위해 transfer-tax-rate-calc.ts에서 re-export 유지.
 */

import { applyRate, safeMultiplyThenDivide } from "./tax-utils";
import { reductionTypeLabelOf } from "./transfer-reduction-type-labels";
import type { ParsedRates } from "./transfer-tax-helpers";
import {
  type RentalReductionInput,
  type RentalReductionResult,
  calculateRentalReduction,
} from "./rental-housing-reduction";
import {
  type NewHousingReductionInput,
  type NewHousingReductionResult,
  determineNewHousingReduction,
} from "./new-housing-reduction";
import {
  type PublicExpropriationReductionResult,
  calculatePublicExpropriationReduction,
} from "./public-expropriation-reduction";
import {
  type SelfFarmingReductionResult,
  calculateSelfFarmingReduction,
} from "./self-farming-reduction";
import { evaluateRental97TaxAmount } from "./transfer-reductions/rental-97-router";
import { isIncomeDeductionTrack } from "./transfer-reductions/income-deduction-router";
import { isWithin5YearsCheck } from "./transfer-reductions/new-99-3";
import { type UnsoldHybridResult } from "./transfer-reductions/unsold-hybrid";
import { evaluateAnyHybridTaxAmount } from "./transfer-reductions/unsold-hybrid-p3";
import type { Rental97Result } from "./transfer-reductions/types";
import type { LongTermRentalRuleSet, NewHousingMatrixData } from "./schemas/rate-table.schema";
import type { TransferReduction } from "./types/transfer.types";
import {
  calculateGbDesignatedLandReduction,
  type GbDesignatedLandResult,
} from "./gb-designated-land-reduction";
import {
  calculateReplacementLandReduction,
  type ReplacementLandResult,
} from "./replacement-land-reduction";

export interface ReductionsResult {
  reductionAmount: number;
  reductionType?: string;
  /** 적용된 감면의 내부 식별자 (합산 재계산·§133 한도 그룹핑용) */
  reductionTypeApplied?: string;
  /**
   * 감면대상 양도소득금액 (합산 재계산의 분자).
   * 편입일 부분감면 시 편입일 비율로 안분된 소득, 편입 없으면 전체 소득.
   */
  reducibleIncome?: number;
  /**
   * 다건 합산 M-8이 `reducibleIncome`에 **추가로 곱해야 할** 감면율.
   *
   * M-8(`transfer-tax-aggregate-reduction-step.ts`)은 `reducibleIncome`을 「감면율이 이미
   * 반영된 감면대상소득」으로 전제하고 `calculatedTax × reducibleIncome / taxBase`를 그대로
   * 감면세액으로 쓴다. §77·§77의2·§77의3·§69는 그 전제를 지키지만, §97 계열·legacy 장기임대·
   * legacy 신축·하이브리드는 **별지84호 부표1 ⑲가 「감면율 前」 금액을 요구**하기 때문에
   * (부표1 작성방법 16번 — 감면율은 서식의 별도 칸) 감면율을 곱하지 않은 값을 넣는다.
   * 그래서 §97① 본문(50%)이 다건 경로에서 **정확히 2배** 감면됐다(코드리뷰 D8-01).
   *
   * 표시 계약(⑲·PDF·상세명세 — `components/calc/results/transfer/reduction-eligible-income.ts`)을
   * 깨지 않기 위해 `reducibleIncome`은 그대로 두고, 잔여 감면율만 여기로 운반한다.
   * 이미 감면율이 반영된 유형은 이 값을 설정하지 않는다(= 1로 취급).
   *
   * anchor: `__tests__/tax-engine/transfer/aggregate-reduction-rate-parity.anchor.test.ts`
   */
  aggregateReductionRate?: number;
}

export function calcReductions(
  calculatedTax: number,
  reductions: TransferReduction[],
  selfFarmingRules: ParsedRates["selfFarmingRules"] | undefined,
  rentalReductionDetails?: RentalReductionInput,
  longTermRentalRules?: LongTermRentalRuleSet,
  newHousingDetails?: NewHousingReductionInput,
  newHousingMatrix?: NewHousingMatrixData,
  transferDate?: Date,
  transferIncome?: number,
  basicDeduction?: number,
  taxBase?: number,
  // NEW: 자경농지 편입일 부분감면을 위한 주 자산 취득일·기준시가 3점값 전파
  acquisitionDate?: Date,
  standardPriceAtAcquisition?: number,
  standardPriceAtTransfer?: number,
  // Phase 2 (2026-06-11): §97의2·§97의5 시한 판정용 매매계약일 (자산-수준 assetContractDate)
  assetContractDate?: Date,
): ReductionsResult & {
  rentalReductionDetail?: RentalReductionResult;
  newHousingReductionDetail?: NewHousingReductionResult;
  publicExpropriationDetail?: PublicExpropriationReductionResult;
  gbDesignatedLandDetail?: GbDesignatedLandResult;
  replacementLandDetail?: ReplacementLandResult;
  selfFarmingReductionDetail?: SelfFarmingReductionResult;
  rental97TaxDetail?: Rental97Result;
  hybridTaxDetail?: UnsoldHybridResult;
} {
  if (reductions.length === 0 && !rentalReductionDetails && !newHousingDetails) {
    return { reductionAmount: 0 };
  }

  // 조특법 §127⑦ 감면 중복 배제: 납세자에게 유리한 1건만 적용
  interface ReductionCandidate {
    amount: number;
    type: string;
    /** 감면대상 양도소득금액 (합산 재계산용 분자, 편입 부분감면 시 비율 적용 후) */
    reducibleIncome?: number;
  /**
   * 다건 합산 M-8이 `reducibleIncome`에 **추가로 곱해야 할** 감면율.
   *
   * M-8(`transfer-tax-aggregate-reduction-step.ts`)은 `reducibleIncome`을 「감면율이 이미
   * 반영된 감면대상소득」으로 전제하고 `calculatedTax × reducibleIncome / taxBase`를 그대로
   * 감면세액으로 쓴다. §77·§77의2·§77의3·§69는 그 전제를 지키지만, §97 계열·legacy 장기임대·
   * legacy 신축·하이브리드는 **별지84호 부표1 ⑲가 「감면율 前」 금액을 요구**하기 때문에
   * (부표1 작성방법 16번 — 감면율은 서식의 별도 칸) 감면율을 곱하지 않은 값을 넣는다.
   * 그래서 §97① 본문(50%)이 다건 경로에서 **정확히 2배** 감면됐다(코드리뷰 D8-01).
   *
   * 표시 계약(⑲·PDF·상세명세 — `components/calc/results/transfer/reduction-eligible-income.ts`)을
   * 깨지 않기 위해 `reducibleIncome`은 그대로 두고, 잔여 감면율만 여기로 운반한다.
   * 이미 감면율이 반영된 유형은 이 값을 설정하지 않는다(= 1로 취급).
   *
   * anchor: `__tests__/tax-engine/transfer/aggregate-reduction-rate-parity.anchor.test.ts`
   */
  aggregateReductionRate?: number;
  }
  const candidates: ReductionCandidate[] = [];
  let rentalReductionDetail: RentalReductionResult | undefined;
  let newHousingReductionDetail: NewHousingReductionResult | undefined;
  let publicExpropriationDetail: PublicExpropriationReductionResult | undefined;
  let gbDesignatedLandDetail: GbDesignatedLandResult | undefined;
  let replacementLandDetail: ReplacementLandResult | undefined;
  let selfFarmingReductionDetail: SelfFarmingReductionResult | undefined;

  // R-2-V2: 장기임대 정밀 엔진
  if (rentalReductionDetails) {
    const detailsWithTax: RentalReductionInput = { ...rentalReductionDetails, calculatedTax };
    const rentalResult = calculateRentalReduction(detailsWithTax, longTermRentalRules);
    rentalReductionDetail = rentalResult;
    if (rentalResult.isEligible && rentalResult.reductionAmount > 0) {
      // ⑲ 세액감면대상금액(별지84호 부표 1) = 「§90① 세액감면방식 적용 시 양도자산의 감면소득금액」.
      // **감면율은 서식의 별도 칸**(부표 1 작성방법 16번)이므로 여기에는 감면율을 곱하지 않는다.
      candidates.push({
        amount: rentalResult.reductionAmount,
        type: "long_term_rental",
        reducibleIncome: transferIncome,
        aggregateReductionRate: rentalResult.reductionRate,
      });
    }
  }

  // R-2-97: 장기임대 §97 시리즈 세액감면 (§97 본문/단서·§97의2·§97의5) — Phase 2 (2026-06-11)
  // §127⑦ 중복배제: candidates max 패턴 합류. §97의3·§97의4(장특 계열)는 STEP 4에서 별도 처리.
  let rental97TaxDetail: Rental97Result | undefined;
  if (transferDate) {
    const rental97Result = evaluateRental97TaxAmount(reductions, {
      transferDate,
      acquisitionDate,
      contractDate: assetContractDate,
      stdPriceAtAcquisition: standardPriceAtAcquisition,
      stdPriceAtTransfer: standardPriceAtTransfer,
      calculatedTax,
    });
    if (rental97Result) {
      rental97TaxDetail = rental97Result;
      if (
        rental97Result.isEligible &&
        rental97Result.effectCategory === "tax_amount" &&
        rental97Result.reductionAmount > 0
      ) {
        // §97의5①은 「임대기간 중 발생한 양도소득」이 감면 대상이므로 안분비율을 곱한다.
        // §97 본문·단서·§97의2는 rentalGainRatio가 1이라 자동으로 전액이 된다.
      // ⑲ 세액감면대상금액(별지84호 부표 1) = 「§90① 세액감면방식 적용 시 양도자산의 감면소득금액」.
      // **감면율은 서식의 별도 칸**(부표 1 작성방법 16번)이므로 여기에는 감면율을 곱하지 않는다.
        candidates.push({
          amount: rental97Result.reductionAmount,
          type: rental97Result.id,
          reducibleIncome:
            transferIncome === undefined
              ? undefined
              : applyRate(transferIncome, rental97Result.rentalGainRatio),
          aggregateReductionRate: rental97Result.reductionRate,
        });
      }
    }
  }

  // P2·P3 (2026-06-12): §98의3·§98의5·§98의6·§98의7·§99의2 하이브리드 5년 내 세액감면 — §127⑦ max 합류.
  // 5년 후 차감 경로는 STEP 4.6 income-deduction-router가 담당 (이중 혜택 없음 —
  // evaluator가 effectCategory로 단일 경로 보장).
  let hybridTaxDetail: UnsoldHybridResult | undefined;
  if (transferDate) {
    const hybridResult = evaluateAnyHybridTaxAmount(reductions, {
      transferDate,
      acquisitionDate,
      assetContractDate,
      calculatedTax,
    });
    if (hybridResult) {
      hybridTaxDetail = hybridResult;
      if (
        hybridResult.isEligible &&
        hybridResult.effectCategory === "tax_amount" &&
        hybridResult.reductionAmount > 0
      ) {
      // ⑲ 세액감면대상금액(별지84호 부표 1) = 「§90① 세액감면방식 적용 시 양도자산의 감면소득금액」.
      // **감면율은 서식의 별도 칸**(부표 1 작성방법 16번)이므로 여기에는 감면율을 곱하지 않는다.
        candidates.push({
          amount: hybridResult.reductionAmount,
          type: hybridResult.id,
          reducibleIncome: transferIncome,
          aggregateReductionRate: hybridResult.taxReductionRate,
        });
      }
    }
  }

  // R-3-V2: 신축/미분양 정밀 엔진 (legacy 경로)
  //
  // 🔴 **§127⑦ 트랙 교차 배제** (코드리뷰 D3-03).
  //   이 legacy 매처는 §99·§99의3까지 「산출세액 × 일수비율」 **세액감면**으로 계산하는데,
  //   두 조문의 정본은 소득차감형(§90② — 조특령 §99①·§99의3② 기준시가 안분)이고
  //   `transfer-reductions/new-99.ts`·`new-99-3.ts`가 이미 구현하고 있다.
  //   `reductions[]`에 정본 조문이 선택돼 있는데 여기서 또 세액감면 후보를 밀면
  //   차감형과 세액감면형이 **동시 적용**돼 §127⑦을 우회한다(D10-01과 같은 결함 클래스).
  //
  //   ⚠️ `newHousingDetails`는 `reductions[]` 밖의 **별도 파라미터**라 ⑧ validate의
  //     트랙 교차 차단이 보지 못한다 — 그래서 엔진에서 막는다.
  //     (⑤ 클라이언트에 `newHousingDetails` 생성처가 0건이라 현재는 direct-API 전용 경로다.)
  const hasIncomeDeductionSelected =
    transferDate !== undefined &&
    acquisitionDate !== undefined &&
    reductions.some((r) =>
      isIncomeDeductionTrack(r.type, isWithin5YearsCheck(acquisitionDate, transferDate)),
    );
  if (newHousingDetails && !hasIncomeDeductionSelected) {
    const detailsWithTax: NewHousingReductionInput = { ...newHousingDetails, calculatedTax };
    const newHousingResult = determineNewHousingReduction(detailsWithTax, newHousingMatrix);
    newHousingReductionDetail = newHousingResult;
    if (newHousingResult.isEligible && newHousingResult.reductionAmount > 0) {
      // ⑲ 세액감면대상금액(별지84호 부표 1) = 「§90① 세액감면방식 적용 시 양도자산의 감면소득금액」.
      // **감면율은 서식의 별도 칸**(부표 1 작성방법 16번)이므로 여기에는 감면율을 곱하지 않는다.
      candidates.push({
        amount: newHousingResult.reductionAmount,
        type: "new_housing",
        reducibleIncome: transferIncome,
        aggregateReductionRate: newHousingResult.reductionRate,
      });
    }
  }

  // R-5: 공익사업용 토지 수용 감면 (조특법 §77)
  for (const reduction of reductions) {
    if (reduction.type !== "public_expropriation") continue;
    if (!transferDate || transferIncome === undefined || basicDeduction === undefined || taxBase === undefined) continue;
    const result = calculatePublicExpropriationReduction({
      cashCompensation: reduction.cashCompensation,
      bondCompensation: reduction.bondCompensation,
      bondHoldingYears: reduction.bondHoldingYears ?? null,
      businessApprovalDate: reduction.businessApprovalDate,
      acquisitionDate, // §77① '고시일 소급 2년 이전 취득' 요건 검증 (상속 시 피상속인 취득일)
      transferDate,
      calculatedTax,
      transferIncome,
      basicDeduction,
      taxBase,
    });
    publicExpropriationDetail = result;
    if (result.isEligible && result.reductionAmount > 0) {
      candidates.push({ amount: result.reductionAmount, type: "public_expropriation", reducibleIncome: result.breakdown.reducibleIncome });
    }
  }

  // R-6: 개발제한구역 매수대상 토지 감면 (조특법 §77의3)
  for (const reduction of reductions) {
    if (reduction.type !== "gb_designated_land") continue;
    if (!transferDate || transferIncome === undefined || basicDeduction === undefined || taxBase === undefined) continue;
    if (!acquisitionDate) continue; // 취득일(상속 시 피상속인 취득일) 필수
    const result = calculateGbDesignatedLandReduction({
      branch: reduction.branch,
      acquisitionDate,
      designationDate: reduction.designationDate,
      triggerDate: reduction.triggerDate,
      releasedDate: reduction.releasedDate,
      freeEconZone: reduction.freeEconZone,
      residedFromAcqToTrigger: reduction.residedFromAcqToTrigger,
      transferDate,
      calculatedTax,
      transferIncome,
      basicDeduction,
      taxBase,
    });
    gbDesignatedLandDetail = result;
    if (result.isEligible && result.reductionAmount > 0) {
      candidates.push({ amount: result.reductionAmount, type: "gb_designated_land", reducibleIncome: result.reducibleIncome });
    }
  }

  // R-7: 대토보상 과세특례 (조특법 §77의2, 40% 세액감면 모드)
  for (const reduction of reductions) {
    if (reduction.type !== "replacement_land_comp") continue;
    if (!transferDate || transferIncome === undefined || basicDeduction === undefined || taxBase === undefined) continue;
    const result = calculateReplacementLandReduction({
      cashCompensation: reduction.cashCompensation,
      replacementLandComp: reduction.replacementLandComp,
      businessApprovalDate: reduction.businessApprovalDate,
      acquisitionDate, // §77의2① '고시일 소급 2년 이전 취득' 요건 검증 (상속 시 피상속인 취득일)
      transferDate,
      calculatedTax,
      transferIncome,
      basicDeduction,
      taxBase,
    });
    replacementLandDetail = result;
    if (result.isEligible && result.reductionAmount > 0) {
      candidates.push({ amount: result.reductionAmount, type: "replacement_land_comp", reducibleIncome: result.reducibleIncome });
    }
  }

  // R-1~R-4: 하위 호환 단순 감면 (신규 UI 미생성 — 2026-04-25 이전 폼-전역 구버전
  // sessionStorage 마이그레이션 전용. §97 시리즈는 STEP 4 + R-2-97 evaluator가 처리.
  // 후속 정리: docs/00-pm/transfer-rental-followup.plan.md §R-4)
  const v2Types = new Set(candidates.map((c) => c.type));
  for (const reduction of reductions) {
    if (v2Types.has(reduction.type)) continue;
    if (reduction.type === "unsold_housing" && v2Types.has("new_housing")) continue;

    let amount = 0;
    let candidateType: string = reduction.type;
    let candidateReducibleIncome: number | undefined;

    if (reduction.type === "self_farming" && selfFarmingRules) {
      // 조특법 §69 자경농지 감면 + 조특령 §66 ⑪ 1호 피상속인 경작기간 합산
      // + 조특령 §66 ⑤⑥ 주거·상업·공업지역 편입 시 부분감면
      const minYears = selfFarmingRules.conditions.minFarmingYears;
      const own = reduction.farmingYears;
      const needsDecedent = own < minYears;
      const decedent = reduction.decedentFarmingYears ?? 0;

      // 편입일·기준시가·과세표준 등 재계산에 필요한 입력이 모두 있으면 신규 엔진 경로 사용.
      // (일반 STEP 8 및 STEP 1.5 다필지 경로는 모두 해당 입력을 제공하도록 transfer-tax.ts 에서 보장한다.)
      const canUseNewEngine =
        transferDate !== undefined &&
        transferIncome !== undefined &&
        taxBase !== undefined &&
        acquisitionDate !== undefined;

      if (canUseNewEngine) {
        const sfResult = calculateSelfFarmingReduction({
          transferIncome: transferIncome!,
          farmingYears: own,
          decedentFarmingYears: decedent > 0 ? decedent : undefined,
          minFarmingYears: minYears,
          acquisitionDate: acquisitionDate!,
          transferDate: transferDate!,
          incorporationDate: reduction.incorporationDate,
          incorporationZoneType: reduction.incorporationZoneType,
          // 편입 부분감면 기준시가: reduction 전용 입력 우선(실지 모드), 없으면 자산-수준(환산 모드) fallback
          standardPriceAtAcquisition: reduction.standardPriceAtAcquisition ?? standardPriceAtAcquisition,
          standardPriceAtIncorporation: reduction.standardPriceAtIncorporation,
          standardPriceAtTransfer: reduction.standardPriceAtTransfer ?? standardPriceAtTransfer,
        });
        selfFarmingReductionDetail = sfResult;

        if (sfResult.qualifies && sfResult.reducibleIncome > 0 && taxBase! > 0) {
          // 감면세액 = 산출세액 × (감면대상소득 / 과세표준), 조특법 §133 한도 1억원.
          const rawAmount = safeMultiplyThenDivide(
            calculatedTax,
            sfResult.reducibleIncome,
            taxBase!,
          );
          amount = Math.min(rawAmount, selfFarmingRules.maxAmount);
          candidateReducibleIncome = sfResult.reducibleIncome;

          if (sfResult.partialReductionApplied) {
            candidateType = "self_farming_incorp";
          } else if (needsDecedent && decedent > 0) {
            candidateType = "self_farming_inherited";
          }
        }
      } else {
        // 레거시 경로 — 파라미터 부족 시 기존 단순 계산 유지 (하위 호환)
        const effective = needsDecedent ? own + decedent : own;
        if (effective >= minYears) {
          amount = Math.min(
            applyRate(calculatedTax, selfFarmingRules.maxRate),
            selfFarmingRules.maxAmount,
          );
          if (needsDecedent && decedent > 0) {
            candidateType = "self_farming_inherited";
          }
        }
      }
    } else if (reduction.type === "long_term_rental") {
      // ⚠️ R-1 (장기임대 §97의3 8년 50% 경과규정) — 레거시 단순 경로.
      // 신규 UI(UnifiedReductionPanel)는 rental_97_* ID만 생성하므로 이 type은 신규
      // 입력에서 도달 불가(dead). 2026-04-25 이전 폼-전역 구버전 sessionStorage
      // 마이그레이션(calc-wizard-migration.ts:149)으로만 폼에 존재한다.
      // 시한·등록일 게이트 없이 8년 50%를 적용 — §97의3 현행은 10년 70% 단일이고
      // 8년 50%는 과거 경과규정. 부칙 존속 여부 미확정(R-1: KoreanLaw 확보 불가, 외부
      // 원문 필요)으로 제거·게이트추가 모두 보류. 후속: followup.plan.md §R-1·R-4.
      if (reduction.rentalYears >= 8 && reduction.rentIncreaseRate <= 0.05) {
        amount = applyRate(calculatedTax, 0.5);
      }
    } else if (reduction.type === "new_housing") {
      const rate = reduction.region === "metropolitan" ? 0.5 : 1.0;
      amount = applyRate(calculatedTax, rate);
    } else if (reduction.type === "unsold_housing") {
      amount = calculatedTax;
    }
    if (amount > 0) {
      candidates.push({
        amount,
        type: candidateType,
        reducibleIncome: candidateReducibleIncome,
      });
    }
  }

  const best = candidates.reduce<ReductionCandidate>(
    (a, b) => (a.amount >= b.amount ? a : b),
    { amount: 0, type: "" },
  );
  const reductionAmount = Math.min(best.amount, calculatedTax);
  const reductionTypeDisplay = best.type ? reductionTypeLabelOf(best.type) : undefined;

  return {
    reductionAmount,
    reductionType: reductionTypeDisplay,
    reductionTypeApplied: best.type || undefined,
    reducibleIncome: best.amount > 0 ? best.reducibleIncome : undefined,
    aggregateReductionRate: best.amount > 0 ? best.aggregateReductionRate : undefined,
    rentalReductionDetail,
    newHousingReductionDetail,
    publicExpropriationDetail,
    gbDesignatedLandDetail,
    replacementLandDetail,
    selfFarmingReductionDetail,
    rental97TaxDetail,
    hybridTaxDetail,
  };
}
