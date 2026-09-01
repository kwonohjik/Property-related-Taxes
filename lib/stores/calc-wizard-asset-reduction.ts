/**
 * 자산별 감면 폼 타입.
 * Zod reductionSchema(lib/api/transfer-tax-schema.ts)와 1:1 대응.
 * 숫자 입력 필드는 string 타입(빈 문자열 = 미입력).
 * calc-wizard-asset.ts 800줄 정책에 따라 분리 (2026-05-11).
 */

export type AssetReductionForm =
  | {
      type: "self_farming";
      /** 본인 자경기간(년) */
      farmingYears: string;
      /** 피상속인 자경기간(년) — 상속 취득 + 본인 미달 시 합산 (조특령 §66⑪) */
      decedentFarmingYears?: string;
      /** 주거·상업·공업지역 편입 부분감면 적용 여부 (조특령 §66⑤⑥) */
      useSelfFarmingIncorporation?: boolean;
      /** 편입일 (YYYY-MM-DD) */
      selfFarmingIncorporationDate?: string;
      /** 편입 지역 유형 */
      selfFarmingIncorporationZone?: "residential" | "commercial" | "industrial" | "";
      /** 편입일 당시 기준시가 (원) */
      selfFarmingStandardPriceAtIncorporation?: string;
      /** 취득시 기준시가 (원) — 편입 부분감면 비율 산정용(실지 모드 전용 입력, 환산 모드는 자산-수준 fallback) */
      selfFarmingStandardPriceAtAcquisition?: string;
      /** 양도시 기준시가 (원) — 편입 부분감면 비율 산정용(실지 모드 전용 입력, 환산 모드는 자산-수준 fallback) */
      selfFarmingStandardPriceAtTransfer?: string;
    }
  | {
      type: "long_term_rental";
      /** 임대기간(년) */
      rentalYears: string;
      /** 임대료 인상률(%) — 5% 이하 요건 */
      rentIncreaseRate: string;
    }
  | {
      type: "new_housing";
      /** 소재지 유형 — 감면율 결정 */
      reductionRegion: "metropolitan" | "non_metropolitan" | "outside_overconcentration";
    }
  | {
      type: "unsold_housing";
      /** 소재지 유형 */
      reductionRegion: "metropolitan" | "non_metropolitan" | "outside_overconcentration";
    }
  | {
      type: "public_expropriation";
      /** 현금 보상액 (원) */
      expropriationCash: string;
      /** 채권 보상액 (원) */
      expropriationBond: string;
      /** 채권 만기보유 특약 */
      expropriationBondHoldingYears: "none" | "3" | "5";
      /** 사업인정고시일 (YYYY-MM-DD) */
      expropriationApprovalDate: string;
      /**
       * 수용된 토지를 **거주자가 직접 경작**했는가 — **농어촌특별세 비과세 판정 전용**.
       *
       * 「농어촌특별세법 시행령」 §4①1호가 §77 감면의 농특세 비과세를 「「조세특례제한법」
       * 제69조제1항 본문에 따른 거주자가 **직접 경작한 토지**(8년 이상 경작할 것의 요건은
       * 적용하지 아니한다)로 **한정**」한다.
       * ⚠️ §69 자경농지 **감면** 요건(8년)과 별개다 — 조문이 그 요건을 적용하지 않는다고 명시한다.
       * ⚠️ 미체크는 「입증되지 않음」이라 농특세가 부과된다(비과세가 예외다).
       */
      expropriationSelfCultivated?: boolean;
    }
  | {
      // 조특법 §77의3 — 개발제한구역 매수 토지 감면
      type: "gb_designated_land";
      /** ①구역 내 / ②해제 후 */
      gbBranch: "in_zone" | "released";
      /**
       * ① 매수 경로 — 「개발제한구역법」 §17 토지매수의 청구 / §20 협의매수.
       * 3-state: "" 미선택(⑧ 차단) · 두 경로의 **대상 범위가 달라** 기본값을 줄 수 없다
       * (§17①은 「매수대상토지」로 토지만, §20①은 「토지와 그 토지의 정착물」).
       * ②(released)는 공익사업법 경로라 이 축을 쓰지 않는다.
       */
      gbPurchaseRoute?: "" | "claim" | "negotiated";
      /** 개발제한구역 지정일 (YYYY-MM-DD) */
      gbDesignationDate: string;
      /** ①매수청구·협의매수일 / ②사업인정고시일 (YYYY-MM-DD) */
      gbTriggerDate: string;
      /** ②해제일 (YYYY-MM-DD) */
      gbReleasedDate: string;
      /** ②경제자유구역 등 지정 (해제~고시 5년 허용) */
      gbFreeEconZone: boolean;
      /** 취득일~매수/고시일 소재지 거주 요건 충족 */
      gbResided: boolean;
    }
  | {
      // 조특법 §77의2 — 대토보상 과세특례 (40% 세액감면 모드)
      type: "replacement_land_comp";
      /** 현금 보상액 (원) */
      rlCashComp: string;
      /** 대토(토지) 보상액 (원) */
      rlLandComp: string;
    }
  // ── Phase 2 (2026-05-06): §99의3 신축주택 과세특례 본격 구현 ──
  // 설계: docs/02-design/features/transfer-reduction-99-3.engine.design.md
  | {
      type: "new_99_3";
      /** 분양계약일 (YYYY-MM-DD) — 1호 적용 시 시한 검증 + 고가주택 적용기준일 */
      contractDate993?: string;
      /** 사용승인일 (YYYY-MM-DD) — 2호 적용 시 시한 검증 */
      usageApprovalDate993?: string;
      /** 5년 시점 기준시가 (원) — 취득일+5년 인접 고시일 가격 */
      standardPriceAt5Years: string;
      /** 취득시 기준시가 (원) — PHD 환산 결과 또는 직접 입력 */
      standardPriceAtAcquisition993: string;
      /** 양도시 기준시가 (원) — 자산의 standardPriceAtTransfer와 별개로 §99의3 전용 입력 (필요 시) */
      standardPriceAtTransfer993?: string;
      /**
       * 조특령 §99의3② 1호 단서·2호 괄호 — 종전주택을 재개발·재건축하여 취득한
       * 「법 §98의3② 각 호에 따른 신축주택」이면 안분 분모의 차감항이 **종전주택 취득 당시
       * 기준시가**로 바뀌고, 5년 이내 양도도 전액이 아니라 안분한다. §99 선례와 동일 배선 (D3-02).
       */
      isRecontractExcluded993: boolean;
      /** 조특칙 §44의4 카브백 — 소칙 §71③ 부득이한 사유로 «다른 주택» 분양 시 배제하지 않음 */
      recontractUnavoidableCause993: boolean;
      isRedevelopedNewHouse993: boolean;
      previousHouseStdPrice993: string;
      /** 전용면적(㎡) — 고가주택 판정용 (2002.12.31 이전 취득: 165/149㎡ AND 6억 초과). */
      exclusiveAreaSqm993: string;
      /** 지역 — 가격 급등 지역 내/외 (서울·과천·5대 신도시) */
      region993: "outside_speculation" | "speculation";
      /** 취득 유형 — 1호(주건업 취득) | 2호(자기건설) */
      acquisitionType993: "from_builder" | "self_built";
      /** (1호만) 매매계약일 입주사실 있는 주택 — 적용 배제 */
      hasOccupancyAtContract?: boolean;
      /** 거주자 여부 — 비거주자는 §99의3 적용 배제 */
      isResident993: boolean;
      /** 본인이 주택건설사업자 — 적용 배제 */
      isHousingConstructionBusiness993: boolean;
      // ── Round 10 (2026-05-06): PHD 환산 입력 (취득시 추정 공동주택가격 자동 산출) ──
      // 신축주택은 준공 후 1~2년 후 공시되므로 취득시 공시가격이 대부분 없음 → §164⑤ 환산 필수.
      // PHD 모드 ON 시 standardPriceAtAcquisition993를 자동 산출.
      /** PHD 환산 모드 ON/OFF (기본: 자동 — acquisitionDate < firstDisclosureDate 시 ON) */
      phdMode993?: boolean;
      /** 최초공시일자 (YYYY-MM-DD) */
      phdFirstDisclosureDate993?: string;
      /** 최초공시 공동주택가격 (원) */
      phdFirstDisclosurePrice993?: string;
      /** 토지면적 (㎡, 소수 가능) */
      phdLandAreaSqm993?: string;
      /** 취득시 토지 공시지가 (원/㎡) */
      phdLandPricePerSqmAtAcq993?: string;
      /** 최초공시시 토지 공시지가 (원/㎡) */
      phdLandPricePerSqmAtFirst993?: string;
      /** 취득시 건물 기준시가 (원, 선택) */
      phdBuildingStdAtAcq993?: string;
      /** 최초공시시 건물 기준시가 (원, 선택) */
      phdBuildingStdAtFirst993?: string;
    }
  // ── Phase 2 (2026-06-11): 장기임대 §97 시리즈 (아래 RentalReductionFormVariant 정의) ──
  | RentalReductionFormVariant;

