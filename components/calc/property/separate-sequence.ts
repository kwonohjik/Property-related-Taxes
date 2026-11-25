/**
 * 재산세 별도합산 상세(Step 2) «순차 노출» 화면 파생값 — 확정 안내 · 읽기 전용 낭독 한 줄 · «이전에 고른 답» 대상 (PSA-SU · 계획서 `property-separate-demolished-sequential.ui.plan.md` §2.1-5 · §2.5 · §2.9).
 *
 * 전부 **렌더 파생 순수 함수**다 — 어느 칸이 읽히는지·어디서 확정되는지·확정 사유 문장은 엔진 사슬(`demolishedChainOf`·`buildingChainOf`)과 엔진 상수가 정한다.
 * 이 모듈은 날짜·시행본·답을 비교하지 않고 새 법률 문장을 짓지 않는다(`useEffect → store` 미러링 없음 — 확인 집합은 호출 컴포넌트의 핸들러가 갱신한다).
 */
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { buildingChainOf } from "@/lib/calc/property-separate-requirements";
import { buildingFactIssueOf } from "@/lib/calc/property-separate-requirements";
import { demolishedChainOf } from "@/lib/calc/property-separate-requirements";
import { PROPERTY_ASK_FIELD_NAME } from "@/lib/calc/property-demolished-verdict-text";
import { PROPERTY_BUILDING_PERMIT_NO_NOTICE } from "@/lib/tax-engine/property-separate-requirements";
import { PROPERTY_BUILDING_PERMIT_UNKNOWN_NOTICE } from "@/lib/tax-engine/property-separate-requirements";
import type {
  PropertyDemolishedAskField,
  PropertyDemolishedFoldReason,
  PropertyRequirementFact,
} from "@/lib/tax-engine/property-separate-requirements";
import { demolishedFormValues } from "./request-body";
import type { FormState } from "./shared";

/** 답 칸 id — 철거 사슬 칸(엔진 `PropertyDemolishedAskField`) + 비철거 허가 칸. 용도지역·바닥면적 쌍은 `buildingFloorArea` 하나. */
export type SequenceField = PropertyDemolishedAskField | "buildingPermit";

/** 확정 사유 — 철거 접힘 사유 + 비철거 허가(철거 판정 사유가 아니라 UI 전용 — 엔진 문서 E-S7). */
export type SettledReason = PropertyDemolishedFoldReason | "building_permit";

export interface Settled {
  reason: SettledReason;
  /** 사유 1줄 — 엔진 `resolved.notice`(철거) 또는 엔진 고지 상수(비철거)를 그대로 */
  notice: string;
  /** 확정시킨 답(`at` 칸의 값) — «모름»이면 안내 문장이 달라진다. 철거일만으로 확정이거나 종류 답으로 확정이면 `""` */
  answer: PropertyRequirementFact;
  /** 철거일(과세기준일)만으로 확정 — 사용자가 고른 «답»이 없어 안내 문장이 «이 답으로»·«답을 바꾸면»이 아니라 철거일을 가리킨다(엔진 `resolved.at === "date"`) */
  dateOnly: boolean;
}

/** 확정 안내 1문장(계획서 §2.5-1) — 답으로 확정된 경우. 날짜만으로 확정이면 `SETTLED_LEAD_BY_DATE` */
export const SETTLED_LEAD = "이 답으로 별도합산 불성립(종합합산 이관)이 확정되어 나머지 칸은 묻지 않습니다.";
export const SETTLED_LEAD_BY_DATE = "철거일(과세기준일)로 결과가 정해져 별도합산 불성립(종합합산 이관)이 확정되어 나머지 칸은 묻지 않습니다.";

export function settledLeadOf(settled: Pick<Settled, "dateOnly">): string {
  return settled.dateOnly ? SETTLED_LEAD_BY_DATE : SETTLED_LEAD;
}

