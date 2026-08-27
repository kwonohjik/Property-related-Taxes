/**
 * 주식 양도소득세 — 시장·대주주·기타자산 분류 모듈
 *
 * STEP 1: 과세대상 판정 (§94①3·§94①4·§94②)
 * - 시장 분류
 * - 대주주 판정 (시기별 임계 §157)
 * - 비과세 분기
 * - §94② 우선순위
 */

import type { StockTransferInput, StockTransferResult } from "./types/stock-transfer.types";
import { getMajorShareholderThreshold } from "./stock-rate-tables";
import { STOCK } from "@/lib/tax-engine/legal-codes/stock";

// ============================================================
// 분류 결과 타입
// ============================================================

export interface ClassificationResult {
  taxCategory: StockTransferResult["taxCategory"];
  appliedSection94: StockTransferResult["appliedSection94"];
  section94_2Applied: boolean;
  isExempt: boolean;
  exemptReason?: StockTransferResult["exemptReason"];
  basicDeductionGroup: StockTransferResult["basicDeductionGroup"];
  appliedRules: StockTransferResult["appliedRules"];
  warnings: string[];
  /** §157·§167의8 적용된 임계 (대주주 판정 결과 표시용) */
  appliedThreshold?: {
    shareRatio: number;
    marketCap: number;
    /** Phase B 신설 (2026-05-19) — UI 배지·hint 분기용 */
    isVentureRule?: boolean;
    /** Phase B 신설 (2026-05-19) — 결과 카드 조문 라벨용 */
    ruleSource?: "§157" | "§167의8①2호" | "§167의8①2호_벤처";
  };
  /** F-15·F-16 (2026-05-19) — 대차·사모펀드 자동 가산 적용 여부 */
  shareAugmentationApplied?: boolean;
  /** F-15·F-16 (2026-05-19) — 가산된 주식수 echo */
  augmentedShares?: number;
  /** F-09/F-10/F-14/F-23 (2026-05-19) — 판정 기준일 override 적용 사유 echo */
  judgmentBasis?: "default" | "merger" | "split" | "split_new_entity" | "incorporation";
  /** F-24 (2026-05-19) — 본인 미보유 시 자동 강제 합산 적용 여부 */
  forcedCombinedJudgment?: boolean;
}

// ============================================================
// 대주주 판정 (시행령 §157)
// ============================================================

/**
 * 대주주 판정 — 시기별 임계 자동 적용
 * OR 조건: 지분율 임계 OR 시총 임계 중 하나라도 충족 시 대주주
 * 판정 기준일 = priorYearEndDate (직전 사업연도 종료일)
 *
 * 적용 시장:
 * - 상장 3시장(kospi/kosdaq/konex): 시행령 §157
 * - 비상장(unlisted): 시행령 §167의8①2호
 * - 기타자산(other_asset): §94①4 별도 트랙 → 폼 토글 패스스루
 */
