/**
 * D5. 경과연수별 잔가율 ((내용연수 버킷, 평가연도, 경과연수) → 잔가율)
 *
 * 출처: 국세청 「건물 기준시가 계산방법」 고시 — 부록 「연도별 잔가율표」(26p, 평가연도 2001~2026 각 표).
 *   `연도별 잔가율.pdf` 전수 실측(2026-06-11): 평가연도별로 ① 그룹 체계(3↔4그룹) ② 구조→내용연수 멤버십
 *   ③ 내용연수 버킷별 최저잔가율(잔존율)이 모두 변동. 선형 공식은 유지:
 *     잔가율 = max(1.000 − 경과연수 × step, 잔존율),  step = (1 − 잔존율) ÷ 내용연수.
 *
 * ★★★ **3개 시대 (구조→내용연수 멤버십)** — 멤버십 resolver(resolveResidualGroupForYear)가 흡수:
 *   - **2001~2002 (3그룹)**: I=40·II=30·III=20년. (resolveResidualGroup2001)
 *   - **2003~2015 (era-B)**: 4그룹 I=50·II=40·III=30·IV=20년. 통나무·철골콘크리트만 50년,
 *       철근콘크리트·석조·PC·목구조=40년, 연와·시멘트벽돌·철골·스틸하우스·황토·목조=30년,
 *       시멘트블록·경량철골·철파이프·석회흙벽돌·돌담토담·기계식=20년. (resolveResidualGroupEraB)
 *   - **2016~2026 (era-C, 현행)**: 모든 구조 내용연수 +10(상한50·철파이프 20 유지).
 *       내용연수 "+10" 경계 = 2016(잔존율 개정 0.2→0.1과 동일 개정 — 홈택스 실측: 2015 era-B / 2016 era-C).
 *       철근콘크리트=50·연와=40·시멘트블록=30·철파이프=20년. (resolveResidualGroup = STRUCTURE_META)
 *
 * ★★★ **최저잔가율(잔존율)도 내용연수 버킷·평가연도별 상이** (연도별 잔가율표 floor 실측):
 *   - 50·40년 버킷: 2015년까지 0.20 → 2016년부터 0.10
 *   - 30년 버킷:    2005년까지 0.20 → 2006년부터 0.10
 *   - 20년 버킷:    2003년까지 0.20 → 2004년부터 0.10
 *   (3그룹 2001~2002는 40/30/20 버킷 모두 0.20 — 위 규칙으로 자동 충족)
 *
 * 경과연수 = 평가연도 − 신축(또는 리모델링)연도. 같은 해 신축·평가 = 경과 0 = 1.000.
 * ⚠️ 취득세용 `acquisition-standard-price.ts`의 `calculateResidualRatio`와 별개.
 * ⚠️ ALC·보강블록·와이어패널·조립식패널 등 신공법은 era-B 잔가율표 헤더 미수록(해당연도 구조지수표에도
 *    부재해 선택 불가) → era-C 내용연수 −10 추정 적용(durableEraB). 실무 영향 없음.
 */
import type { ResidualRateGroup } from "../../types/building-standard-price.types";

/** era-C(2016~) 그룹별 내용연수. 3그룹·era-B는 멤버십 resolver가 그룹 레터로 흡수 */
export const RESIDUAL_RATE_DURABLE_YEARS: Readonly<Record<ResidualRateGroup, number>> = Object.freeze({
  I: 50,
  II: 40,
  III: 30,
  IV: 20,
});

/** 잔가율 하한(현행 최소). 실제 적용 하한은 residualMinByDurable(연도·버킷별) */
export const RESIDUAL_RATE_MIN = 0.1;

/**
 * 그룹 레터의 내용연수(평가연도 기준):
 *   ≤2002 = 3그룹(I=40·II=30·III=20), ≥2003 = 4그룹(I=50·II=40·III=30·IV=20).
 * (멤버십 resolver가 구조→그룹 레터를 시대별로 결정하므로, 여기선 레터→내용연수만)
 */
