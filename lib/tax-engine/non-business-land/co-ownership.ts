/**
 * 공유지분 비율 적용 (대법원 2015두39439)
 *
 * 비사업용 판정(isNonBusinessLand) 자체는 각 공유자별로 독립 판정한다.
 * 다만, 면적 안분 결과(areaProportioning)는 해당 공유자의 지분율만큼
 * 스케일 다운하여 세액 계산에 사용한다.
 */

import type { NonBusinessLandJudgment } from "./types";

/**
 * 판정 결과에 공유지분율을 적용한다.
 *
 * - isNonBusinessLand는 변경하지 않는다 (판정은 지분율과 무관).
 * - areaProportioning.businessArea / nonBusinessArea 를 ownershipRatio 배율로 축소.
 * - ownershipRatio >= 1 이면 원본 그대로 반환.
 *
 * @param judgment       - judgeNonBusinessLand() 반환 판정 결과
 * @param ownershipRatio - 공유지분율 (0 < ratio <= 1, 예: 1/2 → 0.5)
 */
export function applyCoOwnershipRatio(
  judgment: NonBusinessLandJudgment,
  ownershipRatio: number,
): NonBusinessLandJudgment {
  if (ownershipRatio >= 1) return judgment;

  const warnings = [...judgment.warnings];
  warnings.push(
    `공유지분율 ${(ownershipRatio * 100).toFixed(2)}% 적용 — 면적 안분 기준면적을 지분 비율로 조정함 (대법원 2015두39439)`,
  );

  const areaProportioning = judgment.areaProportioning
    ? {
        ...judgment.areaProportioning,
        totalArea:        judgment.areaProportioning.totalArea        * ownershipRatio,
        businessArea:     judgment.areaProportioning.businessArea     * ownershipRatio,
        nonBusinessArea:  judgment.areaProportioning.nonBusinessArea  * ownershipRatio,
        // nonBusinessRatio 는 비율이므로 지분율과 무관하게 동일
      }
    : undefined;

  return {
    ...judgment,
    areaProportioning,
    warnings,
  };
}
