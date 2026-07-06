/**
 * PHD 3시점 건물기준시가 일괄 산출 오케스트레이션 (양도 §164⑤) — Phase 2(겸용, Option B)
 *
 * 계획서: docs/02-design/features/phd-building-stdprice-3point-batch-mixed-use.plan.md
 * anchor: __tests__/tax-engine/building-standard-price/phd-3point-batch.anchor.test.ts
 *         __tests__/calc/phd-building-std-batch-mixed.test.ts
 *
 * 접근(각 시점 독립 산출):
 *  - 부분(층/구역) 목록 + 카테고리(주택/상가). 층별 구조·용도 상이는 compositeParts로 합산.
 *  - **Option B**: housing(주택분)은 3시점 전부, commercial(상가분)은 **양도시에만** 산출.
 *    취득·최초공시 상가는 당시 주택 용도(세법 미확정) → 배치 미산출·수동 유지. (Phase 2.1로 이월)
 *  - ≥2001만 산출. ≤2000(공동주택 최초고시 등)은 고시표 부재로 unsupported.
 *    취득 ≤2000은 단일 부분 acqBase(2001×산정기준율)만 지원, 다부분은 미지원.
 */
import { calcBuildingStandardPrice } from "@/lib/tax-engine/building-standard-price";

/** 국세청 신축가격기준액 고시 최초 연도 — 이전 연도는 plain 건물기준시가 산출 불가 */
export const BUILDING_STD_FIRST_YEAR = 2001;

export type PhdPartCategory = "housing" | "commercial";

/** 건물 1개 부분(층/구역) — 구조·용도·면적·카테고리 */
export interface PhdBatchPart {
  structureKey: string;
  usageNo: number;
  floorArea: number;
  category: PhdPartCategory;
}

export interface PhdBatchBuilding {
  builtYear: number;
  /** 층/구역별 부분 목록. 단독=부분 1개(housing). */
  parts: PhdBatchPart[];
}

export interface PhdBatchPoint {
  year: number;
  landPricePerM2: number;
}

export interface PhdBatchInput {
  building: PhdBatchBuilding;
  acquisition?: PhdBatchPoint;
  firstDisclosure?: PhdBatchPoint;
  transfer?: PhdBatchPoint;
}

type PointKey = "acquisition" | "firstDisclosure" | "transfer";

/** 시점별 카테고리 소계(원 정수). 미산출 카테고리는 undefined. */
export interface PhdPointResult {
  housing?: number;
  commercial?: number;
}

export interface PhdBatchResult {
  acquisition?: PhdPointResult;
  firstDisclosure?: PhdPointResult;
  transfer?: PhdPointResult;
  /** 산출 불가(시점, 카테고리, 사유) */
  unsupported: { point: PointKey; category: PhdPartCategory; reason: string }[];
}

const preGosiReason = (year: number) =>
  `${year}년은 국세청 건물기준시가 고시(${BUILDING_STD_FIRST_YEAR}년~) 이전 — 직접 입력 필요`;

const sumArea = (parts: PhdBatchPart[]) => parts.reduce((s, p) => s + p.floorArea, 0);

/** ≥2001 valuation 건물기준시가. 부분 1개=단일 point, 2개↑=compositeParts 합산. */
function valuationStdPrice(
  parts: PhdBatchPart[],
  builtYear: number,
  point: PhdBatchPoint,
): number | undefined {
  const head = parts[0];
  if (parts.length === 1) {
    const r = calcBuildingStandardPrice({
      taxType: "inheritance_gift",
      floorArea: head.floorArea,
      builtYear,
      valuationYear: point.year,
      valuation: { structureKey: head.structureKey, usageNo: head.usageNo, landPricePerM2: point.landPricePerM2 },
    });
    return r.valuation?.standardPrice;
  }
  const r = calcBuildingStandardPrice({
    taxType: "inheritance_gift",
    floorArea: sumArea(parts),
    builtYear,
    valuationYear: point.year,
    // 복합 위치지수는 valuation.landPricePerM2 단일값 사용(시행령 고시)
    valuation: { structureKey: head.structureKey, usageNo: head.usageNo, landPricePerM2: point.landPricePerM2 },
    compositeParts: parts.map((p) => ({ structureKey: p.structureKey, usageNo: p.usageNo, floorArea: p.floorArea })),
  });
  return r.compositeTotal;
}

/** 취득 ≤2000 acqBase(2001×산정기준율). 단일 부분만 지원 — 다부분은 throw(C1). */
function acqBaseStdPrice(
  parts: PhdBatchPart[],
  builtYear: number,
  point: PhdBatchPoint,
): number | undefined {
  if (parts.length !== 1) {
    throw new Error(
      `취득(${point.year}, 2000 이전) 다부분 산정기준율은 미지원 — 해당 상가/주택 부분을 직접 입력하세요.`,
    );
  }
  const head = parts[0];
  const pt = { structureKey: head.structureKey, usageNo: head.usageNo, landPricePerM2: point.landPricePerM2 };
  const r = calcBuildingStandardPrice({
    taxType: "transfer",
    floorArea: head.floorArea,
    builtYear,
    acquisitionYear: point.year,
    // transferYear는 sameYear(§164⑧) 회피 위해 ≥2001 고정
    transferYear: BUILDING_STD_FIRST_YEAR,
    acquisition: pt,
    transfer: pt,
  });
  return r.acquisition?.standardPrice;
}

/**
 * 한 시점·한 카테고리 산출. 부분 없으면 skip(undefined). 산출 불가 시 unsupported 기록.
 * @param isAcquisition 취득시(≤2000 acqBase 경로 허용)
 */
function computeCategory(
  result: PhdBatchResult,
  key: PointKey,
  category: PhdPartCategory,
  parts: PhdBatchPart[],
  builtYear: number,
  point: PhdBatchPoint | undefined,
  isAcquisition: boolean,
): void {
  if (!point || parts.length === 0) return;
  const push = (reason: string) => result.unsupported.push({ point: key, category, reason });
  try {
    let v: number | undefined;
    if (point.year >= BUILDING_STD_FIRST_YEAR) {
      v = valuationStdPrice(parts, builtYear, point);
    } else if (isAcquisition) {
      v = acqBaseStdPrice(parts, builtYear, point);
    } else {
      push(preGosiReason(point.year));
      return;
    }
    if (v != null && v > 0) {
      const slot = (result[key] ??= {});
      slot[category] = v;
    } else {
      push("산출값 없음");
    }
  } catch (e) {
    push(e instanceof Error ? e.message : String(e));
  }
}

/**
 * 3시점 건물기준시가를 각 시점 독립 산출(Option B).
 *  - housing: 취득·최초공시·양도 전부.
 *  - commercial: 양도시에만(취득·최초공시 상가는 당시 주택 용도 — 배치 미산출).
 */
export function computePhdThreePointStdPrice(input: PhdBatchInput): PhdBatchResult {
  const { building, acquisition, firstDisclosure, transfer } = input;
  const { builtYear, parts } = building;
  const result: PhdBatchResult = { unsupported: [] };

  const housing = parts.filter((p) => p.category === "housing");
  const commercial = parts.filter((p) => p.category === "commercial");

  // housing — 3시점
  computeCategory(result, "acquisition", "housing", housing, builtYear, acquisition, true);
  computeCategory(result, "firstDisclosure", "housing", housing, builtYear, firstDisclosure, false);
  computeCategory(result, "transfer", "housing", housing, builtYear, transfer, false);

  // commercial — 양도시에만(Option B)
  computeCategory(result, "transfer", "commercial", commercial, builtYear, transfer, false);

  return result;
}