function judgeIsMajorShareholder(input: StockTransferInput): {
  isMajor: boolean;
  threshold: {
    shareRatio: number;
    marketCap: number;
    /** Phase B 신설 — UI 배지·hint 분기용 */
    isVentureRule?: boolean;
    /** Phase B 신설 — 결과 카드 조문 라벨용 */
    ruleSource?: "§157" | "§167의8①2호" | "§167의8①2호_벤처";
  };
  /** F-15·F-16 (2026-05-19) — 대차/사모펀드 자동 가산 적용 여부 */
  shareAugmentationApplied: boolean;
  /** F-15·F-16 (2026-05-19) — 자동 가산된 주식수 (lent + pefIndirect) */
  augmentedShares: number;
  /** F-09/F-10/F-14/F-23 (2026-05-19) — 판정 기준일 override 적용 사유 */
  judgmentBasis: "default" | "merger" | "split" | "split_new_entity" | "incorporation";
  /** F-24 (2026-05-19) — 본인 미보유 시 자동 강제 합산 적용 여부 */
  forcedCombinedJudgment: boolean;
  /** 폼 토글(isMajorShareholder)과 자동 산출값이 다른 경우 불일치 경고 */
  mismatchWarning?: string;
} {
  const { marketType, priorYearEndDate } = input;

  // 기타자산은 §94①4 별도 트랙 — 폼 토글 우선
  if (marketType === "other_asset") {
    return {
      isMajor: input.isMajorShareholder,
      threshold: { shareRatio: 0, marketCap: 0 },
      shareAugmentationApplied: false,
      augmentedShares: 0,
      judgmentBasis: "default",
      forcedCombinedJudgment: false,
    };
  }

  // F-24 (2026-05-19) — 본인 미보유 시 자동 강제 합산 분기
  // 기획재정부 금융세제-327, 2020.12.10. — 직전사업연도 종료일 본인 미보유 시 특수관계 기타주주
  // 합산하여 §157 비율·시총 판정. `isLargestShareholderGroup` 토글 OFF여도 자동 ON 강제.
  // 교재 §3장 이미지 51 Check Point ⑰.
  const forcedCombinedJudgment =
    input.selfShareRatio === 0 &&
    input.selfMarketCap === 0 &&
    (input.combinedShareRatio > 0 || input.combinedMarketCap > 0);
  const effectiveLargestGroup = input.isLargestShareholderGroup || forcedCombinedJudgment;

  // F-09/F-10/F-14/F-23 (2026-05-19) — 판정 기준일 override (합병·분할·신설법인 특수분기)
  // judgmentDateOverride 가 있으면 매트릭스 조회에 사용. 미지정 시 priorYearEndDate 사용.
  // 교재 §3장 이미지 50·51 Check Point ②③⑦⑯ (2010 소령 157⑧·소령 157④ 등).
  const judgmentDate = input.judgmentDateOverride ?? priorYearEndDate;

  // 상장 3시장(§157) + 비상장(§167의8①2호) 모두 자동 산출
  // Phase B (2026-05-19): isVentureCompany 옵션 전달 — 비상장 벤처 시총 40억 분기
  const threshold = getMajorShareholderThreshold(
    marketType as "kospi" | "kosdaq" | "konex" | "unlisted",
    judgmentDate,
    { isVentureCompany: input.isVentureCompany },
  );

  // F-15·F-16 (2026-05-19) — 대차주식·사모펀드 간접소유 자동 가산 (시행령 §157 2013.2.15. 이후)
  // 교재 §3장 이미지 51 Check Point ⑧·⑨.
  // 양도일 >= 2013.2.15. 이고 lent/PEF 입력값이 있을 때 지분율 추가 가산.
  // 시가총액 가산은 가격 외부 의존이라 사용자 책임 (UI hint 안내).
  const F15_F16_EFFECTIVE_DATE = new Date("2013-02-15");
  const lent = input.lentSharesCount ?? 0;
  const pef = input.pefIndirectSharesCount ?? 0;
  const rawAugment = lent + pef;
  const shareAugmentationApplied =
    input.transferDate >= F15_F16_EFFECTIVE_DATE &&
    rawAugment > 0 &&
    input.totalIssuedShares > 0;
  // 적용 안 됐을 때는 augmentedShares 도 0 (UI 결과 카드 혼동 방지)
  const augmentedShares = shareAugmentationApplied ? rawAugment : 0;
  const ratioAugment = shareAugmentationApplied
    ? augmentedShares / input.totalIssuedShares
    : 0;

  // 적용 지분율·시총 결정 (2-step 판정)
  // 본인 단독 임계 우선, 미달 시 합산 적용
  // F-15·F-16 가산은 본인·합산 모두에 적용 (대여자·간접소유 주식이 양측 판정에 동일하게 영향)
  // F-24 (2026-05-19) — 본인 미보유 시 effectiveLargestGroup 자동 강제 합산
  const effectiveShareRatio = effectiveLargestGroup
    ? Math.max(input.selfShareRatio + ratioAugment, input.combinedShareRatio + ratioAugment)
    : input.selfShareRatio + ratioAugment;
  const effectiveMarketCap = effectiveLargestGroup
    ? Math.max(input.selfMarketCap, input.combinedMarketCap)
    : input.selfMarketCap;

  const byRatio = effectiveShareRatio >= threshold.shareRatioThreshold;
  const byCap = effectiveMarketCap >= threshold.marketCapThreshold;
  const isMajor = byRatio || byCap;

  // 폼 토글 vs 자동 산출 불일치 경고 (옵션 A: 자동 산출 우선)
  let mismatchWarning: string | undefined;
  if (input.isMajorShareholder !== isMajor) {
    mismatchWarning =
      `자동 판정과 폼 토글 입력값이 다릅니다 — 자동 산출 우선 적용 ` +
      `(자동: ${isMajor ? "대주주" : "비대주주"}, 폼: ${input.isMajorShareholder ? "대주주" : "비대주주"})`;
  }

  return {
    isMajor,
    threshold: {
      shareRatio: threshold.shareRatioThreshold,
      marketCap: threshold.marketCapThreshold,
      isVentureRule: threshold.isVentureRule,
      ruleSource: threshold.ruleSource,
    },
    shareAugmentationApplied,
    augmentedShares,
    judgmentBasis: input.judgmentBasis ?? "default",
    forcedCombinedJudgment,
    mismatchWarning,
  };
}

