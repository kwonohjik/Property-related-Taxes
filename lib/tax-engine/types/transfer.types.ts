/**
 * 양도소득세 공개 타입 정의
 *
 * Layer 2 (Pure Engine)의 퍼블릭 API 타입. 엔진 본체(`../transfer-tax.ts`) 외에도
 * API Route / Store / UI / 테스트 등 다수 파일에서 공유되므로 본체와 분리하여
 * 타입 의존 그래프를 얕게 유지한다.
 *
 * 소득세법 §92~§118 기반.
 */

import type {
  HouseInfo,
  PresaleRight,
  ExcludedHouse,
  ExclusionReason,
} from "../multi-house-surcharge";
import type {
  NonBusinessLandInput,
  NonBusinessLandJudgment,
} from "../non-business-land";
import type {
  RentalReductionInput,
  RentalReductionResult,
} from "../rental-housing-reduction";
import type {
  NewHousingReductionInput,
  NewHousingReductionResult,
} from "../new-housing-reduction";
import type {
  FilingPenaltyInput,
  DelayedPaymentInput,
  TransferTaxPenaltyResult,
} from "../transfer-tax-penalty";
import type {
  Pre1990LandValuationInput,
  Pre1990LandValuationResult,
} from "../pre-1990-land-valuation";
import type { PublicExpropriationReductionResult } from "../public-expropriation-reduction";
import type { SelfFarmingReductionResult } from "../self-farming-reduction";
import type { ParcelInput, ParcelResult } from "../multi-parcel-transfer";
import type { InheritanceAcquisitionInput } from "./inheritance-acquisition.types";
import type { TransferReductionStub } from "./transfer-reductions-stub.types";
export type { TransferReductionStub } from "./transfer-reductions-stub.types";
import type { Rental97Result } from "../transfer-reductions/types";
export type { Rental97Result } from "../transfer-reductions/types";
import type { New994Result } from "../transfer-reductions/types";
export type { New994Result } from "../transfer-reductions/types";
import type { Unsold989Result } from "../transfer-reductions/types";
export type { Unsold989Result } from "../transfer-reductions/types";
import type { New99Result } from "../transfer-reductions/new-99";
export type { New99Result } from "../transfer-reductions/new-99";
import type { Unsold988Result } from "../transfer-reductions/unsold-98-8";
export type { Unsold988Result } from "../transfer-reductions/unsold-98-8";
import type { UnsoldHybridResult } from "../transfer-reductions/unsold-hybrid";
export type { UnsoldHybridResult } from "../transfer-reductions/unsold-hybrid";
import type { InheritanceHouseValuationInput, InheritanceHouseValuationResult } from "./inheritance-house-valuation.types";
import type { MixedUseAssetInput, MixedUseGainBreakdown } from "./transfer-mixed-use.types";
import type { CarryoverTaxationInput, CarryoverTaxationDetail } from "./transfer-carryover.types";

// CarryoverTaxationInput, CarryoverTaxationDetail 은 transfer-carryover.types.ts 에 정의됨.
// 외부 소비자 편의를 위해 재수출.
export type { CarryoverTaxationInput, CarryoverTaxationDetail } from "./transfer-carryover.types";

// ── 부담부증여 / 상업용건물 / 재개발 타입 (800줄 정책 — sibling 파일 분리) ──
import type { BurdenedGiftInfo, TransferBurdenedGiftBreakdown } from "./transfer-burdened-gift.types";
export type { BurdenedGiftInfo, TransferBurdenedGiftBreakdown, BurdenedGiftValuationMode } from "./transfer-burdened-gift.types";
import type { CommercialBuildingValuationInput, CommercialBuildingValuationResult } from "./commercial-building.types";
export type { CommercialBuildingValuationInput, CommercialBuildingValuationResult } from "./commercial-building.types";
import type { RedevelopmentInfo, RedevelopmentResult } from "./transfer-redevelopment.types";
export type { RedevelopmentInfo, RedevelopmentResult, RedevelopmentBranchDetail, RedevelopmentValuationMeta } from "./transfer-redevelopment.types";

// ── 가업상속공제 자산 양도 §97의2④ 타입 (800줄 정책 — sibling 엔진 파일 분리) ──
import type { FamilyBusinessInheritanceTransferInput, FamilyBusinessCgtDetail } from "../transfer-tax-family-business";
export type { FamilyBusinessInheritanceTransferInput, FamilyBusinessCgtDetail } from "../transfer-tax-family-business";

