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
 * §48②1호(출연재산 3년)만 다룬다. 같은 항 **4호**(매각대금 3년 — 상증령 §40①3호)는
 * 사용기준금액(§38④) 입력이 따로 필요해 분리했다. 5·7호는 **가산세**(§78⑨)라 축이 다르다.
 */

import { addYears, format, isAfter, parseISO } from "date-fns";

import { calcInheritanceGiftTax, findApplicableBracket } from "../inheritance-gift-common";
import { EXEMPTION } from "../legal-codes";
import type {
  PublicInterestPostMgmtInput,
  PublicInterestPostMgmtResult,
  PublicInterestViolation,
} from "../types/public-interest-post-mgmt.types";

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
   */
  const taxBase = clawbackBase;
  const giftTax = calcInheritanceGiftTax(taxBase);
  const { rate, deduction } = findApplicableBracket(taxBase);

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

/** 표시용 — 법령 근거 배지 */
export const PUBLIC_INTEREST_POST_MGMT_BASIS = EXEMPTION.PUBLIC_INTEREST;
