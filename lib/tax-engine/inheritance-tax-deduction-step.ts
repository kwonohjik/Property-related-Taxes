/**
 * 상속세 — **STEP 6**: 상속공제(§18~§24) + 종합한도(§24).
 *
 * `inheritance-tax.ts`의 `calcInheritanceTax`에서 분리했다(800줄 정책).
 * **입력 5개·출력 2개**로 이음매가 좁고, 호출부가 구조분해로 받으므로 하류 참조가 바뀌지 않는다.
 *
 * ⚠️ `allBreakdown`·`allLaws`·`allWarnings`는 호출부 컬렉션을 그대로 받아 push/add한다.
 */
import type { InheritanceTaxInput, CalculationStep } from "./types/inheritance-gift.types";
import type {
  SpouseLegalShareTable,
  SpouseActualAmountTable,
  FinancialBreakdownRow,
} from "./types/inheritance-deduction-detail.types";
import type { TaxBracket } from "./types";
import { INH } from "./legal-codes";
import {
  calcInheritanceDeductions,
  computePriorGiftDeductionForLimit,
} from "./deductions/inheritance-deductions";
import { calcRelationDeduction } from "./deductions/gift-deductions";
import { safeMultiplyThenDivide } from "./tax-utils";
import {
  aggregatePriorGiftsForInheritance,
  calcFuneralExpenseDeduction,
} from "./inheritance-gift-common";
import { computeLegalShares } from "./inheritance-legal-share";
import { buildPhaseDFinancialRows } from "./inheritance-tax-financial-rows";
import { computeTaxIfNoFamilyBusinessDeduction } from "./deductions/family-business-200pct-guard";
import { deriveFamilyBusinessValue } from "./deductions/family-business";
import { makeMarriageBirthCapper } from "@/lib/calc/prior-gift-marriage-birth-cap";
import type { runEstateValuationSteps } from "./inheritance-tax-estate-steps";

