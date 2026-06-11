/**
 * 조특법 증여세 특례 2-스트림 분리과세 모듈
 *
 * 법령 근거:
 *   §30의5① — 창업자금: 5억 공제, 10% 단일세율 (일반 증여세 §53·§56 §47 배제)
 *   §30의5①후단 — "2회 이상 증여받는 경우 각각의 과세가액을 합산" (기간 무관)
 *   §30의5⑪ — "창업자금 외의 다른 증여재산은 창업자금 과세가액에 가산하지 아니함" (§47② 배제)
 *   §30의5⑫ — 신청 게이트 (특례 선택 = 신청 의제로 단순화)
 *   §30의6⑤ — §30의5 제8항~제13항 준용 → §30의5⑪·⑫ 동일 적용
 *
 * 2-스트림 아키텍처:
 *   특례 스트림: 특례 자산(isSpecialTreatmentAsset=true) + 특례 prior (기간무관)
 *               → 5억/10억 공제 → 10%(가업 120억 초과 20%) → §69 배제
 *               → 기납부 특례세액 차감 (priorSpecialTaxPaid)
 *   일반 스트림: 일반 자산(isSpecialTreatmentAsset=false) + 일반 prior (10년 cutoff)
 *               → §53·§53의2 공제 → §56 누진 → §57 → §58 → §69
 *
 * Pure function — DB 호출 없음.
 */

import { TAX_CREDIT, GIFT as GIFT_LAW } from "./legal-codes";
import { applyRate, calculateProgressiveTax } from "./tax-utils";
import type {
  AssetCategory,
  EstateItem,
  GiftDeductionResult,
  GiftTaxCreditInput,
  CalculationStep,
} from "./types/inheritance-gift.types";
import type { PriorGift } from "./types/inheritance-prior-gift.types";
import type { TaxBracket } from "./types";

// ============================================================
// 창업자금 특례 상수 (§30의5) — special-tax-treatment.ts와 동일값, 독립 정의
// ============================================================

/** 창업자금 기본 공제: 5억원 (§30의5①) */
const STARTUP_BASE_DEDUCTION = 500_000_000;

/** 창업자금 과세가액 한도 — 일반 (§30의5①): 50억원 */
const STARTUP_GIFT_LIMIT_NORMAL = 5_000_000_000;

/** 창업자금 과세가액 한도 — 10인 이상 신규고용 (§30의5①): 100억원 */
const STARTUP_GIFT_LIMIT_HIGH_HIRES = 10_000_000_000;

/** 창업자금 특례 세율: 10% (단일) */
const STARTUP_RATE = 0.1;

// ============================================================
// 가업승계 특례 상수 (§30의6) — special-tax-treatment.ts와 동일값, 독립 정의
// ============================================================

/** 가업승계 기본 공제: 10억원 (§30의6①) */
const FAMILY_BUSINESS_BASE_DEDUCTION = 1_000_000_000;

/** 가업승계 특례 세율 (120억 이하): 10% */
const FAMILY_BUSINESS_RATE_LOW = 0.1;

/** 가업승계 특례 세율 (120억 초과분): 20% (D3 정정 유지) */
const FAMILY_BUSINESS_RATE_HIGH = 0.2;

/** 가업승계 120억 구간 임계 (D3): 120억원 */
const FAMILY_BUSINESS_120B_THRESHOLD = 12_000_000_000;

// ============================================================
// 자산 귀속 분류
// ============================================================

export interface GiftItemPartition {
  /** 특례 스트림 귀속 자산 (isSpecialTreatmentAsset=true, 또는 단일 자산 전체) */
  specialItems: EstateItem[];
  /** 일반 스트림 귀속 자산 (isSpecialTreatmentAsset=false) */
  ordinaryItems: EstateItem[];
  /** 귀속 오류 여부 (N개 혼합에서 미설정 자산 존재) */
  hasUnassignedItems: boolean;
  /** 미설정 자산 수 */
  unassignedCount: number;
}

/**
 * 자산 귀속 분류 — 특례/일반 스트림 자산 분리.
 *
 * 귀속 규칙:
 *   - giftItems 1개: 전체 자동 특례 귀속 (isSpecialTreatmentAsset 무시)
 *   - giftItems N개: isSpecialTreatmentAsset 명시 필수.
 *     true  → 특례 스트림
 *     false → 일반 스트림
 *     undefined → 미설정 (hasUnassignedItems=true, validation 차단 대상)
 */
