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
  InheritanceGenerationSkipDetail,
  InheritanceGenerationSkipHeirRow,
} from "./types/inheritance-gift.types";
import type {
  SpouseLegalShareTable,
  SpouseActualAmountTable,
  FinancialBreakdownRow,
} from "./types/inheritance-deduction-detail.types";
import { resolveEstateItemValue } from "./valuation/resolve-estate-item-value";

import { evaluateAllEstateItems } from "./property-valuation";
import {
  evaluateExemptions,
} from "./exemption-evaluator";
import {
  calcInheritanceDeductions,
  computePriorGiftDeductionForLimit,
} from "./deductions/inheritance-deductions";
import { calcRelationDeduction } from "./deductions/gift-deductions";
import {
  DEFAULT_INHERITANCE_GIFT_BRACKETS,
  calcInheritanceGiftTax,
  findApplicableBracket,
  aggregatePriorGiftsForInheritance,
  isWithin13Cutoff,
  calcFuneralExpenseDeduction,
} from "./inheritance-gift-common";
import { calcInheritanceTaxCredits } from "./inheritance-gift-tax-credit";
import { evaluatePresumedInheritance } from "./presumed-inheritance";
import { calcCorporateExemption } from "./inheritance-corporate-exemption";
import { calcHeirAllocation } from "./inheritance-allocation";
import { computeGenerationSkipSurcharge } from "./inheritance-generation-skip";
import { derivePriorGiftTaxBase } from "./inheritance-prior-gift-taxbase";
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
  // STEP 0.5: §53 증여재산공제 사전 도출 (상증법 §53, KoreanLaw mst 276123 검증 2026-06-01)
  //   상속세 모드 UI(GiftRowEditor)는 giftTaxBase 입력란이 없어(증여세 모드 전용) 항상 undefined.
  //   → doneeId → heirs.relation → §53 관계공제(배우자 6억·직계비속 5천 등, 수증자 단위 10년 통산)를
  //     미리 도출하여 이후 전 STEP(§19 배우자공제·§24 종합한도·STEP 13 상속인별 배부)에서 일관 사용.
  //   ① giftTaxBase 명시 건은 보존(회귀 0) ② doneeId/관계 기반 도출 ④ legatee·corporate·orphan 미개입.
  //   이후 `input.preGiftsWithin10Years` 직접 참조 금지 — `preGifts`로 통일.
  // ─────────────────────────────────────────────
  const preGifts =
    input.preGiftsWithin10Years && input.heirs && input.heirs.length > 0
      ? derivePriorGiftTaxBase(input.preGiftsWithin10Years, input.heirs)
      : (input.preGiftsWithin10Years ?? []);

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
      preGifts,
      input.deathDate,
    );

  allBreakdown.push(...priorGiftBreakdown);

  // ─────────────────────────────────────────────
  // STEP 4.5: §13 cutoff 필터 끌어올림 (STEP 8.5·9·13 공유)
  //   cutoffFilteredGifts는 이하 세 STEP에서 동일 집합을 참조.
  //   (기존 STEP 13 내부에서 중복 계산하던 것을 단일 진실로 통일)
  // ─────────────────────────────────────────────
  const cutoffFilteredGifts = preGifts.filter(
    (g) => isWithin13Cutoff(g, input.deathDate),
  );

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
    preGifts,
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
  // I-1 정밀산식 단일화 (인터뷰 2026-05-31) — 배우자 상속인 + spouseLegalShareOverride 미입력이면
  //   항상 정밀 법정상속분 산정. (기존 legatee>0·증여공제>0·영리법인 조건부 + calcLegalShareRatios 근사식 폐기)
  const wantsAutoSpouseLegalShare =
    input.deductionInput.spouseLegalShareOverride === undefined;

  // E7(a): Phase D closure 결과 보관 — 블록 밖 선언으로 patch 가능
  let phaseDLegalShareTable: SpouseLegalShareTable | undefined;
  let computedSpouseLegalShare: number | undefined;
  if (wantsAutoSpouseLegalShare) {
    const spouseHeir = input.heirs.find((h) => h.relation === "spouse");
    if (spouseHeir) {
      // 상속인 사전증여 가산가액 (영리법인·legatee 제외)
      const heirGiftAmount = (preGifts ?? []).reduce(
        (s, g) => s + (g.beneficiaryType === "heir" || (g.beneficiaryType === undefined && g.isHeir) ? g.giftAmount : 0),
        0,
      );
      // 배우자 사전증여 과세표준
      // 배우자 사전증여 과세표준 — giftTaxBase 명시 우선, 미설정 시 (giftAmount − §53 관계공제) 자동 도출.
      // (상속세 모드엔 giftTaxBase 입력 UI 없어 가액 fallback 시 과대 차감되던 버그 차단. 배우자 760m → 160m)
      const spouseGiftTaxBase = (preGifts ?? []).reduce((s, g) => {
        if (g.doneeId !== spouseHeir.id) return s;
        if (g.giftTaxBase !== undefined) return s + g.giftTaxBase;
        if (!g.doneeRelation) return s + g.giftAmount;
        const ded = calcRelationDeduction(
          { donorRelation: g.doneeRelation, priorUsedDeduction: 0 },
          g.giftAmount,
        ).relationDeduction;
        return s + Math.max(0, g.giftAmount - ded);
      }, 0);
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

      // I-2 배우자 법정지분 비율 (민법 §1009) — 직계비속 우선, 없으면 직계존속. 수유자·법인 제외.
      const childCount = input.heirs.filter((h) => h.relation === "child").length;
      const ascendantCount = input.heirs.filter(
        (h) => h.relation === "lineal_ascendant",
      ).length;
      const coheirCount = childCount > 0 ? childCount : ascendantCount;
      const spouseRatio = 1.5 / (1.5 + coheirCount);
      const spouseLegalShareRaw = Math.floor(numeratorCorrected * spouseRatio);
      computedSpouseLegalShare = Math.max(0, spouseLegalShareRaw - spouseGiftTaxBase);

      allBreakdown.push({
        label: "§19 배우자 법정상속분 자동 산정",
        amount: computedSpouseLegalShare,
        lawRef: INH.SPOUSE_DEDUCTION,
        note: `분자 ${numeratorCorrected.toLocaleString()} × ${spouseRatio.toFixed(4)} − 배우자 사전증여 과세표준 ${spouseGiftTaxBase.toLocaleString()}`,
      });

      // E7(a): Phase D closure 값으로 legalShareTable 조립 (7행)
      // 교재 §19①1호 분자 산식: (A−B+C) × D − E = 배우자 법정상속분
      phaseDLegalShareTable = {
        grossPlusPresumed: grossEstateValue + presumedTotal,
        heirPriorGiftAdded: heirGiftAmount,
        legateeNonHeirDeducted: legateeNonHeir,
        debtDeducted: nonFuneralDebts,    // 채무만 (장례비 제외)
        exemptDeducted: exemptAmount,
        numerator: numeratorCorrected,
        spouseRatio,
        spouseLegalShareRaw,
        spouseGiftTaxBaseDeducted: spouseGiftTaxBase,
        legalShare: computedSpouseLegalShare,
      } satisfies SpouseLegalShareTable;
    }
  }

  // E7(b): 배우자 실제상속액 집계 (D-2 A — estateItems/debtItems 배우자 heirAllocations 합산)
  // §19-17-1: 배우자 실제 상속액 = 배우자 귀속 자산 − 배우자 승계 채무(장례비 제외)
  // lib/calc import 금지 → orchestrator에서 직접 집계
  let phaseDActualAmountTable: SpouseActualAmountTable | undefined;
  {
    const spouseHeir = input.heirs.find((h) => h.relation === "spouse");
    if (spouseHeir) {
      let spouseAssetTotal = 0;
      let hasAnyAllocation = false;
      for (const item of input.estateItems) {
        if (!item.heirAllocations) continue;
        hasAnyAllocation = true;
        for (const alloc of item.heirAllocations) {
          if (alloc.heirId === spouseHeir.id) spouseAssetTotal += alloc.amount;
        }
      }
      if (hasAnyAllocation) {
        // 배우자 승계 채무 (장례비 제외)
        let spouseDebtTotal = 0;
        for (const debt of input.debtItems ?? []) {
          if (debt.category === "funeral") continue;
          if (!debt.heirAllocations) continue;
          for (const alloc of debt.heirAllocations) {
            if (alloc.heirId === spouseHeir.id) spouseDebtTotal += alloc.amount;
          }
        }
        const actualAmount = Math.max(0, spouseAssetTotal - spouseDebtTotal);
        phaseDActualAmountTable = {
          spouseEstateValue: spouseAssetTotal,
          spouseDebtDeducted: spouseDebtTotal,
          spouseExemptDeducted: 0,
          actualAmount,
        } satisfies SpouseActualAmountTable;
      }
    }
  }

  // E7(c): 금융재산 분해 rows[] 집계 (D-1 A — §22 자동 집계, §22② 최대주주 제외 포함)
  // lib/calc/financial-deduction-resolver import 금지 → 엔진 내부 판정 로직을 인라인으로 재구현
  // (단일 진실 원칙 — 집계 결과를 financialDeductionDetail.rows에 주입; 판정 기준은 동일 §22①·②)
  const phaseDFinancialRows: FinancialBreakdownRow[] = (() => {
    // 자산 종류별 집계: 예금·상장주식·보험금·기타금융 구분
    let depositTotal = 0;
    let listedStockTotal = 0;
    let insuranceTotal = 0;
    let otherFinancialTotal = 0;
    for (const item of input.estateItems) {
      // §22② 최대주주 강제 배제 (엔진 내부 판정 — lib/calc 미사용)
      const isMajorShareholder =
        item.isSection22MajorShareholder === true ||
        item.unlistedStockValuationV2?.isSection22MajorShareholder === true;
      if (isMajorShareholder) continue;
      // 사용자 명시 배제
      if (item.isFinancialAssetForDeduction === false) continue;
      // §22 적격 판정 (카테고리 기반 — financial·listed_stock + deemedCategory insurance)
      const val = resolveEstateItemValue(item);
      if (val <= 0) continue;
      if (item.deemedCategory === "insurance") {
        insuranceTotal += val;
      } else if (item.category === "listed_stock") {
        listedStockTotal += val;
      } else if (item.category === "financial") {
        // 사용자 명시 포함이거나 카테고리 default true
        if (item.isFinancialAssetForDeduction === true || item.isFinancialAssetForDeduction === undefined) {
          depositTotal += val;
        }
      } else if (item.category === "unlisted_stock") {
        if (item.isFinancialAssetForDeduction === true) {
          otherFinancialTotal += val;
        }
      } else {
        // 그 외: 사용자 명시 포함만
        if (item.isFinancialAssetForDeduction === true) {
          otherFinancialTotal += val;
        }
      }
    }
    // 금융채무 집계 (category=financial debtItem)
    let financialDebtTotal = 0;
    for (const debt of input.debtItems ?? []) {
      if (debt.category !== "financial") continue;
      if (debt.isFinancialDebtForDeduction === false) continue;
      financialDebtTotal += debt.amount;
    }
    const rows: FinancialBreakdownRow[] = [];
    if (depositTotal > 0) rows.push({ label: "예금", amount: depositTotal });
    if (listedStockTotal > 0) rows.push({ label: "상장주식", amount: listedStockTotal });
    if (insuranceTotal > 0) rows.push({ label: "보험금", amount: insuranceTotal });
    if (otherFinancialTotal > 0) rows.push({ label: "기타금융", amount: otherFinancialTotal });
    if (financialDebtTotal > 0) rows.push({ label: "금융채무", amount: financialDebtTotal });
    return rows;
  })();

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
      // §24 3호 증여재산공제: 명시 입력 우선(override), 미입력 시 사전증여 내역(§53 관계/giftTaxBase)에서 자동 도출.
      // 배우자 법정상속분 분자와 동일 산식 — 수동 미입력 시 0으로 누락되던 dual-truth 차단.
      priorGiftDeductionTotal:
        input.deductionInput.priorGiftDeductionTotal ??
        computePriorGiftDeductionForLimit(
          preGifts,
          input.deathDate,
        ),
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

  // E7 patch: detail 필드 3종 주입 (result는 calcInheritanceDeductions가 이미 기본 조립; orchestrator가 추가 정보 보강)
  // (a) spouseDeductionDetail — legalShareTable(Phase D) + actualAmountTable(협의분할 집계) 보강
  if (deductionResult.spouseDeductionDetail) {
    deductionResult.spouseDeductionDetail.legalShareTable = phaseDLegalShareTable;
    deductionResult.spouseDeductionDetail.actualAmountTable = phaseDActualAmountTable;
  }
  // (b) financialDeductionDetail — rows[] 주입 (estateItems/debtItems 종류별 집계)
  if (deductionResult.financialDeductionDetail) {
    deductionResult.financialDeductionDetail.rows = phaseDFinancialRows;
  }

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
  // ⑦ 산식 표시용 echo — 적용 한계세율·누진공제 (계산 영향 0, 동일 brackets 조회)
  const { rate: computedTaxAppliedRate, deduction: computedTaxProgressiveDeduction } =
    findApplicableBracket(taxBase, brackets);
  allLaws.add(INH.TAX_RATE);

  allBreakdown.push({
    label: `산출세액 (${INH.TAX_RATE} 누진세율)`,
    amount: computedTax,
    lawRef: INH.TAX_RATE,
  });

  // valuatedAmountById — STEP 8.5(genSkip) 및 STEP 13(calcHeirAllocation) 공유
  const valuatedAmountById = new Map(
    valuationResults.map((v) => [v.estateItemId, v.valuatedAmount]),
  );

  // ─────────────────────────────────────────────
  // STEP 8.5 + 9: 세대생략 할증 (§27) — inheritance-generation-skip.ts 분리 (800줄 정책)
  // ─────────────────────────────────────────────
  const genSkip = computeGenerationSkipSurcharge({
    input,
    computedTax,
    taxBase,
    taxableEstateValue,
    preGifts: preGifts ?? [],
    cutoffFilteredGifts,
    valuatedAmountById,
  });
  const {
    generationSkipSurcharge,
    perHeirSurcharge,
    generationSkipDetail,
    nonHeirNonLegateeGifts,
  } = genSkip;
  allBreakdown.push(...genSkip.breakdown);
  if (genSkip.lawApplied) allLaws.add(INH.GENERATION_SKIP);

  // ─────────────────────────────────────────────
  // STEP 10: 영리법인 §3의2② 면제 (Phase B)
  // ─────────────────────────────────────────────
  // §3의2② + 집행기준 28-0-1 — "§13에 따라 가산된" 영리법인 증여재산만 면제 대상.
  // §13 cutoff 도과 행은 priorGiftAggregated에서 제외되므로 면제 발동도 차단해야 함.
  // isWithin13Cutoff 헬퍼로 aggregatePriorGiftsForInheritance와 단일 진실 유지.
  const corporateGifts = (preGifts ?? []).filter(
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
  // STEP 13: 상속인별 배부 (Phase C) — heirs·doneeId·세대생략 수유자가 제공된 경우
  // ─────────────────────────────────────────────
  let heirAllocationResult: ReturnType<typeof calcHeirAllocation> | undefined;
  // 자연인 상속인(corporate·legatee·isHeir=false 제외)이 1명 이상이면 항상 상속인별 배부.
  // 세대생략 수유자(isGenerationSkipBeneficiary)가 있어도 배부 진입 (D2 추가).
  const hasHeirAllocations =
    computeLegalShares(input.heirs).shares.length > 0 ||
    preGifts.some((g) => g.doneeId) ||
    input.heirs.some((h) => h.isGenerationSkipBeneficiary);

  if (hasHeirAllocations) {
    // 추정상속재산 id→addedAmount Map 작성
    const presumedAddedById = new Map<string, number>();
    if (presumedDetail) {
      for (const ir of presumedDetail.items) {
        presumedAddedById.set(ir.id, ir.addedAmount);
      }
    }

    // 2-C 수정: calcHeirAllocation에 cutoff-필터된 증여만 전달 (§13 도과분 제외).
    //   cutoffFilteredGifts는 STEP 4.5에서 이미 계산 (단일 진실).
    heirAllocationResult = calcHeirAllocation({
      heirs: input.heirs,
      estateItems: input.estateItems,
      presumedItems: input.presumedItems ?? [],
      // 담보채무 §14 자동공제분을 협의분할 채무에 합산 (heirAllocations 비율 환산 완료)
      debtItems: [...(input.debtItems ?? []), ...toCollateralDebtItems(collateralDebts)],
      priorGifts: cutoffFilteredGifts,
      presumedAddedById,
      valuatedAmountById,
      taxBase,
      computedTax,
      generationSkipSurcharge,
      perHeirSurcharge,
      corporateExemption: corporateExemption?.amount ?? 0,
      corporateGiftTaxBase,
      grossEstateWithGifts: taxableEstateValue,
      isFiledOnTime: input.creditInput.isFiledOnTime,
    });
    allBreakdown.push(...heirAllocationResult.breakdown);
  }

  // Phase B5: summaryTable 조립 (PDF 표8 합계행 echo, 산식 변경 0)
  // heir-allocation-summary-table.engine.design.md §B5
  const corporateGiftTaxBaseForSummary = (preGifts ?? []).reduce(
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
    computedTaxAppliedRate,
    computedTaxProgressiveDeduction,
    generationSkipSurcharge,
    generationSkipDetail,
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
