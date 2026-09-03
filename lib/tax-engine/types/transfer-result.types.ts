/**
 * 양도소득세 결과 타입 정의 (TransferTaxResult)
 *
 * 800줄 정책 준수를 위해 `transfer.types.ts`에서 분리. 하위 호환을 위해
 * `transfer.types.ts`가 본 타입을 재수출하므로 외부 소비자 import 경로는 변경 없음.
 */

import type { CalculationStep } from "./transfer.types";
import type { RateClause } from "../transfer-tax-rate-clause";
import type { ExcludedHouse, ExclusionReason, MultiHouseSurchargeResult } from "../multi-house-surcharge";
import type { NonBusinessLandJudgment } from "../non-business-land";
import type { RentalReductionResult } from "../rental-housing-reduction";
import type { NewHousingReductionResult } from "../new-housing-reduction";
import type { TransferTaxPenaltyResult } from "../transfer-tax-penalty";
import type { Pre1990LandValuationResult } from "../pre-1990-land-valuation";
import type { PublicExpropriationReductionResult } from "../public-expropriation-reduction";
import type { GbDesignatedLandResult } from "../gb-designated-land-reduction";
import type { ReplacementLandResult } from "../replacement-land-reduction";
import type { SelfFarmingReductionResult } from "../self-farming-reduction";
import type { ParcelResult } from "../multi-parcel-transfer";
import type { Rental97Result } from "../transfer-reductions/types";
import type { New994Result } from "../transfer-reductions/types";
import type { Unsold989Result } from "../transfer-reductions/types";
import type { New99Result } from "../transfer-reductions/new-99";
import type { Unsold988Result } from "../transfer-reductions/unsold-98-8";
import type { UnsoldHybridResult } from "../transfer-reductions/unsold-hybrid";
import type { InheritanceHouseValuationResult } from "./inheritance-house-valuation.types";
import type { MixedUseGainBreakdown } from "./transfer-mixed-use.types";
import type { CarryoverTaxationDetail } from "./transfer-carryover.types";
import type { TransferBurdenedGiftBreakdown } from "./transfer-burdened-gift.types";
import type { CommercialBuildingValuationResult } from "./commercial-building.types";
import type { RedevelopmentResult } from "./transfer-redevelopment.types";
import type { FamilyBusinessCgtDetail } from "../transfer-tax-family-business";
import type { PreHousingDisclosureResult } from "./transfer-phd.types";
import type { SplitGainResult } from "./transfer-split-gain.types";
import type {
  ExpropriationValuationDetail,
  AuctionValuationDetail,
  HousingExpropriationValuationDetail,
} from "../transfer-tax-expropriation-valuation";

/**
 * 「소득세법」 §95⑤·⑥ — 비주택 → 주택 용도변경 장기보유특별공제 적용 내역 echo.
 *
 * 공제율을 **정수 %**로 담는다(8 = 8%). 소수 rate로 합산하면 표1(0.02 배수) + 표2(0.04 배수)
 * 조합에서 부동소수 오차가 1원 과소를 만들기 때문에 엔진이 정수 %로 계산하고, 표시 계층도
 * 같은 값을 그대로 쓴다(`conversion-holding-pct.ts` 참조).
 */
export interface UsageConversionDetail {
  /**
   * 사실상 주거용으로 사용한 날 — `yyyy-MM-dd`.
   * ⚠️ **`Date`가 아니다**: 결과는 IndexedDB에 JSON으로 저장·복원되므로 Date는 왕복 후 문자열이 된다.
   */
  residentialUseStartDate: string;
  /** 비주택으로 보유한 완성연수 (취득일 ~ 주거용 사용 개시일) */
  nonHousingYears: number;
  /** 주택으로 보유한 완성연수 (주거용 사용 개시일 ~ 양도일 — §95⑥) */
  housingYears: number;
  /** 표1(일반) 보유분 공제율 — 정수 % */
  table1Pct: number;
  /** 표2(1세대1주택) 보유분 공제율 — 정수 % */
  table2HoldingPct: number;
  /** 표2 거주분 공제율 — 정수 % */
  residencePct: number;
  /** 표1 + 표2 보유분 합계가 40%를 넘어 §95⑤1호 단서로 잘렸는지 */
  holdingRateCapped: boolean;
  /** 주택 보유기간 밖이라 §95⑤2호 적용에서 제외된 거주 개월 수 (0이면 절사 없음) */
  residenceMonthsTrimmed: number;
}

