/**
 * §154⑩ 사실 질문 — 게이트·응답 도출·응답 쓰기·⑧의 **정본** (계획서 `phrp-154-10-undeclared-one-house.plan.md` Q-1 (a) · Q-3 (a)).
 *
 * 「소득세법 시행령」 §154⑩은 「직전거주주택의 양도일 후의 기간분에 대해서만 국내에 1주택을 보유한 것으로 보아 제1항을 적용한다」
 * — 요건 사실이 있으면 비과세 범위가 **줄어드는** 강행규정이다. 종전에는 그 사실을 넣는 길이 ⑳ 혜택 토글 안쪽(시나리오 B →
 * 자동 생성 1호 삭제)뿐이라, 평범한 1주택으로 입력하면 안분 없이 전액 비과세가 났다(실측 결정세액 0 ↔ 19,225,000).
 * ⇒ 판정 메뉴·부담부증여 화면에서 사실을 **예/아니오로 반드시** 묻고, 「예」면 기존 §154⑩ 선언(B · 임대주택 0호)을 쓴다.
 *    엔진·④는 그대로다 — 선언되면 이미 맞게 계산한다.
 *
 * ⑤ `Phrp154_10FactQuestion` · ⑧ 판정 메뉴 `validateStep3`·증여세 `giftBurdenedRentalExceptionError`가 이 파일만 쓴다(3중 패턴).
 * 계산기(`mode="calc"`)는 묻지 않는다(Q-2 (a) — 선언은 판정 메뉴 몫이고 안내 한 줄만 둔다).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { isRentalResidenceExceptionEnacted } from "@/lib/tax-engine/data/rental-155-20-era";

type Rh = AssetForm["rentalHousingException"];
export type Phrp154_10Answer = "yes" | "no";

/** §154⑩ 선언 상태(B · 공동보유 장기임대주택 0호) — 엔진 `isStandalone154_10`과 같은 술어. */
function isDeclared154_10(rh: Rh): boolean {
  return rh.applyException && rh.scenario === "B" && rh.rentalUnits.length === 0;
}

/**
 * 질문을 띄우는가.
 *
 * - ⑳을 임대주택 1호 이상으로 선언했으면 띄우지 않는다 — 그 주택은 세대의 마지막 1채가 아니고, 직전거주주택보유주택이면
 *   ⑳ 시나리오 B(§161① 안분)가 이미 같은 사실을 받는다.
 * - 2011.10.14. 전 양도에는 띄우지 않는다 — §154⑩ `<신설 2011.10.14>` · 대통령령 제23218호 부칙 제2조 「이 영 시행 후
 *   최초로 양도하는 주택부터 적용한다」(⑳ 신설과 같은 개정령 · 같은 날이라 엔진 술어를 그대로 쓴다). 양도일을 모르면 띄운다.
 */
export function phrp154_10QuestionInScope(rh: Rh, transferDate: string | undefined): boolean {
  if (rh.applyException && !isDeclared154_10(rh)) return false;
  const d = transferDate ? new Date(transferDate) : null;
  if (d && !Number.isNaN(d.getTime()) && !isRentalResidenceExceptionEnacted(d)) return false;
  return true;
}

/**
 * 화면에 보일 응답 — §154⑩ 선언 상태면 「예」(⑳ 토글로 직접 선언한 구 기록 포함), 아니면 저장된 「아니오」만 인정한다.
 * 「예」를 고른 뒤 ⑳ 토글을 끄거나 임대주택을 추가하면 선언이 풀리므로 응답도 미응답으로 돌아간다 — 한 사실을 두 위젯이 다르게
 * 담지 않게 선언 상태에서 도출한다(계획서 V-5).
 */
export function phrp154_10AnswerOf(rh: Rh): Phrp154_10Answer | undefined {
  if (isDeclared154_10(rh)) return "yes";
  return rh.phrp154_10Answer === "no" ? "no" : undefined;
}

/** 응답을 특례 입력에 쓴다 — 「예」는 §154⑩ 선언, 「아니오」는 그 선언만 거둔다(⑳ 본문 선언은 질문 밖이라 여기 오지 않는다). */
export function applyPhrp154_10Answer(rh: Rh, answer: Phrp154_10Answer): Rh {
  if (answer === "yes") {
    return {
      ...rh,
      applyException: true,
      scenario: "B",
      rentalUnits: [],
      wasRegisteredRentalOrChildcare: true,
      phrp154_10Answer: "yes",
    };
  }
  return isDeclared154_10(rh)
    ? { ...rh, applyException: false, scenario: "A", phrp154_10Answer: "no" }
    : { ...rh, phrp154_10Answer: "no" };
}

/**
 * 자산 단위 쓰기 — AI 사실 추출(`one-house-ai/merge-form.ts` · `question-answer.ts`)이 이 칸에 값을 넣을 때 화면 질문과 같은 쓰기를
 * 거치게 한다. 「예」·「아니오」가 아닌 값(미응답)은 그대로 둔다.
 */
export function withPhrp154_10Answer(asset: AssetForm, answer: unknown): AssetForm {
  if (answer !== "yes" && answer !== "no") return asset;
  return { ...asset, rentalHousingException: applyPhrp154_10Answer(asset.rentalHousingException, answer) };
}

export const PHRP_154_10_QUESTION_FIELD = "rentalHousingException.phrp154_10Answer";

/** ⑧ — 질문이 보이는데 답이 없으면 막는다. 「모름」은 두지 않는다(본인이 한 등록·양도라 알 수 있는 사실 — 계획서 §5). */
export function phrp154_10AnswerError(rh: Rh | undefined, transferDate: string | undefined): string | null {
  if (!rh || !phrp154_10QuestionInScope(rh, transferDate) || phrp154_10AnswerOf(rh)) return null;
  return "장기임대주택 특례(소득세법 시행령 §154⑩): 이 주택을 임대주택으로 등록했거나 어린이집으로 운영한 적이 있고, 보유하는 동안 다른 거주주택을 양도한 적이 있는지 「예」 또는 「아니오」로 답하세요.";
}
