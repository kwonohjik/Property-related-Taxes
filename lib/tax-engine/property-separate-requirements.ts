/**
 * 재산세 별도합산 — 철거ㆍ멸실 부속토지 요건 판정 leaf (PSA-E1 · 계획서 docs/01-plan/features/property-separate-demolished-requirements.engine.plan.md v3 §5).
 * 순수 함수 — DB·`new Date(x)`·로컬 달력 함수 없음. **엔진(`isSeparateAggregateLand`·`property-tax.ts`)에는 아직 연결하지 않는다**(PSA-E4·E2).
 *
 * ## 판정 모델 — 과세기준일 한 점
 * 영 §103의2는 «과세기준일 현재»로 정해지고 재산세 납세의무는 과세기준일(6.1.)에 성립하므로(지방세기본법 §34①8호), 판정은 **그 과세기준일 `s`의 시행본 하나**로 한다.
 * 양도세 서브엔진(`non-business-land/*`)의 일 단위 창·구간 모델은 쓰지 않고 import도 하지 않는다(역방향 의존 금지) — 연혁 술어(`data/nbl-historical-values-era.ts`)·`civil-period`·`utc-date`만 재사용한다.
 *
 * ## 단일 술어 — «엔진이 읽는 칸만 요구»
 * `propertyDemolishedRequired`(칸 집합) · `propertyDemolishedPublicUseAsked`(답 의존 하위 칸)가 ⑤ 표시 · ⑧ 차단 · ⑫ 400 · ④ 운반 · 엔진 읽기의 유일한 술어다.
 * `propertyDemolishedFactIssue`가 ⑧·⑫의 첫 결함 1개와 문구의 단일 정본이다. 엔진(`judgePropertyDemolishedLand`)은 요구되지 않은 칸을 읽지 않는다(숨은 stale 값이 판정을 바꾸지 못함).
 *
 * ## 사실 칸 규칙
 * 3지선다 `""|yes|no|unknown` — 미선택 `""`는 입구(⑧·⑫)가 막고, 엔진 직접 호출에서는 `yes`가 아니므로 혜택 불성립(throw 없음). «모름»·«아니오»·미충족 = 혜택 불성립(종합합산 이관) + 확인 필요. 자동 안분 fallback 없음.
 * 면적 범위(영 §103의2 1호 후단)는 법문이 «면적 범위의 토지»라 범위 안 별도합산 + 초과분 종합합산 이관 — 자동 안분이 아니라 법문이 정한 분할이다(Q-4).
 */
import { PROPERTY_SEPARATE } from "./legal-codes";
import { getZoneAreaMultiplier } from "./local-tax-zone-multiplier";
import { round2 } from "./area-utils";
import { isWithinPeriodMonths } from "./civil-period";
import { utcDayDiff } from "./civil-period";
import { demolishedAreaClauseAppliesOn } from "./data/nbl-historical-values-era";
import { demolishedOtherUseClauseApplies } from "./data/nbl-historical-values-era";
import { demolishedPermitClauseApplies } from "./data/nbl-historical-values-era";
import { demolishedStatusPeriodMonths } from "./data/nbl-historical-values-era";
import { demolishedVacantHouseClauseApplies } from "./data/nbl-historical-values-era";
import { format } from "./utc-date";
import { isBefore } from "./utc-date";
import { isValid } from "./utc-date";
import { parseISO } from "./utc-date";

/** 사실 칸 3지선다 — `""` = 미선택(⑧·⑫ 차단 대상, 엔진 직접 호출에서는 `yes` 아님으로 접힘). */
export type PropertyRequirementFact = "" | "yes" | "no" | "unknown";
/** 철거된 것의 종류 — 빈집 3년은 주택에만, 바닥면적 × 배율 범위는 건축물에만 적용된다. */
export type PropertyDemolishedKind = "house" | "building";

export interface PropertyDemolishedFacts {
  permit?: PropertyRequirementFact;
  otherUse?: PropertyRequirementFact;
  vacantHouse?: PropertyRequirementFact;
  publicUse?: PropertyRequirementFact;
  publicUsePaid?: PropertyRequirementFact;
}

