/**
 * 1세대1주택 비과세 **공유 판정 엔진** — 타입 (P2)
 *
 * 계획서 `docs/00-pm/one-house-exemption-automation.plan.md` §5.1 ·
 * 엔진 설계 `docs/02-design/features/one-house-exemption-automation.engine.design.md`.
 *
 * D-1 「화면은 나누고 엔진은 하나」 — 판정 메뉴(P4)와 양도세 계산기가 **같은 함수**를 부른다.
 * 그러려면 판정에 필요한 사실이 `TransferTaxInput`이라는 계산기 전용 타입과 **분리**돼야 한다.
 *
 * 🔴 이 파일의 핵심은 `OneHouseJudgeInput`이다 — 판정 서브트리(`checkExemption` ·
 *    `checkExemptionCore` · `resolveArticle89Clause2` · 요건 술어부)가 **실제로 읽는 필드의
 *    전수 목록**이고, 컴파일러가 그 목록을 강제한다. 서브트리가 새 필드를 읽으면 이 Pick에
 *    없어서 `tsc`가 막고, 이 Pick에 추가하면 어댑터(`judge.ts`)의 키 커버리지 가드가 막는다.
 *    ⇒ 「판정 메뉴가 넘기는 사실만으로 계산기와 같은 판정이 나온다」가 **유지되는 불변식**이 된다.
 */
import type { TransferTaxInput } from "../types/transfer.types";
import type { HouseInfo, PresaleRight } from "../types/multi-house-surcharge.types";
import type { Article89Clause2Result } from "../transfer-tax-89-2-exclusion";

/**
 * 판정 서브트리가 읽는 `TransferTaxInput` 필드 — **전수**.
 *
 * 도출 방법은 추측이 아니라 **컴파일러**다: `checkExemption`·`checkExemptionCore`의 매개변수를
 * 이 타입으로 좁힌 뒤 `tsc`가 더 이상 오류를 내지 않을 때까지 채웠다. 서브트리가 호출하는
 * 요건 술어부의 narrowing 타입(`DeemedOneHouseReqInput`·`ExemptionReqInput`·
 * `Article89Clause2Input`)도 이 타입을 인자로 받으므로 그쪽 요구 필드까지 함께 강제된다.
 *
 * ⚠️ 전부 optional 필드라 **누락은 `tsc`가 못 잡는다** — 그래서 `judge.ts`에 키 커버리지
 *    가드(`satisfies` + `Exclude<…> extends never`)를 따로 건다
 *    (`feedback_satisfies_preserves_keys_annotation_kills_guard`).
 */
export type OneHouseJudgeInput = Pick<
  TransferTaxInput,
  // ── 양도 대상 자산 ──
  | "propertyType"
  | "acquisitionDate"
  | "transferDate"
  | "transferPrice"
  | "totalPropertyTransferPrice"
  | "burdenedGiftDenominator"
  | "isUnregistered"
  | "acquisitionCause"
  | "nonHousingToHousingConversion"
  | "oneHouseUnitRole"
  | "appurtenantHouseVerdict"
  // ── 세대 ──
  | "isOneHousehold"
  | "householdHousingCount"
  | "marriageMerge"
  | "parentalCareMerge"
  | "isFirstTransferredInMerge"
  // ── 거주·지역 ──
  | "residencePeriodMonths"
  | "residenceTransitionAcquisitionDate"
  | "isRegulatedArea"
  | "wasRegulatedAtAcquisition"
  | "regionCode"
  // ── 상속 ──
  | "decedentSameHouseholdBeforeInheritance"
  | "decedentCohabitationResidenceMonths"
  | "decedentCohabitationHoldingStartDate"
  | "generalHouseHeldAtInheritance"
  | "generalHouseGiftedFromDecedentWithin2yr"
  // ── §154① 단서 · §155 각 항 특례 사실 ──
  | "oneHouseExemptionProviso"
  | "temporaryTwoHouse"
  | "ruralHouse"
  | "unavoidableOutsideCapitalHouse"
  | "culturalHeritageHouse"
  // ── §155의2 · §155의3 (P3) ──
  | "longTermMortgageHouse"
  | "winWinRentalHouse"
  // ── §89② · §156의2 · §156의3 ──
  | "houses"
  | "presaleRights"
  | "sellingHouseId"
  | "replacementHouse"
  | "rightThreeYearException"
  | "mergedHouseholdFirstHouse"
  | "inheritedRightChoiceWhenBothHeld"
