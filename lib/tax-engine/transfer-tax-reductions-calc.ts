/**
 * H-8: calcReductions — 감면 계산 (R-1 ~ R-5 + R-2-97, 조특법 §127⑦ 중복배제)
 *
 * transfer-tax-rate-calc.ts 800줄 정책 분리 (2026-06-11).
 * 외부 import 호환을 위해 transfer-tax-rate-calc.ts에서 re-export 유지.
 */

import { applyRate, safeMultiplyThenDivide } from "./tax-utils";
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
import type { Rental97Result } from "./transfer-reductions/types";
import type { LongTermRentalRuleSet, NewHousingMatrixData } from "./schemas/rate-table.schema";
import type { TransferReduction } from "./types/transfer.types";

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
  selfFarmingReductionDetail?: SelfFarmingReductionResult;
  rental97TaxDetail?: Rental97Result;
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
  }
  const candidates: ReductionCandidate[] = [];
  let rentalReductionDetail: RentalReductionResult | undefined;
  let newHousingReductionDetail: NewHousingReductionResult | undefined;
  let publicExpropriationDetail: PublicExpropriationReductionResult | undefined;
  let selfFarmingReductionDetail: SelfFarmingReductionResult | undefined;

  // R-2-V2: 장기임대 정밀 엔진
  if (rentalReductionDetails) {
    const detailsWithTax: RentalReductionInput = { ...rentalReductionDetails, calculatedTax };
    const rentalResult = calculateRentalReduction(detailsWithTax, longTermRentalRules);
    rentalReductionDetail = rentalResult;
    if (rentalResult.isEligible && rentalResult.reductionAmount > 0) {
      candidates.push({ amount: rentalResult.reductionAmount, type: "long_term_rental" });
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
        candidates.push({ amount: rental97Result.reductionAmount, type: rental97Result.id });
      }
    }
  }

  // R-3-V2: 신축/미분양 정밀 엔진
  if (newHousingDetails) {
    const detailsWithTax: NewHousingReductionInput = { ...newHousingDetails, calculatedTax };
    const newHousingResult = determineNewHousingReduction(detailsWithTax, newHousingMatrix);
    newHousingReductionDetail = newHousingResult;
    if (newHousingResult.isEligible && newHousingResult.reductionAmount > 0) {
      candidates.push({ amount: newHousingResult.reductionAmount, type: "new_housing" });
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
      transferDate,
      calculatedTax,
      transferIncome,
      basicDeduction,
      taxBase,
    });
    publicExpropriationDetail = result;
    if (result.isEligible && result.reductionAmount > 0) {
      candidates.push({ amount: result.reductionAmount, type: "public_expropriation" });
    }
  }

  // R-1~R-4: 하위 호환 단순 감면
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
          standardPriceAtAcquisition,
          standardPriceAtIncorporation: reduction.standardPriceAtIncorporation,
          standardPriceAtTransfer,
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
  const reductionTypeLabel: Record<string, string> = {
    // legacy 5개 (Round 8 자동변환 마이그레이션 + 1개월 alias)
    self_farming: "자경농지",
    self_farming_inherited: "자경농지(§69·상속인 경작기간 합산 §66⑪)",
    self_farming_incorp: "자경농지(§69·편입일 부분감면 §66⑤⑥)",
    long_term_rental: "장기임대주택",
    new_housing: "신축주택",
    unsold_housing: "미분양주택",
    public_expropriation: "공익사업용 토지 수용(§77)",
    // Round 8 (2026-05-06): 신규 23개 ID 한국어 라벨 (방어 코드)
    // Phase 2 본격 구현 시 calcReductions candidates 진입 케이스 대응
    rental_97_main: "장기임대주택 (§97 ① 본문)",
    rental_97_proviso: "장기임대주택 (§97 ① 단서)",
    rental_97_2: "신축임대주택 (§97의2)",
    rental_97_3: "장기일반민간임대 (§97의3)",
    rental_97_4: "장기보유 임대주택 (§97의4)",
    rental_97_5: "장기일반민간임대 100% (§97의5)",
    new_99: "신축주택 (§99 IMF 1차)",
    new_99_3: "신축주택 과세특례 (§99의3 IMF 2차)",
    new_99_4_rural: "농어촌주택 (§99의4)",
    new_99_4_hometown: "고향주택 (§99의4)",
    unsold_98: "미분양 분리과세 (§98)",
    unsold_98_2: "지방 미분양 (§98의2)",
    unsold_98_3: "서울 외 미분양 (§98의3)",
    unsold_98_4: "비거주자 일반주택 (§98의4)",
    unsold_98_5: "수도권 외 미분양 (§98의5)",
    unsold_98_6: "준공후미분양 (§98의6)",
    unsold_98_7: "9억 이하 미분양 (§98의7)",
    unsold_98_8: "준공후미분양 6억·135㎡ (§98의8)",
    unsold_98_9: "수도권 밖 준공후미분양 (§98의9)",
    unsold_99_2: "신축·미분양·1세대1주택 (§99의2)",
  };
  const reductionTypeDisplay = best.type ? (reductionTypeLabel[best.type] ?? best.type) : undefined;

  return {
    reductionAmount,
    reductionType: reductionTypeDisplay,
    reductionTypeApplied: best.type || undefined,
    reducibleIncome: best.amount > 0 ? best.reducibleIncome : undefined,
    rentalReductionDetail,
    newHousingReductionDetail,
    publicExpropriationDetail,
    selfFarmingReductionDetail,
    rental97TaxDetail,
  };
}
