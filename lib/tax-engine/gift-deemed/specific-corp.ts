/** (Phase 3) 특정법인과의 거래를 통한 이익의 증여 의제 (§45의5 · 시행령 §34의5) */
import { GIFT } from "../legal-codes";
import { applyRate, safeMultiplyThenDivide, truncateToThousand } from "../tax-utils";
import { computeIndirectRatioBig } from "./related-corp-helpers";
import { calcInheritanceGiftTax } from "../inheritance-gift-common";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type {
  DeemedGiftResult,
  RcIntermediaryCorpItem,
  ScCounterparty,
  ScTransactionType,
  SpecificCorpInput,
  SpecificCorpDonee,
  SpecificCorpEligibility,
  SpecificCorpLimitCalc,
} from "./types";

const ABSOLUTE_THRESHOLD = 100_000_000; // §34의5⑤ 증여의제이익 1억원 이상
const FILING_CREDIT_NUMER = 3; // §69 신고세액공제 3%
const FILING_CREDIT_DENOM = 100;
const CONTROLLING_RATIO_NUMER = 30; // §45의5① 100분의 30
const CONTROLLING_RATIO_DENOM = 100;
const SIGNIFICANT_RATE = 0.3; // 영 §34의5⑦ 시가의 100분의 30
const SIGNIFICANT_ABSOLUTE = 300_000_000; // 영 §34의5⑦ 3억원

/**
 * 법 §45의5① 각 호 거래유형별 「특정법인의 이익」 + 거래상대방·현저성 요건.
 *
 * ── 거래상대방 (법 §45의5①) ──────────────────────────────────────────
 * 「특정법인이 **지배주주 및 그 특수관계인**과 다음 각 호에 따른 거래를 하는 경우」.
 * 종전에는 이 축이 어느 층에도 없어 증여자가 완전한 제3자여도 그대로 과세됐다.
 * ⚠️ 3의2호만 집합이 좁다 — 영 §34의5②은 「특정법인과 **지배주주의 특수관계인** 사이에
 * 이루어지거나 지배주주의 특수관계인 사이에 이루어지는」이라 지배주주 «본인»이 빠진다.
 *
 * ── 이익 (영 §34의5④1호) ─────────────────────────────────────────────
 * - 가목(1호·4호): 증여재산가액 또는 채무 면제·인수·변제로 법인이 얻는 이익 → 입력값 그대로.
 * - 나목(3의2호): 「제2항 각 호의 거래 유형에 따라 법 제38조, 제39조, 제39조의2, 제39조의3,
 *   제40조, 제41조의2, 제42조의2 … 를 **준용**하여 계산한 이익」. 이 화면은 그 준용계산을
 *   **하지 않는다** — 준용 대상 7개 조문이 같은 마법사의 다른 유형으로 전부 노출돼 있으므로
 *   거기서 산출한 이익을 넣도록 고지한다(결과뷰·UI).
 * - 다목(2호·3호): 「가목 및 나목 외의 경우: **제7항에 따른** 시가와 대가와의 차액에 상당하는 금액」.
 *   ⑦은 「차액이 시가의 100분의 30 이상이거나 그 차액이 3억원 이상인 경우의 **해당 가액**」을
 *   「현저히 낮은/높은 대가」로 정의한다. ⇒ 미달이면 그 대가는 2·3호의 대가가 아니고,
 *   ④1호다목이 참조할 차액도 없다. 두 독법(요건 미충족 / 이익 0) 모두 결과는 0원으로 같다.
 *
 * ── 4호 단서 (영 §34의5⑥) ────────────────────────────────────────────
 * 「다만, 해당 법인이 해산(합병 또는 분할에 의한 해산은 제외한다) 중인 경우로서 주주등에게
 * 분배할 잔여재산이 없는 경우는 제외한다.」
 */
export type ScTransactionGate = {
  /** 산정된 거래이익(영 §34의5④1호). 요건 미충족이면 0 */
  benefit: number;
  /** 미충족 사유 — undefined면 요건 충족 */
  exclusionReason?: string;
  /** 거래상대방 판정 — "unknown"은 입력 미전달(⑧이 제품 경로에서 강제한다) */
  counterpartyMet: "yes" | "no" | "unknown";
  /** 2·3호 현저성 echo (영 §34의5⑦) */
  significance?: { diff: number; rateThreshold: number; absoluteThreshold: number; met: boolean };
  transactionType: ScTransactionType;
};

