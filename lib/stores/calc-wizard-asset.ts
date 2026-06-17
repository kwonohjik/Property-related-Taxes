/**
 * AssetForm 관련 타입·팩토리·마이그레이션
 * calc-wizard-store.ts 800줄 정책에 따라 분리.
 *
 * 겸용주택 + 보유 중 일부 용도변경 관련 필드 디폴트·마이그레이션은
 * `calc-wizard-asset-mixed-use.ts`로 별도 분리(800줄 정책 준수, 2026-04-30).
 * NBL 관련 서브 타입(NblBusinessUsePeriod 등 4종)은
 * `calc-wizard-asset-nbl.ts`로 별도 분리(2026-05-11).
 */

import type { ResidencePeriod } from "./calc-wizard-asset-residence";
import type { CarryoverTaxationForm } from "./calc-wizard-asset-carryover";
export type { ResidencePeriod, CarryoverTaxationForm };
export { type ParcelFormItem, migrateParcel } from "./calc-wizard-parcel";
import type { ParcelFormItem } from "./calc-wizard-parcel";

// ── NBL 서브 타입 (별도 모듈, 800줄 정책) ──
export type {
  NblBusinessUsePeriod,
  ResidenceHistoryInput,
  GracePeriodInput,
  NblGracePeriodInput,
  HouseEntry,
  PresaleRightEntry,
} from "./calc-wizard-asset-nbl";
import type { NblBusinessUsePeriod, ResidenceHistoryInput, NblGracePeriodInput } from "./calc-wizard-asset-nbl";

// ── 감면 폼 타입 (별도 모듈, 800줄 정책) ──
export type {
  AssetReductionForm,
  ReductionType,
  PriorReductionUsageItem, SpecialHouseExclusionFormItem,
} from "./calc-wizard-asset-reduction";
import type { AssetReductionForm } from "./calc-wizard-asset-reduction";

// ── 팩토리·마이그레이션은 별도 모듈 (800줄 정책) ──
export { makeDefaultAsset, makeDefaultCompanionAsset, migrateAsset } from "./calc-wizard-asset-factory";

/**
 * 자산 1건의 폼 상태 (문자열 기반).
 * 주된 자산과 동반 자산을 구분하지 않고 동일한 구조로 관리.
 * assets[0]이 대표 자산 (isPrimaryForHouseholdFlags = true).
 */
import type { BurdenedGiftFormSlice } from "./calc-wizard-asset-bg";
export type { BurdenedGiftFormSlice } from "./calc-wizard-asset-bg";
import type { RedevelopmentFormSlice } from "./calc-wizard-asset-redev";
export type { RedevelopmentFormSlice } from "./calc-wizard-asset-redev";
import type { InheritanceAcquisitionFormSlice } from "./calc-wizard-asset-inheritance-acq";
export type { InheritanceAcquisitionFormSlice } from "./calc-wizard-asset-inheritance-acq";
import type { NblOtherFormSlice } from "./calc-wizard-asset-nbl-other";
export type { NblOtherFormSlice } from "./calc-wizard-asset-nbl-other";

export interface AssetForm extends BurdenedGiftFormSlice, RedevelopmentFormSlice, InheritanceAcquisitionFormSlice, NblOtherFormSlice {
  assetId: string;
  assetLabel: string;
  /**
   * 자산 종류 — 6종 (API 전달 시 right_to_move_in/presale_right → housing 으로 변환,
   * commercial_building → "building" + commercialBuildingValuation 서브객체로 분리 전달)
   */
  assetKind: "housing" | "land" | "building" | "right_to_move_in" | "presale_right" | "commercial_building" | "general_building" | "redevelopment_apt";
  /** 입주권 승계조합원 여부 (assetKind === "right_to_move_in" 일 때만 의미) */
  isSuccessorRightToMoveIn: boolean;
  /** 세대 Step(Step3/4)의 1세대1주택 비과세·다주택 중과 판정 기준 대표 자산 여부 */
  isPrimaryForHouseholdFlags: boolean;
  /** 양도시점 기준시가 (안분 키, 문자열) */
  standardPriceAtTransfer: string;
  /** 양도시 기준시가 레이블 (API 조회 결과 표시용) */
  standardPriceAtTransferLabel: string;
  /**
   * 직접 귀속 필요경비 (deprecated — backward-compat 유지).
   * 신규 입력은 `capitalExpenditure` + `transferExpense` 분리 사용.
   */
  directExpenses: string;
  /** 자본적 지출액 (소득세법 §97① 가목) — §97② 단서 swap 비교에 사용 */
  capitalExpenditure: string;
  /** 양도비 (소득세법 §97① 나목) — §97② 단서 swap 비교에 사용 */
  transferExpense: string;

  // ── 자산별 감면 (복수 선택 허용, 조특법 §127⑦) ──
  /** 이 자산에 적용할 감면 목록. 복수 체크 가능, 엔진이 §127⑦ 규칙 적용. */
  reductions: AssetReductionForm[];

