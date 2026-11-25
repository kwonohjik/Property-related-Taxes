/**
 * 재산세 별도합산 철거 부속토지 — 요건 칸의 화면 쪽 어댑터 (PSA-E2 · 계획서 `property-separate-demolished-requirements.engine.plan.md` §5.4·§5.9).
 *
 * 칸 집합(요구 술어)·첫 결함·문구는 엔진 leaf(`lib/tax-engine/property-separate-requirements.ts`)가 **단일 소스**다 —
 * ④(와이어)·⑧(`validateStep(2)`)·⑤(위젯 노출)은 이 어댑터를 거쳐 그 함수를 그대로 부르고, ⑫(Zod `superRefine`)는 같은 `propertyDemolishedFactIssue`를 직접 부른다.
 * UI는 날짜·시행본을 비교하지 않는다(과세기준일 `s`는 `resolvePropertyTaxBaseDate` — 화면은 `targetDate`를 보내지 않아 올해 6.1.).
 *
 * 순수 함수 — React 미사용. 폼 문자열을 엔진 입력으로 바꾸는 일만 한다(`useEffect → store` 미러링 없음).
 */
import {
  propertyBuildingPermitFactIssue,
  propertyBuildingPermitRequired,
  propertyDemolishedFactIssue,
  propertyDemolishedPublicUseAsked,
  propertyDemolishedRequired,
  resolvePropertyTaxBaseDate,
} from "@/lib/tax-engine/property-separate-requirements";
import type {
  PropertyBuildingPermitFactIssue,
  PropertyDemolishedFactIssue,
  PropertyDemolishedKind,
  PropertyDemolishedRequired,
  PropertyRequirementFact,
} from "@/lib/tax-engine/property-separate-requirements";
import { demolishedStatusPeriodMonths } from "@/lib/tax-engine/data/nbl-historical-values-era";
import { isValid } from "@/lib/tax-engine/utc-date";
import { parseISO } from "@/lib/tax-engine/utc-date";

/** 철거 요건과 관련된 폼 값 — 폼 상태(`FormState`)의 철거 칸을 그대로 옮긴 모양 */
export interface PropertyDemolishedFormValues {
  /** 철거일(YYYY-MM-DD 칸 그대로 — 빈 문자열일 수 있다) */
  date: string;
  kind: PropertyDemolishedKind | "";
  permit: PropertyRequirementFact;
  otherUse: PropertyRequirementFact;
  vacantHouse: PropertyRequirementFact;
  publicUse: PropertyRequirementFact;
  publicUsePaid: PropertyRequirementFact;
  isFactory: boolean;
  /** 철거 전 건축물 바닥면적(㎡) — 읽을 수 없으면 undefined */
  buildingFloorArea: number | undefined;
  zoningDistrict: string;
}

/** 철거일 문자열 → Date(UTC). 비었거나 읽을 수 없으면 undefined(엔진이 «철거일 입력» 결함으로 막는다) */
function removedOnOf(date: string): Date | undefined {
  if (!date) return undefined;
  const d = parseISO(date);
  return isValid(d) ? d : undefined;
}

/** 이 폼이 연 사실 칸 — 엔진 요구 술어 그대로(`taxBaseDate` 기본 = 올해 6.1.). 철거일·종류를 읽을 수 없으면 전부 false */
export function demolishedNeedOf(
  v: Pick<PropertyDemolishedFormValues, "date" | "kind" | "otherUse" | "vacantHouse" | "publicUse">,
  taxBaseDate: Date = resolvePropertyTaxBaseDate(),
): PropertyDemolishedRequired & { publicUse: boolean; publicUsePaid: boolean } {
  const need = propertyDemolishedRequired({ taxBaseDate, removedOn: removedOnOf(v.date), kind: v.kind });
  const asked = propertyDemolishedPublicUseAsked(need, v);
  return { ...need, publicUse: asked.publicUse, publicUsePaid: asked.paid };
}

/** ⑧ — 철거 요건의 첫 결함(없으면 null). ⑫와 같은 `propertyDemolishedFactIssue` — 같은 필드·같은 문구 */
export function demolishedFactIssueOf(
  v: PropertyDemolishedFormValues,
  taxBaseDate: Date = resolvePropertyTaxBaseDate(),
): PropertyDemolishedFactIssue | null {
  return propertyDemolishedFactIssue({
    taxBaseDate,
    removedOn: removedOnOf(v.date),
    kind: v.kind,
    isFactory: v.isFactory,
    facts: { permit: v.permit, otherUse: v.otherUse, vacantHouse: v.vacantHouse, publicUse: v.publicUse, publicUsePaid: v.publicUsePaid },
    buildingFloorArea: v.buildingFloorArea,
    zoningDistrict: v.zoningDistrict,
  });
}