// ============================================================
// 비과세 분기
// ============================================================

/**
 * 비과세 여부 판정
 * 1. 상장 비대주주 장내거래 (§94①3 가목 1) — 주된 비과세)
 * 2. K-OTC 중소·중견 소액주주 (§94①3 나목 단서)
 * 3. K-OTC 벤처기업 비대주주 (조특법 §14①7호)
 */
function judgeExemption(
  input: StockTransferInput,
  isMajor: boolean,
): { isExempt: boolean; reason?: StockTransferResult["exemptReason"] } {
  const { marketType, isKOTCTrading, isVentureCompany, isSmallMediumEnterprise, isMidsizeEnterprise, isListedSmallShareholder } = input;

  // 1. 상장 비대주주 장내거래 → 비과세 (§94①3 가목 1) 단서)
  //    isOnMarketTransaction이 명시적으로 false면 장외 거래 → 본문 적용 (과세)
  if (
    (marketType === "kospi" || marketType === "kosdaq" || marketType === "konex") &&
    !isMajor &&
    !isKOTCTrading &&
    input.isOnMarketTransaction !== false
  ) {
    return { isExempt: true, reason: "non_major_in_market" };
  }

  // 2. 비상장 + K-OTC + 중소·중견 소액주주 → §94①3 나목 단서 비과세
  //
  // 🔑 **비상장 전용이다.** 단서의 대상은 나목 **본문**의 주식, 즉 「주권**비상장**법인의 주식등」이다.
  //    게다가 K-OTC 자체가 비상장 전용 시장이다 — 자본시장법 §286①5호는 협회 업무를
  //    「**증권시장에 상장되지 아니한 주권**의 장외매매거래」로 정의한다.
  //    ⇒ 상장주식의 K-OTC 거래는 법문상 성립하지 않는다.
  //
  // 종전에는 marketType 가드가 없어 상장주식(kospi·kosdaq·konex)에도 이 비과세가 적용됐다
  // (최종세액 2,997,500 → 0). 상장 비대주주의 장외 양도는 §94①3 **가목 2)** 과세대상이다 —
  // 가목 2)와 나목 단서는 「장외면 잡는다」 ↔ 「K-OTC면 빼준다」로 **축이 정반대**다.
  if (
    marketType === "unlisted" &&
    isKOTCTrading &&
    (isSmallMediumEnterprise || isMidsizeEnterprise) &&
    isListedSmallShareholder
  ) {
    return { isExempt: true, reason: "kotc_sme_mid" };
  }

  // 3. 장외 거래 + 벤처기업 + 비대주주 → 조특법 §14①7호 비과세
  //
  // ⚠️ **여기에는 marketType 가드를 넣지 않는다** — 2번과 요건 축이 다르다.
  //    조특법 §14①7호는 「**증권거래세법 §3조1호나목**에서 정하는 방법으로 거래되는 벤처기업 주식」이고,
  //    그 나목은 「**증권시장 밖에서** 대통령령으로 정하는 방법」이다. 위임을 끝까지 따라가면
  //    증권거래세법 시행령 §1조의2① → 자본시장법 시행령 **§78**(다자간매매체결회사 — **상장주권** 대상)
  //    **또는 §178①**(협회 K-OTC — 비상장)이다.
  //
  //    🔑 두 갈래는 **시장 축과 1:1**이다(2026-08-27 축자 확인):
  //      · 자본시장법 **§8조의2⑤** — ATS 의 매매체결대상상품은 「**증권시장에 상장된 주권**,
  //        그 밖에 대통령령으로 정하는 증권」 ⇒ 상장 전용
  //      · 자본시장법 **§286①5호** — 협회 업무는 「**상장되지 아니한 주권**의 장외매매거래」 ⇒ 비상장 전용
  //    ⇒ `isKOTCTrading` 은 「그 방법으로 거래했다」는 **자기선언 하나**면 충분하고, 어느 갈래인지는
  //      `marketType` 이 정한다. UI 라벨은 그래서 시장에 따라 갈린다(`CompanyTypeBlock`).
  //    ⇒ 상장·비상장을 가리지 않고 **거래 장소**로만 한정한다. 가드를 넣으면 법 근거 없이
  //      불리하게 적용하는 것이 된다([[feedback_no_unfavorable_application_without_legal_basis]]).
  if (isKOTCTrading && isVentureCompany && !isMajor) {
    return { isExempt: true, reason: "kotc_venture" };
  }

  return { isExempt: false };
}

