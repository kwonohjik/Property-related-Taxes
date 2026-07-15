import type { ZoneType } from "../non-business-land/types";
import type { PreHousingDisclosureInput, PreHousingDisclosureResult } from "./transfer.types";
import type { AmendmentDetail } from "./transfer-amendment.types";

/**
 * 겸용주택(1세대 1주택 + 상가) 양도소득세 분리계산 타입
 *
 * 소득세법 시행령 §160 ① 단서 — 2022.1.1 이후 양도분부터 주택연면적 ≥ 상가연면적이라도 강제 분리.
 * 설계 문서: docs/02-design/features/transfer-tax-mixed-use-house.engine.design.md
 */

// ──────────────────────────────────────────
// 입력 타입
// ──────────────────────────────────────────

/**
 * 양도시 또는 취득시 기준시가 (주택부분 + 상가부분 구분)
 *
 * - 주택부분 = 개별주택공시가격 (주택건물 + 주택부수토지 일괄 단일값)
 * - 상가부분 = (개별공시지가 × 상가부수토지 면적) + 상가건물 기준시가
 */
export interface MixedUseStandardPrice {
  /** 개별주택공시가격 — 주택건물+주택부수토지 일괄 */
  housingPrice: number;
  /** 상가건물 기준시가 — 토지 제외, 국세청 고시 */
  commercialBuildingPrice: number;
  /** 개별공시지가 (원/㎡) — 상가부수토지 산정용 */
  landPricePerSqm: number;
}

/**
 * 겸용주택 자산-수준 입력.
 * AssetForm.assetType === "mixed-use-house" 일 때 활성화.
 */
export interface MixedUseAssetInput {
  /** 겸용주택 분리계산 플래그 */
  isMixedUseHouse: true;

  // ── 면적 (㎡, 건축물대장) ──
  /** 주택 연면적 (4·5층 단독주택 등 거주용 합계) */
  residentialFloorArea: number;
  /** 비주택(상가·사무·근린·주차장) 연면적 합계 */
  nonResidentialFloorArea: number;
  /** 건물 정착면적 = 1층 면적. 부수토지 배율 초과 판정 기준 */
  buildingFootprintArea: number;
  /** 전체 토지 면적 */
  totalLandArea: number;
  /**
   * [신규] 주택 부수토지 면적 수동 지정 (㎡) — PHD OFF(일반 §97) 전용.
   * ⚠️ 취득·양도 양시점 공통 필지 면적(용도변경 없으면 acqDerived=derived). 시점 무관.
   * 미제공(undefined) 시 `totalLandArea × 주택연면적비율`로 자동 산출. 0은 적법(three-state).
   * PHD ON 경로는 preHousingDisclosure.landArea가 담당하므로 배타 —
   * API 변환에서 usePreHousingDisclosure=false일 때만 주입.
   */
  residentialLandAreaOverride?: number;

  /**
   * [신규] 상가 부수토지 면적 수동 지정 (㎡) — PHD OFF(일반 §97) 전용.
   * ⚠️ 취득·양도 양시점 공통 필지 면적. `residentialLandAreaOverride`와 동일 축.
   * 미제공(undefined) 시 `residualArea(totalLandArea, 주택부수토지)` 잔액. 0은 적법(three-state).
   * 주택·상가 **둘 다 제공** 시 각 값을 그대로 사용(잔액 미적용) → 합계 불일치 가능 → validate가 차단.
   */
  commercialLandAreaOverride?: number;

  /**
   * [신규] 주택 정착면적 수동 지정 (㎡) — §168의12 배율초과 NBL 판정에 사용.
   * 미제공(undefined) 시 `buildingFootprintArea × 주택연면적비율`. 0은 적법(three-state).
   * 상가 정착면적은 항상 잔액이며 별도 필드가 없다(엔진 소비처 0건 — UI 표시 전용).
   */
  residentialFootprintOverride?: number;

  // ── 분리 취득일 ──
  /** 토지 취득일. 사례14 = 1992-01-01 */
  landAcquisitionDate: Date;
  /** 건물 취득일·신축일. 사례14 = 1997-09-12 */
  buildingAcquisitionDate: Date;

