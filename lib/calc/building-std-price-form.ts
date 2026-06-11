/**
 * 건물 기준시가 계산기 — 폼 상태·initial·엔진 변환·검증 (독립 도구, API route 미사용)
 *
 * 설계: docs/02-design/features/building-standard-price.ui.design.md
 * 엔진을 클라이언트에서 직접 호출(정적 데이터·순수 함수). 용도는 번호(usageNo) 기반.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import type {
  BuildingStandardPriceInput,
  BuildingStdPriceTaxType,
  SameYearFormula,
  SpecialAdjustmentFeatures,
  AncillaryFacility,
  AncillaryFacilityKind,
  BuildingCompositePart,
} from "@/lib/tax-engine/types/building-standard-price.types";
import {
  hasUsageIndexYear,
  hasLocationIndexYear,
  resolveMechParkingFormula,
} from "@/lib/tax-engine/data/building-standard-price";
import type { NtsReportContext, NtsPointContext } from "@/lib/calc/nts-report-adapter";

/** 다필지 부속토지 1필지(위치지수 가중평균용) — 폼 문자열 */
export interface LandParcelForm {
  areaM2: string;
  pricePerM2: string;
}

/** 복합건물 1개 부분(층/구역) — 폼 문자열 */
export interface CompositePartForm {
  label: string;
  structureKey: string;
  usageNo: string;
  /** 양도 복합 — 취득시 용도(연도별 체계 상이). 상증·단일 미사용 */
  acqUsageNo: string;
  floorArea: string;
  /** "" = 1.0(미적용) */
  adjustmentRate: string;
  /** 조정률 번호(쉼표, 예 "9,20") — 상증 전용. 비우면 adjustmentRate(%) 사용 */
  adjustmentNos: string;
  /** "" = 공용 안분 미적용 */
  sharedAdjustmentRate: string;
  /** 공용 조정률 번호(쉼표) — 상증 전용 */
  sharedAdjustmentNos: string;
}

/** 부속시설 종류별 면적(㎡, 문자열) — 계산서 Ⅳ·Ⅴ */
export type AncillaryAreaForm = Record<AncillaryFacilityKind, string>;

export const emptyAncillaryAreas: AncillaryAreaForm = {
  parking: "",
  machine: "",
  boiler: "",
  shelter: "",
  rooftop: "",
  other: "",
};

/** 공동주택 고시 전 취득 환산 — 폼 문자열 */
export interface ApartmentConversionForm {
  firstNoticeApartmentPrice: string;
  firstNoticeYear: string;
  landAreaM2: string;
  totalFloorArea: string;
  structureKey: string;
  usageNo: string;
  firstNoticeLandPrice: string;
  acquisitionLandPrice: string;
  building2001LandPrice: string;
}

export const initialApartmentConversionForm: ApartmentConversionForm = {
  firstNoticeApartmentPrice: "",
  firstNoticeYear: "",
  landAreaM2: "",
  totalFloorArea: "",
  structureKey: "",
  usageNo: "",
  firstNoticeLandPrice: "",
  acquisitionLandPrice: "",
  building2001LandPrice: "",
};

