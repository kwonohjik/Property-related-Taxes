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
  const {
    realEstateValue,
    eligibleSecuritiesValue,
    governmentBondValue,
    restrictedListedValue,
    unlistedStockValue,
    ineligibleManagementValue,
  } = input.assets;
  // §74①1호·2호가목 — 부동산 + 충당가능 유가증권(국채·공채·내국법인 증권·처분제한 상장).
  //   거래소 상장(처분제한 X, tradableListedValue)은 §74①2호가목 본문 제외.
  //   국채·공채는 §74②1호로 순위만 분리된 것이고 §74①2호 본문 열거이므로 분자에 합산한다.
  //   처분제한 상장(가목 **단서**)은 본문 제외에서 되살아난 충당재산이므로 분자에 함께 넣는다.
  const baseEligible =
    realEstateValue + eligibleSecuritiesValue + governmentBondValue + restrictedListedValue;
  // §74①2호나목 단서 — 비상장주식은 상속에서 위 재산으로 납부세액 충당이 부족한 경우에만
  //   충당가능 유가증권. 부동산·상장으로 finalTax를 충당하면(≥) 비상장 미산입 (H-41).
  const unlistedEligible =
    baseEligible < input.finalTax ? unlistedStockValue : 0;
  return Math.max(
    0,
    baseEligible + unlistedEligible - ineligibleManagementValue,
  );
}

/** 물납 적격 판정 (§73① 3요건) — 인쇄 게이트용 경량 술어 */
export function isPaymentInKindEligible(input: PaymentInKindInput): boolean {
  const estateBase = computeEstateBase(input);
  const eligibleRealSec = computeEligibleRealSec(input);
  return (
    eligibleRealSec > Math.floor(estateBase / 2) &&
    input.finalTax > PAYMENT_IN_KIND_MIN_TAX &&
    input.finalTax > input.assets.grossFinancialValue
  );
}

