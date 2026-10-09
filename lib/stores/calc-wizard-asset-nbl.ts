/**
 * 비사업용 토지(NBL) 관련 폼 타입 선언.
 * calc-wizard-asset.ts 800줄 정책에 따라 분리 (2026-05-11).
 */

import type { RentalHousingType } from "@/lib/tax-engine/multi-house-surcharge";
import type { AssetReductionForm, SpecialHouseExclusionFormItem } from "./calc-wizard-asset-reduction";

/** 행에 붙는 조특법 §99의4·§98의9 선언 — 감면 폼과 같은 모양(입력 폼·④ 변환을 그대로 쓴다). */
export type RowCountExclusionReduction = Extract<
  AssetReductionForm,
  { type: "new_99_4_rural" | "new_99_4_hometown" | "unsold_98_9" }
>;

/** 조특법 주택 수 제외 사유 — 한 주택에 하나. `HouseEntry.countExclusion` 주석 참조. */
export type HouseCountExclusionRowFact =
  | { kind: "reduction"; reduction: RowCountExclusionReduction }
  | { kind: "special"; special: SpecialHouseExclusionFormItem };

/** 비사업용 토지 사업용 사용기간 항목 (폼 문자열 버전) */
export interface NblBusinessUsePeriod {
  startDate: string;
  endDate: string;
  usageType: string;
}

/** 소유자 거주 이력 1건 (NBL 재촌 판정용) */
export interface ResidenceHistoryInput {
  sigunguCode: string;
  sigunguName: string;
  startDate: string;
  endDate: string;
  /** 주민등록 여부 — 임야 재촌 필수 요건 */
  hasResidentRegistration: boolean;
  /** 거주지 좌표 (직선거리 30km 재촌 판정용, §153③3호) — 주소검색 파생. string 저장. */
  lat?: string;
  lng?: string;
}

/** 사업용 사용기간 1건 — 목장 사육기간·별장 사용기간 등 (start/end 직접 입력) */
export interface GracePeriodInput {
  type:
    | "inheritance"
    | "legal_restriction"
    | "sale_contract"
    | "construction"
    | "unavoidable"
    | "preparation"
    | "land_replotting";
  startDate: string;
  endDate: string;
  description: string;
}

/** 부득이한 사유 유예기간 1건 (§168의14①·시행규칙 §83의5①) — 종료일 사유별 자동산정 (갭 3b) */
export interface NblGracePeriodInput {
  reasonCode:
    // 시행령 §168의14① 1~3호
    | "use_prohibited"
    | "protected_zone"
    | "inherited_restricted"
    // 시행규칙 §83의5① 1~12호
    | "building_permit_restricted"
    | "construction_start_restricted"
    | "access_road"
    | "public_open_space"
    | "construction_in_progress"
    | "mortgage_or_liquidation"
    | "ownership_litigation"
    | "urban_dev_buildable"
    | "demolition"
    | "business_closure_relocation"
    | "natural_disaster_wasteland"
    | "other_justifiable";
  /** 기산일 (멸실일·건축가능일·사유발생일·event_window 개시일). 6호·5호는 취득일 자동. */
  anchorDate: string;
  /** event_window/4호 종료일. fixed 호(6/8/9/10/11)는 자동산정으로 미사용. */
  endDate: string;
  /** 5호 착공일 */
  secondaryDate?: string;
  /** 5호 건설진행종료일(선택) */
  secondaryEndDate?: string;
  description: string;
}

/** 다른 보유 주택 항목 (폼 문자열 버전) */
export interface HouseEntry {
  id: string;
  region: "capital" | "non_capital";
  acquisitionDate: string;
  officialPrice: string;
  isInherited: boolean;
  isLongTermRental: boolean;
  isApartment: boolean;
  isOfficetel: boolean;
  isUnsoldHousing: boolean;
  /** 취득가액(원, 문자열) — 소형신축·준공후미분양 특례 가액 기준 (§167의3①12가·나목) */
  acquisitionPrice?: string;
  /** 전용면적(㎡, 문자열) — 소형신축 60㎡·미분양 85㎡ 판정 */
  exclusiveArea?: string;
  /** 준공후미분양 여부 (나목 §167의3①12나목) */
  isUnsoldNewHouse?: boolean;
  /** 준공일 (가목 3호 §167의3①12가목 — 2024.1.10~2027.12.31 준공). 미입력 시 가목 미발동 */
  completionDate?: string;
  /** #2a 배우자 단독 보유 주택 여부 (§167의3⑨ 3주택↑ 혼인 5년내 차감 대상). 혼인합가일 입력 시에만 의미 */
  isSpouseOwned?: boolean;
  /**
   * §155④⑤ 합가 전 보유 쪽 — **판정 메뉴 전용** 입력(엔진 `HouseInfo.mergeOrigin`).
   * 합가일보다 나중에 취득한 행은 이 값과 무관하게 「합가 후 취득」으로 본다(날짜가 먼저).
   * 미입력이면 구성 판정을 하지 않는다(구 저장분 호환).
   */
  mergeOrigin?: "seller_side" | "counterpart_side" | "second_merge_side";
  /** 상속개시일 (isInherited=true 시 상속 5년 배제 기산 — 소령 §167의3①7호). 미입력 시 배제 미발동. */
  inheritedDate?: string;
  /** 공동상속주택 여부 (§155③, 2-A2). isInherited=true 시에만 의미 */
  isCoInherited?: boolean;
  /** 공동상속 최대지분 상속인 여부 (§155③ 단서 — true=산입, false·미제공=소수지분 제외후보) */
  isLargestCoInheritedShareholder?: boolean;
  /** 상속개시 당시 피상속인과 동일세대 여부 (§155② 단서 — true=특례 원칙 배제). isInherited=true 시 의미 */
  decedentSameHouseholdAtInheritance?: boolean;
  /** 동거봉양 합가+합가 전 피상속인 보유분 여부 (§155② 단서 예외). 동일세대=true 시에만 의미 */
  parentalCareMergeInheritedHouse?: boolean;
  /**
   * D17 재상속 — 피상속인이 **별도세대**로부터 상속받은 상속주택(§155②)을 피상속인 사망으로 동일세대원인 상속인이
   * 다시 상속받았다. 상속주택 지위를 이어받아 §155② 단서(동일세대 상속 배제)를 받지 않는다(재산세과-2961 ·
   * 부동산납세과-624 · 서면-2022-법규재산-4747 등). 동일세대=true 시에만 의미.
   */
  reInheritedFromSeparateHousehold?: boolean;
  /**
   * P4 양론 C1 — 상속받은 이 주택(또는 그 지분)을 동일세대원(배우자 등)에게 증여했다. 판정 메뉴 전용 입력 —
   * 판정 결론은 바꾸지 않고, 「해석이 갈리는 쟁점」 카드에 반대 입장 결론을 띄운다. 상속주택=true 시에만 의미.
   */
  inheritedGiftedToHouseholdMember?: boolean;
  /** 피상속인 2주택↑ 중 순위상 상속주택 아님 (§155②1~4호 순위 부적격 — true=제외 안 함) */
  isRankingDisqualifiedInheritedHouse?: boolean;

