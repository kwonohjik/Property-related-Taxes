/**
 * 나대지 구간 선언 근거 «철거ㆍ멸실»의 **사실 칸 4개 입력 결함** (NBL-STATE-HISTORY-E3-⑤ · E3f-2 · 계획서 §5.4 · §6.1 · §6.2). 순수 함수 — DB·로컬 달력 함수 없음.
 *
 * ## ⑧↔⑫ 거울 (구현 위험의 중심 — 계획서 §6.1 원칙 1)
 * ⑤ 칸 표시 · ⑧ 차단 · ⑫′ 400 · ④ 와이어가 **같은 술어** `demolishedRequiredFacts`(= 노출 조건 ≡ 필수 조건)를 쓴다. 이 파일의 `demolishedRowFactIssue`가 ⑧(`validateNblStateHistory`)과
 * ⑫′(`refineNonBusinessLandRaw`)의 **단일 함수**다 — 호출처는 인자만 채워 넘기고 술어를 자체로 쓰지 않는다.
 *
 * 요구 칸 = 근거 `demolished` ∧ `eventOffersDemolished`(철거 행 뒤 나대지 구간) ∧ `demolishedRequiredFacts`(후보 과세기준일 시행본이 묻는 칸) ∧ **엔진이 이력을 읽음**(`historyRead` — UQ-8 (가): 양도일 의제 ∨ core 부분 면적이면
 * 4칸 모두 요구하지 않는다). 요구된 칸의 **빈칸**(정량 = 빈칸·비양수·비수치 / 3지선다 = 미선택 `""`)은 차단한다(Q-5 (가) · Q-11 (나)) — 명시 «모름»·«아니오»·«예(건축 외 용도)»는 차단하지 않고 한시 불성립으로 접는다(엔진).
 * 날짜·행 결함(`stateEventRowIssue`)은 먼저 막히므로 철거일·구간 끝 날짜를 못 읽으면 요구 집합이 비어 중복 안내하지 않는다.
 */
import { toOptionalDate } from "@/lib/api/date-coerce";
import { getZoneAreaMultiplier } from "../local-tax-zone-multiplier";
import { demolishedPublicUseAsked } from "./demolished-temp-status";
import { demolishedRequiredFacts } from "./demolished-temp-status";
import { demolishedRemovedKindOf } from "./other-land-state-history";
import { eventOffersDemolished } from "./other-land-state-history";
import { removalDateFor } from "./other-land-state-history";
import { demolishedZoneUnmappedMessage } from "./property-tax-basis";
import type { StateBuildingKind } from "./land-usage.types";

/** 와이어(문자열) 사건 행 중 이 leaf가 읽는 칸. */
export interface DemolishedFactRowLike {
  kind: string;
  date: unknown;
  propertyTaxTypeBefore?: string;
  propertyTaxBasisBefore?: string;
  buildingKindBefore?: string;
  demolishedPermitBefore?: string;
  demolishedOtherUseBefore?: string;
  demolishedVacantHouseBefore?: string;
  demolishedFloorAreaBefore?: string;
  /** E3f-3 — 영 §103의2 2호 단서 하위 칸(건축 외 용도 «예» ∧ 빈집정비 «예»일 때만 열린다 — `demolishedPublicUseAsked`). */
  demolishedPublicUseBefore?: string;
  demolishedPublicUsePaidBefore?: string;
  demolishedPublicUseFromBefore?: string;
  demolishedPublicUseToBefore?: string;
}

export type DemolishedRowFactField =
  | "demolishedPermitBefore"
  | "demolishedOtherUseBefore"
  | "demolishedVacantHouseBefore"
  | "demolishedPublicUseBefore"
  | "demolishedPublicUsePaidBefore"
  | "demolishedPublicUseFromBefore"
  | "demolishedPublicUseToBefore"
  | "demolishedFloorAreaBefore";

export interface DemolishedRowFactIssue {
  /** 사건 행 번호(0부터). */
  index: number;
  field: DemolishedRowFactField;
  message: string;
}

const PREFIX = "나대지 구간 근거 «철거ㆍ멸실»";

export function demolishedPermitRequiredMessage(index: number): string {
  return `${PREFIX} — ${index + 1}번째 사건 행: 철거한 건축물·주택이 허가·사용승인(임시사용승인 포함)을 받은 것인지 선택하세요. 받지 않은 건축물·주택의 부속토지는 한시 별도합산에서 제외되어 판정에 필요합니다(모르면 「모름」).`;
}

