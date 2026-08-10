/**
 * 공익법인등 출연주식 **의결권 행사** 증여세 추징 — 「상속세 및 증여세법」 §48②6호
 *
 * ## 법령 (2026-08-10 실측 · 법 MST 276123 · 령 MST 283637)
 *
 * **법 §48②6호**:
 * > "**제16조제2항제2호가목**에 따른 요건을 모두 충족하는 공익법인등(같은 호 **나목 및 다목**에
 * >  해당하는 공익법인등은 **제외**한다)이 **같은 목 1)을 위반**하여 출연받은 주식등의
 * >  **의결권을 행사한 경우**"
 *
 * **법 §16②2호가목**:
 * > "가. 다음의 요건을 모두 갖춘 공익법인등(나목 또는 다목에 해당하는 공익법인등은 제외한다)에
 * >  출연하는 경우: **100분의 20**
 * >    1) **출연받은 주식등의 의결권을 행사하지 아니할 것**
 * >    2) **자선ㆍ장학 또는 사회복지를 목적으로 할 것**"
 *
 * (같은 호 **나목** = 상호출자제한기업집단과 특수관계에 있는 공익법인등: 100분의 5 /
 *  **다목** = §48⑪ 각 호의 요건을 충족하지 못하는 공익법인등: 100분의 5)
 *
 * **상증령 §40①3의2호** — 「대통령령으로 정하는 가액」:
 * > "법 제48조제2항제6호에 해당하게 되는 경우에는 해당 공익법인 등이 출연받은 주식등의
 * >  **의결권을 행사한 날**에 발행주식총수등의 **100분의 10을 초과**하여 보유하고 있는
 * >  **주식등의 가액**"
 *
 * ## ⭐ 한도는 20%인데 과세 기준선은 10%다
 *
 * 가목 요건을 갖추면 20%까지 출연받아도 과세가액에 산입되지 않는다. 그런데 1)을 위반해
 * 의결권을 행사하면 과세가액은 **10%를 초과**하여 보유하는 주식등의 가액이다 — 「20% 초과분」이
 * 아니다. 15% 보유 법인은 5%p가 통째로 과세된다. 「한도를 넘지 않았으니 과세 없음」은 틀렸다.
 *
 * ## ⭐ 세 갈래로 6호가 성립하지 않는다
 *
 * ① 의결권을 행사하지 않았다 · ② 자선·장학·사회복지 목적이 아니다(가목 요건 2 미충족) ·
 * ③ 나목·다목 공익법인등이다(§48②6호 괄호가 명시 제외). 결과는 모두 「과세 0」이지만 사유가
 * 다르므로 구분해 담는다 — 「의결권을 행사했으니 추징」으로 뭉뚱그리면 대상이 아닌 법인에
 * 과세하게 된다.
 *
 * ## ⚠️ 10% 기준선을 주식 수로 반올림하지 않는다
 *
 * 「발행주식총수등의 100분의 10을 초과하여 보유하고 있는 주식등의 가액」이므로 초과분은
 * `보유수 − 발행수 × 0.1`이다. 발행주식수가 10의 배수가 아니면 이 값이 정수가 아닐 수 있어,
 * 기준선을 먼저 정수화하면 경계에서 과세 여부가 뒤집힌다. 정수 분수연산으로 가액을 직접 구한다.
 */

import { safeMultiplyThenDivide } from "../tax-utils";
import { applyMinimumTaxBase, GIFT_TAX_BASE_MIN } from "./public-interest-gift-tax-base";
import type {
  PublicInterestVotingRightsInput,
  PublicInterestVotingRightsResult,
} from "../types/public-interest-post-mgmt.types";

/** 상증령 §40①3의2호 — 과세 기준선(발행주식총수등의 100분의 10). */
const TAXABLE_THRESHOLD_PERCENT = 10;

/** 6호 미적용 사유 — 결과는 같은 0이어도 이유가 다르다. */
function nonApplicableReasonOf(input: PublicInterestVotingRightsInput): string | undefined {
  if (input.isNaDaMokCorp) {
    return "§16②2호 나목(상호출자제한기업집단과 특수관계)·다목(§48⑪ 요건 미충족) 공익법인등은 §48②6호 괄호로 **제외**됩니다 — 이들은 가목(20%)이 아니라 5% 한도를 적용받습니다.";
  }
  if (!input.isCharityPurpose) {
    return "§16②2호가목 2)의 「자선ㆍ장학 또는 사회복지를 목적으로 할 것」을 충족하지 않아 가목 요건을 모두 갖춘 공익법인등이 아닙니다 — §48②6호 대상이 아닙니다.";
  }
  if (!input.exercisedVotingRights) {
    return "출연받은 주식등의 의결권을 행사하지 않았으므로 §16②2호가목 1) 위반이 없습니다 — §48②6호 대상이 아닙니다.";
  }
  return undefined;
}