  /** 양도시 기준시가 */
  transferStandardPrice: MixedUseStandardPrice;
  /** 취득시 기준시가. housingPrice 미제공 시 PHD 환산 경로로 분기 */
  acquisitionStandardPrice: Omit<MixedUseStandardPrice, "housingPrice"> & {
    housingPrice?: number;
  };

  /** PHD 3-시점 자동 환산 옵션 (1992~2005 개별주택가격 미공시 케이스) */
  usePreHousingDisclosure?: boolean;
  /**
   * PHD 3-시점 환산 입력 — usePreHousingDisclosure=true 시 필수.
   * landArea: 미제공 시 엔진이 양도시 주택부수토지 면적으로 자동 주입.
   * 최초 공시 당시 전체가 주택이었던 경우 등 사용자가 직접 지정 가능.
   */
  preHousingDisclosure?: Omit<PreHousingDisclosureInput, "landArea"> & { landArea?: number };
  /** 거주 연수 — 2년 이상이면 표2(보유 40%+거주 40%), 미만이면 표1(최대 30%) */
  residencePeriodYears: number;

  /** 수도권 여부 — 배율 판정용 (미제공 시 true로 보수 처리) */
  isMetropolitanArea?: boolean;
  /** 도시지역 용도지역 — 배율 판정용 (non-business-land ZoneType과 동일) */
  zoneType?: ZoneType;

  /**
   * 1세대 1주택 비과세 요건 충족 여부.
   * - true: 주택분 양도가액 12억 이하 비과세, 거주 2년+ 시 표2 거주공제 (최대 80%)
   * - false: 다주택자·2년 미거주 등으로 1세대 1주택 비과세 미적용 → 12억 안분 X, 표1 적용
   *
   * AssetForm.isOneHousehold(L235) 값을 그대로 전달.
   * 미주입 시 true (기존 겸용주택 사례14 등 backward compat).
   */
  isOneHouseExempt?: boolean;

  /**
   * 보유 중 일부 용도변경 옵션 — 양도시 겸용이지만 취득시 단일 용도였던 경우.
   *
   * - house_to_commercial: 취득시 전체 주택 → 양도시 일부 상가화 (PDF 갑氏)
   * - commercial_to_house: 취득시 전체 상가 → 양도시 일부 주택화 (미러)
   *
   * 시행령 §166⑥ + 집행기준 99-164-10 (재산-1384, 2009.7.8.)
   */
  partialUsageChange?: {
    direction: "house_to_commercial" | "commercial_to_house";
    /** 취득시 주택연면적 — 미주입 시 양도시 합계로 자동 도출 */
    acqResidentialArea?: number;
    /** 취득시 상가연면적 — 미주입 시 양도시 합계로 자동 도출 */
    acqCommercialArea?: number;
    /**
     * 용도변경일 — 입력 시 시간 비례 분할로 LTHD를 정확 계산.
     * 집행기준 89-154-24 (주택 사용 기간 통산) 취지를 반영.
     * 미입력·취득일/양도일 경계 밖이면 fallback (전체 보유기간 LTHD).
     */
    usageChangeDate?: Date;
  };
}

// ──────────────────────────────────────────
// 파생값 (엔진 자동 산출)
// ──────────────────────────────────────────

/** 면적 비율로 자동 산출되는 파생값 */
export interface MixedUseDerivedAreas {
  /** 주택연면적 비율 = residential / (residential + nonResidential) */
  residentialRatio: number;
  /** 주택부수토지 면적 = totalLandArea × residentialRatio */
  residentialLandArea: number;
  /** 상가부수토지 면적 = totalLandArea × (1 − residentialRatio) */
  commercialLandArea: number;
  /** 주택 정착면적 = buildingFootprintArea × residentialRatio */
  residentialFootprintArea: number;
}

// ──────────────────────────────────────────
// 출력 타입
// ──────────────────────────────────────────

/** 양도가액 안분 결과 */
export interface MixedUseApportionment {
  /** 주택부분 기준시가 = 개별주택공시가격 */
  housingStandardPrice: number;
  /** 상가부분 기준시가 = (공시지가 × 상가부수토지 면적) + 상가건물 기준시가 */
  commercialStandardPrice: number;
  /** 주택비율 = housingStandardPrice / 합계 */
  housingRatio: number;
  /** 주택 양도가액 */
  housingTransferPrice: number;
  /** 상가 양도가액 */
  commercialTransferPrice: number;
}

