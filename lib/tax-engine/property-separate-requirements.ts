/**
 * 재산세 별도합산 — 철거ㆍ멸실 부속토지 요건 판정 leaf (PSA-E1 · 계획서 docs/01-plan/features/property-separate-demolished-requirements.engine.plan.md v3 §5).
 * 순수 함수 — DB·`new Date(x)`·로컬 달력 함수 없음. 엔진 연결은 `isSeparateAggregateLand`(PSA-E2 철거 · PSA-E3 본 경로 허가).
 *
 * ## 판정 모델 — 과세기준일 한 점
 * 영 §103의2는 «과세기준일 현재»로 정해지고 재산세 납세의무는 과세기준일(6.1.)에 성립하므로(지방세기본법 §34①8호), 판정은 **그 과세기준일 `s`의 시행본 하나**로 한다.
 * 양도세 서브엔진(`non-business-land/*`)의 일 단위 창·구간 모델은 쓰지 않고 import도 하지 않는다(역방향 의존 금지) — 연혁 술어(`data/nbl-historical-values-era.ts`)·`civil-period`·`utc-date`만 재사용한다.
 *
 * ## 단일 인코딩 — 사슬 걷기(PSA-S1 · 계획서 property-separate-demolished-sequential.engine.plan.md §2)
 * `walkDemolishedChain` 한 번의 걷기가 (a) 판정 (b) 읽은 칸 순서 (c) 첫 미답 칸을 함께 낸다. `judgePropertyDemolishedLand`·`propertyDemolishedChain`·`propertyDemolishedFactIssue`는 모두 그 걷기에서 파생되므로
 * ⑤ 노출 · ⑧ 차단 · ⑫ 400 · ④ 운반 · 엔진 읽기가 읽는 칸·순서가 **구조적으로 같다**(별도 요구 규칙 없음). **앞 답이 결과를 확정하면 뒤 칸은 읽지 않는다**(접힘 조건은 AND라 순서는 판정을 바꾸지 않고, 질문 수와 첫 실패 사유만 바꾼다).
 * 읽지 않은 칸의 저장값(stale)은 판정·`required`·`periodMonths`·고지를 바꾸지 못한다.
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

/**
 * 영 §101① 단서의 허가·사용승인 요건이 그 과세기준일 시행본에 있는가(비철거 본 경로 — Q-2 · PSA-E3).
 * 단서는 §101① 본문의 «다음 각 호» 앞에 있어 1호(공장용 건축물)·2호(그 밖의 건축물) **둘 다**에 걸린다 — 공장용지(`isFactory`)도 같다.
 * 철거 경로(`demolished`)는 영 §103의2 본문 후단이 같은 요건을 맡으므로(`demolishedPermit`) 이 칸을 묻지 않는다.
 */
export function propertyBuildingPermitRequired(s: Date): boolean {
  return isValid(s) && !isBefore(s, FROM_2011_06_01);
}

/**
 * 본 경로 허가·사용승인 칸 값의 의미(영 §101① 단서 — 법문의 «사용 중인»을 칸 뜻에 그대로 담는다):
 * - `yes`     = 단서에 걸리지 않는다 — 허가 등을 받았거나 받을 필요가 없고, 사용승인(임시사용승인 포함)도 받았거나 받을 필요가 없거나 **사용 중이 아니다**.
 * - `no`      = 허가 등을 받아야 하는데 받지 않았거나(사용 여부 무관), 사용승인을 받아야 하는데 받지 않고 **사용 중**이다.
 * - `unknown` = 모름(혜택 불성립 + 확인 필요).
 * 법문: «허가 등을 받지 아니한 건축물 또는 사용승인을 받아야 할 건축물로서 사용승인…을 받지 아니하고 사용 중인 건축물» — «사용 중인»은 사용승인 쪽에만 걸린다.
 */