  /** 상속 취득가액 산정 모드: auto=보충적평가, manual=직접입력 */
  inheritanceValuationMode: "auto" | "manual";
  /** 상속개시일 (YYYY-MM-DD) */
  inheritanceDate: string;
  /** 자산 종류 (토지/단독주택/공동주택 — 보충적평가용) */
  inheritanceAssetKind: "land" | "house_individual" | "house_apart";
  /** 취득 당시 면적 (㎡) — 취득 기준시가 산정, Pre1990 환산 */
  acquisitionArea: string;
  /** 양도 당시 면적 (㎡) — 양도 기준시가 산정 */
  transferArea: string;
  /**
   * 면적 입력 시나리오 (UI 전용, API 전송 시 제외)
   * - "same"      : 취득면적 = 양도면적 (일반, 기본값)
   * - "partial"   : 일부 양도 — 취득 토지 중 일부만 양도
   * - "reduction" : 환지처분 (감환지) — 교부면적 < 권리면적 (소득령 §162의2)
   * - "increase"  : 환지처분 (증환지) — 교부면적 > 권리면적 (증가분은 별도 취득 분리)
   * UI에서 의제취득면적을 acquisitionArea에, 환지확정일 익일을 acquisitionDate에 사전 반영.
   */
  areaScenario: "same" | "partial" | "reduction" | "increase";
  /** 환지처분확정일 (areaScenario=reduction/increase 시, YYYY-MM-DD) */
  replottingConfirmDate: string;
  /** 환지 권리면적 (㎡, areaScenario=reduction 시) */
  entitlementArea: string;
  /** 환지 교부면적 (㎡, areaScenario=reduction 시) */
  allocatedArea: string;
  /** 환지 이전 종전면적 (㎡, areaScenario=reduction 시, 의제취득면적 산식에 사용) */
  priorLandArea: string;
  /** 상속개시일 직전 공시가격: 토지=원/㎡, 주택=원 총액 */
  publishedValueAtInheritance: string;
  /** 직접 입력 취득가액 (매매 actual / 상속 manual / 증여 신고가액) */
  fixedAcquisitionPrice: string;

  // ── 자산별 소재지 (Step1 자산 편집 Sheet에서 입력) ──
  /** 주소 (Vworld 도로명) */
  addressRoad: string;
  /** 주소 (Vworld 지번) */
  addressJibun: string;
  /** 상세주소 */
  addressDetail: string;
  /** 건물명 */
  buildingName: string;
  /** 경도 */
  longitude: string;
  /** 위도 */
  latitude: string;

  // ── 조정대상지역 조회 결과 (주택 전용) ──
  /** 취득 시점 조정대상지역 여부 (주택만 조회, 비주택은 null) */
  isRegulatedAreaAtAcq: boolean | null;
  /** 양도 시점 조정대상지역 여부 (주택만 조회, 비주택은 null) */
  isRegulatedAreaAtTransfer: boolean | null;
  /**
   * 법정동코드 10자리 (AddressSearch PNU 앞 10자리).
   * 제공 시 엔진이 isRegulatedByBjdCode()로 정밀 판정.
   * 미제공 시 isRegulatedArea boolean fallback.
   */
  regionCode?: string;

  // ── 취득시기 상이 필지 분리 (assetKind === "land" 전용) ──
  /** 토지 내 취득시기 상이 필지 분리 계산 여부 (소득세법 시행령 §162①6호) */
  parcelMode: boolean;
  /** 취득시기 상이 필지 목록 */
  parcels: ParcelFormItem[];

  isOneHousehold: boolean;
  /** 거주 정보 — 1세대1주택 표2 장특공제용 (자세한 타입은 calc-wizard-asset-residence.ts) */
  residenceInputMode: "interval" | "direct";
  residencePeriods: ResidencePeriod[];
  residencePeriodMonthsAsset: string;
  /** actual 모드 시 이 자산의 계약서상 양도가액 */
  actualSalePrice: string;
  /**
   * 공유 지분율 분자 (기본 100). 같은 물건을 다회 분할 취득(지분 단계취득)한 자산에서
   * 본 자산이 보유한 지분의 분자. 미설정 시 100 (단독 소유).
   * UI 입력은 100% 기준값(양도가·취득가·필요경비 등 모든 금액). API 변환 시 × ratio 자동 적용.
   * 예제 사례 27 (아파트 2회 지분취득) 패턴.
   */
  ownershipNumerator: string;
  /**
   * 공유 지분율 분모 (기본 100). 100/100 = 단독 소유.
   */
  ownershipDenominator: string;
  /** 취득 원인 — purchase=매매, inheritance=상속, gift=증여, carryover_gift=이월과세(증여), newConstruction=신축(자가건축)
   * @deprecated `"burdened_gift"`는 D-1(2026-05-12) 이후 deprecation. 양도 시점의 거래 형태이지 취득 사건이 아님.
   * 신규 데이터는 `transferType: "burdened_gift"` 사용. 레거시 데이터는 normalize에서 자동 변환.
   */
  acquisitionCause: "purchase" | "inheritance" | "gift" | "carryover_gift" | "newConstruction" | "burdened_gift";

  /**
   * 양도 형태 (양도자 관점) — Phase 2(2026-05-12) 신규.
   * "regular": 일반 양도 (매매·교환 등)
   * "burdened_gift": 부담부증여 (소령 §159) — 채무 인수분을 유상 양도로 의제
   * "": 미선택 (UI 기본값 "regular"로 자동 보정)
   *
   * 부담부증여는 "취득" 사건이 아니라 "양도" 사건이므로 acquisitionCause와 별도 차원의 필드.
   * 부담부증여 ON 시 acquisitionCause는 증여자 당초 취득 정보(매매·상속·증여·신축)를 받음.
   */
  transferType: "" | "regular" | "burdened_gift";

  // ── 신축(자가건축) 취득일 4-시점 (영 §162①4호) ──
  /**
   * 사용승인일 (YYYY-MM-DD) — 영 §162①4호 취득일 기준.
   * 신축주택의 취득일은 사용승인일·사용검사필증 교부일·임시사용승인일·사실상 사용일 중 가장 이른 날.
   * acquisitionCause === "newConstruction" 시 필수 (또는 4시점 중 최소 1개).
   */
  occupancyApprovalDate: string;
  /**
   * 사용검사필증 교부일 (YYYY-MM-DD) — 도시계획법·건축법 용어 차이로 별도 입력.
   * 영 §162①4호: 실무상 사용승인일과 동일하거나 별도 시점일 수 있음. 입력 시 4시점 비교에 포함.
   */
  approvalCertificateDate: string;
  /**
   * 임시사용승인일 (YYYY-MM-DD) — 사용승인일보다 이른 경우에만 입력.
   * 영 §162①4호: 임시사용승인일이 사용승인일보다 이르면 임시사용승인일을 취득일로 봄.
   */
  temporaryApprovalDate: string;
  /**
   * 사실상 사용일 (YYYY-MM-DD) — 사용승인 전 실제 입주·사용한 경우.
   * 영 §162①4호: 사실상 사용일이 가장 이른 날이면 이 날을 취득일로 봄.
   */
  actualUseDate: string;