export function evaluateScTransaction(input: SpecificCorpInput): ScTransactionGate {
  const transactionType: ScTransactionType = input.transactionType ?? "gratuitous";
  const isCapital = transactionType === "capital_transaction";

  // ── 거래상대방 ──
  const allowed: ScCounterparty[] = isCapital
    ? ["ruling_related"] // 영 §34의5② — 지배주주 본인 제외
    : ["ruling_shareholder", "ruling_related"];
  const counterpartyMet: "yes" | "no" | "unknown" =
    input.counterparty === undefined ? "unknown" : allowed.includes(input.counterparty) ? "yes" : "no";
  if (counterpartyMet === "no") {
    return {
      benefit: 0,
      counterpartyMet,
      transactionType,
      exclusionReason: isCapital
        ? "자본거래의 상대방이 지배주주의 특수관계인이 아닙니다 (상증령 §34의5② — 지배주주 본인과의 자본거래는 제외)"
        : "거래상대방이 지배주주 및 그 특수관계인이 아닙니다 (§45의5①)",
    };
  }

  // ── 4호 단서 (영 §34의5⑥) ──
  if (transactionType === "debt_relief" && input.isDissolvingWithoutResidual) {
    return {
      benefit: 0,
      counterpartyMet,
      transactionType,
      exclusionReason: "해산 중인 법인으로서 주주등에게 분배할 잔여재산이 없습니다 (상증령 §34의5⑥ 단서)",
    };
  }

  // ── 2·3호 — 영 §34의5④1호다목 + ⑦ ──
  if (transactionType === "low_price" || transactionType === "high_price") {
    const marketValue = input.marketValue ?? 0;
    const consideration = input.consideration ?? 0;
    // 2호는 법인이 싸게 «사온» 것, 3호는 비싸게 «팔아온» 것 — 부호가 반대다
    const raw = transactionType === "low_price" ? marketValue - consideration : consideration - marketValue;
    const diff = Math.max(0, raw);
    const rateThreshold = applyRate(marketValue, SIGNIFICANT_RATE);
    const met = diff > 0 && (diff >= rateThreshold || diff >= SIGNIFICANT_ABSOLUTE);
    const significance = { diff, rateThreshold, absoluteThreshold: SIGNIFICANT_ABSOLUTE, met };
    if (!met) {
      return {
        benefit: 0,
        counterpartyMet,
        transactionType,
        significance,
        exclusionReason: `시가와 대가의 차액 ${diff.toLocaleString()}원이 시가의 100분의 30(${rateThreshold.toLocaleString()}원)과 3억원에 모두 미달합니다 — 「현저히 ${transactionType === "low_price" ? "낮은" : "높은"} 대가」가 아닙니다 (상증령 §34의5⑦)`,
      };
    }
    return { benefit: diff, counterpartyMet, transactionType, significance };
  }

  // 1호·4호(가목) · 3의2호(나목 — 준용계산은 이 화면 밖) → 입력값 그대로
  return { benefit: input.transactionBenefit, counterpartyMet, transactionType };
}

