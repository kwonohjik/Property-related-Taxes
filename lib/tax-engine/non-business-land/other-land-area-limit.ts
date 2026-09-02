/**
 * 기타토지 §168의11① 호별 **기준면적 해석** — `other-land.ts`에서 분리 (800줄 정책, 2026-09-02).
 *
 * 판정 흐름(`judgeOtherLand`)은 그대로 두고, 「호별 기준면적을 몇 ㎡로 볼 것인가」와
 * 「§168의11⑥ 복합용도 안분」·「호별 legalBasis」만 이 파일이 담당한다.
 *
 * 자동산출(KoreanLaw 본문 검증): 7호 최대면적×1.2 · 4호 수용정원×200㎡ · 2호나 최저차고×1.5 · 13호 660㎡.
 * 직접입력(별표 의존): 1호(별표3/4/5) · 2호가목(설치기준면적) · 5호다(별표6) · 6호(휴양 합산면적).
 */

import { NBL } from "../legal-codes";
import type {
  AreaProportioning,
  NblRelatedBusinessType,
  OtherLandUsage,
  ZoneType,
} from "./types";
import { computeMixedUseProportioning } from "./utils/area-proportioning";
import {
  NBL_AREA_MULTIPLIER,
  SPORTS_OUTDOOR_STD,
  SPORTS_INDOOR_STD,
  SPORTS_BUSINESS_OUTDOOR_STD,
  SPORTS_BUSINESS_INDOOR_STD,
  RESERVE_FORCES_STD,
  employeeSportsArea,
} from "./data/area-standards";
import { LOCAL_TAX_ZONE_AREA_MULTIPLIER } from "./urban-area";
/**
 * 「지방세법 시행령」 제101조 제2항 용도지역별 적용배율.
 * 정본은 `urban-area.ts`의 `LOCAL_TAX_ZONE_AREA_MULTIPLIER` — 여기서 재선언 금지.
 * residential(세분 전 주거지역)·미정의는 자동 제외(직접입력 fallback) — 추정 금지.
 */
const ZONE_AREA_MULTIPLIER = LOCAL_TAX_ZONE_AREA_MULTIPLIER;

/** 별표3·4 비고2 5종목군(축구·야구·럭비·필드하키·미식축구) — 운동장 공유로 그 중 max1만 인정, 그 외 종목은 합산. */
const SPORTS_BIG_FIELD_GROUP = new Set(["soccer", "baseball", "rugby", "field_hockey", "american_football"]);

/**
 * 보유 종목 기준면적 합산 (별표3·4 비고2). 5종목군은 그 중 max1·그 외 종목은 합산.
 * 합산이 원칙(default)이고 비고2는 5종목군에만 두는 예외 제한 — 법 근거 없이 불리(단일 종목만) 적용 금지.
 */
export function sumSportsEvents(events: string[], lookup: (e: string) => number | undefined): number {
  let bigMax = 0;
  let othersSum = 0;
  for (const e of events) {
    const std = lookup(e);
    if (std === undefined) continue;
    if (SPORTS_BIG_FIELD_GROUP.has(e)) bigMax = Math.max(bigMax, std);
    else othersSum += std;
  }
  return bigMax + othersSum;
}

/**
 * 별표3·4 비고 가산·조정 (F2 Phase B B-2).
 * - 선수가산(테니스·연식정구): 2인 초과 2인마다 별표3 483㎡·별표4 725㎡(비고5/4).
 * - 실내 미설치(별표3 비고4·workplace 전용): 실내 운동경기부가 실내체육시설 미설치 시 800㎡.
 * 용도지역별 배율(비고1·3·지방세법 §101②)·종목합산(비고2 일반 다종목)은 cross-statute/명문부재 → 미구현(직접입력 유지).
 */
function applySportsNotes(
  base: number | undefined,
  o: OtherLandUsage,
  cat: "workplace" | "business",
): number | undefined {
  if (base === undefined) return undefined;
  let result = base;
  /**
   * 선수가산(테니스·연식정구) — 「2인마다」 = floor((선수수−2)/2)
   *
   * 🔴 **보유 형태(주종목/추가종목)를 구분하지 않는다** (V6-b, 2026-09-02 코드리뷰).
   *    별표3 비고5는 「**테니스장 또는 연식정구장의 경우에는** 선수 2인까지를 기준으로 하며 …」로
   *    그 종목이 주종목인지 추가 보유 종목인지를 나누지 않는다. 종전 조건은 `sportsFacilityType`
   *    (주종목)만 보아, 테니스를 추가 종목으로 고른 경우 표값 650은 더해지면서 가산은 0이 됐다
   *    — 기준면적 과소 → 비사업용 과대(**납세자 불리** 방향).
   */
  const hasTennis = [o.sportsFacilityType, ...(o.sportsExtraEvents ?? [])].some(
    (e) => e === "tennis" || e === "soft_tennis",
  );
  if (hasTennis && o.sportsPlayerCount !== undefined && o.sportsPlayerCount > 2) {
    result += Math.floor((o.sportsPlayerCount - 2) / 2) * (cat === "business" ? 725 : 483);
  }
  return result;
}