export function durableForGroup(group: ResidualRateGroup, valuationYear: number): number {
  if (valuationYear <= 2002) {
    const d: Partial<Record<ResidualRateGroup, number>> = { I: 40, II: 30, III: 20 };
    const v = d[group];
    if (v === undefined) throw new Error(`3그룹(${valuationYear})에 그룹 '${group}' 없음`);
    return v;
  }
  return RESIDUAL_RATE_DURABLE_YEARS[group];
}

/**
 * 내용연수 버킷·평가연도별 최저잔가율(잔존율). 국세청 「연도별 잔가율표」 floor 실측(2026-06-11).
 *   50·40년: 2016~ 0.10 / 30년: 2006~ 0.10 / 20년: 2004~ 0.10 (그 전은 0.20).
 */
export function residualMinByDurable(durableYears: number, valuationYear: number): number {
  switch (durableYears) {
    case 50:
    case 40:
      return valuationYear >= 2016 ? 0.1 : 0.2;
    case 30:
      return valuationYear >= 2006 ? 0.1 : 0.2;
    case 20:
      return valuationYear >= 2004 ? 0.1 : 0.2;
    default:
      return 0.1;
  }
}

/** 그룹·평가연도의 연간 감가 step = (1 − 잔존율) ÷ 내용연수 (리모델링 할증·잔가율 공용) */
export function residualStepForGroup(group: ResidualRateGroup, valuationYear: number): number {
  const durable = durableForGroup(group, valuationYear);
  return (1 - residualMinByDurable(durable, valuationYear)) / durable;
}

/** 내용연수(년) → 잔가율 그룹 레터(현행 버킷). 기계식주차 내용연수 매핑 등에서 사용. */
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
 * 내용연수·평가연도·경과연수로 잔가율 계산(그룹 레터 비경유 — 기계식주차 등).
 * 잔가율 = max(1 − 경과 × (1−잔존율)/내용연수, 잔존율). 소수 4자리 round.
 */
export function calcResidualRateByDurable(
  durableYears: number,
  elapsedYears: number,
  valuationYear: number,
): number {
  const min = residualMinByDurable(durableYears, valuationYear);
  const step = (1 - min) / durableYears;
  const e = Math.max(0, elapsedYears);
  return Math.round(Math.max(1 - e * step, min) * 10000) / 10000;
}

/**
 * 대수선(리모델링) 연도 범위 검증 — **엔진과 ⑧ validation 의 단일 술어**.
 *
 * 같은 도메인의 `builtYear` 는 1900~MAX_YEAR 로 검증되는데 `remodelYear` 는 어디서도 검증되지 않아,
 * 평가연도보다 뒤인 대수선(미래)이나 신축연도보다 앞선 대수선(모순)이 조용히 통과한다.
 * 실측(2026-08-26): 대수선 3000 입력이 잔가율 14.41 · 기준시가 146배로 산출됐다.
 *
 * @returns 오류 메시지(있으면) 또는 null
 */
export function remodelYearError(
  remodelYear: number | undefined,
  builtYear: number,
  valuationYear: number,
): string | null {
  if (remodelYear === undefined) return null;
  if (!Number.isInteger(remodelYear) || remodelYear < builtYear) {
    return `대수선(리모델링)연도는 신축연도(${builtYear}) 이후여야 합니다.`;
  }
  if (remodelYear > valuationYear) {
    return `대수선(리모델링)연도는 평가연도(${valuationYear})보다 뒤일 수 없습니다.`;
  }
  return null;
}

/**
 * 경과연수별 잔가율 계산(그룹 레터 기준). 평가연도로 내용연수·잔존율 결정.
 * @param group         잔가율 그룹 레터(멤버십 resolver 결과 — 시대별 구조→그룹)
 * @param elapsedYears  경과연수(음수 방어 — 0 클램프)
 * @param valuationYear 평가연도(내용연수·잔존율 결정)
 */
export function calcResidualRate(
  group: ResidualRateGroup,
  elapsedYears: number,
  valuationYear: number,
): number {
  return calcResidualRateByDurable(durableForGroup(group, valuationYear), elapsedYears, valuationYear);
}