export function calcPublicInterestVotingRights(
  input: PublicInterestVotingRightsInput,
): PublicInterestVotingRightsResult {
  const steps: PublicInterestVotingRightsResult["steps"] = [];
  const warnings: string[] = [];

  const totalShares = Math.max(0, Math.floor(input.totalShares));
  const heldShares = Math.max(0, Math.floor(input.heldShares));
  const pricePerShare = Math.max(0, Math.floor(input.pricePerShare));

  const nonApplicableReason = nonApplicableReasonOf(input);
  const applies = nonApplicableReason === undefined;

  steps.push({
    label: "§48②6호 해당 여부",
    formula: applies
      ? `§16②2호가목 요건(1 의결권 미행사 · 2 자선ㆍ장학 또는 사회복지 목적)을 갖춘 공익법인등이` +
        ` ${input.exerciseDate}에 의결권을 행사 → 같은 목 1) 위반`
      : (nonApplicableReason as string),
    amount: 0,
    legalBasis: "상증법 §48②6호 · §16②2호가목",
  });

  // 발행주식총수등의 10%. 표시용이며 계산은 아래 정수 분수연산으로 한다(반올림 금지).
  const tenPercentShares = totalShares > 0 ? (totalShares * TAXABLE_THRESHOLD_PERCENT) / 100 : 0;
  /** 초과 주식수 × 100 — 정수 유지를 위해 100배 스케일로 다룬다. */
  const excessScaled =
    totalShares > 0 ? heldShares * 100 - totalShares * TAXABLE_THRESHOLD_PERCENT : 0;
  const excessShares = excessScaled > 0 ? excessScaled / 100 : 0;

  if (totalShares <= 0) {
    warnings.push(
      "발행주식총수등이 0이라 §48②6호의 10% 초과 여부를 판정할 수 없습니다 — 자기주식·자기출자지분을 제외한 발행주식총수등을 입력하세요.",
    );
  }

  const clawbackBase =
    applies && excessScaled > 0 ? safeMultiplyThenDivide(pricePerShare, excessScaled, 100) : 0;

  if (applies && totalShares > 0) {
    steps.push({
      label: "10% 초과 보유 주식등",
      formula:
        `보유 ${heldShares.toLocaleString()}주 − 발행주식총수등 ${totalShares.toLocaleString()}주 ×` +
        ` ${TAXABLE_THRESHOLD_PERCENT}%(= ${tenPercentShares.toLocaleString()}주)` +
        ` = ${excessShares.toLocaleString()}주`,
      amount: 0,
      legalBasis: "상증령 §40①3의2호",
    });
    steps.push({
      label: "과세가액",
      formula:
        `${excessShares.toLocaleString()}주 × 1주당 평가액 ${pricePerShare.toLocaleString()}` +
        ` (${input.exerciseDate} 현재)`,
      amount: clawbackBase,
      legalBasis: "상증령 §40①3의2호",
    });
  }

  const { taxBase, giftTax, rate, deduction, belowMinimumTaxBase } =
    applyMinimumTaxBase(clawbackBase);

  if (belowMinimumTaxBase) {
    warnings.push(
      `과세표준이 ${GIFT_TAX_BASE_MIN.toLocaleString()}원 미만이라 증여세를 부과하지 않습니다(상증법 §55②).`,
    );
  }

  steps.push({
    label: "추징 증여세",
    formula:
      taxBase > 0
        ? `과세표준 ${taxBase.toLocaleString()} × ${(rate * 100).toFixed(0)}%` +
          (deduction > 0 ? ` − 누진공제 ${deduction.toLocaleString()}` : "")
        : "과세표준 0 — 부과 세액 없음",
    amount: giftTax,
    legalBasis: "상증법 §56",
  });

  if (applies) {
    warnings.push(
      "🔑 출연 **한도는 20%**(§16②2호가목)지만 과세가액의 기준선은 **10%**입니다(상증령 §40①3의2호) — 「한도를 넘지 않았으니 과세 없음」이 아닙니다.",
    );
    warnings.push(
      "평가 기준일은 **의결권을 행사한 날**입니다 — 출연 당시나 사업연도 말 가액이 아닙니다.",
    );
  }
  warnings.push(
    "영농(§18의3)·가업(§18의2) 사후관리와 달리 §48②에는 **이자상당액 가산 규정이 없습니다**. 이 계산에도 가산하지 않았습니다.",
  );

  return {
    applies,
    nonApplicableReason,
    isClawback: clawbackBase > 0,
    belowMinimumTaxBase,
    exerciseDate: input.exerciseDate,
    tenPercentShares,
    excessShares,
    clawbackBase,
    taxBase,
    giftTax,
    appliedRate: rate,
    progressiveDeduction: deduction,
    steps,
    warnings,
  };
}
