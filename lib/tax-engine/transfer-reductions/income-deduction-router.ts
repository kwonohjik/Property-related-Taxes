/**
 * 차감형(양도소득금액 차감) 감면 공용 라우터 — §99의3 · §99 · §98의8
 *
 * transfer-tax.ts STEP 4.6의 §99의3 단독 분기를 일반화 (P1, 2026-06-11).
 * - 평가: reductions[]에서 차감형 1건을 찾아 해당 evaluator 호출 (§127⑦ — 1건만)
 * - 차감: eligible 시 reducibleTransferIncome을 양도소득금액에서 차감
 * - 농특세: finalize 2-pass (감면 전후 산출세액 차 × 20% — 농특세법 §2①1호 소득공제)
 * - 중과 배제: 소령 §167의3①5호(3주택)·§167의10①2호(2주택 — ①5호 준용)에 §99·§99의3·§98의8
 *   열거 — eligible 시 STEP 0.5에서 양도 주택에 isTaxSpecialExemption 자동 주입.
 *   (§99의3 기구현은 수동 토글만 있었음 — D-11 정정으로 자동화)
 */

import { coerceOptionalDate } from "../tax-utils";
import { evaluateNew993, type New993Result } from "./new-99-3";
import { evaluateNew99, type New99Result } from "./new-99";
import { evaluateUnsold988, type Unsold988Result } from "./unsold-98-8";

export type IncomeDeductionId = "new_99_3" | "new_99" | "unsold_98_8";

/** 중과 배제 대상 (소령 §167의3①5호 열거 — §98의4는 비열거라 P4에서 제외 유지) */
export const SURCHARGE_EXCLUDED_INCOME_DEDUCTION_IDS: ReadonlyArray<IncomeDeductionId> = [
  "new_99_3",
  "new_99",
  "unsold_98_8",
];

/** 라우터 평가 컨텍스트 — 자산-수준 입력에서 추출 (TransferTaxInput 직접 의존 회피) */
export interface IncomeDeductionContext {
  transferDate: Date;
  acquisitionDate: Date;
  /** 자산-수준 매매계약일 (§99의3 contractDate993 fallback — Round 9 우선순위 유지) */
  assetContractDate?: Date;
  transferPrice: number;
  standardPriceAtTransfer?: number;
  /** 양도소득금액 (양도차익 − 장특공제). 중과 배제 선판정 시 0 전달 가능 (적격 판정에 무관) */
  transferIncome: number;
}

export interface IncomeDeductionResolution {
  /** 적용(eligible) 조문 — 없으면 undefined */
  appliedId?: IncomeDeductionId;
  /** 차감액 (적용 조문의 reducibleTransferIncome) */
  reducible: number;
  new993Detail?: New993Result;
  new99Detail?: New99Result;
  unsold988Detail?: Unsold988Result;
  /** step 표시용 — 적용/불적격 공통 */
  stepLabel?: string;
  legalBasis?: string;
  ineligibleMessages?: string;
}

/** reduction variant 멤버 — 구조적 타이핑 (stub.types 직접 import 회피, §98의9 선례) */
interface ReductionLike {
  type: string;
  [key: string]: unknown;
}

const STEP_LABELS: Record<IncomeDeductionId, string> = {
  new_99_3: "§99의3 신축주택 과세특례",
  new_99: "§99 신축주택 감면 (IMF 1차)",
  unsold_98_8: "§98의8 준공후미분양 50% 공제",
};

/**
 * 차감형 감면 통합 평가 — transfer-tax.ts STEP 4.6 + STEP 0.45(중과 배제 선판정) 진입점.
 */
