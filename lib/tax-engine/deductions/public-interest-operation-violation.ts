/**
 * 공익법인등 **운용 의무 위반** 증여세 추징 — 「상속세 및 증여세법」 §48②8호
 *
 * ## 법령 (2026-08-10 실측 · 법 MST 276123 · 령 MST 283637)
 *
 * **법 §48②8호**:
 * > "그 밖에 출연받은 재산 및 직접 공익목적사업을 **대통령령으로 정하는 바에 따라 운용하지
 * >  아니하는 경우**"
 *
 * **상증령 §38⑧** — 위 「대통령령으로 정하는 바」:
 * > "1. 공익법인등이 **사업을 종료한 때의 잔여재산**을 국가ㆍ지방자치단체 또는 해당 공익법인등과
 * >     동일하거나 주무부장관이 유사한 것으로 인정하는 공익법인등에 **귀속시키지 아니한 때**
 * >  2. 직접 공익목적사업에 사용하는 것이 사회적 지위ㆍ직업ㆍ근무처 및 출생지 등에 의하여
 * >     **일부에게만 혜택을 제공**하는 것인 때. **다만**, 주무부장관이 재정경제부장관과 **협의**
 * >     (…권한이 위임된 경우에는 해당 권한을 위임받은 기관과 해당 공익법인등의 관할세무서장의
 * >     협의를 말한다)하여 따로 **수혜자의 범위를 정하여** 이를 다음 각 목의 어느 하나에 해당하는
 * >     **조건으로 한 경우를 제외**한다.
 * >       가. 해당 공익법인등의 **설립허가의 조건**으로 붙인 경우
 * >       나. 정관상의 목적사업을 효율적으로 수행하기 위하여 또는 정관상의 목적사업에 새로운
 * >          사업을 추가하기 위하여 재산을 추가출연함에 따라 **정관의 변경허가**를 받는 경우로서
 * >          그 **변경허가조건**으로 붙인 경우"
 *
 * **상증령 §40①4호·5호** — 「대통령령으로 정하는 가액」:
 * > "4. 제38조제8항**제1호**의 규정에 해당하게 되는 경우에는 국가ㆍ지방자치단체 또는 당해
 * >     공익법인등과 동일하거나 유사한 공익법인등에 **귀속시키지 아니한 재산가액**
 * >  5. 제38조제8항**제2호 본문**의 규정에 해당하게 되는 경우에는 **혜택을 받은 일부에게만
 * >     제공된 재산가액 또는 경제적 이익에 상당하는 가액**"
 *
 * **집행기준 48-40-1 ⑤⑥** — 위 두 가액과 일치.
 *
 * ## ⚠️ 단서는 **2호에만** 붙는다
 *
 * §40①5호가 「제38조제8항제2호 **본문**의 규정에 해당하게 되는 경우」라고 못박았고, 1호
 * (잔여재산)에는 단서 자체가 없다. 「부득이한 사유가 있으면 봐준다」로 넓히지 않는다
 * ([[feedback_no_unfavorable_application_without_legal_basis]]의 반대 방향 — 유리한 적용도
 * 근거가 있어야 한다).
 *
 * ## ⚠️ 단서는 3요건을 **모두** 갖춰야 한다
 *
 * ① 주무부장관이 재정경제부장관과 **협의** ② 따로 **수혜자의 범위를 정함** ③ 가목(설립허가)
 * 또는 나목(정관 변경허가) **조건으로 붙임**. §48②1호 단서와 같은 구조다(자동 fallback 금지).
 *
 * ## 이 엔진이 계산하지 않는 것
 *
 * **§38⑨** — 이사·사용인의 불법행위나 분실·도난으로 감소한 금액은 출연받은 재산등(잔여재산
 * 포함)의 가액에서 뺀다. 8호도 적용 대상이다(§38⑨ 본문이 「제1호, 제3호부터 제5호까지, 제7호
 * 및 **제8호**」를 지목). 입증책임이 공익법인등에 있으므로 입력 단계에서 차감해 넣어야 한다.
 */

import { applyMinimumTaxBase, GIFT_TAX_BASE_MIN } from "./public-interest-gift-tax-base";
import type {
  OperationViolationKind,
  PublicInterestOperationViolationInput,
  PublicInterestOperationViolationResult,
} from "../types/public-interest-post-mgmt.types";

