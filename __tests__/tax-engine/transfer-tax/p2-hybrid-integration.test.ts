// P2 — §98의7·§99의2 하이브리드 풀 파이프라인 통합 anchor (CH-1~CH-4)
//
// - CH-1: §99의2 5년 내 — STEP 8 세액감면 100% + STEP 8.7 농특세 20% + 결정세액 0
// - CH-2: §98의7 5년 후 — STEP 4.6 차감 + 2-pass 농특세 (§55 mock 누진세율 원단위)
// - CH-3/CH-4: tax_amount 모드 중과 배제 (eligibleId 경로 — 소령 §167의3①5호)
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import {
  makeMockRates,
  makeMockRatesWithHouseEngine,
  baseTransferInput,
  makeHouseInfo,
} from "../_helpers/mock-rates";

/** §99의2 적격 reduction (new_or_unsold) */
const UNSOLD_992_REDUCTION = {
  type: "unsold_99_2" as const,
  houseType992: "new_or_unsold" as const,
  contractDate992: new Date("2013-06-01"),
  acquisitionPrice992: 550_000_000,
  exclusiveAreaSqm992: 84.5,
  meetsHouseTypeRequirement992: true,
  isNotRecontract992: true,
  hasConfirmationSeal992: true,
  standardPriceAtAcquisition992: 200_000_000,
  standardPriceAt5Years992: 300_000_000,
  standardPriceAtTransfer992: 400_000_000,
};

/** §98의7 적격 reduction */
const UNSOLD_987_REDUCTION = {
  type: "unsold_98_7" as const,
  contractDate987: new Date("2012-10-15"),
  acquisitionPrice987: 550_000_000,
  isUnsoldAtCutoff987: true,
  isFirstContract987: true,
  isNotOccupiedAtContract987: true,
  isNotRecontract987: true,
  standardPriceAtAcquisition987: 200_000_000,
  standardPriceAt5Years987: 300_000_000,
  standardPriceAtTransfer987: 400_000_000,
};

describe("P2 하이브리드 통합 anchor", () => {
  it("CH-1: §99의2 5년 내 — 감면 86,270,000·결정세액 0·농특세 17,254,000·총 17,254,000", () => {
    const rates = makeMockRates();
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2013-06-15"),
        transferDate: new Date("2017-06-01"), // 취득 후 3년 11개월 — 5년 내
        householdHousingCount: 2,
        reductions: [UNSOLD_992_REDUCTION],
      }),
      rates,
    );
    // 차익 300M − 표1 LTHD 3년 6% 18M = 282M (STEP 4.6 차감 없음 — tax_amount 모드)
    expect(r.taxableGain).toBe(300_000_000);
    expect(r.longTermHoldingDeduction).toBe(18_000_000);
    expect(r.taxBase).toBe(279_500_000);
    // §55 mock: 279.5M × 38% − 19,940,000 = 86,270,000
    expect(r.calculatedTax).toBe(86_270_000);
    // STEP 8: 100% 세액감면
    expect(r.reductionAmount).toBe(86_270_000);
    expect(r.reductionTypeApplied).toBe("unsold_99_2");
    expect(r.determinedTax).toBe(0);
    // STEP 8.7: 농특세 = 감면세액 × 20%
    expect(r.unsold992Detail?.isEligible).toBe(true);
    expect(r.unsold992Detail?.effectCategory).toBe("tax_amount");
    expect(r.unsold992Detail?.reductionAmount).toBe(86_270_000);
    expect(r.unsold992Detail?.ruralSurtax).toBe(17_254_000);
    expect(r.steps.some((s) => s.label.includes("§99의2 농어촌특별세"))).toBe(true);
    // STEP 4.6 안내 step — 세액감면 경로
    expect(r.steps.some((s) => s.label.includes("세액감면 경로"))).toBe(true);
    expect(r.localIncomeTax).toBe(0);
    expect(r.totalTax).toBe(17_254_000);
  });

  it("CH-2: §98의7 5년 후 — 차감 123,000,000·산출 26,735,000·농특세 9,171,000·총 38,579,500", () => {
    const rates = makeMockRates();
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2013-01-15"),
        transferDate: new Date("2022-08-01"), // 9년 6개월 — 5년 후
        householdHousingCount: 2,
        reductions: [UNSOLD_987_REDUCTION],
      }),
      rates,
    );
    // 차익 300M − 표1 LTHD 9년 18% 54M = 246M → §98의7 안분 0.5 × 100% = 123M 차감
    expect(r.longTermHoldingDeduction).toBe(54_000_000);
    expect(r.unsold987Detail?.isEligible).toBe(true);
    expect(r.unsold987Detail?.effectCategory).toBe("income_deduction");
    expect(r.unsold987Detail?.reducibleTransferIncome).toBe(123_000_000);
    // 과세표준 123M − 2.5M = 120.5M → 35% − 15,440,000 = 26,735,000
    expect(r.taxBase).toBe(120_500_000);
    expect(r.calculatedTax).toBe(26_735_000);
    // 2-pass 농특세: 감면 전 (243.5M × 38% − 19.94M = 72,590,000) − 26,735,000 = 45,855,000 × 20%
    expect(r.unsold987Detail?.taxReductionForRuralSurtax).toBe(45_855_000);
    expect(r.unsold987Detail?.ruralSurtax).toBe(9_171_000);
    // 총 = 26,735,000 + 지방소득세 2,673,500 + 농특세 9,171,000
    expect(r.localIncomeTax).toBe(2_673_500);
    expect(r.totalTax).toBe(38_579_500);
  });

  function surchargeScenarioInput(
    reductions: NonNullable<Parameters<typeof calculateTransferTax>[0]["reductions"]>,
  ) {
    // 3주택 + 조정지역(강남 11680, 2017.8.3 지정) — 양도 주택 h1이 §99의2 감면주택.
    // 취득 2017-09-01 (2013 계약 후 준공 지연 취득) → 2022-08-01 양도 = 5년 내 (tax_amount 모드)
    return baseTransferInput({
      transferPrice: 800_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: new Date("2017-09-01"),
      transferDate: new Date("2022-08-01"),
      householdHousingCount: 3,
      isRegulatedArea: true,
      houses: [
        makeHouseInfo("h1", { acquisitionDate: new Date("2017-09-01"), regionCode: "11680" }),
        makeHouseInfo("h2"),
        makeHouseInfo("h3"),
      ],
      sellingHouseId: "h1",
      reductions,
    });
  }

  it("CH-3: 3주택·조정지역 + §99의2 5년 내 적격 → 중과 미적용 (tax_amount 모드 eligibleId 배제)", () => {
    const rates = makeMockRatesWithHouseEngine();
    const r = calculateTransferTax(surchargeScenarioInput([UNSOLD_992_REDUCTION]), rates);
    expect(r.unsold992Detail?.isEligible).toBe(true);
    expect(r.unsold992Detail?.effectCategory).toBe("tax_amount");
    expect(r.steps.some((s) => s.label === "감면주택 다주택 중과 배제")).toBe(true);
    expect(r.surchargeRate ?? 0).toBe(0);
  });

  it("CH-4: 동일 입력 + 확인날인 미보유(불적격) → 중과 +30% 정상 적용", () => {
    const rates = makeMockRatesWithHouseEngine();
    const r = calculateTransferTax(
      surchargeScenarioInput([{ ...UNSOLD_992_REDUCTION, hasConfirmationSeal992: false }]),
      rates,
    );
    expect(r.unsold992Detail?.isEligible).toBe(false);
    expect(r.steps.some((s) => s.label === "감면주택 다주택 중과 배제")).toBe(false);
    expect(r.surchargeRate).toBe(0.3);
  });
});

