/**
 * PSA-S1 — **동결 복제본**: master 79e1eadf6 의 `lib/tax-engine/property-separate-requirements.ts` 요구 술어(`frozenPropertyDemolishedRequired`·`frozenPropertyDemolishedPublicUseAsked`)
 * · 첫 결함(`frozenPropertyDemolishedFactIssue`) · 판정(`frozenJudgePropertyDemolishedLand`)을 한 글자도 바꾸지 않고(이름에 `frozen` 접두만) 옮긴 것이다. **수정 금지.**
 * 새 사슬 걷기(`propertyDemolishedChain`·`frozenJudgePropertyDemolishedLand`)와의 판정 격자 동치(T1)·완화만(T2·강화 0건)·최소성 비교용 — 테스트 전용 fixture(프로덕션 import 금지).
 * 고지 문구·결함 문구·연혁 술어는 실제 모듈의 것을 그대로 import한다(이번 PR에서 바뀌지 않는다 — 새 문구는 별도 함수로 추가).
 */
import { PROPERTY_SEPARATE } from "../../../lib/tax-engine/legal-codes";
import { getZoneAreaMultiplier } from "../../../lib/tax-engine/local-tax-zone-multiplier";
import { round2 } from "../../../lib/tax-engine/area-utils";
import { isWithinPeriodMonths } from "../../../lib/tax-engine/civil-period";
import { utcDayDiff } from "../../../lib/tax-engine/civil-period";
import { demolishedAreaClauseAppliesOn } from "../../../lib/tax-engine/data/nbl-historical-values-era";
import { demolishedOtherUseClauseApplies } from "../../../lib/tax-engine/data/nbl-historical-values-era";
import { demolishedPermitClauseApplies } from "../../../lib/tax-engine/data/nbl-historical-values-era";
import { demolishedStatusPeriodMonths } from "../../../lib/tax-engine/data/nbl-historical-values-era";
import { demolishedVacantHouseClauseApplies } from "../../../lib/tax-engine/data/nbl-historical-values-era";
import { isValid } from "../../../lib/tax-engine/utc-date";
import { PROPERTY_DEMOLISHED_AREA_INPUT_NOTICE } from "../../../lib/tax-engine/property-separate-requirements";
import { PROPERTY_DEMOLISHED_HOUSE_AREA_NOTICE } from "../../../lib/tax-engine/property-separate-requirements";
import { PROPERTY_DEMOLISHED_INPUT_NOTICE } from "../../../lib/tax-engine/property-separate-requirements";
import { PROPERTY_DEMOLISHED_ISSUE_MESSAGE } from "../../../lib/tax-engine/property-separate-requirements";
import { PROPERTY_DEMOLISHED_NO_AREA_CLAUSE_NOTICE } from "../../../lib/tax-engine/property-separate-requirements";
import { PROPERTY_DEMOLISHED_NO_OTHER_USE_CLAUSE_NOTICE } from "../../../lib/tax-engine/property-separate-requirements";
import { PROPERTY_DEMOLISHED_OTHER_USE_NOTICE } from "../../../lib/tax-engine/property-separate-requirements";
import { PROPERTY_DEMOLISHED_PERMIT_NO_NOTICE } from "../../../lib/tax-engine/property-separate-requirements";
import { PROPERTY_DEMOLISHED_PERMIT_UNKNOWN_NOTICE } from "../../../lib/tax-engine/property-separate-requirements";
import { PROPERTY_DEMOLISHED_PUBLIC_USE_UNPAID_NOTICE } from "../../../lib/tax-engine/property-separate-requirements";
import { PROPERTY_DEMOLISHED_VACANT_HOUSE_UNCONFIRMED_NOTICE } from "../../../lib/tax-engine/property-separate-requirements";
import { propertyDemolishedNotYetNotice } from "../../../lib/tax-engine/property-separate-requirements";
import { propertyDemolishedPeriodNotice } from "../../../lib/tax-engine/property-separate-requirements";
import type { PropertyDemolishedFacts } from "../../../lib/tax-engine/property-separate-requirements";
import type { PropertyDemolishedFoldReason } from "../../../lib/tax-engine/property-separate-requirements";
import type { PropertyDemolishedKind } from "../../../lib/tax-engine/property-separate-requirements";
import type { PropertyRequirementFact } from "../../../lib/tax-engine/property-separate-requirements";