export function calcPaymentInKindAssessment(
  input: PaymentInKindInput,
): PaymentInKindResult {
  const { finalTax, taxableEstateValue, assets, requestedAmount } = input;
  const {
    realEstateValue,
    eligibleSecuritiesValue,
    governmentBondValue,
    unlistedStockValue,
    tradableListedValue,
    restrictedListedValue, // §74①2호가목 단서: isNewlyListedDisposalRestricted flag로 자동도출
    grossFinancialValue,
    financialInstitutionDebt,
    heirResidenceValue,
    ineligibleManagementValue,
  } = assets;

  const estateBase = computeEstateBase(input);
  const eligibleRealSec = computeEligibleRealSec(input);

  // 요건 (§73①1~3호) — 1호 분모 estateBase, "1/2 초과".
  //   3호 금융재산은 §73⑤ gross(금융회사 채무 차감 前, 사전증여 제외) 기준.
  const halfThreshold = Math.floor(estateBase / 2);
  const meetsOverHalf = eligibleRealSec > halfThreshold;
  const meetsTaxOver20M = finalTax > PAYMENT_IN_KIND_MIN_TAX;
  const meetsTaxOverFinancial = finalTax > grossFinancialValue;
  const eligible = meetsOverHalf && meetsTaxOver20M && meetsTaxOverFinancial;

  // 허용한도 (상증령 §73① — 적은 금액). 안분은 BigInt(safeMul) 정밀
  const limit1 =
    estateBase > 0
      ? safeMultiplyThenDivide(finalTax, eligibleRealSec, estateBase)
      : 0;
  // 한도2(§73①2호): finalTax − (금융재산 − §10①1호 금융회사 채무) − 처분제한 없는 상장.
  //   금융재산은 순액(net) 사용 — 요건3의 gross와 구분 (금융회사 채무 차감으로 한도 확대).
  const netFinancialForLimit = Math.max(
    0,
    grossFinancialValue - financialInstitutionDebt,
  );
  const limit2 = Math.max(
    0,
    finalTax - netFinancialForLimit - tradableListedValue,
  );
  const allowedLimit = Math.max(0, Math.min(limit1, limit2));

  // 비상장 캡 (§73④, 기준=상속세 과세가액 taxableEstateValue)
  const unlistedStockCap = Math.max(
    0,
    finalTax - (taxableEstateValue - unlistedStockValue - heirResidenceValue),
  );

  // 충당순서 (상증령 §74②)
  const availableByOrder = [
    governmentBondValue, // 1 국채·공채 (§74②1호 — isGovernmentBond flag 자동도출)
    // 2 §74②2호 — 「가목 **단서**에 해당하는 유가증권(제1호 제외)으로서 거래소에 상장된 것」.
    //   🔴 2026-08-10 정정: 종전에는 여기에 eligibleSecuritiesValue(= §74②**4호**)가 들어가고
    //   4순위가 `0`으로 하드코딩돼 **법령 매핑이 한 칸씩 밀려** 있었다.
    restrictedListedValue,
    Math.max(0, realEstateValue - heirResidenceValue), // 3 국내 부동산 (§74②3호 — 제6호 거주주택 제외)
    eligibleSecuritiesValue, // 4 §74②4호 — ①2호 유가증권 중 1·2·5호를 제외한 나머지
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
      financialValue: grossFinancialValue,
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
 *   - 최초상장+처분제한 유가증권(§74①2호가목 **단서**) → `restrictedListed` (충당 2순위 — 2026-08-10)
 * 마커 3종(`isGovernmentBond`·`isHeirResidenceProperty`·`isNewlyListedDisposalRestricted`)과
 * 금융회사 채무 차감은 **모두 도출된다**. (종전 「estate 마커 부재로 미도출」 주석은 stale이었다.)
 */
type PikLegalCategory =
  | "realEstate" // §74①1호 국내 소재 부동산
  | "financial" // §73⑤ 금융재산 (금전·예금·특정금전신탁·보험금·어음 등)
  | "eligibleSecurities" // §74①2호 충당가능 유가증권 (내국법인 발행 채권/증권)
  | "tradableListed" // 거래소 상장(처분제한 없음) — §73①2호 한도 차감
  | "restrictedListed" // §74①2호가목 **단서** — 최초상장 + 자본시장법 처분제한 (충당 2순위)
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
    if (isUnlisted) return "unlistedStock";
    // 상장 — 가목 **본문**은 충당에서 빼지만 **단서**(최초상장 + 처분제한)는 되살린다.
    return item.isNewlyListedDisposalRestricted ? "restrictedListed" : "tradableListed";
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
 * 금융회사 채무(§10①1호)는 §14 담보채무 자동도출분(collateralDebtDetail.financialDebtAmount,
 * §22 순금융재산공제와 동일 근거)에서 합산.
 */
export function derivePaymentInKindAssets(
  estateItems: EstateItem[],
  result: Pick<InheritanceTaxResult, "valuationResults" | "collateralDebtDetail">,
  ineligibleManagementValue: number,
): PaymentInKindAssets {
  const valById = new Map(
    result.valuationResults.map((v) => [v.estateItemId, v.valuatedAmount]),
  );
  let realEstateValue = 0;
  let heirResidenceValue = 0;
  let unlistedStockValue = 0;
  let tradableListedValue = 0;
  let restrictedListedValue = 0;
  let eligibleSecuritiesValue = 0;
  let governmentBondValue = 0;
  let grossFinancialValue = 0;
  for (const item of estateItems) {
    const v = valById.get(item.id) ?? 0;
    // §74①2호 본문 국채·공채 — 카테고리(§22 기준 "financial")와 무관하게 flag가 우선한다.
    // §73⑤ 금융재산 열거(예금·적금·…·어음)에 채권이 없으므로 grossFinancialValue에서 **항상** 제외.
    // §22 금융재산공제 경로는 이 분기를 타지 않으므로 무영향.
    //
    // 충당 분류는 **상장 여부**가 가른다 — §74①2호**가목** 본문이 "거래소에 상장된 것"을 제2호
    // 전체(국채·공채 포함)에서 제외한다(법제처 XML `<목내용>` 실측 MST 283637):
    //   "가. 거래소에 상장된 것. 다만, 최초로 거래소에 상장되어 물납허가통지서 발송일 전일 현재
    //    「자본시장과 금융투자업에 관한 법률」에 따라 처분이 제한된 경우에는 그러하지 아니하다."
    // §74②2호가 "가목 단서 유가증권(**제1호의 재산을 제외한다**)으로서 거래소에 상장된 것"이라며
    // 1호를 빼는 것이 방증 — §74②1호의 "국채 및 공채"는 가목 관문을 통과한 것을 가리킨다.
    if (item.isGovernmentBond) {
      if (item.isGovernmentBondListed) {
        // 상장 국채 — 충당 대상 아님(가목 본문) + §73①2호 한도2 차감 대상
        // ("거래소에 상장된 유가증권(법령에 따라 처분이 제한된 것은 제외한다)").
        // 차감 축이 가목 제외 축과 **동일 문구**라 기존 tradableListedValue가 그대로 정본이다.
        tradableListedValue += v;
      } else {
        governmentBondValue += v; // §74②1호 충당 1순위
      }
      continue;
    }
    switch (classifyForPaymentInKind(item)) {
      case "realEstate":
        realEstateValue += v;
        // §74②6호 상속인 거주주택 — realEstateValue에 유지(요건1 분자, §73①1호)하되
        // 별도 추적(충당순서 3호서 제외·6호 분리 + §73④ 캡 차감). subset 태그 (KoreanLaw §73·§74 검증 2026-06-19)
        if (item.isHeirResidenceProperty) heirResidenceValue += v;
        break;
      case "financial":
        // §73⑤ 금융재산(금전·예금·보험금·특정금전신탁 등) gross — 금융회사 채무는 아래 별도 합산
        grossFinancialValue += v;
        break;
      case "eligibleSecurities":
        eligibleSecuritiesValue += v; // §74①2호 — 요건1 분자·충당순위 4호
        break;
      case "tradableListed":
        tradableListedValue += v;
        break;
      case "restrictedListed":
        // §74①2호가목 단서 — 충당 2순위·요건1 분자 산입·한도2 미차감
        restrictedListedValue += v;
        break;
      case "unlistedStock":
        unlistedStockValue += v;
        break;
      case "other":
        break; // 충당 불가 — 분자·금융재산 어디에도 미산입(분모 estateBase에는 grossEstateValue로 반영)
    }
  }
  // §10①1호 입증 금융회사 채무 — §14 담보채무 자동도출분(§22 순금융과 동일 근거) 합산.
  const financialInstitutionDebt = (result.collateralDebtDetail ?? []).reduce(
    (s, d) => s + (d.financialDebtAmount ?? 0),
    0,
  );
  return {
    realEstateValue,
    eligibleSecuritiesValue,
    governmentBondValue, // §74②1호: isGovernmentBond flag로 자동도출 (§73⑤ 금융재산 제외)
    unlistedStockValue,
    tradableListedValue,
    restrictedListedValue, // §74①2호가목 단서: isNewlyListedDisposalRestricted flag로 자동도출
    grossFinancialValue,
    financialInstitutionDebt,
    heirResidenceValue, // 갭4: isHeirResidenceProperty flag로 자동도출 (subset)
    ineligibleManagementValue,
  };
}
