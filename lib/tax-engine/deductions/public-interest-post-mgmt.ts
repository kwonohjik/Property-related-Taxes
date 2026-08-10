/**
 * 공익법인등 출연재산 사후관리 추징 — 「상속세 및 증여세법」 §48②1호 (3년 추징)
 *
 * ## 법령 (KoreanLaw 실측 2026-08-10 · 법 MST 276123 · 령 MST 283637)
 *
 * **법 §48②** 각 호 외의 부분 본문:
 * > "세무서장등은 … 재산을 출연받은 공익법인등이 다음 제1호부터 제4호까지, 제6호 및 제8호의
 * >  어느 하나에 해당하는 경우에는 그 사유가 발생한 날에 **대통령령으로 정하는 가액**을
 * >  공익법인등이 **증여받은 것으로 보아 즉시 증여세를 부과**하고 …"
 *
 * **법 §48②1호**:
 * > "출연받은 재산[…]을 직접 공익목적사업 등 […]의 용도 **외에 사용**하거나 **출연받은 날부터
 * >  3년 이내**에 직접 공익목적사업 등에 **사용하지 아니**하거나 **3년 이후** 직접 공익목적사업
 * >  등에 **계속하여 사용하지 아니**하는 경우. **다만**, 직접 공익목적사업 등에 사용하는 데에
 * >  장기간이 걸리는 등 대통령령으로 정하는 부득이한 사유가 있는 경우로서 제5항에 따른 보고서를
 * >  제출할 때 납세지 관할세무서장에게 그 사실을 **보고**하고, 그 사유가 없어진 날부터 **1년 이내**에
 * >  해당 재산을 직접 공익목적사업 등에 **사용하는 경우는 제외**한다."
 *
 * **상증령 §40①1호** — 「대통령령으로 정하는 가액」:
 * > "가. 직접 공익목적사업등외에 사용한 경우에는 **그 사용한 재산의 가액**
 * >  나. 3년이내에 직접 공익목적사업등에 사용하지 아니하거나 미달하게 사용한 경우에는
 * >     **그 사용하지 아니하거나 미달하게 사용한 재산의 가액**
 * >  다. 3년 이후 직접 공익목적사업 등에 계속하여 사용하지 않는 경우에는
 * >     **그 사용하지 않는 재산의 가액**"
 *
 * ## ⚠️ 영농·가업 사후관리와 **구조가 다르다** — marginal 재계산이 아니다
 *
 * 영농(§18의3④)·가업(§18의2⑤)은 「과세가액에 **산입**하여 상속세를 부과」라 **누진 marginal
 * 차액**을 구해야 한다. §48②는 「그 가액을 **증여받은 것으로 보아** 즉시 증여세를 부과」이므로
 * 추징 대상 가액 **자체가 증여재산가액**이고 §56 누진세율을 **그대로** 적용한다.
 *
 * ## ⚠️ 이자상당액이 **없다**
 *
 * 영농 §18의3⑧·가업 §18의2⑤은 이자상당액 가산을 **법에 명시**한다. §48②과 상증령 §40에는
 * 그런 규정이 **없다**. 근거 없이 가산하지 않는다
 * ([[feedback_no_unfavorable_application_without_legal_basis]]).
 *
 * ## 범위
 *
 * §48②**1호**(출연재산 3년)와 §48②**4호**(매각대금 3년 — 상증령 §38④·§40①3호)를 다룬다.
 * 5·7호는 **가산세**(§78⑨)라 축이 다르다 — 이 파일에서 계산하지 않는다.
 */

import { addYears, format, isAfter, parseISO } from "date-fns";

import { calcInheritanceGiftTax, findApplicableBracket } from "../inheritance-gift-common";
import { EXEMPTION } from "../legal-codes";
import { applyRateFraction, safeMultiplyThenDivide } from "../tax-utils";
import type {
  PublicInterestOperatingIncomeInput,
  PublicInterestOperatingIncomeResult,
  PublicInterestPostMgmtInput,
  PublicInterestPostMgmtResult,
  PublicInterestSaleProceedsInput,
  PublicInterestSaleProceedsResult,
  PublicInterestViolation,
  SaleProceedsViolation,
} from "../types/public-interest-post-mgmt.types";

