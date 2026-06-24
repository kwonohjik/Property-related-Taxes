/**
 * 주택 재산세 세부담상한 경과조치 (법률 제19230호 부칙 제15조) — v1 본세.
 *
 * §122 개정(주택 세부담상한 폐지, 시행 2024.1.1) 전에 재산세가 과세된 주택은
 * 2028.12.31까지 종전 §122(공시가격 구간별 105/110/130%)를 적용한다(부칙 제15조).
 *
 * 적용 게이트 = "직전연도 본세(previousYearHousingBaseTax) 입력 존재" + 2024≤taxYear≤2028.
 *   → 종부세 내부 calculatePropertyTax 호출(직전본세 미전달)은 미적용 → 종부세 회귀 0 (설계 C2).
 *   → 신축(2024 이후 첫 과세, 직전본세 부재) 자연 배제.
 *
 * §118 2호 가목 단서: 직전연도 재산세액 상당액 = 직전 실제 과세 세액(직접입력). 재산정(recompute)은 v2.
 *
 * v1 scope: 본세만. 도시지역분(§112①2호)·법인 소유 주택 제외·§118 4호 특례는 v2.
 * single-source(H2): 구간 상수 PROPERTY_CONST.HOUSING_TAX_CAP_*는 종부세 getHousingTaxCapPct와 공유.
 *   (getHousingTaxCapPct는 2024+ null=부칙 미반영이라 v1에서 직접 재사용 불가 — 상수만 공유.)
 */

import { applyRate } from "./tax-utils";
import { PROPERTY, PROPERTY_CONST } from "./legal-codes";
import type { PropertyTaxInput } from "./types/property.types";

export interface HousingTransitionalCapResult {
  /** 경과조치 상한 실제 적용 여부 */
  applied: boolean;
  /** 상한 적용 후 본세 (미적용 시 = calculatedTax) */
  determinedTax: number;
  /** 공시가격 구간별 상한율 (1.05/1.10/1.30) — 적용 시에만 */
  capRate?: number;
  /** 상한 한도 = floor(직전본세 × capRate) — 적용 시에만 */
  capLimit?: number;
  /** 미적용 사유 안내 (만료·미입력) */
  warnings: string[];
}

/**
 * 주택 본세에 부칙 제15조 경과조치 세부담상한을 적용.
 * @param calculatedTax 당해 산출세액 (원 미만 절사 완료)
 * @param publishedPrice 당해 주택공시가격 (구간 판정)
 * @param taxYear 과세연도
 * @param previousYearHousingBaseTax 직전연도 본세 (§118 단서, 직접입력) — 미입력 시 상한 미적용
 */
export function applyHousingTransitionalCap(
  calculatedTax: number,
  publishedPrice: number,
  taxYear: number,
  previousYearHousingBaseTax?: number,
): HousingTransitionalCapResult {
  // G2: 경과조치 만료 (2029~)
  if (taxYear > PROPERTY_CONST.HOUSING_TAX_CAP_EXPIRY_YEAR) {
    return {
      applied: false,
      determinedTax: calculatedTax,
      warnings: [
        `주택 세부담상한 경과조치(${PROPERTY.TAX_CAP_TRANSITIONAL})는 ${PROPERTY_CONST.HOUSING_TAX_CAP_EXPIRY_YEAR}년까지만 적용됩니다.`,
      ],
    };
  }
  // G3: 직전연도 본세 미입력 → 상한 미적용 (자동 안분 금지 — 0 대입 안 함)
  if (previousYearHousingBaseTax == null || previousYearHousingBaseTax <= 0) {
    return {
      applied: false,
      determinedTax: calculatedTax,
      warnings: [
        "직전연도 본세 미입력으로 세부담상한(부칙 제15조)을 적용하지 않습니다. 전년도 고지서 '재산세' 금액을 입력하세요.",
      ],
    };
  }
  const capRate = resolveHousingCapRate(publishedPrice);
  const capLimit = applyRate(previousYearHousingBaseTax, capRate); // floor (§118)
  return {
    applied: true,
    determinedTax: Math.min(calculatedTax, capLimit),
    capRate,
    capLimit,
    warnings: [],
  };
}

export interface HousingUrbanCapResult {
  /** 도시지역분 세부담상한 실제 적용 여부 */
  applied: boolean;
  /** 상한 적용 후 도시지역분 (미적용 시 = urbanCalculatedTax) */
  determinedUrbanTax: number;
  /** 공시가격 구간별 상한율 (1.05/1.10/1.30) — 본세와 동일 — 적용 시에만 */
  capRate?: number;
  /** 상한 한도 = floor(직전 도시지역분 × capRate) — 적용 시에만 */
  capLimit?: number;
  /** 미적용 사유 안내 */
  warnings: string[];
}

