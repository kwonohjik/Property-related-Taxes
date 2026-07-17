/**
 * 상속세 물납(§73) 엔진 — 상증법 §73 / 상증령 §73·§74
 * 설계: docs/02-design/features/inheritance-payment-in-kind.engine.design.md
 *
 * 결정세액 미영향 납부방법 투영(API 미경유, 결과뷰 호출). 단일 진실 — UI 재구현 금지.
 * 분모 확정(조심2016서3563·조심2024중4490):
 *   - 납부세액 = 산출세액 − 세액공제 = finalTax (산출세액 §26 아님)
 *   - §73①1호 분모 estateBase = grossEstateValue − exemptAmount + priorGiftToHeirTotal
 *   - §73④ 비상장 캡 기준 = taxableEstateValue (과세가액, ≠1호 분모)
 */
import { safeMultiplyThenDivide } from "../tax-utils";
import { buildSummaryCategory } from "../inheritance-asset-category";
import type {
  PaymentInKindAssets,
  PaymentInKindInput,
  PaymentInKindResult,
  FillOrderStep,
} from "../types/inheritance-payment-in-kind.types";
import type {
  EstateItem,
  InheritanceTaxResult,
} from "../types/inheritance-gift.types";

/** §73①2호 — 물납 신청 최소 납부세액(초과 요건) */
export const PAYMENT_IN_KIND_MIN_TAX = 20_000_000;

/** §74② 충당순서 라벨 (6단계) */
const FILL_ORDER_LABELS = [
  "국채·공채",
  "상장유가증권(처분제한)",
  "국내 부동산",
  "그 밖의 유가증권",
  "비상장주식",
  "상속인 거주 주택·부수토지",
] as const;

/** §73①1호 분모 — 해당 상속재산가액(채무 차감 前) */
function computeEstateBase(input: PaymentInKindInput): number {
  return Math.max(
    0,
    input.grossEstateValue - input.exemptAmount + input.priorGiftToHeirTotal,
  );
}

/** 1호 분자 — 충당가능 부동산·유가증권(관리처분 부적당 §73③ 제외) */
function computeEligibleRealSec(input: PaymentInKindInput): number {
  const { realEstateValue, eligibleSecuritiesValue, ineligibleManagementValue } =
    input.assets;
  return Math.max(
    0,
    realEstateValue + eligibleSecuritiesValue - ineligibleManagementValue,
  );
}

/** 물납 적격 판정 (§73① 3요건) — 인쇄 게이트용 경량 술어 */
export function isPaymentInKindEligible(input: PaymentInKindInput): boolean {
  const estateBase = computeEstateBase(input);
  const eligibleRealSec = computeEligibleRealSec(input);
  return (
    eligibleRealSec > Math.floor(estateBase / 2) &&
    input.finalTax > PAYMENT_IN_KIND_MIN_TAX &&
    input.finalTax > input.assets.netFinancialValue
  );
}

