/**
 * 주식 양도소득세 — 오케스트레이터
 *
 * calculateStockTransferTax(input): StockTransferResult
 *
 * 계산 파이프라인 (STEP 1~12):
 *   1. 과세대상 판정 + 비과세 조기 반환
 *   2. 취득가액 결정 (실가 / 환산 / 액면가)
 *   3. 양도가액 결정
 *   4. 필요경비 (실가 / 개산공제 §163⑥4)
 *   5. 양도소득금액 = 양도가 − 취득가 − 필요경비
 *   6. 기본공제 §103②
 *   7. 과세표준 (1원 미만 절사 §47②)
 *   8. 세율 적용 (§104①11 / §55)
 *   9. 산출세액 (10원 미만 절사 §47①)
 *  10. 가산세·세액공제
 *  11. 지방소득세 (10원 미만 절사 §47③)
 *  12. 최종 결과 조립
 *
 * 법령: 소득세법 2026.4.21. 시행
 */

import type { StockTransferInput, StockTransferResult, LotMatchingDetail } from "./types/stock-transfer.types";
import type { ForeignStockInput, ForeignStockResult } from "./types/foreign-stock.types";
import type { ExitTaxInput, ExitTaxResult } from "./types/exit-tax.types";
import { calculateForeignStockTax } from "./foreign-stock";
import { calculateExitTax } from "./exit-tax";
import { classifyStockTransfer } from "./stock-classification";
import { calcHoldingPeriod, calcBasicDeduction, floorTaxBase, floorTen, applyDeemedAcquisitionDate, buildAppliedThreshold } from "./stock-transfer-helpers";
import { computeCross89Adjustment } from "../comparative-104-5-cross";
import { NBL_HEAVY_CORP_BRACKETS, NBL_HEAVY_CORP_CATEGORIES } from "./stock-rate-tables";
import { applyStockTaxRate } from "./stock-transfer-rate-calc";
import { finalizeStockTax } from "./stock-transfer-finalize";
import { buildPr2Detail } from "./stock-transfer-pr2-detail";
import { isMarketSampleAllowedMarket } from "./stock-valuation-market-sample";
import { applyCapitalAdjustmentsToLots } from "./lot-capital-adjustments";
import { allocateLots } from "./lot-allocation";
import { resolveSplitRateResult } from "./lot-allocation-tax";
import { buildExemptResult } from "./stock-transfer-exempt-result";
import { applyExemptZeroing } from "./apply-exempt-zeroing";
import { calcSecuritiesTransactionTax } from "./securities-transaction-tax";
import { resolveStockCarryover } from "./stock-carryover";
import { resolveAcquisitionBasis } from "./stock-acquisition-basis";
import { STOCK } from "@/lib/tax-engine/legal-codes/stock";

// ============================================================
// split 모드 판정 헬퍼
// ============================================================

function isSplitMode(input: StockTransferInput): boolean {
  return !!(
    input.acquisitionLots &&
    input.acquisitionLots.length > 0 &&
    input.transferLots &&
    input.transferLots.length > 0 &&
    input.costAllocationMethod
  );
}

// ============================================================
// 메인 계산 함수
// ============================================================

/**
 * 해외주식 양도소득세 오버로드 (PR-4A)
 * marketType="foreign_stock" 시 foreign-stock.ts 엔진으로 위임
 */
export function calculateStockTransferTax(input: ForeignStockInput): ForeignStockResult;
/**
 * 국외전출세 오버로드 (PR-4B)
 * marketType="exit_tax" 시 exit-tax.ts 엔진으로 위임
 */