  // ── 부수토지 한도 산정 (영 §154⑦, 2022년 개정 후 3단계) ──
  /**
   * @deprecated isUrbanArea 단일 boolean은 영 §154⑦ 3단계(3/5/10배) 표현 못함.
   * 신규 입력은 appurtenantLandZone 사용. 하위호환 위해 유지.
   */
  isUrbanArea: boolean | undefined;
  /**
   * 부수토지 인정 한도 zone (영 §154⑦):
   * - "metropolitan_residential": 수도권 도시지역 + 주거·상업·공업 → 3배
   * - "non_metropolitan_or_green": 수도권 녹지 또는 수도권 외 도시지역 → 5배
   * - "non_urban": 도시지역 외 → 10배
   * undefined: 미선택 (자동 분기 시 가장 보수적 3배 적용)
   */
  appurtenantLandZone:
    | "metropolitan_residential"
    | "non_metropolitan_or_green"
    | "non_urban"
    | undefined;

  // ── companion 토지 세율 수동 오버라이드 ──
  /**
   * 부수토지 세율 수동 오버라이드.
   * undefined: 자동 분기 (엔진이 조건 판단)
   * "shortTermHousing70": 70% 강제 (주택 단기 세율)
   * "shortTerm60":        60% 강제 (1~2년 단기 세율)
   * "progressive":        누진세율 강제 (기본세율)
   */
  manualHoldingPeriodOverride: "shortTermHousing70" | "shortTerm60" | "progressive" | undefined;

  // ── 토지 자산 성격 (사례 28 — landNature 명시 입력 정책) ──
  /**
   * 토지 자산의 성격 (assetKind === "land" 전용).
   * - "appurtenant": 부수토지 — 주택·건물에 딸린 토지 (§89①3가 비과세 대상)
   * - "standalone":  독립 나대지 — 주택·건물과 무관한 순수 토지
   * undefined: 미선택 (일괄양도 land+housing 조합 시 validate에서 차단)
   *
   * 이 필드는 엔진이 appurtenantLandRateMode(폼-수준) 대신 자산-수준에서 일체과세 판단을 위해 사용.
   * 단독 토지 양도 시에는 엔진에 전달되지만 "standalone"이면 일체과세 분기를 타지 않음.
   */
  landNature: "appurtenant" | "standalone" | undefined;
  /** 이월과세(증여) 서브객체 — acquisitionCause === "carryover_gift" 시만 사용 (§97조의2) */
  carryover?: CarryoverTaxationForm;
  /** 본인 취득일 (YYYY-MM-DD) */
  acquisitionDate: string;
  /**
   * 매매계약일 — 분양계약일/일반매매계약일 (계약금 납부 기준일).
   * Round 9 (2026-05-06): 신축·미분양·임대 감면 13개 조문(§99·§99의3·§98 시리즈·§97의2·§97의5·§99의2)의
   * 시한 판정 1차 기준. 미입력 시 acquisitionDate fallback (조문 단서: "매매계약 + 계약금 납부 = 취득").
   * 주택 자산만 의미 있음. 토지·건물은 미사용.
   */
  assetContractDate?: string;
  /** 피상속인 취득일 (상속 시 단기보유 통산용, YYYY-MM-DD) */
  decedentAcquisitionDate: string;
  /** 증여자 취득일 (YYYY-MM-DD) */
  donorAcquisitionDate: string;
  /** 매매 환산취득가 사용 여부 */
  useEstimatedAcquisition: boolean;
  /** 매매 감정가액 사용 여부 (소득세법 §97 + 시행령 §163⑥). useEstimatedAcquisition과 상호 배타.
   *  true 시 fixedAcquisitionPrice를 감정가액으로 해석, 개산공제 자동 적용. */
  isAppraisalAcquisition: boolean;
  /** 매매사례가액(추계) 취득 모드 — 소득세법 시행령 §176의2③1호.
   *  useEstimatedAcquisition·isAppraisalAcquisition 모두 false 일 때 매매사례가액 모드 선택 가능.
   *  3중 배타: isSalesCaseAcquisition=true 이면 다른 두 모드는 false 강제. */
  isSalesCaseAcquisition: boolean;
  /** 매매사례가액 (원) — isSalesCaseAcquisition=true 시 엔진으로 전달.
   *  RTMS 자동조회 onSelect 콜백으로만 자동채움. 수동 수정 시 similarSalesSource 제거. */
  similarSalesValue: string;
  /** RTMS 자동조회 출처 배지 — "rtms_auto" | undefined. 수동 수정 시 제거. */
  similarSalesSource: "rtms_auto" | undefined;
  /** 취득 주소의 시군구코드 (5자리) — RtmsSimilarSalesModal sigunguCode prop.
   *  주소 AddressSearch onChange → resolveSigunguCode()로 파생. NBL 전용 nblLandSigunguCode와 별개. */
  acquisitionSigunguCode: string;
  /** 본인이 신축·증축한 건물 여부 (§114조의2 가산세). acquisitionCause === "purchase" + 매매·housing/building 전용 */
  isSelfBuilt: boolean;
  /** 신축·증축 구분 */
  buildingType: "new" | "extension" | "";
  /** 신축·증축 완공일 (YYYY-MM-DD) */
  constructionDate: string;
  /** 증축 시 증축 부분 바닥면적 (㎡) — buildingType === "extension" 필수 */
  extensionFloorArea: string;