export function runInheritanceDeductionStep(
  input: InheritanceTaxInput,
  allBreakdown: CalculationStep[],
  allLaws: Set<string>,
  allWarnings: string[],
  brackets: TaxBracket[],
  preGifts: NonNullable<InheritanceTaxInput["preGiftsWithin10Years"]>,
  /** STEP 1~5 산출물 — 필요한 값만 아래에서 푼다. */
  estate: ReturnType<typeof runEstateValuationSteps>,
) {
  const {
    collateralDebts,
    cutoffFilteredGifts,
    deductedBeforeAggregation,
    exemptAmount,
    grossEstateValue,
    nonFuneralDebts,
    presumedTotal,
    priorGiftAggregated,
    taxableEstateValue,
  } = estate;
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
      // 상속인 사전증여 가산가액 (영리법인·legatee 제외) — §13 cutoff 내 분만 합산 (M-1 수정)
      // STEP4.5의 cutoffFilteredGifts와 동일 기준 적용 → STEP4 과세가액 가산분과 정합.
      const heirGiftAmount = (cutoffFilteredGifts ?? []).reduce(
        (s, g) => s + (g.beneficiaryType === "heir" || (g.beneficiaryType === undefined && g.isHeir) ? g.giftAmount : 0),
        0,
      );
      // 배우자 사전증여 과세표준 — §13 cutoff 내 분만 합산 (M-1 수정)
      // giftTaxBase 명시 우선, 미설정 시 (giftAmount − §53 관계공제) 자동 도출.
      // (상속세 모드엔 giftTaxBase 입력 UI 없어 가액 fallback 시 과대 차감되던 버그 차단. 배우자 760m → 160m)
      // §53의2③ 수증자별 합산 1억 캡 — spouse doneeId 기준 누적(캡 독립이라 다른 호출처와 정합).
      const spouseMbCapper = makeMarriageBirthCapper();
      const spouseGiftTaxBase = (cutoffFilteredGifts ?? []).reduce((s, g) => {
        if (g.doneeId !== spouseHeir.id) return s;
        if (g.giftTaxBase !== undefined) return s + g.giftTaxBase;
        if (!g.doneeRelation) return s + g.giftAmount;
        const ded = calcRelationDeduction(
          { donorRelation: g.doneeRelation, priorUsedDeduction: 0 },
          g.giftAmount,
        ).relationDeduction;
        // §53의2 (직계존속 혼인·출산) — branch 2(giftTaxBase 미설정)에서만 적용.
        // branch 1(giftTaxBase 명시)은 과세표준에 이미 반영 → 무시(이중차감 금지).
        // 수증자별 합산 1억 캡: §53의2③ (capper.take — doneeId 기준 누적).
        const mbDed = spouseMbCapper.take(g);
        return s + Math.max(0, g.giftAmount - ded - mbDed);
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
        funeralAmount = calcFuneralExpenseDeduction(meal, bongan).deduction;
      } else {
        // legacy/simple fallback — funeralBonganExpense 우선, 없으면 boolean 호환
        const fd =
          input.funeralBonganExpense !== undefined
            ? calcFuneralExpenseDeduction(input.funeralExpense, input.funeralBonganExpense)
            : calcFuneralExpenseDeduction(input.funeralExpense, input.funeralIncludesBongan);
        funeralAmount = fd.deduction;
      }
      // 정확 분자: + 장례비 (deductedBeforeAggregation에서 장례비 분 환산)
      const numeratorCorrected = numerator + funeralAmount;

      // I-2 배우자 법정지분 비율 (민법 §1009) — computeLegalShares 재사용(dual-truth 해소).
      //   직접 카운트(childCount/coheirCount) 폐지 → 대습상속(§1001) 피대습 슬롯도 분모에 자동 산입.
      //   상속포기(isHeir===false)·수유자·법인 제외는 computeLegalShares가 동일 적용.
      //   비대습 케이스 결과 불변: 자녀2 → 3/7 = 1.5/3.5 동일.
      const legalForSpouse = computeLegalShares(input.heirs);
      const spouseShareEntry = legalForSpouse.shares.find(
        (s) => s.heirId === spouseHeir.id,
      );
      const sNum = spouseShareEntry?.numerator ?? 0;
      const spouseRatio = spouseShareEntry ? sNum / legalForSpouse.denominator : 0;
      // 정수 분자·분모 연산 (float 비율 곱셈은 무한소수에서 1원 오차 — distributeByLegalShares 패턴)
      const spouseLegalShareRaw = safeMultiplyThenDivide(numeratorCorrected, sNum, legalForSpouse.denominator);
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

  // E7(c): §22 금융재산 분해 rows[] 집계 — inheritance-tax-financial-rows.ts로 분리 (800줄).
  // 공제 base(suggestNetFinancialAssets)와 정합: Σ적격금융 − 금융채무 − 담보 금융저당. §22② 최대주주 제외.
  const phaseDFinancialRows: FinancialBreakdownRow[] = buildPhaseDFinancialRows(
    input.estateItems,
    input.debtItems,
    collateralDebts,
  );

  // override가 명시되어 있으면 그대로, 없으면 자동 계산값 사용
  const resolvedSpouseLegalShareOverride =
    input.deductionInput.spouseLegalShareOverride ?? computedSpouseLegalShare;
  // Phase D §24 — 한도 분자 보정 정보 (PASS1·PASS2 공유)
  const deductionLimitParams = {
    totalPriorGiftAmount: priorGiftAggregated,
    // §24 3호 증여재산공제: 명시 입력 우선(override), 미입력 시 사전증여 내역(§53 관계/giftTaxBase)에서 자동 도출.
    priorGiftDeductionTotal:
      input.deductionInput.priorGiftDeductionTotal ??
      computePriorGiftDeductionForLimit(preGifts, input.deathDate),
    legateeAmountNonHeir: input.deductionInput.legateeAmountNonHeir ?? 0,
    heirWaiverAmount: input.deductionInput.heirWaiverAmount ?? 0, // §24 ②2호 선순위 상속포기 (H-19)
    disasterLossDeduction: input.deductionInput.disasterLossDeduction ?? 0,
  };

  // ─────────────────────────────────────────────
  // E5 2-pass — §18의2② 중견기업 200% 가드용 taxIfNoFBD 실산정
  //   PASS1: 가업상속공제 제외 산출세액 → §3의2 가업상속인 안분 (상증령 §15⑦).
  //   중견기업(medium) 가업상속공제 경로에서만 발동 (그 외 0 → 가드 비활성, 회귀 0).
  // ─────────────────────────────────────────────
  let taxIfNoFBD = 0;
  const fbInput = input.deductionInput.familyBusiness;
  if (fbInput?.enterpriseSize === "medium") {
    const familyBusinessGross =
      input.deductionInput.familyBusinessValue ??
      deriveFamilyBusinessValue(input.estateItems, input.deathDate);
    const otherEstateNet = Math.max(
      0,
      (fbInput.heirOtherEstateValue ?? 0) - (fbInput.heirDebt ?? 0),
    );
    taxIfNoFBD = computeTaxIfNoFamilyBusinessDeduction({
      deductionInput: input.deductionInput,
      deathDate: input.deathDate,
      spouseLegalShareOverride: resolvedSpouseLegalShareOverride,
      taxableEstateValue,
      priorGiftToHeirTotal: heirOnlyGifts,
      limitParams: deductionLimitParams,
      estateItems: input.estateItems,
      brackets,
      familyBusinessGross,
      otherEstateNet,
    }).taxIfNoFBD;
  }

  // PASS2 — 가업상속공제 적용 (taxIfNoFBD 주입)
  const deductionResult = calcInheritanceDeductions(
    {
      ...input.deductionInput,
      deathDate: input.deathDate,
      decedentType: input.decedentType, // C-12/C-13: 비거주자 공제 게이트 (§18만)
      spouseLegalShareOverride: resolvedSpouseLegalShareOverride,
    },
    taxableEstateValue,
    heirOnlyGifts,
    deductionLimitParams,
    {
      estateItems: input.estateItems,
      taxIfNoFBD,
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

  // H-18: §23의2①1호 동거연수 10년 미달 시 공제 차단(deductions에서 exclusionReason="under_ten_years").
  //   cohabitStartDate 입력 시에만 판정 → 경고도 차단 사실을 명시.
  const cohabitYearsResult = deductionResult.cohabitDeductionDetail?.cohabitYears;
  if (cohabitYearsResult && !cohabitYearsResult.meetsRequirement) {
    allWarnings.push(
      `동거연수 ${cohabitYearsResult.effectiveYears}년 — §23의2①1호 10년 요건(미성년 기간 제외) 미충족으로 동거주택 상속공제를 적용하지 않았습니다. 실제 동거기간을 확인하세요.`,
    );
  }
  return { deductionResult, totalDeduction, heirOnlyGifts };
}
