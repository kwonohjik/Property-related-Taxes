/**
 * 주식 양도소득세 — 세율 적용 모듈
 *
 * §104①11 가목·나목 분기 + §55 기타자산 누진
 * 단기 30% / 대주주 누진 / 비대주주 단일 / §55 누진 8단계
 */

import type { StockTransferResult } from "./types/stock-transfer.types";
import {
  STOCK_MAJOR_PROGRESSIVE_BRACKETS,
  BASIC_PROGRESSIVE_BRACKETS,
  NBL_HEAVY_CORP_BRACKETS,
} from "./stock-rate-tables";
import {
  STOCK_SHORT_TERM_RATE,
  STOCK_NON_MAJOR_SME_RATE,
  STOCK_NON_MAJOR_NON_SME_RATE,
  STOCK,
} from "@/lib/tax-engine/legal-codes/stock";
import { STOCK_FOREIGN_RATE, STOCK_FOREIGN_SME_RATE } from "@/lib/tax-engine/legal-codes/stock";
import { STOCK_FOREIGN } from "@/lib/tax-engine/legal-codes/stock";

// ============================================================
// 세율 적용 결과 타입
// ============================================================

export interface RateCalcResult {
  appliedRate: number;
  progressiveDeduction?: number;
  calculatedTax: number;
  appliedRuleRef: string;
  isShortTermRate: boolean;
}

// ============================================================
// 내부 유틸: 누진세율 계산 (brackets 기반)
// ============================================================

function calcProgressiveTaxFromBrackets(
  taxBase: number,
  brackets: readonly { max?: number; rate: number; deduction: number }[],
): { rate: number; deduction: number; tax: number } {
  if (taxBase <= 0) return { rate: 0, deduction: 0, tax: 0 };

  for (const bracket of brackets) {
    const max = bracket.max ?? Infinity;
    if (taxBase <= max) {
      const tax = Math.floor(taxBase * bracket.rate) - bracket.deduction;
      return { rate: bracket.rate, deduction: bracket.deduction, tax: Math.max(0, tax) };
    }
  }

  // 최고 구간
  const last = brackets[brackets.length - 1];
  const tax = Math.floor(taxBase * last.rate) - last.deduction;
  return { rate: last.rate, deduction: last.deduction, tax: Math.max(0, tax) };
}

/**
 * §55① 기본누진만 적용 — **§104⑤1호 전용**.
 *
 * 1호는 「해당 과세기간의 양도소득과세표준 **합계액**에 §55①에 따른 세율을 적용」이라
 * **§104①9호분(기본세율 + 10%p)까지 기본세율로** 계산해야 한다. 그래서 `taxCategory`를
 * 경유하는 `applyStockTaxRate`로는 표현할 수 없다(대표 종목이 9호면 +10%p가 섞인다).
 */
export function applyBasicProgressiveRate(taxBase: number): {
  rate: number;
  deduction: number;
  tax: number;
} {
  return calcProgressiveTaxFromBrackets(taxBase, BASIC_PROGRESSIVE_BRACKETS);
}

// ============================================================
// 메인: 세율 분기 적용
// ============================================================

/**
 * §167의2①「같은 세율을 적용받는 자산」 판정 축 — **주식 전용**.
 *
 * 근거: 소득세법 시행규칙 **별지 제84호서식 작성요령 4번** —
 *   「주식의 경우에는 …부표 2의 ④ **주식등 종류코드란의 세율이 같은 자산**(기타자산 주식은
 *    제외합니다)을 **합산하여** 적습니다.」
 * 부표 2 코드표가 세율을 **{10% · 20∼25% · 20% · 30%}** 4종으로 정한다.
 *
 * ⚠️ **「호」 축이 아니다.** §104①11호 하나에 10%·20%·20∼25%·30%가 전부 들어 있어서
 *    호로 묶으면 30% 자산과 10% 자산이 같은 군이 되어 서식과 어긋난다.
 *    (부동산이 「호」 축 `classifyRateGroup`을 쓰는 것은 §104⑤ 버킷과 결합돼서이고,
 *     주식은 §104⑤ 대상이 아니다 — 법 §104⑤ 본문은 §94①1·2·4호만 열거한다.)
 *
 * ⚠️ **누진표(20∼25%)는 하나의 세율**로 묶는다. 산출된 `appliedRate` 수치로 나누면
 *    그 값이 과세표준에 의존하고 과세표준은 통산 결과에 의존해 **순환**이 된다.
 *
 * 기타자산(§94①4호)은 §102①**1호** 그룹이라 애초에 다른 통산군이다 — 여기서 `"other_asset"`로
 * 내보내되, 호출자가 **§102① 호 그룹별로 코어를 따로 돌려** 그룹 간 통산을 차단한다.
 *
 * 반환값은 `offsetLossesCore`의 `rateKey`로 그대로 쓰인다.
 */