  // ── 1세대1주택 비과세 특례 사실 (D-6 · 영 §155) ──
  /**
   * §155⑥**1호** 국가유산주택 — 이 행의 주택이 지정문화유산·국가등록문화유산·천연기념물등인가.
   *
   * 법문(실독 2026-09-21 · MST 286211): 「다음 각 호의 어느 하나에 해당하는 주택과 그밖의
   * 주택(일반주택)을 국내에 **각각 1개씩** 소유하고 있는 1세대가 일반주택을 양도하는 경우에는
   * 국내에 1개의 주택을 소유하고 있는 것으로 보아 제154조제1항을 적용한다」
   * ⇒ 문화유산주택은 **보유 중인 다른 주택**이므로 명부 행의 속성이다(양도 대상이 아니다).
   *
   * ✅ **두 축에 모두 흐른다** (2026-09-22 — D-6 후속 ①).
   *
   * | 축 | 엔진 칸 | 경유 |
   * |---|---|---|
   * | 비과세 §155⑥1호 | `culturalHeritageHouse` | `deriveOneHouseFactsFromHouses` |
   * | 중과 배제 §167의3①**6호** | `HouseInfo.isCulturalHeritage` | 명부 행 map(단건·다건) |
   *
   * 근거는 **6호 법문이 §155⑥1호를 그대로 인용**한다는 것이다(실독 2026-09-22 · MST 286211):
   * 「6. 제155조제6항제1호에 해당하는 국가유산주택」. §155⑥1호는 주택의 **정의**뿐이고
   * 「각각 1개씩」은 ⑥ **본문**에 있어 6호로 넘어오지 않는다 ⇒ 같은 사실, 같은 칸.
   *
   * ⚠️ 이름이 다른 것은 **필드가 달라서가 아니라** `HouseInfo`가 엔진 타입이고 이쪽이 폼 타입이기
   *    때문이다. 두 축이 **갈라지는** 동명이축(`isUnavoidableReason` ↔
   *    `oneHouseUnavoidableOutsideCapital`)과 혼동하지 말 것
   *    ([[feedback_rename_same_name_two_axes]]).
   */
  oneHouseCulturalHeritage?: boolean;

  /**
   * §155⑦ 농어촌주택 — 이 행의 주택이 상속·이농·귀농 농어촌주택인가.
   *
   * 법문 「… 수도권 밖의 지역 중 읍지역(도시지역안의 지역을 제외한다) 또는 면지역에 소재하는
   * 주택(농어촌주택)과 그 밖의 주택(일반주택)을 국내에 **각각 1개씩** 소유」 ⇒ 명부 행이다.
   */
  oneHouseRuralHouse?: boolean;
  /** §155⑦ 1호 상속 · 2호 이농 · 3호 귀농. */
  ruralHouseKind?: "inherited" | "farm_exit" | "return_to_farm";
  /**
   * 소재 요건(수도권 밖 읍·면, 도시지역 읍 제외) **사용자 지정값**.
   *
   * 🔑 `undefined`면 **자동 판정을 쓴다**(행 주소에서 도출). 종전 세대 단위 필드는 비-optional
   * boolean이라 `false`가 「자동이 아니라고 했다」인지 「사용자가 아니라고 했다」인지 구별되지
   * 않았고, 그래서 `ruralHouseLocationTouched` 플래그가 따로 필요했다. optional로 두면
   * **그 플래그가 사라진다**.
   */
  ruralOutsideCapitalEupMyeon?: boolean;
  /**
   * 읍지역 용도지역 조회 결과 — 「도시지역안의 지역을 제외한다」 판정용.
   *
   * 🔑 **조회 결과(데이터)를 저장하는 것**이지 파생 boolean을 미러링하는 것이 아니다.
   * 종전 세대 단위 구현은 `useEffect`로 파생값을 store에 써 넣었는데(미러링 금지 위반),
   * 여기서는 조회 응답만 남기고 **판정은 읽는 시점에** `judgeRuralHouseLocation`이 한다.
   * 면·수도권·동은 조회 없이 순수 판정되므로 이 값은 **읍일 때만** 채워진다.
   */
  ruralUrbanZone?: "urban" | "non_urban" | "unknown";
  /** 1호 — 피상속인이 취득 후 거주한 연수(5년 이상 요건). */
  ruralDecedentResidenceYears?: string;
  /** 2호 — 이농인이 취득일 후 거주한 연수(5년 이상 요건). */
  ruralOwnerResidenceYears?: string;
  /** 3호 §155⑩3호 — 대지면적(㎡). 660㎡ 이내. */
  ruralLandAreaSqm?: string;
  /** 3호 §155⑩5호 — 세대전원 이사·거주. */
  ruralWholeHouseholdMoved?: boolean;
  /** 3호 §155⑩2호 — 취득 당시 고가주택 해당(해당하면 귀농주택 요건 불충족). */
  ruralHighPriceAtAcquisition?: boolean;
  /**
   * 2호·3호 — 이 주택에 5년 이상 거주하다 이농한 뒤 **다시 이 주택으로 돌아와** 영농·영어에 종사하고 있다(재귀농).
   * 그러면 영농 목적으로 취득한 귀농주택이 아니고(재산세과-1504 · 부동산납세과-67) 이농주택 특례도 적용되지
   * 않는다(부동산납세과-67). `undefined`는 「아직 답하지 않음」 — ⑧이 막는다(모름은 불리).
   */
  ruralReturnedToFarmExitHouse?: boolean;
  // ⚠️ 귀농주택 **취득일**은 별도 칸이 없다 — §155⑦ 단서의 「그 주택을 취득한 날」이
  //    곧 이 행의 `acquisitionDate`다. 소재지도 행의 `addressJibun`·`regionCode`를 쓴다.

