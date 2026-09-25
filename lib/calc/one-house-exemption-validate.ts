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
import { validateRentalHousingException } from "./transfer-tax-validate-rental-exception";
// ⑤·⑧ 공용 노출 술어 — 계산기와 **같은 것**을 쓴다(두 벌이 되면 한쪽만 개정 반영된다).
import { rightThreeYearExceptionVisible } from "./right-three-year-exception-scope";
import { judgmentTemporaryTwoHouseVisible } from "./one-house-judgment-section-scope";
import {
  deriveJudgmentHouseCount,
  deriveJudgmentRightCount,
  judgmentSaleIsHousing,
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

  /**
   * §89② 3년 초과 예외 — 필수 입력 (P6-a에서 계산기 ⑧에서 **이관**).
   *
   * 🔴 입력이 옮겨오면 **그 검증도 따라와야 한다.** 계산기에만 두면 판정 메뉴에서 종류만 고르고
   *    필수값을 비운 채 계산기로 넘길 수 있고, 계산기에는 이제 채울 칸이 없다.
   *
   * 🔑 게이트는 ⑤와 **같은 술어**(`rightThreeYearExceptionVisible`)다. 그것이 이 검증을 만든
   *    이유다 — 종전 계산기에서 술어 없이 `Kind`만 보고 막았다가, 권리를 지워 섹션이 사라진
   *    상태에서 **채울 칸도 해제할 컨트롤도 없는 영구 차단**이 났다
   *    (`transfer-tax-validate.ts`의 같은 블록 주석에 그 전례가 기록돼 있다).
   */
  if (rightThreeYearExceptionVisible(form)) {
    if (form.rightThreeYearExceptionKind === "new_house" && !form.rightNewHouseCompletionDate) {
      errors.push(
        err(
          "rightNewHouseCompletionDate",
          "3년 초과 예외(시행령 §156의2④): 신축주택 완성일을 입력하세요.",
        ),
      );
    }
    if (form.rightThreeYearExceptionKind === "delay" && !form.rightDisposalDelayReason) {
      errors.push(
        err(
          "rightDisposalDelayReason",
          "3년 초과 예외(시행규칙 §75①): 3년이 되는 날 현재의 사유를 선택하세요.",
        ),
      );
    }
  }

  /**
   * 🔄 **§155의2 · §155의3 · §155⑳(error)의 필수값 검증은 `validateStep3`로 옮겼다**
   *    (2026-09-23 재배치 — 그 입력 3블록이 ② 양도 대상 화면으로 갔다).
   *    ⑤와 ⑧이 같은 화면에 있어야 한다는 3중 패턴 규약을 따른 것이다.
   */

  /**
   * §155⑳ **이중 입력 경고만** 여기에 남는다 — 조건이 `form.houses.length > 0`이라
   * **명부가 있는 이 화면**에서만 의미가 있다. ②(양도 대상)의 검증에 두면 사용자가 ②를
   * 지난 **뒤에** 명부를 채우므로 그 시점에 다시 평가되지 않는다.
   *
   * ✅ **표시 경로가 생겼다**(2026-09-25). 오케스트레이터가 현재 단계의 경고를 amber 카드로
   *    상시 렌더한다(`OneHouseJudgmentCalculator.tsx` · `ValidationWarnings.tsx`). 그러니
   *    위 배치 근거는 이제 **실제로 작동한다** — ③에 두었기에 명부를 채운 뒤 그 화면에서 뜬다.
   *    ②에 두었다면 사용자가 ②를 지난 **뒤에** 명부를 채우므로 영영 평가되지 않았다.
   *
   * 특례로 주택 수에서 빼는 임대주택을 명부에도 넣으면 주택 수가 부풀려져 판정이 과세로
   * 뒤집힌다. 차단하지는 않는다 — 둘이 정말 다른 주택일 수 있다.
   */
  const primary = form.assets[0];
  if (
    primary?.rentalHousingException?.applyException &&
    (primary.rentalHousingException.rentalUnits?.length ?? 0) > 0 &&
    (form.houses?.length ?? 0) > 0
  ) {
    errors.push(
      warn(
        "houses",
        "장기임대주택 특례로 선언한 임대주택은 위 「보유 주택」 명부에 다시 넣지 마세요. " +
          "특례가 주택 수에서 빼 주는 대상이라, 명부에도 있으면 주택 수가 이중 계상됩니다.",
      ),
    );
  }

  /**
   * ③ 일시적 2주택(§155①) · 대체주택(§156의2⑤) · §154① 단서 — 필수 입력
   * (P6-b에서 계산기 ⑧에서 **이관**).
   *
   * 🔴 입력이 옮겨오면 **그 검증도 따라와야 한다.** 계산기에는 이제 이 칸들이 없다
   *    (`TemporaryTwoHouseSection mode="calc"`는 §155⑧·합가만 그린다). 여기서 막지 않으면
   *    토글만 켜고 필수값을 비운 채 계산기로 넘어가고, ④는 두 날짜가 다 있어야
   *    `temporaryTwoHouse` 키를 만들므로 §155① 특례가 **조용히 누락**된다.
   *
   * 🔑 게이트는 ⑤와 **같은 술어**(`judgmentTemporaryTwoHouseVisible`)다. 계산기가 이
   *    짝을 잃었다가 「화면엔 칸이 없는데 ⑧이 요구」하는 영구 차단을 낸 전례가
   *    `transfer-tax-validate.ts`의 같은 자리 주석에 남아 있다.
   */
  if (judgmentTemporaryTwoHouseVisible(form)) {
    /**
     * 🔄 **§155① 두 날짜의 필수 검증을 없앴다** (2026-09-22).
     *
     * 종전에는 사용자가 토글을 켜고 신규 주택 취득일을 **직접 입력**했으므로 「켜 놓고 비운」
     * 상태를 ⑧이 막아야 했다. 이제 그 날짜는 **명부에서 도출**되고(`resolveTemporaryTwoHouse`)
     * 화면에 입력란 자체가 없다 ⇒ 막을 대상이 사라졌다.
     *
     * 🔴 **남겨 두면 영구 차단이 된다** — 「화면엔 칸이 없는데 ⑧이 요구」는 이 저장소가
     *    반복해 밟은 실패모드다(`transfer-tax-validate.ts` 같은 자리 주석 · D-6 4건).
     *
     * 도출이 성립하지 않으면(명부 0건·나중 취득 2채 이상) §155①이 **적용되지 않을 뿐**
     * 계산은 진행된다. 그 사실은 판정 결과의 불성립 사유(`collectUnmetExceptions`)가 알린다.
     * 양도 자산 취득일은 ③ 단계가 이미 필수로 막는다(`transferDate`·`acquisitionDate` 블록).
     */

    if (form.replacementHouseSpecial) {
      if (!form.replBusinessApprovalDate) {
        errors.push(err("replBusinessApprovalDate", "대체주택 특례: 사업시행계획인가일을 입력하세요."));
      }
      if (!form.replCompletionDate) {
        errors.push(err("replCompletionDate", "대체주택 특례: 신축주택 준공일을 입력하세요."));
      }
      if (!form.replResidenceMonths || parseInt(form.replResidenceMonths, 10) <= 0) {
        errors.push(
          err("replResidenceMonths", "대체주택 특례: 대체주택 거주개월수를 1개월 이상 입력하세요."),
        );
      }
      if (!form.replWillResideNewHouse) {
        errors.push(
          err(
            "replWillResideNewHouse",
            "대체주택 특례: 신축주택 1년 이상 거주 예정에 동의해야 비과세를 적용할 수 있습니다.",
          ),
        );
      }
    }
  }

  /**
   * 🔑 **§154① 단서는 옮길 것이 없다** — 실측으로 확인했다(P6-b).
   *
   * `effectiveProvisoReason`은 `temporary_two_house` 맥락에서 `TEMP_TWO_HOUSE_PROVISO_REASONS`
   * (§154①**1호·2호가목·3호** = `rental_5yr_residence`·`expropriation`·`unavoidable`) 밖의
   * 사유를 ""로 정규화한다. 그런데 계산기 ⑧의 단서 검증 2건이 요구하는 사유는
   * `overseas_migration`·`overseas_residence`(2호나·다목)와 `pre_designation_contract`(5호)로
   * **전부 그 화이트리스트 밖**이다 ⇒ 그 맥락에서는 애초에 한 건도 발동하지 않는다.
   *
   * ⇒ 여기에 짝을 만들면 **호출되지 않는 코드**가 된다. 검증이 사라진 것처럼 보이지 않도록
   *    이유를 남긴다(`temp-two-house-sections-moved.anchor.test.ts` TM-7이 고정한다).
   */

  return errors;
}