export function calculateStockTransferTax(input: ExitTaxInput): ExitTaxResult;
export function calculateStockTransferTax(input: StockTransferInput): StockTransferResult;
export function calculateStockTransferTax(
  input: StockTransferInput | ForeignStockInput | ExitTaxInput,
): StockTransferResult | ForeignStockResult | ExitTaxResult {
  // foreign_stock 분기 — PR-4A 독립 도메인
  if ((input as ForeignStockInput).marketType === "foreign_stock") {
    return calculateForeignStockTax(input as ForeignStockInput);
  }

  // exit_tax 분기 — PR-4B 독립 도메인
  if ((input as ExitTaxInput).marketType === "exit_tax") {
    return calculateExitTax(input as ExitTaxInput);
  }

  /**
   * §97의2① 이월과세 — 게이트 판정 + ②3호 비교(2-pass)를 **파이프라인 앞에서** 끝낸다.
   *
   * 단건도 다자산과 **같은 함수**를 탄다(dual-truth 방지). 종목이 하나면 「전체 결정세액」이
   * 곧 그 종목의 결정세액이라 결과가 자연히 일치한다(계획서 §6.3).
   *
   * ⚠️ `carryover_gift`가 아니면 `resolveStockCarryover`가 입력을 **그대로** 돌려주므로
   *    기존 경로는 한 톨도 바뀌지 않는다.
   */
  const [resolved] = resolveStockCarryover(
    [input as StockTransferInput],
    (list) => calculateStockTransferTaxInternal(list[0]).finalTax,
    (i) => calculateStockTransferTaxInternal(i).transferIncome,
  );
  return calculateStockTransferTaxInternal(resolved);
}

/**
 * 단건 내부 계산 — foreign/exit 라우팅 없이 일반 주식 파이프라인만 실행.
 * 다자산 합산 엔진(`stock-transfer-aggregate.ts`)이 종목별로 재사용.
 * @internal 외부(API·UI)는 오버로드된 `calculateStockTransferTax`를 사용.
 */