export interface TransferTaxResult {
  /** 전액 비과세 여부 */
  isExempt: boolean;
  /**
   * **부분** 비과세 여부 — 「소득세법」 §89①3호 각 목에는 해당하나 12억 초과 고가주택이라
   * 초과분만 과세되는 상태 (2026-08-10 D-8에서 승격).
   *
   * ## 왜 노출하는가 — `isExempt`만으로는 §89①3호 해당 여부를 알 수 없다
   *
   * 전액 비과세는 조기반환(`buildExemptEarlyResult`)이라 `isExempt: true`지만, **고가주택은
   * 정상 경로를 끝까지 흘러 `isExempt: false`로 끝난다**. 그래서 「§89①3호 각 목의 주택
   * (고가주택 **포함**)의 양도에 해당하는가」는 **`isExempt || isPartialExempt`**로 봐야 한다.
   *
   * 소비자: `calcCarryoverScenarios`의 §97의2②2호 자동 판정.
   */
  isPartialExempt?: boolean;
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
  /**
   * [echo] 전액 비과세 자산의 gross 양도차익 (양도가액 − 취득가액 − 필요경비).
   * 비과세 조기반환(buildExemptEarlyResult) 시 `transferGain`은 0으로 유지되므로,
   * 신고서 양식 표시(전체·비과세 양도차익, 단건 취득가액 역산)에서만 사용하는 echo.
   * 비과세가 아니면 undefined. 세액 계산에는 미사용.
   */
  exemptGrossGain?: number;
  /** 과세 양도차익 (12억 초과분 안분 후) */
  taxableGain: number;
  /** 환산취득가 사용 여부 */
  usedEstimatedAcquisition: boolean;
  /** 환산취득가 base 금액 (개산공제 제외) — 환산/감정가액 모드에서만 */
  estimatedBase?: number;
  /** 개산공제액 (취득시 기준시가 × 3%) — 환산/감정가액 모드에서만 */
  estimatedDeduction?: number;
  /**
   * [echo] 환산취득가 산정에 쓰인 취득시 기준시가. 결과 산식 표시 전용 (계산 로직 불변).
   * 환산취득가 모드(useEstimatedAcquisition)이고 토지/건물 분리(split) 아닐 때만 부착.
   * 감정가액·매매사례가액 모드는 비율 산식이 아니므로 미부착.
   */
  estimatedStdPriceAtAcquisition?: number;
  /** [echo] 환산취득가 산정에 쓰인 양도시 기준시가. 결과 산식 표시 전용. */
  estimatedStdPriceAtTransfer?: number;
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
  /** #3 공익수용 환산 양도시 기준시가 min[] 특례 산출근거 (Record) — 게이트 충족 시만 */
  expropriationValuationDetail?: ExpropriationValuationDetail;
  /** §164⑨2호 공매·경락 특례 산출근거 (총액 2후보) — 게이트 충족 시만. 1호와 배타(P4) */
  auctionValuationDetail?: AuctionValuationDetail;
  /** §164⑨1호 주택(라목) 총액 트랙 특례 산출근거 (총액 3후보) — 게이트 충족 시만 (P5) */
  housingExpropriationValuationDetail?: HousingExpropriationValuationDetail;
  /** 장기보유특별공제액 */
  longTermHoldingDeduction: number;
  /** 장기보유특별공제율 */
  longTermHoldingRate: number;
  /**
   * 장특공제 배제 사유 echo (§95② 본문 괄호 — 미등기·분양권·승계입주권·§104⑦ 다주택 중과).
   * 배제 경로에서만 채워짐 — 공제율 미달(보유 3년 미만 등) 0원은 undefined. UI 표시 전용.
   */
  lthdExclusionReason?: import("../legal-codes/transfer").LthdExclusionReason;
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
  /**
   * 중과 유예 근거 목 — §167의3①12의2 가목(a)/나목(na)/다목(da).
   * isSurchargeSuspended === true일 때만 유의미 (echo, MultiHouseSurchargeResult에서 전파).
   */
  surchargeSuspensionBasis?: "a" | "na" | "da";
  /** 나·다목 유예 시 계산된 양도 기한(절대기한 반영 후). basis가 na/da일 때만 유의미. */
  surchargeSuspensionDeadline?: Date;
  /**
   * 부칙 §9270호 §14① — 2009.3.16~2012.12.31 취득 주택 세율 중과배제(조정지역 다주택이어도 기본세율).
   * 세율만 배제·§95² 장기보유특별공제 배제는 유지(서울행정법원 2024구단72950). echo(MultiHouseSurchargeResult 전파).
   */
  rateSurchargeStatutoryExcluded?: boolean;
  /**
   * 부칙 §9270호 §14① — 2009.3.16~2012.12.31 취득 비사업용 토지 +10%p 중과배제(기본세율). 장특 표1 유지. echo.
   */
  nblSurchargeExcluded?: boolean;
  /**
   * 엔진이 적용한 §104① 호 — 신고서 ③ 세율구분 코드 산정의 단일 소스.
   * §104① 후단·§104⑦ 후단 비교의 **승자**이므로 「해당 호 집합」은 표현하지 않는다.
   */
  rateClause?: RateClause;
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
  /**
   * 다건 합산 M-8이 `reducibleIncome`에 **추가로** 곱해야 할 감면율 (미설정 = 1).
   * §97 계열·legacy 장기임대·legacy 신축·하이브리드는 별지84호 부표1 ⑲ 표시 계약 때문에
   * `reducibleIncome`에 감면율을 곱하지 않으므로, 그 잔여 감면율을 여기로 운반한다.
   * 근거·anchor: `transfer-tax-reductions-calc.ts` ReductionCandidate 주석 (코드리뷰 D8-01).
   */
  aggregateReductionRate?: number;
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
  /**
   * [echo] 지방소득세 과세표준에 산입되는 가산세 = **§114조의2분만**.
   *
   * 국세기본법 §47의2~§47의4 신고불성실·납부지연 가산세는 지방소득세 과세표준에서
   * 제외된다(지방세법 §103의3). 엔진이 직접 산출한 result는 `penaltyTax` 자체가
   * §114조의2분만이라 이 필드가 없어도 되지만, **어댑터를 거친 result**는 그렇지 않다:
   *   · `aggregateToFilingResult`      → `penaltyTax`에 국기법분이 합산돼 있다
   *   · `mixedUseToFilingResult`       → `penaltyTax`가 **국기법분 그 자체**다(겸용엔 §114조의2가 없다)
   *   · `breakdownToFilingResult`      → `penaltyTax`에 국기법분이 합산돼 있다
   * 따라서 지방소득세 산식을 쓰는 표시부는 `penaltyTax`가 아니라 이 필드를 봐야 한다
   * (`local-income-tax-display.ts` 단일 소스). 미지정이면 `penaltyTax`로 폴백한다.
   */
  localTaxPenalty?: number;
  /**
   * 지방소득세 = (결정세액 + §114조의2 가산세) × 10%, 원 미만 절사.
   *
   * 근거: 과세표준 「지방세법」 §103②(=「소득세법」 §92 과세표준) × 세율 §103의3 − 감면 §103의4,
   * 여기에 §114조의2분을 §103의9②(환산·감정취득가액 × 0.5%)로 가산한 것과 같은 값이다.
   * 축 설명: `components/calc/results/transfer/local-income-tax-display.ts`.
   */
  localIncomeTax: number;
  /**
   * [echo] 농어촌특별세 **총액** (「농어촌특별세법」 §5①1호 — 조특법 감면세액 × 20%).
   *
   * 엔진은 세 갈래로 나눠 산정하고 `totalTax`에 합산한다:
   *   · 소득금액차감형(§99의3·§99·§98의8)  → `new993Detail.ruralSurtax` 등 detail에도 부착
   *   · 하이브리드(§98의7·§99의2 등)        → 해당 detail에 부착
   *   · **세액감면형(§77·§77의2·§77의3·§97 계열)** → 부착할 detail이 없다
   * 종전에는 총액 필드가 없어 표시부가 detail 11종을 훑어 재구성했고, 그래서 세액감면형은
   * 구조적으로 0이 됐다(신고서·명세서·요약카드·PDF 전부). 표시부는 이 필드를 정본으로 쓴다
   * — 해석은 `transfer/reduction-eligible-income.ts`의 `resolveRuralSurtax` 단일 소스.
   * 미지정(옛 저장 결과)이면 종전 detail 합산으로 폴백한다.
   */
  ruralSurtax?: number;
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
    excludedPresaleRights?: Array<{ id: string; reason: string }>; // #2b §167의4⑤ 배우자 분양권/입주권 차감
    /** 부칙 §9270호 §14① — 2009.3.16~2012.12.31 취득 주택 세율 중과배제(기본세율). 장특 배제는 유지. */
    rateSurchargeStatutoryExcluded?: boolean;
  };
  /**
   * houses[] 정밀 다주택 중과 판정의 **원본 결과** echo (2026-08-13 F01). 세액 로직 불변.
   *
   * 바로 위 `multiHouseSurchargeDetail`은 **표시용 부분집합**이라 세율 재계산에 필요한
   * `surchargeApplicable`·`surchargeType`·`isSurchargeSuspended`가 없다. 그래서 다건 집계
   * (`transfer-tax-aggregate-helpers.ts`)가 자산별 세액을 다시 구할 때 이 판정을 재사용하지
   * 못하고 **원시 플래그**(householdHousingCount·isRegulatedArea)로 되돌아가, 단건이 배제한
   * 중과가 다건에서 되살아났다.
   *
   * 정밀 결과를 **재판정하지 않고 그대로 싣는다** — 집계가 `runMultiHouseSurchargeStep`을
   * 다시 부르면 이중 진실이 된다.
   */
  multiHouseSurchargeEvaluation?: MultiHouseSurchargeResult;
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
   * 비주택 → 주택 용도변경 §95⑤·⑥ 적용 내역 echo (2026-08-05).
   * 미적용(토글 없음·2025-01-01 전 양도·표2 대상 아님)이면 undefined.
   * 계산 로직은 이 필드를 읽지 않는다 — 결과 화면 산출근거 표시 전용.
   */
  usageConversionDetail?: UsageConversionDetail;
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
  /** §98 미분양 국민주택 — 세율 20% 특례 (P5) */
  unsold98Detail?: UnsoldHybridResult;
  /** P5 모드 2 — 보유 감면주택 주택수 제외 판정 echo */
  specialHouseExclusionDetail?: import("../transfer-reductions/unsold-hybrid-p5").SpecialHouseExclusionResolution;
  /** 신축·미분양 감면 상세 (newHousingDetails 제공 시) — 매칭 조문·감면율·5년 안분 표시용 */
  newHousingReductionDetail?: NewHousingReductionResult;
  /**
   * 공익사업용 토지 수용 감면 상세 결과 (조특법 §77)
   * reductions에 public_expropriation 유형 포함 시만 세팅
   */
  publicExpropriationDetail?: PublicExpropriationReductionResult;
  /**
   * 개발제한구역 매수대상 토지 감면 상세 결과 (조특법 §77의3)
   * reductions에 gb_designated_land 유형 포함 시만 세팅. 40%/25%/비적격 판정 표시용.
   */
  gbDesignatedLandDetail?: GbDesignatedLandResult;
  /**
   * 대토보상 과세특례 상세 결과 (조특법 §77의2 — 40% 세액감면 모드)
   * reductions에 replacement_land_comp 유형 포함 시만 세팅.
   */
  replacementLandDetail?: ReplacementLandResult;
  /**
   * 자경농지 감면 상세 결과 (조특법 §69 + 시행령 §66④1호·§66⑦)
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
   * 수정신고(경정) 상세 결과 — input.amendment 제공 시만 포함.
   * 추가납부 본세·§48② 감면·신고불성실·납부지연·총 납부세액.
   */
  amendmentDetail?: import("./transfer-amendment.types").AmendmentDetail;
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