>;

/**
 * 세대 구성 — **사용자 선언**(Q-3′). 엔진은 1세대 해당 여부를 판정하지 않는다.
 * 법 §88 6호·영 §152의3 요건 충족 여부는 사용자가 안내를 보고 스스로 판단해 입력한다.
 */
export type OneHouseholdInput = {
  /** 판정 기준일(=양도일) 현재 1세대 해당 여부 — 사용자 선언 */
  isOneHousehold: boolean;
  /**
   * 세대 보유 주택 수 스칼라 — **필수**.
   *
   * 현행 판정 서브트리는 주택 수를 이 스칼라로만 읽는다(`houses` 명부는 §89② 축에서만 쓴다).
   * optional로 두고 어댑터가 `?? 0`으로 채우면 **묵시 폴백**이 되어 판정이 조용히 달라진다
   * (CLAUDE.md 「자동 안분 fallback 금지 — 미입력은 검증 오류로 차단」).
   * ⇒ 판정 메뉴(P4)는 명부에서 **직접 도출해** 채운다(G-1 「명부가 정본」).
   */
  householdHousingCount: number;
  /** §155⑤ 혼인일 */
  marriageDate?: Date;
  /** §155④ 동거봉양 합가일 */
  parentalCareMergeDate?: Date;
  /** §155④⑤ 「먼저 양도하는 주택」 여부 */
  isFirstTransferredInMerge?: boolean;
};

/**
 * 1세대1주택 판정 **사실** — 판정 메뉴(P4)가 계산기에 넘기는 것이 이 객체다(D-3: 결과가 아니라 사실).
 *
 * `TransferTaxInput`의 부분집합이며 **필드명을 그대로 쓴다**(rename 금지 —
 * `feedback_rename_same_name_two_axes`). 예외는 `household`로 묶은 4필드뿐이고, 그 묶음은
 * 어댑터가 `marriageMerge{marriageDate}`·`parentalCareMerge{mergeDate}` 형태로 되돌린다.
 *
 * ⚠️ **설계 초안보다 넓다.** 초안 목록은 `acquisitionDate`·`acquisitionCause`·`isRegulatedArea`·
 *    `regionCode`·상속 동거 3필드·`nonHousingToHousingConversion`·부수토지 2필드를 빠뜨리고 있었다.
 *    그대로 판정 메뉴를 만들었다면 보유기간·거주요건·§155① 조정지역 기한이 **입력 없이 판정**돼
 *    계산기와 다른 답이 나왔을 것이다. 컴파일러 열거(`OneHouseJudgeInput`)로 드러났다.
 */
