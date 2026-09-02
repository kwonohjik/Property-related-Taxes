/**
 * 종업원용 체육시설용지 기준면적 — 「지방세법 시행규칙」 [별표 6] **3호바** (E4-06 후속)
 *
 * ## 조문 verbatim (개정 2025.10.31. · KoreanLaw `get_annexes` 실측)
 *
 * > **바.** 공장입지기준면적을 산출할 때 **다음 표의 기준면적에 해당하는** 종업원용 체육시설용지
 * >   (공장입지기준면적의 100분의 10 이내에 해당하는 토지에 한정한다)는 공장입지기준면적에
 * >   포함되는 것으로 한다.
 * >
 * > ※ 비고
 * > 1. 적용요건 — 운동장과 코트에는 축구·배구·테니스 등 운동경기가 가능한 시설이 있어야 하고,
 * >    실내체육시설은 영구적인 시설물이어야 하며, 탁구대 2면 이상을 둘 수 있어야 한다.
 * > 2. 적용요령
 * >    가. 종업원수는 그 사업장에 근무하는 종업원을 기준으로 한다.
 * >    나. 종업원이 50명 이하인 **법인**의 경우에는 **코트면적만을** 기준면적으로 한다.
 * >    다. 실내체육시설의 건축물바닥면적이 기준면적 이하인 경우에는 그 건축물 바닥면적을
 * >        그 기준면적으로 한다.
 * >    라. 종업원용 실내체육시설이 있는 경우에는 그 실내체육시설의 기준면적에 영 제101조제2항의
 * >        용도지역별 적용배율을 곱하여 산출한 면적을 **합한** 면적을 기준면적으로 한다.
 *
 * ## 종전 상태 (PR #1427)
 *
 * 10% 상한만 강제하고 **표는 사용자가 직접 계산**하게 했다(입력 칸 hint에 「표의 기준면적에
 * 해당하는 면적을 입력하세요」). 표를 잘못 읽으면 그대로 통과했다 — 여기서 자동화한다.
 *
 * ## 인정면적 산식
 *
 * ```
 * 운동장  = min(운동장 용지면적, 표[field](종업원수))
 * 코트    = min(코트 용지면적,   표[court](종업원수))
 * 실내기준 = min(실내 건축물 바닥면적, 표[indoor](종업원수))     ← 비고 2-다
 * 실내    = 실내기준 × §101② 용도지역별 적용배율                ← 비고 2-라
 *
 * 인정면적 = (종업원 ≤ 50 且 법인) ? 코트                        ← 비고 2-나
 *                                : 운동장 + 코트 + 실내
 * ```
 *
 * `min(실제, 표)`인 이유: 바목이 인정하는 것은 「표의 기준면적에 **해당하는** 종업원용
 * 체육시설**용지**」다. 없는 토지를 인정할 수는 없으므로 실제 면적이 상한이고, 표가 또 다른
 * 상한이다. 비고 2-다가 실내에 대해 같은 취지를 명시한다(바닥면적이 기준면적 이하면 바닥면적).
 *
 * ⚠️ **행별로 min을 잡는다** — 합계끼리 비교하면 한 행의 초과분이 다른 행의 여유분을 먹는다.
 *    예: 운동장 2,000㎡(표 1,000)·코트 0㎡(표 970)이면 행별 = 1,000, 합계끼리 = min(2,000, 1,970)
 *    = 1,970으로 **970㎡ 과대**가 된다.
 *
 * ⚠️ 비고 1(적용요건 — 운동경기 가능 시설·영구 시설물·탁구대 2면 이상)은 **사실 판단**이라
 *    엔진이 검증하지 않는다. 면적을 입력한다는 것이 요건 충족 선언이며, UI hint가 그 사실을 밝힌다.
 *
 * 🔴 **비고 2-나의 「법인」은 「소득세법 시행규칙」 별표5 비고2의 「자」와 다르다.**
 *    별표5는 개인·법인을 가리지 않지만 별표6은 **법인만** 명시한다. 개인사업자에게 2-나를
 *    적용하면 기준면적이 줄어(코트만) **법 근거 없이 불리**해진다 ⇒ 법인 여부를 입력받아
 *    법인일 때만 적용하고, 미입력은 ⑧에서 차단한다(자동 fallback 금지).
 */

import {
  employeeSportsStandardArea,
  type EmployeeSportsFacilityKind,
} from "./data/employee-sports-standard-area";

/** 비고 2-나 판정에 필요한 사업주체 구분 */
export type FactoryEntityType = "corporation" | "individual";

export interface EmployeeSportsFacilityUsage {
  /** 비고 2-가 — 그 사업장에 근무하는 종업원 수 */
  employeeCount?: number;
  /** 비고 2-나 — 「50명 이하인 **법인**」에만 코트면적만 적용된다 */
  entityType?: FactoryEntityType;
  /** 실외체육시설 — 운동장 용지 면적 (㎡) */
  playgroundArea?: number;
  /** 실외체육시설 — 테니스·정구코트 용지 면적 (㎡) */
  tennisCourtArea?: number;
  /** 실내체육시설 **건축물 바닥면적** (㎡) — 비고 2-다·라 */
  indoorFloorArea?: number;
  /** 비고 2-라 — 「지방세법 시행령」 §101② 용도지역별 적용배율 */
  indoorZoneMultiplier?: number;
}