  // ── 토지/건물 취득일 분리 (housing·building 공통) ──
  /**
   * 토지·건물의 소유자가 다른 경우 본인 소유 부분 지정 (소령 §166⑥, §168②).
   * "both" (기본): 토지·건물 모두 본인.
   * "building_only": 건물만 본인 (토지는 배우자·타인 소유).
   * "land_only": 토지만 본인.
   */
  selfOwns: "both" | "building_only" | "land_only";
  /** 토지와 건물의 취득일이 다른지 여부 (원시취득·신축 등) */
  hasSeperateLandAcquisitionDate: boolean;
  /** 토지 취득일 (YYYY-MM-DD) — hasSeperateLandAcquisitionDate === true 시 필수 */
  landAcquisitionDate: string;
  /** 가액 분리 방식: "apportioned"(기준시가 비율 자동 안분) | "actual"(직접 입력) */
  landSplitMode: "apportioned" | "actual";
  /** 토지 양도가액 (실제 모드 또는 안분 override) */
  landTransferPrice: string;
  /** 건물 양도가액 (실제 모드 또는 안분 override) */
  buildingTransferPrice: string;
  /** 토지 취득가액 (실거래가 모드 시) */
  landAcquisitionPrice: string;
  /** 건물 취득가액 (실거래가 모드 시) */
  buildingAcquisitionPrice: string;
  /** 토지 자본적지출·필요경비 */
  landDirectExpenses: string;
  /** 건물 자본적지출·필요경비 */
  buildingDirectExpenses: string;
  /** 토지 양도시 기준시가 — 환산취득가 분리 계산 시 사용 */
  landStandardPriceAtTransfer: string;
  /** 건물 양도시 기준시가 — 환산취득가 분리 계산 시 사용 */
  buildingStandardPriceAtTransfer: string;

  // ── 개별주택가격 미공시 취득 환산 (§164⑤) ──
  /** true 시 3-시점 미공시 취득 환산 모드 활성화 */
  usePreHousingDisclosure: boolean;
  /** 최초 고시일 (YYYY-MM-DD, 사용자 직접 입력) */
  phdFirstDisclosureDate: string;
  /** 최초 고시 개별주택가격 P_F (원) */
  phdFirstDisclosureHousingPrice: string;
  /** 취득당시 선택 연도 (문자열 "2013" 등, 자동추천 또는 수동 변경) */
  phdLandPriceYearAtAcq: string;
  /** true = 수동 변경됨, false = 자동추천 */
  phdLandPriceYearAtAcqIsManual: boolean;
  /** 취득당시 토지 단위 공시지가 (원/㎡) */
  phdLandPricePerSqmAtAcq: string;
  /** 취득당시 건물 기준시가 (원) */
  phdBuildingStdPriceAtAcq: string;
  /** 최초공시일 선택 연도 */
  phdLandPriceYearAtFirst: string;
  /** true = 수동 변경됨 */
  phdLandPriceYearAtFirstIsManual: boolean;
  /** 최초공시일 토지 단위 공시지가 (원/㎡) */
  phdLandPricePerSqmAtFirst: string;
  /** 최초공시일 건물 기준시가 (원) */
  phdBuildingStdPriceAtFirst: string;
  /** 양도시 개별주택가격 P_T (원) */
  phdTransferHousingPrice: string;
  /** 양도시 선택 연도 */
  phdLandPriceYearAtTransfer: string;
  /** true = 수동 변경됨 */
  phdLandPriceYearAtTransferIsManual: boolean;
  /** 양도시 토지 단위 공시지가 (원/㎡) */
  phdLandPricePerSqmAtTransfer: string;
  /** 양도시 건물 기준시가 (원) */
  phdBuildingStdPriceAtTransfer: string;
  /**
   * 겸용주택 PHD 주택부수토지 면적 수동 지정 (㎡).
   * 비어 있으면 엔진이 양도시 주택연면적 비율로 자동 계산.
   * 최초 공시 당시 전체가 주택이었던 경우 전체 토지 면적으로 수정.
   */
  phdResidentialLandArea: string;

  /**
   * Case A 4부분 안분 전용 (취득시 전체 주택 → 양도시 일부 상가, 최초공시 < 용도변경일).
   * 엑셀 사례 기준: 취득시·최초공시 시점에는 건물 전체가 주택이었으나
   * 양도시점 기준으로 "주택건물 부분"과 "상가건물 부분"의 기준시가를 각각 분리 입력.
   * Case A 비활성 시 빈 문자열 유지.
   */
  /** 취득시 상가건물 기준시가 (원) — Case A 4부분 안분용 */
  phdCommercialBuildingStdPriceAtAcq: string;
  /** 최초공시일 상가건물 기준시가 (원) — Case A 4부분 안분용 */
  phdCommercialBuildingStdPriceAtFirst: string;

  /** 매매 estimated 시 취득시점 기준시가 (원, 환산 분자) */
  standardPriceAtAcq: string;
  /** 취득시 기준시가 레이블 (API 조회 결과 표시용) */
  standardPriceAtAcqLabel: string;
  /** 의제취득일(1985.1.1.) 시점 기준시가 직접 입력 override 사용 여부 (PreDeemedInputs 전용) */
  useStandardPriceAtAcqOverride: boolean;
  /** 양도시 기준시가 직접 입력 override 사용 여부 (PreDeemedInputs 전용) */
  useStandardPriceAtTransferOverride: boolean;

  /** 취득 시점 ㎡당 공시지가 (원/㎡, 토지·비주거건물 전용) */
  standardPricePerSqmAtAcq: string;
  /** 양도 시점 ㎡당 공시지가 (원/㎡, 토지·비주거건물 전용) */
  standardPricePerSqmAtTransfer: string;

