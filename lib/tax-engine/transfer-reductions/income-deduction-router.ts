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
import { type UnsoldHybridResult } from "./unsold-hybrid";
import {
  evaluateAnyHybridFromReduction,
  ALL_HYBRID_IDS,
  RATE_SPECIAL_REDUCTION_IDS,
} from "./unsold-hybrid-p3";
export { RATE_SPECIAL_REDUCTION_IDS };

export type IncomeDeductionId =
  | "new_99_3"
  | "new_99"
  | "unsold_98_8"
  | "unsold_98_7"
  | "unsold_99_2"
  | "unsold_98_3"
  | "unsold_98_5"
  | "unsold_98_6"
  | "unsold_98_2"
  | "unsold_98_4"
  | "unsold_98";

/**
 * 차감형·세액감면형 라우터가 처리하는 전체 조문 ID (11종).
 * 다건(multi) 합산 경로는 이 체계를 미지원하므로 `validateMultiSupportedMode`에서 명시 차단에 사용.
 */
export const ALL_INCOME_DEDUCTION_IDS: ReadonlyArray<IncomeDeductionId> = [
  "new_99_3",
  "new_99",
  "unsold_98_8",
  "unsold_98_7",
  "unsold_99_2",
  "unsold_98_3",
  "unsold_98_5",
  "unsold_98_6",
  "unsold_98_2",
  "unsold_98_4",
  "unsold_98",
];

/** 중과 배제 대상 (소령 §167의3①5호 열거 — §98의4는 **비열거**라 제외, P4-5 anchor) */
export const SURCHARGE_EXCLUDED_INCOME_DEDUCTION_IDS: ReadonlyArray<IncomeDeductionId> = [
  "new_99_3",
  "new_99",
  "unsold_98_8",
  "unsold_98_7",
  "unsold_99_2",
  "unsold_98_3",
  "unsold_98_5",
  "unsold_98_6",
  "unsold_98_2",
  // §98 — 소령 §167의3①3호 (감면대상장기임대주택 — 5년+ 임대 국민주택) 경로 (P5)
  "unsold_98",
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
  /** 차감(소득금액 공제) 적용 조문 — 없으면 undefined */
  appliedId?: IncomeDeductionId;
  /**
   * 효과 경로 무관 적격 조문 — 중과 배제(소령 §167의3①5호 "감면되는 주택") 판정용 (P2).
   * 하이브리드 5년 내(세액감면 경로)는 appliedId 없이 eligibleId만 설정됨.
   * 기존 차감 3조문은 eligibleId === appliedId.
   */
  eligibleId?: IncomeDeductionId;
  /** 차감액 (적용 조문의 reducibleTransferIncome) */
  reducible: number;
  new993Detail?: New993Result;
  new99Detail?: New99Result;
  unsold988Detail?: Unsold988Result;
  unsold987Detail?: UnsoldHybridResult;
  unsold992Detail?: UnsoldHybridResult;
  unsold983Detail?: UnsoldHybridResult;
  unsold985Detail?: UnsoldHybridResult;
  unsold986Detail?: UnsoldHybridResult;
  unsold982Detail?: UnsoldHybridResult;
  unsold984Detail?: UnsoldHybridResult;
  unsold98Detail?: UnsoldHybridResult;
  /** step 표시용 — 적용/불적격 공통 */
  stepLabel?: string;
  legalBasis?: string;
  ineligibleMessages?: string;
  /** 하이브리드 5년 내 — 세액감면 경로 안내 step용 (P2) */
  taxAmountMode?: boolean;
  /** §98의2 특칙 전용 — 장특 표2·기본세율 안내 step용 (P4) */
  specialOnlyMode?: boolean;
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
  unsold_98_7: "§98의7 미분양주택 과세특례",
  unsold_99_2: "§99의2 신축주택등 과세특례",
  unsold_98_3: "§98의3 미분양주택 과세특례",
  unsold_98_5: "§98의5 수도권 밖 미분양 과세특례",
  unsold_98_6: "§98의6 준공후미분양 과세특례",
  unsold_98_2: "§98의2 지방 미분양주택 과세특례",
  unsold_98_4: "§98의4 비거주자 주택취득 과세특례",
  unsold_98: "§98 미분양 국민주택 과세특례",
};

