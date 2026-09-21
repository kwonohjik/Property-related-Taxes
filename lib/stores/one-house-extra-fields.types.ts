/**
 * §155의2 장기저당담보주택 · §155의3 상생임대주택 — **폼 필드 정본** (P5-a에서 분리)
 *
 * ## 왜 별도 파일인가
 *
 * 이 13필드는 두 폼이 함께 쓴다:
 *   · 판정 메뉴 폼(`OneHouseJudgmentFormData`)이 **입력**을 받고,
 *   · 계산기 폼(`TransferFormData.importedOneHouseFacts`)이 그것을 **넘겨받아 운반**한다(P5-a).
 *
 * 🔴 두 폼 타입이 서로를 import하면 순환이 된다 — `one-house-judgment-form.types.ts`가
 *    `calc-wizard-store`의 `createDefaultTransferFormData`를 **런타임 import**하기 때문이다.
 *    ⇒ 공유 조각만 여기에 두고 양쪽이 이 파일을 본다. 베껴 쓰면 두 폼의 같은 필드가
 *    서로 다른 기본값에서 출발해 조용히 갈린다(`feedback_store_default_vs_ui_display_fallback`).
 */
/**
 * §155의2 장기저당담보주택 · §155의3 상생임대주택 — **판정 메뉴 전용 입력**.
 *
 * 🔑 **flat + boolean 게이트**다. `TransferFormData`의 형제 특례가 전부 이 모양이고
 *    (`temporaryTwoHouseSpecial`·`ruralHouseSpecial`·`replacementHouseSpecial`·
 *    `culturalHeritageHouseSpecial`), nested로 섞으면 normalize·초기값·어댑터가 두 규약이 된다
 *    (`feedback_flat_vs_nested_form_field_decision` — 「기존 store가 이미 flat이면 flat」).
 *    엔진은 nested를 받으므로 변환은 **어댑터 한 곳**(`one-house-exemption-api.ts`)이 맡는다.
 *
 * 🔑 숫자·날짜는 **폼 문자열**이다 — `DateInput`·`DecimalInput`이 문자열에 바인딩한다.
 */
export interface OneHouseJudgmentExtraFields {
  // ── §155의2 장기저당담보주택 ──────────────────────────────────
  /** 특례 적용 선언 — OFF면 아래 필드를 전송하지 않는다 */
  longTermMortgageSpecial: boolean;
  /** ①1호 계약체결일 */
  longTermMortgageContractDate: string;
  /** ①1호 계약체결일 현재 가입자 나이 */
  longTermMortgageBorrowerAge: string;
  /** ①2호 계약기간(년) */
  longTermMortgageContractYears: string;
  /** ①3호 만기에 해당 주택을 처분해 일시 상환하는 계약조건인가 */
  longTermMortgageMaturityLumpSum: boolean;
  /** ③ 계약기간 만료 **이전** 양도 — true면 ①②를 적용하지 않는다(배제 사유) */
  longTermMortgageTransferredBeforeMaturity: boolean;
  /**
   * 양도 대상이 **담보주택 자체**인가.
   * ②에서 먼저 양도하는 주택이 담보주택이 아니면 1주택 의제만 서고 거주요건은 그대로 본다
   * (법문이 「**장기저당담보주택은**」으로 한정).
   */
  longTermMortgageIsTransferredHouseMortgaged: boolean;
  /** ② 담보주택 보유 직계존속과 **동거봉양 합가**로 2주택이 된 경우 */
  longTermMortgageParentalCareMerge: boolean;

  // ── §155의3 상생임대주택 ─────────────────────────────────────
  /** 특례 적용 선언 */
  winWinRentalSpecial: boolean;
  /** ①1호 상생임대차계약 체결일 (2021-12-20 ~ 2026-12-31) */
  winWinRentalContractDate: string;
  /** ①1호 직전임대차 대비 보증금·임대료 증가율(%). 인하(음수)도 유효하다 */
  winWinRentalIncreaseRatePct: string;
  /**
   * ①2호 직전임대차계약에 따라 임대한 기간(**개월**).
   * ⚠️ ③ 월력 계산·1개월 미만 절상, ④ 임차인 사정 합산은 **엔진이 하지 않는다** —
   *    이 화면이 이미 반영한 값이어야 한다(엔진 타입 주석과 같은 규약).
   */
  winWinRentalPriorLeaseMonths: string;
  /** ①3호 상생임대차계약에 따라 임대한 기간(개월) */
  winWinRentalLeaseMonths: string;
}

/** 신규 필드의 초기값 — 어댑터·validate의 fallback과 **문자 단위로 같아야** 한다(3중 패턴). */
export const oneHouseJudgmentExtraDefaults: OneHouseJudgmentExtraFields = {
  longTermMortgageSpecial: false,
  longTermMortgageContractDate: "",
  longTermMortgageBorrowerAge: "",
  longTermMortgageContractYears: "",
  longTermMortgageMaturityLumpSum: false,
  longTermMortgageTransferredBeforeMaturity: false,
  longTermMortgageIsTransferredHouseMortgaged: true,
  longTermMortgageParentalCareMerge: false,

  winWinRentalSpecial: false,
  winWinRentalContractDate: "",
  winWinRentalIncreaseRatePct: "",
  winWinRentalPriorLeaseMonths: "",
  winWinRentalLeaseMonths: "",
};
