/**
 * 꼬리(양도일 현재) 근거 «철거ㆍ멸실» 입력 결함 — 철거ㆍ멸실일 + 종전 바닥면적·용도지역 (NBL-STATE-HISTORY-E3-⑤ · E3f-1b · 계획서 §5.3 · §6.1 · §6.2 D-3·D-4).
 * 순수 함수 — DB·로컬 달력 함수 없음.
 *
 * ## ⑧↔⑫ 거울 (구현 위험의 중심 — 계획서 §6.1)
 * ⑤ 칸 표시 · ⑧ 차단 · ⑫′ 400 · ④ 와이어 · ⑭ 엔진 매핑이 **이 파일의 같은 함수**를 부른다 — 필수 조건 ≡ 노출 조건:
 *   · `demolishedOnRequired` — 철거ㆍ멸실일 새 칸이 필요한가(= 보이는가 = 막는가 = 보내는가).
 *   · `demolishedInputIssue` — 첫 결함 하나(철거ㆍ멸실일 → 바닥면적 → 용도지역 — 화면 순서 «근거 → 철거일 → 바닥면적»). 종전 `demolishedBasisIssue`(바닥면적·용도지역)를 안에서 부른다.
 *   · `demolishedOnWireValue` — ④가 와이어에 싣는 값(술어가 거짓이면 `""`로 덮어쓴다 — stale 비전송 · D-4).
 *   · `demolishedOnForEngine` — ⑭가 `otherLand.demolishedOn`에 싣는 값(술어가 거짓이면 stray를 읽지 않는다 · 철거 행 날짜가 새 칸보다 우선 — K-17).
 *
 * 입력 규약(⑧·⑫·⑭ 공통): `mode`·`events`는 **와이어 값**이다 — ④가 싣는 `nblOtherStateHistoryMode`·`nblOtherStateEvents`(이력 질문이 적용되지 않거나 `changed`가 아니면 `""`·`[]`). ⑧은 `stateHistoryWireFields(asset)`를 넘긴다.
 * `rawHasBuilding`은 «건축물 있음» 토글 저장값 — 양도일 현재 유무는 `effectiveOtherHasBuilding`이 파생한다(`changed`이면 마지막 건축물 사건이 이긴다).
 *
 * 철거일 출처(Q-3): ① 이력(`changed`) 마지막 건축물 사건이 철거 행이고 그 행 날짜가 유효 → 그 날짜(새 칸은 숨김·무시) ② 그 밖(이력 없음·`unchanged`·`unknown`·철거 행 없음·취득 전 철거·축 B 둘째 이후 카드) → 새 칸 `nblOtherDemolishedOn`.
 * 철거 행 날짜 자체의 결함(빈칸·해석 불가)은 사건 행 검증(`stateEventRowIssue`)이 먼저 막는다 — 이 파일은 그 행을 «날짜를 대지 않음»으로 보고 새 칸을 요구하되, ⑫′는 행 결함이 있으면 중복 안내하지 않는다.
 */
import { toOptionalDate } from "@/lib/api/date-coerce";
import { NBL } from "../legal-codes";
import { effectiveOtherHasBuilding, tailRemovalDateOf } from "./other-land-state-history";
import { demolishedBasisIssue, requiresDemolishedFloorArea } from "./property-tax-basis";
import type { DemolishedBasisIssuePart, PropertyTaxBasis } from "./property-tax-basis";
import type { PropertyTaxType } from "./types";

/** ⑧·⑫·⑭·④가 같이 읽는 판정 인자 — 철거ㆍ멸실일 출처·요구 술어가 읽는 사실. */
export interface DemolishedOnFacts {
  /** 사용자가 선언한 재산세 분류. */
  declared: PropertyTaxType;
  /** 이력 질문 답(와이어 — `changed`일 때만 사건을 읽는다). */
  mode: string | undefined;
  /** 와이어 사건(`changed`가 아니면 `[]`). */
  events: ReadonlyArray<{ kind: string; date: unknown }>;
  /** 「건축물 있음」 토글 저장값 — `changed` + 건축물 사건이 있으면 사건이 이긴다. */
  rawHasBuilding: boolean;
  /** 사용자가 고른 근거(미선택이면 `undefined`). */
  basis: PropertyTaxBasis | undefined;
}

export type DemolishedInputIssuePart = DemolishedBasisIssuePart | "demolishedOn";

export const DEMOLISHED_ON_REQUIRED_MESSAGE =
  `철거ㆍ멸실 근거 — 철거ㆍ멸실일을 입력하세요. ${NBL.PTAX_BASIS_DEMOLISHED_BODY}의 한시 별도합산 기간이 철거ㆍ멸실된 날부터 정해져 이 근거를 인정할 수 있는지 판정하는 데 필요합니다. ` +
  `건축물대장·등기부로 확인한 사실상 철거ㆍ멸실일(알 수 없으면 공부상 철거ㆍ멸실일)을 입력하세요(취득 전에 철거됐어도 입력합니다).`;

export function demolishedOnInvalidMessage(value: string): string {
  return `철거ㆍ멸실 근거 — 철거ㆍ멸실일 "${value}"을(를) 날짜로 읽을 수 없습니다. YYYY-MM-DD 형식으로 입력하세요.`;
}

export function demolishedOnNotBeforeTransferMessage(value: string, transferDate: string): string {
  return `철거ㆍ멸실 근거 — 철거ㆍ멸실일(${value})은 양도일(${transferDate})보다 앞이어야 합니다. 양도일 현재 철거된 건축물의 부속토지에 대한 근거입니다.`;
}