/**
 * §45의5① ⓐ 「특정법인」 해당성 — 「지배주주등의 주식보유비율이 100분의 30 이상인 법인」.
 *
 * ── 이름이 같은 두 비율을 분리한다 ──
 * - **ⓐ 해당성(법인 단위)**: 법 §45의5① 「지배주주등의 주식보유비율이 100분의 30 이상인 **법인**
 *   (이하 이 조 및 제68조에서 "특정법인"이라 한다)」. 「지배주주등」은 법 §45의4①이
 *   「지배주주와 그 친족(이하 이 조 및 **제45조의5**에서 "지배주주등"이라 한다)」으로 정의한 **집합**이다.
 *   ⇒ 그룹 **합계** 비율이고, 미달이면 §45의5 자체가 성립하지 않는다.
 * - **ⓑ 승수(개인 단위)**: 상증령 §34의5⑨ 「제4항제1호의 금액에 **해당** 지배주주등의 주식보유비율을
 *   곱한 금액을 해당 지배주주등이 **각각** 직접 증여받은 것으로 볼 때의 증여세」 + 동 ⑤ 「증여의제이익이
 *   1억원 이상인 경우로 **한정**」. ⇒ 인별이다.
 *   ⚠️ 두 축을 섞으면 그룹 35%인 특정법인에서 개인 20%를 보유한 수증자의 정당한 과세분이 0원이 된다.
 *   **ⓑ는 이 게이트가 건드리지 않는다.**
 *
 * ── 직접지분 합계는 「하한」이다 ──
 * 「주식보유비율」의 정의는 법 §45의3①이 외부화한다 — 「**직접 또는 간접으로** 보유하는 주식보유비율
 * (이하 이 조, 제45조의4 및 **제45조의5**에서 "주식보유비율"이라 한다)」.
 * 앱은 간접보유를 수집하지 않으므로 roster의 직접지분 합계로는 **충족만 확정**되고 미달은 확정되지 않는다.
 * ⇒ 간접분을 포함한 합계를 사용자가 신고하는 축(`controllingGroupRatio`)을 둔다.
 *
 * ── 미신고 시 두 모드가 갈리는 이유 ──
 * - `roster`: 발행주식 총수 + 주주 전원 명부를 받으므로 「신고된 것이 전부」로 볼 근거가 있다
 *   ⇒ 미신고 = 간접보유 0%로 보고 **판정한다**(사유 문구에 그 전제를 적는다).
 * - `single`: 그룹 명부가 없다. 입력된 비율은 수증자 1인분(ⓑ)이라 그룹의 하한으로 쓰기엔 너무 약하다
 *   ⇒ 미신고 = **판정하지 않고**(`"unknown"`) 결과뷰가 고지한다. 그룹 30%↑인 정상 계산을 죽이지 않기 위함.
 */
function meetsControllingRatio(numer: number, denom: number): boolean {
  // numer/denom ≥ 30/100 ↔ numer×100 ≥ 30×denom (정수 교차곱 — 부동소수 비교 금지)
  return denom > 0 && numer * CONTROLLING_RATIO_DENOM >= CONTROLLING_RATIO_NUMER * denom;
}

function toPct(numer: number, denom: number): number {
  // (numer×100)÷denom 순서 — (numer÷denom)×100은 29%를 28.999999999999996으로 만든다(실측)
  return denom > 0 ? (numer * 100) / denom : 0;
}

export function evaluateSpecificCorpEligibility(
  direct: { numer: number; denom: number },
  declared: { numer: number; denom: number } | undefined,
  mode: "single" | "roster",
): SpecificCorpEligibility {
  const directPct = toPct(direct.numer, direct.denom);
  const declaredPct = declared ? toPct(declared.numer, declared.denom) : undefined;
  const effectivePct = Math.max(directPct, declaredPct ?? 0); // 직접분은 증명된 하한 — 신고값이 더 낮아도 내려가지 않는다
  if (meetsControllingRatio(direct.numer, direct.denom)) {
    return { directPct, declaredPct, effectivePct, met: "yes" };
  }
  if (declared) {
    return {
      directPct,
      declaredPct,
      effectivePct,
      met: meetsControllingRatio(declared.numer, declared.denom) ? "yes" : "no",
    };
  }
  return { directPct, declaredPct, effectivePct, met: mode === "roster" ? "no" : "unknown" };
}

/**
 * 수증자 1인의 **주식보유비율 = 직접 + 간접** (법 §45의3①이 §45의5까지 확장한 정의어).
 * 간접분 산식은 상증령 §34의3②(각 단계 직접보유비율의 곱 · 경로 둘 이상이면 합) — §45의3과 공용 헬퍼.
 *
 * ⚠️ **§45의5는 「각각 계산한 금액을 합산」하지 않는다.** 그 방식은 법 §45의3**②**의 명문
 * (「직접적으로 출자하는 동시에 … 간접적으로 출자하는 경우에는 제1항의 계산식에 따라 각각
 * 계산한 금액을 합산하여 계산한다」)이고, §45의5에는 대응 조항이 없다(①②③이 전부).
 * ⇒ 합산 «비율»로 **한 번** 곱하고 floor도 1회다. 직접·간접을 따로 floor하면 최대 1원씩 더 깎인다.
 *
 * ⚠️ §45의3의 §⑱ 간접출자법인 요건(영 §34의3⑱)은 여기에 걸리지 않는다 — 그 필터는 법
 * §45의3②의 「대통령령으로 정하는 법인」에 대한 것이고, 영 §34의3⑧이 「이하 **이 조**에서
 * 같다」로 범위를 닫는다. 영 §34의5①은 §34의3 **제1항 각 호**만 준용한다. ⇒ mode "ruling".
 */
