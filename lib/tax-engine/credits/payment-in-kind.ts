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
    0, // 1 국채·공채 (estate 자동도출 분류 없음 — 보정 입력)
    eligibleSecuritiesValue, // 2 상장유가증권(처분제한)
    realEstateValue, // 3 국내 부동산
    0, // 4 그 밖의 유가증권
    unlistedStockValue, // 5 비상장주식
    heirResidenceValue, // 6 상속인 거주 주택·부수토지
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
 * estate 자동도출 — estateItems + result 평가액에서 PaymentInKindAssets 구성.
 * buildSummaryCategory는 stock 통합이므로 listed/unlisted는 category·평가데이터로 세분.
 * eligibleSecuritiesValue(국채·공채·처분제한 상장)·heirResidenceValue는 estate 분류 부재로 0(보정 후속).
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
  let unlistedStockValue = 0;
  let tradableListedValue = 0;
  let netFinancialValue = 0;
  for (const item of estateItems) {
    const v = valById.get(item.id) ?? 0;
    const cat = buildSummaryCategory(item);
    if (cat === "realEstate") {
      realEstateValue += v;
    } else if (cat === "stock") {
      const isUnlisted =
        item.category === "unlisted_stock" ||
        item.unlistedStockData != null ||
        item.unlistedStockValuationV2 != null;
      if (isUnlisted) unlistedStockValue += v;
      else tradableListedValue += v;
    } else if (cat === "financial") {
      // §73⑤ 금융재산(금전·예금 등). 금융회사 채무 차감은 보정 후속(§22 순금융과 범위 차이)
      netFinancialValue += v;
    }
  }
  return {
    realEstateValue,
    eligibleSecuritiesValue: 0, // 국채·공채·처분제한 상장 — estate 분류 없음(보정 후속, 확인②)
    unlistedStockValue,
    tradableListedValue,
    netFinancialValue,
    heirResidenceValue: 0, // 상속인 거주 주택 플래그 없음(보정 후속, 확인⑦)
    ineligibleManagementValue,
  };
}
