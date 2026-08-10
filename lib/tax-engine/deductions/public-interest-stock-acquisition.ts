/**
 * 공익법인등 **주식등 취득 시 보유비율 초과** 증여세 추징 — 「상속세 및 증여세법」 §48②2호
 *
 * ## 법령 (2026-08-10 실측 · 법 MST 276123 · 령 MST 283637 · 칙 MST 284609)
 *
 * **법 §48②2호**:
 * > "출연받은 재산(그 재산을 수익용 또는 수익사업용으로 운용하는 경우 및 그 운용소득이 있는
 * >  경우를 포함한다) 및 출연받은 재산의 매각대금(…)을 내국법인의 주식등을 **취득하는 데 사용**
 * >  하는 경우로서 그 취득하는 주식등과 다음 각 목의 주식등을 합한 것이 그 내국법인의 의결권
 * >  있는 발행주식총수등의 **제16조제2항제2호에 따른 비율을 초과**하는 경우. **다만**,
 * >  제16조제3항**제1호 또는 제3호**에 해당하는 경우(이 경우 "출연"은 "취득"으로 본다)와
 * >  …**산학협력단**이 주식등을 취득하는 경우로서 대통령령으로 정하는 요건을 갖춘 경우는 제외한다.
 * >    가. **취득 당시** 해당 공익법인등이 보유하고 있는 동일한 내국법인의 주식등
 * >    나. **해당 내국법인과 특수관계에 있는 출연자**가 해당 공익법인등 외의 다른 공익법인등에
 * >       출연한 동일한 내국법인의 주식등
 * >    다. **해당 내국법인과 특수관계에 있는 출연자**로부터 재산을 출연받은 다른 공익법인등이
 * >       보유하고 있는 동일한 내국법인의 주식등"
 *
 * **법 §16②2호** — 비율: 원칙 **10%** / **가목**(1 의결권 미행사 · 2 자선·장학·사회복지 목적,
 * 「나목 또는 다목에 해당하는 공익법인등은 제외한다」) **20%** / **나목**(상호출자제한기업집단과
 * 특수관계) **5%** / **다목**(§48⑪ 각 호의 요건 미충족) **5%**
 *
 * **상증령 §37①** — 초과부분은 다음 날을 **기준으로** 계산한다: 1호 매매·출연 취득 = 그 취득일 /
 * 2호 유상증자 배정 신주 = 취득일이 속하는 과세기간·사업연도 중 주주명부 폐쇄일·권리행사 기준일
 * (주식회사 외 = 종료일) / 3호 감자 = 감자 주주총회결의일이 속하는 연도의 주주명부폐쇄일 /
 * 4호 합병 = 합병등기일이 속하는 과세기간·사업연도 중 주주명부 폐쇄일·권리행사 기준일
 *
 * **상증령 §37②** — 「해당 내국법인과 특수관계에 있는 출연자」 = 출연자가 해당 내국법인과
 * §2조의2③ 각 호의 관계에 있는 경우 그 출연자
 *
 * **상증령 §37⑥** — 산학협력단 단서 3요건(기술 출자로 기술지주회사·신기술창업전문회사 설립 /
 * 50%·30% 이상 보유 / 자회사 외 주식등 미보유)
 *
 * **상증령 §40①2호** — 과세가액 = 「그 **초과부분을 취득하는데 사용한 재산의 가액**」
 * **상증칙 §13①** — 그 가액 **산정이 곤란한 경우** 초과부분은 법 §60~§66 평가방법에 따른다
 *
 * ## ⭐ 과세가액이 앞의 다섯 사유와 다르다 — 평가액이 아니라 **취득자금**이다
 *
 * 1·3·4·6·8호는 전부 「…재산의 가액」(평가액)이었다. 2호만 「취득하는데 **사용한** 재산의
 * 가액」이다. 「초과 주식수 × 주당 평가액」으로 계산하면 틀린다(그건 6호 방식 —
 * `./public-interest-voting-rights`).
 *
 * ## ⭐ 과세 단위는 「추가로 취득하는 주식」이다 — `min(초과, 취득)`
 *
 * 합산분(가·나·다목)만으로 이미 한도를 넘었더라도 **취득하지 않은 주식에는 과세할 수 없다**.
 * 근거 4건이 수렴한다:
 *   ① 법 §48②2호 본문 — 과세 계기가 「취득하는 데 **사용**하는 경우」(보유가 아니다)
 *   ② 상증령 §40①2호 — 「취득하는데 **사용한** 재산의 가액」(취득하지 않은 주식엔 취득자금이 없다)
 *   ③ 집행기준 48-40-1 ⑧ — 「주식보유비율을 **초과하여 취득한 주식**의 취득가액」
 *   ④ 국세청 **서면법규과-557** — 「…**추가로 취득하는 주식**은 …증여세가 과세되는 것이며 …
 *      **추가로 취득하는 주식의 지분율 5%까지는** 증여세가 과세되지 않는 것」
 * ⚠️ ④는 「성실공익법인 10%」 시기 회신이라 **비율 부분은 현행과 다르다**. 채택한 것은 「과세
 *    단위」 구조 설시뿐이며 그것은 ①의 현행 문언에서 직접 도출된다.
 * 설계 경위: `docs/02-design/features/public-interest-48-2-2-stock-acquisition.plan.md` §5.1
 *
 * ## ⚠️ 1회 취득 단위다
 *
 * 여러 취득 건을 합산·안분하지 않는다 — 단가가 달라 「그 초과부분을 취득하는 데 사용한 재산의
 * 가액」이 특정되지 않고, §37①이 취득 형태별 기준일을 두는 것도 건별 판정을 전제한다.
 *
 * ## ⚠️ 비율 판정을 §48②6호 엔진과 공유하지 않는다
 *
 * 6호(`./public-interest-voting-rights`)는 상증령 §40①3의2호가 정한 **고정 10%**를 쓰고 비율을
 * 도출하지 않는다. 같은 §16②2호 가·나·다목을 참조하지만 쓰임이 달라(6호=가목 요건 충족 여부 /
 * 2호=비율 선택) 공유할 실체가 없다. 술어만 같고 인자가 다른 「가짜 단일 소스」를 만들지 않는다
 * ([[feedback_shared_predicate_argument_parity]]).
 */

