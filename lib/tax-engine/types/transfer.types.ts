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
import type { InheritanceHouseValuationInput, InheritanceHouseValuationResult } from "./inheritance-house-valuation.types";

export interface TransferTaxInput {
  /** 물건 종류 */
  propertyType: "housing" | "land" | "building" | "right_to_move_in" | "presale_right";
  /** 양도가액 (원, 정수) */
  transferPrice: number;
  /** 양도일 */
  transferDate: Date;
  /** 취득가액 (0이면 환산취득가 사용) */
  acquisitionPrice: number;
  /** 취득일 */
  acquisitionDate: Date;
  /** 필요경비 */
  expenses: number;
  /** 환산취득가 사용 여부 */
  useEstimatedAcquisition: boolean;
  /** 취득시 기준시가 (환산취득가 사용 시 필수) */
  standardPriceAtAcquisition?: number;
  /** 양도시 기준시가 (환산취득가 사용 시 필수) */
  standardPriceAtTransfer?: number;
  /** 세대 보유 주택 수 */
  householdHousingCount: number;
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
  /** 취득 원인 (매매·상속·증여). 미지정 시 매매로 간주. */
  acquisitionCause?: "purchase" | "inheritance" | "gift";
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
  /**
   * 기본공제 스킵 (§103). aggregate 엔진에서 호출 시 true로 세팅.
   * default false → 기존 동작 유지.
   */
  skipBasicDeduction?: boolean;
  /**
   * 양도차익 음수 바닥 처리 생략 (§102② 차손 통산용).
   * aggregate 엔진에서 호출 시 true로 세팅하여 음수 `gain` 반환.
   * default false → 기존 `Math.max(0, gain)` 동작 유지.
   */
  skipLossFloor?: boolean;
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
}

export type TransferReduction =
  | {
      type: "self_farming";
      /** 상속인 본인이 해당 농지를 직접 경작한 기간(년). */
      farmingYears: number;
      /**
       * 피상속인의 경작기간(년) — 선택.
       * 본인 자경기간이 조특법 §69 요건(8년)에 미달할 때 조특령 §66⑪ 1호에 따라 합산.
       * 본인 자경기간만으로 요건 충족 시 무시된다.
       */
      decedentFarmingYears?: number;
      /**
       * 주거·상업·공업지역 편입일 — 선택.
       * 2002.1.1 이후 편입인 경우 조특령 §66 ⑤⑥에 따라 부분감면 적용:
       *   - 편입일까지의 양도소득(기준시가 증가분 비율)만 감면 대상
       *   - 편입일부터 3년 내 양도해야 감면 적용 (경과 시 감면 상실)
       */
      incorporationDate?: Date;
      /** 편입 지역 유형 (표시·판정용) */
      incorporationZoneType?: "residential" | "commercial" | "industrial";
      /**
       * 편입일 당시 기준시가 (원, 총액 또는 ㎡당 단가).
       * `standardPriceAtAcquisition`·`standardPriceAtTransfer`(TransferTaxInput 기본)와 같은 단위여야 한다.
       */
      standardPriceAtIncorporation?: number;
    }
  | { type: "long_term_rental"; rentalYears: number; rentIncreaseRate: number }
  | { type: "new_housing"; region: "metropolitan" | "non_metropolitan" }
  | { type: "unsold_housing"; region: "metropolitan" | "non_metropolitan" }
  | {
      type: "public_expropriation";
      cashCompensation: number;
      bondCompensation: number;
      bondHoldingYears?: 3 | 5 | null;
      businessApprovalDate: Date;
    };

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
  /** 양도차익 */
  transferGain: number;
  /** 과세 양도차익 (12억 초과분 안분 후) */
  taxableGain: number;
  /** 환산취득가 사용 여부 */
  usedEstimatedAcquisition: boolean;
  /** 장기보유특별공제액 */
  longTermHoldingDeduction: number;
  /** 장기보유특별공제율 */
  longTermHoldingRate: number;
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
   * 신축주택·미분양주택 감면 상세 결과 (newHousingDetails 제공 시만 포함)
   * UI에서 매칭 조문·감면율·5년 안분 결과 표시용
   */
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
  /**
   * 토지/건물 분리 계산 상세 결과 (landAcquisitionDate 제공 시만 포함).
   * UI에서 토지·건물 각각의 양도차익·장특공제 내역 표시용.
   */
  splitDetail?: SplitGainResult;
  /**
   * 개별주택가격 미공시 취득 환산 상세 결과 (preHousingDisclosure 제공 시만 포함).
   * UI에서 Sum_A/Sum_F/P_A_est·안분비율·각 항목 산식 표시용.
   */
  preHousingDisclosureDetail?: PreHousingDisclosureResult;
  /**
   * 상속 취득가액 의제 상세 결과 (inheritedAcquisition 제공 시만 포함).
   * UI에서 case A 환산/실가×CPI 비교 또는 case B 신고가액·평가방법 표시용.
   */
  inheritedAcquisitionDetail?: import("./inheritance-acquisition.types").InheritanceAcquisitionResult;
  /**
   * 상속 주택 환산취득가 상세 결과 (inheritedHouseValuation 제공 시만 포함).
   * UI에서 3-시점 합계 기준시가·추정 주택가격·1990 등급가액 환산 산식 표시용.
   */
  inheritedHouseValuationDetail?: InheritanceHouseValuationResult;
}

