/**
 * 상속세 메인 계산 엔진 (상증법 §11~§30)
 *
 * 계산 파이프라인:
 *   1. 재산 평가 (property-valuation.ts)
 *   2. 비과세 차감 (exemption-evaluator.ts)
 *   3. 장례비·채무 차감 (§14)
 *   4. 사전증여재산 합산 (§13 — 10년/5년)
 *   5. 상속세 과세가액 확정
 *   6. 상속공제 적용 (§18~§24)
 *   7. 과세표준 = 과세가액 - 공제
 *   8. 산출세액 = 누진세율 (§26)
 *   9. 세대생략 할증 (§27)
 *  10. 세액공제 (§28~§30·§69)
 *  11. 결정세액 = 산출 + 할증 - 공제
 *
 * Pure Engine: DB 호출 없음, 입력 검증 없음 (Orchestrator 담당)
 */

import { INH } from "./legal-codes";
import type {
  InheritanceTaxInput,
  InheritanceTaxResult,
  CalculationStep,
} from "./types/inheritance-gift.types";

import { evaluateAllEstateItems } from "./property-valuation";
import {
  evaluateExemptions,
} from "./exemption-evaluator";
import { calcInheritanceDeductions } from "./deductions/inheritance-deductions";
import {
  DEFAULT_INHERITANCE_GIFT_BRACKETS,
  calcInheritanceGiftTax,
  aggregatePriorGiftsForInheritance,
  isWithin13Cutoff,
  calcFuneralExpenseDeduction,
  calcGenerationSkipSurcharge,
} from "./inheritance-gift-common";
import { calcInheritanceTaxCredits } from "./inheritance-gift-tax-credit";
import { evaluatePresumedInheritance } from "./presumed-inheritance";
import { calcCorporateExemption } from "./inheritance-corporate-exemption";
import { calcHeirAllocation } from "./inheritance-allocation";
import { buildSummaryCategory } from "./inheritance-asset-category";
import { computeLegalShares } from "./inheritance-legal-share";
import { deriveCollateralDebts } from "./inheritance-collateral-debt";
import { sumCollateralDebt } from "./inheritance-collateral-debt";
import { toCollateralDebtItems } from "./inheritance-collateral-debt";
import type { TaxBracket } from "./types";

// ============================================================
// 상속세 메인 계산
// ============================================================

export interface InheritanceTaxEngineOptions {
  /** §26 누진세율 구간 (DB에서 로드; 기본값 사용 시 undefined) */
  brackets?: TaxBracket[];
  /** 국외재산 비율 (외국납부세액공제 한도 계산용) */
  foreignPropertyRatio?: number;
}

/**
 * 상속세 전체 계산
 *
 * @param input 상속세 계산 입력
 * @param options 세율 구간 등 옵션
 */
