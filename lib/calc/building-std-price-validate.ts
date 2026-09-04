/**
 * 건물 기준시가 폼 **검증** — `building-std-price-form.ts`에서 분리(800줄 정책).
 *
 * 그 파일은 **폼 타입·초기값·엔진 input 변환**을 맡고, 이 파일은 **검증**만 맡는다.
 * 방향은 한쪽뿐이다 — 이 파일이 `toEngineInput`을 쓰고, 그쪽은 여기를 참조하지 않는다.
 *
 * 종전 import 경로 호환을 위해 `building-std-price-form.ts`가 재export한다.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import {
  hasUsageIndexYear,
  hasLocationIndexYear,
  resolveMechParkingFormula,
  normalUseRatioError,
  remodelYearError,
} from "@/lib/tax-engine/data/building-standard-price";
import {
  isSameAdjustmentPeriodConversion,
  usesPriorStdPriceSubstitute,
} from "@/lib/tax-engine/same-adjustment-period-std-price";
import {
  MAX_YEAR,
  buildAncillary,
  intOrUndef,
  parseNos,
  type BuildingStdPriceFormState,
} from "./building-std-price-form";

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

/**
 * 상속·증여 경로 B 부수토지 평가액(§61①1호) = 대지면적 × ㎡당 개별공시지가.
 * 모달에서 위치지수 산정용으로 이미 입력한 토지 정보로 산출 → 호출부가 부수토지 필드에 자동 전달(중복 입력 제거).
 * 양도이거나 면적·단가 미입력이면 0(전달 안 함). 라운딩은 StandardPriceInput(단가×면적 floor)과 일치.
 */
export function computeValuationLandTotal(f: BuildingStdPriceFormState): number {
  if (f.taxType !== "inheritance_gift") return 0;
  if (f.landParcelMode) {
    return f.landParcels.reduce((sum, p) => {
      const area = parseDecimal(p.areaM2);
      const price = parseAmount(p.pricePerM2);
      return area > 0 && price > 0 ? sum + Math.floor(price * area) : sum;
    }, 0);
  }
  const area = parseDecimal(f.landAreaM2);
  const price = parseAmount(f.valLandPrice);
  return area > 0 && price > 0 ? Math.floor(price * area) : 0;
}