// ── Phase 2 (2026-06-11): 장기임대 §97 시리즈 본격 구현 ──
// 설계: docs/02-design/features/transfer-rental-reduction.ui.design.md
// 명명 통일(E5): 등록일은 폼·Zod·Route·엔진 전 구간 registrationDate.

/** 계약별 임대료 이력 행 (정밀 모드) */
export interface RentHistoryFormItem {
  contractDate: string;                       // YYYY-MM-DD
  contractType: "jeonse" | "monthly" | "semi_jeonse";
  monthlyRent: string;                        // CurrencyInput
  deposit: string;                            // CurrencyInput
}

/** 공실 구간 행 */
export interface VacancyPeriodFormItem {
  startDate: string;                          // YYYY-MM-DD
  endDate: string;                            // YYYY-MM-DD
}

/** §97 시리즈 공통 폼 필드 (5개 variant 공유) */
export interface RentalCommonFormFields {
  /** 지자체 임대사업자 등록일 (YYYY-MM-DD) — 엔진 PeriodCheckContext.registrationDate 동일 키 */
  registrationDate: string;
  /** 세무서 사업자등록 여부 (소법 §168) */
  isTaxRegistered: boolean;
  /** 임대개시일 (YYYY-MM-DD) */
  rentalStartDate: string;
  /** 임대료 5% 증액 위반 — 3-state: "" 미선택(차단) / "none" / "has_violation" */
  rentIncreaseViolationMode: "" | "none" | "has_violation";
  /** 정밀 모드 계약 이력 (has_violation 시 ≥ 2행) */
  rentHistory?: RentHistoryFormItem[];
  /** 6개월+ 공실 — 3-state: null 미선택(차단) */
  /**
   * 유예를 **초과하는** 공실 구간이 있는가 (3-state).
   * 임계는 조문마다 다르다 — §97·§97의2·§97의3·§97의4 = 3월(조특칙 §44) / §97의5 = 6개월(조특령 §97의5①1호).
   * 종전 키 `hasVacancyOver6Months`는 6개월을 다섯 조문 전부에 전용하던 시절의 이름이라 폐기했다(D1-03).
   */
  hasVacancyOverGrace: boolean | null;
  /**
   * 임대가 **양도일까지 계속**되었는가 (3-state, D2-06).
   * 조특령 §97의3⑤ B·§97의5②는 「실제 임대기간의 마지막 날의 기준시가」를
   * 양도일 기준시가 D와 별개 변수로 정의한다. 「아니오」면 종료 시점 기준시가가 필수다.
   */
  rentalContinuesToTransfer: boolean | null;
  /** 실제 임대기간 마지막 날의 기준시가 (원) — 위가 「아니오」일 때만 사용 */
  stdPriceAtRentalEnd: string;
  /** 공실 구간 (true 시 ≥ 1행) */
  vacancyPeriods?: VacancyPeriodFormItem[];
}

