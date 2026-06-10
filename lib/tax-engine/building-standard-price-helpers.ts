/**
 * 건물 기준시가 계산기 — 엔진 헬퍼 (Pure Engine)
 *
 * 출처: 국세청 「건물 기준시가 계산방법」 고시(첨부 PDF). 설계: docs/02-design/features/building-standard-price.engine.design.md
 *
 * 시점별 ㎡당 금액·기계식주차 특수산식·조정율(상증)·산정기준율(2000이전 취득)·§164⑧ 동일연도 환산.
 * 정수곱 후 /1,000,000, 잔가율·조정율 곱, 1,000원 절사(truncateToThousand), 면적 곱 후 원 절사 순서.
 */
import { safeMultiply, truncateToThousand } from "./tax-utils";
import type {
  BuildingPointInput,
  BuildingStdPriceBreakdown,
  SpecialAdjustmentFeatures,
} from "./types/building-standard-price.types";
import {
  resolveNewBuildingBasePrice,
  resolveStructureIndex,
  resolveUsageIndex,
  resolveLocationIndex,
  calcResidualRate,
  durableYearsToResidualGroup,
  resolveResidualGroup,
  RESIDUAL_RATE_STEP,
  resolveAcqBaseGroup,
  resolveAcqBaseRate,
  resolveMechParkingFormula,
  ADJUSTMENT_RATE_BASE,
  ROOF_MATERIAL_RATE,
  INTELLIGENT_BUILDING_RATE,
  HOUSE_TYPE_RATE,
  COMMERCIAL_FLOOR_RATE,
  ANCILLARY_RATE,
  COMMERCIAL_WITH_ANCILLARY_RATE,
  REMODEL_COUNT_RATE,
  STRUCTURAL_SAFETY_RATE,
  resolveMaxFloorsRate,
  resolveGrossAreaRate,
  resolveWallessRate,
} from "./data/building-standard-price";

/** 엔진 내부 오류(검증 실패) — orchestrator가 warnings로 변환하거나 throw */
export class BuildingStdPriceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildingStdPriceError";
  }
}

/** 주거 판정(조정율 II) 컨텍스트 */
export interface AdjustmentContext {
  isResidential: boolean;
  isApartment: boolean;
}

/** 리모델링(대수선) 정보 — 상증만 잔가율 할증 */
export interface RemodelInfo {
  remodelYear?: number;
  isInheritanceGift?: boolean;
}

/**
 * 유효 잔가율. 일반 = 신축연도 경과 잔가율.
 * 상증 리모델링(대수선) 시 = 신축연도 잔가율 + 대수선할증률(고시).
 *   대수선할증률 = 연상각률(= 잔가율 step = (1−0.1)/내용연수) × 대수선시점 경과연수(리모델링−신축) × 0.3.
 *   ⚠️ 리모델링연도를 신축연도로 치환하지 않음(국세청 계산사례 p.67 — 신축 잔가율에 할증을 가산).
 *   양도세는 미적용(신축연도 잔가율).
 */
export function calcEffectiveResidualRate(
  group: "I" | "II" | "III" | "IV",
  builtYear: number,
  valuationYear: number,
  remodel?: RemodelInfo,
): number {
  const baseResid = calcResidualRate(group, valuationYear - builtYear);
  if (!remodel?.isInheritanceGift || remodel.remodelYear === undefined) return baseResid;
  const elapsedToRemodel = Math.max(0, remodel.remodelYear - builtYear);
  const surcharge = RESIDUAL_RATE_STEP[group] * elapsedToRemodel * 0.3;
  return Math.round((baseResid + surcharge) * 10000) / 10000;
}

/**
 * §A 공통 ㎡당 금액 + 건물 기준시가 (1시점, 일반 건물).
 * raw = basePrice × (structIdx/100) × (usageIdx/100) × (locIdx/100) × residual × adjRate
 * pricePerM2 = 1,000원 절사 → standardPrice = floor(pricePerM2 × floorArea)
 */
