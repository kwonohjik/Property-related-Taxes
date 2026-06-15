/**
 * 주택 재산세 세부담상한(§122 단서) 적용 — 종합부동산세 사례8·9 (트랙 B).
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음. 순수 함수.
 * 단방향 의존 comprehensive → property 준수: calculatePropertyTax(property-tax.ts) 재사용.
 * R-3: 종부세측 헬퍼 — property-tax.ts 주택 폐지 패스스루(§122 단서) 변경 금지.
 *
 * 종부세법 §9③: 공제 재산세 ⓐ = "지방세법 §122에 따라 세부담 상한을 적용받은 경우에는 그 상한을 적용받은 세액".
 * 지방세법 §122 단서(2022): 주택공시 3억↓ 105% / 3~6억 110% / 6억↑ 130% (HOUSING_TAX_CAP_PCT_*).
 *   2024 폐지(과세표준상한제 §110③) → getHousingTaxCapPct가 null 반환 시 상한 미적용.
 * 지방세법 시행령 §118 제3호: 직전 재산세액 상당액은 당해 연도의 비과세·감면을 직전에도 동일 적용해 산출.
 *   → 본 함수는 감면전 표준세율로 cap을 산출하고, 호출측이 감면·지분을 후곱(applyEffectiveFactor)한다.
 *   대수적으로 §118(감면후 직전 × pct)과 동일: min(C, P·pct)·g = min(C·g, P·g·pct) (g = 1−감면율, 공통 인수).
 * 직전 표준세율은 직전 공시 + 직전 연도 법령(§118 제2호 가목 본문)으로 calculatePropertyTax 산출(단일 경로 재사용·drift 0).
 */

import { calculatePropertyTax } from "./property-tax";
import { getHousingTaxCapPct } from "./comprehensive-prior-year";

export interface HousingTaxCapResult {
  /** 당해 표준세율 재산세 (감면전·cap전) — 호출측 주입 */
  standardTax: number;
  /** 직전 표준세율 재산세 (감면전, 직전 공시·직전 연도 법령) */
  priorStandardTax: number;
  /** 세부담상한율(%) 또는 null(2024+ 폐지) */
  capPct: number | null;
  /** 상한액 = floor(직전표준 × capPct/100). capPct null이면 null */
  capAmount: number | null;
  /** 세부담상한 후 재산세 (감면전) = min(standardTax, capAmount) */
  cappedTax: number;
}

/**
 * 당해 표준세율(감면전)에 §122 세부담상한을 적용(감면전 기준). 감면·지분 후곱은 호출측 책임.
 *
 * @param currentStandardTax   당해 표준세율 재산세 (감면전·cap전 — 단일=calculatePropertyTax / 다가구=Σ)
 * @param priorAssessedValue   직전연도 주택공시가격 (원)
 * @param assessmentYear       당해 과세연도 (capPct 폐지연도 판정)
 * @param currentAssessedValue 당해 주택공시가격 (§122 단서 구간 판정 기준)
 * @param isOneHousehold       1세대1주택 특례세율 적용 여부
 * @param priorTargetDate      직전연도 과세기준일 (YYYY-MM-DD) — 직전 연도 법령·FMR
 * @param rates                DB 세율 맵 (미전달 시 역사적 상수 fallback)
 */
export function buildHousingPropertyTaxWithCap(
  currentStandardTax: number,
  priorAssessedValue: number,
  assessmentYear: number,
  currentAssessedValue: number,
  isOneHousehold: boolean,
  priorTargetDate: string,
  rates?: Parameters<typeof calculatePropertyTax>[1],
): HousingTaxCapResult {
  // 직전 표준세율 = 직전 공시 + 직전 연도 법령(§118 제2호 가목 본문) — 단일 경로 재사용(drift 0)
  const priorStandardTax = calculatePropertyTax(
    {
      objectType: "housing",
      publishedPrice: priorAssessedValue,
      isOneHousehold,
      targetDate: priorTargetDate,
    },
    rates,
  ).determinedTax;

  const capPct = getHousingTaxCapPct(assessmentYear, currentAssessedValue);
  const capAmount =
    capPct != null ? Math.floor((priorStandardTax * capPct) / 100) : null;
  const cappedTax =
    capAmount != null ? Math.min(currentStandardTax, capAmount) : currentStandardTax;

  return {
    standardTax: currentStandardTax,
    priorStandardTax,
    capPct,
    capAmount,
    cappedTax,
  };
}
