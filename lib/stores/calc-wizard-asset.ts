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
import type { GeneralBuildingFormSlice } from "./calc-wizard-asset-gb";
export type { GeneralBuildingFormSlice } from "./calc-wizard-asset-gb";

export interface AssetForm extends BurdenedGiftFormSlice, RedevelopmentFormSlice, InheritanceAcquisitionFormSlice, NblOtherFormSlice, GeneralBuildingFormSlice {
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
  /**
   * 증환지 증가분 자산 여부 (handleAddIncrease로 자동 추가된 자산).
   * true 시 당초분(assets[0])에서 양도시 기준시가(㎡당·총액)를 live fallback으로 파생 —
   * 증가분 추가 순서와 무관하게 자동 반영(당초분을 나중에 조회/입력해도 적용). UI·API·validate 3중.
   */
  isReplotIncrement: boolean;
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
  /** 선택한 동(예: "201동") — 공동주택 기준시가 조회 세대 식별 (UI 전용, 엔진 미전송) */
  addressDong: string;
  /** 선택한 호(예: "3204") — 공동주택 기준시가 조회 세대 식별 (UI 전용, 엔진 미전송) */
  addressHo: string;
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
  /**
   * 전체 PNU 19자리 (AddressSearch 결과). UI 전용 — 건물 기준시가 모달 prefill 시
   * 건축물대장 조회(BuildingRegisterLookupField) 활성화용. 엔진/검증 입력 아님.
   * 미제공(레거시·PNU 없는 주소) 시 모달에서 재조회 필요(종전 동작).
   */
  addressPnu?: string;

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

  // ── 공익수용·협의매수 (양도원인) — #1 NBL 의제·#2 §77 감면·#3 환산 min[] 공용 사실 ──
  /**
   * 양도원인 — 공익수용·협의매수 여부. 기본 "general".
   * (종전 주석의 "assetKind==='land' 전용"은 **사실이 아니다** — `TransferModeBlock`의
   *  `SUPPORTED_ASSET_KINDS` 5종(housing·land·building·general_building·commercial_building)에 노출된다.)
   */
  transferCause: "general" | "public_expropriation";
  /**
   * 사업인정고시일 (YYYY-MM-DD) — NBL(§168의14③3호)·§77 고시일 단일 소스.
   * NBL publicNoticeDate·§77 businessApprovalDate에 fallback(`섹션필드 || 이 값`)으로 공급.
   */
  expropriationNoticeDate: string;
  /**
   * 보상가액 (원/㎡) — 양도당시 기준시가 차감 특례(**소득세법 시행령 §164⑨ 1호**)의 후보②.
   * 현행 노출 조건: 환산 + 토지 + 양도 ≥ 2009.02.04 (게이트가 법령 범위보다 좁음 — 계획 P3).
   * ※ 다필지는 필지별 값을 쓴다(`ParcelFormItem.compensationPerSqm`) — 필지마다 공시지가가 달라
   *   min[] 선택이 독립이기 때문. 이 자산-수준 필드는 단건 경로 전용.
   */
  compensationPerSqm: string;
  /** 보상액 산정의 기초가 되는 기준시가 (원/㎡) — 위 min[]의 후보③ */
  compensationBasisStdPrice: string;
  /**
   * §164⑨2호 공매·경락 대상 여부 (계획 P4). transferCause(1호 수용)와 **배타(N3)**.
   * ON 시 auctionPrice로 min(양도당시 기준시가 총액, 공매·경락가액). land·building UI 노출.
   */
  isAuctionTransfer: boolean;
  /** 그 공매 또는 경락가액 (총액, 원) — §164⑨2호 min의 후보 */
  auctionPrice: string;
  /**
   * 주택 수용 보상액 총액 (원) — §164⑨1호 주택 총액 트랙(P5). 개별주택가격은 총액이라
   * 원/㎡ 후보(compensationPerSqm)가 아닌 총액을 쓴다. housing 자산 전용.
   */
  housingCompensationTotal: string;
  /** 주택 수용 보상액 산정 기초 기준시가 총액 (원) — §164⑨1호 주택 총액 min 후보 */
  housingCompensationBasisTotal: string;
  /**
   * 토지분 보상액 총액 (원) — §164⑨1호 건물 split 토지분 트랙(P6/D6). 토지·건물 취득일 분리
   * 양도 시, **토지분** 환산 분모만 min(양도시 토지 기준시가 총액, 보상액, 보상기초)로 낮춘다.
   * 건물(나목) split 전용. 주택 split은 총액 미분해라 미지원(Q6 — validate 차단).
   */
  splitLandCompensationTotal: string;
  /** 토지분 보상액 산정 기초 기준시가 총액 (원) — §164⑨1호 건물 split min 후보 */
  splitLandCompensationBasisTotal: string;

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
  /** §154⑧3호 — 상속개시 당시 상속인·피상속인 동일세대 여부 (상속주택 자체 양도 보유기간 통산) */
  decedentSameHouseholdBeforeInheritance: boolean;
  /** §154⑧3호 — 상속개시 전 동일세대 거주·보유 개시일 (YYYY-MM-DD, 비과세 보유기간 기산) */
  decedentCohabitationHoldingStartDate: string;
  /** §154⑧3호 — 상속개시 전 동일세대 통산 거주 개월 (비과세 거주요건·표2 대상 판정용, 공제율은 실거주 별도) */
  decedentCohabitationResidenceMonths: string;
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
  /**
   * 증축부분 취득(증축완공)당시 기준시가 총액 (원).
   * buildingType === "extension" + K-5 환산 시 §114조의2① 증축부분 한정 base 산출용.
   * ★ extensionStdPriceAtTransfer(증축부분 양도기준시가)는 §176의2②2호 산식에서 상쇄되므로 입력 불필요.
   */
  extensionStdPriceAtAcquisition: string;

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
  /**
   * 토지 파트 취득 방식 — 4-way 독립(소득령 §166⑥, 토지·건물 취득일 분리 모드 전용).
   * `landSplitMode`(구, 취득·양도 겸용 토글)를 대체 — 취득은 이 필드가 단일 소스.
   * ""(미선택) 시 자산 전체 레거시 플래그에서 파생 — `lib/calc/transfer-tax-split-acq-mode.ts` 참조.
   */
  landAcqMode: "" | "actual" | "estimated" | "appraisal" | "salesCase";
  /** 건물 파트 취득 방식 — landAcqMode와 완전 독립(파트별 4-way) */
  buildingAcqMode: "" | "actual" | "estimated" | "appraisal" | "salesCase";
  /**
   * 양도가액 결정 방식 — 이 자산 **내** 토지·건물 분리 축.
   * 자산 **간** 일괄양도 안분 축인 `bundledSaleMode`(폼-전역)와 레벨이 달라 공존한다.
   * "apportioned": 양도시 기준시가 비율 안분 (기본) | "actual": 구분양도 직접 입력.
   */
  saleSplitMode: "apportioned" | "actual";
  /** 토지 파트 매매사례가액 (원) — landAcqMode === "salesCase" 시 직접입력, 미입력 시 §166⑥ 안분 */
  landSalesCaseValue: string;
  /** 건물 파트 매매사례가액 (원) — buildingAcqMode === "salesCase" 시 직접입력 */
  buildingSalesCaseValue: string;
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
  /** 취득당시 토지 단위 공시지가 (원/㎡) — **토지값 트랙**(부수토지 기준시가 = 공시지가 × 면적). 엔진 입력 */
  phdLandPricePerSqmAtAcq: string;
  /**
   * 취득 ≤2000 — 2001.1.1 현재 단위 공시지가 (원/㎡). **위치지수 트랙**(건물 기준시가 산정, 소령 §164⑤).
   * `phdLandPricePerSqmAtAcq`(취득당시 연도 토지값)와 의미가 달라 혼용 금지 — 트랙 판정은
   * `lib/calc/phd-acq-land-price-track.ts` 단일 소스.
   * **엔진 미전달(UI 전용)**: 배치 모달 입력 보존 + 상가건물 모달 prefill 소스.
   */
  phdLandPricePerSqmAtAcq2001: string;
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

