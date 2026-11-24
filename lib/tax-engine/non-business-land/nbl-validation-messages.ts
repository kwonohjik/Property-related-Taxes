/**
 * NBL2611-B1 — ⑧(`transfer-tax-validate-nbl.ts`)과 ⑫(`transfer-tax-schema-nbl-refines.ts`)가 **같은 문구**를 쓰게 하는 상수.
 * ⑧은 앞에 「{자산 라벨}: 」을 붙이고 ⑫는 그대로 400 메시지로 쓴다. 한쪽만 고치면 UI 통과 ↔ API 400 모순이 생긴다.
 */

/** Q-12 (a) 별장 사용기간 0행 + 「사용 없음」 미확인 */
export const VILLA_NO_USE_REQUIRED_MESSAGE =
  "별장 사용기간을 1행 이상 입력하거나 「별장으로 사용한 기간 없음」을 확인하세요. 사용기간이 없으면 별장이 아닌 주택 부수 토지로 재분류되어 판정됩니다.";

/** V9-DM06 직전 수입 쪽만 있고 직전 토지가액이 없음 */
export const PRIOR_REVENUE_LAND_VALUE_REQUIRED_MESSAGE =
  "직전 과세기간 수입금액(간주임대료·공통수입 포함)을 입력했으면 직전 토지가액도 입력하세요. 직전 토지가액이 없으면 비율②(당해+직전)가 계산되지 않아 당해 비율①만으로 판정됩니다. (영 §168의11②)";

/** V6-PU11 정밀판정 ON인데 지목이 비었고 무조건 사업용 의제도 성립하지 않음 */
export const LAND_TYPE_REQUIRED_MESSAGE =
  "비사업용 토지 정밀판정을 선택했습니다. 지목을 선택하세요. (무조건 사업용 의제가 성립하지 않으면 지목 없이는 「지목 분류 불가 — 비사업용 간주」로 판정됩니다)";

/** NBL2611-D1 (DM-01) 당해 사업개시일이 양도일보다 늦음 — 사업 구간 [개시일, 양도일]이 성립하지 않는다 */
export const REVENUE_START_DATE_AFTER_TRANSFER_MESSAGE =
  "당해 사업개시일이 양도일보다 늦습니다. 사업개시일은 실제 양도일 이전의 날이어야 합니다 — 수입금액비율 충족 토지의 사업 구간을 「사업개시일 ~ 양도일」로 보아 기간기준(영 §168의6)을 판정하므로 이 값으로는 사업 구간이 없습니다.";

/**
 * NBL-STATE-HISTORY-E1 — 기타토지 소유기간 중 상태 이력(사건 행) 검증 문구. ⑧·⑫ 공용 leaf(`other-land-state-history.ts`)가 쓴다.
 * 행 번호(`index`)는 0부터이고 문구에는 1부터 적는다. 종류 라벨은 leaf의 `STATE_EVENT_KIND_LABEL`이 넘긴다(문구가 라벨을 새로 짓지 않는다).
 */

/** `changed` + 사건 0건 — 이력 없음을 «바뀐 적 있음»으로 위장한 입력의 침묵 통과를 막는다(통합 §1). */
export const STATE_EVENTS_REQUIRED_MESSAGE =
  "소유기간 중 건축물이 새로 생기거나 없어진 적이 있다고 답했으나 사건이 없습니다. 사건을 1건 이상 입력하거나 「바뀐 적 없음」 또는 「모름」을 선택하세요.";

/** E3-③ — 주택부수토지 카드의 0건 문구(기본 `building`은 위 상수와 바이트 동일). */
export function stateEventsRequiredMessage(subject: StateEventSubject = "building"): string {
  return subject === "house"
    ? "소유기간 중 주택이 새로 생기거나 없어진 적이 있다고 답했으나 사건이 없습니다. 사건을 1건 이상 입력하거나 「바뀐 적 없음」 또는 「모름」을 선택하세요."
    : STATE_EVENTS_REQUIRED_MESSAGE;
}

/**
 * 사건 «주체» — `building`(기본: 기타토지 카드 — 「건축물 사건」) · `house`(주택부수토지 카드 — 「주택 사건」 · E3-③ D-9 · UI R-3). 기본값은 **바이트 동일**하다.
 * 호출처는 지목 그룹으로 `stateEventSubjectOf(landType)`를 얻어 ⑧·⑫가 **같은 값**을 쓴다(UI 통과 ↔ API 400 모순 방지).
 */
export type StateEventSubject = "building" | "house";

/**
 * 행 접두 — 종류별(UQ-5 (가)): 건축물 사건 행은 «건축물 사건 N번째 행»(**바이트 동일**), 재산세 과세 구분 변경 행은 «재산세 과세 구분 변경 사건 N번째 행».
 * 종류를 읽을 수 없는 행(미선택·허용값 밖)은 주체 접두를 쓴다. `house`이면 «주택 사건 N번째 행».
 */
