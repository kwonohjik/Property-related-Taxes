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
import {
  applyShareConversion,
} from "./converted-shares";
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
  const fiscalYearEndDates: [Date, Date, Date] = [
    input.fiscalYears[0].fiscalYearEndDate,
    input.fiscalYears[1].fiscalYearEndDate,
    input.fiscalYears[2].fiscalYearEndDate,
  ];
  const capitalAdjustments = calcCapitalIncreaseAdjustment(
    input.capitalChanges,
    fiscalYearEndDates,
    capRate,
  );

  // STEP 3: 마.최종 순손익액 = 다 + 라
  const finalNetIncomes: [number, number, number] = [
    adjustedIncomes[0].adjustedNetIncome + capitalAdjustments[0],
    adjustedIncomes[1].adjustedNetIncome + capitalAdjustments[1],
    adjustedIncomes[2].adjustedNetIncome + capitalAdjustments[2],
  ];

  // STEP 4: 바.환산주식수 (§17의3⑤)
  // 단순화 가정: 평가기준일 이전 사업연도 종료일 직후의 증자/감자만 일괄 반영
  // 사례 6은 변동 없음 → 모든 환산주식수 = totalShares
  // 사례 1·5는 평가시점 직전 사업연도 내 변동만 발생 → 동일하게 모든 환산 = totalShares
  const totalCapitalDelta = input.capitalChanges.reduce((sum, c) => {
    const sign = c.changeType === "capital_reduction" ? -1 : 1;
    return sum + sign * c.sharesIssued;
  }, 0);

  const priorEndShares = input.totalShares - totalCapitalDelta;
  const convertedShares: [number, number, number] = [
    input.totalShares,
    priorEndShares > 0
      ? applyShareConversion(priorEndShares, totalCapitalDelta)
      : input.totalShares,
    priorEndShares > 0
      ? applyShareConversion(priorEndShares, totalCapitalDelta)
      : input.totalShares,
  ];

  // STEP 5: 사.1주당 순손익액
  const perShareNetIncomes: [number, number, number] = [
    convertedShares[0] > 0 ? Math.floor(finalNetIncomes[0] / convertedShares[0]) : 0,
    convertedShares[1] > 0 ? Math.floor(finalNetIncomes[1] / convertedShares[1]) : 0,
    convertedShares[2] > 0 ? Math.floor(finalNetIncomes[2] / convertedShares[2]) : 0,
  ];

  // 아.1주당 가중평균 (§56①, 음수 시 0)
  const weightedNetIncomePerShare = calcWeightedAvg3y(perShareNetIncomes);
  // 차.1주당 순손익가치 ⑤ = 아 ÷ 자.환원율
  const netIncomePerShare = calcPerShareNetIncomeValue(weightedNetIncomePerShare, capRate);

  // STEP 6: 순자산가액 + 영업권
  const netAssetResult = calcNetAssetTotal(input.netAssetValueRaw);

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
    goodwillCalculation: goodwill,
    premiumRate: premium.premiumRate,
    premiumExclusionReason: premium.exclusionReason,
    totalValuation,
    warnings,
    appliedRules,
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
  return {
    label: input.fiscalYears[idx].fiscalYearLabel,
    taxableIncome: input.fiscalYears[idx].taxableIncome,
    addTotal: adjusted.addTotal,
    subTotal: adjusted.subTotal,
    adjustedNetIncome: adjusted.adjustedNetIncome,
    capitalIncreaseAdjustment: capitalAdj,
    finalNetIncome,
    convertedShares,
    perShareNetIncome,
  };
}