// ============================================================
// §94① 3호+4호 분류 + §94② 우선순위
// ============================================================

function classifySection94(
  input: StockTransferInput,
  isMajor: boolean,
): {
  taxCategory: StockTransferResult["taxCategory"];
  appliedSection94: StockTransferResult["appliedSection94"];
  section94_2Applied: boolean;
  basicDeductionGroup: StockTransferResult["basicDeductionGroup"];
} {
  const { marketType, isQualifyingBlockShareholder, isHeavyRealEstateForRate, isKOTCTrading } = input;

  // §94①4 해당 여부 (상장·비상장 모두 적용 가능)
  const hasSection94_4 = isQualifyingBlockShareholder || isHeavyRealEstateForRate;

  /**
   * §104①**9호** — 비사업용 토지 과다소유법인 주식.
   *
   * 시행령 **§167의7**: 「법 §94①4호 **다목 또는 라목**에 해당하는 주식등으로서 해당 법인의
   * 자산총액 중 「법인세법」 §55의2②에 따른 **비사업용토지 가액 비율이 100분의 50 이상**인
   * 법인의 주식등」 ⇒ 다목·라목 **둘 다**가 대상이고, 임계는 **50% 이상**이다.
   *
   * 분류(다목/라목)는 그대로 두고 **세율만** 기본세율 + 10%p로 올린다.
   * **미입력(undefined)은 미해당**이다 — 법 근거 없이 불리하게 적용하지 않는다.
   *
   * ⚠️ 단위는 **0~1 소수**다(형제 필드 `cumulativeTransferRatio`와 동일 — UI %, API가 ×0.01).
   */
  const isNblHeavyCorp = (input.nblRatioOfCorpAssets ?? 0) >= 0.5;
  /** 다목/라목 카테고리에 9호를 얹는다. 9호 미해당이면 종전 그대로. */
  const otherAssetCategory = (
    isBlockShareholder: boolean,
  ): StockTransferResult["taxCategory"] =>
    isBlockShareholder
      ? isNblHeavyCorp
        ? "other_asset_block_shareholder_nbl"
        : "other_asset_block_shareholder"
      : isNblHeavyCorp
        ? "other_asset_heavy_re_nbl"
        : "other_asset_heavy_re";

  // §94①3 해당 여부
  const hasSection94_3 =
    marketType === "kospi" ||
    marketType === "kosdaq" ||
    marketType === "konex" ||
    marketType === "unlisted";

  // §94② 우선순위: 3호+4호 동시 충족 시 4호(기타자산) 강제
  if (hasSection94_3 && hasSection94_4) {
    const taxCategory = otherAssetCategory(isQualifyingBlockShareholder);
    const appliedSection94: StockTransferResult["appliedSection94"] = isQualifyingBlockShareholder
      ? "①4다"
      : "①4라";
    return {
      taxCategory,
      appliedSection94,
      section94_2Applied: true,
      // §94② 발동 시 기본공제 1호 그룹 (부동산 합산)
      basicDeductionGroup: "real_estate_and_other_asset",
    };
  }

  // §94①4 단독 (other_asset 직접 선택)
  if (marketType === "other_asset") {
    return {
      taxCategory: otherAssetCategory(isQualifyingBlockShareholder),
      appliedSection94: isQualifyingBlockShareholder ? "①4다" : "①4라",
      section94_2Applied: false,
      basicDeductionGroup: "real_estate_and_other_asset",
    };
  }

  // §94①3 분류
  if (marketType === "kospi" || marketType === "kosdaq" || marketType === "konex") {
    if (isMajor) {
      return {
        taxCategory: "listed_major",
        appliedSection94: "①3가1)",
        section94_2Applied: false,
        basicDeductionGroup: "stock",
      };
    }
    // 비대주주 — 장외(K-OTC) vs 장내
    if (isKOTCTrading) {
      return {
        taxCategory: "listed_otc_non_major",
        appliedSection94: "①3가2)",
        section94_2Applied: false,
        basicDeductionGroup: "stock",
      };
    }
    // 장외 비대주주 (KOSPI/KOSDAQ/KONEX 비K-OTC) — 과세
    //
    // 근거: §94①3 가목 **2)** 「1)에 따른 대주주에 해당하지 아니하는 자가 **증권시장에서의
    // 거래에 의하지 아니하고** 양도하는 주식등」. 이 사실관계를 그대로 담는 목이 2)다.
    // (종전에는 가목 1)을 붙였는데, 1)은 「**대주주가** 양도하는 것」이라 정반대다.)
    if (input.isOnMarketTransaction === false) {
      return {
        taxCategory: "listed_off_market_non_major",
        appliedSection94: "①3가2)",
        section94_2Applied: false,
        basicDeductionGroup: "stock",
      };
    }
    // 장내 비대주주 → 비과세 (exemption에서 처리되지만 분류는 여기서)
    //
    // 가목 1)은 대주주, 2)는 비대주주의 **장외** 양도다. 비대주주의 **장내** 양도는
    // §94①3 어느 목에도 해당하지 않는다 — 과세대상이 아니어서 비과세인 것이다.
    // 종전에는 `①3가1)`을 붙여 「대주주 조항 적용」이라는 틀린 인용을 화면에 냈다.
    return {
      taxCategory: "listed_non_major_in_market",
      appliedSection94: "해당없음",
      section94_2Applied: false,
      basicDeductionGroup: "stock",
    };
  }

  // 비상장
  if (marketType === "unlisted") {
    return {
      taxCategory: isMajor ? "unlisted_major" : "unlisted_non_major",
      appliedSection94: "①3나_본문",
      section94_2Applied: false,
      basicDeductionGroup: "stock",
    };
  }

  // fallback (해외주식 등 스코프 외)
  return {
    taxCategory: "out_of_scope_foreign",
    appliedSection94: "①3나_본문",
    section94_2Applied: false,
    basicDeductionGroup: "stock",
  };
}

