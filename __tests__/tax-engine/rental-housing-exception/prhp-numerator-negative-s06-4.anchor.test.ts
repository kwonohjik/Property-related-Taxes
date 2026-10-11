/**
 * 결정 #22(S06-4) anchor — §161 안분 분자가 음수(기준시가 하락)이면 해당 호를 0으로 본다.
 *
 * 근거: 사전-2021-법규재산-0585(법규과-375, 2022.1.27.)는 「소득세법 시행령」 §161①의 분수 분자가 음수이면 「과세대상 양도소득금액이 없는 것」이라
 * 회신했다(원문 확인). §161②1호는 같은 식이라 유추하고, §161②2호(분자 = 현 양도 당시 − 직전 양도 당시)도 유추한다 — 2호를 직접 다룬 해석례는
 * 확보하지 못했다(확인 필요, 결과 카드·steps에 남긴다). §155⑳ 후단이 비과세를 「직전거주주택의 양도일 후의 기간분에 대해서만」 주므로 그 기간에 하락해
 * 차익이 없으면 2호도 없다고 보는 것이 구조에 맞다.
 *
 * 시료(mock 세율): 양도 2023-03-03 · 취득 2009-08-12(취득가 4억) · 거주 60개월 · 직전거주주택 양도 2016-08-25 · 임대 1호.
 * 15억이면 §95① 양도소득금액(표1) 814,000,000 · (표2) 440,000,000, 8억이면 296,000,000.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { validatePrices } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/prhp-allocation";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();

const input = (price: number, p: [number, number, number]): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: price,
    transferDate: new Date("2023-03-03"),
    acquisitionPrice: 400_000_000,
    acquisitionDate: new Date("2009-08-12"),
    expenses: 0,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 60,
    rentalHousingException: {
      applyException: true,
      scenario: "B",
      rentalUnits: [
        {
          businessRegistrationDate: new Date("2016-06-01"),
          rentalRegistrationDate: new Date("2016-06-01"),
          rentalCategory: "long_general",
          rentalAcquisitionType: "purchase",
          isApartment: false,
          region: "seoul-metro",
          isExcluded918Rule: false,
          standardPriceAtRentalStart: 300_000_000,
          hasMinimum2Units: false,
          rentalMonths: 96,
          rentalAutoTermination: false,
          requirementsConfirmed: true,
        },
      ],
      priorResidenceTransferDate: new Date("2016-08-25"),
      standardPriceAtAcquisition: p[0],
      standardPriceAtPriorTransfer: p[1],
      standardPriceAtTransfer: p[2],
      postRegistrationResidenceMonths: 60,
    },
  } as Partial<TransferTaxInput>);

const run = (price: number, p: [number, number, number]) => calculateTransferTax(input(price, p), rates);

describe("S06-4 §161②2호 분자 음수(직전 양도 뒤 하락) → 2호 0", () => {
  it("N-1 ★ B2 15억 · 기준시가 3/6/5억 → 과세 814,000,000 · 총세액 335,379,000 (전 770,000,000 · 315,051,000)", () => {
    const r = run(1_500_000_000, [300e6, 600e6, 500e6]);
    const d = r.rentalHousingExceptionDetail!;
    expect(d.scenarioId).toBe("RH-B2");
    expect(d.formulaTrace).toMatchObject({ part1: 814_000_000, part2: 0, numerator2Clamped: true, ratio161_2_2: 0 });
    expect(d.taxableGain).toBe(814_000_000);
    expect(r.totalTax).toBe(335_379_000);
    expect(r.steps.some((s) => s.label.includes("2호 0으로 계산") && s.formula.includes("확인 필요"))).toBe(true);
  });
  it("N-2 ★ 분모가 0에 가까워도 발산하지 않는다 — 3/6/3.01억 → 같은 814,000,000 (전 part2 −26,312,000,000 · 과세 −25,498,000,000)", () => {
    const r = run(1_500_000_000, [300e6, 600e6, 301e6]);
    expect(r.rentalHousingExceptionDetail!.formulaTrace.part2).toBe(0);
    expect(r.rentalHousingExceptionDetail!.taxableGain).toBe(814_000_000);
    expect(r.totalTax).toBe(335_379_000);
  });
  it("N-3 긍정 짝 — 직전 양도 뒤 상승(3/4.5/5억) B1은 비율 0.75 그대로 · 분자 음수 표지 없음", () => {
    const r = run(800_000_000, [300e6, 450e6, 500e6]);
    const d = r.rentalHousingExceptionDetail!;
    expect(d.formulaTrace.ratio161_1).toBe(0.75);
    expect(d.formulaTrace.numerator1Clamped).toBeUndefined();
    expect(d.taxableGain).toBe(222_000_000);
    expect(r.totalTax).toBe(69_817_000);
  });
  it("N-4 짝 — B1(12억 이하)에는 2호가 없다 — 3/6/5억 8억은 분자 음수 표지 없이 §161③ 캡만 적용", () => {
    const r = run(800_000_000, [300e6, 600e6, 500e6]);
    expect(r.rentalHousingExceptionDetail!.formulaTrace).toMatchObject({ ratio161_1: 1.5, capApplied: true });
    expect(r.rentalHousingExceptionDetail!.taxableGain).toBe(296_000_000);
    expect(r.rentalHousingExceptionDetail!.formulaTrace.numerator2Clamped).toBeUndefined();
  });
});

describe("S06-4 §161①·②1호 분자 음수(취득 뒤 하락) → 0585 대로 0", () => {
  it("N-5 ★ B1 8억 · 3/2.5/5억 → 과세분 0 · 총세액 0 (전 과세 −74,000,000 음수)", () => {
    const r = run(800_000_000, [300e6, 250e6, 500e6]);
    const d = r.rentalHousingExceptionDetail!;
    expect(d.formulaTrace).toMatchObject({ ratio161_1: 0, numerator1Clamped: true });
    expect(d.taxableGain).toBe(0);
    expect(r.totalTax).toBe(0);
    expect(r.steps.some((s) => s.label.includes("1호 0으로 계산"))).toBe(true);
  });
  it("N-6 ★ B2 15억 · 3/2.5/5억은 계산기 미지원 — 엔진 직접 호출도 특례 없이 일반 과세한다(전 −93,500,000 음수 과세분)", () => {
    const r = run(1_500_000_000, [300e6, 250e6, 500e6]);
    expect(r.rentalHousingExceptionDetail).toBeUndefined();
    expect(r.steps.some((s) => s.formula.includes("계산기 미지원"))).toBe(true);
    expect(r.totalTax).toBeGreaterThan(0);
  });
});

describe("S06-4 분모 음수(현 양도 당시 < 취득 당시) → 계산기 미지원", () => {
  it("N-7 validatePrices가 분모 음수를 거른다 · 분모 0 / 정상은 종전 그대로", () => {
    expect(validatePrices(300e6, 400e6, 200e6)).toMatchObject({ valid: false, error: "DENOMINATOR_NEGATIVE" });
    expect(validatePrices(300e6, 400e6, 300e6)).toMatchObject({ valid: false, error: "DENOMINATOR_ZERO" });
    expect(validatePrices(300e6, 450e6, 500e6)).toEqual({ valid: true });
    // 직전 양도 뒤 하락은 입력 자체는 유효하다(분자만 0으로 본다)
    expect(validatePrices(300e6, 600e6, 500e6)).toEqual({ valid: true });
  });
  it("N-8 엔진 직접 호출 3/4/2억 → 특례 미적용 일반 과세 (전 과세분 −296,000,000 · 총세액 0)", () => {
    const r = run(800_000_000, [300e6, 400e6, 200e6]);
    expect(r.rentalHousingExceptionDetail).toBeUndefined();
    expect(r.totalTax).toBe(43_901_000);
  });
});