export type OneHouseFacts = {
  household: OneHouseholdInput;

  // ── 양도 대상 자산 ──
  propertyType: TransferTaxInput["propertyType"];
  acquisitionDate: Date;
  acquisitionCause?: TransferTaxInput["acquisitionCause"];
  isUnregistered: boolean;
  nonHousingToHousingConversion?: TransferTaxInput["nonHousingToHousingConversion"];
  /** 일괄양도에서 주택과 따로 입력된 부수토지 카드(F-13) — 짝 주택의 판정을 따른다. */
  oneHouseUnitRole?: TransferTaxInput["oneHouseUnitRole"];
  appurtenantHouseVerdict?: TransferTaxInput["appurtenantHouseVerdict"];

  // ── 거주·지역 ── (엔진이 필수로 읽는 축 — 묵시 폴백 금지)
  isRegulatedArea: boolean;
  wasRegulatedAtAcquisition: boolean;
  regionCode?: string;
  /** ⚠️ 사용자 입력이 아니다 — 이월과세(§97의2) 경로가 채우는 수증자 실제 취득일. */
  residenceTransitionAcquisitionDate?: Date;

  // ── 상속 ──
  decedentSameHouseholdBeforeInheritance?: boolean;
  decedentCohabitationResidenceMonths?: number;
  decedentCohabitationHoldingStartDate?: Date;
  generalHouseHeldAtInheritance?: boolean;
  generalHouseGiftedFromDecedentWithin2yr?: boolean;

  // ── §154① 단서 · §155 각 항 ──
  oneHouseExemptionProviso?: TransferTaxInput["oneHouseExemptionProviso"];
  temporaryTwoHouse?: TransferTaxInput["temporaryTwoHouse"];
  ruralHouse?: TransferTaxInput["ruralHouse"];
  unavoidableOutsideCapitalHouse?: TransferTaxInput["unavoidableOutsideCapitalHouse"];
  culturalHeritageHouse?: boolean;

  // ── §155의2 장기저당담보 · §155의3 상생임대 (P3) ──
  /** §155의2 — 계약 요건 + ③ 만기 전 양도 + 양도 주택이 담보주택인지 */
  longTermMortgageHouse?: TransferTaxInput["longTermMortgageHouse"];
  /** §155의3 — 상생임대차 요건 3호. **의제가 아니라 거주기간 제한 면제**다 */
  winWinRentalHouse?: TransferTaxInput["winWinRentalHouse"];

  // ── §89② · §156의2 · §156의3 ──
  houses?: HouseInfo[];
  presaleRights?: PresaleRight[];
  sellingHouseId?: string;
  replacementHouse?: TransferTaxInput["replacementHouse"];
  rightThreeYearException?: TransferTaxInput["rightThreeYearException"];
  mergedHouseholdFirstHouse?: TransferTaxInput["mergedHouseholdFirstHouse"];
  inheritedRightChoiceWhenBothHeld?: TransferTaxInput["inheritedRightChoiceWhenBothHeld"];
};

/** 판정 대상 양도 정보 — 판정 메뉴는 「양도 예정」, 계산기는 실제 입력값(D-3 재판정). */
export type OneHouseSale = {
  transferDate: Date;
  transferPrice: number;
  /** 지분 양도·일괄양도 분모(합계액). 미지정 시 `transferPrice`. */
  totalPropertyTransferPrice?: number;
  /** 부담부증여 안분 분모. */
  burdenedGiftDenominator?: number;
  /** §154① 거주요건 판정용 실거주 개월 수 */
  residencePeriodMonths: number;
};

/**
 * 판정 결과.
 *
 * P2 범위에서는 현행 `ExemptionResult`를 **그대로 감싼다**(세액 불변 리팩터 — 다시 쓰지 않는다).
 * `pending[]`·`undetermined[]`·`appliedExceptions[]`·`houseCount` 등 판정 메뉴 전용 필드는
 * P4에서 채운다. 지금 빈 배열로 내보내면 「없음」과 「아직 안 만듦」이 구별되지 않으므로
 * **필드 자체를 두지 않는다**(`feedback_capability_notice_list_goes_stale`).
 */
export type OneHouseJudgment = {
  isExempt: boolean;
  isPartialExempt: boolean;
  exemptReason?: string;
  /** §159의4 표2 대상 의제(§155 각 항에 따라 1세대1주택으로 본 경우) */
  deemedOneHouseBy155?: boolean;
  /** §89② 판정 echo — 3갈래 */
  article89Clause2?: Article89Clause2Result;
  /**
   * ⚠️ **`highValueThreshold`를 담지 않는다** — 설계 초안은 이 필드를 두라고 적었지만,
   *    넣어 두고 뮤테이션을 돌리니 **12억으로 고정해도 2,067케이스 전건이 통과**했다.
   *    읽는 곳이 없다는 뜻이다. 실제 소비자(안분·장특·재개발)는 전부 P1이 만든 단일 소스
   *    `resolveHighValueHouseThreshold(양도일)`를 **직접** 부른다.
   *    ⇒ 여기서 다시 내보내면 같은 값의 **두 번째 경로**가 생기고, 그 둘이 어긋나도
   *    아무 테스트가 울지 않는다. 판정 메뉴(P4)도 그 함수를 직접 부른다.
   */
};
