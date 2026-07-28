/**
 * 일반건물(토지+건물 일괄) 환산취득가 계산 엔진
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음. 순수 함수.
 * 단방향 의존: 이 파일은 transfer-tax-aggregate.ts에서 생성된 카드를 공급하며
 *             transfer-tax.ts 또는 aggregate를 import하지 않음 (역방향 금지).
 *
 * 법령 근거:
 *   소득세법 시행령 §166 ⑥ — 토지·건물 등 여러 자산 일괄 양도 시 기준시가 비율 안분
 *   소득세법 시행령 §176조의2 ② — 환산취득가액 (취득시/양도시 기준시가 비율)
 *   소득세법 §97 ② 2호 + 시행령 §163 ⑥ — 개산공제율 (등기 자산 3%, 미등기 0.3%)
 *   소득세법 §104조의3 + 시행령 §168의8 — 비사업용토지 판정 (건물 부수토지 배율)
 *
 * P0-2 원칙: 모든 금액 원(정수) 단위. Math.round() 금지 — Math.floor() 사용.
 * BigInt 원칙: 분자 ≈ 2.15×10¹⁷ 초과 시 safeMultiplyThenDivide() 자동 fallback.
 */

import { computeEstimatedDeduction, computeLumpSumDeductionBase, safeMultiplyThenDivide } from "./tax-utils";
import { TRANSFER, ESTIMATED_DEDUCTION_RATE } from "./legal-codes";
import { apportionLandByBusinessArea } from "./general-building-area-apportion";
import { getLandFootprintMultiplier } from "./non-business-land/urban-area";
import type { ZoneType } from "./non-business-land/types";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import type { CarryoverTaxationInput } from "./types/transfer-carryover.types";
import { buildGeneralBuildingAssetCardsWithExtension } from "./general-building-extension";
import { applyConvertedHousingPriceOverride } from "./general-building-converted-housing";
import type { ExpropriationValuationDetail } from "./transfer-tax-expropriation-valuation";
import { calculateConvertedAcquisition } from "./general-building-converted-acquisition";

// ============================================================
// 개산공제율 상수 (시행령 §163 ⑥)
// ============================================================

/**
 * 등기 자산(토지·일반건물·주택·오피스텔 등) 개산공제율 — 시행령 §163 ⑥.
 * SSOT: legal-codes `ESTIMATED_DEDUCTION_RATE.LAND_BUILDING` (상가 엔진과 공유).
 */
export const ESTIMATED_DEDUCTION_RATE_LAND_BUILDING = ESTIMATED_DEDUCTION_RATE.LAND_BUILDING;

/**
 * 미등기양도자산 개산공제율 — 시행령 §163 ⑥.
 * ⚠️ 현재 미사용: 일반건물·상가 환산 경로는 등기 자산 전제(3% 고정)이며,
 *    route helper가 `estimatedDeductionRate: 0.03`을 주입한다. 미등기양도자산을
 *    지원하려면 route helper·validate에서 이 율로 wiring해야 한다.
 */
export const ESTIMATED_DEDUCTION_RATE_UNREGISTERED = ESTIMATED_DEDUCTION_RATE.UNREGISTERED;

// 비사업용토지 면적 직접 안분 헬퍼 (§104의3) — 800줄 정책으로 sibling 분리. 하위호환 re-export.
export { apportionLandByBusinessArea };

// ============================================================
// 공개 타입 (Task #3 — GeneralBuildingInput/Output)
// ============================================================

