/**
 * 공익법인등 사후관리 **가산세** — 「상속세 및 증여세법」 §48②5호·7호 → §78⑨
 *
 * ## 법령 (2026-08-10 실측 · 법 MST 276123 · 령 MST 283637)
 *
 * **법 §48② 각 호 외의 부분 본문** — 세목이 여기서 갈린다:
 * > "…다음 제1호부터 제4호까지, 제6호 및 제8호의 어느 하나에 해당하는 경우에는 … **증여받은
 * >  것으로 보아 즉시 증여세를 부과**하고, **제5호 및 제7호**에 해당하는 경우에는 **제78조제9항에
 * >  따른 가산세**를 부과한다."
 *
 * **법 §78⑨**:
 * > "세무서장등은 공익법인등이 다음 각 호의 어느 하나에 해당하는 경우에는 각 호의 구분에 따른
 * >  금액의 **100분의 10**(제48조제2항제7호**가목**의 공익법인등이 이 항 **제3호**에 해당하는
 * >  경우에는 같은 호에 따른 금액의 **100분의 200**)에 상당하는 금액을 … 그 공익법인등이 납부할
 * >  세액에 가산하여 부과한다. 이 경우 **제1호와 제3호에 동시에 해당하는 경우에는 더 큰 금액으로
 * >  한다**."
 * >  1. …운용소득을 …기준금액에 미달하여 사용한 경우: 운용소득 중 사용하지 아니한 금액
 * >  2. …매각대금을 …기준금액에 미달하여 사용한 경우: 매각대금 중 사용하지 아니한 금액
 * >  3. 제48조제2항제7호에 해당하는 경우: 기준금액에서 직접 공익목적사업에 사용한 금액을 차감한 금액
 *
 * **상증령 §80⑬⑭** — 1호 기준금액 = §38⑤ 사용기준금액 / 2호 기준금액 = §38⑦ 사용기준 상당액
 * **상증령 §38⑤** — 운용소득의 **100분의 80**
 * **상증령 §38⑦** — 과세기간·사업연도 종료일부터 **1년 이내 30%**, **2년 이내 60%**
 * **법 §48②7호** — 기준금액 = 「출연받은 재산의 가액」(상증령 §38⑱) × **1%**
 *   (§16②2호가목 공익법인등이 발행주식총수등의 **10% 초과** 보유 시 **3%**)
 *
 * ## 🔑 가산세 base는 「미달사용액」이다
 *
 * §78⑨1·2호의 문언(「운용소득/매각대금 **중** 사용하지 아니한 금액」)만 보면 전액 대비
 * 미사용액으로도 읽힌다. 그러나 **국세청 집행기준 48-38-7**이 표로 못박는다:
 *
 * | 매각대금 사용기간 | 최소사용실적 | 미달시 추징방법 |
 * |---|---|---|
 * | 1년 이내 | 30% | 가산세 부과(**미달사용액**의 10%) |
 * | 2년 이내 | 60% | 가산세 부과(**미달사용액**의 10%) |
 * | 3년 이내 | 90% | **증여세** 추징(미달사용액) |
 *
 * 집행기준 48-40-1 ⑨도 「**미달사용금액**에 대한 가산세 추징」이라 쓴다. 전액 기준이면
 * 세액이 몇 배가 되므로 이 base를 anchor(PN-1·PN-2)로 고정했다.
 *
 * ## ⚠️ 3년 90%는 이 엔진이 아니다
 *
 * 같은 매각대금이라도 **3년 90% 미달은 §48②4호 증여세**다
 * (`./public-interest-post-mgmt` → `calcPublicInterestSaleProceeds`). 여기는 1년 30%·
 * 2년 60% **가산세**만 다룬다.
 *
 * ## ⚠️ 증여세 규정을 끌어오지 않는다
 *
 * §55② 과세최저한(50만원)·§56 누진세율은 **증여세** 규정이다. 가산세는 정률(10%·200%)이라
 * 소액이어도 그대로 부과된다(PN-6).
 */

import { applyRateFraction } from "../tax-utils";
import type {
  PenaltyClauseResult,
  PublicInterestPenaltyInput,
  PublicInterestPenaltyResult,
  PublicInterestStep,
} from "../types/public-interest-post-mgmt.types";

/** §78⑨ 본문 — 기본 가산세율 10%. */
const PENALTY_RATE_DEFAULT = 10;
/** §78⑨ 괄호 — §48②7호가목 공익법인등이 3호에 해당하는 경우 200%. */
const PENALTY_RATE_CLAUSE_GA = 200;

/** 상증령 §38⑤ — 운용소득 사용기준금액 비율. */
const OPERATING_INCOME_USE_PERCENT = 80;
/** 상증령 §38⑦ — 매각대금 1년·2년 사용기준 비율. */
const SALE_USE_PERCENT_1Y = 30;
const SALE_USE_PERCENT_2Y = 60;

