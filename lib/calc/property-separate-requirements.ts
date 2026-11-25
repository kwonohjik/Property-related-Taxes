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
  propertyDemolishedFactIssue,
  propertyDemolishedPublicUseAsked,
  propertyDemolishedRequired,
  resolvePropertyTaxBaseDate,
} from "@/lib/tax-engine/property-separate-requirements";
import type {
  PropertyDemolishedFactIssue,
  PropertyDemolishedKind,
  PropertyDemolishedRequired,
  PropertyRequirementFact,
} from "@/lib/tax-engine/property-separate-requirements";
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