export function calculateStockTransferTaxInternal(input: StockTransferInput): StockTransferResult {
  const warnings: string[] = [];
  const appliedRules: StockTransferResult["appliedRules"] = [];

  // ──────────────────────────────────────────────────────────
  // STEP 1: 과세대상 판정
  // ──────────────────────────────────────────────────────────
  const classification = classifyStockTransfer(input);

  // appliedRules 병합
  for (const rule of classification.appliedRules) {
    if (!appliedRules.includes(rule)) appliedRules.push(rule);
  }
  warnings.push(...classification.warnings);

  // 비과세 분기는 STEP 1~12 정상 실행 후 마지막에 finalTax·가산세만 0으로 zeroing.
  // (조기 반환 제거 — 사용자가 입력한 데이터로 산출세액·과세표준까지 모두 echo하기 위함.
  //  실 세액에 영향 없음 — applyExemptZeroing이 최종 분기에서 처리.)
  // 단, marketType이 unlisted/other_asset 등 STEP 2~11에서 안전 계산이 불가능한 K-OTC 비과세는
  // 기존 buildExemptResult 경로 유지하여 그래이스풀하게 처리.
  if (classification.isExempt &&
      (classification.exemptReason === "kotc_sme_mid" || classification.exemptReason === "kotc_venture")) {
    return buildExemptResult(input, classification);
  }

  // ──────────────────────────────────────────────────────────
  // split 모드 사전 계산 (lot 매칭 — STEP 2/3/5/8 분기에서 사용)
  // ──────────────────────────────────────────────────────────
  let lotMatchingDetail: LotMatchingDetail | undefined;
  let lotCapitalAdjustmentsDetail: StockTransferResult["lotCapitalAdjustmentsDetail"];
  if (isSplitMode(input)) {
    const isMajorAndNonSME =
      !input.isSmallMediumEnterprise &&
      (classification.taxCategory === "listed_major" ||
        classification.taxCategory === "unlisted_major");
    // [A-2] 자본조정 lot 전처리 — 발생일 이전 보유 lot만 희석 (allocateLots 직전)
    let effectiveLots = input.acquisitionLots!;
    if (input.capitalAdjustments && input.capitalAdjustments.length > 0) {
      const ca = applyCapitalAdjustmentsToLots(effectiveLots, input.capitalAdjustments);
      effectiveLots = ca.adjustedLots;
      lotCapitalAdjustmentsDetail = ca.perLotApplied;
      warnings.push(...ca.warnings);
      // 자본조정 규칙은 warnings로 전달 — 단일모드(pr2-detail.ts) 패턴 일치, appliedRules union 미변경
      for (const r of ca.appliedRules) if (!warnings.includes(r)) warnings.push(r);
    }
    lotMatchingDetail = allocateLots(
      effectiveLots,
      input.transferLots!,
      input.costAllocationMethod!,
      isMajorAndNonSME,
      input.isSmallMediumEnterprise,
      input.specificMatchings,
    );
    // appliedRules push
    if (input.costAllocationMethod === "specific") appliedRules.push("로트개별법");
    else if (input.costAllocationMethod === "fifo") appliedRules.push("로트선입선출");
    else if (input.costAllocationMethod === "moving_avg") appliedRules.push("로트이동평균");
    warnings.push(...lotMatchingDetail.warnings);
  }

  // ──────────────────────────────────────────────────────────
  // STEP 2: 양도가액 결정 (취득가액 환산 계산을 위해 먼저 산출)
  // ──────────────────────────────────────────────────────────
  let transferPrice = 0;
  let transferPriceBreakdown: StockTransferResult["transferPriceBreakdown"];
  const { shareCount } = input;

  if (lotMatchingDetail) {
    // split 모드 — lot 합계 사용
    transferPrice = lotMatchingDetail.totalTransferPrice;
  } else if (input.transferPriceMode === "actual") {
    const actualMode = input.transferActualInputMode ?? "per_share";  // 3중 패턴 default
    if (
      input.transferMarketSamplePrice !== undefined &&
      input.transferMarketSamplePrice > 0 &&
      isMarketSampleAllowedMarket(input.marketType)
    ) {
      // R-1' 매매사례가액 우선 (영§176의2③1호) — perShareTransferPrice 무시
      transferPrice = Math.floor(input.transferMarketSamplePrice) * shareCount;
    } else if (
      input.transferMarketSamplePrice !== undefined &&
      input.transferMarketSamplePrice > 0
    ) {
      // 상장주식은 §176의2③1호 본문 괄호가 매매사례가액 자체를 배제한다 — 실지거래가액으로 간다.
      warnings.push(
        `${STOCK.ENFORCEMENT_DECREE_176_2_3_1_MARKET_SAMPLE} 본문 괄호 — 주권상장법인 주식등은 매매사례가액 대상이 아닙니다. 양도 매매사례가액을 적용하지 않고 실지거래가액으로 계산했습니다.`,
      );
      transferPrice =
        actualMode === "total"
          ? (input.transferTotalPrice ?? 0)
          : (input.perShareTransferPrice ?? 0) * shareCount;
    } else if (actualMode === "total") {
      transferPrice = input.transferTotalPrice ?? 0;                  // 총액 직접 사용
    } else {
      transferPrice = (input.perShareTransferPrice ?? 0) * shareCount;
    }
  } else {
    // exchange — 부동산 + 채무면제 + 현금
    const property = input.exchangePropertyValue ?? 0;
    const debt = input.exchangeDebtRelief ?? 0;
    const cash = input.exchangeCash ?? 0;
    transferPrice = property + debt + cash;
    transferPriceBreakdown = { property, debt, cash };
  }

  // ──────────────────────────────────────────────────────────
  // STEP 3: 취득가액 결정 → `stock-acquisition-basis.ts` (800줄 정책 분할)
  //   acquisitionMode 4종 + 환산 5분기를 그 파일이 가른다. 여기서는 결과만 받는다.
  // ──────────────────────────────────────────────────────────
  const { acquisitionMode } = input;
  const basis = resolveAcquisitionBasis(input, transferPrice, lotMatchingDetail);
  const {
    acquisitionPrice,
    usedEstimatedAcquisition,
    estimatedBase,
    estimatedDeduction,
    valuationDetail,
    postListingDetail,
  } = basis;
  // 분할 전과 **같은 순서**로 병합한다 (appliedRules는 중복 제거 없이 push되던 그대로).
  appliedRules.push(...basis.appliedRulesDelta);
  warnings.push(...basis.warningsDelta);

  // STEP 3.5 + 3.7: PR-2 detail (매매사례가액 + 자본조정) — sibling helper
  // [A-2 STEP1-1] split 모드는 자본조정이 lot 전처리에서 이미 반영됨 → buildPr2Detail 글로벌 display 제외(이중적용 차단)
  const pr2Input = isSplitMode(input)
    ? { ...input, capitalAdjustments: undefined }
    : input;
  const pr2 = buildPr2Detail(pr2Input, shareCount, acquisitionPrice, acquisitionMode);
  const marketSampleDetail = pr2.marketSampleDetail;
  const capitalAdjustmentsDetail = pr2.capitalAdjustmentsDetail;
  warnings.push(...pr2.warningsDelta);

  // ──────────────────────────────────────────────────────────
  // STEP 4: 필요경비
  //   환산취득가 모드 본문: 시행령 §163⑥4 개산공제(취득기준시가×1%) (§97②2호 본문)
  //   [B-2] 단서: (환산취득가+개산공제) < (자본적지출+양도비) → 후자를 필요경비 전체로 대체 (§97②2호 단서)
  //     소령 §163⑫ → §176의2②1호(주식 환산 명시) → §97①1나목 "환산취득가액으로 하는 경우" 해당.
  //     sale_case는 usedEstimatedAcquisition 미설정이라 본 게이트 미진입 (구조적 배제).
  // ──────────────────────────────────────────────────────────
  let expenses = 0;
  let swapApplied = false;
  let swapComparison: StockTransferResult["swapComparison"];
  const { expenseMode } = input;

  /**
   * §97의2①**2호** — split 모드의 증여자 자본적지출. lot마다 「매도된 몫」만 안분해
   * `allocateLots`가 합산해 둔 값이다. 단건 모드의 종목 축 `donorCapitalExpenditure`는
   * `stock-carryover.ts`가 이미 `actualExpenses`에 더해 넣었으므로 여기서 겹치지 않는다
   * (split은 종목 축 취득원인이 `carryover_gift`가 아니라 그 경로를 타지 않는다).
   *
   * 🔑 **자본적지출은 §97②2호 단서의 「나목」이라 비교에 참여해야 한다** — 그래서
   * 증여세(③호, 비교 대상 밖)와 달리 `directSide`에 먼저 합친다.
   */
  const lotDonorCapex = lotMatchingDetail?.carryoverDonorCapex ?? 0;
  const directExpenses = (input.actualExpenses ?? 0) + lotDonorCapex;

  if (usedEstimatedAcquisition && estimatedDeduction !== undefined && estimatedDeduction > 0) {
    const directSide = directExpenses; // 자본적지출 + 양도비 합계 (expenseMode 무관)
    const estimatedSide = acquisitionPrice + estimatedDeduction; // 가목 = 환산취득가 + 개산공제
    if (directSide > estimatedSide) {
      // 단서 발동 — "적은 경우" 문리상 동률(==)은 본문
      swapApplied = true;
      expenses = directSide;
      swapComparison = { estimatedSide, directSide, chosen: "direct" };
      appliedRules.push("§97②단서swap");
      warnings.push(
        "§97②2호 단서 적용 — (환산취득가+개산공제)보다 실제 필요경비(자본적지출+양도비)가 커 후자를 필요경비로 합니다. 양도차익 계산에서 환산취득가는 차감되지 않습니다."
      );
    } else {
      expenses = estimatedDeduction;
      if (directSide > 0) {
        swapComparison = { estimatedSide, directSide, chosen: "estimated" };
        warnings.push(
          "환산취득가 모드 — §97②2호 단서 비교 결과 (환산취득가+개산공제)가 입력 실비 이상이므로 본문(개산공제)을 적용합니다."
        );
      }
    }
  } else if (expenseMode === "actual") {
    expenses = directExpenses;
  } else {
    /**
     * 개산공제 모드 — ①2호를 **더하지 않는다**. §97②2호 본문은 「취득가액 + 개산공제」이고
     * 자본적지출은 **단서(나목)로 갈아탈 때만** 산입되는 택일 항목이라, 여기 더하면
     * 개산공제와 실비를 동시에 받는 **이중 공제**가 된다. 단건 경로도 증여자 자본적지출을
     * `actualExpenses`에만 실어 같은 규약을 지킨다(`stock-carryover.ts` 시나리오 A).
     */
    expenses = estimatedDeduction ?? 0;
  }

  /**
   * §97의2①**3호** — 증여세 상당액은 필요경비가 **확정된 뒤** 가산한다.
   *
   * 🔑 **§97②2호 단서 비교 대상 밖**이다. 단서는 「가목(환산취득가 + 개산공제)」과
   * 「나목(자본적지출 + 양도비)」만 견주는데, 증여세는 §97①2호도 3호도 아니기 때문이다.
   * 그래서 위 swap 판정이 **끝난 다음** 더한다 — `actualExpenses`에 섞으면
   * ⓐ 단서 비교가 오염되고 ⓑ 본문(개산공제) 채택 시 **차감되지 않고 사라진다**
   * (부동산이 같은 함정에 두 번 걸렸다 — `transfer-tax-carryover.ts:368-417`).
   *
   * 값은 `stock-carryover.ts`가 영 §163의2②(안분 → 한도)까지 마쳐 넣어 준다.
   *
   * split 모드는 lot마다 증여 건이 다를 수 있어 `allocateLots`가 lot별로 안분해 합산한다.
   * **한도는 종목 단위**(영 §163의2② 후단 「양도가액에서 §97①·②의 금액을 공제한 잔액」)이므로
   * 여기서 건다 — 필요경비가 확정된 지금이 그 잔액을 알 수 있는 첫 지점이다.
   */
  const singleGiftTax = input.carryoverGiftTaxExpense ?? 0;
  const lotGiftTaxRaw = lotMatchingDetail?.carryoverGiftTaxApportioned ?? 0;
  let lotGiftTax = 0;
  if (lotGiftTaxRaw > 0) {
    const preGiftIncome = swapApplied
      ? transferPrice - expenses
      : transferPrice - acquisitionPrice - expenses;
    lotGiftTax = Math.min(lotGiftTaxRaw, Math.max(0, preGiftIncome - singleGiftTax));
  }
  expenses += singleGiftTax + lotGiftTax;

  /**
   * §97의2① 채택 결과 안내 — **왜 이 세액인가**를 결과 계층이 설명할 수 있게 한다.
   * 시나리오 B는 `acquisitionCause`를 `"purchase"`로 되돌리므로, 이 문구가 없으면
   * 「이월과세를 골랐는데 적용되지 않았다」는 사실 자체가 결과에서 사라진다.
   */
  /**
   * ⑦ 결과 계층 — ②3호가 견준 **두 세액**과 ①1·2·3호의 실제 반영값을 나란히 남긴다.
   * 시나리오 B는 `acquisitionCause`를 `"purchase"`로 되돌리므로 이 detail이 없으면
   * 「비교가 있었다」는 사실 자체가 결과에서 사라진다.
   */
  const carryoverDetail: StockTransferResult["carryoverDetail"] = input.carryoverOutcome
    ? {
        outcome: input.carryoverOutcome,
        appliedTotalTax: input.carryoverComparison?.appliedTotalTax ?? 0,
        excludedTotalTax: input.carryoverComparison?.excludedTotalTax ?? 0,
        donorAcquisitionPricePerShare: input.carryoverDonorPricePerShare,
        giftDateValuationPerShare: input.carryoverGiftDateValuationPerShare,
        donorCapexIncluded: (input.carryoverDonorCapexApplied ?? 0) + lotDonorCapex,
        giftTaxIncluded: singleGiftTax + lotGiftTax,
      }
    : undefined;

  if (input.carryoverOutcome === "applied") {
    warnings.push(
      "§97의2① 이월과세 적용 — 취득가액을 증여자 취득 당시 금액으로 승계하고, " +
        "세율 보유기간도 증여자 취득일부터 계산합니다(§104②2호).",
    );
  } else if (input.carryoverOutcome === "excluded") {
    warnings.push(
      "§97의2② — 이월과세를 적용하지 않습니다(적용 시 결정세액이 더 적거나 요건 미충족). " +
        "취득가액은 증여 당시 평가액이고 세율 보유기간도 증여받은 날부터 계산합니다.",
    );
  }

  // ──────────────────────────────────────────────────────────
  // STEP 5: 양도소득금액
  //   [B-2] swap 시 가목(환산취득가+개산공제) 전체가 나목으로 대체 → 취득가액 차감 제외
  // ──────────────────────────────────────────────────────────
  const transferIncome = swapApplied
    ? transferPrice - expenses
    : transferPrice - acquisitionPrice - expenses;

  // ──────────────────────────────────────────────────────────
  // STEP 6: 기본공제 §103②
  // ──────────────────────────────────────────────────────────
  const basicDeduction = calcBasicDeduction(
    transferIncome,
    classification.basicDeductionGroup,
    input.realEstateGroupBasicDeductionUsed,
  );

  // ──────────────────────────────────────────────────────────
  // STEP 7: 과세표준 (1원 미만 절사 §47②)
  // ──────────────────────────────────────────────────────────
  const taxBaseRaw = Math.max(0, transferIncome - basicDeduction);
  const taxBase = floorTaxBase(taxBaseRaw);

  // ──────────────────────────────────────────────────────────
  // STEP 8: 보유기간 + 세율 적용
  // ──────────────────────────────────────────────────────────

  // 의제취득일 처리 (1985.12.31. 이전 취득)
  const rawHoldingResult = calcHoldingPeriod(input);
  const { effectiveDate: holdingStartDate, isDeemedApplied } = applyDeemedAcquisitionDate(
    rawHoldingResult.startDate,
  );
  if (isDeemedApplied) {
    appliedRules.push("의제취득일적용");
  }

  // 의제취득일 적용 시 보유기간 재계산
  const holdingResult = isDeemedApplied
    ? calcHoldingPeriod({ ...input, acquisitionDate: holdingStartDate })
    : rawHoldingResult;

  // 단기보유 판정 (비중소기업 대주주 1년 미만 → 30%)
  const isShortTermHolding =
    holdingResult.isShortTerm &&
    !input.isSmallMediumEnterprise &&
    (classification.taxCategory === "listed_major" ||
      classification.taxCategory === "unlisted_major");

  if (isShortTermHolding) {
    appliedRules.push("단기30%");
  }

  let rateResult: ReturnType<typeof applyStockTaxRate>;
  if (lotMatchingDetail) {
    // split 모드 — sub-lot별 안분 + 세율 적용 + 합산.
    // 🔑 세율·누진공제 echo 까지 정본(`resolveSplitRateResult`)이 만든다 — 다종목 집계 엔진도
    //    같은 함수를 쓴다(리뷰 #5·#28). 종전에는 여기서 `matched[]`의 첫 sub-lot 세율을
    //    echo 로 쓰고 누진공제를 `undefined`로 버려 결과뷰 산식 항등식이 깨졌다.
    const split = resolveSplitRateResult(
      taxBase,
      lotMatchingDetail,
      classification.taxCategory,
      input.isSmallMediumEnterprise,
    );
    rateResult = split.rate;
    if (split.mixedNote) warnings.push(split.mixedNote);
  } else {
    rateResult = applyStockTaxRate(
      taxBase,
      classification.taxCategory,
      input.isSmallMediumEnterprise,
      isShortTermHolding,
      classification.isExempt, // 비과세 분기에서도 산식 echo
    );
  }

  // ──────────────────────────────────────────────────────────
  // STEP 9: 산출세액 (10원 미만 절사 §47①)
  // ──────────────────────────────────────────────────────────
  const calculatedTax = floorTen(rateResult.calculatedTax);

  // ──────────────────────────────────────────────────────────
  // STEP 10~12: Finalize (가산세·공제·지방세)
  // ──────────────────────────────────────────────────────────
  const finalizeResult = finalizeStockTax(calculatedTax, input);
  warnings.push(...(finalizeResult.appliedRules ?? []));

  // ──────────────────────────────────────────────────────────
  // STEP 12.5: 증권거래세 정보성 산출 (appended step)
  // 양도세와 별도 납부 의무 — 합산 금지 (정보성 echo)
  // applyExemptZeroing은 spread이므로 본 필드 자동 보존 (실측 확인)
  // ──────────────────────────────────────────────────────────
  const stxResult = calcSecuritiesTransactionTax(input, transferPrice);

  // ──────────────────────────────────────────────────────────
  // §104⑤ 본문 후단 — 8호·9호 **동일 자산 의제** 조정액 (안내 전용)
  // ──────────────────────────────────────────────────────────
  // 부동산 엔진과 주식 엔진이 분리돼 §104⑤이 교차 조합을 아우르지 못한다. 사용자가 부동산
  // 결과에서 「§104①8호 버킷 과세표준」을 옮겨 적으면, 이 종목의 9호분과 **한 버킷으로 합산**
  // 했을 때 늘어나는 세액을 계산해 **안내**한다.
  // ⚠️ **세액에 반영하지 않는다** — §104⑤은 전체 산출세액을 하나로 정하므로 조정액에 귀속이 없다.
  //   여기서 `calculatedTax`에 더하면 **주식 신고서 금액이 틀어진다**(계획서 §5-B G-4).
  // ⚠️ §104⑤**1호 비교는 하지 않는다**(G-5) — 반대편 과세표준 합계·산출세액이 필요해 입력이
  //   4칸이 된다. 결과 카드가 그 한계를 문구로 알린다.
  const cross1045Adjustment = NBL_HEAVY_CORP_CATEGORIES.has(classification.taxCategory)
    ? computeCross89Adjustment({
        clause8TaxBase: input.crossClause8TaxBase ?? 0,
        clause9TaxBase: taxBase,
        nbl89Brackets: NBL_HEAVY_CORP_BRACKETS,
      })
    : undefined;

  // §104⑤ **크로스 조정용 호별 echo**(C-3a / 2b-3) — 조건 없이 항상 싣는다.
  //
  // `cross1045Adjustment`는 사용자가 `crossClause8TaxBase`를 **입력했을 때만** 생기는데,
  // 이력 기반 교차 합산은 **입력 없이 저장된 결과만 읽어** 두 엔진을 합친다.
  // ⇒ 「이 종목이 §104①1호인가 9호인가 + 그 과세표준·세액」을 무조건 노출한다.
  //
  // 🔒 **기타자산(§94①4호)이고 비과세가 아닐 때만** 값이 실린다 — 주식(§94①3호)은 §104⑤ 본문이
  //   열거하지 않아 대상이 아니고, 비과세는 aggregate `computeOtherAssetComparativeTax`가
  //   `!r.isExempt`로 거르는 것과 규약을 맞춘다.
  const isOtherAssetTarget =
    classification.basicDeductionGroup === "real_estate_and_other_asset" &&
    !classification.isExempt;
  const isClause9 = isOtherAssetTarget && NBL_HEAVY_CORP_CATEGORIES.has(classification.taxCategory);
  const isClause1 = isOtherAssetTarget && !isClause9;

  // ──────────────────────────────────────────────────────────
  // 결과 조립
  // ──────────────────────────────────────────────────────────
  const fullResult: StockTransferResult = {
    ...(cross1045Adjustment ? { cross1045Adjustment } : {}),
    clause1BucketTaxBase: isClause1 ? taxBase : 0,
    clause1BucketTax: isClause1 ? calculatedTax : 0,
    clause9TaxBase: isClause9 ? taxBase : 0,
    clause9Tax: isClause9 ? calculatedTax : 0,
    taxCategory: classification.taxCategory,
    appliedSection94: classification.appliedSection94,
    section94_2Applied: classification.section94_2Applied,
    isExempt: false,
    exemptReason: undefined,

    transferPrice,
    transferPriceBreakdown,

    acquisitionPrice,
    acquisitionMode: input.acquisitionMode,
    usedEstimatedAcquisition,
    estimatedBase,
    estimatedDeduction,
    swapApplied,
    swapComparison,

    valuationDetail,
    marketSampleDetail,
    capitalAdjustmentsDetail,

    basicDeductionGroup: classification.basicDeductionGroup,

    expenses,
    expenseMode: input.expenseMode,

    transferIncome,
    basicDeduction,
    taxBase,

    appliedRate: rateResult.appliedRate,
    progressiveDeduction: rateResult.progressiveDeduction,
    calculatedTax,

    underReportPenalty: finalizeResult.underReportPenalty,
    latePaymentPenalty: finalizeResult.latePaymentPenalty,
    penaltyBase: finalizeResult.penaltyBase,
    ...(finalizeResult.fraudSplit ? { fraudSplit: finalizeResult.fraudSplit } : {}),
    electronicFilingCredit: finalizeResult.electronicFilingCredit,

    finalTax: finalizeResult.finalTax,
    localIncomeTax: finalizeResult.localIncomeTax,

    holdingPeriodMonths: holdingResult.months,
    holdingPeriodDays: holdingResult.days,
    isShortTermHolding,

    lthdStartDate: null,

    appliedThreshold: buildAppliedThreshold(input, classification),

    warnings,
    appliedRules,
    lotMatchingDetail,
    carryoverDetail,
    lotCapitalAdjustmentsDetail,
    // Round 4 C-02·C-04: 취득 후 상장 환산 echo (UI 결과 카드 게이트용)
    acquiredBeforeListing: input.acquiredBeforeListing,
    postListingDetail,
    // STEP 12.5: 증권거래세 정보성 echo (설계 E5-ⓐ)
    securitiesTransactionTax: stxResult,
  };

  // 비과세 분기(listed_non_major_in_market) zero-out — 최종 세액·가산세만 0,
  // 중간 산식값(transferPrice·acquisitionPrice·taxBase·calculatedTax 등)은 echo
  if (classification.isExempt) {
    return applyExemptZeroing(fullResult, classification);
  }
  return fullResult;
}

// [GAP-B] buildExemptResult + calcTransferPriceSimple → stock-transfer-exempt-result.ts로 분리
//         800줄 정책 준수. import 후 그대로 호출.

// [D-1] 다자산 합산 엔진 → stock-transfer-aggregate.ts로 분리 (800줄 정책).
//       외부 import 경로 보존을 위해 re-export (import 무변경).
export {
  calculateStockTransferTaxAggregate,
  type StockTransferAggregateResult,
  type OtherAssetComparativeTax,
} from "./stock-transfer-aggregate";