function eventRowPrefix(index: number, kind?: string, subject: StateEventSubject = "building"): string {
  if (kind === "tax_type_changed") return `재산세 과세 구분 변경 사건 ${index + 1}번째 행`;
  return `${subject === "house" ? "주택" : "건축물"} 사건 ${index + 1}번째 행`;
}

export function stateEventKindRequiredMessage(index: number, subject: StateEventSubject = "building"): string {
  const kinds = subject === "house" ? "주택 신축 / 주택 멸실·철거·붕괴" : "건축물 신축 / 건축물 멸실·철거·붕괴";
  return `${eventRowPrefix(index, undefined, subject)} — 종류(${kinds})를 선택하세요. (미선택 행은 판정에서 제외되어 결과가 달라집니다)`;
}

export function stateEventDateEmptyMessage(index: number, kind?: string, subject: StateEventSubject = "building"): string {
  return `${eventRowPrefix(index, kind, subject)} — 날짜를 입력하세요. (미입력 행은 판정에서 제외되어 결과가 달라집니다)`;
}

export function stateEventDateInvalidMessage(index: number, date: string, kind?: string, subject: StateEventSubject = "building"): string {
  return `${eventRowPrefix(index, kind, subject)} — 날짜(${date})를 날짜(YYYY-MM-DD)로 읽을 수 없습니다. (읽을 수 없는 행은 판정에서 제외되어 결과가 달라집니다)`;
}

/** 앞 사건보다 빠름 — 자동 정렬하지 않는다(침묵 보정 금지). */
export function stateEventReversedMessage(index: number, date: string, prevDate: string, kind?: string, subject: StateEventSubject = "building"): string {
  return `${eventRowPrefix(index, kind, subject)} — 사건일(${date})이 앞 사건(${prevDate})보다 빠릅니다. 사건은 날짜 순서대로 입력하세요.`;
}

/** 같은 날 — 종류와 무관한 전 사건 기준(건축물 사건과 재산세 구분 변경이 같은 날이면 같은 구간을 두 사건이 닫는다). */
export function stateEventSameDayMessage(index: number, date: string, kind?: string, subject: StateEventSubject = "building"): string {
  return `${eventRowPrefix(index, kind, subject)} — 사건일(${date})이 앞 사건과 같은 날입니다. 같은 날의 사건은 0일 구간을 만들어 판정에 쓰이지 않습니다. 하루 이상 간격을 두고 입력하세요.`;
}

/**
 * 같은 종류 연속(신축 뒤 신축 · 멸실 뒤 멸실) — **건축물 사건끼리만** 비교한다(재산세 과세 구분 변경은 교대에 참여하지 않는다).
 * `prevStateLabel` = 앞 건축물 사건 뒤의 상태(「건축물 있음」/「건축물 없음」 · `house`는 「주택 있음」/「주택 없음」), `missingKindLabel` = 빠진 사건 종류 라벨.
 */
export function stateEventSameKindMessage(index: number, prevStateLabel: string, missingKindLabel: string, subject: StateEventSubject = "building"): string {
  return `${eventRowPrefix(index, undefined, subject)} — 앞 사건이 이미 「${prevStateLabel}」입니다. 사이에 「${missingKindLabel}」 사건이 빠졌습니까? (신축과 멸실은 번갈아 입력합니다)`;
}

/** 하한일(⑧만 — 이월과세는 증여자 취득일 · 일반은 취득일 · 축 B 번들은 가장 이른 취득일) 당일 또는 그 이전. */
export function stateEventAtOrBeforeFloorMessage(index: number, date: string, floorDate: string, kind?: string, subject: StateEventSubject = "building"): string {
  return `${eventRowPrefix(index, kind, subject)} — 사건일(${date})이 소유 시작 전입니다. 취득일(${floorDate}) 당일 또는 그 이전의 사건은 소유기간에 속하지 않아 판정에 쓰이지 않습니다. 취득일 다음 날부터 입력하세요.`;
}

/** 양도일 당일 또는 그 이후 — 양도일 현재 상태 구간이 1일 미만이 된다. */
export function stateEventAtOrAfterTransferMessage(index: number, date: string, transferDate: string, kind?: string, subject: StateEventSubject = "building"): string {
  return `${eventRowPrefix(index, kind, subject)} — 사건일(${date})이 양도일(${transferDate}) 당일 또는 그 이후입니다. 양도일 당일 또는 그 이후의 사건은 판정에 쓰이지 않습니다. 양도일 이전의 날로 입력하세요.`;
}