  /**
   * 건물분 취득시 기준시가 (원) — `assetKind==="building"` + 토지·건물 취득시기 상이 전용.
   *
   * 소득세법 §99①1호 나목(국세청장 산정·고시). 기준일은 **건물 취득일**의 직전 고시분(소득령 §164③) —
   * 토지분(㎡당 공시지가 × 면적)은 토지 취득일 기준이라 시점이 다르다.
   * 미입력 시 `standardPriceAtAcq` 총액에서 역산으로 후퇴한다(한시).
   */
  buildingStandardPriceAtAcq: string;

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
  nblFarmlandIsFarmDevZone: boolean;
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
  nblVillaBuildingFloorArea: string;
  nblVillaAttachedLandArea: string;
  nblVillaCombinedStdValue: string;
  nblVillaIsInRestrictedArea: boolean;
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
      /** 세무서 사업자등록일 §168 (YYYY-MM-DD) */
      businessRegistrationDate: string;
      /** 지자체 임대사업자등록신청일 민특법§5 (YYYY-MM-DD) */
      rentalRegistrationDate: string;
      /** 임대구분 (의무기간·cap 파생 소스). existing_business=나목·unsold_08_09=라목(미분양) */
      rentalCategory: 'long_general' | 'short_6y' | 'pre_2018' | 'existing_business' | 'unsold_08_09';
      rentalAcquisitionType: 'purchase' | 'construction';
      isApartment: boolean;
      /** 소재지역 수도권/비수도권 (918 조정취득은 isExcluded918Rule 별도) */
      region: 'seoul-metro' | 'non-metro';
      /** 소재지 법정동코드 10자리 (주소 검색 시 자동 채움 — region 자동판별 소스·자동배지 신호). 미검색 시 "" */
      regionCode: string;
      /** 918 조정취득 배제(2018.9.14 이후 조정대상지역 신규취득). 마목 hard·아목 carve-out */
      isExcluded918Rule: boolean;
      /** 아목 918 carve-out — 조정대상지역 공고 전 계약 + 계약금 지급 증빙 */
      hasContractDepositProof: boolean;
      /** 마·바목 단기→장기 변경신고 배제 여부 */
      isExcludedShortToLongChange: boolean;
      /** 임대개시일 기준시가 (원, 문자열) — 가/다/마/바/아/자/구법 */
      standardPriceAtRentalStart: string;
      /** 취득당시 기준시가 (원, 문자열) — 나목(취득당시 3억) */
      acquisitionOfficialPrice: string;
      /** 국민주택규모 충족 자기확인 — 나목 */
      isNationalSizeHousing: boolean;
      /** 대지면적 ㎡ (건설임대 규모요건, 문자열) */
      rentalLandArea: string;
      /** 연면적/전용면적 ㎡ (건설임대 규모요건, 문자열) */
      rentalTotalFloorArea: string;
      /** 2호 이상 임대 충족 자기확인 (건설임대·나목) */
      hasMinimum2Units: boolean;
      /** 같은 시·군 5호 이상 임대 충족 (라목 미분양) */
      hasMinimum5UnitsInCity: boolean;
      /** 최초 분양계약일 (라목 미분양 2008.6.11~2009.6.30, YYYY-MM-DD) */
      firstSaleContractDate: string;
      /** 실제 임대 개월 수 (direct 모드 값·legacy fallback) */
      rentalMonths: string;
      /** 임대기간 입력 모드 — direct(개월 직접)·interval(시작~종료일 다중 기간) */
      rentalInputMode: "interval" | "direct";
      /** 임대 구간 (interval 모드, 비연속 허용). 개월은 API 변환 시 deriveRentalMonths로 합산 */
      rentalPeriods: Array<{ start: string; end: string }>;
      /** 임대주택 지번 주소 — 임대개시일 기준시가 Vworld 조회용(UI 상태·엔진 미전송) */
      rentalAddressJibun: string;
      /** 공동주택 동(예: "324") — 임대개시일 기준시가 세대 식별용(UI 상태·엔진 미전송) */
      rentalDong: string;
      /** 공동주택 호(예: "1004") — 임대개시일 기준시가 세대 식별용(UI 상태·엔진 미전송) */
      rentalHo: string;
      /** §155⑳㉓ 말소 특례 — 자진(의무기간 1/2↑)·자동말소 후 5년 내 거주주택 양도 여부 (가·다·라·마목) */
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