export function calcPaymentInKindAssessment(
  input: PaymentInKindInput,
): PaymentInKindResult {
  const { finalTax, taxableEstateValue, assets, requestedAmount } = input;
  const {
    realEstateValue,
    eligibleSecuritiesValue,
    unlistedStockValue,
    tradableListedValue,
    netFinancialValue,
    heirResidenceValue,
    ineligibleManagementValue,
  } = assets;

  const estateBase = computeEstateBase(input);
  const eligibleRealSec = computeEligibleRealSec(input);

  // 요건 (§73①1~3호) — 1호 분모 estateBase, "1/2 초과"
  const halfThreshold = Math.floor(estateBase / 2);
  const meetsOverHalf = eligibleRealSec > halfThreshold;
  const meetsTaxOver20M = finalTax > PAYMENT_IN_KIND_MIN_TAX;
  const meetsTaxOverFinancial = finalTax > netFinancialValue;
  const eligible = meetsOverHalf && meetsTaxOver20M && meetsTaxOverFinancial;

  // 허용한도 (상증령 §73① — 적은 금액). 안분은 BigInt(safeMul) 정밀
  const limit1 =
    estateBase > 0
      ? safeMultiplyThenDivide(finalTax, eligibleRealSec, estateBase)
      : 0;
  const limit2 = Math.max(0, finalTax - netFinancialValue - tradableListedValue);
  const allowedLimit = Math.max(0, Math.min(limit1, limit2));

  // 비상장 캡 (§73④, 기준=상속세 과세가액 taxableEstateValue)
  const unlistedStockCap = Math.max(
    0,
    finalTax - (taxableEstateValue - unlistedStockValue - heirResidenceValue),
  );

  // 충당순서 (상증령 §74②)
  const availableByOrder = [
    0, // 1 국채·공채 (estate 자동도출 분류 없음 — 후속)
    eligibleSecuritiesValue, // 2 상장유가증권(처분제한)
    Math.max(0, realEstateValue - heirResidenceValue), // 3 국내 부동산 (§74②3호 — 제6호 거주주택 제외)
    0, // 4 그 밖의 유가증권
    unlistedStockValue, // 5 비상장주식
    heirResidenceValue, // 6 상속인 거주 주택·부수토지 (§74②6호)
  ];
  const fillOrder: FillOrderStep[] = FILL_ORDER_LABELS.map((label, i) => ({
    order: i + 1,
    label,
    availableValue: availableByOrder[i],
    note:
      i === 4
        ? "최후순위·§73④ 한도·관리처분 부적당 주의(§71②)"
        : i === 5
          ? "최후순위"
          : undefined,
  }));

  // 경고
  const warnings: string[] = [];
  if (unlistedStockValue > 0) {
    warnings.push(
      "비상장주식은 충당순서 최후순위이며 발행회사 폐업·결손금 등으로 관리·처분 부적당 시 물납이 제한될 수 있습니다(상증령 §74②5호·§71②).",
    );
  }
  if (ineligibleManagementValue > 0) {
    warnings.push(
      "관리·처분 부적당 재산은 물납 청구액에서 제외됩니다(상증령 §73③·§71①).",
    );
  }
  if (eligible && eligibleRealSec < allowedLimit) {
    warnings.push(
      "납부세액에 적합한 가액의 물건이 없으면 한도 초과분도 물납 허가될 수 있습니다(상증령 §73②).",
    );
  }

  const acceptedRequest =
    requestedAmount != null ? Math.min(requestedAmount, allowedLimit) : undefined;

  return {
    eligible,
    requirement: {
      realEstateSecuritiesValue: eligibleRealSec,
      halfThreshold,
      meetsOverHalf,
      taxThreshold: PAYMENT_IN_KIND_MIN_TAX,
      meetsTaxOver20M,
      financialValue: netFinancialValue,
      meetsTaxOverFinancial,
    },
    estateBase,
    limit1,
    limit2,
    allowedLimit,
    unlistedStockCap,
    fillOrder,
    requestedAmount,
    acceptedRequest,
    warnings,
  };
}

/**
 * 물납 법정분류 (상증법 §73⑤ 금융재산 / 상증령 §74① 충당재산) — 표시용 4분류
 * `buildSummaryCategory`(PDF표8 금융/부동산/주식/기타)와 별개. 물납은 §73⑤·§74①의
 * 법정 정의를 따르므로 아래 항목이 표시용 분류와 갈린다:
 *   - 보험금(§8)·특정금전신탁(§9 cash_trust) → §73⑤ 금융재산 (표시용 "기타" ≠)
 *   - 대부금채권(receivable) → §73⑤ 비열거 → 충당 불가 (표시용 "금융" ≠)
 *   - 전환사채(convertible_bond) → §74①2호 내국법인 발행 증권 → 충당 유가증권 (표시용 "금융" ≠)
 *   - 부동산·기타 신탁수익권(§9) → §74①1호 "부동산" 아님(수익권) → 충당 불가 (현행 유지)
 * 국채·공채·처분제한 상장 유가증권 세분류 및 금융회사 채무 차감은 estate 마커 부재로 미도출(후속).
 */
type PikLegalCategory =
  | "realEstate" // §74①1호 국내 소재 부동산
  | "financial" // §73⑤ 금융재산 (금전·예금·특정금전신탁·보험금·어음 등)
  | "eligibleSecurities" // §74①2호 충당가능 유가증권 (내국법인 발행 채권/증권)
  | "tradableListed" // 거래소 상장(처분제한 없음) — §73①2호 한도 차감
  | "unlistedStock" // §74①2호나목 비상장주식 (최후순위·§73④ 캡)
  | "other"; // 충당 불가 (대부금채권·비금전 신탁수익권·퇴직금·무체재산·가상자산 등)