export interface BuildingStdPriceFormState {
  taxType: BuildingStdPriceTaxType;
  /** 상증 세분(계산서 Ⅰ 상속세/증여세 ○ 위치) — 표시 전용, 엔진 미전달 */
  inheritanceGiftKind: "inheritance" | "gift";
  /** 계산서 Ⅰ 일자(양도일/상속·증여일) — 선택, 서식 표기 전용. 미입력 시 "{연도}년" */
  eventDate: string;
  /** 계산서 Ⅰ 취득당시 일자(양도 모드) — 선택 */
  acquisitionEventDate: string;
  /** 계산서 Ⅱ 건물전체 층수 — 표시 전용 */
  floorsAbove: string;
  floorsBelow: string;
  floorArea: string;
  /** 부속토지(대지) 면적 — 토지기준시가 표시용(= 공시지가 × 면적). 건물 기준시가 엔진 입력 아님 */
  landAreaM2: string;
  builtYear: string;
  remodelYear: string; // 상증 — "" = 해당없음
  isMechanicalParking: boolean;
  parkingLotCount: string;
  // 소재지(개별공시지가 조회용 — 엔진 입력 아님)
  addressRoad: string;
  addressJibun: string;
  buildingName: string;
  addressDetail: string;
  longitude: string;
  latitude: string;
  // 양도
  acquisitionYear: string;
  transferYear: string;
  acqStructureKey: string;
  acqUsageNo: string;
  acqLandPrice: string;
  transStructureKey: string;
  transUsageNo: string;
  transLandPrice: string;
  holdingMonths: string; // 동일연도 환산 — 필수
  adjustMonths: string; // 동일연도 조정월수(기본 "12")
  sameYearFormula: SameYearFormula;
  newNoticePrice: string; // 제2산식
  prevLandPrice: string; // 제1산식 취득전기 공시지가
  // 양도 — 공동주택 고시 전 취득 환산(일반 2시점 흐름 대체)
  apartmentConversionMode: boolean;
  apartmentConversion: ApartmentConversionForm;
  // 상증
  valuationYear: string;
  valStructureKey: string;
  valUsageNo: string;
  valLandPrice: string;
  adjustmentMode: "features" | "manual";
  adjustmentFeatures: SpecialAdjustmentFeatures | null;
  manualAdjustmentRate: string;
  isResidentialUse: boolean;
  isApartmentUse: boolean;
  // 상증 — 다필지 부속토지(위치지수 면적가중평균)
  landParcelMode: boolean;
  landParcels: LandParcelForm[];
  // 복합구조(층·구역별 구조·용도 상이) + 공용시설 안분 — 상증·양도 공용
  compositeMode: boolean;
  compositeParts: CompositePartForm[];
  /** @deprecated 단일 합계(하위호환) — 신규는 ancillaryAreas. normalize가 other로 이전 */
  sharedFacilityArea: string;
  /** 부속시설 종류별 면적(계산서 Ⅳ·Ⅴ) */
  ancillaryAreas: AncillaryAreaForm;
}

/** 빈 복합 부분 1개 */
export function emptyCompositePart(): CompositePartForm {
  return {
    label: "",
    structureKey: "",
    usageNo: "",
    acqUsageNo: "",
    floorArea: "",
    adjustmentRate: "",
    adjustmentNos: "",
    sharedAdjustmentRate: "",
    sharedAdjustmentNos: "",
  };
}

export const initialBuildingStdPriceForm: BuildingStdPriceFormState = {
  taxType: "transfer",
  inheritanceGiftKind: "inheritance",
  eventDate: "",
  acquisitionEventDate: "",
  floorsAbove: "",
  floorsBelow: "",
  floorArea: "",
  landAreaM2: "",
  builtYear: "",
  remodelYear: "",
  isMechanicalParking: false,
  parkingLotCount: "",
  addressRoad: "",
  addressJibun: "",
  buildingName: "",
  addressDetail: "",
  longitude: "",
  latitude: "",
  acquisitionYear: "",
  transferYear: "",
  acqStructureKey: "",
  acqUsageNo: "",
  acqLandPrice: "",
  transStructureKey: "",
  transUsageNo: "",
  transLandPrice: "",
  holdingMonths: "",
  adjustMonths: "12",
  sameYearFormula: "prev",
  newNoticePrice: "",
  prevLandPrice: "",
  apartmentConversionMode: false,
  apartmentConversion: { ...initialApartmentConversionForm },
  valuationYear: "",
  valStructureKey: "",
  valUsageNo: "",
  valLandPrice: "",
  adjustmentMode: "features",
  adjustmentFeatures: null,
  manualAdjustmentRate: "",
  isResidentialUse: false,
  isApartmentUse: false,
  landParcelMode: false,
  landParcels: [{ areaM2: "", pricePerM2: "" }],
  compositeMode: false,
  compositeParts: [emptyCompositePart()],
  sharedFacilityArea: "",
  ancillaryAreas: { ...emptyAncillaryAreas },
};

/** 공동주택 환산 구조·용도 옵션 기준 연도(2001년 건물기준시가 산정) */
export const APARTMENT_CONVERSION_INDEX_YEAR = 2001;

const MIN_YEAR = 2001;
const MAX_YEAR = 2026;

