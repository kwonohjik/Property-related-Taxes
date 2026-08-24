/**
 * 건물 기준시가 계산기 — 엔진 헬퍼 (Pure Engine)
 *
 * 출처: 국세청 「건물 기준시가 계산방법」 고시(첨부 PDF). 설계: docs/02-design/features/building-standard-price.engine.design.md
 *
 * 시점별 ㎡당 금액·기계식주차 특수산식·조정율(상증)·산정기준율(2000이전 취득)·§164⑧ 동일연도 환산.
 * 정수곱 후 /1,000,000, 잔가율·조정율 곱, 1,000원 절사(truncateToThousand), 면적 곱 후 원 절사 순서.
 */
import { safeMultiply, safeMultiplyThenDivide, truncateToThousand } from "./tax-utils";
import { round2 } from "./area-utils";
import type {
  BuildingPointInput,
  BuildingStdPriceBreakdown,
  SpecialAdjustmentFeatures,
  LandParcel,
  ApartmentConversionInput,
  ApartmentConversionResult,
  BuildingCompositePart,
  AncillaryFacility,
  AncillaryFacilityKind,
  AncillaryApportionment,
  AncillaryApportionRow,
} from "./types/building-standard-price.types";
import {
  resolveNewBuildingBasePrice,
  resolveStructureIndex,
  resolveUsageIndex,
  resolveLocationIndex,
  calcResidualRate,
  calcResidualRateByDurable,
  residualStepForGroup,
  durableForGroup,
  resolveResidualGroupForYear,
  resolveAcqBaseGroup,
  resolveAcqBaseRate,
  resolveAdjustmentRateByNo,
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
  resolveMaxFloorsNo,
  resolveGrossAreaRate,
  resolveGrossAreaNo,
  resolveWallessRate,
  resolveWallessNo,
  ADJUSTMENT_FEATURE_LABEL,
  describeLocationBucket,
  resolveUsageLabel,
  STRUCTURE_META,
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
  /** 구조키 — II 최고층수 "통나무조(solid_wood) 적용 제외"(원본 비고) 판정용. 미지정 시 제외 안 함 */
  structureKey?: string;
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
  const baseResid = calcResidualRate(group, valuationYear - builtYear, valuationYear);
  if (!remodel?.isInheritanceGift || remodel.remodelYear === undefined) return baseResid;
  const elapsedToRemodel = Math.max(0, remodel.remodelYear - builtYear);
  // 대수선할증률 = 연상각률(잔가율 step = (1−잔존율)/내용연수, 평가연도별) × 대수선시점 경과연수 × 0.3
  const surcharge = residualStepForGroup(group, valuationYear) * elapsedToRemodel * 0.3;
  return Math.round((baseResid + surcharge) * 10000) / 10000;
}

/**
 * ㎡당 금액(절사 전) → 1,000원 절사 후 면적 곱(원 미만 절사).
 * 절사+면적곱의 단일 출처 — calcPointBreakdown·§164⑧ 제2산식(신규고시 단가) 공용.
 */