export function resolveStockRateKey(
  taxCategory: StockTransferResult["taxCategory"],
  isSmallMediumEnterprise: boolean,
  isShortTermHolding: boolean,
): string {
  switch (taxCategory) {
    // 기타자산 — §55① 누진(§104①9호는 +10%p). §102①1호 그룹이라 주식과 섞이지 않는다.
    case "other_asset_block_shareholder":
    case "other_asset_heavy_re":
      return "other_asset_progressive";
    case "other_asset_block_shareholder_nbl":
    case "other_asset_heavy_re_nbl":
      return "other_asset_progressive_nbl";

    // 비대주주 — §104①11호나목: 중소 10% / 그 밖 20%
    case "listed_otc_non_major":
    case "listed_off_market_non_major":
    case "unlisted_non_major":
      return isSmallMediumEnterprise ? "10" : "20";

    // 대주주 — 가목1) 비중소 1년미만 30% / 가목2) 20∼25% 누진
    case "listed_major":
    case "unlisted_major":
      return !isSmallMediumEnterprise && isShortTermHolding ? "30" : "20_25";

    // 국외주식 §104①12호 — 나목 20%. 국내 비대주주 비중소(20%)와 **같은 축**이다
    // (서식 부표 2에서 코드 61과 42·22가 모두 20%, 작성요령 7번 「국내ㆍ국외주식 … 통산액」).
    case "foreign_stock":
      return "20";

    // 비과세·범위 밖 — 통산 대상이 아니다(호출자가 exempt로 제외한다). 축은 무의미.
    case "listed_non_major_in_market":
    case "kotc_sme_mid_exempt":
    case "kotc_venture_exempt":
    case "out_of_scope_foreign":
    case "exit_tax":
      return "exempt_or_out_of_scope";
  }
}

/**
 * 과세표준에 세율 적용 — taxCategory 기반 분기
 *
 * PR-1 범위:
 *   listed_major / unlisted_major → 대주주 세율 (가목 1) 단기 30% / 가목 2) 누진)
 *   listed_otc_non_major / unlisted_non_major → 나목 (중소 10% / 비중소 20%)
 *   other_asset_* → §55 누진 8단계
 *   비과세 → 산출세액 0
 */
