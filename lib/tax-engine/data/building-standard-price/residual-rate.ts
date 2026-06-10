/**
 * D5. 경과연수별 잔가율 ((그룹, 경과연수) → 잔가율)
 *
 * 출처: 국세청 「건물 기준시가 계산방법」 고시 — 부록 「연도별 잔가율표」(26p, 평가연도별 표).
 *
 * ★★★ **평가연도별 스킴 상이**(국세청 계산사례 검증으로 확정 — "평가연도 무관" 가정 폐기):
 *   잔가율표는 시대별로 그룹 체계·내용연수·잔존율(하한)이 다르다. 선형 공식은 유지되나 파라미터가 다름.
 *     잔가율 = max(1.000 − 경과연수 × step, 잔존율),  step = (1 − 잔존율) ÷ 내용연수.
 *   - **현행(2002~2026 잠정)**: 4그룹. I=50·II=40·III=30·IV=20년, 잔존율 0.10.
 *       I step 0.018 / II 0.0225 / III 0.030 / IV 0.045. (2025·2026 PDF 전수 대조 일치)
 *   - **2001년표**: 3그룹. I=40·II=30·III=20년, 잔존율 0.20. (2001 잔가율표 실측)
 *       I step 0.02 / II 0.026667 / III 0.04. ⚠️ 그룹 구성 상이(황토 2001 II·2026 III / 철파이프 2001 III·2026 IV).
 *   ⚠️ 2002~2024 중간 연도표 미확보 — 현행(4그룹) 잠정 적용. 자료 확보 시 재검증 필요.
 *
 * 경과연수 = 평가연도 − 신축(또는 리모델링)연도. 같은 해 신축·평가 = 경과 0 = 1.000.
 * ⚠️ 취득세용 `acquisition-standard-price.ts`의 `calculateResidualRatio`와 별개.
 */
import type { ResidualRateGroup } from "../../types/building-standard-price.types";

/** 그룹별 연간 감가 step (1.000 기준, 현행 스킴) */
export const RESIDUAL_RATE_STEP: Readonly<Record<ResidualRateGroup, number>> = Object.freeze({
  I: 0.018,
  II: 0.0225,
  III: 0.03,
  IV: 0.045,
});

/** 평가연도별 잔가율 스킴(그룹별 내용연수 + 잔존율). 시대별 그룹 체계·내용연수·하한 상이 */
interface ResidualScheme {
  durableYears: Partial<Record<ResidualRateGroup, number>>;
  minRate: number;
}
const SCHEME_CURRENT: ResidualScheme = {
  durableYears: { I: 50, II: 40, III: 30, IV: 20 },
  minRate: 0.1,
};
/** 2001년표 — 3그룹(I=40·II=30·III=20년), 잔존율 0.20. 그룹 매핑은 resolveResidualGroup2001 */
const SCHEME_2001: ResidualScheme = {
  durableYears: { I: 40, II: 30, III: 20 },
  minRate: 0.2,
};

/** 평가연도 → 잔가율 스킴. 2001 이하 = 2001표 / 2002~2026 = 현행(잠정) */
function residualSchemeForYear(valuationYear: number): ResidualScheme {
  return valuationYear <= 2001 ? SCHEME_2001 : SCHEME_CURRENT;
}

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
 * 경과연수별 잔가율 계산. 평가연도별 스킴(내용연수·잔존율)으로 step·하한 결정.
 * 잔가율 = max(1 − 경과 × (1−잔존율)/내용연수, 잔존율). 소수 4자리 round.
 *
 * @param group        잔가율 그룹(스킴 기준 — 2001은 resolveResidualGroup2001 결과)
 * @param elapsedYears 경과연수(음수 방어 — 0 클램프)
 * @param valuationYear 평가연도(스킴 선택). 미지정 = 현행 스킴
 */
export function calcResidualRate(
  group: ResidualRateGroup,
  elapsedYears: number,
  valuationYear?: number,
): number {
  const scheme = valuationYear === undefined ? SCHEME_CURRENT : residualSchemeForYear(valuationYear);
  const durable = scheme.durableYears[group];
  if (durable === undefined) {
    throw new Error(`잔가율 그룹 '${group}' 미정의(평가연도 ${valuationYear ?? "현행"} 스킴)`);
  }
  const step = (1 - scheme.minRate) / durable;
  const e = Math.max(0, elapsedYears);
  const clamped = Math.max(1 - e * step, scheme.minRate);
  return Math.round(clamped * 10000) / 10000;
}
