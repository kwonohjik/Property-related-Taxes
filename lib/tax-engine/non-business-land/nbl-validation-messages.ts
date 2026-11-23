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

/**
 * 행 접두 — 종류별(UQ-5 (가)): 건축물 사건 행은 «건축물 사건 N번째 행»(**바이트 동일**), 재산세 과세 구분 변경 행은 «재산세 과세 구분 변경 사건 N번째 행».
 * 종류를 읽을 수 없는 행(미선택·허용값 밖)은 건축물 접두를 쓴다.
 */
function eventRowPrefix(index: number, kind?: string): string {
  return kind === "tax_type_changed" ? `재산세 과세 구분 변경 사건 ${index + 1}번째 행` : `건축물 사건 ${index + 1}번째 행`;
}

export function stateEventKindRequiredMessage(index: number): string {
  return `${eventRowPrefix(index)} — 종류(건축물 신축 / 건축물 멸실·철거·붕괴)를 선택하세요. (미선택 행은 판정에서 제외되어 결과가 달라집니다)`;
}

export function stateEventDateEmptyMessage(index: number, kind?: string): string {
  return `${eventRowPrefix(index, kind)} — 날짜를 입력하세요. (미입력 행은 판정에서 제외되어 결과가 달라집니다)`;
}

export function stateEventDateInvalidMessage(index: number, date: string, kind?: string): string {
  return `${eventRowPrefix(index, kind)} — 날짜(${date})를 날짜(YYYY-MM-DD)로 읽을 수 없습니다. (읽을 수 없는 행은 판정에서 제외되어 결과가 달라집니다)`;
}

/** 앞 사건보다 빠름 — 자동 정렬하지 않는다(침묵 보정 금지). */
export function stateEventReversedMessage(index: number, date: string, prevDate: string, kind?: string): string {
  return `${eventRowPrefix(index, kind)} — 사건일(${date})이 앞 사건(${prevDate})보다 빠릅니다. 사건은 날짜 순서대로 입력하세요.`;
}

/** 같은 날 — 종류와 무관한 전 사건 기준(건축물 사건과 재산세 구분 변경이 같은 날이면 같은 구간을 두 사건이 닫는다). */
export function stateEventSameDayMessage(index: number, date: string, kind?: string): string {
  return `${eventRowPrefix(index, kind)} — 사건일(${date})이 앞 사건과 같은 날입니다. 같은 날의 사건은 0일 구간을 만들어 판정에 쓰이지 않습니다. 하루 이상 간격을 두고 입력하세요.`;
}

/**
 * 같은 종류 연속(신축 뒤 신축 · 멸실 뒤 멸실) — **건축물 사건끼리만** 비교한다(재산세 과세 구분 변경은 교대에 참여하지 않는다).
 * `prevStateLabel` = 앞 건축물 사건 뒤의 상태(「건축물 있음」/「건축물 없음」), `missingKindLabel` = 빠진 사건 종류 라벨.
 */
export function stateEventSameKindMessage(index: number, prevStateLabel: string, missingKindLabel: string): string {
  return `${eventRowPrefix(index)} — 앞 사건이 이미 「${prevStateLabel}」입니다. 사이에 「${missingKindLabel}」 사건이 빠졌습니까? (신축과 멸실은 번갈아 입력합니다)`;
}

/**
 * 건축물 없는 구간의 재산세 과세 구분 변경(E3-① · V-6 닫힘) — 재산세 과세 구분 변경 사건 직전 상태가 «건축물 없음»(나대지)이다.
 * 나대지 구간은 종합합산으로 보므로 구분 변경을 말할 칸이 없다(공지상태 별도합산 등 근거 입력은 후속 E3-1b).
 */
export function stateEventTaxChangeWithoutBuildingMessage(index: number): string {
  return `${eventRowPrefix(index, "tax_type_changed")} — 이 날짜 직전에는 건축물이 없습니다. 건축물이 없는 기간은 종합합산으로 보므로 재산세 과세 구분 변경 사건을 입력할 수 없습니다. 건축물 사건의 순서(또는 「건축물 있음」 선택)를 확인하세요.`;
}

/** 하한일(⑧만 — 이월과세는 증여자 취득일 · 일반은 취득일 · 축 B 번들은 가장 이른 취득일) 당일 또는 그 이전. */
export function stateEventAtOrBeforeFloorMessage(index: number, date: string, floorDate: string, kind?: string): string {
  return `${eventRowPrefix(index, kind)} — 사건일(${date})이 소유 시작 전입니다. 취득일(${floorDate}) 당일 또는 그 이전의 사건은 소유기간에 속하지 않아 판정에 쓰이지 않습니다. 취득일 다음 날부터 입력하세요.`;
}

/** 양도일 당일 또는 그 이후 — 양도일 현재 상태 구간이 1일 미만이 된다. */
export function stateEventAtOrAfterTransferMessage(index: number, date: string, transferDate: string, kind?: string): string {
  return `${eventRowPrefix(index, kind)} — 사건일(${date})이 양도일(${transferDate}) 당일 또는 그 이후입니다. 양도일 당일 또는 그 이후의 사건은 판정에 쓰이지 않습니다. 양도일 이전의 날로 입력하세요.`;
}

/** ⑧ 전용(⑫는 `""`·미전송 = 현행이라 이 문구를 쓰지 않는다 — 통합 Q-5) — 질문 미선택. 「모름」을 고르면 현행 판정 + 확인 필요로 진행한다. */
export const STATE_HISTORY_MODE_REQUIRED_MESSAGE =
  "소유기간 중 이 토지 위 건축물이 새로 생기거나 없어진 적이 있는지 선택하세요. 모르면 「모름」을 고르세요. (미선택은 「바뀐 적 없음」으로 보지 않습니다)";
