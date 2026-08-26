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
import { resolveUsageLabel } from "./data/building-standard-price";
import { listUsageOptions } from "./data/building-standard-price";
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
  calcSpecialAdjustmentRate,
  describeSpecialAdjustment,
  selectSpecialAdjustment,
  weightedAvgLandPrice,
  calcApartmentConversion,
  calcCompositeForYear,
  normalizeAncillary,
} from "./building-standard-price-helpers";
import { resolveAcqBaseGroup, resolveAcqBaseRate } from "./data/building-standard-price";
import { calcSameAdjustmentPeriodStdPrice } from "./same-adjustment-period-std-price";
import {
  calcPriorStdPriceSubstitute,
  usesPriorStdPriceSubstitute,
} from "./same-adjustment-period-std-price";
import { isSameAdjustmentPeriodConversion } from "./same-adjustment-period-std-price";

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

/** 취득시 breakdown — ≥2001 당해연도 일반산식 / ≤2000 §164⑤ 산정기준율 환산 */
function calcAcquisitionBreakdown(
  year: number,
  point: BuildingPointInput,
  floorArea: number,
  builtYear: number,
): BuildingStdPriceBreakdown {
  return year >= 2001
    ? calcPointBreakdown(year, point, floorArea, builtYear, 1.0, "취득시")
    : calcAcqBaseBreakdown(year, point, floorArea, builtYear);
}

/**
 * 취득 ≤2000 산정기준율 환산 echo(계산서 ※표 소스) — rate 미적용(≥2001)이면 undefined.
 * total2001 = 2001 지수표 ㎡당 × 면적(rate 적용 전, stdPriceFromPerM2로 정수화) / convertedTotal = 적용 후.
 */
function acqBaseConversionOf(bd: BuildingStdPriceBreakdown, floorArea: number) {
  if (bd.acqBaseRate === undefined) return undefined;
  return {
    total2001: stdPriceFromPerM2(bd.pricePerM2 ?? 0, floorArea).standardPrice,
    acqBaseRate: bd.acqBaseRate,
    convertedTotal: bd.standardPrice,
  };
}

/**
 * 취득전기(취득연도−1) 용도번호 해석 — 소득세법 시행규칙 §80②2호 「당해양도자산」의 기준시가.
 *
 * 용도번호 체계는 연도군별로 재편된다(항목이 삽입되면 그 뒤 번호가 한 칸씩 밀린다).
 * 같은 번호를 전년도 표에서 그대로 읽으면 **인접한 다른 용도의 지수**가 적용되므로,
 * 취득연도 용도의 **동명 항목**을 전년도 표에서 찾아 그 번호를 쓴다
 * (설계문서 building-standard-price.engine.design.md:203-204).
 * 실측(2026-08-26): 전수 1,341조합 중 지수까지 달라지는 조용한 오산 208건이 이 매칭으로 해소된다.
 *
 * 동명 항목이 없으면 종전대로 같은 번호를 쓰되 **경고를 남긴다**. 검증 오류로 막지 않는 이유는 둘이다.
 *   ① 무매칭 95건의 상당수는 번호는 그대로이고 표기만 바뀐 것이라 같은-번호 fallback 이 오히려 맞다
 *      (2010 #3 「다가구주택…」→「다가구…」 — 지수 100 동일).
 *   ② `prevUsageNo` 입력 위젯이 저장소에 없어 차단하면 사용자가 해소할 수단이 없다(dead-end).
 * 용도 대응표는 국세청 「건물 기준시가 계산방법」 고시에 있으나 **고시 본문 미확인**이다.
 */
