/**
 * PHD 3시점 건물기준시가 일괄 산출 오케스트레이션 (양도 §164⑤)
 *
 * 계획서: docs/02-design/features/phd-building-stdprice-3point-batch-calculator.plan.md §3.1
 * anchor: __tests__/tax-engine/building-standard-price/phd-3point-batch.anchor.test.ts
 *
 * 접근(anchor 확정): **각 시점 독립 산출**(한 시점 실패가 다른 시점을 무산시키지 않음).
 *  - 취득: ≥2001은 plain(valuation), ≤2000은 acqBase(transfer 콜의 acquisition = 2001×산정기준율).
 *  - 최초공시·양도: plain(valuation). **≥2001만 산출** — ≤2000(공동주택 1993 등)은 국세청
 *    신축가격기준액 고시표(2001~) 부재로 산출 불가 → unsupported로 표기(수동 입력 유지).
 */
import { calcBuildingStandardPrice } from "@/lib/tax-engine/building-standard-price";

/** 국세청 신축가격기준액 고시 최초 연도 — 이전 연도는 plain 건물기준시가 산출 불가 */
export const BUILDING_STD_FIRST_YEAR = 2001;

export interface PhdBatchBuilding {
  structureKey: string;
  usageNo: number;
  floorArea: number;
  builtYear: number;
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

export interface PhdBatchResult {
  /** 산출된 시점별 건물기준시가 총액(원). 미산출 시점은 undefined. */
  acquisition?: number;
  firstDisclosure?: number;
  transfer?: number;
  /** 산출 불가 시점 키 목록(≤2000 최초공시 등) + 사유 */
  unsupported: { point: PointKey; reason: string }[];
}

const point = (b: PhdBatchBuilding, p: PhdBatchPoint) => ({
  structureKey: b.structureKey,
  usageNo: b.usageNo,
  landPricePerM2: p.landPricePerM2,
});

const preGosiReason = (year: number) =>
  `${year}년은 국세청 건물기준시가 고시(${BUILDING_STD_FIRST_YEAR}년~) 이전 — 직접 입력 필요`;

/** plain 건물기준시가(valuation 단일시점). ≥2001 전제 — ≤2000 호출 시 엔진이 throw. */
function plainStdPrice(b: PhdBatchBuilding, p: PhdBatchPoint): number | undefined {
  const r = calcBuildingStandardPrice({
    taxType: "inheritance_gift",
    floorArea: b.floorArea,
    builtYear: b.builtYear,
    valuationYear: p.year,
    valuation: point(b, p),
  });
  return r.valuation?.standardPrice;
}

/** 취득 건물기준시가 — ≥2001 plain / ≤2000 acqBase(transfer 콜의 acquisition). */
function acquisitionStdPrice(b: PhdBatchBuilding, p: PhdBatchPoint): number | undefined {
  if (p.year >= BUILDING_STD_FIRST_YEAR) return plainStdPrice(b, p);
  // ≤2000: 취득 semantics(2001×산정기준율). transferYear는 sameYear(§164⑧) 회피 위해 ≥2001 고정.
  const r = calcBuildingStandardPrice({
    taxType: "transfer",
    floorArea: b.floorArea,
    builtYear: b.builtYear,
    acquisitionYear: p.year,
    transferYear: BUILDING_STD_FIRST_YEAR,
    acquisition: point(b, p),
    transfer: point(b, p),
  });
  return r.acquisition?.standardPrice;
}

function computeInto(
  result: PhdBatchResult,
  key: PointKey,
  fn: () => number | undefined,
): void {
  try {
    const v = fn();
    if (v != null && v > 0) result[key] = v;
    else result.unsupported.push({ point: key, reason: "산출값 없음" });
  } catch (e) {
    result.unsupported.push({ point: key, reason: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * 3시점 건물기준시가를 각 시점 독립 산출. 입력이 없거나 산출 불가한 시점은
 * 결과에서 제외(undefined) + unsupported에 사유 기록.
 */
export function computePhdThreePointStdPrice(input: PhdBatchInput): PhdBatchResult {
  const { building: b, acquisition, firstDisclosure, transfer } = input;
  const result: PhdBatchResult = { unsupported: [] };

  if (acquisition) computeInto(result, "acquisition", () => acquisitionStdPrice(b, acquisition));

  if (firstDisclosure) {
    if (firstDisclosure.year < BUILDING_STD_FIRST_YEAR) {
      result.unsupported.push({ point: "firstDisclosure", reason: preGosiReason(firstDisclosure.year) });
    } else {
      computeInto(result, "firstDisclosure", () => plainStdPrice(b, firstDisclosure));
    }
  }

  if (transfer) {
    if (transfer.year < BUILDING_STD_FIRST_YEAR) {
      result.unsupported.push({ point: "transfer", reason: preGosiReason(transfer.year) });
    } else {
      computeInto(result, "transfer", () => plainStdPrice(b, transfer));
    }
  }

  return result;
}