export interface PropertyDemolishedRequired {
  permit: boolean;
  otherUse: boolean;
  vacantHouse: boolean;
  /** 철거 전 바닥면적 + 용도지역(Q-8 — 건축물 ∧ 2024.6.1.~ 과세기준일일 때만). */
  floorArea: boolean;
}

const NOT_REQUIRED: PropertyDemolishedRequired = { permit: false, otherUse: false, vacantHouse: false, floorArea: false };

/** 영 §101① 단서(허가·사용승인 요건)의 첫 과세기준일 — 2011.1.1. 시행령 부칙 «시행 후 최초로 납세의무가 성립하는 분부터». */
const FROM_2011_06_01 = parseISO("2011-06-01");

const isKind = (kind: unknown): kind is PropertyDemolishedKind => kind === "house" || kind === "building";

/**
 * 과세기준일 — `targetDate`(YYYY-MM-DD 문자열 또는 Date)의 **UTC 연도** 6월 1일, 없으면 `now`의 **UTC 연도** 6월 1일(지방세법 §114).
 * 엔진·route·⑧이 각자 `new Date().getFullYear()`(로컬 달력)로 따로 구하면 서버·브라우저 시간대에 따라 연말·연초에 다른 해가 나오므로 세 곳이 이 함수 하나를 부른다.
 * `targetDate`를 읽을 수 없으면 Invalid Date(조용히 올해로 대체하지 않는다 — 호출자의 날짜 결함 처리로 간다).
 */
export function resolvePropertyTaxBaseDate(targetDate?: string | Date, now: Date = new Date()): Date {
  const base = targetDate === undefined ? now : typeof targetDate === "string" ? parseISO(targetDate) : targetDate;
  return new Date(Date.UTC(base.getUTCFullYear(), 5, 1));
}

/** 영 §101① 단서의 허가·사용승인 요건이 그 과세기준일 시행본에 있는가(비철거 본 경로 — Q-2 · PSA-E3가 연결). */
export function propertyBuildingPermitRequired(s: Date): boolean {
  return isValid(s) && !isBefore(s, FROM_2011_06_01);
}

/**
 * 철거 요건 사실 칸 요구 집합(단일 소스). 철거일 없음·Invalid·종류 없음·철거일 > 과세기준일이면 전부 `false`(날짜·종류 결함이 먼저 — `propertyDemolishedFactIssue`).
 * 한시가 **가능한** 과세기준일일 때만 묻는다 — `s`가 «최대 기간» 안에 없으면(주택은 빈집 3년까지 긴 기간) 어떤 사실도 판정을 못 바꾸므로 전부 `false`(기간 초과면 요건을 묻지 않는다).
 */
