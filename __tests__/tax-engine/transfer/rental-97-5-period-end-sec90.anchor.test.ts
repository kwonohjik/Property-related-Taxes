/**
 * anchor — 조특법 §97의5 코드리뷰(2026-11-01) 1·3·4번 결함 정정
 *
 * ## 1. 10년 계속 임대 판정의 종점 (법 §97의5①2호)
 * 「장기일반민간임대주택등으로 등록 후 10년 이상 계속하여 … 임대한 **후 양도**할 것」.
 * 종전에는 「양도 전 임대 종료」를 선언해도 종점이 양도일이라, 임대 7년·보유 11년 사안이 통과했다.
 *
 * ## 3. 감면세액 = 「소득세법」 §90① A × (B − C) ÷ D × E
 * 종전에는 `산출세액 × 임대기간 분 비율`이었다. 비율 < 1이면 감면 외 소득이 기본공제를 흡수해
 * C = 0인데 D는 기본공제만큼 작으므로 감면이 과소했다 (리뷰 실측 80,130,000 vs 80,560,343).
 *
 * ## 4. 안분이 필요 없는 사안 (조특령 §97의5②)
 * 분자의 감수가 **취득당시** 기준시가라 계속 임대(B = D)면 (D − E) ÷ (D − E) = 1 — 임대개시일과 무관하다.
 * 종전에는 「임대개시 > 취득일」이면 기준시가를 요구해, 미입력·하락(D ≤ E) 사안을 전액 배제했다.
 */
import { describe, it, expect } from "vitest";
import { evaluateRental975 } from "@/lib/tax-engine/transfer-reductions/rental-97-5";
import type { Rental97EvaluationInput, Rental97Result } from "@/lib/tax-engine/transfer-reductions/types";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { calcMixedUseTransferTaxIdN as calcMixedUseIdN } from "@/__tests__/tax-engine/_helpers/mixed-use-identity-std";
import { mixedUseCase14 } from "@/__tests__/tax-engine/_helpers/mixed-use-fixture";
import { reductionSchema } from "@/lib/api/transfer-tax-schema-reductions";
import { mapReductionsToEngine } from "@/app/api/calc/transfer/route-reductions-mapper";
import { toEngineReductions } from "@/lib/calc/transfer-tax-api-reductions";
import { validateStep2Reductions } from "@/lib/calc/transfer-tax-validate-reductions";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

const D = (s: string) => new Date(`${s}T00:00:00`);

/** 취득 2018-06-01 · 등록 2018-08-01 · 임대개시 2018-09-01 · 양도 2029-07-01 (임대개시 > 취득일) */
const BASE: Rental97EvaluationInput = {
  id: "rental_97_5",
  acquisitionDate: D("2018-06-01"),
  registrationDate: D("2018-08-01"),
  rentalStartDate: D("2018-09-01"),
  transferDate: D("2029-07-01"),
  isTaxRegistered: true,
  rentIncreaseViolated: false,
  isNationalHousingScale: true,
  region: "capital",
  officialPriceAtStart: 320_000_000,
  rentalContinuesToTransfer: true,
  calculatedTax: 100_000_000,
};

const codes = (r: Rental97Result) => (r.isEligible ? [] : r.ineligibleReasons.map((x) => x.code));
const ratio = (r: Rental97Result) => (r as unknown as { rentalGainRatio?: number }).rentalGainRatio;
const amount = (r: Rental97Result) => (r as unknown as { reductionAmount?: number }).reductionAmount;

/** 조기 종료 + 안분 3점 (취득 3억 · 종료 4.5억 · 양도 6억 → 비율 0.5) */
const ENDED = {
  rentalContinuesToTransfer: false,
  stdPriceAtAcquisition: 300_000_000,
  stdPriceAtRentalEnd: 450_000_000,
  stdPriceAtTransfer: 600_000_000,
} as const;