// ─────────────────────────────────────────────────────────────────
// PR-3 D-3 — 3단계 상세명세 Frac 산식용 3시점 기준시가 echo 배선 anchor
//
// ⚠️ 빌더 단위 테스트는 source를 fixture로 주입하므로 **엔진의 echo 주입을 지키지 못한다**
//    (PR-1에서 같은 사각지대를 mutation으로 확인했다). 엔진 단계에서 별도로 고정한다.
// ─────────────────────────────────────────────────────────────────
describe("§99의2 — 3단계 산식용 기준시가 echo (D-3)", () => {
  it("5년 후 안분 경로에서 3시점 기준시가가 detail에 echo된다", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 141_750_000,
        acquisitionPrice: 127_000_000,
        acquisitionDate: new Date("2013-10-23"),
        transferDate: new Date("2026-06-01"),
        householdHousingCount: 2,
        reductions: [{
          ...UNSOLD_992_REDUCTION,
          contractDate992: new Date("2013-10-23"),
          acquisitionPrice992: 127_000_000,
          exclusiveAreaSqm992: 74.03,
          standardPriceAtAcquisition992: 121_191_049,
          standardPriceAt5Years992: 112_969_780,
          standardPriceAtTransfer992: 126_887_420,
        }],
      }),
      makeMockRates(),
    );
    const d = r.unsold992Detail;
    expect(d?.isEligible).toBe(true);
    expect(d?.effectCategory).toBe("income_deduction");
    // 제보 케이스: 5년시점 < 취득시 → neg_pos → 감면 0
    expect(d?.signCase).toBe("neg_pos");
    expect(d?.reducibleTransferIncome).toBe(0);
    // echo — 감면이 0이어도 산식에 값을 보이려면 반드시 있어야 한다
    expect(d?.standardPriceAtAcquisition).toBe(121_191_049);
    expect(d?.standardPriceAt5Years).toBe(112_969_780);
    expect(d?.standardPriceAtTransfer).toBe(126_887_420);
    expect(d?.transferIncomeApplied).toBe(11_210_000);
  });

  it("🔴 5년 내 세액감면 경로는 안분이 없어 기준시가 echo도 없다 (구별력)", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2013-06-15"),
        transferDate: new Date("2017-06-01"),
        householdHousingCount: 2,
        reductions: [UNSOLD_992_REDUCTION],
      }),
      makeMockRates(),
    );
    expect(r.unsold992Detail?.effectCategory).toBe("tax_amount");
    expect(r.unsold992Detail?.standardPriceAt5Years).toBeUndefined();
  });
});
