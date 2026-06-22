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
  BuildingCompositePart,
} from "./types/building-standard-price.types";
import { resolveStructureIndex } from "./data/building-standard-price";
import {
  BUILDING_STD_PRICE_LEGAL_BASIS_TRANSFER,
  BUILDING_STD_PRICE_LEGAL_BASIS_INHERITANCE,
} from "./legal-codes/building-standard-price";
import {
  BuildingStdPriceError,
  calcPointBreakdown,
  stdPriceFromPerM2,
  calcMechBreakdown,
  calcAcqBaseBreakdown,
  calcSameYearTransferStdPrice,
  calcSpecialAdjustmentRate,
  describeSpecialAdjustment,
  selectSpecialAdjustment,
  weightedAvgLandPrice,
  calcApartmentConversion,
  calcCompositeForYear,
  normalizeAncillary,
} from "./building-standard-price-helpers";
import { resolveAcqBaseGroup, resolveAcqBaseRate } from "./data/building-standard-price";

export type {
  BuildingStandardPriceInput,
  BuildingStandardPriceResult,
  BuildingPointInput,
  BuildingStdPriceBreakdown,
  BuildingStdPriceTaxType,
  SpecialAdjustmentFeatures,
  SameYearFormula,
} from "./types/building-standard-price.types";


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

/** 복합건물(다필지 가중평균 / 층·구역별 구조 상이) 여부 */
function hasComposite(input: BuildingStandardPriceInput): boolean {
  return (input.compositeParts?.length ?? 0) > 0 || (input.landParcels?.length ?? 0) > 0;
}

/** 복합건물 부분 목록 — compositeParts 우선, 없으면 valuation 단일 point fallback(다필지 전용) */
function resolveCompositeParts(input: BuildingStandardPriceInput): BuildingCompositePart[] {
  return (input.compositeParts?.length ?? 0) > 0
    ? input.compositeParts!
    : [
        {
          label: undefined,
          structureKey: input.valuation?.structureKey ?? "",
          usageNo: input.valuation?.usageNo ?? 0,
          floorArea: input.floorArea,
        },
      ];
}

/**
 * 복합건물 평가(상증 1시점). 다필지 → 위치지수 가중평균 / 층·구역별 → 부분 독립 계산 후 합산.
 * compositeParts 없이 landParcels만이면 valuation 단일 point + 가중평균 공시지가.
 */
function calcCompositeValuation(
  input: BuildingStandardPriceInput,
  year: number,
  warnings: string[],
): BuildingStandardPriceResult {
  const hasParcels = (input.landParcels?.length ?? 0) > 0;
  const landPrice = hasParcels
    ? weightedAvgLandPrice(input.landParcels!)
    : input.valuation?.landPricePerM2 ?? 0;
  if (!(landPrice > 0)) {
    throw new BuildingStdPriceError("복합건물: ㎡당 공시지가(또는 부속토지)가 필요합니다.");
  }

  const { breakdowns, total, apportionment } = calcCompositeForYear(
    resolveCompositeParts(input),
    year,
    landPrice,
    input.builtYear,
    {
      usageNoSelector: (p) => p.usageNo,
      adjustmentEnabled: true,
      ancillary: normalizeAncillary(input.ancillaryFacilities, input.sharedFacilityArea),
      remodel: { remodelYear: input.remodelYear, isInheritanceGift: true },
    },
  );

  return {
    compositeBreakdowns: breakdowns,
    compositeTotal: total,
    ancillaryApportionment: apportionment,
    weightedLandPricePerM2: hasParcels ? landPrice : undefined,
    warnings,
    legalBasis: BUILDING_STD_PRICE_LEGAL_BASIS_INHERITANCE,
  };
}

/**
 * 양도 복합건물 평가(취득시·양도시 2시점). 양도는 조정률 미적용(고시).
 * 취득 ≤2000: 2001 지수표 복합 합계 × 산정기준율(※식). 부분 용도는 시점별 상이(acqUsageNo).
 */