export type RentalReductionFormVariant =
  | ({
      type: "rental_97_3";
      rentalHousingType: "long_term_private" | "public_support_private";
      propertyType: "apartment" | "non_apartment";
      region: "capital" | "non_capital";
      /** 임대개시일 당시 주택+부속토지 기준시가 합계 (원) — 령 §97의3③4호 6억/3억 한도 */
      officialPriceAtStart: string;
      /** 국민주택규모 이하 확인 (령 §97의3③2호) */
      isNationalHousingScale: boolean;
      /** 2020.7.11 이후 단기→장기 변경 신고분 (§97의3① 괄호 — 적용 제외) */
      isConvertedFromShortTerm: boolean;
      /** D2-07 — §97의3① 「민간건설임대주택」 한정 (2023.1.1 이후 등록분에만 요구) */
      isPrivateConstructionRental: boolean;
    } & RentalCommonFormFields)
  | ({
      type: "rental_97_4";
      region: "capital" | "non_capital";
      /** D2-04 — 임대개시일 당시 주택+부속토지 기준시가 합계 (원) */
      officialPriceAtStart: string;
      /** D2-04 — 가목(민간매입 1호↑) / 다목(건설임대 2호↑). "" = 미선택 */
      rental974Category: "purchase_a" | "construction_c" | "";
    } & RentalCommonFormFields)
  | ({
      type: "rental_97_5";
      officialPriceAtStart: string;
      region: "capital" | "non_capital";
      /** CA-01 — §97의5①3호 준용 (조특령 §97의3③2호 국민주택규모 이하) */
      isNationalHousingScale: boolean;
    } & RentalCommonFormFields)
  | ({
      type: "rental_97_main" | "rental_97_proviso";
      /** 신축 연도 (1986~2000) */
      constructionYear: string;
      /** 국민주택 확인 (§97①) */
      isNationalHousing: boolean;
      /** §97① 단서 분기 (proviso만) */
      provisoCase?: "a_construction" | "b_purchase" | "c_10years";
      /** §97①2호 — 1985.12.31 이전 신축 **공동주택** (3-state, D1-06) */
      isMultiUnitHousing: boolean | null;
      /** §97①2호 — 1986.1.1 현재 입주된 사실이 없는 주택 (3-state, D1-06) */
      isUnoccupiedAt1986: boolean | null;
      /** §97① 단서 나목 — 취득 당시 입주된 사실이 없는 주택 (3-state, D1-07) */
      isUnoccupiedAtAcquisition: boolean | null;
      /** 조특령 §97① 주체 요건 — 임대주택 5호 이상 임대 (3-state, null = 미선택) */
      hasMin5RentalUnits: boolean | null;
      /** 조특령 §97⑤4호 — 5호 미만으로 임대한 기간 (임대기간 불산입, 유예 없음) */
      belowMin5UnitsPeriods?: VacancyPeriodFormItem[];
    } & RentalCommonFormFields)
  | ({
      type: "rental_97_2";
      /** 건설임대(1호) / 매입임대(2호) */
      rental972Type: "construction" | "purchase" | "";
      isNationalHousing: boolean;
      /** 조특령 §97의2① 주체 요건 — 신축임대 1호 포함 2호 이상 임대 (3-state, null = 미선택) */
      hasNewRentalPlus2Units: boolean | null;
      /** §97의2①2호 — 취득 당시 입주된 사실이 없는 주택 (3-state, D1-07) */
      isUnoccupiedAtAcquisition: boolean | null;
      /** §97의2①1호 나목 — 1999.8.19 이전 신축 **공동주택** (3-state, D9-01) */
      isMultiUnitHousing972: boolean | null;
      /** §97의2①1호 나목 — 1999.8.20 현재 입주 사실 없음 (3-state, D9-01) */
      isUnoccupiedAt19990820: boolean | null;
    } & RentalCommonFormFields)
  // ── §99의4 농어촌·고향주택 — 주택수 제외 (2026-06-11) ──
  | {
      type: "new_99_4_rural";
      /** 농어촌주택 취득일 (YYYY-MM-DD) — 시한·3년 보유·취득순서 판정 */
      ruralHouseAcquisitionDate: string;
      /** 농어촌주택 지번 주소 — 기준시가 조회 소스(별개 물건, 양도물건 아님). 엔진 미전달·폼 지속 전용 */
      ruralHouseJibun?: string;
      /** 취득 당시 주택+부속토지 기준시가 합계 (원) — 3억(한옥 4억) 한도 */
      ruralHouseStdPrice: string;
      /** 령⑭ 지자체 등록 한옥 — 한도 4억 */
      isRegisteredHanok: boolean;
      /** ③ 일반주택과 같은/연접 읍·면·동 — ON이면 배제 */
      isAdjacentArea: boolean;
      /** ①1호가목 소재지 요건 — 사용자 확인 */
      meetsLocationRequirement: boolean;
    }
  | {
      type: "new_99_4_hometown";
      ruralHouseAcquisitionDate: string;
      /** 고향주택 지번 주소 — 기준시가 조회 소스(별개 물건). 엔진 미전달·폼 지속 전용 */
      ruralHouseJibun?: string;
      ruralHouseStdPrice: string;
      isRegisteredHanok: boolean;
      /** ③ 일반주택과 같은/연접 시 — ON이면 배제 */
      isAdjacentArea: boolean;
      /** ①2호나목 소재지 요건 — 사용자 확인 */
      meetsLocationRequirement: boolean;
      /** ①2호가목·령⑥ 고향 요건 (등록기준지/거주 10년) */
      meetsHometownRequirement: boolean;
    }
  // ── P1 (2026-06-11): §99 신축주택 IMF 1차 — 차감형 ──
  | {
      type: "new_99";
      /** 최초 매매계약일 (YYYY-MM-DD) — 2호(주건업). 미입력 시 자산 매매계약일 fallback */
      contractDate99: string;
      /** 사용승인·사용검사일 (YYYY-MM-DD) — 1호(자기건설) */
      usageApprovalDate99: string;
      /** 취득 유형 — 2호(주건업) | 1호(자기건설·조합원) */
      acquisitionType99: "from_builder" | "self_built";
      /** 국민주택 — 신축주택취득기간 ~1999.12.31 연장 */
      isNationalHousing99: boolean;
      /** 취득시 기준시가 (원) */
      standardPriceAtAcquisition99: string;
      /** 취득일+5년 시점 기준시가 (원) — 5년 후 양도 시 필수 */
      standardPriceAt5Years99: string;
      /** 양도시 기준시가 (원) — 미입력 시 자산 standardPriceAtTransfer fallback */
      standardPriceAtTransfer99: string;
      /** 전용면적 (㎡) — 고가주택 판정 (165/149㎡ 기준 시대) */
      exclusiveAreaSqm99: string;
      /** (2호) 매매계약일 현재 다른 자 입주 사실 — ON이면 배제 */
      hasOccupancyAtContract99: boolean;
      /** 령 §99② — 1998.5.21 이전 계약 해제 후 재계약·대체취득 — ON이면 배제 */
      isRecontractExcluded99: boolean;
      /** 조특칙 §44의4 카브백 — 소칙 §71③ 부득이한 사유로 «다른 주택» 분양 시 배제하지 않음 */
      recontractUnavoidableCause99: boolean;
      /** 재개발·재건축 신축주택 (령 §99①1호 단서 — 5년 내도 안분) */
      isRedevelopedNewHouse99: boolean;
      /** 종전주택 취득 당시 기준시가 (원) — 변형 ON 시 필수. 별개 물건 → 조회형/PHD 대상 아님 */
      previousHouseStdPrice99: string;
      // ── PHD 환산 (Phase 2, 2026-07-27): 최초공시 전 취득 시 취득시 기준시가 §164⑤ 자동 산출 ──
      /** PHD 모드 ON 시 standardPriceAtAcquisition99를 자동 산출 */
      phdMode99?: boolean;
      phdFirstDisclosureDate99?: string;
      phdFirstDisclosurePrice99?: string;
      phdLandAreaSqm99?: string;
      phdLandPricePerSqmAtAcq99?: string;
      phdLandPricePerSqmAtFirst99?: string;
      phdBuildingStdAtAcq99?: string;
      phdBuildingStdAtFirst99?: string;
    }
  // ── P1 (2026-06-11): §98의8 준공후미분양 50% 공제 — 차감형 ──
  | {
      type: "unsold_98_8";
      /** 최초 매매계약일 (YYYY-MM-DD) — 시한 2015.1.1~12.31 */
      contractDate988: string;
      /** 취득가액 (원) — 6억 이하 (취득세·부대비용 제외) */
      acquisitionPrice988: string;
      /** 연면적(공동주택 전용, ㎡) — 135 이하 (DecimalInput) */
      exclusiveAreaSqm988: string;
      /** 임대개시일 (YYYY-MM-DD) — 사업자등록+임대사업자등록 후 개시일 기산 (령 §98의5⑤1호 준용) */
      /** 임대계약 체결일 (YYYY-MM-DD) — 2015.12.31 이전 한정 (법 §98의8① 괄호) */
      rentalContractDate988: string;
      rentalStartDate988: string;
      /** 임대종료일 (YYYY-MM-DD) — 빈값 = 양도일까지 계속 */
      rentalEndDate988: string;
      /** 상속 합산 피상속인 임대기간 (개월) */
      inheritedRentalMonths988: string;
      /** 준공후미분양 확인 (령 §98의7① — 2014.12.31까지 미계약 + 선착순) */
      isUnsoldAfterCompletion988: boolean;
      /** 사업주체등과 최초 매매계약 (령 §98의7③) */
      isFirstContract988: boolean;
      /** 계약 해제 후 본인·배우자 등 재계약 아님 (령 §98의7②2·3호) */
      isNotRecontract988: boolean;
      /** 취득시 기준시가 (원) — 5년 후 양도 안분 */
      standardPriceAtAcquisition988: string;
      /** 취득일+5년 시점 기준시가 (원) */
      standardPriceAt5Years988: string;
      /** 양도시 기준시가 (원) — 미입력 시 자산 standardPriceAtTransfer fallback */
      standardPriceAtTransfer988: string;
      // ── PHD 환산 (Phase 4, 2026-07-27): 최초공시 전 취득 취득시 기준시가 §164⑤ 자동 산출 ──
      phdMode988?: boolean;
      phdFirstDisclosureDate988?: string;
      phdFirstDisclosurePrice988?: string;
      phdLandAreaSqm988?: string;
      phdLandPricePerSqmAtAcq988?: string;
      phdLandPricePerSqmAtFirst988?: string;
      phdBuildingStdAtAcq988?: string;
      phdBuildingStdAtFirst988?: string;
    }
  // ── P5 (2026-06-12): §98 미분양 국민주택 — 세율 20% 선택 ──
  | {
      type: "unsold_98";
      /** 매매계약일 (YYYY-MM-DD, 선택 — 계약+계약금 케이스) */
      contractDate98: string;
      isNationalScale98: boolean;
      isOutsideSeoul98: boolean;
      isUnsoldConfirmed98: boolean;
      /** 민간임대주택·공공임대주택이 아님 (령 §98①1호 괄호 — 이하 이 조에서 같다) */
      isNotRentalHousing98: boolean;
      isFirstBuyerNoOccupancy98: boolean;
      rentedFor5Years98: boolean;
    }
  // ── P4 (2026-06-12): §98의2 지방 미분양 — 특칙 전용 (장특 표2·기본세율) ──
  | {
      type: "unsold_98_2";
      /** 매매계약일 (YYYY-MM-DD, 선택) — 취득일이 기간 외인 계약+계약금 케이스용 */
      contractDate982: string;
      /** 수도권 밖 미분양 확인 (령 §98의2①) */
      isNonCapitalUnsold982: boolean;
      /** 선착순 공급 취득 또는 사업주체 최초 매매계약 (령①1·2호) */
      isFirstOrFcfsContract982: boolean;
    }
  // ── P4 (2026-06-12): §98의4 비거주자 10% 세액감면 ──
  | {
      type: "unsold_98_4";
      /** 매매계약일 (YYYY-MM-DD, 선택) */
      contractDate984: string;
      /** 국내사업장 없는 비거주자 확인 (소법 §120) — 미확인 시 적용 불가 */
      isNonResidentNoPe984: boolean;
      /** §98의3 미분양주택이 아닌 주택 확인 */
      isNotUnsold983House984: boolean;
    }
  // ── P3 (2026-06-12): §98의3 서울 밖 미분양 — 100%(과밀 60%) 하이브리드 ──
  | {
      type: "unsold_98_3";
      /** 거주자 / 국내사업장 없는 비거주자 — 시한 시작일 분기 */
      residencyType983: "resident" | "nonresident_no_pe";
      /** 사업주체 취득 / 자기건설 (법②) */
      houseType983: "purchased" | "self_built";
      /** 최초 매매계약일 (YYYY-MM-DD) — purchased */
      contractDate983: string;
      /** 착공일 (YYYY-MM-DD) — self_built */
      constructionStartDate983: string;
      /** 사용승인·사용검사일 (YYYY-MM-DD) — self_built */
      usageApprovalDate983: string;
      /** 서울 밖 + 지정지역 아님 확인 */
      isOutsideSeoulNotDesignated983: boolean;
      /** 수도권과밀억제권역 (60% + 면적 한정) */
      isOverconcentration983: boolean;
      /** 대지면적 (㎡, DecimalInput) — 과밀 시 660 이내 */
      landAreaSqm983: string;
      /** 연면적 (공동주택 전용, ㎡) — 과밀 시 149 이내 */
      floorAreaSqm983: string;
      isUnsoldConfirmed983: boolean;
      isFirstContract983: boolean;
      isNotOccupiedAtContract983: boolean;
      isNotRecontract983: boolean;
      isNotExcludedSelfBuilt983: boolean;
      standardPriceAtAcquisition983: string;
      standardPriceAt5Years983: string;
      standardPriceAtTransfer983: string;
      // ── PHD 환산 (Phase 4, 2026-07-27): 최초공시 전 취득 취득시 기준시가 §164⑤ 자동 산출 ──
      phdMode983?: boolean;
      phdFirstDisclosureDate983?: string;
      phdFirstDisclosurePrice983?: string;
      phdLandAreaSqm983?: string;
      phdLandPricePerSqmAtAcq983?: string;
      phdLandPricePerSqmAtFirst983?: string;
      phdBuildingStdAtAcq983?: string;
      phdBuildingStdAtFirst983?: string;
    }
  // ── P3 (2026-06-12): §98의5 수도권 밖 미분양 — 인하율별 60/80/100% ──
  | {
      type: "unsold_98_5";
      /** 최초 매매계약일 (YYYY-MM-DD) — ~2011.4.30 */
      contractDate985: string;
      /** 분양가격 인하율 (%, DecimalInput) */
      priceReductionRatePct985: string;
      /** 2010.2.11 현재 수도권 밖 미분양 확인 */
      isNonCapitalUnsoldAtCutoff985: boolean;
      isFirstContract985: boolean;
      isNotOccupiedAtContract985: boolean;
      isNotRecontract985: boolean;
      standardPriceAtAcquisition985: string;
      standardPriceAt5Years985: string;
      standardPriceAtTransfer985: string;
      // ── PHD 환산 (Phase 4, 2026-07-27): 최초공시 전 취득 취득시 기준시가 §164⑤ 자동 산출 ──
      phdMode985?: boolean;
      phdFirstDisclosureDate985?: string;
      phdFirstDisclosurePrice985?: string;
      phdLandAreaSqm985?: string;
      phdLandPricePerSqmAtAcq985?: string;
      phdLandPricePerSqmAtFirst985?: string;
      phdBuildingStdAtAcq985?: string;
      phdBuildingStdAtFirst985?: string;
    }
  // ── P3 (2026-06-12): §98의6 준공후미분양 50% — 1호/2호 ──
  | {
      type: "unsold_98_6";
      /** 1호 사업주체등 2년 임대 후 취득 / 2호 취득 후 5년 임대 */
      hoType986: "seller_rented" | "buyer_rented";
      /** 최초 매매계약일 (YYYY-MM-DD) */
      /** 주택+부수토지 기준시가 합계 (원) — 6억 한도 (1호는 최초 임대개시 당시) */
      stdPriceSumAtBase986: string;
      /** 연면적 (공동주택 전용, ㎡) — 149 한도 */
      floorAreaSqm986: string;
      isUnsoldAfterCompletion986: boolean;
      isFirstContract986: boolean;
      isNotOccupiedAfterCompletion986: boolean;
      isNotRecontract986: boolean;
      /** (1호) 사업주체등 ~2011.12.31 임대계약 + 2년 임대 확인 */
      sellerRented2Years986: boolean;
      /** (2호) 임대계약 체결일 (~2011.12.31) */
      rentalContractDate986: string;
      /** (2호) 임대개시일 — 등록 후 기산 */
      rentalStartDate986: string;
      /** (2호) 임대종료일 — 빈값 = 양도일까지 */
      rentalEndDate986: string;
      /** (2호) 상속 합산 임대기간 (개월) */
      inheritedRentalMonths986: string;
      standardPriceAtAcquisition986: string;
      standardPriceAt5Years986: string;
      standardPriceAtTransfer986: string;
      // ── PHD 환산 (Phase 4, 2026-07-27): 최초공시 전 취득 취득시 기준시가 §164⑤ 자동 산출 ──
      phdMode986?: boolean;
      phdFirstDisclosureDate986?: string;
      phdFirstDisclosurePrice986?: string;
      phdLandAreaSqm986?: string;
      phdLandPricePerSqmAtAcq986?: string;
      phdLandPricePerSqmAtFirst986?: string;
      phdBuildingStdAtAcq986?: string;
      phdBuildingStdAtFirst986?: string;
    }
  // ── P2 (2026-06-11): §98의7 9억↓ 미분양 — 하이브리드 (5년 내 100% 세액감면 / 5년 후 공제) ──
  | {
      type: "unsold_98_7";
      /** 최초 매매계약일 (YYYY-MM-DD) — 시한 2012.9.24~12.31 (계약금 납부) */
      contractDate987: string;
      /** 취득가액 (원) — 9억 이하 (취득세·부대비용 제외 실거래가) */
      acquisitionPrice987: string;
      /** 2012.9.24 현재 미분양 확인 (령 §98의6① — 2012.9.23까지 미계약 + 선착순) */
      isUnsoldAtCutoff987: boolean;
      /** 사업주체등과 최초 매매계약 + 계약금 (령 §98의6③) */
      isFirstContract987: boolean;
      /** 매매계약일 현재 입주 사실 없음 (령 §98의6②2호) */
      isNotOccupiedAtContract987: boolean;
      /** 계약 해제 후 본인·배우자 등 재계약 아님 (령 §98의6②3·4호) */
      isNotRecontract987: boolean;
      /** 취득시 기준시가 (원) — 5년 후 양도 안분 */
      standardPriceAtAcquisition987: string;
      /** 취득일+5년 시점 기준시가 (원) */
      standardPriceAt5Years987: string;
      /** 양도시 기준시가 (원) — 미입력 시 자산 standardPriceAtTransfer fallback */
      standardPriceAtTransfer987: string;
      // ── PHD 환산 (Phase 4, 2026-07-27): 최초공시 전 취득 취득시 기준시가 §164⑤ 자동 산출 ──
      phdMode987?: boolean;
      phdFirstDisclosureDate987?: string;
      phdFirstDisclosurePrice987?: string;
      phdLandAreaSqm987?: string;
      phdLandPricePerSqmAtAcq987?: string;
      phdLandPricePerSqmAtFirst987?: string;
      phdBuildingStdAtAcq987?: string;
      phdBuildingStdAtFirst987?: string;
    }
  // ── P2 (2026-06-11): §99의2 신축·미분양·1세대1주택 — 하이브리드 (6억 OR 85㎡) ──
  | {
      type: "unsold_99_2";
      /** 대상 주택 유형 — 령① 신축·미분양 / 령①8호 자기건설 / 령③ 1세대1주택자 주택 */
      houseType992: "new_or_unsold" | "self_built" | "existing_one_house";
      /** 최초 매매계약일 (YYYY-MM-DD) — new_or_unsold·existing (2013.4.1~12.31) */
      contractDate992: string;
      /** 사용승인·사용검사일 (YYYY-MM-DD) — self_built (임시사용승인 포함) */
      usageApprovalDate992: string;
      /** 실거래 취득가액 (원) — 취득세·부대비용 제외 */
      acquisitionPrice992: string;
      /** 연면적(공동주택·오피스텔 전용, ㎡) — DecimalInput */
      exclusiveAreaSqm992: string;
      /** (new_or_unsold) 신축주택등 해당 확인 (령 §99의2①1~9호) */
      meetsHouseTypeRequirement992: boolean;
      /** (self_built) 조합원 관리처분·멸실 재건축 아님 (령①8호 가·나목) */
      isNotExcludedSelfBuilt992: boolean;
      /** (existing) 1세대1주택 양도자 요건 (령③) */
      meetsOneHouseSellerRequirement992: boolean;
      /** 오피스텔 여부 (령①9호·③1호) */
      isOfficetel992: boolean;
      /** 오피스텔 사후요건 — 주민등록/임대등록 (령②4호) */
      meetsOfficetelRequirement992: boolean;
      /** 계약 해제 후 재계약 아님 (령②2·3호·⑤2호) */
      isNotRecontract992: boolean;
      /** 확인 날인 매매계약서 보유 (법④ — 미보유 시 적용 불가) */
      hasConfirmationSeal992: boolean;
      /** 취득시 기준시가 (원) */
      standardPriceAtAcquisition992: string;
      /** 취득일+5년 시점 기준시가 (원) */
      standardPriceAt5Years992: string;
      /** 양도시 기준시가 (원) — 미입력 시 자산 fallback */
      standardPriceAtTransfer992: string;
      // ── PHD 환산 (Phase 3, 2026-07-27): 최초공시 전 취득 시 취득시 기준시가 §164⑤ 자동 산출 ──
      phdMode992?: boolean;
      phdFirstDisclosureDate992?: string;
      phdFirstDisclosurePrice992?: string;
      phdLandAreaSqm992?: string;
      phdLandPricePerSqmAtAcq992?: string;
      phdLandPricePerSqmAtFirst992?: string;
      phdBuildingStdAtAcq992?: string;
      phdBuildingStdAtFirst992?: string;
    }
  // ── §98의9 수도권 밖 준공후미분양 — 주택수 제외 (2026-06-11) ──
  | {
      type: "unsold_98_9";
      /** 준공후미분양주택 취득일 (YYYY-MM-DD) — 시한 2024.1.10~2026.12.31·취득순서·양도시점 */
      unsoldHouseAcquisitionDate: string;
      /** 취득가액 (원) — 7억 이하 (령 §98의8①2호. 기준시가 아님) */
      unsoldHouseAcquisitionPrice: string;
      /** 전용면적 (㎡) — 85 이하 (령 §98의8①1호. DecimalInput) */
      unsoldHouseExclusiveArea: string;
      /** 수도권 밖 소재 (법 ①1호) */
      isNonCapitalRegion: boolean;
      /** 취득 당시 1세대 1주택 (법 ① 본문) */
      wasOneHouseholdAtAcquisition: boolean;
      /** 양도자 자격·최초계약·선착순·확인날인 (령 ①3~5호·②) */
      meetsSellerAndContractRequirement: boolean;
    };

