/**
 * D7. 개별건물 특성 조정율 (상속·증여 전용)
 *
 * 출처: 국세청 「상속세 및 증여세법상 건물평가시 적용할 조정률」(첨부 PDF 4p) — 7구분 37항목 + 적용요령.
 * PDF 전수 실측(2026-06-10).
 *
 * 적용요령:
 *   (1) 개별건물 특성 조정률은 **상속세·증여세에만 적용, 양도소득세 과세시 미적용**.
 *   (2) 여러 구분(I~VII)에 중복 해당 시 각 구분 조정률을 **곱하여 중복 적용**.
 *   (3) 구분 II 최고층수: 지하층·옥탑 제외. 복합건물은 해당 건물 전체 최고층수, 주거용은 아파트만 적용.
 *   (4) 구분 II 연면적: 지하층·옥탑 포함 전체면적 기준. 주거용 건물은 연면적 조정률 미적용.
 *
 * 구분별 선택 규칙(엔진 §조정율 알고리즘에서 적용):
 *   I   지붕재료: **구조지수<100일 때만**, 1개. (통나무조는 미적용 — 통나무조 구조지수≥100)
 *   II  최고층수/연면적/지능형: 해당 항목 중 **가장 높은 지수 1개**.
 *   III 단독/공동주택: **가장 높은 지수 1개**.
 *   IV  상가·부속: **가장 낮은 지수 1개**. 단 20~23 해당 + 24·25 동시 해당이면 60.
 *       (주차전용빌딩은 IV 미적용 — 비고.)
 *   V   개축(일부): 해당 1개. 전부개축은 개축년도=신축년도(미적용).
 *   VI  무벽건물(입증): 무벽면적비율로 구간 판정.
 *   VII 구조진단/철거(입증): **가장 낮은 지수 1개**. 37=정상사용면적비율을 율로 적용.
 */

import type { SpecialAdjustmentFeatures } from "../../types/building-standard-price.types";

/** 조정율 기준값(미해당 = 100 = 무영향) */
export const ADJUSTMENT_RATE_BASE = 100;

/**
 * 복합구조 특성 적용단위 키셋 (상증).
 * - 건물 전체(전 부분 공유): I 지붕재료·II 최고층수·II 지능형·III 주택유형. (II 연면적은 자동·필드 없음)
 *   근거: 적용요령(3) "복합건물은 해당 건물 전체 최고층수". I 지붕은 1개·부분 구조지수<100일 때만 적용(엔진 게이트).
 * - 부분별: IV 상가층·부속, V 개축, VI 무벽, VII 구조진단·화재.
 * 단일모드 잔존 특성 오염 방지를 위해 경계(toEngineInput)에서 pickFeatures로 필터.
 */
export const BUILDING_WIDE_FEATURE_KEYS = [
  "roofMaterial",
  "maxFloors",
  "intelligentBuildingGrade",
  "houseTypeTier",
] as const satisfies readonly (keyof SpecialAdjustmentFeatures)[];

export const PART_FEATURE_KEYS = [
  "commercialFloor",
  "ancillaryParking",
  "remodelCount",
  "wallessRatio",
  "structuralSafety",
  "normalUseRatio",
] as const satisfies readonly (keyof SpecialAdjustmentFeatures)[];