import { safeMultiplyThenDivide } from "../tax-utils";
import { applyMinimumTaxBase, GIFT_TAX_BASE_MIN } from "./public-interest-gift-tax-base";
import type {
  HoldingRatioClause,
  PublicInterestStockAcquisitionInput,
  PublicInterestStockAcquisitionResult,
  StockAcquisitionForm,
} from "../types/public-interest-post-mgmt.types";

/** 상증령 §37① 각 호 — 기준일의 의미. */
const FORM_LABELS: Record<StockAcquisitionForm, string> = {
  purchase_or_donation: "매매 또는 출연에 의한 취득 — 그 취득일 (상증령 §37①1호)",
  paid_in_capital_increase:
    "유상증자 배정 신주의 유상취득 — 취득일이 속하는 과세기간·사업연도 중 주주명부 폐쇄일 또는 권리행사 기준일 (상증령 §37①2호)",
  capital_reduction:
    "감자 — 감자를 위한 주주총회결의일이 속하는 연도의 주주명부폐쇄일 (상증령 §37①3호)",
  merger:
    "합병으로 합병법인 주식등 취득 — 합병등기일이 속하는 과세기간·사업연도 중 주주명부 폐쇄일 또는 권리행사 기준일 (상증령 §37①4호)",
};

const RATIO_LABELS: Record<HoldingRatioClause, string> = {
  default: "원칙 (법 §16②2호 본문)",
  ga: "가목 — 의결권 미행사 + 자선ㆍ장학 또는 사회복지 목적 (법 §16②2호가목)",
  na: "나목 — 상호출자제한기업집단과 특수관계 (법 §16②2호나목)",
  da: "다목 — §48⑪ 각 호의 요건 미충족 (법 §16②2호다목)",
};

const nonNegative = (n: number) => Math.max(0, Math.floor(n));

/**
 * 법 §16②2호 — 적용 비율.
 *
 * ⭐ **나목·다목이 가목을 이긴다.** 가목 본문 괄호가 「나목 또는 다목에 해당하는 공익법인등은
 * 제외한다」라고 명시하므로, 가목 요건을 모두 갖췄더라도 나목·다목이면 5%다.
 */
function resolveRatio(
  h: PublicInterestStockAcquisitionInput["holdingRatio"],
): { percent: number; clause: HoldingRatioClause } {
  if (h.isMutualInvestmentRestrictedGroup) return { percent: 5, clause: "na" };
  if (h.failsClause11Requirements) return { percent: 5, clause: "da" };
  if (h.noVotingRights && h.isCharityPurpose) return { percent: 20, clause: "ga" };
  return { percent: 10, clause: "default" };
}

/**
 * §48②2호 **단서** 판정.
 *
 * ⚠️ 준용되는 것은 §16③ **제1호 또는 제3호**뿐이다. **제2호**(초과보유일부터 3년 이내 초과분
 * 매각)는 「출연」 전용이라 취득에 준용되지 않으므로 입력 자체를 두지 않았다.
 * 산학협력단은 상증령 §37⑥ **3요건을 모두** 갖춰야 한다.
 */