  // ── 상업용건물·오피스텔 환산취득가 (사례 29, 소득세법 시행령 §164⑥, §176조의2②2호) ──
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
   * 법 §99①1호 나목의 가액: 국세청 고시 건물기준시가.
   * 사용자(외부)에서 ㎡당 단가 × 연면적(전유+공용 보정계수 반영)을 미리 곱한 총액 입력.
   */
  cbBuildingStdPriceAtAcq: string;
  /**
   * §164⑥ 단서 — 취득당시 건물 기준시가를 §164⑤ 준용으로 산정했음을 사용자가 확인.
   *
   * 취득연도 ≤ 2000이면 법 §99①1호나목(건물 기준시가)이 고시되기 전이라 그 가액이 없다.
   * 국세청 「취득당시 건물기준시가 산정기준율표」의 취득연도 축이 1985~2000이고
   * `resolveAcqBaseRate()`가 `acqYear > 2000`을 잘라내는 것이 그 경계다.
   * 이때 §164⑥ 단서에 따라 §164⑤을 준용해야 하는데, 준용 산정에는 신축연도·구조·용도가 필요해
   * 엔진이 자동 산정할 수 없다(AssetForm 미보유 — 건물 기준시가 모달에서만 입력).
   * → 사용자의 명시적 확인을 남긴다. cbEra === "pre_disclosure" + 취득연도 ≤2000일 때만 의미 있음.
   */
  cbAcqBuildingStdBy164_5: boolean;
  /**
   * §164⑥ 산식 괄호 단서(§164⑧ 준용) — **B: 전기의 토지 및 건물의 기준시가 합계액** (원, 총액).
   *
   * 취득당시 기준시가합 == 최초고시당시 기준시가합인 경우에만 쓰인다. 미입력 시 준용 산정을
   * 하지 않고(종전 계산 유지) 결과에 경고만 남긴다.
   * 산식: 취득당시 기준시가 = 최초고시 기준시가 × A / [A + (A−B) × C/D]
   */
  cbPrevStdPriceSum: string;
  /**
   * §164⑧ 준용 — **D: 토지 및 건물 기준시가 조정월수**. 빈 값이면 12(시행규칙 §80②1호 통상값).
   */
  cbStdPriceAdjustMonths: string;
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

  // ── 일반건물(general_building) + 겸용주택 필드 → GeneralBuildingFormSlice로 분리 ──
  // (calc-wizard-asset-gb.ts — 800줄 정책 준수, Phase 2 2026-06-22)

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
