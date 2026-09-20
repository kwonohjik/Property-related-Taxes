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
 * 적용된 특례 1건 — 판정 메뉴 ④ 「적용 특례 체크리스트」의 한 줄(P4-1).
 *
 * 종전에는 이 정보가 `exemptReason` **자유 문자열**에만 있었다
 * (`"일시적 2주택 비과세 (§154① 단서 2호가 수용 · §155⑯ …)"` — `basisParts.join(" · ")`).
 * 화면이 그 문자열을 파싱하면 문구를 고치는 순간 조용히 깨지므로 **구조화해 따로 낸다**.
 *
 * 🔴 `exemptReason` 문구 자체는 **건드리지 않는다** — `transfer-tax.ts:346·355`가
 *    `exemptReason?.includes("§155⑦3호")`·`includes("중첩")`으로 경고를 만들고 있다
 *    (`feedback_display_string_change_needs_reverse_grep`). 이 필드는 **추가**일 뿐 대체가 아니다.
 */
export type OneHouseAppliedException = {
  /** 안정 식별자 — 화면·테스트가 문자열 라벨 대신 이것을 본다. 내부 id는 UI에 노출하지 않는다. */
  id: string;
  /** 사람이 읽는 라벨(한국어) */
  label: string;
  /** 근거 조문 — `legal-codes`의 `TRANSFER.*` 상수값 */
  legalBasis: string;
};

/**
 * 「이 날짜까지 ~하면 비과세」 — G-3 조건부·기한(P4-1).
 *
 * 🔑 **기한이 남은 미충족 요건이 그 하나뿐일 때만** 낸다. 다른 요건도 못 갖췄는데 기한만
 *    보여주면 「그 날까지 하면 된다」는 **틀린 약속**이 된다.
 * 🔑 `deadline`은 엔진이 낸 값이다 — 화면은 포맷만 하고 **재계산하지 않는다**
 *    (`feedback_aggregate_display_rederives_engine_value`).
 * 🔑 잔여일(D-day)은 담지 않는다(Q-4) — 날짜만 표시한다.
 */
export type OneHousePendingCondition = {
  id: string;
  /** 「종전주택을 이 날짜까지 양도」처럼 **무엇을 해야 하는지** */
  description: string;
  deadline: Date;
  legalBasis: string;
};

/**
 * 판정 보류 — 「자료가 없어 판정하지 않았다」(P4-1).
 *
 * 저장소의 `undetermined` 3갈래 철학을 그대로 쓴다 — **억측 결론 금지**.
 * 「요건 미충족」과 「판정 안 함」은 다르다. 전자는 과세, 후자는 사용자에게 되묻는 것이다.
 */
export type OneHouseUndetermined = {
  id: string;
  /** 왜 판정하지 않았는지 — 무엇을 입력하면 판정되는지까지 적는다 */
  reason: string;
};

/**
 * 판정 결과 — **단일 정본**(P4-1에서 `ExemptionResult`를 흡수했다).
 *
 * P2까지는 `transfer-tax-exemption-requirements.ts`의 `ExemptionResult`와 **필드가 같은
 * 선언이 두 개**였고, 구조적 타이핑 덕에 `judge.ts`가 전자를 반환하면서 후자로 선언해도
 * 통과했다. 그 상태로 한쪽에만 필드를 더하면 **넓은 타입이 좁은 타입으로 좁혀져 조용히
 * 소실**되므로, P4-1에서 이 타입 하나로 합치고 저쪽 선언을 지웠다
 * (`feedback_rename_same_name_two_axes` — 같은 이름이 두 축을 겸하면 전역 치환도 못 한다).
 *
 * ⚠️ 다른 세목에도 `ExemptionResult`라는 **동명 타입 3개**가 따로 있다
 *    (`property-exemption.ts:22` · `types/inheritance-exemption.types.ts:80` ·
 *    `exemption-evaluator.ts`). 이름을 지운 것은 **양도세 것 하나뿐**이다.
 */
