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
  hasVacancyOver6Months: boolean | null;
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
    } & RentalCommonFormFields)
  | ({
      type: "rental_97_4";
      region: "capital" | "non_capital";
    } & RentalCommonFormFields)
  | ({
      type: "rental_97_5";
      officialPriceAtStart: string;
      region: "capital" | "non_capital";
    } & RentalCommonFormFields)
  | ({
      type: "rental_97_main" | "rental_97_proviso";
      /** 신축 연도 (1986~2000) */
      constructionYear: string;
      /** 국민주택 확인 (§97①) */
      isNationalHousing: boolean;
      /** §97① 단서 분기 (proviso만) */
      provisoCase?: "a_construction" | "b_purchase" | "c_10years";
    } & RentalCommonFormFields)
  | ({
      type: "rental_97_2";
      /** 건설임대(1호) / 매입임대(2호) */
      rental972Type: "construction" | "purchase" | "";
      isNationalHousing: boolean;
    } & RentalCommonFormFields)
  // ── §99의4 농어촌·고향주택 — 주택수 제외 (2026-06-11) ──
  | {
      type: "new_99_4_rural";
      /** 농어촌주택 취득일 (YYYY-MM-DD) — 시한·3년 보유·취득순서 판정 */
      ruralHouseAcquisitionDate: string;
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
      ruralHouseStdPrice: string;
      isRegisteredHanok: boolean;
      /** ③ 일반주택과 같은/연접 시 — ON이면 배제 */
      isAdjacentArea: boolean;
      /** ①2호나목 소재지 요건 — 사용자 확인 */
      meetsLocationRequirement: boolean;
      /** ①2호가목·령⑥ 고향 요건 (등록기준지/거주 10년) */
      meetsHometownRequirement: boolean;
    };

export type ReductionType = AssetReductionForm["type"];

/** 인별 5년 합산 한도 산정용 과거 감면 이력 항목 */
export interface PriorReductionUsageItem {
  year: number;
  type: ReductionType;
  amount: number;
}
