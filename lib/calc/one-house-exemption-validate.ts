/**
 * ⑧ 판정 메뉴 단계별 검증 (P4-2b-1)
 *
 * 계획서 UI 설계 §10 ⑧. 반환 형태는 `stock-transfer-tax-validate.ts`와 같다 —
 * 배열이고, 화면은 첫 `severity: "error"` 하나를 배너에 띄우며 `"warning"`은 진행을 막지 않는다.
 *
 * ## 🔑 ④(API 변환)와 **같은 fallback**을 쓴다 (3중 패턴)
 *
 * 어댑터가 `parseInt(x || "0")`으로 후퇴하는 필드를 여기서 「필수」로 막으면
 * 「UI는 통과인데 validate가 차단」 또는 그 반대의 모순이 생긴다
 * (`feedback_validation_sync_8th_point` · `feedback_mirror_pattern`).
 * ⇒ **어댑터가 전송을 포기하는 조건**(토글 OFF · 계약일 미입력)과 여기 차단 조건을 일치시킨다.
 *
 * ## 🔑 요건 충족 여부는 **판정하지 않는다**
 *
 * 60세·10년·18개월 같은 법령 요건은 **엔진이 판정한다**. validate가 그것을 막으면
 * 「요건 미달이라 계산조차 못 하는」 화면이 되어, 사용자가 왜 비과세가 아닌지 알 수 없다.
 * 여기서 막는 것은 **판정이 불가능한 입력**(필수값 부재·모순)뿐이다.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import {
  deriveJudgmentHouseCount,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";

export interface OneHouseJudgmentValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

type Errors = OneHouseJudgmentValidationError[];

const err = (field: string, message: string): OneHouseJudgmentValidationError => ({
  field,
  message,
  severity: "error",
});
const warn = (field: string, message: string): OneHouseJudgmentValidationError => ({
  field,
  message,
  severity: "warning",
});

/** ① 세대 — 1세대 해당 선언(Q-3′ 자기선언) + 합가일 정합성. */
export function validateStep1(form: OneHouseJudgmentFormData): Errors {
  const errors: Errors = [];

  /**
   * 🔑 「1세대 비해당」 선언은 **차단하지 않는다**. 그 경우에도 판정은 나온다 —
   *    「비과세 판정 대상이 아님」이 정당한 답이고 route anchor R-6이 그것을 고정한다.
   *    여기서 막으면 사용자가 자기 상황을 사실대로 적을 수 없다.
   */
  if (!form.isOneHousehold) {
    errors.push(
      warn("isOneHousehold", "1세대에 해당하지 않으면 1세대1주택 비과세 판정 대상이 아닙니다."),
    );
  }

  if (form.marriageDate && form.parentalCareMergeDate) {
    errors.push(
      warn(
        "marriageDate",
        "혼인합가일과 동거봉양 합가일이 모두 입력됐습니다. §155④·⑤는 각각 별개 특례이므로 해당하는 쪽만 남기세요.",
      ),
    );
  }
  return errors;
}

/**
 * ② 보유 주택·권리 — 명부 자체의 정합성 + §155의2·§155의3 필수값.
 *
 * 🔑 명부가 **비어 있어도 막지 않는다** — 1주택 세대(명부 0행 = 양도 대상 1채)가
 *    이 화면의 가장 흔한 입력이다.
 */
export function validateStep2(form: OneHouseJudgmentFormData): Errors {
  const errors: Errors = [];

  form.houses?.forEach((h, i) => {
    if (!h.acquisitionDate) {
      errors.push(err(`houses.${i}.acquisitionDate`, `보유 주택 ${i + 1}: 취득일을 입력하세요.`));
    }
  });

  form.presaleRights?.forEach((r, i) => {
    if (!r.acquisitionDate) {
      errors.push(
        err(`presaleRights.${i}.acquisitionDate`, `분양권·입주권 ${i + 1}: 취득일을 입력하세요.`),
      );
    }
  });

  // §155의2 — 어댑터가 전송을 포기하는 조건과 **같은 자리**에서 막는다.
  if (form.longTermMortgageSpecial) {
    if (!form.longTermMortgageContractDate) {
      errors.push(err("longTermMortgageContractDate", "장기저당담보주택: 계약체결일을 입력하세요."));
    }
    if (!form.longTermMortgageBorrowerAge) {
      errors.push(
        err("longTermMortgageBorrowerAge", "장기저당담보주택: 계약체결일 현재 가입자 나이를 입력하세요."),
      );
    }
    if (!form.longTermMortgageContractYears) {
      errors.push(err("longTermMortgageContractYears", "장기저당담보주택: 계약기간(년)을 입력하세요."));
    }
  }

  // §155의3 — 임대기간 0개월은 「미입력」과 구별되지 않으므로 빈 값만 막는다.
  if (form.winWinRentalSpecial) {
    if (!form.winWinRentalContractDate) {
      errors.push(err("winWinRentalContractDate", "상생임대주택: 상생임대차계약 체결일을 입력하세요."));
    }
    if (!form.winWinRentalIncreaseRatePct) {
      errors.push(err("winWinRentalIncreaseRatePct", "상생임대주택: 임대료 증가율(%)을 입력하세요."));
    }
    if (!form.winWinRentalPriorLeaseMonths) {
      errors.push(err("winWinRentalPriorLeaseMonths", "상생임대주택: 직전임대차 임대기간(개월)을 입력하세요."));
    }
    if (!form.winWinRentalLeaseMonths) {
      errors.push(err("winWinRentalLeaseMonths", "상생임대주택: 상생임대차 임대기간(개월)을 입력하세요."));
    }
  }

  return errors;
}