  /**
   * §155⑧ — 부득이한 사유로 취득한 **수도권 밖** 주택.
   *
   * 법문 「재정경제부령으로 정하는 취학, 근무상의 형편, 질병의 요양, 그 밖에 부득이한 사유로
   * 취득한 **수도권 밖에 소재하는 주택**과 그 밖의 주택(일반주택)을 국내에 **각각 1개씩**
   * 소유하고 있는 1세대가 부득이한 사유가 **해소된 날부터 3년 이내**에 일반주택을 양도하는
   * 경우에는 …」(실독 2026-09-21 · MST 286211)
   *
   * ⛔ **`isUnavoidableReason`과 다른 호다 — 한 토글로 합치지 말 것.**
   *
   * | | `isUnavoidableReason` | 이 필드 |
   * |---|---|---|
   * | 조문 | 영 §167의10①**3호** | §155⑧ = 영 §167의10①**4호** |
   * | 축 | 중과 배제 전용 | **비과세 + 중과 배제** |
   * | 기준시가 | 취득 당시 **3억 이하** | 요건 **없음** |
   * | 거주 | **1년 이상** | 요건 **없음** |
   * | 소재 | 제한 없음 | **수도권 밖** |
   *
   * 엔진에서 **4호가 3호보다 먼저 early-return** 한다
   * (`multi-house-surcharge-exclusion.ts:547` vs `:567`) — 합치면 3호 요건이 4호에 붙어
   * 조용히 좁아진다([[feedback_one_field_serving_two_legal_axes]]).
   */
  oneHouseUnavoidableOutsideCapital?: boolean;
  /** §155⑧ 부득이한 사유 종류 — 소칙이 정하는 4종. */
  unavoidableOutsideCapitalReason?: "study" | "work" | "illness" | "other";
  /**
   * §155⑧ 사유 **해소일**. 미입력 = 미해소 ⇒ 기한이 기산되지 않는다(계획서 W-1).
   * ⚠️ 3호의 `unavoidableReasonResolvedDate`와 **다른 칸**이다 — 요건이 다르므로 공유하지 않는다.
   */
  unavoidableOutsideCapitalResolvedDate?: string;
  // ⚠️ 「수도권 밖」 요건에 별도 칸을 두지 않는다 — 행의 `regionCode`로 판정한다.
  //    다만 이 PR은 **순수 이관**이라 엔진 게이트를 새로 넣지 않고 화면 경고로만 알린다.
  /**
   * 조특법 **주택 수 제외** — 이 주택을 「소유주택이 아닌 것으로 보는」 사유 (판정 메뉴 행 사실).
   *
   * §99의4(농어촌·고향)·§98의9(준공후미분양)·감면주택(§98 등)은 법문의 대상이 「그 주택」이라
   * 세대 단위 선언이 아니라 **행의 속성**이다 — §155⑥⑦⑧(D-6)과 같은 결정
   * (`docs/00-pm/one-house-judgment-count-exclusion-row-link.plan.md`). 종전에는 선언이 명부와
   * 따로 놀아 신규 주택 후보에 섞이거나(일시적 2주택 불성립) 명부에 없는 주택을 빼 주었다.
   *
   * 🔑 취득일·주소·취득가액·전용면적·수도권 여부는 **행 값**을 쓴다 — 선언의 같은 칸은
   *    `lib/calc/house-count-exclusion-rows.ts`가 행 값으로 덮어쓴다(두 벌 입력 금지).
   * ⚠️ `isUnsoldHousing`(중과 배제, 소령 §167의3①5호)과 **다른 축**이다 — 그 행은 주택 수에 산입한다.
   * 판정 메뉴와 계산기가 모두 이 행에서 받는다(계산기: `transfer-calc-count-exclusion-row-link.plan.md` —
   * 판정 → 계산기 전달도 행째로 넘긴다).
   */
  countExclusion?: HouseCountExclusionRowFact;
  /**
   * §167의3①3호 감면대상장기임대주택 사실 — `TaxIncentiveRentalFacts` 주석 참조.
   * 「5년 이상 임대」·「국민주택」은 장기임대(2호)와 **같은 칸**(`rentalPeriodYears`·`isNationalSizeHousing`)을
   * 쓴다 — 한 주택의 같은 사실이라 두 벌로 두면 두 진실이 된다.
   */
  isTaxIncentiveRental?: boolean;
  isTaxIncentiveRentalPurchase?: boolean;
  taxIncentiveRentalRegistrationType?: TaxIncentiveRentalRegistrationType;
  isUrbanLifeHousingApartment?: boolean;
  taxIncentiveRentalAptDeadlineExtension?: AptDeadlineExtensionForm;
  /**
   * 장기임대 등록임대 경로(legacy) 정밀 입력 — isLongTermRental=true 시.
   * 엔진 isLongTermRentalHousingExempt legacy 분기: 등록사업자 + 등록일 2종 + 임대기간 5년↑ → 배제.
   * (가~자목 9유형 세부 매트릭스는 후속 과제 — rentalType 미노출.)
   */
  isRegisteredRental?: boolean;
  /** 임대사업자 등록일 */
  rentalRegistrationDate?: string;
  /** 사업자 등록일 */
  businessRegistrationDate?: string;
  /** 임대기간(년) — 5년 이상이면 legacy 배제 충족 */
  rentalPeriodYears?: string;
  /** 임대사업자 말소일 (양도일 이전 말소 시 임대 배제 해제) */
  rentalCancelledDate?: string;

