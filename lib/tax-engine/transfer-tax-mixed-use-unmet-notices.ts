/**
 * 겸용주택 — 「선언했으나 적용되지 않은 특례」 결과 경고 (계획서 `mixed-use-one-house-warning-parity.plan.md` D-1·D-2 · Q-1 (a)).
 *
 * 일반 주택·완공APT는 정본 판정의 `unmetExceptions`를 `oneHouseJudgmentWarnings`로 옮긴다. 겸용주택은 자체 판정
 * (`judgeMixedUseOneHouseExemption`)이라 그 목록이 없어, 결론(과세)은 같은데 이유가 결과에 없었다.
 * 여기서는 일반 경로가 경고로 옮기는 두 종류(`CALC_WARNING_UNMET_IDS`)만 **같은 leaf·같은 문장**으로 만든다.
 *
 * - 삭제 전 §154①4호 미충족 — `collectRental4hoUnmet`
 * - §155① 종전·신규 주택 취득 선후 — `collectTemporaryTwoHouseUnmet`과 같은 조건(주택 수 2 · 선후 역전)
 *
 * 게이트(「결론을 가를 때만」)는 호출부가 일반 경로와 같은 값으로 건다 — 1세대 · 비과세 아님 · 핵심 판정 불성립
 * (`transfer-tax-exemption.ts`의 `coreWouldPass` · `one-house/unmet-exceptions.ts` 자산·1세대 게이트).
 */
import type { OneHouseSpecialRulesData } from "./schemas/rate-table.schema";
import type { TransferTaxInput } from "./types/transfer.types";
import { collectRental4hoUnmet } from "./one-house/rental-registration-4ho";
import { evaluateTemporaryTwoHouseTiming, type DeemedOneHouseReqInput } from "./one-house/merge-deeming";
import { temporaryTwoHouseOrderReason } from "./one-house/new-house-origin";
import { twoHouseSpecialCountHolds } from "./transfer-tax-exemption-holding";
import { unmetExceptionWarning } from "./transfer-tax-one-house-warnings";
import { buildRequirementReview } from "./one-house/requirement-review";
import { requirementReviewUnmetNotice } from "./one-house/requirement-review-notice";
import type { OneHouseJudgeInput, OneHouseRequirementCheck } from "./one-house/types";
import type { Article89Clause2Result } from "./transfer-tax-89-2-exclusion";

export function mixedUseUnmetNotices(
  /** §155① 판정에 넘긴 입력 그대로 — 주택 수·타이밍이 같은 술어를 본다 */
  deemedInput: DeemedOneHouseReqInput,
  oneHouseRules: OneHouseSpecialRulesData,
  rental4hoInput: Pick<TransferTaxInput, "transferDate" | "oneHouseExemptionProviso">,
): string[] {
  const out: string[] = [];
  const tth = deemedInput.temporaryTwoHouse;
  const twoHouseRule = oneHouseRules.temporary_two_house;
  if (tth && twoHouseRule && twoHouseSpecialCountHolds(deemedInput)) {
    const { timing } = evaluateTemporaryTwoHouseTiming(deemedInput, twoHouseRule);
    if (!timing.acquiredInOrder) out.push(temporaryTwoHouseOrderReason(tth.previousAcquisitionDate, tth.newAcquisitionDate));
  }
  for (const u of collectRental4hoUnmet(rental4hoInput)) out.push(unmetExceptionWarning(u));
  return out;
}

/**
 * 겸용 거주기간 표기 — 겸용 엔진은 거주를 **연 단위 내림 값**으로 받는다(`transfer-tax-api-mixed-use.ts`
 * `residencePeriodYears: Math.floor(resMonths / 12)` → 엔진 `× 12`). 23개월이 「1년」으로 보이지 않도록
 * 내림임을 밝혀 쓴다(`docs/00-pm/mixed-use-unmet-reason-calc.plan.md` Q-2 a). 판정 경계(2년)는 내림과 무관하다.
 */
export function mixedUseResidenceYearsLabel(residenceMonths: number): string {
  const years = Math.floor(residenceMonths / 12);
  return years === 0 ? "1년 미만" : `만 ${years}년`;
}

/** 거주 행의 「거주기간 N개월」은 내림 값이라 겸용 표기로 바꾼다. */
function withMixedResidenceFact(item: OneHouseRequirementCheck): OneHouseRequirementCheck {
  if (item.id !== "residence") return item;
  return {
    ...item,
    facts: item.facts.map((f) => (f.label === "거주기간" ? { ...f, value: mixedUseResidenceYearsLabel(parseInt(f.value, 10)) } : f)),
  };
}

/**
 * 겸용 — 일시적 2주택 · 합가 의제가 깨져 주택 수 축이 서지 않으면 자체 §154① 문장이 나가지 않아 사유가 0건이었다.
 * 정본 요건 검토표(`buildRequirementReview`)를 겸용 판정 입력으로 만들어 일반 계산기(#2880)와 같은 문장으로 고지한다
 * (계획서 `mixed-use-unmet-reason-calc.plan.md` Q-1 a). 호출부가 「1세대 · 주택 수 축 불성립(그래서 비과세 아님)」일 때만 부른다.
 *
 * - 판정을 다시 하지 않는다 — 검토표는 겸용 판정이 쓰는 같은 입력·같은 술어(`evaluateTemporaryTwoHouseTiming` 등)로 행을 만든다.
 * - 상속 취득도 보유 행을 그대로 싣는다. 동일세대 상속 보유 통산(영 §154⑧3호)은 판정 입력(`exemptionReqInput`)이 이미 담아
 *   검토표가 같은 기산일을 본다(#2885 리뷰 게이트의 「상속이면 보유 행 제외」 임시 회피는
 *   `mixed-use-inherit-same-household-holding.plan.md` Q-3 a로 지웠다).
 * - `transferPrice`(0)는 검토표의 고가주택 행만 읽는다. 그 행은 `met`/`partial`뿐이라(미충족 없음) 고지에 오르지 않는다 —
 *   겸용 고가 판정(주택분 안분)은 따로 한다.
 */
export function mixedUseRequirementReviewNotice(
  deemedInput: DeemedOneHouseReqInput,
  oneHouseRules: OneHouseSpecialRulesData,
  facts: { isUnregistered: boolean; article89Clause2: Article89Clause2Result | undefined },
  shown: readonly string[],
): string | undefined {
  const judgeInput = { ...deemedInput, propertyType: "housing", isUnregistered: facts.isUnregistered, transferPrice: 0 } as OneHouseJudgeInput;
  const review = buildRequirementReview(
    judgeInput,
    oneHouseRules,
    { isExempt: false, isPartialExempt: false, appliedExceptions: [] },
    facts.article89Clause2 ?? { status: "not_applicable" },
  );
  if (!review) return undefined;
  const items = review.items.map(withMixedResidenceFact);
  return requirementReviewUnmetNotice({ isExempt: false, isPartialExempt: false, requirementReview: { ...review, items } }, shown);
}