export interface FrozenPropertyDemolishedRequired {
  permit: boolean;
  otherUse: boolean;
  vacantHouse: boolean;
  /** 철거 전 바닥면적 + 용도지역(Q-8 — 건축물 ∧ 2024.6.1.~ 과세기준일일 때만). */
  floorArea: boolean;
}

const NOT_REQUIRED: FrozenPropertyDemolishedRequired = { permit: false, otherUse: false, vacantHouse: false, floorArea: false };

const isKind = (kind: unknown): kind is PropertyDemolishedKind => kind === "house" || kind === "building";

/**
 * 철거 요건 사실 칸 요구 집합(단일 소스). 철거일 없음·Invalid·종류 없음·철거일 > 과세기준일이면 전부 `false`(날짜·종류 결함이 먼저 — `frozenPropertyDemolishedFactIssue`).
 * 한시가 **가능한** 과세기준일일 때만 묻는다 — `s`가 «최대 기간» 안에 없으면(주택은 빈집 3년까지 긴 기간) 어떤 사실도 판정을 못 바꾸므로 전부 `false`(기간 초과면 요건을 묻지 않는다).
 */
export function frozenPropertyDemolishedRequired(i: { taxBaseDate: Date; removedOn: Date | undefined; kind: PropertyDemolishedKind | "" | undefined }): FrozenPropertyDemolishedRequired {
  const { taxBaseDate: s, removedOn: r, kind } = i;
  if (!r || !isValid(r) || !isValid(s) || !isKind(kind) || utcDayDiff(r, s) > 0) return NOT_REQUIRED;
  const maxMonths = demolishedStatusPeriodMonths(s, kind === "house");
  if (maxMonths === 0 || !isWithinPeriodMonths(r, maxMonths, s)) return NOT_REQUIRED;
  return {
    permit: demolishedPermitClauseApplies(s),
    otherUse: demolishedOtherUseClauseApplies(s),
    vacantHouse: kind === "house" && demolishedVacantHouseClauseApplies(s),
    floorArea: kind === "building" && demolishedAreaClauseAppliesOn(s),
  };
}

/**
 * 영 §103의2 2호 단서 하위 칸 — 답 의존 사슬: 건축 외 용도 «예» ∧ 빈집정비 «예»(둘 다 요구된 시행본)이면 `publicUse`, 그것이 «예»이면 `paid`.
 * 날짜 칸은 없다 — 재산세는 과세기준일 한 점이라(Q-6 (가)) 사용 기간 날짜가 판정에 읽히지 않는다.
 */
export function frozenPropertyDemolishedPublicUseAsked(
  need: Pick<FrozenPropertyDemolishedRequired, "otherUse" | "vacantHouse">,
  facts: Pick<PropertyDemolishedFacts, "otherUse" | "vacantHouse" | "publicUse">,
): { publicUse: boolean; paid: boolean } {
  const publicUse = need.otherUse && need.vacantHouse && facts.otherUse === "yes" && facts.vacantHouse === "yes";
  return { publicUse, paid: publicUse && facts.publicUse === "yes" };
}

export type FrozenPropertyDemolishedFactField =
  | "demolishedDate"
  | "demolishedKind"
  | "demolishedPermit"
  | "demolishedOtherUse"
  | "demolishedVacantHouse"
  | "demolishedPublicUse"
  | "demolishedPublicUsePaid"
  | "buildingFloorArea"
  | "zoningDistrict";

export interface FrozenPropertyDemolishedFactIssue {
  field: FrozenPropertyDemolishedFactField;
  message: string;
}