  // ── 장기임대 9유형 매트릭스 (가~자목) — 신규 18필드 ──
  /**
   * 장기임대주택 유형 (가~자목).
   * 설정 시 엔진이 유형별 정밀 검사(isLongTermRentalHousingExempt) 수행.
   * 미설정 시 legacy boolean 경로.
   */
  rentalType?: RentalHousingType;
  /** 임대료 증가율 5% 이하 충족 여부 — A·C·E·F·H·I */
  rentIncreaseUnder5Pct?: boolean;
  /**
   * 5%를 넘게 올린 임대차계약의 체결·갱신일(YYYY-MM-DD · 여럿이면 가장 늦은 날) — 가·다·마·바목(사목 base 포함).
   * 대통령령 제29523호 부칙 제6조: 5% 요건은 2019-02-12 이후 체결·갱신 계약분부터. ⑤·④ 범위는
   * `rentIncreaseContractDateInScope`(등록 2019-02-12 전 + 미충족 선언일 때만 묻고 싣는다).
   */
  rentIncreaseContractDate?: string;
  /** 국민주택규모(85㎡ 이하) 여부 — B */
  isNationalSizeHousing?: boolean;
  /** 같은 시·군 내 2호 이상 보유 여부 — B·C·F·I */
  hasMinimum2Units?: boolean;
  /** 같은 시·군 내 5호 이상 보유 여부 — D */
  hasMinimum5UnitsInCity?: boolean;
  /** 대지면적 (㎡, 폼 문자열) — C·D·F·I (298㎡ 이하 요건) */
  rentalLandArea?: string;
  /** 연면적 (㎡, 폼 문자열) — C·D·F·I (149㎡ 이하 요건) */
  rentalTotalFloorArea?: string;
  /** 분양전환 여부 — C·F */
  isConvertedToSale?: boolean;
  /** 최초 분양계약일 (YYYY-MM-DD) — D */
  firstSaleContractDate?: string;
  /** 취득 당시 공시가격 (원, 폼 문자열) — B·D */
  acquisitionOfficialPrice?: string;
  /** 임대개시 당시 공시가격 (원, 폼 문자열) — A·C·E·F·H·I */
  rentalStartOfficialPrice?: string;
  /** 임대의무기간 1/2 이상 충족 여부 — G */
  hasHalfDutyPeriodMet?: boolean;
  /** 말소일 이후 1년 이내 양도 여부 — G */
  isSoldWithin1YearOfCancellation?: boolean;
  /** 자진·자동 말소일 (YYYY-MM-DD) — G (rentalCancelledDate와 별개) */
  rentalCancellationDate?: string;
  /** 사목(G) base 목 (가·다·라·마) — §167조의3①2호 사목 "해당 목의 다른 요건" 검증 대상 */
  saMokBaseArticle?: "가" | "다" | "라" | "마";
  /** 2018.9.14 이후 조정지역 취득 제외 해당 여부 — E·H */
  isExcluded918Rule?: boolean;
  /** 2020.7.11 이후 등록 아파트 제외 해당 여부 — D·E */
  isExcludedAfter20200711Apt?: boolean;
  /** 단기→장기 변경신고 제외 해당 여부 — E·F */
  isExcludedShortToLongChange?: boolean;
  /** 계약금 지급 증빙 보유 여부 — H (조정지역 2018.9.14 취득 예외) */
  hasContractDepositProof?: boolean;
  /**
   * §167의3⑪ 기한 연장 사실 — 가목2)·나목2)·라목8)·마목4) **아파트**일 때만 묻는다(A·B·D·E).
   * 미입력(undefined) = 「모름」 → 엔진은 기한 2027.12.31. + 확인 필요 고지. ⑤·④·⑧ 범위는 `lib/calc/apt-deadline-extension-scope.ts`.
   * 3호 칸(`taxIncentiveRentalAptDeadlineExtension`)과 별개다(호마다 입력 화면이 다르다).
   */
  rentalAptDeadlineExtension?: AptDeadlineExtensionForm;