function combinedRatio(
  sh: { id: string; shares: number; totalShares: number },
  intermediaryCorps: RcIntermediaryCorpItem[],
): { numer: bigint; denom: bigint } {
  return addDirect(sh, computeIndirectRatioBig(sh.id, intermediaryCorps, "ruling"));
}

/** 직접보유분(shares/totalShares)과 이미 구한 간접분을 더한다. */
function addDirect(
  sh: { shares: number; totalShares: number },
  ind: { numer: bigint; denom: bigint },
): { numer: bigint; denom: bigint } {
  const dNumer = BigInt(sh.shares);
  const dDenom = BigInt(sh.totalShares);
  if (dDenom === 0n) return ind;
  return { numer: dNumer * ind.denom + ind.numer * dDenom, denom: dDenom * ind.denom };
}

/** 표시용 백분율 — 소수 넷째 자리까지 유지(1e6 배 후 1e4로 나눔). */
function fracToPct(f: { numer: bigint; denom: bigint }): number {
  return f.denom === 0n ? 0 : Number((f.numer * 1_000_000n) / f.denom) / 10_000;
}

/**
 * BigInt 분수를 `evaluateSpecificCorpEligibility`가 쓰는 number 분수로 좁힌다.
 * 분모가 2^53을 넘으면 그대로는 못 쓰므로 «원 분모(발행주식 총수)» 기준 분자로 환산한다
 * — 판정은 30%와의 대소 비교뿐이라 이 환산으로 충분하고, 표시 비율도 여기서 나온다.
 */
function fracToNumbers(numer: bigint, denom: bigint, baseDenom: number): { numer: number; denom: number } {
  if (denom === 0n || baseDenom <= 0) return { numer: 0, denom: 1 };
  return { numer: Number((numer * BigInt(baseDenom)) / denom), denom: baseDenom };
}

/** profit × (numer/denom) — 전 구간 BigInt, floor 1회. */
function applyFrac(profit: number, f: { numer: bigint; denom: bigint }): number {
  if (f.denom === 0n) return 0;
  return Number((BigInt(profit) * f.numer) / f.denom);
}

/**
 * 거래유형별 이익 산정 근거 라벨 (영 §34의5④1호 가·나·다목).
 * 종전 라벨은 「증여재산·채무면제·시가−대가」로 **가목과 다목만** 열거해 3의2호(나목)를
 * 「시가−대가 차액」으로 오유도했다 — 자본거래 이익은 §38 등 준용 계산액이라 전혀 다른 축이다.
 */
function txLabel(t: ScTransactionType): string {
  switch (t) {
    case "gratuitous":
      return "무상 제공받은 재산·용역 (영 §34의5④1호가목)";
    case "low_price":
      return "시가 − 대가 (영 §34의5④1호다목·⑦)";
    case "high_price":
      return "대가 − 시가 (영 §34의5④1호다목·⑦)";
    case "capital_transaction":
      return "자본거래 준용 계산액 (영 §34의5④1호나목 — §38·§39·§39의2·§39의3·§40·§41의2·§42의2)";
    case "debt_relief":
      return "채무 면제·인수·변제 이익 (영 §34의5④1호가목·⑥)";
  }
}

/** ⓐ 미충족 사유 — 간접보유를 0%로 본 전제를 함께 적어 사용자가 되돌릴 수 있게 한다. */
function notSpecificCorpReason(e: SpecificCorpEligibility): string {
  const base = `지배주주등 주식보유비율 ${e.effectivePct.toFixed(1)}% — 100분의 30 미만이라 특정법인이 아닙니다 (§45의5①)`;
  return e.declaredPct === undefined
    ? `${base}. 간접보유분을 0%로 보았습니다 — 간접보유가 있으면 「지배주주등 합계 주식보유비율」에 직접+간접 합계를 입력하십시오.`
    : base;
}

