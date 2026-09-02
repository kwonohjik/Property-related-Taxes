/**
 * anchor: 일괄양도에서 상업용건물 부수토지 초과분 중과(§104①8호)가 살아남아야 한다
 *
 * 발견 E6-01·V8-a·V8-b (docs/reviews/nbl-code-review-2026-09.md)
 *
 * 단건 엔진은 STEP 0.62(`runCommercialAppurtenantLandStep`)가 `effectiveInput`에
 * `isNonBusinessLand: true` + `nonBusinessLandAreaRatio`를 **파생 주입**하고 그 값으로 세율을 정한다.
 * 그런데 그 파생 입력이 result에 echo되지 않아 집계의 `correctedSingleInput`에 복원되지 않았고,
 * 그룹 세액 재계산에서 +10%p가 통째로 사라졌다(실측 최종 11,683,750원 과소).
 *
 * 수정은 값을 새로 배관하는 대신 **엔진과 같은 leaf**(`judgeAppurtenantLandExcess`)로 재판정한다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const d = (s: string) => new Date(s);

/** 부수토지 기준면적을 크게 초과하는 상업용건물 — 초과분이 비사업용으로 넘어간다 */
function commercialWithExcessLand(id = "CB1"): TransferTaxInput {
  return baseTransferInput({
    propertyId: id,
    propertyLabel: id,
    propertyType: "commercial_building",
    isOneHousehold: false,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    acquisitionDate: d("2014-01-01"),
    transferDate: d("2024-06-01"),
    transferPrice: 1_500_000_000,
    acquisitionPrice: 500_000_000,
    commercialAppurtenantLand: {
      totalLandArea: 4_000,
      totalBuildingFootprintArea: 200,
      zoneType: "general_residential",
    },
  } as Partial<TransferTaxInput>);
}

describe("[E6-01] 일괄양도 — 상업용건물 부수토지 초과분 중과 보존", () => {
  it("단건 엔진은 초과분에 §104①8호 중과를 적용한다 (전제 확인)", () => {
    const r = calculateTransferTax(commercialWithExcessLand(), makeMockRates());
    expect(r.surchargeType).toBe("non_business_land");
    expect(r.surchargeRate).toBeGreaterThan(0);
  });

  it("🔴 일괄양도(2자산)에서도 그 중과가 살아남는다", () => {
    const excess = commercialWithExcessLand();
    const plain = {
      ...baseTransferInput({
      propertyType: "land",
      isOneHousehold: false,
      householdHousingCount: 0,
      residencePeriodMonths: 0,
      acquisitionDate: d("2014-01-01"),
      transferDate: d("2024-06-01"),
      transferPrice: 300_000_000,
      acquisitionPrice: 200_000_000,
      }),
      propertyId: "L1",
      propertyLabel: "L1",
    };

    const withExcess = calculateTransferTaxAggregate(
      {
        properties: [excess as unknown as TransferTaxItemInput, plain as unknown as TransferTaxItemInput],
        taxYear: 2024,
        annualBasicDeductionUsed: 0,
      },
      makeMockRates(),
    );

    // 같은 번들에서 부수토지 초과분만 없앤 대조군 — 세액이 반드시 더 작아야 한다.
    const noExcess = calculateTransferTaxAggregate(
      {
        properties: [
          { ...excess, commercialAppurtenantLand: undefined } as unknown as TransferTaxItemInput,
          plain as unknown as TransferTaxItemInput,
        ],
        taxYear: 2024,
        annualBasicDeductionUsed: 0,
      },
      makeMockRates(),
    );

    expect(withExcess.determinedTax).toBeGreaterThan(noExcess.determinedTax);
  });

  it("V8-a: 파트 없는 자산의 참고 세액이 이중 계상되지 않는다", () => {
    // ⚠️ 파트가 있는 자산(부분 비사토·분리취득)은 `assetPartTax`가 정본이라 이 근사식을 쓰지 않는다.
    //    그래서 **전량 비사토 토지**(파트 없음)로 근사식 경로를 고정한다.
    const nblLand = {
      ...baseTransferInput({
      propertyType: "land",
      isNonBusinessLand: true,
      isOneHousehold: false,
      householdHousingCount: 0,
      residencePeriodMonths: 0,
      acquisitionDate: d("2014-01-01"),
      transferDate: d("2024-06-01"),
      transferPrice: 900_000_000,
      acquisitionPrice: 300_000_000,
      }),
      propertyId: "L2",
      propertyLabel: "L2",
    };
    const agg = calculateTransferTaxAggregate(
      { properties: [nblLand as unknown as TransferTaxItemInput], taxYear: 2024, annualBasicDeductionUsed: 0 },
      makeMockRates(),
    );
    const p = agg.properties[0];
    // `appliedRate`는 **이미 중과 포함 실효세율**이다(rate-calc `baseRate + additionalRate × ratio`) —
    // 참고 세액은 그 값 하나로 계산돼야 한다. 종전에는 `appliedRate + surchargeRate`로 이중 계상했다.
    expect(p.refCalculatedTax).toBe(
      Math.max(0, Math.floor(p.taxBaseShare * p.appliedRate) - p.progressiveDeduction),
    );
    expect(p.surchargeRate ?? 0).toBeGreaterThan(0); // 중과가 실제로 붙은 케이스임을 확인
  });

  it("초과분이 없으면 중과가 붙지 않는다 (과대적용 방지)", () => {
    const ok = baseTransferInput({
      propertyId: "CB2",
      propertyLabel: "CB2",
      propertyType: "commercial_building",
      isOneHousehold: false,
      householdHousingCount: 0,
      residencePeriodMonths: 0,
      acquisitionDate: d("2014-01-01"),
      transferDate: d("2024-06-01"),
      transferPrice: 1_500_000_000,
      acquisitionPrice: 500_000_000,
      commercialAppurtenantLand: {
        totalLandArea: 300,
        totalBuildingFootprintArea: 200,
        zoneType: "general_residential",
      },
    } as Partial<TransferTaxInput>);
    const agg = calculateTransferTaxAggregate(
      { properties: [ok as unknown as TransferTaxItemInput], taxYear: 2024, annualBasicDeductionUsed: 0 },
      makeMockRates(),
    );
    expect(agg.properties[0].surchargeRate ?? 0).toBe(0);
  });
});