/**
 * 연도 Select 옵션(최신 먼저). 데이터 보유 연도 교집합.
 * - 기계식주차: mech-parking-formula 보유 연도(2001~2026).
 * - 일반: 용도지수 + 위치지수 모두 보유(위치지수 2026 부재 → 2001~2025).
 */
export function availableYears(isMechanical: boolean): number[] {
  const out: number[] = [];
  for (let y = MIN_YEAR; y <= MAX_YEAR; y++) {
    const ok = isMechanical
      ? resolveMechParkingFormula(y) !== undefined
      : hasUsageIndexYear(y) && hasLocationIndexYear(y);
    if (ok) out.push(y);
  }
  return out.reverse();
}

const intOrUndef = (s: string): number | undefined => {
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? undefined : n;
};

/** 쉼표 구분 번호 문자열 → number[] (양수만). 비면 undefined. */
const parseNos = (s: string): number[] | undefined => {
  const nos = s
    .split(",")
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => !Number.isNaN(n) && n > 0);
  return nos.length > 0 ? nos : undefined;
};

/** 종류별 면적 폼 → AncillaryFacility[]. 면적>0 칸만. */
function buildAncillary(areas: AncillaryAreaForm): AncillaryFacility[] {
  return (Object.keys(areas) as AncillaryFacilityKind[])
    .map((kind) => ({ kind, areaM2: parseDecimal(areas[kind]) }))
    .filter((a) => a.areaM2 > 0);
}

/** 복합 부분 폼 → 엔진 part. forTransfer: 양도(조정률 미전달·acqUsageNo) / 그 외 상증(조정률 적용) */
function toCompositePart(p: CompositePartForm, forTransfer: boolean): BuildingCompositePart {
  const part: BuildingCompositePart = {
    label: p.label.trim() || undefined,
    structureKey: p.structureKey,
    usageNo: intOrUndef(p.usageNo) ?? 0,
    floorArea: parseDecimal(p.floorArea),
  };
  if (forTransfer) {
    part.acqUsageNo = p.acqUsageNo ? intOrUndef(p.acqUsageNo) : undefined;
  } else {
    part.adjustmentRate = p.adjustmentRate ? parseDecimal(p.adjustmentRate) : undefined;
    part.adjustmentNos = parseNos(p.adjustmentNos);
    part.sharedAdjustmentRate = p.sharedAdjustmentRate ? parseDecimal(p.sharedAdjustmentRate) : undefined;
    part.sharedAdjustmentNos = parseNos(p.sharedAdjustmentNos);
  }
  return part;
}

/** 부속시설 입력(종류별 우선, 없으면 단일 합계) → 엔진 input에 1종만 설정(동시 설정 금지) */
function applyAncillary(base: BuildingStandardPriceInput, f: BuildingStdPriceFormState): void {
  const anc = buildAncillary(f.ancillaryAreas);
  if (anc.length > 0) base.ancillaryFacilities = anc;
  else if (parseDecimal(f.sharedFacilityArea) > 0) base.sharedFacilityArea = parseDecimal(f.sharedFacilityArea);
}