export interface TransferTaxInput {
  /** 물건 종류 */
  propertyType: "housing" | "land" | "building" | "right_to_move_in" | "presale_right" | "mixed-use-house" | "commercial_building" | "general_building_unit" | "general_building" | "redevelopment_apt";
  /** 양도가액 (원, 정수) */
  transferPrice: number;
  /**
   * 총 물건 양도가액 (지분 모드 전용). 12억 비과세 안분 분모. 미설정 시 transferPrice 사용.
   * 사례 27 (아파트 2번 지분취득) anchor.
   */
  totalPropertyTransferPrice?: number;
  /**
   * 부담부증여 12억 안분 분모 (F-1, 해석 B): 증여가액 전체(C). 일반 양도 시 미설정.
   * checkOneHouseExemption()·calcOneHouseProration() 우선순위 1번 분모.
   */
  burdenedGiftDenominator?: number;
  /** 양도일 */
  transferDate: Date;
  /** 취득가액 (0이면 환산취득가 사용) */
  acquisitionPrice: number;
  /** 취득일 */
  acquisitionDate: Date;
  /**
   * 매매계약일 — 분양·매매계약 + 계약금 납부 기준일 (선택).
   * 조특법 §99·§99의3·§98 시리즈·§97의2·§97의5·§99의2 등 신축·미분양·임대 감면 13개 조문의
   * 시한 판정 1차 기준. 미입력 시 acquisitionDate fallback (조문 단서 "매매계약 + 계약금 = 취득").
   * 자산-수준 폼 필드 `AssetForm.assetContractDate`와 1:1 매핑.
   */
  assetContractDate?: Date;
  /**
   * 필요경비 (deprecated — 호환 유지).
   * 신규 입력은 `capitalExpenditure` + `transferExpense` 분리 사용.
   * 두 신규 필드 미입력 시 이 값을 자본+양도비 합으로 간주, §97② 단서 swap 비활성.
   */
  expenses: number;
  /** 자본적 지출액 (소득세법 §97① 2호 가목) — §97② 단서 swap 비교에 사용 */
  capitalExpenditure?: number;
  /** 양도비 (소득세법 §97① 2호 나목) — §97② 단서 swap 비교에 사용 */
  transferExpense?: number;
  /** 환산취득가 사용 여부 */
  useEstimatedAcquisition: boolean;
  /** 취득시 기준시가 (환산취득가 사용 시 필수) */
  standardPriceAtAcquisition?: number;
  /** 양도시 기준시가 (환산취득가 사용 시 필수) */
  standardPriceAtTransfer?: number;
  /** 세대 보유 주택 수 */
  householdHousingCount: number;
  /**
   * 세대 보유 조합원입주권 수 (양도일 현재).
   * §89①4호 가목 1세대1입주권 비과세 판단 (다른 주택 없음 + 입주권 1개).
   * 미제공 시 0으로 간주.
   */
  householdRightCount?: number;
  /** 거주기간 (월) */
  residencePeriodMonths: number;
  /** 양도일 기준 조정대상지역 여부 */
  isRegulatedArea: boolean;
  /** 취득일 기준 조정대상지역 여부 */
  wasRegulatedAtAcquisition: boolean;
  /** 미등기 여부 */
  isUnregistered: boolean;
  /** 비사업용 토지 여부 */
  isNonBusinessLand: boolean;
  /**
   * 조합원입주권 승계취득 여부 (propertyType === "right_to_move_in" 일 때만 의미).
   * true = 승계조합원 (장특공제 배제), false/미지정 = 원조합원.
   * 소득세법 §95② 단서: 조합원입주권은 원조합원에 한해 장기보유특별공제 적용.
   */
  isSuccessorRightToMoveIn?: boolean;
  /** 1세대 여부 */
  isOneHousehold: boolean;
  /** 일시적 2주택 정보 */
  temporaryTwoHouse?: {
    previousAcquisitionDate: Date;
    newAcquisitionDate: Date;
  };
  /**
   * 취득 원인 (매매·상속·증여·이월과세증여). 미지정 시 매매로 간주.
   * "carryover_gift" = 소득세법 §97조의2 이월과세 대상 증여 (배우자·직계존비속).
   * 기존 "gift"는 이월과세 미적용 단순 증여 취득 — 하위 호환 유지.
   */
  /**
   * 취득 원인. "newConstruction" = 자가건축 주택 (소득세법 시행령 §162①4호).
   * 신축 케이스에서 사용승인일 등 영 §162①4호 기준 취득일 안내 + 부수토지 일체과세 UI 트리거.
   * 엔진 분기는 buildingFootprintArea + holdingMonths 조건으로 판정 (acquisitionCause 단독 판정 금지).
   * @deprecated `"burdened_gift"`는 Phase 2(2026-05-12) 이후 deprecation — `transferType: "burdened_gift"` 사용 권장.
   */
  acquisitionCause?: "purchase" | "inheritance" | "gift" | "carryover_gift" | "newConstruction" | "burdened_gift";

  /**
   * 양도 형태 (양도자 관점) — Phase 2(2026-05-12) 신규.
   * "regular": 일반 양도 (매매·교환 등). 미지정 시 기본값.
   * "burdened_gift": 부담부증여 (소령 §159 — 채무 인수분을 유상 양도로 의제). burdenedGiftInfo 필수.
   * 부담부증여는 취득 사건이 아니라 양도 사건이므로 acquisitionCause와 별도 차원.
   */
  transferType?: "regular" | "burdened_gift";
  /**
   * 상속 시 피상속인 취득일 — 단기보유 단일세율 판정 보유기간 통산용.
   * 소득세법 §95④: 상속받은 자산은 피상속인이 그 자산을 취득한 날을 자산의 취득일로 본다.
   * 장기보유특별공제 보유기간에는 적용하지 않음 (LTHD는 상속개시일 기산 유지).
   */
  decedentAcquisitionDate?: Date;
  /**
   * 증여 시 증여자 취득일 — 단기보유 단일세율 판정 보유기간 통산용 (이월과세 패턴).
   * 장기보유특별공제 보유기간에는 적용하지 않음.
   */
  donorAcquisitionDate?: Date;
  /** 조세특례 감면 목록 */
  reductions: TransferReduction[];
  /** 당해 연도 기사용 기본공제 (원) */
  annualBasicDeductionUsed: number;
  /**
   * 세대 보유 주택 상세 목록 (선택)
   * 제공 시 주택 수 산정 엔진을 통해 정밀 계산.
   * 미제공 시 householdHousingCount 사용 (하위 호환).
   */
  houses?: HouseInfo[];
  /**
   * 세대 보유 분양권/입주권 목록 (선택)
   * houses 제공 시 함께 전달 권장.
   */
  presaleRights?: PresaleRight[];
  /** 일시적 2주택 정보 (houses 제공 시 사용) */
  multiHouseTemporaryTwoHouse?: {
    previousHouseId: string;
    newHouseId: string;
  };
  /** 혼인합가 정보 */
  marriageMerge?: {
    marriageDate: Date;
  };
  /** 동거봉양 합가 정보 */
  parentalCareMerge?: {
    mergeDate: Date;
  };
  /** 양도 주택 ID (houses 제공 시) */
  sellingHouseId?: string;
  /**
   * 비사업용 토지 상세 정보 (선택)
   * 제공 시 judgeNonBusinessLand()로 정밀 판정 후 isNonBusinessLand 덮어씀.
   * 미제공 시 isNonBusinessLand 플래그 그대로 사용 (하위 호환).
   */
  nonBusinessLandDetails?: NonBusinessLandInput;

