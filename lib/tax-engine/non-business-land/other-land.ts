/**
 * 기타토지 판정 (§168-11, PDF p.1706~1707 흐름도 1:1)
 *
 * 판정 순서:
 *   Step 0     나대지 간주 검증 (건축물시가표준액 < 토지 × 2% → 재산세 별도합산 제외, 소득세법 §104의3①4호나목·지방세법 시행령 §101①2호나목)
 *   Step 3-1   재산세 종합합산이 아닌 토지 + 기간기준 → 사업용
 *   Step 3-1-1 거주·사업관련 토지 + 기간기준 → 사업용
 *   둘 다 미달 → 비사업용
 */

import { differenceInDays } from "date-fns";
import { NBL } from "../legal-codes";
import type {
  AreaProportioning,
  CategoryJudgeResult,
  DateInterval,
  JudgmentStep,
  NblRelatedBusinessType,
  NonBusinessLandInput,
  NonBusinessLandJudgmentRules,
  OtherLandUsage,
  PropertyTaxType,
  RevenueTestResult,
  ZoneType,
} from "./types";
import { getPeriodJudgmentDate, meetsPeriodCriteria, type PeriodCriteriaResult } from "./period-criteria";
import { getOwnershipStart } from "./utils/period-math";
import { computeAreaProportioning, computeMixedUseProportioning } from "./utils/area-proportioning";
import { computeContiguousParcelNblAttribution } from "./utils/contiguous-parcel-proportioning";
import {
  NBL_AREA_MULTIPLIER,
  SPORTS_OUTDOOR_STD,
  SPORTS_INDOOR_STD,
  SPORTS_BUSINESS_OUTDOOR_STD,
  SPORTS_BUSINESS_INDOOR_STD,
  RESERVE_FORCES_STD,
  employeeSportsArea,
} from "./data/area-standards";
import { computeRevenueTest } from "./revenue-test";
import { LOCAL_TAX_ZONE_AREA_MULTIPLIER } from "./urban-area";
import { judgeFactoryLandExcess } from "./factory-land-standard-area";

/**
 * 나대지 간주 (소득세법 §104의3①4호나목 + 지방세법 시행령 §101①2호나목·단서 — 재산세 별도합산 제외 → 비사업용):
 * - 건축물시가표준액 < 부속토지 시가표준액 × 2% → 건축물 없는 토지로 봄 (지방세법 시행령 §101①2호나목)
 * - 무허가·사용승인 없는 건축물 부속토지 → 건축물 없는 토지로 봄 (지방세법 시행령 §101①단서)
 * 결과적으로 propertyTaxType을 "종합합산"으로 조정.
 */
export function isBareLand(input: NonBusinessLandInput): boolean {
  const o = input.otherLand;
  if (!o) return false;
  if (!o.hasBuilding) return true;
  if (o.buildingStandardValue !== undefined && o.landStandardValue !== undefined) {
    if (o.buildingStandardValue < o.landStandardValue * 0.02) return true;
  }
  return false;
}