export function stdPriceFromPerM2(
  rawPerM2: number,
  floorArea: number,
): { pricePerM2: number; standardPrice: number } {
  const pricePerM2 = truncateToThousand(rawPerM2);
  return { pricePerM2, standardPrice: Math.floor(pricePerM2 * floorArea) };
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

  // 구조→잔가율 그룹은 시대별 멤버십(3그룹/era-B/era-C). 내용연수·잔존율도 평가연도로 결정
  const residualGroup = resolveResidualGroupForYear(point.structureKey, year);
  const durableYears = durableForGroup(residualGroup, year);
  const residualRate = calcEffectiveResidualRate(residualGroup, builtYear, year, remodel);

  // 정수곱(부동소수 누적 회피) 후 /1,000,000 — 지수 3개가 각 ÷100
  const indexProduct = safeMultiply(
    safeMultiply(safeMultiply(basePrice, structureIndex), usageIndex),
    locationIndex,
  );
  const perM2Base = indexProduct / 1_000_000;
  const raw = perM2Base * residualRate * adjustmentRate;
  const { pricePerM2, standardPrice } = stdPriceFromPerM2(raw, floorArea);

  const usageLabel = resolveUsageLabel(year, point.usageNo);

  return {
    standardPrice,
    pricePerM2,
    basePrice,
    structureIndex,
    usageIndex,
    locationIndex,
    residualRate,
    residualGroup,
    durableYears,
    adjustmentRate: adjustmentRate === 1 ? undefined : adjustmentRate,
    floorArea, // 계산서 Ⅱ 연면적·Ⅲ 면적⑨ echo(단일 경로 누락 방지 — 복합은 호출부에서 부분 면적으로 덮어씀)
    appliedLandPriceYear: year,
    applyNotes: {
      structure: STRUCTURE_META[point.structureKey]?.label,
      usage: usageLabel ? `${point.usageNo}. ${usageLabel}` : `${point.usageNo}`,
      location: describeLocationBucket(year, point.landPricePerM2),
      residual: `${residualGroup}그룹, ${builtYear}년 신축, ${Math.max(0, year - builtYear)}년 경과`,
    },
  };
}

/**
 * 다필지 부속토지 면적가중평균 ㎡당 공시지가(고시 §6⑥). Σ(면적×지가) ÷ Σ면적.
 * 위치지수 구간 판정용 — 정수 절사 없이 사용(구간 경계 영향 없음).
 */
export function weightedAvgLandPrice(parcels: LandParcel[]): number {
  let areaSum = 0;
  let valueSum = 0;
  for (const p of parcels) {
    areaSum += p.areaM2;
    valueSum += p.areaM2 * p.pricePerM2;
  }
  if (areaSum <= 0) throw new BuildingStdPriceError("다필지 부속토지: 면적 합계가 0입니다.");
  return valueSum / areaSum;
}

/** 부속시설 종류 표시 순서·라벨(계산서 Ⅴ Ci~Hi). "other"="공용"(기존 단일 sharedFacilityArea 라벨 보존) */
const ANCILLARY_KIND_ORDER: AncillaryFacilityKind[] = [
  "parking",
  "machine",
  "boiler",
  "shelter",
  "rooftop",
  "other",
];
const ANCILLARY_KIND_LABEL: Record<AncillaryFacilityKind, string> = {
  parking: "주차장",
  machine: "기계실",
  boiler: "보일러실",
  shelter: "대피소",
  rooftop: "옥탑",
  other: "공용",
};

/**
 * 부분 조정률(상증 복합) — 수동(번호/%) 우선, 없으면 건물전체+부분 특성 자동 산정.
 * rate=calcSpecialAdjustmentRate·items=selectSpecialAdjustment 동일 selection 공유 → 드리프트 0.
 */
function resolvePartAdjustment(
  p: BuildingCompositePart,
  opts: CompositeYearOptions,
  year: number,
  structureKey: string,
  buildingTotalArea: number,
  label: string,
): { adjRate: number; items?: { nos: number[]; rate: number }[] } {
  // (1) 수동 우선(완전 override — 단일 manual과 일관)
  if ((p.adjustmentNos?.length ?? 0) > 0 || p.adjustmentRate != null) {
    return adjustmentFromNos(p.adjustmentNos, p.adjustmentRate, label);
  }
  // (2) 특성 자동 — 건물 전체 ∪ 부분 (키셋 disjoint 가정 — 경계에서 필터됨)
  const merged: SpecialAdjustmentFeatures = { ...(opts.buildingWideFeatures ?? {}), ...(p.specialFeatures ?? {}) };
  if (Object.keys(merged).length === 0) return { adjRate: 1.0, items: undefined };
  const structureIndex = resolveStructureIndex(year, structureKey) ?? 0;
  const ctx: AdjustmentContext = {
    isResidential: !!opts.adjustmentCtx?.isResidential,
    isApartment: !!opts.adjustmentCtx?.isApartment,
    structureKey, // II 통나무조 제외·I 지붕 게이트(부분 구조지수<100일 때만)
  };
  const adjRate = calcSpecialAdjustmentRate(merged, structureIndex, buildingTotalArea, ctx);
  const sel = selectSpecialAdjustment(merged, structureIndex, buildingTotalArea, ctx);
  return {
    adjRate,
    items: sel.length > 0 ? sel.map((s) => ({ nos: s.nos, rate: s.rate })) : undefined,
  };
}

