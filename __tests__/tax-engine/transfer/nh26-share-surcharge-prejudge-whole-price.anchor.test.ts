/**
 * NH-26 — 지분 양도에서 STEP 0.45(감면주택 중과 배제 선판정, 소득세법 시행령 §167의3①5호)가 고가(고급)주택 판정에
 * 물건 전체 가액(`totalPropertyTransferPrice`)을 받지 않아, 본판정(STEP 4.6)은 고가주택으로 감면을 배제하는데
 * 선판정은 지분 가액으로 「고가 아님」 → 중과만 배제되던 결함.
 *
 * 기대값: 감면이 불성립(고가)이면 중과 배제도 없다 → 같은 사실에서 감면을 선택하지 않은 대조와 총세액이 같다.
 * 리뷰 실측(수정 전 과소): §99 135,795,000 · 12.6억 145,288,000 · §99의3 113,025,000.
 * 2022.5.10.~2026.5.9. 양도는 소득세법 시행령 §167의3①12의2호(중과 유예)라 차이가 없다(짝).
 */
import { describe, expect, it } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { buildSurchargeJudgmentPayload } from "@/app/api/calc/multi-house-surcharge-judgment/surcharge-judgment-payload";
import { baseTransferInput, makeHouseInfo, makeMockRatesWithHouseEngine } from "../_helpers/mock-rates";

const rates = makeMockRatesWithHouseEngine();
const D = (v: string) => new Date(v);

const red99 = () => [
  {
    type: "new_99",
    contractDate99: D("1998-06-01"),
    acquisitionType99: "from_builder",
    isNationalHousing99: false,
    standardPriceAtAcquisition99: 100_000_000,
    standardPriceAt5Years99: 160_000_000,
    standardPriceAtTransfer99: 250_000_000,
    exclusiveAreaSqm99: 170,
  },
];
const red993 = () => [
  {
    type: "new_99_3",
    contractDate993: D("2003-01-15"),
    acquisitionType993: "from_builder",
    region993: "outside_speculation",
    standardPriceAtAcquisition993: 100_000_000,
    standardPriceAt5Years: 160_000_000,
    standardPriceAtTransfer993: 250_000_000,
    exclusiveAreaSqm993: 84,
  },
];

function mk(acq: string, transferDate: string, over: Record<string, unknown>) {
  return baseTransferInput({
    acquisitionDate: D(acq),
    transferDate: D(transferDate),
    householdHousingCount: 3,
    isRegulatedArea: true,
    houses: [makeHouseInfo("h1", { acquisitionDate: D(acq), regionCode: "11680" }), makeHouseInfo("h2"), makeHouseInfo("h3")],
    sellingHouseId: "h1",
    ...over,
  } as never);
}

function totalTax(input: unknown): number {
  return (calculateTransferTax(input as never, rates) as { totalTax: number }).totalTax;
}

function pair(acq: string, transferDate: string, share: Record<string, unknown>, reductions: unknown[]) {
  return {
    withReduction: totalTax(mk(acq, transferDate, { ...share, reductions })),
    control: totalTax(mk(acq, transferDate, { ...share, reductions: [] })),
  };
}

const S1 = { transferPrice: 450_000_000, acquisitionPrice: 150_000_000, totalPropertyTransferPrice: 900_000_000 };
const S2 = { transferPrice: 420_000_000, acquisitionPrice: 100_000_000, totalPropertyTransferPrice: 1_260_000_000 };
const S3 = { transferPrice: 400_000_000, acquisitionPrice: 150_000_000, totalPropertyTransferPrice: 800_000_000 };

describe("NH-26 지분 양도 STEP 0.45 — 고가(고급)주택 판정은 물건 전체 가액", () => {
  it("S1 §99 지분 50%·물건 9억·170㎡(1998 계약 고급주택): 감면 배제 + 중과 유지 = 감면 미선택 대조", () => {
    const { withReduction, control } = pair("1999-01-01", "2021-08-01", S1, red99());
    expect(withReduction).toBe(control);
  });

  it("S2 §99 지분 1/3·물건 12.6억(지분 4.2억): 감면 미선택 대조와 같다", () => {
    const { withReduction, control } = pair("1999-01-01", "2021-08-01", S2, red99());
    expect(withReduction).toBe(control);
  });

  it("S3 §99의3 지분 50%·물건 8억·2003 계약(양도 2021 당시 9억 이하 → 적격): 감면 + 중과 배제가 함께 적용된다", () => {
    const { withReduction, control } = pair("2003-09-01", "2021-08-01", S3, red993());
    expect(withReduction).toBeLessThan(control);
  });

  it("S3′ §99의3 지분 50%·물건 13.5억(2024 양도 12억 초과 → 고가): 감면 미선택 대조와 같다", () => {
    const share = { transferPrice: 675_000_000, acquisitionPrice: 150_000_000, totalPropertyTransferPrice: 1_350_000_000 };
    const { withReduction, control } = pair("2003-09-01", "2024-08-01", share, red993());
    expect(withReduction).toBe(control);
  });

  it("짝 — 단독 100% 9억·§99: 감면 미선택 대조와 같다(수정 전에도 같음)", () => {
    const { withReduction, control } = pair("1999-01-01", "2021-08-01", { transferPrice: 900_000_000, acquisitionPrice: 300_000_000 }, red99());
    expect(withReduction).toBe(control);
  });

  it("다주택 중과 판정 메뉴 payload도 같은 선판정 인자 — S1 지분은 중과 배제 대상이 아니다", () => {
    const parsed = parseRatesFromMap(rates);
    const withRed = buildSurchargeJudgmentPayload(mk("1999-01-01", "2021-08-01", { ...S1, reductions: red99() }), parsed, D("2021-08-01"), {} as never);
    const control = buildSurchargeJudgmentPayload(mk("1999-01-01", "2021-08-01", { ...S1, reductions: [] }), parsed, D("2021-08-01"), {} as never);
    expect(JSON.stringify(withRed)).toBe(JSON.stringify(control));
  });
});