/** 확정 안내 마지막 문장(계획서 §2.5-3) — «모름»은 인정하지 않아 확정되는 것임을 알린다. 날짜만으로 확정이면 바꿀 것은 철거일이다 */
export function settledTail(settled: Pick<Settled, "answer" | "dateOnly">): string {
  if (settled.dateOnly) return "철거일을 바꾸면 이어서 다시 묻습니다.";
  return settled.answer === "unknown"
    ? "«모름»은 요건 충족을 인정하지 않아 확정됩니다 — 확인되면 답을 바꾸세요. 답을 바꾸면 이어서 다시 묻습니다."
    : "답을 바꾸면 이어서 다시 묻습니다.";
}

/** 철거 ON인데 철거일이 없을 때의 안내 — 화면(`pt-demolished-dates-notice`)과 낭독 한 줄(`role="status"`)이 같은 문구를 쓴다 */
export const DEMOLISHED_DATE_NOTICE = "철거일을 입력하면 이어서 필요한 칸이 표시됩니다.";

/** 철거 사슬이 접힘으로 확정했으면 그 사유·문장·확정시킨 답 — 아니면 null(성립 `holds`·미확정 포함) */
export function demolishedSettledOf(form: FormState): Settled | null {
  const values = demolishedFormValues(form);
  const resolved = demolishedChainOf(values).resolved;
  if (!resolved || resolved.kind !== "fold") return null;
  const answers: Partial<Record<PropertyDemolishedAskField | "date", PropertyRequirementFact>> = {
    demolishedPermit: values.permit,
    demolishedOtherUse: values.otherUse,
    demolishedVacantHouse: values.vacantHouse,
    demolishedPublicUse: values.publicUse,
    demolishedPublicUsePaid: values.publicUsePaid,
  };
  return { reason: resolved.foldReason, notice: resolved.notice, answer: answers[resolved.at] ?? "", dateOnly: resolved.at === "date" };
}

/** 비철거 허가 «아니오»·«모름»으로 확정됐으면 사유(엔진 고지 상수) — 아니면 null */
export function buildingSettledOf(form: FormState): Settled | null {
  if (!buildingChainOf(form.saBuildingPermit).resolvedFold) return null;
  return {
    reason: "building_permit",
    notice: form.saBuildingPermit === "no" ? PROPERTY_BUILDING_PERMIT_NO_NOTICE : PROPERTY_BUILDING_PERMIT_UNKNOWN_NOTICE,
    answer: form.saBuildingPermit,
    dateOnly: false,
  };
}

const SETTLED_STATUS = "별도합산 불성립이 확정되어 나머지 칸은 묻지 않습니다";
const BUILDING_AREA_NAME = "건물 바닥면적·용도지역";

/**
 * 항상 마운트된 `role="status"` 한 줄 — 다음 질문 또는 확정(렌더 파생). 새 카드 전체를 live로 감싸지 않는다(긴 라벨·힌트가 통째로 낭독됨).
 * 칸 이름은 결과 카드 «입력이 필요했던 칸»과 같은 짧은 이름 맵(`PROPERTY_ASK_FIELD_NAME`)을 쓴다.
 */
export function sequenceStatusText(form: FormState): string {
  if (form.saDemolished) {
    const chain = demolishedChainOf(demolishedFormValues(form));
    if (!form.saDemolishedDate) return DEMOLISHED_DATE_NOTICE;
    if (chain.next) return `다음 질문: ${PROPERTY_ASK_FIELD_NAME[chain.next]}`;
    return chain.resolved?.kind === "fold" ? SETTLED_STATUS : "";
  }
  if (buildingChainOf(form.saBuildingPermit).resolvedFold) return SETTLED_STATUS;
  const issue = buildingFactIssueOf({
    permit: form.saBuildingPermit,
    zoningDistrict: form.saZoningDistrict,
    buildingFloorArea: parseDecimal(form.saBuildingFloorArea) || undefined,
  });
  if (!issue) return "";
  return `다음 질문: ${issue.field === "buildingPermit" ? PROPERTY_ASK_FIELD_NAME.demolishedPermit : BUILDING_AREA_NAME}`;
}