describe("1. §97의5①2호 — 10년 판정의 종점은 임대 종료일", () => {
  it("🔴 임대 7년 후 종료 → 보유가 11년이어도 RENTAL_PERIOD_SHORT", () => {
    const r = evaluateRental975({ ...BASE, ...ENDED, rentalEndDate: D("2025-09-01") });
    expect(r.isEligible).toBe(false);
    expect(codes(r)).toContain("RENTAL_PERIOD_SHORT");
  });

  it("임대 10년 이상 후 종료 → 적격, 안분 비율 0.5", () => {
    const r = evaluateRental975({ ...BASE, ...ENDED, rentalEndDate: D("2028-09-01") });
    expect(r.isEligible).toBe(true);
    expect(ratio(r)).toBe(0.5);
  });

  it("🔴 조기 종료인데 종료일 미입력 → 양도일로 대체하지 않는다 (MISSING_RENTAL_END_DATE)", () => {
    const r = evaluateRental975({ ...BASE, ...ENDED });
    expect(codes(r)).toContain("MISSING_RENTAL_END_DATE");
    expect(codes(r)).not.toContain("RENTAL_PERIOD_SHORT");
  });

  it("종료일이 양도일 이후거나 임대개시 전이면 INVALID_RENTAL_END_DATE", () => {
    expect(codes(evaluateRental975({ ...BASE, ...ENDED, rentalEndDate: D("2029-08-01") }))).toContain(
      "INVALID_RENTAL_END_DATE",
    );
    expect(codes(evaluateRental975({ ...BASE, ...ENDED, rentalEndDate: D("2018-08-15") }))).toContain(
      "INVALID_RENTAL_END_DATE",
    );
  });

  it("계속 임대면 종료일을 보지 않는다 — 종점 = 양도일 (기존 사안 회귀 없음)", () => {
    const r = evaluateRental975({ ...BASE, rentalEndDate: D("2020-01-01") });
    expect(r.isEligible).toBe(true);
  });
});

describe("4. §97의5② — 계속 임대면 비율 1 (기준시가 불요)", () => {
  it("🔴 임대개시 > 취득일 + 기준시가 미입력 → 적격, 비율 1 (종전: MISSING_PRORATION_PRICES)", () => {
    const r = evaluateRental975({ ...BASE });
    expect(codes(r)).toEqual([]);
    expect(ratio(r)).toBe(1);
    expect(amount(r)).toBe(100_000_000);
  });

  it("🔴 기준시가 하락(3억 → 2.5억) + 계속 임대 → 적격 (종전: 분모 ≤ 0으로 배제)", () => {
    const r = evaluateRental975({ ...BASE, stdPriceAtAcquisition: 300_000_000, stdPriceAtTransfer: 250_000_000 });
    expect(r.isEligible).toBe(true);
    expect(ratio(r)).toBe(1);
  });

  it("조기 종료 + 하락 → 「미입력」이 아닌 별도 사유 (PRORATION_DENOMINATOR_NONPOSITIVE)", () => {
    const r = evaluateRental975({
      ...BASE,
      ...ENDED,
      stdPriceAtTransfer: 250_000_000,
      rentalEndDate: D("2028-09-01"),
    });
    expect(codes(r)).toContain("PRORATION_DENOMINATOR_NONPOSITIVE");
    expect(codes(r)).not.toContain("MISSING_PRORATION_PRICES");
  });

  it("조기 종료 + 기준시가 미입력 → MISSING_PRORATION_PRICES (자동 안분 금지 유지)", () => {
    const r = evaluateRental975({
      ...BASE,
      rentalContinuesToTransfer: false,
      rentalEndDate: D("2028-09-01"),
    });
    expect(codes(r)).toContain("MISSING_PRORATION_PRICES");
  });
});