/**
 * §168의11① 호별 기준면적(㎡) 해석. undefined = 면적기준 없는 호(14호·none) → boolean 유지.
 *
 * 자동산출(KoreanLaw 본문 검증): 7호 최대면적×1.2 · 4호 수용정원×200㎡ · 2호나 최저차고×1.5 · 13호 660㎡.
 * 직접입력(별표 의존): 1호(별표3/4/5) · 2호가목(설치기준면적) · 5호다(별표6) · 6호(휴양 합산면적).
 */
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
function sumSportsEvents(events: string[], lookup: (e: string) => number | undefined): number {
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
  // 선수가산(테니스·연식정구) — "2인마다" = floor((선수수−2)/2)
  if (
    (o.sportsFacilityType === "tennis" || o.sportsFacilityType === "soft_tennis") &&
    o.sportsPlayerCount !== undefined &&
    o.sportsPlayerCount > 2
  ) {
    result += Math.floor((o.sportsPlayerCount - 2) / 2) * (cat === "business" ? 725 : 483);
  }
  // 실내 미설치(별표3 비고4 — workplace 전용) → 800
  if (cat === "workplace" && o.indoorNotInstalled) {
    result = 800;
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
          return kinds.reduce((sum, k) => sum + employeeSportsArea(k, n), 0);
        }
        return o.standardAreaLimit; // 시설 미선택·n≤0 → 직접입력 fallback
      }
      // workplace(별표3) | business(별표4) — 종목 합산(비고2: 5종목군 max1·그 외 합산) + 비고 가산
      const outdoor = cat === "business" ? SPORTS_BUSINESS_OUTDOOR_STD : SPORTS_OUTDOOR_STD;
      const indoor = cat === "business" ? SPORTS_BUSINESS_INDOOR_STD : SPORTS_INDOOR_STD;
      const lookupStd = (e: string): number | undefined => {
        const out = (outdoor as Record<string, number>)[e];
        if (out !== undefined) return out; // 실외 종목 — 표값(토지 면적)
        const ind = (indoor as Record<string, number>)[e];
        if (ind === undefined) return undefined;
        // 실내 종목 부속토지(별표3·4·5 비고1·3): min(바닥, 표값) × §101② 용도지역 배율. 바닥·배율 미확보 시 표값 fallback
        if (o.indoorFloorArea !== undefined && o.indoorFloorArea > 0 && zoneMul !== undefined) {
          return Math.min(o.indoorFloorArea, ind) * zoneMul;
        }
        return ind;
      };
      const events = [o.sportsFacilityType, ...(o.sportsExtraEvents ?? [])].filter(Boolean) as string[];
      if (events.length === 0) return o.standardAreaLimit; // 종목 미선택 → 직접입력 fallback
      return applySportsNotes(sumSportsEvents(events, lookupStd), o, cat === "business" ? "business" : "workplace");
    }
    case "reserve_forces": {
      // F2 Phase A — 별표6 부대편성인원×시설 합산, 미선택 시 standardAreaLimit fallback
      const size = o.reserveForcesUnitSize;
      const facilities = o.reserveForcesFacilities;
      if (size && facilities && facilities.length > 0) {
        const tier = RESERVE_FORCES_STD[size];
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
function resolveMixedUseProportioning(
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
function resolveAreaLegalBasis(t: NblRelatedBusinessType | undefined): string {
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

export function judgeOtherLand(
  input: NonBusinessLandInput,
  rules: NonBusinessLandJudgmentRules,
): CategoryJudgeResult {
  const steps: JudgmentStep[] = [];
  const appliedLaws: string[] = [NBL.OTHER_LAND];
  const warnings: string[] = [];

  const ownershipStart = getOwnershipStart(input.acquisitionDate);
  // §168조의14② 양도일 의제 — §168조의6 기간기준 전용
  const pjDate = getPeriodJudgmentDate(input);
  const totalOwnershipDays = Math.max(0, differenceInDays(pjDate, ownershipStart));

  const o = input.otherLand;
  if (!o) {
    steps.push({
      id: "other_missing",
      label: "기타토지 사용현황 입력",
      status: "FAIL",
      detail: "사용현황 미입력",
      legalBasis: NBL.OTHER_LAND,
    });
    return {
      isBusiness: false,
      reason: "기타토지 사용현황 미입력",
      steps,
      appliedLaws,
      totalOwnershipDays,
      effectiveBusinessDays: 0,
      gracePeriodDays: 0,
      businessUseRatio: 0,
      criteria: { rule2of3Years: false, rule5Years: false, rule80Percent: false },
      warnings,
    };
  }

  // Step 0: 나대지 간주
  const bareLand = isBareLand(input);
  const effectiveTaxType: PropertyTaxType = bareLand ? "comprehensive" : o.propertyTaxType;
  steps.push({
    id: "other_bare_land",
    label: "Step 0 나대지 간주 검증 (2% 기준)",
    status: bareLand ? "FAIL" : "PASS",
    detail: bareLand
      ? (o.hasBuilding
          ? `건축물 시가표준액 < 토지 시가표준액 × 2% → 별도합산 제외(종합합산 취급)`
          : `건축물 없는 토지(나대지) → 종합합산 취급`)
      : `건축물 부속토지 (원 재산세 유형 유지: ${o.propertyTaxType})`,
    legalBasis: NBL.OTHER_LAND,
  });

  const fullPeriod: DateInterval[] = [{ start: ownershipStart, end: pjDate }];

  // ── Step 0.5: 공장용 건축물 부속토지 기준면적 — **판정만** (적용은 Step 3-2 직전) ──
  // 「소득세법」 §104의3①4호나목이 제외하는 것은 재산세 별도합산·분리과세 대상 토지인데,
  // 공장 부속토지는 두 경로 모두 **면적 한도**가 있다(§102①1호 별표6 / §101①1호 배율).
  // 한도 초과분은 §106①1호 종합합산으로 떨어져 나목의 제외에서 벗어난다.
  //
  // ⚠️ **초과라고 해서 여기서 곧바로 비사업용으로 확정하면 안 된다.** §104의3①4호는
  // "다음 각 목을 **제외한** 토지"를 비사업용으로 규정하므로 가·나·다목 중 **어느 하나**에
  // 해당하면 사업용이다. 나목(공장 한도)에 미달해도 **다목**(§168의11① 호별 기준면적,
  // ② 수입금액비율)에 해당하면 여전히 사업용이다 — 먼저 확정하면 법 근거 없는 불리 적용이 된다.
  // Step 3-2(§101①2호나목)가 같은 이유로 뒤에 놓여 있다.
  //
  // 여기서 하는 일은 두 가지뿐이다:
  //   (1) 한도 이내면 재산세 구분을 확정해 Step 3-1이 나목으로 통과시키게 한다
  //   (2) 한도 초과면 결과만 보관하고 판단을 미룬다
  let factoryTaxTypeOverride: PropertyTaxType | undefined;
  let factoryExcess: ReturnType<typeof judgeFactoryLandExcess> | undefined;
  let factoryLegalBasis: string | undefined;
  if (o.factory) {
    const f = judgeFactoryLandExcess(o.factory, input.landArea, "기타토지(공장)");
    factoryLegalBasis =
      f.route === "separate_taxation" ? NBL.FACTORY_LAND_SEPARATE : NBL.FACTORY_LAND_AGGREGATE;
    appliedLaws.push(factoryLegalBasis);

    if (f.isWithinLimit) {
      steps.push({
        id: "other_factory_area",
        label: "Step 0.5 공장용 건축물 부속토지 기준면적",
        status: "PASS",
        detail: `${f.detail} ≥ 부속토지 ${input.landArea}㎡ → 전량 사업용`,
        legalBasis: factoryLegalBasis,
      });
      // 한도 이내 — 재산세 구분을 경로에 맞게 확정한다. 사용자가 `propertyTaxType`을
      // 종합합산으로 두었더라도 §104의3①4호나목은 「지방세법」상 **해당 여부**를 묻지
      // 실제 부과 내용을 따르지 않는다(조심 2025서2489 — "재산세 경정 여부와 무관하게").
      factoryTaxTypeOverride = f.route === "separate_taxation" ? "special_sum" : "separate";
    } else {
      factoryExcess = f;
    }
  }

  // ── Step 3-1: 재산세 종합합산이 아닌 토지 + 기간기준 ───────────────
  // 공장이 입력된 경우 나목 해당 여부는 **한도 판정 결과**가 정한다 — 초과면 나목에
  // 해당하지 않으므로 사용자가 고른 `propertyTaxType`으로 통과시키지 않는다.
  const isNonComprehensive = o.factory
    ? factoryTaxTypeOverride !== undefined
    : effectiveTaxType !== "comprehensive";

  // ── §168의11② 수입금액비율 (2호다목·10·11다·12호 특정 업종) ──────────
  let revenueTestDetail: RevenueTestResult | undefined;
  if (input.revenueTest && input.revenueTest.businessType !== "none") {
    revenueTestDetail = computeRevenueTest(input.revenueTest);
    steps.push({
      id: "other_revenue_test",
      label: "§168의11② 수입금액비율",
      status: revenueTestDetail.pass ? "PASS" : "FAIL",
      detail: revenueTestDetail.detail,
      legalBasis: NBL.REVENUE_TEST,
    });
    if (revenueTestDetail.pass) {
      appliedLaws.push(NBL.REVENUE_TEST);
      const r = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, pjDate, "other_land", rules, input.gracePeriods);
      return buildPass(`수입금액비율 충족 (${revenueTestDetail.businessType})`, steps, appliedLaws, warnings, {
        r, totalOwnershipDays, revenueTestDetail,
      });
    }
  }

  if (isNonComprehensive) {
    const r = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, pjDate, "other_land", rules, input.gracePeriods);
    if (r.meets) {
      steps.push({
        id: "other_tax_type_criteria",
        label: "Step 3-1 비종합합산(비과세·분리·별도) + 기간기준",
        status: "PASS",
        detail: `재산세 ${effectiveTaxType} + 기간기준 충족`,
        legalBasis: NBL.OTHER_LAND,
      });
      return buildPass(`재산세 ${effectiveTaxType} + 기간기준 충족`, steps, appliedLaws, warnings, {
        r, totalOwnershipDays, revenueTestDetail,
      });
    }
    steps.push({
      id: "other_tax_type_criteria",
      label: "Step 3-1 비종합합산(비과세·분리·별도) + 기간기준",
      status: "FAIL",
      detail: `재산세 ${effectiveTaxType}이나 기간기준 미충족 — ${r.detail}`,
      legalBasis: NBL.OTHER_LAND,
    });
  } else {
    steps.push({
      id: "other_tax_type_criteria",
      label: "Step 3-1 비종합합산 여부",
      status: "FAIL",
      // 공장은 「전량 종합합산」이 아니라 「한도 초과분만 종합합산」이다 — 뭉뚱그리면
      // 뒤따르는 부분 안분 결과와 문구가 어긋난다.
      detail: factoryExcess
        ? "공장 기준면적 초과분이 종합합산 — 나목(별도합산·분리과세)으로는 전량 사업용이 되지 않는다"
        : "재산세 종합합산과세대상 (원칙 비사업용)",
      legalBasis: NBL.OTHER_LAND,
    });
  }

  // ── Step 3-1-1: §168의11① 거주·사업관련 토지 (호별 면적기준) ──────────
  // relatedBusinessType(호) 우선, 미설정 시 legacy isRelatedToResidenceOrBusiness fallback.
  const relatedType = o.relatedBusinessType;
  const isRecognizedHo = relatedType !== undefined && relatedType !== "none";
  // §168의11⑥ 복합용도 건축물 부속토지 안분 — 건축물에 거주·특정사업 사용분(특정용도분)이 있으면
  // 그 자체가 거주·사업관련(isRelated)에 해당 → mode 단독으로도 isRelated 의제.
  const mixedUse = resolveMixedUseProportioning(o, input.landArea);
  const isRelated = isRecognizedHo || o.isRelatedToResidenceOrBusiness || mixedUse !== undefined;

  if (isRelated) {
    const r = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, pjDate, "other_land", rules, input.gracePeriods);
    const legalBasis = resolveAreaLegalBasis(relatedType);

    if (!r.meets) {
      steps.push({
        id: "other_residence_business",
        label: "Step 3-1-1 거주·사업관련 토지 + 기간기준",
        status: "FAIL",
        detail: `거주·사업관련이나 기간기준 미충족 — ${r.detail}`,
        legalBasis,
      });
      return buildFail("거주·사업관련 토지이나 기간기준 미충족", steps, appliedLaws, warnings, {
        r, totalOwnershipDays, revenueTestDetail,
      });
    }

    // ── §168의11⑥ 복합용도 건축물 부속토지 안분 (⑥ 단독 — ① 호별 기준면적 미적용·이중차감 방지) ──
    // 기간기준(§168의6) 충족 후 진입. 특정용도분(거주·특정사업 사용분)만 사업용, 잔여 부속토지는 비사업용.
    if (mixedUse) {
      appliedLaws.push(mixedUse.legalBasis);
      const pctBiz = (mixedUse.ap.mixedUseBuildingRatio ?? 0) * 100;
      if (mixedUse.ap.nonBusinessRatio <= 0) {
        // 부속토지 전부가 특정용도분(거주·특정사업) → 전량 사업용
        steps.push({
          id: "other_mixed_use",
          label: "Step 3-1-1 §168의11⑥ 복합용도 건축물 부속토지 안분",
          status: "PASS",
          detail: `특정용도분 비율 ${pctBiz.toFixed(1)}% → 부속토지 전량 사업용`,
          legalBasis: mixedUse.legalBasis,
        });
        return buildPass("복합용도 건축물 — 특정용도분 부속토지 전량 사업용 (§168의11⑥)", steps, appliedLaws, warnings, {
          r, totalOwnershipDays, revenueTestDetail,
        });
      }
      steps.push({
        id: "other_mixed_use",
        label: "Step 3-1-1 §168의11⑥ 복합용도 건축물 부속토지 안분",
        status: "FAIL",
        detail: `특정용도분 비율 ${pctBiz.toFixed(1)}% → 사업용 ${mixedUse.ap.businessArea.toFixed(1)}㎡·비사업용(종합합산) ${mixedUse.ap.nonBusinessArea.toFixed(1)}㎡`,
        legalBasis: mixedUse.legalBasis,
      });
      return {
        isBusiness: false,
        reason: `복합용도 건축물 — 특정용도분(${pctBiz.toFixed(1)}%)만 사업용·잔여 비사업용 (§168의11⑥)`,
        steps,
        appliedLaws,
        areaProportioning: mixedUse.ap,
        totalOwnershipDays,
        effectiveBusinessDays: r.effectiveBusinessDays,
        gracePeriodDays: r.gracePeriodDays,
        businessUseRatio: mixedUse.ap.nonBusinessRatio,
        criteria: r.criteria,
        revenueTestDetail,
        warnings,
      };
    }

    appliedLaws.push(legalBasis);

    const areaLimit = resolveAreaLimit(o, input.zoneType);

    // ── §168의11⑤ 연접 다필지 취득시기순 안분 (parcels 제공 시 — 호별 기준면적 초과분을 늦은 필지부터 귀속) ──
    if (o.parcels && o.parcels.length > 0 && areaLimit !== undefined) {
      const c = computeContiguousParcelNblAttribution(o.parcels, areaLimit);
      const hoLabel = c.hasBuilding ? "2호" : "1호";
      appliedLaws.push(NBL.OTHER_LAND_CONTIGUOUS);
      if (c.clampWarning) {
        warnings.push(
          `§168의11⑤ — 기준면적 초과분(${c.excessArea.toFixed(1)}㎡)이 귀속 후보(건축물 바닥면적 제외 ${c.candidateTotal.toFixed(1)}㎡)를 초과하여 후보 면적으로 한정했습니다. 바닥면적분은 사업용으로 유지됩니다.`,
        );
      }
      if (c.nonBusinessRatio <= 0) {
        steps.push({
          id: "other_contiguous_nbl",
          label: `Step 3-1-1 §168의11⑤ 연접 다필지(${hoLabel}) 안분`,
          status: "PASS",
          detail: `총면적 ${c.totalArea.toFixed(1)}㎡ ≤ 기준면적 ${areaLimit}㎡ → 전량 사업용`,
          legalBasis: NBL.OTHER_LAND_CONTIGUOUS,
        });
        return buildPass("연접 다필지 — 기준면적 이내 전량 사업용 (§168의11⑤)", steps, appliedLaws, warnings, {
          r, totalOwnershipDays, revenueTestDetail,
        });
      }
      const areaProportioning: AreaProportioning = {
        totalArea: c.totalArea,
        businessArea: c.totalArea - c.nonBusinessArea,
        nonBusinessArea: c.nonBusinessArea,
        nonBusinessRatio: c.nonBusinessRatio,
        buildingMultiplier: 1,
        contiguousNblDetail: c.detail,
      };
      steps.push({
        id: "other_contiguous_nbl",
        label: `Step 3-1-1 §168의11⑤ 연접 다필지(${hoLabel}) 취득시기순 안분`,
        status: "FAIL",
        detail: `총면적 ${c.totalArea.toFixed(1)}㎡ − 기준면적 ${areaLimit}㎡ → 초과분 ${c.nonBusinessArea.toFixed(1)}㎡(취득시기 늦은 필지부터) 비사업용`,
        legalBasis: NBL.OTHER_LAND_CONTIGUOUS,
      });
      return {
        isBusiness: false,
        reason: `연접 다필지 기준면적 초과 — 초과분 ${c.nonBusinessArea.toFixed(1)}㎡ 비사업용 (§168의11⑤ ${hoLabel})`,
        steps,
        appliedLaws,
        areaProportioning,
        totalOwnershipDays,
        effectiveBusinessDays: r.effectiveBusinessDays,
        gracePeriodDays: r.gracePeriodDays,
        businessUseRatio: areaProportioning.nonBusinessRatio,
        criteria: r.criteria,
        revenueTestDetail,
        warnings,
      };
    }

    // 호별 기준면적 해석 — 초과분 비사업용 면적 안분 (§168의11①) [단일 필지]
    if (areaLimit !== undefined && input.landArea > areaLimit) {
      const areaProportioning = computeAreaProportioning(input.landArea, areaLimit);
      steps.push({
        id: "other_area_limit",
        label: "Step 3-1-1 §168의11① 호별 기준면적",
        status: "FAIL",
        detail: `기준면적 ${areaLimit}㎡ 초과 → 초과분 ${areaProportioning.nonBusinessArea}㎡ 비사업용`,
        legalBasis,
      });
      return {
        isBusiness: false,
        reason: `기준면적 초과 — 초과분 ${areaProportioning.nonBusinessArea}㎡ 비사업용`,
        steps,
        appliedLaws,
        areaProportioning,
        totalOwnershipDays,
        effectiveBusinessDays: r.effectiveBusinessDays,
        gracePeriodDays: r.gracePeriodDays,
        businessUseRatio: areaProportioning.nonBusinessRatio,
        criteria: r.criteria,
        revenueTestDetail,
        warnings,
      };
    }

    // 기준면적 이내 또는 면적기준 없는 호(14호·legacy) → 전량 사업용
    steps.push({
      id: "other_residence_business",
      label: areaLimit !== undefined ? "Step 3-1-1 §168의11① 호별 기준면적" : "Step 3-1-1 거주·사업관련 토지 + 기간기준",
      status: "PASS",
      detail: areaLimit !== undefined
        ? `거주·사업관련(§168의11①) + 기준면적 ${areaLimit}㎡ 이내 + 기간기준 충족`
        : "거주·사업과 직접 관련 + 기간기준 충족",
      legalBasis,
    });
    return buildPass(
      areaLimit !== undefined ? "거주·사업관련 토지 + 기준면적 이내" : "거주·사업관련 토지 + 기간기준 충족",
      steps, appliedLaws, warnings, { r, totalOwnershipDays, revenueTestDetail },
    );
  }

  // ── Step 0.5 적용: 공장 기준면적 초과분 비사업용 ─────────────────────
  // 수입금액비율(②)·거주사업관련(① 호별) 우선 경로를 모두 통과하지 못한 경우에만 확정한다
  // (§104의3①4호 가·나·다목은 택일이므로 나목 미달만으로 비사업용을 단정하면 안 된다).
  if (factoryExcess) {
    // 반환값 조립용(effectiveBusinessDays·criteria). **판정 분기로 쓰지 않는다** —
    // `fullPeriod`(전 보유기간)를 사업용 기간으로 넘기므로 모든 창의 비사업용 일수가 0이 되어
    // `meets`는 보유기간 길이와 무관하게 항상 true다(period-criteria.ts:160-189 실측).
    // Step 3-1도 같은 인자를 쓰며 그 FAIL 분기 역시 도달하지 않는다.
    const r = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, pjDate, "other_land", rules, input.gracePeriods);
    if (factoryExcess.isUnregisteredException) {
      // 단서(허가·사용승인 미이행) — 안분 없이 전량 비사업용
      steps.push({
        id: "other_factory_area",
        label: "Step 0.5 공장용 건축물 부속토지 기준면적",
        status: "FAIL",
        detail: factoryExcess.detail,
        legalBasis: factoryLegalBasis!,
      });
      return buildFail(factoryExcess.detail, steps, appliedLaws, warnings, {
        r, totalOwnershipDays, revenueTestDetail,
      });
    }
    const areaProportioning = computeAreaProportioning(input.landArea, factoryExcess.standardArea);
    steps.push({
      id: "other_factory_area",
      label: "Step 0.5 공장용 건축물 부속토지 기준면적",
      status: "FAIL",
      detail: `${factoryExcess.detail} < 부속토지 ${input.landArea}㎡ → 초과분 ${areaProportioning.nonBusinessArea.toFixed(2)}㎡ 비사업용(종합합산)`,
      legalBasis: factoryLegalBasis!,
    });
    return {
      isBusiness: false,
      reason: `공장 기준면적 초과 — 초과분 ${areaProportioning.nonBusinessArea.toFixed(2)}㎡ 비사업용`,
      steps,
      appliedLaws,
      areaProportioning,
      totalOwnershipDays,
      effectiveBusinessDays: r.effectiveBusinessDays,
      gracePeriodDays: r.gracePeriodDays,
      businessUseRatio: areaProportioning.nonBusinessRatio,
      criteria: r.criteria,
      revenueTestDetail,
      warnings,
    };
  }

  // ── Step 3-2: §101①2호나목 footprint carve-out ──────────────────
  // 수입금액비율·비종합합산·거주사업관련 모두 미해당이고 2% 미달(bareLand·건물有)인 경우,
  // 건축물 바닥면적(footprint)분 토지는 별도합산(사업용) 유지하고 잔여 부속토지만 종합합산(비사업용).
  // (지방세법 시행령 §101①2호나목 — "건축물의 바닥면적을 제외한 부속토지"만 별도합산 제외)
  // 진입 위치 주의: 수입금액비율(②)·거주사업관련(① 호별) 우선 경로 이후 — 법 근거 없는 불리 적용 방지.
  if (bareLand && o.hasBuilding && o.buildingFloorArea !== undefined && o.buildingFloorArea > 0) {
    const fp = o.buildingFloorArea;
    const r = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, pjDate, "other_land", rules, input.gracePeriods);
    appliedLaws.push(NBL.OTHER_LAND_FOOTPRINT_CARVEOUT);
    if (fp >= input.landArea) {
      // 부속토지 전부가 바닥면적분 → 전량 별도합산(사업용) 유지
      steps.push({
        id: "other_footprint_carveout",
        label: "Step 3-2 §101①2호나목 건축물 바닥면적 별도합산 유지",
        status: "PASS",
        detail: `건축물 바닥면적 ${fp}㎡ ≥ 부속토지 ${input.landArea}㎡ → 전량 별도합산(사업용) 유지`,
        legalBasis: NBL.OTHER_LAND_FOOTPRINT_CARVEOUT,
      });
      return buildPass("건축물 바닥면적 별도합산 유지 (§101①2호나목)", steps, appliedLaws, warnings, {
        r, totalOwnershipDays, revenueTestDetail,
      });
    }
    const areaProportioning = computeAreaProportioning(input.landArea, fp);
    steps.push({
      id: "other_footprint_carveout",
      label: "Step 3-2 §101①2호나목 건축물 바닥면적 별도합산 유지",
      status: "FAIL",
      detail: `건축물 바닥면적 ${fp}㎡ 별도합산 유지(사업용)·잔여 ${areaProportioning.nonBusinessArea}㎡ 종합합산(비사업용)`,
      legalBasis: NBL.OTHER_LAND_FOOTPRINT_CARVEOUT,
    });
    return {
      isBusiness: false,
      reason: `건축물 바닥면적 ${fp}㎡ 별도합산 유지·잔여 ${areaProportioning.nonBusinessArea}㎡ 비사업용 (§101①2호나목)`,
      steps,
      appliedLaws,
      areaProportioning,
      totalOwnershipDays,
      effectiveBusinessDays: r.effectiveBusinessDays,
      gracePeriodDays: r.gracePeriodDays,
      businessUseRatio: areaProportioning.nonBusinessRatio,
      criteria: r.criteria,
      revenueTestDetail,
      warnings,
    };
  }

  steps.push({
    id: "other_residence_business",
    label: "Step 3-1-1 거주·사업관련 토지",
    status: "NOT_APPLICABLE",
    detail: "거주·사업과 직접 관련 플래그 미설정",
    legalBasis: NBL.OTHER_LAND_BUSINESS,
  });
  const dummyR = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, pjDate, "other_land", rules, input.gracePeriods);
  return buildFail("종합합산 + 거주·사업관련 미해당 → 비사업용", steps, appliedLaws, warnings, {
    r: dummyR, totalOwnershipDays, revenueTestDetail,
  });
}

