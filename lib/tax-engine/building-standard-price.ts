/**
 * 건물 기준시가 계산기 — 엔진 (Orchestrator)
 *
 * 출처: 국세청 「건물 기준시가 계산방법」 고시(첨부 PDF). 법령 위임근거: 소법 §99①1호나목·소령 §164⑤⑧③·상증법 §61①2호.
 * 설계: docs/02-design/features/building-standard-price.engine.design.md
 *
 * 모드: 상속·증여(1시점 valuation, 조정율 적용) / 양도(취득시·양도시 2시점, 조정율 미적용).
 *   - 일반: §A 공통 ㎡당 금액 × 연면적(1,000원 절사).  - 기계식주차: §A' 특수산식(단가 × 잔가율 × 주차대수).
 *   - 양도 취득 ≤2000: §B 산정기준율(소령 §164⑤).  - 양도 동일연도: §164⑧ 환산(제1·제2산식).
 */
import type {
  BuildingStandardPriceInput,
  BuildingStandardPriceResult,
  BuildingStdPriceBreakdown,
  BuildingPointInput,
} from "./types/building-standard-price.types";
import { resolveStructureIndex } from "./data/building-standard-price";
import { truncateToThousand } from "./tax-utils";
import {
  BuildingStdPriceError,
  calcPointBreakdown,
  calcMechBreakdown,
  calcAcqBaseBreakdown,
  calcSameYearTransferStdPrice,
  calcSpecialAdjustmentRate,
} from "./building-standard-price-helpers";

export type {
  BuildingStandardPriceInput,
  BuildingStandardPriceResult,
  BuildingPointInput,
  BuildingStdPriceBreakdown,
  BuildingStdPriceTaxType,
  SpecialAdjustmentFeatures,
  SameYearFormula,
} from "./types/building-standard-price.types";

const LEGAL_BASIS =
  "소득세법 §99①1호나목·시행령 §164⑤⑧③·상속세 및 증여세법 §61①2호·국세청 「건물 기준시가 계산방법」 고시";

/** 시점 입력 필수 필드 검증(구조·용도·공시지가). */
function validatePoint(point: BuildingPointInput | undefined, label: string): BuildingPointInput {
  if (!point) throw new BuildingStdPriceError(`${label}: 구조·용도·공시지가 입력 필요`);
  if (!point.structureKey) throw new BuildingStdPriceError(`${label}: 구조 미선택`);
  if (point.usageNo === undefined || point.usageNo < 1) {
    throw new BuildingStdPriceError(`${label}: 용도 미선택`);
  }
  if (!(point.landPricePerM2 > 0)) {
    throw new BuildingStdPriceError(`${label}: 개별공시지가(원/㎡) 필수 입력`);
  }
  return point;
}

/** 상증 조정율 배율(1.0 = 미적용). 양도는 항상 1.0. */
function computeAdjustmentRate(
  input: BuildingStandardPriceInput,
  year: number,
  point: BuildingPointInput,
): number {
  if (input.taxType !== "inheritance_gift") return 1.0;
  if (input.manualAdjustmentRate != null) return input.manualAdjustmentRate / 100;
  if (!input.specialFeatures) return 1.0;
  const structureIndex = resolveStructureIndex(year, point.structureKey) ?? 0;
  return calcSpecialAdjustmentRate(input.specialFeatures, structureIndex, input.floorArea, {
    isResidential: !!input.isResidentialUse,
    isApartment: !!input.isApartmentUse,
  });
}

/**
 * 건물 기준시가 계산 진입점(양도/상속·증여 공통).
 * 검증 실패 시 BuildingStdPriceError throw(silent fallback 금지 — 미입력=오류).
 */