export function demolishedOtherUseRequiredMessage(index: number): string {
  return `${PREFIX} — ${index + 1}번째 사건 행: 철거 후 건축을 위한 용도 외의 다른 용도로 사용한 적이 있는지 선택하세요. 그렇게 사용한 부속토지는 한시 별도합산에서 제외되어 판정에 필요합니다(모르면 「모름」).`;
}

export function demolishedVacantHouseRequiredMessage(index: number): string {
  return `${PREFIX} — ${index + 1}번째 사건 행: 철거한 주택이 빈집정비사업 등으로 철거된 빈집인지 선택하세요. 「예」이면 철거된 날부터 3년(2024.6.1.~), 아니면 일반 한시 기간(6개월 · 2026.6.1.~ 1년)으로 판정합니다(모르면 「모름」 — 일반 기간으로 판정하고 고지합니다).`;
}

export function demolishedFloorAreaRequiredMessage(index: number): string {
  return `${PREFIX} — ${index + 1}번째 사건 행: 철거 전 건축물의 바닥면적(㎡)을 입력하세요. 한시 별도합산의 부속토지는 철거 전 건축물의 바닥면적에 용도지역별 적용배율을 곱한 면적 범위라 판정에 필요합니다.`;
}

export function demolishedPublicUseRequiredMessage(index: number): string {
  return `${PREFIX} — ${index + 1}번째 사건 행: 철거 후 그 부속토지를 국가·지방자치단체·지방자치단체조합이 1년 이상 공용·공공용으로 사용했는지(1년 이상 사용할 것이 계약서 등으로 입증되는 경우 포함) 선택하세요. 건축 외 용도 사용 「예」·빈집정비 「예」인 구간의 한시 별도합산 판정에 필요합니다(그 구간 토지 전부가 아니면 「아니오」, 모르면 「모름」).`;
}

export function demolishedPublicUsePaidRequiredMessage(index: number): string {
  return `${PREFIX} — ${index + 1}번째 사건 행: 그 공용·공공용 사용이 유료이거나 소유권 유상이전 약정 후 취득 전에 미리 사용한 것이라 재산세가 부과되는지 선택하세요(지방세법 §109② 단서). 무상 사용이면 재산세 비과세라 「아니오」입니다(모르면 「모름」).`;
}

export function demolishedPublicUseFromRequiredMessage(index: number): string {
  return `${PREFIX} — ${index + 1}번째 사건 행: 국가 등의 공용·공공용 사용 개시일을 입력하세요(그날 포함).`;
}

export function demolishedPublicUseToRequiredMessage(index: number): string {
  return `${PREFIX} — ${index + 1}번째 사건 행: 국가 등의 공용·공공용 사용 종료일을 입력하세요(그날 포함 · 지금도 사용 중이면 그 이후 날짜를 입력하면 구간 안으로 잘립니다. 빈칸을 구간 끝까지로 보지 않습니다).`;
}

function demolishedPublicUseDateInvalidMessage(index: number, label: string, value: string): string {
  return `${PREFIX} — ${index + 1}번째 사건 행: 공용·공공용 사용 ${label}(${value})을 날짜로 읽을 수 없습니다. YYYY-MM-DD 형식으로 입력하세요.`;
}

function demolishedPublicUseDateReversedMessage(index: number, from: string, to: string): string {
  return `${PREFIX} — ${index + 1}번째 사건 행: 공용·공공용 사용 종료일(${to})이 개시일(${from})보다 앞입니다. 개시일 ≤ 종료일이어야 합니다.`;
}

/** 바닥면적 칸 — 빈칸·비수치·0·음수 모두 «입력 없음»으로 같은 문구(⑭ `parseNumber`와 같은 읽기: 콤마 제거 후 `parseFloat`). */
function floorAreaMissing(value: string | undefined): boolean {
  const n = parseFloat((value ?? "").replace(/,/g, ""));
  return !(Number.isFinite(n) && n > 0);
}

const blank = (v: string | undefined): boolean => (v ?? "").trim() === "";

