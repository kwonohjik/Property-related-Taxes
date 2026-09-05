/**
 * anchor: §97의3⑤ 안분 기준시가 override의 배관 ④⑫ (Q10).
 *
 * ⑫(Zod)에 키가 없으면 **조용히 stripping**되고 엔진에 도달하지 않는다 — 타입이 잡지 못하는
 * 축이라 여기서 고정한다. ⑭(route mapper)는 `...r` 스프레드라 자동 통과한다
 * (`app/api/calc/transfer/route-reductions-mapper.ts:48`).
 */
import { describe, it, expect } from "vitest";
import { toEngineReductions } from "@/lib/calc/transfer-tax-api-reductions";
import { reductionSchema } from "@/lib/api/transfer-tax-schema-reductions";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

function form(over: Record<string, unknown> = {}): AssetReductionForm {
  return {
    type: "rental_97_3",
    registrationDate: "2015-03-02",
    rentalStartDate: "2016-01-05",
    isTaxRegistered: true,
    rentIncreaseViolationMode: "",
    rentHistory: [],
    hasVacancyOverGrace: false,
    rentalContinuesToTransfer: true,
    stdPriceAtRentalEnd: "",
    stdPriceAtAcquisition: "",
    stdPriceAtTransfer: "",
    vacancyPeriods: [],
    rentalHousingType: "long_term_private",
    region: "capital",
    officialPriceAtStart: "400,000,000",
    isNationalHousingScale: true,
    isConvertedFromShortTerm: false,
    isPrivateConstructionRental: false,
    ...over,
  } as AssetReductionForm;
}

function convert(over: Record<string, unknown> = {}) {
  return toEngineReductions([form(over)], "purchase")[0] as Record<string, unknown>;
}

describe("§97의3⑤ 안분 기준시가 override — ④⑫ 배관", () => {
  it("④ 입력이 있으면 숫자로 싣는다", () => {
    const out = convert({ stdPriceAtAcquisition: "400,000,000", stdPriceAtTransfer: "800,000,000" });
    expect(out.stdPriceAtAcquisition).toBe(400_000_000);
    expect(out.stdPriceAtTransfer).toBe(800_000_000);
  });

  it("🔑 ④ 비었으면 키 자체를 싣지 않는다 — 0을 보내면 라우터의 ctx 폴백이 죽는다", () => {
    const out = convert();
    expect("stdPriceAtAcquisition" in out).toBe(false);
    expect("stdPriceAtTransfer" in out).toBe(false);
  });

  it("🔑 ⑫ Zod가 두 키를 통과시킨다 (미등재면 침묵 stripping)", () => {
    const parsed = reductionSchema.parse({
      type: "rental_97_3",
      registrationDate: "2015-03-02",
      rentalStartDate: "2016-01-05",
      isTaxRegistered: true,
      rentalContinuesToTransfer: true,
      officialPriceAtStart: 400_000_000,
      isNationalHousingScale: true,
      region: "capital",
      rentalHousingType: "long_term_private",
      isConvertedFromShortTerm: false,
      isPrivateConstructionRental: false,
      stdPriceAtAcquisition: 400_000_000,
      stdPriceAtTransfer: 800_000_000,
    }) as Record<string, unknown>;
    expect(parsed.stdPriceAtAcquisition).toBe(400_000_000);
    expect(parsed.stdPriceAtTransfer).toBe(800_000_000);
  });
});