/** 주택부분 계산 결과 */
export interface MixedUseHousingPart {
  /** 주택부분 환산취득가액 (§97 또는 §164⑤ PHD) */
  estimatedAcquisitionPrice: number;
  /** PHD로 역산된 취득시 개별주택가격 (PHD 모드 한정) */
  phdEstimatedAcqHousingPrice?: number;
  /** PHD 3-시점 산식 상세 (UI 표시용) */
  phdResult?: PreHousingDisclosureResult;
  /** 주택부분 양도차익 합계 */
  transferGain: number;
  /** 토지분 양도차익 */
  landTransferGain: number;
  /** 건물분 양도차익 */
  buildingTransferGain: number;
  /** 토지분 양도가액 (안분) — 산식 표시용 */
  landTransferPrice: number;
  /** 토지분 환산취득가액 (안분) — 산식 표시용 */
  landAcqPrice: number;
  /** 토지분 개산공제 (취득시 토지분 기준시가 × 3%, §163⑥) — 산식 표시용 */
  landAppraisalDed: number;
  /** 취득시 토지분 기준시가 — 개산공제 산식 표시용 */
  landStdPriceAtAcq?: number;
  /** 건물분 양도가액 (안분) — 산식 표시용 */
  buildingTransferPrice: number;
  /** 건물분 환산취득가액 (안분) — 산식 표시용 */
  buildingAcqPrice: number;
  /** 건물분 개산공제 (취득시 건물분 기준시가 × 3%, §163⑥) — 산식 표시용 */
  buildingAppraisalDed: number;
  /** 취득시 건물분 기준시가 — 개산공제 산식 표시용 */
  buildingStdPriceAtAcq?: number;
  /** 12억 이하 → 전액 비과세 */
  isExempt: boolean;
  /** 12억 초과 안분 후 과세대상 양도차익 */
  proratedTaxableGain: number;
  /** 장기보유공제 표 (1 또는 2) */
  longTermDeductionTable: 1 | 2;
  /** 장기보유공제율 */
  longTermDeductionRate: number;
  /** 장기보유공제액 */
  longTermDeductionAmount: number;
  /** 양도소득금액 */
  incomeAmount: number;
  /** 주택 토지분 양도차익 중 비사업용으로 이전된 비율 */
  nonBusinessTransferRatio: number;
  /** 비사업용으로 이전된 양도차익 */
  nonBusinessTransferredGain: number;
}

/** 상가부분 계산 결과 */
export interface MixedUseCommercialPart {
  /** 상가부분 환산취득가액 */
  estimatedAcquisitionPrice: number;
  /** 상가부분 양도차익 합계 */
  transferGain: number;
  /** 토지분 양도차익 */
  landTransferGain: number;
  /** 건물분 양도차익 */
  buildingTransferGain: number;
  /** 토지분 양도가액 (안분) — 산식 표시용 */
  landTransferPrice: number;
  /** 토지분 환산취득가액 (안분) — 산식 표시용 */
  landAcqPrice: number;
  /** 토지분 개산공제 — 산식 표시용 */
  landAppraisalDed: number;
  /** 취득시 토지분 기준시가 — 개산공제 산식 표시용 */
  landStdPriceAtAcq?: number;
  /** 건물분 양도가액 (안분) — 산식 표시용 */
  buildingTransferPrice: number;
  /** 건물분 환산취득가액 (안분) — 산식 표시용 */
  buildingAcqPrice: number;
  /** 건물분 개산공제 — 산식 표시용 */
  buildingAppraisalDed: number;
  /** 취득시 건물분 기준시가 — 개산공제 산식 표시용 */
  buildingStdPriceAtAcq?: number;
  /** 장기보유공제율 (표1, 최대 30%) */
  longTermDeductionRate: number;
  /** 장기보유공제액 */
  longTermDeductionAmount: number;
  /** 양도소득금액 */
  incomeAmount: number;
  /**
   * 취득시 상가부분 기준시가 산출 근거 — 결과 카드 산식 분기 표시용.
   *
   * - "user_input": 사용자가 취득시 상가건물 기준시가 + 개별공시지가를 직접 입력
   *                 (일반 겸용주택, commercial_to_house, house_to_commercial 모든 경로 동일)
   *
   * 참고: 과거에 존재하던 "fallback_apportion"(개별주택공시가격 면적비율 자동 안분) 분기는
   * 세법상 부정확하여 2026-05-01 제거됨. 모든 경로에서 직접 입력만 허용.
   */
  acqStandardSource: "user_input";
  /** 취득시 상가부분 기준시가 합계 (acqLandStd + acqBuildingStd) — 산식 표시용 */
  acqStandardTotal: number;
  /** 취득시 상가부수토지 기준시가 — 산식 표시용 */
  acqStandardLand: number;
  /** 취득시 상가건물 기준시가 — 산식 표시용 */
  acqStandardBuilding: number;
}