/**
 * ② 양도 대상 주택 — 판정에 **실제로 필요한** 값만 막는다.
 *
 * 🔑 **함수명 ≠ 화면 번호다**(`getStepErrorCount` 주석 참조). 2026-09-23 재배치로 이 검증이
 *    2번째 화면(`Step3.tsx`)을 맡는다. 이름을 그대로 둔 것은 저장소 관례이고, 유닛·anchor가
 *    `validateStep3`를 직접 부르기 때문이다.
 */
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

  /**
   * ── 거주요건 면제 특례 3종 — 입력이 ② 화면으로 오면서 ⑧도 따라왔다 (2026-09-23) ──
   *
   * 🔴 **입력이 옮겨오면 그 검증도 따라와야 한다.** 남겨 두면 「화면엔 칸이 없는데 ⑧이 요구」
   *    하는 영구 차단이 되고, 그것은 이 저장소가 반복해 밟은 실패모드다
   *    (`transfer-tax-validate.ts` 같은 자리 주석 · D-6 4건).
   */

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

  /**
   * §155⑳ 장기임대주택 특례 (P4-3a) — 계산기와 **같은 leaf**를 `facts` 모드로 부른다.
   *
   * 🔑 `mode: "facts"`가 §161① 안분 입력(직전거주주택 양도일·3시점 기준시가)을 요구하지
   *    않게 한다. 그 칸들은 ⑤가 판정 메뉴에서 감추므로, 여기서 막으면 화면에 없는 값 때문에
   *    판정이 영구 차단된다(3중 패턴 — ⑤/④/⑧).
   * 🔑 **이중 입력 경고는 여기 없다** — 명부를 보는 경고라 `validateStep2`에 남겼다.
   */
  if (primary) {
    const rentalError = validateRentalHousingException(
      primary.rentalHousingException,
      primary,
      0, // 판정 메뉴는 `form.assets[0]`만 판정한다 — 컴패니언 개념이 없다.
      "장기임대주택 특례",
      form.transferDate,
      "facts",
    );
    if (rentalError) errors.push(err("rentalHousingException", rentalError));
  }

  return errors;
}