/** 일반건물(토지+건물 일괄) 환산취득가 계산 입력 */
export type GeneralBuildingInput = {
  // 양도 정보
  /** 총 양도가액 (원) — 토지+건물 합계 */
  totalTransferPrice: number;
  /** 양도일 */
  transferDate: Date;

  // 취득 정보
  /** 취득일 */
  acquisitionDate: Date;

  // 면적
  /** 토지 부수면적 (㎡) */
  landArea: number;
  /** 건물 연면적 (㎡) */
  buildingArea: number;
  /** 건물 수평투영면적 (㎡) — 비사업용토지 판정 기준 (건축물대장 건축면적 또는 1층 바닥면적) */
  buildingFootprintArea: number;

  // 양도시점 기준시가 (안분 분모)
  /** 양도시 개별공시지가 (원/㎡) */
  transferLandPricePerSqm: number;
  /** 양도시 건물기준시가 총액 (원) */
  transferBuildingStdPrice: number;

  // ── §164⑨ 1호 공익수용 특례 (토지 전용 — 계획 D16-GB) ──
  // 법령 조사 결론(2026-07-16): GB에서 §164⑨은 **토지분(가목)에만** 적용한다.
  //   - 시행규칙 §80⑧: "보상액 산정 기초 기준시가 = 보상금 산정 당시 해당 **토지**의 개별공시지가" →
  //     건물분(나목)은 "보상 기초 기준시가" 정의 자체가 없어 대상에서 제외(보수적).
  //   - 국세청 해석 2건(서면-2016-부동산-4026·사전-2018-법령해석재산-0057)도 전부 토지 사안.
  //   - 효과: **토지 환산 분모(§176의2②)만** min[]로 낮춘다. **안분(§166⑥)은 원 개별공시지가 유지** —
  //     안분에 낮춘 값을 넣으면 토지 상대가치 인위적 하락 → 양도가가 건물로 과다 배분(입법의도 밖).
  /** 양도원인 — "public_expropriation" 시에만 §164⑨ 게이트 진입. */
  transferCause?: "general" | "public_expropriation";
  /** 토지 보상가액 (원/㎡) — §164⑨ 1호 후보. */
  compensationPerSqm?: number;
  /** 토지 보상산정 기초 개별공시지가 (원/㎡) — §164⑨ 1호 후보(시행규칙 §80⑧). */
  compensationBasisStdPrice?: number;

  // 취득시점 기준시가 (환산 분자)
  /** 취득시 개별공시지가 (원/㎡) */
  acquisitionLandPricePerSqm: number;
  /** 취득시 건물기준시가 총액 (원) */
  acquisitionBuildingStdPrice: number;

  // 신축 취득 / 건물 별도 취득 (사례 32 — §114조의2 가산세)
  /**
   * 건물 취득일 — 소득세법 시행령 §162① 4호 기준 빠른 날
   * (사용승인서 교부일·사실상 사용일·임시사용승인일 중).
   * 미입력 시 acquisitionDate(토지 취득일) fallback ← 사례 31 호환.
   * buildingAcquisitionCause === "newConstruction" 시 validation에서 필수 강제.
   */
  buildingAcquisitionDate?: Date;
  /**
   * 신축취득 여부. 라우트 헬퍼에서 `buildingAcquisitionCause === "newConstruction"` 으로 도출.
   * 엔진 input에는 boolean으로 normalize 후 전달 (단일 진실 원천 유지).
   */
  isSelfBuilt?: boolean;
  /**
   * 건물 취득원인. 토지의 acquisitionCause와 별개.
   * "newConstruction"일 때 isSelfBuilt=true로 도출.
   *
   * **required** — 라우트 헬퍼 진입 전 3중 차단 (Zod·normalizeAsset M-2·validate)으로
   * 항상 정의됨 보장. 엔진 단위 테스트에서도 명시 입력 필수 (silent fallback 없음).
   */
  buildingAcquisitionCause:
    | "purchase"
    | "inheritance"
    | "gift"
    | "carryover_gift"
    | "newConstruction";

  /**
   * 토지 취득원인 (#4-a 후속 PR).
   * 미입력 시 default "purchase" — 사례 31·32 회귀 호환.
   * "inheritance"·"gift"·"carryover_gift" 시 토지 카드의 단기보유 기산점이
   * decedent/donorAcquisitionDate로 변경됨 (영 §95④).
   */
  landAcquisitionCause?:
    | "purchase"
    | "inheritance"
    | "gift"
    | "carryover_gift";
  /** 토지 상속 시 피상속인 취득일 (영 §95④). */
  decedentAcquisitionDate?: Date;
  /** 토지 증여 시 증여자 취득일 (영 §95④). */
  donorAcquisitionDate?: Date;
  /**
   * #7-b: 토지 배우자등 이월과세 (§97조의2) — landAcquisitionCause === "carryover_gift" 시 필수.
   * 단건 엔진의 비교과세(이월 시나리오 vs 통상 max) 로직이 토지 카드에 적용됨.
   */
  landCarryoverTaxation?: CarryoverTaxationInput;
  /**
   * 다른 피상속인 케이스 — 건물 전용 피상속인 취득일.
   * 미입력 시 `decedentAcquisitionDate` fallback (#6 같은 피상속인 호환).
   * `buildingAcquisitionCause === "inheritance"` 시 단기보유 기산점(영 §95④).
   */
  buildingDecedentAcquisitionDate?: Date;
  /**
   * 다른 증여자 케이스 — 건물 전용 증여자 취득일.
   * 미입력 시 `donorAcquisitionDate` fallback (#7-a 같은 증여자 호환).
   * `buildingAcquisitionCause === "gift"` 시 단기보유 기산점(영 §95④).
   */
  buildingDonorAcquisitionDate?: Date;

  /**
   * 증축 정보 (사례 33 — §114조의2 + §166⑥ 증축 안분).
   * 미입력 시 기존 단일 건물 동작 100% 보존 (사례 31·32 회귀 위험 0).
   * extensionDate = 건물2 취득일 (영 §162①4호 빠른 날).
   */
  extensionInfo?: {
    /** 증축일 (=건물2 취득일, 영 §162①4호 빠른 날) */
    extensionDate: Date;
    /** 증축 연면적 (㎡) — 정보용 (위치지수 산정 확장 대비, 산식 미사용, 선택) */
    extensionArea?: number;
    /**
     * 증축 바닥면적 합계 (㎡) — 소득세법 §114조의2① 85㎡ 초과 게이트 전용.
     * 신축은 면적 무관, 증축만 이 값으로 가산세 발동 판정(extensionFloorArea85 > 85).
     * 정보용 extensionArea(연면적)와 구분 — 게이트에는 이 필드만 사용.
     */
    extensionFloorArea85?: number;
    /**
     * 양도시 건물2 기준시가 총액 (원) — UI에서 단가 곱한 총액 받음. ㎡당 단가 아님.
     * acquisitionMode === "estimated" 시 필수. 실가 모드 시 미입력 허용.
     */
    transferExtensionBuildingStdPrice?: number;
    /**
     * 취득시(증축시) 건물2 기준시가 총액 (원) — 환산 분자.
     * acquisitionMode === "estimated" 시 필수. 실가 모드 시 미입력 허용.
     */
    acquisitionExtensionBuildingStdPrice?: number;
    /** 건물2 취득원인 — "newConstruction"(자가증축, default) | "purchase"(매수 증축) */
    extensionAcquisitionCause: "purchase" | "newConstruction";
    /**
     * 토지+건물1 일괄 실거래 취득가액 (원).
     * 원건물이 실가 모드(acquisitionMethod === "actual") 시 필수. 환산 모드 시 미입력 허용.
     * 2-way 안분의 분자.
     */
    actualBundledAcquisitionPrice?: number;
    /**
     * 토지+건물1 일괄 실거래 필요경비 (원).
     * 원건물이 실가 모드(acquisitionMethod === "actual") 시 필수. 환산 모드 시 미입력 허용.
     * 2-way 안분의 분자.
     */
    actualBundledExpenses?: number;
    /**
     * 증축분 취득 방식 (필수).
     * - "estimated": 환산취득가 (소령 §176조의2②) — transferExtensionBuildingStdPrice + acquisitionExtensionBuildingStdPrice 필수
     * - "actual":    실거래가 별도 입력 — actualAcquisitionPrice 필수
     *
     * default: "estimated" (사례 33 기존 anchor 호환성 보존).
     * 엔진에서 undefined 시 "estimated" 로 처리.
     */
    acquisitionMode?: "actual" | "estimated";
    /**
     * 증축 실거래 취득가액 (원).
     * acquisitionMode === "actual" 시 필수. 환산 모드 시 미사용.
     */
    actualAcquisitionPrice?: number;
    /**
     * 증축 시 발생한 실제 필요경비 (원).
     * acquisitionMode === "actual" 시에만 유효. 환산 모드 시 미사용.
     * 미입력 시 0 처리.
     */
    actualExpenses?: number;
  };

  // 선택적
  /** 개산공제율 (기본 0.03 — ESTIMATED_DEDUCTION_RATE_LAND_BUILDING) */
  estimatedDeductionRate?: number;
  /**
   * 용도지역 (§168의12 배율 결정). ZoneType 값.
   * 미입력 시 엔진이 TaxCalculationError 발생. validate 단계에서 사전 차단.
   */
  zoneType?: string;
  /** 수도권 소재 여부. 배율 3배 vs 5배 분기에 사용. */
  isMetropolitan?: boolean;
  /**
   * 무허가(미등재) 건축물 여부.
   * true 시 배율 계산 없이 토지 전체 비사업용.
   * 근거: 지방세법 시행령 §101①단서(무허가건축물 부속토지 재산세 별도합산 제외)
   *       + 소득세법 §104의3①4호나목 → 비사업용.
   */
  isUnregistered?: boolean;
  // ── 사례 35: 주택→상가 용도변경 (사전법규재산 2022-684·881) ──
  /** 주택→상가 단일 용도변경 토글. true 시 conversionDate·wasMultiHouseAtConversion 필수. */
  houseToCommercialConversion?: boolean;
  /** 용도변경일 — houseToCommercialConversion=true 시 필수. */
  conversionDate?: Date;
  /** 변경 당시 다주택자 여부. true → 자산 카드 LTHD 기산일 = conversionDate. */
  wasMultiHouseAtConversion?: boolean;
  // ── 사례 35 후속-1: §99-164-10 환산주택가격 분기 ──
  /** 주택으로 최초공시 후 상가로 용도변경 — 환산취득가 모드에서만 의미. */
  hasFirstDisclosure?: boolean;
  /** 최초공시주택가격 (원). hasFirstDisclosure=true 시 필수. */
  firstDisclosurePrice?: number;
  /** 최초공시 당시 토지 기준시가 총액 (원). hasFirstDisclosure=true 시 필수. */
  firstDisclosureLandStdPrice?: number;
  /** 최초공시 당시 건물 기준시가 총액 (원). hasFirstDisclosure=true 시 필수. */
  firstDisclosureBuildingStdPrice?: number;
  // ── §97②2호 단서 swap (환산 전용, 자산-총액 단위) ──
  /**
   * 자본적지출 (원, 자산 총액 — §97① 가목). §97②2호 단서 swap 판정용.
   * 나목(자본적지출+양도비) > 가목(환산취득가+개산공제 합) 시 나목을 필요경비로 적용.
   */
  capitalExpenditure?: number;
  /** 양도비 (원, 자산 총액 — §97① 나목). swap 판정용. */
  transferExpense?: number;
  /**
   * 공유지분율 (0 < r ≤ 1, 미전달 시 1). **개산공제(소득령 §163⑥) base 축소 전용**.
   *
   * 기준시가·면적은 물건 전체(100%) 값을 유지한다 — 환산 산식에서 분자·분모로 함께 나타나 상쇄되고,
   * §166⑥ 안분 비율도 100% 스케일을 전제하기 때문이다. 호출부가 `TransferTaxInput.ownershipRatio`를
   * 그대로 내려준다(서브엔진 재판정 금지).
   *
   * 설계: docs/02-design/features/transfer-fractional-lump-sum-deduction.engine.design.md §2.1
   */
  ownershipRatio?: number;
};