export function calcInheritanceTax(
  input: InheritanceTaxInput,
  options: InheritanceTaxEngineOptions = {},
): InheritanceTaxResult {
  const brackets = options.brackets ?? DEFAULT_INHERITANCE_GIFT_BRACKETS;
  const appliedLawDate = input.deathDate;
  const allBreakdown: CalculationStep[] = [];
  const allWarnings: string[] = [];
  const allLaws: Set<string> = new Set([INH.TAXABLE_VALUE]);

  // ─────────────────────────────────────────────
  // STEP 1: 재산 평가
  // ─────────────────────────────────────────────
  const valuationResults = evaluateAllEstateItems(input.estateItems);

  const grossEstateValue = valuationResults.reduce(
    (sum, v) => sum + v.valuatedAmount,
    0,
  );

  allBreakdown.push({
    label: "상속재산 평가액 합계",
    amount: grossEstateValue,
    lawRef: INH.TAXABLE_VALUE,
  });

  for (const vr of valuationResults) {
    allWarnings.push(...vr.warnings);
  }

  // ─────────────────────────────────────────────
  // STEP 2: 비과세 차감
  // ─────────────────────────────────────────────
  let exemptAmount = 0;
  if (input.exemptions && input.exemptions.length > 0) {
    const { totalExemptAmount, breakdown: exemptBreakdown } =
      evaluateExemptions(input.exemptions, grossEstateValue);
    exemptAmount = totalExemptAmount;
    allBreakdown.push(...exemptBreakdown);
  }

  // ─────────────────────────────────────────────
  // STEP 3: 장례비·공과금·채무 차감 (§14)
  //   debtItems 입력 시 우선 적용 (협의분할 가능). 미입력 시 legacy debts·funeralExpense 사용.
  // ─────────────────────────────────────────────
  let funeralDeduction = 0;
  let nonFuneralDebts = 0;

  // 담보채무 §14 자동공제 (collateral-debt-auto-deduction) — opt-in ON 자산의 담보채권액을 derive
  const collateralDebts = deriveCollateralDebts(input.estateItems);
  const collateralTotal = sumCollateralDebt(collateralDebts);

  if (input.debtItems && input.debtItems.length > 0) {
    // 신규 debtItems 경로 — category별 합산 + 장례비 한도 적용
    let funeralMeal = 0; // 식대 한도 1천만
    let funeralBongan = 0; // 봉안 한도 5백만
    for (const di of input.debtItems) {
      if (di.category === "funeral") {
        if (di.isBongan) funeralBongan += di.amount;
        else funeralMeal += di.amount;
      } else {
        nonFuneralDebts += di.amount;
      }
    }
    funeralDeduction = Math.min(funeralMeal, 10_000_000) + Math.min(funeralBongan, 5_000_000);
    allBreakdown.push({
      label: "장례비 (식대 한도 1천만 + 봉안 한도 5백만)",
      amount: -funeralDeduction,
      lawRef: INH.DEBT_DEDUCTION,
      note: `식대 ${funeralMeal.toLocaleString()} → ${Math.min(funeralMeal, 10_000_000).toLocaleString()}, 봉안 ${funeralBongan.toLocaleString()} → ${Math.min(funeralBongan, 5_000_000).toLocaleString()}`,
    });
    allBreakdown.push({
      label: "공과금·채무 차감",
      amount: -nonFuneralDebts,
      lawRef: INH.DEBT_DEDUCTION,
    });
  } else {
    // Legacy 경로 — funeralExpense + debts
    const fd = calcFuneralExpenseDeduction(input.funeralExpense, input.funeralIncludesBongan);
    funeralDeduction = fd.deduction;
    allBreakdown.push(...fd.breakdown);
    nonFuneralDebts = input.debts;
    allBreakdown.push({
      label: "공과금·채무 차감",
      amount: -input.debts,
      lawRef: INH.DEBT_DEDUCTION,
    });
  }
  // 담보채무 §14 자동공제 합산 (debtItems/legacy 경로 무관 — 별개 출처)
  if (collateralTotal > 0) {
    nonFuneralDebts += collateralTotal;
    allBreakdown.push({
      label: "담보채무 §14 자동공제 (자산 평가 연동)",
      amount: -collateralTotal,
      lawRef: INH.DEBT_DEDUCTION,
      note: collateralDebts
        .map((d) => `${d.creditorName} ${d.amount.toLocaleString()}`)
        .join(", "),
    });
  }
  allLaws.add(INH.DEBT_DEDUCTION);
  const deductedBeforeAggregation = funeralDeduction + nonFuneralDebts;

  // ─────────────────────────────────────────────
  // STEP 3.5: 추정상속재산 §15 (Phase A)
  // ─────────────────────────────────────────────
  let presumedTotal = 0;
  let presumedDetail:
    | { items: ReturnType<typeof evaluatePresumedInheritance>["items"]; total: number }
    | undefined;
  if (input.presumedItems && input.presumedItems.length > 0) {
    const presumedResult = evaluatePresumedInheritance(input.presumedItems);
    presumedTotal = presumedResult.total;
    presumedDetail = presumedResult;
    for (const ir of presumedResult.items) {
      allBreakdown.push(...ir.breakdown);
    }
    allBreakdown.push({
      label: "추정상속재산 §15 합계",
      amount: presumedTotal,
      lawRef: INH.PRESUMPTION,
    });
    allLaws.add(INH.PRESUMPTION);
  }

  // ─────────────────────────────────────────────
  // STEP 4: 사전증여재산 합산 (§13)
  // ─────────────────────────────────────────────
  const { totalAmount: priorGiftAggregated, breakdown: priorGiftBreakdown } =
    aggregatePriorGiftsForInheritance(
      input.preGiftsWithin10Years,
      input.deathDate,
    );

  allBreakdown.push(...priorGiftBreakdown);

  // ─────────────────────────────────────────────
  // STEP 5: 상속세 과세가액 (추정상속재산 §15 포함)
  // ─────────────────────────────────────────────
  const taxableEstateValue = Math.max(
    0,
    grossEstateValue + presumedTotal - exemptAmount - deductedBeforeAggregation + priorGiftAggregated,
  );

  allBreakdown.push({
    label: "상속세 과세가액",
    amount: taxableEstateValue,
    lawRef: INH.TAXABLE_VALUE,
    note: "= 평가액 + 추정상속재산 - 비과세 - 장례·채무 + 사전증여",
  });

  // ─────────────────────────────────────────────
  // STEP 6: 상속공제 (§18~§24)
  // ─────────────────────────────────────────────
  // calcInheritanceDeductions가 내부에서 한도를 계산하므로 raw 금액 전달
  const { totalAmount: heirOnlyGifts } = aggregatePriorGiftsForInheritance(
    input.preGiftsWithin10Years,
    input.deathDate,
    true, // 상속인만
  );

  // Phase D §19 — 배우자 법정상속분 분자 자동 계산 (PDF 책 1862 표 산식)
  //   분자 = 총상속(본래+간주+추정) + 상속인 사전증여 (영리법인·legatee 제외)
  //          − 상속외자유증 − (채무 − 장례비) − 비과세
  //   × 배우자 법정지분(1.5/3.5) − 배우자 사전증여 과세표준 = 배우자 법정상속분
  //
  // 옵트인: spouseLegalShareOverride 미입력 + (legateeAmountNonHeir > 0
  //   OR priorGiftDeductionTotal > 0 OR 영리법인 사전증여 존재) 시 자동 발동.
  //   단순 케이스(legacy)는 기존 calcSpouseDeduction 기본 법정상속분 산정 유지.
  const hasCorporateGift = (input.preGiftsWithin10Years ?? []).some(
    (g) => g.beneficiaryType === "corporate",
  );
  const wantsAutoSpouseLegalShare =
    input.deductionInput.spouseLegalShareOverride === undefined &&
    ((input.deductionInput.legateeAmountNonHeir ?? 0) > 0 ||
      (input.deductionInput.priorGiftDeductionTotal ?? 0) > 0 ||
      hasCorporateGift);

  let computedSpouseLegalShare: number | undefined;
  if (wantsAutoSpouseLegalShare) {
    const spouseHeir = input.heirs.find((h) => h.relation === "spouse");
    if (spouseHeir) {
      // 상속인 사전증여 가산가액 (영리법인·legatee 제외)
      const heirGiftAmount = (input.preGiftsWithin10Years ?? []).reduce(
        (s, g) => s + (g.beneficiaryType === "heir" || (g.beneficiaryType === undefined && g.isHeir) ? g.giftAmount : 0),
        0,
      );
      // 배우자 사전증여 과세표준
      const spouseGiftTaxBase = (input.preGiftsWithin10Years ?? []).reduce(
        (s, g) => s + (g.doneeId === spouseHeir.id ? (g.giftTaxBase ?? g.giftAmount) : 0),
        0,
      );
      // 총상속재산 = grossEstateValue(본래+간주) + presumedTotal
      // 상속외자유증·재해손실은 deductionInput에서
      const legateeNonHeir = input.deductionInput.legateeAmountNonHeir ?? 0;
      const numerator =
        (grossEstateValue + presumedTotal) +
        heirGiftAmount -
        legateeNonHeir -
        (deductedBeforeAggregation - 0 /* 장례비 차감 안 함: STEP 3에서 deductedBeforeAggregation은 채무+장례비 합. 분자는 채무만 차감 */) -
        exemptAmount;
      // 장례비를 다시 더해서 채무만 차감한 결과로 보정
      // STEP 3에서 deductedBeforeAggregation = funeralDeduction + nonFuneralDebts
      // 분자는 채무만 차감 (장례비 제외) → numerator + funeralDeduction
      // 그러나 funeralDeduction 변수를 STEP 3에서 closure로 캡처해야 함 → 직접 계산
      let funeralAmount = 0;
      if (input.debtItems && input.debtItems.length > 0) {
        let meal = 0, bongan = 0;
        for (const di of input.debtItems) {
          if (di.category === "funeral") {
            if (di.isBongan) bongan += di.amount;
            else meal += di.amount;
          }
        }
        funeralAmount = Math.min(meal, 10_000_000) + Math.min(bongan, 5_000_000);
      } else {
        // legacy fallback
        const fd = calcFuneralExpenseDeduction(input.funeralExpense, input.funeralIncludesBongan);
        funeralAmount = fd.deduction;
      }
      // 정확 분자: + 장례비 (deductedBeforeAggregation에서 장례비 분 환산)
      const numeratorCorrected = numerator + funeralAmount;

      // 배우자 법정지분 비율 — 1.5/(1.5 + 자녀수)
      const childCount = input.heirs.filter((h) => h.relation === "child").length;
      const spouseRatio = 1.5 / (1.5 + childCount);
      const spouseLegalShareRaw = Math.floor(numeratorCorrected * spouseRatio);
      computedSpouseLegalShare = Math.max(0, spouseLegalShareRaw - spouseGiftTaxBase);

      allBreakdown.push({
        label: "§19 배우자 법정상속분 자동 산정",
        amount: computedSpouseLegalShare,
        lawRef: INH.SPOUSE_DEDUCTION,
        note: `분자 ${numeratorCorrected.toLocaleString()} × ${spouseRatio.toFixed(4)} − 배우자 사전증여 과세표준 ${spouseGiftTaxBase.toLocaleString()}`,
      });
    }
  }

  const deductionResult = calcInheritanceDeductions(
    {
      ...input.deductionInput,
      deathDate: input.deathDate,
      // override가 명시되어 있으면 그대로, 없으면 자동 계산값 사용
      spouseLegalShareOverride:
        input.deductionInput.spouseLegalShareOverride ?? computedSpouseLegalShare,
    },
    taxableEstateValue,
    heirOnlyGifts,
    // Phase D §24 — 한도 분자 보정 정보 (영리법인 포함 모든 사전증여 + 증여공제 + 상속외자유증)
    {
      totalPriorGiftAmount: priorGiftAggregated,
      priorGiftDeductionTotal: input.deductionInput.priorGiftDeductionTotal ?? 0,
      legateeAmountNonHeir: input.deductionInput.legateeAmountNonHeir ?? 0,
      disasterLossDeduction: input.deductionInput.disasterLossDeduction ?? 0,
    },
    // 가업상속공제 보조 입력 (2026-05-21 §18의2 정밀화)
    //   - estateItems: familyBusinessCategory 자동 합산용
    //   - taxIfNoFBD: §18의2② 200% 가드 산정용 (Phase F+ 정밀화 예정, 본 PR은 0 fallback)
    {
      estateItems: input.estateItems,
      taxIfNoFBD: 0,
    },
  );

  const totalDeduction = deductionResult.totalDeduction;
  allBreakdown.push(...deductionResult.breakdown);
  for (const law of deductionResult.appliedLaws) allLaws.add(law);

  // ─────────────────────────────────────────────
  // STEP 7: 과세표준 (상증법 §25 — 절사 규정 없음, 원 단위)
  // ─────────────────────────────────────────────
  const taxBase = Math.max(0, taxableEstateValue - totalDeduction);

  allBreakdown.push({
    label: "과세표준",
    amount: taxBase,
    lawRef: INH.TAX_RATE,
  });

  // ─────────────────────────────────────────────
  // STEP 8: 산출세액 (§26 누진세율)
  // ─────────────────────────────────────────────
  const computedTax = calcInheritanceGiftTax(taxBase, brackets);
  allLaws.add(INH.TAX_RATE);

  allBreakdown.push({
    label: `산출세액 (${INH.TAX_RATE} 누진세율)`,
    amount: computedTax,
    lawRef: INH.TAX_RATE,
  });

  // ─────────────────────────────────────────────
  // STEP 9: 세대생략 할증 (§27) — 분모 보정 (Phase F)
  //   PDF: 분모 = grossEstateWithGifts − 영리법인 등 사전증여 가액
  // ─────────────────────────────────────────────
  // 상속인·수유자 외 자(영리법인·기타)가 받은 사전증여 가액 합계
  const nonHeirNonLegateeGifts = (input.preGiftsWithin10Years ?? []).reduce(
    (sum, g) => sum + (g.beneficiaryType === "corporate" ? g.giftAmount : 0),
    0,
  );
  // 세대생략 할증 분모 = 상속세 과세가액 (PDF 책 1864 산식)
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
  const generationSkipSurcharge = genSkipResult.surchargeAmount;
  if (genSkipResult.breakdown.length > 0) {
    allBreakdown.push(...genSkipResult.breakdown);
    allLaws.add(INH.GENERATION_SKIP);
  }

  // ─────────────────────────────────────────────
  // STEP 10: 영리법인 §3의2② 면제 (Phase B)
  // ─────────────────────────────────────────────
  // §3의2② + 집행기준 28-0-1 — "§13에 따라 가산된" 영리법인 증여재산만 면제 대상.
  // §13 cutoff 도과 행은 priorGiftAggregated에서 제외되므로 면제 발동도 차단해야 함.
  // isWithin13Cutoff 헬퍼로 aggregatePriorGiftsForInheritance와 단일 진실 유지.
  const corporateGifts = (input.preGiftsWithin10Years ?? []).filter(
    (g) => g.beneficiaryType === "corporate" && isWithin13Cutoff(g, input.deathDate),
  );
  const corporateGiftTaxBase = corporateGifts.reduce(
    (s, g) => s + (g.giftTaxBase ?? g.giftAmount),
    0,
  );
  const corporateGiftComputedTax = corporateGifts.reduce(
    (s, g) => s + (g.corporateGiftComputedTax ?? 0),
    0,
  );

  let corporateExemption:
    | ReturnType<typeof calcCorporateExemption>
    | undefined;
  if (corporateGifts.length > 0 && corporateGiftComputedTax > 0) {
    // PR 2 (2026-05-22) — 영리법인 별 분배 명세 (부표 5) 매핑.
    // doneeId 로 corporate Heir 의 shareholders 조회. doneeId 누락 시 빈 주주 배열.
    const perCorporateInputs = (() => {
      // doneeId 별 corporate 사전증여 합산
      const byCorporateId = new Map<
        string,
        { inheritedAmount: number; taxBase: number; computedTax: number }
      >();
      let unassignedAmount = 0;
      let unassignedBase = 0;
      let unassignedTax = 0;
      for (const g of corporateGifts) {
        const base = g.giftTaxBase ?? g.giftAmount;
        const tax = g.corporateGiftComputedTax ?? 0;
        if (g.doneeId) {
          const prev = byCorporateId.get(g.doneeId) ?? {
            inheritedAmount: 0,
            taxBase: 0,
            computedTax: 0,
          };
          byCorporateId.set(g.doneeId, {
            inheritedAmount: prev.inheritedAmount + g.giftAmount,
            taxBase: prev.taxBase + base,
            computedTax: prev.computedTax + tax,
          });
        } else {
          unassignedAmount += g.giftAmount;
          unassignedBase += base;
          unassignedTax += tax;
        }
      }
      const items: Parameters<typeof calcCorporateExemption>[1] = { perCorporateInputs: [] };
      for (const [corporateId, agg] of byCorporateId.entries()) {
        const corporateHeir = input.heirs.find(
          (h) => h.id === corporateId && h.relation === "corporate",
        );
        items.perCorporateInputs!.push({
          corporateId,
          inheritedAmount: agg.inheritedAmount,
          taxBase: agg.taxBase,
          computedTax: agg.computedTax,
          shareholders: corporateHeir?.shareholders ?? [],
        });
      }
      // doneeId 미설정 사전증여 — 부표 5 행 미생성 (Heir 매핑 없으면 표시 불가).
      // 합계는 corporateGiftTaxBase·corporateGiftComputedTax 에 이미 포함되어 기본 면제 발동.
      void unassignedAmount; void unassignedBase; void unassignedTax;
      return items.perCorporateInputs!.length > 0 ? items : {};
    })();

    corporateExemption = calcCorporateExemption(
      {
        corporateGiftComputedTax,
        corporateGiftTaxBase,
        totalComputedTax: computedTax, // 할증 미포함 — PDF 책 1866
        totalTaxBase: taxBase,
      },
      perCorporateInputs,
    );
    allBreakdown.push(...corporateExemption.breakdown);
    allLaws.add(INH.TAXPAYER);
  }

  // ─────────────────────────────────────────────
  // STEP 11: 세액공제 (§28~§30·§69)
  // ─────────────────────────────────────────────
  const creditResult = calcInheritanceTaxCredits({
    creditInput: input.creditInput,
    computedTax,
    generationSkipSurcharge,
    foreignPropertyRatio: options.foreignPropertyRatio,
    taxableEstateValue,
    taxBase,
    deathDate: input.deathDate,
  });

  const totalTaxCredit = creditResult.totalCredit;
  allBreakdown.push(...creditResult.breakdown);
  for (const law of creditResult.appliedLaws) allLaws.add(law);

  // ─────────────────────────────────────────────
  // STEP 12: 결정세액 (총액)
  // ─────────────────────────────────────────────
  const finalTax = Math.max(
    0,
    computedTax + generationSkipSurcharge - totalTaxCredit,
  );

  allBreakdown.push({
    label: "결정세액",
    amount: finalTax,
    note: "= 산출세액 + 세대생략할증 - 세액공제",
  });

  // ─────────────────────────────────────────────
  // STEP 13: 상속인별 배부 (Phase C) — heirs·doneeId가 제공된 경우만
  // ─────────────────────────────────────────────
  let heirAllocationResult: ReturnType<typeof calcHeirAllocation> | undefined;
  // 자연인 상속인(corporate·legatee·isHeir=false 제외)이 1명 이상이면 항상 상속인별 배부.
  // 협의분할 입력 자산은 그대로, 미입력 자산은 법정상속분으로 자동 배분. (계획 §4 — 항상 배부 확정)
  const hasHeirAllocations =
    computeLegalShares(input.heirs).shares.length > 0 ||
    input.preGiftsWithin10Years.some((g) => g.doneeId);

  if (hasHeirAllocations) {
    // 추정상속재산 id→addedAmount Map 작성
    const presumedAddedById = new Map<string, number>();
    if (presumedDetail) {
      for (const ir of presumedDetail.items) {
        presumedAddedById.set(ir.id, ir.addedAmount);
      }
    }

    // estateItem id → 평가액 (협의분할 미입력 자산 법정상속분 배분 기준)
    const valuatedAmountById = new Map(
      valuationResults.map((v) => [v.estateItemId, v.valuatedAmount]),
    );

    heirAllocationResult = calcHeirAllocation({
      heirs: input.heirs,
      estateItems: input.estateItems,
      presumedItems: input.presumedItems ?? [],
      // 담보채무 §14 자동공제분을 협의분할 채무에 합산 (heirAllocations 비율 환산 완료)
      debtItems: [...(input.debtItems ?? []), ...toCollateralDebtItems(collateralDebts)],
      priorGifts: input.preGiftsWithin10Years,
      presumedAddedById,
      valuatedAmountById,
      taxBase,
      computedTax,
      generationSkipSurcharge,
      corporateExemption: corporateExemption?.amount ?? 0,
      corporateGiftTaxBase,
      grossEstateWithGifts: taxableEstateValue,
      isFiledOnTime: input.creditInput.isFiledOnTime,
    });
    allBreakdown.push(...heirAllocationResult.breakdown);
  }

  // Phase B5: summaryTable 조립 (PDF 표8 합계행 echo, 산식 변경 0)
  // heir-allocation-summary-table.engine.design.md §B5
  const corporateGiftTaxBaseForSummary = (input.preGiftsWithin10Years ?? []).reduce(
    (sum, g) => sum + (g.beneficiaryType === "corporate" ? (g.giftTaxBase ?? g.giftAmount) : 0),
    0,
  );
  const corporateExemptionLimitDisplay =
    corporateGiftTaxBaseForSummary > 0 && taxBase > 0
      ? Math.floor(
          ((computedTax + generationSkipSurcharge) *
            corporateGiftTaxBaseForSummary) /
            taxBase,
        )
      : 0;
  const categoryTotals = (() => {
    const t = { financial: 0, realEstate: 0, stock: 0, other: 0 };
    for (const item of input.estateItems ?? []) {
      const cat = buildSummaryCategory(item);
      const valuated =
        valuationResults.find((v) => v.estateItemId === item.id)
          ?.valuatedAmount ?? 0;
      t[cat] += valuated;
    }
    return t;
  })();
  const summaryTable = heirAllocationResult
    ? {
        distributableTaxBase: heirAllocationResult.indirectDistributionBase,
        surchargeTargetTaxableValue:
          taxableEstateValue - nonHeirNonLegateeGifts,
        distributableTaxBaseAfterGifts:
          heirAllocationResult.computedTaxShareDenominator,
        corporateExemptionLimitDisplay,
        categoryTotals,
        totalExcludedFromTaxation: exemptAmount,
      }
    : undefined;

  return {
    grossEstateValue,
    exemptAmount,
    deductedBeforeAggregation,
    priorGiftAggregated,
    taxableEstateValue,
    totalDeduction,
    taxBase,
    computedTax,
    generationSkipSurcharge,
    totalTaxCredit,
    finalTax,
    deductionDetail: deductionResult,
    creditDetail: creditResult,
    valuationResults,
    breakdown: allBreakdown,
    appliedLaws: Array.from(allLaws),
    warnings: allWarnings,
    appliedLawDate,
    // 종합사례 PDF 확장
    presumedInheritanceDetail: presumedDetail,
    corporateExemption,
    heirAllocationResult,
    collateralDebtDetail: collateralDebts.length > 0 ? collateralDebts : undefined,
    // Phase B5 echo
    summaryTable,
  };
}
