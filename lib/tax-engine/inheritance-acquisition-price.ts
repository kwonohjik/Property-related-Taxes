/**
 * 상속·증여 자산 취득가액 산정 Pure Engine
 *
 * 양도소득세 계산 시 상속·증여로 취득한 자산의 취득가액은 상속개시일(또는 증여일)
 * 현재 상증법상 평가가액으로 한다. 단, 의제취득일(1985.1.1.) 전 상속·증여 자산은
 * max(① 상증법 평가액, ② §164④~⑦ 의제취득일 기준시가, ③ 환산취득가)로 한다.
 *
 * Layer 2 원칙: DB 직접 호출 없음. 순수 함수. 정수 연산(원 단위).
 *
 * 근거 조문:
 *   - 소득세법 §97 — 양도소득 필요경비
 *   - 소득세법 시행령 §163 ⑨ — 상속·증여 자산 취득가액 의제 (의제취득일 이후 max①②)
 *   - 소득세법 시행령 §176조의2 ④·③ — 의제취득일 전 상속·증여: max(①,②,③)
 *     · 생산자물가상승률 방식(④2호)은 무상취득에 부적용(호2 base 부존재)
 *     · 국심2003부602·2003서3266, 조심2023서0676
 *   - 상증법 §60·§61 — 평가 원칙·부동산 보충적평가
 */

import { calculateEstimatedAcquisitionPrice } from "./tax-utils";
import { TRANSFER } from "./legal-codes";
import { DEEMED_ACQUISITION_DATE } from "./types/inheritance-acquisition.types";
import type {
  InheritanceAcquisitionInput,
  InheritanceAcquisitionResult,
  InheritanceAssetKind,
  InheritanceAcquisitionMethod,
  PreDeemedBreakdown,
  PreDeemedSelectedMethod,
} from "./types/inheritance-acquisition.types";

export type {
  InheritanceAcquisitionInput,
  InheritanceAcquisitionResult,
  InheritanceAssetKind,
  InheritanceAcquisitionMethod,
  PreDeemedBreakdown,
} from "./types/inheritance-acquisition.types";

// ─── 진입점 ────────────────────────────────────────────────────────────────

export function calculateInheritanceAcquisitionPrice(
  input: InheritanceAcquisitionInput,
): InheritanceAcquisitionResult {
  validateInput(input);

  const isPreDeemed =
    input.inheritanceDate.getTime() < DEEMED_ACQUISITION_DATE.getTime();

  if (isPreDeemed) return calcPreDeemed(input);
  return calcPostDeemed(input);
}

// ─── 입력 검증 ─────────────────────────────────────────────────────────────

function validateInput(input: InheritanceAcquisitionInput): void {
  if (!input.inheritanceDate) {
    throw new Error("inheritanceDate가 필수입니다");
  }
  if (input.publishedValueAtInheritance !== undefined && input.publishedValueAtInheritance < 0) {
    throw new Error("publishedValueAtInheritance는 0 이상이어야 합니다");
  }
  if (input.reportedValue !== undefined && input.reportedValue < 0) {
    throw new Error("reportedValue는 0 이상이어야 합니다");
  }
}

// ─── Case A: 의제취득일(1985.1.1.) 전 상속·증여 ───────────────────────────
//
// 취득가액 = max(① 상증법 §60~66 평가액, ③ 환산취득가) [Phase 1]
//   — 소령 §163⑨·§176조의2④, 국심2003부602·2003서3266·조심2023서0676.
// ※ 생산자물가상승률 방식(§176조의2④2호)은 상속·증여 자산에 부적용
//   (호2 base=취득당시 실지거래가액·매매·감정가액이 무상취득엔 부존재).
// ① = 실지거래가액 의제(§163⑨) → 실제 필요경비 공제. ③ = 추계 → 개산공제(§163⑥, 하류 applyResultToInput).
// ② 소령 §164④~⑦ 취득당시 기준시가 — **§163⑨1호·2호가 근거**(§176조의2④ 아님).
//    §163⑨은 「의제취득일」로 나뉘지 않고 조건이 **「기준시가 고시 전 상속·증여」**뿐이라,
//    1985년 이전 상속은 개별공시지가(1990)·건물 기준시가(2005) 둘 다 고시 전이라 당연히 해당한다.
//    시점은 §163⑨ 본문대로 **상속개시일 또는 증여일 현재**(의제취득일 아님) — post-deemed와 같은 값.
//    ⚠️ 같은 값이 ③의 **환산 분자**(standardPriceAtDeemedDate)로도 쓰이므로 **필드를 분리**한다(역할이 둘).
//    계획서: docs/02-design/features/inheritance-pre-deemed-164-max.plan.md