export function resolveIncomeDeduction(
  reductions: ReadonlyArray<{ type: string }> | undefined,
  ctx: IncomeDeductionContext,
): IncomeDeductionResolution {
  if (!reductions || reductions.length === 0) return { reducible: 0 };

  // ── §99의3 (기존 분기 이전 — 호출 로직·필드 fallback 동일 유지) ──
  const r993 = reductions.find((x) => x.type === "new_99_3") as ReductionLike | undefined;
  if (r993) {
    // Round 9 정정 (2026-05-06): contractDate993 (legacy) → assetContractDate 우선순위
    const effectiveContractDate =
      coerceOptionalDate(r993.contractDate993 as Date | string | undefined) ?? ctx.assetContractDate;
    const detail = evaluateNew993({
      transferDate: ctx.transferDate,
      acquisitionDate: ctx.acquisitionDate,
      contractDate: effectiveContractDate,
      usageApprovalDate: coerceOptionalDate(r993.usageApprovalDate993 as Date | string | undefined),
      transferIncome: ctx.transferIncome,
      standardPriceAtAcquisition: (r993.standardPriceAtAcquisition993 as number | undefined) ?? 0,
      standardPriceAt5Years: (r993.standardPriceAt5Years as number | undefined) ?? 0,
      standardPriceAtTransfer:
        (r993.standardPriceAtTransfer993 as number | undefined) ?? ctx.standardPriceAtTransfer ?? 0,
      transferPrice: ctx.transferPrice,
      exclusiveAreaSqm: 0, // 자산 면적 정보가 별도 — 고가주택 면적 기준은 호출자에서 사전 검증 권장
      region: (r993.region993 as "outside_speculation" | "speculation" | undefined) ?? "outside_speculation",
      isResident: (r993.isResident993 as boolean | undefined) ?? true,
      isHousingConstructionBusiness: (r993.isHousingConstructionBusiness993 as boolean | undefined) ?? false,
      acquisitionType: (r993.acquisitionType993 as "from_builder" | "self_built" | undefined) ?? "from_builder",
      hasOccupancyAtContract: r993.hasOccupancyAtContract as boolean | undefined,
      // 농특세는 finalize에서 2-pass 재계산 (placeholder 0)
      calculatedTaxBeforeReduction: 0,
      calculatedTaxAfterReduction: 0,
    });
    return buildResolution("new_99_3", detail.isEligible, detail.reducibleTransferIncome,
      detail.ineligibleReasons.map((x) => x.message).join(" · "), detail.legalBasis,
      { new993Detail: detail });
  }

  // ── §99 (P1 신규) ──
  const r99 = reductions.find((x) => x.type === "new_99") as ReductionLike | undefined;
  if (r99) {
    const detail = evaluateNew99({
      transferDate: ctx.transferDate,
      acquisitionDate: ctx.acquisitionDate,
      contractDate: coerceOptionalDate(r99.contractDate99 as Date | string | undefined) ?? ctx.assetContractDate,
      usageApprovalDate: coerceOptionalDate(r99.usageApprovalDate99 as Date | string | undefined),
      transferIncome: ctx.transferIncome,
      standardPriceAtAcquisition: r99.standardPriceAtAcquisition99 as number | undefined,
      standardPriceAt5Years: r99.standardPriceAt5Years99 as number | undefined,
      standardPriceAtTransfer:
        (r99.standardPriceAtTransfer99 as number | undefined) ?? ctx.standardPriceAtTransfer,
      transferPrice: ctx.transferPrice,
      exclusiveAreaSqm: r99.exclusiveAreaSqm99 as number | undefined,
      isResident: (r99.isResident99 as boolean | undefined) ?? true,
      isHousingConstructionBusiness: (r99.isHousingConstructionBusiness99 as boolean | undefined) ?? false,
      acquisitionType: (r99.acquisitionType99 as "from_builder" | "self_built" | undefined) ?? "from_builder",
      isNationalHousing: (r99.isNationalHousing99 as boolean | undefined) ?? false,
      hasOccupancyAtContract: r99.hasOccupancyAtContract99 as boolean | undefined,
      isRecontractExcluded: r99.isRecontractExcluded99 as boolean | undefined,
      isRedevelopedNewHouse: r99.isRedevelopedNewHouse99 as boolean | undefined,
      previousHouseStdPriceAtAcquisition: r99.previousHouseStdPrice99 as number | undefined,
    });
    return buildResolution("new_99", detail.isEligible, detail.reducibleTransferIncome,
      detail.ineligibleReasons.map((x) => x.message).join(" · "), detail.legalBasis,
      { new99Detail: detail });
  }

  // ── §98의8 (P1 신규) ──
  const r988 = reductions.find((x) => x.type === "unsold_98_8") as ReductionLike | undefined;
  if (r988) {
    const detail = evaluateUnsold988({
      transferDate: ctx.transferDate,
      acquisitionDate: ctx.acquisitionDate,
      contractDate: coerceOptionalDate(r988.contractDate988 as Date | string | undefined),
      acquisitionPrice: r988.acquisitionPrice988 as number | undefined,
      exclusiveAreaSqm: r988.exclusiveAreaSqm988 as number | undefined,
      rentalStartDate: coerceOptionalDate(r988.rentalStartDate988 as Date | string | undefined),
      rentalEndDate: coerceOptionalDate(r988.rentalEndDate988 as Date | string | undefined),
      inheritedRentalMonths: r988.inheritedRentalMonths988 as number | undefined,
      isResident: (r988.isResident988 as boolean | undefined) ?? true,
      isUnsoldAfterCompletion: r988.isUnsoldAfterCompletion988 as boolean | undefined,
      isFirstContract: r988.isFirstContract988 as boolean | undefined,
      isNotRecontract: r988.isNotRecontract988 as boolean | undefined,
      transferIncome: ctx.transferIncome,
      standardPriceAtAcquisition: r988.standardPriceAtAcquisition988 as number | undefined,
      standardPriceAt5Years: r988.standardPriceAt5Years988 as number | undefined,
      standardPriceAtTransfer:
        (r988.standardPriceAtTransfer988 as number | undefined) ?? ctx.standardPriceAtTransfer,
    });
    return buildResolution("unsold_98_8", detail.isEligible, detail.reducibleTransferIncome,
      detail.ineligibleReasons.map((x) => x.message).join(" · "), detail.legalBasis,
      { unsold988Detail: detail });
  }

  return { reducible: 0 };
}

