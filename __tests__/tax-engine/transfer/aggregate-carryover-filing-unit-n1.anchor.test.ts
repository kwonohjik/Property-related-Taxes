/**
 * anchor: §97의2②3호 비교는 **신고단위 결정세액**으로 한다 (N-1)
 *
 * 계획서: `docs/00-pm/transfer-n1-carryover-filing-unit.plan.md`
 *
 * ## 무엇이 어긋나 있었나
 *
 * ②3호는 「제1항을 적용하여 계산한 **양도소득 결정세액**이 … 적은 경우」라고 정하는데,
 * 「양도소득 결정세액」은 **§92③2호가 정의한 용어**이고 그 산출세액은 §92②3호의 과세표준
 * (= **§103 기본공제**를 뺀 값)에 세율을 적용한 것이다. 기본공제는 **인별·과세기간 단위**라
 * 「자산 1건의 결정세액」은 조문 체계상 성립하지 않는다.
 *
 * 종전 엔진은 **그 자산만 떼어낸** 세액으로 A/B를 비교했다. 자산이 1건이면 그 값이 곧 신고 전체의
 * 결정세액이라 옳지만, 여러 건이면 틀린다 — **A/B 전환이 세율군 자체를 바꾸기 때문이다**
 * (A = 증여자 취득일 기산 → `progressive` / B = 증여 등기접수일 기산 → `short_term`).
 * A에서는 그 차익이 다른 자산과 **같은 누진 군에 합산**되어 전체 누진을 밀어올리는데,
 * B에서는 별도 군으로 빠져 합산이 없다. **단건 비교는 그 합산을 구조적으로 볼 수 없다.**
 *
 * ## 실측 (계획서 §1.1 · 300 격자 · mock 세율)
 *
 * 격자 300 중 **7건**이 뒤집혔고 **전부 종전이 과소**였다. 아래 anchor는 그중 3건 +
 * 「자산 1건이면 움직이지 않는다」 3건을 못으로 박는다.
 *
 * | 케이스 | 종전(자산별) | 현행(신고단위) | 차 |
 * |---|---|---|---|
 * | 장기이익 컴패니언 | 366,810,000 | **378,810,000** | +12,000,000 |
 * | 차손 컴패니언 | **0** | **5,865,000** | +5,865,000 (세액 0 → 발생) |
 * | 비사업용 컴패니언 | 166,810,000 | **187,710,000** | +20,900,000 |
 *
 * 🔑 세 케이스 모두 **단건 비교로는 A < B라 B(배제)를 택했는데**, 신고 전체로는 A가 더 크다.
 *    그래서 ②3호의 「적은 경우」에 해당하지 않아 **이월과세를 적용**하는 것이 맞다.
 *
 * ⚠️ **컴패니언이 단기뿐인 조합에서는 divergence가 0이다** — 합산 상대가 없기 때문이다.
 *    이 anchor가 장기·차손·비사업용을 고른 것은 그래서다.
 */
import { describe, it, expect } from "vitest";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const D = (s: string) => new Date(s);

/** 증여자 취득일 — 양도일까지 16년(장기 · `progressive`) */
const DONOR_ACQ = D("2010-01-01");
/** 증여 등기접수일 — 양도일까지 9개월(1년 미만 · `short_term`) */
const GIFT_REG = D("2025-09-01");
const TRANSFER_DATE = D("2026-06-01");

function land(id: string, o: Partial<TransferTaxItemInput> = {}): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    propertyType: "land",
    transferDate: TRANSFER_DATE,
    acquisitionDate: GIFT_REG,
    acquisitionPrice: 0,
    transferPrice: 1_000_000_000,
    expenses: 0,
    isOneHousehold: false,
    householdHousingCount: 0,
    isRegulatedArea: false,
    isNonBusinessLand: false,
    ...o,
  };
}

function carryover(
  donorAcquisitionPrice: number,
  giftDateValuation: number,
  giftTaxAmount = 0,
  over: Partial<NonNullable<TransferTaxItemInput["carryoverTaxation"]>> = {},
): TransferTaxItemInput {
  return land("co", {
    acquisitionCause: "carryover_gift",
    carryoverTaxation: {
      giftRegistryDate: GIFT_REG,
      donorAcquisitionDate: DONOR_ACQ,
      donorAcquisitionPrice,
      useEstimatedAcquisition: false,
      giftTaxAmount,
      giftDateValuation,
      ...over,
    },
  });
}