/** 폼 → 엔진 입력. 모드별로 필요한 필드만 채움(미입력은 검증에서 차단). */
export function toEngineInput(f: BuildingStdPriceFormState): BuildingStandardPriceInput {
  const base: BuildingStandardPriceInput = {
    taxType: f.taxType,
    floorArea: parseDecimal(f.floorArea),
    builtYear: intOrUndef(f.builtYear) ?? 0,
    isMechanicalParking: f.isMechanicalParking || undefined,
    parkingLotCount: f.isMechanicalParking ? intOrUndef(f.parkingLotCount) : undefined,
  };

  if (f.taxType === "inheritance_gift") {
    base.valuationYear = intOrUndef(f.valuationYear);
    base.remodelYear = f.remodelYear ? intOrUndef(f.remodelYear) : undefined;
    if (!f.isMechanicalParking) {
      // 단일 시점(위치지수용 공시지가는 복합·다필지 아닐 때 사용). 복합 모드에선 구조·용도는 부분별.
      base.valuation = {
        structureKey: f.valStructureKey,
        usageNo: intOrUndef(f.valUsageNo) ?? 0,
        landPricePerM2: parseAmount(f.valLandPrice),
      };
      // 다필지 부속토지(위치지수 면적가중평균) — 단일 공시지가 무시
      if (f.landParcelMode) {
        base.landParcels = f.landParcels
          .filter((p) => parseDecimal(p.areaM2) > 0 && parseAmount(p.pricePerM2) > 0)
          .map((p) => ({ areaM2: parseDecimal(p.areaM2), pricePerM2: parseAmount(p.pricePerM2) }));
      }
      // 복합구조(층·구역별 구조·용도) + 공용시설 안분
      if (f.compositeMode) {
        base.compositeParts = f.compositeParts.map((p) => toCompositePart(p, false));
        applyAncillary(base, f);
      }
      // 조정율은 단일(비복합) 모드에서만 적용 — 복합은 부분별 adjustmentRate 사용
      if (!f.compositeMode) {
        if (f.adjustmentMode === "manual") {
          base.manualAdjustmentRate = f.manualAdjustmentRate ? parseDecimal(f.manualAdjustmentRate) : undefined;
        } else if (f.adjustmentFeatures) {
          base.specialFeatures = f.adjustmentFeatures;
        }
        base.isResidentialUse = f.isResidentialUse || undefined;
        base.isApartmentUse = f.isApartmentUse || undefined;
      }
    }
    return base;
  }

  // 양도
  base.acquisitionYear = intOrUndef(f.acquisitionYear);
  base.transferYear = intOrUndef(f.transferYear);

  // 양도 복합건물(층·구역별 구조·용도 상이) — 시점별 공시지가만(구조·용도는 부분별·acqUsageNo)
  if (f.compositeMode && !f.isMechanicalParking && !f.apartmentConversionMode) {
    base.compositeParts = f.compositeParts.map((p) => toCompositePart(p, true));
    applyAncillary(base, f);
    base.acquisition = { structureKey: "", usageNo: 0, landPricePerM2: parseAmount(f.acqLandPrice) };
    base.transfer = { structureKey: "", usageNo: 0, landPricePerM2: parseAmount(f.transLandPrice) };
    return base;
  }

  // 공동주택 고시 전 취득 환산(양도 전용) — 일반 2시점 흐름 대체
  if (f.apartmentConversionMode && !f.isMechanicalParking) {
    const ac = f.apartmentConversion;
    base.apartmentConversion = {
      firstNoticeApartmentPrice: parseAmount(ac.firstNoticeApartmentPrice),
      firstNoticeYear: intOrUndef(ac.firstNoticeYear) ?? 0,
      landAreaM2: parseDecimal(ac.landAreaM2),
      totalFloorArea: parseDecimal(ac.totalFloorArea),
      structureKey: ac.structureKey,
      usageNo: intOrUndef(ac.usageNo) ?? 0,
      firstNoticeLandPrice: parseAmount(ac.firstNoticeLandPrice),
      acquisitionLandPrice: parseAmount(ac.acquisitionLandPrice),
      building2001LandPrice: parseAmount(ac.building2001LandPrice),
    };
    return base;
  }

  if (!f.isMechanicalParking) {
    base.acquisition = {
      structureKey: f.acqStructureKey,
      usageNo: intOrUndef(f.acqUsageNo) ?? 0,
      landPricePerM2: parseAmount(f.acqLandPrice),
    };
    // 동일연도(§164⑧) 환산 — 양도당시 구조·용도·공시지가 불요(취득 기준시가를 환산)
    if (base.acquisitionYear !== undefined && base.acquisitionYear === base.transferYear) {
      base.holdingMonths = intOrUndef(f.holdingMonths);
      base.adjustMonths = intOrUndef(f.adjustMonths);
      base.sameYearFormula = f.sameYearFormula;
      if (f.sameYearFormula === "new") {
        base.newNoticePricePerM2 = parseAmount(f.newNoticePrice);
      } else {
        base.prevLandPricePerM2 = parseAmount(f.prevLandPrice);
      }
    } else {
      base.transfer = {
        structureKey: f.transStructureKey,
        usageNo: intOrUndef(f.transUsageNo) ?? 0,
        landPricePerM2: parseAmount(f.transLandPrice),
      };
    }
  }
  return base;
}