const MESSAGE_OF = {
  demolishedPermitBefore: demolishedPermitRequiredMessage,
  demolishedOtherUseBefore: demolishedOtherUseRequiredMessage,
  demolishedVacantHouseBefore: demolishedVacantHouseRequiredMessage,
  demolishedPublicUseBefore: demolishedPublicUseRequiredMessage,
  demolishedPublicUsePaidBefore: demolishedPublicUsePaidRequiredMessage,
  demolishedPublicUseFromBefore: demolishedPublicUseFromRequiredMessage,
  demolishedPublicUseToBefore: demolishedPublicUseToRequiredMessage,
  demolishedFloorAreaBefore: demolishedFloorAreaRequiredMessage,
} as const satisfies Record<DemolishedRowFactField, (index: number) => string>;

/** 공용 사용 개시일·종료일 결함 — 빈칸 · 해석 불가 · 개시일 > 종료일(종료일 칸으로 점프). 둘 다 정상이면 `null`. */
function publicUseDateDefect(ev: Pick<DemolishedFactRowLike, "demolishedPublicUseFromBefore" | "demolishedPublicUseToBefore">): { field: "demolishedPublicUseFromBefore" | "demolishedPublicUseToBefore"; kind: "blank" | "invalid" | "reversed" } | null {
  const fromRaw = (ev.demolishedPublicUseFromBefore ?? "").trim();
  const toRaw = (ev.demolishedPublicUseToBefore ?? "").trim();
  if (!fromRaw) return { field: "demolishedPublicUseFromBefore", kind: "blank" };
  const from = toOptionalDate(fromRaw);
  if (!from) return { field: "demolishedPublicUseFromBefore", kind: "invalid" };
  if (!toRaw) return { field: "demolishedPublicUseToBefore", kind: "blank" };
  const to = toOptionalDate(toRaw);
  if (!to) return { field: "demolishedPublicUseToBefore", kind: "invalid" };
  if (to.getTime() < from.getTime()) return { field: "demolishedPublicUseToBefore", kind: "reversed" };
  return null;
}

/**
 * 요구된 칸 중 **비어 있는(또는 날짜가 결함인) 첫 칸**(허가 → 건축 외 용도 → 빈집정비 → 공용 사용 → 유료 → 개시일 → 종료일 → 바닥면적 — 3지선다 = 미선택 `""` · 바닥면적 = 빈칸·비수치·비양수 · 공용 사용 날짜 = 빈칸·해석 불가·개시일 > 종료일).
 * ⑧·⑫′(`demolishedRowFactIssue`)와 ⑤ 미리보기(사실 칸이 모두 답해졌는가)가 같은 함수다. 공용 사용 하위 칸은 `demolishedPublicUseAsked`(답 의존 사슬 — E3f-3)가 연다.
 */
export function firstBlankDemolishedFact(
  ev: Pick<
    DemolishedFactRowLike,
    | "demolishedPermitBefore"
    | "demolishedOtherUseBefore"
    | "demolishedVacantHouseBefore"
    | "demolishedFloorAreaBefore"
    | "demolishedPublicUseBefore"
    | "demolishedPublicUsePaidBefore"
    | "demolishedPublicUseFromBefore"
    | "demolishedPublicUseToBefore"
  >,
  required: { permit: boolean; otherUse: boolean; vacantHouse: boolean; floorArea: boolean },
): DemolishedRowFactField | null {
  if (required.permit && blank(ev.demolishedPermitBefore)) return "demolishedPermitBefore";
  if (required.otherUse && blank(ev.demolishedOtherUseBefore)) return "demolishedOtherUseBefore";
  if (required.vacantHouse && blank(ev.demolishedVacantHouseBefore)) return "demolishedVacantHouseBefore";
  const asked = demolishedPublicUseAsked(required, ev);
  if (asked.publicUse && blank(ev.demolishedPublicUseBefore)) return "demolishedPublicUseBefore";
  if (asked.paid && blank(ev.demolishedPublicUsePaidBefore)) return "demolishedPublicUsePaidBefore";
  if (asked.dates) {
    const defect = publicUseDateDefect(ev);
    if (defect) return defect.field;
  }
  if (required.floorArea && floorAreaMissing(ev.demolishedFloorAreaBefore)) return "demolishedFloorAreaBefore";
  return null;
}