export function partitionGiftItems(giftItems: EstateItem[]): GiftItemPartition {
  if (giftItems.length === 0) {
    return {
      specialItems: [],
      ordinaryItems: [],
      hasUnassignedItems: false,
      unassignedCount: 0,
    };
  }

  // 자산 1개: 자동 특례 귀속
  if (giftItems.length === 1) {
    return {
      specialItems: giftItems,
      ordinaryItems: [],
      hasUnassignedItems: false,
      unassignedCount: 0,
    };
  }

  // 자산 N개: isSpecialTreatmentAsset 명시 필수
  const specialItems: EstateItem[] = [];
  const ordinaryItems: EstateItem[] = [];
  let unassignedCount = 0;

  for (const item of giftItems) {
    if (item.isSpecialTreatmentAsset === true) {
      specialItems.push(item);
    } else if (item.isSpecialTreatmentAsset === false) {
      ordinaryItems.push(item);
    } else {
      // undefined = 미설정
      unassignedCount++;
      // 미설정 자산은 일반 스트림으로 임시 분류 (validation이 차단하므로 도달 안 해야 함)
      ordinaryItems.push(item);
    }
  }

  return {
    specialItems,
    ordinaryItems,
    hasUnassignedItems: unassignedCount > 0,
    unassignedCount,
  };
}

// ============================================================
// 사전증여 prior 필터링
// ============================================================

/**
 * 특례 prior 필터 — specialTreatmentType이 있는 prior만 반환.
 * 이들은 §47② 일반 합산에서 제외되고 특례 스트림에서만 기간무관 합산됨.
 *
 * §30의5⑪: "창업자금 외의 다른 증여재산은 창업자금 과세가액에 가산하지 아니함"
 * (역으로: 창업자금 prior는 일반 합산에서 제외해야 함)
 */
export function filterSpecialPriors(
  priorGifts: PriorGift[],
  treatmentType: "startup" | "family_business",
): PriorGift[] {
  return priorGifts.filter(
    (p) => p.specialTreatmentType === treatmentType,
  );
}

/**
 * 일반 prior 필터 — specialTreatmentType이 없는 prior만 반환.
 * §47② 10년 cutoff 합산 대상.
 *
 * §30의5⑪: specialTreatmentType 설정 prior는 §47② 일반 합산에서 제외.
 */
export function filterOrdinaryPriors(priorGifts: PriorGift[]): PriorGift[] {
  return priorGifts.filter((p) => p.specialTreatmentType === undefined);
}

// ============================================================
// 특례 귀속 가능 재산 종류 판정 — UI ⑤·validateStep ⑧·Zod ⑩⑫ 단일 진실
// ============================================================

/** 소득세법 §94① 양도소득세 과세대상 재산 카테고리 — 창업자금 특례 제외 대상 (조특령 §27의5①) */
const INCOME_TAX_94_1_CATEGORIES: ReadonlySet<AssetCategory> = new Set([
  "real_estate_land", // §94①1 토지
  "real_estate_building", // §94①1 건물
  "real_estate_apartment", // §94①1 건물(공동주택)
  "listed_stock", // §94①3 주식
  "unlisted_stock", // §94①3 주식
]);

/**
 * 특례 귀속 가능 재산 종류 판정.
 *
 * - startup (§30의5① 전단 + 조특령 §27의5①): "토지·건물 등 대통령령으로 정하는 재산
 *   (= 소득세법 §94①에 따른 재산)을 제외한 재산" — 부동산·주식은 창업자금 불가.
 *   cash·financial·other 등은 허용 (financial 내 일부 §94① 해당 가능성은 차단하지 않고
 *   허용 — false positive 차단 방지, 안내는 UI 캡션).
 * - family_business (§30의6①): "해당 가업의 주식 또는 출자지분" — 주식만 허용.
 *   출자지분은 unlisted_stock 카테고리로 입력.
 */
export function isSpecialTreatmentEligibleCategory(
  category: AssetCategory,
  specialTreatment: "startup" | "family_business",
): boolean {
  if (specialTreatment === "family_business") {
    return category === "listed_stock" || category === "unlisted_stock";
  }
  return !INCOME_TAX_94_1_CATEGORIES.has(category);
}