/** 양도가 안분 결과 */
export type GeneralBuildingAllocation = {
  /** 토지 양도가 (원) */
  land: number;
  /** 건물 양도가 (원) */
  building: number;
};

/** 환산취득가 결과 */
export type GeneralBuildingAcquisition = {
  /** 토지 환산취득가 (원) */
  land: number;
  /** 건물 환산취득가 (원) */
  building: number;
};

/** 개산공제 결과 */
export type GeneralBuildingEstimatedDeduction = {
  /** 토지 개산공제 (원) */
  land: number;
  /** 건물 개산공제 (원) */
  building: number;
  /**
   * 개산공제 base로 **실제 사용된 값** = `floor(취득시 기준시가 × 지분율)`.
   * 표시 산식 「… × 3%」가 표시된 개산공제를 그대로 만들어내게 하는 echo다 — 100% 기준시가를
   * 노출하면 지분 자산에서 산식이 자기 값을 못 만든다(`feedback_engine_result_display_drift`).
   * 단독소유면 기준시가와 같다.
   */
  landBase?: number;
  /**
   * 개산공제 base로 **실제 사용된 값** = `floor(취득시 기준시가 × 지분율)`.
   * 표시 산식 「… × 3%」가 표시된 개산공제를 그대로 만들어내게 하는 echo다 — 100% 기준시가를
   * 노출하면 지분 자산에서 산식이 자기 값을 못 만든다(`feedback_engine_result_display_drift`).
   * 단독소유면 기준시가와 같다.
   */
  buildingBase?: number;
};

