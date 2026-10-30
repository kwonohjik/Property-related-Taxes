/**
 * 거주는 «보유기간 중» 거주만 산입한다(법 §95② 표2 · 시행령 §154① 괄호) — ⑫ `residenceMonthsOverflowIssue`가 취득일~양도일 완성 개월을 넘는 거주를 400으로 막는다.
 * 시료가 «거주 60개월»을 공통으로 쓰되 취득일을 시료마다 바꾸는(2025 취득 = 보유 17개월) 테스트는, 시료 정의를 건드리지 않고 이 보정으로 입력 규칙을 따른다.
 * 같은 leaf(`residenceIntervalMonths`)를 쓰므로 상한과 정확히 일치한다. 주택·1세대1주택·재개발 아님일 때만 보정한다(⑫와 같은 조건).
 */
import { residenceIntervalMonths } from "@/lib/stores/calc-wizard-asset-residence";

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function capResidenceToHolding<T extends Body>(body: T): T {
  if (body.propertyType !== "housing" || body.isOneHousehold !== true || body.redevelopment) return body;
  if (typeof body.residencePeriodMonths !== "number" || !body.acquisitionDate || !body.transferDate) return body;
  // 토지만 본인 × 같은 세대 × 합가: 거주 산입 기준일이 합가일로 늦어진다(#2691 · ⑧ `residenceStartWithMerge`와 같은 규칙).
  const merge =
    body.selfOwns === "land_only" && body.buildingOwnerSameHousehold === true && body.buildingOwnerHouseholdMerged === true ? body.buildingOwnerHouseholdMergeDate : undefined;
  const start = typeof merge === "string" && merge > body.acquisitionDate ? merge : body.acquisitionDate;
  const max = residenceIntervalMonths(start, body.transferDate);
  return body.residencePeriodMonths > max ? { ...body, residencePeriodMonths: max } : body;
}