const HYBRID_DETAIL_FIELDS: Record<string, keyof Pick<IncomeDeductionResolution,
  "unsold987Detail" | "unsold992Detail" | "unsold983Detail" | "unsold985Detail" | "unsold986Detail"
  | "unsold982Detail" | "unsold984Detail" | "unsold98Detail">> = {
  unsold_98_7: "unsold987Detail",
  unsold_99_2: "unsold992Detail",
  unsold_98_3: "unsold983Detail",
  unsold_98_5: "unsold985Detail",
  unsold_98_6: "unsold986Detail",
  unsold_98_2: "unsold982Detail",
  unsold_98_4: "unsold984Detail",
  unsold_98: "unsold98Detail",
};

/**
 * 차감형 감면 통합 평가 — transfer-tax.ts STEP 4.6 + STEP 0.45(중과 배제 선판정) 진입점.
 *
 * 각 조문을 순서대로 평가하되 **적격(eligibleId)을 만나면 즉시 채택**하고, 부적격이면 다음 후보를
 * 계속 평가한다 (리뷰 M-1: 부적격 선순위가 적격 후순위를 차단하던 first-match 버그 해소).
 * 적격 후보가 없으면 첫 부적격 결과를 표시용으로 반환.
 * (조특법 §127⑦ 복수 적격 "납세자 선택 1건"은 UI 카테고리 라디오로 입력 단계에서 1건만 허용.)
 */
export function resolveIncomeDeduction(
  reductions: ReadonlyArray<{ type: string }> | undefined,
  ctx: IncomeDeductionContext,
): IncomeDeductionResolution {
  if (!reductions || reductions.length === 0) return { reducible: 0 };

  const evaluators: Array<() => IncomeDeductionResolution | null> = [
    () => evalNew993(reductions, ctx),
    () => evalNew99(reductions, ctx),
    () => evalUnsold988(reductions, ctx),
    () => evalHybrid(reductions, ctx),
  ];

  let firstIneligible: IncomeDeductionResolution | undefined;
  for (const evaluate of evaluators) {
    const res = evaluate();
    if (!res) continue; // 해당 조문이 reductions에 없음
    if (res.eligibleId) return res; // 적격 — 즉시 채택
    if (!firstIneligible) firstIneligible = res; // 부적격 — 표시용 보관 (적격 없을 때만 사용)
  }
  return firstIneligible ?? { reducible: 0 };
}

/** §99의3 — 호출 로직·필드 fallback 동일 유지 (M-1 추출, 미입력 시 null) */
function evalNew993(
  reductions: ReadonlyArray<{ type: string }>,
  ctx: IncomeDeductionContext,
): IncomeDeductionResolution | null {
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
      exclusiveAreaSqm: (r993.exclusiveAreaSqm993 as number | undefined) ?? 0, // 고가주택 면적기준(2002.12.31 이전 취득) 판정용
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
  return null;
}

/** §99 — P1 신규 (M-1 추출, 미입력 시 null) */
function evalNew99(
  reductions: ReadonlyArray<{ type: string }>,
  ctx: IncomeDeductionContext,
): IncomeDeductionResolution | null {
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
  return null;
}

/** §98의8 — P1 신규 (M-1 추출, 미입력 시 null) */
function evalUnsold988(
  reductions: ReadonlyArray<{ type: string }>,
  ctx: IncomeDeductionContext,
): IncomeDeductionResolution | null {
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
  return null;
}

/**
 * 하이브리드 (P2 §98의7·§99의2 + P3 §98의3·§98의5·§98의6 + P4·P5) — 5년 후만 차감,
 * 5년 내는 세액감면(calcReductions). M-1 추출, 미입력·평가 불가 시 null.
 */