export function calcPointBreakdown(
  year: number,
  point: BuildingPointInput,
  floorArea: number,
  builtYear: number,
  adjustmentRate: number, // 1.0 = 미적용(양도). 상증은 calcSpecialAdjustmentRate 결과
  labelForError: string,
  remodel?: RemodelInfo, // 상증 리모델링 잔가율 할증
): BuildingStdPriceBreakdown {
  const basePrice = resolveNewBuildingBasePrice(year);
  if (basePrice === undefined) {
    throw new BuildingStdPriceError(`${labelForError}: 신축가격기준액 미수록 연도 ${year}`);
  }
  const structureIndex = resolveStructureIndex(year, point.structureKey);
  if (structureIndex === undefined) {
    throw new BuildingStdPriceError(
      `${labelForError}: ${year}년 구조지수표에 구조키 '${point.structureKey}' 없음`,
    );
  }
  const usageIndex = resolveUsageIndex(year, point.usageNo);
  if (usageIndex === undefined) {
    throw new BuildingStdPriceError(
      `${labelForError}: ${year}년 용도지수표에 용도번호 #${point.usageNo} 없음`,
    );
  }
  const locationIndex = resolveLocationIndex(year, point.landPricePerM2);
  if (locationIndex === undefined) {
    throw new BuildingStdPriceError(
      `${labelForError}: ${year}년 위치지수표 미수록(공시지가 ${point.landPricePerM2}원/㎡)`,
    );
  }

  const residualGroup = resolveResidualGroup(point.structureKey);
  const residualRate = calcEffectiveResidualRate(residualGroup, builtYear, year, remodel);

  // 정수곱(부동소수 누적 회피) 후 /1,000,000 — 지수 3개가 각 ÷100
  const indexProduct = safeMultiply(
    safeMultiply(safeMultiply(basePrice, structureIndex), usageIndex),
    locationIndex,
  );
  const perM2Base = indexProduct / 1_000_000;
  const raw = perM2Base * residualRate * adjustmentRate;
  const pricePerM2 = truncateToThousand(raw);
  const standardPrice = Math.floor(pricePerM2 * floorArea);

  return {
    standardPrice,
    pricePerM2,
    basePrice,
    structureIndex,
    usageIndex,
    locationIndex,
    residualRate,
    adjustmentRate: adjustmentRate === 1 ? undefined : adjustmentRate,
    appliedLandPriceYear: year,
  };
}

/**
 * §A' 기계식주차전용빌딩 특수산식. standardPrice = floor(단가 × 잔가율(내용연수그룹) × 주차대수).
 * 구조·용도·위치지수·연면적·조정율 미적용. 단가·내용연수는 연도 가변(D9).
 */
export function calcMechBreakdown(
  year: number,
  parkingLotCount: number,
  effBuiltYear: number,
): BuildingStdPriceBreakdown {
  const formula = resolveMechParkingFormula(year);
  if (formula === undefined) {
    throw new BuildingStdPriceError(`기계식주차: ${year}년 특수산식(단가·내용연수) 미수록`);
  }
  const group = durableYearsToResidualGroup(formula.durableYears);
  const residualRate = calcResidualRate(group, year - effBuiltYear);
  const standardPrice = Math.floor(safeMultiply(formula.unitPrice, parkingLotCount) * residualRate);

  return {
    standardPrice,
    basePrice: formula.unitPrice,
    residualRate,
    parkingLotCount,
    mechDurableYears: formula.durableYears,
  };
}

/**
 * §B 산정기준율 경로 (취득연도 ≤ 2000, 소령 §164⑤ + 고시 §8, D6).
 * pricePerM2(2001년 지수표) × floorArea × 산정기준율. 산정기준율 그룹·신축/취득연도 정규화는 resolveAcqBaseRate 내부.
 */
export function calcAcqBaseBreakdown(
  acqYear: number,
  acq: BuildingPointInput,
  floorArea: number,
  builtYear: number,
): BuildingStdPriceBreakdown {
  // 취득당시 기준시가 = 2001년 지수표 ㎡당 금액(조정율 미적용)
  const base2001 = calcPointBreakdown(2001, acq, floorArea, builtYear, 1.0, "취득(2000이전)");

  const acqGroup = resolveAcqBaseGroup(acq.structureKey);
  if (acqGroup === undefined) {
    throw new BuildingStdPriceError(
      `취득(2000이전): 구조 '${acq.structureKey}'는 산정기준율표 미수록(신공법)`,
    );
  }
  const acqBaseRate = resolveAcqBaseRate(acqGroup, builtYear, acqYear);
  if (acqBaseRate === undefined) {
    throw new BuildingStdPriceError(
      `취득(2000이전): 산정기준율 미수록(그룹 ${acqGroup}·신축 ${builtYear}·취득 ${acqYear})`,
    );
  }
  // 산정기준율은 취득당시 기준시가에 적용 — pricePerM2(2001) × floorArea × acqBaseRate
  const pricePerM2 = base2001.pricePerM2 ?? 0;
  const standardPrice = Math.floor(pricePerM2 * floorArea * acqBaseRate);

  return {
    ...base2001,
    standardPrice,
    acqBaseRate,
    appliedLandPriceYear: 2001,
  };
}