/**
 * 감면·취득가액 상세 카드가 읽는 필드 묶음 — `ReductionDetailCards`의 **단일 계약**.
 *
 * ## 왜 별도 타입인가
 *
 * 일괄(bundled) 모드의 `PerPropertyBreakdown`은 자산별로 `calculateTransferTax`를 완전히
 * 호출하고도(계산은 정상) **결과의 Detail을 버려서** 산출근거 카드가 화면에 나오지 않았다.
 * 이 타입을 두 곳(`TransferTaxResult` · `PerPropertyBreakdown`)이 함께 만족하게 해서
 * **같은 컴포넌트를 단건·일괄 양쪽에서 재사용**한다(dual-truth 회피).
 *
 * 필드를 추가할 때는 `pickReductionDetails()`(transfer-tax-aggregate.ts)에도 함께 넣는다 —
 * 타입만 넓히면 일괄 경로에서 값이 조용히 비어 있다.
 *
 * ⚠️ `calculatedTax`·`taxBase`는 **포함하지 않는다**. 일괄에서는 합산 과세표준 기준이라
 *    자산별 값이 다르다(`refCalculatedTax`·`taxBaseShare`가 그 자리를 대신한다).
 *    호출부가 명시 prop으로 넘겨 의미를 드러낸다.
 */