/**
 * 상증령 §34의5④2호 — 법인세 안분 = (산출세액 − 공제감면) × min(거래이익, 소득금액) ÷ 소득금액.
 *
 * **법인 단위 계산이라 주주 명부와 무관하다** — single(지분율 직접)·roster(주주명부) 양쪽이 공유한다.
 * `annualIncome`이 0이면 안분 불가 → 호출자가 직접 넣은 `corporateTax` fallback.
 */
export function apportionCorporateTax(input: SpecificCorpInput): number {
  const annualIncome = input.annualIncome ?? 0;
  const corpTaxNet = Math.max(
    0,
    (input.corporateTaxComputed ?? 0) - (input.corporateTaxCredit ?? 0),
  );
  return annualIncome > 0
    ? safeMultiplyThenDivide(
        corpTaxNet,
        Math.min(input.transactionBenefit, annualIncome),
        annualIncome,
      ) // min으로 비율 1 상한
    : (input.corporateTax ?? 0); // 이월결손금 0 / 직접입력 fallback
}

/**
 * §45의5①: 증여의제이익 = 특정법인의 이익 × 지배주주등 주식보유비율.
 * 시행령 §34의5④: 특정법인의 이익 = 거래이익 − 법인세 상당액.
 * §34의5⑤: 증여의제이익이 1억원 이상인 경우로 한정. (한도 §45의5②는 증여세액 단계 — 별도)
 *
 * single — 지분율은 호출자가 `ownershipRatio`로 전달한다.
 * 법인세는 직접입력(`corporateTax`)이거나, 미전달 시 §34의5④2호 안분(`annualIncome` 등)을 쓴다.
 * 종전에는 안분이 roster 전용이라 UI의 「지분율 직접 + 법인세 자동안분」 조합이 항상 0원이었다.
 */
export function calcSpecificCorpGift(input: SpecificCorpInput): DeemedGiftResult {
  // 거래유형·상대방·현저성이 먼저다 — 이익 자체가 여기서 정해진다(영 §34의5④1호)
  const tx = evaluateScTransaction(input);
  const transactionBenefit = tx.benefit;
  const corporateTax = tx.exclusionReason ? 0 : (input.corporateTax ?? apportionCorporateTax(input));
  const ratio = input.ownershipRatio ?? { numer: 0, denom: 1 };
  const corpProfit = transactionBenefit - corporateTax;
  const gain = corpProfit > 0 ? safeMultiplyThenDivide(corpProfit, ratio.numer, ratio.denom) : 0;
  // ⓐ 특정법인 해당성 — single은 그룹 명부가 없어 미신고면 "unknown"(판정 보류)이다.
  const eligibility = evaluateSpecificCorpEligibility(ratio, input.controllingGroupRatio, "single");
  const applied = !tx.exclusionReason && eligibility.met !== "no" && gain >= ABSOLUTE_THRESHOLD;
  const value = applied ? gain : 0;

  const breakdown: CalculationStep[] = [
    { label: `거래이익 — ${txLabel(tx.transactionType)}`, amount: transactionBenefit, lawRef: GIFT.SPECIFIC_CORP },
    { label: "법인세 상당액", amount: corporateTax },
    { label: "특정법인의 이익 (거래이익 − 법인세 상당액)", amount: corpProfit > 0 ? corpProfit : 0 },
    { label: "증여의제이익 (특정법인의 이익 × 지배주주등 지분율)", amount: value, lawRef: GIFT.SPECIFIC_CORP, note: "§45의5 특정법인 (1억원 이상 한정·한도 §45의5② 별도)" },
  ];
  return {
    type: "specific_corp",
    applied,
    deemedGiftValue: value,
    breakdown,
    // ⓐ는 §45의5 성립 자체의 선결 요건이라 ⓑ 임계(1억)보다 먼저 보고한다.
    // 요건 순서 = 조문 순서: 거래(§45의5①·영 ④⑥⑦) → 법인 해당성(ⓐ) → 인별 임계(영 ⑤)
    exclusionReason: applied
      ? undefined
      : (tx.exclusionReason ??
        (eligibility.met === "no"
          ? notSpecificCorpReason(eligibility)
          : "증여의제이익이 1억원 미만 (§34의5⑤)")),
    legalBasis: GIFT.SPECIFIC_CORP,
    thresholdEcho: { gain },
    specificCorpEligibility: eligibility,
    specificCorpTransaction: tx,
  };
}