  // ── 사례 35: 주택 → 상가 용도변경 LTHD 기산일 분기 ──
  // 근거: 사전법규재산 2022-684·881, 서울행법 2012구단26961 (다주택 용도변경 시 변경일 전 보유기간 LTHD 배제)
  /** 주택 → 상가 단일 용도변경 여부. true 시 conversionDate·wasMultiHouseAtConversion 필수. */
  houseToCommercialConversion?: boolean;
  /** 용도변경일 (건축물대장 변경 완료일). houseToCommercialConversion=true 시 필수. */
  conversionDate?: Date;
  /** 용도변경 당시 다주택자(중과대상) 여부. true → LTHD 기산일 = conversionDate. false → acquisitionDate 유지. */
  wasMultiHouseAtConversion?: boolean;

  // ── §114조의2 가산세 판정용 필드 ──
  /** 취득가 산정 방식 (actual: 실거래가, estimated: 환산취득가, appraisal: 감정가액) */
  acquisitionMethod?: "actual" | "estimated" | "appraisal";
  /** 감정가액 (acquisitionMethod === "appraisal" 시) */
  appraisalValue?: number;
  /** 본인 신축·증축 여부 */
  isSelfBuilt?: boolean;
  /** 신축(new) / 증축(extension) */
  buildingType?: "new" | "extension";
  /** 신축일 또는 증축 완공일 */
  constructionDate?: Date;
  /** 증축 바닥면적 합계 (㎡) */
  extensionFloorArea?: number;
  /**
   * 환산취득가 이미 계산 여부 (aggregate 경로 전용).
   * aggregate 엔진이 buildProperties()를 통해 이미 계산된 환산취득가를 전달할 때 true.
   * finalize.ts STEP 10.5: penaltyBase 결정 시 useEstimatedAcquisition fallback으로 사용.
   * 단건 경로에서는 useEstimatedAcquisition이 같은 역할을 함.
   */
  usedEstimatedAcquisition?: boolean;
  /**
   * 환산취득가 base 금액 (aggregate 경로 전용).
   * buildProperties()를 통해 card.estimatedBase가 전달됨.
   * finalize.ts STEP 10.5: usedEstimatedAcquisition=true 시 penaltyBase로 사용.
   */
  estimatedBase?: number;
  /**
   * 장기임대주택 감면 상세 정보 (선택)
   * 제공 시 calculateRentalReduction()으로 정밀 감면 판정.
   * 미제공 시 reductions[] 배열의 long_term_rental 항목으로 단순 처리 (하위 호환).
   */
  rentalReductionDetails?: RentalReductionInput;
  /**
   * 신축주택·미분양주택 감면 상세 정보 (선택)
   * 제공 시 determineNewHousingReduction()으로 정밀 감면 판정 (조문 매트릭스 기반).
   * 미제공 시 reductions[] 배열의 new_housing/unsold_housing 항목으로 단순 처리 (하위 호환).
   */
  newHousingDetails?: NewHousingReductionInput;
  /** 신고불성실가산세 입력 (선택, 미제공 시 가산세 계산 생략) */
  filingPenaltyDetails?: FilingPenaltyInput;
  /** 지연납부가산세 입력 (선택, 미제공 시 가산세 계산 생략) */
  delayedPaymentDetails?: DelayedPaymentInput;
  /** 기본공제 스킵 (§103). aggregate 엔진에서 호출 시 true. default false. */
  skipBasicDeduction?: boolean;
  /**
   * 양도차익 음수 바닥 처리 생략 (§102② 차손 통산용).
   * aggregate 엔진에서 호출 시 true로 세팅하여 음수 `gain` 반환.
   * default false → 기존 `Math.max(0, gain)` 동작 유지.
   */
  skipLossFloor?: boolean;
  /** P3 특칙 — §98의3④·§98의5③·§98의6③ 단기세율(§104①2·3호) 배제. 엔진 내부 주입 (STEP 7). */
  suppressShortTermRate?: boolean;
  /**
   * 1990.8.30. 이전 취득 토지 기준시가 환산 입력 (선택).
   * 제공 시 엔진이 calculatePre1990LandValuation()으로 기준시가를 산출하여
   * useEstimatedAcquisition=true, acquisitionPrice=0, standardPriceAt*를 자동 주입한다.
   * propertyType === "land" + acquisitionDate < 1990-08-30 일 때만 의미 있음.
   */
  pre1990Land?: Pre1990LandValuationInput;
  /**
   * 다필지 분리 계산 입력 (선택).
   * 제공 시 각 필지별로 면적 안분 → 취득가 산출 → 장특공제를 독립 계산 후 합산.
   * propertyType === "land" + 환지·합병 등 2필지 이상인 경우 사용.
   */
  parcels?: ParcelInput[];
  /**
   * 개별주택가격 미공시 취득 시 3-시점 환산취득가 계산 입력 (선택).
   * 제공 시 calcSplitGain이 §164⑤ 2-단계 추정 알고리즘으로 취득시 기준시가를 산출.
   * useEstimatedAcquisition===true + landAcquisitionDate 제공 시에만 의미 있음.
   */
  preHousingDisclosure?: PreHousingDisclosureInput;
  /**
   * 인별 5년 감면 이력 (선택, 조특법 §133).
   * 제공 시 5년 누적 한도를 초과하는 분은 당해 감면에서 자동 차감.
   * 미제공 또는 빈 배열 시 연간 한도만 적용(기존 동작 유지).
   */
  priorReductionUsage?: { year: number; type: string; amount: number }[];
  /**
   * 상속 부동산 취득가액 의제 입력 (선택, 소령 §176조의2④·§163⑨).
   * 제공 시 STEP 0.45에서 상속개시일을 기준으로 의제취득일 전/후 분기:
   *   - 전: max(환산가액, 피상속인 실가×물가상승률)
   *   - 후: 상속세 신고가액 (매매사례·감정·수용·경매·유사매매·보충적평가 중 신고한 가액)
   * acquisitionCause === "inheritance" 일 때만 의미 있음.
   */
  inheritedAcquisition?: InheritanceAcquisitionInput;

