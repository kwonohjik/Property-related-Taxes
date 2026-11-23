/**
 * ⑧ 기타토지 업종 영위 기간(NBL-STATE-HISTORY-E3-②) 검증 — `validateNblDetailedJudgment`의 수입금액비율 블록(업종 선택 분기) 안에서 부른다.
 * 계획서: docs/01-plan/features/nbl-state-history-e3-2-business-period.ui.plan.md §7 · 엔진 계획서 «구현 기록 (엔진)» ⑧ 규칙
 *
 *  · 폐업일 읽기 불가 · 폐업일 ≤ 개시일 · 폐업일 ≥ 양도일 · 연도 4자리 아님·중복·≥ T−1 · 금액 형식 — **⑫와 같은 leaf**(`revenueHistoryInputIssue`)·같은 문구. 별도 판정을 재정의하지 않는다.
 *  · 빈 금액·행 누락은 막지 않는다 — «모름»은 그 연도 불통과 + 확인 필요다(「모름」 = 혜택 불성립이지 차단이 아니다).
 *  · 하한(개시일·폐업일이 소유 시작 전) — **⑧만** 건다. ⑫는 `floorDate`를 받지 않는다(지분별 raw가 다른 취득일을 가져 늦은 지분이 400이 되는 것을 막는 선례).
 *    축 B 번들은 전 지분 최이른 취득일(`stateHistoryFloorDate`). 개시일 = 취득일은 허용한다(영위 첫날 = max(개시일, 취득일)).
 *
 * 게이트는 ④ 전송·⑤ 렌더와 같은 술어(`nblRevenuePeriodOn`). 검사하는 연도 행도 ④가 싣는 행(`revenuePeriodWireRows`)과 같은 목록이다 — 어긋나면 «화면에 없는 행을 요구하며 영구 차단»이 된다.
 * 필드 키는 리터럴 접두 형태로 둔다 — 정적 게이트(`transfer-validation-field-anchor-coverage`)가 `${…}`를 `*`로 정규화해 읽는다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { revenueHistoryInputIssue } from "@/lib/tax-engine/non-business-land/revenue-history";
import { nblRevenuePeriodOn, revenuePeriodWireRows } from "./nbl-revenue-period-scope";
import { fieldError } from "./transfer-tax-validate-field";

export interface RevenuePeriodValidateCtx {
  /** 양도일(ISO). 없으면 «양도일 당일·이후»·«T−1 이후 연도» 규칙은 건너뛴다(앞 단계 검증 몫). */
  transferDate?: string;
  /** 하한일(ISO) — `stateHistoryFloorDate`. 없으면 «소유 시작 전» 규칙은 건너뛴다. */
  floorDate?: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** ⑧ 전용 — 개시일이 취득일보다 앞선다(⑫에는 없다). */
export function revenueStartBeforeOwnershipMessage(start: string, floor: string): string {
  return `사업 개시일(${start})이 취득일(${floor})보다 앞섭니다. 이 토지를 소유한 뒤 처음 영업한 날을 입력하세요. (소유 시작부터 영위했으면 개시일을 비워 두세요)`;
}

/** ⑧ 전용 — 폐업일이 취득일 당일이거나 그 이전이다(⑫에는 없다) — 소유 중 영위한 날이 없다. */
export function revenueEndNotAfterOwnershipMessage(end: string, floor: string): string {
  return `폐업일(${end})이 취득일(${floor}) 당일 또는 그 이전입니다. 폐업일은 영업을 하지 않게 된 첫날이라 취득일보다 뒤여야 소유 중 영위한 날이 생깁니다.`;
}

/** 영위 기간 입력 검증. 첫 오류 메시지 또는 null. `label`은 «자산» 같은 접두(⑫에는 없는 ⑧ 전용 부분). */
export function validateNblRevenuePeriod(asset: AssetForm, label: string, ctx: RevenuePeriodValidateCtx = {}): string | null {
  if (!nblRevenuePeriodOn(asset)) return null;
  const prefix = `${label}: 기타토지 영위 기간 — `;
  const rows = revenuePeriodWireRows(asset, ctx.transferDate);

  const issue = revenueHistoryInputIssue({
    startDate: asset.nblRevenueCurrentBusinessStartDate,
    endDate: asset.nblRevenueBusinessEndDate,
    transferDate: ctx.transferDate,
    rows,
  });
  if (issue) {
    const message = `${prefix}${issue.message}`;
    if (issue.field === "nblRevenueBusinessEndDate") return fieldError("nblRevenueBusinessEndDate", message);
    const row = issue.index === undefined ? undefined : rows[issue.index];
    if (!row || issue.part === "year") return fieldError("nblRevenueYearRows", message);
    if (issue.part === "revenue") return fieldError(`nblRevenueYearRows.${row.year}.revenue`, message);
    return fieldError(`nblRevenueYearRows.${row.year}.landValue`, message);
  }

  const floor = ctx.floorDate && ISO.test(ctx.floorDate) ? ctx.floorDate : undefined;
  const start = ISO.test(asset.nblRevenueCurrentBusinessStartDate) ? asset.nblRevenueCurrentBusinessStartDate : undefined;
  const end = ISO.test(asset.nblRevenueBusinessEndDate) ? asset.nblRevenueBusinessEndDate : undefined;
  if (floor && start && start < floor) return fieldError("nblRevenueCurrentBusinessStartDate", `${prefix}${revenueStartBeforeOwnershipMessage(start, floor)}`);
  if (floor && end && end <= floor) return fieldError("nblRevenueBusinessEndDate", `${prefix}${revenueEndNotAfterOwnershipMessage(end, floor)}`);
  return null;
}
