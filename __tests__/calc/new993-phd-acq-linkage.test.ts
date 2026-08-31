/**
 * §99의3 취득시 기준시가 ↔ PHD 환산 연계 anchor (API ④ + validate ⑧).
 * 계획서: docs/02-design/features/new993-phd-acq-stdprice-linkage.plan.md
 *
 * PHD ON이면 취득시 기준시가 = §164⑤ 환산 자동 산출(수동값 무시), OFF면 수동값.
 * validate는 PHD ON 시 환산 입력 충분성으로 검증(수동 필드 대신).
 */
import { describe, it, expect } from "vitest";
import { toEngineReductions } from "@/lib/calc/transfer-tax-api-reductions";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-store";

type New993 = Extract<AssetReductionForm, { type: "new_99_3" }>;

function makeNew993(over: Partial<New993> = {}): New993 {
  return {
    type: "new_99_3",
    standardPriceAt5Years: "550000000",
    standardPriceAtAcquisition993: "300000000",
    standardPriceAtTransfer993: "",
  isRecontractExcluded993: false,
  recontractUnavoidableCause993: false,
  isRedevelopedNewHouse993: false,
  previousHouseStdPrice993: "",
    exclusiveAreaSqm993: "84.96",
    region993: "outside_speculation",
    acquisitionType993: "from_builder",
    isResident993: true,
    isHousingConstructionBusiness993: false,
    ...over,
  };
}

// canCalcReductionPhd 충족 PHD 입력 (firstDisclosurePrice·면적·취득/최초 토지단가 > 0)
const PHD_INPUTS: Partial<New993> = {
  phdMode993: true,
  phdFirstDisclosurePrice993: "500000000",
  phdLandAreaSqm993: "100",
  phdLandPricePerSqmAtAcq993: "1000000",
  phdLandPricePerSqmAtFirst993: "1200000",
};

describe("API ④ — 취득시 기준시가 source ternary", () => {
  it("PHD ON + 환산 입력 충분 → standardPriceAtAcquisition993 = §164⑤ 환산값(수동값 무시)", () => {
    const out = toEngineReductions([makeNew993(PHD_INPUTS)], "purchase") as Array<{
      type: string;
      standardPriceAtAcquisition993?: number;
    }>;
    const r = out.find((x) => x.type === "new_99_3")!;
    // 500,000,000 × (1,000,000×100) / (1,200,000×100) = floor(500M × 100M/120M) = 416,666,666
    expect(r.standardPriceAtAcquisition993).toBe(416_666_666);
    // 수동값 300,000,000이 아님
    expect(r.standardPriceAtAcquisition993).not.toBe(300_000_000);
  });

  it("PHD OFF → 수동 standardPriceAtAcquisition993 그대로", () => {
    const out = toEngineReductions([makeNew993({ phdMode993: false })], "purchase") as Array<{
      type: string;
      standardPriceAtAcquisition993?: number;
    }>;
    const r = out.find((x) => x.type === "new_99_3")!;
    expect(r.standardPriceAtAcquisition993).toBe(300_000_000);
  });

  it("PHD ON이나 환산 입력 부족 → 수동값 fallback(0)", () => {
    const out = toEngineReductions(
      [makeNew993({ phdMode993: true, standardPriceAtAcquisition993: "0" })],
      "purchase",
    ) as Array<{ type: string; standardPriceAtAcquisition993?: number }>;
    const r = out.find((x) => x.type === "new_99_3")!;
    expect(r.standardPriceAtAcquisition993).toBe(0);
  });
});