/**
 * aggregate 엔진에 넘길 자산 카드 구조
 * TransferTaxItemInput과 호환 — 나머지 필드는 호출부에서 주입
 */
export type AssetCardForAggregate = {
  /** 자산 식별자 */
  propertyId: string;
  /** 자산 표시명 */
  propertyLabel: string;
  /** 자산 유형 */
  propertyType: "land" | "general_building_unit";
  /** 안분된 양도가 (원) */
  transferPrice: number;
  /** 환산취득가 (원) */
  acquisitionPrice: number;
  /** 개산공제 (원) */
  expenses: number;
  /**
   * 환산취득가 사용 여부.
   * - 토지·건물1(실가 안분): false
   * - 건물2(환산취득가): true
   * - 사례 31·32(전체 환산): true
   */
  usedEstimatedAcquisition: boolean;
  /** 환산취득가액 (환산 미사용 시 0) */
  estimatedBase: number;
  /** 개산공제액 (환산 미사용 시 0) */
  estimatedDeduction: number;
  /** 취득일 */
  acquisitionDate: Date;
  /** 양도일 */
  transferDate: Date;
  /** 비사업용토지 여부 */
  isNonBusinessLand: boolean;
  /**
   * 건물 카드만 set. 라우트가 TransferTaxItemInput 매핑 시 isSelfBuilt 패스스루용.
   * 소득세법 §114조의2 ① 가산세 발동 여부 판단에 사용.
   */
  isSelfBuilt?: boolean;
  /**
   * 건물 카드만 set. 영 §162①4호 빠른 날
   * (사용승인서 교부일·사실상 사용일·임시사용승인일 중).
   * 환산취득가액 가산세(소득세법 §114조의2 ①)의 5년 기산점이자
   * 건물 LTHD 보유기간 기산점.
   */
  buildingAcquisitionDate?: Date;
  /**
   * 건물 카드에만 set. 토지 카드는 undefined.
   * `propertyType === "general_building_unit"` 카드에만 의미 있음.
   * 라우트가 TransferTaxItemInput 매핑 시 acquisitionCause로 전달.
   */
  buildingAcquisitionCause?:
    | "purchase"
    | "inheritance"
    | "gift"
    | "carryover_gift"
    | "newConstruction";
  /**
   * 토지 카드에만 set (#4-a 후속 PR). 건물 카드는 undefined.
   * 라우트가 TransferTaxItemInput 매핑 시 acquisitionCause로 전달.
   * "inheritance"·"gift" 시 단건/aggregate 엔진의 단기보유 판정 기산점이
   * decedent/donorAcquisitionDate로 변경됨 (영 §95④).
   */
  landAcquisitionCause?:
    | "purchase"
    | "inheritance"
    | "gift"
    | "carryover_gift";
  /** 토지 상속 시 피상속인 취득일 (영 §95④ 단기보유 기산점). */
  decedentAcquisitionDate?: Date;
  /** 토지 증여 시 증여자 취득일 (영 §95④ 단기보유 기산점). */
  donorAcquisitionDate?: Date;
  /**
   * #7-b: 토지 배우자등 이월과세 (§97조의2) — 토지 카드에만 set.
   * 라우트가 TransferTaxItemInput.carryoverTaxation로 전달 →
   * aggregate가 단건 엔진 호출 시 자동 비교과세 수행.
   */
  carryoverTaxation?: CarryoverTaxationInput;
  /**
   * 증축 건물 카드 여부 (사례 33 — building2 카드에만 true).
   * 결과 카드 배지 표시용. 산식에는 미사용.
   */
  isExtensionBuilding?: boolean;
  /**
   * 건물2(증축) 카드만 "extension" set. 소득세법 §114조의2① 85㎡ 게이트 진입용.
   * 라우트(buildProperties)가 TransferTaxItemInput.buildingType으로 패스스루.
   * 건물1·토지·신축 건물은 undefined(extension 아님 → 신축/일반 취급).
   */
  buildingType?: "new" | "extension";
  /**
   * 증축 바닥면적 합계 (㎡) — buildingType==="extension" 카드만 set.
   * 라우트가 TransferTaxItemInput.extensionFloorArea로 패스스루 → 85㎡ 초과 게이트.
   */
  extensionFloorArea?: number;
  /**
   * 사례 35: 주택→상가 용도변경 LTHD 분기 — 각 자산 카드에 동일 spread.
   * `propertyType === "general_building"` 자산 전체 속성이므로 토지·건물 모든 카드에 전파.
   */
  houseToCommercialConversion?: boolean;
  conversionDate?: Date;
  wasMultiHouseAtConversion?: boolean;
};