  /**
   * 상속 주택 환산취득가 보조 입력 (자산 종류 = 주택 + 상속개시일 < 2005-04-30 시 사용).
   * 3-시점 토지·주택 분리 입력으로 상속개시일 시점 합계 기준시가를 자동 산출.
   * 결과는 inheritedAcquisition.standardPriceAtDeemedDate/standardPriceAtTransfer에 자동 주입.
   */
  inheritedHouseValuation?: InheritanceHouseValuationInput;

  /**
   * 겸용주택(1세대 1주택 + 상가) 분리계산 입력.
   * propertyType === "mixed-use-house" 일 때 필수.
   * 소득세법 시행령 §160 ① 단서 — 2022.1.1 이후 양도분 강제 분리.
   */
  mixedUse?: MixedUseAssetInput;

  /**
   * 배우자등 이월과세 입력 (소득세법 §97조의2).
   * acquisitionCause === "carryover_gift" 일 때만 유효.
   * 기간 판정·비교과세 두 시나리오 계산·채택 시나리오 자동 결정을 엔진이 수행.
   */
  carryoverTaxation?: CarryoverTaxationInput;

  /**
   * 부담부증여 입력 (소득세법 시행령 §159).
   * acquisitionCause === "burdened_gift" 일 때 필수.
   *
   * 본 필드 제공 시 엔진이 STEP 0에서:
   *   1. 상증법 §60~§66 Max 평가 산정 (보충적·담보·임대)
   *   2. 채무비율 = (lendingDepositTotal + mortgageDebtAmount) / max
   *   3. 자산별 양도가액·취득가액 안분 (§159 ① 1호·2호)
   *   4. transferPrice/acquisitionPrice/expenses override
   *
   * 양도자 = 증여자 본인이므로 §97의2(이월과세) 미적용.
   * Phase 1 가드: propertyType === "general_building" 한정 (1세대1주택은 Phase 3).
   */
  burdenedGiftInfo?: BurdenedGiftInfo;

  /**
   * 재개발/재건축 양도 정보 (시행령 §166 + §164⑦ 단서 + §166⑤ LTHD 분기).
   *
   * propertyType === "redevelopment_apt" 또는 "right_to_move_in" 시 제공 가능.
   * 미제공 시 기존 분기(일반 housing/right_to_move_in)로 처리.
   *
   * 본 필드 제공 시 엔진은 redevelopment.ts orchestrator로 라우팅하여
   * 인가전·인가후 기존건물분·청산금 분 3분할 양도차익을 산정한다.
   *
   * 사례 매트릭스 (양도코리아 xlsx 36~46):
   * - 본 PR 핵심: 사례 44 (APT-환산-납부-주택출자, 산출 56,799,400)
   */
  redevelopment?: RedevelopmentInfo;