  // ── P2 특수 배제 사유 (다른 보유 주택 기준 — 2주택 전용·인구감소) ──
  /** 부득이한 사유(취학·근무·질병) 취득 주택 — 소령 §167의10①3호 (기준시가 3억↓·1년↑ 거주) */
  isUnavoidableReason?: boolean;
  /** 부득이한 사유 주택 거주기간(년) — 1년 이상 요건 */
  unavoidableResidenceYears?: string;
  /** 부득이한 사유 해소일 (YYYY-MM-DD) — 해소 후 3년 이내 양도 시 배제 유지 */
  unavoidableReasonResolvedDate?: string;
  /** 「양도일 현재 사유가 해소되지 않음」 — 해소일과 택일(`two-house-exclusion-status.ts`). 둘 다 없으면 ⑧ 차단 */
  unavoidableReasonUnresolved?: boolean;
  /** 소송으로 취득/소송 진행 중 주택 — 소령 §167의10①7호 */
  isLitigationHousing?: boolean;
  /** 소송 **확정판결일** (YYYY-MM-DD) — 3년 이내면 배제. 필드명은 legacy(F-17). 미입력은 더 이상 「진행 중」이 아니다 */
  litigationAcquisitionDate?: string;
  /** 「양도일 현재 소송 진행 중」 — 확정판결일과 택일(`two-house-exclusion-status.ts`). 둘 다 없으면 ⑧ 차단 */
  litigationPending?: boolean;
  /** 정비구역(재개발·재건축) 지정 주택 — 기준시가 1억↓ 소형 배제에서 제외(정비구역은 산입) */
  isRedevelopmentZone?: boolean;
  /** 인구감소지역 소재 주택 — 소령 §167의3①12 다·라목 (세컨드홈 특례) */
  isPopulationDeclineArea?: boolean;
  /** 세컨드홈 특례 등록 여부 — 인구감소지역 주택 수 제외 신청 */
  isSecondHomeRegistered?: boolean;
  /** 인구감소지역 유형 (다목 decline 9억 / 라목 interest 4억) — 가액한도 구분 */
  populationAreaType?: "decline" | "interest";

  // ── 소재지 주소검색 (AddressSearch 재표시 + regionCode 파생 · 공시가격/전유면적 자동조회) ──
  addressRoad?: string;
  addressJibun?: string;
  buildingName?: string;
  addressDetail?: string;
  addressDong?: string;
  addressHo?: string;
  longitude?: string;
  latitude?: string;
  /** 법정동 10자리 (PNU 앞 10자리) — §167의3 지역기준 판정. 있으면 지역 구분 자동 파생 */
  regionCode?: string;
  /**
   * 소재 법정동이 「동 안 일부 지구만 조정대상지역」인 동일 때 — 지정 지구 안인가(사용자 선언). 주소를 바꾸면 지운다.
   * 엔진 `isRegulatedByBjdCode`의 `inDistrict`. 미선언 = 지정(모름=불리) + 확인 필요.
   */
  inDesignatedDistrict?: boolean;
  /** 19자리 PNU — UI 재조회용 */
  addressPnu?: string;
  /** 공시가격·전유면적을 주소조회로 자동채움한 표식 — 사용자 수정 시 제거(조회값 배지) */
  addressLookupFilled?: boolean;
  /** 공시가격 조회 기준연도 (사용자 선택) — UI 전용, 엔진 미전송 */
  officialPriceYear?: string;
}

/**
 * §167의3①2호 장기임대주택 선언 묶음 — **명부 행과 양도 주택이 공유**한다.
 *
 * ## 왜 공유하는가 — 9목 전부가 「양도하는 그 주택」에도 성립한다
 *
 * 법문(실독 2026-09-22 · MST 286211)은 2호의 가~자목 어디에도 「임대주택 **외의** 주택을
 * 양도하는 경우」라는 제한을 두지 않는다. 오히려 그 반대다:
 *   · **사목** = 「등록 말소 이후 1년 이내 **양도하는** 주택」 — 문언 자체가 양도 주택이다.
 *   · **라목** = 「해당 주택을 **양도하는** 거주자는 … 미분양주택 확인서 사본 … 제출해야 한다」.
 *
 * ⇒ 「양도 주택에는 일부 목만 쓰인다」는 추정은 **법문으로 반증됐다**. 목을 골라낼 수 없으므로
 *   명부 행의 매트릭스를 그대로 공유한다 — 복제하면 두 진실이 된다.
 *
 * 🔑 `Partial`인 이유: 명부 행은 `isLongTermRental`·`isApartment`가 필수지만, 양도 주택은
 *   이 묶음 자체가 `sellingHouseExclusion.longTermRental`로 **선택적**이다(미선언 = 장기임대 아님).
 *   `HouseEntry`는 이 타입에 구조적으로 대입되므로 매트릭스 위젯을 양쪽이 함께 쓴다.
 */
export type RentalDeclaration = Partial<
  Pick<
    HouseEntry,
    // 공통 — 아파트 여부는 아·자목 일괄 제외 / 가·마목 2020.7.11 이후 등록 제외의 판정 입력이다
    | "isLongTermRental"
    | "isApartment"
    // legacy 등록 경로 (rentalType 미선택 시)
    | "isRegisteredRental"
    | "rentalRegistrationDate"
    | "businessRegistrationDate"
    | "rentalPeriodYears"
    | "rentalCancelledDate"
    // 9유형 매트릭스 (가~자목)
    | "rentalType"
    | "rentIncreaseUnder5Pct"
    | "rentIncreaseContractDate"
    | "isNationalSizeHousing"
    | "hasMinimum2Units"
    | "hasMinimum5UnitsInCity"
    | "rentalLandArea"
    | "rentalTotalFloorArea"
    | "isConvertedToSale"
    | "firstSaleContractDate"
    | "acquisitionOfficialPrice"
    | "rentalStartOfficialPrice"
    | "hasHalfDutyPeriodMet"
    | "isSoldWithin1YearOfCancellation"
    | "rentalCancellationDate"
    | "saMokBaseArticle"
    | "isExcluded918Rule"
    | "isExcludedAfter20200711Apt"
    | "isExcludedShortToLongChange"
    | "hasContractDepositProof"
    // §167의3⑪ 기한 연장 사실 (아파트 가·나·라·마목)
    | "rentalAptDeadlineExtension"
  >
