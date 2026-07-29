/**
 * anchor — 컴패니언(다자산) 공익수용 §164⑨ 1호 특례 (계획 Q5 · P3b).
 *
 * 종전에는 `buildExpropriationInput(primary)`가 **주 자산 전용**이라 컴패니언 자산은 특례
 * 미지원이었다(`buildAssetPayload`·`buildCompanionEngineInputs`에 특례 필드 0건 실측).
 *
 * 다자산은 `calculateTransferTaxAggregate`가 **자산별로 단건 엔진(`calculateTransferTax`)을
 * 반복 호출**하므로(`transfer-tax-aggregate.ts:111-118`), 엔진 input에 필드만 도달하면
 * 특례가 그대로 발동한다 — 상가·일반건물(D16)처럼 전용 경로가 우회하지 않는다.
 *
 * ⇒ 본 anchor는 **엔진 계층에서 컴패니언 자산이 특례를 받는다**는 사실을 고정한다.
 *   (폼 → payload → Zod → route 배선은 ④⑫ + `bundled-split-helpers.ts` 매핑이 담당)
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

/** 토지 1건 — 수용 + 환산. min[2,500,000 · 1,500,000 · 2,000,000] × 200㎡ = 3억(현행 5억) */
function landItem(id: string, withExpr: boolean) {
  return {
    propertyId: id,
    propertyLabel: id,
    propertyType: "land" as const,
    transferPrice: 1_000_000_000,
    transferDate: new Date("2020-06-01"),
    acquisitionDate: new Date("2010-06-01"),
    acquisitionPrice: 0,
    expenses: 0,
    useEstimatedAcquisition: true,
    standardPriceAtAcquisition: 200_000_000,
    standardPriceAtTransfer: 500_000_000,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    reductions: [],
    annualBasicDeductionUsed: 0,
    ...(withExpr
      ? {
          transferCause: "public_expropriation" as const,
          standardPricePerSqmAtTransfer: 2_500_000,
          transferArea: 200,
          compensationPerSqm: 1_500_000,
          compensationBasisStdPrice: 2_000_000,
        }
      : {}),
  } as unknown as TransferTaxInput;
}

describe("컴패니언(다자산) 공익수용 §164⑨ 1호 특례 (Q5)", () => {
  it("컴패니언 자산도 특례 적용 — 자산별 단건 엔진 재사용이라 도달", () => {
    const r = calculateTransferTaxAggregate(
      {
        taxYear: 2020,
        // 2건 모두 수용 — 컴패니언(2번째)도 주 자산과 동일하게 적용돼야 한다
        properties: [landItem("primary", true), landItem("companion-1", true)],
        annualBasicDeductionUsed: 0,
        priorReductionUsage: [],
      } as never,
      rates,
    );

    // 특례 적용 시 자산별 양도차익 327,333,334 (미적용이면 594,000,000)
    expect(r.properties).toHaveLength(2);
    for (const p of r.properties) {
      expect(p.transferGain).toBe(327_333_334);
    }
  });

  it("컴패니언만 수용 — 주 자산은 미적용, 컴패니언만 적용 (자산별 독립 판정)", () => {
    const r = calculateTransferTaxAggregate(
      {
        taxYear: 2020,
        properties: [landItem("primary", false), landItem("companion-1", true)],
        annualBasicDeductionUsed: 0,
        priorReductionUsage: [],
      } as never,
      rates,
    );

    const primary = r.properties.find((p) => p.propertyId === "primary")!;
    const companion = r.properties.find((p) => p.propertyId === "companion-1")!;

    // 자산-수준 값이 아니라 **자산별**로 판정됨을 고정 — 한쪽만 수용인 실무 케이스
    expect(primary.transferGain).toBe(594_000_000); // 특례 미적용
    expect(companion.transferGain).toBe(327_333_334); // 특례 적용
  });

  it("🟢 다자산 결과에 특례 **산출근거가 노출된다** (표시 갭 해소 — R1-a)", () => {
    // 종전에는 `PerPropertyBreakdown`에 `expropriationValuationDetail`이 없어
    // "세액은 맞는데 왜 취득가액이 커졌는지 확인할 수 없는" 상태였다(이 테스트가 그 갭을 고정했다).
    //
    // 정정: `TransferValuationDetailSource` 계약 + `pickValuationDetails()`(transfer-tax-aggregate.ts)가
    // 평가·판정 상세 11종을 자산별 breakdown으로 옮기고, `ValuationDetailCards`가 렌더한다.
    // 계산은 처음부터 정상이었으므로 **세액 anchor는 그대로 유지**된다.
    const r = calculateTransferTaxAggregate(
      {
        taxYear: 2020,
        properties: [landItem("primary", true)],
        annualBasicDeductionUsed: 0,
        priorReductionUsage: [],
      } as never,
      rates,
    );
    const p = r.properties[0] as unknown as Record<string, unknown>;
    expect(p.transferGain).toBe(327_333_334); // 세액 — 무변경
    expect(p.expropriationValuationDetail, "§164⑨ min[] 산출근거가 자산별로 실린다").toBeDefined();
  });
});