/**
 * 상증법 §55② — 「과세표준이 50만원 미만이면 증여세를 부과하지 아니한다」.
 *
 * 본류 증여세(`gift-tax.ts`)가 이미 쓰는 규약과 같은 값이다. §48②는 「증여받은 것으로 보아
 * 증여세를 부과」하므로 이 과세최저한도 그대로 걸린다 — 특히 §48②4호 나목의 과세가액은
 * 「90% 기준 대비 미달분」이라 수십만원이 실제로 나온다.
 */
const GIFT_TAX_BASE_MIN = 500_000;

/** §55② 적용 — 과세표준과 산출세액을 함께 확정한다. */
function applyMinimumTaxBase(clawbackBase: number): {
  taxBase: number;
  giftTax: number;
  rate: number;
  deduction: number;
  belowMinimumTaxBase: boolean;
} {
  const below = clawbackBase > 0 && clawbackBase < GIFT_TAX_BASE_MIN;
  const taxBase = below ? 0 : clawbackBase;
  const { rate, deduction } = findApplicableBracket(taxBase);
  return {
    taxBase,
    giftTax: calcInheritanceGiftTax(taxBase),
    rate,
    deduction,
    belowMinimumTaxBase: below,
  };
}

/** 상증령 §40①1호 각 목 라벨 */
const VIOLATION_LABELS: Record<PublicInterestViolation, string> = {
  used_outside_purpose: "직접 공익목적사업등 외 사용 (상증령 §40①1호 가목)",
  unused_within_3y: "3년 이내 미사용·미달사용 (상증령 §40①1호 나목)",
  discontinued_after_3y: "3년 이후 계속 미사용 (상증령 §40①1호 다목)",
};

/**
 * §48②1호 **단서** 판정 — 부득이한 사유로 추징에서 제외되는가.
 *
 * 세 요건을 **모두** 갖춰야 한다:
 *   1. 보고했을 것(§48⑤ 보고서 제출 시 관할세무서장에게 그 사실을 보고)
 *   2. 실제로 직접 공익목적사업등에 **사용**했을 것
 *   3. 그 사용이 **사유가 없어진 날부터 1년 이내**일 것
 *
 * ❌ 하나라도 빠지면 단서가 성립하지 않는다 — 「보고만 했다」·「늦게라도 썼다」는 제외 사유가
 *    아니다(자동 fallback 금지).
 */
function evaluateJustifiedException(
  input: PublicInterestPostMgmtInput,
): { excluded: boolean; reason?: string } {
  const j = input.justifiedException;
  if (!j) return { excluded: false };
  if (!j.reported) {
    return { excluded: false };
  }
  if (!j.usedDate) {
    return { excluded: false };
  }
  const deadline = addYears(parseISO(j.reasonEndDate), 1);
  const used = parseISO(j.usedDate);
  if (isAfter(used, deadline)) {
    return { excluded: false };
  }
  return {
    excluded: true,
    reason:
      `부득이한 사유 보고 + 사유가 없어진 날(${j.reasonEndDate})부터 1년 이내(${format(
        deadline,
        "yyyy-MM-dd",
      )})에 직접 공익목적사업등에 사용(${j.usedDate}) — 상증법 §48②1호 단서로 추징 제외`,
  };
}