export function resolveAreaLimit(o: OtherLandUsage, zoneType?: ZoneType): number | undefined {
  const zoneMul = zoneType ? ZONE_AREA_MULTIPLIER[zoneType] : undefined;
  switch (o.relatedBusinessType) {
    case "hatchang":
      return o.maxAnnualArea !== undefined ? o.maxAnnualArea * NBL_AREA_MULTIPLIER.HATCHANG_RATIO : undefined;
    case "youth_training":
      return o.youthCapacity !== undefined ? o.youthCapacity * NBL_AREA_MULTIPLIER.YOUTH_PER_CAPITA : undefined;
    case "parking_garage":
      return o.minGarageArea !== undefined ? o.minGarageArea * NBL_AREA_MULTIPLIER.GARAGE_MULTIPLIER : undefined;
    case "vacant_lot_1household":
      return NBL_AREA_MULTIPLIER.VACANT_LOT_1HOUSEHOLD;
    case "sports": {
      // F2 Phase B — 체육시설 유형 분기: workplace(별표3)·business(별표4)·employee(별표5). 기본 workplace.
      const cat = o.sportsCategory ?? "workplace";
      if (cat === "employee") {
        // 별표5 종업원 체육시설 — 보유 시설별 기준면적 합산 (비고2: 50인↓ 코트만)
        const kinds = o.employeeFacilityKinds;
        const n = o.employeeCount;
        if (kinds && kinds.length > 0 && n !== undefined && n > 0) {
          if (n <= 50) return employeeSportsArea("court", n);
          // 별표5 비고3도 실내체육시설 부속토지에 §101② 용도지역별 배율을 적용한다 (E4-03).
          // 바닥면적·배율이 모두 확보된 경우에만 적용하고, 아니면 종전 표값을 유지한다.
          return kinds.reduce((sum, k) => {
            const std = employeeSportsArea(k, n);
            if (k === "indoor" && o.indoorFloorArea !== undefined && o.indoorFloorArea > 0 && zoneMul !== undefined) {
              return sum + Math.min(o.indoorFloorArea, std) * zoneMul;
            }
            return sum + std;
          }, 0);
        }
        return o.standardAreaLimit; // 시설 미선택·n≤0 → 직접입력 fallback
      }
      // workplace(별표3) | business(별표4) — 종목 합산(비고2: 5종목군 max1·그 외 합산) + 비고 가산
      const outdoor = cat === "business" ? SPORTS_BUSINESS_OUTDOOR_STD : SPORTS_OUTDOOR_STD;
      const indoor = cat === "business" ? SPORTS_BUSINESS_INDOOR_STD : SPORTS_INDOOR_STD;
      /**
       * 실내 종목의 바닥면적은 **자산당 단일 필드**다 — 종목 수만큼 중복 계상하지 않는다
       * (V6-a, 2026-09-02 코드리뷰). 별표3 비고1·3은 「실내체육시설**의** 건축물 바닥면적」에
       * 배율을 곱하도록 하지 실내 종목 수만큼 곱하라고 하지 않는다. 종전에는 실내 종목마다
       * `min(바닥, 표값) × 배율`을 독립 반환해 500㎡ 건물 하나가 두 번 배율을 먹었다
       * (실측 7,000 vs 3,500 — 기준면적 과대 → 비사업용 과소).
       * ⇒ 실내 바닥면적은 **첫 실내 종목에만** 배분하고, 나머지 실내 종목은 표값을 쓴다.
       */
      let indoorFloorConsumed = false;
      const lookupStd = (e: string): number | undefined => {
        const out = (outdoor as Record<string, number>)[e];
        if (out !== undefined) return out; // 실외 종목 — 표값(토지 면적)
        const ind = (indoor as Record<string, number>)[e];
        if (ind === undefined) return undefined;
        /**
         * 실내체육시설 미설치(별표3 비고4 — workplace 전용) → 800㎡.
         *
         * 🔴 **실내 종목분만** 대체한다 (E4-02). 종전에는 `applySportsNotes`가 합계 전체를
         *    800으로 갈아치워, 실외 종목(최대 야구장 14,000㎡)의 기준면적까지 통째로 사라졌다
         *    (실측 비사업용 비율 0 → 0.9304).
         */
        if (cat === "workplace" && o.indoorNotInstalled) return 800;
        // 실내 종목 부속토지(별표3·4·5 비고1·3): min(바닥, 표값) × §101② 용도지역 배율.
        // 바닥·배율 미확보 시 표값 fallback.
        if (
          !indoorFloorConsumed &&
          o.indoorFloorArea !== undefined &&
          o.indoorFloorArea > 0 &&
          zoneMul !== undefined
        ) {
          indoorFloorConsumed = true;
          return Math.min(o.indoorFloorArea, ind) * zoneMul;
        }
        return ind;
      };
      const events = [o.sportsFacilityType, ...(o.sportsExtraEvents ?? [])].filter(Boolean) as string[];
      // 주종목을 「선택 안 함」으로 되돌리면 잔존 추가종목이 직접입력을 조용히 덮었다 (E4-01) —
      // UI·⑧ 게이트가 「주종목 선택 OR 직접입력」이므로 엔진도 주종목 부재 시 직접입력으로 떨어진다.
      if (!o.sportsFacilityType) return o.standardAreaLimit;
      if (events.length === 0) return o.standardAreaLimit; // 종목 미선택 → 직접입력 fallback
      const summed = sumSportsEvents(events, lookupStd);
      // 종목 코드가 별표에 없어 전건 lookup 실패 → 0이 아니라 직접입력으로 떨어뜨린다 (E4-04)
      if (summed !== undefined && summed <= 0) return o.standardAreaLimit;
      return applySportsNotes(summed, o, cat === "business" ? "business" : "workplace");
    }
    case "reserve_forces": {
      // F2 Phase A — 별표6 부대편성인원×시설 합산, 미선택 시 standardAreaLimit fallback
      const size = o.reserveForcesUnitSize;
      const facilities = o.reserveForcesFacilities;
      if (size && facilities && facilities.length > 0) {
        // 부대편성인원 코드가 별표6 구간 밖이면 종전에는 `tier[f]`에서 TypeError → HTTP 500이었다.
        // 임의값을 대입하지 않고(자동 fallback 금지) 직접입력으로 떨어뜨린다 (E4-05).
        const tier = RESERVE_FORCES_STD[size];
        if (!tier) return o.standardAreaLimit;
        return facilities.reduce((sum, f) => sum + (tier[f] ?? 0), 0);
      }
      return o.standardAreaLimit;
    }
    case "parking_attached":
      return o.standardAreaLimit; // 2호가목 설치기준면적 직접입력 (미입력 시 undefined → 면적기준 미적용)
    case "resort": {
      // F2 Phase B(B-3) — 6호 휴양 §83의4⑫ 3요소 합산: 옥외 방목장·식물원 + 부설주차장×2 + 건축물 부속토지
      // 건축물 부속토지: 바닥면적 × §101②(지방세법 시행령) 용도지역별 배율(자동). 매핑 불가(residential 등) 시 부속토지 직접입력 fallback
      const building =
        o.resortBuildingFloorArea !== undefined && zoneMul !== undefined
          ? o.resortBuildingFloorArea * zoneMul
          : (o.resortBuildingAttachedArea ?? 0);
      const sum = (o.resortOutdoorArea ?? 0) + (o.resortParkingStdArea ?? 0) * 2 + building;
      return sum > 0 ? sum : o.standardAreaLimit; // 3요소 미입력 시 직접입력 fallback
    }
    default:
      return undefined; // etc_14호 · none · 미설정 → 면적기준 없음 (boolean 유지)
  }
}

