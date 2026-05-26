/**
 * Phase 4 진입점 — 비상장주식 V2 평가 (별지 부표3 완전 재현)
 *
 * 법령: 상증법 §63 + 상증령 §54·§55·§56·§59 + 상증규 §17·§17의2·§17의3·§19
 *      (KoreanLaw 검증 2026-05-22)
 *
 * 파이프라인 (별지 부표3 6쪽 → 5쪽 → 2~3쪽 → 1쪽 순):
 *   STEP 1 — 사업연도별 다.순손익액 (fiscal-year-net-income.ts)
 *   STEP 2 — 라.유상증자·감자 조정 (capital-increase-adjustment.ts)
 *   STEP 3 — 마.최종 순손익액 = 다 + 라
 *   STEP 4 — 바.환산주식수 (converted-shares.ts)
 *   STEP 5 — 사.1주당 순손익액 / 아.가중평균 / 차.1주당 순손익가치 ⑤ (weighted-avg.ts)
 *   STEP 6 — 순자산가액 + 영업권 (net-asset-calc.ts + goodwill.ts) → ③·④
 *   STEP 7 — ⑥-㉠·㉡·⑥ 1주당 평가액 (weighted-avg.ts)
 *   STEP 8 — ⑦·⑧·⑨ 할증평가 (max-shareholder-premium.ts)
 *   STEP 9 — 최종 평가액 × 보유주식수
 *
 * §54④ short-circuit:
 *   1·2·6호 무조건 → 가중평균 비활성, ⑥ = ④
 *   3·5호 단서 → 가중평균 < 순자산일 때만 ⑥ = ④
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md
 * Design: docs/02-design/features/inheritance-unlisted-stock-valuation.engine.design.md
 */

import type {
  UnlistedStockValuationInput,
  UnlistedStockValuationResult,
  FiscalYearBreakdown,
} from "@/lib/tax-engine/types/unlisted-stock-valuation.types";
import { calcFiscalYearNetIncome } from "./fiscal-year-net-income";
import { calcConvertedShares } from "./converted-shares";
import { annualizePerShareNetIncome } from "./fiscal-year-annualize";
import { fiscalYearMonths } from "./fiscal-year-annualize";
import {
  calcWeightedAvg3y,
  calcPerShareNetIncomeValue,
  calcPerShareWeightedValuation,
  calcNetAssetFloor80,
  calcFinalPerShareValue,
} from "./weighted-avg";
import { calcNetAssetTotal, calcNetAssetPerShare } from "./net-asset-calc";
import { calcGoodwill } from "./goodwill";
import { calcCapitalIncreaseAdjustment } from "./capital-increase-adjustment";
import { calcMaxShareholderPremium } from "./max-shareholder-premium";
import { resolveEvaluationDelta } from "./evaluation-delta";
import { evaluateOtherUnlistedHoldings } from "./other-unlisted-holdings";
import { applyEvaluationCommittee } from "./evaluation-committee-section-54-6";
import { toOptionalDate } from "@/lib/api/date-coerce";

/**
 * 비상장주식 V2 평가 진입점
 */