/** ③ 양도 예정 — 판정에 **실제로 필요한** 값만 막는다. */
export function validateStep3(form: OneHouseJudgmentFormData): Errors {
  const errors: Errors = [];
  const primary = form.assets[0];

  if (!form.transferDate) errors.push(err("transferDate", "양도 예정일을 입력하세요."));
  if (!primary?.acquisitionDate) {
    errors.push(err("acquisitionDate", "양도 대상 주택의 취득일을 입력하세요."));
  }

  /**
   * 🔴 예상 양도가액은 **양수여야 한다** — `propertySchema`가 `positive()`를 요구하고,
   *    고가주택(12억 초과) 판정에 실제로 쓰인다. 막지 않으면 route가 400으로 돌려보내고
   *    사용자는 필드명만 적힌 오류를 본다.
   */
  if (parseAmount(form.contractTotalPrice) <= 0) {
    errors.push(err("contractTotalPrice", "예상 양도가액을 입력하세요."));
  }

  if (form.transferDate && primary?.acquisitionDate && form.transferDate < primary.acquisitionDate) {
    errors.push(err("transferDate", "양도 예정일이 취득일보다 빠릅니다."));
  }

  return errors;
}

/**
 * 사이드바·단계 배지용 — 단계별 error 개수.
 *
 * 단계 인덱스는 화면과 같다: 0=①세대 · 1=②보유 · 2=③양도예정 · 3=④결과(검증 없음).
 */
export function getStepErrorCount(form: OneHouseJudgmentFormData, step: number): number {
  const errors =
    step === 0
      ? validateStep1(form)
      : step === 1
        ? validateStep2(form)
        : step === 2
          ? validateStep3(form)
          : [];
  return errors.filter((e) => e.severity === "error").length;
}

/** 결과 단계 진입 전 전 단계 일괄 검증. */
export function validateAllSteps(form: OneHouseJudgmentFormData): Errors {
  return [...validateStep1(form), ...validateStep2(form), ...validateStep3(form)];
}

/**
 * ⑥ 사이드바 요약 — **순수 함수**(호출부가 `useMemo`로 감싼다).
 *
 * 🔑 세액이 없는 화면이라 금액 합계가 없다. 요약은 「지금까지 입력으로 무엇이 정해졌나」다.
 * 🔑 주택 수는 **명부 파생 단일 소스**를 쓴다 — 여기서 다시 세면 G-1이 화면 안에서 되살아난다
 *    (`feedback_aggregate_display_rederives_engine_value`).
 */
export function computeOneHouseJudgmentSummary(
  form: OneHouseJudgmentFormData,
): Array<{ label: string; value: string | number | null }> {
  const items: Array<{ label: string; value: string | number | null }> = [];

  items.push({ label: "1세대 해당", value: form.isOneHousehold ? "예" : "아니오" });
  items.push({ label: "세대 보유 주택 수", value: `${deriveJudgmentHouseCount(form)}채` });

  if (form.presaleRights?.length) {
    items.push({ label: "분양권·입주권", value: `${form.presaleRights.length}건` });
  }
  if (form.transferDate) items.push({ label: "양도 예정일", value: form.transferDate });

  const price = parseAmount(form.contractTotalPrice);
  if (price > 0) items.push({ label: "예상 양도가액", value: price });

  // 적용을 **선언한** 특례 — 성립 여부는 엔진 판정이므로 여기서 말하지 않는다.
  const declared = [
    form.temporaryTwoHouseSpecial && "일시적 2주택",
    form.culturalHeritageHouseSpecial && "문화유산주택",
    form.ruralHouseSpecial && "농어촌주택",
    form.unavoidableOutsideCapitalSpecial && "수도권 밖 부득이",
    form.replacementHouseSpecial && "대체주택",
    form.longTermMortgageSpecial && "장기저당담보주택",
    form.winWinRentalSpecial && "상생임대주택",
  ].filter(Boolean) as string[];
  if (declared.length > 0) {
    items.push({ label: "선언한 특례", value: declared.join(" · ") });
  }

  return items;
}