>;

/** 3호 후단 등록 유형 — 종전 민특법 §2 5호(장기일반)·6호(단기)·그 외. 미입력(undefined) = 모름. */
export type TaxIncentiveRentalRegistrationType = "long_term_general" | "short_term" | "other";

/**
 * §167의3⑪ 기한 연장 사실 — 엔진 `AptTransferDeadlineExtension`의 폼 문자열판(YYYY-MM-DD).
 *
 * 🔑 3-state(`status`): undefined = 「모름」(기한 2027.12.31. + 확인 필요 고지) · "none" = 「연장 사유 없음」 확인(기한 2027.12.31. 확정) ·
 *    "has" = 「연장 사유 있음」(아래 날짜). 「있음」을 고른 뒤 날짜가 비어 있어도 그 선택이 유지되도록 모드를
 *    데이터에서 파생하지 않는다(빈 값 자기-소멸 방지). #1914 이전 저장분(status 없음 + 날짜)은 「있음」으로 읽는다
 *    — 해석은 `aptDeadlineExtensionStatus` 한 곳(⑤·④·⑧ 공용).
 */
export interface AptDeadlineExtensionForm {
  status?: "none" | "has";
  /** ⑪1호 — 임대의무기간 2027.1.1 이후 종료 주택의 등록말소일 */
  dutyPeriodEndCancellationDate?: string;
  /** ⑪2호 — 2027.1.1 이후 조정대상지역 신규 지정 공고일 */
  newRegulatedAreaAnnouncementDate?: string;
  /** ⑪3호 — 재건축·재개발·소규모정비 이전고시일 */
  relocationAnnouncementDate?: string;
  /** ⑪3호 — 그 사업의 인가 또는 지정일. 비어 있으면 모름(3호 불성립 — 결론을 가를 때 확인 필요 고지) */
  relocationAuthorizationDate?: string;
  /** ⑪3호 — 양도일 현재 이전고시 전(이전고시일과 상호 배타 — ⑤ onChange가 정리) */
  relocationNotYetAnnounced?: boolean;
  /**
   * ⑪3호 단서 — 협의·수용재결·매도청구소송에 따른 양도. undefined = 모름(구 저장분 포함) · false 아니오 · true 예.
   * 3호 사업 사실이 있을 때만 화면에 나오고 전송된다(`aptDeadlineRelocationFactPresent`).
   */
  relocationExpropriationTransfer?: boolean;
}

/**
 * 소령 §167의3①3호 「감면대상장기임대주택」 선언 — **명부 행과 양도 주택이 공유**한다.
 *
 * 법문(MST 290841 실독): 「「조세특례제한법」 제97조ㆍ제97조의2 및 제98조에 따라 양도소득세가 감면되는
 * 임대주택으로서 5년 이상 임대한 국민주택」 + 후단(아파트 민간매입 장기일반·단기 → ⑪ 기한까지 양도).
 *
 * 🔑 후단 4사실은 **3-state**다 — 미입력(undefined)은 「모른다」이고 엔진이 불리 적용(후단 대상으로 보고 ⑪ 기한 적용 +
 *    결론이 갈리면 확인 필요 고지)한다(사용자 결정 2026-10-04 · `isTaxIncentiveRentalAptDeadlinePending`). false로 채우지 말 것.
 * 🔑 명부 행은 `rentalPeriodYears`·`isNationalSizeHousing`·`isApartment`를 2호와 같은 칸으로 쓰고,
 *    양도 주택은 그 세 칸을 `sellingHouseExclusion.taxIncentiveRental` 묶음에 둔다(2호 선언과의 공유는
 *    `lib/calc/tax-incentive-rental-scope.ts`가 정한다).
 */
export type TaxIncentiveRentalFacts = Partial<
  Pick<
    HouseEntry,
    | "isTaxIncentiveRental"
    | "isTaxIncentiveRentalPurchase"
    | "taxIncentiveRentalRegistrationType"
    | "isUrbanLifeHousingApartment"
    | "taxIncentiveRentalAptDeadlineExtension"
    | "rentalPeriodYears"
    | "isNationalSizeHousing"
    | "isApartment"
  >
>;

/**
 * 세대 보유 분양권·입주권 항목 (폼 문자열 버전).
 * 소령 §167의11·§167의3①: 2021.1.1 이후 취득분은 주택 수 산정에 포함.
 */