/** 폼 키 → 답 칸 id — 핸들러가 «사용자가 이 칸을 건드렸다»를 확인 집합에 넣을 때 쓴다 */
const FIELD_OF_FORM_KEY: Partial<Record<keyof FormState, SequenceField>> = {
  saDemolishedKind: "demolishedKind",
  saDemolishedVacantHouse: "demolishedVacantHouse",
  saDemolishedPermit: "demolishedPermit",
  saDemolishedOtherUse: "demolishedOtherUse",
  saDemolishedPublicUse: "demolishedPublicUse",
  saDemolishedPublicUsePaid: "demolishedPublicUsePaid",
  saZoningDistrict: "buildingFloorArea",
  saBuildingFloorArea: "buildingFloorArea",
  saBuildingPermit: "buildingPermit",
};

/** 이 패치가 건드린 답 칸들 */
export function answerFieldsOfPatch(patch: Partial<FormState>): SequenceField[] {
  return (Object.keys(patch) as (keyof FormState)[]).flatMap((k) => FIELD_OF_FORM_KEY[k] ?? []);
}

/** 지금 화면이 그리는 답 칸 — 철거: 엔진 `chain.order`(종류·사실 칸·면적 쌍) · 비철거: 허가(시행본이 요건을 둘 때) + 면적 쌍(`areaInputs`) */
export function drawnAnswerFieldsOf(form: FormState): SequenceField[] {
  if (form.saDemolished) return demolishedChainOf(demolishedFormValues(form)).order;
  const chain = buildingChainOf(form.saBuildingPermit);
  return [...(chain.permit ? (["buildingPermit"] as const) : []), ...(chain.areaInputs ? (["buildingFloorArea"] as const) : [])];
}

/** 그 칸이 저장값을 가지고 있는가 — 종류·3지선다는 값이 있으면, 면적 쌍은 용도지역·바닥면적 중 하나라도 */
function storedAnswerOf(form: FormState, field: SequenceField): boolean {
  switch (field) {
    case "demolishedKind": return form.saDemolishedKind !== "";
    case "demolishedVacantHouse": return form.saDemolishedVacantHouse !== "";
    case "demolishedPermit": return form.saDemolishedPermit !== "";
    case "demolishedOtherUse": return form.saDemolishedOtherUse !== "";
    case "demolishedPublicUse": return form.saDemolishedPublicUse !== "";
    case "demolishedPublicUsePaid": return form.saDemolishedPublicUsePaid !== "";
    case "buildingPermit": return form.saBuildingPermit !== "";
    case "buildingFloorArea": return form.saZoningDistrict !== "" || form.saBuildingFloorArea !== "";
  }
}

/**
 * «이전에 고른 답» 표식을 붙일 칸 = 그려졌고 · 저장값이 있고 · 사용자가 이번에 확인(클릭)하지 않은 칸.
 * 앞 답을 바꿔 사슬이 다시 길어지면 숨어 있던 칸이 저장값을 가진 채 나타나므로, 그 값이 지금 선택한 답이 아님을 알린다(계획서 §2.1-5 · SQ-4).
 */
export function prevAnswerFieldsOf(form: FormState, confirmed: ReadonlySet<SequenceField>): ReadonlySet<SequenceField> {
  return new Set(drawnAnswerFieldsOf(form).filter((f) => storedAnswerOf(form, f) && !confirmed.has(f)));
}

/** 패치 반영 뒤의 확인 집합 — 이번에 건드린 칸을 넣고, 패치 뒤 더 이상 그려지지 않는 칸은 뺀다(숨은 칸은 다시 열리면 미확인) */
export function nextConfirmed(form: FormState, patch: Partial<FormState>, confirmed: ReadonlySet<SequenceField>): ReadonlySet<SequenceField> {
  const after = { ...form, ...patch };
  const drawn = new Set(drawnAnswerFieldsOf(after));
  return new Set([...confirmed, ...answerFieldsOfPatch(patch)].filter((f) => drawn.has(f)));
}