/** 일반건물(토지+건물 일괄) 환산취득가 계산 출력 */
export type GeneralBuildingOutput = {
  // 중간 계산값 (테스트·UI 노출용)
  /** 양도가 안분 결과 */
  allocation: GeneralBuildingAllocation;
  /** 환산취득가 결과 */
  acquisition: GeneralBuildingAcquisition;
  /** 개산공제 결과 */
  estimatedDeduction: GeneralBuildingEstimatedDeduction;

  // 비사업용토지 판정
  /** 건물 수평투영면적 (㎡) — 사용자 직접 입력 */
  buildingFootprintArea: number;
  /** 적용 배율 (3/5/10배) */
  appliedMultiplier: number;
  /** 배율 산출 근거 ("수도권 주·상·공 3배" 등) */
  multiplierDetail: string;
  /** 인정 한도 = 수평투영면적 × 배율 (㎡) */
  allowedLandArea: number;
  /** true = 사업용 (배율 내, 중과 미발동) */
  isWithinNblRatio: boolean;
  /** 비사업용 초과 면적 (㎡). 사업용이면 0. */
  nonBusinessArea: number;
  /** 비사업용 초과 비율 (0~1). 토지 카드 분할 기준. */
  nonBusinessRatio: number;

  // aggregate 엔진에 넘길 자산 카드 2장
  assetCards: AssetCardForAggregate[];

  // ── 산식 분모/분자 변수 (UI 자산별 산식 인라인 표시용 — optional) ──
  // §166⑥ 양도가 안분 분모: 토지 기준시가 + 건물 기준시가 (+ 증축건물 기준시가, 사례 33)
  /** 양도시 토지 기준시가 총액 (원) = transferLandPricePerSqm × landArea */
  landStdTotal?: number;
  /** 양도시 원건물 기준시가 총액 (원) — sample DB 입력값 그대로 */
  buildingStdTotal?: number;
  /** 양도시 증축건물 기준시가 총액 (원) — 사례 33만 채움 */
  extensionStdTotal?: number;
  /** 취득시 토지 기준시가 총액 (원) — 환산/일괄 안분 분모 */
  acqLandStdTotal?: number;
  /** 취득시 원건물 기준시가 총액 (원) */
  acqBuilding1StdTotal?: number;
  /** 취득시 증축건물 기준시가 총액 (원) — 사례 33 환산 모드만 채움 */
  acqExtensionStdTotal?: number;
  /** 일괄 실가 취득가액 (원) — 실가 모드에서만 채움. UI 안분 산식 분자. */
  bundledActualAcquisitionPrice?: number;
  /** 일괄 실가 양도비(자본적지출+양도비) (원) — 실가 모드에서만 채움. */
  bundledActualExpenses?: number;

  /**
   * §164⑨ 1호 공익수용 특례 산출근거 (토지 전용 — 계획 D16-GB).
   * 게이트(수용·환산·2009.02.04·보상 후보) 미충족 시 undefined. 결과 카드·anchor 표시용.
   */
  expropriationValuationDetail?: ExpropriationValuationDetail;

  /** §163⑨ 상속 취득가액 직접 산정 여부 — 토지분(결과 카드 라벨 분기용, Phase 1 = C1). */
  acquisitionByInheritance?: boolean;
  /** §163⑨ 상속 취득가액 직접 산정 여부 — 건물분. */
  buildingAcquisitionByInheritance?: boolean;
};

// ============================================================
// 내부 계산 함수
// ============================================================

/**
 * Step 1: 양도가 안분 (소득세법 시행령 §166 ⑥)
 *
 * 양도일 기준시가 비율로 토지·건물 양도가를 안분한다.
 *
 * 산식:
 *   토지 기준시가 = 양도시 공시지가(원/㎡) × 토지면적
 *   합계 기준시가 = 토지 기준시가 + 양도시 건물기준시가
 *   토지 양도가 = INT(총양도가 × 토지기준시가 / 합계기준시가)  ← BigInt 연산 필수
 *   건물 양도가 = 총양도가 − 토지양도가  (잔액 보정, 이중 floor 오차 방지)
 *
 * ⚠️ BigInt 필수: 분자 ≈ 925,000,000 × 920,550,000 ≈ 8.5×10¹⁷ > MAX_SAFE_INTEGER(9.0×10¹⁵)
 */
