/**
 * 주식 양도세 split 모드 sub-lot 세율 적용 헬퍼 (stock-transfer-tax.ts 800줄 정책 분리)
 *
 * basicDeduction 안분 산식: subLotTaxBase = floor(taxBase × subLotGain / totalGain)
 * - 음수 sub-lot 제외 (taxBase 안분 시 0)
 * - 대주주+비SME: 단기 30% / 누진 (§104①11호 가목 1)·2))
 * - 비대주주: 단일 세율 (§104①11호 나목)
 */

import type { LotMatchingDetail, StockTransferResult } from "./types/stock-transfer.types";
import {
  STOCK,
  STOCK_SHORT_TERM_RATE,
  STOCK_NON_MAJOR_SME_RATE,
  STOCK_NON_MAJOR_NON_SME_RATE,
} from "@/lib/tax-engine/legal-codes/stock";
import { applyStockTaxRate, type RateCalcResult } from "./stock-transfer-rate-calc";

export interface SplitModeTaxResult {
  calculatedTax: number;
  isMixedRate: boolean;
  mixedNote?: string;
  /**
   * 세율이 하나로 확정되는 경로에서 **실제로 적용된** 세율·누진공제 echo.
   *
   * 🔴 2026-08-28 신설(리뷰 #28) — 종전에는 호출부가 `lotMatchingDetail.matched[]`의
   * 첫 sub-lot 세율을 echo 로 썼는데, 그 값은 sub-lot 안분 단계(`applySubLotRate`)에서
   * 나온 것이라 **실제 세액을 낸 세율과 다를 수 있었다**. 특히 기타자산(§55 8단계 누진)에서
   * 실측 0.2 vs 실제 0.4 로 갈렸고 누진공제는 아예 `undefined` 였다 —
   * 결과뷰 산식 카드의 「과세표준 × 세율 − 누진공제 = 산출세액」 항등식이 깨졌다.
   * 세액 자체는 정확했으므로 표시 전용 결함이다.
   *
   * 혼합 세율이면 하나로 말할 수 없으므로 `undefined`(호출부가 0 = "혼합" 라벨로 표기).
   */
  appliedRate?: number;
  progressiveDeduction?: number;
}

/**
 * split(lot) 모드의 세율 적용 결과를 **정상 경로와 같은 모양**(`RateCalcResult`)으로 돌려준다.
 *
 * 단건 엔진(`stock-transfer-tax.ts`)과 다종목 집계 엔진(`stock-transfer-aggregate.ts`)이
 * **같은 코드**를 쓰게 하는 것이 이 함수의 목적이다.
 *
 * 🔴 2026-08-28 신설(리뷰 #5) — 종전에는 집계 엔진이 `applyStockTaxRate`를 직접 불러
 * split 축을 통째로 버렸다. lot 단기·장기가 섞인 종목이 폼 전역 취득일 하나로 판정돼,
 * **종목을 하나 더 신고했다는 이유만으로 세액이 달라졌다**
 * (실측: 단건 204,312,500 vs 다종목 184,375,000 — 19,937,500 과소).
 */
export function resolveSplitRateResult(
  taxBase: number,
  lotDetail: LotMatchingDetail,
  taxCategory: StockTransferResult["taxCategory"],
  isSME: boolean,
): { rate: RateCalcResult; mixedNote?: string } {
  const splitTax = calcSplitModeTax(taxBase, lotDetail, taxCategory, isSME);
  return {
    rate: {
      // 혼합이면 0 — UI 가 "혼합" 라벨로 읽는 기존 규약을 유지한다.
      appliedRate: splitTax.isMixedRate ? 0 : (splitTax.appliedRate ?? 0),
      calculatedTax: splitTax.calculatedTax,
      progressiveDeduction: splitTax.progressiveDeduction,
      appliedRuleRef: STOCK.SECTION_104_1_11_GA_2_PROGRESSIVE,
      isShortTermRate: lotDetail.matched.some((m) => m.isShortTerm),
    },
    mixedNote: splitTax.mixedNote,
  };
}

/**
 * 비대주주 단일세율 적용 대상 taxCategory (§104①11호 나목)
 * - listed_otc_non_major: 코스닥 외 비대주주 (K-OTC 등)
 * - listed_off_market_non_major: 상장 장외 비대주주
 * - unlisted_non_major: 비상장 비대주주
 *
 * 정상 경로 applyStockTaxRate(stock-transfer-rate-calc.ts:135-137)와 동일한 3개 범주.
 * exact 비교 — substring/.includes 금지 ([[feedback_enum_substring_match_forbidden]]).
 */
const NON_MAJOR_SINGLE_RATE_CATEGORIES = new Set<StockTransferResult["taxCategory"]>([
  "listed_otc_non_major",
  "listed_off_market_non_major",
  "unlisted_non_major",
]);