/** 검증(⑧). 엔진 silent-fallback 식별표와 동기화. 통과 = null. */
export function validateBuildingStdPriceForm(f: BuildingStdPriceFormState): string | null {
  const builtYear = intOrUndef(f.builtYear);
  if (builtYear === undefined || builtYear < 1900 || builtYear > MAX_YEAR) {
    return "신축연도를 입력하세요.";
  }

  // VII-37 정상사용면적비율 — 엔진(`selectSpecialAdjustment`)과 **같은 술어를 같은 인자로** 부른다.
  // 아래 모드별 early return 들보다 앞에 두어야 전 경로(단일·복합·부분)를 덮는다.
  // normalUseRatio 는 PART_FEATURE_KEYS 라 폼 전역(adjustmentFeatures)과 부분(specialFeatures) 양쪽에 올 수 있다.
  for (const feats of [f.adjustmentFeatures, ...f.compositeParts.map((p) => p.specialFeatures)]) {
    const ratioError = normalUseRatioError(feats?.normalUseRatio);
    if (ratioError) return ratioError;
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
    if (y === undefined) return "상속·증여일을 입력하세요.";

    // 대수선(리모델링)연도 — 엔진(`calcEffectiveResidualRate`)과 **같은 술어를 같은 인자로** 부른다.
    // 잔가율 할증은 상증에만 적용되므로 이 분기에 둔다.
    const remodelErr = remodelYearError(intOrUndef(f.remodelYear), builtYear, y);
    if (remodelErr) return remodelErr;

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

  // 단일 시점 모드 — 그 시점 필드만 검증한다(반대 시점은 폼에서도 숨겨져 입력 경로가 없다).
  // 동일연도(§164⑧)는 취득값이 양도값의 소스라 예외 없이 아래 2시점 검증을 그대로 적용한다.
  // (복합·공동주택 환산은 위에서 이미 return — 여기 도달하지 않는다.)
  if (f.singleTimePoint && !isSameAdjustmentPeriodConversion(acqY, transY, f.crossYearSameAdjust) && !f.isMechanicalParking) {
    if (f.singleTimePoint === "acquisition") {
      if (acqY === undefined) return "취득연도를 선택하세요.";
      // 취득 ≤2000은 2001년 지수표(산정기준율 환산)라 해당연도 지수 자료를 요구하지 않는다.
      if (acqY >= 2001 && (!hasUsageIndexYear(acqY) || !hasLocationIndexYear(acqY))) {
        return `${acqY}년 지수 자료가 없습니다.`;
      }
      if (!f.acqStructureKey) return "취득당시 건물 구조를 선택하세요.";
      if (intOrUndef(f.acqUsageNo) === undefined) return "취득당시 건물 용도를 선택하세요.";
      if (!(parseAmount(f.acqLandPrice) > 0)) return "취득당시 ㎡당 개별공시지가를 입력하세요.";
      return null;
    }
    if (transY === undefined) return "양도연도를 선택하세요.";
    if (!hasUsageIndexYear(transY) || !hasLocationIndexYear(transY)) {
      return `${transY}년 양도시 지수 자료가 없습니다.`;
    }
    if (!f.transStructureKey) return "양도당시 건물 구조를 선택하세요.";
    if (intOrUndef(f.transUsageNo) === undefined) return "양도당시 건물 용도를 선택하세요.";
    if (!(parseAmount(f.transLandPrice) > 0)) return "양도당시 ㎡당 개별공시지가를 입력하세요.";
    return null;
  }

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
  // 연도 교차 opt-in도 같은 필수 입력을 요구한다(엔진 진입 조건과 동일 축).
  const crossYearAdjust =
    !sameYear && f.crossYearSameAdjust && acqY !== undefined && transY !== undefined &&
    transY <= acqY + 1;
  if (!hasUsageIndexYear(transY) || !hasLocationIndexYear(transY)) return `${transY}년 양도시 지수 자료가 없습니다.`;
  if (!sameYear && !crossYearAdjust) {
    if (!f.transStructureKey) return "양도당시 건물 구조를 선택하세요.";
    if (intOrUndef(f.transUsageNo) === undefined) return "양도당시 건물 용도를 선택하세요.";
    if (!(parseAmount(f.transLandPrice) > 0)) return "양도당시 ㎡당 개별공시지가를 입력하세요.";
  }

  // 취득시 — 2000 이전은 2001년 지수표(산정기준율), 이후는 해당연도
  if (!f.acqStructureKey) return "취득당시 건물 구조를 선택하세요.";
  if (intOrUndef(f.acqUsageNo) === undefined) return "취득당시 건물 용도를 선택하세요.";
  if (!(parseAmount(f.acqLandPrice) > 0)) return "취득당시 ㎡당 개별공시지가를 입력하세요.";

  // 동일연도 환산
  if (sameYear || crossYearAdjust) {
    const hm = intOrUndef(f.holdingMonths);
    if (hm === undefined || hm <= 0) return "동일조정기간 양도는 보유월수를 입력하세요(1개월 미만=1).";
    const am = intOrUndef(f.adjustMonths);
    if (am === undefined || am <= 0) return "기준시가 조정월수를 입력하세요(연 1회 고시=12).";
    if (f.sameYearFormula === "new") {
      if (!(parseAmount(f.newNoticePrice) > 0)) return "새로운 기준시가 ㎡당 금액을 입력하세요.";
    } else if (
      // §80③2호 대체산정 경로에서는 지수표를 쓰지 않으므로 이 입력이 **불요**하다.
      // 엔진(`usesPriorStdPriceSubstitute`)과 **같은 술어·같은 인자**로 물어야 한다 —
      // 한쪽만 바뀌면 「입력했는데 무시」 또는 「없어도 되는데 차단」이 된다.
      !usesPriorStdPriceSubstitute(intOrUndef(f.acquisitionYear)) &&
      !(parseAmount(f.prevLandPrice) > 0)
    ) {
      return "취득전기(취득연도-1) ㎡당 공시지가를 입력하세요.";
    }
  }
  return null;
}
