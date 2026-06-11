/**
 * 국세청 「건물 기준시가 계산서」 어댑터 — 엔진 result + 폼 표시 컨텍스트 → 계산서 모델(순수).
 *
 * 설계: docs/02-design/features/building-std-price-nts-report.ui.design.md
 * 양도 = 서식 2벌(양도당시 + 취득당시), 상증 = 1벌. 엔진 산식 무관 — breakdown echo를 칸에 매핑만.
 */
import type {
  BuildingStandardPriceResult,
  BuildingStdPriceBreakdown,
  AncillaryApportionment,
} from "@/lib/tax-engine/types/building-standard-price.types";

/** 계산서 Ⅲ·Ⅳ 한 행(층별) */
export interface NtsReportRow {
  floorLabel: string; // 층별(지상1·지하1 등) — breakdown.label
  basePrice: number; // ⓐ 기준금액
  structureIndex?: number; // ① 구조지수(정수 100기준)
  usageLabel?: string; // 용도/용도(구분) — applyNotes.usage
  usageIndex?: number; // ② 용도지수
  locationIndex?: number; // ⑥ 위치지수
  residualRate: number; // ⑦ 잔가율
  adjustmentItems?: { nos: number[]; rate: number }[]; // ⓧⓨⓩ 조정률(번호)
  pricePerM2?: number; // ⑧ ㎡당 금액
  floorArea?: number; // ⑨ 건물면적
  standardPrice: number; // ⑩ 기준시가
}

/** Ⅰ 구분 ○ 위치 */
export type NtsMarkCell = "transfer" | "acq2001" | "acq2000" | "inheritance" | "gift";

/** 계산서 1벌(시점) */
export interface NtsReportInstance {
  /** Ⅰ ○ 위치 */
  markCell: NtsMarkCell;
  /** Ⅰ 일자 — "2023.1.1" 또는 "2023년"(일자 미입력) 또는 "2001.1.1 건물 기준시가"(취득당시 2001 텍스트) */
  dateLabel: string;
  /** 취득당시 칸 보조 텍스트(작성례 2 양도당시 칸의 "2001.1.1 건물 기준시가") */
  acqNoteLabel?: string;
  // Ⅱ 기본현황(건물 공통 — 첫 주용도 행 기준)
  address?: string;
  structureLabel?: string;
  structureIndex?: number; // ①
  usageSummary?: string; // 건물용도 요약
  landAreaM2: number; // ③
  landPricePerM2: number; // ④
  landValue: number; // ⑤ = floor(③×④)
  avgLandPrice: number; // ⑤÷③
  locationIndex?: number; // ⑥
  totalFloorArea: number; // 건물전체 연면적
  floorsAbove?: number;
  floorsBelow?: number;
  durableYears?: number; // 내용연수
  residualGroup?: string; // 그룹별(I~IV)
  builtYear: number;
  residualRate?: number; // ⑦
  // Ⅲ 주용도
  mainRows: NtsReportRow[];
  mainTotalArea: number;
  mainTotal: number;
  // Ⅳ 부속
  ancillaryRows: NtsReportRow[];
  ancillaryTotalArea: number;
  ancillaryTotal: number;
  // Ⅵ
  buildingTotal: number; // ⑪ = Ⅲ합 + Ⅳ합
  // ※ 2000.12.31 이전 취득(양도 취득당시 instance)
  acqBase?: { total2001: number; rate?: number; converted: number };
}

export interface NtsReportModel {
  instances: NtsReportInstance[];
  /** Ⅴ 안분계산(공용 — 시점 무관 1벌) */
  apportionment?: AncillaryApportionment;
}

/** 폼에서 추출하는 시점 표시 정보 */
export interface NtsPointContext {
  /** Ⅰ 일자 라벨(YYYY.M.D 또는 "{year}년") */
  dateLabel: string;
  landPricePerM2: number;
  year: number;
}

/** 어댑터 입력 — 엔진 result 외 표시 전용 컨텍스트(소재지·일자·토지·층수) */
export interface NtsReportContext {
  taxType: "transfer" | "inheritance_gift";
  inheritanceGiftKind?: "inheritance" | "gift";
  address?: string;
  builtYear: number;
  floorsAbove?: number;
  floorsBelow?: number;
  /** ③ 부속토지 면적(㎡) */
  landAreaM2: number;
  /** 상증 1시점 */
  valuation?: NtsPointContext;
  /** 양도 양도시 */
  transfer?: NtsPointContext;
  /** 양도 취득시 */
  acquisition?: NtsPointContext;
}

const isMainRow = (b: BuildingStdPriceBreakdown) => b.ancillaryKind === undefined;

function toRow(b: BuildingStdPriceBreakdown): NtsReportRow {
  return {
    floorLabel: b.label ?? "",
    basePrice: b.basePrice,
    structureIndex: b.structureIndex,
    usageLabel: b.ancillaryKind ? b.label : b.applyNotes?.usage,
    usageIndex: b.usageIndex,
    locationIndex: b.locationIndex,
    residualRate: b.residualRate,
    adjustmentItems: b.adjustmentItems,
    pricePerM2: b.pricePerM2,
    floorArea: b.floorArea,
    standardPrice: b.standardPrice,
  };
}