// ============================================================
// 개별주택가격 미공시 취득 환산 — 소득세법 시행령 §164 ⑤
// ============================================================

/**
 * 개별주택가격 미공시 취득 시 환산취득가액 3-시점 계산 입력
 *
 * 주택 취득 당시 개별주택가격이 공시되지 않아 최초 공시 시점을 기준으로
 * 3-시점(취득·최초공시·양도) 기준시가를 사용해 취득시 기준시가를 역산한 뒤
 * 환산취득가액을 계산한다. 소득세법 시행령 §164 ⑤.
 *
 * 핵심 공식:
 *   Sum_A = landPricePerSqmAtAcquisition × landArea + buildingStdPriceAtAcquisition
 *   Sum_F = landPricePerSqmAtFirstDisclosure × landArea + buildingStdPriceAtFirstDisclosure
 *   P_A_est = Math.floor(firstDisclosureHousingPrice × Sum_A / Sum_F)
 *   totalEstAcq = Math.floor(totalTransfer × P_A_est / transferHousingPrice)
 */
export interface PreHousingDisclosureInput {
  /** 최초 고시일 (개별주택가격이 처음 고시된 날, 사용자 직접 입력) */
  firstDisclosureDate: Date;
  /** 최초 고시 개별주택가격 P_F (원) */
  firstDisclosureHousingPrice: number;
  /** 토지 면적 (㎡) */
  landArea: number;

  /** 취득당시 토지 단위 공시지가 (원/㎡) — 자동추천 연도에서 조회 */
  landPricePerSqmAtAcquisition: number;
  /** 취득당시 건물 기준시가 (원) — 국세청 건물기준시가 */
  buildingStdPriceAtAcquisition: number;

  /** 최초공시일 토지 단위 공시지가 (원/㎡) — 자동추천 연도에서 조회 */
  landPricePerSqmAtFirstDisclosure: number;
  /** 최초공시일 건물 기준시가 (원) — 국세청 건물기준시가 */
  buildingStdPriceAtFirstDisclosure: number;

  /** 양도시 개별주택가격 P_T (원) — 양도시 현재 공시가격 */
  transferHousingPrice: number;
  /** 양도시 토지 단위 공시지가 (원/㎡) */
  landPricePerSqmAtTransfer: number;
  /** 양도시 건물 기준시가 (원) */
  buildingStdPriceAtTransfer: number;
}

/**
 * 개별주택가격 미공시 취득 시 환산취득가액 계산 중간/결과값
 * UI에서 단계별 산식 표시용
 */