/** 조정율 번호(들) → {배율, echo items}. 번호 미수록 시 throw. */
function adjustmentFromNos(
  nos: number[] | undefined,
  ratePercent: number | undefined,
  label: string,
): { adjRate: number; items?: { nos: number[]; rate: number }[] } {
  if (nos && nos.length > 0) {
    const rates = nos.map((no) => {
      const r = resolveAdjustmentRateByNo(no);
      if (r === undefined) throw new BuildingStdPriceError(`${label}: 조정률 번호 ${no} 미수록(1~36)`);
      return r;
    });
    const numerator = rates.reduce((a, r) => a * r, 1);
    return {
      adjRate: numerator / 100 ** rates.length,
      items: nos.map((no, i) => ({ nos: [no], rate: rates[i] })),
    };
  }
  if (ratePercent != null) return { adjRate: ratePercent / 100 };
  return { adjRate: 1.0 };
}

/** 복합 계산 1시점 옵션 — usageNo 선택(양도 취득/양도 시점별)·조정률 적용(상증만)·부속 종류 */
export interface CompositeYearOptions {
  /** 부분 → 해당 시점 용도번호(양도 취득=acqUsageNo, 그 외=usageNo) */
  usageNoSelector: (p: BuildingCompositePart) => number;
  /** 조정률 적용 여부 — 상증 true / 양도 false(고시: 양도 조정률 미적용) */
  adjustmentEnabled: boolean;
  /** 부속시설 종류별 면적(정규화 후) */
  ancillary: AncillaryFacility[];
  remodel?: RemodelInfo;
  /** 오류 메시지 접두(예 "복합 부분"·"양도 복합 부분") */
  errorPrefix?: string;
  /** 건물 전체 특성(상증 복합 전용) — I 지붕·II·III. 부분 specialFeatures와 merge 후 자동 산정. */
  buildingWideFeatures?: SpecialAdjustmentFeatures;
  /** 조정율 II 통나무조 제외·주거용 판정 컨텍스트(상증 복합 자동 산정용) */
  adjustmentCtx?: { isResidential: boolean; isApartment: boolean };
}

export interface CompositeYearResult {
  breakdowns: BuildingStdPriceBreakdown[];
  total: number;
  apportionment?: AncillaryApportionment;
}

/**
 * 복합건물 1시점 평가(상증·양도 공용). 부분별 주용도 행 + 부속 종류별 행(Ⅳ) + Ⅴ 안분 echo.
 * breakdowns 순서 = [주용도1, 부속1(종류순), 주용도2, 부속2, ...] (인터리브 — 기존 단언 호환).
 * 부속 행은 주용도와 동일 구조·용도·위치·잔가, 조정률만 상이(공용 조정률). "other" 단일 종류 = 기존 동작.
 */
