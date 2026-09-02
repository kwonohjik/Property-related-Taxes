/**
 * anchor: 프로덕션 경로(DB/시드 → parseRatesFromMap → 엔진)에서도 NBL 판정 규칙이 온전해야 한다
 *
 * 발견 COV-1·COV-2 (docs/reviews/nbl-code-review-2026-09.md)
 *
 * 엔진 타입 `NonBusinessLandJudgmentRules`는 `periodCriteriaThresholds` 등 3개 optional 그룹을
 * 갖고 `DEFAULT_NON_BUSINESS_LAND_RULES`가 채우는데, DB/시드 스키마는 4키만 정의해 그 그룹을
 * 통째로 떨어뜨렸다. 값이 `undefined`가 아니라 **그룹이 없는 객체**라 엔진의 기본 인자가
 * 발동하지 않고, `getThresholdRatio`가 항상 0.6을 반환했다.
 *
 * ⇒ 2015.2.3. 전 양도분의 레거시 임계 0.8이 **API 경로에서 도달 불가**였다.
 *
 * 법령 (KoreanLaw `get_law_text` 직접 확인 2026-09-02):
 *   · 「소득세법 시행령」 §168의6 [시행 2014.03.11] 1호다목 —
 *     「토지의 소유기간의 **100분의 20**에 상당하는 기간을 초과하는 기간」
 *   · 같은 조 [시행 2015.02.03, 제26067호] — 같은 목이 「**100분의 40**」으로 개정
 *   ⇒ 비사업용 기간 임계 20%(= 사업용 80% 필요)가 구법이고, 코드의 레거시 0.8은 옳다.
 *   ⇒ 신법 시행일이 2015.02.03이므로 구법은 **양도일 2015-02-02까지** 적용된다.
 *
 * COV-2: 중과 게이트가 `if (input.isNonBusinessLand && surchargeRates.non_business_land)`이고
 * 그 키가 `.optional()`이라, 시드에서 키만 사라지면 +10%p가 **경고 0으로 조용히 증발**한다.
 */
import { describe, it, expect } from "vitest";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { getThresholdRatio } from "@/lib/tax-engine/non-business-land/period-criteria";
import type { NonBusinessLandJudgmentRules } from "@/lib/tax-engine/non-business-land/types";
import { baseTransferInput } from "../tax-engine/_helpers/mock-rates";

const d = (s: string) => new Date(s);

/** 프로덕션과 같은 경로로 규칙을 얻는다 — mock이 아니라 실제 시드다. */
function productionRules(at: string): NonBusinessLandJudgmentRules {
  const parsed = parseRatesFromMap(loadFallbackTransferRates(d(at)));
  return parsed.nonBusinessLandJudgmentRules as NonBusinessLandJudgmentRules;
}

describe("[COV-1] DB/시드 경로의 NBL 판정 규칙 온전성", () => {
  it("🔴 periodCriteriaThresholds가 프로덕션 경로에서도 살아 있다", () => {
    const rules = productionRules("2015-02-01");
    expect(rules.periodCriteriaThresholds).toBeDefined();
    expect(rules.periodCriteriaThresholds?.oldThresholdRatio).toBe(0.8);
    expect(rules.periodCriteriaThresholds?.currentThresholdRatio).toBe(0.6);
  });

  it("🔴 2015.2.3. 전 양도 농지 → 레거시 임계 0.8이 실제로 적용된다", () => {
    expect(getThresholdRatio(d("2015-02-01"), "farmland", productionRules("2015-02-01"))).toBe(0.8);
  });

  it("🔴 경계 — 개정 시행일 직전일(2015-02-02) 양도까지 구법", () => {
    expect(getThresholdRatio(d("2015-02-02"), "farmland", productionRules("2015-02-02"))).toBe(0.8);
  });

  it("경계 — 시행일(2015-02-03) 양도부터 현행 0.6", () => {
    expect(getThresholdRatio(d("2015-02-03"), "farmland", productionRules("2015-02-03"))).toBe(0.6);
  });

  it("현행 양도분은 0.6 (과대적용 방지)", () => {
    expect(getThresholdRatio(d("2024-06-01"), "farmland", productionRules("2024-06-01"))).toBe(0.6);
  });

  it("나머지 optional 그룹도 떨어지지 않는다", () => {
    const rules = productionRules("2024-06-01");
    expect(rules.urbanIncorporationGrace).toBeDefined();
    expect(rules.unconditionalExemptionDates).toBeDefined();
  });

  it("DB가 실은 값은 코드 기본값을 덮는다 (설계 의도 — 단방향 병합)", () => {
    const rules = productionRules("2024-06-01");
    // 시드 레코드 9의 buildingAreaMultipliers는 DEFAULT와 다른 값을 싣고 있다.
    expect(rules.buildingAreaMultipliers.residential).toBe(5);
  });
});

describe("[COV-2] 중과율이 실제 시드에 존재한다 — 사라지면 +10%p가 조용히 증발한다", () => {
  it("🔴 non_business_land 가산율 0.10", () => {
    const parsed = parseRatesFromMap(loadFallbackTransferRates(d("2024-06-01")));
    expect(parsed.surchargeRates.non_business_land?.additionalRate).toBe(0.1);
  });

  it("같은 구조인 다주택·미등기 중과율도 함께 고정", () => {
    const parsed = parseRatesFromMap(loadFallbackTransferRates(d("2024-06-01")));
    expect(parsed.surchargeRates.multi_house_2?.additionalRate).toBeGreaterThan(0);
    expect(parsed.surchargeRates.multi_house_3plus?.additionalRate).toBeGreaterThan(0);
    expect(parsed.surchargeRates.unregistered).toBeDefined();
  });

  it("🔴 통합 — 실제 시드로 계산하면 surchargeType이 non_business_land로 찍힌다", () => {
    const rates = loadFallbackTransferRates(d("2024-06-01"));
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "land",
        isNonBusinessLand: true,
        isOneHousehold: false,
        householdHousingCount: 0,
        residencePeriodMonths: 0,
        acquisitionDate: d("2015-02-03"),
        transferDate: d("2024-06-01"),
        transferPrice: 2_000_000_000,
        acquisitionPrice: 400_000_000,
      }),
      rates,
    );
    expect(r.surchargeType).toBe("non_business_land");
    expect(r.surchargeRate).toBe(0.1);
  });

  it("사업용 토지에는 붙지 않는다 (과대적용 방지)", () => {
    const rates = loadFallbackTransferRates(d("2024-06-01"));
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "land",
        isNonBusinessLand: false,
        isOneHousehold: false,
        householdHousingCount: 0,
        residencePeriodMonths: 0,
        acquisitionDate: d("2015-02-03"),
        transferDate: d("2024-06-01"),
        transferPrice: 2_000_000_000,
        acquisitionPrice: 400_000_000,
      }),
      rates,
    );
    expect(r.surchargeType).toBeUndefined();
  });
});