/** 차단 사유 문구 (validateStep ⑧·Zod ⑩⑫·UI ⑤ 공용) */
export const SPECIAL_TREATMENT_CATEGORY_BLOCK_REASON: Record<
  "startup" | "family_business",
  string
> = {
  startup:
    "소득세법 §94①의 양도소득세 과세대상 재산(토지·건물·주식 등)은 창업자금 과세특례 대상이 아닙니다 (조특법 §30의5① · 시행령 §27의5①)",
  family_business:
    "가업승계 과세특례는 가업의 주식·출자지분만 대상입니다 (조특법 §30의6①)",
};

// ============================================================
// 특례 스트림 계산 결과
// ============================================================

export interface SpecialStreamResult {
  /** 특례 스트림 합산 과세가액 = 신규 특례가액 + 과거 특례 prior 가액(기간무관) */
  aggregatedValue: number;
  /** 특례 과세표준 = aggregatedValue - 법정공제(5억/10억) */
  taxBase: number;
  /** 특례 산출세액(합산 기준) */
  grossSpecialTax: number;
  /** 기납부 특례세액 합산 (Σ priorSpecialTaxPaid) */
  priorSpecialTaxPaid: number;
  /** 최종 특례 스트림 세액 = max(0, grossSpecialTax - priorSpecialTaxPaid) */
  finalTax: number;
  /** 특례 적격 여부 (투자미완료·10년미만 등 미적격 시 false → 폴백) */
  isEligible: boolean;
  /** 미적격 사유 */
  ineligibleReason?: string;
  /**
   * 한도 초과분 중 이번 신규 증여분 — 일반 스트림 합산 대상.
   * §30의5①은 "창업자금" 정의 자체를 과세가액 50억(신규고용 10명 이상 100억) 한도로 캡,
   * §30의6①은 영위기간별 한도(300/400/600억)를 과세가액에 적용 — 초과분은 특례 대상이 아니므로
   * 일반 증여세 과세. min(합산 과세가액 − 한도, 신규 특례가액) — 과거 prior 기인 초과분은
   * 과거 신고분이므로 이번 일반 스트림에 합산하지 않음(이중과세 방지).
   */
  excessToOrdinary: number;
  breakdown: CalculationStep[];
  warnings: string[];
}

/**
 * 창업자금 특례 스트림 계산 (§30의5).
 *
 * 합산: 신규 특례가액 + 과거 특례 prior 가액 (기간무관, §30의5①후단)
 * 공제: 5억원 (§30의5①)
 * 세율: 10% 단일 (D1 정정)
 * §69 배제: 호출자(gift-tax.ts)가 처리
 * 기납부 차감: Σ priorSpecialTaxPaid
 */
