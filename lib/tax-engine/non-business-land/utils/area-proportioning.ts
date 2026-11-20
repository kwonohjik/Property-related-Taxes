/**
 * 면적 안분 — 기준면적 초과분 비사업용 산출 (목장 §168의10③ · 기타토지 §168의11① 공용)
 *
 * 사업용 면적 = min(전체면적, 기준면적), 비사업용 면적 = max(0, 전체−기준).
 * nonBusinessRatio는 소수 4자리 반올림(면적 비율, 금액 아님).
 *
 * NBL2611-V9-I — 한도 비교·초과 면적·비율 반올림은 `area-limit.ts`(정수 정확 연산)다. 부동소수 `−`·`/`·`Math.round` 금지.
 */
import { round2, residualArea } from "../../area-utils";
import { areaRatio4, judgeAreaLimit } from "../../area-limit";
import { NBL } from "../../legal-codes";
import type { AreaProportioning, CategoryJudgeResult } from "../types";

export function computeAreaProportioning(totalArea: number, standardArea: number): AreaProportioning {
  const { excess: nonBusinessArea, withinArea: businessArea } = judgeAreaLimit(totalArea, standardArea);
  return {
    totalArea,
    businessArea,
    nonBusinessArea,
    nonBusinessRatio: areaRatio4(nonBusinessArea, totalArea),
    buildingMultiplier: 1,
  };
}

/**
 * §168의11⑥ 복합용도 건축물 부속토지 안분.
 *
 * 특정용도분(거주·특정사업 사용분) 부속토지 = 전체 부속토지 × (특정용도분 면적 ÷ 전체 건축물 면적).
 * - ⑥1호(하나의 건축물 복합용도): 연면적비 (specificUseArea=특정용도분 연면적, totalBuildingArea=건축물 연면적)
 * - ⑥2호(동일경계 다수 건축물): 바닥면적비 (specificUseArea=특정용도분 바닥면적, totalBuildingArea=전체 바닥면적)
 *
 * businessArea = 특정용도분 부속토지(사업용), 나머지는 비사업용(종합합산).
 * 분자/분모는 클램프하지 않음(분자≤분모는 validate에서 차단). 면적 비율이므로 buildingMultiplier=1.
 */
export function computeMixedUseProportioning(
  totalArea: number,
  specificUseArea: number,
  totalBuildingArea: number,
): AreaProportioning {
  const businessRatio = totalBuildingArea > 0 ? specificUseArea / totalBuildingArea : 0;
  // 면적 안분 규칙 — 사업용분을 round2로 확정하고 비사업용분은 잔액 흡수(전체 − 사업용분).
  // 비율 재계산 금지. nonBusinessRatio(세액 반영분)는 4자리 반올림이라 수치 영향 없음(실측).
  const businessArea = round2(totalArea * businessRatio);
  const nonBusinessArea = Math.max(0, residualArea(totalArea, businessArea));
  const nonBusinessRatio = areaRatio4(nonBusinessArea, totalArea);
  return {
    totalArea,
    businessArea,
    nonBusinessArea,
    nonBusinessRatio,
    buildingMultiplier: 1,
    mixedUseBuildingRatio: Math.round(businessRatio * 10000) / 10000,
  };
}

/**
 * NBL2611-V9-I · 결정 Q-7 (나) — 초과 면적이 있는데 비사업용 비율이 4자리 반올림으로 0이 되면 **사업용으로 본다**.
 *
 * 세액에는 비율 4자리(0.005% 미만이면 0)가 곱해지므로 «비사업용인데 비율 0» 상태는 +10%p가 0원이 되면서도 판정·신고서 호(8호)·
 * 결과 카드는 비사업용이라고 말하는 모순이다. 세액용 비율의 정밀도(4자리)는 바꾸지 않는다(Q-7 (가) 기각).
 * 한도와 정확히 같은 토지가 부동소수로 뒤집히는 경계는 `area-limit.ts`가 이미 해소하므로 여기 남는 것은 진짜 극소 초과뿐이다.
 *
 * 면적 안분이 없는 판정(전량 비사업용)·이미 사업용인 판정·비율이 0보다 큰 판정은 그대로 둔다.
 */
export function treatNegligibleExcessAsBusiness(r: CategoryJudgeResult): CategoryJudgeResult {
  const ap = r.areaProportioning;
  if (r.isBusiness || !ap || ap.nonBusinessArea <= 0 || ap.nonBusinessRatio > 0) return r;
  const detail =
    `초과 면적 ${ap.nonBusinessArea}㎡는 전체 ${ap.totalArea}㎡의 0.005% 미만이라 비사업용 비율이 소수 4자리 반올림으로 0 — 사업용으로 봅니다(비사업용인데 비율 0인 모순 방지).`;
  return {
    ...r,
    isBusiness: true,
    reason: `${r.reason} — ${detail}`,
    steps: [
      ...r.steps,
      { id: "negligible_excess_as_business", label: "초과 면적 극소(비율 4자리 반올림 0) → 사업용", status: "PASS", detail, legalBasis: NBL.MAIN },
    ],
  };
}
