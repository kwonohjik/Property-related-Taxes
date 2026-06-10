/**
 * D5. 경과연수별 잔가율 ((그룹, 경과연수) → 잔가율)
 *
 * 출처: 국세청 「건물 기준시가 계산방법」 고시 — 부록 「연도별 잔가율표」(26p, 평가연도별 표).
 *
 * ★ 핵심: 잔가율 값은 **경과연수에만 의존**(평가연도 무관). PDF 2025·2026 두 표 전수 대조로 확인 —
 *   경과연수가 같으면 어느 평가연도 표에서나 동일 값(등치쌍 실측: 2026평가·2021신축 = 2025평가·2020신축
 *   = 0.910(경과5) / 2026평가·2020신축 = 2025평가·2019신축 = 0.892(경과6)).
 *   → 26개 표를 1D(경과연수)로 압축.
 *
 * ★ 완전 선형 검증(2026-06-10 PDF 전수 대조):
 *   잔가율 = max(1.000 − 경과연수 × step, 0.100). PDF 전사값과 **모든 그룹·모든 경과연수에서 1:1 일치**.
 *     I그룹(50년)  step 0.018   : 경과0=1.000 / 경과5=0.910 / 경과49=0.118 / 경과50↑=0.100
 *     II그룹(40년) step 0.0225  : 경과0=1.000 / 경과5=0.8875 / 경과39=0.1225 / 경과40↑=0.100
 *     III그룹(30년) step 0.030  : 경과0=1.000 / 경과5=0.850 / 경과29=0.130 / 경과30↑=0.100
 *     IV그룹(20년) step 0.045   : 경과0=1.000 / 경과5=0.775 / 경과19=0.145 / 경과20↑=0.100
 *   (계획서 C1 해소 — 선형 공식 = PDF 전사값. 별도 전사 테이블 불요.)
 *
 * 경과연수 = 평가연도 − 신축(또는 리모델링)연도. 같은 해 신축·평가 = 경과 0 = 1.000.
 * ⚠️ 취득세용 `acquisition-standard-price.ts`의 `calculateResidualRatio`와 별개(단일 곡선 아님 — 그룹별 step).
 */
import type { ResidualRateGroup } from "../../types/building-standard-price.types";

/** 그룹별 연간 감가 step (1.000 기준) */
export const RESIDUAL_RATE_STEP: Readonly<Record<ResidualRateGroup, number>> = Object.freeze({
  I: 0.018,
  II: 0.0225,
  III: 0.03,
  IV: 0.045,
});

/** 잔가율 하한 */
export const RESIDUAL_RATE_MIN = 0.1;

/** 그룹별 내용연수(잔가율 하한 도달 경과연수) */
export const RESIDUAL_RATE_DURABLE_YEARS: Readonly<Record<ResidualRateGroup, number>> = Object.freeze({
  I: 50,
  II: 40,
  III: 30,
  IV: 20,
});

/** 내용연수(년) → 잔가율 그룹 매핑. 기계식주차 특수산식(내용연수 기준)에서 사용. */
export function durableYearsToResidualGroup(durableYears: number): ResidualRateGroup {
  switch (durableYears) {
    case 50:
      return "I";
    case 40:
      return "II";
    case 30:
      return "III";
    case 20:
      return "IV";
    default:
      throw new Error(`잔가율 그룹 매핑 불가 내용연수: ${durableYears}`);
  }
}

/**
 * 경과연수별 잔가율 계산. 부동소수 누적 오차 회피를 위해 0.0001 단위로 round 후 반환
 * (PDF 표가 소수 4자리까지 표기 — II그룹 0.9775 등).
 *
 * @param group     잔가율 그룹(I~IV)
 * @param elapsedYears 경과연수(음수 입력 방어 — 0으로 클램프)
 */
export function calcResidualRate(group: ResidualRateGroup, elapsedYears: number): number {
  const e = Math.max(0, elapsedYears);
  const raw = 1 - e * RESIDUAL_RATE_STEP[group];
  const clamped = Math.max(raw, RESIDUAL_RATE_MIN);
  // 소수 4자리 round (0.0225 × 정수의 부동소수 오차 정리)
  return Math.round(clamped * 10000) / 10000;
}