/** Ⅱ·Ⅲ·Ⅳ·Ⅵ 본문 — breakdown 목록(인터리브) → instance 본문 채움 */
function fillBody(
  breakdowns: BuildingStdPriceBreakdown[],
): Pick<
  NtsReportInstance,
  | "mainRows"
  | "mainTotalArea"
  | "mainTotal"
  | "ancillaryRows"
  | "ancillaryTotalArea"
  | "ancillaryTotal"
  | "buildingTotal"
  | "structureLabel"
  | "structureIndex"
  | "usageSummary"
  | "locationIndex"
  | "residualRate"
  | "residualGroup"
  | "durableYears"
> {
  const mains = breakdowns.filter(isMainRow);
  const anc = breakdowns.filter((b) => !isMainRow(b));
  const mainRows = mains.map(toRow);
  const ancillaryRows = anc.map(toRow);
  const mainTotalArea = mains.reduce((s, b) => s + (b.floorArea ?? 0), 0);
  const mainTotal = mains.reduce((s, b) => s + b.standardPrice, 0);
  const ancillaryTotalArea = anc.reduce((s, b) => s + (b.floorArea ?? 0), 0);
  const ancillaryTotal = anc.reduce((s, b) => s + b.standardPrice, 0);
  const head = mains[0];
  const usages = Array.from(new Set(mains.map((b) => b.applyNotes?.usage).filter(Boolean))) as string[];
  return {
    mainRows,
    mainTotalArea,
    mainTotal,
    ancillaryRows,
    ancillaryTotalArea,
    ancillaryTotal,
    buildingTotal: mainTotal + ancillaryTotal,
    structureLabel: head?.applyNotes?.structure,
    structureIndex: head?.structureIndex,
    usageSummary: usages.join(" · ") || undefined,
    locationIndex: head?.locationIndex,
    residualRate: head?.residualRate,
    residualGroup: head?.residualGroup,
    durableYears: head?.durableYears,
  };
}

/** 단일 breakdown(비복합) → instance 본문(Ⅲ 1행, Ⅳ 없음) */
function fillSingle(bd: BuildingStdPriceBreakdown) {
  return fillBody([bd]);
}

function landValueOf(areaM2: number, pricePerM2: number): number {
  return Math.floor(areaM2 * pricePerM2);
}

function buildLandFields(ctx: NtsReportContext, pricePerM2: number) {
  const landValue = landValueOf(ctx.landAreaM2, pricePerM2);
  return {
    address: ctx.address,
    landAreaM2: ctx.landAreaM2,
    landPricePerM2: pricePerM2,
    landValue,
    avgLandPrice: ctx.landAreaM2 > 0 ? Math.floor(landValue / ctx.landAreaM2) : 0,
    totalFloorArea: 0, // 호출부에서 mainTotalArea로 채움
    floorsAbove: ctx.floorsAbove,
    floorsBelow: ctx.floorsBelow,
    builtYear: ctx.builtYear,
  };
}

/**
 * 엔진 result + 컨텍스트 → 계산서 모델.
 * 상증 = 1벌(valuation 또는 복합). 양도 = 2벌(양도당시·취득당시).
 */
export function buildNtsReportModel(
  ctx: NtsReportContext,
  result: BuildingStandardPriceResult,
): NtsReportModel {
  const instances: NtsReportInstance[] = [];

  if (ctx.taxType === "inheritance_gift") {
    const point = ctx.valuation;
    const price = point?.landPricePerM2 ?? 0;
    const body =
      result.compositeBreakdowns && result.compositeBreakdowns.length > 0
        ? fillBody(result.compositeBreakdowns)
        : result.valuation
          ? fillSingle(result.valuation)
          : undefined;
    if (body) {
      const land = buildLandFields(ctx, price);
      instances.push({
        markCell: ctx.inheritanceGiftKind === "gift" ? "gift" : "inheritance",
        dateLabel: point?.dateLabel ?? "",
        ...land,
        ...body,
        totalFloorArea: body.mainTotalArea,
      });
    }
    return { instances, apportionment: result.ancillaryApportionment };
  }

  // 양도 — 양도당시
  const tPoint = ctx.transfer;
  const tBody = result.transferComposite
    ? fillBody(result.transferComposite.breakdowns)
    : result.transfer
      ? fillSingle(result.transfer)
      : undefined;
  if (tBody && tPoint) {
    const land = buildLandFields(ctx, tPoint.landPricePerM2);
    instances.push({
      markCell: "transfer",
      dateLabel: tPoint.dateLabel,
      ...land,
      ...tBody,
      totalFloorArea: tBody.mainTotalArea,
    });
  }

  // 양도 — 취득당시
  const aPoint = ctx.acquisition;
  const aBody = result.acquisitionComposite
    ? fillBody(result.acquisitionComposite.breakdowns)
    : result.acquisition
      ? fillSingle(result.acquisition)
      : undefined;
  if (aBody && aPoint) {
    const isPre2001 = aPoint.year <= 2000;
    const land = buildLandFields(ctx, aPoint.landPricePerM2);
    instances.push({
      markCell: isPre2001 ? "acq2000" : "acq2001",
      dateLabel: aPoint.dateLabel,
      acqNoteLabel: isPre2001 ? "2001.1.1 건물 기준시가" : undefined,
      ...land,
      ...aBody,
      totalFloorArea: aBody.mainTotalArea,
      acqBase: result.acqBaseConversion
        ? {
            total2001: result.acqBaseConversion.total2001,
            rate: result.acqBaseConversion.acqBaseRate,
            converted: result.acqBaseConversion.convertedTotal,
          }
        : undefined,
    });
  }

  return { instances, apportionment: result.ancillaryApportionment };
}