function calcStartupStream(
  specialItemsValue: number,
  specialPriors: PriorGift[],
  creditInput: GiftTaxCreditInput,
): SpecialStreamResult {
  const breakdown: CalculationStep[] = [];
  const warnings: string[] = [];

  // 투자 미완료 폴백 (§30의5④ — 미적격 시 일반 과세)
  if (creditInput.startupInvestmentCompleted === false) {
    warnings.push(
      "창업자금 투자 완료 조건 미충족(§30의5④) — 특례 미적용, 일반 증여세 과세로 폴백",
    );
    return {
      aggregatedValue: 0,
      taxBase: 0,
      grossSpecialTax: 0,
      priorSpecialTaxPaid: 0,
      finalTax: 0,
      isEligible: false,
      ineligibleReason: "창업자금 투자 완료 조건 미충족 (§30의5④)",
      excessToOrdinary: 0,
      breakdown,
      warnings,
    };
  }

  // §30의5①후단: 기간무관 합산
  const priorSpecialValue = specialPriors.reduce((s, p) => s + p.giftAmount, 0);
  const aggregatedValue = specialItemsValue + priorSpecialValue;

  breakdown.push({
    label: "창업자금 신규 증여가액",
    amount: specialItemsValue,
    lawRef: TAX_CREDIT.STARTUP_FUND,
  });
  if (priorSpecialValue > 0) {
    breakdown.push({
      label: `창업자금 과거 특례 합산 (§30의5①후단, 기간무관, ${specialPriors.length}건)`,
      amount: priorSpecialValue,
      lawRef: TAX_CREDIT.STARTUP_FUND,
    });
  }
  breakdown.push({
    label: "창업자금 합산 과세가액",
    amount: aggregatedValue,
    lawRef: TAX_CREDIT.STARTUP_FUND,
  });

  // 한도 적용 (§30의5①)
  const giftLimit = creditInput.startupNewHiresAtLeast10
    ? STARTUP_GIFT_LIMIT_HIGH_HIRES
    : STARTUP_GIFT_LIMIT_NORMAL;
  const eligibleAmount = Math.min(aggregatedValue, giftLimit);
  // 한도 초과분 중 신규 증여분만 일반 스트림 이관 (prior 기인분은 과거 신고분 — 이중과세 방지)
  const excessToOrdinary = Math.min(
    aggregatedValue - eligibleAmount,
    specialItemsValue,
  );
  if (eligibleAmount < aggregatedValue) {
    breakdown.push({
      label: `과세가액 한도 (${(giftLimit / 100_000_000).toFixed(0)}억) 적용`,
      amount: eligibleAmount,
      lawRef: TAX_CREDIT.STARTUP_FUND,
      note: `한도 초과분 중 신규 증여분 ${excessToOrdinary.toLocaleString()}원은 일반 스트림으로 이전`,
    });
    warnings.push(
      `창업자금 과세가액 ${(giftLimit / 100_000_000).toFixed(0)}억 한도 초과 — 초과분은 일반 증여세 적용 (§30의5①)`,
    );
  }

  // 특례 과세표준 = 한도 내 금액 - 5억 공제
  const taxBase = Math.max(0, eligibleAmount - STARTUP_BASE_DEDUCTION);
  breakdown.push(
    {
      label: "창업자금 기본 공제 (5억, §30의5①)",
      amount: -STARTUP_BASE_DEDUCTION,
      lawRef: TAX_CREDIT.STARTUP_FUND,
    },
    {
      label: "창업자금 특례 과세표준",
      amount: taxBase,
      lawRef: TAX_CREDIT.STARTUP_FUND,
    },
  );

  // 10% 단일세율
  const grossSpecialTax = applyRate(taxBase, STARTUP_RATE);
  breakdown.push({
    label: `창업자금 특례 산출세액 (과세표준 ${taxBase.toLocaleString()} × 10%)`,
    amount: grossSpecialTax,
    lawRef: TAX_CREDIT.STARTUP_FUND,
  });

  // §30의5①후단 기납부 특례세액 차감
  const priorSpecialTaxPaid = Math.max(
    0,
    specialPriors.reduce((s, p) => s + (p.priorSpecialTaxPaid ?? 0), 0),
  );
  if (priorSpecialTaxPaid > 0) {
    breakdown.push({
      label: `과거 창업자금 특례세액 기납부 차감 (§30의5①후단)`,
      amount: -priorSpecialTaxPaid,
      lawRef: TAX_CREDIT.STARTUP_FUND,
      note: `기납부 합계 ${priorSpecialTaxPaid.toLocaleString()}원`,
    });
  }

  const finalTax = Math.max(0, grossSpecialTax - priorSpecialTaxPaid);
  breakdown.push({
    label: "창업자금 특례 스트림 세액",
    amount: finalTax,
    lawRef: TAX_CREDIT.STARTUP_FUND,
  });

  return {
    aggregatedValue,
    taxBase,
    grossSpecialTax,
    priorSpecialTaxPaid,
    finalTax,
    isEligible: true,
    excessToOrdinary,
    breakdown,
    warnings,
  };
}

/**
 * 가업승계 특례 스트림 계산 (§30의6).
 *
 * 합산: 신규 특례가액 + 과거 특례 prior 가액 (기간무관, §30의6⑤→§30의5①후단 준용)
 * 공제: 10억원 (§30의6①)
 * 세율: 120억 이하 10% / 초과분 20% (D3 정정 유지)
 * 한도: 영위기간별 (10년 이상 300억, 20년 이상 400억, 30년 이상 600억)
 * §69 배제: 호출자(gift-tax.ts)가 처리
 */