export function calcPublicInterestPostMgmt(
  input: PublicInterestPostMgmtInput,
): PublicInterestPostMgmtResult {
  const donationDate = parseISO(input.donationDate);
  const threeYear = addYears(donationDate, 3);
  // ⚠️ `toISOString()` 금지 — UTC 변환이라 KST 자정이 **전날로 롤백**된다(2021-03-01+3y가
  //    2024-02-29로 찍혔다). date-fns `format()`은 로컬 기준이라 날짜가 보존된다.
  const threeYearDeadline = format(threeYear, "yyyy-MM-dd");
  const isAfterThreeYears = isAfter(parseISO(input.assessmentDate), threeYear);

  const steps: PublicInterestPostMgmtResult["steps"] = [];
  const warnings: string[] = [];

  const { excluded, reason } = evaluateJustifiedException(input);

  // 추징 대상 가액 — 상증령 §40①1호 각 목. 출연가액이 상한이다.
  const rawBase = Math.max(0, Math.floor(input.violatedValue));
  const cappedBase = Math.min(rawBase, Math.max(0, Math.floor(input.donatedValue)));
  if (rawBase > cappedBase) {
    warnings.push(
      `추징 대상 가액이 출연받은 재산가액(${input.donatedValue.toLocaleString()}원)을 초과해 출연가액으로 제한했습니다.`,
    );
  }

  const clawbackBase = excluded ? 0 : cappedBase;

  steps.push({
    label: "위반 유형",
    formula: VIOLATION_LABELS[input.violation],
    amount: 0,
    legalBasis: "상증법 §48②1호",
  });
  steps.push({
    label: "3년 경과 판정",
    formula:
      `출연일 ${input.donationDate} + 3년 = ${threeYearDeadline} / 판정일 ${input.assessmentDate}` +
      ` → ${isAfterThreeYears ? "3년 경과" : "3년 이내"}`,
    amount: 0,
    legalBasis: "상증법 §48②1호",
  });

  if (excluded) {
    steps.push({
      label: "단서 적용 — 추징 제외",
      formula: reason ?? "",
      amount: 0,
      legalBasis: "상증법 §48②1호 단서",
    });
    return {
      isClawback: false,
      belowMinimumTaxBase: false,
      exemptReason: reason,
      threeYearDeadline,
      isAfterThreeYears,
      clawbackBase: 0,
      taxBase: 0,
      giftTax: 0,
      appliedRate: 0,
      progressiveDeduction: 0,
      steps,
      warnings,
    };
  }

  steps.push({
    label: "추징 대상 가액",
    formula: `${VIOLATION_LABELS[input.violation]} — ${clawbackBase.toLocaleString()}원`,
    amount: clawbackBase,
    legalBasis: "상증령 §40①1호",
  });

  /**
   * 과세표준 = 추징 대상 가액.
   *
   * §53 증여재산공제는 「거주자가 배우자·직계존비속·기타친족으로부터 증여받은 경우」의
   * 인적공제라 **공익법인등에는 적용되지 않는다**. 그래서 과세가액이 곧 과세표준이다.
   * 다만 §55② 과세최저한(50만원)은 증여세 일반 규정이라 그대로 걸린다.
   */
  const { taxBase, giftTax, rate, deduction, belowMinimumTaxBase } =
    applyMinimumTaxBase(clawbackBase);
  if (belowMinimumTaxBase) {
    warnings.push(
      `추징 대상 가액이 ${GIFT_TAX_BASE_MIN.toLocaleString()}원 미만이라 증여세를 부과하지 않습니다(상증법 §55②).`,
    );
  }

  steps.push({
    label: "추징 증여세",
    formula:
      `과세표준 ${taxBase.toLocaleString()} × ${(rate * 100).toFixed(0)}%` +
      (deduction > 0 ? ` − 누진공제 ${deduction.toLocaleString()}` : ""),
    amount: giftTax,
    legalBasis: "상증법 §56",
  });

  warnings.push(
    "「그 사유가 발생한 날에 증여받은 것으로 보아 **즉시** 증여세를 부과」합니다(상증법 §48② 본문) — 신고·납부 기한과 가산세(§78)는 별도로 확인하세요.",
  );
  warnings.push(
    "영농(§18의3)·가업(§18의2) 사후관리와 달리 §48②에는 **이자상당액 가산 규정이 없습니다**. 이 계산에도 가산하지 않았습니다.",
  );
  if (input.violation === "unused_within_3y" && isAfterThreeYears === false) {
    warnings.push(
      "판정일이 아직 3년 이내입니다 — 나목(3년 이내 미사용)은 3년이 지나야 확정됩니다. 기한 내 사용하면 추징 대상이 아닙니다.",
    );
  }

  return {
    isClawback: true,
    belowMinimumTaxBase,
    threeYearDeadline,
    isAfterThreeYears,
    clawbackBase,
    taxBase,
    giftTax,
    appliedRate: rate,
    progressiveDeduction: deduction,
    steps,
    warnings,
  };
}

// ============================================================
// §48②4호 — 출연재산 **매각대금** 3년 사후관리
// ============================================================

/**
 * 상증령 §38④ — 사용기준금액 비율. 「매각대금의 100분의 90」.
 *
 * ⚠️ §38⑦(1년 30%·2년 60%)와 혼동 금지 — 그쪽은 **§48②5호 가산세**(§78⑨)의 기준이고
 *    이 엔진이 계산하는 §48②4호 증여세와 별개 축이다.
 */
const SALE_PROCEEDS_USE_RATIO = { numer: 90, denom: 100 } as const;