describe("3. 「소득세법」 §90① — 감면액 = A × (B − C) ÷ D", () => {
  it("C = 0 (감면 외 소득이 기본공제 흡수): A × B ÷ D", () => {
    // 양도소득금액 468,000,000 · 비율 0.5 → B 234,000,000 · 감면 외 234,000,000 ≥ 기본공제 → C 0
    const r = evaluateRental975({
      ...BASE,
      ...ENDED,
      rentalEndDate: D("2028-09-01"),
      calculatedTax: 160_260_000,
      transferIncome: 468_000_000,
      basicDeduction: 2_500_000,
      taxBase: 465_500_000,
    });
    // 160,260,000 × 234,000,000 ÷ 465,500,000 = 80,560,343.7… → 절사
    expect(amount(r)).toBe(80_560_343);
    expect((r as unknown as { section90?: unknown }).section90).toEqual({
      reducibleIncome: 234_000_000,
      basicDeductionAllocated: 0,
      taxBase: 465_500_000,
    });
  });

  it("C > 0 (감면 외 소득 < 기본공제): 남은 기본공제를 감면소득에서 뺀다", () => {
    // 양도소득금액 10,000,000 · 비율 0.9 → B 9,000,000 · 감면 외 1,000,000 → C 1,500,000 · D 7,500,000
    const r = evaluateRental975({
      ...BASE,
      ...ENDED,
      stdPriceAtRentalEnd: 570_000_000, // (5.7억 − 3억) ÷ (6억 − 3억) = 0.9
      rentalEndDate: D("2028-09-01"),
      calculatedTax: 450_000,
      transferIncome: 10_000_000,
      basicDeduction: 2_500_000,
      taxBase: 7_500_000,
    });
    expect((r as unknown as { section90?: { basicDeductionAllocated: number } }).section90?.basicDeductionAllocated).toBe(
      1_500_000,
    );
    // (9,000,000 − 1,500,000) ÷ 7,500,000 = 1 → 산출세액 전액
    expect(amount(r)).toBe(450_000);
  });

  it("비율 1이면 산출세액 전액 — §90① 항등식 (section90 echo 없음)", () => {
    const r = evaluateRental975({
      ...BASE,
      transferIncome: 468_000_000,
      basicDeduction: 2_500_000,
      taxBase: 465_500_000,
    });
    expect(amount(r)).toBe(100_000_000);
    expect((r as unknown as { section90?: unknown }).section90).toBeUndefined();
  });
});