/**
 * §168의11⑥ 복합용도 건축물 부속토지 안분 산출 (mode·면적 유효 시).
 * ⑥1호(single_building)=연면적비 · ⑥2호(multiple_buildings)=바닥면적비.
 * 분자·분모 미입력/0 이하면 undefined(⑥ 미적용 → ① 호별 경로). 분자>분모 클램프 없음(validate 차단).
 */
export function resolveMixedUseProportioning(
  o: OtherLandUsage,
  landArea: number,
): { ap: AreaProportioning; legalBasis: string } | undefined {
  const mode = o.mixedUseBuildingMode;
  if (mode === "single_building") {
    const num = o.specificUseFloorArea;
    const den = o.totalFloorArea;
    if (num === undefined || num <= 0 || den === undefined || den <= 0) return undefined;
    return { ap: computeMixedUseProportioning(landArea, num, den), legalBasis: NBL.OTHER_LAND_MIXED_USE_FLOOR };
  }
  if (mode === "multiple_buildings") {
    const num = o.specificUseFootprint;
    const den = o.totalFootprint;
    if (num === undefined || num <= 0 || den === undefined || den <= 0) return undefined;
    return { ap: computeMixedUseProportioning(landArea, num, den), legalBasis: NBL.OTHER_LAND_MIXED_USE_FOOTPRINT };
  }
  return undefined;
}

/** §168의11① 호별 면적기준 legalBasis. 미해당(14호·legacy)은 OTHER_LAND_BUSINESS. */
export function resolveAreaLegalBasis(t: NblRelatedBusinessType | undefined): string {
  switch (t) {
    case "sports":                return NBL.OTHER_LAND_AREA_SPORTS;
    case "parking_attached":      return NBL.OTHER_LAND_AREA_PARKING;
    case "parking_garage":        return NBL.OTHER_LAND_AREA_GARAGE;
    case "youth_training":        return NBL.OTHER_LAND_AREA_YOUTH;
    case "reserve_forces":        return NBL.OTHER_LAND_AREA_RESERVE;
    case "resort":                return NBL.OTHER_LAND_AREA_RESORT;
    case "hatchang":              return NBL.OTHER_LAND_AREA_HATCHANG;
    case "vacant_lot_1household": return NBL.OTHER_LAND_AREA_VACANT_LOT;
    default:                      return NBL.OTHER_LAND_BUSINESS;
  }
}