function evaluateExclusion(
  input: PublicInterestStockAcquisitionInput,
): { excluded: boolean; reason?: string } {
  const e = input.exclusion;
  if (!e) return { excluded: false };
  if (e.clause16_3_1) {
    return {
      excluded: true,
      reason:
        "법 §16③**제1호** — 상호출자제한기업집단과 특수관계에 있지 아니한 공익법인등이 출연자와 특수관계 없는 내국법인의 주식등을 취득하는 경우로서 주무관청이 목적사업 수행에 필요하다고 인정 (§48②2호 단서, 「출연」을 「취득」으로 봄)",
    };
  }
  if (e.clause16_3_3) {
    return {
      excluded: true,
      reason:
        "법 §16③**제3호** — 「공익법인의 설립ㆍ운영에 관한 법률」 및 그 밖의 법령에 따라 내국법인의 주식등을 취득하는 경우 (§48②2호 단서)",
    };
  }
  const ia = e.industryAcademic;
  if (ia && ia.establishedByTechContribution && ia.ratioMet && ia.noOtherShares) {
    return {
      excluded: true,
      reason:
        "**산학협력단**이 주식등을 취득하는 경우로서 상증령 §37⑥ 3요건(기술 출자로 기술지주회사·신기술창업전문회사 설립 / 50%·30% 이상 보유 / 자회사 외 주식등 미보유)을 모두 갖춤 (§48②2호 단서)",
    };
  }
  return { excluded: false };
}