export function calcSplitModeTax(
  taxBase: number,
  lotDetail: LotMatchingDetail,
  taxCategory: StockTransferResult["taxCategory"],
  isSME: boolean,
): SplitModeTaxResult {
  if (taxBase <= 0 || lotDetail.totalGain <= 0) {
    return { calculatedTax: 0, isMixedRate: false };
  }

  // §104①11호 가목 1) 단기 30%는 "**중소기업 외**의 법인의 주식등"에만 적용된다.
  //   ⇒ 단기/장기 구분이 세율을 가르는 경우는 **대주주 + 비중소기업**뿐이다.
  //   중소기업 대주주는 단기 lot이 있어도 전액 가목 2)로 간다.
  const shortTermSplitsRate =
    !isSME && (taxCategory === "listed_major" || taxCategory === "unlisted_major");

  if (!shortTermSplitsRate) {
    // 세율이 lot에 따라 갈리지 않는다 → **정상(단건) 경로와 완전히 동일**해야 한다.
    //
    // 2026-07-29 정정(#591 감사 R7 — **세액 변경**): 종전에는 이 분기가 "비대주주 단일세율"로
    // 하드코딩돼 있어 두 갈래가 조용히 틀렸다.
    //   · **중소기업 대주주**(listed_major/unlisted_major + isSME)가 나목 20%로 떨어졌다.
    //     → 가목 2) 누진(3억 이하 20% / 초과 25%)이 맞다. 과세표준 5억: 100,000,000 → 110,000,000.
    //   · **기타자산**(other_asset_*)이 20% 단일로 계산됐다. → §55 8단계 누진이 맞다.
    //     과세표준 5천만: 10,000,000 → 6,240,000 (과대), 10억: 384,060,000 (과소).
    // 재구현 대신 정본 `applyStockTaxRate`에 위임해 드리프트 자체를 없앤다
    // (memory `feedback_ui_engine_dual_truth_avoidance`).
    const single = applyStockTaxRate(taxBase, taxCategory, isSME, false);
    return {
      calculatedTax: single.calculatedTax,
      isMixedRate: false,
      // 위임한 그 계산의 세율·누진공제를 그대로 echo 한다 — 표시 산식이 세액과 어긋나면 안 된다.
      appliedRate: single.appliedRate,
      progressiveDeduction: single.progressiveDeduction,
    };
  }

  // 대주주 + 비중소기업 — 단기(가목 1, 30%)와 장기(가목 2, 누진)를 **그룹으로 묶어** 각각 계산한다.
  //
  // sub-lot마다 누진을 따로 적용하면 3억 구간이 lot 수만큼 반복돼 세액이 과소해진다
  // (실측: 장기 2 lot·과세표준 4.5억에서 per-lot 90,000,000 vs 집계 97,500,000).
  // §104⑤2호 단서가 "동일한 호의 세율이 적용되고 그 적용세율이 둘 이상인 경우 **합산**"으로
  // 같은 취지를 규정한다. 전량 장기이면 장기 그룹 = 전체라 단건 경로와 정확히 일치한다.
  let shortGain = 0;
  for (const sub of lotDetail.matched) {
    if (sub.perLotGain > 0 && sub.isShortTerm) shortGain += sub.perLotGain;
  }
  // 안분 잔액은 장기 그룹이 흡수 — Σ = taxBase 불변식 (memory `feedback_floor_residual_absorption`).
  const shortBase = shortGain > 0 ? Math.floor((taxBase * shortGain) / lotDetail.totalGain) : 0;
  const longBase = taxBase - shortBase;

  const shortTax =
    shortBase > 0 ? applyStockTaxRate(shortBase, taxCategory, isSME, true).calculatedTax : 0;
  const longTax =
    longBase > 0 ? applyStockTaxRate(longBase, taxCategory, isSME, false).calculatedTax : 0;

  const isMixedRate = shortBase > 0 && longBase > 0;

  // 한쪽 그룹만 남은 경우는 세율이 하나로 확정된다 → 그 계산의 세율·누진공제를 echo 한다.
  // (혼합이면 하나로 말할 수 없으므로 undefined 를 남긴다.)
  const soleGroup = isMixedRate
    ? undefined
    : shortBase > 0
      ? applyStockTaxRate(shortBase, taxCategory, isSME, true)
      : longBase > 0
        ? applyStockTaxRate(longBase, taxCategory, isSME, false)
        : undefined;

  return {
    calculatedTax: shortTax + longTax,
    isMixedRate,
    mixedNote: isMixedRate ? "단기(가목 1)·장기(가목 2) 세율 상이 (lotMatchingDetail 참조)" : undefined,
    appliedRate: soleGroup?.appliedRate,
    progressiveDeduction: soleGroup?.progressiveDeduction,
  };
}