function classifyForPaymentInKind(item: EstateItem): PikLegalCategory {
  // 1) 간주상속재산 우선 (§8 보험금·§9 신탁·§10 퇴직금)
  if (item.deemedCategory === "insurance") return "financial"; // §73⑤ 보험금
  if (item.deemedCategory === "trust")
    // §73⑤ "특정금전신탁"만 금융재산 — 부동산·증권·기타 신탁수익권은 §74① 충당재산 아님
    return item.trustType === "cash_trust" ? "financial" : "other";
  if (item.deemedCategory === "retirement") return "other"; // 퇴직금 청구권 — §73⑤·§74① 비해당

  // 2) 주식 — buildSummaryCategory의 stock 판정 재사용(상장·비상장 세분)
  const summary = buildSummaryCategory(item);
  if (summary === "stock") {
    const isUnlisted =
      item.category === "unlisted_stock" ||
      item.unlistedStockData != null ||
      item.unlistedStockValuationV2 != null;
    return isUnlisted ? "unlistedStock" : "tradableListed";
  }
  if (summary === "realEstate") return "realEstate"; // 부동산·지상권

  // 3) 나머지 — §73⑤·§74① 법정 정의로 세분 (표시용 financial/other 재판정)
  switch (item.category) {
    case "cash":
    case "deposit":
    case "financial":
      return "financial"; // §73⑤ 금전·예금 등
    case "convertible_bond":
      return "eligibleSecurities"; // §74①2호 내국법인 발행 증권 (비상장 가정 — 상장 처분제한 여부는 후속)
    default:
      // receivable(대부금채권)·intangible_ip·crypto_asset·trust_benefit·periodic 등 — 충당 불가
      return "other";
  }
}

/**
 * estate 자동도출 — estateItems + result 평가액에서 PaymentInKindAssets 구성.
 * 분류는 `classifyForPaymentInKind`(§73⑤·§74① 법정분류). buildSummaryCategory(PDF표8) 아님.
 * eligibleSecuritiesValue(국채·공채·처분제한 상장)·금융회사 채무 차감은 estate 마커 부재로 미도출(후속).
 */
export function derivePaymentInKindAssets(
  estateItems: EstateItem[],
  result: Pick<InheritanceTaxResult, "valuationResults">,
  ineligibleManagementValue: number,
): PaymentInKindAssets {
  const valById = new Map(
    result.valuationResults.map((v) => [v.estateItemId, v.valuatedAmount]),
  );
  let realEstateValue = 0;
  let heirResidenceValue = 0;
  let unlistedStockValue = 0;
  let tradableListedValue = 0;
  let eligibleSecuritiesValue = 0;
  let netFinancialValue = 0;
  for (const item of estateItems) {
    const v = valById.get(item.id) ?? 0;
    switch (classifyForPaymentInKind(item)) {
      case "realEstate":
        realEstateValue += v;
        // §74②6호 상속인 거주주택 — realEstateValue에 유지(요건1 분자, §73①1호)하되
        // 별도 추적(충당순서 3호서 제외·6호 분리 + §73④ 캡 차감). subset 태그 (KoreanLaw §73·§74 검증 2026-06-19)
        if (item.isHeirResidenceProperty) heirResidenceValue += v;
        break;
      case "financial":
        // §73⑤ 금융재산(금전·예금·보험금·특정금전신탁 등). 금융회사 채무 차감은 후속(§22 순금융과 범위 차이)
        netFinancialValue += v;
        break;
      case "eligibleSecurities":
        eligibleSecuritiesValue += v; // §74①2호 — 요건1 분자·충당순위 4호
        break;
      case "tradableListed":
        tradableListedValue += v;
        break;
      case "unlistedStock":
        unlistedStockValue += v;
        break;
      case "other":
        break; // 충당 불가 — 분자·금융재산 어디에도 미산입(분모 estateBase에는 grossEstateValue로 반영)
    }
  }
  return {
    realEstateValue,
    eligibleSecuritiesValue,
    unlistedStockValue,
    tradableListedValue,
    netFinancialValue,
    heirResidenceValue, // 갭4: isHeirResidenceProperty flag로 자동도출 (subset)
    ineligibleManagementValue,
  };
}