/** 필드별 메시지 — 공용 사용 날짜는 빈칸 · 해석 불가 · 역순을 가른다(점프 필드는 `firstBlankDemolishedFact`와 같다). */
function messageOf(field: DemolishedRowFactField, index: number, ev: DemolishedFactRowLike): string {
  if (field === "demolishedPublicUseFromBefore" || field === "demolishedPublicUseToBefore") {
    const defect = publicUseDateDefect(ev);
    if (defect?.kind === "invalid") {
      const isFrom = field === "demolishedPublicUseFromBefore";
      return demolishedPublicUseDateInvalidMessage(index, isFrom ? "개시일" : "종료일", (isFrom ? ev.demolishedPublicUseFromBefore : ev.demolishedPublicUseToBefore) ?? "");
    }
    if (defect?.kind === "reversed") return demolishedPublicUseDateReversedMessage(index, ev.demolishedPublicUseFromBefore ?? "", ev.demolishedPublicUseToBefore ?? "");
  }
  return MESSAGE_OF[field](index);
}

/**
 * 와이어 사건 행 중 **근거 «철거ㆍ멸실»의 사실 칸이 요구되는데 비어 있는 첫 칸** — 행 순서(화면 순서) · 한 행 안에서는 허가 → 건축 외 용도 → 빈집정비 → 공용 사용 → 유료 → 개시일 → 종료일 → 바닥면적(→ 용도지역 배율표 밖).
 *
 * @param events 와이어 사건(`stateHistoryWireFields`가 싣는 형태 — ④가 요구 칸만 싣는다). ⑫′는 raw 사건 그대로. 사건 순서·날짜는 호출 전 `stateEventSequenceIssue`가 통과한 것을 전제하되, 읽을 수 없는 날짜는 요구 집합을 비운다.
 * @param fallbackHasBuilding 건축물 사건이 0건일 때만 쓰이는 초기 건축물 상태(`eventClosesBareInterval` 인자 — ⑭와 같은 값).
 * @param tailKind 주택부수토지 카드면 `"house"`(모든 철거 행이 주택).
 * @param historyRead **지연 평가** — 엔진이 이력을 읽는가(`nblStateHistoryIsRead`). 요구 칸이 구조적으로 있을 때만 부른다(엔진을 돌리므로 비용이 든다). 거짓이면 4칸 모두 요구하지 않는다(UQ-8 (가)).
 */
export function demolishedRowFactIssue(i: {
  events: ReadonlyArray<DemolishedFactRowLike>;
  fallbackHasBuilding: boolean;
  tailKind: StateBuildingKind | undefined;
  historyRead: () => boolean;
  zoneType: string;
}): DemolishedRowFactIssue | null {
  let historyRead: boolean | undefined;
  for (let idx = 0; idx < i.events.length; idx++) {
    const ev = i.events[idx];
    if (ev.propertyTaxBasisBefore !== "demolished" || ev.propertyTaxTypeBefore !== "separate") continue;
    if (!eventOffersDemolished(i.events, idx, i.fallbackHasBuilding)) continue;
    const kind = demolishedRemovedKindOf(i.events, idx, i.tailKind);
    if (!kind) continue;
    // 구간 시작 = 앞 사건일(철거 행 뒤에 있으므로 idx ≥ 1) — 엔진(`deriveOtherLandStateIntervals`)과 같은 게이트(구간 안의 과세기준일). 소유 시작 전 클립은 여기서 모른다(필요 이상으로 묻는 쪽 — 엔진은 클립된 구간에서 읽지 않는다).
    const required = demolishedRequiredFacts({ removedOn: toOptionalDate(removalDateFor(i.events, idx)), intervalStart: toOptionalDate(i.events[idx - 1]?.date), end: toOptionalDate(ev.date), kind, historyRead: true });
    if (!required.permit && !required.otherUse && !required.vacantHouse && !required.floorArea) continue;
    historyRead ??= i.historyRead();
    if (!historyRead) return null; // 엔진이 이력을 읽지 않으면 어떤 칸도 요구하지 않는다 — 어느 행이든 같다.
    const blankField = firstBlankDemolishedFact(ev, required);
    if (blankField) return { index: idx, field: blankField, message: messageOf(blankField, idx, ev) };
    if (required.floorArea && !getZoneAreaMultiplier(i.zoneType)) return { index: idx, field: "demolishedFloorAreaBefore", message: demolishedZoneUnmappedMessage(i.zoneType) };
  }
  return null;
}

