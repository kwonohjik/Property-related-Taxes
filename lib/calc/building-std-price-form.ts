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
} from "@/lib/tax-engine/types/building-standard-price.types";
import {
  hasUsageIndexYear,
  hasLocationIndexYear,
  resolveMechParkingFormula,
} from "@/lib/tax-engine/data/building-standard-price";

export interface BuildingStdPriceFormState {
  taxType: BuildingStdPriceTaxType;
  floorArea: string;
  builtYear: string;
  remodelYear: string; // 상증 — "" = 해당없음
  isMechanicalParking: boolean;
  parkingLotCount: string;
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
}

export const initialBuildingStdPriceForm: BuildingStdPriceFormState = {
  taxType: "transfer",
  floorArea: "",
  builtYear: "",
  remodelYear: "",
  isMechanicalParking: false,
  parkingLotCount: "",
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
  valuationYear: "",
  valStructureKey: "",
  valUsageNo: "",
  valLandPrice: "",
  adjustmentMode: "features",
  adjustmentFeatures: null,
  manualAdjustmentRate: "",
  isResidentialUse: false,
  isApartmentUse: false,
};

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
      base.valuation = {
        structureKey: f.valStructureKey,
        usageNo: intOrUndef(f.valUsageNo) ?? 0,
        landPricePerM2: parseAmount(f.valLandPrice),
      };
      if (f.adjustmentMode === "manual") {
        base.manualAdjustmentRate = f.manualAdjustmentRate ? parseDecimal(f.manualAdjustmentRate) : undefined;
      } else if (f.adjustmentFeatures) {
        base.specialFeatures = f.adjustmentFeatures;
      }
      base.isResidentialUse = f.isResidentialUse || undefined;
      base.isApartmentUse = f.isApartmentUse || undefined;
    }
    return base;
  }

  // 양도
  base.acquisitionYear = intOrUndef(f.acquisitionYear);
  base.transferYear = intOrUndef(f.transferYear);
  if (!f.isMechanicalParking) {
    base.acquisition = {
      structureKey: f.acqStructureKey,
      usageNo: intOrUndef(f.acqUsageNo) ?? 0,
      landPricePerM2: parseAmount(f.acqLandPrice),
    };
    base.transfer = {
      structureKey: f.transStructureKey,
      usageNo: intOrUndef(f.transUsageNo) ?? 0,
      landPricePerM2: parseAmount(f.transLandPrice),
    };
    // 동일연도 환산
    if (base.acquisitionYear !== undefined && base.acquisitionYear === base.transferYear) {
      base.holdingMonths = intOrUndef(f.holdingMonths);
      base.adjustMonths = intOrUndef(f.adjustMonths);
      base.sameYearFormula = f.sameYearFormula;
      if (f.sameYearFormula === "new") {
        base.newNoticePricePerM2 = parseAmount(f.newNoticePrice);
      } else {
        base.prevLandPricePerM2 = parseAmount(f.prevLandPrice);
      }
    }
  }
  return base;
}

/** 검증(⑧). 엔진 silent-fallback 식별표와 동기화. 통과 = null. */
export function validateBuildingStdPriceForm(f: BuildingStdPriceFormState): string | null {
  const builtYear = intOrUndef(f.builtYear);
  if (builtYear === undefined || builtYear < 1900 || builtYear > MAX_YEAR) {
    return "신축연도를 입력하세요.";
  }

  if (f.isMechanicalParking) {
    const cnt = intOrUndef(f.parkingLotCount);
    if (cnt === undefined || cnt <= 0) return "기계식주차 주차대수를 입력하세요.";
  } else {
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
    if (!f.valStructureKey) return "건물 구조를 선택하세요.";
    if (!(intOrUndef(f.valUsageNo) !== undefined)) return "건물 용도를 선택하세요.";
    if (!(parseAmount(f.valLandPrice) > 0)) return "㎡당 개별공시지가를 입력하세요.";
    if (f.adjustmentMode === "manual" && f.manualAdjustmentRate && parseDecimal(f.manualAdjustmentRate) < 0) {
      return "조정률은 0 이상이어야 합니다.";
    }
    return null;
  }

  // 양도
  const acqY = intOrUndef(f.acquisitionYear);
  const transY = intOrUndef(f.transferYear);
  if (acqY === undefined) return "취득연도를 선택하세요.";
  if (transY === undefined) return "양도연도를 선택하세요.";

  if (f.isMechanicalParking) {
    if (resolveMechParkingFormula(acqY) === undefined) return `${acqY}년 기계식주차 단가 자료가 없습니다.`;
    if (resolveMechParkingFormula(transY) === undefined) return `${transY}년 기계식주차 단가 자료가 없습니다.`;
    return null;
  }

  // 양도시(당해연도) 검증 — 양도년도 ≥ 2001(일반 산식). 취득은 2000이전이면 산정기준율.
  if (!hasUsageIndexYear(transY) || !hasLocationIndexYear(transY)) return `${transY}년 양도시 지수 자료가 없습니다.`;
  if (!f.transStructureKey) return "양도당시 건물 구조를 선택하세요.";
  if (intOrUndef(f.transUsageNo) === undefined) return "양도당시 건물 용도를 선택하세요.";
  if (!(parseAmount(f.transLandPrice) > 0)) return "양도당시 ㎡당 개별공시지가를 입력하세요.";

  // 취득시 — 2000 이전은 2001년 지수표(산정기준율), 이후는 해당연도
  if (!f.acqStructureKey) return "취득당시 건물 구조를 선택하세요.";
  if (intOrUndef(f.acqUsageNo) === undefined) return "취득당시 건물 용도를 선택하세요.";
  if (!(parseAmount(f.acqLandPrice) > 0)) return "취득당시 ㎡당 개별공시지가를 입력하세요.";

  // 동일연도 환산
  if (acqY === transY) {
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