const nonNegative = (n: number) => Math.max(0, Math.floor(n));

/** 미달사용액에 가산세율을 적용한다. 세법은 floor. */
function penaltyOf(shortfall: number, ratePercent: number): number {
  return applyRateFraction(shortfall, ratePercent, 100);
}

/** 기준금액 − 사용액 → 미달사용액 → 가산세. 세 호가 공유하는 형태. */
function clauseResult(threshold: number, used: number, ratePercent: number): PenaltyClauseResult {
  const shortfall = Math.max(0, threshold - used);
  return { threshold, used, shortfall, penalty: penaltyOf(shortfall, ratePercent) };
}

export function calcPublicInterestPenalty(
  input: PublicInterestPenaltyInput,
): PublicInterestPenaltyResult {
  const steps: PublicInterestStep[] = [];
  const warnings: string[] = [];

  // ── §78⑨1호 — 운용소득 (상증령 §38⑤·§80⑬) ──────────────────────────────────
  let operatingIncome: PublicInterestPenaltyResult["operatingIncome"];
  if (input.operatingIncome) {
    // 운용소득이 음수면 0으로 본다 (국세청 서면-2021-법규법인-7926).
    const income = nonNegative(input.operatingIncome.income);
    const threshold = applyRateFraction(income, OPERATING_INCOME_USE_PERCENT, 100);
    operatingIncome = clauseResult(
      threshold,
      nonNegative(input.operatingIncome.usedAmount),
      PENALTY_RATE_DEFAULT,
    );
    steps.push({
      label: "1호 운용소득 사용기준금액",
      formula: `운용소득 ${income.toLocaleString()} × ${OPERATING_INCOME_USE_PERCENT}%`,
      amount: threshold,
      legalBasis: "상증령 §38⑤ · §80⑬",
    });
    steps.push({
      label: "1호 가산세",
      formula:
        `(기준금액 ${threshold.toLocaleString()} − 사용실적 ${operatingIncome.used.toLocaleString()})` +
        ` × ${PENALTY_RATE_DEFAULT}%`,
      amount: operatingIncome.penalty,
      legalBasis: "상증법 §78⑨1호",
    });
  }

  // ── §78⑨2호 — 매각대금 (상증령 §38⑦·§80⑭) ─────────────────────────────────
  let saleProceeds: PublicInterestPenaltyResult["saleProceeds"];
  if (input.saleProceeds) {
    const proceeds = nonNegative(input.saleProceeds.proceeds);
    const threshold1y = applyRateFraction(proceeds, SALE_USE_PERCENT_1Y, 100);
    const threshold2y = applyRateFraction(proceeds, SALE_USE_PERCENT_2Y, 100);
    const y1 = clauseResult(
      threshold1y,
      nonNegative(input.saleProceeds.usedWithin1y),
      PENALTY_RATE_DEFAULT,
    );
    const y2 = clauseResult(
      threshold2y,
      nonNegative(input.saleProceeds.usedWithin2y),
      PENALTY_RATE_DEFAULT,
    );
    saleProceeds = {
      threshold1y,
      used1y: y1.used,
      shortfall1y: y1.shortfall,
      penalty1y: y1.penalty,
      threshold2y,
      used2y: y2.used,
      shortfall2y: y2.shortfall,
      penalty2y: y2.penalty,
      penalty: y1.penalty + y2.penalty,
    };
    steps.push({
      label: "2호 매각대금 1년 이내",
      formula:
        `기준 ${proceeds.toLocaleString()} × ${SALE_USE_PERCENT_1Y}% = ${threshold1y.toLocaleString()}` +
        ` − 사용실적 ${y1.used.toLocaleString()} → 미달 ${y1.shortfall.toLocaleString()} × ${PENALTY_RATE_DEFAULT}%`,
      amount: y1.penalty,
      legalBasis: "상증령 §38⑦ · 상증법 §78⑨2호",
    });
    steps.push({
      label: "2호 매각대금 2년 이내",
      formula:
        `기준 ${proceeds.toLocaleString()} × ${SALE_USE_PERCENT_2Y}% = ${threshold2y.toLocaleString()}` +
        ` − 사용실적(누계) ${y2.used.toLocaleString()} → 미달 ${y2.shortfall.toLocaleString()} × ${PENALTY_RATE_DEFAULT}%`,
      amount: y2.penalty,
      legalBasis: "상증령 §38⑦ · 상증법 §78⑨2호",
    });
    warnings.push(
      "1년차·2년차 가산세는 **부과 시기가 다릅니다** — 각각 해당 사업연도에 별도로 판정·부과됩니다. 합계는 두 시점 모두 미달한 경우의 금액입니다.",
    );
    warnings.push(
      "같은 매각대금이라도 **3년 이내 90% 미달은 §48②4호 증여세**입니다(가산세가 아닙니다) — 「매각대금 (§48②4호)」 계산기를 이용하세요.",
    );
  }

  // ── §78⑨3호 — 의무지출 (법 §48②7호 · 상증령 §38⑱⑲) ────────────────────────
  let mandatoryDistribution: PublicInterestPenaltyResult["mandatoryDistribution"];
  if (input.mandatoryDistribution) {
    const md = input.mandatoryDistribution;
    const assetBase = nonNegative(md.assetBase);
    const rateNumer = md.exceedsTenPercentHolding ? 3 : 1;
    const threshold = applyRateFraction(assetBase, rateNumer, 100);
    const penaltyRatePercent = md.isClauseGaCorp ? PENALTY_RATE_CLAUSE_GA : PENALTY_RATE_DEFAULT;
    const base = clauseResult(threshold, nonNegative(md.usedAmount), penaltyRatePercent);
    mandatoryDistribution = { ...base, rateNumer, penaltyRatePercent };
    steps.push({
      label: "3호 의무지출 기준금액",
      formula:
        `출연받은 재산의 가액 ${assetBase.toLocaleString()} × ${rateNumer}%` +
        (md.exceedsTenPercentHolding ? " (발행주식총수등 10% 초과 보유)" : ""),
      amount: threshold,
      legalBasis: "상증법 §48②7호 · 상증령 §38⑱",
    });
    steps.push({
      label: "3호 가산세",
      formula:
        `(기준금액 ${threshold.toLocaleString()} − 사용액 ${base.used.toLocaleString()})` +
        ` × ${penaltyRatePercent}%` +
        (md.isClauseGaCorp ? " (§48②7호 가목 공익법인등)" : ""),
      amount: base.penalty,
      legalBasis: "상증법 §78⑨3호",
    });
    if (md.isClauseGaCorp) {
      warnings.push(
        "§48②7호 **가목** 공익법인등이라 3호 가산세율이 **200%**입니다(나목 10%의 20배). 1호·2호 가산세율은 그대로 10%입니다.",
      );
    }
  }

  // ── §78⑨ 후단 — 1호와 3호는 **더 큰 금액**, 2호는 합산 ───────────────────────
  // 「해당하는 경우」이므로 가산세가 0인 호는 택일 대상이 아니다.
  const p1 = operatingIncome && operatingIncome.penalty > 0 ? operatingIncome.penalty : 0;
  const p3 = mandatoryDistribution && mandatoryDistribution.penalty > 0
    ? mandatoryDistribution.penalty
    : 0;

  let clause1And3Applied: PublicInterestPenaltyResult["clause1And3Applied"] = "none";
  if (p1 > 0 || p3 > 0) {
    clause1And3Applied = p3 >= p1 ? "clause3" : "clause1";
  }
  const clause1And3Penalty = Math.max(p1, p3);

  if (p1 > 0 && p3 > 0) {
    steps.push({
      label: "1호·3호 택일",
      formula:
        `1호 ${p1.toLocaleString()} vs 3호 ${p3.toLocaleString()} → 더 큰 금액` +
        ` (${clause1And3Applied === "clause3" ? "3호" : "1호"} 채택)`,
      amount: clause1And3Penalty,
      legalBasis: "상증법 §78⑨ 후단",
    });
    warnings.push(
      "1호(운용소득)와 3호(의무지출)에 **동시에 해당**해 §78⑨ 후단에 따라 **더 큰 금액**만 부과했습니다(합산하지 않습니다).",
    );
  }

  const totalPenalty = clause1And3Penalty + (saleProceeds?.penalty ?? 0);

  steps.push({
    label: "가산세 합계",
    formula:
      `1호·3호 택일 ${clause1And3Penalty.toLocaleString()} + 2호 ${(saleProceeds?.penalty ?? 0).toLocaleString()}`,
    amount: totalPenalty,
    legalBasis: "상증법 §78⑨",
  });

  warnings.push(
    "§55② 과세최저한(50만원)·§56 누진세율은 **증여세** 규정이라 가산세에는 적용되지 않습니다 — 소액이어도 정률로 부과됩니다.",
  );
  warnings.push(
    "영농(§18의3)·가업(§18의2) 사후관리와 달리 **이자상당액 가산 규정이 없습니다**. 이 계산에도 가산하지 않았습니다.",
  );

  return {
    operatingIncome,
    saleProceeds,
    mandatoryDistribution,
    clause1And3Applied,
    clause1And3Penalty,
    totalPenalty,
    steps,
    warnings,
  };
}