function allocateBundledTransferPrice(
  input: GeneralBuildingInput,
): GeneralBuildingAllocation {
  // 토지 기준시가 총액
  const landStdTotal = Math.floor(
    input.transferLandPricePerSqm * input.landArea,
  );
  const totalStd = landStdTotal + input.transferBuildingStdPrice;

  // BigInt fallback 자동 적용 — 분자 ≈ 8.5×10¹⁷
  const landTransferPrice = Math.floor(
    safeMultiplyThenDivide(input.totalTransferPrice, landStdTotal, totalStd),
  );
  // 잔액 보정: 건물 = 총양도가 − 토지 (이중 floor 오차 제거)
  const buildingTransferPrice = input.totalTransferPrice - landTransferPrice;

  return { land: landTransferPrice, building: buildingTransferPrice };
}

/**
 * Step 3: 개산공제 (소득세법 §97 ② 2호 + 시행령 §163 ⑥)
 *
 * 취득시 기준시가에 개산공제율을 곱해 필요경비를 산정한다.
 *
 * 토지 산식: INT(취득시 공시지가(원/㎡) × 면적 × 율)
 * 건물 산식: INT(취득시 건물기준시가 총액 × 율)
 *
 * 법정 기본율: 등기 자산 3%, 미등기 0.3%
 */
function calculateEstimatedDeduction(
  input: GeneralBuildingInput,
  rate: number,
): GeneralBuildingEstimatedDeduction {
  const acqLandStdTotal = Math.floor(
    input.acquisitionLandPricePerSqm * input.landArea,
  );

  // 공유지분 축소(§163⑥ base) — 성분별 독립 적용. 토지는 §99①1호 가목(개별공시지가),
  // 건물은 나목(국세청장 산정)으로 **별도 공시**라 결합 총액 개념이 없다.
  const landDed = computeEstimatedDeduction(acqLandStdTotal, rate, input.ownershipRatio);
  const buildingDed = computeEstimatedDeduction(
    input.acquisitionBuildingStdPrice,
    rate,
    input.ownershipRatio,
  );

  return {
    land: landDed,
    building: buildingDed,
    landBase: computeLumpSumDeductionBase(acqLandStdTotal, input.ownershipRatio),
    buildingBase: computeLumpSumDeductionBase(
      input.acquisitionBuildingStdPrice,
      input.ownershipRatio,
    ),
  };
}

// ============================================================
// 공개 메인 함수
// ============================================================

/**
 * 일반건물(토지+건물 일괄) 환산취득가 계산 — 자산 카드 2장 생성
 *
 * 5단 파이프라인:
 *   1. 양도가 안분 (§166⑥ 기준시가 비율)
 *   2. 환산취득가 (§176의2②)
 *   3. 개산공제 (§163⑥ 3%)
 *   4. 비사업용토지 판정 (배율 내 여부)
 *   5. 자산 카드 2장 (토지·건물) 생성 → aggregate 엔진에 위임
 *
 * @param input 일반건물 환산 입력
 * @returns 중간 계산값 + 비사업용 판정 + 자산 카드 2장
 *
 * 법령 근거:
 *   TRANSFER.GENERAL_BUILDING_APPORTIONMENT — §166⑥
 *   TRANSFER.GENERAL_BUILDING_ESTIMATED_ACQ — §176의2②
 *   TRANSFER.GENERAL_BUILDING_LUMP_DEDUCTION — §97②2호 + §163⑥
 *   NBL.BUILDING_SITE — §168의8 (건물 부수토지 배율)
 */
