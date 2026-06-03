/**
 * 상속세 세대생략 할증(§27) 산출 — STEP 8.5 분자 집계 + STEP 9 per-heir/레거시 계산.
 *
 * inheritance-tax.ts 800줄 정책 준수를 위해 분리. 순수 함수.
 *
 * 분자 = 직접 유증·상속분(estateByHeir) + §13 cutoff 내 사전증여(amountByDonee).
 * 분모 = adjustedDenominator = taxableEstateValue − 영리법인 등 사전증여(nonHeirNonLegateeGifts).
 * 할증율 = 미성년 && 개인재산 20억 초과 ? 0.40 : 0.30 (per-heir 각자 단일 floor).
 *
 * 단일 진실: isGenerationSkipBeneficiary 플래그. 플래그 없으면 레거시 전역 입력 경로(하위호환).
 */
import type {
  InheritanceTaxInput,
  PriorGift,
  CalculationStep,
  InheritanceGenerationSkipDetail,
  InheritanceGenerationSkipHeirRow,
} from "./types/inheritance-gift.types";
import { computeLegalShares } from "./inheritance-legal-share";
import {
  aggregateEstateByHeir,
  aggregatePriorGiftByDonee,
} from "./inheritance-allocation";
import {
  resolveMinorBeneficiary,
  calcGenerationSkipSurcharge,
} from "./inheritance-gift-common";
import { INH } from "./legal-codes";

export interface GenerationSkipParams {
  input: InheritanceTaxInput;
  computedTax: number;
  taxBase: number;
  taxableEstateValue: number;
  preGifts: PriorGift[];
  /** §13 cutoff 필터 증여 (STEP 4.5에서 계산, STEP 8.5·13 공유) */
  cutoffFilteredGifts: PriorGift[];
  /** estateItem id → 평가액 (STEP 13 공유) */
  valuatedAmountById: Map<string, number>;
}

export interface GenerationSkipComputation {
  generationSkipSurcharge: number;
  perHeirSurcharge: Record<string, number> | undefined;
  generationSkipDetail: InheritanceGenerationSkipDetail | null;
  breakdown: CalculationStep[];
  lawApplied: boolean;
  /** 분모 보정용 영리법인 등 사전증여 합계 (summaryTable 공유) */
  nonHeirNonLegateeGifts: number;
}

const MINOR_SURCHARGE_THRESHOLD = 2_000_000_000; // §27② 20억