function buildResolution(
  id: IncomeDeductionId,
  isEligible: boolean,
  reducible: number,
  ineligibleMessages: string,
  legalBasis: string,
  details: Pick<IncomeDeductionResolution, "new993Detail" | "new99Detail" | "unsold988Detail">,
): IncomeDeductionResolution {
  return {
    appliedId: isEligible ? id : undefined,
    reducible: isEligible ? reducible : 0,
    stepLabel: STEP_LABELS[id],
    legalBasis,
    ineligibleMessages: isEligible ? undefined : ineligibleMessages,
    ...details,
  };
}

/** STEP 4.6 계산 단계 표시 — transfer-tax.ts 본문 압축용 (800줄 정책) */
export function buildIncomeDeductionStep(
  resolution: IncomeDeductionResolution,
  incomeBefore: number,
  incomeAfter: number,
): { label: string; formula: string; amount: number; legalBasis: string } {
  if (resolution.appliedId) {
    return {
      label: `${resolution.stepLabel} — 양도소득금액 차감`,
      formula: `양도소득금액 ${incomeBefore.toLocaleString()} - 감면 양도소득금액 ${resolution.reducible.toLocaleString()} = ${incomeAfter.toLocaleString()}`,
      amount: incomeAfter,
      legalBasis: resolution.legalBasis ?? "",
    };
  }
  return {
    label: `${resolution.stepLabel} — 적용 불가`,
    formula: resolution.ineligibleMessages ?? "",
    amount: 0,
    legalBasis: resolution.legalBasis ?? "",
  };
}

/** STEP 0.45 중과 배제 단계 표시 */
export function buildSurchargeExclusionStep(exclusion: {
  appliedId?: IncomeDeductionId;
  legalBasis?: string;
}): { label: string; formula: string; amount: number; legalBasis: string } {
  const article =
    exclusion.appliedId === "unsold_98_8" ? "조특법 §98의8" : exclusion.appliedId === "new_99" ? "조특법 §99" : "조특법 §99의3";
  return {
    label: "감면주택 다주택 중과 배제",
    formula: `${article} 감면주택 양도 — 중과세율 적용 제외`,
    amount: 0,
    legalBasis: exclusion.legalBasis ?? "",
  };
}

/**
 * STEP 0.45 — 차감형 감면주택 중과 배제 선판정.
 * 적격 판정은 날짜·가액·면적·토글만 사용 (양도소득금액 무관) → transferIncome=0으로 호출.
 * eligible이면 양도 주택(sellingHouse)에 isTaxSpecialExemption을 주입해
 * 기존 중과 엔진 경로(multi-house-surcharge-helpers — "조세특례제한법 특례 적용 주택")로 배제.
 */
export function resolveSurchargeExclusionByReduction(
  reductions: ReadonlyArray<{ type: string }> | undefined,
  ctx: Omit<IncomeDeductionContext, "transferIncome">,
): { excluded: boolean; appliedId?: IncomeDeductionId; legalBasis?: string } {
  const resolution = resolveIncomeDeduction(reductions, { ...ctx, transferIncome: 0 });
  if (resolution.appliedId && SURCHARGE_EXCLUDED_INCOME_DEDUCTION_IDS.includes(resolution.appliedId)) {
    return {
      excluded: true,
      appliedId: resolution.appliedId,
      legalBasis: "소령 §167의3①5호·§167의10①2호",
    };
  }
  return { excluded: false };
}