export type ReductionType = AssetReductionForm["type"];

/** P5 모드 2 — 보유 감면주택 주택수 제외 행 (폼-전역, 7개 조문 ②·§98 령②·§99②) */
export interface SpecialHouseExclusionFormItem {
  article:
    | "unsold_98" | "unsold_98_2" | "unsold_98_3" | "unsold_98_5" | "unsold_98_6"
    | "unsold_98_7" | "unsold_98_8" | "unsold_99_2" | "new_99" | "new_99_3" | "";
  /** 감면주택 취득일 (YYYY-MM-DD) */
  houseAcquisitionDate: string;
  /** 감면주택 매매계약일 (YYYY-MM-DD, 선택) */
  houseContractDate: string;
  /** §99 전용 — 국민주택 여부 (신축주택취득기간 종기 1999.6.30 ↔ 1999.12.31) */
  isNationalHousing: boolean;
  /** 해당 조문 본 요건 충족 확인 */
  requirementsConfirmed: boolean;
}

/**
 * 5년 한도 합산 대상 조문 — **당해연도 감면 유형과 다르다**.
 *
 * 🔴 종전에는 `ReductionType`(당해연도 감면 폼 유형)을 그대로 썼다. 그래서
 *   §133 한도군에는 있으나 당해연도 폼에는 없는 조문(축산 §69의2·어업 §69의3·
 *   자경 변형·§70 농지대토·§69의4 자경산지)의 **이력을 표현할 수 없었다**
 *   (코드리뷰 D8-03·CA-04). 두 축은 다른 집합이므로 분리한다.
 */
export type PriorReductionType =
  | ReductionType
  | "self_farming_inherited"
  | "self_farming_incorp"
  | "livestock"
  | "fishing"
  | "farmland_substitute_70"
  | "self_cultivated_forest_69_4";

/** 인별 5년 합산 한도 산정용 과거 감면 이력 항목 */
export interface PriorReductionUsageItem {
  year: number;
  type: PriorReductionType;
  amount: number;
}