  // ── 상속 주택 환산취득가 보조 입력 (주택 자산 + 상속개시일 < 2005-04-30) ──
  /** true 시 3-시점 보조 계산 활성화 */
  inhHouseValEnabled: boolean;
  /** 최초 고시일 (기본 "2005-04-30") */
  inhHouseValFirstDisclosureDate: string;
  /** 토지 면적 (㎡) */
  inhHouseValLandArea: string;
  /** 양도시 개별공시지가 (원/㎡) */
  inhHouseValLandPricePerSqmAtTransfer: string;
  /** 최초고시 시점 개별공시지가 (원/㎡) */
  inhHouseValLandPricePerSqmAtFirst: string;
  /** 상속개시일 시점 개별공시지가 (원/㎡) — 1990-08-30 이후 시 직접 입력 */
  inhHouseValLandPricePerSqmAtInheritance: string;
  /** 양도시 개별주택가격 (원) */
  inhHouseValHousePriceAtTransfer: string;
  /** 최초고시 시점 개별주택가격 (원) */
  inhHouseValHousePriceAtFirst: string;
  /** 양도당시 건물기준시가 (원) — 국세청 기준시가. 양도시 합계 기준시가의 건물 성분 */
  inhHouseValBuildingStdPriceAtTransfer: string;
  /** 최초고시 시점 건물기준시가 (원) — §164⑤ Sum_F 분모: 토지기준시가 + 이 값. 국세청 기준시가 */
  inhHouseValBuildingStdPriceAtFirst: string;
  /** 상속개시일 시점 건물기준시가 (원) — §164⑤ Sum_A 분자의 건물 성분. 국세청 기준시가 */
  inhHouseValBuildingStdPriceAtInheritance: string;
  /** 상속개시일 시점 주택가격 직접 입력 override 사용 여부 */
  inhHouseValUseHousePriceOverride: boolean;
  /** 상속개시일 시점 주택가격 직접 입력 override (원) */
  inhHouseValHousePriceAtInheritanceOverride: string;
  // 1990-08-30 이전 토지 등급가액 환산은 기존 pre1990* 7필드 재사용

  // ── 1990.8.30. 이전 취득 토지 환산 (assetKind === "land" + acquisitionDate < 1990-08-30) ──
  pre1990Enabled: boolean;
  pre1990PricePerSqm_1990: string;
  pre1990PricePerSqm_atTransfer: string;
  pre1990Grade_current: string;
  pre1990Grade_prev: string;
  pre1990Grade_atAcq: string;
  pre1990GradeMode: "number" | "value";

  // ── 비사업용 토지 정밀 판정 (assetKind === "land" 전용) ──
  /** 단순 체크박스 경로 — 상세 판정 없이 플래그만 전달 */
  isNonBusinessLand: boolean;
  /** true 시 엔진 자동 판정, isNonBusinessLand 체크박스 무시 */
  nblUseDetailedJudgment: boolean;

  // ── NBL 공통 ──
  /** 지목 (nblLandArea는 acquisitionArea 재사용 — area-taxonomy.md 원칙 B) */
  nblLandType: "" | "farmland" | "forest" | "pasture" | "housing_site" | "villa_land" | "other_land";
  nblZoneType: string;
  nblBusinessUsePeriods: NblBusinessUsePeriod[];

  // ── NBL 위치·거주 ──
  nblLandSigunguCode: string;
  nblLandSigunguName: string;
  nblResidenceHistories: ResidenceHistoryInput[];

  // ── NBL 무조건 면제 §168-14③ ──
  nblExemptInheritBefore2007: boolean;
  nblExemptInheritDate: string;
  nblExemptLongOwned20y: boolean;
  nblExemptAncestor8YearFarming: boolean;
  nblExemptPublicExpropriation: boolean;
  nblExemptPublicNoticeDate: string;
  nblExemptFactoryAdjacent: boolean;
  nblExemptJongjoongOwned: boolean;
  nblExemptJongjoongAcqDate: string;
  nblExemptUrbanFarmlandJongjoong: boolean;
  nblExemptInong: boolean;
  nblExemptInongDate: string;

  // ── NBL 양도일 의제 (§168조의14②) ──
  nblDeemedTransferReason: string; // none|auction|public_sale|kamco_consignment|newspaper_public_offering|republication
  nblDeemedTransferDate: string;

  // ── NBL 도시편입·수도권·공동상속 ──
  nblUrbanIncorporationDate: string;
  nblIsMetropolitanArea: "" | "yes" | "no" | "unknown";
  nblOwnershipRatio: string;

  // ── NBL 농지 세부 ──
  nblFarmingSelf: boolean;
  nblFarmerResidenceDistance: string;
  nblFarmlandIsWeekendFarm: boolean;
  nblFarmlandIsConversionApproved: boolean;
  nblFarmlandConversionDate: string;
  nblFarmlandIsMarginalFarm: boolean;
  nblFarmlandIsReclaimedLand: boolean;
  nblFarmlandIsPublicProjectUse: boolean;
  nblFarmlandIsSickElderlyRental: boolean;

  // ── NBL 임야 세부 ──
  nblForestHasPlan: boolean;
  nblForestIsPublicInterest: boolean;
  nblForestIsProtected: boolean;
  nblForestIsSuccessor: boolean;
  nblForestInheritedWithin3Years: boolean;
  nblForestInheritanceDate: string;

  // ── NBL 목장 세부 ──
  nblPastureIsLivestockOperator: boolean;
  nblPastureLivestockType: string;
  nblPastureLivestockCount: string;
  nblPastureLivestockPeriods: NblBusinessUsePeriod[];
  nblPastureInheritanceDate: string;
  nblPastureIsSpecialOrgUse: boolean;