/**
 * 화면 인덱스 → 그 단계의 검증 (**매핑 정본 1벌**).
 *
 * 🔑 **함수명 ≠ 화면 번호다.** 인덱스 매핑은 0=①세대 · 1=②양도 대상(`validateStep3`) ·
 *    2=③보유 주택(`validateStep2`) · 3=④결과(검증 없음). 순서를 뒤집은 이유는
 *    `OneHouseJudgmentCalculator.tsx`의 `STEPS` 주석에 있다(데이터 의존 방향).
 *
 * 종전에는 이 삼항이 **두 벌**이었다(여기 + 오케스트레이터 `validateCurrent`). 경고 배너가
 * 「현재 단계의 전체 배열」을 필요로 하면서 세 벌째가 될 참이라 한 벌로 합쳤다 —
 * 매핑이 갈리면 배지·차단·경고가 서로 다른 단계를 가리킨다.
 */
export function validateStepByIndex(form: OneHouseJudgmentFormData, step: number): Errors {
  switch (step) {
    case 0:
      return validateStep1(form);
    case 1:
      return validateStep3(form);
    case 2:
      return validateStep2(form);
    default:
      return [];
  }
}

/** 사이드바·단계 배지용 — 단계별 error 개수(경고는 세지 않는다 — 진행을 막지 않으므로). */
export function getStepErrorCount(form: OneHouseJudgmentFormData, step: number): number {
  return validateStepByIndex(form, step).filter((e) => e.severity === "error").length;
}

/**
 * ⑥ 사이드바 경고 표식용 — `getStepErrorCount`의 **심각도 짝**.
 *
 * 🔑 배너(`ValidationWarnings`)는 **현재 단계**의 경고만 띄운다. 다른 단계의 경고는
 *    결과 화면에 가야 모이므로, 그 전까지 알려 주는 것은 사이드바 표식뿐이다.
 */
export function getStepWarningCount(form: OneHouseJudgmentFormData, step: number): number {
  return validateStepByIndex(form, step).filter((e) => e.severity === "warning").length;
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
  /**
   * 양도 대상 종류는 **판정 조문을 가르는 축**이라(§89①3호 / §89①4호) 요약 맨 앞에 둔다.
   * 주택일 때는 종전과 같이 적지 않는다 — 기본값이고, 줄이 늘면 정작 다른 값이 묻힌다.
   */
  if (!judgmentSaleIsHousing(form)) {
    items.push({ label: "양도 대상", value: "조합원입주권" });
  }
  items.push({ label: "세대 보유 주택 수", value: `${deriveJudgmentHouseCount(form)}채` });
  if (!judgmentSaleIsHousing(form)) {
    // §89①4호 본문이 「1개」를 요구하는 축 — 양도 대상 포함 수를 그대로 보여준다.
    items.push({ label: "세대 보유 입주권 수", value: `${deriveJudgmentRightCount(form)}개` });
  }

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