export function evaluateUnlistedStockV2(
  input: UnlistedStockValuationInput,
): UnlistedStockValuationResult {
  const warnings: string[] = [];
  const appliedRules: string[] = ["상증법 §63 ① 1호 나목 + 상증령 §54 ①"];
  const capRate = input.capitalizationRate > 0 ? input.capitalizationRate : 0.10;
  const goodwillRate = input.goodwillRate ?? 0.10;

  // STEP 1: 사업연도별 다.순손익액
  const adjustedIncomes = input.fiscalYears.map((fy) => calcFiscalYearNetIncome(fy));

  // STEP 2: 라.유상증자·감자 조정
  // 방어: sessionStorage/이력 복원 시 날짜가 string으로 도달하면 capital-increase·converted-shares의
  //       raw Date 비교(`>=`/`>`)가 silent false가 되어 §56⑤ 조정·환산주식수가 0으로 떨어진다
  //       (CLAUDE.md date-coerce 함정). 하위 모듈 진입 전 toOptionalDate로 Date 정규화한다.
  //       invalid(미입력 등)는 원본을 유지해 비교에서 안전하게 제외(0)된다.
  const fiscalYearEndDates: [Date, Date, Date] = [
    toOptionalDate(input.fiscalYears[0].fiscalYearEndDate) ?? input.fiscalYears[0].fiscalYearEndDate,
    toOptionalDate(input.fiscalYears[1].fiscalYearEndDate) ?? input.fiscalYears[1].fiscalYearEndDate,
    toOptionalDate(input.fiscalYears[2].fiscalYearEndDate) ?? input.fiscalYears[2].fiscalYearEndDate,
  ];
  const normalizedCapitalChanges = input.capitalChanges.map((c) => ({
    ...c,
    changeDate: toOptionalDate(c.changeDate) ?? c.changeDate,
  }));
  const capitalAdjustments = calcCapitalIncreaseAdjustment(
    normalizedCapitalChanges,
    fiscalYearEndDates,
    capRate,
  );

  // STEP 3: 마.최종 순손익액 = 다 + 라
  const finalNetIncomes: [number, number, number] = [
    adjustedIncomes[0].adjustedNetIncome + capitalAdjustments[0],
    adjustedIncomes[1].adjustedNetIncome + capitalAdjustments[1],
    adjustedIncomes[2].adjustedNetIncome + capitalAdjustments[2],
  ];

  // STEP 4: 바.환산주식수 (§17의3⑤ 충실 — 연도별 누적 환산 + 3년 윈도우 필터)
  //   정상 complete-chain → [totalShares, totalShares, totalShares] (telescoping 항등식)
  const conversionResult = calcConvertedShares({
    totalShares: input.totalShares,
    fiscalYearEndDates,
    evaluationDate: toOptionalDate(input.evaluationDate) ?? input.evaluationDate,
    capitalChanges: normalizedCapitalChanges,
  });
  const convertedShares = conversionResult.convertedShares;
  warnings.push(...conversionResult.warnings);
  appliedRules.push(
    `상증규 §17의3⑤ 환산주식수 — 평가기간(3년) 내 자본변동 ${conversionResult.windowChangeCount}건 반영`,
  );

  // STEP 5: 사.1주당 순손익액
  const perShareNetIncomes: [number, number, number] = [
    convertedShares[0] > 0 ? Math.floor(finalNetIncomes[0] / convertedShares[0]) : 0,
    convertedShares[1] > 0 ? Math.floor(finalNetIncomes[1] / convertedShares[1]) : 0,
    convertedShares[2] > 0 ? Math.floor(finalNetIncomes[2] / convertedShares[2]) : 0,
  ];

  // §17의3② 1년 미만 사업연도 연환산 (1주당 산출 후·가중평균 직전, §56④→⑤→환산주식수→1주당→§17의3②→§56①)
  const annualizedPerShare: [number, number, number] = [
    annualizePerShareNetIncome(perShareNetIncomes[0], input.fiscalYears[0].fiscalYearStartDate, input.fiscalYears[0].fiscalYearEndDate),
    annualizePerShareNetIncome(perShareNetIncomes[1], input.fiscalYears[1].fiscalYearStartDate, input.fiscalYears[1].fiscalYearEndDate),
    annualizePerShareNetIncome(perShareNetIncomes[2], input.fiscalYears[2].fiscalYearStartDate, input.fiscalYears[2].fiscalYearEndDate),
  ];
  const annualizationApplied: [boolean, boolean, boolean] = [
    fiscalYearMonths(input.fiscalYears[0].fiscalYearStartDate, input.fiscalYears[0].fiscalYearEndDate) < 12,
    fiscalYearMonths(input.fiscalYears[1].fiscalYearStartDate, input.fiscalYears[1].fiscalYearEndDate) < 12,
    fiscalYearMonths(input.fiscalYears[2].fiscalYearStartDate, input.fiscalYears[2].fiscalYearEndDate) < 12,
  ];
  // 아.1주당 가중평균 (§56①, 음수 시 0)
  const weightedNetIncomePerShare = calcWeightedAvg3y(annualizedPerShare);
  // 차.1주당 순손익가치 ⑤ = 아 ÷ 자.환원율
  const netIncomePerShare = calcPerShareNetIncomeValue(weightedNetIncomePerShare, capRate);

  // STEP 6: 순자산가액 + 영업권
  // PR-N: 행 단위 평가차액 입력 시 자산 합−부채 합 차액을 assetValuationDelta에 주입 (3중 패턴)
  //       행 미입력 시 기존 assetValuationDelta 총액 fallback. 별지 양식 2쪽 4.가.② 매핑.
  const evaluationDeltaResolved = resolveEvaluationDelta({
    assetDeltaRows: input.netAssetValueRaw.evaluationDeltaRows?.filter(
      (r) => r.category === "asset",
    ),
    liabilityDeltaRows: input.netAssetValueRaw.evaluationDeltaRows?.filter(
      (r) => r.category === "liability",
    ),
    assetEvaluationDeltaTotal: input.netAssetValueRaw.assetValuationDelta,
  });
  const netAssetResult = calcNetAssetTotal({
    ...input.netAssetValueRaw,
    assetValuationDelta: evaluationDeltaResolved.evaluationDelta,
  });

  // 영업권 산식용: 회사 전체 가중평균 순손익액 (§59③ 준용 §56①)
  // ★ §56① 후단 음수 시 0
  const companyWeightedRaw =
    (finalNetIncomes[0] * 3 + finalNetIncomes[1] * 2 + finalNetIncomes[2] * 1) / 6;
  const companyWeighted3y = Math.max(0, Math.floor(companyWeightedRaw));

  const goodwill = calcGoodwill({
    weightedAvg3y: companyWeighted3y,
    selfCapital: netAssetResult.netAssetBeforeGoodwill,
    rate: goodwillRate,
    netAssetOnlyReason: input.netAssetOnlyReason,
    isContinuousLossLastThreeYears: input.isContinuousLossLastThreeYears,
  });

  const netAssetTotal = netAssetResult.netAssetBeforeGoodwill + goodwill.goodwillFinal; // ③
  const netAssetPerShare = calcNetAssetPerShare(netAssetTotal, input.totalShares); // ④

  // STEP 7: ⑥-㉠·㉡·⑥ 1주당 평가액
  let weightedAvgPerShare = calcPerShareWeightedValuation(
    netIncomePerShare,
    netAssetPerShare,
    input.isRealEstateHeavy,
  );
  const netAssetFloor80 = calcNetAssetFloor80(netAssetPerShare);

  let finalPerShareValue: number;
  let netAssetFloorApplied = false;

  if (input.netAssetOnlyReason) {
    // 무조건 사유 (1·2·6호): 순자산 단독
    if (
      input.netAssetOnlyReason === "liquidation" ||
      input.netAssetOnlyReason === "lt3y" ||
      input.netAssetOnlyReason === "remaining_3y"
    ) {
      finalPerShareValue = netAssetPerShare;
      weightedAvgPerShare = 0; // 미적용 표시
      appliedRules.push(`§54④ ${input.netAssetOnlyReason} — 순자산 단독 (무조건)`);
    } else {
      // 단서 사유 (3·5호): 가중평균 < 순자산일 때만
      if (weightedAvgPerShare < netAssetPerShare) {
        finalPerShareValue = netAssetPerShare;
        appliedRules.push(
          `§54④ ${input.netAssetOnlyReason} 단서 발동 — 가중평균(${weightedAvgPerShare}) < 순자산(${netAssetPerShare})`,
        );
      } else {
        const result = calcFinalPerShareValue(weightedAvgPerShare, netAssetFloor80);
        finalPerShareValue = result.finalValue;
        netAssetFloorApplied = result.floorApplied;
      }
    }
  } else {
    // 본칙 §54①: max(가중평균, 80% 하한)
    const result = calcFinalPerShareValue(weightedAvgPerShare, netAssetFloor80);
    finalPerShareValue = result.finalValue;
    netAssetFloorApplied = result.floorApplied;
  }

  if (netAssetFloorApplied) {
    appliedRules.push("§54① 단서 — 80% 하한 발동");
  }

  // STEP 8: ⑦·⑧·⑨ 할증평가
  const premium = calcMaxShareholderPremium({
    finalPerShareValue,
    isMaxShareholder: input.isMaxShareholder,
    companySize: input.companySize,
    isContinuousLossLastThreeYears: input.isContinuousLossLastThreeYears,
  });

  if (premium.exclusionReason) {
    appliedRules.push(`§53⑧ ${premium.exclusionReason} — 할증 배제`);
  } else if (premium.premiumRate > 0) {
    appliedRules.push("§63③ 최대주주 할증 ×120%");
  }

  const finalPerShareForReporting = input.isMaxShareholder
    ? premium.premiumPerShare
    : premium.perShareValueNonMaxShareholder; // ⑨

  // STEP 9: 최종 평가액 × 보유주식수
  const totalValuation = finalPerShareForReporting * input.ownedShares;

  // 별지 6쪽 fiscalYearBreakdowns 조립
  const fiscalYearBreakdowns: [
    FiscalYearBreakdown,
    FiscalYearBreakdown,
    FiscalYearBreakdown,
  ] = [
    buildBreakdown(input, 0, adjustedIncomes[0], capitalAdjustments[0], finalNetIncomes[0], convertedShares[0], perShareNetIncomes[0]),
    buildBreakdown(input, 1, adjustedIncomes[1], capitalAdjustments[1], finalNetIncomes[1], convertedShares[1], perShareNetIncomes[1]),
    buildBreakdown(input, 2, adjustedIncomes[2], capitalAdjustments[2], finalNetIncomes[2], convertedShares[2], perShareNetIncomes[2]),
  ];

  // 경고 메시지
  if (goodwill.excludedByLaw) {
    warnings.push(`영업권 §55③ 자동 배제: ${goodwill.excludedByLaw}`);
  }
  if (netAssetResult.zeroFloorApplied) {
    warnings.push("순자산가액이 0 이하 — §55① 후단 0 처리");
  }
  if (perShareNetIncomes.some((v) => v < 0)) {
    warnings.push("일부 사업연도 1주당 순손익액 음수 — §56① 가중평균 후 0 가드 적용");
  }

  // PR-P (§54③): 다른 비상장주식 10% 이하 보유 옵션 평가 (참고용 메타)
  const otherUnlistedHoldingsEvaluated = evaluateOtherUnlistedHoldings(input.otherUnlistedHoldings);
  if (otherUnlistedHoldingsEvaluated && otherUnlistedHoldingsEvaluated.length > 0) {
    appliedRules.push("상증령 §54③ + 법인령 §74①1호마목 (다른 비상장주식 옵션)");
    for (const r of otherUnlistedHoldingsEvaluated) {
      for (const w of r.warnings) {
        warnings.push(`[${r.issuerCorpName}] ${w.message}`);
      }
    }
  }

  // PR-K (§54⑥): 평가심의위원회 신청 옵션 (70~130% 4방법) — 참고용 메타, 본 결과 무변경
  let evaluationCommitteeApplied: UnlistedStockValuationResult["evaluationCommitteeApplied"];
  if (input.evaluationCommittee) {
    evaluationCommitteeApplied = applyEvaluationCommittee(
      input.evaluationCommittee,
      finalPerShareValue,
    );
    appliedRules.push("상증령 §54⑥ + §49의2 (평가심의위원회 신청 옵션)");
    for (const w of evaluationCommitteeApplied.warnings) {
      warnings.push(`[평가심의위] ${w.message}`);
    }
  }

  return {
    netAssetTotal,
    netAssetPerShare,
    netIncomePerShare,
    weightedAvgPerShare,
    netAssetFloor80,
    finalPerShareValue,
    perShareValueNonMaxShareholder: premium.perShareValueNonMaxShareholder,
    premiumPerShare: premium.premiumPerShare,
    finalPerShareForReporting,
    netAssetFloorApplied,
    fiscalYearBreakdowns,
    weightedNetIncomePerShare,
    capitalizationRate: capRate,
    // §17의3② 연환산 echo (1년 미만 사업연도 있을 때만)
    annualizationApplied: annualizationApplied.some((a) => a) ? annualizationApplied : undefined,
    annualizedPerShareNetIncome: annualizationApplied.some((a) => a) ? annualizedPerShare : undefined,
    goodwillCalculation: goodwill,
    premiumRate: premium.premiumRate,
    premiumExclusionReason: premium.exclusionReason,
    totalValuation,
    warnings,
    appliedRules,
    otherUnlistedHoldingsEvaluated,
    evaluationCommitteeApplied,
  };
}