export function calcCompositeForYear(
  parts: BuildingCompositePart[],
  year: number,
  landPrice: number,
  builtYear: number,
  opts: CompositeYearOptions,
): CompositeYearResult {
  const prefix = opts.errorPrefix ?? "복합 부분";
  const totalMainArea = parts.reduce((s, p) => s + p.floorArea, 0);
  if (!(totalMainArea > 0)) throw new BuildingStdPriceError(`${prefix}: 면적 합계가 0입니다.`);
  // II 연면적용 건물 전체 연면적 = 부분 주용도 면적 합 + 부속 면적 합(적용요령 4 "지하·옥탑 포함 전체면적")
  const buildingTotalArea =
    totalMainArea + opts.ancillary.reduce((s, a) => s + (a.areaM2 > 0 ? a.areaM2 : 0), 0);

  // 부속 종류별 총면적 + 층 라벨 집계(층은 종류별 첫 입력값 — 계산서 Ⅳ "층별" 표기 전용)
  const totalByKind: Partial<Record<AncillaryFacilityKind, number>> = {};
  const floorByKind: Partial<Record<AncillaryFacilityKind, string>> = {};
  for (const a of opts.ancillary) {
    if (a.areaM2 > 0) {
      totalByKind[a.kind] = (totalByKind[a.kind] ?? 0) + a.areaM2;
      if (floorByKind[a.kind] === undefined && a.floorLabel?.trim()) floorByKind[a.kind] = a.floorLabel.trim();
    }
  }
  const activeKinds = ANCILLARY_KIND_ORDER.filter((k) => (totalByKind[k] ?? 0) > 0);
  const hasAncillary = activeKinds.length > 0;

  const breakdowns: BuildingStdPriceBreakdown[] = [];
  const apportionRows: AncillaryApportionRow[] = [];

  // 부속 수령 부분 사전 판별 — 마지막 수령 부분이 안분 잔액을 흡수한다(면적 안분 잔액 흡수 정책).
  // 수령 여부는 부분 속성만으로 결정되므로 루프 전 계산 가능.
  const receivesAt = (p: BuildingCompositePart) =>
    opts.adjustmentEnabled
      ? p.sharedAdjustmentRate != null || (p.sharedAdjustmentNos?.length ?? 0) > 0
      : true;
  const receivingIdx = parts.map((p, i) => (receivesAt(p) ? i : -1)).filter((i) => i >= 0);
  const lastReceivingIdx = receivingIdx[receivingIdx.length - 1];
  // 수령 부분들의 면적 합 — 일부만 수령하는 경로(상증)에서는 안분 대상이 전체가 아니므로
  // 잔액 흡수 기준도 "수령분 raw 합"이어야 한다(게이팅 의미 보존, 반올림 드리프트만 제거).
  const receivingMainArea = receivingIdx.reduce((s, i) => s + parts[i].floorArea, 0);
  const roundedSoFarByKind: Partial<Record<AncillaryFacilityKind, number>> = {};

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const label = p.label ?? `${prefix} ${i + 1}`;
    if (!p.structureKey) throw new BuildingStdPriceError(`${label}: 구조 미선택`);
    const usageNo = opts.usageNoSelector(p);
    if (usageNo === undefined || usageNo < 1) throw new BuildingStdPriceError(`${label}: 용도 미선택`);
    if (!(p.floorArea > 0)) throw new BuildingStdPriceError(`${label}: 면적(㎡) 필요`);
    const point: BuildingPointInput = { structureKey: p.structureKey, usageNo, landPricePerM2: landPrice };

    // 주용도 행 — 상증: 수동 우선, 없으면 건물전체+부분 특성 자동 산정 / 양도: 미적용
    const mainAdj = opts.adjustmentEnabled
      ? resolvePartAdjustment(p, opts, year, point.structureKey, buildingTotalArea, label)
      : { adjRate: 1.0, items: undefined };
    const main = calcPointBreakdown(year, point, p.floorArea, builtYear, mainAdj.adjRate, label, opts.remodel);
    breakdowns.push({ ...main, label: p.label, floorArea: p.floorArea, adjustmentItems: mainAdj.items });

    // 부속 — 수령 여부(상증 = 공용 조정률 지정 부분만 / 양도 = 전 부분)
    const receives = receivesAt(p);
    if (hasAncillary && receives) {
      const sharedAdj = opts.adjustmentEnabled
        ? adjustmentFromNos(p.sharedAdjustmentNos, p.sharedAdjustmentRate, `${label} 공용`)
        : { adjRate: 1.0, items: undefined };
      const byKind: Partial<Record<AncillaryFacilityKind, number>> = {};
      for (const kind of activeKinds) {
        // 마지막 수령 부분은 잔액 흡수 — 앞 부분들의 반올림 드리프트를 흡수해
        // Σ안분면적 = round2(수령분 raw 합) 불변식을 보장(전 부분 수령 시 = 부속 총면적).
        const area =
          i === lastReceivingIdx
            ? round2(
                round2((totalByKind[kind]! * receivingMainArea) / totalMainArea) -
                  (roundedSoFarByKind[kind] ?? 0),
              )
            : round2((totalByKind[kind]! * p.floorArea) / totalMainArea);
        roundedSoFarByKind[kind] = round2((roundedSoFarByKind[kind] ?? 0) + area);
        byKind[kind] = area;
        const kLabel = `${label} ${ANCILLARY_KIND_LABEL[kind]}`;
        const bd = calcPointBreakdown(year, point, area, builtYear, sharedAdj.adjRate, kLabel, opts.remodel);
        breakdowns.push({
          ...bd,
          label: kind === "other" ? `${label} 공용` : kLabel,
          floorArea: area,
          ancillaryKind: kind,
          attributedTo: p.label,
          ancillaryFloorLabel: floorByKind[kind],
          adjustmentItems: sharedAdj.items,
        });
      }
      apportionRows.push({
        label: p.label,
        usageIndex: main.usageIndex ?? 0,
        ratio: p.floorArea / totalMainArea,
        areaSum: activeKinds.reduce((s, k) => s + (byKind[k] ?? 0), 0),
        byKind,
      });
    }
  }

  const total = breakdowns.reduce((s, b) => s + b.standardPrice, 0);
  const apportionment: AncillaryApportionment | undefined = hasAncillary
    ? { totalArea: activeKinds.reduce((s, k) => s + (totalByKind[k] ?? 0), 0), totalByKind, rows: apportionRows }
    : undefined;
  return { breakdowns, total, apportionment };
}