export function buildGeneralBuildingAssetCards(
  rawInput: GeneralBuildingInput,
): GeneralBuildingOutput {
  // ── 사례 35 후속-1: §99-164-10 환산주택가격 분기 ──────────────────
  // hasFirstDisclosure=true 시 acquisition*StdPrice를 환산주택가격 안분값으로 override.
  // 이후 모든 다운스트림 로직(2-way·3-way·NBL 등)은 effective input 사용 → 변경 최소화.
  const input = applyConvertedHousingPriceOverride(rawInput);

  // ── 증축 분기 (사례 33 — extensionInfo 활성 시 3-way 안분) ──────────
  if (input.extensionInfo) {
    return buildGeneralBuildingAssetCardsWithExtension(input, input.extensionInfo);
  }

  // ── 기존 2-way 분기 (사례 31·32 — extensionInfo 미입력 시) ──────────

  // 개산공제율 결정 (기본 3%)
  const rate =
    input.estimatedDeductionRate ?? ESTIMATED_DEDUCTION_RATE_LAND_BUILDING;

  // Step 1: 양도가 안분 (§166⑥)
  // 법령 참조: TRANSFER.GENERAL_BUILDING_APPORTIONMENT
  const allocation = allocateBundledTransferPrice(input);

  // Step 2: 환산취득가 (§176의2②) — 토지 분모만 §164⑨ 공익수용 특례 override(토지 전용, D16-GB).
  // 법령 참조: TRANSFER.GENERAL_BUILDING_ESTIMATED_ACQ
  const { acquisition, expropriationValuationDetail } = calculateConvertedAcquisition(
    input,
    allocation,
  );

  // Step 3: 개산공제 (§163⑥)
  // 법령 참조: TRANSFER.GENERAL_BUILDING_LUMP_DEDUCTION
  const estimatedDeduction = calculateEstimatedDeduction(input, rate);

  /**
   * 비사업용토지 판정 (§104의3·§168의12)
   *
   * 2026-05-09: 사용자 직접 입력 수평투영면적 기준. 균등층 가정 폐지.
   * 2026-05-10: getLandFootprintMultiplier()로 용도지역·수도권 배율 정밀 계산.
   *   초과분 면적(nonBusinessArea)·비율(nonBusinessRatio) 계산 → 토지 카드 분할 중과.
   */

  // 무허가건축물: 배율 무관 토지 전체 비사업용
  // 근거: 지방세법 시행령 §101①단서(무허가건축물 부속토지 재산세 별도합산 제외) + 소득세법 §104의3①4호나목 → 비사업용
  let appliedMultiplier: number;
  let multiplierDetail: string;
  let allowedLandArea: number;
  let isWithinNblRatio: boolean;

  if (input.isUnregistered) {
    appliedMultiplier = 0;
    multiplierDetail = "무허가건축물 — 전체 비사업용";
    allowedLandArea = 0;
    isWithinNblRatio = false;
  } else {
    // 용도지역 미입력 시 엔진 예외 (validate에서 사전 차단해야 함)
    if (!input.zoneType) {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        "일반건물 비사업용토지 판정: zoneType(용도지역)이 입력되지 않았습니다. 계산 전 용도지역을 선택하세요.",
      );
    }
    const { multiplier, detail } = getLandFootprintMultiplier(
      input.zoneType as ZoneType,
      input.isMetropolitan ?? false,
      "general_building",
    );
    appliedMultiplier = multiplier;
    multiplierDetail = detail;
    allowedLandArea = input.buildingFootprintArea * multiplier;
    isWithinNblRatio = input.landArea <= allowedLandArea;
  }

  // 초과분 비율 (§104의3 — 초과분만 중과). 표시용 정밀 비율 (round 미사용 — 분할은 면적 직접).
  const nonBusinessArea = Math.max(0, input.landArea - allowedLandArea);
  const nonBusinessRatio = input.landArea > 0
    ? nonBusinessArea / input.landArea
    : 0;

  // Step 5: 자산 카드 생성 (aggregate 엔진 위임용)
  // 초과분이 있으면 토지를 사업용·비사업용 2장으로 분할 (§104의3 초과분만 중과)
  const assetCards: AssetCardForAggregate[] = [];

  if (!isWithinNblRatio && nonBusinessRatio > 0) {
    // 토지 카드 1: 사업용 (인정면적 직접 안분 — round 의존 제거)
    const landBusinessTransfer = apportionLandByBusinessArea(allocation.land, allowedLandArea, input.landArea);
    const landBusinessAcq = apportionLandByBusinessArea(acquisition.land, allowedLandArea, input.landArea);
    const landBusinessExp = apportionLandByBusinessArea(estimatedDeduction.land, allowedLandArea, input.landArea);
    assetCards.push({
      propertyId: "land_business",
      propertyLabel: "토지-사업용(1001)",
      propertyType: "land",
      transferPrice: landBusinessTransfer,
      acquisitionPrice: landBusinessAcq,
      expenses: landBusinessExp,
      usedEstimatedAcquisition: true,
      estimatedBase: landBusinessAcq,
      estimatedDeduction: landBusinessExp,
      acquisitionDate: input.acquisitionDate,
      transferDate: input.transferDate,
      isNonBusinessLand: false,
      landAcquisitionCause: input.landAcquisitionCause,
      decedentAcquisitionDate: input.decedentAcquisitionDate,
      donorAcquisitionDate: input.donorAcquisitionDate,
      carryoverTaxation: input.landCarryoverTaxation,
    });
    // 토지 카드 2: 비사업용 초과분 (원단위 잔여 흡수)
    assetCards.push({
      propertyId: "land_nbl",
      propertyLabel: "토지-비사업용초과분(1002)",
      propertyType: "land",
      transferPrice: allocation.land - landBusinessTransfer,
      acquisitionPrice: acquisition.land - landBusinessAcq,
      expenses: estimatedDeduction.land - landBusinessExp,
      usedEstimatedAcquisition: true,
      estimatedBase: acquisition.land - landBusinessAcq,
      estimatedDeduction: estimatedDeduction.land - landBusinessExp,
      acquisitionDate: input.acquisitionDate,
      transferDate: input.transferDate,
      isNonBusinessLand: true,
      landAcquisitionCause: input.landAcquisitionCause,
      decedentAcquisitionDate: input.decedentAcquisitionDate,
      donorAcquisitionDate: input.donorAcquisitionDate,
      carryoverTaxation: input.landCarryoverTaxation,
    });
  } else {
    // 전체 사업용 (1장)
    assetCards.push({
      propertyId: "land",
      propertyLabel: "토지(1001)",
      propertyType: "land",
      transferPrice: allocation.land,
      acquisitionPrice: acquisition.land,
      expenses: estimatedDeduction.land,
      usedEstimatedAcquisition: true,
      estimatedBase: acquisition.land,
      estimatedDeduction: estimatedDeduction.land,
      acquisitionDate: input.acquisitionDate,
      transferDate: input.transferDate,
      isNonBusinessLand: false,
      landAcquisitionCause: input.landAcquisitionCause,
      decedentAcquisitionDate: input.decedentAcquisitionDate,
      donorAcquisitionDate: input.donorAcquisitionDate,
      carryoverTaxation: input.landCarryoverTaxation,
    });
  }

  // 건물 카드
  // isSelfBuilt: buildingAcquisitionCause에서 도출 (단일 진실 원천 — 라우트 헬퍼도 동일 로직 적용).
  // input.isSelfBuilt가 명시되어 있더라도 buildingAcquisitionCause 우선 (두 진실 원천 방지).
  const isSelfBuiltForCard = input.buildingAcquisitionCause === "newConstruction";
  // 건물 취득일: buildingAcquisitionDate 우선 (사례 32 — 영 §162①4호 빠른 날),
  //             미입력 시 acquisitionDate fallback (사례 31 호환 — purchase·inheritance·gift 경로).
  // isSelfBuilt=true 경로(newConstruction)는 validate⑧이 buildingAcquisitionDate 미입력을 차단하므로 fallback 발동 불가.
  const buildingAcqDate = input.buildingAcquisitionDate ?? input.acquisitionDate;
  assetCards.push({
    propertyId: "building",
    propertyLabel: "건물(3001)",
    propertyType: "general_building_unit",
    transferPrice: allocation.building,
    acquisitionPrice: acquisition.building,
    expenses: estimatedDeduction.building,
    usedEstimatedAcquisition: true,
    estimatedBase: acquisition.building,
    estimatedDeduction: estimatedDeduction.building,
    acquisitionDate: buildingAcqDate,
    transferDate: input.transferDate,
    isNonBusinessLand: false,
    isSelfBuilt: isSelfBuiltForCard,
    buildingAcquisitionDate: buildingAcqDate,
    buildingAcquisitionCause: input.buildingAcquisitionCause,  // 건물 취득원인 패스스루
    // #6: 건물 inheritance/gift 시 보조 필드 패스.
    // 우선순위: 건물 전용 분리 필드(buildingDecedent/buildingDonor) 우선,
    //          미입력 시 자산-수준 단일 필드(decedent/donor) fallback (#6 호환).
    ...(input.buildingAcquisitionCause === "inheritance"
      ? (() => {
          const buildingDecedent =
            input.buildingDecedentAcquisitionDate ?? input.decedentAcquisitionDate;
          return buildingDecedent ? { decedentAcquisitionDate: buildingDecedent } : {};
        })()
      : {}),
    ...(input.buildingAcquisitionCause === "gift"
      ? (() => {
          const buildingDonor =
            input.buildingDonorAcquisitionDate ?? input.donorAcquisitionDate;
          return buildingDonor ? { donorAcquisitionDate: buildingDonor } : {};
        })()
      : {}),
  });

  // 산식 분모/분자 변수 (UI 자산별 산식 인라인 표시용 — 사례 31 경로)
  const landStdTotalForFormula = Math.floor(
    input.transferLandPricePerSqm * input.landArea,
  );
  const acqLandStdTotalForFormula = Math.floor(
    input.acquisitionLandPricePerSqm * input.landArea,
  );

  // 사례 35: 주택→상가 용도변경 3필드를 모든 자산 카드에 일괄 propagate
  if (input.houseToCommercialConversion) {
    for (const c of assetCards) {
      c.houseToCommercialConversion = input.houseToCommercialConversion;
      c.conversionDate = input.conversionDate;
      c.wasMultiHouseAtConversion = input.wasMultiHouseAtConversion;
    }
  }

  return {
    allocation,
    acquisition,
    estimatedDeduction,
    buildingFootprintArea: input.buildingFootprintArea,
    appliedMultiplier,
    multiplierDetail,
    allowedLandArea,
    isWithinNblRatio,
    nonBusinessArea,
    nonBusinessRatio,
    assetCards,
    // ── 산식 변수 (사례 31 — 2-way 안분, extensionStdTotal·acqExtensionStdTotal 미사용)
    landStdTotal: landStdTotalForFormula,
    buildingStdTotal: input.transferBuildingStdPrice,
    acqLandStdTotal: acqLandStdTotalForFormula,
    acqBuilding1StdTotal: input.acquisitionBuildingStdPrice,
    // §164⑨ 1호 공익수용 특례 산출근거 (토지 전용 — 게이트 미충족 시 undefined)
    expropriationValuationDetail,
  };
}


// ============================================================
// 내부 계산값 노출 (단위 테스트 직접 접근용)
// ============================================================

/**
 * 토지 양도차익 계산 (단위 테스트용)
 * transferGain = 양도가 − 환산취득가 − 개산공제
 */
export function calcLandGain(output: GeneralBuildingOutput): number {
  return (
    output.allocation.land -
    output.acquisition.land -
    output.estimatedDeduction.land
  );
}

/**
 * 건물 양도차익 계산 (단위 테스트용)
 * transferGain = 양도가 − 환산취득가 − 개산공제 (차손 가능)
 */
export function calcBuildingGain(output: GeneralBuildingOutput): number {
  return (
    output.allocation.building -
    output.acquisition.building -
    output.estimatedDeduction.building
  );
}

// ── 법령 참조 재수출 (import 편의) ──
export { TRANSFER };