/** 복합 부분 + 부속시설 검증(상증·양도 공용). forTransfer=양도(취득시 용도 필수·조정률 금지). 통과 = null. */
function validateCompositeParts(f: BuildingStdPriceFormState, forTransfer: boolean): string | null {
  const parts = f.compositeParts;
  if (parts.length === 0) return "복합구조: 부분을 1개 이상 입력하세요.";
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const n = i + 1;
    if (!p.structureKey) return `복합 부분 ${n}: 구조를 선택하세요.`;
    if (intOrUndef(p.usageNo) === undefined) return `복합 부분 ${n}: ${forTransfer ? "양도시 " : ""}용도를 선택하세요.`;
    if (forTransfer && intOrUndef(p.acqUsageNo) === undefined) return `복합 부분 ${n}: 취득시 용도를 선택하세요.`;
    if (!(parseDecimal(p.floorArea) > 0)) return `복합 부분 ${n}: 면적(㎡)을 입력하세요.`;
    if (!forTransfer) {
      if (p.adjustmentRate && parseDecimal(p.adjustmentRate) < 0) return `복합 부분 ${n}: 조정률은 0 이상이어야 합니다.`;
      if (p.sharedAdjustmentRate && parseDecimal(p.sharedAdjustmentRate) < 0)
        return `복합 부분 ${n}: 공용 조정률은 0 이상이어야 합니다.`;
      for (const no of parseNos(p.adjustmentNos) ?? [])
        if (no < 1 || no > 36) return `복합 부분 ${n}: 조정률 번호는 1~36입니다.`;
      for (const no of parseNos(p.sharedAdjustmentNos) ?? [])
        if (no < 1 || no > 36) return `복합 부분 ${n}: 공용 조정률 번호는 1~36입니다.`;
    }
  }
  // 부속시설 — 종류별·단일 합계 동시 입력 차단
  const hasList = buildAncillary(f.ancillaryAreas).length > 0;
  const hasLegacy = parseDecimal(f.sharedFacilityArea) > 0;
  if (hasList && hasLegacy) return "부속시설: 종류별 면적과 단일 합계를 동시에 입력할 수 없습니다.";
  // 상증: 부속 면적 있으면 1개 이상 부분에 공용 조정률(또는 번호) 지정
  if (!forTransfer && (hasList || hasLegacy)) {
    const anyShared = parts.some((p) => p.sharedAdjustmentRate !== "" || p.sharedAdjustmentNos !== "");
    if (!anyShared) return "공용시설 면적을 입력하면 1개 이상 부분에 공용 조정률을 지정하세요.";
  }
  return null;
}

