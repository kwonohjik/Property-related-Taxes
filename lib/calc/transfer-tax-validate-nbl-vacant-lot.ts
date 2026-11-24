/**
 * ⑧ 13호(무주택 1세대 1필지 나지) 「세대 주택 소유 기간」(NBL-STATE-HISTORY-E3-④) 검증 — `validateNblOtherLand`가 호 필수 입력 검사 직후에 부른다.
 * 계획서: docs/01-plan/features/nbl-state-history-e3-4-ho13-bare-land.ui.plan.md §7
 *
 *   HH-1 질문 미선택              — 미입력 ≠ 미해당(Q-4 (가) 비대칭: **⑧만** 요구한다 — 직접 API·엔진은 행 없음 = 현행)
 *   HH-2 «있습니다»인데 행 0건     — ⑧만(⑫ 거울 없음)
 *   HH-3 행 결함·상한              — **⑫′와 같은 leaf**(`householdHousePeriodIssue`)·같은 상한 상수(`NBL_HOUSEHOLD_HOUSE_PERIODS_MAX`)
 *   HH-0 술어 거짓                 — 요구하지 않는다(엔진이 읽지 않는 칸 — 요구하면 막다른 길).
 *
 * 게이트는 ⑤ 렌더·④ 전송과 같은 술어(`vacantLotHousePeriodsReadOf` — 엔진 술어 `vacantLotHousePeriodsRead`). 필드 키는 리터럴 접두 형태로 둔다 — 정적 게이트
 * (`transfer-validation-field-anchor-coverage`)가 `${…}`를 `*`로 정규화해 읽는다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { NBL_HOUSEHOLD_HOUSE_PERIODS_MAX } from "@/lib/calc/nbl-household-house-periods-cap";
import { nblHouseholdHousePeriodsCapMessage } from "@/lib/calc/nbl-household-house-periods-cap";
import { householdHousePeriodIssue } from "@/lib/tax-engine/non-business-land/household-house-period-issue";
import { vacantLotHousePeriodsReadOf } from "./nbl-vacant-lot-household-scope";
import { fieldError } from "./transfer-tax-validate-field";

export interface VacantLotHouseholdValidateCtx {
  /** 양도일(ISO). 없거나 해석 불가면 «양도일 이후 시작» 규칙은 건너뛴다(앞 단계 검증 몫). */
  transferDate?: string;
  /** 축 B 둘째 이후 지분 카드 — 질문이 첫 카드에만 있으므로 요구하지 않는다. */
  skip?: boolean;
}

/** 질문·행 검증. 첫 오류 메시지 또는 null. */
export function validateNblVacantLotHousehold(asset: AssetForm, label: string, ctx: VacantLotHouseholdValidateCtx = {}): string | null {
  if (ctx.skip || !vacantLotHousePeriodsReadOf(asset)) return null;
  const prefix = `${label}: 기타토지 무주택1세대 1필지 나지(13호) — `;
  const status = asset.nblOtherHouseholdHouseStatus;
  if (!status) return fieldError("nblOtherHouseholdHouseStatus", `${prefix}이 토지를 소유한 기간 중 세대가 주택을 소유한 적이 있는지 선택하세요. 주택을 소유한 기간은 13호로 인정하지 않습니다.`);
  if (status !== "owned") return null;
  const rows = asset.nblOtherHouseholdHousePeriods ?? [];
  if (rows.length === 0) return fieldError("nblOtherHouseholdHousePeriods", `${prefix}세대가 주택을 소유한 적이 «있습니다»를 선택했습니다. 주택을 소유한 기간을 1건 이상 입력하세요.`);
  if (rows.length > NBL_HOUSEHOLD_HOUSE_PERIODS_MAX) return fieldError("nblOtherHouseholdHousePeriods", `${prefix}${nblHouseholdHousePeriodsCapMessage()}`);
  const issue = householdHousePeriodIssue(rows, { transferDate: ctx.transferDate });
  if (!issue) return null;
  const message = `${prefix}${issue.message}`;
  return issue.field === "startDate"
    ? fieldError(`nblOtherHouseholdHousePeriods.${issue.index}.startDate`, message)
    : fieldError(`nblOtherHouseholdHousePeriods.${issue.index}.endDate`, message);
}