/**
 * §45의5 다주주(roster) 모드 — 시행령 §34의5④ 법인세 안분 + 주주별 안분 + 과세제외 3종 + §45의5② 한도.
 *
 * - 법인세 안분(§34의5④2호) = (산출세액 − 공제감면) × min(거래이익/소득금액, 1).
 * - 특정법인의 이익 = 거래이익 − 법인세 안분.
 * - 주주별 증여의제이익 = 특정법인의 이익 × 보유주식수/총주식수 (각자 독립 floor — 개별 산정, 잔액 흡수 안 함).
 * - 과세제외 3종: ①증여자 본인(donor_self) ②지배주주 친족 아님(non_related) ③1억 미만(below_threshold, §34의5⑤).
 */
export function calcSpecificCorpGiftMulti(input: SpecificCorpInput): DeemedGiftResult {
  const tx = evaluateScTransaction(input);
  const transactionBenefit = tx.benefit;
  const shareholders = input.shareholders ?? [];
  const giftDeduction = input.giftDeduction ?? 0;

  // ── §34의5④2호 법인세 안분 (single과 공용 leaf) ──
  // 거래요건 미충족이면 이익이 0이므로 안분 분자(min(거래이익, 소득금액))도 0이다.
  const corpTaxApportioned = tx.exclusionReason ? 0 : apportionCorporateTax({ ...input, transactionBenefit });

  // ── §34의5④ 특정법인의 이익 = 거래이익 − 법인세 안분 ──
  const corpProfit = Math.max(0, transactionBenefit - corpTaxApportioned);

  // ── ⓐ §45의5① 특정법인 해당성 — 지배주주등(친족 행) 직접지분 합계 + 신고된 간접분 ──
  // 증여자 본인(isDonor) 행도 지배주주등이므로 합계에 **포함**한다. donor_self 제외는
  // 「누가 수증자인가」(ⓑ) 축이지 「이 법인이 특정법인인가」(ⓐ) 축이 아니다 — 두 축을 섞지 말 것.
  // ⓐ도 「직접 또는 간접」이다 — 간접출자법인 경유분을 산입한 개인별 합산비율의 합으로 판정한다.
  const intermediaryCorps = input.intermediaryCorps ?? [];
  const gateDenom = shareholders.find((sh) => sh.totalShares > 0)?.totalShares ?? 0;
  let gateNumer = 0n;
  let gateDenomBig = 1n;
  for (const sh of shareholders) {
    if (!sh.isRelated || sh.isCorporate) continue; // 지배주주등은 개인(법 §45의4①)
    const f = combinedRatio(sh, intermediaryCorps);
    gateNumer = gateNumer * f.denom + f.numer * gateDenomBig;
    gateDenomBig = gateDenomBig * f.denom;
  }
  const eligibility = evaluateSpecificCorpEligibility(
    fracToNumbers(gateNumer, gateDenomBig, gateDenom),
    input.controllingGroupRatio,
    "roster",
  );
  const notSpecificCorp = eligibility.met === "no";
  const txExcluded = tx.exclusionReason !== undefined;

  // ── 주주별 증여의제이익 + 과세제외 5종 + §45의5② 한도 ──
  const donees: SpecificCorpDonee[] = shareholders.map((sh) => {
    const indirect = computeIndirectRatioBig(sh.id, intermediaryCorps, "ruling");
    const ratio = addDirect(sh, indirect);
    const gain = applyFrac(corpProfit, ratio);
    const directPct = sh.totalShares > 0 ? (sh.shares * 100) / sh.totalShares : 0;
    const indirectRatioPct = fracToPct(indirect);
    const base: SpecificCorpDonee = {
      name: sh.name,
      relation: sh.relation,
      shares: sh.shares,
      totalShares: sh.totalShares,
      ownershipRatioPct: directPct + indirectRatioPct, // 표시용 = 직접 + 간접
      directRatioPct: directPct,
      indirectRatioPct,
      gain,
      isTaxable: false,
    };
    if (txExcluded) return { ...base, nonTaxableReason: "transaction_not_covered" }; // 거래 자체가 §45의5① 밖
    if (notSpecificCorp) return { ...base, nonTaxableReason: "not_specific_corp" }; // ⓐ 법인 단위 선결 요건
    if (sh.isCorporate) return { ...base, gain: 0, nonTaxableReason: "corporate_shareholder" }; // 법인 → 개인에 간접 귀속
    if (sh.isDonor) return { ...base, gain: 0, nonTaxableReason: "donor_self" }; // 증여자 본인(특수관계인)
    if (!sh.isRelated) return { ...base, nonTaxableReason: "non_related" }; // 지배주주 친족 아님(타인)
    if (gain < ABSOLUTE_THRESHOLD) return { ...base, nonTaxableReason: "below_threshold" }; // §34의5⑤ 1억 미만
    // 과세 — §45의5② 한도 계산 (한도의 ㉠㉡도 같은 합산비율을 쓴다)
    const limitCalc = calcSpecificCorpLimit({
      gain,
      transactionBenefit,
      ratio,
      corpTaxApportioned,
      giftDeduction,
    });
    return { ...base, isTaxable: true, limitCalc };
  });

  const taxable = donees.filter((d) => d.isTaxable);
  const deemedGiftValue = taxable.reduce((a, d) => a + d.gain, 0);
  const applied = deemedGiftValue > 0;

  const breakdown: CalculationStep[] = [
    { label: "특정법인의 이익 (거래이익 − 법인세 안분)", amount: corpProfit, lawRef: GIFT.SPECIFIC_CORP },
    {
      label: "증여재산가액 (지배주주등 지분 안분)",
      amount: deemedGiftValue,
      lawRef: GIFT.SPECIFIC_CORP,
      note: `과세 수증자 ${taxable.length}명 (1억원 이상 지배주주등)`,
    },
  ];

  return {
    type: "specific_corp",
    applied,
    deemedGiftValue,
    breakdown,
    exclusionReason: applied
      ? undefined
      : (tx.exclusionReason ??
        (notSpecificCorp
          ? notSpecificCorpReason(eligibility)
          : "과세 지배주주등 없음 (본인증여분·비특수관계인·1억 미만 제외)")),
    legalBasis: GIFT.SPECIFIC_CORP,
    specificCorpMulti: { corpProfit, corpTaxApportioned, donees },
    specificCorpEligibility: eligibility,
    specificCorpTransaction: tx,
  };
}