/** 검증(⑧). 엔진 silent-fallback 식별표와 동기화. 통과 = null. */
export function validateBuildingStdPriceForm(f: BuildingStdPriceFormState): string | null {
  const builtYear = intOrUndef(f.builtYear);
  if (builtYear === undefined || builtYear < 1900 || builtYear > MAX_YEAR) {
    return "신축연도를 입력하세요.";
  }

  // 복합구조(부분별 면적)·공동주택 환산(자체 연면적)은 건물 연면적 불요
  const skipFloorArea =
    f.compositeMode || (f.taxType === "transfer" && f.apartmentConversionMode);

  if (f.isMechanicalParking) {
    const cnt = intOrUndef(f.parkingLotCount);
    if (cnt === undefined || cnt <= 0) return "기계식주차 주차대수를 입력하세요.";
  } else if (!skipFloorArea) {
    if (!(parseDecimal(f.floorArea) > 0)) return "건물 연면적(㎡)을 입력하세요.";
  }

  if (f.taxType === "inheritance_gift") {
    const y = intOrUndef(f.valuationYear);
    if (y === undefined) return "상속·증여 연도를 선택하세요.";
    if (f.isMechanicalParking) {
      if (resolveMechParkingFormula(y) === undefined) return `${y}년 기계식주차 단가 자료가 없습니다.`;
      return null;
    }
    if (!hasUsageIndexYear(y) || !hasLocationIndexYear(y)) return `${y}년 지수 자료가 없습니다.`;

    // 구조·용도: 복합구조는 부분별, 그 외 단일
    if (f.compositeMode) {
      const partsErr = validateCompositeParts(f, false);
      if (partsErr) return partsErr;
    } else {
      if (!f.valStructureKey) return "건물 구조를 선택하세요.";
      if (!(intOrUndef(f.valUsageNo) !== undefined)) return "건물 용도를 선택하세요.";
    }

    // 공시지가: 다필지(면적가중평균) 또는 단일
    if (f.landParcelMode) {
      const valid = f.landParcels.filter((p) => parseDecimal(p.areaM2) > 0 && parseAmount(p.pricePerM2) > 0);
      if (valid.length === 0) return "다필지: 면적·㎡당 공시지가를 1개 이상 입력하세요.";
    } else if (!(parseAmount(f.valLandPrice) > 0)) {
      return "㎡당 개별공시지가를 입력하세요.";
    }

    if (!f.compositeMode && f.adjustmentMode === "manual" && f.manualAdjustmentRate && parseDecimal(f.manualAdjustmentRate) < 0) {
      return "조정률은 0 이상이어야 합니다.";
    }
    return null;
  }

  // 양도
  const acqY = intOrUndef(f.acquisitionYear);

  // 공동주택 고시 전 취득 환산(양도 전용) — 취득연도 + 환산 필드만 필요(양도연도 불요)
  if (f.apartmentConversionMode && !f.isMechanicalParking) {
    if (acqY === undefined) return "취득연도를 선택하세요.";
    const ac = f.apartmentConversion;
    if (!(parseAmount(ac.firstNoticeApartmentPrice) > 0)) return "최초고시 공동주택기준시가를 입력하세요.";
    const fnY = intOrUndef(ac.firstNoticeYear);
    if (fnY === undefined) return "최초고시 연도를 입력하세요.";
    if (!(parseDecimal(ac.landAreaM2) > 0)) return "대지(지분)면적을 입력하세요.";
    if (!(parseDecimal(ac.totalFloorArea) > 0)) return "건물 연면적(전유+공용)을 입력하세요.";
    if (!ac.structureKey) return "공동주택 건물 구조를 선택하세요.";
    if (intOrUndef(ac.usageNo) === undefined) return "공동주택 건물 용도를 선택하세요.";
    if (!(parseAmount(ac.firstNoticeLandPrice) > 0)) return "최초고시 시점 ㎡당 공시지가를 입력하세요.";
    if (!(parseAmount(ac.acquisitionLandPrice) > 0)) return "취득당시 ㎡당 공시지가를 입력하세요.";
    if (!(parseAmount(ac.building2001LandPrice) > 0)) return "2001년 건물기준시가 산정용 ㎡당 공시지가를 입력하세요.";
    return null;
  }

  // 양도 복합건물 — 시점별 공시지가 + 부분별(취득/양도 용도). 동일연도·기계식 미지원
  if (f.compositeMode && !f.isMechanicalParking) {
    if (acqY === undefined) return "취득연도를 선택하세요.";
    const tY = intOrUndef(f.transferYear);
    if (tY === undefined) return "양도연도를 선택하세요.";
    if (acqY === tY) return "동일연도 양도(§164⑧)는 복합구조를 지원하지 않습니다.";
    if (!hasUsageIndexYear(tY) || !hasLocationIndexYear(tY)) return `${tY}년 양도시 지수 자료가 없습니다.`;
    const partsErr = validateCompositeParts(f, true);
    if (partsErr) return partsErr;
    if (!(parseAmount(f.transLandPrice) > 0)) return "양도당시 ㎡당 개별공시지가를 입력하세요.";
    if (!(parseAmount(f.acqLandPrice) > 0)) return "취득당시 ㎡당 개별공시지가를 입력하세요.";
    return null;
  }

  const transY = intOrUndef(f.transferYear);
  if (acqY === undefined) return "취득연도를 선택하세요.";
  if (transY === undefined) return "양도연도를 선택하세요.";

  if (f.isMechanicalParking) {
    if (resolveMechParkingFormula(acqY) === undefined) return `${acqY}년 기계식주차 단가 자료가 없습니다.`;
    if (resolveMechParkingFormula(transY) === undefined) return `${transY}년 기계식주차 단가 자료가 없습니다.`;
    return null;
  }

  // 양도시(당해연도) 검증 — 양도년도 ≥ 2001(일반 산식). 취득은 2000이전이면 산정기준율.
  // 동일연도(§164⑧)는 취득 기준시가를 환산하므로 양도당시 구조·용도·공시지가 불요(toEngineInput과 동기).
  const sameYear = acqY === transY;
  if (!hasUsageIndexYear(transY) || !hasLocationIndexYear(transY)) return `${transY}년 양도시 지수 자료가 없습니다.`;
  if (!sameYear) {
    if (!f.transStructureKey) return "양도당시 건물 구조를 선택하세요.";
    if (intOrUndef(f.transUsageNo) === undefined) return "양도당시 건물 용도를 선택하세요.";
    if (!(parseAmount(f.transLandPrice) > 0)) return "양도당시 ㎡당 개별공시지가를 입력하세요.";
  }

  // 취득시 — 2000 이전은 2001년 지수표(산정기준율), 이후는 해당연도
  if (!f.acqStructureKey) return "취득당시 건물 구조를 선택하세요.";
  if (intOrUndef(f.acqUsageNo) === undefined) return "취득당시 건물 용도를 선택하세요.";
  if (!(parseAmount(f.acqLandPrice) > 0)) return "취득당시 ㎡당 개별공시지가를 입력하세요.";

  // 동일연도 환산
  if (sameYear) {
    const hm = intOrUndef(f.holdingMonths);
    if (hm === undefined || hm <= 0) return "동일연도 양도는 보유월수를 입력하세요(1개월 미만=1).";
    const am = intOrUndef(f.adjustMonths);
    if (am === undefined || am <= 0) return "기준시가 조정월수를 입력하세요(연 1회 고시=12).";
    if (f.sameYearFormula === "new") {
      if (!(parseAmount(f.newNoticePrice) > 0)) return "새로운 기준시가 ㎡당 금액을 입력하세요.";
    } else if (!(parseAmount(f.prevLandPrice) > 0)) {
      return "취득전기(취득연도-1) ㎡당 공시지가를 입력하세요.";
    }
  }
  return null;
}