// ============================================================
// 외국·국외전출세 도메인 판정 헬퍼
// ============================================================

/**
 * 해외주식·국외전출세 도메인 여부 판정.
 *
 * 이들은 `foreign-stock.ts` / `exit-tax.ts` 독립 엔진에서 처리되며,
 * `classifyStockTransfer()` 본 흐름(§94 분류·§157 대주주·§94②) 적용 대상 아님.
 *
 * - `foreign_stock` (소득세법 §94①3다목·§118의2~§118의8): foreign-stock.ts
 * - `exit_tax` (소득세법 §118의9~§118의16): exit-tax.ts
 * - `out_of_scope_foreign` (legacy): classifyStockTransfer 내 차단 분기 유지
 */
export function isForeignTaxCategory(
  marketType: StockTransferInput["marketType"] | string | undefined
): boolean {
  return (
    marketType === "foreign_stock" ||
    marketType === "exit_tax" ||
    marketType === "out_of_scope_foreign"
  );
}

// ============================================================
// 메인 분류 함수
// ============================================================

export function classifyStockTransfer(input: StockTransferInput): ClassificationResult {
  const warnings: string[] = [];
  const appliedRules: StockTransferResult["appliedRules"] = [];

  // 해외주식·국외전출세 차단 (독립 엔진 도메인)
  if (isForeignTaxCategory(input.marketType)) {
    warnings.push(STOCK.SECTION_94_1_3_DA + " — 해외주식은 별도 도메인");
    return {
      taxCategory: "out_of_scope_foreign",
      appliedSection94: "①3나_본문",
      section94_2Applied: false,
      isExempt: false,
      basicDeductionGroup: "stock",
      appliedRules,
      warnings,
    };
  }

  // 대주주 판정
  const {
    isMajor,
    threshold,
    mismatchWarning,
    shareAugmentationApplied,
    augmentedShares,
    judgmentBasis,
    forcedCombinedJudgment,
  } = judgeIsMajorShareholder(input);
  if (mismatchWarning) {
    warnings.push(mismatchWarning);
  }
  // F-15·F-16 (2026-05-19) — 자동 가산 적용 시 appliedRules에 명시
  if (shareAugmentationApplied) {
    appliedRules.push("F15F16대차사모펀드자동가산");
  }
  // F-09/F-10/F-14/F-23 (2026-05-19) — 판정 기준일 override 적용 시 appliedRules에 명시
  if (judgmentBasis !== "default") {
    appliedRules.push("판정기준일특수분기");
  }
  // F-24 (2026-05-19) — 본인 미보유 강제 합산 시 appliedRules에 명시
  if (forcedCombinedJudgment) {
    appliedRules.push("본인미보유강제합산");
  }

  // §94① 분류
  const classResult = classifySection94(input, isMajor);

  // §94② 우선 적용 시 appliedRules에 추가
  if (classResult.section94_2Applied) {
    appliedRules.push("§94②우선");
    appliedRules.push("기타자산우선§55누진");
    if (classResult.basicDeductionGroup === "real_estate_and_other_asset") {
      appliedRules.push("기본공제부동산그룹합산");
    }
  }

  // 비과세 분기
  const exemptionResult = judgeExemption(input, isMajor);

  let taxCategory = classResult.taxCategory;
  let appliedSection94 = classResult.appliedSection94;

  if (exemptionResult.isExempt && exemptionResult.reason === "kotc_sme_mid") {
    taxCategory = "kotc_sme_mid_exempt";
    appliedSection94 = "①3나_단서";
    appliedRules.push("KOTC중소중견비과세");
  } else if (exemptionResult.isExempt && exemptionResult.reason === "kotc_venture") {
    taxCategory = "kotc_venture_exempt";
    appliedRules.push("KOTC벤처비과세");
  }

  return {
    taxCategory,
    appliedSection94,
    section94_2Applied: classResult.section94_2Applied,
    isExempt: exemptionResult.isExempt,
    exemptReason: exemptionResult.reason,
    basicDeductionGroup: classResult.basicDeductionGroup,
    appliedRules,
    warnings,
    appliedThreshold: threshold,
    shareAugmentationApplied,
    augmentedShares,
    judgmentBasis,
    forcedCombinedJudgment,
  };
}
