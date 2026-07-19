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

/** 한 시점의 구조·용도 (해당 연도 국세청 체계 기준). */
export interface PhdBatchPartAtPoint {
  structureKey: string;
  usageNo: number;
}

/**
 * 건물 1개 부분(층/구역) — 면적·카테고리 + 시점별 구조·용도.
 * 용도 번호가 국세청 체계 개정마다 재편(2001·2002 단독=#1 / 2003~ 단독=#2 등)되어 연도 간
 * 안정적이지 않으므로, 각 시점의 구조·용도를 해당 연도 체계로 별도 지정한다(홈택스 동형).
 */
export interface PhdBatchPart {
  floorArea: number;
  category: PhdPartCategory;
  /** 양도시(항상 산출). */
  transfer: PhdBatchPartAtPoint;
  /** 취득당시(취득 연도 체계). 미지정 시 취득 산출 skip. */
  acquisition?: PhdBatchPartAtPoint;
  /**
   * 최초공시(최초공시 연도 체계). 미지정 시 최초공시 산출 skip.
   * 겸용 Case A 상가: 모달이 이 값을 당시 주택 부분의 구조·용도로 주입(재일46014-2396).
   * Case B·단독 상가: 미지정 → 취득·최초공시 상가 미산출.
   */
  firstDisclosure?: PhdBatchPartAtPoint;
}

/** 한 시점으로 해석된 부분(구조·용도·면적). */
export interface ResolvedPart {
  structureKey: string;
  usageNo: number;
  floorArea: number;
}

/** 부분을 특정 시점의 구조·용도로 해석. 해당 시점 미지정 시 undefined. */
export function partAtPoint(part: PhdBatchPart, key: PointKey): ResolvedPart | undefined {
  const tp =
    key === "acquisition" ? part.acquisition : key === "firstDisclosure" ? part.firstDisclosure : part.transfer;
  if (!tp) return undefined;
  return { structureKey: tp.structureKey, usageNo: tp.usageNo, floorArea: part.floorArea };
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

export type PointKey = "acquisition" | "firstDisclosure" | "transfer";

const POINT_LABEL_KO: Record<PointKey, string> = {
  acquisition: "취득당시",
  firstDisclosure: "최초공시",
  transfer: "양도당시",
};

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

const sumArea = (parts: { floorArea: number }[]) => parts.reduce((s, p) => s + p.floorArea, 0);

/** ≥2001 valuation 건물기준시가. 부분 1개=단일 point, 2개↑=compositeParts 합산. */
function valuationStdPrice(
  parts: ResolvedPart[],
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

/**
 * 취득 ≤2000 acqBase(2001×산정기준율). 단일 부분=acquisition, 다부분=acquisitionComposite로 위임.
 * 복합은 calcTransferComposite가 단일 산정기준율 그룹만 지원(부분별 그룹 상이 시 throw → 상위 unsupported 기록).
 */
function acqBaseStdPrice(
  parts: ResolvedPart[],
  builtYear: number,
  point: PhdBatchPoint,
): number | undefined {
  const head = parts[0];
  const pt = { structureKey: head.structureKey, usageNo: head.usageNo, landPricePerM2: point.landPricePerM2 };
  const base = {
    taxType: "transfer" as const,
    builtYear,
    acquisitionYear: point.year,
    // transferYear는 sameYear(§164⑧) 회피 위해 ≥2001 고정
    transferYear: BUILDING_STD_FIRST_YEAR,
    acquisition: pt,
    transfer: pt,
  };
  if (parts.length === 1) {
    const r = calcBuildingStandardPrice({ ...base, floorArea: head.floorArea });
    return r.acquisition?.standardPrice;
  }
  // 복합: compositeParts로 transfer 복합 산정(acqUsageNo=usageNo — 시점 해석 완료된 용도).
  // ⚠️ 복합 acquisitionComposite.total은 산정기준율 적용 前(base2001)이고, 취득당시 기준시가(적용 後)는
  //    acqBaseConversion.convertedTotal — 단일 경로 acquisition.standardPrice와 대응.
  const r = calcBuildingStandardPrice({
    ...base,
    floorArea: sumArea(parts),
    compositeParts: parts.map((p) => ({
      structureKey: p.structureKey,
      usageNo: p.usageNo,
      acqUsageNo: p.usageNo,
      floorArea: p.floorArea,
    })),
  });
  return r.acqBaseConversion?.convertedTotal;
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
  // 각 부분을 이 시점의 구조·용도로 해석. 시점 미지정 부분은 제외.
  const resolved = parts.map((p) => partAtPoint(p, key)).filter((r): r is ResolvedPart => r != null);
  if (resolved.length === 0) return; // 이 시점 미입력(예: Case B 상가 취득·최초공시) → 조용히 skip
  if (resolved.length !== parts.length) {
    push(`일부 부분의 ${POINT_LABEL_KO[key]} 구조·용도가 미입력입니다.`);
    return;
  }
  try {
    let v: number | undefined;
    if (point.year >= BUILDING_STD_FIRST_YEAR) {
      v = valuationStdPrice(resolved, builtYear, point);
    } else if (isAcquisition) {
      v = acqBaseStdPrice(resolved, builtYear, point);
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
 * 3시점 건물기준시가를 각 시점 독립 산출. 각 부분의 구조·용도는 시점별(`partAtPoint`)로 해석.
 *  - housing: 취득·최초공시·양도 전부(모달이 3시점 구조·용도 지정).
 *  - commercial 양도시: 항상(상가 용도).
 *  - commercial 취득·최초공시: 상가 부분에 `acquisition`/`firstDisclosure`(당시 주택 구조·용도)가
 *    지정됐을 때만 산출(겸용 Case A — 모달이 주택 부분 값을 주입, 재일46014-2396). 미지정 시 skip.
 */
export function computePhdThreePointStdPrice(input: PhdBatchInput): PhdBatchResult {
  const { building, acquisition, firstDisclosure, transfer } = input;
  const { builtYear, parts } = building;
  const result: PhdBatchResult = { unsupported: [] };

  const housing = parts.filter((p) => p.category === "housing");
  const commercial = parts.filter((p) => p.category === "commercial");
  const points: [PointKey, PhdBatchPoint | undefined][] = [
    ["acquisition", acquisition],
    ["firstDisclosure", firstDisclosure],
    ["transfer", transfer],
  ];

  for (const [key, point] of points) {
    computeCategory(result, key, "housing", housing, builtYear, point, key === "acquisition");
    // commercial: 해당 시점 구조·용도가 지정된 부분만 산출(양도=항상 / 취득·최초공시=Case A 주입 시).
    computeCategory(result, key, "commercial", commercial, builtYear, point, key === "acquisition");
  }

  return result;
}