/** ISO 일자(YYYY-MM-DD) → "YYYY.M.D". 미입력 시 "{연도}년". */
function formatEventDate(iso: string, year: number | undefined): string {
  if (iso) {
    const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
    if (y && m && d) return `${y}.${m}.${d}`;
  }
  return year !== undefined ? `${year}년` : "";
}

/** 폼 → 계산서 어댑터 컨텍스트(표시 전용: 소재지·일자·토지·층수·시점별 공시지가). */
export function buildNtsReportContext(f: BuildingStdPriceFormState): NtsReportContext {
  const ctx: NtsReportContext = {
    taxType: f.taxType,
    inheritanceGiftKind: f.inheritanceGiftKind,
    address: f.addressJibun || f.addressRoad || undefined,
    builtYear: intOrUndef(f.builtYear) ?? 0,
    floorsAbove: intOrUndef(f.floorsAbove),
    floorsBelow: intOrUndef(f.floorsBelow),
    landAreaM2: parseDecimal(f.landAreaM2),
  };
  if (f.taxType === "inheritance_gift") {
    const year = intOrUndef(f.valuationYear);
    const point: NtsPointContext = {
      dateLabel: formatEventDate(f.eventDate, year),
      landPricePerM2: parseAmount(f.valLandPrice),
      year: year ?? 0,
    };
    ctx.valuation = point;
  } else {
    const tYear = intOrUndef(f.transferYear);
    const aYear = intOrUndef(f.acquisitionYear);
    ctx.transfer = {
      dateLabel: formatEventDate(f.eventDate, tYear),
      landPricePerM2: parseAmount(f.transLandPrice),
      year: tYear ?? 0,
    };
    ctx.acquisition = {
      dateLabel: formatEventDate(f.acquisitionEventDate, aYear),
      landPricePerM2: parseAmount(f.acqLandPrice),
      year: aYear ?? 0,
    };
  }
  return ctx;
}
