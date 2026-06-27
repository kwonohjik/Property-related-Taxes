/**
 * 정기금·신탁수익 현가 공용 코어 — 상증칙 §19의2 이자율 3%(30/1000) 1/(1.03)ⁿ floor.
 *
 * 단일 진실: §33 신탁이익 증여(gift-deemed/trust-benefit.ts)·§61 신탁수익권 평가
 * (property-valuation-trust-benefit.ts)·§62 정기금 평가(property-valuation-periodic.ts) 공유.
 *
 * ⚠️ 루프 인덱싱(시작 0 vs 1)·20배 cap·연수 도출은 **각 호출처 책임** — 이 코어는 단항 PV만.
 *   신탁 수익권(§61): 평가기준일=첫수익시기 가정 n=0,1,2… (annuity-due)
 *   정기금(§62):     "평가기준일부터의 경과연수" n=1,2… (ordinary, 계수표 정합)
 */

import { getLifeExpectancyFloor } from "./data/life-expectancy-2023";
import { parseISO, differenceInYears } from "date-fns";

/**
 * 1/(1.03)ⁿ floor 현재가치 — BigInt 거듭제곱 (103ⁿ > MAX_SAFE_INTEGER 정밀도 회피).
 * floor(R × 100ⁿ / 103ⁿ). BigInt 나눗셈은 0방향 절사 = 양수 floor.
 */
export function pvAt3pct(amount: number, n: number): number {
  const e = Math.max(0, Math.floor(n));
  if (amount <= 0) return Math.max(0, amount);
  return Number((BigInt(amount) * 100n ** BigInt(e)) / 103n ** BigInt(e));
}

export type AnnuityKind = "finite" | "perpetual" | "lifetime";

export interface ResolveAnnuityYearsInput {
  kind: AnnuityKind;
  /** 사용자 직접 override (우선) */
  override?: number;
  /** [finite] 만기일 — 평가기준일과 차분해 연수 */
  maturityDate?: Date | string;
  valuationDate?: Date | string;
  /** [lifetime] 기대여명 */
  gender?: "male" | "female";
  age?: number;
}

/**
 * §61②·§62 연수 도출:
 *   perpetual → 20 (§62 2호) · lifetime → 기대여명 floor(§62 3호, 소수점 버림) · finite → 만기−평가기준일 floor.
 *   미입력은 0 (validate가 차단). override 최우선.
 *   ⚠️ 기대여명은 getLifeExpectancyFloor(§62 floor) — §20③ 인적공제 ceil(getLifeExpectancyByGender)과 혼동 금지.
 */
export function resolveAnnuityYears(input: ResolveAnnuityYearsInput): number {
  if (input.override != null) return Math.max(0, Math.trunc(input.override));
  if (input.kind === "perpetual") return 20;
  if (input.kind === "lifetime") {
    if (input.gender && input.age != null) return getLifeExpectancyFloor(input.gender, input.age);
    return 0;
  }
  // finite
  if (!input.maturityDate || !input.valuationDate) return 0;
  const m = input.maturityDate instanceof Date ? input.maturityDate : parseISO(input.maturityDate);
  const v = input.valuationDate instanceof Date ? input.valuationDate : parseISO(input.valuationDate);
  return Math.max(0, differenceInYears(m, v));
}