/** 지정 키만 추린 특성 객체. 추린 결과가 빈 객체면 undefined(무영향). */
export function pickFeatures(
  f: SpecialAdjustmentFeatures | null | undefined,
  keys: readonly (keyof SpecialAdjustmentFeatures)[],
): SpecialAdjustmentFeatures | undefined {
  if (!f) return undefined;
  const out: SpecialAdjustmentFeatures = {};
  for (const k of keys) {
    if (f[k] !== undefined) (out[k] as SpecialAdjustmentFeatures[typeof k]) = f[k];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** I 지붕재료 (구조지수<100일 때만) — 번호 → 지수 */
export const ROOF_MATERIAL_RATE: Readonly<Record<1 | 2 | 3, number>> = Object.freeze({
  1: 100, // 슬래브·기와·토기와·시멘트기와·한식기와·오지기와·아스팔트싱글·동싱글·천연슬레이트·동판·구리·징크(아연)·기타 신소재
  2: 80, // 패널(칼라아연도강판 포함)·유리(폴리카보네이트·FRP 포함)·슬레이트(강판 슬레이트 포함)
  3: 60, // 함석·자연석·천막·초가·썬라이트·너와·기타 이와 유사한 것
});

/** II 최고층수 — 번호 → {최소층, 지수}. maxFloors(지하·옥탑 제외)로 구간 판정 */
export const MAX_FLOORS_RATE: ReadonlyArray<{ no: 4 | 5 | 6 | 7 | 8; minFloors: number; rate: number }> =
  Object.freeze([
    { no: 4, minFloors: 0, rate: 90 }, // 5층 이하
    { no: 5, minFloors: 6, rate: 100 }, // 6층 이상~10층 이하
    { no: 6, minFloors: 11, rate: 110 }, // 11층 이상~15층 이하
    { no: 7, minFloors: 16, rate: 120 }, // 16층 이상~20층 이하
    { no: 8, minFloors: 21, rate: 130 }, // 21층 이상
  ]);

/** II 연면적 — 번호 → {최소면적(㎡), 지수}. 주거용 미적용 */
export const GROSS_AREA_RATE: ReadonlyArray<{ no: 9 | 10 | 11 | 12 | 13; minArea: number; rate: number }> =
  Object.freeze([
    { no: 9, minArea: 0, rate: 90 }, // 1천㎡ 미만
    { no: 10, minArea: 1000, rate: 100 }, // 1천㎡ 이상~5천㎡ 미만
    { no: 11, minArea: 5000, rate: 110 }, // 5천㎡ 이상~1만㎡ 미만
    { no: 12, minArea: 10000, rate: 120 }, // 1만㎡ 이상~5만㎡ 미만
    { no: 13, minArea: 50000, rate: 130 }, // 5만㎡ 이상
  ]);

/** II 지능형(인텔리전트시스템)빌딩 — 등급 → 지수 */
export const INTELLIGENT_BUILDING_RATE: Readonly<Record<"3-4" | "1-2", number>> = Object.freeze({
  "3-4": 110, // 14: 인증 3등급·4등급
  "1-2": 120, // 15: 인증 1등급·2등급
});

/** III 단독/공동주택 — 번호 → 지수 */
export const HOUSE_TYPE_RATE: Readonly<Record<16 | 17 | 18 | 19, number>> = Object.freeze({
  16: 120, // 단독 연면적 264㎡ 이상~331㎡ 미만
  17: 140, // 단독 연면적 331㎡ 이상
  18: 120, // 공동 전유면적 149㎡ 이상~215㎡ 미만
  19: 140, // 공동 전유면적 215㎡ 이상
});

/** IV 상가층 — 번호 → 지수 */
export const COMMERCIAL_FLOOR_RATE: Readonly<Record<20 | 21 | 22 | 23, number>> = Object.freeze({
  20: 120, // 상가의 1층
  21: 105, // 상가의 2층
  22: 80, // 최고층수 5층 이하 건물의 지하1층
  23: 70, // 최고층수 5층 이하 건물의 지하2층 이상
});

/** IV 부속·주차 — 번호 → 지수 */
export const ANCILLARY_RATE: Readonly<Record<24 | 25, number>> = Object.freeze({
  24: 60, // 주차장(지하 포함)·기계실·보일러실·대피소·옥탑·물탱크실
  25: 50, // 주택간이부속건물(창고·화장실·세면장 등)
});

/** IV 특례: 20~23 해당 + 24·25 동시 해당이면 60 (비고) */
export const COMMERCIAL_WITH_ANCILLARY_RATE = 60;

/** V 개축(일부) — 번호 → 지수 */
export const REMODEL_COUNT_RATE: Readonly<Record<26 | 27, number>> = Object.freeze({
  26: 110, // 1회 개축
  27: 120, // 2회 이상 개축
});

/** VI 무벽건물 무벽면적비율 — 번호 → {최소비율, 지수}. 납세자 입증 시 */
export const WALLESS_RATE: ReadonlyArray<{ no: 28 | 29 | 30; minRatio: number; rate: number }> =
  Object.freeze([
    { no: 28, minRatio: 0.25, rate: 80 }, // 1/4 초과~2/4 미만
    { no: 29, minRatio: 0.5, rate: 70 }, // 2/4 이상~3/4 미만
    { no: 30, minRatio: 0.75, rate: 60 }, // 3/4 이상
  ]);

/** VII 구조안전진단/철거 — 번호 → 지수. 입증 시. 37(화재멸실)은 정상사용면적비율을 율로 */
export const STRUCTURAL_SAFETY_RATE: Readonly<Record<31 | 32 | 33 | 34 | 35 | 36, number>> = Object.freeze({
  31: 90, // B급: 보조부재 경미결함
  32: 80, // C급: 보조부재 손상
  33: 60, // D급: 주요부재 손상
  34: 30, // E급: 주요부재 심각한 결함
  35: 30, // 철거대상 건물 — 사용하는 경우
  36: 0, // 철거대상 건물 — 사용하지 않는 경우
});

/** VII-37 화재·지진 등 멸실: 정상적으로 사용되는 면적비율을 조정률로 적용(0~1 → ×100%) */

/**
 * 조정율 특성 번호(1~37) → 표시 라벨(인쇄·적용요령용, 축약). 산식 무관 표시 전용.
 * ⚠️ 번호 #1(지붕)은 카테고리 라벨 — 입력에서 실제 재료(징크·기와 등)를 구분하지 않으므로 대표 라벨로 표시.
 */
export const ADJUSTMENT_FEATURE_LABEL: Readonly<Record<number, string>> = Object.freeze({
  1: "슬래브·기와·징크 등 지붕",
  2: "패널·유리·슬레이트 등 지붕",
  3: "함석·천막·초가 등 지붕",
  4: "5층 이하",
  5: "6~10층",
  6: "11~15층",
  7: "16~20층",
  8: "21층 이상",
  9: "연면적 1천㎡ 미만",
  10: "연면적 1천~5천㎡",
  11: "연면적 5천~1만㎡",
  12: "연면적 1만~5만㎡",
  13: "연면적 5만㎡ 이상",
  14: "지능형 3·4등급",
  15: "지능형 1·2등급",
  16: "단독주택 264~331㎡",
  17: "단독주택 331㎡ 이상",
  18: "공동주택 149~215㎡",
  19: "공동주택 215㎡ 이상",
  20: "상가 1층",
  21: "상가 2층",
  22: "5층이하 건물 지하1층",
  23: "5층이하 건물 지하2층 이하",
  24: "주차장·기계실·보일러실 등",
  25: "주택 간이부속건물",
  26: "개축 1회",
  27: "개축 2회 이상",
  28: "무벽 1/4초과~2/4",
  29: "무벽 2/4~3/4",
  30: "무벽 3/4 이상",
  31: "구조안전진단 B급",
  32: "구조안전진단 C급",
  33: "구조안전진단 D급",
  34: "구조안전진단 E급",
  35: "철거대상(사용)",
  36: "철거대상(미사용)",
  37: "화재·멸실 정상사용면적비율",
});

// ── 구간 판정 헬퍼 (실제값 → 지수) ──

/** 최고층수(지하·옥탑 제외) → 지수 */
export function resolveMaxFloorsRate(maxFloors: number): number {
  let rate = MAX_FLOORS_RATE[0].rate;
  for (const b of MAX_FLOORS_RATE) {
    if (maxFloors >= b.minFloors) rate = b.rate;
  }
  return rate;
}

/** 최고층수 → 적용 번호(4~8) */
export function resolveMaxFloorsNo(maxFloors: number): 4 | 5 | 6 | 7 | 8 {
  let no: 4 | 5 | 6 | 7 | 8 = MAX_FLOORS_RATE[0].no;
  for (const b of MAX_FLOORS_RATE) {
    if (maxFloors >= b.minFloors) no = b.no;
  }
  return no;
}

/** 연면적(㎡) → 지수 */
export function resolveGrossAreaRate(grossArea: number): number {
  let rate = GROSS_AREA_RATE[0].rate;
  for (const b of GROSS_AREA_RATE) {
    if (grossArea >= b.minArea) rate = b.rate;
  }
  return rate;
}

/** 연면적(㎡) → 적용 번호(9~13) */
export function resolveGrossAreaNo(grossArea: number): 9 | 10 | 11 | 12 | 13 {
  let no: 9 | 10 | 11 | 12 | 13 = GROSS_AREA_RATE[0].no;
  for (const b of GROSS_AREA_RATE) {
    if (grossArea >= b.minArea) no = b.no;
  }
  return no;
}

/** 무벽면적비율(0~1) → 적용 번호(28~30) 또는 미적용(undefined) */
export function resolveWallessNo(ratio: number): 28 | 29 | 30 | undefined {
  if (ratio >= 0.75) return 30;
  if (ratio >= 0.5) return 29;
  if (ratio > 0.25) return 28;
  return undefined;
}

/**
 * 무벽면적비율(0~1) → 지수.
 * 28번은 "1/4 **초과**~2/4 미만"(strict) / 29·30번은 "이상"(inclusive). 1/4 이하면 미적용(100).
 */
export function resolveWallessRate(ratio: number): number {
  if (ratio >= 0.75) return 60; // 30: 3/4 이상
  if (ratio >= 0.5) return 70; // 29: 2/4 이상~3/4 미만
  if (ratio > 0.25) return 80; // 28: 1/4 초과~2/4 미만
  return ADJUSTMENT_RATE_BASE; // 1/4 이하 미적용
}

/**
 * 조정율 번호(1~36) → 지수(정수, 100기준) 통합 맵. 분산 테이블의 단일 출처 집계.
 * 37(화재·멸실 정상사용면적비율)은 비율 입력형 → 번호 입력 비대상(undefined).
 * 계산서 Ⅲ·Ⅳ "조정률(번호)" 칸 입력(상증 전용)을 지수로 변환.
 */
const ADJUSTMENT_RATE_BY_NO: Readonly<Record<number, number>> = Object.freeze({
  ...ROOF_MATERIAL_RATE, // 1~3
  ...Object.fromEntries(MAX_FLOORS_RATE.map((b) => [b.no, b.rate])), // 4~8
  ...Object.fromEntries(GROSS_AREA_RATE.map((b) => [b.no, b.rate])), // 9~13
  14: INTELLIGENT_BUILDING_RATE["3-4"], // 14
  15: INTELLIGENT_BUILDING_RATE["1-2"], // 15
  ...HOUSE_TYPE_RATE, // 16~19
  ...COMMERCIAL_FLOOR_RATE, // 20~23
  ...ANCILLARY_RATE, // 24~25
  ...REMODEL_COUNT_RATE, // 26~27
  ...Object.fromEntries(WALLESS_RATE.map((b) => [b.no, b.rate])), // 28~30
  ...STRUCTURAL_SAFETY_RATE, // 31~36
});

/** 조정율 번호(1~36) → 지수. 미수록(0·37·범위 외) = undefined(검증 오류 처리). */
export function resolveAdjustmentRateByNo(no: number): number | undefined {
  return ADJUSTMENT_RATE_BY_NO[no];
}
