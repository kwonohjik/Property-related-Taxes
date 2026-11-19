/**
 * 겸용주택 「수도권 여부」 필수 판정 — NBL2611-V4-HS06 (3-state: 미선택 / 수도권 / 수도권 밖).
 *
 * 부수토지 배율(「소득세법 시행령」 §168의12)은 용도지역 × 수도권 2축이다(`getHousingMultiplier` — 수도권 주·상·공 3배 / 수도권 녹지·수도권 밖 도시 5배 /
 * 도시지역 밖 10배, 2022.1.1. 전 양도는 도시지역 일률 5배). 종전에는 폼 기본값이 «수도권»(true)이고 ⑧이 묻지 않으며 엔진도 `?? true`라,
 * 수도권 밖 부동산을 토글을 건드리지 않고 입력하면 3배로 계산돼 인정 부수토지가 줄고 초과분이 비사업용 토지(+10%p·장특 배제)로 넘어갔다.
 *
 * 판정은 **이 leaf 하나**다 — ⑧(`transfer-tax-validate-mixed-area.ts`)·⑫(`transfer-tax-schema-mixed-metro-refine.ts`)·엔진 가드가 같은 함수를 부른다
 * (저장소 R-7 선례: 미입력을 «가장 작은 배율»로 두지 않고 묻는다 · 엔진 default를 «판정 생략»으로 바꾸면 조용한 비과세라 금지).
 *
 * ⚠️ **배율이 실제로 갈릴 때만** 요구한다 — 수도권이든 아니든 초과 면적이 같으면(부수토지가 두 배율 한도 안이거나, 용도지역이 도시지역 밖이라 10배로 같음)
 *    필요 없는 입력을 강제하는 오탐이 된다. 이 경우 값은 선택과 무관하다.
 */
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { computeDerivedAreas } from "./mixed-use-derived-areas";
import { getHousingMultiplier } from "./non-business-land/urban-area";
import type { ZoneType } from "./non-business-land/types";

/** 라벨(「자산 1」·「겸용주택」)을 뗀 본문 — ⑧은 자기 라벨을, 엔진·⑫는 「겸용주택」을 앞에 붙인다. */
export const MIXED_METRO_REQUIRED_DETAIL =
  "수도권 여부를 선택하세요 — 부수토지 배율이 수도권 주·상·공 3배 / 그 밖 도시 5배로 갈려 배율 초과분(비사업용 토지)이 달라집니다 (「소득세법 시행령」 §168의12·§154⑦).";

export const MIXED_METRO_REQUIRED_MESSAGE = `겸용주택: ${MIXED_METRO_REQUIRED_DETAIL}`;

/** 판정에 쓰는 겸용 입력 — 엔진 `MixedUseAssetInput`과 Zod 서브객체(`mixedUseAssetSchema`)가 모두 만족하는 좁은 모양. */
export interface MixedMetroSource {
  residentialFloorArea: number;
  nonResidentialFloorArea: number;
  buildingFootprintArea: number;
  totalLandArea: number;
  residentialLandAreaOverride?: number;
  commercialLandAreaOverride?: number;
  residentialFootprintOverride?: number;
  /** 미입력이면 엔진이 `"residential"`로 읽는다(`calcExcessLandRatio`). */
  zoneType?: ZoneType | string;
  /** 사용자가 고른 값 — `undefined`가 «미선택». */
  isMetropolitanArea?: boolean;
}

/**
 * 수도권 여부가 **초과 면적을 가르는데** 선택되지 않았는가.
 *
 * 비교 대상은 엔진이 배율 초과를 재는 두 기준이다 —
 *  · 단서 경로(§154③ 단서·고가·비과세 불성립): 주택 부수토지 × 주택 정착면적
 *  · OH-17(§154③ 본문 — 주택 연면적 > 주택 외 연면적): 전체 토지 × 건물 전체 정착면적 (비과세·12억 이하 여부는 여기서 알 수 없어 연면적 우열만 본다 — 과소 질문은 없고 과다 질문은 값이 같으면 없다)
 */
export function isMixedMetroSelectionRequired(a: MixedMetroSource, transferDate?: Date): boolean {
  if (a.isMetropolitanArea !== undefined) return false;
  const zone = (a.zoneType ?? "residential") as ZoneType;
  const multiplierOf = (isMetro: boolean) => getHousingMultiplier(zone, isMetro, transferDate).multiplier;
  const metro = multiplierOf(true);
  const outside = multiplierOf(false);
  if (metro === outside) return false;

  const derived = computeDerivedAreas({
    residentialFloorArea: a.residentialFloorArea,
    nonResidentialFloorArea: a.nonResidentialFloorArea,
    buildingFootprintArea: a.buildingFootprintArea,
    totalLandArea: a.totalLandArea,
    ...(a.residentialLandAreaOverride !== undefined ? { residentialLandAreaOverride: a.residentialLandAreaOverride } : {}),
    ...(a.commercialLandAreaOverride !== undefined ? { commercialLandAreaOverride: a.commercialLandAreaOverride } : {}),
    ...(a.residentialFootprintOverride !== undefined ? { residentialFootprintOverride: a.residentialFootprintOverride } : {}),
  });
  const excess = (land: number, footprint: number, m: number) => Math.max(0, land - footprint * m);
  const splitDiffers =
    excess(derived.residentialLandArea, derived.residentialFootprintArea, metro) !==
    excess(derived.residentialLandArea, derived.residentialFootprintArea, outside);
  if (splitDiffers) return true;
  if (a.residentialFloorArea > a.nonResidentialFloorArea) {
    return excess(a.totalLandArea, a.buildingFootprintArea, metro) !== excess(a.totalLandArea, a.buildingFootprintArea, outside);
  }
  return false;
}

/** 엔진 진입 가드 — ⑧·⑫가 먼저 막으므로 API 직접·내부 호출 방어용이다(기본값으로 계산하지 않는다). */
export function assertMixedMetroSelected(a: MixedMetroSource, transferDate: Date): void {
  if (isMixedMetroSelectionRequired(a, transferDate)) {
    throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, MIXED_METRO_REQUIRED_MESSAGE);
  }
}
