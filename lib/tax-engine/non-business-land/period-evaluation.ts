/**
 * 결과 카드가 「기간 분석」을 어떻게 보여 줄지 정하는 단일 해석 — NBL2611-V10-P.
 *
 * 엔진은 판정 결과에 `periodEvaluation` echo를 싣는다. 그 echo가 없는 결과(이 echo가 생기기 전에 저장된 이력 복원 결과)만
 * 판정 단계 id로 같은 값을 추정한다 — A1(#3466)이 카드에 임시로 넣었던 단계 id 식별을 이 한 곳으로 옮겼다.
 * 새 판정 결과는 항상 echo가 있으므로 이 추정은 이력 복원에만 닿는다.
 */
import { NBL } from "../legal-codes";
import type { NonBusinessLandJudgment, PeriodEvaluation } from "./types";

type JudgmentLike = Pick<NonBusinessLandJudgment, "periodEvaluation" | "judgmentSteps">;

export function resolvePeriodEvaluation(judgment: JudgmentLike): PeriodEvaluation {
  if (judgment.periodEvaluation) return judgment.periodEvaluation;
  const ids = judgment.judgmentSteps.map((s) => s.id);
  if (ids.some((id) => id.startsWith("housing_"))) return { basis: "not_judged", legalBasis: [NBL.HOUSING_MULTIPLIER] };
  if (ids.some((id) => id.startsWith("building_site_"))) return { basis: "not_judged", legalBasis: [NBL.BUILDING_SITE_MULTIPLIER] };
  if (ids.some((id) => id.startsWith("other_"))) return { basis: "state_at_transfer" };
  return { basis: "usage_periods" };
}