  // ── 토지/건물 취득일 분리 계산 (housing·building 공통) ──
  /**
   * 토지 취득일 — housing·building에서 토지와 건물의 취득일이 다를 때 제공.
   * 미제공 시 acquisitionDate 단일값으로 보유기간 계산 (기존 동작).
   * 소득령 §162①: 토지는 등기접수일, 건물은 사용승인일이 취득일.
   */
  landAcquisitionDate?: Date;
  /**
   * 토지/건물 가액 분리 방식.
   * "apportioned": 기준시가 비율로 자동 안분 (기본, 소득령 §166⑥).
   * "actual": 사용자가 각 가액을 직접 입력.
   */
  landSplitMode?: "apportioned" | "actual";
  /** 토지 양도가액 (실제 모드 or 안분 override 시) */
  landTransferPrice?: number;
  /** 건물 양도가액 (실제 모드 or 안분 override 시) */
  buildingTransferPrice?: number;
  /** 토지 취득가액 (실거래가 모드 시) */
  landAcquisitionPrice?: number;
  /** 건물 취득가액 (실거래가 모드 시) */
  buildingAcquisitionPrice?: number;
  /** 토지 자본적지출·필요경비 */
  landDirectExpenses?: number;
  /** 건물 자본적지출·필요경비 */
  buildingDirectExpenses?: number;
  /**
   * 토지 양도시 기준시가 — 환산취득가 분리 계산 시 사용.
   * 미제공 시 standardPriceAtTransfer × 토지 안분비율로 추정.
   */
  landStandardPriceAtTransfer?: number;
  /**
   * 건물 양도시 기준시가 — 환산취득가 분리 계산 시 사용.
   * 미제공 시 standardPriceAtTransfer - landStandardPriceAtTransfer로 추정.
   */
  buildingStandardPriceAtTransfer?: number;
  /**
   * 취득시 토지 단위 기준시가 (원/㎡) — 토지 기준시가 산출용.
   * 토지 기준시가 = standardPricePerSqmAtAcquisition × acquisitionArea.
   * 주택: 개별공시지가, 일반건물: 개별공시지가.
   */
  standardPricePerSqmAtAcquisition?: number;
  /**
   * 취득 면적 (㎡) — 토지 기준시가 산출용.
   * standardPricePerSqmAtAcquisition과 함께 사용.
   */
  acquisitionArea?: number;
  /**
   * 토지·건물의 소유자가 다른 경우 본인 소유 부분 지정 (소령 §166⑥, §168②).
   * "both" (기본): 토지·건물 모두 본인 → 분리 양도차익 양쪽 합산.
   * "building_only": 건물만 본인 (토지는 배우자·타인 소유) → 건물 분만 자기 신고.
   * "land_only": 토지만 본인 → 토지 분만 자기 신고.
   * "both" 외 값 사용 시 landAcquisitionDate 필수.
   */
  selfOwns?: "both" | "building_only" | "land_only";
  /**
   * 건물 정착면적 (㎡) — 부수토지 한도 산정용 (소득세법 시행령 §154⑦).
   * 나대지 취득 후 주택 신축·일괄양도 케이스에서 companion 토지의 부수토지 인정 한도를
   * 계산할 때 사용. undefined이면 부수토지 일체과세 자동 분기 비활성화.
   * 겸용주택(`isMixedUseHouse=true`)에서도 동일 필드를 재사용한다.
   */
  buildingFootprintArea?: number;
  /**
   * @deprecated 영 §154⑦의 3단계(3/5/10배)를 boolean으로 표현 못함.
   * 신규 코드는 appurtenantLandZone 사용.
   */
  isUrbanArea?: boolean;
  /**
   * 부수토지 인정 한도 zone (영 §154⑦).
   * - "metropolitan_residential": 수도권 도시지역 + 주거·상업·공업 → 3배
   * - "non_metropolitan_or_green": 수도권 녹지 또는 수도권 외 도시지역 → 5배
   * - "non_urban": 도시지역 외 → 10배
   * buildingFootprintArea가 있을 때만 유효.
   */
  appurtenantLandZone?: "metropolitan_residential" | "non_metropolitan_or_green" | "non_urban";
  /**
   * 장기임대주택 보유자 거주주택 비과세 특례 입력 (소령 §155⑳).
   * applyException=true 시 임대주택을 주택수에서 제외하여 1세대1주택 비과세 적용.
   * 시나리오 B(PHRP)는 §161① 기준시가 안분으로 직전거주주택 양도일 이후분만 비과세.
   */
  rentalHousingException?: import("../transfer-tax/rental-housing-exception/types").RentalHousingExceptionInput;

  // ── 부수토지 일체과세 — companion 전용 필드 (사례 28, 영 §154⑦) ──
  /**
   * companion 토지 세율 수동 오버라이드 (부수토지 일체과세 자동 분기 무시).
   * 미지정(undefined) 시 landNature 명시 입력 기반으로 자동 판단.
   *
   * - "shortTermHousing70": 주택 단기보유 70% 강제 (§104①3호 단서)
   * - "shortTerm60":        1년~2년 주택 세율 60% 강제 (§104①3호)
   * - "progressive":        일반 누진세율 강제
   *
   * 법령 근거: §89①3호 / 영 §154⑦ / §104①후단
   */
  manualHoldingPeriodOverride?: "shortTermHousing70" | "shortTerm60" | "progressive";

  /**
   * 토지 성질 명시 입력 (propertyType === "land" 자산에서만 사용).
   * 사용자가 자산 카드에서 선언.
   * - "appurtenant_to_housing": 주택 부수토지 — §89①3호·영§154⑦ 일체과세 대상
   * - "non_appurtenant": 독립 나대지 — 일체과세 대상 아님, 토지 본래 세율 적용
   * - undefined: 미선언 (단독 자산 양도 시 생략 가능)
   *
   * 부수토지 판정은 면적 한도(영 §154⑦: 도시지역 3~5배 / 도시지역 외 10배)와 무관하게
   * 사용자가 사실 관계에 근거하여 선언하는 값. 면적 초과분은 엔진이 자동으로 분리.
   */
  landNature?: "appurtenant_to_housing" | "non_appurtenant";

  /**
   * 이 자산을 companion으로 취급하는 primary 자산의 컨텍스트 (부수토지 일체과세용).
   * aggregate 엔진에서 companionEngine 조립 시 route.ts가 주입.
   * 미제공 시 부수토지 일체과세 자동 분기 비활성화.
   */
  primaryContextForCompanionRate?: {
    /** primary 자산 종류 */
    propertyType: TransferTaxInput["propertyType"];
    /** primary 보유기간 (월, 취득일~양도일 사전 계산) */
    holdingMonths: number;
    /** primary 건물 정착면적 (㎡) */
    buildingFootprintArea?: number;
    /** @deprecated isUrbanArea 단일 boolean. appurtenantLandZone 사용 권장 */
    isUrbanArea?: boolean;
    /** 부수토지 인정 한도 zone (영 §154⑦) */
    appurtenantLandZone?: "metropolitan_residential" | "non_metropolitan_or_green" | "non_urban";
    /** 일괄양도 모드 */
    bundledSaleMode?: "actual" | "apportioned";
  };

  /**
   * 상업용건물·오피스텔 환산취득가 계산 입력 (선택).
   * propertyType === "commercial_building" + useEstimatedAcquisition === true 일 때 필수.
   * 소득세법 시행령 §164⑧·§176조의2②2호.
   */
  commercialBuildingValuation?: CommercialBuildingValuationInput;