/**
 * 부속시설 입력 정규화 — sharedFacilityArea(단일 합계) ↔ ancillaryFacilities(종류별) 단일화.
 * 양쪽 동시 입력 = 검증 오류. sharedFacilityArea > 0 → [{kind:"other"}](하위호환·결과 불변).
 */
export function normalizeAncillary(
  ancillaryFacilities: AncillaryFacility[] | undefined,
  sharedFacilityArea: number | undefined,
): AncillaryFacility[] {
  const hasList = (ancillaryFacilities?.length ?? 0) > 0;
  const hasLegacy = (sharedFacilityArea ?? 0) > 0;
  if (hasList && hasLegacy) {
    throw new BuildingStdPriceError("부속시설: 종류별 면적과 단일 합계를 동시에 입력할 수 없습니다.");
  }
  if (hasList) return ancillaryFacilities!.filter((a) => a.areaM2 > 0);
  if (hasLegacy) return [{ kind: "other", areaM2: sharedFacilityArea! }];
  return [];
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
  // 기계식주차 잔가율 = 내용연수 버킷(연도가변 20/30년)·평가연도 잔존율로 직접 계산(그룹 레터 비경유)
  const residualRate = calcResidualRateByDurable(formula.durableYears, year - effBuiltYear, year);
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
 * 공동주택 고시 전 취득 → 취득당시 기준시가 환산.
 * Ⅰ = ① × (취득토지④ + 취득건물⑤) ÷ (최초고시토지② + 최초고시건물③).
 *   토지 = 공시지가 × 대지지분면적 / 건물 = 2001건물기준시가 × 산정기준율(해당 취득시점, I~III그룹).
 */
export function calcApartmentConversion(
  builtYear: number,
  acquisitionYear: number,
  ac: ApartmentConversionInput,
): ApartmentConversionResult {
  // 2001 건물기준시가(조정 미적용)
  const base2001 = calcPointBreakdown(
    2001,
    { structureKey: ac.structureKey, usageNo: ac.usageNo, landPricePerM2: ac.building2001LandPrice },
    ac.totalFloorArea,
    builtYear,
    1.0,
    "공동주택 2001 건물기준시가",
  ).standardPrice;

  const acqGroup = resolveAcqBaseGroup(ac.structureKey);
  if (acqGroup === undefined) {
    throw new BuildingStdPriceError(`공동주택 환산: 구조 '${ac.structureKey}'는 산정기준율표 미수록`);
  }
  const firstNoticeAcqBaseRate = resolveAcqBaseRate(acqGroup, builtYear, ac.firstNoticeYear);
  const acquisitionAcqBaseRate = resolveAcqBaseRate(acqGroup, builtYear, acquisitionYear);
  if (firstNoticeAcqBaseRate === undefined || acquisitionAcqBaseRate === undefined) {
    throw new BuildingStdPriceError("공동주택 환산: 산정기준율 미수록(취득연도 2000 초과 또는 셀 부재)");
  }

  const firstNoticeLandValue = Math.floor(ac.firstNoticeLandPrice * ac.landAreaM2);
  const acqLandValue = Math.floor(ac.acquisitionLandPrice * ac.landAreaM2);
  const firstNoticeBuildingValue = Math.floor(base2001 * firstNoticeAcqBaseRate);
  const acqBuildingValue = Math.floor(base2001 * acquisitionAcqBaseRate);

  const numerator = acqLandValue + acqBuildingValue;
  const denominator = firstNoticeLandValue + firstNoticeBuildingValue;
  if (denominator <= 0) throw new BuildingStdPriceError("공동주택 환산: 최초고시 토지+건물 합계가 0");
  const convertedAcquisitionPrice = safeMultiplyThenDivide(ac.firstNoticeApartmentPrice, numerator, denominator);

  return {
    convertedAcquisitionPrice,
    base2001BuildingPrice: base2001,
    firstNoticeLandValue,
    firstNoticeBuildingValue,
    acqLandValue,
    acqBuildingValue,
    firstNoticeAcqBaseRate,
    acquisitionAcqBaseRate,
  };
}


/**
 * 조정율 (상증 전용, 7구분). 미해당 구분 = 100(무영향). 중복 구분은 누적 곱(적용요령 2).
 * 부동소수 누적 회피: 적용 지수(정수)를 분자에 곱하고 분모 100^k로 마지막에 환산.
 * @returns 1.0 기준 배율(미적용 = 1.0)
 */
/** 조정율 선택 항목 — 적용 구분별 선택된 번호(들)와 지수(정수, 100 기준) */
interface AdjustmentSelection {
  nos: number[];
  rate: number;
}

/**
 * 조정율 구분별 선택(단일 출처). I~VII 각 구분의 적용 규칙대로 선택 항목을 산출.
 * calcSpecialAdjustmentRate(지수곱)·describeSpecialAdjustment(라벨) 양쪽이 이 결과를 공유 → 드리프트 방지.
 */
export function selectSpecialAdjustment(
  features: SpecialAdjustmentFeatures,
  structureIndex: number,
  floorArea: number,
  ctx: AdjustmentContext,
): AdjustmentSelection[] {
  const sel: AdjustmentSelection[] = [];
  const pickMax = (c: { no: number; rate: number }[]) => c.reduce((a, b) => (b.rate > a.rate ? b : a));
  const pickMin = (c: { no: number; rate: number }[]) => c.reduce((a, b) => (b.rate < a.rate ? b : a));

  // I 지붕재료: 구조지수 < 100 일 때만
  if (structureIndex < 100 && features.roofMaterial !== undefined) {
    sel.push({ nos: [features.roofMaterial], rate: ROOF_MATERIAL_RATE[features.roofMaterial] });
  }

  // II 최고층수/연면적/지능형: 해당 항목 중 가장 높은 지수 1개
  // 최고층수: 통나무조(solid_wood) 적용 제외(원본 II 비고) · 주거용은 아파트만 적용
  const groupII: { no: number; rate: number }[] = [];
  if (
    features.maxFloors !== undefined &&
    (!ctx.isResidential || ctx.isApartment) &&
    ctx.structureKey !== "solid_wood"
  ) {
    groupII.push({ no: resolveMaxFloorsNo(features.maxFloors), rate: resolveMaxFloorsRate(features.maxFloors) });
  }
  if (!ctx.isResidential && floorArea > 0) {
    groupII.push({ no: resolveGrossAreaNo(floorArea), rate: resolveGrossAreaRate(floorArea) });
  }
  if (features.intelligentBuildingGrade !== undefined) {
    groupII.push({
      no: features.intelligentBuildingGrade === "1-2" ? 15 : 14,
      rate: INTELLIGENT_BUILDING_RATE[features.intelligentBuildingGrade],
    });
  }
  if (groupII.length > 0) {
    const w = pickMax(groupII);
    sel.push({ nos: [w.no], rate: w.rate });
  }

  // III 단독/공동주택: 해당 지수 1개
  if (features.houseTypeTier !== undefined) {
    sel.push({ nos: [features.houseTypeTier], rate: HOUSE_TYPE_RATE[features.houseTypeTier] });
  }

  // IV 상가·부속: 가장 낮은 지수 1개. 20~23 + 24·25 동시 해당이면 60
  const hasCommercialFloor = features.commercialFloor !== undefined;
  const hasAncillary = features.ancillaryParking !== undefined;
  if (hasCommercialFloor && hasAncillary) {
    sel.push({ nos: [features.commercialFloor!, features.ancillaryParking!], rate: COMMERCIAL_WITH_ANCILLARY_RATE });
  } else {
    const groupIV: { no: number; rate: number }[] = [];
    if (features.commercialFloor !== undefined)
      groupIV.push({ no: features.commercialFloor, rate: COMMERCIAL_FLOOR_RATE[features.commercialFloor] });
    if (features.ancillaryParking !== undefined)
      groupIV.push({ no: features.ancillaryParking, rate: ANCILLARY_RATE[features.ancillaryParking] });
    if (groupIV.length > 0) {
      const w = pickMin(groupIV);
      sel.push({ nos: [w.no], rate: w.rate });
    }
  }

  // V 개축(일부): 해당 지수 1개
  if (features.remodelCount !== undefined) {
    sel.push({ nos: [features.remodelCount], rate: REMODEL_COUNT_RATE[features.remodelCount] });
  }

  // VI 무벽건물: 무벽면적비율 구간 판정(미적용 시 100)
  if (features.wallessRatio !== undefined) {
    const r = resolveWallessRate(features.wallessRatio);
    const no = resolveWallessNo(features.wallessRatio);
    if (r !== ADJUSTMENT_RATE_BASE && no !== undefined) sel.push({ nos: [no], rate: r });
  }

  // VII 구조진단/철거: 가장 낮은 지수 1개. 37=정상사용면적비율(0~1 → ×100%)
  const groupVII: { no: number; rate: number }[] = [];
  if (features.structuralSafety !== undefined)
    groupVII.push({ no: features.structuralSafety, rate: STRUCTURAL_SAFETY_RATE[features.structuralSafety] });
  if (features.normalUseRatio !== undefined)
    groupVII.push({ no: 37, rate: Math.round(features.normalUseRatio * 100) });
  if (groupVII.length > 0) {
    const w = pickMin(groupVII);
    sel.push({ nos: [w.no], rate: w.rate });
  }

  return sel;
}

export function calcSpecialAdjustmentRate(
  features: SpecialAdjustmentFeatures,
  structureIndex: number,
  floorArea: number,
  ctx: AdjustmentContext,
): number {
  const sel = selectSpecialAdjustment(features, structureIndex, floorArea, ctx);
  if (sel.length === 0) return 1.0;
  // 분자=정수 지수곱, 분모=100^k (부동소수 누적 회피)
  const numerator = sel.reduce((acc, s) => acc * s.rate, 1);
  const denom = 100 ** sel.length;
  return numerator / denom;
}

/**
 * 조정율 적용 특성 설명(인쇄·적용요령용). 예 "1. 기와·징크 등 지붕 & 4. 5층 이하".
 * calcSpecialAdjustmentRate와 동일 선택(selectSpecialAdjustment) 기반 → 산식과 항상 일치.
 * 적용 특성 없으면 undefined.
 */
export function describeSpecialAdjustment(
  features: SpecialAdjustmentFeatures,
  structureIndex: number,
  floorArea: number,
  ctx: AdjustmentContext,
): string | undefined {
  const sel = selectSpecialAdjustment(features, structureIndex, floorArea, ctx);
  if (sel.length === 0) return undefined;
  return sel
    .map((s) => s.nos.map((no) => `${no}. ${ADJUSTMENT_FEATURE_LABEL[no] ?? ""}`).join(" & "))
    .join(" & ");
}