function calcFamilyBusinessStream(
  specialItemsValue: number,
  specialPriors: PriorGift[],
  creditInput: GiftTaxCreditInput,
): SpecialStreamResult {
  const breakdown: CalculationStep[] = [];
  const warnings: string[] = [];

  // 가업승계 한도 계산 (special-tax-treatment.ts getFamilyBusinessLimit과 동일 로직)
  const businessYears = creditInput.familyBusinessYears ?? 10;
  let limit: number;
  if (businessYears >= 30) {
    limit = 60_000_000_000; // 600억
  } else if (businessYears >= 20) {
    limit = 40_000_000_000; // 400억 (D4 정정)
  } else if (businessYears >= 10) {
    limit = 30_000_000_000; // 300억
  } else {
    // 10년 미만 특례 불가 — 폴백
    warnings.push("가업승계 특례 불가 — 가업 영위기간 10년 미만 (§30의6①)");
    return {
      aggregatedValue: 0,
      taxBase: 0,
      grossSpecialTax: 0,
      priorSpecialTaxPaid: 0,
      finalTax: 0,
      isEligible: false,
      ineligibleReason: "가업 영위기간 10년 미만 (§30의6①)",
      excessToOrdinary: 0,
      breakdown,
      warnings,
    };
  }

  // §30의6⑤→§30의5①후단 준용: 기간무관 합산
  const priorSpecialValue = specialPriors.reduce((s, p) => s + p.giftAmount, 0);
  const aggregatedValue = specialItemsValue + priorSpecialValue;

  breakdown.push({
    label: "가업승계 신규 증여가액",
    amount: specialItemsValue,
    lawRef: TAX_CREDIT.FAMILY_BUSINESS,
  });
  if (priorSpecialValue > 0) {
    breakdown.push({
      label: `가업승계 과거 특례 합산 (§30의6⑤→§30의5①후단, 기간무관, ${specialPriors.length}건)`,
      amount: priorSpecialValue,
      lawRef: TAX_CREDIT.FAMILY_BUSINESS,
    });
  }
  breakdown.push({
    label: "가업승계 합산 과세가액",
    amount: aggregatedValue,
    lawRef: TAX_CREDIT.FAMILY_BUSINESS,
  });

  // 한도 적용
  const eligibleAmount = Math.min(aggregatedValue, limit);
  // 한도 초과분 중 신규 증여분만 일반 스트림 이관 (prior 기인분은 과거 신고분 — 이중과세 방지)
  const excessToOrdinary = Math.min(
    aggregatedValue - eligibleAmount,
    specialItemsValue,
  );
  if (eligibleAmount < aggregatedValue) {
    breakdown.push({
      label: `가업승계 특례 한도 (${(limit / 100_000_000).toFixed(0)}억, 영위 ${businessYears}년)`,
      amount: eligibleAmount,
      lawRef: TAX_CREDIT.FAMILY_BUSINESS,
      note: `한도 초과분 중 신규 증여분 ${excessToOrdinary.toLocaleString()}원은 일반 스트림으로 이전`,
    });
    warnings.push(
      `가업승계 과세가액 한도 초과 — 초과분은 일반 증여세 적용 (§30의6①)`,
    );
  }

  // 특례 과세표준 = 한도 내 금액 - 10억 공제
  const taxBase = Math.max(0, eligibleAmount - FAMILY_BUSINESS_BASE_DEDUCTION);
  breakdown.push(
    {
      label: "가업승계 기본 공제 (10억, §30의6①)",
      amount: -FAMILY_BUSINESS_BASE_DEDUCTION,
      lawRef: TAX_CREDIT.FAMILY_BUSINESS,
    },
    {
      label: "가업승계 특례 과세표준",
      amount: taxBase,
      lawRef: TAX_CREDIT.FAMILY_BUSINESS,
    },
  );

  // D3: 120억 이하 10% / 초과분 20%
  let grossSpecialTax: number;
  if (taxBase <= FAMILY_BUSINESS_120B_THRESHOLD) {
    grossSpecialTax = applyRate(taxBase, FAMILY_BUSINESS_RATE_LOW);
    breakdown.push({
      label: `가업승계 특례 산출세액 (과세표준 ${taxBase.toLocaleString()} × 10%)`,
      amount: grossSpecialTax,
      lawRef: TAX_CREDIT.FAMILY_BUSINESS,
    });
  } else {
    const lowPart = applyRate(FAMILY_BUSINESS_120B_THRESHOLD, FAMILY_BUSINESS_RATE_LOW);
    const excessPart = applyRate(
      taxBase - FAMILY_BUSINESS_120B_THRESHOLD,
      FAMILY_BUSINESS_RATE_HIGH,
    );
    grossSpecialTax = lowPart + excessPart;
    breakdown.push(
      {
        label: `가업승계 특례 산출세액 (120억 이하 10%: ${lowPart.toLocaleString()})`,
        amount: lowPart,
        lawRef: TAX_CREDIT.FAMILY_BUSINESS,
      },
      {
        label: `가업승계 특례 산출세액 (120억 초과 20%: ${excessPart.toLocaleString()})`,
        amount: excessPart,
        lawRef: TAX_CREDIT.FAMILY_BUSINESS,
      },
    );
  }

  // §30의6⑤→§30의5①후단 준용: 기납부 특례세액 차감
  const priorSpecialTaxPaid = Math.max(
    0,
    specialPriors.reduce((s, p) => s + (p.priorSpecialTaxPaid ?? 0), 0),
  );
  if (priorSpecialTaxPaid > 0) {
    breakdown.push({
      label: "과거 가업승계 특례세액 기납부 차감 (§30의6⑤)",
      amount: -priorSpecialTaxPaid,
      lawRef: TAX_CREDIT.FAMILY_BUSINESS,
      note: `기납부 합계 ${priorSpecialTaxPaid.toLocaleString()}원`,
    });
  }

  const finalTax = Math.max(0, grossSpecialTax - priorSpecialTaxPaid);
  breakdown.push({
    label: "가업승계 특례 스트림 세액",
    amount: finalTax,
    lawRef: TAX_CREDIT.FAMILY_BUSINESS,
  });

  return {
    aggregatedValue,
    taxBase,
    grossSpecialTax,
    priorSpecialTaxPaid,
    finalTax,
    isEligible: true,
    excessToOrdinary,
    breakdown,
    warnings,
  };
}