  /** 가업상속공제 §97의2④ 의제 취득가액 입력 (선택). 미제공 시 일반 §97 산식 불변. */
  familyBusinessInheritance?: FamilyBusinessInheritanceTransferInput;
}

// TransferReduction union — transfer-reduction-input.types.ts로 분리 (800줄 정책, 2026-06-11)
export type { TransferReduction } from "./transfer-reduction-input.types";
import type { TransferReduction } from "./transfer-reduction-input.types";

export interface CalculationStep {
  /** 단계명 (예: '양도차익 계산') */
  label: string;
  /** 산식 설명 */
  formula: string;
  /** 결과 금액 */
  amount: number;
  /** 법적 근거 조문 (P2: 결과 시각화용) */
  legalBasis?: string;
  /** 세부 항목 여부 — 들여쓰기로 표시 */
  sub?: boolean;
}

export interface TransferTaxResult {
  /** 전액 비과세 여부 */
  isExempt: boolean;
  /** 비과세 사유 */
  exemptReason?: string;
  /**
   * 정보성 경고 메시지 — F-2 (2026-05-12).
   * 비스코프 케이스 안내·계산 가정·실무 주의사항 등을 결과 카드·사이드바에 amber 배지로 노출.
   * 미설정 시 undefined (현재 케이스 12 다주택 중과 + 부담부증여에서만 채워짐).
   * 차단(throw)이 아닌 정보 전달용.
   */
  warnings?: string[];
  /** 양도차익 */
  transferGain: number;
  /** 과세 양도차익 (12억 초과분 안분 후) */
  taxableGain: number;
  /** 환산취득가 사용 여부 */
  usedEstimatedAcquisition: boolean;
  /** 환산취득가 base 금액 (개산공제 제외) — 환산/감정가액 모드에서만 */
  estimatedBase?: number;
  /** 개산공제액 (취득시 기준시가 × 3%) — 환산/감정가액 모드에서만 */
  estimatedDeduction?: number;
  /** 엔진이 실제 차감한 필요경비 합계 (자본적지출+양도비, swap 적용 후). 신고서 양식 분리 표시용 */
  expenses?: number;
  /** §97② 단서 swap 발동 여부 (환산/감정가액 모드 + 자본+양도비 > 환산+개산공제) */
  swapApplied?: boolean;
  /**
   * 자본적 지출 표시값 (소득세법 §97① 가목) — 신고서 양식상 취득가액에 합산되어 표시.
   * UI 신고서 양식에서 `취득가액 = result.acquisitionPrice + capitalExpenditureForDisplay`,
   * `필요경비 = result.expenses - capitalExpenditureForDisplay`로 분리 표시.
   */
  capitalExpenditureForDisplay?: number;
  /** §97② 단서 swap 비교 (분리 입력 시만 표시) */
  swapComparison?: {
    estimatedSide: number;
    directSide: number;
    chosen: "estimated" | "direct";
  };
  /** 장기보유특별공제액 */
  longTermHoldingDeduction: number;
  /** 장기보유특별공제율 */
  longTermHoldingRate: number;
  /**
   * 장기보유특별공제 보유기간 실제 기산일 (사례 35).
   * - 기본값: acquisitionDate (용도변경 미적용 시)
   * - 다주택 용도변경 적용 시: conversionDate (사전법규재산 2022-684·881)
   * UI ⑦ 결과 카드에서 `lthdStartDate !== acquisitionDate` 비교로 override 자가 판정.
   */
  lthdStartDate: Date;
  /**
   * 비과세 양도소득금액 — 소득세법 시행령 §161①·② 안분 결과 비과세 부분
   * 장기임대주택 거주주택 비과세 특례(§155⑳ + §161) 적용 시에만 채워짐
   * = §95① 양도소득금액 − 과세대상 양도소득금액
   * 결과 표의 "비과세 양도소득금액" 행에 표시
   */
  nontaxableGainAmount?: number;
  /** 기본공제 */
  basicDeduction: number;
  /** 과세표준 (소득세법 §92 — 원 단위) */
  taxBase: number;
  /** 적용 세율 */
  appliedRate: number;
  /** 누진공제액 */
  progressiveDeduction: number;
  /** 산출세액 */
  calculatedTax: number;
  /** 중과세 유형 */
  surchargeType?: string;
  /** 추가 세율 */
  surchargeRate?: number;
  /** 중과세 유예 여부 */
  isSurchargeSuspended: boolean;
  /** 총 감면세액 */
  reductionAmount: number;
  /** 감면 유형 (표시용 한글 라벨 — "자경농지", "장기임대주택" 등) */
  reductionType?: string;
  /**
   * 적용된 감면의 내부 식별자 (재계산·§133 한도 그룹핑용).
   * "self_farming" | "long_term_rental" | "new_housing" | "unsold_housing" | "public_expropriation"
   */
  reductionTypeApplied?: string;
  /**
   * 감면대상 양도소득금액 (합산 재계산의 분자, 조특령 §66 비율 적용 후).
   * 자경농지 편입일 부분감면 시 편입일 비율로 안분된 양도소득금액.
   * 편입 없으면 전체 양도소득금액과 동일.
   */
  reducibleIncome?: number;
  /** 결정세액 (원 미만 절사) */
  determinedTax: number;
  /** §114조의2 신축·증축 가산세 (환산취득가액 or 감정가액 × 5%) */
  penaltyTax: number;
  /**
   * §114조의2 가산세 산정 기준액 (= 가산세 ÷ 0.05).
   * 환산취득가액 모드: 건물 환산취득가액. 감정가액 모드: 감정가액(2020.1.1 이후).
   * 결과 카드 산식 표시용 ("건물 환산취득가 X × 5%"). 가산세 미발동 시 0.
   */
  penaltyBase: number;
  /** 지방소득세 ((결정세액 + 가산세) × 10%) */
  localIncomeTax: number;
  /** 총 납부세액 */
  totalTax: number;
  /** 계산 과정 steps */
  steps: CalculationStep[];
  /**
   * 다주택 중과세 상세 판정 결과 (houses[] 제공 시만 포함)
   * UI에서 제외 주택 목록·배제 사유 표시용
   */
  multiHouseSurchargeDetail?: {
    effectiveHouseCount: number;
    rawHouseCount: number;
    excludedHouses: ExcludedHouse[];
    exclusionReasons: ExclusionReason[];
    isRegulatedAtTransfer: boolean;
    warnings: string[];
  };
  /**
   * 비사업용 토지 판정 상세 결과 (nonBusinessLandDetails 제공 시만 포함)
   * UI에서 사업용/비사업용 판정 근거 표시용
   */
  nonBusinessLandJudgmentDetail?: NonBusinessLandJudgment;
  /**
   * 장기임대 감면 상세 결과 (rentalReductionDetails 제공 시만 포함)
   * UI에서 감면 자격·감면율·위반 사유 표시용
   */
  rentalReductionDetail?: RentalReductionResult;
  /**
   * 장기임대 §97의3·§97의4 장특공제 특례 평가 결과 (Phase 2 — 2026-06-11).
   * reductions에 rental_97_3/rental_97_4 본 필드 항목 포함 시 세팅 (불적용 사유 포함).
   */
  rental97LthdDetail?: Rental97Result;
  /**
   * 장기임대 §97 본문/단서·§97의2·§97의5 세액감면 평가 결과 (Phase 2 — 2026-06-11).
   * reductions에 해당 항목 포함 시 세팅 (불적용 사유 포함).
   */
  rental97TaxDetail?: Rental97Result;
  /**
   * §99의4 농어촌·고향주택 주택수 제외 평가 결과 (2026-06-11).
   * reductions에 new_99_4_rural/new_99_4_hometown 포함 시 세팅 (불적용 사유·추징 경고 포함).
   * eligible 시 비과세·12억 안분·LTHD 표2에 유효 주택수(count−1) 반영 — 중과 주택수는 미반영(R-D).
   */
  new994Detail?: New994Result;
  /**
   * §98의9 수도권 밖 준공후미분양 주택수 제외 평가 결과 (2026-06-11).
   * eligible 시 §99의4 동일 경로 — 동시 적격이면 §99의4 우선(F-4). 종부세 ②는 범위 외. */
  unsold989Detail?: Unsold989Result;
  /** §99 신축주택(IMF 1차) 차감 — 5년 내 전액/5년 후 안분 + 재개발 변형(령 §99①) (P1) */
  new99Detail?: New99Result;
  /** §98의8 준공후미분양 50% 공제 — 5년 발생분 × 50% + 임대 5년(등록 후 기산) (P1) */
  unsold988Detail?: Unsold988Result;
  /** §98의7 9억↓ 미분양 하이브리드 — 5년 내 세액감면 100%/5년 후 공제 (P2) */
  unsold987Detail?: UnsoldHybridResult;
  /** §99의2 신축·미분양·1세대1주택 하이브리드 — 6억 OR 85㎡ (P2) */
  unsold992Detail?: UnsoldHybridResult;
  /** §98의3 서울 밖 미분양 — 100%(과밀 60%)·농특세 비과세 (P3) */
  unsold983Detail?: UnsoldHybridResult;
  /** §98의5 수도권 밖 미분양 — 인하율별 60/80/100%·농특세 비과세 (P3) */
  unsold985Detail?: UnsoldHybridResult;
  /** §98의6 준공후미분양 50% — 1호/2호 (5년 내 감면 1호 한정) (P3) */
  unsold986Detail?: UnsoldHybridResult;
  /** §98의2 지방 미분양 — 특칙 전용 (장특 표2·기본세율, 감면세액 없음) (P4) */
  unsold982Detail?: UnsoldHybridResult;
  /** §98의4 비거주자 10% 세액감면 — 5년 무관 단일, 중과 배제 비대상 (P4) */
  unsold984Detail?: UnsoldHybridResult;
  /** 신축·미분양 감면 상세 (newHousingDetails 제공 시) — 매칭 조문·감면율·5년 안분 표시용 */
  newHousingReductionDetail?: NewHousingReductionResult;
  /**
   * 공익사업용 토지 수용 감면 상세 결과 (조특법 §77)
   * reductions에 public_expropriation 유형 포함 시만 세팅
   */
  publicExpropriationDetail?: PublicExpropriationReductionResult;
  /**
   * 자경농지 감면 상세 결과 (조특법 §69 + 시행령 §66 ⑤⑥)
   * reductions에 self_farming 유형 포함 시만 세팅.
   * 편입일 부분감면·3년 유예 경과 여부·감면대상 양도소득금액 포함.
   */
  selfFarmingReductionDetail?: SelfFarmingReductionResult;
  /**
   * 신고불성실·지연납부 가산세 상세 결과
   * filingPenaltyDetails 또는 delayedPaymentDetails 제공 시만 포함
   */
  penaltyDetail?: TransferTaxPenaltyResult;
  /**
   * 1990.8.30. 이전 취득 토지 기준시가 환산 상세 결과
   * pre1990Land 제공 시만 포함. UI에 5유형 분류·분모/비율 capping 내역 표시용.
   */
  pre1990LandValuationDetail?: Pre1990LandValuationResult;
  /** 다필지 계산 상세 결과 (parcels 제공 시만 포함) */
  parcelDetails?: ParcelResult[];
  /** 토지/건물 분리 계산 상세 (landAcquisitionDate 제공 시) — 각 양도차익·장특 내역 표시용 */
  splitDetail?: SplitGainResult;
  /** 개별주택가격 미공시 취득 환산 상세 (preHousingDisclosure 제공 시) — 안분비율·산식 표시용 */
  preHousingDisclosureDetail?: PreHousingDisclosureResult;
  /** 상속 취득가액 의제 상세 (inheritedAcquisition 제공 시) — case A/B 비교 표시용 */
  inheritedAcquisitionDetail?: import("./inheritance-acquisition.types").InheritanceAcquisitionResult;
  /** 상속 주택 환산취득가 상세 (inheritedHouseValuation 제공 시) — 3-시점·1990 환산 산식 표시용 */
  inheritedHouseValuationDetail?: InheritanceHouseValuationResult;
  /** 겸용주택 분리계산 (propertyType === "mixed-use-house"). UI 4-카드. */
  mixedUseDetail?: MixedUseGainBreakdown;
  /** 배우자등 이월과세 상세 (carryoverTaxation 제공 시). UI 비교 카드. */
  carryoverTaxationDetail?: CarryoverTaxationDetail;
  /**
   * 재개발/재건축 양도 상세 (redevelopment 제공 시). UI 3분할 카드 + FilingFormTable 3열.
   * 시행령 §166②1호 안분 결과 (preApproval / postApprovalExistingHouse / settlement).
   * 환산 케이스는 valuationMeta 포함 (§164⑦ 단서 발동 여부).
   */
  redevelopmentDetail?: RedevelopmentResult;
  /** 장기임대 거주주택 비과세 특례(§155⑳·§161). rentalHousingException 제공 시. */
  rentalHousingExceptionDetail?: import("../transfer-tax/rental-housing-exception/types").RentalHousingExceptionResult;
  /** Phase 2: 조특법 §99의3 신축주택 과세특례 상세. type==="new_99_3" 시. UI 5년 안분·부호·농특세 산식. */
  new993Detail?: import("../transfer-reductions/new-99-3").New993Result;
  /**
   * 세율 적용 주석 — 부수토지 일체과세(§89①3호·영§154⑦) 등 특수 세율 분기 시 한국어 주석.
   * 신고서 양식 표의 세율 행 아래에 표시. 일반 누진세율 케이스는 undefined.
   * 예: "부수토지 일체과세(§89①3호·영§154⑦): 70%"
   */
  shortTermNote?: string;
  /**
   * 상업용건물·오피스텔 환산취득가 산정 상세 결과.
   * commercialBuildingValuation 제공 + 환산 모드 시만 포함.
   * 결과 카드 산식 표시·신고서 토지/건물 분리 표 재현에 사용.
   */
  commercialBuildingValuationDetail?: CommercialBuildingValuationResult;
  /**
   * 일반건물(토지+건물 일괄) 환산취득가 산정 상세 결과.
   * propertyType === "general_building" aggregate 경로에서만 포함.
   * 결과 카드 산식 표시·신고서 토지/건물 분리 표 재현에 사용.
   */
  generalBuildingValuationDetail?: import("../general-building-valuation").GeneralBuildingOutput;
  /**
   * 부담부증여 양도세 명세 (burdenedGiftInfo 제공 시만 포함).
   * 상증법 평가 Max + 채무비율 + 자산별 안분 결과 + Phase 2 증여세 연결용 export.
   * 결과 카드 "상증법 평가 명세" 섹션 + "납세의무자: 증여자" 라벨 표시에 사용.
   */
  transferBurdenedGiftBreakdown?: TransferBurdenedGiftBreakdown;
  /**
   * 가업상속공제 §97의2④ 의제 취득가액 상세 (familyBusinessInheritance 제공 시만 포함).
   * UI 시니어 후속 위임 — 결과 카드 산식 표시용.
   */
  familyBusinessDetail?: FamilyBusinessCgtDetail;
}

