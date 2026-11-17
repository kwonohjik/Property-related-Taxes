/**
 * 토지를 건물보다 나중에 취득했는데 거주기간(개월)을 토지 보유 개월로 상한했을 때의 확인 필요 고지 — 순수 함수(사실만 · 유리·불리 표현 없음).
 *
 * 규칙·게이트는 `transfer-land-holding-residence.ts`, 엔진 echo는 `splitDetail.land.holdingResidenceCap` · 부수토지 카드는 `LongTermHoldingResult.landHoldingResidenceCap`(상한이 공제율을 실제로 바꿨을 때만 채운다).
 */
import { TRANSFER } from "./legal-codes";
import type { SplitPartResult } from "./types/transfer-split-gain.types";

/**
 * 엔진 echo(`SplitPartResult.holdingResidenceCap` — 분리취득 토지 파트 · 함께 양도 부수토지 카드 L-1b · 겸용주택 주택분 토지 공용). 없으면 고지하지 않는다.
 * `unit: "years"` — 겸용주택은 거주를 정수 연수로만 받아(`mixedUse.residencePeriodYears` = floor(개월 ÷ 12)) `directMonths`가 입력 개월이 아니라 연수 × 12다.
 *   개월로 적으면 70개월 입력이 「60개월」로 보이므로 연 단위로 적는다(공제율은 연 단위라 세액은 같다 · 2026-11-17 실측).
 */
export function landHoldingResidenceCapNotice(cap: SplitPartResult["holdingResidenceCap"], unit: "months" | "years" = "months"): string | undefined {
  if (!cap) return undefined;
  const capped =
    unit === "years"
      ? `거주 연수 ${cap.directMonths / 12}년을 토지 보유기간 ${cap.landHoldingMonths}개월로 상한해 계산했습니다(토지분 거주 ${Math.floor(cap.cappedMonths / 12)}년 · 1년 미만은 공제율에 쓰지 않습니다). `
      : `거주기간 ${cap.directMonths}개월을 토지 보유기간 ${cap.landHoldingMonths}개월로 상한해 계산했습니다(거주 ${cap.directMonths}개월 → 토지분 ${cap.cappedMonths}개월). `;
  return (
    `토지를 건물보다 나중에 취득해 부수토지 거주기간별 공제율은 토지 보유기간 중 거주만 셉니다(${TRANSFER.HOLDING_PERIOD_CALC} · 대법원 2025두34935 「보유기간 중 거주한 기간」). ` +
    capped +
    "건물분 거주기간과 표2 대상 판정(거주 2년)은 거주기간 그대로입니다. " +
    "이 경우를 다룬 해석례는 확인하지 못했습니다 — 확인 필요. 입주·퇴거일 구간으로 입력할 수 있는 자산은 구간으로 입력하면 토지 보유기간과 겹친 기간만 셉니다."
  );
}