/**
 * 특례 스트림 계산 통합 진입점.
 *
 * @param specialItemsValue 특례 귀속 자산 평가액 합계
 * @param specialPriors 특례 prior 배열 (specialTreatmentType 일치분)
 * @param creditInput 증여세 세액공제 입력
 */
export function calcSpecialTreatmentStream(
  specialItemsValue: number,
  specialPriors: PriorGift[],
  creditInput: GiftTaxCreditInput,
): SpecialStreamResult {
  if (!creditInput.specialTreatment) {
    // specialTreatment 미선택: 이 함수에 도달하면 안 됨 (방어 코드)
    return {
      aggregatedValue: 0,
      taxBase: 0,
      grossSpecialTax: 0,
      priorSpecialTaxPaid: 0,
      finalTax: 0,
      isEligible: false,
      ineligibleReason: "특례 미선택",
      excessToOrdinary: 0,
      breakdown: [],
      warnings: [],
    };
  }

  if (creditInput.specialTreatment === "startup") {
    return calcStartupStream(specialItemsValue, specialPriors, creditInput);
  }
  return calcFamilyBusinessStream(specialItemsValue, specialPriors, creditInput);
}

// ============================================================
// 일반 스트림 결과 타입
// ============================================================

export interface OrdinaryStreamResult {
  /** 일반 스트림 합산 과세가액 (일반 자산 + 일반 prior 10년 합산) */
  aggregatedValue: number;
  /** 일반 스트림 과세표준 (§53 공제 후) */
  taxBase: number;
  /** 일반 스트림 산출세액 (§56 누진세율) */
  computedTax: number;
  /** 세대생략 할증액 (§57) */
  generationSkipSurcharge: number;
  /** 최종 일반 스트림 세액 (§58·§69 적용 후) */
  finalTax: number;
  breakdown: CalculationStep[];
  warnings: string[];
}

/**
 * 일반 스트림 세액 계산.
 *
 * 기존 calcGiftTax 파이프라인을 그대로 따르되,
 * 입력으로 일반 자산·일반 prior만 전달받아 실행.
 *
 * §47② 10년 합산은 aggregatePriorGiftsForGift를 거친 ordinaryPriorTotal로 직접 전달.
 * §57 세대생략·§58 기납부·§69 신고세액공제는 일반 스트림에만 적용됨.
 *
 * @param ordinaryNetValue 일반 스트림 자산 순 과세가액 (비과세·채무 차감 후)
 * @param ordinaryPriorTotal §47② 10년 내 일반 prior 합산액
 * @param deductionInput 증여공제 입력 (§53·§53의2)
 * @param brackets 누진세율 구간
 * @param generationSkipSurchargeAmount §57 세대생략 할증액 (호출자 산출값 전달)
 * @param priorPaidCredit §58 기납부세액공제 (호출자 산출값 전달)
 * @param filingCredit §69 신고세액공제 (호출자 산출값 전달)
 */