interface Ctx {
  r: PeriodCriteriaResult;
  totalOwnershipDays: number;
  revenueTestDetail?: RevenueTestResult;
}

function buildPass(
  reason: string,
  steps: JudgmentStep[],
  appliedLaws: string[],
  warnings: string[],
  ctx: Ctx,
): CategoryJudgeResult {
  return {
    isBusiness: true,
    reason,
    steps,
    appliedLaws,
    totalOwnershipDays: ctx.totalOwnershipDays,
    effectiveBusinessDays: ctx.r.effectiveBusinessDays,
    gracePeriodDays: ctx.r.gracePeriodDays,
    businessUseRatio: ctx.r.ratio,
    criteria: ctx.r.criteria,
    revenueTestDetail: ctx.revenueTestDetail,
    warnings,
  };
}

function buildFail(
  reason: string,
  steps: JudgmentStep[],
  appliedLaws: string[],
  warnings: string[],
  ctx: Ctx,
): CategoryJudgeResult {
  return {
    isBusiness: false,
    reason,
    steps,
    appliedLaws,
    totalOwnershipDays: ctx.totalOwnershipDays,
    effectiveBusinessDays: ctx.r.effectiveBusinessDays,
    gracePeriodDays: ctx.r.gracePeriodDays,
    businessUseRatio: ctx.r.ratio,
    criteria: ctx.r.criteria,
    revenueTestDetail: ctx.revenueTestDetail,
    warnings,
  };
}
