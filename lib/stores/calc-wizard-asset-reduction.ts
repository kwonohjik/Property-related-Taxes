/**
 * 자산별 감면 폼 타입.
 * Zod reductionSchema(lib/api/transfer-tax-schema.ts)와 1:1 대응.
 * 숫자 입력 필드는 string 타입(빈 문자열 = 미입력).
 * calc-wizard-asset.ts 800줄 정책에 따라 분리 (2026-05-11).
 */

import type { AptDeadlineExtensionForm } from "./calc-wizard-asset-nbl-rental";
import type { NewHousingKind } from "@/lib/tax-engine/transfer-reductions/special-house-exclusion-kind";
import type { TriStateAnswer } from "@/lib/tax-engine/transfer-reductions/new-99-luxury-house";

export type AssetReductionForm =
  | {
      type: "self_farming";
      /** 본인 자경기간(년) */
      farmingYears: string;
      /** 피상속인 자경기간(년) — 상속 취득 + 본인 미달 시 합산 (조특령 §66⑪) */
      decedentFarmingYears?: string;
      /** 조특령 §66⑪ 본문 — 상속받은 농지를 1년 이상 계속 경작 */
      heirContinuedFarming1Year?: boolean;
      /** 조특령 §66⑫ 대체요건 — 상속일부터 3년 내 양도·수용 + 택지개발지구·산업단지 등 지정 */
      meetsDecedentAggregationAlt?: boolean;
      /** 조특령 §66⑭ — 거주자 본인 결격 과세기간 수(년) */
      disqualifiedTaxPeriodsSelf?: string;
      /** 조특령 §66⑭ — 피상속인(배우자 포함) 결격 과세기간 수(년) */
      disqualifiedTaxPeriodsDecedent?: string;
      /** 주거·상업·공업지역 편입 여부 (조특령 §66④1호 배제 · 법 §69①단서+영 §66⑦ 부분감면) */
      useSelfFarmingIncorporation?: boolean;
      /** 편입일 (YYYY-MM-DD) */
      selfFarmingIncorporationDate?: string;
      /** 편입 지역 유형 */
      selfFarmingIncorporationZone?: "residential" | "commercial" | "industrial" | "";
      /**
       * **양도일 현재** 농지 소재지 구분 — 조특령 §66④1호 3년 배제의 소재지 요건.
       * `""`(미선택)은 판정 불가 — ⑧이 차단한다(자동 fallback 금지).
       */
      selfFarmingIncorporationLocation?: "metro_or_city" | "gun_or_eup_myeon" | "";
      /** 조특령 §66④1호 단서 해당 — true면 3년 배제 제외. 목 구성(가·나·다)은 2008.2.22.~ */
      selfFarmingIncorporationProvisoException?: boolean;
      /** 편입일 당시 기준시가 (원) */
      selfFarmingStandardPriceAtIncorporation?: string;
      /** 취득시 기준시가 (원) — 편입 부분감면 비율 산정용(실지 모드 전용 입력, 환산 모드는 자산-수준 fallback) */
      selfFarmingStandardPriceAtAcquisition?: string;
      /** 양도시 기준시가 (원) — 편입 부분감면 비율 산정용(실지 모드 전용 입력, 환산 모드는 자산-수준 fallback) */
      selfFarmingStandardPriceAtTransfer?: string;
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
      /**
       * (2호 · 사용승인 2003.1.1.~6.30.만) 2003.1.1. 전 공사 착수 여부 — 법률 제6762호 부칙 §29②. ""=미응답.
       * 범위 밖에서는 읽지 않는다(엔진이 범위를 판정) — 남은 옛 응답은 무해하다.
       */
      constructionStartedBefore2003_993?: "" | "yes" | "no" | "unknown";
      /** 종전 고급주택(소득세법 시행령 §156 당시 시행본) 주택 유형 — 종전 규정 적용분만 묻는다 (NH-02). ""=미응답 */
      houseType993?: "" | "apartment" | "detached";
      /** (단독) 연면적(㎡) — 주택으로 보는 부분·주거전용 지하실 포함 */
      grossFloorAreaSqm993?: string;
      /** (단독) 딸린 토지 면적(㎡) */
      attachedLandAreaSqm993?: string;
      /** (단독) 기준시가 4천만원(2000.12.31.까지 취득세 시가표준액 2천만원) 이상 — 「모름」=고급주택으로 보고 확인 필요 */
      stdPriceFloorMet993?: "" | "yes" | "no" | "unknown";
      /** (단독) 엘리베이터·에스컬레이터·67㎡ 이상 수영장 중 1개 이상 — 「모름」=고급주택으로 보고 확인 필요 */
      luxuryFacility993?: "" | "yes" | "no" | "unknown";
      /** (1호 · 매매 취득) 주택건설업자와 최초로 매매계약·계약금 납부한 사람이 본인인가 (NH-17). ""=미응답 */
      firstContract993?: "" | "yes" | "no" | "unknown";
      /** (재개발 완공 아파트 조합원 · 준공일이 2003.6.30. 뒤) 조합이 기간 안에 조합원 외의 자와 잔여주택 매매계약을 직접 체결하고 계약금을 받았는가 — 조특령 §99의3③2호 단서 (NH-16). ""=미응답 */
      remainderContract993?: "" | "yes" | "no" | "unknown";
      /** (1호만) 매매계약일 입주사실 있는 주택 — 적용 배제 */
      hasOccupancyAtContract?: boolean;
      /** 거주자 여부 — 비거주자는 §99의3 적용 배제 */
      isResident993: boolean;
      /** 본인이 주택건설사업자 — 적용 배제 */
      isHousingConstructionBusiness993: boolean;
      // ── Round 10 (2026-05-06): PHD 환산 입력 (취득시 추정 공동주택가격 자동 산출) ──
      // 신축주택은 준공 후 1~2년 후 공시되므로 취득시 공시가격이 대부분 없음 → §164⑦ 환산 필수.
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

/**
 * 조특령 §97의5①2호·3호 간주기간 (§97의5 전용).
 * - `expropriation`: 협의매수·수용되어 임대할 수 없던 기간 (시작~종료)
 * - `redevelopment`: 관리처분계획 인가일(소규모정비 사업시행계획 인가일 · 리모델링 허가일/사업계획승인일) ~ 준공일.
 *   엔진이 앞뒤 6개월을 붙인다.
 */
export interface DeemedRentalPeriodFormItem {
  reason: "expropriation" | "redevelopment";
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
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
  /**
   * 실제 임대기간의 마지막 날 (YYYY-MM-DD) — 위가 「아니오」일 때만 사용.
   * **§97의5 전용**: 법 §97의5①2호 10년 계속 임대 판정의 종점. ④·⑤는 `rental_97_5`에서만 싣고 그린다.
   */
  rentalEndDate: string;
  /**
   * 안분 산식의 분모 감수 E — **취득 당시** 기준시가 (주택+부속토지 합계, 원).
   *
   * 조특령 §97의3⑤·§97의5②의 안분은 취득시·양도시 기준시가를 요구한다. 그런데 자산-수준
   * 기준시가의 전송 조건은 **두 시점이 서로 다르다**(`transfer-tax-api.ts`, 실측):
   * 취득시는 추계 **또는 분리**(§166⑥) 모드, 양도시는 **추계 모드만**이다 —
   * 즉 분리 전용 모드에서도 D(양도시)는 도달하지 않는다.
   * 실지거래가액 모드에서는 값이 도달하지 않아 안분이 성립하지 않고, 그러면 §97의3 자체가
   * `MISSING_PRORATION_PRICES`로 **전액 불적용**된다(감면이 조용히 사라지는 것이 아니라
   * 사유가 뜨지만, 채울 칸이 없었다).
   *
   * ⚠️ 자산-수준 전송 조건을 넓히지 않는다 — 그 값은 §164⑧·개산공제·분리 안분의 입력이라
   *    무관한 경로의 세액이 함께 움직인다. 감면-수준 override로 받고, **비우면 자산-수준
   *    값으로 폴백**한다(라우터에서 `?? ctx`). 같은 파일의 §98의8 계약일 폴백과 같은 모양이다.
   */
  stdPriceAtAcquisition: string;
  /** 안분 산식의 분모 D — **양도 당시** 기준시가 (주택+부속토지 합계, 원). 위와 같은 폴백. */
  stdPriceAtTransfer: string;
  /** 공실 구간 (true 시 ≥ 1행) */
  vacancyPeriods?: VacancyPeriodFormItem[];
}

export type RentalReductionFormVariant =
  | ({
      type: "rental_97_3";
      /**
       * 민특법 §2 4호(공공지원)/5호(장기일반) — §97의3① 본문이 둘을 동등하게 대상으로
       * 삼으므로 **판정을 가르지 않는다**. 사용자 신고 사실로만 보관한다 (D9-07).
       */
      rentalHousingType: "long_term_private" | "public_support_private";
      region: "capital" | "non_capital";
      /** 임대개시일 당시 주택+부속토지 기준시가 합계 (원) — 령 §97의3③4호 6억/3억 한도 */
      officialPriceAtStart: string;
      /** 국민주택규모 이하 확인 (령 §97의3③2호) */
      isNationalHousingScale: boolean;
      /**
       * 2020.7.11 이후 단기→장기 변경 신고분 (§97의3① 괄호 — 적용 제외).
       * PR-C 이후 정본은 `shortTermConversionMode`다 — ⑤가 `mode === "after"`로 함께 쓴다(구 세션 호환).
       */
      isConvertedFromShortTerm: boolean;
      /**
       * PR-C — 단기민간임대 → 장기일반 변경신고 구분 (조특법 §97의3① 괄호 · 조특령 §97의3④ 후단).
       * `before` = 2020.7.10 이전 변경신고(단기 임대기간 산입) · `after` = 2020.7.11 이후(적용 제외).
       * `before`이면 `registrationDate`는 **단기 지자체 등록일**이다.
       */
      shortTermConversionMode: "none" | "before" | "after";
      /** PR-C — 변경 신고일 (YYYY-MM-DD). `before`이면 필수 */
      conversionReportedDate: string;
      /** PR-C — 변경신고 수리일 = 장기 등록일 (YYYY-MM-DD). `before`이면 필수 */
      conversionAcceptedDate: string;
      /** D2-07 — §97의3① 「민간건설임대주택」 한정 (2023.1.1 이후 등록분에만 요구) */
      isPrivateConstructionRental: boolean;
      /** 조특령 §97의3④ — 세무서 사업자등록일 (YYYY-MM-DD). 사업자등록 확인 시 필수 — 임대개시 기산의 한 축 */
      taxRegistrationDate: string;
    } & RentalCommonFormFields)
  | ({
      type: "rental_97_4";
      region: "capital" | "non_capital";
      /** D2-04 — 임대개시일 당시 주택+부속토지 기준시가 합계 (원) */
      officialPriceAtStart: string;
      /** D2-04 — 가목(민간매입 1호↑) / 다목(건설임대 2호↑). "" = 미선택 */
      rental974Category: "purchase_a" | "construction_c" | "";
      /** 조특령 §97의4② — 세무서 사업자등록일 (YYYY-MM-DD). 사업자등록 확인 시 필수 — 임대개시 기산의 한 축 */
      taxRegistrationDate: string;
      /** 조특령 §97⑤3호 준용 — 상속받은 임대주택인가. true면 위 등록·임대일은 상속인 본인 값 */
      isInherited974: boolean;
      /** 상속개시일 (YYYY-MM-DD) */
      inheritanceDate974: string;
      /** 피상속인 사업자등록등일 — 세무서 사업자등록·임대사업자등록 중 늦은 날 (YYYY-MM-DD) */
      decedentRegistrationDate974: string;
      /** 피상속인이 그 주택을 임대하기 시작한 날 (YYYY-MM-DD) */
      decedentRentalStartDate974: string;
      /** 민간임대주택에 관한 특별법 §6⑤ — 등록이 자동말소됐는가 */
      isAutoCancelled974: boolean;
      /** 자동말소일 (YYYY-MM-DD) — 임대기간 종점 */
      autoCancelledDate974: string;
      /** 민간임대주택에 관한 특별법 §6①11호 — 임대사업자가 말소를 신청해 등록이 말소됐는가(자진말소) */
      isVoluntaryCancelled974: boolean;
      /** 자진말소일 (YYYY-MM-DD) — 임대기간 종점 · 가목 아파트면 사목 양도기한(말소일부터 1년) */
      voluntaryCancelledDate974: string;
      /** 소령 §167의3①2호 가목2) — 아파트(도시형 생활주택 제외)인가. "" = 미선택 (가목 + 양도일 2027.12.31. 뒤일 때만 묻는다) */
      isApartment974: "yes" | "no" | "";
      /** 소령 §167의3⑪ 기한 연장 사실 — 아파트일 때만. undefined = 모름 */
      aptDeadlineExtension974?: AptDeadlineExtensionForm;
    } & RentalCommonFormFields)
  | ({
      type: "rental_97_5";
      officialPriceAtStart: string;
      region: "capital" | "non_capital";
      /** CA-01 — §97의5①3호 준용 (조특령 §97의3③2호 국민주택규모 이하) */
      isNationalHousingScale: boolean;
      /** §97의5①1호 — 매입임대주택(매매·증여 등으로 소유권 취득)인가 (3-state, null = 미선택) */
      isPurchaseRental: boolean | null;
      /** 조특령 §97의5③ — 세무서 사업자등록일 (YYYY-MM-DD). 사업자등록 확인 시 필수 — 임대개시 기산의 한 축 */
      taxRegistrationDate: string;
      /** 조특령 §97의5①2호·3호 — 수용·정비사업으로 임대할 수 없던 기간이 있는가 */
      hasDeemedRentalPeriod: boolean;
      deemedRentalPeriods: DeemedRentalPeriodFormItem[];
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
      /** 판정 메뉴 명부 행 id — 판정 → 계산기 전달분만 싣는다(「어느 주택인가」) */
      houseId?: string;
      /** 농어촌주택 취득일 (YYYY-MM-DD) — 시한·3년 보유·취득순서 판정 */
      ruralHouseAcquisitionDate: string;
      /** 농어촌주택 지번 주소 — 기준시가 조회 소스(별개 물건, 양도물건 아님). 엔진 미전달·폼 지속 전용 */
      ruralHouseJibun?: string;
      /** 취득 당시 주택+부속토지 기준시가 합계 (원) — 한도는 양도일·취득일별(2억·3억, 등록 한옥 4억 — `resolveNew994StdPriceLimit`) */
      ruralHouseStdPrice: string;
      /** 령⑭ 지자체 등록 한옥 — 2014.1.1. 이후 구입분 한도 4억 */
      isRegisteredHanok: boolean;
      /**
       * ③ 일반주택과 같은/연접 행정구역 — 예(배제)/아니오/모름(불성립 + 확인 필요). ""=미응답(⑧ 필수 — 리뷰 NH-30 · Q-13).
       * 읽기는 `new994AdjacentAnswer`로 — 옛 저장값 `isAdjacentArea`를 함께 읽는다.
       */
      adjacentArea994?: "" | "yes" | "no" | "unknown";
      /** @deprecated 옛 저장값(토글, 기본 false). `true`만 「예」로 읽고 `false`는 미응답으로 강등한다(`new994AdjacentAnswer`) */
      isAdjacentArea?: boolean;
      /** 대지면적(㎡) — 2021.1.1. 전 양도분 660㎡ 이내(종전 ①1호나목·2호다목) */
      ruralLandAreaSqm994?: string;
      /** 주택 유형 — 2017.1.1. 전 양도분 면적 기준(공동주택 전용 116㎡ / 그 밖 연면적 150㎡). ""=미응답 */
      ruralHouseType994?: "" | "multi_unit" | "other";
      /** 그 밖의 주택 연면적(㎡) — 공동주택 전용면적은 명부 행 `exclusiveArea`(행 값으로 덮는다) */
      ruralHouseFloorAreaSqm994?: string;
      /** 공동주택 전용면적(㎡) — **행 값**(`house-count-exclusion-rows.ts`가 채운다). 폼 입력 칸 없음 */
      ruralHouseExclusiveAreaSqm994?: string;
      /** 명부 행 법정동코드 — **행 값**. ⑧·⑫ 수도권 모순 판정 전용(NH-20) */
      ruralHouseRegionCode?: string;
      /** ①1호가목 소재지 요건 — 사용자 확인 */
      meetsLocationRequirement: boolean;
    }
  | {
      type: "new_99_4_hometown";
      /** 판정 메뉴 명부 행 id — 판정 → 계산기 전달분만 싣는다(「어느 주택인가」) */
      houseId?: string;
      ruralHouseAcquisitionDate: string;
      /** 고향주택 지번 주소 — 기준시가 조회 소스(별개 물건). 엔진 미전달·폼 지속 전용 */
      ruralHouseJibun?: string;
      ruralHouseStdPrice: string;
      isRegisteredHanok: boolean;
      /**
       * ③ 일반주택과 같은/연접 행정구역 — 예(배제)/아니오/모름(불성립 + 확인 필요). ""=미응답(⑧ 필수 — 리뷰 NH-30 · Q-13).
       * 읽기는 `new994AdjacentAnswer`로 — 옛 저장값 `isAdjacentArea`를 함께 읽는다.
       */
      adjacentArea994?: "" | "yes" | "no" | "unknown";
      /** @deprecated 옛 저장값(토글, 기본 false). `true`만 「예」로 읽고 `false`는 미응답으로 강등한다(`new994AdjacentAnswer`) */
      isAdjacentArea?: boolean;
      /** 대지면적(㎡) — 2021.1.1. 전 양도분 660㎡ 이내(종전 ①1호나목·2호다목) */
      ruralLandAreaSqm994?: string;
      /** 주택 유형 — 2017.1.1. 전 양도분 면적 기준(공동주택 전용 116㎡ / 그 밖 연면적 150㎡). ""=미응답 */
      ruralHouseType994?: "" | "multi_unit" | "other";
      /** 그 밖의 주택 연면적(㎡) — 공동주택 전용면적은 명부 행 `exclusiveArea`(행 값으로 덮는다) */
      ruralHouseFloorAreaSqm994?: string;
      /** 공동주택 전용면적(㎡) — **행 값**(`house-count-exclusion-rows.ts`가 채운다). 폼 입력 칸 없음 */
      ruralHouseExclusiveAreaSqm994?: string;
      /** 명부 행 법정동코드 — **행 값**. ⑧·⑫ 수도권 모순 판정 전용(NH-20) */
      ruralHouseRegionCode?: string;
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
      /** 법 §99① 「**거주자**(주택건설사업자는 제외한다)**가** …」 (D11-05) */
      isResident99: boolean;
      /** 법 §99① 괄호 「(**주택건설사업자는 제외한다**)」 — ON이면 적용 배제 (D11-05) */
      isHousingConstructionBusiness99: boolean;
      /** 취득시 기준시가 (원) */
      standardPriceAtAcquisition99: string;
      /** 취득일+5년 시점 기준시가 (원) — 5년 후 양도 시 필수 */
      standardPriceAt5Years99: string;
      /** 양도시 기준시가 (원) — 미입력 시 자산 standardPriceAtTransfer fallback */
      standardPriceAtTransfer99: string;
      /** 전용면적 (㎡) — 고가주택 판정 (165/149㎡ 기준 시대) */
      exclusiveAreaSqm99: string;
      /** 고급주택(기준일 당시 소득세법 시행령 §156) 주택 유형 (NH-02). ""=미응답 */
      houseType99?: "" | "apartment" | "detached";
      /** (단독) 연면적(㎡) */
      grossFloorAreaSqm99?: string;
      /** (단독) 딸린 토지 면적(㎡) */
      attachedLandAreaSqm99?: string;
      /** (단독) 취득세 시가표준액 2천만원 이상 */
      stdPriceFloorMet99?: "" | "yes" | "no" | "unknown";
      /** (단독) 엘리베이터·에스컬레이터·67㎡ 이상 수영장 중 1개 이상 */
      luxuryFacility99?: "" | "yes" | "no" | "unknown";
      /** (2호 · 매매 취득) 주택건설업자와 최초로 매매계약·계약금 납부한 사람이 본인인가 (NH-03). ""=미응답 */
      firstContract99?: "" | "yes" | "no" | "unknown";
      /** (재개발 완공 아파트 조합원 · 준공일이 신축주택취득기간 뒤) 조합이 기간 안에 조합원 외의 자와 잔여주택 매매계약을 직접 체결하고 계약금을 받았는가 — 조특령 §99③2호 (NH-27). ""=미응답 */
      remainderContract99?: "" | "yes" | "no" | "unknown";
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
      // ── PHD 환산 (Phase 2, 2026-07-27): 최초공시 전 취득 시 취득시 기준시가 §164⑦ 자동 산출 ──
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
      /** 법 §98의8① 「**거주자가** 대통령령으로 정하는 준공후미분양주택으로서 …」 (D11-05) */
      isResident988: boolean;
      /** 취득시 기준시가 (원) — 5년 후 양도 안분 */
      standardPriceAtAcquisition988: string;
      /** 취득일+5년 시점 기준시가 (원) */
      standardPriceAt5Years988: string;
      /** 양도시 기준시가 (원) — 미입력 시 자산 standardPriceAtTransfer fallback */
      standardPriceAtTransfer988: string;
      // ── PHD 환산 (Phase 4, 2026-07-27): 최초공시 전 취득 취득시 기준시가 §164⑦ 자동 산출 ──
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
      /** 법 §98① 「**거주자가** …」 — 비거주자는 적용 배제 (D11-05) */
      isResident98: boolean;
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
      /** 매매계약일 현재 입주 사실 3-state — ""(미선택) | yes(있음) | no(없음) | unknown(모름). "no"만 적용 (국세청 법규과-1582·부동산거래관리과-1012) */
      occupiedAtContract982?: "" | "yes" | "no" | "unknown";
      /** 법 §98의2① 「**거주자가** 2008년 11월 3일부터 …」 — 비거주자는 적용 배제 (D11-05) */
      isResident982: boolean;
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
      /** US-42 — 국내사업장 있는 비거주자(`nonresident_with_pe`)는 적용 주체가 아니다(법 §98의3①) */
      residencyType983: "resident" | "nonresident_no_pe" | "nonresident_with_pe";
      /** 사업주체 취득 / 자기건설 (법②) */
      houseType983: "purchased" | "self_built";
      /** 최초 매매계약일 (YYYY-MM-DD) — purchased */
      contractDate983: string;
      /** 계약서상 계약금 전액 완납일 (YYYY-MM-DD) — purchased + 취득일 > 2010.2.11 (US-21) */
      downPaymentCompletedDate983: string;
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
      // ── PHD 환산 (Phase 4, 2026-07-27): 최초공시 전 취득 취득시 기준시가 §164⑦ 자동 산출 ──
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
      /** US-42 — 거주자 또는 국내사업장 없는 비거주자(법 §98의5①). 기본 true(D11-05 방식 — 화면에 보이고 끌 수 있다) */
      isEligibleSubject985: boolean;
      /** 최초 매매계약일 (YYYY-MM-DD) — 2010.5.14~2011.4.30 */
      contractDate985: string;
      /** 입주자 모집공고안에 공시된 분양가격 (원, CurrencyInput) — 령 §98의4④ (D2 US-58, 인하율 % 직접 입력 대체) */
      announcedPrice985: string;
      /** 매매계약서상의 매매가격 (원, CurrencyInput) — 령 §98의4④ */
      contractPrice985: string;
      /** 2010.2.11 현재 수도권 밖 미분양 확인 */
      isNonCapitalUnsoldAtCutoff985: boolean;
      isFirstContract985: boolean;
      isNotOccupiedAtContract985: boolean;
      isNotRecontract985: boolean;
      standardPriceAtAcquisition985: string;
      standardPriceAt5Years985: string;
      standardPriceAtTransfer985: string;
      // ── PHD 환산 (Phase 4, 2026-07-27): 최초공시 전 취득 취득시 기준시가 §164⑦ 자동 산출 ──
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
      /** US-42 — 거주자 또는 국내사업장 없는 비거주자(법 §98의6①). 기본 true */
      isEligibleSubject986: boolean;
      /** 1호 사업주체등 2년 임대 후 취득 / 2호 취득 후 5년 임대 */
      hoType986: "seller_rented" | "buyer_rented";
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
      /** (2호) 실제 임대개시일 — 기산일은 max(사업자등록일, 임대사업자등록일, 이 날짜) (령 §98의5⑤1호) */
      rentalStartDate986: string;
      /** (2호) 사업자등록일 (소법 §168) — US-60 */
      businessRegistrationDate986: string;
      /** (2호) 임대사업자등록일 (민특법 §5) — US-60 */
      rentalRegistrationDate986: string;
      /** (2호) 공실 구간(양 끝 포함) — 임대기간에서 제외 (US-24). 옛 기록은 migrate가 [] 로 채운다 */
      rentalVacancyPeriods986: VacancyPeriodFormItem[];
      /** (2호) 임대종료일 — 빈값 = 양도일까지 */
      rentalEndDate986: string;
      /** (2호) 상속 합산 임대기간 (개월) */
      inheritedRentalMonths986: string;
      standardPriceAtAcquisition986: string;
      standardPriceAt5Years986: string;
      standardPriceAtTransfer986: string;
      // ── PHD 환산 (Phase 4, 2026-07-27): 최초공시 전 취득 취득시 기준시가 §164⑦ 자동 산출 ──
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
      /** 령 §98의6②3·4호 제외 대상이 아님 — 해제된 주택 자체(3호) · 해제자·배우자 등의 취득 주택(4호) */
      isNotRecontract987: boolean;
      /**
       * 법 §98의7① 「**내국인이** 2012년 9월 24일 현재 …」 (D11-05).
       * 조특법 §2①1호: 「"내국인"이란 「소득세법」에 따른 **거주자** 및 「법인세법」에 따른
       * 내국법인을 말한다」 ⇒ 개인 양도소득세 국면에서는 사실상 거주자와 같다.
       */
      isDomestic987: boolean;
      /** 취득시 기준시가 (원) — 5년 후 양도 안분 */
      standardPriceAtAcquisition987: string;
      /** 취득일+5년 시점 기준시가 (원) */
      standardPriceAt5Years987: string;
      /** 양도시 기준시가 (원) — 미입력 시 자산 standardPriceAtTransfer fallback */
      standardPriceAtTransfer987: string;
      // ── PHD 환산 (Phase 4, 2026-07-27): 최초공시 전 취득 취득시 기준시가 §164⑦ 자동 산출 ──
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
      // ── PHD 환산 (Phase 3, 2026-07-27): 최초공시 전 취득 시 취득시 기준시가 §164⑦ 자동 산출 ──
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
      /** 판정 메뉴 명부 행 id — 판정 → 계산기 전달분만 싣는다(「어느 주택인가」) */
      houseId?: string;
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
    | "unsold_98_7" | "unsold_98_8" | "unsold_99_2" | "new_99" | "new_99_3"
    | "rental_97" | "rental_97_2" | "";
  /** 판정 메뉴 명부 행 id — 판정 → 계산기 전달분만 싣는다(「어느 주택인가」) */
  houseId?: string;
  /** 감면주택 취득일 (YYYY-MM-DD) */
  houseAcquisitionDate: string;
  /** 감면주택 매매계약일 (YYYY-MM-DD, 선택) */
  houseContractDate: string;
  /** §99 전용 — 국민주택 여부 (신축주택취득기간 종기 1999.6.30 ↔ 1999.12.31) */
  isNationalHousing: boolean;
  /**
   * §97·§97의2 전용 — 임대개시일 (YYYY-MM-DD). 선택 필드 — 이 칸이 생기기 전 기록에는 없다.
   * ⑤ 입력·④ 전송·⑧ 필수값은 `usesRentalStartDate(article)` 하나로 게이트한다.
   */
  houseRentalStartDate?: string;
  /**
   * §99·§99의3 전용 — 감면주택 유형(매수 = 최초 매매계약일 / 자기건설 = 사용승인일 / 종전(원시) §99의3). 선택 필드 — 이 칸이 생기기 전 기록에는 없다.
   * ⑤ 입력·④ 전송·⑧ 필수값·엔진이 `usesNewHousingKind(article)` 하나로 게이트한다(NH-23·NH-24).
   */
  housingKind?: NewHousingKind;
  /** 종전(원시) §99의3 전용 — 대통령령이 정하는 수도권 밖 지역 소재 (3-state: 「모름」·미답 = 불성립 + 확인 필요) */
  originalOutsideMetropolitan?: TriStateAnswer;
  /** 종전(원시) §99의3 전용 — 국민주택 (3-state) */
  originalNationalHousing?: TriStateAnswer;
  /** 해당 조문 본 요건 충족 확인 */
  requirementsConfirmed: boolean;
  /**
   * 명부 행이 상속주택인가 — **행에서 도출**한다(`rowSpecialHouseExclusions`, 사용자 입력 칸 아님). 폼 전역 옛 선언에는 없다.
   * 상속받은 §98 시리즈·§99·§99의3 감면주택은 소유주택에서 빠지지 않는다(US-06 — 조심 2017중1433).
   */
  isInherited?: boolean;
  /**
   * 상속 행 · §98의3·§98의5·§98의7 — 상속 당시 분양권이었고 상속인이 잔금을 내고 취득했는가(US-06 · 기획재정부 조세법령운용과-1103).
   * ⑤ 행 ⑥이 3-state로 받고 ⑧이 답을 요구한다. 「모름」은 불성립 + 확인 필요.
   */
  inheritedPresaleCompletedByHeir?: "" | "yes" | "no" | "unknown";
  /**
   * 증여(이월과세 대상 증여 포함)로 취득한 감면주택인가 — ⑤ 행 ⑥ 토글(상속 행이 아니고 `asksRowGiftQuestion(article)`일 때). 기본 꺼짐.
   * 증여로 받은 §98 시리즈·§99·§99의3 주택은 주택 수에서 빠지지 않는다(US-06 후속 · 서면-2022-부동산-0888 · 서면인터넷방문상담4팀-1192).
   */
  acquiredByGift?: boolean;
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