export function propertyBuildingPermitHolds(i: { taxBaseDate: Date; permit: PropertyRequirementFact | undefined }): boolean {
  return !propertyBuildingPermitRequired(i.taxBaseDate) || i.permit === "yes";
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

// ─────────────────────────────────────────────────────────────────────────────
// 사슬 걷기 — 판정 · 읽은 칸 순서 · 첫 미답 칸 (단일 인코딩)
// ─────────────────────────────────────────────────────────────────────────────

/** 사슬이 읽는 칸. «바닥면적 + 용도지역»은 한 쌍으로 `buildingFloorArea` 하나 */
export type PropertyDemolishedAskField =
  | "demolishedKind"
  | "demolishedVacantHouse"
  | "demolishedPermit"
  | "demolishedOtherUse"
  | "demolishedPublicUse"
  | "demolishedPublicUsePaid"
  | "buildingFloorArea";

const ASK_FIELDS: readonly PropertyDemolishedAskField[] = [
  "demolishedKind",
  "demolishedVacantHouse",
  "demolishedPermit",
  "demolishedOtherUse",
  "demolishedPublicUse",
  "demolishedPublicUsePaid",
  "buildingFloorArea",
];

export type PropertyDemolishedPeriodMonths = 0 | 6 | 12 | 36;

/** 사슬 입구 — `propertyDemolishedFactIssue`의 입력과 같다. `facts`는 필수(생략하면 «전부 미답»이 되므로 타입으로 막는다). */
export type PropertyDemolishedChainInput = PropertyDemolishedFactInput;

export interface PropertyDemolishedChain {
  /** 엔진이 읽은 칸 — 읽는 순서 = 화면 순서. 첫 미답 칸에서 멈춘다(그 칸 포함). */
  order: PropertyDemolishedAskField[];
  /** `order`에서 파생 — 위젯 노출 · ④ 전송 · ⑫ 요구가 읽는다. */
  asked: Record<PropertyDemolishedAskField, boolean>;
  /** 첫 미답 칸(없으면 null). 공장용지 ∧ 종류 «주택» 모순이면 고칠 칸인 `demolishedKind`. */
  next: PropertyDemolishedAskField | null;
  /** 결과가 확정됐는가 — 날짜 결함·모순이 아니고 `next`가 null일 때만 non-null. `at` = 결과를 확정한 답의 칸(날짜만으로 확정이면 "date"). */
  resolved: { kind: "holds" } | { kind: "fold"; foldReason: PropertyDemolishedFoldReason; at: PropertyDemolishedAskField | "date"; notice: string } | null;
  /** 빈집정비 칸의 자리 — 관문(허가 앞) / 단서 하위(건축 외 용도 «예» 뒤) / 안 읽음. */
  vacantHousePosition: "gate" | "proviso" | null;
}

type FoldOutcome = {
  type: "fold";
  reason: PropertyDemolishedFoldReason;
  at: PropertyDemolishedAskField | "date";
  months: PropertyDemolishedPeriodMonths;
  notices: string[];
  legalBasis?: string;
  extensionUnconfirmed?: boolean;
};
type WalkOutcome =
  | { type: "input" }
  | FoldOutcome
  | { type: "holds"; months: PropertyDemolishedPeriodMonths; notices: string[]; area?: { multiplier: number; floor: number } };

interface Walk {
  order: PropertyDemolishedAskField[];
  next: PropertyDemolishedAskField | null;
  vacantHousePosition: "gate" | "proviso" | null;
  outcome: WalkOutcome;
}

const foldOf = (
  reason: PropertyDemolishedFoldReason,
  at: FoldOutcome["at"],
  months: PropertyDemolishedPeriodMonths,
  notices: string[],
  extra: { legalBasis?: string; extensionUnconfirmed?: boolean } = {},
): FoldOutcome => ({ type: "fold", reason, at, months, notices, ...extra });

const PERIOD_LABEL: Record<6 | 12 | 36, string> = { 6: "6개월", 12: "1년", 36: "3년" };

/** 날짜만으로 접힘이 확정되는 구간(철거일이 가장 긴 가능 기간 밖)의 고지 — 종류와 무관하다. 일반·빈집 기간이 같은 시행본(2024.6.1. 전)은 기존 문장 그대로(SQ-5). */
export function propertyDemolishedPeriodAllKindsNotice(general: 6 | 12, vacant: 6 | 12 | 36): string {
  if (general === vacant) return propertyDemolishedPeriodNotice(general);
  return `과세기준일 현재 철거ㆍ멸실일부터 일반 한시 기간(${PERIOD_LABEL[general]})과 빈집정비사업 철거 빈집 한시 기간(${PERIOD_LABEL[vacant]})이 모두 지나(과세기준일 시행본 기준 — ${PROPERTY_SEPARATE.DEMOLISHED_GRACE}) 건축물이 없는 토지로 보아 종합합산으로 처리합니다.`;
}

/**
 * 사슬 걷기(오라클 = 계획서 §2.1 단계 표). 위에서 아래로 읽으며 **비어 있는 칸을 읽으면 멈춘다**(판정은 «yes 아님 = 접힘» — 직접 호출의 E-9와 같다).
 * 접힘이 확정되면 그 뒤 칸은 읽지 않는다. 읽기 순서: 날짜 → 종류 → 빈집정비(관문 — 주택 ∧ 철거일이 일반 기간 밖·빈집 기간 안) → 허가 → 건축 외 용도
 * → (건축 외 «예» ∧ 주택) 빈집정비(단서 하위 — 관문에서 이미 읽었으면 생략) → 공용 → 유료 → (건축물 ∧ 면적 문언 시행본) 용도지역·바닥면적.
 */
function walkDemolishedChain(i: PropertyDemolishedFactInput): Walk {
  const { taxBaseDate: s, removedOn: r, kind, facts } = i;
  const order: PropertyDemolishedAskField[] = [];
  let vacantHousePosition: Walk["vacantHousePosition"] = null;
  const stop = (next: PropertyDemolishedAskField | null, outcome: WalkOutcome): Walk => ({ order, next, vacantHousePosition, outcome });
  /** 칸을 읽는다 — 비어 있으면 그 칸이 `next`. */
  const read = (field: PropertyDemolishedAskField, value: PropertyRequirementFact | undefined): PropertyDemolishedAskField | null => {
    order.push(field);
    return blank(value) ? field : null;
  };

  // 0. 날짜 결함(철거일·과세기준일을 읽을 수 없거나 철거일이 과세기준일 뒤) — 칸을 읽지 않는다. 고칠 칸은 철거일(⑧이 문구).
  if (!r || !isValid(r) || !isValid(s) || utcDayDiff(r, s) > 0) return stop(null, { type: "input" });

  // 1. 날짜 확정 — 종류를 읽지 않는다.
  const longest = demolishedStatusPeriodMonths(s, true);
  if (longest === 0) return stop(null, foldOf("not_yet", "date", 0, [propertyDemolishedNotYetNotice(s)]));
  const general = demolishedStatusPeriodMonths(s, false) as 6 | 12;
  if (!isWithinPeriodMonths(r, longest, s)) return stop(null, foldOf("period", "date", longest, [propertyDemolishedPeriodAllKindsNotice(general, longest)]));

  // 2. 종류
  order.push("demolishedKind");
  if (!isKind(kind)) return stop("demolishedKind", { type: "input" });
  const house = kind === "house";
  let months: PropertyDemolishedPeriodMonths = general;

  // 3. 빈집정비 관문 — 철거일이 일반 기간 밖이면 이 답이 기간 안인지를 정한다(주택). 건축물은 3′ 접힘.
  if (!isWithinPeriodMonths(r, general, s)) {
    if (!house) return stop(null, foldOf("period", "demolishedKind", general, [propertyDemolishedPeriodNotice(general)]));
    vacantHousePosition = "gate";
    const next = read("demolishedVacantHouse", facts.vacantHouse);
    if (facts.vacantHouse !== "yes") {
      // 연장 여부가 «모름·미선택»이라 일반 기간만 반영했는데 3년이면 안일 수 있는 경우 — 고지(결과가 달라질 수 있다).
      const extensionUnconfirmed = facts.vacantHouse !== "no";
      const notices = [propertyDemolishedPeriodNotice(general), ...(extensionUnconfirmed ? [PROPERTY_DEMOLISHED_VACANT_HOUSE_UNCONFIRMED_NOTICE] : [])];
      return stop(next, foldOf("period", "demolishedVacantHouse", general, notices, { extensionUnconfirmed }));
    }
    months = 36;
  }

  // 4. 허가·사용승인
  if (demolishedPermitClauseApplies(s)) {
    const next = read("demolishedPermit", facts.permit);
    if (facts.permit !== "yes") {
      const notice = facts.permit === "no" ? PROPERTY_DEMOLISHED_PERMIT_NO_NOTICE : PROPERTY_DEMOLISHED_PERMIT_UNKNOWN_NOTICE;
      return stop(next, foldOf("permit", "demolishedPermit", months, [notice], { legalBasis: PROPERTY_SEPARATE.DEMOLISHED_PERMIT }));
    }
  }

  // 5. 건축 외 용도(2호 단서 — 빈집정비 철거 빈집이 공용·공공용으로 쓰이고 재산세가 부과되면 포함)
  const notices: string[] = [];
  if (demolishedOtherUseClauseApplies(s)) {
    const otherUse = facts.otherUse;
    const nextOtherUse = read("demolishedOtherUse", otherUse);
    const foldOtherUse = (at: PropertyDemolishedAskField, next: PropertyDemolishedAskField | null) =>
      stop(next, foldOf("other_use", at, months, [PROPERTY_DEMOLISHED_OTHER_USE_NOTICE], { legalBasis: PROPERTY_SEPARATE.DEMOLISHED_OTHER_USE }));
    if (otherUse !== "no") {
      if (otherUse !== "yes" || !house) return foldOtherUse("demolishedOtherUse", nextOtherUse); // 모름·미선택 · 건축물(빈집정비 단서 없음)
      if (vacantHousePosition !== "gate") {
        vacantHousePosition = "proviso";
        const next = read("demolishedVacantHouse", facts.vacantHouse);
        if (facts.vacantHouse !== "yes") return foldOtherUse("demolishedVacantHouse", next);
        months = 36;
      }
      const nextPublic = read("demolishedPublicUse", facts.publicUse);
      if (facts.publicUse !== "yes") return foldOtherUse("demolishedPublicUse", nextPublic);
      const nextPaid = read("demolishedPublicUsePaid", facts.publicUsePaid);
      if (facts.publicUsePaid === "no") {
        return stop(nextPaid, foldOf("public_use_unpaid", "demolishedPublicUsePaid", months, [PROPERTY_DEMOLISHED_PUBLIC_USE_UNPAID_NOTICE], { legalBasis: PROPERTY_SEPARATE.DEMOLISHED_VACANT_HOUSE_PUBLIC_USE }));
      }
      if (facts.publicUsePaid !== "yes") return foldOtherUse("demolishedPublicUsePaid", nextPaid);
    }
  } else if (demolishedPermitClauseApplies(s)) {
    notices.push(PROPERTY_DEMOLISHED_NO_OTHER_USE_CLAUSE_NOTICE);
  }

  // 6. 면적 — 건축물 ∧ 문언 시행본만 철거 전 바닥면적 × 배율 범위. 주택·그 전 시행본은 제한 없음(부속토지 전체) + 범위 확인 필요.
  if (!house && demolishedAreaClauseAppliesOn(s)) {
    order.push("buildingFloorArea");
    const zone = i.zoningDistrict ? getZoneAreaMultiplier(i.zoningDistrict) : undefined;
    const floor = i.buildingFloorArea;
    if (!zone || !(typeof floor === "number" && Number.isFinite(floor) && floor > 0)) {
      return stop("buildingFloorArea", foldOf("area_input", "buildingFloorArea", months, [PROPERTY_DEMOLISHED_AREA_INPUT_NOTICE], { legalBasis: PROPERTY_SEPARATE.DEMOLISHED_AREA }));
    }
    return stop(null, { type: "holds", months, notices, area: { multiplier: zone.multiplier, floor } });
  }
  notices.push(house ? PROPERTY_DEMOLISHED_HOUSE_AREA_NOTICE : PROPERTY_DEMOLISHED_NO_AREA_CLAUSE_NOTICE);
  return stop(null, { type: "holds", months, notices });
}

/**
 * 철거 요건 사슬 — 지금 어느 칸까지 읽는가·다음에 무엇을 묻는가·결과가 확정됐는가. ⑤ 노출 · ⑧ 차단 · ④ 전송 · ⑫ 요구가 이 값 하나를 읽는다(UI는 날짜·시행본·답을 비교하지 않는다).
 * - 날짜 결함(철거일 > 과세기준일 등): `order = []` · `next = null` · `resolved = null` — 고칠 칸은 철거일(`propertyDemolishedFactIssue`가 문구).
 * - 공장용지 ∧ 종류 «주택» 모순(종류를 읽는 구간만): `order = ["demolishedKind"]` · `next = "demolishedKind"` — 고칠 칸인 종류 라디오가 화면에 남는다.
 */
export function propertyDemolishedChain(i: PropertyDemolishedChainInput): PropertyDemolishedChain {
  const w = walkDemolishedChain(i);
  const make = (order: PropertyDemolishedAskField[], next: PropertyDemolishedAskField | null, vacantHousePosition: Walk["vacantHousePosition"], resolved: PropertyDemolishedChain["resolved"]): PropertyDemolishedChain => ({
    order,
    asked: Object.fromEntries(ASK_FIELDS.map((f) => [f, order.includes(f)])) as Record<PropertyDemolishedAskField, boolean>,
    next,
    resolved,
    vacantHousePosition,
  });
  if (w.order.includes("demolishedKind") && i.isFactory === true && i.kind === "house") return make(["demolishedKind"], "demolishedKind", null, null);
  const o = w.outcome;
  const resolved: PropertyDemolishedChain["resolved"] =
    w.next !== null || o.type === "input"
      ? null
      : o.type === "holds"
        ? { kind: "holds" }
        : { kind: "fold", foldReason: o.reason, at: o.at, notice: o.notices.join(" ") };
  return make(w.order, w.next, w.vacantHousePosition, resolved);
}

/**
 * ⑧·⑫ 공유 — 첫 결함 1개(없으면 `null`). 순서 = 화면 순서: 철거일 → 철거일 > 과세기준일 → [종류 — 날짜만으로 접힘이 확정되면 읽지 않는다] → 공장용지×주택(종류를 읽은 경우만)
 * → 사슬의 첫 미답 칸(`propertyDemolishedChain().next` — 빈집정비 관문 → 허가 → 건축 외 용도 → 빈집정비 단서 → 공용 → 유료 → 용도지역 → 바닥면적).
 * 명시 «모름»·«아니오»·«예(건축 외 용도)»는 막지 않는다 — 엔진이 혜택 불성립으로 접고 고지한다. 미선택 `""`·빈칸만 막는다(Q-1).
 */
export function propertyDemolishedFactIssue(i: PropertyDemolishedFactInput): PropertyDemolishedFactIssue | null {
  if (!i.removedOn || !isValid(i.removedOn)) return { field: "demolishedDate", message: M.demolishedDate };
  if (!isValid(i.taxBaseDate)) return isKind(i.kind) ? null : { field: "demolishedKind", message: M.demolishedKind };
  if (utcDayDiff(i.removedOn, i.taxBaseDate) > 0) return { field: "demolishedDate", message: M.demolishedAfterBaseDate };
  const { next } = propertyDemolishedChain(i);
  switch (next) {
    case null:
      return null;
    case "demolishedKind":
      return isKind(i.kind) ? { field: "demolishedKind", message: M.demolishedFactoryHouse } : { field: "demolishedKind", message: M.demolishedKind };
    case "demolishedPermit":
      return { field: "demolishedPermit", message: M.demolishedPermit };
    case "demolishedOtherUse":
      return { field: "demolishedOtherUse", message: M.demolishedOtherUse };
    case "demolishedVacantHouse":
      return { field: "demolishedVacantHouse", message: M.demolishedVacantHouse };
    case "demolishedPublicUse":
      return { field: "demolishedPublicUse", message: M.demolishedPublicUse };
    case "demolishedPublicUsePaid":
      return { field: "demolishedPublicUsePaid", message: M.demolishedPublicUsePaid };
    case "buildingFloorArea":
      // 용도지역 → 바닥면적(화면에서 두 칸을 한 덩어리로 그리고 비철거 ⑧·⑫와 같은 순서 — 계획서 SV-8)
      return !i.zoningDistrict || !getZoneAreaMultiplier(i.zoningDistrict)
        ? { field: "zoningDistrict", message: M.zoningDistrict }
        : { field: "buildingFloorArea", message: M.buildingFloorArea };
  }
}

export const PROPERTY_BUILDING_PERMIT_ISSUE_MESSAGE =
  "이 건축물이 허가·사용승인을 받은 것인지 선택하세요 — 「예」: 허가 등을 받았거나 받을 필요가 없고, 사용승인(임시사용승인 포함)도 받았거나 받을 필요가 없거나 사용 중이 아님 · 「아니오」: 허가 등을 받아야 하는데 받지 않았거나, 사용승인을 받아야 하는데 받지 않고 사용 중임. 허가 등을 받지 않은 건축물이나 사용승인 없이 사용 중인 건축물의 부속토지는 별도합산에서 제외되어 판정에 필요합니다(모르면 「모름」).";

export interface PropertyBuildingPermitFactIssue {
  field: "buildingPermit";
  message: string;
}

/**
 * 본 경로(비철거) 허가·사용승인 칸의 결함 — ⑧·⑫ 공유. 그 과세기준일 시행본이 요건을 두는데 칸이 비어 있을 때만(`""`·미입력) 막는다.
 * 명시 «아니오»·«모름»은 막지 않는다(엔진이 접고 고지) — 철거 칸과 같은 규칙.
 */
export function propertyBuildingPermitFactIssue(i: {
  taxBaseDate: Date;
  permit: PropertyRequirementFact | undefined;
}): PropertyBuildingPermitFactIssue | null {
  if (!propertyBuildingPermitRequired(i.taxBaseDate)) return null;
  return blank(i.permit) ? { field: "buildingPermit", message: PROPERTY_BUILDING_PERMIT_ISSUE_MESSAGE } : null;
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

export const PROPERTY_BUILDING_PERMIT_NO_NOTICE =
  `허가 등을 받아야 하는데 받지 않았거나 사용승인(임시사용승인 포함)을 받지 않고 사용 중인 건축물의 부속토지는 ${PROPERTY_SEPARATE.BUILDING_PERMIT_101}에 따라 별도합산에서 제외되어 종합합산으로 이관했습니다 — 확인 필요.`;

export const PROPERTY_BUILDING_PERMIT_UNKNOWN_NOTICE =
  `허가·사용승인(임시사용승인 포함) 여부가 확인되지 않아(모름·미선택) ${PROPERTY_SEPARATE.BUILDING_PERMIT_101}의 요건 충족을 인정하지 않고 종합합산으로 이관했습니다 — 확인 필요.`;

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
  /** 적용한 한시 기간(개월) — 0 = 규정 없음(2016.6.1. 전) 또는 판정 불가. 날짜만으로 접힌 경우는 가장 긴 가능 기간(2024.6.1.~ 36). */
  periodMonths: PropertyDemolishedPeriodMonths;
  /** 별도합산 인정 면적(㎡) — 접힘이면 0. */
  recognizedArea: number;
  /** 종합합산 이관 면적(㎡) — 접힘이면 부속토지 전체. */
  excessArea: number;
  /** 면적 범위 문언(바닥면적 × 배율)을 적용했는가. */
  areaClauseApplied: boolean;
  /** 빈집정비 3년 연장 여부가 확인되지 않아(모름·미선택) 일반 기간만 반영한 결과가 달라질 수 있는가. */
  vacantHouseExtensionUnconfirmed: boolean;
  /** 이 판정이 읽은 칸 집합(사슬 echo — 화면이 «왜 이 칸이 필요했나»를 같은 값으로 말한다). 읽지 않은 칸은 false. */
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
  /** 철거 전 건축물 바닥면적(㎡) — 사슬이 읽을 때(건축물 ∧ 문언 시행본 ∧ 앞 요건 통과)만 읽는다. */
  buildingFloorArea?: number;
  /** 용도지역 — 사슬이 읽을 때만 읽는다. */
  zoningDistrict?: string;
}

/**
 * 철거ㆍ멸실 부속토지의 별도합산 한시 지위 판정(과세기준일 한 점) — 사슬 걷기 결과에 면적 계산만 얹는다. 접힘 사유 우선순위: 기간 → 허가 → 건축 외 용도(→ 단서) → (면적은 접힘이 아니라 분리).
 * 호출자(입구 ⑧·⑫)가 `propertyDemolishedFactIssue`로 결함을 막았다고 전제하되, 직접 호출에서 결함이 있으면 throw 없이 접는다(혜택 불성립 방향 — 법 근거 없는 유리 적용 금지).
 * 읽지 않은 칸의 값은 `required`·`periodMonths`·고지를 포함한 어떤 결과도 바꾸지 못한다.
 */
export function judgePropertyDemolishedLand(i: PropertyDemolishedJudgeInput): PropertyDemolishedVerdict {
  const landArea = Number.isFinite(i.landArea) && i.landArea > 0 ? i.landArea : 0;
  const w = walkDemolishedChain({ taxBaseDate: i.taxBaseDate, removedOn: i.removedOn, kind: i.kind, facts: i.facts, buildingFloorArea: i.buildingFloorArea, zoningDistrict: i.zoningDistrict });
  const has = (f: PropertyDemolishedAskField) => w.order.includes(f);
  const required: PropertyDemolishedVerdict["required"] = {
    permit: has("demolishedPermit"),
    otherUse: has("demolishedOtherUse"),
    vacantHouse: has("demolishedVacantHouse"),
    floorArea: has("buildingFloorArea"),
    publicUse: has("demolishedPublicUse"),
    publicUsePaid: has("demolishedPublicUsePaid"),
  };
  const base = { areaClauseApplied: false, vacantHouseExtensionUnconfirmed: false, legalBasis: [PROPERTY_SEPARATE.DEMOLISHED_GRACE] };
  const o = w.outcome;
  if (o.type === "input") {
    return { ...base, kind: "fold", foldReason: "input", periodMonths: 0, recognizedArea: 0, excessArea: round2(landArea), required, notices: [PROPERTY_DEMOLISHED_INPUT_NOTICE] };
  }
  if (o.type === "fold") {
    return {
      ...base,
      kind: "fold",
      foldReason: o.reason,
      periodMonths: o.months,
      recognizedArea: 0,
      excessArea: round2(landArea),
      vacantHouseExtensionUnconfirmed: o.extensionUnconfirmed ?? false,
      required,
      notices: o.notices,
      legalBasis: o.legalBasis ? [o.legalBasis] : base.legalBasis,
    };
  }
  if (o.area) {
    const baseArea = round2(o.area.floor * o.area.multiplier);
    const recognizedArea = Math.min(round2(landArea), baseArea);
    return {
      ...base,
      kind: "holds",
      periodMonths: o.months,
      recognizedArea,
      excessArea: round2(Math.max(0, landArea - recognizedArea)),
      areaClauseApplied: true,
      required,
      notices: o.notices,
      legalBasis: [PROPERTY_SEPARATE.DEMOLISHED_GRACE, PROPERTY_SEPARATE.DEMOLISHED_AREA],
    };
  }
  return { ...base, kind: "holds", periodMonths: o.months, recognizedArea: round2(landArea), excessArea: 0, required, notices: o.notices };
}
