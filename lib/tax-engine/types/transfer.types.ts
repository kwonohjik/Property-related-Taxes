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
}
