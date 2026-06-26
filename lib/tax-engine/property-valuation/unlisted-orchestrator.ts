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
import { computeMergerPerShareNetIncome } from "./merger-net-income";
import {
  calcWeightedAvg3y,
  calcPerShareNetIncomeValue,
  calcPerShareWeightedValuation,
  calcNetAssetFloor80,
  calcFinalPerShareValue,
} from "./weighted-avg";
import { calcNetAssetTotal, calcNetAssetPerShare } from "./net-asset-calc";
import { solveSelfReferentialValuation } from "./treasury-stock";
import { calcGoodwill } from "./goodwill";
import { calcCapitalIncreaseAdjustment } from "./capital-increase-adjustment";
import { calcMaxShareholderPremium } from "./max-shareholder-premium";
import { resolveEvaluationDelta } from "./evaluation-delta";
import { evaluateOtherUnlistedHoldings } from "./other-unlisted-holdings";
import { applyEvaluationCommittee } from "./evaluation-committee-section-54-6";
import {
  applyEstimatedProfit,
  ESTIMATED_PROFIT_REASON_LABEL,
} from "./estimated-profit-section-56-2";
import { applyPreIpoListing } from "./pre-ipo-listing-section-63-2";
import type { PreIpoListingResult } from "./pre-ipo-listing-section-63-2";
import { safeMultiply } from "@/lib/tax-engine/tax-utils";
import { toDate, toOptionalDate } from "@/lib/api/date-coerce";

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

  // 자기주식 — 소각·감자목적은 발행주식총수에서 차감(N−t), 일시보유·미보유는 N 유지.
  //   소각·감자: 1주당 순손익가치(⑤)·순자산가치(④) 두 분모 모두 N−t (재산-240, 이미지 7쪽 ②).
  //   일시보유: 분모 N 유지하되 ⑥은 자기참조 solver로 override (STEP 7).
  const effectiveTotalShares =
    input.treasuryStock?.purpose === "cancellation"
      ? input.totalShares - input.treasuryStock.shares
      : input.totalShares;

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
    totalShares: effectiveTotalShares,
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

  // 합병 후 3년 미경과 순손익 합산 (상증령 §56③·상증통 63-56…12). 설정 시 1주당 순손익액(사) 대체 + 연환산 skip.
  let perShareForWeighted: [number, number, number] = annualizedPerShare;
  let companyNetIncomes: [number, number, number] = finalNetIncomes;
  let mergerResult: UnlistedStockValuationResult["mergerResult"];
  if (input.mergerContext) {
    mergerResult = computeMergerPerShareNetIncome(input.mergerContext);
    perShareForWeighted = mergerResult.perShare;       // §17의3② 연환산 skip(안분에 월할 내재)
    companyNetIncomes = mergerResult.combined;          // 영업권 companyWeighted도 합산값 일관 적용
    appliedRules.push(
      "상증령 §56③ 합병 후 3년 미경과 — 합병법인·피합병법인 순손익액 합산(상증통 63-56…12)",
    );
  }
  // 아.1주당 가중평균 (§56①, 음수 시 0)
  const weightedNetIncomePerShare = calcWeightedAvg3y(perShareForWeighted);
  // 차.1주당 순손익가치 ⑤ = 아 ÷ 자.환원율
  let netIncomePerShare = calcPerShareNetIncomeValue(weightedNetIncomePerShare, capRate);

  // STEP 5.5: §56② 추정이익 갈음 (요건 충족 시 순손익가치 대체)
  let estimatedProfitResult: UnlistedStockValuationResult["estimatedProfitResult"];
  if (input.estimatedProfit) {
    estimatedProfitResult = applyEstimatedProfit(input.estimatedProfit, capRate);
    if (estimatedProfitResult.applied) {
      netIncomePerShare = estimatedProfitResult.perShareIncomeValue; // §56② 갈음 (F-7: 결과도 이 값)
      appliedRules.push(
        `상증령 §56② 추정이익 평균가액 갈음 — ${ESTIMATED_PROFIT_REASON_LABEL[estimatedProfitResult.reasonCode!]}`,
      );
    }
    for (const w of estimatedProfitResult.warnings) warnings.push(`[추정이익] ${w}`);
  }

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
    (companyNetIncomes[0] * 3 + companyNetIncomes[1] * 2 + companyNetIncomes[2] * 1) / 6;
  let companyWeighted3y = Math.max(0, Math.floor(companyWeightedRaw));

  // PR-G2: §59③ 준용 §56② — 추정이익 적용 시 영업권 가중평균도 추정이익 기준.
  //   "1주당 추정이익은 순손익액으로 본다" → 회사 전체 = 평균가액 × 발행주식총수.
  //   (§59② 초과이익 = 가.순손익액×50% − 다.자기자본×10%, 다.가 회사 전체이므로 가.도 회사 전체 환산 필수)
  if (estimatedProfitResult?.applied) {
    companyWeighted3y = Math.max(
      0,
      safeMultiply(estimatedProfitResult.estimatedProfitAverage, input.totalShares),
    );
  }

  const goodwill = calcGoodwill({
    weightedAvg3y: companyWeighted3y,
    selfCapital: netAssetResult.netAssetBeforeGoodwill,
    rate: goodwillRate,
    netAssetOnlyReason: input.netAssetOnlyReason,
    isContinuousLossLastThreeYears: input.isContinuousLossLastThreeYears,
  });

  const netAssetTotal = netAssetResult.netAssetBeforeGoodwill + goodwill.goodwillFinal; // ③
  let netAssetPerShare = calcNetAssetPerShare(netAssetTotal, effectiveTotalShares); // ④

  // STEP 7: ⑥-㉠·㉡·⑥ 1주당 평가액
  let weightedAvgPerShare = calcPerShareWeightedValuation(
    netIncomePerShare,
    netAssetPerShare,
    input.isRealEstateHeavy,
  );
  let netAssetFloor80 = calcNetAssetFloor80(netAssetPerShare);

  let finalPerShareValue: number;
  let netAssetFloorApplied = false;
  let treasuryStockApplied: UnlistedStockValuationResult["treasuryStockApplied"];

  if (input.treasuryStock?.purpose === "temporary_holding") {
    // 자기주식 일시보유 — ⑥ 블록 전체(㉠·㉡·최종)를 자기참조 solver로 대체 (기존 3함수 우회).
    //   단서 사유(real_estate_80·stock_holding_80)+일시보유는 MVP 범위 외 → 일반 가중평균(단서 미발동).
    const netAssetOnlyUnconditional =
      input.netAssetOnlyReason === "liquidation" ||
      input.netAssetOnlyReason === "lt3y" ||
      input.netAssetOnlyReason === "remaining_3y";
    const sr = solveSelfReferentialValuation({
      netAssetTotal,
      treasuryShares: input.treasuryStock.shares,
      totalShares: input.totalShares,
      netIncomeValuePerShare: netIncomePerShare,
      isRealEstateHeavy: input.isRealEstateHeavy,
      netAssetOnly: netAssetOnlyUnconditional,
    });
    weightedAvgPerShare = sr.weightedSelfRef;
    netAssetPerShare = sr.selfRefNetAssetPerShare; // self-ref ④
    netAssetFloor80 = Number((BigInt(sr.selfRefNetAssetPerShare) * 4n) / 5n);
    finalPerShareValue = sr.finalPerShareValue;
    netAssetFloorApplied = sr.floor80Applied;
    appliedRules.push(
      "상증령 §54②·§55① + 재재산-1494·자본거래-2616 — 자기주식 일시보유(자기참조 평가)",
    );
    if (sr.floor80Applied) {
      appliedRules.push(
        "재재산-616 — 가중평균이 순자산가치의 80% 미만 → 순자산가치 80% 자기참조 재계산",
      );
      warnings.push(
        "자기주식 일시보유 — 손익가치가 낮아 1주당 순자산가치의 80%로 평가(순자산가치 재계산).",
      );
    }
    treasuryStockApplied = {
      purpose: "temporary_holding",
      shares: input.treasuryStock.shares,
      effectiveTotalShares: input.totalShares,
      selfReferentialValue: sr.finalPerShareValue,
      floor80SelfReferentialApplied: sr.floor80Applied,
      floor80NetAssetValue: sr.floor80NetAssetValue,
    };
  } else {
    // 미보유 + 소각·감자 공통 — 소각은 effectiveTotalShares=N−t 주입으로 ④·⑤가 차감 반영됨.
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

    if (input.treasuryStock?.purpose === "cancellation") {
      appliedRules.push(
        "재산-240·서일46014-10198 — 자기주식 소각·감자 목적(발행주식총수에서 차감)",
      );
      treasuryStockApplied = {
        purpose: "cancellation",
        shares: input.treasuryStock.shares,
        effectiveTotalShares,
      };
    }
  }

  // PR-L (§63②1호): 기업공개 준비 중 평가 override (STEP 7 직후, STEP 8 할증 직전).
  //   §54⑥ 평가심의위 범위(70~130%) 기준은 §54 보충적평가이므로 override 전 캡처 (C3).
  //   finalPerShareValue는 모든 §54 분기(본칙/순자산단독/단서) 결과를 포섭 → §57①2호나목 = §54 보충적평가.
  const supplementaryPerShareValue = finalPerShareValue;
  let preIpoListingResult: PreIpoListingResult | undefined;
  if (input.preIpoListing) {
    preIpoListingResult = applyPreIpoListing(
      {
        ...input.preIpoListing,
        // 날짜 JSON/sessionStorage 경유 string 도달 방어 (C1 — date-coerce silent-false)
        securitiesFilingDate: toDate(input.preIpoListing.securitiesFilingDate, "securitiesFilingDate"),
        listingDate: toOptionalDate(input.preIpoListing.listingDate),
      },
      finalPerShareValue, // = §54 보충적평가 (§57①2호나목)
      toOptionalDate(input.evaluationDate) ?? input.evaluationDate,
    );
    if (preIpoListingResult.applied) {
      finalPerShareValue = preIpoListingResult.appliedValue; // MAX(공모가, §54)
      // PR-L2: preparationType별 인용 분기 (§63②1호+§57① / §63②2호+§57②). D-1 거래소·협회 병기.
      appliedRules.push(
        preIpoListingResult.preparationType === "association_registration"
          ? "상증법 §63②2호 + 상증령 §57② — 거래소 상장신청·협회 등록 준비 중 MAX(공모가, 보충적평가)"
          : "상증법 §63②1호 + 상증령 §57① — 기업공개 준비 중 MAX(공모가, 보충적평가)",
      );
    } else {
      for (const w of preIpoListingResult.warnings) warnings.push(`[§63②] ${w}`);
    }
  }

  // STEP 8: ⑦·⑧·⑨ 할증평가 (§63③ — override된 finalPerShareValue 기준)
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
  // PR-G2: §59③ 준용 — 추정이익 적용 시 영업권 가중평균도 추정이익 기준 (goodwill>0 시 안내)
  if (estimatedProfitResult?.applied && goodwill.goodwillFinal > 0) {
    appliedRules.push("상증령 §59③ — 영업권 가중평균 순손익액도 추정이익 기준 적용");
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
    // C3: §54⑥ 70~130% 범위 기준은 §54 보충적평가 — §63② override값(finalPerShareValue)이 아닌
    //     override 전 supplementaryPerShareValue 전달 (범위 무오염).
    evaluationCommitteeApplied = applyEvaluationCommittee(
      input.evaluationCommittee,
      supplementaryPerShareValue,
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
    // §17의3② 연환산 echo (1년 미만 사업연도 있을 때만 — 합병 시 skip이므로 미표시)
    annualizationApplied:
      !mergerResult && annualizationApplied.some((a) => a) ? annualizationApplied : undefined,
    annualizedPerShareNetIncome:
      !mergerResult && annualizationApplied.some((a) => a) ? annualizedPerShare : undefined,
    // 합병 합산 echo (mergerContext 입력 시) — 연환산과 상호배타
    mergerApplied: mergerResult ? true : undefined,
    mergerResult,
    goodwillCalculation: goodwill,
    premiumRate: premium.premiumRate,
    premiumExclusionReason: premium.exclusionReason,
    totalValuation,
    treasuryStockApplied,
    warnings,
    appliedRules,
    otherUnlistedHoldingsEvaluated,
    evaluationCommitteeApplied,
    estimatedProfitResult,
    preIpoListingResult,
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