export interface PresaleRightEntry {
  id: string;
  /** 분양권 / 입주권(재개발·재건축 조합원입주권) */
  type: "presale_right" | "redevelopment_right";
  acquisitionDate: string;
  region: "capital" | "non_capital";
  /** 지역기준 (REGION 수도권·광역시·세종 / VALUE 지방) — 3억 배제 판정 (§167의4②1호) */
  regionCriteria?: "REGION" | "VALUE";
  /** 가액(원, 문자열) — 분양권 공급가격/입주권 종전주택가격 */
  rightValue?: string;
  /** #2b 배우자 단독 보유 분양권/입주권 (§167의4⑤ 3↑ 혼인 5년내 차감 대상). 혼인합가일 입력 시에만 의미 */
  isSpouseOwned?: boolean;
  /**
   * 소재지 코드 — 공급주택 시·군·구 판정용 (인구감소지역 세컨드홈 다·라목 2호 동일 시·군·구 비교).
   * 주소검색 PNU 앞 10자리 또는 시·군·구 5자리(앞 5자리만 사용).
   */
  regionCode?: string;
  /**
   * 소재 법정동이 「동 안 일부 지구만 조정대상지역」인 동일 때 — 지정 지구 안인가(사용자 선언). 주소를 바꾸면 지운다.
   * 엔진 `isRegulatedByBjdCode`의 `inDistrict`. 미선언 = 지정(모름=불리) + 확인 필요.
   */
  inDesignatedDistrict?: boolean;
  /** 소재지 주소 요약 — UI 표시 전용(AddressSearch 선택 결과). 엔진/API 미전송. */
  regionName?: string;
  /**
   * 상속받은 권리인가 — 「소득세법 시행령」 §156의2⑥·⑦ · §156의3④·⑤ (§89② 배제의 예외).
   * 순위 규칙은 미구현이라, 엔진은 이 값을 **판정 불가 신호**로만 쓴다(잘못된 배제 방지).
   */
  /**
   * 관리처분계획 인가일(「주택건설촉진법」 §33 주택재건축 사업계획승인일 포함) — **조합원입주권 전용**.
   *
   * §89②의 조합원입주권 축 시행일 게이트(법률 제7837호 부칙 §12①). 분양권은 취득일 축이라
   * 이 값을 쓰지 않는다. 미입력은 원칙(적용)으로 읽는다.
   */
  managementDisposalApprovalDate?: string;
  /**
   * 조합원입주권 취득 경위 — **조합원입주권 전용**. `acquisitionDate`는 기존주택 원조합원이면 기존주택 취득일,
   * 상가·토지 원조합원이면 관리처분계획인가일, 승계취득이면 승계취득일이다.
   * 기존주택 원조합원은 §155①, 나머지는 §156의2③·④(엔진 `one-house/original-member-right.ts`).
   * 1세대1주택 비과세 판정 대상(주택 양도)이면 필수(⑧).
   */
  memberOrigin?: "original_house" | "original_non_house" | "successor";
  /*
   * 기존주택 원조합원 전용(§155① — 엔진 `one-house/original-member-right.ts`). 다른 경위로 바꾸면 ④가 싣지 않는다.
   */
  /** §155①2호 가목 — 기존주택으로 세대전원 이사·전입신고한 날(YYYY-MM-DD) */
  originalMemberMoveInDate?: string;
  /** §155①2호 단서 — 기존주택 취득일 현재 기존 임차인이 거주했다 */
  originalMemberExistingTenant?: boolean;
  /** §155①2호 단서 — 전 소유자와 임차인 간 임대차계약 종료일(YYYY-MM-DD) */
  originalMemberTenantLeaseEndDate?: string;
  /** §155⑱ 처분기한 예외 사유("" = 해당 없음) */
  originalMemberDisposalDelayReason?: string;
  isInherited?: boolean;
  /**
   * §156의2⑥·⑦ · §156의3④·⑤ 상속 권리 인정 요건 — `isInherited === true`일 때만 의미.
   * 순위는 **계산하지 않고 자기선언**으로 받는다(주택 축 §155②③과 같은 규약).
   */
  isRankingDisqualifiedInheritedRight?: boolean;
  isCoInherited?: boolean;
  isLargestCoInheritedShareholder?: boolean;
  /** 피상속인이 상속개시 당시 **주택**을 소유했는가 — ⑮ 선택으로도 면제되지 않는다 */
  decedentOwnedHouseAtDeath?: boolean;
  /** 피상속인이 **다른 종류의 권리**를 소유했는가 — ⑮ 선택이 이 요건만 면제한다 */
  decedentOwnedOtherRightTypeAtDeath?: boolean;
  /** ⑥ 단서 — 상속개시 당시 상속인·피상속인이 1세대였는가 */
  decedentSameHouseholdAtInheritance?: boolean;
  /** ⑥ 단서의 예외 — 동거봉양 합가 전부터 보유하던 주택이 전환된 경우 */
  parentalCareMergeInheritedRight?: boolean;
  /**
   * 상속받은 **분양권** — 피상속인이 그 분양권을 취득한 날(YYYY-MM-DD). `acquisitionDate`는 상속개시일이다.
   * 동일세대 상속이면 2021.1.1. 적용례(§89②·§104⑦)를 이 날로 본다(재산세제과-1033). 분양권·상속 행에서만 싣는다.
   */
  decedentAcquisitionDate?: string;
}

/**
 * 비사업용 토지(NBL) 필드 초기값 **명세** (800줄 분리, 2026-06-15).
 *
 * ⚠️ `makeDefaultAsset`은 이 상수를 **spread하지 않는다** — 모듈 상수라
 * `nblOtherParcels: []`·`nblFactorySegments: []` 같은 배열 필드를 spread하면
 * 모든 자산이 **같은 배열 인스턴스를 공유**한다. factory는 호출마다 새 값을 만든다.
 *
 * 그래서 두 목록이 벌어질 수 있고 실제로 15필드(공장·복합용도 클러스터)가 벌어져 있었다(COV-5).
 * 일치는 `__tests__/lib/stores/nbl-defaults-and-migrate-guards.anchor.test.ts`가 강제한다 —
 * **신규 NBL 필드는 이 상수와 factory 양쪽에 넣어야 하고, 빠뜨리면 그 테스트가 실패한다.**
 */