  // ── NBL 주택·별장·나대지 세부 ──
  nblHousingFootprint: string;
  nblVillaUsePeriods: NblBusinessUsePeriod[];
  nblVillaIsEupMyeon: boolean;
  nblVillaIsRuralHousing: boolean;
  nblVillaIsAfter20150101: boolean;
  // nblOther*·nblRevenue* (기타토지 §168의11) 일체는 NblOtherFormSlice로 분리 (calc-wizard-asset-nbl-other.ts).

  // ── NBL 부득이한 사유 (§168의14①·§83의5①) ──
  nblGracePeriods: NblGracePeriodInput[];
  /** §83의5① 단서 — 부동산매매업 매매용부동산(1·2호 배제) */
  nblBusinessIsRealEstateDealer: boolean;

  // ── 상속 부동산 취득가액 의제 — InheritanceAcquisitionFormSlice (calc-wizard-asset-inheritance-acq.ts) ──

  // ── 장기임대주택 보유자 거주주택 비과세 특례 (소령 §155⑳) ──
  rentalHousingException: {
    applyException: boolean;
    /** 거주주택 양도(A) / PHRP 양도(B) */
    scenario: 'A' | 'B';
    rentalUnits: Array<{
      /** 임대사업자 등록일 (YYYY-MM-DD) */
      registrationDate: string;
      rentalType: 'short-4' | 'short-6' | 'long-8' | 'long-10' | 'pre-2018';
      rentalAcquisitionType: 'purchase' | 'construction';
      isApartment: boolean;
      region: 'seoul-metro' | 'non-metro' | 'regulated-area';
      /** 임대개시일 기준시가 (원, 문자열) */
      standardPriceAtRentalStart: string;
      /** 실제 임대 개월 수 */
      rentalMonths: string;
      /** 자동·자진말소 5년 내 양도 여부 */
      rentalAutoTermination: boolean;
      /** 기타 요건 충족 자기확인 (5%증액 등) */
      requirementsConfirmed: boolean;
    }>;
    /** B 시나리오: 직전거주주택 양도일 (YYYY-MM-DD) */
    priorResidenceTransferDate?: string;
    /** B 시나리오: 취득 당시 기준시가 P_acq (원, 문자열) */
    standardPriceAtAcquisitionForPhrp?: string;
    /** B 시나리오: 직전양도 당시 기준시가 P_prior (원, 문자열) */
    standardPriceAtPriorTransfer?: string;
    /** B 시나리오: 현 양도 당시 기준시가 P_transfer (원, 문자열) */
    standardPriceAtTransferForPhrp?: string;
  };

  // ── 상업용건물·오피스텔 환산취득가 (사례 29, 소득세법 시행령 §164⑧, §176조의2②2호) ──
  /**
   * 상업용건물·오피스텔 호별고시 시점 분기.
   * - "pre_disclosure": 호별고시 전 취득(~2004.12) → 건물기준시가 3시점 + 역환산 필요
   * - "post_disclosure": 호별고시 후 취득(2005.1~) → 호별고시가만으로 환산 가능
   * commercial_building + useEstimatedAcquisition=true 시만 의미 있음.
   */
  cbEra: "pre_disclosure" | "post_disclosure" | "";
  /** 전용면적 (㎡) */
  cbExclusiveArea: string;
  /** 공유면적 (㎡) */
  cbSharedArea: string;
  /** 대지면적 (㎡) */
  cbLandArea: string;
  /**
   * 호별 ㎡당 고시가 — 양도시 (원/㎡).
   * 국세청 기준시가 조회 시 "㎡당 가액" 입력.
   * 호별고시 전/후 취득 공통 사용.
   */
  cbUnitPriceAtTransfer: string;
  /**
   * 호별 ㎡당 고시가 — 최초고시(2005) 또는 취득시 (원/㎡).
   * cbEra === "pre_disclosure": 최초고시(2005) 시점 가액.
   * cbEra === "post_disclosure": 취득시 호별고시가.
   */
  cbUnitPriceAtFirstOrAcq: string;
  /**
   * 건물 기준시가 — 취득시 (원, 총액). cbEra === "pre_disclosure" 시만 필수.
   * 소득세법 시행령 §164①: 국세청 고시 건물기준시가.
   * 사용자(외부)에서 ㎡당 단가 × 연면적(전유+공용 보정계수 반영)을 미리 곱한 총액 입력.
   */
  cbBuildingStdPriceAtAcq: string;
  /**
   * 건물 기준시가 — 최초고시시(2005) (원, 총액). cbEra === "pre_disclosure" 시만 필수.
   */
  cbBuildingStdPriceAtFirst: string;
  /**
   * 건물 기준시가 — 양도시 (원, 총액).
   * cbEra === "pre_disclosure": 필수 (역환산 분모의 건물 성분).
   * cbEra === "post_disclosure": 불필요 (호별고시가가 건물+토지 통합).
   */
  cbBuildingStdPriceAtTransfer: string;
  /**
   * 개별공시지가 — 취득시 (원/㎡). LandPriceLookupField로 입력.
   * cbEra === "pre_disclosure": 필수. 취득시 ㎡당기준시가합의 토지 성분.
   * cbEra === "post_disclosure": 취득시 기준시가 산정용.
   */
  cbLandPricePerSqmAtAcq: string;
  /**
   * 개별공시지가 — 최초고시시(2005) (원/㎡). LandPriceLookupField로 입력.
   * cbEra === "pre_disclosure" 시만 필수.
   */
  cbLandPricePerSqmAtFirst: string;
  /**
   * 개별공시지가 — 양도시 (원/㎡). LandPriceLookupField로 입력.
   * cbEra === "pre_disclosure" / "post_disclosure" 공통 필수.
   */
  cbLandPricePerSqmAtTransfer: string;

