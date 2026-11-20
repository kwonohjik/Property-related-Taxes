/**
 * ⑧ 판정 메뉴 ② 양도 대상 주택 검증(`validateStep3`) — `one-house-exemption-validate.ts`에서 분리(2026-11 리뷰 I-17 · 800줄 정책).
 * 동작 변화 없음. 규칙·fallback 원칙은 원 파일 머리 주석을 따른다.
 */
import { judgmentOwnershipShareError } from "@/lib/calc/judgment-ownership-share";
import { giftHouseholdFactErrors, giftPriorResidenceAsked } from "@/lib/calc/gift-household-payload";
import {
  isTransferDateBeforeSupported,
  TRANSFER_DATE_BEFORE_SUPPORTED_MESSAGE,
} from "@/lib/tax-engine/data/transfer-supported-period";
import { oneRightNaFactIssues } from "./one-right-na-facts-validate";
import { parseAmount } from "@/lib/calc/number-parse";
import { calcEffectiveWasRegulatedAtAcquisition, calcStoredRegulatedFlags, GIFT_HOUSEHOLD_SCOPE_PRIMARY } from "./effective-regulated-at-acquisition";
import { validateRentalHousingException } from "./transfer-tax-validate-rental-exception";
import { demolishedFieldIssues } from "./one-house-demolished";
import { validateUsageConversion } from "./transfer-tax-validate-usage-conversion";
// ⑤·⑧ 공용 노출 술어 — 계산기와 **같은 것**을 쓴다(두 벌이 되면 한쪽만 개정 반영된다).
import { collectResidenceIntervalErrors } from "./residence-interval-validate";
import { directResidenceMonthsOverflowError } from "./residence-interval-validate";
import { deriveResidencePeriodMonths } from "@/lib/stores/calc-wizard-asset-residence";
import { sameHouseholdInheritanceOrderError } from "./same-household-inheritance-order";
import { cohabitationResidenceMonthsError } from "./same-household-inheritance-order";
import { winWinRentalFieldErrors } from "./one-house-extra-facts-payload";
import { winWinResidenceExemptForJudgment } from "./one-house-extra-facts-payload";
import { judgmentSaleIsHousing, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { phrp154_10AnswerError } from "./phrp-154-10-fact-question";
import { PHRP_154_10_QUESTION_FIELD } from "./phrp-154-10-fact-question";
import { err, type Errors } from "./one-house-exemption-validate-shared";

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
  else if (isTransferDateBeforeSupported(form.transferDate))
    errors.push(err("transferDate", TRANSFER_DATE_BEFORE_SUPPORTED_MESSAGE));
  if (!primary?.acquisitionDate) {
    errors.push(err("acquisitionDate", "양도 대상 주택의 취득일을 입력하세요."));
  }

  // 잔금 전 멸실 특약(결정 #46) — 칸과 같은 게이트. 규칙·문구는 `one-house-demolished.ts` leaf.
  errors.push(...demolishedFieldIssues(form));

  /**
   * 🔴 예상 양도가액은 **양수여야 한다** — `propertySchema`가 `positive()`를 요구하고,
   *    고가주택(12억 초과) 판정에 실제로 쓰인다. 막지 않으면 route가 400으로 돌려보내고
   *    사용자는 필드명만 적힌 오류를 본다.
   */
  if (parseAmount(form.contractTotalPrice) <= 0) {
    errors.push(err("contractTotalPrice", "예상 양도가액을 입력하세요."));
  }
  const shareError = judgmentOwnershipShareError(primary); // 결정 Q-24 — 공동명의 지분율(⑤ `JudgmentOwnershipShareField`와 같은 게이트)
  if (shareError) errors.push(err("ownershipNumerator", shareError));

  if (form.transferDate && primary?.acquisitionDate && form.transferDate < primary.acquisitionDate) {
    errors.push(err("transferDate", "양도 예정일이 취득일보다 빠릅니다."));
  } else if (form.transferDate && primary?.acquisitionDate && form.transferDate === primary.acquisitionDate) {
    // ⑫ refine(`acquisitionDate >= transferDate`)의 거울 — 같은 날이면 route가 400을 낸다(S09-1).
    errors.push(err("transferDate", "양도 예정일은 취득일보다 이후여야 합니다."));
  }

  // §89①4호 나목 — 「그 1주택 취득일」 칸이 보유 주택 명부와 어긋나거나 양도일 이후면 막는다(S10-4).
  for (const issue of oneRightNaFactIssues(form)) errors.push(err(issue.field, issue.message));

  // §154⑤ 단서 용도변경 — 계산기와 같은 leaf. 칸은 주택 양도에만 있다(⑤·④와 같은 `judgmentSaleIsHousing`).
  if (primary && judgmentSaleIsHousing(form)) {
    const conversionError = validateUsageConversion(primary, "양도 대상 주택", form.transferDate);
    if (conversionError) errors.push(err("residentialUseStartDate", conversionError));
  }

  /**
   * §154⑧3호 동일세대 상속 통산 (OH-18) — ⑤·④와 같은 게이트(양도 대상 주택 · 상속 · 동일세대).
   *
   * 🔑 개시일이 없으면 ④는 보유 기산을 옮기지 못한다 — 계산기 ⑧과 같은 필수값이다.
   * 🔴 개시일이 **상속개시일 이후**면 엔진(`resolveExemptionHoldingStartDate`)이 그 값을 조용히
   *    버리고 상속개시일부터 센다. 입력한 통산이 사라지는 것을 여기서 알린다.
   */
  const inheritedSale =
    !!primary && judgmentSaleIsHousing(form) && primary.acquisitionCause === "inheritance";
  // ⑫ refine과 같은 필수값 — 비우면 route가 400으로 돌려보낸다(계산기 ⑧과 같은 문구 축).
  if (inheritedSale && !primary.decedentAcquisitionDate) {
    errors.push(err("decedentAcquisitionDate", "상속받은 주택이면 피상속인 취득일을 입력하세요."));
  } else if (
    inheritedSale &&
    primary.acquisitionDate &&
    primary.decedentAcquisitionDate &&
    primary.decedentAcquisitionDate >= primary.acquisitionDate
  ) {
    // ⑫ refine(`decedentAcquisitionDate >= acquisitionDate`)의 거울 — 순서가 어긋나면 route가 400을 낸다(S09-1).
    errors.push(err("decedentAcquisitionDate", "피상속인 취득일은 상속개시일보다 이전이어야 합니다."));
  }
  if (inheritedSale && primary.decedentSameHouseholdBeforeInheritance) {
    if (!primary.decedentCohabitationHoldingStartDate) {
      errors.push(
        err(
          "decedentCohabitationHoldingStartDate",
          "동일세대 상속이면 동일세대 거주·보유 개시일을 입력하세요. (§154⑧3호 통산)",
        ),
      );
    } else {
      // 순서(상속개시 전 · 피상속인 취득 후) — 계산기 ⑤·⑧과 **같은 leaf**(E-2).
      const order = sameHouseholdInheritanceOrderError(primary);
      if (order) errors.push(err("decedentCohabitationHoldingStartDate", order));
      const cap = cohabitationResidenceMonthsError(primary); // D-12 — 엔진 클램프와 같은 상한
      if (!order && cap) errors.push(err("decedentCohabitationResidenceMonths", cap));
    }
  }

  // 증여받은 주택의 증여자와 계속 같은 세대 (결정 #38) — ⑤·④와 같은 게이트. 규칙은 `gift-household-payload.ts`가 정본이다.
  if (primary && judgmentSaleIsHousing(form))
    for (const e of giftHouseholdFactErrors(primary)) errors.push(err(e.field, e.message));

  /**
   * 거주 구간 — 계산기와 **같은 leaf**(`residence-interval-validate.ts`, OH-07).
   *
   * 🔴 ④는 구간을 단순 합산한다(`sumResidenceMonths` — 취득일·양도일로 자르지 않고 겹침도
   *    빼지 않으며 퇴거일이 비면 0개월). 취득 전 임차 거주·중복 구간은 비과세를 과다로,
   *    퇴거일 누락은 과소로 판정을 뒤집는다. 위젯은 퇴거일 누락만 안내하고 막지 않는다.
   *
   * 🔑 게이트는 ⑤(`Step3.tsx`)와 같다 — 입주권 양도에는 거주 위젯이 없고, 직접 입력 모드는
   *    구간을 쓰지 않는다(`deriveResidencePeriodMonths`). 1세대가 아니면 판정 대상이 아니므로
   *    계산기와 같이 보지 않는다.
   */
  if (
    form.isOneHousehold &&
    primary &&
    primary.assetKind !== "right_to_move_in" &&
    primary.residenceInputMode === "interval"
  ) {
    for (const message of collectResidenceIntervalErrors({
      periods: primary.residencePeriods ?? [],
      acquisitionDate: primary.acquisitionDate,
      transferDate: form.transferDate,
      giftPriorHint: giftPriorResidenceAsked(primary),
    })) {
      errors.push(err("residencePeriods", message));
    }
  }
  // 직접 입력 — 구간 모드와 같은 범위(취득일~양도일)를 상한으로 막는다(계산기와 같은 leaf).
  if (
    form.isOneHousehold &&
    primary &&
    primary.assetKind !== "right_to_move_in" &&
    primary.residenceInputMode === "direct"
  ) {
    const overflow = directResidenceMonthsOverflowError({
      months: deriveResidencePeriodMonths(primary, form.transferDate, form.residencePeriodMonths),
      acquisitionDate: primary.acquisitionDate,
      transferDate: form.transferDate,
      field: "residencePeriodMonthsAsset",
      giftPriorHint: giftPriorResidenceAsked(primary),
    });
    if (overflow) errors.push(err("residencePeriodMonthsAsset", overflow));
  }

  /**
   * ── 거주요건 면제 특례 3종 — 입력이 ② 화면으로 오면서 ⑧도 따라왔다 (2026-09-23) ──
   *
   * 🔴 **입력이 옮겨오면 그 검증도 따라와야 한다.** 남겨 두면 「화면엔 칸이 없는데 ⑧이 요구」
   *    하는 영구 차단이 되고, 그것은 이 저장소가 반복해 밟은 실패모드다
   *    (`transfer-tax-validate.ts` 같은 자리 주석 · D-6 4건).
   */

  // §155의2 — 어댑터가 전송을 포기하는 조건과 **같은 자리**에서 막는다.
  //   입주권 양도에는 칸이 없다(⑤·④·사이드바와 같은 `judgmentSaleIsHousing` 게이트 — S10-8).
  if (form.longTermMortgageSpecial && judgmentSaleIsHousing(form)) {
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
  //   규칙·문구는 증여세 부담부증여 경로와 공용 leaf다(E-1 한계 G2).
  //   2026 개정 양도기한(종료일 필수)은 양도일로 게이트한다 — ⑤와 같은 경계.
  //   입주권 양도에는 칸이 없다(⑤·④와 같은 `judgmentSaleIsHousing` 게이트).
  if (judgmentSaleIsHousing(form))
    for (const e of winWinRentalFieldErrors(form, form.transferDate, {
      // ①1호 「취득한 후 체결」 날짜 하한 — 엔진 `qualifiesWinWinRental`과 같은 취득일·동일세대 상속 사실.
      acquisitionDate: primary?.acquisitionDate,
      sameHouseholdInheritance:
        primary?.acquisitionCause === "inheritance" && primary.decedentSameHouseholdBeforeInheritance === true,
    }))
      errors.push(err(e.field, e.message));

  /**
   * §155⑳ 장기임대주택 특례 (P4-3a) — 계산기와 **같은 leaf**를 `facts` 모드로 부른다.
   *
   * 🔑 `mode: "facts"`가 §161① 안분 입력(직전거주주택 양도일·3시점 기준시가)을 요구하지
   *    않게 한다. 그 칸들은 ⑤가 판정 메뉴에서 감추므로, 여기서 막으면 화면에 없는 값 때문에
   *    판정이 영구 차단된다(3중 패턴 — ⑤/④/⑧).
   * 🔑 **이중 입력 경고는 여기 없다** — 명부를 보는 경고라 `validateStep2`에 남겼다.
   */
  // 입주권 양도에는 ⑳ 칸이 없다(⑤·④와 같은 `judgmentSaleIsHousing` 게이트 — G066).
  if (primary && judgmentSaleIsHousing(form)) {
    const rentalError = validateRentalHousingException(
      primary.rentalHousingException,
      primary,
      0, // 판정 메뉴는 `form.assets[0]`만 판정한다 — 컴패니언 개념이 없다.
      "장기임대주택 특례",
      form.transferDate,
      "facts",
      // OH-42 — 상생임대주택이면 §155⑳1호 거주요건 면제. ⑤ 카드·엔진과 같은 술어·같은 사실(V-8).
      winWinResidenceExemptForJudgment(form, form.transferDate, {
        acquisitionDate: primary.acquisitionDate,
        sameHouseholdInheritance:
          primary.acquisitionCause === "inheritance" && primary.decedentSameHouseholdBeforeInheritance === true,
      }),
      // §154⑩ 표준 경로(I-5) — 2019.2.12 전 취득 분기의 거주요건 판정에 쓰인다(facts 모드는
      // 이 값을 쓰는 검증 이전에 반환하므로 지금은 no-op이지만, 계산기(`full`)와 같은 소스를
      // 유지해 향후 facts 모드가 이 축을 쓰게 되어도 3중 패턴이 깨지지 않게 한다).
      // 결정 #5(G7-6) — 주소가 있으면 ④·⑤와 같은 주소 판정값(저장된 토글이 아니다). 주소 문자열만 있어도 ④와 같은 leaf다.
      calcEffectiveWasRegulatedAtAcquisition(primary, calcStoredRegulatedFlags(form).wasRegulatedAtAcquisition, undefined, GIFT_HOUSEHOLD_SCOPE_PRIMARY),
    );
    if (rentalError) errors.push(err("rentalHousingException", rentalError));
    // §154⑩ 사실 질문(Q-1 (a)) — ⑤ `Phrp154_10FactQuestion`과 같은 게이트·도출(`phrp-154-10-fact-question.ts`).
    const phrpAnswerError = phrp154_10AnswerError(primary.rentalHousingException, form.transferDate);
    if (phrpAnswerError) errors.push(err(PHRP_154_10_QUESTION_FIELD, phrpAnswerError));
  }

  return errors;
}