/** 상증령 §40①3호 각 목 라벨 */
const SALE_PROCEEDS_LABELS: Record<SaleProceedsViolation, string> = {
  used_outside_purpose: "매각대금을 직접 공익목적사업 외에 사용 (상증령 §40①3호 가목)",
  under_use_threshold: "3년 이내 사용기준금액(90%) 미달 사용 (상증령 §40①3호 나목)",
};

/**
 * 공익법인등 출연재산 **매각대금** 사후관리 추징 — 상증법 §48②4호.
 *
 * ## 법령 (2026-08-10 실측)
 *
 * **법 §48②4호**:
 * > "출연받은 재산을 매각하고 그 매각대금을 매각한 날부터 3년이 지난 날까지 **대통령령으로
 * >  정하는 바에 따라 사용하지 아니한** 경우"
 *
 * **상증령 §38④** — 위 「대통령령으로 정하는 바에 따라 사용하지 아니한 경우」:
 * > "**매각한 날이 속하는 과세기간 또는 사업연도의 종료일부터 3년 이내**에 매각대금 중 직접
 * >  공익목적사업에 사용한 실적(매각대금으로 직접 공익목적사업용, 수익용 또는 수익사업용
 * >  재산을 취득한 경우를 포함하며, […공시대상기업집단 동일인관련자…는 제외한다…)이
 * >  **매각대금의 100분의 90에 미달**하는 경우"
 *
 * **상증령 §40①3호** — 「대통령령으로 정하는 가액」:
 * > "가. 공익목적사업외에 사용한 분 : 제38조제4항의 규정에 의한 **사용기준금액 ×
 * >     (공익목적사업외에 사용한 금액 ÷ 제38조제4항의 규정에 의한 매각대금)**
 * >  나. 제38조제4항의 규정에 의한 사용기준금액에 미달하게 사용한 분 : 당해 **미달사용금액**"
 *
 * ## ⚠️ 기산점이 「매각한 날」이 아니다
 *
 * 법 본문만 읽으면 「매각한 날부터 3년」이지만, 그 문언이 곧바로 「**대통령령으로 정하는 바에
 * 따라**」로 위임하고 시행령이 기산점을 **과세기간·사업연도 종료일**로 정했다. 12월 결산
 * 법인이 1월에 매각하면 실질 기한이 약 4년이 된다. §48②1호(출연받은 **날** 기산)를 복사하면
 * 조용히 틀린다.
 *
 * ## ⚠️ 4호에는 §48②1호 **단서가 없다**
 *
 * 부득이한 사유 + 보고 + 1년 이내 사용으로 제외되는 단서는 **1호에만** 붙어 있고, 상증령
 * §38③도 「법 제48조제2항**제1호** 단서」를 정의한다. 근거 없이 4호로 넓히지 않는다
 * ([[feedback_no_unfavorable_application_without_legal_basis]]의 반대 방향 — 유리한 적용도
 * 근거가 있어야 한다).
 *
 * ## 이 엔진이 계산하지 않는 것
 *
 * · **§38⑨** — 이사·사용인의 불법행위나 분실·도난으로 감소한 금액은 매각대금에서 뺀다.
 *   입증책임이 공익법인등에 있다(조심 2020중1194). 입력 단계에서 차감해 넣어야 한다.
 * · **§48②5호** — 1년 30%·2년 60% 미달은 §78⑨ **가산세**다.
 */
