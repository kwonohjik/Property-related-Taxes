// 차감형 라우터(§99의3·§99·§98의8) 풀 파이프라인 통합 anchor (C-A·C-3·C-4·C-5)
//
// - C-A: §98의8 차감 + 농특세 2-pass — §55 mock 누진세율 직접 계산 원단위
// - C-3/C-4: 모드 1 중과 배제 (소령 §167의3①5호) — 적격 시 미적용 / 불적격 시 적용
// - C-5: §99의3도 동일 자동 배제 (D-11 정정 검증)
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import {
  makeMockRates,
  makeMockRatesWithHouseEngine,
  baseTransferInput,
  makeHouseInfo,
} from "../_helpers/mock-rates";

/** §98의8 적격 reduction (anchor A-1 동형 입력) */
const UNSOLD_988_REDUCTION = {
  type: "unsold_98_8" as const,
  contractDate988: new Date("2015-06-01"),
  acquisitionPrice988: 550_000_000,
  exclusiveAreaSqm988: 84.5,
  rentalContractDate988: new Date("2015-12-01"),
  rentalStartDate988: new Date("2016-01-01"),
  isUnsoldAfterCompletion988: true,
  isFirstContract988: true,
  isNotRecontract988: true,
  standardPriceAtAcquisition988: 200_000_000,
  standardPriceAt5Years988: 300_000_000,
  standardPriceAtTransfer988: 400_000_000,
};

describe("차감형 라우터 통합 anchor", () => {
  it("C-A: §98의8 — 차감 64,500,000·산출세액 52,640,000·농특세 4,902,000·총 62,806,000", () => {
    const rates = makeMockRates();
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2015-07-01"),
        transferDate: new Date("2022-08-01"),
        householdHousingCount: 2, // 비과세 배제 (2주택)
        reductions: [UNSOLD_988_REDUCTION],
      }),
      rates,
    );
    // 차익 300M − 표1 LTHD 7년 14% 42M = 양도소득 258M
    expect(r.taxableGain).toBe(300_000_000);
    expect(r.longTermHoldingDeduction).toBe(42_000_000);
    // §98의8: 안분 0.5 → 129M × 50% = 64.5M 차감 → 193.5M
    expect(r.unsold988Detail?.isEligible).toBe(true);
    expect(r.unsold988Detail?.reducibleTransferIncome).toBe(64_500_000);
    expect(r.steps.some((s) => s.label.includes("§98의8") && s.label.includes("차감"))).toBe(true);
    // 과세표준 191M → §55 mock: 191M × 38% − 19,940,000 = 52,640,000
    expect(r.taxBase).toBe(191_000_000);
    expect(r.calculatedTax).toBe(52_640_000);
    // 농특세 2-pass: 감면 전 (255.5M × 38% − 19.94M = 77,150,000) − 52,640,000 = 24,510,000 × 20%
    expect(r.unsold988Detail?.taxReductionForRuralSurtax).toBe(24_510_000);
    expect(r.unsold988Detail?.ruralSurtax).toBe(4_902_000);
    // 총 = 52,640,000 + 지방소득세 5,264,000 + 농특세 4,902,000
    expect(r.localIncomeTax).toBe(5_264_000);
    expect(r.totalTax).toBe(62_806_000);
  });

  it("C-A 대조군: reductions=[] → 차감·농특세 없음 (산출세액 77,150,000)", () => {
    const rates = makeMockRates();
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2015-07-01"),
        transferDate: new Date("2022-08-01"),
        householdHousingCount: 2,
        reductions: [],
      }),
      rates,
    );
    expect(r.unsold988Detail).toBeUndefined();
    expect(r.calculatedTax).toBe(77_150_000);
  });

  function surchargeScenarioInput(reductions: NonNullable<Parameters<typeof calculateTransferTax>[0]["reductions"]>) {
    // 3주택 + 조정지역(강남 11680) — 양도 주택 h1이 §98의8 감면주택
    return baseTransferInput({
      transferPrice: 800_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: new Date("2015-07-01"),
      transferDate: new Date("2022-08-01"),
      householdHousingCount: 3,
      isRegulatedArea: true,
      houses: [
        makeHouseInfo("h1", { acquisitionDate: new Date("2015-07-01"), regionCode: "11680" }),
        makeHouseInfo("h2"),
        makeHouseInfo("h3"),
      ],
      sellingHouseId: "h1",
      reductions,
    });
  }

  it("C-3: 3주택·조정지역 + §98의8 적격 → 중과 미적용 (소령 §167의3①5호 자동 배제)", () => {
    const rates = makeMockRatesWithHouseEngine();
    const r = calculateTransferTax(surchargeScenarioInput([UNSOLD_988_REDUCTION]), rates);
    expect(r.steps.some((s) => s.label === "감면주택 다주택 중과 배제")).toBe(true);
    expect(r.surchargeRate ?? 0).toBe(0);
    expect(r.unsold988Detail?.isEligible).toBe(true);
  });

  it("C-4: 동일 입력 + 가액 초과(불적격) → 중과 +30% 정상 적용 (배제는 eligible 시만)", () => {
    const rates = makeMockRatesWithHouseEngine();
    const r = calculateTransferTax(
      surchargeScenarioInput([{ ...UNSOLD_988_REDUCTION, acquisitionPrice988: 600_000_001 }]),
      rates,
    );
    expect(r.steps.some((s) => s.label === "감면주택 다주택 중과 배제")).toBe(false);
    expect(r.surchargeRate).toBe(0.3);
    expect(r.unsold988Detail?.isEligible).toBe(false);
  });

  it("C-5: §99의3 적격 + 3주택·조정지역 → 동일 자동 배제 (D-11 정정)", () => {
    const rates = makeMockRatesWithHouseEngine();
    const r = calculateTransferTax(
      surchargeScenarioInput([
        {
          type: "new_99_3" as const,
          contractDate993: "2002-01-01",
          standardPriceAtAcquisition993: 100_000_000,
          standardPriceAt5Years: 160_000_000,
          standardPriceAtTransfer993: 250_000_000,
          region993: "outside_speculation" as const,
          acquisitionType993: "from_builder" as const,
        },
      ]),
      rates,
    );
    expect(r.new993Detail?.isEligible).toBe(true);
    expect(r.steps.some((s) => s.label === "감면주택 다주택 중과 배제")).toBe(true);
    expect(r.surchargeRate ?? 0).toBe(0);
  });

  it("C-2: §99의3 + §98의8 동시 입력 — 첫 매칭(§99의3) 1건만 적용 (§127⑦)", () => {
    const rates = makeMockRates();
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2015-07-01"),
        transferDate: new Date("2022-08-01"),
        householdHousingCount: 2,
        reductions: [
          {
            type: "new_99_3" as const,
            contractDate993: "2002-01-01",
            standardPriceAtAcquisition993: 100_000_000,
            standardPriceAt5Years: 160_000_000,
            standardPriceAtTransfer993: 250_000_000,
            region993: "outside_speculation" as const,
            acquisitionType993: "from_builder" as const,
          },
          UNSOLD_988_REDUCTION,
        ],
      }),
      rates,
    );
    // §99의3가 우선 평가 — §98의8 detail은 미평가(undefined)
    expect(r.new993Detail).toBeDefined();
    expect(r.unsold988Detail).toBeUndefined();
  });
});