export function propertyDemolishedRequired(i: { taxBaseDate: Date; removedOn: Date | undefined; kind: PropertyDemolishedKind | "" | undefined }): PropertyDemolishedRequired {
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
export function propertyDemolishedPublicUseAsked(
  need: Pick<PropertyDemolishedRequired, "otherUse" | "vacantHouse">,
  facts: Pick<PropertyDemolishedFacts, "otherUse" | "vacantHouse" | "publicUse">,
): { publicUse: boolean; paid: boolean } {
  const publicUse = need.otherUse && need.vacantHouse && facts.otherUse === "yes" && facts.vacantHouse === "yes";
  return { publicUse, paid: publicUse && facts.publicUse === "yes" };
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑧·⑫ 공유 — 첫 결함 1개
// ─────────────────────────────────────────────────────────────────────────────

export type PropertyDemolishedFactField =
  | "demolishedDate"
  | "demolishedKind"
  | "demolishedPermit"
  | "demolishedOtherUse"
  | "demolishedVacantHouse"
  | "demolishedPublicUse"
  | "demolishedPublicUsePaid"
  | "buildingFloorArea"
  | "zoningDistrict";

export interface PropertyDemolishedFactIssue {
  field: PropertyDemolishedFactField;
  message: string;
}

export interface PropertyDemolishedFactInput {
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

export const PROPERTY_DEMOLISHED_ISSUE_MESSAGE = {
  demolishedDate: "철거ㆍ멸실일을 입력하세요(사실상 철거ㆍ멸실된 날 — 알 수 없으면 공부상 철거ㆍ멸실된 날).",
  demolishedKind:
    "철거된 것이 주택인지 주택이 아닌 건축물인지 선택하세요 — 빈집정비 3년은 주택에만, 철거 전 바닥면적 × 용도지역 배율 범위는 건축물에만 적용되어 판정에 필요합니다.",
  demolishedAfterBaseDate: "철거일은 과세기준일 이전이어야 합니다 — 과세기준일 현재 건축물이 있으면 철거 칸을 끄세요.",
  demolishedFactoryHouse: "공장용지를 켰는데 철거된 것을 주택으로 선택했습니다 — 공장용 건축물은 주택이 아니므로 종류를 확인하세요.",
  demolishedPermit:
    "철거한 건축물·주택이 허가·사용승인(임시사용승인 포함)을 받은 것인지 선택하세요. 받지 않은 건축물·주택의 부속토지는 특례에서 제외되어 판정에 필요합니다(모르면 「모름」).",
  demolishedOtherUse:
    "철거 후 건축을 위한 용도 외의 다른 용도로 사용하고 있는지 선택하세요. 그렇게 사용하는 부속토지는 특례에서 제외되어 판정에 필요합니다(모르면 「모름」).",
  demolishedVacantHouse:
    "철거한 주택이 빈집정비사업(또는 빈집 정비 생활환경정비사업)으로 철거된 빈집인지 선택하세요. 「예」이면 철거된 날부터 3년, 아니면 일반 한시 기간으로 판정합니다(모르면 「모름」 — 일반 기간으로 판정하고 고지합니다).",
  demolishedPublicUse:
    "과세기준일 현재 그 부속토지를 국가·지방자치단체·지방자치단체조합이 1년 이상 공용·공공용으로 사용하는지(1년 이상 사용할 것이 계약서 등으로 입증되는 경우 포함) 선택하세요. 건축 외 용도 사용 「예」·빈집정비 「예」인 경우의 판정에 필요합니다(모르면 「모름」).",
  demolishedPublicUsePaid:
    "그 공용·공공용 사용이 유료이거나 소유권 유상이전 약정 후 취득 전에 미리 사용한 것이라 재산세가 부과되는지 선택하세요(지방세법 §109② 단서). 무상 사용이면 재산세가 부과되지 않아 「아니오」입니다(모르면 「모름」).",
  buildingFloorArea:
    "철거 전 건축물의 바닥면적(㎡)을 입력하세요(건축물 외의 시설은 수평투영면적). 철거된 건축물의 부속토지는 철거 전 바닥면적에 용도지역별 적용배율을 곱한 면적 범위라 판정에 필요합니다.",
  zoningDistrict:
    "용도지역을 선택하세요. 철거된 건축물의 부속토지 범위는 철거 전 바닥면적에 용도지역별 적용배율(지방세법 시행령 §101②)을 곱해 산정하므로 판정에 필요합니다.",
} as const;

const M = PROPERTY_DEMOLISHED_ISSUE_MESSAGE;

/**
 * 요구된 칸 중 **비어 있는 첫 결함**(없으면 `null`). 순서 = 화면 순서: 철거일 → 종류 → 철거일 > 과세기준일 → 공장용지×주택 → 허가 → 건축 외 용도 → 빈집정비 → 공용 사용 → 유료 → 바닥면적 → 용도지역.
 * 명시 «모름»·«아니오»·«예(건축 외 용도)»는 막지 않는다 — 엔진이 혜택 불성립으로 접고 고지한다. 미선택 `""`·빈칸만 막는다(Q-1).
 */
export function propertyDemolishedFactIssue(i: PropertyDemolishedFactInput): PropertyDemolishedFactIssue | null {
  if (!i.removedOn || !isValid(i.removedOn)) return { field: "demolishedDate", message: M.demolishedDate };
  if (!isKind(i.kind)) return { field: "demolishedKind", message: M.demolishedKind };
  if (isValid(i.taxBaseDate) && utcDayDiff(i.removedOn, i.taxBaseDate) > 0) return { field: "demolishedDate", message: M.demolishedAfterBaseDate };
  if (i.isFactory === true && i.kind === "house") return { field: "demolishedKind", message: M.demolishedFactoryHouse };
  const need = propertyDemolishedRequired(i);
  if (need.permit && blank(i.facts.permit)) return { field: "demolishedPermit", message: M.demolishedPermit };
  if (need.otherUse && blank(i.facts.otherUse)) return { field: "demolishedOtherUse", message: M.demolishedOtherUse };
  if (need.vacantHouse && blank(i.facts.vacantHouse)) return { field: "demolishedVacantHouse", message: M.demolishedVacantHouse };
  const asked = propertyDemolishedPublicUseAsked(need, i.facts);
  if (asked.publicUse && blank(i.facts.publicUse)) return { field: "demolishedPublicUse", message: M.demolishedPublicUse };
  if (asked.paid && blank(i.facts.publicUsePaid)) return { field: "demolishedPublicUsePaid", message: M.demolishedPublicUsePaid };
  if (need.floorArea) {
    if (!(typeof i.buildingFloorArea === "number" && Number.isFinite(i.buildingFloorArea) && i.buildingFloorArea > 0)) return { field: "buildingFloorArea", message: M.buildingFloorArea };
    if (!i.zoningDistrict || !getZoneAreaMultiplier(i.zoningDistrict)) return { field: "zoningDistrict", message: M.zoningDistrict };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 고지 문구 (접힘 사유별 — «확인 필요» 병기)
// ─────────────────────────────────────────────────────────────────────────────

/** 과세기준일 2016.6.1. 전 — 영 §103의2 시행 전. 종전 `isSeparateAggregateLand` 문구와 같은 문장. */
export function propertyDemolishedNotYetNotice(taxBaseDate: Date): string {
  return `과세기준일 ${format(taxBaseDate, "yyyy-MM-dd")}에는 철거ㆍ멸실 건축물 부속토지 특례(${PROPERTY_SEPARATE.DEMOLISHED_GRACE})가 시행되기 전(첫 적용 과세기준일 2016.6.1.)이라 건축물이 없는 토지로 보아 종합합산으로 처리합니다 — 확인 필요.`;
}

export function propertyDemolishedPeriodNotice(months: number): string {
  return `과세기준일 현재 철거ㆍ멸실일부터 ${months}개월(과세기준일 시행본 기준 — ${PROPERTY_SEPARATE.DEMOLISHED_GRACE})이 지나 건축물이 없는 토지로 보아 종합합산으로 처리합니다.`;
}

export const PROPERTY_DEMOLISHED_PERMIT_NO_NOTICE =
  `허가·사용승인(임시사용승인 포함)을 받지 않은 건축물·주택의 부속토지는 ${PROPERTY_SEPARATE.DEMOLISHED_PERMIT}에 따라 별도합산에서 제외되어 종합합산으로 이관했습니다 — 확인 필요.`;

export const PROPERTY_DEMOLISHED_PERMIT_UNKNOWN_NOTICE =
  `허가·사용승인(임시사용승인 포함)을 받았는지 확인되지 않아(모름·미선택) ${PROPERTY_SEPARATE.DEMOLISHED_PERMIT}의 요건 충족을 인정하지 않고 종합합산으로 이관했습니다 — 확인 필요.`;

export const PROPERTY_DEMOLISHED_OTHER_USE_NOTICE =
  `철거 후 건축을 위한 용도 외의 다른 용도로 사용하는(또는 사용 여부를 확인할 수 없는) 부속토지는 ${PROPERTY_SEPARATE.DEMOLISHED_OTHER_USE} 괄호·${PROPERTY_SEPARATE.DEMOLISHED_VACANT_HOUSE} 단서에 따라 별도합산에서 제외되어 종합합산으로 이관했습니다 — 확인 필요.`;

export const PROPERTY_DEMOLISHED_PUBLIC_USE_UNPAID_NOTICE =
  `국가 등이 무상으로 공용·공공용으로 사용하는 재산은 ${PROPERTY_SEPARATE.DEMOLISHED_VACANT_HOUSE_PUBLIC_USE}에 따라 재산세가 부과되지 않을 수 있습니다 — 이 계산기는 비과세를 판정하지 않아 별도합산에서 접어 종합합산으로 이관했습니다 — 확인 필요.`;

export const PROPERTY_DEMOLISHED_VACANT_HOUSE_UNCONFIRMED_NOTICE =
  `빈집정비사업 철거 빈집 3년 연장(${PROPERTY_SEPARATE.DEMOLISHED_VACANT_HOUSE})은 확인되지 않아 일반 한시 기간만 반영했습니다 — 확인 필요.`;

export const PROPERTY_DEMOLISHED_NO_AREA_CLAUSE_NOTICE =
  `이 과세기준일 시행본에는 철거 전 바닥면적 × 용도지역별 적용배율 범위 문언(${PROPERTY_SEPARATE.DEMOLISHED_AREA})이 없어 부속토지 전체를 별도합산 범위로 보았습니다(어디까지가 철거된 건축물의 부속토지인지는 판정하지 않았습니다) — 확인 필요.`;

export const PROPERTY_DEMOLISHED_NO_OTHER_USE_CLAUSE_NOTICE =
  `이 과세기준일 시행본에는 철거 후 건축 외 용도 사용 제외 문언(${PROPERTY_SEPARATE.DEMOLISHED_OTHER_USE})이 없어 사용 용도를 묻지 않고 별도합산 요건으로 보았습니다(철거 후 주차장 등으로 쓴 토지의 종합합산 해석이 있을 수 있습니다) — 확인 필요.`;

export const PROPERTY_DEMOLISHED_HOUSE_AREA_NOTICE =
  `철거한 주택의 부속토지는 철거 전 바닥면적 × 배율 범위 제한이 없고, 경계가 명백하지 않으면 바닥면적의 10배(${PROPERTY_SEPARATE.DEMOLISHED_HOUSE_SITE})로 봅니다 — 입력하신 부속토지 면적이 실제 경계인지 확인 필요.`;

export const PROPERTY_DEMOLISHED_AREA_INPUT_NOTICE =
  `철거 전 건축물 바닥면적 또는 용도지역을 확인할 수 없어 부속토지 범위를 산정하지 못했으므로 종합합산으로 처리합니다 — 확인 필요.`;

export const PROPERTY_DEMOLISHED_INPUT_NOTICE =
  `철거일·철거된 것의 종류·과세기준일을 확인할 수 없거나 철거일이 과세기준일 뒤여서 철거 특례를 판정하지 못했으므로 종합합산으로 처리합니다 — 확인 필요.`;

// ─────────────────────────────────────────────────────────────────────────────
// 판정
// ─────────────────────────────────────────────────────────────────────────────

export type PropertyDemolishedFoldReason = "not_yet" | "period" | "permit" | "other_use" | "public_use_unpaid" | "area_input" | "input";

export interface PropertyDemolishedVerdict {
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
  required: PropertyDemolishedRequired & { publicUse: boolean; publicUsePaid: boolean };
  notices: string[];
  legalBasis: string[];
}

export interface PropertyDemolishedJudgeInput {
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
 * 호출자(입구 ⑧·⑫)가 `propertyDemolishedFactIssue`로 결함을 막았다고 전제하되, 직접 호출에서 결함이 있으면 throw 없이 접는다(혜택 불성립 방향 — 법 근거 없는 유리 적용 금지).
 */
export function judgePropertyDemolishedLand(i: PropertyDemolishedJudgeInput): PropertyDemolishedVerdict {
  const { taxBaseDate: s, removedOn: r, kind, facts } = i;
  const landArea = Number.isFinite(i.landArea) && i.landArea > 0 ? i.landArea : 0;
  const base = { areaClauseApplied: false, vacantHouseExtensionUnconfirmed: false, legalBasis: [PROPERTY_SEPARATE.DEMOLISHED_GRACE] };
  const fold = (
    reason: PropertyDemolishedFoldReason,
    periodMonths: PropertyDemolishedVerdict["periodMonths"],
    required: PropertyDemolishedVerdict["required"],
    notices: string[],
    extra: { vacantHouseExtensionUnconfirmed?: boolean; legalBasis?: string } = {},
  ): PropertyDemolishedVerdict => ({
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

  const need = propertyDemolishedRequired({ taxBaseDate: s, removedOn: r, kind });
  // 엔진은 요구되지 않은 칸을 읽지 않는다 — 빈집정비 «예»는 요구된 경우(주택 ∧ 문언 시행본 ∧ 철거일이 3년 안)에만 유효.
  const vacantYes = need.vacantHouse && facts.vacantHouse === "yes";
  const months = demolishedStatusPeriodMonths(s, vacantYes);
  const asked = propertyDemolishedPublicUseAsked(need, facts);
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