/** ⑧ 전용(⑫는 `""`·미전송 = 현행이라 이 문구를 쓰지 않는다 — 통합 Q-5) — 질문 미선택. 「모름」을 고르면 현행 판정 + 확인 필요로 진행한다. */
export const STATE_HISTORY_MODE_REQUIRED_MESSAGE =
  "소유기간 중 이 토지 위 건축물이 새로 생기거나 없어진 적이 있는지 선택하세요. 모르면 「모름」을 고르세요. (미선택은 「바뀐 적 없음」으로 보지 않습니다)";

/**
 * NBL-STATE-HISTORY-E3-② — 업종 영위 기간(폐업일·연도 행) 검증 문구. ⑧·⑫ 공용 leaf(`revenue-history.ts`의 `revenueHistoryInputIssue`)가 쓴다.
 * 행 번호(`index`)는 0부터이고 문구에는 1부터 적는다. 비어 있는 금액·누락 연도는 막지 않는다 — «모름»은 그 연도 불통과 + 확인 필요다(차단 없음).
 */

/** 폐업일이 날짜로 읽히지 않는다 — 읽히지 않으면 «폐업하지 않음»으로 판정되어 결과가 달라진다. */
export function revenueEndDateInvalidMessage(endDate: string): string {
  return `폐업일(${endDate})을 날짜(YYYY-MM-DD)로 읽을 수 없습니다. (읽을 수 없는 값은 폐업하지 않은 것으로 판정되어 결과가 달라집니다)`;
}

/** 폐업일 ≤ 개시일 — 폐업일은 영업을 하지 않게 된 첫날이라 개시일보다 뒤여야 영위일이 생긴다. */
export function revenueEndDateNotAfterStartMessage(endDate: string, startDate: string): string {
  return `폐업일(${endDate})이 사업 개시일(${startDate}) 당일 또는 그 이전입니다. 폐업일은 영업을 하지 않게 된 첫날이라 개시일보다 뒤여야 영위한 날이 생깁니다.`;
}

/** 폐업일 ≥ 양도일 — 양도일 현재도 영위 중이면 폐업일을 비워 둔다. */
export function revenueEndDateAtOrAfterTransferMessage(endDate: string, transferDate: string): string {
  return `폐업일(${endDate})이 양도일(${transferDate}) 당일 또는 그 이후입니다. 양도일 현재도 영위 중이면 폐업일을 비워 두고, 폐업했다면 양도일 이전의 날로 입력하세요.`;
}

function revenueRowPrefix(index: number): string {
  return `과세기간별 수입금액 ${index + 1}번째 행`;
}

export function revenueRowYearInvalidMessage(index: number, year: string): string {
  return `${revenueRowPrefix(index)} — 과세연도(${year})를 4자리 연도로 읽을 수 없습니다. (읽을 수 없는 행은 판정에서 제외되어 결과가 달라집니다)`;
}

export function revenueRowYearDuplicateMessage(index: number, year: string): string {
  return `${revenueRowPrefix(index)} — 과세연도(${year})가 앞 행과 같습니다. 같은 연도는 한 행만 입력하세요.`;
}

/** T−1·T 이후 — 그 두 해는 기존 «직전 과세기간»·«당해 과세기간» 칸이 말한다(같은 사실을 두 번 받지 않는다). */
export function revenueRowYearTooLateMessage(index: number, year: string, transferYear: number): string {
  return `${revenueRowPrefix(index)} — 과세연도(${year})는 양도연도(${transferYear}) 또는 직전 과세기간(${transferYear - 1})입니다. 그 두 해는 「당해 과세기간」·「직전 과세기간」 칸에 입력하세요.`;
}

export function revenueRowAmountInvalidMessage(index: number, what: "수입금액" | "토지가액", value: string): string {
  return `${revenueRowPrefix(index)} — ${what}(${value})을 0 이상의 금액으로 읽을 수 없습니다. 모르면 비워 두세요. (비워 두면 그 연도는 수입금액비율 불통과로 보고 확인 필요로 표시합니다)`;
}

/**
 * NBL-STATE-HISTORY-E3-③ — 주택부수토지 카드의 구조 규칙(D-1 · D-2)과 철거 행 정착면적(Q-10 (가)) 검증 문구. ⑧·⑫ 공용 leaf가 쓴다.
 * 구조 규칙(D-1·D-2)은 ⑫도 거울을 둔다. 정착면적 규칙은 ⑧만 가진다 — 직접 API는 400 없이 엔진이 접는다(기존 housing 정착면적·수도권 정책).
 */