/** 이 입력이 근거 «철거ㆍ멸실»(꼬리)인가 — 종전 술어 `requiresDemolishedFloorArea`와 같다(바닥면적 칸이 보이는 조건). 양도일 현재 건축물 유무는 사건에서 파생한다. */
function tailBasisIsDemolished(i: DemolishedOnFacts): boolean {
  return requiresDemolishedFloorArea(i.declared, effectiveOtherHasBuilding(i.rawHasBuilding, i.mode, i.events), i.basis);
}

/**
 * 출처 ① — 이력(`changed`)이 꼬리 철거일을 댄다: 꼬리에 건축물이 없고 마지막 건축물 사건이 철거 행이며 그 행 날짜가 **유효**하다. 아니면 `undefined`.
 * 날짜 유효성은 `toOptionalDate`(Date · ISO 문자열) — 빈칸·해석 불가는 «대지 않음»이다.
 */
export function demolishedOnRowDate(i: Pick<DemolishedOnFacts, "mode" | "events" | "rawHasBuilding">): Date | undefined {
  if (i.mode !== "changed") return undefined;
  return toOptionalDate(tailRemovalDateOf(i.events, effectiveOtherHasBuilding(i.rawHasBuilding, i.mode, i.events)));
}

/**
 * 철거ㆍ멸실일 **새 칸**이 필요한가 — 꼬리 근거 «철거ㆍ멸실»(별도합산 + 꼬리 건축물 없음 + 근거 `demolished`) ∧ 이력의 철거 행이 날짜를 대지 않음.
 * ⑤가 칸을 그리는 조건 = ⑧이 막는 조건 = ⑫′가 400을 내는 조건 = ④가 보내는 조건 = ⑭가 읽는 조건(화면에 없는 칸 400 금지).
 */
export function demolishedOnRequired(i: DemolishedOnFacts): boolean {
  return tailBasisIsDemolished(i) && demolishedOnRowDate(i) === undefined;
}

export interface DemolishedInputFacts extends DemolishedOnFacts {
  /** 새 칸 `nblOtherDemolishedOn` 저장값(와이어 문자열). */
  demolishedOn: string | undefined;
  /** 양도일(ISO) — 해석 불가·빈 값이면 «양도일 이후» 규칙을 건너뛴다(앞 단계 검증 몫). */
  transferDate: string | undefined;
  floorArea: number | undefined;
  zoneType: string;
  zoneMapped: boolean;
}

/** 새 칸의 결함 — `demolishedOnRequired`일 때만. 빈칸 · 날짜로 읽을 수 없음 · 양도일 이후(≥, 취득일 이전은 허용). 칸이 불요하면 값을 **읽지 않는다**(stray·stale 무시). */
function demolishedOnIssue(i: DemolishedInputFacts): string | null {
  if (!demolishedOnRequired(i)) return null;
  const value = (i.demolishedOn ?? "").trim();
  if (!value) return DEMOLISHED_ON_REQUIRED_MESSAGE;
  const on = toOptionalDate(value);
  if (!on) return demolishedOnInvalidMessage(value);
  const transfer = toOptionalDate(i.transferDate);
  if (transfer && on.getTime() >= transfer.getTime()) return demolishedOnNotBeforeTransferMessage(value, i.transferDate ?? "");
  return null;
}

/**
 * 꼬리 근거 «철거ㆍ멸실» 입력의 **첫 결함 하나** — ⑧(`validateNblOtherLand`)과 ⑫′(`refineNonBusinessLandRaw`)가 같은 함수·같은 문구를 쓴다.
 * 순서: 철거ㆍ멸실일(새 칸 요구 시) → 종전 바닥면적 → 용도지역(= `demolishedBasisIssue`). 근거가 «철거ㆍ멸실»이 아니면 null.
 */
export function demolishedInputIssue(i: DemolishedInputFacts): { part: DemolishedInputIssuePart; message: string } | null {
  if (!tailBasisIsDemolished(i)) return null;
  const onMessage = demolishedOnIssue(i);
  if (onMessage) return { part: "demolishedOn", message: onMessage };
  return demolishedBasisIssue({
    declared: i.declared,
    hasBuilding: effectiveOtherHasBuilding(i.rawHasBuilding, i.mode, i.events),
    basis: i.basis,
    floorArea: i.floorArea,
    zoneType: i.zoneType,
    zoneMapped: i.zoneMapped,
  });
}

/** ④ 와이어 값(D-4) — 새 칸이 필요할 때만 저장값을 싣고 아니면 `""`로 덮어쓴다(`nbl*` prefix-pick이 stale 값을 싣지 않게). */
export function demolishedOnWireValue(i: DemolishedOnFacts & { demolishedOn: string | undefined }): string {
  return demolishedOnRequired(i) ? (i.demolishedOn ?? "") : "";
}

/**
 * ⑭ 엔진 값 — 근거가 «철거ㆍ멸실»일 때만 `otherLand.demolishedOn`에 싣는다. 출처 ①(철거 행 날짜)이 새 칸보다 우선하고(K-17 — 새 칸의 stray는 읽지 않는다), 없으면 새 칸 값(`parseDate` 결과).
 * 근거가 «철거ㆍ멸실»이 아니면 `undefined`(키 없음 = 종전 입력과 바이트 동일 — K-18).
 */
export function demolishedOnForEngine(i: DemolishedOnFacts, newFieldValue: Date | undefined): Date | undefined {
  if (!tailBasisIsDemolished(i)) return undefined;
  return demolishedOnRowDate(i) ?? newFieldValue;
}