describe("파이프라인 — calcReductions·router가 §90① 입력과 종료일을 evaluator까지 나른다", () => {
  const rates = makeMockRates();
  function run(reductionOver: Record<string, unknown>) {
    return calculateTransferTax(
      baseTransferInput({
        transferPrice: 900_000_000,
        transferDate: D("2029-07-01"),
        acquisitionPrice: 300_000_000,
        acquisitionDate: D("2018-06-01"),
        isOneHousehold: false,
        householdHousingCount: 2,
        standardPriceAtAcquisition: 300_000_000,
        standardPriceAtTransfer: 600_000_000,
        reductions: [
          {
            type: "rental_97_5",
            registrationDate: D("2018-08-01"),
            rentalStartDate: D("2018-09-01"),
            isTaxRegistered: true,
            isNationalHousingScale: true,
            region: "capital",
            officialPriceAtStart: 320_000_000,
            rentalContinuesToTransfer: false,
            stdPriceAtRentalEnd: 450_000_000,
            ...reductionOver,
          },
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
      rates,
    ) as unknown as {
      calculatedTax: number;
      taxBase: number;
      basicDeduction: number;
      reductionAmount: number;
      rental97TaxDetail?: Rental97Result;
    };
  }

  it("🔴 리뷰 실측 사안 — 감면세액 80,130,000(종전) → 80,560,343 (§90①)", () => {
    const r = run({ rentalEndDate: D("2028-09-01") });
    expect(r.calculatedTax).toBe(160_260_000);
    expect(r.taxBase).toBe(465_500_000);
    expect(r.reductionAmount).toBe(80_560_343);
  });

  it("🔴 router가 rentalEndDate를 evaluator까지 나른다 — 7년 종료면 불적용", () => {
    const r = run({ rentalEndDate: D("2025-09-01") });
    expect(r.rental97TaxDetail && codes(r.rental97TaxDetail)).toContain("RENTAL_PERIOD_SHORT");
    expect(r.reductionAmount).toBe(0);
  });
});

describe("배관 ④⑫⑭ — rentalEndDate", () => {
  function form(over: Record<string, unknown> = {}): AssetReductionForm {
    return {
      ...getReductionDefault("rental_97_5"),
      registrationDate: "2018-08-01",
      rentalStartDate: "2018-09-01",
      isTaxRegistered: true,
      rentIncreaseViolationMode: "none",
      hasVacancyOverGrace: false,
      officialPriceAtStart: "320,000,000",
      isNationalHousingScale: true,
      region: "capital",
      rentalContinuesToTransfer: false,
      stdPriceAtRentalEnd: "450,000,000",
      rentalEndDate: "2028-09-01",
      ...over,
    } as AssetReductionForm;
  }

  it("④ 조기 종료면 싣고, 계속 임대면 싣지 않는다", () => {
    const ended = toEngineReductions([form()], "purchase")[0] as Record<string, unknown>;
    expect(ended.rentalEndDate).toBe("2028-09-01");
    const cont = toEngineReductions([form({ rentalContinuesToTransfer: true })], "purchase")[0] as Record<string, unknown>;
    expect("rentalEndDate" in cont).toBe(false);
  });

  it("🔑 ⑫ Zod가 통과시키고 ⑭ mapper가 Date로 바꾼다", () => {
    const parsed = reductionSchema.parse({
      type: "rental_97_5",
      registrationDate: "2018-08-01",
      rentalStartDate: "2018-09-01",
      rentalContinuesToTransfer: false,
      rentalEndDate: "2028-09-01",
    });
    expect((parsed as Record<string, unknown>).rentalEndDate, "⑫ 침묵 stripping").toBe("2028-09-01");
    const mapped = mapReductionsToEngine([parsed])[0] as unknown as { rentalEndDate?: Date };
    expect(mapped.rentalEndDate).toBeInstanceOf(Date);
    expect(mapped.rentalEndDate?.toISOString().slice(0, 10)).toBe("2028-09-01");
  });

  describe("⑧ validate — 엔진과 같은 조건", () => {
    function check(over: Record<string, unknown> = {}) {
      const asset = {
        ...makeDefaultAsset(1),
        assetKind: "housing",
        acquisitionDate: "2018-06-01",
        reductions: [form({ stdPriceAtAcquisition: "300,000,000", stdPriceAtTransfer: "600,000,000", ...over })],
      };
      return validateStep2Reductions(2, { assets: [asset], transferDate: "2029-07-01" } as unknown as TransferFormData);
    }

    it("조기 종료 + 종료일 미입력 → 차단", () => {
      expect(check({ rentalEndDate: "" })?.message).toMatch(/임대 종료일을 입력/);
    });

    it("종료일이 양도일 이후 → 차단", () => {
      expect(check({ rentalEndDate: "2029-08-01" })?.message).toMatch(/임대 종료일은/);
    });

    it("🔑 계속 임대 + 기준시가 미입력 → 안분 기준시가를 묻지 않는다 (엔진 비율 1과 일치)", () => {
      const issue = check({ rentalContinuesToTransfer: true, stdPriceAtAcquisition: "", stdPriceAtTransfer: "" });
      expect(issue?.message ?? "").not.toMatch(/취득 당시·양도 당시 기준시가/);
    });
  });
});

describe("겸용주택 — §97의5 감면대상 소득(B)은 주택분만 (리뷰 게이트 지적)", () => {
  /**
   * 겸용 경로는 `transferIncome`에 주택분·상가분·비사업용토지분 합계를 넘긴다. 4번 정정(계속 임대 → 비율 1)
   * 이후 B를 합계로 잡으면 **상가분 세액까지 전액 감면**된다(종전에는 기준시가가 없어 사실상 항상 배제).
   * 주택분 양도소득금액만 B로 넘겨 「소득세법」 §90① A × (B − C) ÷ D로 계산한다.
   */
  it("🔴 감면세액 = 산출세액 × 주택분 소득 ÷ 과세표준 — 상가분 세액은 감면하지 않는다", () => {
    const r = calcMixedUseIdN(
      2_600_000_000,
      new Date("2026-06-01"),
      {
        ...mixedUseCase14(),
        landAcquisitionDate: D("2014-06-01"),
        buildingAcquisitionDate: D("2014-06-01"),
        residencePeriodYears: 0,
        table2ResidencePeriodYears: 0,
        reductions: [
          {
            type: "rental_97_5",
            registrationDate: D("2014-08-01"),
            rentalStartDate: D("2014-09-01"),
            isTaxRegistered: true,
            isNationalHousingScale: true,
            region: "capital",
            officialPriceAtStart: 320_000_000,
            rentalContinuesToTransfer: true,
          },
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      makeMockRates(),
    );
    expect(r.housingPart.incomeAmount).toBe(77_134_875);
    expect(r.total.taxBase).toBe(651_314_173);
    expect(r.total.transferTax).toBe(237_611_952);
    // 237,611,952 × 77,134,875 ÷ 651,314,173 = 28,140,287.x → 절사 (C = 0: 상가분이 기본공제 흡수)
    expect(r.total.reductionAmount).toBe(28_140_287);
    expect(r.total.reductionAmount, "합계 소득을 B로 쓰면 산출세액 전액이 감면된다").not.toBe(r.total.transferTax);
  });
});