export function calcPublicInterestSaleProceeds(
  input: PublicInterestSaleProceedsInput,
): PublicInterestSaleProceedsResult {
  const steps: PublicInterestSaleProceedsResult["steps"] = [];
  const warnings: string[] = [];

  // ── 3년 기한 — 상증령 §38④ 「과세기간 또는 사업연도의 종료일부터」 ──────────────
  // ⚠️ `toISOString()` 금지 — UTC 변환이 KST 자정을 전날로 롤백시킨다(§48②1호에서 실측).
  const fiscalYearEnd = parseISO(input.fiscalYearEndDate);
  const threeYear = addYears(fiscalYearEnd, 3);
  const threeYearDeadline = format(threeYear, "yyyy-MM-dd");
  const isAfterThreeYears = isAfter(parseISO(input.assessmentDate), threeYear);

  const saleProceeds = Math.max(0, Math.floor(input.saleProceeds));
  const useThreshold = applyRateFraction(
    saleProceeds,
    SALE_PROCEEDS_USE_RATIO.numer,
    SALE_PROCEEDS_USE_RATIO.denom,
  );

  /** 사용실적·외부사용액 모두 「매각대금 중」이므로 매각대금이 상한이다. */
  const capToProceeds = (raw: number | undefined, label: string): number => {
    const v = Math.max(0, Math.floor(raw ?? 0));
    if (v > saleProceeds) {
      warnings.push(
        `${label}이 매각대금(${saleProceeds.toLocaleString()}원)을 초과해 매각대금으로 제한했습니다.`,
      );
      return saleProceeds;
    }
    return v;
  };

  const cappedDirectUse = capToProceeds(input.directUseAmount, "직접 공익목적사업 사용실적");
  const cappedOutsideUse = capToProceeds(input.outsideUseAmount, "공익목적사업 외 사용금액");

  // ── 상증령 §40①3호 각 목 ───────────────────────────────────────────────────
  // 「각목의 **구분**에 따라」이므로 선택한 목만 과세가액이 된다(가목+나목 합산 아님).
  const shortfall =
    input.violation === "under_use_threshold" ? Math.max(0, useThreshold - cappedDirectUse) : 0;
  const outsideUseTaxable =
    input.violation === "used_outside_purpose"
      ? safeMultiplyThenDivide(useThreshold, cappedOutsideUse, saleProceeds)
      : 0;
  const clawbackBase =
    input.violation === "used_outside_purpose" ? outsideUseTaxable : shortfall;

  steps.push({
    label: "위반 유형",
    formula: SALE_PROCEEDS_LABELS[input.violation],
    amount: 0,
    legalBasis: "상증법 §48②4호",
  });
  steps.push({
    label: "3년 경과 판정",
    formula:
      `매각일 ${input.saleDate} → 과세기간 종료일 ${input.fiscalYearEndDate} + 3년 =` +
      ` ${threeYearDeadline} / 판정일 ${input.assessmentDate}` +
      ` → ${isAfterThreeYears ? "3년 경과" : "3년 이내"}`,
    amount: 0,
    legalBasis: "상증령 §38④",
  });
  steps.push({
    label: "사용기준금액",
    formula: `매각대금 ${saleProceeds.toLocaleString()} × 90%`,
    amount: useThreshold,
    legalBasis: "상증령 §38④",
  });

  if (input.violation === "used_outside_purpose") {
    steps.push({
      label: "과세가액 (가목 안분)",
      formula:
        `사용기준금액 ${useThreshold.toLocaleString()} ×` +
        ` (공익목적사업 외 사용액 ${cappedOutsideUse.toLocaleString()}` +
        ` ÷ 매각대금 ${saleProceeds.toLocaleString()})`,
      amount: outsideUseTaxable,
      legalBasis: "상증령 §40①3호 가목",
    });
  } else {
    steps.push({
      label: "과세가액 (나목 미달사용금액)",
      formula:
        `사용기준금액 ${useThreshold.toLocaleString()} −` +
        ` 사용실적 ${cappedDirectUse.toLocaleString()}`,
      amount: shortfall,
      legalBasis: "상증령 §40①3호 나목",
    });
  }

  // 공익법인등은 §53 증여재산공제 대상이 아니므로 과세가액 = 과세표준(§55② 최저한만 적용).
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
    "§48②4호에는 **§48②1호 단서(부득이한 사유 보고 + 1년 이내 사용)가 없습니다** — 시행령 §38③도 「제1호 단서」만 정의합니다.",
  );
  warnings.push(
    "3년 기산점은 **매각한 날이 아니라 매각한 날이 속하는 과세기간·사업연도의 종료일**입니다(상증령 §38④).",
  );
  warnings.push(
    "매각한 날이 속하는 과세기간 종료일부터 **1년 이내 30%·2년 이내 60%**에 미달하면 §48②**5호**에 따른 **가산세**(§78⑨)가 별도로 부과됩니다 — 이 계산에는 포함하지 않았습니다.",
  );
  warnings.push(
    "영농(§18의3)·가업(§18의2) 사후관리와 달리 §48②에는 **이자상당액 가산 규정이 없습니다**. 이 계산에도 가산하지 않았습니다.",
  );
  warnings.push(
    "이사·사용인의 불법행위나 분실·도난으로 감소한 금액은 매각대금에서 뺍니다(상증령 §38⑨). 입증책임은 공익법인등에 있으므로(조심 2020중1194) 해당분을 차감해 입력하세요.",
  );
  if (!isAfterThreeYears) {
    warnings.push(
      "판정일이 아직 3년 이내입니다 — 기한 내에 사용기준금액(90%)을 채우면 추징 대상이 아닙니다.",
    );
  }

  return {
    isClawback: clawbackBase > 0,
    belowMinimumTaxBase,
    threeYearDeadline,
    isAfterThreeYears,
    useThreshold,
    cappedDirectUse,
    cappedOutsideUse,
    shortfall,
    outsideUseTaxable,
    clawbackBase,
    taxBase,
    giftTax,
    appliedRate: rate,
    progressiveDeduction: deduction,
    steps,
    warnings,
  };
}