export function computeGenerationSkipSurcharge(
  params: GenerationSkipParams,
): GenerationSkipComputation {
  const {
    input,
    computedTax,
    taxBase,
    taxableEstateValue,
    preGifts,
    cutoffFilteredGifts,
    valuatedAmountById,
  } = params;

  const breakdown: CalculationStep[] = [];
  let lawApplied = false;

  // ── STEP 8.5: 분자 Map 선집계 (플래그 있을 때만 — D4) ──────────
  const hasGenSkipBeneficiaries = input.heirs.some(
    (h) => h.isGenerationSkipBeneficiary,
  );

  let estateByHeirForGenSkip: Map<string, number> | undefined;
  let amountByDoneeForGenSkip: Map<string, number> | undefined;
  if (hasGenSkipBeneficiaries) {
    const legalSharesForGenSkip = computeLegalShares(input.heirs);
    estateByHeirForGenSkip = aggregateEstateByHeir(
      input.estateItems,
      valuatedAmountById,
      legalSharesForGenSkip,
    );
    amountByDoneeForGenSkip = aggregatePriorGiftByDonee(cutoffFilteredGifts);
  }

  // ── 분모 = 상속세 과세가액 − 영리법인 사전증여 (PDF 책 1864) ──────
  // §27 본칙: "제13조에 따라 상속재산에 가산한 증여재산" — cutoff 내 분만.
  // taxableEstateValue는 cutoffFilteredGifts 기준으로 산출되므로 분모도 동일 기준으로 정합.
  // M-4 수정: preGifts(raw) → cutoffFilteredGifts(§13 cutoff 내 분만) 적용.
  const nonHeirNonLegateeGifts = (cutoffFilteredGifts ?? []).reduce(
    (sum, g) => sum + (g.beneficiaryType === "corporate" ? g.giftAmount : 0),
    0,
  );
  const adjustedDenominator = taxableEstateValue - nonHeirNonLegateeGifts;

  let generationSkipSurcharge: number;
  let perHeirSurcharge: Record<string, number> | undefined;
  let generationSkipDetail: InheritanceGenerationSkipDetail | null = null;

  if (hasGenSkipBeneficiaries) {
    // ── per-heir 경로 (C-1~C-5) ──────────────────────────
    const rows: InheritanceGenerationSkipHeirRow[] = [];
    const perHeirMap: Record<string, number> = {};

    for (const heir of input.heirs) {
      if (!heir.isGenerationSkipBeneficiary) continue;
      if (heir.relation === "corporate") continue;

      const numerator =
        (estateByHeirForGenSkip?.get(heir.id) ?? 0) +
        (amountByDoneeForGenSkip?.get(heir.id) ?? 0);

      const isMinor = resolveMinorBeneficiary(heir, input.deathDate);
      // §27②: 미성년 + 개인재산 20억 초과 → 40%, 그 외 30%
      const rate =
        isMinor && numerator > MINOR_SURCHARGE_THRESHOLD ? 0.4 : 0.3;

      // 개별 단일 floor (곱셈 먼저)
      const surcharge =
        adjustedDenominator > 0
          ? Math.floor((computedTax * numerator * rate) / adjustedDenominator)
          : 0;

      rows.push({ heirId: heir.id, heirName: heir.name, numerator, rate, isMinor, surcharge });
      perHeirMap[heir.id] = surcharge;
    }

    const totalSurcharge = rows.reduce((s, r) => s + r.surcharge, 0);
    generationSkipSurcharge = totalSurcharge;
    perHeirSurcharge = perHeirMap;
    generationSkipDetail =
      rows.length > 0
        ? { denominator: adjustedDenominator, computedTax, rows, total: totalSurcharge }
        : null;

    if (totalSurcharge > 0) {
      breakdown.push({
        label: "세대생략 할증 (§27 per-heir)",
        amount: totalSurcharge,
        lawRef: INH.GENERATION_SKIP,
        note: rows
          .map(
            (r) =>
              `${r.heirName ?? r.heirId}: ${r.numerator.toLocaleString()} × ${r.rate * 100}% / ${adjustedDenominator.toLocaleString()} = ${r.surcharge.toLocaleString()}`,
          )
          .join("; "),
      });
      lawApplied = true;
    }
  } else {
    // ── 레거시 단일 경로 (C-7: 전역 입력만) ──────────────────
    const surchargeDenominator = taxableEstateValue;
    const genSkipResult = calcGenerationSkipSurcharge(
      computedTax,
      input.isGenerationSkip ?? false,
      input.isMinorHeir ?? false,
      taxBase,
      "inheritance",
      input.generationSkipAssetAmount,
      surchargeDenominator,
      nonHeirNonLegateeGifts,
    );
    generationSkipSurcharge = genSkipResult.surchargeAmount;
    perHeirSurcharge = undefined;

    if (genSkipResult.breakdown.length > 0) {
      breakdown.push(...genSkipResult.breakdown);
      lawApplied = true;
    }

    // 레거시: 할증이 있으면 rows 1행으로 표시 (결과 카드 공통)
    if (generationSkipSurcharge > 0) {
      const surchargeRate =
        (input.isMinorHeir ?? false) &&
        (input.generationSkipAssetAmount ?? 0) > MINOR_SURCHARGE_THRESHOLD
          ? 0.4
          : 0.3;
      generationSkipDetail = {
        denominator: adjustedDenominator,
        computedTax,
        rows: [
          {
            heirId: "legacy",
            heirName: "세대생략 상속재산",
            numerator: input.generationSkipAssetAmount ?? 0,
            rate: surchargeRate,
            isMinor: input.isMinorHeir ?? false,
            surcharge: generationSkipSurcharge,
          },
        ],
        total: generationSkipSurcharge,
      };
    }
  }

  return {
    generationSkipSurcharge,
    perHeirSurcharge,
    generationSkipDetail,
    breakdown,
    lawApplied,
    nonHeirNonLegateeGifts,
  };
}