export const NBL_DEFAULTS = {
  isNonBusinessLand: false,
  nblUseDetailedJudgment: false,
  nblLandType: "" as "" | "farmland" | "forest" | "pasture" | "housing_site" | "villa_land" | "other_land",
  nblZoneType: "",
  nblBusinessUsePeriods: [] as NblBusinessUsePeriod[],
  nblLandSigunguCode: "",
  nblLandSigunguName: "",
  nblResidenceHistories: [] as ResidenceHistoryInput[],
  nblExemptInheritBefore2007: false,
  nblExemptInheritDate: "",
  nblExemptLongOwned20y: false,
  nblExemptAncestor8YearFarming: false,
  nblExemptPublicExpropriation: false,
  nblExemptPublicNoticeDate: "",
  nblExemptFactoryAdjacent: false,
  nblExemptJongjoongOwned: false,
  nblExemptJongjoongAcqDate: "",
  nblExemptUrbanFarmlandJongjoong: false,
  nblExemptInong: false,
  nblExemptInongDate: "",
  nblDeemedTransferReason: "none",
  nblDeemedTransferDate: "",
  nblUrbanIncorporationDate: "",
  nblIsMetropolitanArea: "" as "" | "yes" | "no" | "unknown",
  nblLandDivision: "" as "" | "dong" | "eup_myeon",
  nblFarmingSelf: false,
  nblDisqualifiedTaxPeriods: "",
  nblFarmerResidenceDistance: "",
  nblFarmlandIsWeekendFarm: false,
  nblFarmlandIsConversionApproved: false,
  nblFarmlandIsFarmDevZone: false,
  nblFarmlandIsMarginalFarm: false,
  nblFarmlandIsReclaimedLand: false,
  nblFarmlandIsPublicProjectUse: false,
  nblFarmlandIsSickElderlyRental: false,
  nblForestHasPlan: false,
  nblForestIsPublicInterest: false,
  nblForestIsProtected: false,
  nblForestIsSuccessor: false,
  nblForestInheritedWithin3Years: false,
  nblForestInheritanceDate: "",
  nblPastureIsLivestockOperator: false,
  nblPastureLivestockType: "",
    nblPastureHasFacility: false,
    nblPastureHasGrassland: false,
    nblPastureHasFodder: false,
  nblPastureLivestockCount: "",
  nblPastureLivestockPeriods: [] as GracePeriodInput[],
  nblPastureInheritanceDate: "",
  nblPastureIsSpecialOrgUse: false,
  nblHousingFootprint: "",
  nblVillaUsePeriods: [] as GracePeriodInput[],
  nblVillaIsEupMyeon: false,
  nblVillaIsRuralHousing: false,
  nblVillaBuildingFloorArea: "",
  nblVillaAttachedLandArea: "",
  nblVillaCombinedStdValue: "",
  nblVillaIsInRestrictedArea: false,
  nblVillaIsAfter20150101: false,
  nblOtherPropertyTaxType: "",
  nblOtherBuildingValue: "",
  nblOtherLandValue: "",
  nblOtherIsRelatedToResidence: false,
  nblOtherHasBuilding: false,
  nblOtherBuildingFloorArea: "",
  // §168의11① 호별 면적기준 (갭 3a)
  nblOtherRelatedBusinessType: "",
  nblOtherStandardAreaLimit: "",
  nblOtherMaxAnnualArea: "",
  nblOtherYouthCapacity: "",
  nblOtherMinGarageArea: "",
  nblOtherSportsFacilityType: "", nblOtherReserveUnitSize: "", nblOtherReserveFacilities: [] as string[], nblOtherSportsCategory: "workplace", nblOtherEmployeeCount: "", nblOtherEmployeeFacilityKinds: [] as string[], nblOtherResortOutdoorArea: "", nblOtherResortParkingStdArea: "", nblOtherResortBuildingArea: "", nblOtherSportsPlayerCount: "", nblOtherIndoorNotInstalled: false, nblOtherSportsExtraEvents: [] as string[], nblOtherIndoorFloorArea: "", nblOtherResortBuildingFloorArea: "",
  // §168의11② 수입금액비율 (기타토지 — 2호다목·10·11다·12호 특정 업종)
  nblRevenueBusinessType: "" as
    | ""
    | "parking_operation"
    | "mineral_spring"
    | "fish_farm_other"
    | "block_stone_pipe_mfg"
    | "landscaping_floriculture"
    | "vehicle_repair_academy"
    | "agriculture_academy"
    | "wholesale_retail",
  nblRevenueCurrentRevenue: "",
  nblRevenueCurrentLandValue: "",
  nblRevenuePriorRevenue: "",
  nblRevenuePriorLandValue: "",
  nblRevenueCurrentBusinessStartDate: "",
  nblRevenuePriorBusinessDays: "",
  nblRevenueCurrentDeposit: "",
  nblRevenueCurrentRentDays: "",
  nblRevenuePriorDeposit: "",
  nblRevenuePriorRentDays: "",
  nblRevenueCommonApportion: false,
  nblRevenueCommonRevenue: "",
  nblRevenueOtherLandValue: "",
  nblRevenuePriorCommonRevenue: "",
  nblRevenuePriorOtherLandValue: "",
  nblGracePeriods: [] as NblGracePeriodInput[],
  // §83의5① 단서 — 부동산매매업 매매용부동산(1·2호 배제) 게이트
nblOtherMixedUseMode: "",
  nblOtherMixedUseSpecificFloorArea: "",
  nblOtherMixedUseTotalFloorArea: "",
  nblOtherMixedUseSpecificFootprint: "",
  nblOtherMixedUseTotalFootprint: "",
  nblOtherUseParcels: false,
  nblOtherParcels: [],
  nblFactoryEnabled: false,
  nblFactoryLocationCategory: "",
  nblFactoryTotalLandArea: "",
  nblFactorySegments: [],
  nblFactoryIsRestrictedZone: false,
  nblFactoryAdditionalRecognizedArea: "",
  nblFactorySportsEmployeeCount: "",
  nblFactorySportsEntityType: "" as "" | "corporation" | "individual",
  nblFactorySportsPlaygroundArea: "",
  nblFactorySportsCourtArea: "",
  nblFactorySportsIndoorFloorArea: "",
  nblFactoryFootprintArea: "",
  nblFactoryIsUnregistered: false,
  nblBusinessIsRealEstateDealer: false,
} as const satisfies Record<string, unknown>;
