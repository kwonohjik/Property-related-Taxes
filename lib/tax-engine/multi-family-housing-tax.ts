/**
 * 다가구주택 구별 면적안분 재산세 — 종합부동산세 사례7 (트랙 A 자동화).
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음. 순수 함수.
 * 단방향 의존 comprehensive → property 준수: `calculatePropertyTax`(property-tax.ts) 재사용.
 * property-tax.ts 800줄 정책 회피를 위한 sibling 분리(general-building-area-apportion.ts 패턴).
 *
 * 다가구주택(부동산공시법 §17 단독주택 = 1동 1개 통합 개별주택가격)을 구별(층) 면적비율로
 * 안분한 뒤, 각 구분에 `calculatePropertyTax`(누진세율)를 개별 적용·합산한다.
 *
 * ★ 누진세율 분배법칙 불성립(f(a+b) ≠ f(a)+f(b)) → 1동 통째 산출(과대)과 다름. 구별 개별 적용 필수.
 *   예) 통합 8억 단일 = 1,290,000 ≠ 구별 합산(3.2억·3.2억·1.6억) = 300,000+300,000+114,000 = 714,000.
 * ★ 면적 직접 안분(국토부 「개별주택가격 조사·산정지침」 고시). floor 잔액은 마지막 구분 흡수(Σ구별 = 통합).
 * ★ FMR·누진·주택 세부담상한 패스스루는 calculatePropertyTax가 단일 경로로 처리 → 단일 공시 자동계산과 drift 0.
 */

import { calculatePropertyTax } from "./property-tax";
import { safeMultiplyThenDivide } from "./tax-utils";

export interface MultiFamilyUnit {
  label: string;
  /** 구분(층) 면적 (㎡, 소수 허용) */
  area: number;
}

export interface MultiFamilyHousingTaxResult {
  /** Σ 구별 재산세 (결정세액 — 감면·지분 적용 전. 호출측에서 applyEffectiveFactor 후곱) */
  total: number;
  /** 구별 안분 내역 echo (결과 카드 ⑦) */
  perUnit: { label: string; apportionedAssessedValue: number; tax: number }[];
}

/**
 * 다가구 통합공시를 구별 면적비율로 안분 후 각 구분 재산세를 합산한다.
 *
 * @param unifiedPublishedPrice 1동 통합 개별주택가격 (원)
 * @param floorUnits            구분(층)별 {명칭, 면적㎡}
 * @param isOneHousehold        1세대1주택 특례세율 적용 여부 (호출측이 세대 판정 후 전달)
 * @param targetDate            과세기준일 (YYYY-MM-DD) — calculatePropertyTax FMR·연도 산정
 * @param rates                 DB 세율 맵 (미전달 시 calculatePropertyTax가 역사적 상수 fallback)
 */
export function calcMultiFamilyHousingTax(
  unifiedPublishedPrice: number,
  floorUnits: MultiFamilyUnit[],
  isOneHousehold: boolean,
  targetDate: string,
  rates?: Parameters<typeof calculatePropertyTax>[1],
): MultiFamilyHousingTaxResult {
  const totalArea = floorUnits.reduce((sum, u) => sum + u.area, 0);
  if (totalArea <= 0 || floorUnits.length === 0) {
    return { total: 0, perUnit: [] };
  }

  const perUnit: MultiFamilyHousingTaxResult["perUnit"] = [];
  let total = 0;
  let cumulativeAssessed = 0;

  floorUnits.forEach((unit, i) => {
    const isLast = i === floorUnits.length - 1;
    // 면적 안분: floor(통합 × area_i / Σarea). 마지막 구분은 잔액 흡수(Σ구별 = 통합공시 보존).
    const apportioned = isLast
      ? unifiedPublishedPrice - cumulativeAssessed
      : Math.floor(
          safeMultiplyThenDivide(unifiedPublishedPrice, unit.area, totalArea),
        );
    cumulativeAssessed += apportioned;

    // 구별 누진세율 개별 적용 — 단일 공시 자동 경로(calculatePropertyTax)와 동일(drift 0)
    const tax = calculatePropertyTax(
      {
        objectType: "housing",
        publishedPrice: apportioned,
        isOneHousehold,
        targetDate,
      },
      rates,
    ).determinedTax;

    total += tax;
    perUnit.push({
      label: unit.label,
      apportionedAssessedValue: apportioned,
      tax,
    });
  });

  return { total, perUnit };
}