  // ── 일반건물(토지+건물 일괄) 환산취득가 (사례 31, 영 §176의2②, §163⑥) ──
  // useEstimatedAcquisition=true + assetKind="general_building" 시 GeneralBuildingBlock 노출.
  /** 양도시 토지 공시지가 (원/㎡). LandPriceLookupField. 안분 분모: ×gbLandArea. */
  gbTransferLandPricePerSqm: string;
  /** 양도시 건물기준시가 총액 (원). 국세청 기준시가 조회. */
  gbTransferBuildingValue: string;
  /** 취득시 토지 공시지가 (원/㎡). LandPriceLookupField. 환산 분자: ×gbLandArea. */
  gbAcqLandPricePerSqm: string;
  /** 취득시 건물기준시가 총액 (원). 환산 분자 + 개산공제 기준액. */
  gbAcqBuildingValue: string;
  /** 토지 부수면적 (㎡). 안분·환산·개산공제·NBL 판정 공통 사용. */
  gbLandArea: string;
  /** 건물 연면적(㎡). 자산 식별·표시용. */
  gbBuildingArea: string;
  /** 건물 수평투영면적(㎡). 건축물대장 건축면적. §168의12 NBL 배율 기준. */
  gbBuildingFootprintArea: string;

  // ── 일반건물 비사업용토지 판정 (§104의3·§168의12) ──
  /** 용도지역. §168의12 배율 결정 기준 (필수 — 미입력 시 계산 차단). */
  gbZoneType: string;
  /** 수도권(서울·경기·인천) 소재 여부. 3배 vs 5배 배율 분기. */
  gbIsMetropolitan: boolean;
  /** 무허가건축물 여부. true 시 전체 비사업용 의제 (§168의11①1호). */
  gbIsUnregistered: boolean;

  /**
   * 토지 취득원인 (일반건물 전용).
   * general_building 자산에서 토지 카드의 취득원인. acquisitionCause 필드가 토지 취득원인을 담당.
   * 별도 필드를 두지 않고 acquisitionCause를 토지 취득원인으로 사용.
   * 빈 optional 타입 — UI에서 general_building 시 토지 카드로 표시.
   * @deprecated UI alias — 실제 저장은 acquisitionCause 필드에 (하위 호환 주석)
   */
  // gbLandAcquisitionCause: never (acquisitionCause 재사용)

  /**
   * 건물 취득원인 (일반건물 전용, 사례 32 이후).
   * - "purchase": 매매
   * - "inheritance": 상속
   * - "gift": 증여
   * - "newConstruction": 신축(자가건축) — §114조의2 가산세 판정 기준
   * undefined: 미선택 (⑧ validate에서 차단)
   */
  gbBuildingAcquisitionCause?: "purchase" | "inheritance" | "gift" | "newConstruction";
  /**
   * 건물 취득일 (YYYY-MM-DD). 소득세법 시행령 §162① 4호 기준:
   * 사용승인서 교부일·사실상 사용일·임시사용승인일 중 빠른 날.
   * gbBuildingAcquisitionCause === "newConstruction" 시 필수. 미입력 시 validation에서 차단.
   * 사례 31 호환(매매 등): gbBuildingAcquisitionCause !== "newConstruction" 시 취득일 = acquisitionDate 동일 가정.
   */
  gbBuildingAcquisitionDate: string;

  /**
   * 토지·건물(원건물) 일괄 취득 시 발생한 필요경비 (원).
   * 사례 33 일괄 모드 전용 — `useEstimatedAcquisition === false && gbHasExtension === true`일 때 의미 가짐.
   * 중개수수료·취득세·인지대 등 §97① 가목 부대비용. 미입력 시 0원 처리.
   * 엔진은 토지·건물1 안분(취득시 기준시가 비율)에 사용 — `actualBundledExpenses`로 매핑.
   * 이 필드 신설 전(legacy)에는 `transferExpense`(양도비) 필드가 임시 매핑되었으나 의미 충돌로 분리.
   */
  gbBundledAcquisitionExpenses: string;

  // ── 사례 33: 증축 건물 환산취득가 (소득세법 시행령 §176의2②, §166⑥) ──
  /**
   * 증축 유무 ToggleCard.
   * true 시 extensionInfo 서브객체를 빌드하여 API에 전달.
   * false(default) 시 나머지 5필드 무시 — normalize에서 폐기.
   */
  gbHasExtension: boolean;

  /**
   * 증축일 (건물2 취득일, YYYY-MM-DD).
   * 영 §162①4호 기준: 사용승인서 교부일·사실상 사용일·임시사용승인일 중 빠른 날.
   * 범위: 토지 취득일(exclusive) ~ 양도일(exclusive).
   */
  gbExtensionDate: string;

  /**
   * 증축 면적 (㎡, 정보용 — 산식 미사용).
   * 현 시점 안분식에 미사용. 위치지수 산정 등 후속 확장 대비.
   * 선택 필드: 모르는 경우 비워도 계산에 영향 없음.
   */
  gbExtensionArea: string;

  /**
   * 양도시 건물2(증축분) 기준시가 총액 (원).
   * ⚠ 면적 × 단가가 아닌 총액 직접 입력. 안분 분모 3항의 건물2 성분.
   */
  gbTransferExtensionBuildingStdPrice: string;

  /**
   * 취득시(증축시) 건물2 기준시가 총액 (원).
   * ⚠ 면적 × 단가가 아닌 총액 직접 입력. 환산 비율 분자: 취득시 총액 / 양도시 총액.
   */
  gbAcquisitionExtensionBuildingStdPrice: string;

  /**
   * 증축 취득원인.
   * "newConstruction": 자가증축 (default). §114조의2 가산세 대상.
   * "purchase": 증축부 매수. §114조의2 적용 여부는 엔진 판단.
   */
  gbExtensionAcquisitionCause: "purchase" | "newConstruction";

