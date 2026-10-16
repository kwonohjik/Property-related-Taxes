/**
 * 겸용주택 §104 세율 판정용 파트 조립 — `transfer-tax-mixed-use.ts` 800줄 정책 분리(2026-10-16, 겸용 × 부담부증여 seam 삽입 여유분).
 *
 * 로직은 오케스트레이터에 있던 것을 **그대로** 옮겼다(동작 불변) — 호출부 한 곳.
 */
import type { MixedUseRatePart } from "./transfer-tax-mixed-use-totals";
import type { HousingGainSplit } from "./transfer-tax-mixed-use-housing";
import type { CommercialGainSplit } from "./transfer-tax-mixed-use-commercial";
import type { buildHousingPart, buildCommercialPart, buildNonBusinessPart } from "./transfer-tax-mixed-use-helpers";

export function buildMixedRateParts(args: {
  housingPart: ReturnType<typeof buildHousingPart>;
  housingGainSplit: HousingGainSplit;
  commercialGainSplit: CommercialGainSplit;
  commercialPart: ReturnType<typeof buildCommercialPart>;
  nonBusinessLandPart: ReturnType<typeof buildNonBusinessPart>;
  /** 보유 연수 → 세율 판정 연수 (상속 파트는 피상속인 취득일 기준) */
  landRateYears: (lthdYears: number) => number;
  buildingRateYears: (lthdYears: number) => number;
  /** §104⑦ 가산율 — 주택 파트 전용 */
  surchargeAddon: number | undefined;
}): MixedUseRatePart[] | undefined {
  const { housingPart, housingGainSplit, commercialGainSplit, commercialPart, nonBusinessLandPart } = args;
  const { landRateYears, buildingRateYears, surchargeAddon } = args;
  const commercialLandIncome = commercialPart.landIncomeAmount;
  const commercialBuildingIncome = commercialPart.buildingIncomeAmount;
  return commercialLandIncome !== undefined &&
    commercialBuildingIncome !== undefined &&
    // 불변식 — 파트 합이 자산 소득금액과 어긋나면(음수 차익 clamp 등) 진입하지 않는다.
    commercialLandIncome + commercialBuildingIncome === commercialPart.incomeAmount
    ? [
        {
          kind: "housing" as const,
          income: housingPart.incomeAmount,
          holdingYears: Math.min(
            landRateYears(housingGainSplit.landHoldingYears),
            buildingRateYears(housingGainSplit.buildingHoldingYears),
          ),
          // §104⑦ — 상가 파트에는 붙이지 않는다(대상이 「주택+딸린 토지」).
          ...(surchargeAddon !== undefined ? { surchargeAddon } : {}),
        },
        {
          kind: "commercial_land" as const,
          income: commercialLandIncome,
          holdingYears: landRateYears(commercialGainSplit.landHoldingYears),
        },
        {
          kind: "commercial_building" as const,
          income: commercialBuildingIncome,
          holdingYears: buildingRateYears(commercialGainSplit.buildingHoldingYears),
        },
        // §104⑤ 본문 후단 — 배율 초과분(비사업용 토지)은 **별개 자산**으로 보아
        // §104①8호(§55① 세율 + 10%p)를 자기 과세표준에만 적용한다. 2년 미만이면
        // `buildTotalTax`가 §104① 후단으로 토지 단기세율(50%/40%)과 큰 것을 취한다.
        // 보유연수 기산은 **주택 부수토지의 토지 보유연수** — 배율 초과분도 같은 필지다.
        ...((nonBusinessLandPart?.incomeAmount ?? 0) > 0
          ? [
              {
                kind: "non_business_land" as const,
                income: nonBusinessLandPart!.incomeAmount,
                holdingYears: landRateYears(housingGainSplit.landHoldingYears),
                surchargeAddon: nonBusinessLandPart!.additionalRate,
              },
            ]
          : []),
      ]
    : undefined;
}