function evalHybrid(
  reductions: ReadonlyArray<{ type: string }>,
  ctx: IncomeDeductionContext,
): IncomeDeductionResolution | null {
  const rHybrid = reductions.find((x) => ALL_HYBRID_IDS.includes(x.type)) as
    | ReductionLike
    | undefined;
  if (rHybrid) {
    const detail = evaluateAnyHybridFromReduction(rHybrid, {
      transferDate: ctx.transferDate,
      acquisitionDate: ctx.acquisitionDate,
      assetContractDate: ctx.assetContractDate,
      standardPriceAtTransfer: ctx.standardPriceAtTransfer,
      transferIncome: ctx.transferIncome,
    });
    if (detail) {
      const id = detail.id;
      const detailField = { [HYBRID_DETAIL_FIELDS[id]]: detail };
      const isIncomeDeduction = detail.isEligible && detail.effectCategory === "income_deduction";
      return {
        // 5년 내(tax_amount)는 appliedId 미설정 — STEP 4.6 차감 없음 (calcReductions 경로와 이중 혜택 차단)
        appliedId: isIncomeDeduction ? id : undefined,
        eligibleId: detail.isEligible ? id : undefined,
        reducible: isIncomeDeduction ? detail.reducibleTransferIncome : 0,
        stepLabel: STEP_LABELS[id],
        legalBasis: detail.legalBasis,
        ineligibleMessages: detail.isEligible
          ? undefined
          : detail.ineligibleReasons.map((x) => x.message).join(" · "),
        taxAmountMode: detail.isEligible && detail.effectCategory === "tax_amount",
        specialOnlyMode:
          detail.isEligible &&
          (detail.effectCategory === "lthd_rate_special" || detail.effectCategory === "flat_rate_20"),
        ...detailField,
      };
    }
  }
  return null;
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
    eligibleId: isEligible ? id : undefined,
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
  // 특칙 전용 (§98의2 장특 표2·기본세율 / §98 세율 20%) — 차감·감면 없음, 안내 (P4·P5)
  if (resolution.specialOnlyMode) {
    const is98 = resolution.stepLabel?.startsWith("§98 ");
    return {
      label: `${resolution.stepLabel} — ${is98 ? "세율 20% 특례 적용" : "특칙 적용 (장특 표2·기본세율)"}`,
      formula: is98
        ? "감면세액 없음 — 양도소득세 세율 20% 단일 적용 (§104① 불구, 법 §98①1호)"
        : "감면세액 없음 — 장기보유특별공제 표2 보유기간별 공제율 + §104①1호 기본세율 적용 (법 §98의2①)",
      amount: 0,
      legalBasis: resolution.legalBasis ?? "",
    };
  }
  // 하이브리드 5년 내 — 차감 없음, 세액감면 경로 안내 (P2)
  if (resolution.taxAmountMode) {
    return {
      label: `${resolution.stepLabel} — 5년 이내 양도 (세액감면 경로)`,
      formula: "취득일부터 5년 이내 양도 — 감면세액 단계에서 양도소득세 100% 세액감면 적용",
      amount: 0,
      legalBasis: resolution.legalBasis ?? "",
    };
  }
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
const EXCLUSION_ARTICLE_LABELS: Record<IncomeDeductionId, string> = {
  new_99_3: "조특법 §99의3",
  new_99: "조특법 §99",
  unsold_98_8: "조특법 §98의8",
  unsold_98_7: "조특법 §98의7",
  unsold_99_2: "조특법 §99의2",
  unsold_98_3: "조특법 §98의3",
  unsold_98_5: "조특법 §98의5",
  unsold_98_6: "조특법 §98의6",
  unsold_98_2: "조특법 §98의2",
  unsold_98_4: "조특법 §98의4",
  unsold_98: "조특법 §98",
};

export function buildSurchargeExclusionStep(exclusion: {
  appliedId?: IncomeDeductionId;
  legalBasis?: string;
}): { label: string; formula: string; amount: number; legalBasis: string } {
  // appliedId는 중과 배제(excluded=true) 시 항상 set — fallback은 도달 불가이나 특정 조문
  // 하드코딩("§99의3") 대신 중립 표현으로 오표시 방지 (리뷰 Low #3 방어).
  const article = exclusion.appliedId ? EXCLUSION_ARTICLE_LABELS[exclusion.appliedId] : "조특법 감면주택";
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
  // P2: appliedId → eligibleId 기준 — 하이브리드 5년 내(세액감면 경로)도 §167의3①5호
  // "감면되는 주택"에 해당하므로 효과 경로 무관 적격이면 배제.
  if (resolution.eligibleId && SURCHARGE_EXCLUDED_INCOME_DEDUCTION_IDS.includes(resolution.eligibleId)) {
    return {
      excluded: true,
      appliedId: resolution.eligibleId,
      // §98은 3호 (감면대상장기임대주택 — 5년+ 임대 국민주택), 나머지는 5호 열거
      legalBasis:
        resolution.eligibleId === "unsold_98"
          ? "소령 §167의3①3호·§167의10①2호"
          : "소령 §167의3①5호·§167의10①2호",
    };
  }
  return { excluded: false };
}