export function calcBuildingStandardPrice(
  input: BuildingStandardPriceInput,
): BuildingStandardPriceResult {
  const warnings: string[] = [];
  const effBuiltYear = input.remodelYear ?? input.builtYear;

  if (input.isMechanicalParking) {
    if (input.parkingLotCount === undefined || !(input.parkingLotCount > 0)) {
      throw new BuildingStdPriceError("기계식주차: 주차대수 필수 입력");
    }
  } else if (!(input.floorArea > 0)) {
    throw new BuildingStdPriceError("연면적(㎡) 필수 입력");
  }

  if (input.taxType === "inheritance_gift") {
    if (input.valuationYear === undefined) {
      throw new BuildingStdPriceError("상속·증여: 평가연도 필수");
    }
    const year = input.valuationYear;
    let valuation: BuildingStdPriceBreakdown;
    if (input.isMechanicalParking) {
      valuation = calcMechBreakdown(year, input.parkingLotCount!, effBuiltYear);
    } else {
      const point = validatePoint(input.valuation, "평가");
      const adjRate = computeAdjustmentRate(input, year, point);
      valuation = calcPointBreakdown(year, point, input.floorArea, effBuiltYear, adjRate, "평가");
    }
    return { valuation, warnings, legalBasis: LEGAL_BASIS };
  }

  // 양도 모드 (취득시·양도시 2시점)
  if (input.transferYear === undefined || input.acquisitionYear === undefined) {
    throw new BuildingStdPriceError("양도: 취득연도·양도연도 필수");
  }
  const { transferYear, acquisitionYear } = input;

  if (input.isMechanicalParking) {
    const acquisition = calcMechBreakdown(acquisitionYear, input.parkingLotCount!, effBuiltYear);
    const transfer = calcMechBreakdown(transferYear, input.parkingLotCount!, effBuiltYear);
    return { acquisition, transfer, warnings, legalBasis: LEGAL_BASIS };
  }

  const transferPoint = validatePoint(input.transfer, "양도시");
  const acqPoint = validatePoint(input.acquisition, "취득시");

  // 취득시 breakdown — 2001 이후 일반 / 2000 이전 산정기준율
  const acquisition =
    acquisitionYear >= 2001
      ? calcPointBreakdown(acquisitionYear, acqPoint, input.floorArea, effBuiltYear, 1.0, "취득시")
      : calcAcqBaseBreakdown(acquisitionYear, acqPoint, input.floorArea, input.builtYear);

  // 동일연도(§164⑧) 환산 분기
  if (transferYear === acquisitionYear) {
    if (input.holdingMonths === undefined || !(input.holdingMonths > 0)) {
      throw new BuildingStdPriceError("동일연도 양도(§164⑧): 보유월수 필수 입력");
    }
    const adjustMonths = input.adjustMonths ?? 12;
    const formula = input.sameYearFormula ?? "prev";

    let otherStd: number;
    if (formula === "new") {
      if (input.newNoticePricePerM2 === undefined || !(input.newNoticePricePerM2 > 0)) {
        throw new BuildingStdPriceError("동일연도 제2산식: 새로운 기준시가 ㎡당 금액 필수");
      }
      // newStd = (1,000원 절사된 ㎡당 금액) × 면적
      otherStd = Math.floor(truncateToThousand(input.newNoticePricePerM2) * input.floorArea);
    } else {
      if (input.prevLandPricePerM2 === undefined || !(input.prevLandPricePerM2 > 0)) {
        throw new BuildingStdPriceError("동일연도 제1산식: 취득전기 공시지가 필수 입력");
      }
      const prevPoint: BuildingPointInput = {
        structureKey: input.prevStructureKey ?? acqPoint.structureKey,
        usageNo: input.prevUsageNo ?? acqPoint.usageNo,
        landPricePerM2: input.prevLandPricePerM2,
      };
      const prevBd = calcPointBreakdown(
        acquisitionYear - 1,
        prevPoint,
        input.floorArea,
        effBuiltYear,
        1.0,
        "취득전기",
      );
      otherStd = prevBd.standardPrice;
    }
    const transferStd = calcSameYearTransferStdPrice(
      acquisition.standardPrice,
      otherStd,
      input.holdingMonths,
      adjustMonths,
    );
    const transfer: BuildingStdPriceBreakdown = { ...acquisition, standardPrice: transferStd };
    return { acquisition, transfer, sameYearAdjusted: true, warnings, legalBasis: LEGAL_BASIS };
  }

  // 일반 양도 — 양도시 당해연도 산식
  const transfer = calcPointBreakdown(
    transferYear,
    transferPoint,
    input.floorArea,
    effBuiltYear,
    1.0,
    "양도시",
  );
  return { acquisition, transfer, warnings, legalBasis: LEGAL_BASIS };
}