export type OneHouseJudgment = {
  isExempt: boolean;
  isPartialExempt: boolean;
  exemptReason?: string;
  /**
   * 「소득세법 시행령」 §159의4 표2 대상 판정용 echo — **각 항에 따라 1세대1주택으로 본** 경우.
   *
   * 같은 조는 표2 대상을 「1주택(**제155조**ㆍ제155조의2ㆍ제156조의2ㆍ제156조의3 및 그 밖의 규정에
   * 따라 1세대 1주택으로 보는 주택을 포함한다)을 보유하고 보유기간 중 거주기간이 2년 이상인 것」으로
   * 정의한다. 즉 표2 「1주택」은 **실제 보유 주택 수가 아니라 의제를 포함한 개념**이다.
   * 「따라 … 보는」이므로 사용자가 켠 플래그가 아니라 **각 항의 요건을 실제로 충족해 의제가 성립한
   * 경우**만이며, 그 판정을 내리는 곳이 여기(`checkExemption`)뿐이라 결과로 echo한다.
   *
   * 현재 범위는 **§155①④⑤⑥⑦⑧ + §155의2②**다(§155의2②는 P3에서 추가 — E-3.9).
   * §156의2(주택+조합원입주권)·§156의3(주택+분양권)은 괄호에 함께 열거돼 있으나 **손대지 않았다**.
   *
   * ⚠️ 이름이 같은 **다른 축**이 있다 — 중과 배제(영 §167의10①15호)의 `deemedOneHouseBy155`
   *    (`multi-house-surcharge.types.ts`)는 「**제155조 또는 조특법**」만 인정해 §155의2를
   *    **포함하지 않는다**. 두 축을 한 이름으로 합치지 말 것(`feedback_rename_same_name_two_axes`).
   * ⚠️ 거주 2년 요건은 연언(AND)이므로 별개다. 표2 게이트의 `table2ResidenceYears >= 2`는 유지된다.
   */
  deemedOneHouseBy155?: boolean;
  /**
   * 「소득세법」 §89② 판정 echo — 세대가 주택과 조합원입주권·분양권을 함께 보유하는가.
   *
   * `"excluded"`면 이 함수가 §89①3호를 끄고 과세로 돌린다. `"undetermined"`면 **종전 동작을
   * 유지**하고 상위(`transfer-tax.ts`)가 경고를 낸다 — 예외 16항 중 입력 경로가 없는 항이
   * 남아 있어, 배제만 켜면 그 예외에 해당하는 세대가 법 근거 없이 불리해지기 때문이다.
   */
  article89Clause2?: Article89Clause2Result;
  /**
   * 적용된 특례 — **빈 배열은 「없음」을 뜻한다**(「아직 안 만듦」이 아니다).
   *
   * `checkExemptionCore`의 비과세·부분과세 반환 지점이 채우고, `checkExemption`이
   * 없으면 `[]`로 정규화한다. 과세 반환 지점(22곳 중 12곳)은 손대지 않았다 —
   * 적용된 특례가 **정말로 없기** 때문이다.
   */
  appliedExceptions: OneHouseAppliedException[];
  /** 조건부·기한(G-3). 비과세·부분과세면 항상 `[]`(이미 충족했으므로 남은 조건이 없다). */
  pending: OneHousePendingCondition[];
  /** 판정 보류 */
  undetermined: OneHouseUndetermined[];
  /** 근거 조문 — `appliedExceptions`·`pending`에서 중복 제거해 모은다(파생값, 입력 아님) */
  legalBasis: string[];
  /**
   * ⚠️ **`highValueThreshold`를 담지 않는다** — 설계 초안은 이 필드를 두라고 적었지만,
   *    넣어 두고 뮤테이션을 돌리니 **12억으로 고정해도 2,067케이스 전건이 통과**했다.
   *    읽는 곳이 없다는 뜻이다. 실제 소비자(안분·장특·재개발)는 전부 P1이 만든 단일 소스
   *    `resolveHighValueHouseThreshold(양도일)`를 **직접** 부른다.
   *    ⇒ 여기서 다시 내보내면 같은 값의 **두 번째 경로**가 생기고, 그 둘이 어긋나도
   *    아무 테스트가 울지 않는다. 판정 메뉴(P4)도 그 함수를 직접 부른다.
   *
   * ⚠️ **`houseCount`도 아직 담지 않는다**(P4-2). 명부→유효 주택 수 도출 함수가 저장소에
   *    없고, 제외 사유를 만드는 `runHouseCountExclusionStep`은 판정 **바깥**(`transfer-tax.ts`
   *    STEP 0.6)에서 돌며 그 입력(`reductions`·`specialHouseExclusions`)이 `OneHouseJudgeInput`에
   *    없다. 지금 부분만 내보내면 「제외 0건」과 「제외를 아직 못 봄」이 구별되지 않는다.
   */
};

/**
 * `checkExemptionCore`가 반환하는 **판정 본체** — 위 결과에서 파생 필드를 뺀 것.
 *
 * `pending`·`undetermined`·`legalBasis`는 분기마다 채우는 값이 아니라 **판정이 끝난 뒤
 * 한 층에서** 모으는 값이라 여기에 두지 않는다. 그래야 과세 반환 12곳을 손대지 않는다.
 */
export type OneHouseCoreVerdict = Omit<
  OneHouseJudgment,
  "pending" | "undetermined" | "legalBasis" | "appliedExceptions"
> & {
  appliedExceptions?: OneHouseAppliedException[];
};