export function calcPublicInterestStockAcquisition(
  input: PublicInterestStockAcquisitionInput,
): PublicInterestStockAcquisitionResult {
  const steps: PublicInterestStockAcquisitionResult["steps"] = [];
  const warnings: string[] = [];

  const totalShares = nonNegative(input.totalShares);
  const acquiredShares = nonNegative(input.acquiredShares);
  const heldShares = nonNegative(input.heldSharesAtAcquisition);
  const otherDonated = nonNegative(input.otherCorpDonatedShares);
  const otherHeld = nonNegative(input.otherCorpHeldShares);
  const acquisitionCost = nonNegative(input.acquisitionCost);

  const { percent: ratioPercent, clause: ratioClause } = resolveRatio(input.holdingRatio);
  const totalCountedShares = acquiredShares + heldShares + otherDonated + otherHeld;
  const limitShares = totalShares > 0 ? (totalShares * ratioPercent) / 100 : 0;

  steps.push({
    label: "판정 기준일",
    formula: `${FORM_LABELS[input.acquisitionForm]} → ${input.assessmentDate}`,
    amount: 0,
    legalBasis: "상증령 §37①",
  });
  steps.push({
    label: "적용 비율",
    formula: `${RATIO_LABELS[ratioClause]} → ${ratioPercent}%`,
    amount: 0,
    legalBasis: "상증법 §16②2호",
  });

  const { excluded, reason } = evaluateExclusion(input);
  const nonApplicableReason =
    acquiredShares <= 0
      ? "이번에 **취득**한 주식등이 없습니다 — §48②2호의 과세 계기는 「주식등을 취득하는 데 사용하는 경우」이므로 해당하지 않습니다."
      : undefined;

  const baseResult = {
    assessmentDate: input.assessmentDate,
    ratioPercent,
    ratioClause,
    limitShares,
    totalCountedShares,
    steps,
    warnings,
  };

  if (nonApplicableReason || excluded) {
    steps.push({
      label: excluded ? "단서 적용 — 추징 제외" : "§48②2호 미해당",
      formula: (excluded ? reason : nonApplicableReason) ?? "",
      amount: 0,
      legalBasis: excluded ? "상증법 §48②2호 단서" : "상증법 §48②2호",
    });
    return {
      ...baseResult,
      applies: false,
      exemptReason: excluded ? reason : undefined,
      nonApplicableReason,
      isClawback: false,
      belowMinimumTaxBase: false,
      excessShares: 0,
      taxableShares: 0,
      excessCappedByAcquired: false,
      usedChapter4Value: false,
      clawbackBase: 0,
      taxBase: 0,
      giftTax: 0,
      appliedRate: 0,
      progressiveDeduction: 0,
    };
  }

  // ── 초과 판정 ──────────────────────────────────────────────────────────────
  // ⚠️ 한도 주식수를 정수로 반올림하지 않는다 — 발행주식수가 비율의 배수가 아니면 경계에서
  //    과세 여부가 뒤집힌다. 100배 스케일 정수로 다룬다.
  const excessScaled = Math.max(0, totalCountedShares * 100 - totalShares * ratioPercent);
  const acquiredScaled = acquiredShares * 100;
  // ⭐ 과세 단위는 「추가로 취득하는 주식」 — 취득분을 넘을 수 없다.
  const taxableScaled = Math.min(excessScaled, acquiredScaled);
  const excessShares = excessScaled / 100;
  const taxableShares = taxableScaled / 100;
  const excessCappedByAcquired = excessScaled > acquiredScaled;

  steps.push({
    label: "보유비율 초과 판정",
    formula:
      `취득 ${acquiredShares.toLocaleString()} + 가목 ${heldShares.toLocaleString()}` +
      ` + 나목 ${otherDonated.toLocaleString()} + 다목 ${otherHeld.toLocaleString()}` +
      ` = ${totalCountedShares.toLocaleString()}주` +
      ` / 한도 ${totalShares.toLocaleString()} × ${ratioPercent}% = ${limitShares.toLocaleString()}주` +
      ` → 초과 ${excessShares.toLocaleString()}주`,
    amount: 0,
    legalBasis: "상증법 §48②2호 각 목",
  });

  if (excessCappedByAcquired) {
    steps.push({
      label: "과세 단위 — 추가로 취득한 주식",
      formula:
        `초과 ${excessShares.toLocaleString()}주가 이번 취득 ${acquiredShares.toLocaleString()}주를` +
        ` 넘어 취득분으로 제한 (취득하지 않은 주식에는 취득자금이 없다)`,
      amount: 0,
      legalBasis: "상증령 §40①2호",
    });
    warnings.push(
      "합산분(가·나·다목)만으로 이미 한도를 넘어, 과세 대상이 **이번에 취득한 주식 전부**로 제한되었습니다 — 과세가액이 「초과부분을 **취득하는데 사용한** 재산의 가액」이기 때문입니다(상증령 §40①2호).",
    );
  }

  // ── 과세가액 ───────────────────────────────────────────────────────────────
  const usedChapter4Value = input.chapter4ValueOfExcess !== undefined && taxableScaled > 0;
  const clawbackBase = usedChapter4Value
    ? nonNegative(input.chapter4ValueOfExcess as number)
    : taxableScaled > 0
      ? safeMultiplyThenDivide(acquisitionCost, taxableScaled, acquiredScaled)
      : 0;

  steps.push({
    label: "과세가액",
    formula: usedChapter4Value
      ? `취득가액 산정이 곤란해 초과분 ${taxableShares.toLocaleString()}주를 법 §60~§66 평가방법으로 평가 (상증칙 §13①)`
      : `취득에 사용한 재산의 가액 ${acquisitionCost.toLocaleString()} ×` +
        ` (과세대상 ${taxableShares.toLocaleString()}주 ÷ 취득 ${acquiredShares.toLocaleString()}주)`,
    amount: clawbackBase,
    legalBasis: usedChapter4Value ? "상증칙 §13①" : "상증령 §40①2호",
  });

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

  warnings.push(
    "🔑 과세가액은 주식 **평가액이 아니라 「취득하는데 사용한 재산의 가액」**(취득자금)입니다(상증령 §40①2호). 그 산정이 곤란한 경우에만 법 §60~§66 평가액으로 갑니다(상증칙 §13①).",
  );
  warnings.push(
    "이 계산은 **1회 취득 단위**입니다 — 취득 시기·단가가 다른 여러 건은 각각 판정하세요. 상증령 §37①이 취득 형태별로 기준일을 따로 정하는 것도 건별 판정을 전제합니다.",
  );
  warnings.push(
    "단서로 준용되는 것은 법 §16③ **제1호 또는 제3호**뿐입니다 — **제2호**(초과보유일부터 3년 이내 초과분 매각)는 **출연 전용**이라 취득에는 준용되지 않습니다.",
  );
  warnings.push(
    "취득에 사용한 재산이 **매각대금**인 경우 그 매각대금은 「매각대금에 의하여 증가한 재산을 포함하되 매각에 따라 부담하는 국세·지방세는 제외」한 금액입니다(법 §48②1호 본문 괄호 · 상증령 §38⑰).",
  );
  warnings.push(
    "영농(§18의3)·가업(§18의2) 사후관리와 달리 §48②에는 **이자상당액 가산 규정이 없습니다**. 이 계산에도 가산하지 않았습니다.",
  );

  return {
    ...baseResult,
    applies: true,
    isClawback: clawbackBase > 0,
    belowMinimumTaxBase,
    excessShares,
    taxableShares,
    excessCappedByAcquired,
    usedChapter4Value,
    clawbackBase,
    taxBase,
    giftTax,
    appliedRate: rate,
    progressiveDeduction: deduction,
  };
}