// ============================================================
// §48②3호 — 운용소득을 직접 공익목적사업 **외**에 사용
// ============================================================

/** 상증칙 §13② 단서 — 재무상태표상 가액이 제4장 평가액의 이 비율 **이하**면 제4장 평가액. */
const CHAPTER4_SUBSTITUTE_PERCENT = 70;

/**
 * 공익법인등이 출연재산 **운용소득을 직접 공익목적사업 외에 사용**한 경우 — 상증법 §48②3호.
 *
 * ## 법령 (2026-08-10 실측)
 *
 * **법 §48②3호**:
 * > "출연받은 재산을 수익용 또는 수익사업용으로 운용하는 경우로서 그 **운용소득을 직접
 * >  공익목적사업 외에 사용**한 경우"
 *
 * **상증령 §40①2의2호** — 「대통령령으로 정하는 가액」:
 * > "재정경제부령이 정하는 출연재산(직접공익목적사업에 사용한 분을 제외한다)의 **평가가액**
 * >  × (**공익목적사업외에 사용한 금액** ÷ 제38조제5항의 규정에 의한 **운용소득**)"
 *
 * **상증칙 §13②** — 위 「평가가액」:
 * > "…운용소득을 사용하여야 할 과세기간 또는 사업연도의 **직전** 과세기간 또는 사업연도 말
 * >  현재 수익용이나 수익사업용으로 운용하는 …출연받은 재산의 **재무상태표상 가액**을 말한다.
 * >  **다만**, 그 가액이 법 제4장에 따라 평가한 가액의 **100분의 70 이하**인 경우에는 법
 * >  제4장에 따라 평가한 가액으로 한다."
 *
 * **상증칙 §13③**:
 * > "제2항에 따른 출연재산 중 공익법인등이 **1년 이상 보유한 주식등**의 평가가액은 **제2항에도
 * >  불구하고 그 액면가액**으로 한다."
 *
 * **집행기준 48-40-1 ③** — 「직접공익목적사업에 사용하지 않은 출연재산의 평가가액 ×
 * (공익목적사업 외에 사용한 금액 ÷ 운용소득)」
 *
 * ## ⚠️ 과세가액은 운용소득이 아니라 **출연재산 평가가액**에 비율을 곱한다
 *
 * 분자·분모가 운용소득이라 「운용소득 × 비율」로 착각하기 쉽지만, 곱하는 대상은 출연재산
 * 평가가액이다. 소액을 목적 외로 쓰더라도 **운용소득의 몇 배**가 과세될 수 있다(OI-1).
 *
 * ## ⚠️ 5호(가산세)와 사유가 다르다
 *
 * 3호는 「공익목적사업 **외** 사용」(증여세), §48②5호 전단은 「사용기준금액(80%)에 **미달**
 * 사용」(§78⑨1호 가산세)이다. 후자는 `./public-interest-penalty`가 계산한다.
 */