function buildBreakdown(
  input: UnlistedStockValuationInput,
  idx: 0 | 1 | 2,
  adjusted: { addTotal: number; subTotal: number; adjustedNetIncome: number },
  capitalAdj: number,
  finalNetIncome: number,
  convertedShares: number,
  perShareNetIncome: number,
): FiscalYearBreakdown {
  const fy = input.fiscalYears[idx];
  return {
    label: fy.fiscalYearLabel,
    taxableIncome: fy.taxableIncome,
    addTotal: adjusted.addTotal,
    subTotal: adjusted.subTotal,
    adjustedNetIncome: adjusted.adjustedNetIncome,
    capitalIncreaseAdjustment: capitalAdj,
    finalNetIncome,
    convertedShares,
    perShareNetIncome,
    // 별지 6쪽 ②~㉒ echo (산식 무관 — 표시용 pass-through)
    addRefundInterest: fy.addRefundInterest,
    addLossFromDividend: fy.addLossFromDividend,
    addCarriedDonation: fy.addCarriedDonation,
    addCarriedCarPayment: fy.addCarriedCarPayment,
    addForexValuationGain: fy.addForexValuationGain,
    addOtherByOrdinance: fy.addOtherByOrdinance,
    subCorporateTax: fy.subCorporateTax,
    subAdditionalTaxes: fy.subAdditionalTaxes,
    subFines: fy.subFines,
    subCompulsoryPublicCharges: fy.subCompulsoryPublicCharges,
    subPunitiveDamages: fy.subPunitiveDamages,
    subWithholdingPenalty: fy.subWithholdingPenalty,
    subExcessiveExpenses: fy.subExcessiveExpenses,
    subDonationExcess: fy.subDonationExcess,
    subEntertainmentExcess: fy.subEntertainmentExcess,
    subNonBusinessExpenses: fy.subNonBusinessExpenses,
    subNonBusinessCarExpenses: fy.subNonBusinessCarExpenses,
    subInterestPayment: fy.subInterestPayment,
    subDepreciationShortage: fy.subDepreciationShortage,
    subForexValuationLoss: fy.subForexValuationLoss,
    subOtherByOrdinance: fy.subOtherByOrdinance,
  };
}