export interface FrozenPropertyDemolishedFactInput {
  taxBaseDate: Date;
  removedOn: Date | undefined;
  kind: PropertyDemolishedKind | "" | undefined;
  /** 공장용지(공장용 건축물) 여부 — `house`와 모순이면 차단(UQ-8). */
  isFactory?: boolean;
  facts: PropertyDemolishedFacts;
  buildingFloorArea?: number;
  zoningDistrict?: string;
}

const blank = (v: PropertyRequirementFact | undefined): boolean => v === undefined || v === "";
const M = PROPERTY_DEMOLISHED_ISSUE_MESSAGE;

/**
 * 요구된 칸 중 **비어 있는 첫 결함**(없으면 `null`). 순서 = 화면 순서: 철거일 → 종류 → 철거일 > 과세기준일 → 공장용지×주택 → 허가 → 건축 외 용도 → 빈집정비 → 공용 사용 → 유료 → 바닥면적 → 용도지역.
 * 명시 «모름»·«아니오»·«예(건축 외 용도)»는 막지 않는다 — 엔진이 혜택 불성립으로 접고 고지한다. 미선택 `""`·빈칸만 막는다(Q-1).
 */
export function frozenPropertyDemolishedFactIssue(i: FrozenPropertyDemolishedFactInput): FrozenPropertyDemolishedFactIssue | null {
  if (!i.removedOn || !isValid(i.removedOn)) return { field: "demolishedDate", message: M.demolishedDate };
  if (!isKind(i.kind)) return { field: "demolishedKind", message: M.demolishedKind };
  if (isValid(i.taxBaseDate) && utcDayDiff(i.removedOn, i.taxBaseDate) > 0) return { field: "demolishedDate", message: M.demolishedAfterBaseDate };
  if (i.isFactory === true && i.kind === "house") return { field: "demolishedKind", message: M.demolishedFactoryHouse };
  const need = frozenPropertyDemolishedRequired(i);
  if (need.permit && blank(i.facts.permit)) return { field: "demolishedPermit", message: M.demolishedPermit };
  if (need.otherUse && blank(i.facts.otherUse)) return { field: "demolishedOtherUse", message: M.demolishedOtherUse };
  if (need.vacantHouse && blank(i.facts.vacantHouse)) return { field: "demolishedVacantHouse", message: M.demolishedVacantHouse };
  const asked = frozenPropertyDemolishedPublicUseAsked(need, i.facts);
  if (asked.publicUse && blank(i.facts.publicUse)) return { field: "demolishedPublicUse", message: M.demolishedPublicUse };
  if (asked.paid && blank(i.facts.publicUsePaid)) return { field: "demolishedPublicUsePaid", message: M.demolishedPublicUsePaid };
  if (need.floorArea) {
    if (!(typeof i.buildingFloorArea === "number" && Number.isFinite(i.buildingFloorArea) && i.buildingFloorArea > 0)) return { field: "buildingFloorArea", message: M.buildingFloorArea };
    if (!i.zoningDistrict || !getZoneAreaMultiplier(i.zoningDistrict)) return { field: "zoningDistrict", message: M.zoningDistrict };
  }
  return null;
}

export interface FrozenPropertyDemolishedVerdict {
  kind: "holds" | "fold";
  foldReason?: PropertyDemolishedFoldReason;
  /** 적용한 한시 기간(개월) — 0 = 규정 없음(2016.6.1. 전) 또는 판정 불가. */
  periodMonths: 0 | 6 | 12 | 36;
  /** 별도합산 인정 면적(㎡) — 접힘이면 0. */
  recognizedArea: number;
  /** 종합합산 이관 면적(㎡) — 접힘이면 부속토지 전체. */
  excessArea: number;
  /** 면적 범위 문언(바닥면적 × 배율)을 적용했는가. */
  areaClauseApplied: boolean;
  /** 빈집정비 3년 연장 여부가 확인되지 않아(모름·미선택) 일반 기간만 반영한 결과가 달라질 수 있는가. */
  vacantHouseExtensionUnconfirmed: boolean;
  /** 이 판정이 읽은 칸 집합(요구 술어 echo — 화면이 «왜 이 칸이 필요했나»를 같은 값으로 말한다). */
  required: FrozenPropertyDemolishedRequired & { publicUse: boolean; publicUsePaid: boolean };
  notices: string[];
  legalBasis: string[];
}