/**
 * §164⑧ 동일연도 취득·양도 환산 (제1·제2산식, p.302).
 * 양도기준시가 = acqStd + delta × min(보유월수/조정월수, 1).
 *   제1산식 delta = acqStd − prevStd  (취득 − 취득전기)
 *   제2산식 delta = newStd − acqStd    (신규고시 − 취득)
 * ⚠️ 두 산식의 delta 부호가 반대(설계 p.302) — orchestrator에서 산식별로 delta를 구성해 전달.
 */
export function calcSameYearTransferStdPrice(
  acqStd: number,
  delta: number,
  holdingMonths: number,
  adjustMonths: number,
): number {
  const ratio = Math.min(holdingMonths / adjustMonths, 1);
  return Math.floor(acqStd + delta * ratio);
}

/**
 * 조정율 (상증 전용, 7구분). 미해당 구분 = 100(무영향). 중복 구분은 누적 곱(적용요령 2).
 * 부동소수 누적 회피: 적용 지수(정수)를 분자에 곱하고 분모 100^k로 마지막에 환산.
 * @returns 1.0 기준 배율(미적용 = 1.0)
 */
export function calcSpecialAdjustmentRate(
  features: SpecialAdjustmentFeatures,
  structureIndex: number,
  floorArea: number,
  ctx: AdjustmentContext,
): number {
  const appliedRates: number[] = []; // 각 구분 적용 지수(정수, 100 기준)

  // I 지붕재료: 구조지수 < 100 일 때만
  if (structureIndex < 100 && features.roofMaterial !== undefined) {
    appliedRates.push(ROOF_MATERIAL_RATE[features.roofMaterial]);
  }

  // II 최고층수/연면적/지능형: 해당 항목 중 가장 높은 지수 1개
  const groupII: number[] = [];
  // 최고층수: 주거용은 아파트만 적용(isResidential && !isApartment → 미적용)
  if (features.maxFloors !== undefined && (!ctx.isResidential || ctx.isApartment)) {
    groupII.push(resolveMaxFloorsRate(features.maxFloors));
  }
  // 연면적: 주거용 미적용
  if (!ctx.isResidential && floorArea > 0) {
    groupII.push(resolveGrossAreaRate(floorArea));
  }
  if (features.intelligentBuildingGrade !== undefined) {
    groupII.push(INTELLIGENT_BUILDING_RATE[features.intelligentBuildingGrade]);
  }
  if (groupII.length > 0) appliedRates.push(Math.max(...groupII));

  // III 단독/공동주택: 해당 지수 1개
  if (features.houseTypeTier !== undefined) {
    appliedRates.push(HOUSE_TYPE_RATE[features.houseTypeTier]);
  }

  // IV 상가·부속: 가장 낮은 지수 1개. 20~23 + 24·25 동시 해당이면 60
  const hasCommercialFloor = features.commercialFloor !== undefined;
  const hasAncillary = features.ancillaryParking !== undefined;
  if (hasCommercialFloor && hasAncillary) {
    appliedRates.push(COMMERCIAL_WITH_ANCILLARY_RATE);
  } else {
    const groupIV: number[] = [];
    if (features.commercialFloor !== undefined) groupIV.push(COMMERCIAL_FLOOR_RATE[features.commercialFloor]);
    if (features.ancillaryParking !== undefined) groupIV.push(ANCILLARY_RATE[features.ancillaryParking]);
    if (groupIV.length > 0) appliedRates.push(Math.min(...groupIV));
  }

  // V 개축(일부): 해당 지수 1개
  if (features.remodelCount !== undefined) {
    appliedRates.push(REMODEL_COUNT_RATE[features.remodelCount]);
  }

  // VI 무벽건물: 무벽면적비율 구간 판정(미적용 시 100)
  if (features.wallessRatio !== undefined) {
    const r = resolveWallessRate(features.wallessRatio);
    if (r !== ADJUSTMENT_RATE_BASE) appliedRates.push(r);
  }

  // VII 구조진단/철거: 가장 낮은 지수 1개. 37=정상사용면적비율(0~1 → ×100%)
  const groupVII: number[] = [];
  if (features.structuralSafety !== undefined) groupVII.push(STRUCTURAL_SAFETY_RATE[features.structuralSafety]);
  if (features.normalUseRatio !== undefined) groupVII.push(Math.round(features.normalUseRatio * 100));
  if (groupVII.length > 0) appliedRates.push(Math.min(...groupVII));

  if (appliedRates.length === 0) return 1.0;
  // 분자=정수 지수곱, 분모=100^k (부동소수 누적 회피)
  const numerator = appliedRates.reduce((acc, r) => acc * r, 1);
  const denom = 100 ** appliedRates.length;
  return numerator / denom;
}