function calcTransferComposite(
  input: BuildingStandardPriceInput,
  transferYear: number,
  acquisitionYear: number,
  warnings: string[],
): BuildingStandardPriceResult {
  const parts = input.compositeParts!;
  const transferLandPrice = input.transfer?.landPricePerM2 ?? 0;
  const acqLandPrice = input.acquisition?.landPricePerM2 ?? 0;
  if (!(transferLandPrice > 0)) throw new BuildingStdPriceError("양도시: 개별공시지가(원/㎡) 필요");
  if (!(acqLandPrice > 0)) throw new BuildingStdPriceError("취득시: 개별공시지가(원/㎡) 필요");

  // 양도 복합 조정률 입력 금지(고시: 조정률은 상속·증여만)
  for (const p of parts) {
    if (
      p.adjustmentRate != null ||
      (p.adjustmentNos?.length ?? 0) > 0 ||
      p.sharedAdjustmentRate != null ||
      (p.sharedAdjustmentNos?.length ?? 0) > 0
    ) {
      throw new BuildingStdPriceError("양도 복합: 조정률은 상속·증여에만 적용됩니다.");
    }
  }

  const ancillary = normalizeAncillary(input.ancillaryFacilities, input.sharedFacilityArea);
  // 취득시 용도번호는 연도군별 상이 → acqUsageNo 필수(silent fallback 금지)
  const acqSelector = (p: BuildingCompositePart): number => {
    if (p.acqUsageNo == null) throw new BuildingStdPriceError("양도 복합 부분: 취득시 용도(연도별 상이) 필요");
    return p.acqUsageNo;
  };

  const transfer = calcCompositeForYear(parts, transferYear, transferLandPrice, input.builtYear, {
    usageNoSelector: (p) => p.usageNo,
    adjustmentEnabled: false,
    ancillary,
    errorPrefix: "양도 복합 부분",
  });

  // 취득 ≥2001: 해당연도 복합. ≤2000: 2001 복합 × 산정기준율.
  if (acquisitionYear >= 2001) {
    const acquisition = calcCompositeForYear(parts, acquisitionYear, acqLandPrice, input.builtYear, {
      usageNoSelector: acqSelector,
      adjustmentEnabled: false,
      ancillary,
      errorPrefix: "양도 복합 부분",
    });
    return {
      transferComposite: { breakdowns: transfer.breakdowns, total: transfer.total },
      acquisitionComposite: { breakdowns: acquisition.breakdowns, total: acquisition.total },
      ancillaryApportionment: transfer.apportionment,
      warnings,
      legalBasis: BUILDING_STD_PRICE_LEGAL_BASIS_TRANSFER,
    };
  }

  // 취득 ≤2000 — 2001 지수표 복합 합계 × 산정기준율(소령 §164⑤). 부분 구조 단일 그룹만 지원.
  const base2001 = calcCompositeForYear(parts, 2001, acqLandPrice, input.builtYear, {
    usageNoSelector: acqSelector,
    adjustmentEnabled: false,
    ancillary,
    errorPrefix: "양도 복합 부분(2001)",
  });
  const groups = parts.map((p) => resolveAcqBaseGroup(p.structureKey));
  if (groups.some((g) => g === undefined)) {
    throw new BuildingStdPriceError("취득(2000이전) 복합: 산정기준율표 미수록 구조(신공법) 포함");
  }
  if (new Set(groups).size > 1) {
    throw new BuildingStdPriceError("취득(2000이전) 복합: 부분별 산정기준율 그룹 상이는 미지원(동일 구조로 입력)");
  }
  const acqBaseRate = resolveAcqBaseRate(groups[0]!, input.builtYear, acquisitionYear);
  if (acqBaseRate === undefined) {
    throw new BuildingStdPriceError(
      `취득(2000이전) 복합: 산정기준율 미수록(그룹 ${groups[0]}·신축 ${input.builtYear}·취득 ${acquisitionYear})`,
    );
  }
  const convertedTotal = Math.floor(base2001.total * acqBaseRate);
  return {
    transferComposite: { breakdowns: transfer.breakdowns, total: transfer.total },
    acquisitionComposite: { breakdowns: base2001.breakdowns, total: base2001.total },
    acqBaseConversion: { total2001: base2001.total, acqBaseRate, convertedTotal },
    ancillaryApportionment: transfer.apportionment,
    warnings,
    legalBasis: BUILDING_STD_PRICE_LEGAL_BASIS_TRANSFER,
  };
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
    structureKey: point.structureKey, // II 최고층수 통나무조 제외 판정
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
  // 기계식주차 전용 — 리모델링 시 신축연도 치환(일반 건물은 calcEffectiveResidualRate에서 할증 처리)
  const effBuiltYear = input.remodelYear ?? input.builtYear;

  if (input.isMechanicalParking) {
    if (input.parkingLotCount === undefined || !(input.parkingLotCount > 0)) {
      throw new BuildingStdPriceError("기계식주차: 주차대수 필수 입력");
    }
  } else if (!hasComposite(input) && !input.apartmentConversion && !(input.floorArea > 0)) {
    throw new BuildingStdPriceError("연면적(㎡) 필수 입력");
  }

  if (input.taxType === "inheritance_gift") {
    if (input.valuationYear === undefined) {
      throw new BuildingStdPriceError("상속·증여: 평가연도 필수");
    }
    const year = input.valuationYear;

    // 복합건물(다필지 위치지수 가중평균 / 층·구역별 구조 상이)
    if (!input.isMechanicalParking && hasComposite(input)) {
      return calcCompositeValuation(input, year, warnings);
    }

    let valuation: BuildingStdPriceBreakdown;
    if (input.isMechanicalParking) {
      valuation = calcMechBreakdown(year, input.parkingLotCount!, effBuiltYear);
    } else {
      const point = validatePoint(input.valuation, "평가");
      const adjRate = computeAdjustmentRate(input, year, point);
      valuation = calcPointBreakdown(year, point, input.floorArea, input.builtYear, adjRate, "평가", {
        remodelYear: input.remodelYear,
        isInheritanceGift: true,
      });
      // 조정율 특성 설명·번호 echo(인쇄·계산서용) — 특성 모드만(직접입력은 undefined)
      if (input.manualAdjustmentRate == null && input.specialFeatures) {
        const structureIndex = resolveStructureIndex(year, point.structureKey) ?? 0;
        const adjCtx = {
          isResidential: !!input.isResidentialUse,
          isApartment: !!input.isApartmentUse,
          structureKey: point.structureKey,
        };
        if (valuation.applyNotes) {
          valuation.applyNotes.adjustment = describeSpecialAdjustment(
            input.specialFeatures,
            structureIndex,
            input.floorArea,
            adjCtx,
          );
        }
        // 계산서 Ⅲ "조정률(번호)" 칸 echo — 단일 경로 누락 방지(복합은 calcCompositeForYear에서 부착)
        const sel = selectSpecialAdjustment(input.specialFeatures, structureIndex, input.floorArea, adjCtx);
        if (sel.length > 0) valuation.adjustmentItems = sel.map((s) => ({ nos: s.nos, rate: s.rate }));
      }
    }
    return { valuation, warnings, legalBasis: BUILDING_STD_PRICE_LEGAL_BASIS_INHERITANCE };
  }

  // 공동주택 고시 전 취득 → 취득당시 기준시가 환산(양도 전용)
  if (input.apartmentConversion) {
    if (input.acquisitionYear === undefined) {
      throw new BuildingStdPriceError("공동주택 환산: 취득연도 필수");
    }
    const conv = calcApartmentConversion(input.builtYear, input.acquisitionYear, input.apartmentConversion);
    return { apartmentConversion: conv, warnings, legalBasis: BUILDING_STD_PRICE_LEGAL_BASIS_TRANSFER };
  }

  // 양도 모드 (취득시·양도시 2시점)
  if (input.transferYear === undefined || input.acquisitionYear === undefined) {
    throw new BuildingStdPriceError("양도: 취득연도·양도연도 필수");
  }
  const { transferYear, acquisitionYear } = input;

  if (input.isMechanicalParking) {
    const acquisition = calcMechBreakdown(acquisitionYear, input.parkingLotCount!, effBuiltYear);
    const transfer = calcMechBreakdown(transferYear, input.parkingLotCount!, effBuiltYear);
    return { acquisition, transfer, warnings, legalBasis: BUILDING_STD_PRICE_LEGAL_BASIS_TRANSFER };
  }

  // 양도 복합건물(층·구역별 구조·용도 상이) — compositeParts 활성. 취득시·양도시 각 복합 계산.
  if ((input.compositeParts?.length ?? 0) > 0) {
    if (transferYear === acquisitionYear) {
      throw new BuildingStdPriceError("동일연도 양도(§164⑧)는 복합구조를 지원하지 않습니다.");
    }
    return calcTransferComposite(input, transferYear, acquisitionYear, warnings);
  }
  if ((input.landParcels?.length ?? 0) > 0) {
    throw new BuildingStdPriceError("양도 모드 다필지 위치지수 가중평균은 미지원입니다(복합구조로 입력).");
  }

  const acqPoint = validatePoint(input.acquisition, "취득시");

  // 취득시 breakdown — 2001 이후 일반 / 2000 이전 산정기준율
  const acquisition =
    acquisitionYear >= 2001
      ? calcPointBreakdown(acquisitionYear, acqPoint, input.floorArea, input.builtYear, 1.0, "취득시")
      : calcAcqBaseBreakdown(acquisitionYear, acqPoint, input.floorArea, input.builtYear);

  // 동일연도(§164⑧) 환산 분기
  if (transferYear === acquisitionYear) {
    if (input.holdingMonths === undefined || !(input.holdingMonths > 0)) {
      throw new BuildingStdPriceError("동일연도 양도(§164⑧): 보유월수 필수 입력");
    }
    const adjustMonths = input.adjustMonths ?? 12;
    const formula = input.sameYearFormula ?? "prev";

    const acqStd = acquisition.standardPrice;
    let delta: number;
    if (formula === "new") {
      if (input.newNoticePricePerM2 === undefined || !(input.newNoticePricePerM2 > 0)) {
        throw new BuildingStdPriceError("동일연도 제2산식: 새로운 기준시가 ㎡당 금액 필수");
      }
      // newStd = (1,000원 절사된 ㎡당 금액) × 면적. 제2산식 delta = newStd − acqStd
      const newStd = stdPriceFromPerM2(input.newNoticePricePerM2, input.floorArea).standardPrice;
      delta = newStd - acqStd;
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
        input.builtYear,
        1.0,
        "취득전기",
      );
      // 제1산식 delta = acqStd − prevStd
      delta = acqStd - prevBd.standardPrice;
    }
    const transferStd = calcSameYearTransferStdPrice(
      acqStd,
      delta,
      input.holdingMonths,
      adjustMonths,
    );
    const transfer: BuildingStdPriceBreakdown = { ...acquisition, standardPrice: transferStd };
    return {
      acquisition,
      transfer,
      sameYearAdjusted: true,
      warnings,
      legalBasis: BUILDING_STD_PRICE_LEGAL_BASIS_TRANSFER,
    };
  }

  // 일반 양도 — 양도시 당해연도 산식. 양도시점 구조·용도·공시지가는 비동일연도에서만 필요
  // (§164⑧ 동일연도는 취득 기준시가를 환산하므로 위 분기에서 transfer 입력 미사용)
  const transferPoint = validatePoint(input.transfer, "양도시");
  const transfer = calcPointBreakdown(
    transferYear,
    transferPoint,
    input.floorArea,
    input.builtYear,
    1.0,
    "양도시",
  );
  return { acquisition, transfer, warnings, legalBasis: BUILDING_STD_PRICE_LEGAL_BASIS_TRANSFER };
}