export function applyStockTaxRate(
  taxBase: number,
  taxCategory: StockTransferResult["taxCategory"],
  isSmallMediumEnterprise: boolean,
  isShortTermHolding: boolean,
  /**
   * 비과세 분기에서도 "가상의 적용 세율·산출세액"을 계산하기 위한 매핑.
   * - listed_non_major_in_market → listed_off_market_non_major (장외 비대주주 세율 동일)
   * - kotc_sme_mid_exempt / kotc_venture_exempt → listed_otc_non_major (나목 세율)
   * 최종 finalTax는 applyExemptZeroing에서 0으로 강제되지만, calculatedTax·appliedRate는 echo.
   */
  treatExemptAsTaxable: boolean = false,
): RateCalcResult {
  if (taxBase <= 0) {
    return {
      appliedRate: 0,
      calculatedTax: 0,
      appliedRuleRef: "과세표준 0 이하",
      isShortTermRate: false,
    };
  }

  // 비과세 → 과세 동등 카테고리 매핑 (산식 echo용)
  if (treatExemptAsTaxable) {
    if (taxCategory === "listed_non_major_in_market") {
      taxCategory = "listed_off_market_non_major";
    } else if (taxCategory === "kotc_sme_mid_exempt" || taxCategory === "kotc_venture_exempt") {
      taxCategory = "listed_otc_non_major";
    }
  }

  switch (taxCategory) {
    // --------------------------------------------------------
    // 비과세
    // --------------------------------------------------------
    case "listed_non_major_in_market":
    case "kotc_sme_mid_exempt":
    case "kotc_venture_exempt":
      return {
        appliedRate: 0,
        calculatedTax: 0,
        appliedRuleRef: "비과세",
        isShortTermRate: false,
      };

    // --------------------------------------------------------
    // 기타자산 §55 누진 8단계 (§104①1호)
    // --------------------------------------------------------
    case "other_asset_block_shareholder":
    case "other_asset_heavy_re": {
      const { rate, deduction, tax } = calcProgressiveTaxFromBrackets(
        taxBase,
        BASIC_PROGRESSIVE_BRACKETS,
      );
      return {
        appliedRate: rate,
        progressiveDeduction: deduction,
        calculatedTax: tax,
        appliedRuleRef: "소득세법 §55 누진세율 8단계",
        isShortTermRate: false,
      };
    }

    // --------------------------------------------------------
    // 기타자산 중 **비사업용 토지 과다소유법인 주식** — §104①9호 (기본세율 + 10%p)
    // --------------------------------------------------------
    //
    // 🔒 **이 두 case를 지우거나 default로 넘기지 마라.** 아래 `default`가 산출세액 **0**을
    //   반환하므로 **컴파일 에러 없이 조용히 세금이 사라진다**.
    //   ⇒ `taxCategory`를 늘리는 것만으로는 세율 분기가 강제되지 않는다(`Record<taxCategory,…>`
    //     2곳만 컴파일로 열린다). 그래서 anchor가 「9호 카테고리가 default로 떨어지지 않는다」를
    //     직접 고정한다(`nbl-heavy-corp-brackets.anchor.test.ts`).
    //
    // 대상: 시행령 §167의7 — §94①4호 **다목 또는 라목** 주식등으로서 해당 법인의 자산총액 중
    //   「법인세법」 §55의2②에 따른 **비사업용토지 가액 비율이 50% 이상**인 법인의 주식등.
    //   ⇒ 다목·라목 **둘 다**에 얹히므로 카테고리가 2종이다.
    case "other_asset_block_shareholder_nbl":
    case "other_asset_heavy_re_nbl": {
      const { rate, deduction, tax } = calcProgressiveTaxFromBrackets(
        taxBase,
        NBL_HEAVY_CORP_BRACKETS,
      );
      return {
        appliedRate: rate,
        progressiveDeduction: deduction,
        calculatedTax: tax,
        appliedRuleRef: `${STOCK.SECTION_104_1_9_NBL_HEAVY_CORP} (${STOCK.ENFORCEMENT_167_7_NBL_HEAVY_CORP_SCOPE})`,
        isShortTermRate: false,
      };
    }

    // --------------------------------------------------------
    // 상장 비대주주 장외 + 비상장 비대주주 → 나목 단일세율
    // --------------------------------------------------------
    case "listed_otc_non_major":
    case "listed_off_market_non_major":
    case "unlisted_non_major": {
      const rate = isSmallMediumEnterprise
        ? STOCK_NON_MAJOR_SME_RATE     // 중소기업 10%
        : STOCK_NON_MAJOR_NON_SME_RATE; // 비중소기업 20%
      const ruleRef = isSmallMediumEnterprise
        ? STOCK.SECTION_104_1_11_NA_1_SME
        : STOCK.SECTION_104_1_11_NA_2_NON_SME;
      return {
        appliedRate: rate,
        calculatedTax: Math.floor(taxBase * rate),
        appliedRuleRef: ruleRef,
        isShortTermRate: false,
      };
    }

    // --------------------------------------------------------
    // 대주주 (상장·비상장) — 가목 1) 단기 30% / 가목 2) 누진
    // --------------------------------------------------------
    case "listed_major":
    case "unlisted_major": {
      // §104①11 가목 1): 비중소기업 대주주 + 1년 미만 → 30%
      if (!isSmallMediumEnterprise && isShortTermHolding) {
        return {
          appliedRate: STOCK_SHORT_TERM_RATE,
          calculatedTax: Math.floor(taxBase * STOCK_SHORT_TERM_RATE),
          appliedRuleRef: STOCK.SECTION_104_1_11_GA_1_SHORT_TERM,
          isShortTermRate: true,
        };
      }
      // §104①11 가목 2): 그 외 대주주 → 누진 (3억 이하 20% / 초과 25%)
      const { rate, deduction, tax } = calcProgressiveTaxFromBrackets(
        taxBase,
        STOCK_MAJOR_PROGRESSIVE_BRACKETS,
      );
      return {
        appliedRate: rate,
        progressiveDeduction: deduction,
        calculatedTax: tax,
        appliedRuleRef: STOCK.SECTION_104_1_11_GA_2_PROGRESSIVE,
        isShortTermRate: false,
      };
    }

    // --------------------------------------------------------
    // 국외주식 §94①3호다목 — §104①12호나목 **20% 단일세율**
    // --------------------------------------------------------
    //
    // 🔒 **이 case를 지우면 아래 `default`가 세액 0을 반환해 조용히 세금이 사라진다**
    //   (위 §104①9호 주석과 같은 함정). 다종목 aggregate가 국외주식을 이 함수로 보낸다.
    //
    // ⚠️ 보유기간 구분이 없다 — §104①11호가목1)의 「1년 미만 30%」는 **가·나목 전용**이라
    //   다목에 오지 않는다. `isShortTermHolding`을 보지 않는 것이 맞다.
    // ✅ 가목(중소기업의 주식등 10%)도 도달한다 — 서식 각주가 가리키는 10%는
    //   「**우리나라 중소기업**이 해외 시장에 상장한 주식」이고, 영 §157의3 **2호**가
    //   「내국법인이 발행한 주식등으로서 해외 증권시장에 상장된 것」을 국외주식에 포함시킨다.
    case "foreign_stock":
      return isSmallMediumEnterprise
        ? {
            appliedRate: STOCK_FOREIGN_SME_RATE,
            calculatedTax: Math.floor(taxBase * STOCK_FOREIGN_SME_RATE),
            appliedRuleRef: STOCK_FOREIGN.SECTION_104_1_12_SME_TAX_RATE,
            isShortTermRate: false,
          }
        : {
            appliedRate: STOCK_FOREIGN_RATE,
            calculatedTax: Math.floor(taxBase * STOCK_FOREIGN_RATE),
            appliedRuleRef: STOCK_FOREIGN.SECTION_104_1_12_TAX_RATE,
            isShortTermRate: false,
          };

    // --------------------------------------------------------
    // 스코프 외 (외국법인 등) — validate에서 차단되어야 함
    // --------------------------------------------------------
    case "out_of_scope_foreign":
    default:
      return {
        appliedRate: 0,
        calculatedTax: 0,
        appliedRuleRef: "스코프 외 — validate에서 차단 필요",
        isShortTermRate: false,
      };
  }
}