export interface FrozenPropertyDemolishedJudgeInput {
  taxBaseDate: Date;
  removedOn: Date | undefined;
  kind: PropertyDemolishedKind | "" | undefined;
  facts: PropertyDemolishedFacts;
  /** 철거된 건축물·주택의 부속토지 면적(㎡). */
  landArea: number;
  /** 철거 전 건축물 바닥면적(㎡) — `required.floorArea`일 때만 읽는다. */
  buildingFloorArea?: number;
  /** 용도지역 — `required.floorArea`일 때만 읽는다. */
  zoningDistrict?: string;
}

/**
 * 철거ㆍ멸실 부속토지의 별도합산 한시 지위 판정(과세기준일 한 점). 접힘 사유 우선순위: 기간 → 허가 → 건축 외 용도(→ 단서) → (면적은 접힘이 아니라 분리).
 * 호출자(입구 ⑧·⑫)가 `frozenPropertyDemolishedFactIssue`로 결함을 막았다고 전제하되, 직접 호출에서 결함이 있으면 throw 없이 접는다(혜택 불성립 방향 — 법 근거 없는 유리 적용 금지).
 */
export function frozenJudgePropertyDemolishedLand(i: FrozenPropertyDemolishedJudgeInput): FrozenPropertyDemolishedVerdict {
  const { taxBaseDate: s, removedOn: r, kind, facts } = i;
  const landArea = Number.isFinite(i.landArea) && i.landArea > 0 ? i.landArea : 0;
  const base = { areaClauseApplied: false, vacantHouseExtensionUnconfirmed: false, legalBasis: [PROPERTY_SEPARATE.DEMOLISHED_GRACE] };
  const fold = (
    reason: PropertyDemolishedFoldReason,
    periodMonths: FrozenPropertyDemolishedVerdict["periodMonths"],
    required: FrozenPropertyDemolishedVerdict["required"],
    notices: string[],
    extra: { vacantHouseExtensionUnconfirmed?: boolean; legalBasis?: string } = {},
  ): FrozenPropertyDemolishedVerdict => ({
    ...base,
    kind: "fold",
    foldReason: reason,
    periodMonths,
    recognizedArea: 0,
    excessArea: round2(landArea),
    vacantHouseExtensionUnconfirmed: extra.vacantHouseExtensionUnconfirmed ?? false,
    required,
    notices,
    legalBasis: extra.legalBasis ? [extra.legalBasis] : base.legalBasis,
  });
  const noneRequired = { ...NOT_REQUIRED, publicUse: false, publicUsePaid: false };

  if (!r || !isValid(r) || !isValid(s) || !isKind(kind) || utcDayDiff(r, s) > 0) return fold("input", 0, noneRequired, [PROPERTY_DEMOLISHED_INPUT_NOTICE]);

  const need = frozenPropertyDemolishedRequired({ taxBaseDate: s, removedOn: r, kind });
  // 엔진은 요구되지 않은 칸을 읽지 않는다 — 빈집정비 «예»는 요구된 경우(주택 ∧ 문언 시행본 ∧ 철거일이 3년 안)에만 유효.
  const vacantYes = need.vacantHouse && facts.vacantHouse === "yes";
  const months = demolishedStatusPeriodMonths(s, vacantYes);
  const asked = frozenPropertyDemolishedPublicUseAsked(need, facts);
  const required = { ...need, publicUse: asked.publicUse, publicUsePaid: asked.paid };

  if (months === 0) return fold("not_yet", 0, required, [propertyDemolishedNotYetNotice(s)]);

  if (!isWithinPeriodMonths(r, months, s)) {
    // 빈집정비 여부가 «모름·미선택»이라 일반 기간만 반영했는데 3년이면 안일 수 있는 경우만 고지(결과가 달라질 수 있을 때).
    const extensionUnconfirmed =
      kind === "house" && demolishedVacantHouseClauseApplies(s) && facts.vacantHouse !== "no" && !vacantYes && isWithinPeriodMonths(r, demolishedStatusPeriodMonths(s, true), s);
    const notices = [propertyDemolishedPeriodNotice(months), ...(extensionUnconfirmed ? [PROPERTY_DEMOLISHED_VACANT_HOUSE_UNCONFIRMED_NOTICE] : [])];
    return fold("period", months, required, notices, { vacantHouseExtensionUnconfirmed: extensionUnconfirmed });
  }

  if (need.permit && facts.permit !== "yes") {
    const notice = facts.permit === "no" ? PROPERTY_DEMOLISHED_PERMIT_NO_NOTICE : PROPERTY_DEMOLISHED_PERMIT_UNKNOWN_NOTICE;
    return fold("permit", months, required, [notice], { legalBasis: PROPERTY_SEPARATE.DEMOLISHED_PERMIT });
  }

  const notices: string[] = [];
  if (need.otherUse && facts.otherUse !== "no") {
    // 2호 단서(빈집정비 철거 빈집) — 공용·공공용 사용 + 재산세 부과(유료 등)이면 포함. 무상 공용은 비과세 가능성(§109②) 고지와 함께 접는다.
    if (facts.otherUse === "yes" && vacantYes && facts.publicUse === "yes") {
      if (facts.publicUsePaid === "no") return fold("public_use_unpaid", months, required, [PROPERTY_DEMOLISHED_PUBLIC_USE_UNPAID_NOTICE], { legalBasis: PROPERTY_SEPARATE.DEMOLISHED_VACANT_HOUSE_PUBLIC_USE });
      if (facts.publicUsePaid !== "yes") return fold("other_use", months, required, [PROPERTY_DEMOLISHED_OTHER_USE_NOTICE], { legalBasis: PROPERTY_SEPARATE.DEMOLISHED_OTHER_USE });
    } else {
      return fold("other_use", months, required, [PROPERTY_DEMOLISHED_OTHER_USE_NOTICE], { legalBasis: PROPERTY_SEPARATE.DEMOLISHED_OTHER_USE });
    }
  }
  if (!need.otherUse && demolishedPermitClauseApplies(s)) notices.push(PROPERTY_DEMOLISHED_NO_OTHER_USE_CLAUSE_NOTICE);

  // 면적 — 건축물 ∧ 문언 시행본만 철거 전 바닥면적 × 배율 범위. 주택·그 전 시행본은 제한 없음(부속토지 전체) + 범위 확인 필요.
  if (need.floorArea) {
    const zone = i.zoningDistrict ? getZoneAreaMultiplier(i.zoningDistrict) : undefined;
    const floor = i.buildingFloorArea;
    if (!zone || !(typeof floor === "number" && Number.isFinite(floor) && floor > 0)) return fold("area_input", months, required, [PROPERTY_DEMOLISHED_AREA_INPUT_NOTICE], { legalBasis: PROPERTY_SEPARATE.DEMOLISHED_AREA });
    const baseArea = round2(floor * zone.multiplier);
    const recognizedArea = Math.min(round2(landArea), baseArea);
    return {
      ...base,
      kind: "holds",
      periodMonths: months,
      recognizedArea,
      excessArea: round2(Math.max(0, landArea - recognizedArea)),
      areaClauseApplied: true,
      required,
      notices,
      legalBasis: [PROPERTY_SEPARATE.DEMOLISHED_GRACE, PROPERTY_SEPARATE.DEMOLISHED_AREA],
    };
  }
  notices.push(kind === "house" ? PROPERTY_DEMOLISHED_HOUSE_AREA_NOTICE : PROPERTY_DEMOLISHED_NO_AREA_CLAUSE_NOTICE);
  return { ...base, kind: "holds", periodMonths: months, recognizedArea: round2(landArea), excessArea: 0, required, notices };
}