/** 상증령 §38⑧ 각 호 라벨 — §40①4호·5호와 1:1. */
const VIOLATION_LABELS: Record<OperationViolationKind, string> = {
  residual_not_transferred:
    "사업 종료 시 잔여재산을 국가·지방자치단체·동일하거나 유사한 공익법인등에 귀속시키지 않음 (상증령 §38⑧1호)",
  benefit_to_limited_group:
    "직접 공익목적사업 사용이 사회적 지위·직업·근무처·출생지 등에 의해 일부에게만 혜택을 제공 (상증령 §38⑧2호)",
};

/** 과세가액 조문 근거 — 유형별. */
const VALUE_BASIS: Record<OperationViolationKind, string> = {
  residual_not_transferred: "상증령 §40①4호",
  benefit_to_limited_group: "상증령 §40①5호",
};

/**
 * 상증령 §38⑧2호 **단서** 판정.
 *
 * 세 요건을 **모두** 갖춰야 한다. ❌ 하나라도 빠지면 단서가 성립하지 않는다 — 「협의만 했다」·
 * 「범위만 정했다」는 제외 사유가 아니다.
 *
 * ⚠️ 1호(잔여재산)에는 단서가 없으므로 유형이 2호일 때만 판정한다.
 */
function evaluateBeneficiaryScopeException(
  input: PublicInterestOperationViolationInput,
): { excluded: boolean; reason?: string } {
  if (input.violation !== "benefit_to_limited_group") return { excluded: false };
  const s = input.approvedBeneficiaryScope;
  if (!s) return { excluded: false };
  if (!s.consulted || !s.scopeDefined) return { excluded: false };
  if (s.conditionType === "none") return { excluded: false };
  const mok = s.conditionType === "establishment_permit" ? "가목(설립허가의 조건)" : "나목(정관 변경허가조건)";
  return {
    excluded: true,
    reason: `주무부장관이 재정경제부장관과 협의하여 따로 수혜자의 범위를 정하고 이를 ${mok}으로 붙인 경우 — 상증령 §38⑧2호 단서로 추징 제외`,
  };
}

export function calcPublicInterestOperationViolation(
  input: PublicInterestOperationViolationInput,
): PublicInterestOperationViolationResult {
  const steps: PublicInterestOperationViolationResult["steps"] = [];
  const warnings: string[] = [];

  const { excluded, reason } = evaluateBeneficiaryScopeException(input);

  // 유형은 **택일**이다 — 선택하지 않은 유형의 금액은 과세가액에 섞이지 않는다.
  const rawValue =
    input.violation === "residual_not_transferred"
      ? (input.unTransferredResidualValue ?? 0)
      : (input.limitedBenefitValue ?? 0);
  const clawbackBase = excluded ? 0 : Math.max(0, Math.floor(rawValue));

  steps.push({
    label: "위반 유형",
    formula: VIOLATION_LABELS[input.violation],
    amount: 0,
    legalBasis: "상증법 §48②8호",
  });

  if (excluded) {
    steps.push({
      label: "단서 적용 — 추징 제외",
      formula: reason ?? "",
      amount: 0,
      legalBasis: "상증령 §38⑧2호 단서",
    });
    return {
      isClawback: false,
      exemptReason: reason,
      belowMinimumTaxBase: false,
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
    label: "과세가액",
    formula:
      input.violation === "residual_not_transferred"
        ? `귀속시키지 아니한 잔여재산가액 ${clawbackBase.toLocaleString()}`
        : `혜택을 받은 일부에게만 제공된 재산가액 또는 경제적 이익 상당액 ${clawbackBase.toLocaleString()}`,
    amount: clawbackBase,
    legalBasis: VALUE_BASIS[input.violation],
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

  if (input.violation === "residual_not_transferred") {
    warnings.push(
      "상증령 §38⑧**1호(잔여재산)에는 단서가 없습니다** — 부득이한 사유로 제외되는 규정은 §38⑧2호(일부 혜택)에만 있습니다.",
    );
  }
  warnings.push(
    "이사·사용인의 불법행위나 분실·도난으로 감소한 금액은 출연받은 재산등(잔여재산 포함)의 가액에서 뺍니다(**상증령 §38⑨**, 8호도 적용 대상). 입증책임은 공익법인등에 있으므로 해당분을 차감해 입력하세요.",
  );
  warnings.push(
    "영농(§18의3)·가업(§18의2) 사후관리와 달리 §48②에는 **이자상당액 가산 규정이 없습니다**. 이 계산에도 가산하지 않았습니다.",
  );

  return {
    isClawback: clawbackBase > 0,
    belowMinimumTaxBase,
    clawbackBase,
    taxBase,
    giftTax,
    appliedRate: rate,
    progressiveDeduction: deduction,
    steps,
    warnings,
  };
}