function calcPreDeemed(input: InheritanceAcquisitionInput): InheritanceAcquisitionResult {
  const warnings: string[] = [];

  // ③ 환산취득가: 양도가 × (의제취득일 기준시가 ÷ 양도시 기준시가) — §176조의2④·③3호
  let converted = 0;
  if (
    input.transferPrice &&
    input.standardPriceAtDeemedDate &&
    input.standardPriceAtTransfer &&
    input.standardPriceAtTransfer > 0
  ) {
    converted = calculateEstimatedAcquisitionPrice(
      input.transferPrice,
      input.standardPriceAtDeemedDate,
      input.standardPriceAtTransfer,
    );
  }

  // ① 상증법 §60~66 평가액 (상속세 신고가액)
  const reported =
    input.reportedValue !== undefined && input.reportedValue > 0
      ? Math.floor(input.reportedValue)
      : 0;

  // ② §164④~⑦ 취득당시 기준시가 (§163⑨1호·2호) — opt-in(payload 있을 때만 주입)
  const sec164 = input.houseValuationStdPrice ?? input.commercialValuationStdPrice ?? 0;

  // max(①,②,③) — 동점 시 ① > ② > ③ 우선(실지거래가액 의제를 추계보다 앞세운다)
  const acquisitionPrice = Math.max(reported, sec164, converted);

  const selectedMethod: PreDeemedSelectedMethod =
    reported > 0 && reported >= sec164 && reported >= converted
      ? "reported"
      : sec164 > 0 && sec164 >= converted
        ? "sec164"
        : "converted";

  if (acquisitionPrice === 0) {
    warnings.push(
      "취득가액 산정 정보(상증법 평가액·환산취득가)가 모두 부족합니다. 취득가 = 0으로 처리됩니다.",
    );
  }

  const breakdown: PreDeemedBreakdown = {
    reportedAmount: reported > 0 ? reported : null,
    convertedAmount: converted,
    sec164Amount: sec164 > 0 ? sec164 : null,
    selectedMethod,
  };

  return {
    acquisitionPrice,
    method: "pre_deemed_max",
    legalBasis: `${TRANSFER.INHERITED_BEFORE_DEEMED} · ${TRANSFER.PRE1990_STD_PRICE_CONVERSION}`,
    formula: buildPreDeemedFormula(breakdown, acquisitionPrice),
    preDeemedBreakdown: breakdown,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

function buildPreDeemedFormula(b: PreDeemedBreakdown, acquisitionPrice: number): string {
  const lines: string[] = [];
  if (b.reportedAmount !== null) {
    lines.push(`① 상증법 평가액(상속세 신고가액): ${b.reportedAmount.toLocaleString()}`);
  }
  if (b.sec164Amount !== null) {
    lines.push(`② §164 취득당시 기준시가: ${b.sec164Amount.toLocaleString()}`);
  }
  lines.push(`③ 환산취득가액: ${b.convertedAmount.toLocaleString()}`);
  const label =
    b.selectedMethod === "reported"
      ? "① 상증법 평가액"
      : b.selectedMethod === "sec164"
        ? "② §164 취득당시 기준시가"
        : "③ 환산취득가액";
  lines.push(`→ 적용 (큰 금액, ${label}): ${acquisitionPrice.toLocaleString()}`);
  return lines.join("\n");
}

// ─── Case B: 의제취득일(1985.1.1.) 이후 상속 ─────────────────────────────

function calcPostDeemed(input: InheritanceAcquisitionInput): InheritanceAcquisitionResult {
  // 기준시가 미공시 상속 건물(§163⑨2호): 취득가액 = max(① 상증법 평가액[reportedValue], ② §164 취득당시 기준시가).
  //   주택(개별주택가격 미공시, <2005.4.30) = §164⑦ houseValuationStdPrice
  //   상가(기준시가 미공시, <2005.1.1) = §164⑥ commercialValuationStdPrice
  // 자산은 주택 or 상가(둘 중 하나만 주입). ③(환산취득가/양도가 스케일) 적용 불가.
  // ①·② 실지거래가액 의제 → 개산공제 없음(추가 처리 없이 acquisitionPrice만 반환).
  const sec164Std = input.houseValuationStdPrice ?? input.commercialValuationStdPrice;
  if (sec164Std !== undefined && sec164Std > 0) {
    const isCommercial164 =
      input.houseValuationStdPrice === undefined && input.commercialValuationStdPrice !== undefined;
    const reported =
      input.reportedValue !== undefined && input.reportedValue >= 0
        ? Math.floor(input.reportedValue)
        : 0;
    const std = Math.floor(sec164Std);
    const sec164Wins = std >= reported;
    const acquisitionPrice = sec164Wins ? std : reported;
    const clause = isCommercial164 ? "§164⑥" : "§164⑦";
    const disclosureLabel = isCommercial164 ? "상가 기준시가 미공시" : "개별주택가격 미공시";
    return {
      acquisitionPrice,
      method: "supplementary",
      legalBasis: isCommercial164
        ? TRANSFER.INHERITED_AFTER_DEEMED_COMMERCIAL_MAX
        : TRANSFER.INHERITED_AFTER_DEEMED_HOUSE_MAX,
      formula:
        `max(상증법 평가액 ${reported.toLocaleString()}, ` +
        `${clause} 취득당시 기준시가 ${std.toLocaleString()}) = ${acquisitionPrice.toLocaleString()} ` +
        `(${disclosureLabel} · ${sec164Wins ? `${clause} 채택` : "상증법 평가액 채택"})`,
    };
  }

  // 상속세 신고가액이 입력된 경우 그대로 취득가액으로 사용
  if (input.reportedValue !== undefined && input.reportedValue >= 0 && input.reportedMethod) {
    return {
      acquisitionPrice: Math.floor(input.reportedValue),
      method: input.reportedMethod,
      legalBasis: resolvePostDeemedLegalBasis(input.reportedMethod),
      formula: resolvePostDeemedFormula(input.reportedMethod, input.reportedValue),
    };
  }

  // 신고가액 미입력 — 기존 우선순위(시가→감정→보충) fallback (하위호환)
  return legacyFallback(input);
}

function resolvePostDeemedLegalBasis(method: InheritanceAcquisitionMethod): string {
  switch (method) {
    case "market_value":        return `${TRANSFER.INHERITED_AFTER_DEEMED} · 상증법 §60 ①`;
    case "appraisal":           return `${TRANSFER.INHERITED_AFTER_DEEMED} · 상증법 §60 ⑤`;
    case "auction_public_sale": return `${TRANSFER.INHERITED_AFTER_DEEMED} · 상증법 §60 ② (수용·경매·공매)`;
    case "similar_sale":        return `${TRANSFER.INHERITED_AFTER_DEEMED} · 상증법 시행령 §49 (유사매매사례)`;
    case "supplementary":       return `${TRANSFER.INHERITED_AFTER_DEEMED} · ${TRANSFER.INHERITANCE_VALUATION_PRINCIPLE}`;
    default:                    return TRANSFER.INHERITED_AFTER_DEEMED;
  }
}

function resolvePostDeemedFormula(method: InheritanceAcquisitionMethod, value: number): string {
  const v = value.toLocaleString();
  switch (method) {
    case "market_value":        return `매매사례가액 ${v}원 (상속세 신고가액) 적용`;
    case "appraisal":           return `감정평가액 ${v}원 (상속세 신고가액) 적용`;
    case "auction_public_sale": return `수용·경매·공매가액 ${v}원 (상속세 신고가액) 적용`;
    case "similar_sale":        return `유사매매사례가액 ${v}원 (상속세 신고가액) 적용`;
    case "supplementary":       return `보충적평가액 ${v}원 (상속세 신고가액) 적용`;
    default:                    return `상속세 신고가액 ${v}원 적용`;
  }
}

// ─── 기존 로직 fallback (하위호환) ────────────────────────────────────────

function legacyFallback(
  input: InheritanceAcquisitionInput,
): InheritanceAcquisitionResult {
  const { assetKind, landAreaM2, publishedValueAtInheritance, marketValue, appraisalAverage } = input;

  if (assetKind === "land" && (!landAreaM2 || landAreaM2 <= 0)) {
    throw new Error("토지는 landAreaM2(㎡)가 필수입니다");
  }

  // 우선순위 1: 시가
  if (marketValue !== undefined && marketValue > 0) {
    return {
      acquisitionPrice: Math.floor(marketValue),
      method: "market_value",
      legalBasis: "상증법 §60 ①",
      formula: `시가 ${marketValue.toLocaleString()} 적용`,
    };
  }

  // 우선순위 2: 감정가 평균
  if (appraisalAverage !== undefined && appraisalAverage > 0) {
    return {
      acquisitionPrice: Math.floor(appraisalAverage),
      method: "appraisal",
      legalBasis: "상증법 §60 ⑤",
      formula: `감정평가액 평균 ${appraisalAverage.toLocaleString()} 적용`,
    };
  }

  // 우선순위 3: 보충적평가액
  const supplementary = computeSupplementary(assetKind, publishedValueAtInheritance ?? 0, landAreaM2);
  return {
    acquisitionPrice: supplementary.amount,
    method: "supplementary",
    legalBasis: `${TRANSFER.ACQ_INHERITED_SUPPLEMENTARY} · 상증법 §61`,
    formula: supplementary.formula,
  };
}

// ─── 보충적평가 계산 ──────────────────────────────────────────────────────

function computeSupplementary(
  assetKind: InheritanceAssetKind,
  publishedValue: number,
  landAreaM2: number | undefined,
): { amount: number; formula: string } {
  if (assetKind === "land") {
    const area = landAreaM2 ?? 0;
    const amount = Math.floor(publishedValue * area);
    return {
      amount,
      formula: `개별공시지가 ${publishedValue.toLocaleString()}/㎡ × ${area}㎡ = ${amount.toLocaleString()}`,
    };
  }

  const amount = Math.floor(publishedValue);
  const label = assetKind === "house_individual" ? "개별주택가격" : "공동주택가격";
  return {
    amount,
    formula: `${label} ${amount.toLocaleString()} 적용`,
  };
}
