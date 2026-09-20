/**
 * 1세대1주택 비과세 **판정 메뉴** 폼 타입 (P4-2b-1)
 *
 * 계획서 `docs/00-pm/one-house-exemption-automation.plan.md` Q-8 · §20.4 · §20.8.
 *
 * ## 왜 `TransferFormData` **슈퍼셋**인가 (Q-8)
 *
 * 판정 메뉴는 계산기의 섹션 11종을 **수정 없이** 재사용한다. 그 섹션들은 `form: TransferFormData`
 * + `onChange(Partial<TransferFormData>)` props에 묶여 있으므로, 폼 상태가 `TransferFormData`의
 * 슈퍼셋이면 그대로 통과한다(`strictFunctionTypes` 반변성상 추가 필드가 전부 optional이거나
 * 슈퍼셋이면 성립 — 11종 전건 `tsc --noEmit` 0 error로 실측).
 *
 * 대안이었던 `Pick<TransferFormData, …>`는 **TS2740으로 성립하지 않는다**(실측).
 *
 * ## 🔴 `saleTargetHouseId`·`saleExpectedDate`·`saleExpectedPrice`는 만들지 않는다 (§20.4)
 *
 * Q-8 문언에는 이 셋이 있었으나 실측이 전제를 뒤집었다:
 *
 *   · 명부(`houses`)는 **「다른 보유 주택」**이다 — 양도 대상은 들어 있지 않다
 *     (`HousesListSection.tsx:529` 「현재 양도하는 주택 **외** 세대 구성원이 보유한 주택」).
 *     API 변환 층이 `id:"selling"` 행을 앞에 붙이며, 그 행의 취득일·기준시가·지역을
 *     전부 `assets[0]`에서 읽는다(`transfer-tax-api-houses.ts:29-41`).
 *     ⇒ 「명부 중에서 양도 대상을 고른다」가 성립하지 않는다.
 *   · 양도예정일·예상양도가는 `transferDate`·`assets[0].transferPrice`가 **이미 그 자리**이고,
 *     재사용 leaf들이 **그 필드를 읽는다**. 별도 필드를 두면 dual truth다.
 *
 * ⇒ 슈퍼셋이 실제로 더하는 것은 **§155의2·§155의3 입력뿐**이다. 이 둘은 계산기 화면에
 *   만들지 않기로 했으므로(D-4) `TransferFormData`가 아니라 여기에 둔다.
 */
import type { TransferFormData } from "./calc-wizard-form.types";
import { createDefaultTransferFormData } from "./calc-wizard-store";

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

/** 판정 메뉴 폼 — `TransferFormData` 슈퍼셋(Q-8). */
export type OneHouseJudgmentFormData = TransferFormData & OneHouseJudgmentExtraFields;

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

/**
 * 판정 메뉴 초기 폼.
 *
 * 🔑 `createDefaultTransferFormData()`를 **재사용**한다 — 기본값을 베껴 쓰면 계산기와 판정 메뉴의
 *    같은 필드가 서로 다른 값에서 출발해 조용히 갈린다(`feedback_store_default_vs_ui_display_fallback`).
 *
 * 🔑 `householdHousingCount`는 **초기값 그대로 두고 쓰지 않는다** — 판정 메뉴의 주택 수는
 *    명부에서 파생한다(G-1). `deriveJudgmentHouseCount`가 유일한 소스다.
 */
export function createInitialOneHouseJudgmentForm(): OneHouseJudgmentFormData {
  return { ...createDefaultTransferFormData(), ...oneHouseJudgmentExtraDefaults };
}

/**
 * 외부에서 온 폼(세션 리하이드레이션 · **이력 재개**)을 초기값 위에 덮는다 (P4-2b-3).
 *
 * 🔑 구 스키마 **판별을 하지 않는다**. 계산기 store가 키 화이트리스트로 판별했다가
 *    「모든 신 스키마 폼이 구 스키마로 오분류돼 F5마다 자산 전부 소실」된 전례가
 *    `calc-wizard-store.ts:221-247`에 남아 있다. 덮어쓰기만 하면 오분류가 성립하지 않는다.
 *
 * 🔑 이력 record에는 `buildingStdSnapshots`처럼 **저장 층이 끼워 넣은 키**가 섞여 있다.
 *    폼 타입에 없는 키는 아래 화면들이 읽지 않으므로 그대로 흘려보낸다 — 걸러 내려다
 *    화이트리스트를 만드는 순간 위 전례를 되풀이한다.
 */
export function normalizeOneHouseJudgmentForm(
  raw: Record<string, unknown> | null | undefined,
): OneHouseJudgmentFormData {
  const base = createInitialOneHouseJudgmentForm();
  if (!raw || typeof raw !== "object") return base;
  return { ...base, ...(raw as Partial<OneHouseJudgmentFormData>) };
}

/**
 * 명부 → 세대 보유 주택 수 (**판정 메뉴의 정본** — G-1 · D-3).
 *
 * 🔴 계산기는 사용자가 「1 / 2 / 3+」로 선언한 스칼라를 쓰지만 판정 메뉴에는 그 위젯이 없다.
 *    명부는 「다른 보유 주택」이므로 **양도 대상 1채를 더한다** — API 변환 층이 `id:"selling"`
 *    행을 앞에 붙이는 것과 같은 식이며(`transfer-tax-api-houses.ts:29`), route가 본문을 받은 뒤
 *    독립적으로 계산하는 `deriveHouseholdHousingCount(engineHouses) = engineHouses.length`와
 *    **같은 값**이어야 한다(P4-2a).
 *
 * 🔑 분양권·조합원입주권은 더하지 않는다 — §89①3호의 「주택 수」가 아니라 §89②의 별개 축이다.
 */
export function deriveJudgmentHouseCount(form: Pick<OneHouseJudgmentFormData, "houses">): number {
  return 1 + (form.houses?.length ?? 0);
}

/**
 * 재사용 섹션에 넘길 **파생 폼 뷰**.
 *
 * 🔴 `HousesListSection`·`MergedHouseholdRightSection`·`TemporaryTwoHouseSection` 호출부는
 *    렌더 게이트로 `form.householdHousingCount`를 읽는다. 판정 메뉴는 그 값을 store에 쓰지
 *    않으므로(Q-8) **넘기기 직전에 합성**한다.
 *
 * 🔑 `useEffect`로 store에 미러링하지 않는다 — 무한 루프 위험이자 금지 규약이다
 *    (`feedback_useeffect_store_mirror_forbidden`). 파생 뷰는 읽기 전용 사본이고,
 *    사용자 입력은 원본 `form`으로만 돌아간다.
 */
export function withDerivedHouseCount(form: OneHouseJudgmentFormData): OneHouseJudgmentFormData {
  return { ...form, householdHousingCount: String(deriveJudgmentHouseCount(form)) };
}