  /**
   * 증축분 취득방식.
   * "estimated": 환산취득가 (default) — 증축시·양도시 건물기준시가 비율로 산정.
   * "actual": 실거래가 — gbExtensionActualAcquisitionPrice 직접 입력.
   * 빈 문자열: 미선택 (normalize에서 "estimated" fallback).
   */
  gbExtensionAcquisitionMode: "" | "actual" | "estimated";

  /**
   * 증축 실거래가 (원).
   * gbExtensionAcquisitionMode === "actual" 시 필수.
   * validate에서 차단.
   */
  gbExtensionActualAcquisitionPrice: string;

  /**
   * 증축 시 발생한 실제 필요경비 (원).
   * gbExtensionAcquisitionMode === "actual" 시 입력 가능.
   * 미입력 시 0원 처리.
   */
  gbExtensionActualExpenses: string;

  // ── 사례 35: 주택→상가 용도변경 (사전법규재산 2022-684) ──
  /** 주택→상가 단일 용도변경 토글 (general_building 한정). */
  gbHouseToCommercialConversion: boolean;
  /** 용도변경일 (YYYY-MM-DD). gbHouseToCommercialConversion=true 시 필수. */
  gbConversionDate: string;
  /** 변경 당시 다주택자 여부. null=미선택(강제). true=다주택 → LTHD 기산일 이동. */
  gbWasMultiHouseAtConversion: boolean | null;

  // ── 사례 35 후속-1: §99-164-10 환산주택가격 (취득가액 불명 케이스) ──
  /** "주택으로 최초공시 후 상가로 용도변경" 토글. 환산 모드에서만 의미. */
  gbHasFirstDisclosure: boolean;
  /** 최초공시주택가격 (원). gbHasFirstDisclosure=true 시 필수. */
  gbFirstDisclosurePrice: string;
  /** 최초공시 당시 토지 기준시가 총액 (원). */
  gbFirstDisclosureLandStdPrice: string;
  /** 최초공시 당시 건물 기준시가 총액 (원). */
  gbFirstDisclosureBuildingStdPrice: string;

  // ── 겸용주택 분리계산 (sodt §160①단서, 2022.1.1 이후) ──
  /** 겸용주택 여부 토글 */
  isMixedUseHouse: boolean;
  /** 주택 연면적 (㎡) */
  residentialFloorArea: string;
  /** 비주택(상가·사무·근린·주차장) 연면적 합계 (㎡) */
  nonResidentialFloorArea: string;
  /** 건물 정착면적 = 1층 면적 (㎡) */
  buildingFootprintArea: string;
  /** 전체 토지 면적 (㎡) — 겸용주택용 */
  mixedUseTotalLandArea: string;
  /** 거주기간 (년) — 장기보유공제 표2 판정 */
  mixedUseResidencePeriodYears: string;
  /** 양도시 개별주택공시가격 (원) */
  mixedTransferHousingPrice: string;
  /** 양도시 상가건물 기준시가 (원, 토지 제외) */
  mixedTransferCommercialBuildingPrice: string;
  /** 양도시 개별공시지가 (원/㎡) */
  mixedTransferLandPricePerSqm: string;
  /** 취득시 개별주택공시가격 (원, PHD 토글 ON 시 비활성) */
  mixedAcqHousingPrice: string;
  /** 취득시 상가건물 기준시가 (원, 신축 시점) */
  mixedAcqCommercialBuildingPrice: string;
  /** 취득시 개별공시지가 (원/㎡) */
  mixedAcqLandPricePerSqm: string;
  /** 수도권 여부 */
  mixedIsMetropolitanArea: boolean;

  // ── 보유 중 일부 용도변경 (시행령 §166⑥ + 집행기준 99-164-10) ──
  /** 보유 중 일부 용도변경 토글 — 양도시 겸용이지만 취득시 단일 용도였던 경우 */
  hasPartialUsageChange: boolean;
  /** 용도변경 방향 — 빈 문자열은 미선택 상태 */
  partialChangeDirection: "" | "house_to_commercial" | "commercial_to_house";
  /** 취득시 주택 연면적 (㎡) — 빈값이면 양도시 합계로 자동 도출 */
  partialChangeAcqResidentialArea: string;
  /** 취득시 상가 연면적 (㎡) — 빈값이면 양도시 합계로 자동 도출 */
  partialChangeAcqCommercialArea: string;
  /** 용도변경일 (YYYY-MM-DD, 메모용 — 계산 미사용) */
  partialChangeDate: string;

  // ── 부담부증여 (소령 §159 + 증여세 통합 §53·§56·§57·§69 + §47② 사전증여 합산) ──
  // bg* 필드 일체는 BurdenedGiftFormSlice로 분리 (calc-wizard-asset-bg.ts).

  // ── 재개발/재건축 (시행령 §166) — RedevelopmentFormSlice로 분리 (calc-wizard-asset-redev.ts) ──

  // ── 가업상속공제 §97의2④ 의제 취득가액 (소령 §163의2③) ──
  /** 가업상속공제 의제 취득가액 입력. undefined = 미사용 (일반 §97 산식). */
  familyBusinessInheritance?: {
    /** 피상속인 원취득가액 (원) */
    decedentAcquisitionPrice: number;
    /** 상속개시일 현재 자산가액 (원) — §60·§63 보충적 평가 */
    inheritanceMarketValue: number;
    /** 가업상속공제적용률 0~1 (소령 §163의2③) */
    fbDeductionAppliedRate: number;
    /** 상속개시일 (YYYY-MM-DD) */
    inheritanceDate: string;
    decedentCapitalExpenditure?: number;
    heirCapitalExpenditure?: number;
  };
}

/** 하위 호환 별칭 — 기존 코드에서 CompanionAssetForm을 참조하는 곳에 사용 */
export type CompanionAssetForm = AssetForm;