/** 비사업용토지 부분 계산 결과 (배율초과 면적이 있을 때만 생성) */
export interface MixedUseNonBusinessLandPart {
  /** 초과 면적 (㎡) */
  excessArea: number;
  /** 적용 배율 */
  appliedMultiplier: 3 | 5 | 10;
  /** 비사업용 양도차익 (주택 토지분에서 이전) */
  transferGain: number;
  /** 장기보유공제율 (표1) */
  longTermDeductionRate: number;
  /** 장기보유공제액 */
  longTermDeductionAmount: number;
  /** 양도소득금액 */
  incomeAmount: number;
  /** 비사업용토지 +10%p 가산율 (고정) */
  additionalRate: 0.10;
}

/** 합산 세액 */
export interface MixedUseTotalTax {
  /** 합산 양도소득금액 */
  aggregateIncome: number;
  /** 기본공제 250만원 */
  basicDeduction: number;
  /** 과세표준 */
  taxBase: number;
  /** 기본세율 산출세액 */
  taxByBasicRate: number;
  /** 산출세액에 적용된 누진세율 (소수, 예: 0.40) */
  appliedRate: number;
  /** 산출세액에 적용된 누진공제액 */
  progressiveDeduction: number;
  /** 비사업용토지 +10%p 가산세 */
  nonBusinessSurcharge: number;
  /** 양도소득세 */
  transferTax: number;
  /** 지방소득세 (10%) */
  localTax: number;
  /** 총 납부세액 */
  totalPayable: number;
}

/** 결과 카드용 단계별 표시 항목 */
export interface MixedUseStep {
  id: string;
  title: string;
  legalBasis: string;
  values: Array<{ label: string; value: number | string; isResult?: boolean }>;
}

/**
 * 계산 경로 메타 — 학습·검증용. 결과 카드 하단에 노출하여
 * "세액은 맞는데 왜 맞는지"를 설명할 수 있도록 함.
 */
export interface MixedUseCalculationRoute {
  /** 취득시 주택 기준시가 산정 방식 */
  housingAcqPriceSource: "direct_input" | "phd_auto" | "missing";
  /** 환산취득가액 산정 경로 */
  acquisitionConversionRoute: "section97_direct" | "phd_corrected";
  /** 주택 장기보유공제 표 분기 사유 */
  housingDeductionTableReason: string;
  /** 부수토지 배율 적용 근거 (지역 + 배율값) */
  landMultiplierReason: string;
  /**
   * 12억 비과세 적용 결과
   * - below_threshold_exempt: 1세대1주택자 + 12억 이하 → 비과세
   * - above_threshold_prorated: 1세대1주택자 + 12억 초과 → 안분 과세
   * - non_one_house_full_taxation: 다주택자 등 1세대1주택 미적용 → 전액 과세
   */
  highValueRule: "below_threshold_exempt" | "above_threshold_prorated" | "non_one_house_full_taxation";
  /** 보유 중 일부 용도변경 분기 사유 (사전 정의 템플릿) */
  partialUsageChangeReason?: string;
}

/** 겸용주택 분리계산 최종 결과 */
export interface MixedUseGainBreakdown {
  /**
   * - "post-2022": 2022.1.1 이후 양도분, 강제 분리계산 완료
   * - "pre-2022-rejected": 2022.1.1 이전 양도분, 처리 불가
   */
  splitMode: "post-2022" | "pre-2022-rejected";