export type TransferReductionDetailSource = Pick<
  TransferTaxResult,
  | "selfFarmingReductionDetail"
  | "inheritedAcquisitionDetail"
  | "inheritedHouseValuationDetail"
  | "newHousingReductionDetail"
  | "rentalReductionDetail"
  | "rental97LthdDetail"
  | "usageConversionDetail"
  | "rental97TaxDetail"
  | "new994Detail"
  | "unsold989Detail"
  | "new99Detail"
  | "unsold988Detail"
  | "unsold987Detail"
  | "unsold992Detail"
  | "unsold983Detail"
  | "unsold985Detail"
  | "unsold986Detail"
  | "unsold982Detail"
  | "unsold984Detail"
  | "unsold98Detail"
  | "new993Detail"
  | "publicExpropriationDetail"
  | "replacementLandDetail"
  | "gbDesignatedLandDetail"
  | "specialHouseExclusionDetail"
>;

/**
 * 평가·판정 상세 카드가 읽는 필드 묶음 — `ValuationDetailCards`의 **단일 계약** (R1-a).
 *
 * `TransferReductionDetailSource`(감면 24종)와 같은 목적이다. 일괄(bundled) 모드가
 * 자산별로 `calculateTransferTax`를 완전히 호출하고도 결과의 Detail을 버려
 * **산출근거가 화면에 안 나오던** 표시 갭을 좁힌다. 계산에는 영향이 없다.
 *
 * 필드를 추가할 때는 `pickValuationDetails()`(transfer-tax-aggregate.ts)에도 함께 넣는다 —
 * 타입만 넓히면 일괄 경로에서 값이 조용히 빈다(침묵 누락).
 *
 * `splitDetail`·`pre1990LandValuationDetail`은 단건 결과뷰의 인라인 렌더를
 * `SplitGainDetailSection`·`Pre1990LandValuationDetailCard`로 추출한 뒤 편입했다(R1-b).
 *
 * ⚠️ **제외**: `mixedUseDetail`·`redevelopmentDetail`·`generalBuildingValuationDetail`은 해당 자산이
 *    일괄에서 차단되어(PR #854) 도달 불가. `amendmentDetail`은 집계 최상위에 이미 있다.
 */
export type TransferValuationDetailSource = Pick<
  TransferTaxResult,
  | "commercialBuildingValuationDetail"
  | "nonBusinessLandJudgmentDetail"
  | "nblSurchargeExcluded"
  | "multiHouseSurchargeDetail"
  | "expropriationValuationDetail"
  | "housingExpropriationValuationDetail"
  | "auctionValuationDetail"
  | "preHousingDisclosureDetail"
  | "rentalHousingExceptionDetail"
  | "familyBusinessDetail"
  | "carryoverTaxationDetail"
  | "splitDetail"
  | "pre1990LandValuationDetail"
>;