/** 장기 보유 이익 자산 — co가 A를 채택하면 **같은 누진 군에 합산**된다 */
const LONG_GAIN = land("c1", {
  acquisitionDate: D("2012-03-01"),
  acquisitionPrice: 500_000_000,
  transferPrice: 1_000_000_000,
});
/** 차손 자산 — §102② 통산이 얹힌다 */
const LOSS = land("c2", {
  acquisitionDate: D("2012-03-01"),
  acquisitionPrice: 800_000_000,
  transferPrice: 500_000_000,
});
/** 비사업용 토지 — 중과 세율군 */
const NBL = land("c4", {
  acquisitionDate: D("2012-03-01"),
  acquisitionPrice: 500_000_000,
  transferPrice: 1_000_000_000,
  isNonBusinessLand: true,
});

function run(properties: TransferTaxItemInput[]) {
  const input: AggregateTransferInput = {
    taxYear: 2026,
    annualBasicDeductionUsed: 0,
    properties,
  } as AggregateTransferInput;
  const result = calculateTransferTaxAggregate(input, mockRates);
  const co = result.properties.find((p) => p.propertyId === "co");
  return { result, detail: co?.carryoverTaxationDetail };
}

describe("N-1 · §97의2②3호 신고단위 비교 (다자산)", () => {
  it("N1-01: 장기이익 컴패니언 — 단건은 A<B인데 신고단위는 A가 크다 ⇒ 이월과세 적용", () => {
    const { result, detail } = run([carryover(100_000_000, 500_000_000), LONG_GAIN]);

    // 단건 비교라면 B였다 — 그 사실 자체를 못으로 박는다(전환 방향의 증거).
    expect(detail!.scenarioA.determinedTax).toBe(228_660_000);
    expect(detail!.scenarioB.determinedTax).toBe(250_000_000);
    expect(detail!.scenarioA.determinedTax).toBeLessThan(detail!.scenarioB.determinedTax);

    // 신고단위로는 A가 크므로 「적은 경우」가 아니다 ⇒ 적용 유지
    expect(detail!.adoptedScenario).toBe("A");
    expect(detail!.comparisonExclusion).toBe(false);
    expect(result.determinedTax).toBe(378_810_000); // 종전 366,810,000
  });

  it("N1-02: 차손 컴패니언 — 세액 0 → 5,865,000 (경계가 움직인다)", () => {
    const { result, detail } = run([carryover(500_000_000, 700_000_000), LOSS]);
    expect(detail!.adoptedScenario).toBe("A");
    expect(result.determinedTax).toBe(5_865_000); // 종전 0
  });

  it("N1-03: 비사업용 컴패니언 + 증여세 상당액 — 166,810,000 → 187,710,000", () => {
    const { result, detail } = run([carryover(700_000_000, 900_000_000, 50_000_000), NBL]);
    expect(detail!.adoptedScenario).toBe("A");
    expect(result.determinedTax).toBe(187_710_000); // 종전 166,810,000
  });

  it("N1-04: 비교 실적은 **신고 전체 결정세액 두 값**으로 노출된다", () => {
    const { result, detail } = run([carryover(100_000_000, 500_000_000), LONG_GAIN]);
    const cmp = detail!.filingUnitComparison!;
    // 적용 = 실제 채택된 결과와 같다
    expect(cmp.determinedTaxWithCarryover).toBe(result.determinedTax);
    expect(cmp.determinedTaxWithCarryover).toBe(378_810_000);
    // 미적용 = 종전 자산별 판정이 내던 값
    expect(cmp.determinedTaxWithout).toBe(366_810_000);
    // 단건 두 값과 **다르다** — 이것이 이 필드가 필요한 이유다
    expect(cmp.determinedTaxWithCarryover).not.toBe(detail!.scenarioA.determinedTax);
  });

  it.each([
    [100_000_000, 500_000_000, 248_750_000, "B"],
    [700_000_000, 900_000_000, 58_910_000, "A"],
    [500_000_000, 700_000_000, 148_750_000, "B"],
  ])(
    "N1-05: 자산 1건이면 스코프가 결과를 바꾸지 않는다 (증여자취득가 %s)",
    (dap, gdv, expectedTax, expectedScenario) => {
      const { result, detail } = run([carryover(dap as number, gdv as number)]);
      expect(detail!.adoptedScenario).toBe(expectedScenario);
      expect(result.determinedTax).toBe(expectedTax);
    },
  );

  it("N1-06: ②1호(수용) 배제는 ②3호보다 **앞선다** — 비교 대상에서 빠진다", () => {
    const { detail } = run([
      carryover(100_000_000, 500_000_000, 0, {
        exclusionDeclared: { expropriationWithin2Years: true },
      }),
      LONG_GAIN,
    ]);
    expect(detail!.isEligible).toBe(false);
    expect(detail!.exclusionReason).toBe("expropriation");
    expect(detail!.adoptedScenario).toBe("B");
    // 앞선 배제 자산은 신고단위 비교를 **하지 않는다**
    expect(detail!.filingUnitComparison).toBeUndefined();
  });
});