/**
 * §45의5②·시행령 §34의5⑨ — 증여세 한도.
 * ㉮ 일반 산출세액 = 증여세(증여의제이익[법인세 차감 後] − 공제)
 * ㉠ 직접증여 가정 = 증여세(거래이익[법인세 차감 前]×지분율 − 공제)
 * ㉡ 법인세 상당액 × 지분율
 * finalTax = min(㉮, max(0, ㉠ − ㉡)). 과세표준은 천원절사 후 누진세율(§56) 적용.
 */
function calcSpecificCorpLimit(p: {
  gain: number;
  transactionBenefit: number;
  /** 합산 주식보유비율(직접+간접) — ㉠㉡ 모두 같은 비율을 쓴다 (상증령 §34의5⑨) */
  ratio: { numer: bigint; denom: bigint };
  corpTaxApportioned: number;
  giftDeduction: number;
}): SpecificCorpLimitCalc {
  const computedTax = calcInheritanceGiftTax(truncateToThousand(Math.max(0, p.gain - p.giftDeduction)));
  const directGiftBase = applyFrac(p.transactionBenefit, p.ratio); // 거래이익(차감 前)×보유비율
  const directGiftTax = calcInheritanceGiftTax(truncateToThousand(Math.max(0, directGiftBase - p.giftDeduction)));
  const corpTaxShare = applyFrac(p.corpTaxApportioned, p.ratio);
  const limitAmount = Math.max(0, directGiftTax - corpTaxShare);
  const finalTax = Math.min(computedTax, limitAmount);
  const filingCredit = Math.floor((finalTax * FILING_CREDIT_NUMER) / FILING_CREDIT_DENOM);
  const selfPayTax = finalTax - filingCredit;
  return { computedTax, directGiftTax, corpTaxShare, limitAmount, finalTax, filingCredit, selfPayTax };
}