  /** 양도가액 안분 결과 */
  apportionment: MixedUseApportionment;
  /** 주택부분 결과 */
  housingPart: MixedUseHousingPart;
  /** 상가부분 결과 */
  commercialPart: MixedUseCommercialPart;
  /** 비사업용토지 부분 결과 (배율초과 없으면 null) */
  nonBusinessLandPart: MixedUseNonBusinessLandPart | null;
  /** 합산 세액 */
  total: MixedUseTotalTax;
  /** 결과 카드용 단계별 값 */
  steps: MixedUseStep[];
  /** 계산 경로 메타 — 학습·검증용 결과 카드 하단 노출 */
  calculationRoute: MixedUseCalculationRoute;
  /** 경고 메시지 (PHD 적합성, 22.1.1 이전 양도일 등) */
  warnings: string[];
  /**
   * 보유 중 일부 용도변경 메타 — 결과 카드 "취득시점 자산 구성" 섹션 표시용.
   * partialUsageChange 토글 OFF 시 undefined.
   */
  partialUsageChange?: {
    direction: "house_to_commercial" | "commercial_to_house";
    /** 취득시 주택연면적 (자동 또는 사용자 수정값) */
    acqResidentialArea: number;
    /** 취득시 상가연면적 */
    acqCommercialArea: number;
    /** 사용자가 면적을 수정했는지 여부 */
    isAreaCustomized: boolean;
    /**
     * PHD §164⑤ 환산 분기 (PHD ON + partialUsageChange ON 조합에서만 산출).
     *
     * - "case_a_whole_building": firstDisclosureDate < usageChangeDate.
     *   최초공시 시점에 건물 전체가 주택이었으므로 P_F 가 "전체 건물(미래 상가 부분 포함)"의
     *   가격을 의미. Sum_A·Sum_F 분모/분자에 전체 토지면적·전체 건물 기준시가 사용.
     * - "case_b_housing_only": firstDisclosureDate ≥ usageChangeDate.
     *   최초공시 시점에 이미 겸용 상태. P_F 가 주택분만의 가격이므로 Sum_A·Sum_F 도 주택분만.
     * - undefined: PHD 미사용 또는 일반 겸용주택 (분기 의미 없음).
     */
    phdScopeBranch?: "case_a_whole_building" | "case_b_housing_only";
  };

  /**
   * 용도변경일 기반 LTHD 시간 비례 분할 결과 (Part A).
   * usageChangeDate 입력 + 유효 시에만 생성. 미입력 시 undefined.
   * 집행기준 89-154-24 취지 반영.
   */
  usagePeriodSplit?: {
    /** Period 1 = 취득일 ~ 용도변경일 (단일 용도 기간), 일 단위 */
    period1Days: number;
    /** Period 2 = 용도변경일 ~ 양도일 (혼용 기간), 일 단위 */
    period2Days: number;
    /** Period 1 양도차익 — 100% 단일 용도 */
    period1Gain: number;
    /** Period 2 양도차익 — 양도시점 기준시가 비율로 안분 */
    period2HousingGain: number;
    period2CommercialGain: number;
    /** Period별 LTHD 공제율·공제액 */
    period1LongTermDeductionRate: number;
    period1LongTermDeductionAmount: number;
    period2HousingLongTermDeductionRate: number;
    period2HousingLongTermDeductionAmount: number;
    period2CommercialLongTermDeductionRate: number;
    period2CommercialLongTermDeductionAmount: number;
  };

  /**
   * 수정신고·경정청구 상세 (국세기본법 §45·§45의2).
   *
   * 기준값 = `total.transferTax`(본세 — 지방소득세 제외). 단건 finalize의 determinedTax와 동일 축.
   * `amendment` 미전달 시 undefined — 캐시된 구 결과(IndexedDB)도 안전 통과.
   * `splitMode === "pre-2022-rejected"`이면 amendment 전달 여부와 무관하게 항상 undefined
   * (계산 불가 상태에 부착하면 refundTax = 당초 전액 오표시).
   */
  amendmentDetail?: AmendmentDetail;
}
