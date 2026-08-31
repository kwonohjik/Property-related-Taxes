/**
 * anchor — §99의3 재개발 변형이 **파이프라인 끝까지** 도달한다 (D3-02 배관)
 *
 * 자매 anchor `new-99-3-redevelopment-variant.anchor.test.ts`는 `evaluateNew993`를 직접 호출해
 * **산식**만 고정한다. 신규 필드 2종(`isRedevelopedNewHouse993`·`previousHouseStdPrice993`)이
 * ④변환 → ⑫Zod → ⑭route → 엔진까지 실제로 흐르는지는 그 anchor가 보지 못한다.
 *
 * 이 저장소에서 ⑫⑬⑭는 TypeScript가 잡지 못해 **침묵 stripping**이 반복됐고, 이번 배치에서만
 * D8-01(결과 조립 5경로)·D3-03(mock 키 부재)·D4-08(진입 키 오인)로 세 번 측정 실패가 났다.
 * ⇒ 진입점 `calculateTransferTax`를 통과시켜 배관을 고정한다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { reductionSchema } from "@/lib/api/transfer-tax-schema-reductions";

const rates = makeMockRates();
const D = (s: string) => new Date(`${s}T00:00:00`);

/** 5년 후 양도 — 변형 유무로 분모가 갈린다 */
function run(variant: boolean) {
  return calculateTransferTax(
    baseTransferInput({
      transferPrice: 550_000_000,
      transferDate: D("2012-06-30"),
      acquisitionPrice: 200_000_000,
      acquisitionDate: D("2003-03-01"),
      isOneHousehold: false,
      householdHousingCount: 2,
      reductions: [
        {
          type: "new_99_3",
          contractDate993: D("2002-01-10"),
          acquisitionType993: "from_builder",
          standardPriceAtAcquisition993: 200_000_000,
          standardPriceAt5Years: 300_000_000,
          standardPriceAtTransfer993: 500_000_000,
          exclusiveAreaSqm993: 84,
          region993: "outside_speculation",
          isResident993: true,
          isHousingConstructionBusiness993: false,
          ...(variant
            ? {
                isRedevelopedNewHouse993: true,
                previousHouseStdPrice993: 100_000_000,
              }
            : {}),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any),
    rates,
  );
}

describe("§99의3 재개발 변형 배관", () => {
  it("변형 OFF — 분모가 신축주택 취득시 기준시가다 (기준선)", () => {
    const r = run(false);
    expect(r.new993Detail?.isEligible).toBe(true);
    // (300,000,000 − 200,000,000) / (500,000,000 − 200,000,000) = 1/3
    expect(r.new993Detail?.fiveYearRatio).toBeCloseTo(1 / 3, 10);
  });

  it("🔴 변형 ON — 신규 필드 2종이 엔진에 도달해 분모가 종전주택 기준으로 바뀐다", () => {
    const r = run(true);
    expect(r.new993Detail?.isEligible).toBe(true);
    // 분자 100,000,000 / 분모 (500,000,000 − 100,000,000) = 0.25
    expect(r.new993Detail?.fiveYearRatio, "신규 필드가 배관 어딘가에서 stripping됐다").toBe(0.25);
  });

  it("두 경로의 감면대상 소득금액이 실제로 갈린다 — 구별력 확인", () => {
    const off = run(false).new993Detail?.reducibleTransferIncome ?? 0;
    const on = run(true).new993Detail?.reducibleTransferIncome ?? 0;
    expect(off).toBeGreaterThan(on);
  });
});

describe("⑫ Zod가 신규 필드를 통과시킨다", () => {
  /**
   * ⚠️ 위 파이프라인 anchor는 `calculateTransferTax`로 **진입**하므로 Zod 층 **아래**에서 시작한다.
   *    실측: ⑫에서 두 필드를 지워도 그 anchor는 3/3 통과했다(구별력 0).
   *    ⑫의 침묵 stripping은 스키마를 직접 태워야 잡힌다
   *    (memory `feedback_leaf_anchor_skips_zod_layer`와 같은 층위).
   */
  it("`isRedevelopedNewHouse993`·`previousHouseStdPrice993`이 parse 후에도 살아남는다", () => {
    const parsed = reductionSchema.parse({
      type: "new_99_3",
      acquisitionType993: "from_builder",
      standardPriceAt5Years: 300_000_000,
      standardPriceAtAcquisition993: 200_000_000,
      standardPriceAtTransfer993: 500_000_000,
      exclusiveAreaSqm993: 84,
      region993: "outside_speculation",
      isResident993: true,
      isHousingConstructionBusiness993: false,
      isRedevelopedNewHouse993: true,
      previousHouseStdPrice993: 100_000_000,
    });
    const r = parsed as Record<string, unknown>;
    expect(r.isRedevelopedNewHouse993, "⑫ Zod가 재개발 플래그를 stripping했다").toBe(true);
    expect(r.previousHouseStdPrice993, "⑫ Zod가 종전주택 기준시가를 stripping했다").toBe(100_000_000);
  });
});