/** D-1 — 마지막 건축물 사건이 철거. 양도일 현재 주택이 없으면 이 토지는 주택부수토지가 아니다(나대지) → 기타토지로 입력한다. */
export function houseLastEventRemovedMessage(index: number): string {
  return `${eventRowPrefix(index, "building_removed", "house")} — 마지막 주택 사건이 「멸실·철거·붕괴」입니다. 양도일 현재 주택이 없다면 이 토지는 주택부수토지가 아닙니다. 지목을 「나대지·잡종지」로 바꿔 입력하세요. (주택부수토지 카드는 양도일 현재 주택이 있는 토지입니다)`;
}

/** D-2 — 주택 구간에는 토지 재산세 과세 구분이 없다(지방세법 §106②). */
export function houseTaxTypeChangedMessage(index: number): string {
  return `${eventRowPrefix(index, "tax_type_changed", "house")} — 주택부수토지 카드는 「재산세 과세 구분 변경」 사건을 받지 않습니다. 주택 구간에는 토지 재산세 과세 구분(별도합산·분리과세 등)이 없습니다. 주택 신축 앞 나대지의 구분은 「주택 신축」 행의 나대지 구간 선언으로 입력하세요.`;
}

/** 정착면적 행 접두 — 기본 `house`(주택부수토지 카드 «주택 사건 N번째 행»). 기타토지 카드의 철거 행(B)은 `building`을 넘겨 «건축물 사건 N번째 행»을 쓴다(D-9 — 행 제목과 같은 말). */
const FOOTPRINT_ROW = (index: number, subject: StateEventSubject) => eventRowPrefix(index, "building_removed", subject);

export function houseFootprintBlankMessage(index: number, subject: StateEventSubject = "house"): string {
  return `${FOOTPRINT_ROW(index, subject)} — 철거 직전 주택 정착면적(㎡)을 입력하세요. 모르면 소유기간 중 ${subject === "house" ? "주택" : "건축물"} 이력 질문에서 「모름」을 선택하세요. (정착면적 없이는 철거 전 주택 구간이 배율 이내인지 알 수 없어 판정에서 제외됩니다)`;
}

export function houseFootprintNotNumberMessage(index: number, value: string, subject: StateEventSubject = "house"): string {
  return `${FOOTPRINT_ROW(index, subject)} — 철거 직전 주택 정착면적(${value})을 숫자(㎡)로 읽을 수 없습니다.`;
}

export function houseFootprintNotPositiveMessage(index: number, value: string, subject: StateEventSubject = "house"): string {
  return `${FOOTPRINT_ROW(index, subject)} — 철거 직전 주택 정착면적(${value}㎡)은 0보다 커야 합니다.`;
}

export function houseFootprintExceedsLandMessage(index: number, value: string, landArea: string, subject: StateEventSubject = "house"): string {
  return `${FOOTPRINT_ROW(index, subject)} — 철거 직전 주택 정착면적(${value}㎡)이 토지 면적(${landArea}㎡)보다 큽니다. 정착면적은 토지 면적을 넘을 수 없습니다. (철거 당시 대지가 지금보다 컸다면 소유기간 중 ${subject === "house" ? "주택" : "건축물"} 이력 질문에서 「모름」을 선택하세요)`;
}

/**
 * NBL-STATE-HISTORY-E3-③ B — 기타토지 철거 행의 «철거된 건축물 종류 = 주택» 구조 규칙(D-8) 검증 문구. ⑧·⑫ 공용 leaf(`houseKindEventIssue`)가 쓴다.
 * 기타토지 카드의 행이라 «건축물 사건 N번째 행» 접두를 쓴다(D-9). 새 조문 인용 없음.
 */

/** D-8 ① — 건축물 종류(주택)는 멸실·철거·붕괴 행에서만 받는다. */
export function houseKindOnlyOnRemovedMessage(index: number, kind?: string): string {
  return `${eventRowPrefix(index, kind)} — 「철거된 건축물 종류: 주택」은 「건축물 멸실·철거·붕괴」 행에서만 입력합니다. 신축·재산세 과세 구분 변경 행에서는 건축물 종류를 선택할 수 없습니다.`;
}

/** D-8 ② — 주택 구간 안에 재산세 과세 구분 변경이 있다: 이미 구분이 바뀐 건축물은 주택이 아니다(주택에는 토지 재산세 과세 구분이 없다). */
export function houseKindTaxChangeInsideMessage(index: number, taxIndex: number): string {
  return `${eventRowPrefix(index, "building_removed")} — 철거된 건축물을 「주택」으로 선택했지만 그 건축물이 있던 동안 ${taxIndex + 1}번째 행에 「재산세 과세 구분 변경」 사건이 있습니다. ` +
    `주택에는 토지 재산세 과세 구분(별도합산·분리과세 등)이 없어 구분이 바뀐 건축물 구간은 「주택」으로 입력할 수 없습니다. 주택이 아닌 건축물이면 건축물 종류를 비우거나, 주택이면 구분 변경 사건을 삭제하세요.`;
}