export interface EmployeeSportsFacilityStandard {
  /** 별표6 3호바 표 기준 인정면적 합계 (㎡) — 10% 상한 적용 **전** */
  recognizedArea: number;
  /** 행별 인정면적 */
  playgroundApplied: number;
  courtApplied: number;
  /** 배율 적용 **전** 실내 기준면적 = min(바닥면적, 표값) */
  indoorStandardBase: number;
  /** 배율 적용 후 실내 인정면적 */
  indoorApplied: number;
  /** 비고 2-나가 적용돼 코트만 인정된 경우 */
  courtOnly: boolean;
  /** 실내 바닥면적을 입력했으나 §101② 배율을 알 수 없어 실내분을 0으로 둔 경우 */
  indoorZoneMultiplierMissing: boolean;
  /** 표시·검증용 설명 */
  breakdown: string[];
}

const EMPTY: EmployeeSportsFacilityStandard = {
  recognizedArea: 0,
  playgroundApplied: 0,
  courtApplied: 0,
  indoorStandardBase: 0,
  indoorApplied: 0,
  courtOnly: false,
  indoorZoneMultiplierMissing: false,
  breakdown: [],
};

/** 비고 2-나 경계 — 「종업원이 50명 이하인 법인」 */
export const COURT_ONLY_EMPLOYEE_THRESHOLD = 50;

function std(kind: EmployeeSportsFacilityKind, n: number): number {
  return employeeSportsStandardArea(kind, n);
}

/**
 * 별표6 3호바 표에 따른 종업원용 체육시설용지 인정면적을 산출한다.
 *
 * 종업원수가 없거나 0 이하이면 표를 적용할 수 없으므로 **0을 반환한다**(추정 금지).
 * 면적을 입력했는데 종업원수가 없는 상태는 ⑧ validate가 계산 전에 차단한다.
 */
export function computeEmployeeSportsFacilityStandard(
  usage: EmployeeSportsFacilityUsage | undefined,
): EmployeeSportsFacilityStandard {
  if (!usage) return EMPTY;

  const n = usage.employeeCount ?? 0;
  const playground = usage.playgroundArea ?? 0;
  const court = usage.tennisCourtArea ?? 0;
  const indoorFloor = usage.indoorFloorArea ?? 0;
  if (n <= 0 || (playground <= 0 && court <= 0 && indoorFloor <= 0)) return EMPTY;

  const breakdown: string[] = [];
  const courtApplied = Math.min(court, std("court", n));

  // 비고 2-나 — 「종업원이 50명 이하인 **법인**」만. 개인사업자에는 적용하지 않는다.
  const courtOnly = n <= COURT_ONLY_EMPLOYEE_THRESHOLD && usage.entityType === "corporation";
  if (courtOnly) {
    breakdown.push(
      `종업원 ${n}명 이하 법인 → 코트면적만 인정 (별표6 3호바 비고 2-나) — ` +
        `코트 ${court}㎡ vs 표 ${std("court", n)}㎡ → ${courtApplied}㎡`,
    );
    return { ...EMPTY, recognizedArea: courtApplied, courtApplied, courtOnly: true, breakdown };
  }

  const playgroundApplied = Math.min(playground, std("field", n));
  if (playground > 0) {
    breakdown.push(
      `운동장 ${playground}㎡ vs 표 ${std("field", n)}㎡ (종업원 ${n}명) → ${playgroundApplied}㎡`,
    );
  }
  if (court > 0) {
    breakdown.push(`코트 ${court}㎡ vs 표 ${std("court", n)}㎡ → ${courtApplied}㎡`);
  }

  // 비고 2-다 — 바닥면적이 표 기준면적 이하이면 바닥면적이 기준면적이 된다.
  const indoorStandardBase = indoorFloor > 0 ? Math.min(indoorFloor, std("indoor", n)) : 0;
  // 비고 2-라 — 그 기준면적에 「지방세법 시행령」 §101② 용도지역별 적용배율을 곱한다.
  const multiplier = usage.indoorZoneMultiplier;
  const indoorZoneMultiplierMissing = indoorStandardBase > 0 && multiplier === undefined;
  const indoorApplied =
    indoorStandardBase > 0 && multiplier !== undefined ? indoorStandardBase * multiplier : 0;
  if (indoorStandardBase > 0) {
    breakdown.push(
      indoorZoneMultiplierMissing
        ? `실내체육시설 바닥면적 ${indoorFloor}㎡ → 기준면적 ${indoorStandardBase}㎡이나 ` +
          "용도지역별 적용배율(「지방세법 시행령」 §101②)을 알 수 없어 산입하지 않았습니다"
        : `실내체육시설 바닥면적 ${indoorFloor}㎡ vs 표 ${std("indoor", n)}㎡ → ` +
          `${indoorStandardBase}㎡ × 용도지역 배율 ${multiplier}배 = ${indoorApplied}㎡ (비고 2-다·라)`,
    );
  }

  return {
    recognizedArea: playgroundApplied + courtApplied + indoorApplied,
    playgroundApplied,
    courtApplied,
    indoorStandardBase,
    indoorApplied,
    courtOnly: false,
    indoorZoneMultiplierMissing,
    breakdown,
  };
}