/**
 * ④ — `separateAggregateItem`에 싣는 철거 칸. **요구된 칸만** 싣는다(숨은 stale 값 미전송):
 * 종류는 고른 경우에, 사실 칸은 그 술어가 열린 경우에, 바닥면적·용도지역은 «건축물 ∧ 2024.6.1.~»에만.
 */
export function demolishedWireFields(
  v: PropertyDemolishedFormValues,
  taxBaseDate: Date = resolvePropertyTaxBaseDate(),
): Record<string, unknown> {
  const need = demolishedNeedOf(v, taxBaseDate);
  return {
    demolished: true,
    ...(v.date ? { demolishedDate: v.date } : {}),
    ...(v.kind ? { demolishedKind: v.kind } : {}),
    ...(need.permit ? { demolishedPermit: v.permit } : {}),
    ...(need.otherUse ? { demolishedOtherUse: v.otherUse } : {}),
    ...(need.vacantHouse ? { demolishedVacantHouse: v.vacantHouse } : {}),
    ...(need.publicUse ? { demolishedPublicUse: v.publicUse } : {}),
    ...(need.publicUsePaid ? { demolishedPublicUsePaid: v.publicUsePaid } : {}),
    ...(need.floorArea
      ? { ...(v.buildingFloorArea ? { buildingFloorArea: v.buildingFloorArea } : {}), ...(v.zoningDistrict ? { zoningDistrict: v.zoningDistrict } : {}) }
      : {}),
  };
}

/** 한시 기간 개월 → 법문 표현. 12 = 2026.6.1.~ 시행본 «1년». */
const MONTHS_TEXT: Record<6 | 12 | 36, string> = { 6: "6개월", 12: "1년", 36: "3년" };

/**
 * 화면 안내문용 — 과세기준일 시행본의 한시 기간 표기(날짜·시행본을 화면이 비교하지 않고 엔진 연혁 함수를 그대로 읽는다 · 표기 전용).
 * `general` = 일반 주택·건축물, `vacantHouse` = 빈집정비사업 철거 빈집(일반보다 길 때만). 한시 규정이 없는 과세기준일(2016.6.1. 전)은 둘 다 null.
 */
export function demolishedPeriodTextOf(taxBaseDate: Date = resolvePropertyTaxBaseDate()): { general: string | null; vacantHouse: string | null } {
  const general = demolishedStatusPeriodMonths(taxBaseDate, false);
  const vacant = demolishedStatusPeriodMonths(taxBaseDate, true);
  return {
    general: general === 0 ? null : MONTHS_TEXT[general],
    vacantHouse: vacant === 0 || vacant === general ? null : MONTHS_TEXT[vacant],
  };
}

/**
 * 본 경로(비철거) 건축물 허가·사용승인 칸 — 영 §101① 단서(PSA-E3). 칸을 여는 술어는 엔진 `propertyBuildingPermitRequired(s)` 하나다.
 * ⑤ 노출 = ④ 전송 = ⑧ 차단 = ⑫ 400의 단일 소스이며, 철거 토글이 켜져 있으면 이 칸은 묻지 않는다(철거 경로는 `demolishedPermit`이 맡는다 — 호출자가 `saDemolished`로 게이트).
 */
export function buildingPermitNeedOf(taxBaseDate: Date = resolvePropertyTaxBaseDate()): boolean {
  return propertyBuildingPermitRequired(taxBaseDate);
}

/** ⑧ — 본 경로 허가 칸의 결함(없으면 null). ⑫와 같은 `propertyBuildingPermitFactIssue` — 같은 필드·같은 문구 */
export function buildingPermitIssueOf(
  permit: PropertyRequirementFact,
  taxBaseDate: Date = resolvePropertyTaxBaseDate(),
): PropertyBuildingPermitFactIssue | null {
  return propertyBuildingPermitFactIssue({ taxBaseDate, permit });
}

/** ④ — 요구될 때만 싣는다(요구되지 않은 칸의 stale 값 미전송). 3지선다 그대로 보낸다(`""`도 — ⑫가 «값 없음»으로 400을 낸다) */
export function buildingPermitWireFields(
  permit: PropertyRequirementFact,
  taxBaseDate: Date = resolvePropertyTaxBaseDate(),
): { buildingPermit?: PropertyRequirementFact } {
  return buildingPermitNeedOf(taxBaseDate) ? { buildingPermit: permit } : {};
}