// ============================================================
// 개별주택가격 미공시 취득 환산 (PHD) — 소득세법 시행령 §164⑤
// 800줄 정책 준수를 위해 ./transfer-phd.types.ts 로 분리. 하위 호환을 위해 재수출.
// ============================================================

export type {
  PreHousingDisclosureInput,
  PreHousingDisclosureResult,
} from "./transfer-phd.types";

import type { PreHousingDisclosureInput, PreHousingDisclosureResult } from "./transfer-phd.types";

/** 토지/건물 분리 계산 결과 */
export interface SplitPartResult {
  transferPrice: number;
  acquisitionPrice: number;
  directExpenses: number;
  appraisalDeduction: number;
  /** 취득시 기준시가 — 개산공제 산식 표시용 (개산공제 = floor(stdPriceAtAcq × 3%)) */
  stdPriceAtAcq?: number;
  gain: number;
  holdingYears: number;
  longTermRate: number;
  longTermDeduction: number;
  /** §97② 단서 swap 발동 여부 (자산 단위) */
  swapApplied?: boolean;
}

export interface SplitGainResult {
  land: SplitPartResult;
  building: SplitPartResult;
  apportionRatio: { land: number; building: number };
  note: string;
  /** 본인 신고 부분 — UI 결과 뷰 표시용 */
  selfOwns: "both" | "building_only" | "land_only";
  /** §164⑤ 경로 시만 포함 — calculateTransferTax가 result.preHousingDisclosureDetail로 승격 */
  preHousingDisclosureDetail?: PreHousingDisclosureResult;
}
