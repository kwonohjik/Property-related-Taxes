/**
 * 자산별 감면 폼 타입.
 * Zod reductionSchema(lib/api/transfer-tax-schema.ts)와 1:1 대응.
 * 숫자 입력 필드는 string 타입(빈 문자열 = 미입력).
 * calc-wizard-asset.ts 800줄 정책에 따라 분리 (2026-05-11).
 */

import type { NewHousingKind } from "@/lib/tax-engine/transfer-reductions/special-house-exclusion-kind";
import type { TriStateAnswer } from "@/lib/tax-engine/transfer-reductions/new-99-luxury-house";
import type { RentalReductionFormVariant } from "./calc-wizard-asset-reduction-rental";

export type AssetReductionForm =
  | {
      /**
       * 「조문 미정」 — 구 `unsold_housing` 이력·세션의 취득일이 §98의3 기간(2009.2.12~2010.2.11) 밖이라
       * 조문을 정하지 못한 항목 (리뷰 Q-28, 2026-11-10). 엔진·API로 가지 않는다 — ⑧이 막고 사용자가 항목을 해제한 뒤 조문을 다시 고른다.
       */
      type: "unsold_housing_unresolved";
    }
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
  // ── Phase 2 (2026-06-11): 장기임대 §97 시리즈 (RentalReductionFormVariant — `calc-wizard-asset-reduction-rental.ts`) ──
  | RentalReductionFormVariant;

// ── Phase 2 (2026-06-11): 장기임대 §97 시리즈 — `calc-wizard-asset-reduction-rental.ts`로 분리(2026-11-13) · 소비처 호환 재-export ──
export type {
  RentHistoryFormItem,
  VacancyPeriodFormItem,
  DeemedRentalPeriodFormItem,
  RentalCommonFormFields,
  RentalReductionFormVariant,
} from "./calc-wizard-asset-reduction-rental";

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