export function calcOrdinaryGiftStream(params: {
  ordinaryNetValue: number;
  ordinaryPriorTotal: number;
  deductionInput: GiftDeductionResult;
  brackets: TaxBracket[];
  generationSkipSurchargeAmount: number;
  priorPaidCredit: number;
  filingCredit: number;
  foreignTaxCredit: number;
}): OrdinaryStreamResult {
  const {
    ordinaryNetValue,
    ordinaryPriorTotal,
    deductionInput: deductionResult,
    brackets,
    generationSkipSurchargeAmount,
    priorPaidCredit,
    filingCredit,
    foreignTaxCredit,
  } = params;

  const breakdown: CalculationStep[] = [];

  // 합산 과세가액
  const aggregatedValue = ordinaryNetValue + ordinaryPriorTotal;
  breakdown.push({
    label: "일반 스트림 합산 증여가액",
    amount: aggregatedValue,
    lawRef: GIFT_LAW.TAXABLE_VALUE,
    note: `일반 자산 ${ordinaryNetValue.toLocaleString()} + 일반 prior ${ordinaryPriorTotal.toLocaleString()}`,
  });

  // §53 공제
  const totalDeduction = deductionResult.totalDeduction;
  breakdown.push({
    label: "일반 스트림 증여재산공제 (§53·§53의2)",
    amount: -totalDeduction,
    lawRef: GIFT_LAW.GIFT_DEDUCTION,
  });

  // 과세표준
  const TAX_BASE_MIN = 500_000;
  const rawTaxBase = Math.max(0, aggregatedValue - totalDeduction);
  const taxBase = rawTaxBase < TAX_BASE_MIN ? 0 : rawTaxBase;
  breakdown.push({
    label: "일반 스트림 과세표준 (§55)",
    amount: taxBase,
    lawRef: GIFT_LAW.TAX_BASE,
    note: taxBase === 0 && rawTaxBase > 0
      ? `50만원 미만(${rawTaxBase.toLocaleString()}) — 과세 없음`
      : undefined,
  });

  // §56 누진세율
  const computedTax = calculateProgressiveTax(taxBase, brackets);
  breakdown.push({
    label: "일반 스트림 산출세액 (§56)",
    amount: computedTax,
    lawRef: GIFT_LAW.TAX_RATE,
  });

  // §57 세대생략 할증 (호출자가 산출, 여기서 합산만)
  if (generationSkipSurchargeAmount > 0) {
    breakdown.push({
      label: "일반 스트림 세대생략 할증 (§57)",
      amount: generationSkipSurchargeAmount,
      lawRef: GIFT_LAW.GENERATION_SKIP,
    });
  }
  const totalWithSurcharge = computedTax + generationSkipSurchargeAmount;

  // §58 기납부세액공제 (호출자가 산출)
  if (priorPaidCredit > 0) {
    breakdown.push({
      label: "일반 스트림 §58 기납부세액공제",
      amount: -priorPaidCredit,
      lawRef: GIFT_LAW.PRIOR_TAX_CREDIT,
    });
  }

  // §59 외국납부세액공제
  if (foreignTaxCredit > 0) {
    breakdown.push({
      label: "일반 스트림 §59 외국납부세액공제",
      amount: -foreignTaxCredit,
    });
  }

  // §69 신고세액공제 (호출자가 산출)
  if (filingCredit > 0) {
    breakdown.push({
      label: "일반 스트림 §69 신고세액공제",
      amount: -filingCredit,
      lawRef: GIFT_LAW.TAX_BASE, // §69 법령 상수는 TAX_CREDIT.FILING_CREDIT이나 GIFT_LAW에 없으므로 참조 생략
    });
  }

  const finalTax = Math.max(
    0,
    totalWithSurcharge - priorPaidCredit - foreignTaxCredit - filingCredit,
  );
  breakdown.push({
    label: "일반 스트림 결정세액",
    amount: finalTax,
  });

  return {
    aggregatedValue,
    taxBase,
    computedTax,
    generationSkipSurcharge: generationSkipSurchargeAmount,
    finalTax,
    breakdown,
    warnings: [],
  };
}
