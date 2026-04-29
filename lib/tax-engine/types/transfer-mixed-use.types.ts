import type { ZoneType } from "../non-business-land/types";
import type { PreHousingDisclosureInput, PreHousingDisclosureResult } from "./transfer.types";

/**
 * 검용주택(1세대 1주택 + 상가) 양도소득세 분리계산 타입
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
 * 검용주택 자산-수준 입력.
 * AssetForm.assetType === "mixed-use-house" 일 때 활성화.
 */
export interface MixedUseAssetInput {
  /** 검용주택 분리계산 플래그 */
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
   * landArea는 엔진이 주택부수토지로 자동 주입하므로 불필요(받아도 무시).
   */
  preHousingDisclosure?: Omit<PreHousingDisclosureInput, "landArea">;
  /** 거주 연수 — 2년 이상이면 표2(보유 40%+거주 40%), 미만이면 표1(최대 30%) */
  residencePeriodYears: number;

  /** 수도권 여부 — 배율 판정용 (미제공 시 true로 보수 처리) */
  isMetropolitanArea?: boolean;
  /** 도시지역 용도지역 — 배율 판정용 (non-business-land ZoneType과 동일) */
  zoneType?: ZoneType;
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
  /** 건물분 양도가액 (안분) — 산식 표시용 */
  buildingTransferPrice: number;
  /** 건물분 환산취득가액 (안분) — 산식 표시용 */
  buildingAcqPrice: number;
  /** 건물분 개산공제 (취득시 건물분 기준시가 × 3%, §163⑥) — 산식 표시용 */
  buildingAppraisalDed: number;
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
  /** 건물분 양도가액 (안분) — 산식 표시용 */
  buildingTransferPrice: number;
  /** 건물분 환산취득가액 (안분) — 산식 표시용 */
  buildingAcqPrice: number;
  /** 건물분 개산공제 — 산식 표시용 */
  buildingAppraisalDed: number;
  /** 장기보유공제율 (표1, 최대 30%) */
  longTermDeductionRate: number;
  /** 장기보유공제액 */
  longTermDeductionAmount: number;
  /** 양도소득금액 */
  incomeAmount: number;
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
  /** 12억 비과세 적용 결과 */
  highValueRule: "below_threshold_exempt" | "above_threshold_prorated";
}

/** 검용주택 분리계산 최종 결과 */
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
}