export function calcPublicInterestOperatingIncome(
  input: PublicInterestOperatingIncomeInput,
): PublicInterestOperatingIncomeResult {
  const steps: PublicInterestOperatingIncomeResult["steps"] = [];
  const warnings: string[] = [];

  const operatingIncome = Math.max(0, Math.floor(input.operatingIncome));
  const bookValue = Math.max(0, Math.floor(input.bookValue));
  const longHeldStockParValue = Math.max(0, Math.floor(input.longHeldStockParValue ?? 0));

  // ── 상증칙 §13② 단서 — 재무상태표상 가액 ≤ 제4장 평가액 × 70% ────────────────
  const chapter4Value =
    input.chapter4Value === undefined ? undefined : Math.max(0, Math.floor(input.chapter4Value));
  const substituteFloor =
    chapter4Value === undefined
      ? undefined
      : applyRateFraction(chapter4Value, CHAPTER4_SUBSTITUTE_PERCENT, 100);
  const chapter4ClauseApplied =
    substituteFloor !== undefined && chapter4Value !== undefined && bookValue <= substituteFloor;
  const nonStockValue = chapter4ClauseApplied ? (chapter4Value as number) : bookValue;

  if (chapter4Value === undefined) {
    warnings.push(
      "법 **제4장 평가액**을 입력하지 않아 상증칙 §13② 단서(재무상태표상 가액이 제4장 평가액의 70% 이하이면 제4장 평가액으로 대체)를 적용하지 않았습니다 — 해당 여부를 확인하세요.",
    );
  }

  // 상증칙 §13③ — 1년 이상 보유 주식등은 §13②에도 불구하고 액면가액.
  const assetValue = nonStockValue + longHeldStockParValue;

  steps.push({
    label: "출연재산 평가가액",
    formula:
      (chapter4ClauseApplied
        ? `제4장 평가액 ${nonStockValue.toLocaleString()} (재무상태표상 가액 ${bookValue.toLocaleString()}이 70% 이하라 단서 적용)`
        : `재무상태표상 가액 ${nonStockValue.toLocaleString()}`) +
      (longHeldStockParValue > 0
        ? ` + 1년 이상 보유 주식등 액면가액 ${longHeldStockParValue.toLocaleString()}`
        : ""),
    amount: assetValue,
    legalBasis: "상증칙 §13②③",
  });

  // ── 상증령 §40①2의2호 산식 ─────────────────────────────────────────────────
  const rawOutsideUse = Math.max(0, Math.floor(input.outsideUseAmount));
  let cappedOutsideUse = rawOutsideUse;
  if (operatingIncome > 0 && rawOutsideUse > operatingIncome) {
    cappedOutsideUse = operatingIncome;
    warnings.push(
      `공익목적사업 외 사용금액이 운용소득(${operatingIncome.toLocaleString()}원)을 초과해 운용소득으로 제한했습니다 — 산식의 비율은 1을 넘을 수 없습니다.`,
    );
  }

  // 운용소득이 0 이하이면 분모가 없어 산식이 성립하지 않는다(0으로 나누지 않는다).
  const clawbackBase =
    operatingIncome > 0
      ? safeMultiplyThenDivide(assetValue, cappedOutsideUse, operatingIncome)
      : 0;

  if (operatingIncome <= 0) {
    warnings.push(
      "운용소득이 0 이하라 상증령 §40①2의2호 산식(분모 = 운용소득)이 성립하지 않습니다 — 목적 외 사용할 운용소득 자체가 없습니다.",
    );
  }

  steps.push({
    label: "과세가액",
    formula:
      `평가가액 ${assetValue.toLocaleString()} ×` +
      ` (공익목적사업 외 사용액 ${cappedOutsideUse.toLocaleString()}` +
      ` ÷ 운용소득 ${operatingIncome.toLocaleString()})`,
    amount: clawbackBase,
    legalBasis: "상증령 §40①2의2호",
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
    "🔑 과세가액은 **운용소득이 아니라 출연재산 평가가액**에 비율을 곱합니다(상증령 §40①2의2호) — 목적 외 사용액이 적어도 운용소득을 넘는 금액이 과세될 수 있습니다.",
  );
  warnings.push(
    "운용소득을 **사용기준금액(80%)에 미달**하게 사용한 것은 §48②**5호**로 §78⑨ **가산세** 대상이며 이 계산과 별개입니다 — 「공익법인 사후관리 가산세 계산기」를 이용하세요.",
  );
  warnings.push(
    "영농(§18의3)·가업(§18의2) 사후관리와 달리 §48②에는 **이자상당액 가산 규정이 없습니다**. 이 계산에도 가산하지 않았습니다.",
  );

  return {
    isClawback: clawbackBase > 0,
    belowMinimumTaxBase,
    chapter4ClauseApplied,
    nonStockValue,
    longHeldStockParValue,
    assetValue,
    cappedOutsideUse,
    clawbackBase,
    taxBase,
    giftTax,
    appliedRate: rate,
    progressiveDeduction: deduction,
    steps,
    warnings,
  };
}

/** 표시용 — 법령 근거 배지 */
export const PUBLIC_INTEREST_POST_MGMT_BASIS = EXEMPTION.PUBLIC_INTEREST;