/**
 * [v2 §118 본문 "각각 산출"] 주택 도시지역분(§112①2호)에 부칙 제15조 경과조치 세부담상한 적용.
 *
 * §118은 직전 재산세액 상당액을 본세(§112①1호)·도시지역분(§112①2호·②) **각각** 산출하도록 규정한다.
 * 도시지역분은 본세와 **동일 capRate**(공시 구간 105/110/130%, resolveHousingCapRate 공유)·동일 게이트.
 * 직전 도시지역분은 §118 2호 가목 단서(직전 실제 부과 도시지역분)로 직접입력(previousYearHousingUrbanTax).
 *
 * ⚠️ v2 선구현(순수함수만): 엔진 Step4 주입·input/UI 결선·통합 anchor는 실측 도시지역분 과세표준 미스터리
 *   (환산과표 ≠ 재산세 과표·법령 산식과 332원차) 규명 후. 본 함수는 §118 법문(직전×상한율)만 구현.
 *   호출측은 isUrbanArea=false(도시지역분 0)이면 호출하지 않는다.
 */
export function applyHousingUrbanTransitionalCap(
  urbanCalculatedTax: number,
  publishedPrice: number,
  taxYear: number,
  previousYearHousingUrbanTax?: number,
): HousingUrbanCapResult {
  // G2: 경과조치 만료 (2029~)
  if (taxYear > PROPERTY_CONST.HOUSING_TAX_CAP_EXPIRY_YEAR) {
    return {
      applied: false,
      determinedUrbanTax: urbanCalculatedTax,
      warnings: [
        `주택 도시지역분 세부담상한 경과조치(${PROPERTY.TAX_CAP_TRANSITIONAL})는 ${PROPERTY_CONST.HOUSING_TAX_CAP_EXPIRY_YEAR}년까지만 적용됩니다.`,
      ],
    };
  }
  // G3: 직전연도 도시지역분 미입력 → 상한 미적용 (자동 안분 금지 — 0 대입 안 함)
  if (previousYearHousingUrbanTax == null || previousYearHousingUrbanTax <= 0) {
    return {
      applied: false,
      determinedUrbanTax: urbanCalculatedTax,
      warnings: [
        "직전연도 도시지역분 미입력으로 도시지역분 세부담상한(부칙 제15조)을 적용하지 않습니다. 전년도 고지서 '도시지역분' 금액을 입력하세요.",
      ],
    };
  }
  const capRate = resolveHousingCapRate(publishedPrice);
  const capLimit = applyRate(previousYearHousingUrbanTax, capRate); // floor (§118)
  return {
    applied: true,
    determinedUrbanTax: Math.min(urbanCalculatedTax, capLimit),
    capRate,
    capLimit,
    warnings: [],
  };
}

/** 공시가격 구간별 세부담상한율 (종전 §122 단서). single-source: PROPERTY_CONST 공유. */
export function resolveHousingCapRate(publishedPrice: number): number {
  if (publishedPrice <= PROPERTY_CONST.HOUSING_TAX_CAP_BRACKET_1)
    return PROPERTY_CONST.HOUSING_TAX_CAP_PCT_1 / 100; // 1.05 (3억 이하)
  if (publishedPrice <= PROPERTY_CONST.HOUSING_TAX_CAP_BRACKET_2)
    return PROPERTY_CONST.HOUSING_TAX_CAP_PCT_2 / 100; // 1.10 (3~6억)
  return PROPERTY_CONST.HOUSING_TAX_CAP_PCT_3 / 100; // 1.30 (6억 초과)
}

/**
 * 비주택 세부담상한 (지방세법 §122) — 토지·건축물·선박·항공기 직전연도 세액상당액 150%.
 * 주택은 §122 단서로 배제(주택 경과조치는 applyHousingTransitionalCap이 별도 처리).
 * 전년도 세액 미입력(비주택) 시 상한 미적용 + warnings.
 */
export function applyTaxCap(
  calculatedTax: number,
  objectType: PropertyTaxInput["objectType"],
  previousYearTax?: number,
): {
  determinedTax: number;
  taxCapRate: number;
  warnings: string[];
  legalBasis: string;
} {
  const warnings: string[] = [];

  // §122 단서: 주택은 세부담상한 적용 배제
  if (objectType === "housing") {
    if (previousYearTax !== undefined && previousYearTax > 0) {
      warnings.push(
        `주택은 세부담상한이 적용되지 않습니다 (${PROPERTY.TAX_CAP} 단서). ` +
          "입력한 전년도 납부세액은 계산에 사용되지 않습니다.",
      );
    }
    return {
      determinedTax: calculatedTax,
      taxCapRate: 1,
      warnings,
      legalBasis: PROPERTY.TAX_CAP,
    };
  }

  if (previousYearTax === undefined || previousYearTax <= 0) {
    warnings.push(
      `전년도 납부세액 미입력으로 세부담상한(${PROPERTY.TAX_CAP})을 적용하지 않습니다. ` +
        "정확한 계산을 위해 전년도 재산세 납부액을 입력하세요.",
    );
    return {
      determinedTax: calculatedTax,
      taxCapRate: 1,
      warnings,
      legalBasis: PROPERTY.TAX_CAP,
    };
  }

  const capRate = PROPERTY_CONST.TAX_CAP_RATE_LAND; // 150%
  const capLimit = applyRate(previousYearTax, capRate);
  const determinedTax = Math.min(calculatedTax, capLimit);

  return { determinedTax, taxCapRate: capRate, warnings, legalBasis: PROPERTY.TAX_CAP };
}