function resolvePrevUsageNo(
  acquisitionYear: number,
  acqUsageNo: number,
  warnings: string[],
): number {
  const prevYear = acquisitionYear - 1;
  const label = resolveUsageLabel(acquisitionYear, acqUsageNo);
  if (label === undefined) return acqUsageNo;

  const match = listUsageOptions(prevYear).find((o) => o.label === label);
  if (match) return match.no;

  const prevLabel = resolveUsageLabel(prevYear, acqUsageNo);
  if (prevLabel !== undefined && prevLabel !== label) {
    warnings.push(
      `취득전기(${prevYear}년) 용도지수표에 「${label}」과 동명인 항목이 없어 같은 번호 #${acqUsageNo}(「${prevLabel}」)의 지수를 적용했습니다. 용도 대응이 다르면 취득전기 용도번호를 직접 지정하세요.`,
    );
  }
  return acqUsageNo;
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
          // 다필지만 켠 상증 단일 평가도 hasComposite()가 true라 이 경로로 온다.
          // 조정률 직접입력은 단일 경로(computeAdjustmentRate)에서만 배율로 바뀌므로,
          // 여기서 싣지 않으면 사용자가 넣은 조정률이 그대로 버려진다(1.0으로 떨어짐).
          // ⚠️ compositeParts가 실재하는 복합 입력에서는 **부분별 adjustmentRate가 정본**이므로
          //    (building-std-price-composite-adjustment.engine.design.md) 이 fallback 분기에만 싣는다.
          ...(input.manualAdjustmentRate != null && {
            adjustmentRate: input.manualAdjustmentRate,
          }),
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

  const { breakdowns, total, apportionment, unassignedAncillary } = calcCompositeForYear(
    resolveCompositeParts(input),
    year,
    landPrice,
    input.builtYear,
    {
      usageNoSelector: (p) => p.usageNo,
      adjustmentEnabled: true,
      ancillary: normalizeAncillary(input.ancillaryFacilities, input.sharedFacilityArea),
      remodel: { remodelYear: input.remodelYear, isInheritanceGift: true },
      // 건물 전체 특성(I 지붕·II·III) — toEngineInput에서 BUILDING_WIDE_FEATURE_KEYS로 필터됨. manual이면 무시.
      buildingWideFeatures: input.manualAdjustmentRate == null ? input.specialFeatures : undefined,
      adjustmentCtx: { isResidential: !!input.isResidentialUse, isApartment: !!input.isApartmentUse },
    },
  );

  // 설계문서 `building-std-price-nts-report.engine.design.md:225-227` — 미지정 몫은 잔여 흡수 없이
  // 평가에서 빠지므로(게이팅 자체는 의도) 그 사실이 사용자에게 도달해야 한다. 금액에는 개입하지 않는다.
  if (unassignedAncillary) {
    const { totalArea, assignedArea } = unassignedAncillary;
    warnings.push(
      `부속시설 ${totalArea}㎡ 중 ${assignedArea}㎡만 귀속 지정 — 미지정 몫은 평가 제외`,
    );
  }

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

  // 양도 복합 조정률 입력 금지(고시: 조정률은 상속·증여만) — 건물전체 특성 포함
  if (input.specialFeatures) {
    throw new BuildingStdPriceError("양도 복합: 건물특성 조정률은 상속·증여에만 적용됩니다.");
  }
  for (const p of parts) {
    if (
      p.adjustmentRate != null ||
      (p.adjustmentNos?.length ?? 0) > 0 ||
      p.specialFeatures ||
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

  // 취득 ≤2000 — 2001 지수표 복합 × 산정기준율(소령 §164⑤). 부분별 구조 그룹이 상이하면 부분별 적용.
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
  const rates = groups.map((g) => resolveAcqBaseRate(g!, input.builtYear, acquisitionYear));
  if (rates.some((r) => r === undefined)) {
    throw new BuildingStdPriceError(
      `취득(2000이전) 복합: 산정기준율 미수록(신축 ${input.builtYear}·취득 ${acquisitionYear})`,
    );
  }
  let convertedTotal: number;
  let acqBaseRate: number | undefined;
  if (new Set(groups).size === 1) {
    // 단일 그룹 — 합계 × 단일 산정기준율(기존 산식·회귀 0 유지).
    acqBaseRate = rates[0]!;
    convertedTotal = Math.floor(base2001.total * acqBaseRate);
  } else {
    // 부분별 산정기준율 그룹 상이 — 각 부분 2001 기준시가 × 부분 그룹 rate 후 합산.
    // 부속시설 혼재(breakdowns 인터리브) 시 부분 1:1 귀속 불가 → 미지원(명시).
    if (base2001.breakdowns.length !== parts.length) {
      throw new BuildingStdPriceError(
        "취득(2000이전) 복합: 부분별 산정기준율 그룹 상이 + 부속시설 혼재는 미지원(부속 없는 복합으로 입력)",
      );
    }
    acqBaseRate = undefined; // 계산서 ※표는 "부분별" 표기
    convertedTotal = base2001.breakdowns.reduce(
      (s, bd, i) => s + Math.floor(bd.standardPrice * rates[i]!),
      0,
    );
  }
  return {
    transferComposite: { breakdowns: transfer.breakdowns, total: transfer.total },
    acquisitionComposite: { breakdowns: base2001.breakdowns, total: base2001.total },
    acqBaseConversion: { total2001: base2001.total, ...(acqBaseRate !== undefined && { acqBaseRate }), convertedTotal },
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

  // 단일 시점 모드 — 호출부가 한 시점 필드에만 값을 주입할 때 반대 시점 입력을 요구하지 않는다.
  // ⚠️ 취득연도 == 양도연도이면 §164⑧ 환산(양도값이 취득값에서 파생)이 우선하므로 이 분기를 건너뛰고
  //    아래 2시점 경로로 간다. 복합구조·기계식주차는 별도 반환 경로라 미지원(2시점 경로 유지).
  // §164⑧ 대상이면 양도값이 취득값에서 파생되므로 단일시점 우회를 타지 않는다.
  // 판정은 ④변환·⑧검증·UI 와 **같은 leaf**로 한다(종전에는 「연도 동일」만 보아 연도교차를 가로챘다).
  const isSec164_8 = isSameAdjustmentPeriodConversion(
    input.acquisitionYear,
    input.transferYear,
    input.holdingMonths !== undefined,
  );
  if (input.singleTimePoint && !isSec164_8 && !input.isMechanicalParking && !hasComposite(input)) {
    if (input.singleTimePoint === "acquisition") {
      if (input.acquisitionYear === undefined) {
        throw new BuildingStdPriceError("단일 시점(취득): 취득연도 필수");
      }
      const acquisition = calcAcquisitionBreakdown(
        input.acquisitionYear,
        validatePoint(input.acquisition, "취득시"),
        input.floorArea,
        input.builtYear,
      );
      const conv = acqBaseConversionOf(acquisition, input.floorArea);
      return {
        acquisition,
        ...(conv && { acqBaseConversion: conv }),
        warnings,
        legalBasis: BUILDING_STD_PRICE_LEGAL_BASIS_TRANSFER,
      };
    }
    if (input.transferYear === undefined) {
      throw new BuildingStdPriceError("단일 시점(양도): 양도연도 필수");
    }
    const transfer = calcPointBreakdown(
      input.transferYear,
      validatePoint(input.transfer, "양도시"),
      input.floorArea,
      input.builtYear,
      1.0,
      "양도시",
    );
    return { transfer, warnings, legalBasis: BUILDING_STD_PRICE_LEGAL_BASIS_TRANSFER };
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
  const acquisition = calcAcquisitionBreakdown(
    acquisitionYear,
    acqPoint,
    input.floorArea,
    input.builtYear,
  );

  // 취득 ≤2000 단독: 산정기준율 환산 echo(계산서 ※표 소스 — 복합 경로와 대칭)
  const acqBaseConversion = acqBaseConversionOf(acquisition, input.floorArea);

  // 동일조정기간(§164⑧) 환산 분기.
  //
  // ⚠️ **2026-08-24 정정** — 종전 조건은 `transferYear === acquisitionYear`(연도 동일)로
  //    법문보다 좁았다. 시행규칙 §80①1호 본문은 *"취득일이 속하는 연도의 **다음 연도 말일**
  //    이전에 양도하는 경우"*라 **연도가 달라도 성립**한다. 집행기준 계산사례 2건
  //    (2005 취득 → 2006 양도)이 모두 이 분기에 도달하지 못하고 있었다.
  //
  //    이 계산기는 기준시가를 **산출하는 주체**라 「양도당시 == 취득당시」를 사전에 알 수 없다 —
  //    그 동일성은 이 분기의 전제다. 요건 판정 leaf `classifySameAdjustmentPeriod`는 두
  //    기준시가를 인자로 받으므로 산출 이전인 여기서는 쓸 수 없고, §80①1호의 **기간 축만** 편다.
  //
  // 🔑 **연도 교차 구간은 호출부가 보유월수를 줄 때만 진입한다.**
  //    같은 연도면 새 기준시가가 고시되지 않았음이 사실상 확정되지만(연 1회 고시),
  //    연도가 다르면 서로 **다른 고시분**일 수 있어 §164⑧의 전제가 깨진다. 그 판단은
  //    호출부가 하고, 그 신호가 `holdingMonths`다. 이 가드가 없으면 3시점 배치처럼
  //    보유월수를 쓰지 않는 기존 호출부가 통째로 "보유월수 필수" 오류로 떨어진다
  //    (2026-08-24 `phd-3point-batch.anchor` 회귀로 실측).
  const isSameYear = transferYear === acquisitionYear;
  const inSameAdjustmentWindow = transferYear <= acquisitionYear + 1;
  if (isSameYear || (inSameAdjustmentWindow && input.holdingMonths !== undefined)) {
    if (input.holdingMonths === undefined || !(input.holdingMonths > 0)) {
      throw new BuildingStdPriceError("동일조정기간 양도(§164⑧): 보유월수 필수 입력");
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
    } else if (usesPriorStdPriceSubstitute(acquisitionYear)) {
      /**
       * 전기가 **최초 고시(2001) 이전**이면 지수표가 아예 없다. 종전에는 여기서
       * `calcPointBreakdown(2000, …)`이 「2000년 용도지수표에 용도번호 #N 없음」으로 차단해
       * **취득 2001 사용자가 기본 상태(`sameYearFormula` 기본값 "prev")에서 계산 자체를
       * 못 했다** — 존재하지 않는 표를 요구하므로 폼에서 고칠 여지도 없었다.
       *
       * 근본 원인은 fallback 부재가 아니라 「소득세법 시행규칙」 **제80조 제3항 제2호**
       * (전기의 기준시가 = 최초로 고시한 기준시가 × 국세청장이 고시한 기준율) 미구현이다.
       * ⚠️ 2001 표 fallback 추가는 채택하지 않는다 — `resolveUsageIndex(2000,·)===undefined`
       *    를 고정한 기존 테스트·silent-fallback 금지 정책과 충돌한다.
       *
       * 이 경로는 지수표를 쓰지 않으므로 **「취득전기 ㎡당 공시지가」가 불요**하다.
       */
      const group = resolveAcqBaseGroup(acqPoint.structureKey);
      const rate =
        group === undefined
          ? undefined
          : resolveAcqBaseRate(group, input.builtYear, acquisitionYear - 1);
      const sub = calcPriorStdPriceSubstitute({
        firstNoticeStdPrice: acqStd,
        noticeBaseRate: rate,
      });
      if (!sub) {
        throw new BuildingStdPriceError(
          "동일연도 제1산식: 전기 기준시가 대체산정(소득세법 시행규칙 §80③2호) 불가 — 산정기준율표 미수록 구조",
        );
      }
      delta = acqStd - sub.value;
      // 근거를 사용자에게 알린다 — 이 경로에서는 전기(2000) 기준시가가 취득당시(2001)보다 커
      // §80①1호 하한이 사실상 항상 걸리므로(2000년 산정기준율은 전 그룹·전 신축연도에서 1 이상),
      // 설명이 없으면 「양도당시 = 취득당시」가 오류로 보인다.
      warnings.push(
        `취득전기(${acquisitionYear - 1}년) 기준시가는 고시 이전이라 소득세법 시행규칙 §80③2호로 ` +
          `대체산정했습니다 — 최초고시 기준시가 × 기준율 = ${sub.value.toLocaleString()}`,
      );
    } else {
      if (input.prevLandPricePerM2 === undefined || !(input.prevLandPricePerM2 > 0)) {
        throw new BuildingStdPriceError("동일연도 제1산식: 취득전기 공시지가 필수 입력");
      }
      const prevPoint: BuildingPointInput = {
        structureKey: input.prevStructureKey ?? acqPoint.structureKey,
        usageNo:
          input.prevUsageNo ?? resolvePrevUsageNo(acquisitionYear, acqPoint.usageNo, warnings),
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
    // §80①1호 본문 단서(하한) 포함 — 계산값이 취득당시 기준시가보다 적으면 취득당시를 쓴다.
    // 종전 `calcSameYearTransferStdPrice`에는 이 단서가 없었다.
    const converted = calcSameAdjustmentPeriodStdPrice({
      formula,
      standardPriceAtAcquisition: acqStd,
      ...(formula === "prev"
        ? { priorStandardPrice: acqStd - delta } // delta = acqStd − prevStd
        : { newStandardPrice: acqStd + delta }), // delta = newStd − acqStd
      holdingMonths: input.holdingMonths,
      adjustmentMonths: adjustMonths,
    });
    const transferStd = converted.value;
    // §164⑧ 양도값은 취득당시 기준시가에서 **파생**된다 — 자기 고유의 ㎡당 금액이 없다.
    // 전체 spread 로 취득 echo 를 물려주면 결과 카드·계산서가 「㎡당 × 연면적 = 양도액」이라는
    // 성립하지 않는 산식을 그린다(실측: 좌변 134,800,000 ≠ 우변 135,900,000).
    // ⇒ 취득 시점 전용 필드(㎡당 금액·산정기준율·공시지가 기준연도)는 싣지 않고 파생 플래그를 준다.
    const transfer: BuildingStdPriceBreakdown = {
      ...acquisition,
      standardPrice: transferStd,
      pricePerM2: undefined,
      acqBaseRate: undefined,
      appliedLandPriceYear: undefined,
      sameAdjustmentPeriodDerived: true,
    };
    return {
      acquisition,
      transfer,
      ...(acqBaseConversion && { acqBaseConversion }),
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
  return {
    acquisition,
    transfer,
    ...(acqBaseConversion && { acqBaseConversion }),
    warnings,
    legalBasis: BUILDING_STD_PRICE_LEGAL_BASIS_TRANSFER,
  };
}