export interface PreHousingDisclosureResult {
  /** 취득시 기준시가 합계 Sum_A = landPricePerSqm × area + buildingStd */
  sumAtAcquisition: number;
  /** 최초공시일 기준시가 합계 Sum_F = landPricePerSqm × area + buildingStd */
  sumAtFirstDisclosure: number;
  /** 양도시 기준시가 합계 Sum_T = landPricePerSqm × area + buildingStd */
  sumAtTransfer: number;

  /** 추정 취득시 개별주택가격 P_A_est = floor(P_F × Sum_A / Sum_F) */
  estimatedHousingPriceAtAcquisition: number;

  /** 취득시 토지 기준시가 (= landPricePerSqm × area) */
  landStdAtAcquisition: number;
  /** 취득시 건물 기준시가 */
  buildingStdAtAcquisition: number;
  /** 양도시 토지 기준시가 (= landPricePerSqm × area) */
  landStdAtTransfer: number;
  /** 양도시 건물 기준시가 */
  buildingStdAtTransfer: number;

  /** 주택 공시가액 안분 — 취득시 토지 성분 (= floor(P_A_est × landStdAtAcq / Sum_A)) */
  landHousingAtAcquisition: number;
  /** 주택 공시가액 안분 — 취득시 건물 성분 */
  buildingHousingAtAcquisition: number;
  /** 주택 공시가액 안분 — 양도시 토지 성분 */
  landHousingAtTransfer: number;
  /** 주택 공시가액 안분 — 양도시 건물 성분 */
  buildingHousingAtTransfer: number;

  /** 안분 비율 (양도시 기준시가 비율) — 양도가액 분리 */
  transferApportionRatio: { land: number; building: number };
  /** 안분 비율 (취득시 기준시가 비율) — 취득가액·개산공제 분리 */
  acquisitionApportionRatio: { land: number; building: number };

  /** 총 환산취득가 = floor(totalTransfer × P_A_est / P_T) */
  totalEstimatedAcquisitionPrice: number;
  /** 토지 양도가액 */
  landTransferPrice: number;
  /** 건물 양도가액 */
  buildingTransferPrice: number;
  /** 토지 환산취득가 */
  landAcquisitionPrice: number;
  /** 건물 환산취득가 */
  buildingAcquisitionPrice: number;
  /** 토지 개산공제 = floor(landHousingAtAcquisition × 3%) */
  landLumpDeduction: number;
  /** 건물 개산공제 = floor(buildingHousingAtAcquisition × 3%) */
  buildingLumpDeduction: number;

  /** 입력값 echo — UI에서 산식 분해 표시용 */
  inputs: {
    /** 총 양도가액 (계약서 합계) */
    totalTransferPrice: number;
    /** 토지 면적 (㎡) */
    landArea: number;
    /** 취득시 토지 단위공시지가 (원/㎡) */
    landPricePerSqmAtAcquisition: number;
    /** 취득시 건물 기준시가 (원) */
    buildingStdPriceAtAcquisition: number;
    /** 최초공시일 토지 단위공시지가 (원/㎡) */
    landPricePerSqmAtFirstDisclosure: number;
    /** 최초공시일 건물 기준시가 (원) */
    buildingStdPriceAtFirstDisclosure: number;
    /** 최초 고시 개별주택가격 P_F */
    firstDisclosureHousingPrice: number;
    /** 양도시 토지 단위공시지가 (원/㎡) */
    landPricePerSqmAtTransfer: number;
    /** 양도시 건물 기준시가 (원) */
    buildingStdPriceAtTransfer: number;
    /** 양도시 개별주택가격 P_T */
    transferHousingPrice: number;
  };
}

/** 토지/건물 분리 계산 결과 */
export interface SplitPartResult {
  transferPrice: number;
  acquisitionPrice: number;
  directExpenses: number;
  appraisalDeduction: number;
  gain: number;
  holdingYears: number;
  longTermRate: number;
  longTermDeduction: number;
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
