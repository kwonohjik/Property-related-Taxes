/**
 * E3-④ — 13호 「세대 주택 소유 기간」 행 구조 검증 leaf (⑧ HH-3 · ⑫′ refine **공용** — 같은 판정·같은 문구, 3중 패턴).
 *
 * 규약(D-7): `startDate` = 주택 소유 첫날 · `endDate` = 소유하지 않게 된 첫날(반열린) — 이력 사건 규약과 같다. `endDate` 빈칸 = 양도일까지(⑭가 채운다).
 * 행 검증은 이력 사건 leaf(`stateEventSequenceIssue`)와 섞지 않는다(T-6 — 사건과 같은 날 시작·종료가 오탐되지 않게).
 *
 * 이 leaf가 가진 규칙(⑧·⑫ 공통): ① 시작일 빈칸·해석 불가 ② 종료일이 있는데 해석 불가 ③ 종료일 ≤ 시작일(역순·같은 날) ④ 양도일 이후 시작(소유기간 안에 닿지 않는 행).
 * **없는 규칙**: 행 겹침(엔진이 병합) · 소유 시작 전 시작/양도일 뒤 종료(엔진이 소유기간으로 자름 — 축 B 늦은 지분이 ⑫에서 400이 되지 않게 하한 규칙을 두지 않는다 · 이력 사건과 같은 방침).
 * **⑧만 가진 규칙**(⑫ 거울 없음): 질문(`nblOtherHouseholdHouseStatus`) 미선택 · `owned`인데 행 0건 — 직접 API·엔진은 행 없음 = 현행(Q-4 (가)).
 */
import { toOptionalDate } from "@/lib/api/date-coerce";

export interface HouseholdHousePeriodRowLike {
  startDate?: string;
  endDate?: string;
}

export interface HouseholdHousePeriodIssue {
  /** 행 인덱스(0부터). */
  index: number;
  /** 결함이 있는 칸. */
  field: "startDate" | "endDate";
  message: string;
}

const label = (index: number) => `세대 주택 소유 기간 ${index + 1}번째 행`;

/**
 * 행 배열의 첫 결함. 없으면 null. `transferDate`가 비었거나 해석 불가면 ④번(양도일 이후 시작)은 건너뛴다(다른 검증이 그 오류를 먼저 낸다).
 */
export function householdHousePeriodIssue(rows: ReadonlyArray<HouseholdHousePeriodRowLike>, opts: { transferDate?: string }): HouseholdHousePeriodIssue | null {
  const transfer = opts.transferDate ? toOptionalDate(opts.transferDate) : undefined;
  for (let i = 0; i < rows.length; i++) {
    const { startDate, endDate } = rows[i];
    if (!startDate) return { index: i, field: "startDate", message: `${label(i)} — 주택을 소유하게 된 첫날(시작일)을 입력하세요. (미입력 행은 판정에서 제외되어 결과가 달라집니다)` };
    const start = toOptionalDate(startDate);
    if (!start) return { index: i, field: "startDate", message: `${label(i)} — 시작일(${startDate})을 날짜(YYYY-MM-DD)로 읽을 수 없습니다. (읽을 수 없는 행은 판정에서 제외되어 결과가 달라집니다)` };
    if (endDate) {
      const end = toOptionalDate(endDate);
      if (!end) return { index: i, field: "endDate", message: `${label(i)} — 종료일(${endDate})을 날짜(YYYY-MM-DD)로 읽을 수 없습니다. 비워 두면 양도일까지로 봅니다.` };
      if (end.getTime() < start.getTime()) return { index: i, field: "endDate", message: `${label(i)} — 종료일(${endDate})이 시작일(${startDate})보다 빠릅니다. (역순 행은 판정에서 제외되어 결과가 달라집니다)` };
      if (end.getTime() === start.getTime()) return { index: i, field: "endDate", message: `${label(i)} — 시작일과 종료일이 같습니다(${startDate}). 구간은 [시작일, 종료일)이라 0일로 계산되어 판정에서 제외됩니다. 종료일은 소유하지 않게 된 첫날로 입력하세요.` };
    }
    if (transfer && start.getTime() >= transfer.getTime()) return { index: i, field: "startDate", message: `${label(i)} — 시작일(${startDate})이 양도일(${opts.transferDate}) 이후라 소유기간 안에 닿지 않습니다. 양도일보다 앞이어야 합니다.` };
  }
  return null;
}
